/* ==========================================================================
   ETAPA 2 + FASES 1, 2 Y 3: LOGIN UNIFICADO, REGISTRO, VERIFICACIÓN DE EMAIL,
   PRUEBA 14 DÍAS EN SERVIDOR, MODAL MEJORAR PLAN (PADDLE USD + MERCADO PAGO ARS),
   BANNER DE VENCIMIENTO, GUARDIÁN ANTI-F12, BLINDAJE OFFLINE Y MULTI-CUENTA
   ========================================================================== */
(function () {
    const STORAGE_KEY_FB_CFG = 'cat_alogo_firebase_cfg_v1';
    const STORAGE_KEY_LAST_UID = 'cat_alogo_last_uid_v1';
    const STORAGE_KEY_DEVICE_ID = 'cat_alogo_pc_device_id_v1';
    const STORAGE_KEY_SYNC_QUEUE = 'cat_alogo_sync_queue_v1';
    const STORAGE_KEY_TRIAL_FP = 'cat_alogo_trial_device_used_v1';
    const SESSION_KEY_BANNER_DISMISS = 'cat_alogo_expiry_banner_dismissed_v1';

    const DOMINIOS_DESCARTABLES = new Set([
        'yopmail.com', 'yopmail.fr', 'yopmail.net', 'mailinator.com', 'tempmail.com',
        'temp-mail.org', '10minutemail.com', 'guerrillamail.com', 'guerrillamail.net',
        'sharklasers.com', 'trashmail.com', 'dispostable.com', 'getnada.com',
        'maildrop.cc', 'fakeinbox.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com',
        'throwawaymail.com', 'mailnesia.com', 'getairmail.com', 'burnermail.io'
    ]);

    const PLAN_LABELS = {
        trial_14: 'Prueba Gratis (14 días)',
        trial: 'Prueba Gratis (14 días)',
        prueba: 'Prueba Gratis (14 días)',
        mensual: 'Plan Mensual (30 días)',
        mensual_30: 'Plan Mensual (30 días)',
        monthly: 'Plan Mensual (30 días)',
        anual: 'Plan Anual (365 días)',
        anual_365: 'Plan Anual (365 días)',
        annual: 'Plan Anual (365 días)',
        yearly: 'Plan Anual (365 días)'
    };

    const state = {
        firebaseListo: false,
        modoLocalSinFirebase: true,
        app: null,
        auth: null,
        db: null,
        storage: null,
        user: null,
        uid: null,
        subscripcion: null,
        cotizacionArsServidor: 0,
        bloqueado: false,
        verificandoEmail: false,
        requiereLogin: false,
        serverOffsetMs: 0,
        unsubBilling: null,
        simulandoOverlay: false,
        cerrandoSesion: false,
        authTab: 'login',
        planSeleccionado: 'anual',
        resendCooldownTimer: null,
        observerDom: null
    };

    /* --- 0. UTILIDADES DE SEGURIDAD, BILLING Y LIMPIEZA HERMÉTICA --- */
    function obtenerConfigBillingWeb() {
        const def = {
            precioMensualUsd: 9.99,
            precioAnualUsd: 89,
            precioAnualPorMesUsd: 7.41,
            ahorroAnualTexto: 'Ahorrás 26%',
            cotizacionArsReferencia: 0,
            endpointMercadoPago: '',
            endpointPaddle: '',
            paddleClientToken: '',
            paddlePriceIds: { mensual: '', anual: '' }
        };
        const cfg = window.CAT_ALOGO_CLOUD_CONFIG?.billingWeb || {};
        return {
            ...def,
            ...cfg,
            paddlePriceIds: { ...def.paddlePriceIds, ...(cfg.paddlePriceIds || {}) }
        };
    }

    function obtenerEndpointActivarPrueba() {
        const cfg = window.CAT_ALOGO_CLOUD_CONFIG || {};
        return cfg.endpointActivarPrueba || cfg.cloudFunctions?.activarPruebaGratis || '';
    }

    async function cargarCotizacionArsGlobal() {
        if (!state.db || !state.user) return;
        try {
            const snap = await state.db.collection('config_global').doc('billing').get();
            const val = Number(snap.data()?.cotizacionArs);
            if (!isNaN(val) && val > 100) {
                state.cotizacionArsServidor = val;
                if (document.getElementById('cat-auth-plans-overlay')?.classList.contains('active')) {
                    actualizarBotonesModalPlanes();
                }
            }
        } catch { /* opcional: si no existe config_global/billing, ignora */ }
    }

    function fmtArsAuth(num) {
        return `$${Math.round(Number(num) || 0).toLocaleString('es-AR')}`;
    }

    function fmtUsdAuth(num) {
        const val = Number(num) || 0;
        const esEntero = Math.abs(val - Math.round(val)) < 0.001;
        return `US$ ${val.toLocaleString('en-US', {
            minimumFractionDigits: esEntero ? 0 : 2,
            maximumFractionDigits: 2
        })}`;
    }

    function esPlanTrial(planStr) {
        const p = String(planStr || '').toLowerCase();
        return p.includes('trial') || p.includes('prueba') || p === 'sin_plan' || p === '';
    }

    function normalizarEmailAntiAlias(email) {
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

    function esEmailDescartable(email) {
        const dominio = String(email || '').trim().toLowerCase().split('@')[1] || '';
        return DOMINIOS_DESCARTABLES.has(dominio);
    }

    async function limpiarBovedaLocalPorCambioCuenta() {
        const conservar = new Set([STORAGE_KEY_FB_CFG, STORAGE_KEY_DEVICE_ID, STORAGE_KEY_TRIAL_FP]);
        const keysABorrar = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if ((k.startsWith('cat_alogo_') || k.startsWith('catalog_')) && !conservar.has(k)) {
                keysABorrar.push(k);
            }
        }
        keysABorrar.forEach((k) => {
            try { localStorage.removeItem(k); } catch { /* ignore */ }
        });

        try {
            const fbCfg = JSON.parse(localStorage.getItem(STORAGE_KEY_FB_CFG) || 'null');
            if (fbCfg && typeof fbCfg === 'object') {
                delete fbCfg.uid;
                localStorage.setItem(STORAGE_KEY_FB_CFG, JSON.stringify(fbCfg));
            }
        } catch { /* ignore */ }

        window.bovedaProductos = [];
        window.bovedaClientes = [];
        window.bovedaProveedores = [];

        try {
            if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
                const dbs = await indexedDB.databases();
                await Promise.all(
                    (dbs || [])
                        .map((d) => d?.name)
                        .filter((name) => name && !/^firebase|^firestore/i.test(name))
                        .map((name) => new Promise((resolve) => {
                            try {
                                const req = indexedDB.deleteDatabase(name);
                                req.onsuccess = () => resolve();
                                req.onerror = () => resolve();
                                req.onblocked = () => resolve();
                            } catch {
                                resolve();
                            }
                        }))
                );
            }
        } catch { /* ignore */ }
    }

    async function cerrarSesionYLimpiarBoveda(pedirConfirmacion = true) {
        if (state.cerrandoSesion) return;

        let colaPend = 0;
        try {
            const q = JSON.parse(localStorage.getItem(STORAGE_KEY_SYNC_QUEUE) || '[]');
            colaPend = Array.isArray(q) ? q.length : 0;
        } catch { colaPend = 0; }

        if (pedirConfirmacion) {
            const avisoCola = colaPend > 0
                ? `\n\n⚠️ Atención: tienes ${colaPend} cambio(s) pendiente(s) de subir a la nube. Si cierras sesión ahora podrían perderse.`
                : '\n\nTus datos ya sincronizados quedan guardados en la nube y volverán a cargarse al iniciar sesión nuevamente.';
            const ok = confirm(
                `🚪 ¿Cerrar sesión de ${state.user?.email || 'esta cuenta'}?\n\n` +
                `Se limpiará la Bóveda Local de este navegador para proteger tus datos si otra persona inicia sesión.${avisoCola}`
            );
            if (!ok) return;
        }

        state.cerrandoSesion = true;
        document.body.classList.remove('cat-auth-unlocked');

        if (state.unsubBilling) {
            try { state.unsubBilling(); } catch { /* ignore */ }
            state.unsubBilling = null;
        }

        try {
            if (state.auth) await state.auth.signOut();
        } catch (err) {
            console.warn('Error al cerrar sesión en Firebase:', err);
        }

        await limpiarBovedaLocalPorCambioCuenta();
        try {
            localStorage.removeItem(STORAGE_KEY_LAST_UID);
            sessionStorage.removeItem(SESSION_KEY_BANNER_DISMISS);
        } catch { /* ignore */ }

        window.location.reload();
    }

    /* --- 1. RESOLVER CONFIGURACIÓN FIREBASE --- */
    function obtenerConfigFirebaseActiva() {
        const master = window.CAT_ALOGO_CLOUD_CONFIG?.firebaseConfig || {};
        if (master.apiKey && master.projectId) return master;
        try {
            const localFb = JSON.parse(localStorage.getItem(STORAGE_KEY_FB_CFG) || 'null');
            if (localFb?.apiKey && localFb?.projectId) {
                return {
                    apiKey: localFb.apiKey,
                    authDomain: localFb.authDomain || `${localFb.projectId}.firebaseapp.com`,
                    projectId: localFb.projectId,
                    storageBucket: localFb.storageBucket || `${localFb.projectId}.appspot.com`,
                    messagingSenderId: localFb.messagingSenderId || '',
                    appId: localFb.appId || ''
                };
            }
        } catch { /* sin config local */ }
        return null;
    }

    function obtenerAhoraServidorMs() {
        return Date.now() + (state.serverOffsetMs || 0);
    }

    /* --- 2. ESTILOS EXTRA E INYECCIÓN DE OVERLAYS EN EL DOM --- */
    function asegurarEstilosExtrasAuth() {
        if (document.getElementById('cat-auth-guard-extra-styles')) return;
        const st = document.createElement('style');
        st.id = 'cat-auth-guard-extra-styles';
        st.textContent = `
            .auth-tabs-bar {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 6px;
                background: #f1f5f9;
                padding: 4px;
                border-radius: 12px;
                margin-bottom: 14px;
            }
            .auth-tab-btn {
                border: none;
                background: transparent;
                color: #475569;
                font-size: 0.82rem;
                font-weight: 700;
                padding: 8px 10px;
                border-radius: 9px;
                cursor: pointer;
                transition: all 0.15s ease;
            }
            .auth-tab-btn.active {
                background: #ffffff;
                color: #0f172a;
                box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);
            }
            .auth-forgot-row {
                display: flex;
                justify-content: flex-end;
                margin-top: -4px;
                margin-bottom: 4px;
            }
            .auth-link-btn {
                background: none;
                border: none;
                color: #047857;
                font-size: 0.76rem;
                font-weight: 700;
                cursor: pointer;
                padding: 0;
                text-decoration: underline;
            }
            .auth-terms-box {
                display: flex;
                align-items: flex-start;
                gap: 8px;
                font-size: 0.74rem;
                color: #475569;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                padding: 8px 10px;
                line-height: 1.35;
                cursor: pointer;
            }
            .auth-terms-box input { margin-top: 2px; cursor: pointer; }
            .auth-success-msg {
                display: none;
                background: #ecfdf5;
                border: 1px solid #a7f3d0;
                color: #065f46;
                border-radius: 10px;
                padding: 9px 11px;
                font-size: 0.78rem;
                font-weight: 600;
                margin-bottom: 10px;
            }
            .auth-welcome-badge {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 4px 12px;
                border-radius: 999px;
                background: #ecfdf5;
                color: #047857;
                border: 1px solid #a7f3d0;
                font-size: 0.75rem;
                font-weight: 800;
                margin-bottom: 8px;
            }
            .auth-pay-methods-note {
                display: flex;
                justify-content: center;
                gap: 8px;
                flex-wrap: wrap;
                margin: 10px 0 12px;
                font-size: 0.72rem;
                color: #475569;
            }
            .auth-pay-pill {
                background: #f1f5f9;
                border: 1px solid #e2e8f0;
                border-radius: 999px;
                padding: 3px 10px;
                font-weight: 700;
            }

            /* --- MODAL MEJORAR PLAN (PRECIOS EN USD) --- */
            #cat-auth-plans-overlay { z-index: 100020 !important; }
            .auth-plans-modal-card {
                max-width: 540px !important;
                width: 94%;
                position: relative;
            }
            .auth-plans-close-x {
                position: absolute;
                top: 14px;
                right: 14px;
                width: 32px;
                height: 32px;
                border-radius: 999px;
                border: 1px solid #e2e8f0;
                background: #f8fafc;
                color: #475569;
                font-weight: 800;
                cursor: pointer;
            }
            .auth-plans-close-x:hover { background: #e2e8f0; color: #0f172a; }
            .auth-plan-select-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                margin: 12px 0 12px;
            }
            .auth-plan-option {
                position: relative;
                text-align: left;
                padding: 14px 12px;
                border-radius: 14px;
                border: 2px solid #e2e8f0;
                background: #ffffff;
                cursor: pointer;
                transition: all 0.15s ease;
                font-family: inherit;
            }
            .auth-plan-option:hover { border-color: #94a3b8; }
            .auth-plan-option.selected {
                border-color: #047857;
                background: #ecfdf5;
                box-shadow: 0 4px 14px rgba(4, 120, 87, 0.12);
            }
            .auth-plan-save-tag {
                position: absolute;
                top: -10px;
                right: 10px;
                background: #f59e0b;
                color: #ffffff;
                font-size: 0.66rem;
                font-weight: 800;
                padding: 2px 8px;
                border-radius: 999px;
                letter-spacing: 0.02em;
            }
            .auth-plan-option-title {
                display: block;
                font-size: 0.88rem;
                font-weight: 800;
                color: #0f172a;
                margin-bottom: 4px;
            }
            .auth-plan-price-main {
                display: block;
                font-size: 1.32rem;
                font-weight: 800;
                color: #047857;
                line-height: 1.15;
            }
            .auth-plan-price-sub {
                display: block;
                font-size: 0.74rem;
                font-weight: 700;
                color: #0f766e;
                margin-top: 3px;
            }
            .auth-plan-option-desc {
                display: block;
                font-size: 0.72rem;
                color: #475569;
                margin-top: 6px;
                line-height: 1.3;
            }
            .auth-currency-hint {
                font-size: 0.72rem;
                color: #64748b;
                text-align: center;
                margin: -4px 0 12px;
                line-height: 1.35;
            }
            .auth-plans-features {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 6px 10px;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                padding: 10px 12px;
                margin-bottom: 14px;
                font-size: 0.75rem;
                color: #334155;
            }
            .auth-gp-warning {
                display: none;
                background: #fffbeb;
                border: 1px solid #fde68a;
                color: #92400e;
                border-radius: 12px;
                padding: 10px 12px;
                font-size: 0.78rem;
                line-height: 1.4;
                margin-bottom: 12px;
            }
            .auth-pay-buttons {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .auth-btn-paddle {
                background: #0f172a !important;
                color: #ffffff !important;
                border: none !important;
            }
            .auth-btn-paddle:hover:not(:disabled) { background: #1e293b !important; }
            .auth-btn-mp {
                background: #009ee3 !important;
                color: #ffffff !important;
                border: none !important;
            }
            .auth-btn-mp:hover:not(:disabled) { background: #008ad0 !important; }
            .auth-btn-mp:disabled, .auth-btn-paddle:disabled {
                opacity: 0.45;
                cursor: not-allowed;
            }

            /* --- BANNER DE AVISO DE VENCIMIENTO --- */
            #cat-auth-expiry-banner {
                display: none;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                flex-wrap: wrap;
                padding: 9px 18px;
                background: linear-gradient(90deg, #fffbeb 0%, #fef3c7 100%);
                border-bottom: 1px solid #fcd34d;
                color: #92400e;
                font-size: 0.82rem;
                font-weight: 600;
            }
            #cat-auth-expiry-banner.is-urgent {
                background: linear-gradient(90deg, #fef2f2 0%, #fee2e2 100%);
                border-bottom-color: #fca5a5;
                color: #991b1b;
            }
            .auth-exp-left {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }
            .auth-exp-actions {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .auth-exp-cta {
                background: #047857;
                color: #ffffff;
                border: none;
                border-radius: 999px;
                padding: 5px 14px;
                font-size: 0.76rem;
                font-weight: 800;
                cursor: pointer;
                font-family: inherit;
            }
            .auth-exp-cta:hover { background: #065f46; }
            .auth-exp-close {
                background: transparent;
                border: none;
                color: inherit;
                opacity: 0.7;
                font-size: 0.9rem;
                font-weight: 800;
                cursor: pointer;
                padding: 2px 6px;
            }
            .auth-exp-close:hover { opacity: 1; }
            @media (max-width: 520px) {
                .auth-plan-select-grid, .auth-plans-features { grid-template-columns: 1fr; }
            }

            /* --- MODAL LEGAL (TÉRMINOS Y PRIVACIDAD) --- */
            #cat-auth-legal-overlay { z-index: 100030 !important; }
            .auth-legal-card {
                max-width: 580px !important;
                width: 94%;
                position: relative;
                text-align: left;
            }
            .auth-legal-body {
                max-height: 55vh;
                overflow-y: auto;
                padding: 14px 16px;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                font-size: 0.78rem;
                color: #334155;
                line-height: 1.52;
                margin: 10px 0 14px;
            }
            .auth-legal-body h4 {
                margin: 13px 0 4px;
                font-size: 0.84rem;
                color: #0f172a;
            }
            .auth-legal-body h4:first-child { margin-top: 0; }
            .auth-legal-body p { margin: 0 0 8px; }
            .auth-spam-alert {
                background: #fffbeb;
                border: 1px solid #fcd34d;
                color: #92400e;
                border-radius: 12px;
                padding: 11px 13px;
                font-size: 0.78rem;
                line-height: 1.45;
                text-align: left;
                margin-bottom: 14px;
            }
            .auth-spam-alert strong { color: #78350f; }
        `;
        document.head.appendChild(st);
    }

    function asegurarOverlaysEnDom() {
        asegurarEstilosExtrasAuth();
        if (document.getElementById('cat-auth-login-overlay')) return;

        const playUrl = window.CAT_ALOGO_CLOUD_CONFIG?.googlePlayAppUrl || 'https://play.google.com/store/apps/details?id=com.catalogstudio.app';
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=4&data=${encodeURIComponent(playUrl)}`;
        const bill = obtenerConfigBillingWeb();

        const wrapper = document.createElement('div');
        wrapper.id = 'cat-auth-overlays-root';
        wrapper.innerHTML = `
            <!-- OVERLAY 1: LOGIN / REGISTRO UNIFICADO -->
            <div class="auth-overlay" id="cat-auth-login-overlay" aria-hidden="true">
                <div class="auth-card" role="dialog" aria-labelledby="auth-login-title">
                    <div class="auth-brand">
                        <div class="auth-logo-badge" style="background:transparent; box-shadow:none; padding:0;">
                            <img src="../img/logo-app.png" alt="Logo Cat-Alogo" style="width:58px; height:58px; object-fit:contain; border-radius:14px;">
                        </div>
                        <h2 id="auth-login-title">Iniciar Sesión en Cat-Alogo Web</h2>
                        <p id="auth-login-subtitle">Accede con tu cuenta de <strong>Cat-Alogo</strong> (Web o App Android) para sincronizar inventario, caja, clientes y suscripción.</p>
                    </div>

                    <div class="auth-tabs-bar" id="auth-tabs-bar">
                        <button type="button" class="auth-tab-btn active" data-authtab="login">Ingresar</button>
                        <button type="button" class="auth-tab-btn" data-authtab="register">Crear Cuenta (14 días gratis)</button>
                    </div>

                    <div class="auth-error" id="auth-login-error"></div>
                    <div class="auth-success-msg" id="auth-login-success"></div>

                    <form class="auth-form" id="form-cat-auth-login">
                        <div class="auth-field">
                            <label for="auth-inp-email">Correo electrónico</label>
                            <input type="email" id="auth-inp-email" class="auth-input" placeholder="tu@correo.com" required autocomplete="email">
                        </div>
                        <div class="auth-field">
                            <label for="auth-inp-pass">Contraseña</label>
                            <input type="password" id="auth-inp-pass" class="auth-input" placeholder="Mínimo 6 caracteres" required autocomplete="current-password">
                        </div>
                        <div class="auth-field" id="auth-confirm-pass-wrap" style="display:none;">
                            <label for="auth-inp-pass-confirm">Confirmar contraseña</label>
                            <input type="password" id="auth-inp-pass-confirm" class="auth-input" placeholder="Repite tu contraseña" autocomplete="new-password">
                        </div>

                        <div class="auth-forgot-row" id="auth-forgot-wrap">
                            <button type="button" class="auth-link-btn" id="btn-auth-forgot-pass">¿Olvidaste tu contraseña?</button>
                        </div>

                        <label class="auth-terms-box" id="auth-terms-wrap">
                            <input type="checkbox" id="auth-chk-terms">
                            <span>
                                He leído y acepto los <button type="button" class="auth-link-btn" id="btn-auth-ver-terminos">Términos y Condiciones</button> y la
                                <button type="button" class="auth-link-btn" id="btn-auth-ver-privacidad">Política de Privacidad</button> de Cat-Alogo.
                            </span>
                        </label>

                        <button type="submit" class="auth-btn auth-btn-primary" id="btn-auth-email-submit">
                            🔓 Entrar a mi Comercio
                        </button>
                    </form>

                    <div class="auth-divider">o continúa con</div>

                    <button type="button" class="auth-btn auth-btn-google" id="btn-auth-google-login">
                        <span>🔵</span> Continuar con Google (Web + App Android)
                    </button>

                    <div class="auth-info-box" id="auth-bottom-info">
                        ✨ <strong>¿Usás solo PC o también celular?</strong> Podés crear tu cuenta aquí con <strong>14 días gratis</strong> y, cuando quieras, vincular la App de Google Play con el mismo correo.
                    </div>

                    <button type="button" class="auth-btn auth-btn-ghost" id="btn-auth-cerrar-sim-login" style="display:none;">
                        ✕ Cerrar vista previa (Modo Local)
                    </button>
                </div>
            </div>

            <!-- OVERLAY 1B: VERIFICACIÓN DE EMAIL OBLIGATORIA -->
            <div class="auth-overlay" id="cat-auth-verify-overlay" aria-hidden="true">
                <div class="auth-card" role="dialog" aria-labelledby="auth-verify-title">
                    <div class="auth-brand">
                        <div class="auth-logo-badge">✉️</div>
                        <h2 id="auth-verify-title">Verifica tu correo electrónico</h2>
                        <p>Enviamos un enlace de confirmación a <strong id="auth-verify-email-lbl">—</strong>. Abrí tu casilla y hacé clic en el enlace para activar tus <strong>14 días gratis</strong>.</p>
                    </div>

                    <div class="auth-spam-alert">
                        ⚠️ <strong>¡Importante! Revisá tu Correo no deseado (Spam):</strong><br>
                        El correo de verificación suele llegar a la carpeta de <strong>Spam, Correo no deseado o Promociones</strong>. Si no lo ves en tu bandeja principal en 1 minuto, buscalo allí, marcalo como <em>"No es spam"</em> y hacé clic en el enlace de confirmación.
                    </div>

                    <div class="auth-error" id="auth-verify-error"></div>
                    <div class="auth-success-msg" id="auth-verify-success"></div>

                    <div class="auth-lock-actions">
                        <button type="button" class="auth-btn auth-btn-primary" id="btn-auth-check-verified">
                            ✅ Ya verifiqué mi correo — Entrar
                        </button>
                        <button type="button" class="auth-btn auth-btn-indigo" id="btn-auth-resend-verify">
                            📨 Reenviar correo de verificación
                        </button>
                        <button type="button" class="auth-btn auth-btn-ghost" id="btn-auth-verify-logout">
                            🚪 Cerrar sesión / Cambiar correo
                        </button>
                    </div>
                </div>
            </div>

            <!-- OVERLAY 1C: BIENVENIDA + CUADRO DE PLANES (14 DÍAS GRATIS ACTIVADOS) -->
            <div class="auth-overlay" id="cat-auth-welcome-overlay" aria-hidden="true">
                <div class="auth-card" role="dialog" aria-labelledby="auth-welcome-title">
                    <div class="auth-brand">
                        <span class="auth-welcome-badge">🎉 ¡Cuenta verificada! 14 días gratis activos</span>
                        <h2 id="auth-welcome-title">Bienvenido a Cat-Alogo</h2>
                        <p>Ya tenés acceso completo en la PC y también podés usar la misma cuenta en tu celular con la App oficial. Al finalizar los 14 días elegís tu plan:</p>
                    </div>

                    <div class="auth-plans-grid">
                        <div class="auth-plan-card">
                            <strong>📅 Plan 30 Días</strong>
                            <small>${fmtUsdAuth(bill.precioMensualUsd)} USD / mes</small>
                        </div>
                        <div class="auth-plan-card is-best">
                            <strong>⭐ Plan Anual (365 días)</strong>
                            <small>${fmtUsdAuth(bill.precioAnualUsd)} USD (${fmtUsdAuth(bill.precioAnualPorMesUsd)}/mes)</small>
                        </div>
                    </div>

                    <div class="auth-pay-methods-note">
                        <span class="auth-pay-pill">🌎 Tarjeta / PayPal (Global)</span>
                        <span class="auth-pay-pill">🇦🇷 Mercado Pago (Argentina ARS)</span>
                        <span class="auth-pay-pill">📱 Google Play</span>
                    </div>

                    <div class="auth-lock-actions">
                        <button type="button" class="auth-btn auth-btn-primary" id="btn-auth-welcome-start">
                            🚀 Empezar a usar mis 14 días gratis
                        </button>
                        <button type="button" class="auth-btn auth-btn-ghost" id="btn-auth-welcome-ver-planes">
                            ⭐ Ver detalle de planes y medios de pago
                        </button>
                    </div>
                </div>
            </div>

            <!-- OVERLAY 2: BLOQUEO SIMULTÁNEO POR SUSCRIPCIÓN VENCIDA (HÍBRIDO WEB + PLAY) -->
            <div class="auth-overlay" id="cat-auth-lock-overlay" aria-hidden="true">
                <div class="auth-card is-lock" role="alertdialog" aria-labelledby="auth-lock-title">
                    <div class="auth-brand">
                        <div class="auth-logo-badge is-danger">🔒</div>
                        <h2 id="auth-lock-title">Tu período activo ha finalizado</h2>
                        <p>Tanto la Web PC como la App Móvil se pausan al vencer el plan. <strong>Tus productos, ventas y clientes siguen intactos.</strong></p>
                    </div>

                    <div class="auth-lock-meta" id="auth-lock-meta">
                        <div><strong>Cuenta:</strong> <span id="auth-lock-email">—</span></div>
                        <div><strong>Último plan:</strong> <span id="auth-lock-plan">—</span></div>
                        <div><strong>Vencimiento:</strong> <span id="auth-lock-vence">—</span></div>
                    </div>

                    <div class="auth-lock-actions" style="margin-bottom: 12px;">
                        <button type="button" class="auth-btn auth-btn-primary" id="btn-auth-lock-pagar-web">
                            ⭐ Elegir Plan y Pagar desde la Web (Tarjeta / MP)
                        </button>
                        <button type="button" class="auth-btn auth-btn-indigo" id="btn-auth-revalidar-sub">
                            🔄 Ya pagué — Verificar ahora
                        </button>
                    </div>

                    <div class="auth-qr-row">
                        <img src="${qrUrl}" alt="QR Google Play">
                        <div>
                            <strong>¿Preferís renovar desde tu celular Android?</strong><br>
                            Abrí <strong>Cat-Alogo</strong> en Google Play y elegí tu plan. Apenas se acredite, <strong>esta web se desbloquea sola en segundos</strong>.
                        </div>
                    </div>

                    <div class="auth-lock-actions">
                        <a href="${playUrl}" target="_blank" rel="noopener" class="auth-btn auth-btn-ghost">
                            ▶️ Abrir Cat-Alogo en Google Play Store
                        </a>
                        <button type="button" class="auth-btn auth-btn-ghost" id="btn-auth-lock-logout">
                            🚪 Cerrar sesión / Cambiar de cuenta
                        </button>
                        <button type="button" class="auth-btn auth-btn-ghost" id="btn-auth-cerrar-sim-lock" style="display:none;">
                            ✕ Cerrar vista previa (Modo Local)
                        </button>
                    </div>
                </div>
            </div>

            <!-- OVERLAY 3: MODAL "⭐ MEJORAR PLAN" (PRECIOS USD • PADDLE GLOBAL + MP ARGENTINA) -->
            <div class="auth-overlay" id="cat-auth-plans-overlay" aria-hidden="true">
                <div class="auth-card auth-plans-modal-card" role="dialog" aria-labelledby="auth-plans-title">
                    <button type="button" class="auth-plans-close-x" id="btn-auth-plans-close" title="Cerrar">✕</button>

                    <div class="auth-brand" style="margin-bottom: 6px;">
                        <span class="auth-welcome-badge">⭐ Cat-Alogo Pro • Web PC + App Android</span>
                        <h2 id="auth-plans-title">Mejorar o Renovar tu Plan</h2>
                        <p id="auth-plans-sub">Una sola suscripción desbloquea la <strong>Web PC</strong> y la <strong>App de Google Play</strong> con sincronización en vivo.</p>
                    </div>

                    <div class="auth-gp-warning" id="auth-plans-gp-warning">
                        📱 <strong>Ya tenés una suscripción activa en Google Play Store.</strong><br>
                        Para evitar un doble cobro, gestioná o cambiá tu plan directamente desde Google Play en tu celular. Si la cancelás y vence, podrás suscribirte desde la Web aquí.
                    </div>

                    <div class="auth-plan-select-grid" id="auth-plan-select-grid">
                        <button type="button" class="auth-plan-option" data-plan-choice="mensual">
                            <span class="auth-plan-option-title">📅 Plan 30 Días</span>
                            <span class="auth-plan-price-main">${fmtUsdAuth(bill.precioMensualUsd)} <small style="font-size:0.72rem; font-weight:700;">USD / mes</small></span>
                            <span class="auth-plan-price-sub">Renovación cada 30 días</span>
                            <span class="auth-plan-option-desc">Acceso total sin permanencia. Cancela cuando quieras.</span>
                        </button>

                        <button type="button" class="auth-plan-option selected" data-plan-choice="anual">
                            <span class="auth-plan-save-tag">${bill.ahorroAnualTexto}</span>
                            <span class="auth-plan-option-title">⭐ Plan Anual (365 días)</span>
                            <span class="auth-plan-price-main">${fmtUsdAuth(bill.precioAnualUsd)} <small style="font-size:0.72rem; font-weight:700;">USD / año</small></span>
                            <span class="auth-plan-price-sub">Equivale a ${fmtUsdAuth(bill.precioAnualPorMesUsd)} USD / mes</span>
                            <span class="auth-plan-option-desc">365 días completos al mejor precio y precio congelado.</span>
                        </button>
                    </div>

                    <p class="auth-currency-hint">
                        💱 Precios de referencia en dólares (USD). Al pagar, la pasarela convierte automáticamente a tu moneda local.
                    </p>

                    <div class="auth-plans-features">
                        <span>✅ Inventario y Stock sin límites</span>
                        <span>✅ POS, Arqueo y Finanzas 7 Niveles</span>
                        <span>✅ Tienda Cat-Web sin comisiones</span>
                        <span>✅ Sincronización PC ↔ Celular en vivo</span>
                    </div>

                    <div class="auth-error" id="auth-plans-error"></div>
                    <div class="auth-success-msg" id="auth-plans-success"></div>

                    <div class="auth-pay-buttons">
                        <button type="button" class="auth-btn auth-btn-paddle" id="btn-auth-pay-paddle">
                            🌎 Pagar con Tarjeta / PayPal — Todo el mundo
                        </button>
                        <button type="button" class="auth-btn auth-btn-mp" id="btn-auth-pay-mp">
                            🇦🇷 Pagar con Mercado Pago — Solo Argentina (ARS)
                        </button>
                        <button type="button" class="auth-btn auth-btn-ghost" id="btn-auth-plans-verify">
                            🔄 Ya completé el pago — Verificar estado ahora
                        </button>
                    </div>
                </div>
            </div>

            <!-- OVERLAY 4: MODAL DE TÉRMINOS Y CONDICIONES / PRIVACIDAD -->
            <div class="auth-overlay" id="cat-auth-legal-overlay" aria-hidden="true">
                <div class="auth-card auth-legal-card" role="dialog" aria-labelledby="auth-legal-title">
                    <button type="button" class="auth-plans-close-x" id="btn-auth-legal-close" title="Cerrar">✕</button>
                    <h2 id="auth-legal-title" style="margin:0 0 4px; font-size:1.1rem; color:#0f172a;">Términos y Condiciones de Cat-Alogo</h2>
                    <p style="margin:0; font-size:0.75rem; color:#64748b;">Titular: Alberto Gonzalo Cortabarria • Córdoba, Argentina</p>
                    <div class="auth-legal-body" id="auth-legal-body"></div>
                    <div style="display:flex; gap:8px; justify-content:flex-end;">
                        <button type="button" class="auth-btn auth-btn-primary" id="btn-auth-legal-accept" style="width:auto; padding:9px 18px;">
                            ✅ Entendido y Aceptar
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(wrapper);
        enlazarEventosOverlays();
        iniciarProteccionDomAntiDevTools();
    }

    const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('tab') === 'register') setAuthTab('register');

    function iniciarProteccionDomAntiDevTools() {
        if (state.observerDom || typeof MutationObserver === 'undefined') return;
        state.observerDom = new MutationObserver(() => {
            if (state.cerrandoSesion || state.modoLocalSinFirebase) return;

            const exigir = window.CAT_ALOGO_CLOUD_CONFIG?.exigirLoginConFirebase !== false;
            const accesoPermitido = (!exigir && !state.user)
                || (Boolean(state.user && state.user.emailVerified && state.subscripcion?.activa) && !state.bloqueado);

            if (!accesoPermitido && document.body.classList.contains('cat-auth-unlocked')) {
                document.body.classList.remove('cat-auth-unlocked');
            }

            const debeBloquear = state.bloqueado || state.verificandoEmail || state.requiereLogin;
            if (!debeBloquear) return;

            const targetId = state.bloqueado
                ? 'cat-auth-lock-overlay'
                : (state.verificandoEmail ? 'cat-auth-verify-overlay' : 'cat-auth-login-overlay');
            const el = document.getElementById(targetId);
            if (!el || !el.classList.contains('active') || el.style.display === 'none' || el.style.visibility === 'hidden') {
                if (!document.getElementById('cat-auth-login-overlay')) {
                    asegurarOverlaysEnDom();
                }
                const restored = document.getElementById(targetId);
                if (restored) {
                    restored.style.display = '';
                    restored.style.visibility = '';
                    restored.classList.add('active');
                    restored.setAttribute('aria-hidden', 'false');
                }
            }
        });
        state.observerDom.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    }

    /* --- 2B. BANNER DISCRETO DE AVISO DE VENCIMIENTO (<= 5 DÍAS) --- */
    function actualizarBannerVencimiento(evalSub) {
        let banner = document.getElementById('cat-auth-expiry-banner');
        const descartado = sessionStorage.getItem(SESSION_KEY_BANNER_DISMISS) === '1';

        const debeMostrar = Boolean(
            state.firebaseListo &&
            state.user &&
            evalSub?.activa &&
            evalSub.expiresAtMs > 0 &&
            evalSub.diasRestantes <= 5 &&
            !descartado
        );

        if (!debeMostrar) {
            if (banner) banner.style.display = 'none';
            return;
        }

        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'cat-auth-expiry-banner';
            banner.innerHTML = `
                <div class="auth-exp-left">
                    <span id="auth-exp-ico">⏳</span>
                    <span id="auth-exp-text">Tu plan vence pronto.</span>
                </div>
                <div class="auth-exp-actions">
                    <button type="button" class="auth-exp-cta" id="btn-auth-exp-upgrade">⭐ Mejorar Plan</button>
                    <button type="button" class="auth-exp-close" id="btn-auth-exp-close" title="Ocultar por esta sesión">✕</button>
                </div>
            `;
            const topbar = document.querySelector('.main-content .topbar');
            if (topbar && topbar.parentElement) {
                topbar.insertAdjacentElement('afterend', banner);
            } else {
                document.body.prepend(banner);
            }

            banner.querySelector('#btn-auth-exp-upgrade')?.addEventListener('click', () => abrirModalPlanes('anual'));
            banner.querySelector('#btn-auth-exp-close')?.addEventListener('click', () => {
                sessionStorage.setItem(SESSION_KEY_BANNER_DISMISS, '1');
                banner.style.display = 'none';
            });
        }

        const esTrial = esPlanTrial(evalSub.plan);
        const dias = evalSub.diasRestantes;
        const urgente = dias <= 2;
        banner.classList.toggle('is-urgent', urgente);

        const ico = banner.querySelector('#auth-exp-ico');
        const txt = banner.querySelector('#auth-exp-text');
        const btnCta = banner.querySelector('#btn-auth-exp-upgrade');

        const diasTxt = dias <= 1 ? 'menos de 24 horas' : `${dias} días`;
        if (ico) ico.textContent = urgente ? '⚠️' : '⏳';
        if (txt) {
            txt.innerHTML = esTrial
                ? `Te quedan <strong>${diasTxt}</strong> de tu Prueba Gratis. Activá tu plan para seguir vendiendo y sincronizando sin pausas.`
                : `Tu <strong>${evalSub.planLabel}</strong> vence en <strong>${diasTxt}</strong>. Renová a tiempo para no interrumpir tu caja.`;
        }
        if (btnCta) btnCta.textContent = esTrial ? '⭐ Activar Plan Pro' : '⭐ Renovar Plan';

        banner.style.display = 'flex';
    }

    /* --- 2C. MODAL "⭐ MEJORAR PLAN" Y CHECKOUT WEB (PADDLE USD + MP ARS) --- */
    function actualizarBotonesModalPlanes() {
        const bill = obtenerConfigBillingWeb();
        const esAnual = state.planSeleccionado === 'anual';
        const precioUsd = esAnual ? bill.precioAnualUsd : bill.precioMensualUsd;
        const etiquetaPlan = esAnual ? 'Anual' : '30 Días';
        const cotizArs = Number(bill.cotizacionArsReferencia) || Number(state.cotizacionArsServidor) || 0;
        const estimadoArs = cotizArs > 0 ? ` (~${fmtArsAuth(precioUsd * cotizArs)} ARS)` : ' (Pesos ARS)';

        document.querySelectorAll('#auth-plan-select-grid .auth-plan-option').forEach(btn => {
            btn.classList.toggle('selected', btn.getAttribute('data-plan-choice') === state.planSeleccionado);
        });

        const btnPaddle = document.getElementById('btn-auth-pay-paddle');
        const btnMp = document.getElementById('btn-auth-pay-mp');
        if (btnPaddle) btnPaddle.textContent = `🌎 Pagar Plan ${etiquetaPlan} con Tarjeta / PayPal (${fmtUsdAuth(precioUsd)} • Global)`;
        if (btnMp) btnMp.textContent = `🇦🇷 Pagar Plan ${etiquetaPlan} con Mercado Pago — Solo Argentina${estimadoArs}`;

        const sub = state.subscripcion;
        const activoEnPlay = Boolean(
            sub?.activa && !esPlanTrial(sub.plan) && String(sub.source || '').toLowerCase() === 'google_play'
        );
        const gpWarn = document.getElementById('auth-plans-gp-warning');
        if (gpWarn) gpWarn.style.display = activoEnPlay ? 'block' : 'none';
        if (btnMp) btnMp.disabled = activoEnPlay;
        if (btnPaddle) btnPaddle.disabled = activoEnPlay;
    }

    function abrirModalPlanes(planInicial = 'anual') {
        asegurarOverlaysEnDom();
        state.planSeleccionado = planInicial === 'mensual' ? 'mensual' : 'anual';

        const errBox = document.getElementById('auth-plans-error');
        const okBox = document.getElementById('auth-plans-success');
        if (errBox) errBox.style.display = 'none';
        if (okBox) okBox.style.display = 'none';

        actualizarBotonesModalPlanes();
        if (!state.cotizacionArsServidor) cargarCotizacionArsGlobal();

        const ov = document.getElementById('cat-auth-plans-overlay');
        if (ov) {
            ov.classList.add('active');
            ov.setAttribute('aria-hidden', 'false');
        }
    }

    function cerrarModalPlanes() {
        const ov = document.getElementById('cat-auth-plans-overlay');
        if (ov) {
            ov.classList.remove('active');
            ov.setAttribute('aria-hidden', 'true');
        }
    }

    async function iniciarCheckoutWeb(gateway) {
        const errBox = document.getElementById('auth-plans-error');
        const okBox = document.getElementById('auth-plans-success');
        if (errBox) errBox.style.display = 'none';
        if (okBox) okBox.style.display = 'none';

        if (!state.uid || !state.user) {
            if (errBox) {
                errBox.textContent = 'Inicia sesión con tu cuenta antes de suscribirte.';
                errBox.style.display = 'block';
            }
            return;
        }

        const bill = obtenerConfigBillingWeb();
        const plan = state.planSeleccionado;
        const precioUsd = plan === 'anual' ? bill.precioAnualUsd : bill.precioMensualUsd;
        const btn = document.getElementById(gateway === 'mercadopago' ? 'btn-auth-pay-mp' : 'btn-auth-pay-paddle');
        const txtOrig = btn?.textContent || '';

        try {
            if (btn) { btn.disabled = true; btn.textContent = '⏳ Preparando checkout seguro…'; }

            if (gateway === 'mercadopago') {
                if (!bill.endpointMercadoPago) {
                    if (okBox) {
                        okBox.innerHTML =
                            `🇦🇷 <strong>Checkout Mercado Pago Argentina (${plan === 'anual' ? 'Anual' : '30 días'} • base ${fmtUsdAuth(precioUsd)}) pendiente de configurar endpoint.</strong>`;
                        okBox.style.display = 'block';
                    }
                    return;
                }

                const popup = window.open('', '_blank');

                try {
                    const idToken = await state.user.getIdToken();
                    const resp = await fetch(bill.endpointMercadoPago, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${idToken}`
                        },
                        body: JSON.stringify({
                            uid: state.uid,
                            email: state.user.email,
                            plan,
                            returnUrl: window.location.href
                        })
                    });
                    const data = await resp.json().catch(() => ({}));
                    if (!resp.ok || !data?.checkoutUrl) {
                        if (popup && !popup.closed) popup.close();
                        throw new Error(data?.error || 'No se pudo generar el enlace de Mercado Pago.');
                    }

                    if (popup && !popup.closed) {
                        popup.location.href = data.checkoutUrl;
                    } else {
                        window.open(data.checkoutUrl, '_blank', 'noopener');
                    }

                    if (okBox) {
                        const montoTxt = data.precioArs ? ` (${fmtArsAuth(data.precioArs)} ARS)` : '';
                        okBox.innerHTML =
                            `✅ Link de Mercado Pago generado${montoTxt}. ` +
                            `<a href="${data.checkoutUrl}" target="_blank" rel="noopener" style="color:#047857; font-weight:800; text-decoration:underline;">Si no se abrió solo, hacé clic aquí para pagar</a>.`;
                        okBox.style.display = 'block';
                    }
                    return;
                } catch (mpErr) {
                    if (popup && !popup.closed) popup.close();
                    throw mpErr;
                }
            }

            if (gateway === 'paddle') {
                const priceId = bill.paddlePriceIds?.[plan];
                if (window.Paddle && bill.paddleClientToken && priceId) {
                    if (!window._catPaddleInit) {
                        const esSandbox = bill.paddleEnvironment === 'sandbox' || String(bill.paddleClientToken).startsWith('test_');
                        if (esSandbox && window.Paddle.Environment?.set) {
                            window.Paddle.Environment.set('sandbox');
                        }
                        window.Paddle.Initialize({
                            token: bill.paddleClientToken,
                            eventCallback: (ev) => {
                                if (ev?.name === 'checkout.completed') {
                                    const boxOk = document.getElementById('auth-plans-success');
                                    if (boxOk) {
                                        boxOk.textContent = '✅ ¡Pago recibido! Acreditando tu plan en segundos…';
                                        boxOk.style.display = 'block';
                                    }
                                    setTimeout(() => refrescarSuscripcionManual(true), 3000);
                                }
                            }
                        });
                        window._catPaddleInit = true;
                    }
                    window.Paddle.Checkout.open({
                        items: [{ priceId, quantity: 1 }],
                        customer: { email: state.user.email || undefined },
                        customData: { uid: state.uid, app_user_id: state.uid, plan }
                    });
                    return;
                }

                if (bill.endpointPaddle) {
                    const idToken = await state.user.getIdToken();
                    const resp = await fetch(bill.endpointPaddle, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${idToken}`
                        },
                        body: JSON.stringify({
                            uid: state.uid,
                            email: state.user.email,
                            plan,
                            returnUrl: window.location.href
                        })
                    });
                    const data = await resp.json().catch(() => ({}));
                    if (!resp.ok || !data?.checkoutUrl) {
                        throw new Error(data?.error || 'No se pudo iniciar el checkout con Paddle.');
                    }
                    window.open(data.checkoutUrl, '_blank', 'noopener');
                    return;
                }

                if (okBox) {
                    okBox.innerHTML =
                        `🌎 <strong>Checkout Global Paddle (${plan === 'anual' ? 'Anual' : '30 días'} • ${fmtUsdAuth(precioUsd)}) disponible pronto.</strong><br>` +
                        `Completa <code>paddleClientToken</code> y <code>paddlePriceIds</code> en <code>firebase-config.js</code> cuando actives tu cuenta de Paddle.`;
                    okBox.style.display = 'block';
                }
            }
        } catch (err) {
            if (errBox) {
                errBox.textContent = `❌ ${err.message || 'Error iniciando el pago.'}`;
                errBox.style.display = 'block';
            }
        } finally {
            if (btn) {
                btn.textContent = txtOrig;
                actualizarBotonesModalPlanes();
            }
        }
    }

    async function refrescarSuscripcionManual(mostrarFeedbackEnModal = false) {
        if (!state.db || !state.uid) return;
        const okBox = document.getElementById('auth-plans-success');
        const errBox = document.getElementById('auth-plans-error');
        try {
            await sincronizarRelojConServidor();
            const snap = await state.db.collection('users').doc(state.uid).get();
            if (snap.exists) {
                const evalSub = evaluarEstadoSuscripcion(snap.data());
                aplicarEstadoSuscripcion(evalSub);
                if (mostrarFeedbackEnModal && okBox) {
                    okBox.textContent = evalSub.activa
                        ? `✅ Estado actualizado: ${evalSub.planLabel} (${evalSub.diasRestantes} día(s) restantes).`
                        : '⏳ Todavía no impactó el pago. Si acabas de abonar, espera unos segundos y vuelve a verificar.';
                    okBox.style.display = 'block';
                    if (errBox) errBox.style.display = 'none';
                }
            }
        } catch (err) {
            if (mostrarFeedbackEnModal && errBox) {
                errBox.textContent = `Error al verificar: ${err.message}`;
                errBox.style.display = 'block';
            }
        }
    }

    function setAuthTab(tab) {
        state.authTab = tab === 'register' ? 'register' : 'login';
        const esReg = state.authTab === 'register';

        document.querySelectorAll('#auth-tabs-bar .auth-tab-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-authtab') === state.authTab);
        });

        const setDisp = (id, show, flex = false) => {
            const el = document.getElementById(id);
            if (el) el.style.display = show ? (flex ? 'flex' : 'block') : 'none';
        };
        setDisp('auth-confirm-pass-wrap', esReg);
        setDisp('auth-forgot-wrap', !esReg, true);

        const titulo = document.getElementById('auth-login-title');
        const sub = document.getElementById('auth-login-subtitle');
        const btnSubmit = document.getElementById('btn-auth-email-submit');
        const inpPassConfirm = document.getElementById('auth-inp-pass-confirm');

        if (titulo) titulo.textContent = esReg ? 'Crear Cuenta en Cat-Alogo Web' : 'Iniciar Sesión en Cat-Alogo Web';
        if (sub) {
            sub.innerHTML = esReg
                ? 'Regístrate para activar <strong>14 días gratis sin tarjeta</strong>. Podrás usar Cat-Alogo en PC sola o sincronizada con tu celular.'
                : 'Accede con tu cuenta de <strong>Cat-Alogo</strong> (Web o App Android) para sincronizar inventario, caja, clientes y suscripción.';
        }
        if (btnSubmit) btnSubmit.textContent = esReg ? '✨ Crear Cuenta y Activar 14 Días Gratis' : '🔓 Entrar a mi Comercio';
        if (inpPassConfirm) inpPassConfirm.required = esReg;

        mostrarErrorLogin('');
        mostrarExitoLogin('');
    }

    function mostrarErrorLogin(msg) {
        const box = document.getElementById('auth-login-error');
        if (!box) return;
        box.textContent = msg || '';
        box.style.display = msg ? 'block' : 'none';
    }

    function mostrarExitoLogin(msg) {
        const box = document.getElementById('auth-login-success');
        if (!box) return;
        box.textContent = msg || '';
        box.style.display = msg ? 'block' : 'none';
    }

    function mostrarLoginOverlay(esSimulacion = false) {
        asegurarOverlaysEnDom();
        state.simulandoOverlay = esSimulacion;
        state.requiereLogin = !esSimulacion;
        const ov = document.getElementById('cat-auth-login-overlay');
        const btnCerrarSim = document.getElementById('btn-auth-cerrar-sim-login');
        if (btnCerrarSim) btnCerrarSim.style.display = esSimulacion ? 'inline-flex' : 'none';
        if (ov) {
            ov.classList.add('active');
            ov.setAttribute('aria-hidden', 'false');
        }
    }

    function ocultarLoginOverlay() {
        state.requiereLogin = false;
        const ov = document.getElementById('cat-auth-login-overlay');
        if (ov) {
            ov.classList.remove('active');
            ov.setAttribute('aria-hidden', 'true');
        }
        mostrarErrorLogin('');
        mostrarExitoLogin('');
    }

    function mostrarVerifyOverlay(email) {
        asegurarOverlaysEnDom();
        state.verificandoEmail = true;
        const lbl = document.getElementById('auth-verify-email-lbl');
        if (lbl) lbl.textContent = email || 'tu correo';
        const ov = document.getElementById('cat-auth-verify-overlay');
        if (ov) {
            ov.classList.add('active');
            ov.setAttribute('aria-hidden', 'false');
        }
    }

    function ocultarVerifyOverlay() {
        state.verificandoEmail = false;
        const ov = document.getElementById('cat-auth-verify-overlay');
        if (ov) {
            ov.classList.remove('active');
            ov.setAttribute('aria-hidden', 'true');
        }
    }

    function mostrarWelcomeOverlay() {
        asegurarOverlaysEnDom();
        const ov = document.getElementById('cat-auth-welcome-overlay');
        if (ov) {
            ov.classList.add('active');
            ov.setAttribute('aria-hidden', 'false');
        }
    }

    function ocultarWelcomeOverlay() {
        const ov = document.getElementById('cat-auth-welcome-overlay');
        if (ov) {
            ov.classList.remove('active');
            ov.setAttribute('aria-hidden', 'true');
        }
    }

    function mostrarLockOverlay(infoSub, esSimulacion = false) {
        asegurarOverlaysEnDom();
        state.bloqueado = !esSimulacion;
        state.simulandoOverlay = esSimulacion;

        const emailTxt = state.user?.email || 'comercio@ejemplo.com';
        const planKey = String(infoSub?.plan || 'trial_14').toLowerCase();
        const planTxt = PLAN_LABELS[planKey] || infoSub?.plan || 'Prueba Gratis (14 días)';
        const venceTxt = infoSub?.expiresAtMs
            ? new Date(infoSub.expiresAtMs).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'Período finalizado';

        const setTxt = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
        setTxt('auth-lock-email', emailTxt);
        setTxt('auth-lock-plan', planTxt);
        setTxt('auth-lock-vence', venceTxt);

        const btnCerrarSim = document.getElementById('btn-auth-cerrar-sim-lock');
        if (btnCerrarSim) btnCerrarSim.style.display = esSimulacion ? 'inline-flex' : 'none';

        const ov = document.getElementById('cat-auth-lock-overlay');
        if (ov) {
            ov.classList.add('active');
            ov.setAttribute('aria-hidden', 'false');
        }
    }

    function ocultarLockOverlay() {
        state.bloqueado = false;
        const ov = document.getElementById('cat-auth-lock-overlay');
        if (ov) {
            ov.classList.remove('active');
            ov.setAttribute('aria-hidden', 'true');
        }
    }

    /* --- 3. NORMALIZAR, CREAR TRIAL INICIAL (SERVIDOR) Y EVALUAR SUSCRIPCIÓN --- */
    function parsearTimestampMs(val) {
        if (!val) return 0;
        if (typeof val === 'number') return val < 1e12 ? val * 1000 : val;
        if (typeof val?.toMillis === 'function') return val.toMillis();
        if (typeof val?.seconds === 'number') return val.seconds * 1000;
        const parsed = Date.parse(String(val));
        return isNaN(parsed) ? 0 : parsed;
    }

    function evaluarEstadoSuscripcion(rawDoc) {
        const d = rawDoc || {};
        const statusRaw = String(d.status || d.estado || '').toLowerCase();
        const plan = d.plan_actual || d.plan || (typeof d.activePlan === 'string' ? d.activePlan : '') || d.planId || d.tipoPlan || 'trial_14';
        const expiresAtMs = parsearTimestampMs(
            d.fecha_expiracion || d.expiresAt || d.fechaVencimiento || d.subscriptionEnd || d.trialEndsAt || d.venceEl
        );

        const ahoraMs = obtenerAhoraServidorMs();
        const diasRestantes = expiresAtMs > 0
            ? Math.ceil((expiresAtMs - ahoraMs) / 86400000)
            : 0;

        const marcadoVencido = ['expired', 'vencido', 'blocked', 'bloqueado', 'revoked', 'none'].includes(statusRaw) || d.activePlan === false;
        const vigentePorFecha = expiresAtMs > ahoraMs;
        const vigentePorFlag = (d.activePlan === true || statusRaw === 'active' || statusRaw === 'trial' || statusRaw === 'lifetime') && expiresAtMs === 0;
        const activa = !marcadoVencido && (vigentePorFecha || vigentePorFlag);

        return {
            activa,
            plan,
            planLabel: PLAN_LABELS[String(plan).toLowerCase()] || plan,
            status: activa ? (statusRaw || 'active') : 'expired',
            expiresAtMs,
            diasRestantes: Math.max(0, diasRestantes),
            source: d.source || 'google_play',
            raw: d
        };
    }

    async function asegurarLicenciaInicialUsuarioNuevo(user) {
        if (!state.db || !user?.uid) return false;
        const userRef = state.db.collection('users').doc(user.uid);
        const snap = await userRef.get();
        const data = snap.exists ? (snap.data() || {}) : {};
        const yaTienePlan = Boolean(
            data.fecha_expiracion || data.plan || data.plan_actual || data.activePlan !== undefined || data.trialUsed
        );
        if (yaTienePlan) return false;

        const endpointTrial = obtenerEndpointActivarPrueba();
        if (endpointTrial && typeof user.getIdToken === 'function') {
            try {
                const idToken = await user.getIdToken(true);
                const resp = await fetch(endpointTrial, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${idToken}`
                    },
                    body: JSON.stringify({ uid: user.uid })
                });
                const resJson = await resp.json().catch(() => ({}));
                if (resp.ok) {
                    if (resJson?.creado) {
                        try { localStorage.setItem(STORAGE_KEY_TRIAL_FP, user.uid); } catch { /* ignore */ }
                        return true;
                    }
                    return false;
                }
            } catch (err) {
                console.warn('Error llamando a activarPruebaGratis:', err);
            }
        }

        if (endpointTrial) return false;

        const emailNorm = normalizarEmailAntiAlias(user.email || '');
        const trialPrevioEquipo = localStorage.getItem(STORAGE_KEY_TRIAL_FP);
        if (trialPrevioEquipo && trialPrevioEquipo !== user.uid) {
            return false;
        }
        const ahoraMs = obtenerAhoraServidorMs();
        const expiraMs = ahoraMs + (14 * 24 * 60 * 60 * 1000);
        try {
            await userRef.set({
                email: user.email || '',
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
            }, { merge: true });
            localStorage.setItem(STORAGE_KEY_TRIAL_FP, user.uid);
            return true;
        } catch {
            return false;
        }
    }

    function aplicarEstadoSuscripcion(evalSub) {
        state.subscripcion = evalSub;

        if (!evalSub.activa) {
            document.body.classList.remove('cat-auth-unlocked');
            mostrarLockOverlay(evalSub, false);
        } else {
            ocultarLockOverlay();
            document.body.classList.add('cat-auth-unlocked');
        }

        window.dispatchEvent(new CustomEvent('cat-alogo:suscripcion-actualizada', { detail: evalSub }));
        inyectarPanelCuentaEnAjustesNube();
        actualizarBannerVencimiento(evalSub);

        if (document.getElementById('cat-auth-plans-overlay')?.classList.contains('active')) {
            actualizarBotonesModalPlanes();
        }
    }

    function suscribirseALicenciaEnTiempoReal(uid) {
        if (state.unsubBilling) {
            try { state.unsubBilling(); } catch { /* ignore */ }
            state.unsubBilling = null;
        }
        if (!state.db || !uid) return;

        const cfg = window.CAT_ALOGO_CLOUD_CONFIG || {};
        const subCol = cfg.billingSubcollection || 'billing';
        const docId = cfg.billingDocId || 'subscription';

        const userRootRef = state.db.collection('users').doc(uid);
        const billingRef = userRootRef.collection(subCol).doc(docId);

        state.unsubBilling = userRootRef.onSnapshot(async (snap) => {
            if (snap.exists) {
                const data = snap.data() || {};
                const tieneCamposPlan = Boolean(
                    data.fecha_expiracion || data.plan || data.plan_actual || data.activePlan !== undefined
                );
                if (tieneCamposPlan) {
                    aplicarEstadoSuscripcion(evaluarEstadoSuscripcion(data));
                    return;
                }
            }
            try {
                const subSnap = await billingRef.get();
                if (subSnap.exists) {
                    aplicarEstadoSuscripcion(evaluarEstadoSuscripcion(subSnap.data()));
                } else {
                    aplicarEstadoSuscripcion(evaluarEstadoSuscripcion({ status: 'expired', plan: 'sin_plan' }));
                }
            } catch (err) {
                console.warn('Error leyendo suscripción:', err);
            }
        }, (err) => {
            console.warn('No se pudo escuchar el documento users/{uid}:', err);
        });
    }

    async function sincronizarRelojConServidor() {
        try {
            const resp = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
            const dateHdr = resp.headers.get('Date');
            if (dateHdr) {
                const serverMs = Date.parse(dateHdr);
                if (!isNaN(serverMs)) state.serverOffsetMs = serverMs - Date.now();
            }
        } catch { /* sin ajuste de offset */ }
    }

    /* --- 4. SINCRONIZAR UID AUTENTICADO CON CAT-WEB Y AJUSTES --- */
    function vincularUidConModulosLocales(user) {
        if (!user?.uid) return;
        try {
            const fbCfg = JSON.parse(localStorage.getItem(STORAGE_KEY_FB_CFG) || '{}');
            const master = obtenerConfigFirebaseActiva() || {};
            const actualizado = {
                ...fbCfg,
                apiKey: master.apiKey || fbCfg.apiKey || '',
                authDomain: master.authDomain || fbCfg.authDomain || '',
                projectId: master.projectId || fbCfg.projectId || '',
                storageBucket: master.storageBucket || fbCfg.storageBucket || '',
                messagingSenderId: master.messagingSenderId || fbCfg.messagingSenderId || '',
                appId: master.appId || fbCfg.appId || '',
                uid: user.uid,
                colTiendas: fbCfg.colTiendas || 'vendors',
                colPedidos: fbCfg.colPedidos || 'orders'
            };
            localStorage.setItem(STORAGE_KEY_FB_CFG, JSON.stringify(actualizado));
        } catch { /* ignore */ }
    }

    async function completarIngresoVerificado(user) {
        const lastUid = localStorage.getItem(STORAGE_KEY_LAST_UID);
        if (lastUid && lastUid !== user.uid) {
            await limpiarBovedaLocalPorCambioCuenta();
            localStorage.setItem(STORAGE_KEY_LAST_UID, user.uid);
            window.location.reload();
            return;
        }
        localStorage.setItem(STORAGE_KEY_LAST_UID, user.uid);

        try {
            if (typeof user.getIdToken === 'function') await user.getIdToken(true);
        } catch { /* ignore */ }

        ocultarLoginOverlay();
        ocultarVerifyOverlay();
        vincularUidConModulosLocales(user);
        await sincronizarRelojConServidor();

        const esNuevoTrial = await asegurarLicenciaInicialUsuarioNuevo(user);
        cargarCotizacionArsGlobal();
        suscribirseALicenciaEnTiempoReal(user.uid);
        inyectarPanelCuentaEnAjustesNube();
        window.dispatchEvent(new CustomEvent('cat-alogo:auth-cambiado', { detail: { user, uid: user.uid } }));

        if (esNuevoTrial) {
            mostrarWelcomeOverlay();
        }
    }

    /* --- 5. EVENTOS DE LOGIN, REGISTRO, VERIFICACIÓN, PLANES Y BLOQUEO --- */
    function iniciarCooldownReenvio(segundos = 60) {
        const btn = document.getElementById('btn-auth-resend-verify');
        if (!btn) return;
        if (state.resendCooldownTimer) clearInterval(state.resendCooldownTimer);
        let rest = segundos;
        btn.disabled = true;
        btn.textContent = `⏳ Reenviar en ${rest}s`;
        state.resendCooldownTimer = setInterval(() => {
            rest--;
            if (rest <= 0) {
                clearInterval(state.resendCooldownTimer);
                state.resendCooldownTimer = null;
                btn.disabled = false;
                btn.textContent = '📨 Reenviar correo de verificación';
            } else {
                btn.textContent = `⏳ Reenviar en ${rest}s`;
            }
        }, 1000);
    }

    function enlazarEventosOverlays() {
        document.querySelectorAll('#auth-tabs-bar .auth-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => setAuthTab(btn.getAttribute('data-authtab')));
        });

        const TEXTO_TERMINOS = `
            <h4>1. Aceptación de los Términos</h4>
            <p>Al descargar, acceder, navegar o utilizar la aplicación móvil y/o plataforma web <strong>Cat-Alogo</strong> (en adelante, la "Aplicación" o el "Servicio"), usted (en adelante, el "Usuario") acepta estar legalmente vinculado por estos Términos y Condiciones de Uso. El Servicio es propiedad y está operado por <strong>Alberto Gonzalo Cortabarria</strong> (en adelante, el "Titular"), con base de operaciones en la Provincia de Córdoba, República Argentina.</p>

            <h4>2. Requisitos de Edad y Registro de Cuenta</h4>
            <p>Para utilizar la Aplicación, el Usuario debe tener al menos 18 años de edad; los menores de entre 13 y 17 años podrán utilizarla únicamente bajo supervisión y consentimiento expreso de sus padres o tutores legales. El registro puede realizarse por correo y contraseña o mediante autenticación de terceros (Google Auth). El Usuario es responsable de mantener la confidencialidad de sus credenciales y de toda actividad realizada bajo su cuenta, incluyendo la verificación de su correo electrónico.</p>

            <h4>3. Planes, Suscripciones, Renovación y Reembolsos</h4>
            <p>Cat-Alogo ofrece una <strong>prueba gratuita única de 14 días</strong> y planes de pago (mensual de 30 días y anual de 365 días). Queda prohibida la creación de múltiples cuentas o el uso de alias/correos temporales para extender la prueba gratuita. Al abonar un plan mientras ya tenés días vigentes, se acumulan los días correspondientes sobre tu vencimiento actual; al vencer un período sin renovación, el acceso operativo se pausa conservando tus datos intactos hasta que renueves.</p>
            <p>Los pagos se procesan mediante pasarelas seguras de terceros (Mercado Pago, Paddle y Google Play Billing), sin que el Titular almacene datos de tarjetas. Los precios de referencia en USD o ARS pueden estar sujetos a impuestos locales, comisiones o conversiones de moneda de cada pasarela/país. Las compras procesadas mediante Paddle cuentan con garantía de reembolso de 14 días calendario desde la compra; en Google Play y Mercado Pago aplican las políticas de cada pasarela y la normativa vigente. Solicitudes a <a href="mailto:algoncor85@gmail.com">algoncor85@gmail.com</a>.</p>

            <h4>4. Uso Aceptable y Tienda Pública (Cat-Web)</h4>
            <p>Está estrictamente prohibido utilizar Cat-Alogo para publicar, promocionar o vender bienes o servicios ilegales, armas de fuego, municiones o explosivos, drogas o sustancias controladas, material sexualmente explícito, o productos robados, falsificados o que infrinjan propiedad intelectual. El Titular puede suspender o bloquear cuentas de forma permanente y sin previo aviso ante infracciones a esta cláusula.</p>
            <p>El Usuario es exclusivo responsable por el contenido que publique en su tienda pública <strong>Cat-Web</strong> y por los mensajes o recordatorios de cobranza que envíe a sus clientes.</p>

            <h4>5. Exención de Responsabilidad y Herramientas de Gestión</h4>
            <p>Cat-Alogo es una herramienta de asistencia administrativa (catálogos, inventario/stock, ventas, apertura y cierre de caja, clientes y reportes financieros). El Titular no interviene en las transacciones entre el Usuario y sus clientes ni asume responsabilidad por disputas comerciales, errores de tipeo, descuadres de caja física, diferencias de inventario ni obligaciones contables, tributarias o fiscales del Usuario. Los comprobantes o tickets internos no revisten carácter de factura fiscal.</p>

            <h4>6. Modo Sin Conexión, Disponibilidad y Pérdida de Datos</h4>
            <p>El Servicio se ofrece "tal cual" y "según disponibilidad". En modo sin conexión los cambios se registran localmente hasta contar con red y sesión válida, y la sincronización en la nube depende de servicios de terceros (como Firebase). El Titular no se responsabiliza por pérdidas accidentales de datos, imágenes o registros por fallos de red, interrupciones o fuerza mayor; se recomienda realizar copias de seguridad periódicas.</p>

            <h4>7. Propiedad Intelectual, Ley Aplicable y Contacto</h4>
            <p>El código, diseño, logotipo y marca <strong>Cat-Alogo</strong> son propiedad exclusiva de <strong>Alberto Gonzalo Cortabarria</strong>; el Usuario conserva los derechos sobre el contenido comercial que cargue. Estos Términos se rigen por las leyes de la República Argentina y quedan sometidos a los Tribunales Ordinarios de la ciudad de Córdoba, Provincia de Córdoba. Consultas legales o de soporte: <a href="mailto:algoncor85@gmail.com">algoncor85@gmail.com</a>.</p>
        `;

        const TEXTO_PRIVACIDAD = `
            <h4>1. Información que Recopilamos y Permisos</h4>
            <p>Operada por <strong>Alberto Gonzalo Cortabarria</strong> (Córdoba, Argentina). Recopilamos datos de registro (nombre y correo electrónico, manual o mediante Google Auth) y datos comerciales o de catálogo que cargues (incluyendo información opcional pública de tu negocio o redes sociales).</p>
            <p>En la aplicación móvil se solicita permiso explícito para <strong>Cámara y Galería</strong> (fotografías de productos) y <strong>Almacenamiento Local</strong> (guardar y descargar PDFs de catálogos). Cat-Alogo <strong>no</strong> recopila ni rastrea ubicación geográfica (GPS).</p>

            <h4>2. Uso de la Información y Terceros</h4>
            <p>Utilizamos la información para gestionar tu cuenta, crear y exportar catálogos, validar suscripciones y brindar soporte. No vendemos ni alquilamos tus datos con fines publicitarios. Los pagos son procesados directamente por pasarelas de terceros (Mercado Pago, Paddle, Google Play Billing) y utilizamos Firebase para autenticación, base de datos y analíticas/diagnóstico técnico.</p>

            <h4>3. Eliminación de Datos, Seguridad y Contacto</h4>
            <p>Podés solicitar la eliminación de tu cuenta y datos asociados desde la configuración o escribiendo a <a href="mailto:algoncor85@gmail.com">algoncor85@gmail.com</a>. Aplicamos medidas razonables de seguridad (sin que ningún sistema en internet sea infalible). Servicio dirigido a mayores de 18 años (o menores de 13 a 17 años con autorización y supervisión de padres/tutores; no destinado a menores de 13 años).</p>
        `;

        const abrirModalLegal = (tipo) => {
            const ov = document.getElementById('cat-auth-legal-overlay');
            const title = document.getElementById('auth-legal-title');
            const body = document.getElementById('auth-legal-body');
            if (!ov || !body) return;
            if (title) {
                title.textContent = tipo === 'privacidad'
                    ? 'Política de Privacidad – Cat-Alogo'
                    : 'Términos y Condiciones de Uso – Cat-Alogo';
            }
            body.innerHTML = tipo === 'privacidad' ? TEXTO_PRIVACIDAD : TEXTO_TERMINOS;
            body.scrollTop = 0;
            ov.classList.add('active');
            ov.setAttribute('aria-hidden', 'false');
        };

        const cerrarModalLegal = () => {
            const ov = document.getElementById('cat-auth-legal-overlay');
            if (ov) {
                ov.classList.remove('active');
                ov.setAttribute('aria-hidden', 'true');
            }
        };

        document.getElementById('btn-auth-ver-terminos')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            abrirModalLegal('terminos');
        });

        document.getElementById('btn-auth-ver-privacidad')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            abrirModalLegal('privacidad');
        });

        document.getElementById('btn-auth-legal-close')?.addEventListener('click', cerrarModalLegal);
        document.getElementById('btn-auth-legal-accept')?.addEventListener('click', () => {
            const chk = document.getElementById('auth-chk-terms');
            if (chk) chk.checked = true;
            cerrarModalLegal();
        });
        document.getElementById('cat-auth-legal-overlay')?.addEventListener('click', (e) => {
            if (e.target.id === 'cat-auth-legal-overlay') cerrarModalLegal();
        });

        document.getElementById('btn-auth-forgot-pass')?.addEventListener('click', async () => {
            if (!state.auth) return;
            const email = (document.getElementById('auth-inp-email')?.value || '').trim();
            if (!email || !email.includes('@')) {
                mostrarErrorLogin('Escribe primero tu correo electrónico arriba para enviarte el enlace de recuperación.');
                document.getElementById('auth-inp-email')?.focus();
                return;
            }
            mostrarErrorLogin('');
            mostrarExitoLogin('');
            try {
                await state.auth.sendPasswordResetEmail(email);
                mostrarExitoLogin(`✅ Te enviamos un enlace para restablecer tu contraseña a ${email}. Revisa tu casilla o Spam.`);
            } catch (err) {
                mostrarErrorLogin(`No se pudo enviar el correo de recuperación: ${err.message}`);
            }
        });

        document.getElementById('form-cat-auth-login')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!state.auth) {
                mostrarErrorLogin('Firebase no está configurado todavía en app/js/firebase-config.js.');
                return;
            }
            const email = (document.getElementById('auth-inp-email')?.value || '').trim();
            const pass = document.getElementById('auth-inp-pass')?.value || '';
            const aceptaTerminos = !!document.getElementById('auth-chk-terms')?.checked;
            const btn = document.getElementById('btn-auth-email-submit');
            mostrarErrorLogin('');
            mostrarExitoLogin('');

            if (!aceptaTerminos) {
                mostrarErrorLogin('Debes aceptar los Términos y Condiciones y la Política de Privacidad para ingresar.');
                return;
            }

            if (state.authTab === 'register') {
                const passConfirm = document.getElementById('auth-inp-pass-confirm')?.value || '';

                if (esEmailDescartable(email)) {
                    mostrarErrorLogin('No se permiten correos temporales o descartables. Usa tu correo real para proteger tu comercio.');
                    return;
                }
                if (pass.length < 6) {
                    mostrarErrorLogin('La contraseña debe tener al menos 6 caracteres.');
                    return;
                }
                if (pass !== passConfirm) {
                    mostrarErrorLogin('Las contraseñas no coinciden.');
                    return;
                }

                if (btn) { btn.disabled = true; btn.textContent = '⏳ Creando cuenta…'; }
                try {
                    const cred = await state.auth.createUserWithEmailAndPassword(email, pass);
                    if (cred?.user && !cred.user.emailVerified) {
                        try { await cred.user.sendEmailVerification(); } catch { /* ignore */ }
                        iniciarCooldownReenvio(60);
                    }
                } catch (err) {
                    const msg = err?.code === 'auth/email-already-in-use'
                        ? 'Ese correo ya tiene una cuenta en Cat-Alogo. Cambia a la pestaña "Ingresar".'
                        : `No se pudo crear la cuenta: ${err.message}`;
                    mostrarErrorLogin(msg);
                } finally {
                    if (btn) { btn.disabled = false; btn.textContent = '✨ Crear Cuenta y Activar 14 Días Gratis'; }
                }
                return;
            }

            if (btn) { btn.disabled = true; btn.textContent = '⏳ Verificando cuenta…'; }
            try {
                await state.auth.signInWithEmailAndPassword(email, pass);
            } catch (err) {
                const msg = err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential'
                    ? 'Correo o contraseña incorrectos.'
                    : (err?.code === 'auth/user-not-found'
                        ? 'No encontramos una cuenta con ese correo. Puedes crearla en la pestaña "Crear Cuenta".'
                        : `No se pudo iniciar sesión: ${err.message}`);
                mostrarErrorLogin(msg);
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = '🔓 Entrar a mi Comercio'; }
            }
        });

        document.getElementById('btn-auth-google-login')?.addEventListener('click', async () => {
            if (!state.auth) {
                mostrarErrorLogin('Firebase no está configurado todavía en app/js/firebase-config.js.');
                return;
            }
            if (!document.getElementById('auth-chk-terms')?.checked) {
                mostrarErrorLogin('Marca la casilla de Términos y Condiciones y Política de Privacidad antes de continuar con Google.');
                return;
            }
            mostrarErrorLogin('');
            try {
                const provider = new firebase.auth.GoogleAuthProvider();
                await state.auth.signInWithPopup(provider);
            } catch (err) {
                if (err?.code !== 'auth/popup-closed-by-user') {
                    mostrarErrorLogin(`Error con Google: ${err.message}`);
                }
            }
        });

        document.getElementById('btn-auth-check-verified')?.addEventListener('click', async () => {
            const errBox = document.getElementById('auth-verify-error');
            const okBox = document.getElementById('auth-verify-success');
            if (errBox) errBox.style.display = 'none';
            if (okBox) okBox.style.display = 'none';
            const user = state.auth?.currentUser;
            if (!user) return;
            try {
                await user.reload();
                if (state.auth.currentUser?.emailVerified) {
                    await state.auth.currentUser.getIdToken(true);
                    await completarIngresoVerificado(state.auth.currentUser);
                } else if (errBox) {
                    errBox.textContent = 'Todavía no figura verificado. Abre el enlace que enviamos a tu correo y vuelve a presionar este botón.';
                    errBox.style.display = 'block';
                }
            } catch (err) {
                if (errBox) { errBox.textContent = `Error verificando: ${err.message}`; errBox.style.display = 'block'; }
            }
        });

        document.getElementById('btn-auth-resend-verify')?.addEventListener('click', async () => {
            const errBox = document.getElementById('auth-verify-error');
            const okBox = document.getElementById('auth-verify-success');
            const user = state.auth?.currentUser;
            if (!user) return;
            try {
                await user.sendEmailVerification();
                iniciarCooldownReenvio(60);
                if (okBox) { okBox.textContent = `✅ Reenviamos el enlace a ${user.email}.`; okBox.style.display = 'block'; }
                if (errBox) errBox.style.display = 'none';
            } catch (err) {
                if (errBox) { errBox.textContent = `Espera un momento antes de reenviar: ${err.message}`; errBox.style.display = 'block'; }
            }
        });

        document.getElementById('btn-auth-verify-logout')?.addEventListener('click', () => cerrarSesionYLimpiarBoveda(false));
        document.getElementById('btn-auth-welcome-start')?.addEventListener('click', ocultarWelcomeOverlay);
        document.getElementById('btn-auth-welcome-ver-planes')?.addEventListener('click', () => {
            ocultarWelcomeOverlay();
            abrirModalPlanes('anual');
        });

        document.getElementById('btn-auth-lock-pagar-web')?.addEventListener('click', () => abrirModalPlanes('anual'));
        document.getElementById('btn-auth-revalidar-sub')?.addEventListener('click', () => {
            if (!state.uid) { alert('En Modo Local esto es solo una vista previa.'); return; }
            refrescarSuscripcionManual(false);
        });
        document.getElementById('btn-auth-lock-logout')?.addEventListener('click', () => cerrarSesionYLimpiarBoveda(false));
        document.getElementById('btn-auth-cerrar-sim-login')?.addEventListener('click', ocultarLoginOverlay);
        document.getElementById('btn-auth-cerrar-sim-lock')?.addEventListener('click', ocultarLockOverlay);

        document.getElementById('btn-auth-plans-close')?.addEventListener('click', cerrarModalPlanes);
        document.getElementById('cat-auth-plans-overlay')?.addEventListener('click', (e) => {
            if (e.target.id === 'cat-auth-plans-overlay') cerrarModalPlanes();
        });
        document.querySelectorAll('#auth-plan-select-grid .auth-plan-option').forEach(btn => {
            btn.addEventListener('click', () => {
                state.planSeleccionado = btn.getAttribute('data-plan-choice') || 'anual';
                actualizarBotonesModalPlanes();
            });
        });
        document.getElementById('btn-auth-pay-mp')?.addEventListener('click', () => iniciarCheckoutWeb('mercadopago'));
        document.getElementById('btn-auth-pay-paddle')?.addEventListener('click', () => iniciarCheckoutWeb('paddle'));
        document.getElementById('btn-auth-plans-verify')?.addEventListener('click', () => refrescarSuscripcionManual(true));
    }

    /* --- 6. TARJETA DE CUENTA Y SUSCRIPCIÓN DENTRO DE AJUSTES -> NUBE --- */
    function inyectarPanelCuentaEnAjustesNube() {
        const anchor = document.getElementById('cfg-stage3-nube-anchor');
        if (!anchor) return;

        let card = document.getElementById('cfg-card-cuenta-licencia');
        if (!card) {
            card = document.createElement('article');
            card.className = 'cfg-card';
            card.id = 'cfg-card-cuenta-licencia';
            const col = anchor.querySelector('.cfg-col') || anchor;
            col.prepend(card);
        }

        const sub = state.subscripcion;
        let badgeCls = 'st-local';
        let badgeTxt = 'Modo Desarrollo Local';
        let detalle = 'Aún no pegaste tus credenciales en app/js/firebase-config.js. Puedes probar las pantallas de Login y Bloqueo desde aquí.';

        if (state.firebaseListo && state.user) {
            if (sub?.activa) {
                badgeCls = sub.diasRestantes <= 5 ? 'st-warn' : (esPlanTrial(sub.plan) ? 'st-trial' : 'st-active');
                badgeTxt = `${sub.planLabel} • ${sub.diasRestantes} día(s) restantes`;
            } else {
                badgeCls = 'st-warn';
                badgeTxt = 'Plan vencido';
            }
            detalle = `Sesión iniciada como ${state.user.email || state.uid} (UID compartido con App Android).`;
        } else if (state.firebaseListo && !state.user) {
            badgeCls = 'st-warn';
            badgeTxt = 'Sin iniciar sesión';
            detalle = 'Firebase conectado. Inicia sesión con tu cuenta de Cat-Alogo.';
        }

        const txtUpgrade = (sub?.activa && !esPlanTrial(sub.plan)) ? '⭐ Cambiar / Renovar Plan' : '⭐ Mejorar Plan';

        card.innerHTML = `
            <div class="cfg-card-head">
                <div>
                    <h3>🔐 Cuenta Unificada &amp; Suscripción (Web ↔ Google Play)</h3>
                    <p>Misma cuenta de Firebase Auth y control simultáneo de planes (14 días / 30 días / 365 días).</p>
                </div>
                <span class="auth-status-pill ${badgeCls}">${badgeTxt}</span>
            </div>
            <div class="cfg-cloud-card-row">
                <div>
                    <strong>${state.user ? (state.user.email || 'Usuario conectado') : 'Sin sesión Firebase activa'}</strong>
                    <small style="display:block; color:#64748b; margin-top:2px;">${detalle}</small>
                </div>
                <div style="display:flex; gap:0.45rem; flex-wrap:wrap;">
                    <button type="button" class="cfg-btn cfg-btn-primary cfg-btn-sm" id="btn-cfg-auth-upgrade">${txtUpgrade}</button>
                    ${state.firebaseListo && state.user
                        ? '<button type="button" class="cfg-btn cfg-btn-light cfg-btn-sm" id="btn-cfg-auth-logout">🚪 Cerrar Sesión</button>'
                        : '<button type="button" class="cfg-btn cfg-btn-indigo cfg-btn-sm" id="btn-cfg-auth-sim-login">🔑 Probar Pantalla Login</button>'
                    }
                    <button type="button" class="cfg-btn cfg-btn-light cfg-btn-sm" id="btn-cfg-auth-sim-lock">
                        🔒 Probar Cartel Bloqueo
                    </button>
                </div>
            </div>
        `;

        card.querySelector('#btn-cfg-auth-upgrade')?.addEventListener('click', () => abrirModalPlanes('anual'));
        card.querySelector('#btn-cfg-auth-logout')?.addEventListener('click', () => cerrarSesionYLimpiarBoveda(true));
        card.querySelector('#btn-cfg-auth-sim-login')?.addEventListener('click', () => mostrarLoginOverlay(state.modoLocalSinFirebase));
        card.querySelector('#btn-cfg-auth-sim-lock')?.addEventListener('click', () => {
            mostrarLockOverlay({
                plan: 'trial_14',
                expiresAtMs: Date.now() - 3600000
            }, true);
        });
    }

    /* --- 7. INTERCEPTAR BOTÓN "CERRAR SESIÓN" DEL MENÚ LATERAL (#btn-logout) --- */
    function enlazarBotonLogoutSidebar() {
        document.addEventListener('click', (e) => {
            const btnSidebarLogout = e.target.closest('#btn-logout, .logout-btn');
            if (!btnSidebarLogout) return;
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
            cerrarSesionYLimpiarBoveda(true);
        }, true);
    }

    /* --- 8. ARRANQUE DEL MOTOR AUTH + GUARDIÁN --- */
    function inicializarAuthGuard() {
        asegurarOverlaysEnDom();
        enlazarBotonLogoutSidebar();

        const fbConfig = obtenerConfigFirebaseActiva();
        if (!fbConfig || typeof firebase === 'undefined') {
            state.firebaseListo = false;
            state.modoLocalSinFirebase = true;
            document.body.classList.add('cat-auth-unlocked');
            console.info('ℹ️ AuthGuard en Modo Local: configura app/js/firebase-config.js para activar Login y Bloqueo en vivo.');
            window.dispatchEvent(new CustomEvent('cat-alogo:auth-cambiado', { detail: { user: null } }));
            return;
        }

        try {
            state.app = firebase.apps.length ? firebase.app() : firebase.initializeApp(fbConfig);
            state.auth = firebase.auth();
            state.db = firebase.firestore();
            state.storage = typeof firebase.storage === 'function' ? firebase.storage() : null;
            state.firebaseListo = true;
            state.modoLocalSinFirebase = false;

            const exigir = window.CAT_ALOGO_CLOUD_CONFIG?.exigirLoginConFirebase !== false;

            state.auth.onAuthStateChanged(async (user) => {
                if (state.cerrandoSesion) return;

                state.user = user || null;
                state.uid = user?.uid || null;

                if (!user) {
                    if (state.unsubBilling) { state.unsubBilling(); state.unsubBilling = null; }
                    state.subscripcion = null;
                    document.body.classList.toggle('cat-auth-unlocked', !exigir);
                    ocultarLockOverlay();
                    ocultarVerifyOverlay();
                    ocultarWelcomeOverlay();
                    cerrarModalPlanes();
                    actualizarBannerVencimiento(null);
                    if (exigir) mostrarLoginOverlay(false);
                    inyectarPanelCuentaEnAjustesNube();
                    window.dispatchEvent(new CustomEvent('cat-alogo:auth-cambiado', { detail: { user: null } }));
                    return;
                }

                if (!user.emailVerified) {
                    state.subscripcion = null;
                    document.body.classList.remove('cat-auth-unlocked');
                    ocultarLoginOverlay();
                    ocultarLockOverlay();
                    mostrarVerifyOverlay(user.email);
                    window.dispatchEvent(new CustomEvent('cat-alogo:auth-cambiado', { detail: { user, uid: user.uid } }));
                    return;
                }

                await completarIngresoVerificado(user);
            });

            setInterval(() => {
                if (state.subscripcion && state.user) {
                    aplicarEstadoSuscripcion(evaluarEstadoSuscripcion(state.subscripcion.raw));
                }
            }, 300000);
        } catch (err) {
            console.error('Error inicializando Firebase AuthGuard:', err);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        inicializarAuthGuard();

        if (typeof window.renderizarEtapa3NubeCfg === 'function' && !window.renderizarEtapa3NubeCfg._conAuth) {
            const _nubeOrig = window.renderizarEtapa3NubeCfg;
            window.renderizarEtapa3NubeCfg = function (...args) {
                const res = _nubeOrig.apply(this, args);
                inyectarPanelCuentaEnAjustesNube();
                return res;
            };
            window.renderizarEtapa3NubeCfg._conAuth = true;
        }
    });

    window.CatAlogoAuth = Object.freeze({
        getState: () => ({ ...state }),
        getDb: () => state.db,
        getAuth: () => state.auth,
        getStorage: () => state.storage,
        getUid: () => state.uid,
        estaSuscripcionActiva: () => state.modoLocalSinFirebase || !!state.subscripcion?.activa,
        esPlanPago: () => {
            if (state.modoLocalSinFirebase) return true;
            return !!state.subscripcion?.activa && !esPlanTrial(state.subscripcion?.plan);
        },
        cerrarSesion: () => cerrarSesionYLimpiarBoveda(true),
        abrirModalPlanes: (plan = 'anual') => abrirModalPlanes(plan),
        refrescarSuscripcion: () => refrescarSuscripcionManual(false),
        abrirLoginPreview: () => mostrarLoginOverlay(state.modoLocalSinFirebase),
        abrirBloqueoPreview: () => mostrarLockOverlay({ plan: 'trial_14', expiresAtMs: Date.now() - 3600000 }, true)
    });
})();

