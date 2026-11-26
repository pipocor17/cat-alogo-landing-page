/* ==========================================================================
   MÓDULO: CAT-WEB • VIDRIERA ONLINE, PERSONALIZACIÓN Y VISTA PREVIA (ETAPA 1)
   ========================================================================== */

const STORAGE_KEY_CW_CONFIG = 'cat_alogo_web_config_v1';
const STORAGE_KEY_CW_PEDIDOS = 'cat_alogo_web_pedidos_v1';
const CW_PC_DEVICE_KEY = 'cat_alogo_pc_device_id_v1';

const CW_ICONOS_RAPIDOS = ['🍔', '👗', '🔧', '🐾', '💻', '☕', '🛒', '🍓', '💈', '📱', '🏋️', '🪴', '🎸', '🧸', '🏪'];

const CW_PLACEHOLDER_SVG =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160">' +
        '<rect width="200" height="160" fill="#f1f5f9"/>' +
        '<g fill="none" stroke="#94a3b8" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="52" y="34" width="96" height="78" rx="10"/>' +
        '<circle cx="80" cy="62" r="8"/>' +
        '<path d="M148 92l-26-26-50 46"/>' +
        '</g></svg>'
    );

window.cwState = {
    previewCat: 'todos',
    previewSearch: '',
    previewDevice: 'mobile',
    previewCart: [],
    draftBanner: '',
    draftLogo: '',
    draftIcono: '🏪',
    draftEnvioTipo: 'fijo'
};

function obtenerPcDeviceIdCw() {
    let id = localStorage.getItem(CW_PC_DEVICE_KEY);
    if (!id) {
        id = 'pc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
        localStorage.setItem(CW_PC_DEVICE_KEY, id);
    }
    return id;
}

function obtenerAuthContextoCw() {
    const authState = window.CatAlogoAuth?.getState?.();
    const db = window.CatAlogoAuth?.getDb?.() || null;
    const storage = window.CatAlogoAuth?.getStorage?.() || null;
    const uid = authState?.uid || null;
    return { db, storage, uid };
}

function obtenerConfigCatWeb() {
    let nombreDef = 'Mi Comercio';
    try {
        const pdfCfg = JSON.parse(localStorage.getItem('cat_alogo_pdf_config_v1') || 'null');
        if (pdfCfg?.headerNombre) nombreDef = pdfCfg.headerNombre;
    } catch { /* fallback */ }

    const defaults = {
        baseUrl: 'https://catalogo-web-chi.vercel.app',
        slug: nombreDef.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '') || 'mitienda',
        nombre: nombreDef,
        descripcion: 'Días y Horario de atención: Lunes a sábado 9 a 20 hs.',
        whatsapp: '+5493510000000',
        colorPrimario: '#059669',
        bannerImg: '',
        logoImg: '',
        iconoRapido: '🏪',
        envioTipo: 'fijo', // 'gratis' | 'fijo' | 'porcentaje'
        envioValor: 0,
        ocultarSinStock: true,
        gruposMenu: [],
        ultimaSync: null
    };

    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_CW_CONFIG) || 'null');
        return raw ? { ...defaults, ...raw } : defaults;
    } catch {
        return defaults;
    }
}

function guardarConfigCatWeb(cfg) {
    localStorage.setItem(STORAGE_KEY_CW_CONFIG, JSON.stringify(cfg));
}

function obtenerUrlPublicaCatWeb(cfgOpt) {
    const cfg = cfgOpt || obtenerConfigCatWeb();
    const base = String(cfg.baseUrl || 'https://catalogo-web-chi.vercel.app').replace(/\/+$/, '');
    const slug = String(cfg.slug || 'mitienda').replace(/^\/+/, '');
    return `${base}/${slug}`;
}

function obtenerProductosCatWeb() {
    try {
        const arr = JSON.parse(localStorage.getItem('cat_alogo_productos_v1') || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function guardarProductosCatWeb(lista) {
    window.bovedaProductos = lista;
    localStorage.setItem('cat_alogo_productos_v1', JSON.stringify(lista));
}

function obtenerPedidosCatWeb() {
    try {
        const arr = JSON.parse(localStorage.getItem(STORAGE_KEY_CW_PEDIDOS) || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function escaparHtmlCw(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatearArsCw(v) {
    const n = Number(v) || 0;
    return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function esProductoVisibleWebCw(prod, cfg) {
    const vis = prod.publicarWeb !== undefined ? !!prod.publicarWeb : prod.visible !== false;
    if (!vis) return false;
    if (cfg.ocultarSinStock && (Number(prod.stock) || 0) <= 0) return false;
    return true;
}

/* ==========================================================================
   INICIALIZACIÓN Y RENDER PRINCIPAL
   ========================================================================== */
function inicializarCatWeb() {
    if (!document.getElementById('catweb-module-root')) return;

    enlazarEventosCatWeb();
    renderizarTodoCatWeb();
}

function renderizarTodoCatWeb() {
    const cfg = obtenerConfigCatWeb();
    const productos = obtenerProductosCatWeb();
    const pedidos = obtenerPedidosCatWeb();
    const visibles = productos.filter(p => esProductoVisibleWebCw(p, cfg));

    const urlPublica = obtenerUrlPublicaCatWeb(cfg);
    const elUrl = document.getElementById('cw-public-url-display');
    if (elUrl) {
        elUrl.textContent = urlPublica;
        elUrl.title = urlPublica;
    }

    const elSync = document.getElementById('cw-last-sync-lbl');
    if (elSync) {
        elSync.textContent = cfg.ultimaSync
            ? `Última sincronización: ${new Date(cfg.ultimaSync).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
            : 'Última sincronización: Pendiente de publicar';
    }

    const hoyStr = new Date().toISOString().slice(0, 10);
    const pedidosHoy = pedidos.filter(p => String(p.fecha || '').slice(0, 10) === hoyStr && p.estado !== 'cancelado');
    const montoHoy = pedidosHoy.reduce((a, p) => a + (Number(p.total) || 0), 0);
    const pendientes = pedidos.filter(p => p.estado === 'nuevo' || p.estado === 'preparando');
    const montoPend = pendientes.reduce((a, p) => a + (Number(p.total) || 0), 0);

    const setTxt = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    setTxt('cw-kpi-hoy', `${pedidosHoy.length} ${pedidosHoy.length === 1 ? 'Pedido' : 'Pedidos'}`);
    setTxt('cw-kpi-hoy-sub', `${formatearArsCw(montoHoy)} en ventas online hoy`);
    setTxt('cw-kpi-pendientes', `${pendientes.length} ${pendientes.length === 1 ? 'Pendiente' : 'Pendientes'}`);
    setTxt('cw-kpi-pendientes-sub', pendientes.length > 0 ? `${formatearArsCw(montoPend)} por procesar` : 'Sin pedidos pendientes de procesar');
    setTxt('cw-kpi-visibles', `${visibles.length} Visibles`);
    setTxt('cw-kpi-visibles-sub', `de ${productos.length} productos en Bóveda Local`);
    setTxt('cw-q-vis-sub', `${visibles.length} de ${productos.length} productos online`);

    renderizarCategoriasToggleCw(productos);
    renderizarResumenMarcaBlancaCw(cfg);
    renderizarVistaPreviaTiendaCw(cfg, visibles);
}

function renderizarCategoriasToggleCw(productos) {
    const cont = document.getElementById('cw-cats-toggle-list');
    const pill = document.getElementById('cw-cats-count-pill');
    if (!cont) return;

    const mapa = {};
    productos.forEach(p => {
        const cat = (p.categoria || 'General').trim() || 'General';
        if (!mapa[cat]) mapa[cat] = { total: 0, visibles: 0 };
        mapa[cat].total++;
        const vis = p.publicarWeb !== undefined ? !!p.publicarWeb : p.visible !== false;
        if (vis) mapa[cat].visibles++;
    });

    const nombres = Object.keys(mapa).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    if (pill) pill.textContent = `${nombres.length} ${nombres.length === 1 ? 'categoría' : 'categorías'}`;

    if (nombres.length === 0) {
        cont.innerHTML = `<div style="text-align:center; padding:1.2rem; color:#64748b; font-size:0.78rem;">Carga productos en Inventario para gestionar su publicación por categoría.</div>`;
        return;
    }

    cont.innerHTML = nombres.map(cat => {
        const info = mapa[cat];
        const activa = info.visibles > 0;
        return `
            <div class="cw-cat-row">
                <div>
                    <strong>${escaparHtmlCw(cat)}</strong>
                    <small>${info.visibles} de ${info.total} productos visibles online</small>
                </div>
                <label class="cw-toggle" title="Activar o pausar toda la categoría en la web">
                    <input type="checkbox" class="cw-cat-switch" data-cat-name="${escaparHtmlCw(cat)}" ${activa ? 'checked' : ''}>
                    <span class="cw-toggle-slider"></span>
                </label>
            </div>
        `;
    }).join('');
}

function renderizarResumenMarcaBlancaCw(cfg) {
    const cont = document.getElementById('cw-brand-summary');
    if (!cont) return;

    const envioTxt = cfg.envioTipo === 'gratis'
        ? 'Envío Gratis'
        : (cfg.envioTipo === 'porcentaje' ? `${cfg.envioValor}% del pedido` : `Monto fijo ${formatearArsCw(cfg.envioValor)}`);

    let mediosChips = '<span class="cw-chip-mini">Efectivo</span><span class="cw-chip-mini">Transferencia</span>';
    if (window.MediosPagoEngine) {
        const hab = window.MediosPagoEngine.obtenerMediosHabilitados();
        if (hab.length > 0) {
            mediosChips = hab.map(m => {
                let extra = '';
                if (m.modo === 'descuento' && m.porcentaje > 0) extra = ` (-${m.porcentaje}%)`;
                if (m.modo === 'recargo' && m.porcentaje > 0) extra = ` (+${m.porcentaje}%)`;
                return `<span class="cw-chip-mini">${escaparHtmlCw(m.nombre)}${extra}</span>`;
            }).join('');
        }
    }

    cont.innerHTML = `
        <div class="cw-brand-box">
            <small>Identidad y Color</small>
            <strong style="display:flex; align-items:center; gap:0.4rem;">
                <span style="display:inline-block; width:13px; height:13px; border-radius:50%; background:${escaparHtmlCw(cfg.colorPrimario)};"></span>
                ${escaparHtmlCw(cfg.nombre)}
            </strong>
            <div style="font-size:0.7rem; color:#64748b; margin-top:3px;">WhatsApp: ${escaparHtmlCw(cfg.whatsapp || 'Sin configurar')}</div>
        </div>
        <div class="cw-brand-box">
            <small>Logística y Stock</small>
            <strong>${escaparHtmlCw(envioTxt)}</strong>
            <div style="font-size:0.7rem; color:#64748b; margin-top:3px;">${cfg.ocultarSinStock ? '✅ Oculta stock 0 automáticamente' : 'Muestra productos aunque tengan stock 0'}</div>
        </div>
        <div class="cw-brand-box" style="grid-column: 1 / -1;">
            <small>Medios de Pago Habilitados en Cat-Web (desde Bóveda Central)</small>
            <div class="cw-chip-list">${mediosChips}</div>
        </div>
    `;
}

/* ==========================================================================
   VISTA PREVIA INTERACTIVA DE LA TIENDA WEB (MÓVIL / DESKTOP)
   ========================================================================== */
function renderizarVistaPreviaTiendaCw(cfg, visibles) {
    const frame = document.getElementById('cw-device-frame');
    if (!frame) return;

    frame.style.setProperty('--cw-primary', cfg.colorPrimario || '#059669');
    frame.classList.toggle('is-mobile', window.cwState.previewDevice === 'mobile');
    frame.classList.toggle('is-desktop', window.cwState.previewDevice === 'desktop');

    const banner = document.getElementById('cw-prev-banner');
    if (banner) {
        banner.style.backgroundImage = cfg.bannerImg ? `url("${cfg.bannerImg}")` : 'none';
    }

    const logoEl = document.getElementById('cw-prev-logo');
    if (logoEl) {
        logoEl.innerHTML = cfg.logoImg
            ? `<img src="${cfg.logoImg}" alt="Logo">`
            : escaparHtmlCw(cfg.iconoRapido || '🏪');
    }

    document.getElementById('cw-prev-nombre').textContent = cfg.nombre || 'Mi Tienda';
    document.getElementById('cw-prev-desc').textContent = cfg.descripcion || '';

    const badgesEl = document.getElementById('cw-prev-badges');
    if (badgesEl) {
        const list = [];
        list.push(cfg.envioTipo === 'gratis'
            ? '🛵 Envío Gratis'
            : (cfg.envioTipo === 'porcentaje' ? `🛵 Envío ${cfg.envioValor}%` : `🛵 Envío ${formatearArsCw(cfg.envioValor)}`));
        list.push('🏪 Retiro en Local Gratis');

        if (window.MediosPagoEngine) {
            const descMed = window.MediosPagoEngine.obtenerMediosHabilitados().find(m => m.modo === 'descuento' && m.porcentaje > 0);
            if (descMed) list.push(`🏷️ ${descMed.porcentaje}% OFF en ${descMed.nombre}`);
        }
        badgesEl.innerHTML = list.map(t => `<span class="cw-store-badge">${escaparHtmlCw(t)}</span>`).join('');
    }

    const cats = [...new Set(visibles.map(p => (p.categoria || 'General').trim() || 'General'))].sort();
    const catsEl = document.getElementById('cw-prev-cats');
    if (catsEl) {
        let htmlC = `<button type="button" class="cw-scat-pill ${window.cwState.previewCat === 'todos' ? 'active' : ''}" data-pcat="todos">Todos (${visibles.length})</button>`;
        cats.forEach(c => {
            htmlC += `<button type="button" class="cw-scat-pill ${window.cwState.previewCat === c ? 'active' : ''}" data-pcat="${escaparHtmlCw(c)}">${escaparHtmlCw(c)}</button>`;
        });
        catsEl.innerHTML = htmlC;
    }

    const q = (window.cwState.previewSearch || '').trim().toLowerCase();
    const filtrados = visibles.filter(p => {
        if (window.cwState.previewCat !== 'todos' && ((p.categoria || 'General').trim() || 'General') !== window.cwState.previewCat) {
            return false;
        }
        if (q && !`${p.nombre || ''} ${p.sku || ''} ${p.categoria || ''}`.toLowerCase().includes(q)) {
            return false;
        }
        return true;
    });

    const gridEl = document.getElementById('cw-prev-grid');
    if (gridEl) {
        if (filtrados.length === 0) {
            gridEl.innerHTML = `<div style="grid-column:1 / -1; text-align:center; padding:2rem 0.6rem; color:#64748b; font-size:0.76rem;">No hay productos visibles para mostrar con este filtro.</div>`;
        } else {
            gridEl.innerHTML = filtrados.slice(0, 24).map(p => {
                const fotoRaw = (p.imagenes && p.imagenes[0]) ? p.imagenes[0] : '';
                const foto = (fotoRaw && !fotoRaw.includes('producto.png')) ? fotoRaw : CW_PLACEHOLDER_SVG;
                const pNorm = Number(p.precioNormal) || 0;
                const pOfe = Number(p.precioOferta) || 0;
                const hayOferta = pOfe > 0 && pOfe < pNorm;
                const precioFinal = hayOferta ? pOfe : pNorm;

                return `
                    <article class="cw-sprod-card">
                        <div class="cw-sprod-img">
                            ${hayOferta ? '<span class="cw-sprod-offer">OFERTA</span>' : ''}
                            <img src="${foto}" alt="${escaparHtmlCw(p.nombre)}">
                        </div>
                        <div class="cw-sprod-body">
                            <span class="cw-sprod-name">${escaparHtmlCw(p.nombre)}</span>
                            <div>
                                <span class="cw-sprod-price">${formatearArsCw(precioFinal)}</span>
                                ${hayOferta ? `<span class="cw-sprod-old">${formatearArsCw(pNorm)}</span>` : ''}
                            </div>
                            <button type="button" class="cw-sprod-add" data-prev-add="${escaparHtmlCw(p.id)}" data-prev-price="${precioFinal}">+ Agregar</button>
                        </div>
                    </article>
                `;
            }).join('');
        }
    }

    actualizarBarraCarritoPreviewCw();
}

function actualizarBarraCarritoPreviewCw() {
    const bar = document.getElementById('cw-prev-cart-bar');
    const info = document.getElementById('cw-prev-cart-info');
    if (!bar || !info) return;

    const cart = window.cwState.previewCart || [];
    if (cart.length === 0) {
        bar.style.display = 'none';
        return;
    }
    const cant = cart.reduce((a, i) => a + i.cant, 0);
    const total = cart.reduce((a, i) => a + i.precio * i.cant, 0);
    info.textContent = `🛒 ${cant} ${cant === 1 ? 'ítem' : 'ítems'} • ${formatearArsCw(total)}`;
    bar.style.display = 'flex';
}

/* ==========================================================================
   MODAL PERSONALIZAR TIENDA WEB
   ========================================================================== */
function abrirModalPersonalizarCw() {
    const modal = document.getElementById('modal-cw-personalizar');
    if (!modal) return;

    const cfg = obtenerConfigCatWeb();
    window.cwState.draftBanner = cfg.bannerImg || '';
    window.cwState.draftLogo = cfg.logoImg || '';
    window.cwState.draftIcono = cfg.iconoRapido || '🏪';
    window.cwState.draftEnvioTipo = cfg.envioTipo || 'fijo';

    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
    setVal('cw-inp-base-url', cfg.baseUrl);
    setVal('cw-inp-slug', cfg.slug);
    setVal('cw-inp-color', cfg.colorPrimario);
    setVal('cw-inp-nombre', cfg.nombre);
    setVal('cw-inp-whatsapp', cfg.whatsapp);
    setVal('cw-inp-desc', cfg.descripcion);
    setVal('cw-inp-envio-val', cfg.envioValor);

    const chkStock = document.getElementById('cw-chk-ocultar-sin-stock');
    if (chkStock) chkStock.checked = !!cfg.ocultarSinStock;

    document.querySelectorAll('#cw-color-swatches .cw-swatch').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-color').toLowerCase() === String(cfg.colorPrimario).toLowerCase());
    });

    const iconsGrid = document.getElementById('cw-icons-grid');
    if (iconsGrid) {
        iconsGrid.innerHTML = CW_ICONOS_RAPIDOS.map(ico =>
            `<button type="button" class="cw-icon-opt ${!cfg.logoImg && cfg.iconoRapido === ico ? 'active' : ''}" data-cw-ico="${ico}">${ico}</button>`
        ).join('');
    }

    actualizarPreviewImagenesModalCw();
    actualizarUiEnvioModalCw();
    modal.classList.add('active');
}

function actualizarPreviewImagenesModalCw() {
    const bPrev = document.getElementById('cw-pers-banner-prev');
    if (bPrev) {
        if (window.cwState.draftBanner) {
            bPrev.style.backgroundImage = `url("${window.cwState.draftBanner}")`;
            bPrev.innerHTML = '';
        } else {
            bPrev.style.backgroundImage = 'none';
            bPrev.innerHTML = '<span>Sin portada (usa color principal)</span>';
        }
    }

    const lPrev = document.getElementById('cw-pers-logo-prev');
    if (lPrev) {
        lPrev.innerHTML = window.cwState.draftLogo
            ? `<img src="${window.cwState.draftLogo}" alt="Logo">`
            : escaparHtmlCw(window.cwState.draftIcono || '🏪');
    }
}

function actualizarUiEnvioModalCw() {
    const tipo = window.cwState.draftEnvioTipo;
    document.querySelectorAll('#cw-ship-modes .cw-ship-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-ship') === tipo);
    });
    const wrap = document.getElementById('cw-ship-val-wrap');
    const lbl = document.getElementById('cw-lbl-envio-val');
    if (wrap) wrap.style.display = tipo === 'gratis' ? 'none' : 'block';
    if (lbl) lbl.textContent = tipo === 'porcentaje' ? 'Porcentaje de envío sobre el pedido (%)' : 'Monto fijo de envío ($ ARS)';
}

async function guardarPersonalizacionCw(e) {
    e.preventDefault();
    const actual = obtenerConfigCatWeb();
    const nombreNuevo = (document.getElementById('cw-inp-nombre')?.value || 'Mi Tienda').trim();
    const slugInput = (document.getElementById('cw-inp-slug')?.value || '').trim();
    const slugFinal = slugInput
        ? slugInput.toLowerCase().replace(/[^a-z0-9-]+/g, '')
        : (actual.slug || nombreNuevo.toLowerCase().replace(/[^a-z0-9]/g, '') || 'mitienda');

    const nuevo = {
        ...actual,
        baseUrl: (document.getElementById('cw-inp-base-url')?.value || 'https://catalogo-web-chi.vercel.app').trim(),
        slug: slugFinal,
        colorPrimario: document.getElementById('cw-inp-color')?.value || '#059669',
        bannerImg: window.cwState.draftBanner,
        logoImg: window.cwState.draftLogo,
        iconoRapido: window.cwState.draftIcono,
        nombre: nombreNuevo,
        whatsapp: (document.getElementById('cw-inp-whatsapp')?.value || '').trim(),
        descripcion: (document.getElementById('cw-inp-desc')?.value || '').trim(),
        envioTipo: window.cwState.draftEnvioTipo,
        envioValor: window.cwState.draftEnvioTipo === 'gratis' ? 0 : Math.max(0, parseFloat(document.getElementById('cw-inp-envio-val')?.value) || 0),
        ocultarSinStock: !!document.getElementById('cw-chk-ocultar-sin-stock')?.checked
    };

    const btnSubmit = document.querySelector('#form-cw-personalizar button[type="submit"]');
    const txtOrig = btnSubmit ? btnSubmit.textContent : '';
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = '⏳ Guardando y sincronizando...';
    }

    try {
        guardarConfigCatWeb(nuevo);
        const synced = await publicarPersonalizacionEnVendorsCw(nuevo);
        if (synced) {
            nuevo.ultimaSync = new Date().toISOString();
            guardarConfigCatWeb(nuevo);
        }
        document.getElementById('modal-cw-personalizar')?.classList.remove('active');
        renderizarTodoCatWeb();
    } catch (err) {
        console.error('Error sincronizando personalización web:', err);
        alert(`⚠️ Se guardó en tu PC, pero falló la subida a la nube: ${err.message || err}`);
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.textContent = txtOrig;
        }
    }
}

/* ==========================================================================
   MODAL CÓDIGO QR
   ========================================================================== */
function abrirModalQrCatWeb() {
    const modal = document.getElementById('modal-cw-qr');
    if (!modal) return;
    const cfg = obtenerConfigCatWeb();
    const url = obtenerUrlPublicaCatWeb(cfg);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data=${encodeURIComponent(url)}`;

    document.getElementById('cw-qr-store-name').textContent = cfg.nombre;
    document.getElementById('cw-qr-url-lbl').textContent = url;
    const img = document.getElementById('cw-qr-img');
    if (img) img.src = qrUrl;

    modal.classList.add('active');
}

/* ==========================================================================
   EVENTOS DEL MÓDULO CAT-WEB
   ========================================================================== */
function enlazarEventosCatWeb() {
    const root = document.getElementById('catweb-module-root');
    if (!root || root.dataset.cwBound) return;
    root.dataset.cwBound = '1';

    document.getElementById('btn-cw-copiar-url')?.addEventListener('click', async () => {
        const url = obtenerUrlPublicaCatWeb();
        try {
            await navigator.clipboard.writeText(url);
            const btn = document.getElementById('btn-cw-copiar-url');
            if (btn) { const t = btn.textContent; btn.textContent = '✅ Copiado'; setTimeout(() => btn.textContent = t, 1400); }
        } catch {
            prompt('Copia el enlace de tu tienda:', url);
        }
    });

    document.getElementById('btn-cw-compartir-url')?.addEventListener('click', () => {
        const cfg = obtenerConfigCatWeb();
        const msg = `🛍️ ¡Hola! Te comparto nuestro catálogo online de *${cfg.nombre}* para que veas precios y hagas tu pedido:\n${obtenerUrlPublicaCatWeb(cfg)}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    });

    document.getElementById('btn-cw-visitar-url')?.addEventListener('click', () => {
        window.open(obtenerUrlPublicaCatWeb(), '_blank', 'noopener');
    });

    document.getElementById('btn-cw-abrir-qr')?.addEventListener('click', abrirModalQrCatWeb);

    document.getElementById('btn-cw-personalizar')?.addEventListener('click', abrirModalPersonalizarCw);
    document.getElementById('btn-cw-abrir-personalizar-card')?.addEventListener('click', abrirModalPersonalizarCw);
    document.getElementById('btn-cw-abrir-visibilidad')?.addEventListener('click', () => {
        if (typeof abrirModalVisibilidadCatWeb === 'function') {
            abrirModalVisibilidadCatWeb();
        } else {
            document.getElementById('cw-cats-toggle-list')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
    document.getElementById('btn-cw-abrir-menu')?.addEventListener('click', () => {
        if (typeof abrirModalOrganizarMenuCatWeb === 'function') {
            abrirModalOrganizarMenuCatWeb();
        }
    });

    document.getElementById('cw-cats-toggle-list')?.addEventListener('change', (e) => {
        if (!e.target.classList.contains('cw-cat-switch')) return;
        const cat = e.target.getAttribute('data-cat-name');
        const activar = e.target.checked;
        const productos = obtenerProductosCatWeb();
        productos.forEach(p => {
            if (((p.categoria || 'General').trim() || 'General') === cat) {
                p.visible = activar;
                p.publicarWeb = activar;
                p.visibleWeb = activar;
                p.publicado = activar;
            }
        });
        guardarProductosCatWeb(productos);
        renderizarTodoCatWeb();
    });

    document.querySelectorAll('.cw-dev-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cw-dev-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            window.cwState.previewDevice = btn.getAttribute('data-cw-dev');
            renderizarTodoCatWeb();
        });
    });

    document.getElementById('cw-prev-search')?.addEventListener('input', (e) => {
        window.cwState.previewSearch = e.target.value;
        const cfg = obtenerConfigCatWeb();
        renderizarVistaPreviaTiendaCw(cfg, obtenerProductosCatWeb().filter(p => esProductoVisibleWebCw(p, cfg)));
    });

    document.getElementById('cw-prev-cats')?.addEventListener('click', (e) => {
        const pill = e.target.closest('.cw-scat-pill');
        if (!pill) return;
        window.cwState.previewCat = pill.getAttribute('data-pcat');
        const cfg = obtenerConfigCatWeb();
        renderizarVistaPreviaTiendaCw(cfg, obtenerProductosCatWeb().filter(p => esProductoVisibleWebCw(p, cfg)));
    });

    document.getElementById('cw-prev-grid')?.addEventListener('click', (e) => {
        const btnAdd = e.target.closest('.cw-sprod-add');
        if (!btnAdd) return;
        const id = btnAdd.getAttribute('data-prev-add');
        const precio = parseFloat(btnAdd.getAttribute('data-prev-price')) || 0;
        const ex = window.cwState.previewCart.find(i => i.id === id);
        if (ex) ex.cant++;
        else window.cwState.previewCart.push({ id, precio, cant: 1 });
        actualizarBarraCarritoPreviewCw();
    });

    document.getElementById('btn-cw-prev-clear-cart')?.addEventListener('click', () => {
        window.cwState.previewCart = [];
        actualizarBarraCarritoPreviewCw();
    });

    const modalPers = document.getElementById('modal-cw-personalizar');
    const cerrarPers = () => modalPers?.classList.remove('active');
    document.getElementById('btn-cw-cerrar-pers')?.addEventListener('click', cerrarPers);
    document.getElementById('btn-cw-cancelar-pers')?.addEventListener('click', cerrarPers);
    modalPers?.addEventListener('click', (e) => { if (e.target === modalPers) cerrarPers(); });
    document.getElementById('form-cw-personalizar')?.addEventListener('submit', guardarPersonalizacionCw);

    document.getElementById('cw-color-swatches')?.addEventListener('click', (e) => {
        const sw = e.target.closest('.cw-swatch');
        if (!sw) return;
        const color = sw.getAttribute('data-color');
        document.getElementById('cw-inp-color').value = color;
        document.querySelectorAll('#cw-color-swatches .cw-swatch').forEach(b => b.classList.remove('active'));
        sw.classList.add('active');
    });

    document.getElementById('cw-icons-grid')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.cw-icon-opt');
        if (!btn) return;
        window.cwState.draftLogo = '';
        window.cwState.draftIcono = btn.getAttribute('data-cw-ico');
        document.querySelectorAll('#cw-icons-grid .cw-icon-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        actualizarPreviewImagenesModalCw();
    });

    const leerImagenArchivoCw = (inputId, destinoProp) => {
        document.getElementById(inputId)?.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                window.cwState[destinoProp] = ev.target.result;
                actualizarPreviewImagenesModalCw();
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        });
    };
    leerImagenArchivoCw('cw-file-banner', 'draftBanner');
    leerImagenArchivoCw('cw-file-logo', 'draftLogo');

    document.getElementById('btn-cw-quitar-banner')?.addEventListener('click', () => {
        window.cwState.draftBanner = '';
        actualizarPreviewImagenesModalCw();
    });
    document.getElementById('btn-cw-quitar-logo')?.addEventListener('click', () => {
        window.cwState.draftLogo = '';
        actualizarPreviewImagenesModalCw();
    });

    document.getElementById('cw-ship-modes')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.cw-ship-btn');
        if (!btn) return;
        window.cwState.draftEnvioTipo = btn.getAttribute('data-ship');
        actualizarUiEnvioModalCw();
    });

    const modalQr = document.getElementById('modal-cw-qr');
    const cerrarQr = () => modalQr?.classList.remove('active');
    document.getElementById('btn-cw-cerrar-qr')?.addEventListener('click', cerrarQr);
    modalQr?.addEventListener('click', (e) => { if (e.target === modalQr) cerrarQr(); });

    document.getElementById('btn-cw-qr-descargar')?.addEventListener('click', () => {
        const img = document.getElementById('cw-qr-img');
        if (!img?.src) return;
        window.open(img.src, '_blank', 'noopener');
    });

    document.getElementById('btn-cw-qr-imprimir')?.addEventListener('click', () => {
        const area = document.getElementById('cw-qr-print-area');
        if (!area) return;
        const w = window.open('', '_blank', 'width=420,height=520');
        if (!w) return;
        w.document.write(`<html><head><title>QR Cat-Web</title><style>body{font-family:Inter,Arial,sans-serif;text-align:center;padding:30px;}img{width:240px;height:240px;margin:16px 0;}</style></head><body>${area.innerHTML}<script>window.onload=()=>{window.print();}</script></body></html>`);
        w.document.close();
    });
}

if (!window._cwMediosListener) {
    window.addEventListener('cat-alogo:medios-pago-actualizados', () => {
        if (document.getElementById('catweb-module-root')) renderizarTodoCatWeb();
    });
    window._cwMediosListener = true;
}

/* ==========================================================================
   ETAPA 2 CAT-WEB: VISIBILIDAD EN ACORDEÓN, MENÚ POR GRUPOS Y RADAR → POS
   ========================================================================== */
Object.assign(window.cwState, {
    radarTab: 'todos',
    sonidoActivo: true,
    visSearch: '',
    visAbiertas: {},
    draftGruposMenu: [],
    ticketActivoId: null
});

function guardarPedidosCatWeb(lista) {
    localStorage.setItem(STORAGE_KEY_CW_PEDIDOS, JSON.stringify(lista));
}

function reproducirBeepCatWeb() {
    if (!window.cwState.sonidoActivo) return;
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
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.34);
    } catch { /* sin audio */ }
}

window.abrirModalVisibilidadCatWeb = function () {
    const modal = document.getElementById('modal-cw-visibilidad');
    if (!modal) return;
    window.cwState.visSearch = '';
    const inp = document.getElementById('cw-vis-search');
    if (inp) inp.value = '';
    renderizarAcordeonVisibilidadCw();
    modal.classList.add('active');
};

function renderizarAcordeonVisibilidadCw() {
    const cont = document.getElementById('cw-vis-accordion');
    const pill = document.getElementById('cw-vis-resumen-pill');
    if (!cont) return;

    const productos = obtenerProductosCatWeb();
    const esVis = (p) => p.publicarWeb !== undefined ? !!p.publicarWeb : p.visible !== false;
    const totalVis = productos.filter(esVis).length;
    if (pill) pill.textContent = `${totalVis} de ${productos.length} visibles`;

    const q = (window.cwState.visSearch || '').trim().toLowerCase();
    const grupos = {};

    productos.forEach(p => {
        const cat = (p.categoria || 'General').trim() || 'General';
        if (q && !`${p.nombre || ''} ${p.sku || ''} ${cat}`.toLowerCase().includes(q)) return;
        if (!grupos[cat]) grupos[cat] = [];
        grupos[cat].push(p);
    });

    const cats = Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    if (cats.length === 0) {
        cont.innerHTML = `<div style="text-align:center; padding:1.8rem; color:#64748b; font-size:0.8rem;">No se encontraron productos con ese filtro.</div>`;
        return;
    }

    cont.innerHTML = cats.map((cat, idx) => {
        const lista = grupos[cat];
        const visCat = lista.filter(esVis).length;
        const abierta = q ? true : (window.cwState.visAbiertas[cat] ?? (idx === 0));

        const itemsHtml = lista.map(p => {
            const online = esVis(p);
            const fotoRaw = (p.imagenes && p.imagenes[0]) ? p.imagenes[0] : '';
            const foto = (fotoRaw && !fotoRaw.includes('producto.png')) ? fotoRaw : CW_PLACEHOLDER_SVG;
            return `
                <div class="cw-vis-prod-row">
                    <div class="cw-vis-prod-left">
                        <img src="${foto}" alt="${escaparHtmlCw(p.nombre)}" class="cw-vis-thumb">
                        <div style="min-width:0;">
                            <strong>${escaparHtmlCw(p.nombre)}</strong>
                            <span class="${online ? 'cw-status-online' : 'cw-status-oculto'}">${online ? 'ONLINE' : 'OCULTO'}</span>
                            <span style="font-size:0.68rem; color:#64748b; margin-left:6px;">Stock: ${Number(p.stock) || 0}</span>
                        </div>
                    </div>
                    <label class="cw-toggle">
                        <input type="checkbox" class="cw-vis-prod-switch" data-prod-id="${escaparHtmlCw(p.id)}" ${online ? 'checked' : ''}>
                        <span class="cw-toggle-slider"></span>
                    </label>
                </div>
            `;
        }).join('');

        return `
            <div class="cw-acc-item ${abierta ? 'is-open' : ''}" data-acc-cat="${escaparHtmlCw(cat)}">
                <div class="cw-acc-head">
                    <div class="cw-acc-head-left">
                        <span class="cw-acc-chevron">▼</span>
                        <div>
                            <strong>${escaparHtmlCw(cat)}</strong>
                            <small>${visCat} de ${lista.length} visibles</small>
                        </div>
                    </div>
                    <label class="cw-toggle" onclick="event.stopPropagation()">
                        <input type="checkbox" class="cw-vis-cat-switch" data-cat-name="${escaparHtmlCw(cat)}" ${visCat > 0 ? 'checked' : ''}>
                        <span class="cw-toggle-slider"></span>
                    </label>
                </div>
                <div class="cw-acc-body">${itemsHtml}</div>
            </div>
        `;
    }).join('');
}

window.abrirModalOrganizarMenuCatWeb = function () {
    const modal = document.getElementById('modal-cw-menu');
    if (!modal) return;
    const cfg = obtenerConfigCatWeb();
    window.cwState.draftGruposMenu = JSON.parse(JSON.stringify(Array.isArray(cfg.gruposMenu) ? cfg.gruposMenu : []));
    renderizarGruposMenuModalCw();
    modal.classList.add('active');
};

function renderizarGruposMenuModalCw() {
    const cont = document.getElementById('cw-menu-groups-list');
    if (!cont) return;

    const productos = obtenerProductosCatWeb();
    const todasCats = [...new Set(productos.map(p => (p.categoria || 'General').trim() || 'General'))]
        .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

    const grupos = window.cwState.draftGruposMenu;
    if (grupos.length === 0) {
        cont.innerHTML = `
            <div style="text-align:center; padding:1.6rem; background:#f8fafc; border:1.5px dashed #cbd5e1; border-radius:12px; color:#64748b; font-size:0.79rem;">
                Todavía no creaste grupos. Escribe un nombre arriba (ej: <strong>Almacén</strong>) para agrupar varias categorías juntas en el menú de tu tienda.
            </div>
        `;
        return;
    }

    cont.innerHTML = grupos.map((g, gIdx) => {
        const pillsHtml = (g.categorias || []).length > 0
            ? g.categorias.map(c => `<span class="cw-menu-pill">${escaparHtmlCw(c)}</span>`).join('')
            : `<span style="font-size:0.72rem; color:#94a3b8;">Marca abajo las categorías que van dentro de este grupo</span>`;

        const checksHtml = todasCats.map(cat => {
            const checked = (g.categorias || []).includes(cat);
            return `
                <label class="cw-menu-chk-item">
                    <input type="checkbox" class="cw-menu-cat-chk" data-gidx="${gIdx}" data-cat="${escaparHtmlCw(cat)}" ${checked ? 'checked' : ''}>
                    <span>${escaparHtmlCw(cat)}</span>
                </label>
            `;
        }).join('');

        return `
            <div class="cw-menu-group-card">
                <div class="cw-menu-group-top">
                    <strong>📁 ${escaparHtmlCw(g.nombre)}</strong>
                    <button type="button" class="cw-btn cw-btn-danger-soft cw-btn-sm btn-cw-del-group" data-gidx="${gIdx}">🗑️ Eliminar</button>
                </div>
                <div class="cw-menu-pills">${pillsHtml}</div>
                <div class="cw-menu-checks-grid">${checksHtml}</div>
            </div>
        `;
    }).join('');
}

function simularPedidoWebPruebaCw() {
    const cfg = obtenerConfigCatWeb();
    const productos = obtenerProductosCatWeb().filter(p => esProductoVisibleWebCw(p, cfg));
    const existentes = obtenerPedidosCatWeb();
    const numSec = 1040 + existentes.length + 1;

    const clientesDemo = [
        { nombre: 'Sofía Martínez', tel: '+5493514521988', dir: 'Av. Colón 1420', tipo: 'DEPARTAMENTO Piso 4, Dpto B', ref: 'Edificio frente a la plaza' },
        { nombre: 'Lucas Benítez', tel: '+5493516123456', dir: '', tipo: 'Retiro en Local', ref: 'Pasa por la tarde' },
        { nombre: 'Valeria Rossi', tel: '+5493515987654', dir: 'Bv. San Juan 850', tipo: 'CASA', ref: 'Portón negro' }
    ];
    const cli = clientesDemo[existentes.length % clientesDemo.length];
    const esEnvio = !!cli.dir;

    const elegidos = productos.length > 0 ? productos.slice(0, Math.min(2, productos.length)) : [];
    const items = elegidos.length > 0
        ? elegidos.map(p => {
            const pNorm = Number(p.precioNormal) || 0;
            const pOfe = Number(p.precioOferta) || 0;
            const precioUnit = (pOfe > 0 && pOfe < pNorm) ? pOfe : pNorm;
            return {
                prodId: p.id,
                varIdx: null,
                nombre: p.nombre,
                sku: p.sku || '',
                precioUnit,
                costoUnit: Math.max(0, Number(p.precioCosto) || 0),
                cantidad: 1,
                unidadMedida: p.unidadMedida || 'Unidad',
                familiaMedicion: p.familiaMedicion || 'unidad'
            };
        })
        : [{ prodId: null, varIdx: null, nombre: 'Producto de Prueba Web', sku: 'DEMO-01', precioUnit: 8500, costoUnit: 5000, cantidad: 2, unidadMedida: 'Unidad', familiaMedicion: 'unidad' }];

    const subtotal = Math.round(items.reduce((a, i) => a + i.precioUnit * i.cantidad, 0) * 100) / 100;
    let costoEnvio = 0;
    if (esEnvio && cfg.envioTipo === 'fijo') costoEnvio = Number(cfg.envioValor) || 0;
    if (esEnvio && cfg.envioTipo === 'porcentaje') costoEnvio = Math.round(subtotal * ((Number(cfg.envioValor) || 0) / 100));
    const total = Math.round((subtotal + costoEnvio) * 100) / 100;

    let medioPago = 'Efectivo';
    if (window.MediosPagoEngine) {
        const hab = window.MediosPagoEngine.obtenerMediosHabilitados();
        if (hab.length > 0) medioPago = hab[existentes.length % hab.length].nombre;
    }

    const nuevoPedido = {
        id: 'web-' + Date.now(),
        codigo: `#WEB-${numSec}`,
        fecha: new Date().toISOString(),
        estado: 'nuevo',
        clienteNombre: cli.nombre,
        clienteTelefono: cli.tel,
        modalidad: esEnvio ? 'envio' : 'retiro',
        direccion: cli.dir,
        tipoVivienda: cli.tipo,
        referencia: cli.ref,
        medioPago,
        items,
        subtotal,
        costoEnvio,
        total,
        ticketPosNumero: null
    };

    existentes.unshift(nuevoPedido);
    guardarPedidosCatWeb(existentes);
    reproducirBeepCatWeb();
    renderizarTodoCatWeb();
}

function abrirModalTicketWebCw(pedidoId) {
    const pedido = obtenerPedidosCatWeb().find(p => p.id === pedidoId);
    const modal = document.getElementById('modal-cw-ticket');
    if (!pedido || !modal) return;

    window.cwState.ticketActivoId = pedidoId;
    document.getElementById('cw-tk-num').textContent = `Pedido ${pedido.codigo}`;

    const itemsHtml = (pedido.items || []).map(it => `
        <div class="cw-order-item-line" style="padding:0.25rem 0; border-bottom:1px solid #e2e8f0;">
            <span><strong>${it.cantidad}</strong> ${escaparHtmlCw(it.nombre)}</span>
            <strong>${formatearArsCw(it.precioUnit * it.cantidad)}</strong>
        </div>
    `).join('');

    document.getElementById('cw-tk-body').innerHTML = `
        <div class="cw-tk-card">
            <span class="cw-tk-card-lbl">👤 Cliente</span>
            <strong style="font-size:0.95rem;">${escaparHtmlCw(pedido.clienteNombre)}</strong>
            <span style="color:#059669; font-weight:700;">💬 ${escaparHtmlCw(pedido.clienteTelefono || 'Sin teléfono')}</span>
        </div>

        <div class="cw-tk-card">
            <span class="cw-tk-card-lbl">📍 Logística</span>
            <strong style="color:#4338ca;">${pedido.modalidad === 'envio' ? '🛵 Envío a Domicilio' : '🏪 Retiro en Local'}</strong>
            ${pedido.direccion ? `<span><strong>Dir:</strong> ${escaparHtmlCw(pedido.direccion)}</span>` : ''}
            ${pedido.tipoVivienda ? `<span><strong>Tipo:</strong> ${escaparHtmlCw(pedido.tipoVivienda)}</span>` : ''}
            ${pedido.referencia ? `<span><strong>Ref:</strong> ${escaparHtmlCw(pedido.referencia)}</span>` : ''}
        </div>

        <div class="cw-tk-card">
            <span class="cw-tk-card-lbl">🛒 Detalle del Pedido</span>
            ${itemsHtml}
            ${pedido.costoEnvio > 0 ? `<div class="cw-order-item-line" style="padding-top:0.3rem;"><span>🛵 Costo de Envío</span><strong>+${formatearArsCw(pedido.costoEnvio)}</strong></div>` : ''}
        </div>

        <div class="cw-tk-total-bar">
            <div>
                <span class="cw-tk-card-lbl">Medio de Pago</span>
                <strong style="font-size:0.88rem; color:#059669; display:block;">${escaparHtmlCw(pedido.medioPago || 'Efectivo')}</strong>
            </div>
            <div style="text-align:right;">
                <span class="cw-tk-card-lbl">Total a Cobrar</span>
                <strong>${formatearArsCw(pedido.total)}</strong>
            </div>
        </div>
    `;

    const yaFact = pedido.estado === 'facturado' || pedido.estado === 'despachado';
    const canc = pedido.estado === 'cancelado';
    document.getElementById('cw-tk-footer').innerHTML = `
        ${!yaFact && !canc ? `<button type="button" class="cw-btn cw-btn-danger-soft" data-tk-act="cancelar">✕ Cancelar</button>` : ''}
        <button type="button" class="cw-btn cw-btn-light" data-tk-act="wa-prep">💬 Avisar Preparando</button>
        ${!yaFact && !canc ? `<button type="button" class="cw-btn cw-btn-primary" data-tk-act="facturar">🏪 Facturar en POS</button>` : ''}
        ${pedido.estado === 'facturado' ? `<button type="button" class="cw-btn cw-btn-indigo" data-tk-act="despachar">📦 Despachado</button>` : ''}
    `;

    modal.classList.add('active');
}

function facturarPedidoWebEnPosCw(pedidoId) {
    const pedidos = obtenerPedidosCatWeb();
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido || pedido.estado === 'facturado' || pedido.estado === 'despachado') return;

    const turnos = JSON.parse(localStorage.getItem('cat_alogo_pos_turnos_v1') || '[]');
    const turnoActivo = turnos.find(t => t.estado === 'abierto') || null;

    const avisoTurno = turnoActivo
        ? `Se registrará en el Turno activo #${turnoActivo.numero} (${turnoActivo.operador}).`
        : `No hay turno abierto en POS: se guardará igual en Ventas Cat-Web y Finanzas.`;

    const ok = confirm(
        `🏪 ¿Confirmar y Facturar ${pedido.codigo} por ${formatearArsCw(pedido.total)}?\n\n` +
        `• Se descontará el stock automáticamente en Inventario.\n` +
        `• ${avisoTurno}\n` +
        `• Aparecerá en Finanzas bajo el filtro "🌐 Ventas Cat-Web".`
    );
    if (!ok) return;

    const productos = obtenerProductosCatWeb();
    let costoTotal = 0;
    (pedido.items || []).forEach(it => {
        costoTotal += (Number(it.costoUnit) || 0) * (Number(it.cantidad) || 1);
        if (!it.prodId) return;
        const prod = productos.find(p => String(p.id) === String(it.prodId));
        if (!prod) return;
        const actual = Number(prod.stock) || 0;
        prod.stock = Math.round(Math.max(0, actual - (Number(it.cantidad) || 1)) * 1000) / 1000;
        prod.actualizadoEn = new Date().toISOString();
    });
    guardarProductosCatWeb(productos);

    const ventas = JSON.parse(localStorage.getItem('cat_alogo_pos_ventas_v1') || '[]');
    const numTicket = `T-${String(ventas.length + 1).padStart(4, '0')}`;
    const nuevaVenta = {
        id: 'vta-web-' + Date.now(),
        numeroTicket: numTicket,
        fecha: new Date().toISOString(),
        canal: 'web',
        pedidoWebCodigo: pedido.codigo,
        turnoId: turnoActivo ? turnoActivo.id : null,
        turnoNumero: turnoActivo ? turnoActivo.numero : null,
        operador: turnoActivo ? turnoActivo.operador : 'Cat-Web',
        clienteId: null,
        clienteNombre: pedido.clienteNombre || 'Cliente Web',
        clienteTelefono: pedido.clienteTelefono || '',
        items: pedido.items || [],
        subtotal: pedido.subtotal,
        descuentoPct: 0,
        descuentoMonto: 0,
        recargoPct: 0,
        recargoMonto: 0,
        total: pedido.total,
        costoTotal: Math.round(costoTotal * 100) / 100,
        gananciaBruta: Math.round((pedido.total - costoTotal) * 100) / 100,
        pagos: [{ medio: pedido.medioPago || 'Efectivo', monto: pedido.total, pagaCon: pedido.total, vuelto: 0, referencia: pedido.codigo }],
        vueltoTotal: 0,
        nota: `Pedido Cat-Web ${pedido.codigo}${pedido.costoEnvio > 0 ? ` (Envío ${formatearArsCw(pedido.costoEnvio)})` : ''}`,
        estado: 'completada'
    };
    ventas.unshift(nuevaVenta);
    localStorage.setItem('cat_alogo_pos_ventas_v1', JSON.stringify(ventas));

    pedido.estado = 'facturado';
    pedido.ticketPosNumero = numTicket;
    guardarPedidosCatWeb(pedidos);

    document.getElementById('modal-cw-ticket')?.classList.remove('active');
    renderizarTodoCatWeb();
    alert(`✅ Pedido ${pedido.codigo} facturado como Ticket ${numTicket}.\nStock descontado y registrado en POS y Finanzas (🌐 Ventas Cat-Web).`);
}

function imprimirComandaDepositoCw(pedido) {
    if (!pedido) return;
    const cfg = obtenerConfigCatWeb();
    const w = window.open('', '_blank', 'width=400,height=560');
    if (!w) return;
    const filas = (pedido.items || []).map(i => `<li><strong>${i.cantidad}×</strong> ${escaparHtmlCw(i.nombre)} ${i.sku ? `(${escaparHtmlCw(i.sku)})` : ''}</li>`).join('');
    w.document.write(`
        <html><head><title>Comanda ${pedido.codigo}</title>
        <style>body{font-family:monospace;padding:18px;font-size:13px;}h2,p{margin:4px 0;}ul{padding-left:18px;}li{margin:6px 0;}</style>
        </head><body>
        <h2>COMANDA DE ARMADO — ${escaparHtmlCw(cfg.nombre)}</h2>
        <p><strong>Pedido:</strong> ${escaparHtmlCw(pedido.codigo)} • ${new Date(pedido.fecha).toLocaleString('es-AR')}</p>
        <p><strong>Cliente:</strong> ${escaparHtmlCw(pedido.clienteNombre)} (${escaparHtmlCw(pedido.clienteTelefono)})</p>
        <p><strong>Entrega:</strong> ${pedido.modalidad === 'envio' ? `ENVÍO — ${escaparHtmlCw(pedido.direccion)} (${escaparHtmlCw(pedido.referencia)})` : 'RETIRO EN LOCAL'}</p>
        <hr><ul>${filas}</ul><hr>
        <p><strong>Medio:</strong> ${escaparHtmlCw(pedido.medioPago)} | <strong>Total:</strong> ${formatearArsCw(pedido.total)}</p>
        <script>window.onload=()=>{window.print();}</script></body></html>
    `);
    w.document.close();
}

function enviarAvisoWhatsAppPedidoCw(pedido, tipo = 'camino') {
    if (!pedido) return;
    const cfg = obtenerConfigCatWeb();
    let texto = '';
    if (tipo === 'prep') {
        texto = `¡Hola ${pedido.clienteNombre}! 👋 Recibimos tu pedido *${pedido.codigo}* en *${cfg.nombre}* por *${formatearArsCw(pedido.total)}*. Ya lo estamos preparando 🙌`;
    } else if (pedido.modalidad === 'envio') {
        texto = `¡Hola ${pedido.clienteNombre}! 🛵 Tu pedido *${pedido.codigo}* de *${cfg.nombre}* ya salió en camino hacia *${pedido.direccion}*. Total: *${formatearArsCw(pedido.total)}*.`;
    } else {
        texto = `¡Hola ${pedido.clienteNombre}! 🏪 Tu pedido *${pedido.codigo}* de *${cfg.nombre}* ya está listo para retirar por el local. Total: *${formatearArsCw(pedido.total)}*.`;
    }
    const tel = String(pedido.clienteTelefono || '').replace(/[^\d]/g, '');
    const url = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank', 'noopener');
}

const _renderizarVistaPreviaE1 = renderizarVistaPreviaTiendaCw;
renderizarVistaPreviaTiendaCw = function (cfg, visibles) {
    _renderizarVistaPreviaE1(cfg, visibles);

    const grupos = Array.isArray(cfg.gruposMenu) ? cfg.gruposMenu.filter(g => (g.categorias || []).length > 0) : [];
    if (grupos.length === 0) return;

    const catsEl = document.getElementById('cw-prev-cats');
    if (catsEl) {
        const agrupadas = new Set(grupos.flatMap(g => g.categorias));
        const sueltas = [...new Set(visibles.map(p => (p.categoria || 'General').trim() || 'General'))]
            .filter(c => !agrupadas.has(c)).sort();

        let html = `<button type="button" class="cw-scat-pill ${window.cwState.previewCat === 'todos' ? 'active' : ''}" data-pcat="todos">Todos (${visibles.length})</button>`;
        grupos.forEach(g => {
            const key = `grp::${g.nombre}`;
            html += `<button type="button" class="cw-scat-pill ${window.cwState.previewCat === key ? 'active' : ''}" data-pcat="${escaparHtmlCw(key)}">📁 ${escaparHtmlCw(g.nombre)}</button>`;
        });
        sueltas.forEach(c => {
            html += `<button type="button" class="cw-scat-pill ${window.cwState.previewCat === c ? 'active' : ''}" data-pcat="${escaparHtmlCw(c)}">${escaparHtmlCw(c)}</button>`;
        });
        catsEl.innerHTML = html;
    }

    if (String(window.cwState.previewCat || '').startsWith('grp::')) {
        const nomG = window.cwState.previewCat.slice(5);
        const grp = grupos.find(g => g.nombre === nomG);
        if (grp) {
            const q = (window.cwState.previewSearch || '').trim().toLowerCase();
            const filtrados = visibles.filter(p => {
                const cat = (p.categoria || 'General').trim() || 'General';
                if (!grp.categorias.includes(cat)) return false;
                if (q && !`${p.nombre || ''} ${p.sku || ''} ${cat}`.toLowerCase().includes(q)) return false;
                return true;
            });
            const gridEl = document.getElementById('cw-prev-grid');
            if (gridEl) {
                gridEl.innerHTML = filtrados.length === 0
                    ? `<div style="grid-column:1/-1; text-align:center; padding:2rem 0.6rem; color:#64748b; font-size:0.76rem;">No hay productos visibles en este grupo.</div>`
                    : filtrados.slice(0, 24).map(p => {
                        const fotoRaw = (p.imagenes && p.imagenes[0]) ? p.imagenes[0] : '';
                        const foto = (fotoRaw && !fotoRaw.includes('producto.png')) ? fotoRaw : CW_PLACEHOLDER_SVG;
                        const pNorm = Number(p.precioNormal) || 0;
                        const pOfe = Number(p.precioOferta) || 0;
                        const hayOferta = pOfe > 0 && pOfe < pNorm;
                        const precioFinal = hayOferta ? pOfe : pNorm;
                        return `
                            <article class="cw-sprod-card">
                                <div class="cw-sprod-img">${hayOferta ? '<span class="cw-sprod-offer">OFERTA</span>' : ''}<img src="${foto}" alt="${escaparHtmlCw(p.nombre)}"></div>
                                <div class="cw-sprod-body">
                                    <span class="cw-sprod-name">${escaparHtmlCw(p.nombre)}</span>
                                    <div><span class="cw-sprod-price">${formatearArsCw(precioFinal)}</span>${hayOferta ? `<span class="cw-sprod-old">${formatearArsCw(pNorm)}</span>` : ''}</div>
                                    <button type="button" class="cw-sprod-add" data-prev-add="${escaparHtmlCw(p.id)}" data-prev-price="${precioFinal}">+ Agregar</button>
                                </div>
                            </article>
                        `;
                    }).join('');
            }
        }
    }
};

function enlazarEventosCatWebEtapa2() {
    const root = document.getElementById('catweb-module-root');
    if (!root || root.dataset.cwE2Bound) return;
    root.dataset.cwE2Bound = '1';

    document.getElementById('cw-chk-sonido')?.addEventListener('change', (e) => {
        window.cwState.sonidoActivo = e.target.checked;
    });
    document.getElementById('btn-cw-simular-pedido')?.addEventListener('click', simularPedidoWebPruebaCw);

    document.getElementById('cw-radar-tabs')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.cw-rtab');
        if (!btn) return;
        document.querySelectorAll('#cw-radar-tabs .cw-rtab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        window.cwState.radarTab = btn.getAttribute('data-rtab');
        renderizarRadarPedidosCw();
    });

    document.getElementById('cw-radar-list')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-oact]');
        if (!btn) return;
        const oid = btn.closest('.cw-order-card')?.getAttribute('data-oid');
        if (!oid) return;
        const act = btn.getAttribute('data-oact');
        const pedidos = obtenerPedidosCatWeb();
        const ped = pedidos.find(p => p.id === oid);
        if (!ped) return;

        if (act === 'ticket') abrirModalTicketWebCw(oid);
        else if (act === 'comanda') imprimirComandaDepositoCw(ped);
        else if (act === 'wa-camino') enviarAvisoWhatsAppPedidoCw(ped, 'camino');
        else if (act === 'facturar') facturarPedidoWebEnPosCw(oid);
        else if (act === 'despachar') {
            ped.estado = 'despachado';
            guardarPedidosCatWeb(pedidos);
            renderizarTodoCatWeb();
        } else if (act === 'cancelar') {
            if (!confirm(`¿Cancelar el pedido ${ped.codigo}?`)) return;
            ped.estado = 'cancelado';
            guardarPedidosCatWeb(pedidos);
            renderizarTodoCatWeb();
        }
    });

    const modalVis = document.getElementById('modal-cw-visibilidad');
    const cerrarVis = () => modalVis?.classList.remove('active');
    document.getElementById('btn-cw-cerrar-vis')?.addEventListener('click', cerrarVis);
    document.getElementById('btn-cw-vis-listo')?.addEventListener('click', cerrarVis);
    modalVis?.addEventListener('click', (e) => { if (e.target === modalVis) cerrarVis(); });

    document.getElementById('cw-vis-search')?.addEventListener('input', (e) => {
        window.cwState.visSearch = e.target.value;
        renderizarAcordeonVisibilidadCw();
    });

    document.getElementById('cw-vis-accordion')?.addEventListener('click', (e) => {
        const head = e.target.closest('.cw-acc-head');
        if (!head) return;
        const item = head.closest('.cw-acc-item');
        const cat = item?.getAttribute('data-acc-cat');
        if (!cat) return;
        const abierto = !item.classList.contains('is-open');
        item.classList.toggle('is-open', abierto);
        window.cwState.visAbiertas[cat] = abierto;
    });

    document.getElementById('cw-vis-accordion')?.addEventListener('change', (e) => {
        const productos = obtenerProductosCatWeb();
        if (e.target.classList.contains('cw-vis-cat-switch')) {
            const cat = e.target.getAttribute('data-cat-name');
            const val = e.target.checked;
            productos.forEach(p => {
                if (((p.categoria || 'General').trim() || 'General') === cat) {
                    p.visible = val;
                    p.publicarWeb = val;
                    p.visibleWeb = val;
                    p.publicado = val;
                }
            });
        } else if (e.target.classList.contains('cw-vis-prod-switch')) {
            const pid = e.target.getAttribute('data-prod-id');
            const prod = productos.find(p => String(p.id) === String(pid));
            if (prod) {
                const val = e.target.checked;
                prod.visible = val;
                prod.publicarWeb = val;
                prod.visibleWeb = val;
                prod.publicado = val;
            }
        } else {
            return;
        }
        guardarProductosCatWeb(productos);
        renderizarAcordeonVisibilidadCw();
        renderizarTodoCatWeb();
    });

    const modalMenu = document.getElementById('modal-cw-menu');
    const cerrarMenu = () => modalMenu?.classList.remove('active');
    document.getElementById('btn-cw-cerrar-menu')?.addEventListener('click', cerrarMenu);
    document.getElementById('btn-cw-cancelar-menu')?.addEventListener('click', cerrarMenu);
    modalMenu?.addEventListener('click', (e) => { if (e.target === modalMenu) cerrarMenu(); });

    document.getElementById('btn-cw-menu-add-group')?.addEventListener('click', () => {
        const inp = document.getElementById('cw-menu-new-name');
        const nom = (inp?.value || '').trim();
        if (!nom) { inp?.focus(); return; }
        window.cwState.draftGruposMenu.push({ id: 'grp-' + Date.now(), nombre: nom, categorias: [] });
        if (inp) inp.value = '';
        renderizarGruposMenuModalCw();
    });

    document.getElementById('cw-menu-groups-list')?.addEventListener('click', (e) => {
        const btnDel = e.target.closest('.btn-cw-del-group');
        if (!btnDel) return;
        const gIdx = parseInt(btnDel.getAttribute('data-gidx'), 10);
        window.cwState.draftGruposMenu.splice(gIdx, 1);
        renderizarGruposMenuModalCw();
    });

    document.getElementById('cw-menu-groups-list')?.addEventListener('change', (e) => {
        if (!e.target.classList.contains('cw-menu-cat-chk')) return;
        const gIdx = parseInt(e.target.getAttribute('data-gidx'), 10);
        const cat = e.target.getAttribute('data-cat');
        const grp = window.cwState.draftGruposMenu[gIdx];
        if (!grp) return;
        if (e.target.checked) {
            if (!grp.categorias.includes(cat)) grp.categorias.push(cat);
        } else {
            grp.categorias = grp.categorias.filter(c => c !== cat);
        }
        renderizarGruposMenuModalCw();
    });

    document.getElementById('btn-cw-guardar-menu')?.addEventListener('click', async () => {
        const cfg = obtenerConfigCatWeb();
        cfg.gruposMenu = window.cwState.draftGruposMenu;
        guardarConfigCatWeb(cfg);
        cerrarMenu();
        renderizarTodoCatWeb();
        try {
            await publicarPersonalizacionEnVendorsCw(cfg);
        } catch (err) {
            console.warn('Error subiendo grupos de menú a vendors:', err);
        }
    });

    const modalTk = document.getElementById('modal-cw-ticket');
    const cerrarTk = () => modalTk?.classList.remove('active');
    document.getElementById('btn-cw-cerrar-tk')?.addEventListener('click', cerrarTk);
    modalTk?.addEventListener('click', (e) => { if (e.target === modalTk) cerrarTk(); });

    document.getElementById('cw-tk-footer')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-tk-act]');
        if (!btn || !window.cwState.ticketActivoId) return;
        const act = btn.getAttribute('data-tk-act');
        const pedidos = obtenerPedidosCatWeb();
        const ped = pedidos.find(p => p.id === window.cwState.ticketActivoId);
        if (!ped) return;

        if (act === 'facturar') facturarPedidoWebEnPosCw(ped.id);
        else if (act === 'wa-prep') enviarAvisoWhatsAppPedidoCw(ped, 'prep');
        else if (act === 'despachar') {
            ped.estado = 'despachado';
            guardarPedidosCatWeb(pedidos);
            cerrarTk();
            renderizarTodoCatWeb();
        } else if (act === 'cancelar') {
            if (!confirm(`¿Cancelar el pedido ${ped.codigo}?`)) return;
            ped.estado = 'cancelado';
            guardarPedidosCatWeb(pedidos);
            cerrarTk();
            renderizarTodoCatWeb();
        }
    });
}

/* ==========================================================================
   ETAPA 3 & 4: PUENTE BIDIRECCIONAL VENDORS/{UID} (PC ↔ APP ↔ CATÁLOGO WEB)
   ========================================================================== */
const STORAGE_KEY_CW_FIREBASE = 'cat_alogo_firebase_cfg_v1';

let cwFirestoreDb = null;
let cwRadarUnsubscribe = null;
let cwVendorUnsubscribe = null;
let cwRadarPrimeraCarga = true;

function obtenerConfigFirebaseCw() {
    const def = {
        apiKey: '',
        authDomain: '',
        projectId: '',
        appId: '',
        uid: '',
        colTiendas: 'vendors',
        colPedidos: 'orders',
        webpActivo: true,
        webpMaxKb: 80
    };
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_CW_FIREBASE) || 'null');
        return raw ? { ...def, ...raw } : def;
    } catch {
        return def;
    }
}

function guardarConfigFirebaseCw(cfg) {
    localStorage.setItem(STORAGE_KEY_CW_FIREBASE, JSON.stringify(cfg));
}

function tieneCredencialesFirebaseCw(cfgOpt) {
    const c = cfgOpt || obtenerConfigFirebaseCw();
    return Boolean(c.apiKey && c.projectId && c.uid);
}

function tamanoDataUrlKbCw(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return 0;
    const base64 = dataUrl.split(',')[1] || '';
    return Math.round(((base64.length * 3) / 4 / 1024) * 10) / 10;
}

function comprimirImagenWebpCw(src, maxAncho = 800, maxKb = 80) {
    return new Promise((resolve) => {
        if (!src || typeof src !== 'string' || src.includes('producto.png') || src.startsWith('data:image/svg+xml')) {
            resolve({ dataUrl: src || '', kbAntes: 0, kbDespues: 0 });
            return;
        }
        if (src.startsWith('http://') || src.startsWith('https://')) {
            resolve({ dataUrl: src, kbAntes: 0, kbDespues: 0 });
            return;
        }

        const kbAntes = tamanoDataUrlKbCw(src);
        const img = new Image();
        img.onload = () => {
            try {
                const ratio = Math.min(1, maxAncho / Math.max(img.width, img.height, 1));
                const w = Math.max(1, Math.round(img.width * ratio));
                const h = Math.max(1, Math.round(img.height * ratio));

                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);

                let calidad = 0.82;
                let resultado = canvas.toDataURL('image/webp', calidad);
                while (tamanoDataUrlKbCw(resultado) > maxKb && calidad > 0.32) {
                    calidad -= 0.12;
                    resultado = canvas.toDataURL('image/webp', calidad);
                }

                const kbDespues = tamanoDataUrlKbCw(resultado);
                resolve({ dataUrl: resultado, kbAntes, kbDespues });
            } catch {
                resolve({ dataUrl: src, kbAntes, kbDespues: kbAntes });
            }
        };
        img.onerror = () => resolve({ dataUrl: src, kbAntes, kbDespues: kbAntes });
        img.src = src;
    });
}

async function subirDataUrlAStorageVendorCw(storage, uid, nombreArchivo, dataUrl, maxAncho = 900, maxKb = 95) {
    if (!dataUrl || typeof dataUrl !== 'string') return '';
    if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://') || dataUrl.startsWith('EMOJI:')) return dataUrl;
    if (!dataUrl.startsWith('data:image/') || !storage || !uid) return dataUrl;

    try {
        const { dataUrl: webpUrl } = await comprimirImagenWebpCw(dataUrl, maxAncho, maxKb);
        const resp = await fetch(webpUrl);
        const blob = await resp.blob();
        const ref = storage.ref().child(`vendors/${uid}/${nombreArchivo}`);
        await ref.put(blob, { contentType: blob.type || 'image/webp' });
        return await ref.getDownloadURL();
    } catch (err) {
        console.warn(`No se pudo subir ${nombreArchivo} a Storage:`, err);
        return dataUrl;
    }
}

/* --- PUBLICAR PERSONALIZACIÓN EN VENDORS/{UID} (IMPACTA EN CATÁLOGO WEB Y APP) --- */
async function publicarPersonalizacionEnVendorsCw(cfgInput) {
    const { db, storage, uid } = obtenerAuthContextoCw();
    if (!db || !uid) return false;

    const cfg = { ...(cfgInput || obtenerConfigCatWeb()) };

    // Subir logo y banner si son imágenes locales Base64
    if (cfg.bannerImg && cfg.bannerImg.startsWith('data:image/')) {
        cfg.bannerImg = await subirDataUrlAStorageVendorCw(storage, uid, 'portadaNegocio.webp', cfg.bannerImg, 1200, 120);
    }
    if (cfg.logoImg && cfg.logoImg.startsWith('data:image/')) {
        cfg.logoImg = await subirDataUrlAStorageVendorCw(storage, uid, 'logoNegocio.webp', cfg.logoImg, 400, 60);
    }
    guardarConfigCatWeb(cfg);

    const logoFinal = cfg.logoImg
        ? cfg.logoImg
        : (cfg.iconoRapido ? `EMOJI:${cfg.iconoRapido}` : '');
    const tipoEnvio = cfg.envioTipo || 'gratis';
    const valorEnvio = tipoEnvio === 'gratis' ? 0 : (Number(cfg.envioValor) || 0);
    const agrupacionesWeb = Array.isArray(cfg.gruposMenu)
        ? cfg.gruposMenu.map(g => ({
            id: g.id || ('grp_' + Date.now()),
            nombre: g.nombre || 'Grupo',
            hijas: Array.isArray(g.categorias) ? g.categorias : (Array.isArray(g.hijas) ? g.hijas : [])
        }))
        : [];

    const payloadVendor = {
        nombreNegocio: cfg.nombre || 'Mi Tienda',
        descripcion: cfg.descripcion || '',
        whatsapp: cfg.whatsapp || '',
        logoNegocio: logoFinal,
        logo_url: logoFinal,
        portadaNegocio: cfg.bannerImg || '',
        portada_url: cfg.bannerImg || '',
        colorPrimario: cfg.colorPrimario || '#059669',
        tipoEnvio,
        valorEnvio,
        ocultarSinStock: !!cfg.ocultarSinStock,
        slug: cfg.slug || (cfg.nombre || uid).toLowerCase().replace(/[^a-z0-9]/g, ''),
        updatedAt: new Date().toISOString(),
        updatedAtMs: Date.now(),
        updatedBy: 'web_pc',
        deviceId: obtenerPcDeviceIdCw(),
        general: {
            nombreNegocio: cfg.nombre || 'Mi Tienda',
            descripcionNegocio: cfg.descripcion || '',
            whatsapp: cfg.whatsapp || '',
            colorPrimario: cfg.colorPrimario || '#059669',
            logoNegocio: logoFinal,
            logo_url: logoFinal,
            portadaNegocio: cfg.bannerImg || '',
            portada_url: cfg.bannerImg || '',
            tipoEnvio,
            valorEnvio,
            ocultarSinStock: !!cfg.ocultarSinStock,
            agrupacionesWeb
        }
    };

    await db.collection('vendors').doc(uid).set(payloadVendor, { merge: true });
    return true;
}

/* --- ESCUCHA EN TIEMPO REAL DE VENDORS/{UID} (APP MÓVIL → WEB PC) --- */
function iniciarEscuchaVendorCatWebCw() {
    if (typeof cwVendorUnsubscribe === 'function') {
        cwVendorUnsubscribe();
        cwVendorUnsubscribe = null;
    }

    const { db, uid } = obtenerAuthContextoCw();
    if (!db || !uid) return;

    const myDeviceId = obtenerPcDeviceIdCw();
    cwVendorUnsubscribe = db.collection('vendors').doc(uid).onSnapshot((snap) => {
        if (!snap.exists || snap.metadata.hasPendingWrites) return;
        const d = snap.data() || {};
        if (d.deviceId && d.deviceId === myDeviceId) return;

        const actual = obtenerConfigCatWeb();
        const gen = d.general || {};

        const logoRaw = String(d.logoNegocio ?? d.logo_url ?? gen.logoNegocio ?? '').trim();
        let logoImg = actual.logoImg;
        let iconoRapido = actual.iconoRapido;
        if (logoRaw.startsWith('EMOJI:')) {
            logoImg = '';
            iconoRapido = logoRaw.replace('EMOJI:', '');
        } else if (logoRaw) {
            logoImg = logoRaw;
        }

        const bannerRaw = d.portadaNegocio ?? d.portada_url ?? gen.portadaNegocio;
        const tipoEnvio = gen.tipoEnvio ?? d.tipoEnvio ?? actual.envioTipo;
        const valorEnvioRaw = gen.valorEnvio ?? d.valorEnvio;
        const valorEnvio = tipoEnvio === 'gratis'
            ? 0
            : (valorEnvioRaw !== undefined && valorEnvioRaw !== '' ? (Number(valorEnvioRaw) || 0) : actual.envioValor);

        const agrupRemotas = Array.isArray(gen.agrupacionesWeb) ? gen.agrupacionesWeb : null;
        const gruposMenu = agrupRemotas !== null
            ? agrupRemotas.map(g => ({
                id: g.id || ('grp-' + Date.now()),
                nombre: g.nombre || 'Grupo',
                categorias: Array.isArray(g.hijas) ? g.hijas : (Array.isArray(g.categorias) ? g.categorias : [])
            }))
            : actual.gruposMenu;

        const actualizado = {
            ...actual,
            slug: d.slug || actual.slug,
            nombre: d.nombreNegocio || gen.nombreNegocio || actual.nombre,
            descripcion: (gen.descripcionNegocio !== undefined ? gen.descripcionNegocio : (d.descripcion !== undefined ? d.descripcion : actual.descripcion)),
            whatsapp: d.whatsapp || gen.whatsapp || actual.whatsapp,
            colorPrimario: d.colorPrimario || gen.colorPrimario || actual.colorPrimario,
            bannerImg: bannerRaw !== undefined ? bannerRaw : actual.bannerImg,
            logoImg,
            iconoRapido,
            envioTipo: tipoEnvio || 'gratis',
            envioValor: valorEnvio,
            ocultarSinStock: (gen.ocultarSinStock !== undefined ? !!gen.ocultarSinStock : (d.ocultarSinStock !== undefined ? !!d.ocultarSinStock : actual.ocultarSinStock)),
            gruposMenu,
            ultimaSync: d.updatedAt || actual.ultimaSync
        };

        guardarConfigCatWeb(actualizado);
        actualizarBadgeEstadoNubeCw(true);
        if (document.getElementById('catweb-module-root')) {
            renderizarTodoCatWeb();
        }
    }, (err) => {
        console.warn('Error escuchando vendors/{uid} desde PC:', err);
    });
}

function actualizarBadgeEstadoNubeCw(conectado, textoExtra = '') {
    const badge = document.getElementById('cw-sync-badge');
    const authCtx = obtenerAuthContextoCw();
    const fbCfg = obtenerConfigFirebaseCw();
    const uidMostrar = authCtx.uid || fbCfg.uid;
    if (!badge) return;

    if ((conectado || authCtx.uid) && uidMostrar) {
        badge.classList.add('is-cloud');
        badge.textContent = `● SINCRONIZADO CON CATÁLOGO WEB (UID: ${uidMostrar})${textoExtra ? ' • ' + textoExtra : ''}`;
    } else {
        badge.classList.remove('is-cloud');
        badge.textContent = '● MODO LOCAL-FIRST LISTO PARA NUBE';
    }
}

function conectarPuenteFirebaseCw() {
    const authCtx = obtenerAuthContextoCw();
    const authState = window.CatAlogoAuth?.getState?.();
    const usaAuthUnificado = Boolean(
        window.CAT_ALOGO_CLOUD_CONFIG?.firebaseConfig?.apiKey ||
        (authState && !authState.modoLocalSinFirebase)
    );

    if (authCtx.db && authCtx.uid) {
        if (typeof cwRadarUnsubscribe === 'function') {
            cwRadarUnsubscribe();
            cwRadarUnsubscribe = null;
        }
        cwFirestoreDb = authCtx.db;
        iniciarEscuchaVendorCatWebCw();
        actualizarBadgeEstadoNubeCw(true);
        return true;
    }

    // Esperar a Firebase Auth sin abrir una instancia secundaria sin autenticar
    if (usaAuthUnificado) {
        if (typeof cwRadarUnsubscribe === 'function') {
            cwRadarUnsubscribe();
            cwRadarUnsubscribe = null;
        }
        if (typeof cwVendorUnsubscribe === 'function') {
            cwVendorUnsubscribe();
            cwVendorUnsubscribe = null;
        }
        actualizarBadgeEstadoNubeCw(false);
        return false;
    }

    const fbCfg = obtenerConfigFirebaseCw();
    if (!tieneCredencialesFirebaseCw(fbCfg)) {
        actualizarBadgeEstadoNubeCw(false);
        return false;
    }

    if (typeof window.firebase === 'undefined' || typeof window.firebase.firestore !== 'function') {
        actualizarBadgeEstadoNubeCw(false);
        return false;
    }

    try {
        const appName = 'catAlogoCloudBridge';
        const existente = window.firebase.apps.find(a => a.name === appName);
        if (existente) {
            cwFirestoreDb = existente.firestore();
        } else {
            const app = window.firebase.initializeApp({
                apiKey: fbCfg.apiKey,
                authDomain: fbCfg.authDomain || `${fbCfg.projectId}.firebaseapp.com`,
                projectId: fbCfg.projectId,
                appId: fbCfg.appId || undefined
            }, appName);
            cwFirestoreDb = app.firestore();
        }

        iniciarEscuchaRadarFirestoreCw(fbCfg);
        actualizarBadgeEstadoNubeCw(true);
        return true;
    } catch (err) {
        console.error('Error conectando Firebase:', err);
        actualizarBadgeEstadoNubeCw(false);
        return false;
    }
}

function iniciarEscuchaRadarFirestoreCw(fbCfg) {
    if (!cwFirestoreDb) return;
    if (typeof cwRadarUnsubscribe === 'function') {
        cwRadarUnsubscribe();
        cwRadarUnsubscribe = null;
    }

    cwRadarPrimeraCarga = true;
    const refPedidos = cwFirestoreDb
        .collection(fbCfg.colTiendas || 'vendors')
        .doc(fbCfg.uid)
        .collection(fbCfg.colPedidos || 'orders');

    cwRadarUnsubscribe = refPedidos.onSnapshot(
        (snapshot) => {
            const locales = obtenerPedidosCatWeb();
            const mapa = new Map(locales.map(p => [p.id, p]));
            let entroNuevo = false;

            snapshot.docChanges().forEach((change) => {
                const d = change.doc.data() || {};
                const id = change.doc.id;
                if (change.type === 'removed') return;

                const previo = mapa.get(id);
                if (!previo && !cwRadarPrimeraCarga) entroNuevo = true;

                mapa.set(id, {
                    id,
                    codigo: d.codigo || `#${id.slice(-4).toUpperCase()}`,
                    fecha: d.fecha || d.fechaIso || new Date().toISOString(),
                    estado: d.estado || 'nuevo',
                    clienteNombre: d.clienteNombre || d.cliente || 'Cliente Web',
                    clienteTelefono: d.clienteTelefono || d.telefono || '',
                    modalidad: d.modalidad || d.metodoEntrega || (d.direccion ? 'envio' : 'retiro'),
                    direccion: d.direccion || '',
                    tipoVivienda: d.tipoVivienda || d.tipoEdificacion || '',
                    referencia: d.referencia || d.referencias || '',
                    medioPago: d.medioPago || d.formaPago || 'Efectivo',
                    items: Array.isArray(d.items) ? d.items : (Array.isArray(d.carrito) ? d.carrito : []),
                    subtotal: Number(d.subtotal) || Number(d.total ?? d.totalLiquidado) || 0,
                    costoEnvio: Number(d.costoEnvio) || 0,
                    total: Number(d.total ?? d.totalLiquidado) || 0,
                    ticketPosNumero: d.ticketPosNumero || previo?.ticketPosNumero || null,
                    origenNube: true
                });
            });

            cwRadarPrimeraCarga = false;
            const listaFinal = Array.from(mapa.values()).sort(
                (a, b) => (new Date(b.fecha).getTime() || 0) - (new Date(a.fecha).getTime() || 0)
            );
            guardarPedidosCatWeb(listaFinal);

            if (entroNuevo) reproducirBeepCatWeb();
            if (document.getElementById('catweb-module-root')) {
                renderizarTodoCatWeb();
            }
        },
        (err) => {
            console.warn('Error en listener de pedidos Firestore:', err);
        }
    );
}

async function sincronizarEstadoPedidoEnNubeCw(pedido) {
    if (!cwFirestoreDb || !pedido || !pedido.origenNube) return;
    const fbCfg = obtenerConfigFirebaseCw();
    try {
        await cwFirestoreDb
            .collection(fbCfg.colTiendas || 'vendors')
            .doc(fbCfg.uid)
            .collection(fbCfg.colPedidos || 'orders')
            .doc(pedido.id)
            .set({
                estado: pedido.estado,
                ticketPosNumero: pedido.ticketPosNumero || null,
                actualizadoEn: new Date().toISOString()
            }, { merge: true });
    } catch (err) {
        console.warn('No se pudo reflejar el cambio de estado en Firestore:', err);
    }
}

/* --- SINCRONIZAR BÓVEDA → NUBE (VENDORS/{UID} + VENDORS/{UID}/PRODUCTS) --- */
async function ejecutarSincronizacionBovedaNubeCw() {
    const btn = document.getElementById('btn-cw-sincronizar');
    const txtOrig = btn ? btn.textContent : '☁️ Sincronizar Bóveda → Nube';

    const authCtx = obtenerAuthContextoCw();
    const cfg = obtenerConfigCatWeb();
    const productos = obtenerProductosCatWeb();
    const visibles = productos.filter(p => esProductoVisibleWebCw(p, cfg));

    if (!authCtx.db || !authCtx.uid) {
        alert('☁️ Inicia sesión con tu cuenta en Ajustes → Nube & Sincronización para publicar tu tienda en el catálogo web.');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Publicando tienda y productos...';
    }

    try {
        // 1. Publicar toda la personalización de tienda en vendors/{uid}
        await publicarPersonalizacionEnVendorsCw(cfg);

        // 2. Publicar productos visibles y despublicar los ocultos en vendors/{uid}/products
        const productsCol = authCtx.db.collection('vendors').doc(authCtx.uid).collection('products');
        const ahoraIso = new Date().toISOString();

        for (let i = 0; i < productos.length; i += 350) {
            const chunk = productos.slice(i, i + 350);
            const batch = authCtx.db.batch();

            for (const p of chunk) {
                const esVis = esProductoVisibleWebCw(p, cfg);
                const pRef = productsCol.doc(String(p.id));

                if (!esVis) {
                    batch.set(pRef, { publicado: false, updatedAt: ahoraIso }, { merge: true });
                    continue;
                }

                let imgUrl = (Array.isArray(p.imagenes) && p.imagenes[0]) ? p.imagenes[0] : (p.imagen_url || '');
                if (imgUrl && imgUrl.startsWith('data:image/')) {
                    imgUrl = await subirDataUrlAStorageVendorCw(authCtx.storage, authCtx.uid, `products/${p.id}.webp`, imgUrl, 800, 80);
                }

                const fam = String(p.familiaMedicion || '').toLowerCase();
                batch.set(pRef, {
                    id: String(p.id),
                    nombre: p.nombre || 'Producto',
                    descripcion: p.descripcion || '',
                    precio: Number(p.precioNormal) || 0,
                    precioOferta: Number(p.precioOferta) || 0,
                    stock: Number(p.stock) || 0,
                    categoria: (p.categoria || 'General').trim() || 'General',
                    imagen_url: imgUrl,
                    imagenUrl: imgUrl,
                    unidadMedida: p.unidadMedida || 'Unidad',
                    unidadVenta: p.unidadMedida || 'Unidad',
                    aceptaDecimales: fam === 'peso' || fam === 'longitud',
                    publicado: true,
                    updatedAt: ahoraIso
                }, { merge: true });
            }

            await batch.commit();
        }

        cfg.ultimaSync = ahoraIso;
        guardarConfigCatWeb(cfg);
        renderizarTodoCatWeb();
        actualizarBadgeEstadoNubeCw(true);

        alert(`☁️ ¡Tienda Web actualizada con éxito!\n• Personalización y envío publicados en vendors/${authCtx.uid}\n• ${visibles.length} productos visibles online.`);
    } catch (err) {
        console.error('Error al sincronizar Cat-Web:', err);
        alert(`⚠️ Error al sincronizar con Firebase:\n${err.message || err}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = txtOrig;
        }
    }
}

function abrirModalNubeCw() {
    const modal = document.getElementById('modal-cw-nube');
    if (!modal) return;

    const c = obtenerConfigFirebaseCw();
    const authCtx = obtenerAuthContextoCw();
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
    setVal('cw-fb-json', '');
    setVal('cw-fb-apikey', c.apiKey);
    setVal('cw-fb-projectid', c.projectId);
    setVal('cw-fb-authdomain', c.authDomain);
    setVal('cw-fb-appid', c.appId);
    setVal('cw-fb-uid', authCtx.uid || c.uid);
    setVal('cw-fb-col-tiendas', c.colTiendas || 'vendors');
    setVal('cw-fb-col-pedidos', c.colPedidos || 'orders');
    setVal('cw-fb-webp-maxkb', c.webpMaxKb || 80);

    const chkWebp = document.getElementById('cw-fb-webp-activo');
    if (chkWebp) chkWebp.checked = c.webpActivo !== false;

    const box = document.getElementById('cw-cloud-status-box');
    if (box) {
        if (authCtx.uid) {
            box.className = 'cw-cloud-log is-ok';
            box.textContent = `✅ Conectado automáticamente con tu cuenta (vendors/${authCtx.uid}).`;
        } else if (cwFirestoreDb && tieneCredencialesFirebaseCw(c)) {
            box.className = 'cw-cloud-log is-ok';
            box.textContent = `✅ Conectado a Firestore (${c.projectId}) • Ruta: ${c.colTiendas}/${c.uid}`;
        } else {
            box.className = 'cw-cloud-log';
            box.textContent = 'Estado: Modo Local-First (inicia sesión en Ajustes → Nube para conectar automáticamente).';
        }
    }

    modal.classList.add('active');
}

function enlazarEventosCatWebEtapa3() {
    const root = document.getElementById('catweb-module-root');
    if (!root || root.dataset.cwE3Bound) return;
    root.dataset.cwE3Bound = '1';

    const btnSync = document.getElementById('btn-cw-sincronizar');
    if (btnSync) {
        const clon = btnSync.cloneNode(true);
        btnSync.parentNode.replaceChild(clon, btnSync);
        clon.addEventListener('click', ejecutarSincronizacionBovedaNubeCw);
    }

    document.getElementById('btn-cw-config-nube')?.addEventListener('click', abrirModalNubeCw);

    const modal = document.getElementById('modal-cw-nube');
    const cerrar = () => modal?.classList.remove('active');
    document.getElementById('btn-cw-cerrar-nube')?.addEventListener('click', cerrar);
    document.getElementById('btn-cw-cancelar-nube')?.addEventListener('click', cerrar);
    modal?.addEventListener('click', (e) => { if (e.target === modal) cerrar(); });

    document.getElementById('cw-fb-json')?.addEventListener('input', (e) => {
        const raw = e.target.value.trim();
        if (!raw.startsWith('{')) return;
        try {
            const parsed = JSON.parse(raw);
            if (parsed.apiKey) document.getElementById('cw-fb-apikey').value = parsed.apiKey;
            if (parsed.projectId) document.getElementById('cw-fb-projectid').value = parsed.projectId;
            if (parsed.authDomain) document.getElementById('cw-fb-authdomain').value = parsed.authDomain;
            if (parsed.appId) document.getElementById('cw-fb-appid').value = parsed.appId;
        } catch { /* esperando JSON */ }
    });

    document.getElementById('form-cw-nube')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const nuevaCfg = {
            apiKey: (document.getElementById('cw-fb-apikey')?.value || '').trim(),
            projectId: (document.getElementById('cw-fb-projectid')?.value || '').trim(),
            authDomain: (document.getElementById('cw-fb-authdomain')?.value || '').trim(),
            appId: (document.getElementById('cw-fb-appid')?.value || '').trim(),
            uid: (document.getElementById('cw-fb-uid')?.value || '').trim(),
            colTiendas: (document.getElementById('cw-fb-col-tiendas')?.value || 'vendors').trim(),
            colPedidos: (document.getElementById('cw-fb-col-pedidos')?.value || 'orders').trim(),
            webpActivo: !!document.getElementById('cw-fb-webp-activo')?.checked,
            webpMaxKb: Math.max(25, parseInt(document.getElementById('cw-fb-webp-maxkb')?.value, 10) || 80)
        };

        guardarConfigFirebaseCw(nuevaCfg);
        const ok = conectarPuenteFirebaseCw();
        cerrar();

        if (ok) {
            alert(`✅ Puente Firebase conectado correctamente.\nYa puedes presionar "☁️ Sincronizar Bóveda → Nube" para publicar tu catálogo.`);
        } else {
            alert('⚠️ Configuración guardada, pero faltan campos obligatorios.');
        }
    });

    document.getElementById('btn-cw-fb-desconectar')?.addEventListener('click', () => {
        if (!confirm('¿Desconectar Firebase manual?')) return;
        if (typeof cwRadarUnsubscribe === 'function') {
            cwRadarUnsubscribe();
            cwRadarUnsubscribe = null;
        }
        cwFirestoreDb = null;
        localStorage.removeItem(STORAGE_KEY_CW_FIREBASE);
        actualizarBadgeEstadoNubeCw(false);
        cerrar();
    });
}

const _facturarPedidoE2 = facturarPedidoWebEnPosCw;
facturarPedidoWebEnPosCw = function (pedidoId) {
    _facturarPedidoE2(pedidoId);
    const ped = obtenerPedidosCatWeb().find(p => p.id === pedidoId);
    if (ped) sincronizarEstadoPedidoEnNubeCw(ped);
};

/* ==========================================================================
   RADAR PRO: BORRADO SEGURO, FILTRO HOY+PENDIENTES, COMPACTOS Y PAGINACIÓN
   ========================================================================== */
Object.assign(window.cwState, {
    radarRango: 'hoy_pendientes',
    radarSearch: '',
    radarLimite: 10
});

function fechaLocalYmdCw(isoStr) {
    const d = new Date(isoStr || Date.now());
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-CA');
}

function esPedidoActivoProtegidoCw(pedido) {
    return pedido && (pedido.estado === 'nuevo' || pedido.estado === 'preparando' || pedido.estado === 'facturado');
}

function puedeEliminarPedidoCw(pedido) {
    return pedido && (pedido.estado === 'cancelado' || pedido.estado === 'despachado');
}

async function borrarDocumentoPedidoNubeCw(pedido) {
    if (!cwFirestoreDb || !pedido || !pedido.origenNube) return;
    const fbCfg = obtenerConfigFirebaseCw();
    try {
        await cwFirestoreDb
            .collection(fbCfg.colTiendas || 'vendors')
            .doc(fbCfg.uid)
            .collection(fbCfg.colPedidos || 'orders')
            .doc(pedido.id)
            .delete();
    } catch (err) {
        console.warn('No se pudo eliminar el pedido en Firestore:', err);
    }
}

async function eliminarPedidoRadarCw(pedidoId) {
    const pedidos = obtenerPedidosCatWeb();
    const ped = pedidos.find(p => p.id === pedidoId);
    if (!ped) return;

    if (!puedeEliminarPedidoCw(ped)) {
        alert('🔒 Por seguridad, solo puedes eliminar pedidos que ya estén CANCELADOS o DESPACHADOS.');
        return;
    }

    const avisoContable = ped.estado === 'despachado'
        ? '\n\nNota: El ticket y el dinero registrados en POS y Finanzas NO se borran; solo se limpia del Radar.'
        : '';

    if (!confirm(`🗑️ ¿Eliminar ${ped.codigo} (${ped.clienteNombre}) de la lista del Radar?${avisoContable}`)) {
        return;
    }

    const restantes = pedidos.filter(p => p.id !== pedidoId);
    guardarPedidosCatWeb(restantes);
    await borrarDocumentoPedidoNubeCw(ped);

    document.getElementById('modal-cw-ticket')?.classList.remove('active');
    renderizarTodoCatWeb();
}

async function limpiarPedidosCerradosRadarCw() {
    const pedidos = obtenerPedidosCatWeb();
    const cancelados = pedidos.filter(p => p.estado === 'cancelado');
    const despachados = pedidos.filter(p => p.estado === 'despachado');

    if (cancelados.length === 0 && despachados.length === 0) {
        alert('✅ No hay pedidos cancelados ni despachados para limpiar. Los pedidos activos están protegidos.');
        return;
    }

    const opcion = prompt(
        `🧹 LIMPIEZA SEGURA DEL RADAR\n` +
        `(Los pedidos Nuevos, Preparando y Facturados NUNCA se borran)\n\n` +
        `Escribe el número de opción:\n` +
        `1 — Borrar solo CANCELADOS (${cancelados.length})\n` +
        `2 — Borrar solo DESPACHADOS (${despachados.length})\n` +
        `3 — Borrar TODOS los cerrados (${cancelados.length + despachados.length})`,
        cancelados.length > 0 ? '1' : '2'
    );
    if (!opcion) return;

    const op = opcion.trim();
    let aBorrar = [];
    if (op === '1') aBorrar = cancelados;
    else if (op === '2') aBorrar = despachados;
    else if (op === '3') aBorrar = [...cancelados, ...despachados];
    else return;

    if (aBorrar.length === 0) {
        alert('No había pedidos en esa categoría para limpiar.');
        return;
    }

    const idsBorrar = new Set(aBorrar.map(p => p.id));
    const restantes = pedidos.filter(p => !idsBorrar.has(p.id));
    guardarPedidosCatWeb(restantes);

    for (const p of aBorrar) {
        if (p.origenNube) await borrarDocumentoPedidoNubeCw(p);
    }

    renderizarTodoCatWeb();
    alert(`✅ Se limpiaron ${aBorrar.length} pedido(s) del Radar.`);
}

function renderizarRadarPedidosCw() {
    const listEl = document.getElementById('cw-radar-list');
    if (!listEl) return;

    const todosPedidos = obtenerPedidosCatWeb();
    const rango = window.cwState.radarRango || 'hoy_pendientes';
    const q = (window.cwState.radarSearch || '').trim().toLowerCase();
    const tab = window.cwState.radarTab || 'todos';
    const hoyYmd = fechaLocalYmdCw(new Date().toISOString());
    const ahoraMs = Date.now();

    const base = todosPedidos.filter(p => {
        if (rango === 'hoy_pendientes') {
            if (!esPedidoActivoProtegidoCw(p) && fechaLocalYmdCw(p.fecha) !== hoyYmd) return false;
        } else if (rango === '7dias') {
            const ts = new Date(p.fecha).getTime() || 0;
            if (!esPedidoActivoProtegidoCw(p) && (ahoraMs - ts) > 7 * 86400000) return false;
        }

        if (q) {
            const corpus = `${p.codigo || ''} ${p.clienteNombre || ''} ${p.clienteTelefono || ''} ${p.ticketPosNumero || ''}`.toLowerCase();
            if (!corpus.includes(q)) return false;
        }
        return true;
    });

    const cntPend = base.filter(p => p.estado === 'nuevo' || p.estado === 'preparando').length;
    const cntFact = base.filter(p => p.estado === 'facturado').length;
    const cntDesp = base.filter(p => p.estado === 'despachado').length;
    const cntCanc = base.filter(p => p.estado === 'cancelado').length;

    const setTxt = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    setTxt('cw-rcnt-todos', base.length);
    setTxt('cw-rcnt-pendientes', cntPend);
    setTxt('cw-rcnt-facturados', cntFact);
    setTxt('cw-rcnt-despachados', cntDesp);
    setTxt('cw-rcnt-cancelados', cntCanc);

    const filtrados = base.filter(p => {
        if (tab === 'pendientes') return p.estado === 'nuevo' || p.estado === 'preparando';
        if (tab === 'facturados') return p.estado === 'facturado';
        if (tab === 'despachados') return p.estado === 'despachado';
        if (tab === 'cancelados') return p.estado === 'cancelado';
        return true;
    });

    if (filtrados.length === 0) {
        listEl.innerHTML = `
            <div class="cw-empty-radar">
                <div class="cw-empty-ico">📡</div>
                <strong>No hay pedidos en esta vista</strong>
                <p>Prueba cambiar el rango de fecha arriba o presiona <strong>🧪 Simular Pedido</strong> para generar una orden de prueba.</p>
            </div>
        `;
        return;
    }

    const etiquetasEstado = {
        nuevo: 'NUEVO',
        preparando: 'PREPARANDO',
        facturado: 'FACTURADO POS',
        despachado: 'DESPACHADO',
        cancelado: 'CANCELADO'
    };

    const limite = Math.max(10, window.cwState.radarLimite || 10);
    const visibles = filtrados.slice(0, limite);
    const restantes = filtrados.length - visibles.length;

    let html = visibles.map(p => {
        const horaTxt = new Date(p.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

        if (puedeEliminarPedidoCw(p)) {
            return `
                <article class="cw-order-compact st-${escaparHtmlCw(p.estado)}" data-oid="${escaparHtmlCw(p.id)}">
                    <div class="cw-compact-left">
                        <strong>${escaparHtmlCw(p.codigo)}</strong>
                        <span class="cw-st-pill st-${escaparHtmlCw(p.estado)}">${etiquetasEstado[p.estado]}</span>
                        ${p.ticketPosNumero ? `<span class="cw-soft-pill">🧾 ${escaparHtmlCw(p.ticketPosNumero)}</span>` : ''}
                        <span class="cw-compact-meta"><strong>${escaparHtmlCw(p.clienteNombre)}</strong> • ${horaTxt} • ${(p.items || []).length} ítem(s)</span>
                    </div>
                    <div class="cw-compact-right">
                        <span class="cw-compact-total">${formatearArsCw(p.total)}</span>
                        <button type="button" class="cw-btn cw-btn-light cw-btn-xs-compact" data-oact="ticket">🧾 Ticket</button>
                        <button type="button" class="cw-btn cw-btn-danger-soft cw-btn-xs-compact" data-oact="eliminar" title="Eliminar del Radar">🗑️ Eliminar</button>
                    </div>
                </article>
            `;
        }

        const yaFacturado = p.estado === 'facturado';
        const itemsHtml = (p.items || []).map(it =>
            `<div class="cw-order-item-line"><span>${it.cantidad}× ${escaparHtmlCw(it.nombre)}</span><strong>${formatearArsCw(it.precioUnit * it.cantidad)}</strong></div>`
        ).join('');

        return `
            <article class="cw-order-card st-${escaparHtmlCw(p.estado)}" data-oid="${escaparHtmlCw(p.id)}">
                <div class="cw-order-top">
                    <div class="cw-order-id-group">
                        <strong>${escaparHtmlCw(p.codigo)}</strong>
                        <span class="cw-st-pill st-${escaparHtmlCw(p.estado)}">${etiquetasEstado[p.estado] || p.estado}</span>
                        ${p.ticketPosNumero ? `<span class="cw-soft-pill">🧾 ${escaparHtmlCw(p.ticketPosNumero)}</span>` : ''}
                        <span style="font-size:0.71rem; color:#64748b;">🕒 ${horaTxt}</span>
                    </div>
                    <div class="cw-order-total-box">
                        <strong>${formatearArsCw(p.total)}</strong>
                        <small>${escaparHtmlCw(p.medioPago || 'Efectivo')}</small>
                    </div>
                </div>

                <div class="cw-order-meta-grid">
                    <div>
                        <small>Cliente</small>
                        <strong>${escaparHtmlCw(p.clienteNombre)}</strong> • ${escaparHtmlCw(p.clienteTelefono || 'Sin tel.')}
                    </div>
                    <div>
                        <small>Logística</small>
                        ${p.modalidad === 'envio'
                            ? `🛵 <strong>Envío:</strong> ${escaparHtmlCw(p.direccion)} ${p.costoEnvio > 0 ? `(+${formatearArsCw(p.costoEnvio)})` : '(Gratis)'}`
                            : `🏪 <strong>Retiro en Local</strong>`}
                    </div>
                </div>

                <div class="cw-order-items-mini">${itemsHtml}</div>

                <div class="cw-order-actions">
                    <div class="cw-order-actions-left">
                        <button type="button" class="cw-btn cw-btn-light cw-btn-sm" data-oact="ticket">🧾 Ver Ticket</button>
                        <button type="button" class="cw-btn cw-btn-light cw-btn-sm" data-oact="comanda">🖨️ Comanda</button>
                        <button type="button" class="cw-btn cw-btn-light cw-btn-sm" data-oact="wa-camino">💬 Avisar WhatsApp</button>
                    </div>
                    <div class="cw-order-actions-right">
                        ${!yaFacturado ? `
                            <button type="button" class="cw-btn cw-btn-danger-soft cw-btn-sm" data-oact="cancelar">✕ Cancelar</button>
                            <button type="button" class="cw-btn cw-btn-primary cw-btn-sm" data-oact="facturar">🏪 Confirmar y Facturar en POS</button>
                        ` : `
                            <button type="button" class="cw-btn cw-btn-indigo cw-btn-sm" data-oact="despachar">📦 Marcar Despachado</button>
                        `}
                    </div>
                </div>
            </article>
        `;
    }).join('');

    if (restantes > 0) {
        html += `
            <div class="cw-radar-more-wrap">
                <button type="button" class="cw-btn cw-btn-light cw-btn-sm" id="btn-cw-radar-ver-mas">
                    ⬇️ Ver más pedidos (${restantes} restantes)
                </button>
            </div>
        `;
    }

    listEl.innerHTML = html;
}

const _abrirModalTicketE2 = abrirModalTicketWebCw;
abrirModalTicketWebCw = function (pedidoId) {
    _abrirModalTicketE2(pedidoId);
    const ped = obtenerPedidosCatWeb().find(p => p.id === pedidoId);
    const foot = document.getElementById('cw-tk-footer');
    if (ped && foot && puedeEliminarPedidoCw(ped)) {
        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'cw-btn cw-btn-danger-soft';
        btnDel.setAttribute('data-tk-act', 'eliminar');
        btnDel.textContent = '🗑️ Eliminar del Radar';
        foot.prepend(btnDel);
    }
};

function enlazarEventosRadarProCw() {
    const root = document.getElementById('catweb-module-root');
    if (!root || root.dataset.cwRadarProBound) return;
    root.dataset.cwRadarProBound = '1';

    document.getElementById('btn-cw-limpiar-cerrados')?.addEventListener('click', limpiarPedidosCerradosRadarCw);

    const selRango = document.getElementById('cw-radar-rango');
    if (selRango) {
        selRango.value = window.cwState.radarRango || 'hoy_pendientes';
        selRango.addEventListener('change', (e) => {
            window.cwState.radarRango = e.target.value;
            window.cwState.radarLimite = 10;
            renderizarRadarPedidosCw();
        });
    }

    const inpSearch = document.getElementById('cw-radar-search');
    if (inpSearch) {
        inpSearch.value = window.cwState.radarSearch || '';
        inpSearch.addEventListener('input', (e) => {
            window.cwState.radarSearch = e.target.value;
            window.cwState.radarLimite = 10;
            renderizarRadarPedidosCw();
        });
    }

    document.getElementById('cw-radar-list')?.addEventListener('click', (e) => {
        if (e.target.closest('#btn-cw-radar-ver-mas')) {
            window.cwState.radarLimite = (window.cwState.radarLimite || 10) + 10;
            renderizarRadarPedidosCw();
            return;
        }

        const btn = e.target.closest('[data-oact]');
        if (!btn) return;
        const oid = btn.closest('[data-oid]')?.getAttribute('data-oid');
        if (!oid) return;
        const act = btn.getAttribute('data-oact');

        if (act === 'eliminar') {
            eliminarPedidoRadarCw(oid);
        } else if (act === 'ticket' && btn.closest('.cw-order-compact')) {
            abrirModalTicketWebCw(oid);
        }
    });

    document.getElementById('cw-radar-list')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-oact="despachar"], [data-oact="cancelar"]');
        if (!btn) return;
        const oid = btn.closest('[data-oid]')?.getAttribute('data-oid');
        if (!oid) return;
        setTimeout(() => {
            const ped = obtenerPedidosCatWeb().find(p => p.id === oid);
            if (ped) sincronizarEstadoPedidoEnNubeCw(ped);
        }, 50);
    });

    document.getElementById('cw-tk-footer')?.addEventListener('click', (e) => {
        const btnDel = e.target.closest('[data-tk-act="eliminar"]');
        if (btnDel && window.cwState.ticketActivoId) {
            eliminarPedidoRadarCw(window.cwState.ticketActivoId);
        }
    });
}

// Conectar escucha en vivo apenas inicia sesión o carga la página
const _renderizarTodoCwBase = renderizarTodoCatWeb;
renderizarTodoCatWeb = function () {
    _renderizarTodoCwBase();
    renderizarRadarPedidosCw();
};

const _inicializarCatWebBase = inicializarCatWeb;
inicializarCatWeb = function () {
    _inicializarCatWebBase();
    enlazarEventosCatWebEtapa2();
    enlazarEventosCatWebEtapa3();
    enlazarEventosRadarProCw();
    conectarPuenteFirebaseCw();
    renderizarRadarPedidosCw();
};

if (!window._cwAuthVendorListener) {
    window.addEventListener('cat-alogo:auth-cambiado', conectarPuenteFirebaseCw);
    window.addEventListener('cat-alogo:suscripcion-actualizada', conectarPuenteFirebaseCw);
    document.addEventListener('DOMContentLoaded', conectarPuenteFirebaseCw);
    window._cwAuthVendorListener = true;
}
