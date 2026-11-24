const crypto = require('crypto');
const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

admin.initializeApp();
const db = admin.firestore();

// Secretos seguros (cargados con: firebase functions:secrets:set NOMBRE)
const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN');
const RC_WEBHOOK_AUTH = defineSecret('RC_WEBHOOK_AUTH');
const RC_SECRET_API_KEY = defineSecret('RC_SECRET_API_KEY'); // Opcional: reflejar pagos MP en RevenueCat

const PRECIOS_USD = {
    mensual: { usd: 9.99, dias: 30, titulo: 'Cat-Alogo Pro — Plan 30 Días' },
    anual:   { usd: 89.00, dias: 365, titulo: 'Cat-Alogo Pro — Plan Anual (365 Días)' }
};

const DOMINIOS_DESCARTABLES = new Set([
    'yopmail.com', 'yopmail.fr', 'yopmail.net', 'mailinator.com', 'tempmail.com',
    'temp-mail.org', '10minutemail.com', 'guerrillamail.com', 'guerrillamail.net',
    'sharklasers.com', 'trashmail.com', 'dispostable.com', 'getnada.com',
    'maildrop.cc', 'fakeinbox.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com',
    'throwawaymail.com', 'mailnesia.com', 'getairmail.com', 'burnermail.io'
]);

const FALLBACK_RETURN_URL = 'https://cat-alogo-landing-page.vercel.app/';

/* --- HELPERS --- */
function normalizarEmail(email) {
    const limpio = String(email || '').trim().toLowerCase();
    const partes = limpio.split('@');
    if (partes.length !== 2) return limpio;
    let [local, dominio] = partes;
    if (dominio === 'googlemail.com') dominio = 'gmail.com';
    if (dominio === 'gmail.com') {
        local = local.split('+')[0].replace(/\./g, '');
    } else {
        local = local.split('+')[0];
    }
    return `${local}@${dominio}`;
}

function hashSha256(texto) {
    return crypto.createHash('sha256').update(String(texto)).digest('hex');
}

function parsearFechaMs(val) {
    if (!val) return 0;
    if (typeof val === 'number' && !isNaN(val)) return val < 1e12 ? val * 1000 : val;
    if (typeof val?.toMillis === 'function') return val.toMillis();
    if (typeof val?.seconds === 'number') return val.seconds * 1000;
    const parsed = Date.parse(String(val));
    return isNaN(parsed) ? 0 : parsed;
}

async function verificarTokenUsuario(req) {
    const hdr = String(req.headers.authorization || '');
    if (!hdr.startsWith('Bearer ')) {
        throw new Error('Falta token de autenticación.');
    }
    const idToken = hdr.slice(7).trim();
    return admin.auth().verifyIdToken(idToken);
}

async function obtenerCotizacionArsServidor() {
    // Puedes actualizar la cotización sin redesplegar editando en Firestore: config_global/billing { cotizacionArs: 1200 }
    try {
        const snap = await db.collection('config_global').doc('billing').get();
        const val = Number(snap.data()?.cotizacionArs);
        if (!isNaN(val) && val > 100) return val;
    } catch { /* fallback */ }
    return 1200; // Valor por defecto si aún no creaste config_global/billing
}

async function escribirLicenciaEnFirestore(uid, payload) {
    const userRef = db.collection('users').doc(uid);
    const subRef = userRef.collection('billing').doc('subscription');
    const dataFinal = {
        ...payload,
        updatedAtServer: admin.firestore.FieldValue.serverTimestamp()
    };
    await Promise.all([
        userRef.set(dataFinal, { merge: true }),
        subRef.set(dataFinal, { merge: true })
    ]);
}

/* ==========================================================================
   1. ACTIVAR PRUEBA GRATIS (14 DÍAS) DESDE EL SERVIDOR (ANTI-TRAMPAS)
   ========================================================================== */
exports.activarPruebaGratis = onRequest({ cors: true, region: 'southamerica-east1' }, async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    try {
        const decoded = await verificarTokenUsuario(req);
        if (!decoded.email_verified) {
            return res.status(403).json({ error: 'Debes verificar tu correo electrónico primero.' });
        }

        const uid = decoded.uid;
        const email = decoded.email || '';
        const dominio = email.toLowerCase().split('@')[1] || '';
        if (DOMINIOS_DESCARTABLES.has(dominio)) {
            return res.status(400).json({ error: 'No se permiten correos temporales o descartables.' });
        }

        const emailNorm = normalizarEmail(email);
        const emailHash = hashSha256(emailNorm);

        const userRef = db.collection('users').doc(uid);
        const trialRef = db.collection('trial_registry').doc(emailHash);

        const resultado = await db.runTransaction(async (tx) => {
            const [userSnap, trialSnap] = await Promise.all([tx.get(userRef), tx.get(trialRef)]);
            const uData = userSnap.exists ? (userSnap.data() || {}) : {};

            // Si ya tiene plan o trial previo, no tocar
            if (uData.fecha_expiracion || uData.trialUsed || uData.plan_actual) {
                return { creado: false, motivo: 'already_exists' };
            }

            const ahoraMs = Date.now();

            // Si el mismo correo normalizado (alias Gmail) ya usó prueba gratis con otro UID
            if (trialSnap.exists && trialSnap.data()?.uid !== uid) {
                const blockedData = {
                    email,
                    emailNormalized: emailNorm,
                    plan: 'sin_plan',
                    plan_actual: 'sin_plan',
                    status: 'expired',
                    activePlan: false,
                    trialUsed: true,
                    trialBlockedReason: 'email_alias_already_used',
                    createdFrom: 'web_pc',
                    createdAtMs: ahoraMs
                };
                tx.set(userRef, blockedData, { merge: true });
                return { creado: false, motivo: 'alias_blocked' };
            }

            const expiraMs = ahoraMs + (14 * 24 * 60 * 60 * 1000);
            const trialData = {
                email,
                emailNormalized: emailNorm,
                plan: 'trial_14',
                plan_actual: 'trial_14',
                status: 'trial',
                activePlan: true,
                fecha_expiracion: expiraMs,
                trialUsed: true,
                termsAcceptedAt: new Date(ahoraMs).toISOString(),
                createdFrom: 'web_pc',
                source: 'web_trial',
                createdAtMs: ahoraMs
            };

            tx.set(userRef, trialData, { merge: true });
            tx.set(userRef.collection('billing').doc('subscription'), trialData, { merge: true });
            tx.set(trialRef, { uid, emailHash, createdAtMs: ahoraMs });
            return { creado: true, expiraMs };
        });

        return res.status(200).json(resultado);
    } catch (err) {
        console.error('Error en activarPruebaGratis:', err);
        return res.status(401).json({ error: err.message || 'No autorizado' });
    }
});

/* ==========================================================================
   2. CREAR CHECKOUT DE MERCADO PAGO (ARGENTINA • PESOS ARS)
   ========================================================================== */
exports.crearCheckoutMercadoPago = onRequest(
    { cors: true, region: 'southamerica-east1', secrets: [MP_ACCESS_TOKEN] },
    async (req, res) => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

        try {
            const decoded = await verificarTokenUsuario(req);
            const uid = decoded.uid;
            const plan = req.body?.plan === 'mensual' ? 'mensual' : 'anual';

            // Mercado Pago exige URLs https:// cuando auto_return está activo
            const rawReturnUrl = String(req.body?.returnUrl || '').trim();
            const returnUrl = rawReturnUrl.startsWith('https://')
                ? rawReturnUrl
                : FALLBACK_RETURN_URL;

            const infoPlan = PRECIOS_USD[plan];
            const cotizArs = await obtenerCotizacionArsServidor();
            const precioArs = Math.round(infoPlan.usd * cotizArs);

            const mpToken = String(MP_ACCESS_TOKEN.value() || '').trim();
            if (!mpToken) {
                throw new Error('MP_ACCESS_TOKEN no está configurado en el servidor.');
            }

            const projectId = process.env.GCLOUD_PROJECT || 'cat-alogo';
            const webhookUrl = `https://southamerica-east1-${projectId}.cloudfunctions.net/webhookMercadoPago`;

            const prefBody = {
                items: [
                    {
                        id: `cat_alogo_${plan}`,
                        title: infoPlan.titulo,
                        quantity: 1,
                        currency_id: 'ARS',
                        unit_price: precioArs
                    }
                ],
                payer: {
                    email: decoded.email || undefined
                },
                external_reference: `${uid}|${plan}`,
                notification_url: webhookUrl,
                back_urls: {
                    success: returnUrl,
                    pending: returnUrl,
                    failure: returnUrl
                },
                auto_return: 'approved',
                metadata: { uid, plan, usdBase: infoPlan.usd, cotizArs }
            };

            const mpResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${mpToken}`
                },
                body: JSON.stringify(prefBody)
            });

            const mpData = await mpResp.json().catch(() => ({}));
            const esPrueba = mpToken.startsWith('TEST-');
            const checkoutUrl = esPrueba
                ? (mpData.sandbox_init_point || mpData.init_point)
                : mpData.init_point;

            if (!mpResp.ok || !checkoutUrl) {
                const detalle = mpData?.cause?.[0]?.description || mpData?.message || `HTTP ${mpResp.status}`;
                throw new Error(`Mercado Pago rechazó la preferencia: ${detalle}`);
            }

            return res.status(200).json({
                checkoutUrl,
                precioArs,
                cotizArs,
                modoPrueba: esPrueba
            });
        } catch (err) {
            console.error('Error en crearCheckoutMercadoPago:', err);
            return res.status(500).json({ error: err.message || 'Error generando checkout' });
        }
    }
);

/* ==========================================================================
   3. WEBHOOK MERCADO PAGO (VERIFICA PAGO REAL Y ACTIVA LICENCIA EN FIRESTORE)
   ========================================================================== */
exports.webhookMercadoPago = onRequest(
    { region: 'southamerica-east1', secrets: [MP_ACCESS_TOKEN, RC_SECRET_API_KEY] },
    async (req, res) => {
        try {
            const topic = req.query.topic || req.body?.type || req.body?.topic;
            const paymentId = req.query.id || req.query['data.id'] || req.body?.data?.id;

            if (topic !== 'payment' || !paymentId) {
                return res.status(200).send('OK (ignorado)');
            }

            const mpToken = String(MP_ACCESS_TOKEN.value() || '').trim();

            // Consultar el pago real a la API de Mercado Pago (anti-spoofing)
            const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
                headers: { Authorization: `Bearer ${mpToken}` }
            });
            if (!mpResp.ok) {
                return res.status(200).send('Pago no encontrado');
            }

            const payment = await mpResp.json();
            if (payment.status !== 'approved') {
                return res.status(200).send(`Estado ${payment.status}`);
            }

            const refParts = String(payment.external_reference || '').split('|');
            const uid = refParts[0];
            const plan = refParts[1] === 'mensual' ? 'mensual' : 'anual';
            if (!uid) return res.status(200).send('Sin UID');

            // Idempotencia: no acreditar dos veces el mismo paymentId
            const pagoRef = db.collection('pagos_procesados').doc(`mp_${paymentId}`);
            const yaProcesado = await pagoRef.get();
            if (yaProcesado.exists) {
                return res.status(200).send('Ya procesado');
            }

            const dias = PRECIOS_USD[plan].dias;
            const userSnap = await db.collection('users').doc(uid).get();
            const expActualMs = parsearFechaMs(userSnap.data()?.fecha_expiracion);
            const baseMs = Math.max(Date.now(), expActualMs);
            const nuevaExpiraMs = baseMs + (dias * 24 * 60 * 60 * 1000);

            await escribirLicenciaEnFirestore(uid, {
                plan,
                plan_actual: plan,
                status: 'active',
                activePlan: true,
                fecha_expiracion: nuevaExpiraMs,
                source: 'mercadopago',
                ultimoPagoId: String(paymentId),
                ultimoPagoMontoArs: Number(payment.transaction_amount) || 0
            });

            await pagoRef.set({
                uid,
                plan,
                gateway: 'mercadopago',
                paymentId: String(paymentId),
                montoArs: Number(payment.transaction_amount) || 0,
                procesadoEnMs: Date.now()
            });

            // Opcional: reflejar el acceso en RevenueCat si configuraste RC_SECRET_API_KEY
            const rcKey = String(RC_SECRET_API_KEY.value() || '').trim();
            if (rcKey && rcKey.startsWith('sk_')) {
                try {
                    const duracionRc = plan === 'anual' ? 'yearly' : 'monthly';
                    await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}/entitlements/pro/promotional`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${rcKey}`
                        },
                        body: JSON.stringify({ duration: duracionRc })
                    });
                } catch (rcErr) {
                    console.warn('No se pudo reflejar en RevenueCat (Firestore sí actualizado):', rcErr);
                }
            }

            return res.status(200).send('OK');
        } catch (err) {
            console.error('Error en webhookMercadoPago:', err);
            return res.status(500).send('Error interno');
        }
    }
);

/* ==========================================================================
   4. WEBHOOK REVENUECAT (UNIFICA GOOGLE PLAY ANDROID + PADDLE WEB GLOBAL)
   ========================================================================== */
exports.webhookRevenueCat = onRequest(
    { region: 'southamerica-east1', secrets: [RC_WEBHOOK_AUTH] },
    async (req, res) => {
        if (req.method !== 'POST') return res.status(405).send('Método no permitido');

        const authEsperado = String(RC_WEBHOOK_AUTH.value() || '').trim();
        const authRecibido = String(req.headers.authorization || '').trim();
        if (authEsperado && authRecibido !== `Bearer ${authEsperado}` && authRecibido !== authEsperado) {
            return res.status(401).send('No autorizado');
        }

        try {
            const ev = req.body?.event || {};
            const tipo = String(ev.type || '').toUpperCase();
            if (tipo === 'TEST') return res.status(200).send('OK (test)');

            const uid = String(ev.app_user_id || '').trim();
            if (!uid || uid.startsWith('$RCAnonymousID:')) {
                return res.status(200).send('Usuario anónimo ignorado');
            }

            const prodId = String(ev.product_id || '').toLowerCase();
            const store = String(ev.store || '').toUpperCase();
            const expiraMs = Number(ev.expiration_at_ms) || 0;

            const esAnual = prodId.includes('anual') || prodId.includes('year') || prodId.includes('annual') || prodId.includes('365');
            const plan = esAnual ? 'anual' : 'mensual';
            const source = store === 'PLAY_STORE' ? 'google_play' : (store === 'PADDLE' || store === 'STRIPE' ? 'paddle' : 'revenuecat');

            const eventosActivos = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'NON_RENEWING_PURCHASE']);
            const eventosVencidos = new Set(['EXPIRATION', 'BILLING_ISSUE']);

            if (eventosActivos.has(tipo)) {
                await escribirLicenciaEnFirestore(uid, {
                    plan,
                    plan_actual: plan,
                    status: 'active',
                    activePlan: true,
                    fecha_expiracion: expiraMs > 0 ? expiraMs : (Date.now() + (esAnual ? 365 : 30) * 86400000),
                    source,
                    rcProductId: ev.product_id || ''
                });
            } else if (eventosVencidos.has(tipo)) {
                await escribirLicenciaEnFirestore(uid, {
                    status: 'expired',
                    activePlan: false,
                    fecha_expiracion: expiraMs || Date.now(),
                    source
                });
            }

            return res.status(200).send('OK');
        } catch (err) {
            console.error('Error en webhookRevenueCat:', err);
            return res.status(500).send('Error interno');
        }
    }
);

