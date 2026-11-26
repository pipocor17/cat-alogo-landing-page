/* ==========================================================================
   MOTOR CENTRAL DE ALERTAS EN SIDEBAR, TOASTS Y TÍTULO DE PESTAÑA
   Módulos monitoreados:
   - Cat-Web: punto rojo latiendo + contador + toast + sonido + título pestaña
   - Clientes: badge ámbar estático (o rojo estático si hay cupo excedido)
   - Control de Stock: badge discreto con stock crítico y pedidos en tránsito
   ========================================================================== */
(function () {
    if (window._catSidebarBadgesInit) return;
    window._catSidebarBadgesInit = true;

    const KEYS_OBSERVADAS = new Set([
        'cat_alogo_web_pedidos_v1',
        'cat_alogo_clientes_v1',
        'cat_alogo_productos_v1',
        'cat_alogo_pedidos_v1'
    ]);

    const TITULO_BASE = document.title || 'Cat-Alogo | Panel de Control';
    const pedidosConocidos = new Set();
    let hidratacionLista = false;
    let timerDebounce = null;
    let ultimoBeepMs = 0;

    /* --- 1. ESTILOS INYECTADOS (BADGES, PULSO ROJO Y TOAST FLOTANTE) --- */
    function inyectarEstilosAlertas() {
        if (document.getElementById('cat-sidebar-badges-styles')) return;
        const st = document.createElement('style');
        st.id = 'cat-sidebar-badges-styles';
        st.textContent = `
            .nav-link {
                position: relative;
            }
            .cat-sb-badge {
                margin-left: auto;
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 2px 7px;
                border-radius: 999px;
                font-size: 0.7rem;
                font-weight: 800;
                line-height: 1.25;
                letter-spacing: 0.01em;
                white-space: nowrap;
                flex-shrink: 0;
                transition: transform 0.15s ease, opacity 0.15s ease;
            }
            .cat-sb-badge.is-hidden {
                display: none !important;
            }

            /* Urgencia Alta (Cat-Web): Rojo con punto que late */
            .cat-sb-badge.is-pulse-red {
                background: #ef4444;
                color: #ffffff;
                box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.22), 0 2px 8px rgba(239, 68, 68, 0.45);
            }
            .cat-sb-dot {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: #ffffff;
                position: relative;
                display: inline-block;
            }
            .cat-sb-dot::after {
                content: '';
                position: absolute;
                inset: -3px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.75);
                animation: catSbPulse 1.5s cubic-bezier(0.24, 0, 0.38, 1) infinite;
            }
            @keyframes catSbPulse {
                0%   { transform: scale(0.75); opacity: 0.95; }
                70%  { transform: scale(2.15); opacity: 0; }
                100% { transform: scale(2.15); opacity: 0; }
            }

            /* Urgencia Media (Clientes con deuda): Ámbar estático */
            .cat-sb-badge.is-amber {
                background: rgba(245, 158, 11, 0.18);
                color: #fbbf24;
                border: 1px solid rgba(251, 191, 36, 0.42);
            }
            .nav-item.active .cat-sb-badge.is-amber {
                background: #f59e0b;
                color: #ffffff;
                border-color: rgba(255, 255, 255, 0.35);
            }

            /* Urgencia Media-Alta (Clientes con cupo excedido): Rojo estático sin latido */
            .cat-sb-badge.is-red-static {
                background: rgba(239, 68, 68, 0.22);
                color: #fca5a5;
                border: 1px solid rgba(248, 113, 113, 0.5);
            }
            .nav-item.active .cat-sb-badge.is-red-static {
                background: #dc2626;
                color: #ffffff;
                border-color: rgba(255, 255, 255, 0.35);
            }

            /* Urgencia Baja / Informativa (Control de Stock): Discreto */
            .cat-sb-badge.is-slate {
                background: rgba(148, 163, 184, 0.2);
                color: #cbd5e1;
                border: 1px solid rgba(148, 163, 184, 0.32);
            }
            .nav-item.active .cat-sb-badge.is-slate {
                background: rgba(255, 255, 255, 0.22);
                color: #ffffff;
                border-color: rgba(255, 255, 255, 0.35);
            }

            /* Toast flotante para pedidos nuevos de Cat-Web */
            #cat-web-toast-stack {
                position: fixed;
                top: 72px;
                right: 20px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-width: 350px;
                width: calc(100vw - 32px);
                pointer-events: none;
            }
            .cat-web-toast {
                pointer-events: auto;
                background: #0f172a;
                color: #f8fafc;
                border: 1px solid rgba(239, 68, 68, 0.55);
                border-left: 4px solid #ef4444;
                border-radius: 12px;
                padding: 12px 14px;
                box-shadow: 0 12px 28px rgba(15, 23, 42, 0.32);
                display: flex;
                flex-direction: column;
                gap: 8px;
                font-family: 'Inter', sans-serif;
                animation: catToastIn 0.26s ease-out;
            }
            @keyframes catToastIn {
                from { opacity: 0; transform: translateX(24px); }
                to   { opacity: 1; transform: translateX(0); }
            }
            .cat-web-toast-top {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
            }
            .cat-web-toast-title {
                display: flex;
                align-items: center;
                gap: 7px;
                font-size: 0.84rem;
                font-weight: 800;
                color: #ffffff;
            }
            .cat-web-toast-close {
                background: transparent;
                border: none;
                color: #94a3b8;
                font-size: 0.9rem;
                cursor: pointer;
                padding: 2px 5px;
                border-radius: 6px;
            }
            .cat-web-toast-close:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #ffffff;
            }
            .cat-web-toast-body {
                font-size: 0.78rem;
                color: #cbd5e1;
                line-height: 1.35;
            }
            .cat-web-toast-body strong {
                color: #34d399;
            }
            .cat-web-toast-actions {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
            }
            .cat-web-toast-btn {
                background: #ef4444;
                color: #ffffff;
                border: none;
                border-radius: 8px;
                padding: 6px 12px;
                font-size: 0.75rem;
                font-weight: 700;
                cursor: pointer;
                font-family: inherit;
                transition: background 0.15s ease;
            }
            .cat-web-toast-btn:hover {
                background: #dc2626;
            }
        `;
        document.head.appendChild(st);
    }

    /* --- 2. HELPERS --- */
    function leerArrayLocal(key) {
        try {
            const arr = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch {
            return [];
        }
    }

    function formatearArs(valor) {
        const n = Number(valor) || 0;
        return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    }

    function escapar(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function obtenerOBuscarBadge(vista) {
        const link = document.querySelector(`.nav-link[data-vista="${vista}"]`);
        if (!link) return { link: null, badge: null };

        let badge = link.querySelector('.cat-sb-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'cat-sb-badge is-hidden';
            link.appendChild(badge);
        }
        return { link, badge };
    }

    function reproducirAlertaSonoraSiCorresponde() {
        if (window.cwState && window.cwState.sonidoActivo === false) return;
        // Evitar doble sonido si el usuario ya está parado en Cat-Web
        if (document.getElementById('catweb-module-root')) return;
        const ahora = Date.now();
        if (ahora - ultimoBeepMs < 1500) return;
        ultimoBeepMs = ahora;

        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.setValueAtTime(1174, ctx.currentTime + 0.11);
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.34);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.36);
        } catch { /* navegador bloqueó audio sin interacción previa */ }
    }

    /* --- 3. TOAST FLOTANTE PARA NUEVO PEDIDO CAT-WEB --- */
    function mostrarToastPedidoWeb(pedido) {
        let stack = document.getElementById('cat-web-toast-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'cat-web-toast-stack';
            document.body.appendChild(stack);
        }

        const toast = document.createElement('div');
        toast.className = 'cat-web-toast';
        const modalidadTxt = pedido.modalidad === 'envio' ? '🛵 Envío a domicilio' : '🏪 Retiro en local';
        const codigo = pedido.codigo || `#${String(pedido.id || '').slice(-4).toUpperCase()}`;

        toast.innerHTML = `
            <div class="cat-web-toast-top">
                <div class="cat-web-toast-title">
                    <span class="cat-sb-dot" style="background:#ef4444;"></span>
                    <span>Nuevo pedido Cat-Web ${escapar(codigo)}</span>
                </div>
                <button type="button" class="cat-web-toast-close" title="Cerrar">✕</button>
            </div>
            <div class="cat-web-toast-body">
                <div>${escapar(pedido.clienteNombre || 'Cliente Web')} • <strong>${formatearArs(pedido.total)}</strong></div>
                <div style="font-size:0.72rem; color:#94a3b8; margin-top:2px;">${modalidadTxt}</div>
            </div>
            <div class="cat-web-toast-actions">
                <button type="button" class="cat-web-toast-btn">Ver en Cat-Web →</button>
            </div>
        `;

        const cerrar = () => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        };

        toast.querySelector('.cat-web-toast-close')?.addEventListener('click', cerrar);
        toast.querySelector('.cat-web-toast-btn')?.addEventListener('click', () => {
            cerrar();
            document.querySelector('.nav-link[data-vista="cat-web"]')?.click();
        });

        stack.appendChild(toast);
        setTimeout(cerrar, 8000);
    }

    /* --- 4. ACTUALIZADORES POR MÓDULO --- */
    function actualizarAlertaCatWeb(evaluarNuevos = false) {
        const pedidos = leerArrayLocal('cat_alogo_web_pedidos_v1');
        const pendientes = pedidos.filter(p => p && (p.estado === 'nuevo' || p.estado === 'preparando'));
        const montoPend = pendientes.reduce((acc, p) => acc + (Number(p.total) || 0), 0);

        // Detectar pedidos recién llegados para toast + sonido
        if (evaluarNuevos && hidratacionLista) {
            const recienLlegados = pendientes.filter(p => p.id && !pedidosConocidos.has(String(p.id)));
            if (recienLlegados.length > 0) {
                reproducirAlertaSonoraSiCorresponde();
                // Mostrar toast si el usuario no está viendo Cat-Web
                if (!document.getElementById('catweb-module-root')) {
                    recienLlegados.slice(0, 2).forEach(mostrarToastPedidoWeb);
                }
            }
        }

        // Registrar todos los IDs actuales como conocidos
        pedidos.forEach(p => {
            if (p?.id) pedidosConocidos.add(String(p.id));
        });

        // Badge en Sidebar
        const { link, badge } = obtenerOBuscarBadge('cat-web');
        if (badge && link) {
            if (pendientes.length > 0) {
                badge.className = 'cat-sb-badge is-pulse-red';
                badge.innerHTML = `<span class="cat-sb-dot"></span><span>${pendientes.length > 99 ? '99+' : pendientes.length}</span>`;
                const txt = `${pendientes.length} ${pendientes.length === 1 ? 'pedido web pendiente' : 'pedidos web pendientes'} (${formatearArs(montoPend)})`;
                badge.title = txt;
                link.title = txt;
            } else {
                badge.className = 'cat-sb-badge is-hidden';
                badge.textContent = '';
                link.removeAttribute('title');
            }
        }

        // Título de la pestaña del navegador
        if (pendientes.length > 0) {
            const label = pendientes.length === 1 ? 'Pedido Web' : 'Pedidos Web';
            document.title = `(${pendientes.length}) 🔴 ${label} | Cat-Alogo`;
        } else if (document.title !== TITULO_BASE) {
            document.title = TITULO_BASE;
        }
    }

    function actualizarAlertaClientes() {
        const clientes = leerArrayLocal('cat_alogo_clientes_v1');
        let cantDeudores = 0;
        let cantExcedidos = 0;
        let totalDeuda = 0;

        clientes.forEach(c => {
            if (!c || c._deleted) return;
            const saldo = Math.max(0, Number(c.saldoActual) || 0);
            const cupo = Math.max(0, Number(c.cupoMaximo) || 0);
            if (saldo > 0) {
                cantDeudores++;
                totalDeuda += saldo;
                if ((cupo > 0 && saldo > cupo) || c.bloqueadoPos) {
                    cantExcedidos++;
                }
            }
        });

        const { link, badge } = obtenerOBuscarBadge('clientes');
        if (!badge || !link) return;

        if (cantDeudores > 0) {
            badge.className = `cat-sb-badge ${cantExcedidos > 0 ? 'is-red-static' : 'is-amber'}`;
            badge.textContent = cantDeudores > 99 ? '99+' : String(cantDeudores);
            const extraExc = cantExcedidos > 0
                ? ` • ${cantExcedidos} ${cantExcedidos === 1 ? 'con cupo excedido' : 'con cupo excedido'}`
                : '';
            const tip = `${cantDeudores} ${cantDeudores === 1 ? 'cliente con deuda' : 'clientes con deuda'} (${formatearArs(totalDeuda)})${extraExc}`;
            badge.title = tip;
            link.title = tip;
        } else {
            badge.className = 'cat-sb-badge is-hidden';
            badge.textContent = '';
            link.removeAttribute('title');
        }
    }

    function actualizarAlertaControlStock() {
        const productos = leerArrayLocal('cat_alogo_productos_v1');
        const pedidosProv = leerArrayLocal('cat_alogo_pedidos_v1');

        let sinStock = 0;
        let stockBajo = 0;

        productos.forEach(p => {
            if (!p || p._deleted) return;
            const stock = Number(p.stock) || 0;
            const min = Number(p.stockMinimo ?? p.umbralCritico ?? 5);
            if (stock <= 0) sinStock++;
            else if (stock <= min) stockBajo++;
        });

        const enTransito = pedidosProv.filter(p => {
            if (!p || p._deleted) return false;
            const est = String(p.estado || '').toLowerCase();
            return est === 'en_espera' || est === 'pendiente';
        }).length;

        const criticos = sinStock + stockBajo;
        const { link, badge } = obtenerOBuscarBadge('control-stock');
        if (!badge || !link) return;

        if (criticos > 0 || enTransito > 0) {
            const numeroMostrar = criticos > 0 ? criticos : enTransito;
            badge.className = `cat-sb-badge ${sinStock > 0 ? 'is-amber' : 'is-slate'}`;
            badge.textContent = numeroMostrar > 99 ? '99+' : String(numeroMostrar);

            const partes = [];
            if (criticos > 0) {
                partes.push(`${criticos} en stock crítico${sinStock > 0 ? ` (${sinStock} sin stock)` : ''}`);
            }
            if (enTransito > 0) {
                partes.push(`${enTransito} ${enTransito === 1 ? 'pedido a proveedor en tránsito' : 'pedidos a proveedores en tránsito'}`);
            }
            const tip = partes.join(' • ');
            badge.title = tip;
            link.title = tip;
        } else {
            badge.className = 'cat-sb-badge is-hidden';
            badge.textContent = '';
            link.removeAttribute('title');
        }
    }

    function actualizarTodosLosBadges(evaluarNuevosWeb = false) {
        inyectarEstilosAlertas();
        actualizarAlertaCatWeb(evaluarNuevosWeb);
        actualizarAlertaClientes();
        actualizarAlertaControlStock();
    }

    function programarActualizacion(evaluarNuevosWeb = false) {
        if (timerDebounce) clearTimeout(timerDebounce);
        timerDebounce = setTimeout(() => {
            timerDebounce = null;
            actualizarTodosLosBadges(evaluarNuevosWeb);
        }, 60);
    }

    /* --- 5. INTERCEPTOR REACTIVO DE LOCALSTORAGE + EVENTOS --- */
    const _origSetItemBadges = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
        const res = _origSetItemBadges.call(this, key, value);
        if (this === window.localStorage && typeof key === 'string' && KEYS_OBSERVADAS.has(key)) {
            programarActualizacion(key === 'cat_alogo_web_pedidos_v1');
        }
        return res;
    };

    function marcarHidratacionInicial() {
        actualizarTodosLosBadges(false);
        setTimeout(() => {
            actualizarTodosLosBadges(false);
            hidratacionLista = true;
        }, 2500);
    }

    document.addEventListener('DOMContentLoaded', () => {
        marcarHidratacionInicial();
        // Respaldo suave cada 5 segundos
        setInterval(() => actualizarTodosLosBadges(true), 5000);
    });

    window.addEventListener('cat-alogo:boveda-idb-lista', () => {
        hidratacionLista = false;
        marcarHidratacionInicial();
    });
    window.addEventListener('cat-alogo:auth-cambiado', () => programarActualizacion(false));
    window.addEventListener('storage', (e) => {
        if (KEYS_OBSERVADAS.has(e.key)) {
            programarActualizacion(e.key === 'cat_alogo_web_pedidos_v1');
        }
    });

    window.CatAlogoAlertasSidebar = {
        actualizar: () => actualizarTodosLosBadges(false)
    };
})();

