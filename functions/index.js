const crypto = require('crypto');
const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

admin.initializeApp();
const db = admin.firestore();

// Secretos seguros (cargados con: firebase functions:secrets:set NOMBRE)
const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN');
const RC_WEBHOOK_AUTH = defineSecret('RC_WEBHOOK_AUTH');
const RC_SECRET_API_KEY = defineSecret('RC_SECRET_API_KEY'); // Opcional: reflejar pagos MP/Paddle en RevenueCat
const PADDLE_WEBHOOK_SECRET = defineSecret('PADDLE_WEBHOOK_SECRET');

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

const FALLBACK_RETURN_URL = 'https://cat-alogo-landing-page.vercel.app/app/dashboard.html';
const WEBHOOK_MP_URL = 'https://webhookmercadopago-llt2fk2sua-rj.a.run.app';

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

function resolverUidRevenueCat(ev) {
    const candidatos = [
        ev?.app_user_id,
        ev?.original_app_user_id,
        ...(Array.isArray(ev?.aliases) ? ev.aliases : [])
    ];
    for (const c of candidatos) {
        const s = String(c || '').trim();
        if (s && !s.startsWith('$RCAnonymousID:')) return s;
    }
    return '';
}

function verificarFirmaPaddle(rawBody, signatureHeader, secret) {
    if (!rawBody || !signatureHeader || !secret) return false;
    const partes = String(signatureHeader).split(';').map(p => p.trim());
    let ts = '';
    const firmasH1 = [];
    for (const p of partes) {
        if (p.startsWith('ts=')) ts = p.slice(3);
        if (p.startsWith('h1=')) firmasH1.push(p.slice(3));
    }
    if (!ts || firmasH1.length === 0) return false;

    const rawStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    const esperadoHex = crypto
        .createHmac('sha256', secret)
        .update(`${ts}:${rawStr}`)
        .digest('hex');

    const esperadoBuf = Buffer.from(esperadoHex, 'hex');
    return firmasH1.some((h1) => {
        try {
            const recibidoBuf = Buffer.from(h1, 'hex');
            return recibidoBuf.length === esperadoBuf.length && crypto.timingSafeEqual(recibidoBuf, esperadoBuf);
        } catch {
            return false;
        }
    });
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
                    usedTrial: true,
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
                usedTrial: true,
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
                notification_url: WEBHOOK_MP_URL,
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
                trialUsed: true,
                usedTrial: true,
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
   4. WEBHOOK REVENUECAT (UNIFICA GOOGLE PLAY ANDROID • PROTEGE PLANES WEB)
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

            const uid = resolverUidRevenueCat(ev);
            if (!uid) {
                return res.status(200).send('Usuario anónimo ignorado');
            }

            const prodId = String(ev.product_id || '').toLowerCase();
            const store = String(ev.store || '').toUpperCase();
            const expiraMs = Number(ev.expiration_at_ms) || 0;

            const esAnual = prodId.includes('anual') || prodId.includes('year') || prodId.includes('annual') || prodId.includes('365');
            const plan = esAnual ? 'anual' : 'mensual';
            const source = store === 'PLAY_STORE' ? 'google_play' : (store === 'PADDLE' || store === 'STRIPE' ? 'paddle' : 'revenuecat');

            const eventosActivos = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'NON_RENEWING_PURCHASE']);
            const eventosVencidos = new Set(['EXPIRATION']);

            const userSnap = await db.collection('users').doc(uid).get();
            const uData = userSnap.exists ? (userSnap.data() || {}) : {};
            const expActualMs = parsearFechaMs(uData.fecha_expiracion);
            const fuenteActual = String(uData.source || '').toLowerCase();

            if (eventosActivos.has(tipo)) {
                // Nunca acortar una fecha de vencimiento futura ya pagada
                const expEventoMs = expiraMs > 0 ? expiraMs : (Date.now() + (esAnual ? 365 : 30) * 86400000);
                const expFinalMs = Math.max(expActualMs, expEventoMs);

                await escribirLicenciaEnFirestore(uid, {
                    plan,
                    plan_actual: plan,
                    status: 'active',
                    activePlan: true,
                    fecha_expiracion: expFinalMs,
                    trialUsed: true,
                    usedTrial: true,
                    source,
                    rcProductId: ev.product_id || '',
                    ultimoPagoId: String(ev.transaction_id || ev.id || ''),
                    ultimoPagoMonto: Number(ev.price_in_purchased_currency ?? ev.price ?? 0),
                    ultimoPagoMoneda: String(ev.currency || 'USD')
                });

                const evId = String(ev.id || '').trim();
                if (evId) {
                    await db.collection('pagos_procesados').doc(`rc_${evId}`).set({
                        uid,
                        plan,
                        gateway: source,
                        eventType: tipo,
                        environment: String(ev.environment || 'PRODUCTION'),
                        productId: ev.product_id || '',
                        transactionId: String(ev.transaction_id || ''),
                        monto: Number(ev.price_in_purchased_currency ?? ev.price ?? 0),
                        moneda: String(ev.currency || 'USD'),
                        expirationAtMs: expFinalMs,
                        procesadoEnMs: Date.now()
                    }, { merge: true });
                }
            } else if (eventosVencidos.has(tipo)) {
                // Proteger planes Web vigentes (Paddle / Mercado Pago) frente a expiraciones tardías de RC/Play
                if ((fuenteActual === 'paddle' || fuenteActual === 'mercadopago') && expActualMs > Date.now()) {
                    console.info(`Ignorando ${tipo} de RevenueCat para ${uid}: posee plan ${fuenteActual} vigente.`);
                    return res.status(200).send('OK (plan web vigente protegido)');
                }

                // Ignorar eventos de expiración viejos si Firestore ya tiene una renovación más reciente
                if (expiraMs > 0 && expActualMs > expiraMs && expActualMs > Date.now()) {
                    return res.status(200).send('OK (expiración obsoleta ignorada)');
                }

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

/* ==========================================================================
   5. WEBHOOK PADDLE BILLING v2 (PAGOS INTERNACIONALES EN USD / MONEDA LOCAL)
   ========================================================================== */
exports.webhookPaddle = onRequest(
    { region: 'southamerica-east1', secrets: [PADDLE_WEBHOOK_SECRET, RC_SECRET_API_KEY] },
    async (req, res) => {
        if (req.method !== 'POST') return res.status(405).send('Método no permitido');

        try {
            const secret = String(PADDLE_WEBHOOK_SECRET.value() || '').trim();
            const sigHdr = req.headers['paddle-signature'] || req.headers['Paddle-Signature'] || '';

            if (!verificarFirmaPaddle(req.rawBody, sigHdr, secret)) {
                console.warn('Firma Paddle-Signature inválida o faltante.');
                return res.status(401).send('Firma inválida');
            }

            const eventType = String(req.body?.event_type || '');
            if (eventType !== 'transaction.completed') {
                return res.status(200).send(`OK (ignorado: ${eventType})`);
            }

            const tx = req.body?.data || {};
            const txId = String(tx.id || '').trim();
            const custom = tx.custom_data || {};
            const uid = String(custom.uid || custom.app_user_id || '').trim();

            if (!uid || !txId) {
                return res.status(200).send('Sin UID o ID de transacción');
            }

            // Determinar el plan (prioriza custom_data.plan; fallback por descripción/precio)
            let plan = custom.plan === 'mensual' ? 'mensual' : (custom.plan === 'anual' ? 'anual' : '');
            if (!plan) {
                const desc = String(tx.items?.[0]?.price?.description || tx.items?.[0]?.price?.name || '').toLowerCase();
                plan = (desc.includes('anual') || desc.includes('365') || desc.includes('year')) ? 'anual' : 'mensual';
            }

            // Idempotencia: no acreditar dos veces la misma transacción
            const pagoRef = db.collection('pagos_procesados').doc(`paddle_${txId}`);
            const yaProcesado = await pagoRef.get();
            if (yaProcesado.exists) {
                return res.status(200).send('Ya procesado');
            }

            const dias = PRECIOS_USD[plan].dias;
            const userSnap = await db.collection('users').doc(uid).get();
            const expActualMs = parsearFechaMs(userSnap.data()?.fecha_expiracion);
            const baseMs = Math.max(Date.now(), expActualMs);
            const nuevaExpiraMs = baseMs + (dias * 24 * 60 * 60 * 1000);

            const totalCentavos = Number(tx.details?.totals?.total || 0);
            const monto = totalCentavos > 0 ? totalCentavos / 100 : PRECIOS_USD[plan].usd;
            const moneda = String(tx.currency_code || 'USD');

            await escribirLicenciaEnFirestore(uid, {
                plan,
                plan_actual: plan,
                status: 'active',
                activePlan: true,
                fecha_expiracion: nuevaExpiraMs,
                trialUsed: true,
                usedTrial: true,
                source: 'paddle',
                ultimoPagoId: txId,
                ultimoPagoMonto: monto,
                ultimoPagoMoneda: moneda
            });

            await pagoRef.set({
                uid,
                plan,
                gateway: 'paddle',
                transactionId: txId,
                monto,
                moneda,
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
                    console.warn('No se pudo reflejar Paddle en RevenueCat (Firestore sí actualizado):', rcErr);
                }
            }

            return res.status(200).send('OK');
        } catch (err) {
            console.error('Error en webhookPaddle:', err);
            return res.status(500).send('Error interno');
        }
    }
);

