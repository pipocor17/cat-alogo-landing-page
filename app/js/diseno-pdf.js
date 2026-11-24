/* ==========================================================================
   MÓDULO: ESTUDIO DE DISEÑO PDF (WYSIWYG) - COMPLETO (ETAPAS 1 A 4 + FASES 1 A 3)
   ========================================================================== */

const STORAGE_KEY_PDF_CONFIG = 'cat_alogo_pdf_config_v1';
const STORAGE_KEY_PDF_PLANTILLAS = 'cat_alogo_pdf_plantillas_v1';

const ETIQUETAS_CAPAS_PDF = {
    imagen: '🖼️ Fotografía del Producto',
    titulo: '🏷️ Título y Código SKU',
    descripcion: '📝 Descripción Corta',
    precio: '💲 Precio y Oferta',
    stock: '📦 Stock Disponible'
};

function obtenerFechaIsoOffsetPdf(dias = 0) {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function formatearFechaVisiblePdf(isoStr) {
    if (!isoStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return '';
    const [y, m, d] = isoStr.split('-');
    return `${d}/${m}/${y}`;
}

function svgADataUrlPdf(svgStr) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr.trim())}`;
}

function esColorOscuroPdf(hexColor) {
    const hex = String(hexColor || '#ffffff').replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return false;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminancia < 0.52;
}

const LOGOS_GENERICOS_PDF = {
    tienda: {
        nombre: 'Tienda',
        dataUrl: svgADataUrlPdf(`
            <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 100 100">
                <rect width="100" height="100" rx="22" fill="#0f766e"/>
                <path d="M28 38h44l-4 40H32l-4-40z" fill="none" stroke="#ffffff" stroke-width="5.5" stroke-linejoin="round"/>
                <path d="M38 38v-6a12 12 0 0 1 24 0v6" fill="none" stroke="#ffffff" stroke-width="5.5" stroke-linecap="round"/>
                <circle cx="42" cy="52" r="3" fill="#ffffff"/>
                <circle cx="58" cy="52" r="3" fill="#ffffff"/>
            </svg>
        `)
    },
    natural: {
        nombre: 'Natural',
        dataUrl: svgADataUrlPdf(`
            <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 100 100">
                <rect width="100" height="100" rx="22" fill="#16a34a"/>
                <path d="M26 70c2-26 18-42 48-44-2 30-18 46-44 46" fill="none" stroke="#ffffff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M28 72L56 44" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>
            </svg>
        `)
    },
    estrella: {
        nombre: 'Destacado',
        dataUrl: svgADataUrlPdf(`
            <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 100 100">
                <rect width="100" height="100" rx="22" fill="#d97706"/>
                <polygon points="50,20 59,39 80,42 65,56 69,77 50,67 31,77 35,56 20,42 41,39" fill="#ffffff"/>
            </svg>
        `)
    },
    boutique: {
        nombre: 'Boutique',
        dataUrl: svgADataUrlPdf(`
            <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 100 100">
                <rect width="100" height="100" rx="22" fill="#2563eb"/>
                <polygon points="32,28 68,28 80,45 50,78 20,45" fill="none" stroke="#ffffff" stroke-width="5.5" stroke-linejoin="round"/>
                <line x1="20" y1="45" x2="80" y2="45" stroke="#ffffff" stroke-width="4.5"/>
                <polyline points="38,28 50,45 62,28" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linejoin="round"/>
            </svg>
        `)
    },
    mayorista: {
        nombre: 'Mayorista',
        dataUrl: svgADataUrlPdf(`
            <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 100 100">
                <rect width="100" height="100" rx="22" fill="#1e293b"/>
                <polygon points="50,20 78,35 78,65 50,80 22,65 22,35" fill="none" stroke="#ffffff" stroke-width="5.5" stroke-linejoin="round"/>
                <polyline points="22,35 50,50 78,35" fill="none" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"/>
                <line x1="50" y1="50" x2="50" y2="80" stroke="#ffffff" stroke-width="5"/>
            </svg>
        `)
    }
};

const PDF_CONFIG_BASE = {
    // Contenido
    precioModo: 'publico',
    orden: 'categoria',
    ocultarSinStock: false,
    soloOfertas: false,
    showCatHeaders: false,
    categoriasExcluidas: [],

    // Geometría e imagen
    orientacion: 'portrait',
    columnas: 3,
    margenMm: 12,
    gapPx: 12,
    imgHeightPx: 145,
    imgWidthPct: 40,
    radiusPx: 8,
    imgRadiusPx: 6,
    escalaGlobal: 100,
    aspectoFoto: 'contain',
    imgAlign: 'center',
    textAlign: 'left',
    colorImgBg: '#f8fafc',

    // Tipografía y colores
    fontFamily: "'Inter', sans-serif",
    sizeTitulo: 13,
    sizePrecio: 16,
    sizeDesc: 10,
    sizeSku: 9,
    sizeStock: 9,
    colorTitulo: '#0f172a',
    colorPrecio: '#0f766e',
    colorDesc: '#64748b',
    colorSku: '#475569',
    colorStock: '#047857',
    colorStockBg: '#ecfdf5',

    // Branding, Fondos Avanzados y B&N
    modoGrises: false,
    colorAcento: '#0f766e',
    colorHoja: '#ffffff',
    hojaBgTipo: 'solid',           // 'solid' | 'gradient' | 'image'
    colorHoja2: '#e2e8f0',
    hojaGradDir: '180deg',
    hojaBgImg: '',
    hojaBgOpacity: 40,
    colorCard: '#ffffff',
    cardBgTipo: 'solid',           // 'solid' | 'gradient' | 'image'
    colorCard2: '#f1f5f9',
    cardGradDir: '180deg',
    cardBgImg: '',
    cardBgOpacity: 40,
    colorBorde: '#e2e8f0',
    borderStyle: 'solid',
    borderWidth: 1,

    // Capas, cabecera y pie
    showSku: true,
    showDesc: true,
    showStock: true,
    showOferta: true,
    showUnitPrice: true,
    ordenCapas: ['imagen', 'titulo', 'descripcion', 'precio', 'stock'],
    headerNombre: 'CAT-ALOGO STORE',
    headerSub: 'CATÁLOGO COMERCIAL & PRECIOS VIGENTES',
    headerContacto: 'WhatsApp: +54 9 351 000-0000 • Envíos a todo el país',
    headerValidez: 'Precios vigentes • Sujeto a stock',
    footerTexto: 'Catálogo generado en Bóveda Local',

    // Carátula, logos, fechas y colores independientes
    logoDataUrl: '',
    logoOrigen: '',                // '' | 'custom' | 'generic:tienda' ...
    fechaCreacion: obtenerFechaIsoOffsetPdf(0),
    fechaValidez: obtenerFechaIsoOffsetPdf(30),

    // Portada (Hoja 1)
    incluirPortada: false,
    portadaEstilo: 'moderna',      // 'moderna' | 'editorial' | 'minimal'
    colorPortadaTitulo: '#0f172a',
    colorPortadaTexto: '#475569',
    portadaTitulo: 'Catálogo de Productos',
    portadaSub: 'Nueva Colección & Lista de Precios',
    portadaEslogan: '¡Calidad garantizada y atención personalizada!',

    // Hoja de Cierre (colores propios + recuadro personalizable)
    incluirCierre: false,
    colorCierreTitulo: '#0f172a',
    colorCierreTexto: '#475569',
    colorCierreCard: '#ffffff',
    colorCierreBorde: '#e2e8f0',
    cierreTitulo: '¡Gracias por elegirnos!',
    cierreMensaje: 'Consultá disponibilidad y realizá tu pedido directo por WhatsApp. Envíos rápidos y atención personalizada.',
    cierrePagos: 'Efectivo, Transferencia (Alias: MiTienda.OK) y Tarjetas',
    cierreEnvios: 'Envíos a domicilio en el día • Retiro por local sin cargo',
    cierreRedes: 'Instagram: @mitienda • Web: cat-alogo.store'
};

const PLANTILLAS_PREDEFINIDAS_PDF = {
    comercial: {
        nombre: '📄 Comercial Estándar',
        cambios: {
            orientacion: 'portrait', columnas: 3, aspectoFoto: 'contain', imgHeightPx: 145,
            radiusPx: 8, modoGrises: false, colorAcento: '#0f766e', colorPrecio: '#0f766e',
            colorHoja: '#ffffff', hojaBgTipo: 'solid', colorCard: '#ffffff', cardBgTipo: 'solid',
            fontFamily: "'Inter', sans-serif", borderStyle: 'solid', borderWidth: 1,
            incluirPortada: false, incluirCierre: false
        }
    },
    mayorista: {
        nombre: '📋 Lista Mayorista Compacta',
        cambios: {
            orientacion: 'portrait', columnas: 1, aspectoFoto: 'none', precioModo: 'mayorista',
            showCatHeaders: true, orden: 'categoria', gapPx: 6, radiusPx: 6,
            modoGrises: false, colorAcento: '#1e3a8a', colorPrecio: '#1e3a8a',
            hojaBgTipo: 'solid', cardBgTipo: 'solid', borderStyle: 'solid', borderWidth: 1,
            fontFamily: "monospace"
        }
    },
    editorial: {
        nombre: '✨ Editorial Boutique (Con Portada)',
        cambios: {
            orientacion: 'portrait', columnas: 2, aspectoFoto: 'cover', imgHeightPx: 195,
            radiusPx: 14, gapPx: 16, colorAcento: '#1e293b', colorPrecio: '#b45309',
            colorHoja: '#fafaf9', hojaBgTipo: 'solid', colorCard: '#ffffff', cardBgTipo: 'solid',
            fontFamily: "'Playfair Display', serif", borderStyle: 'solid', borderWidth: 1,
            colorPortadaTitulo: '#ffffff', colorPortadaTexto: '#e2e8f0',
            colorCierreTitulo: '#1e293b', colorCierreTexto: '#475569',
            colorCierreCard: '#ffffff', colorCierreBorde: '#e2e8f0',
            incluirPortada: true, portadaEstilo: 'editorial', incluirCierre: true, modoGrises: false
        }
    },
    economica: {
        nombre: '🖨️ Impresión Económica (B&N)',
        cambios: {
            orientacion: 'portrait', columnas: 3, aspectoFoto: 'contain', imgHeightPx: 120,
            modoGrises: true, colorHoja: '#ffffff', hojaBgTipo: 'solid', colorCard: '#ffffff', cardBgTipo: 'solid',
            colorBorde: '#cbd5e1', colorAcento: '#111827', colorPrecio: '#111827',
            borderStyle: 'solid', borderWidth: 1, incluirPortada: false, incluirCierre: false
        }
    }
};

window.pdfConfig = { ...PDF_CONFIG_BASE };

window.pdfViewerState = {
    paginaActual: 1,
    totalPaginas: 1,
    hojasVisibles: 1,
    zoom: 75
};

window.pdfHistory = {
    stack: [],
    index: -1,
    timer: null
};

let pdfShortcutsRegistrados = false;

function inicializarDisenoPdf() {
    asegurarGoogleFontsPdf();
    cargarConfigPdfGuardada();
    reiniciarHistorialPdf();
    renderizarLogosGenericosPdf();
    sincronizarControlesDesdeConfig();
    renderizarSelectorPlantillasPdf();
    renderizarChecklistCategoriasPdf();
    renderizarListaOrdenCapasPdf();
    inicializarEventosDisenoPdf();
    renderizarVisorPdf();
}

function asegurarGoogleFontsPdf() {
    if (document.getElementById('cat-alogo-google-fonts-pdf')) return;
    const link = document.createElement('link');
    link.id = 'cat-alogo-google-fonts-pdf';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Montserrat:wght@400;600;700&family=Playfair+Display:wght@500;700&family=Poppins:wght@400;600;700&family=Roboto:wght@400;500;700&display=swap';
    document.head.appendChild(link);
}

function clonarConfigPdf(cfg) {
    return JSON.parse(JSON.stringify(cfg));
}

function cargarConfigPdfGuardada() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_PDF_CONFIG) || 'null');
        if (saved && typeof saved === 'object') {
            window.pdfConfig = { ...PDF_CONFIG_BASE, ...saved };
            if (!Array.isArray(window.pdfConfig.ordenCapas) || window.pdfConfig.ordenCapas.length !== 5) {
                window.pdfConfig.ordenCapas = [...PDF_CONFIG_BASE.ordenCapas];
            }
            if (!Array.isArray(window.pdfConfig.categoriasExcluidas)) {
                window.pdfConfig.categoriasExcluidas = [];
            }
        }
    } catch (err) {
        console.warn('No se pudo leer configuración previa de PDF:', err);
    }
}

function guardarConfigPdf(registrarEnHistorial = true) {
    try {
        localStorage.setItem(STORAGE_KEY_PDF_CONFIG, JSON.stringify(window.pdfConfig));
    } catch (err) {
        console.warn('No se pudo guardar configuración de PDF:', err);
    }
    if (registrarEnHistorial) {
        programarSnapshotHistorialPdf();
    }
}

/* ==========================================================================
   LOGOS GENÉRICOS (5 ESTILOS) Y VISTA PREVIA EN VIVO
   ========================================================================== */
function renderizarLogosGenericosPdf() {
    const grid = document.getElementById('pdf-generic-logos-grid');
    if (!grid) return;

    grid.innerHTML = Object.entries(LOGOS_GENERICOS_PDF).map(([key, item]) => `
        <button type="button" class="pdf-generic-logo-btn" data-logo-key="${key}" title="Usar logo ${escaparHtmlPdf(item.nombre)}">
            <img src="${item.dataUrl}" alt="${escaparHtmlPdf(item.nombre)}">
            <span>${escaparHtmlPdf(item.nombre)}</span>
        </button>
    `).join('');

    grid.querySelectorAll('.pdf-generic-logo-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-logo-key');
            const item = LOGOS_GENERICOS_PDF[key];
            if (!item) return;

            window.pdfConfig.logoDataUrl = item.dataUrl;
            window.pdfConfig.logoOrigen = `generic:${key}`;
            actualizarVistaPreviaLogoPdf();
            guardarConfigPdf(true);
            renderizarVisorPdf();
        });
    });
}

function actualizarVistaPreviaLogoPdf() {
    const c = window.pdfConfig;
    const imgEl = document.getElementById('pdf-logo-preview-img');
    const emptyEl = document.getElementById('pdf-logo-preview-empty');
    const statusEl = document.getElementById('pdf-logo-preview-status');
    const btnQuitar = document.getElementById('btn-pdf-quitar-logo');

    const tieneLogo = !!c.logoDataUrl;
    if (imgEl) {
        imgEl.style.display = tieneLogo ? 'block' : 'none';
        imgEl.src = tieneLogo ? c.logoDataUrl : '';
    }
    if (emptyEl) emptyEl.style.display = tieneLogo ? 'none' : 'inline';
    if (btnQuitar) btnQuitar.style.display = tieneLogo ? 'inline-flex' : 'none';

    if (statusEl) {
        if (!tieneLogo) {
            statusEl.textContent = 'Sin logo (ícono por defecto)';
        } else if (String(c.logoOrigen || '').startsWith('generic:')) {
            const k = c.logoOrigen.slice(8);
            const nom = LOGOS_GENERICOS_PDF[k]?.nombre || 'Genérico';
            statusEl.textContent = `Logo genérico: ${nom}`;
        } else {
            statusEl.textContent = 'Logo personalizado (Galería)';
        }
    }

    document.querySelectorAll('#pdf-generic-logos-grid .pdf-generic-logo-btn').forEach(btn => {
        const key = btn.getAttribute('data-logo-key');
        const activo = tieneLogo && c.logoOrigen === `generic:${key}`;
        btn.classList.toggle('active', activo);
    });
}

/* ==========================================================================
   HISTORIAL DESHACER / REHACER (UNDO / REDO)
   ========================================================================== */
function reiniciarHistorialPdf() {
    window.pdfHistory.stack = [clonarConfigPdf(window.pdfConfig)];
    window.pdfHistory.index = 0;
    actualizarBotonesHistorialPdf();
}

function programarSnapshotHistorialPdf() {
    clearTimeout(window.pdfHistory.timer);
    window.pdfHistory.timer = setTimeout(() => {
        const actualStr = JSON.stringify(window.pdfConfig);
        const ultimoStr = JSON.stringify(window.pdfHistory.stack[window.pdfHistory.index]);
        if (actualStr === ultimoStr) return;

        window.pdfHistory.stack = window.pdfHistory.stack.slice(0, window.pdfHistory.index + 1);
        window.pdfHistory.stack.push(clonarConfigPdf(window.pdfConfig));
        if (window.pdfHistory.stack.length > 35) {
            window.pdfHistory.stack.shift();
        }
        window.pdfHistory.index = window.pdfHistory.stack.length - 1;
        actualizarBotonesHistorialPdf();
    }, 300);
}

function deshacerCambioPdf() {
    if (window.pdfHistory.index <= 0) return;
    window.pdfHistory.index--;
    window.pdfConfig = clonarConfigPdf(window.pdfHistory.stack[window.pdfHistory.index]);
    guardarConfigPdf(false);
    sincronizarControlesDesdeConfig();
    renderizarChecklistCategoriasPdf();
    renderizarListaOrdenCapasPdf();
    renderizarVisorPdf();
    actualizarBotonesHistorialPdf();
}

function rehacerCambioPdf() {
    if (window.pdfHistory.index >= window.pdfHistory.stack.length - 1) return;
    window.pdfHistory.index++;
    window.pdfConfig = clonarConfigPdf(window.pdfHistory.stack[window.pdfHistory.index]);
    guardarConfigPdf(false);
    sincronizarControlesDesdeConfig();
    renderizarChecklistCategoriasPdf();
    renderizarListaOrdenCapasPdf();
    renderizarVisorPdf();
    actualizarBotonesHistorialPdf();
}

function actualizarBotonesHistorialPdf() {
    const btnUndo = document.getElementById('btn-pdf-undo');
    const btnRedo = document.getElementById('btn-pdf-redo');
    if (btnUndo) btnUndo.disabled = window.pdfHistory.index <= 0;
    if (btnRedo) btnRedo.disabled = window.pdfHistory.index >= window.pdfHistory.stack.length - 1;
}

/* ==========================================================================
   PLANTILLAS PROPIAS Y PREDEFINIDAS
   ========================================================================== */
function obtenerPlantillasUsuarioPdf() {
    try {
        const arr = JSON.parse(localStorage.getItem(STORAGE_KEY_PDF_PLANTILLAS) || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function guardarPlantillasUsuarioPdf(lista) {
    localStorage.setItem(STORAGE_KEY_PDF_PLANTILLAS, JSON.stringify(lista));
}

function renderizarSelectorPlantillasPdf(valorSeleccionado = null) {
    const sel = document.getElementById('pdf-select-plantilla');
    const btnDel = document.getElementById('btn-pdf-borrar-plantilla');
    if (!sel) return;

    const prev = valorSeleccionado || sel.value || 'preset:comercial';
    const propias = obtenerPlantillasUsuarioPdf();

    let html = `<optgroup label="Plantillas del Sistema">`;
    Object.entries(PLANTILLAS_PREDEFINIDAS_PDF).forEach(([key, tpl]) => {
        html += `<option value="preset:${key}">${escaparHtmlPdf(tpl.nombre)}</option>`;
    });
    html += `</optgroup>`;

    if (propias.length > 0) {
        html += `<optgroup label="Mis Plantillas Guardadas">`;
        propias.forEach(tpl => {
            html += `<option value="user:${tpl.id}">⭐ ${escaparHtmlPdf(tpl.nombre)}</option>`;
        });
        html += `</optgroup>`;
    }

    sel.innerHTML = html;
    if (Array.from(sel.options).some(o => o.value === prev)) {
        sel.value = prev;
    }

    if (btnDel) {
        btnDel.style.display = sel.value.startsWith('user:') ? 'inline-flex' : 'none';
    }
}

function aplicarPlantillaSeleccionadaPdf(valor) {
    const btnDel = document.getElementById('btn-pdf-borrar-plantilla');
    if (btnDel) btnDel.style.display = valor.startsWith('user:') ? 'inline-flex' : 'none';

    if (valor.startsWith('preset:')) {
        const key = valor.slice(7);
        const preset = PLANTILLAS_PREDEFINIDAS_PDF[key];
        if (!preset) return;
        window.pdfConfig = { ...window.pdfConfig, ...preset.cambios };
    } else if (valor.startsWith('user:')) {
        const id = valor.slice(5);
        const tpl = obtenerPlantillasUsuarioPdf().find(t => String(t.id) === String(id));
        if (!tpl) return;
        window.pdfConfig = { ...PDF_CONFIG_BASE, ...clonarConfigPdf(tpl.config) };
    }

    guardarConfigPdf(true);
    sincronizarControlesDesdeConfig();
    renderizarChecklistCategoriasPdf();
    renderizarListaOrdenCapasPdf();
    renderizarVisorPdf();
}

function guardarComoPlantillaPropiaPdf() {
    const nombre = prompt('Nombre para tu nueva plantilla de catálogo PDF:', 'Mi Plantilla Comercial');
    if (!nombre || !nombre.trim()) return;

    const propias = obtenerPlantillasUsuarioPdf();
    const nueva = {
        id: Date.now(),
        nombre: nombre.trim(),
        config: clonarConfigPdf(window.pdfConfig)
    };
    propias.unshift(nueva);
    guardarPlantillasUsuarioPdf(propias);
    renderizarSelectorPlantillasPdf(`user:${nueva.id}`);
    alert(`✅ Plantilla "${nueva.nombre}" guardada en tu Bóveda Local.`);
}

function eliminarPlantillaPropiaPdf() {
    const sel = document.getElementById('pdf-select-plantilla');
    if (!sel || !sel.value.startsWith('user:')) return;

    const id = sel.value.slice(5);
    const propias = obtenerPlantillasUsuarioPdf();
    const actual = propias.find(t => String(t.id) === String(id));
    if (!actual) return;

    if (!confirm(`¿Eliminar tu plantilla guardada "${actual.nombre}"?`)) return;

    const restantes = propias.filter(t => String(t.id) !== String(id));
    guardarPlantillasUsuarioPdf(restantes);
    renderizarSelectorPlantillasPdf('preset:comercial');
}

/* ==========================================================================
   PRODUCTOS, FILTRADO Y ORDENAMIENTO
   ========================================================================== */
function obtenerProductosBasePdf() {
    const productos = Array.isArray(window.bovedaProductos)
        ? window.bovedaProductos
        : JSON.parse(localStorage.getItem('cat_alogo_productos_v1') || '[]');

    return productos.filter(p => p.incluirPdf !== false);
}

function obtenerPrecioEfectivoPdf(prod) {
    const c = window.pdfConfig;
    if (c.precioModo === 'mayorista') {
        const may = Number(prod.precioMayorista) || 0;
        return may > 0 ? may : (Number(prod.precioNormal) || 0);
    }
    const tieneOferta = Number(prod.precioOferta) > 0 && Number(prod.precioOferta) < Number(prod.precioNormal);
    return tieneOferta ? Number(prod.precioOferta) : (Number(prod.precioNormal) || 0);
}

function obtenerProductosFiltradosYOrdenadosPdf() {
    const c = window.pdfConfig;
    let lista = [...obtenerProductosBasePdf()];

    if (c.categoriasExcluidas.length > 0) {
        const excluidas = c.categoriasExcluidas.map(x => x.toLowerCase());
        lista = lista.filter(p => !excluidas.includes((p.categoria || 'General').toLowerCase()));
    }

    if (c.ocultarSinStock) {
        lista = lista.filter(p => Number(p.stock) > 0);
    }

    if (c.soloOfertas) {
        lista = lista.filter(p => Number(p.precioOferta) > 0 && Number(p.precioOferta) < Number(p.precioNormal));
    }

    lista.sort((a, b) => {
        const nomA = String(a.nombre || '');
        const nomB = String(b.nombre || '');
        const catA = String(a.categoria || 'General');
        const catB = String(b.categoria || 'General');

        switch (c.orden) {
            case 'nombre-asc':
                return nomA.localeCompare(nomB, 'es', { sensitivity: 'base' });
            case 'precio-asc':
                return obtenerPrecioEfectivoPdf(a) - obtenerPrecioEfectivoPdf(b);
            case 'precio-desc':
                return obtenerPrecioEfectivoPdf(b) - obtenerPrecioEfectivoPdf(a);
            case 'recientes':
                return (Number(b.id) || 0) - (Number(a.id) || 0);
            case 'categoria':
            default: {
                const cmp = catA.localeCompare(catB, 'es', { sensitivity: 'base' });
                return cmp !== 0 ? cmp : nomA.localeCompare(nomB, 'es', { sensitivity: 'base' });
            }
        }
    });

    return lista;
}

function renderizarChecklistCategoriasPdf() {
    const cont = document.getElementById('pdf-cats-checklist');
    if (!cont) return;

    const base = obtenerProductosBasePdf();
    const conteo = {};

    base.forEach(p => {
        const cat = (p.categoria || 'General').trim() || 'General';
        conteo[cat] = (conteo[cat] || 0) + 1;
    });

    const categorias = Object.keys(conteo).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

    if (categorias.length === 0) {
        cont.innerHTML = `<div style="font-size:0.75rem; color:#64748b; padding:0.35rem;">No hay productos habilitados para PDF.</div>`;
        return;
    }

    const excluidasLower = window.pdfConfig.categoriasExcluidas.map(x => x.toLowerCase());

    cont.innerHTML = categorias.map(cat => {
        const checked = !excluidasLower.includes(cat.toLowerCase());
        return `
            <div class="pdf-cat-check-item">
                <label>
                    <input type="checkbox" class="pdf-cat-checkbox" value="${escaparHtmlPdf(cat)}" ${checked ? 'checked' : ''}>
                    <span>${escaparHtmlPdf(cat)}</span>
                </label>
                <span class="pdf-badge-soft">${conteo[cat]}</span>
            </div>
        `;
    }).join('');

    cont.querySelectorAll('.pdf-cat-checkbox').forEach(chk => {
        chk.addEventListener('change', actualizarCategoriasExcluidasDesdeUI);
    });
}

function actualizarCategoriasExcluidasDesdeUI() {
    const excluidas = [];
    document.querySelectorAll('#pdf-cats-checklist .pdf-cat-checkbox').forEach(chk => {
        if (!chk.checked) excluidas.push(chk.value);
    });
    window.pdfConfig.categoriasExcluidas = excluidas;
    guardarConfigPdf(true);
    renderizarVisorPdf();
}

function renderizarListaOrdenCapasPdf() {
    const cont = document.getElementById('pdf-layers-order-list');
    if (!cont) return;

    const orden = window.pdfConfig.ordenCapas;
    cont.innerHTML = orden.map((key, idx) => `
        <div class="pdf-layer-item">
            <span>${ETIQUETAS_CAPAS_PDF[key] || key}</span>
            <div class="pdf-layer-btns">
                <button type="button" class="pdf-layer-move" data-idx="${idx}" data-dir="-1" ${idx === 0 ? 'disabled' : ''} title="Subir">▲</button>
                <button type="button" class="pdf-layer-move" data-idx="${idx}" data-dir="1" ${idx === orden.length - 1 ? 'disabled' : ''} title="Bajar">▼</button>
            </div>
        </div>
    `).join('');

    cont.querySelectorAll('.pdf-layer-move').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-idx'), 10);
            const dir = parseInt(btn.getAttribute('data-dir'), 10);
            const destino = idx + dir;
            if (destino < 0 || destino >= window.pdfConfig.ordenCapas.length) return;

            const copia = [...window.pdfConfig.ordenCapas];
            const temp = copia[idx];
            copia[idx] = copia[destino];
            copia[destino] = temp;

            window.pdfConfig.ordenCapas = copia;
            guardarConfigPdf(true);
            renderizarListaOrdenCapasPdf();
            renderizarVisorPdf();
        });
    });
}

/* ==========================================================================
   SINCRONIZACIÓN DE CONTROLES Y FONDOS AVANZADOS
   ========================================================================== */
function sincronizarControlesDesdeConfig() {
    const c = window.pdfConfig;

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

    // Contenido
    setVal('pdf-precio-modo', c.precioModo);
    setVal('pdf-orden-productos', c.orden);
    setChk('pdf-ocultar-sinstock', c.ocultarSinStock);
    setChk('pdf-solo-ofertas', c.soloOfertas);
    setChk('pdf-show-cat-headers', c.showCatHeaders);

    // Layout e Imagen
    setVal('pdf-range-margen', c.margenMm);
    setVal('pdf-range-gap', c.gapPx);
    setVal('pdf-range-img-height', c.imgHeightPx);
    setVal('pdf-range-img-width', c.imgWidthPct);
    setVal('pdf-range-radius', c.radiusPx);
    setVal('pdf-range-img-radius', c.imgRadiusPx);
    setVal('pdf-color-img-bg', c.colorImgBg);
    setTxt('val-pdf-margen', `${c.margenMm} mm`);
    setTxt('val-pdf-gap', `${c.gapPx} px`);
    setTxt('val-pdf-img-height', `${c.imgHeightPx} px`);
    setTxt('val-pdf-img-width', `${c.imgWidthPct}%`);
    setTxt('val-pdf-radius', `${c.radiusPx} px`);
    setTxt('val-pdf-img-radius', `${c.imgRadiusPx} px`);

    const fieldImgWidth = document.getElementById('pdf-field-img-width');
    if (fieldImgWidth) {
        fieldImgWidth.style.display = (c.imgAlign === 'left' || c.imgAlign === 'right') ? 'block' : 'none';
    }

    // Tipografía y Textos
    setVal('pdf-font-family', c.fontFamily);
    setVal('pdf-size-titulo', c.sizeTitulo);
    setVal('pdf-size-precio', c.sizePrecio);
    setVal('pdf-size-desc', c.sizeDesc);
    setVal('pdf-size-sku', c.sizeSku);
    setVal('pdf-size-stock', c.sizeStock);
    setTxt('val-size-titulo', `${c.sizeTitulo} px`);
    setTxt('val-size-precio', `${c.sizePrecio} px`);
    setTxt('val-size-desc', `${c.sizeDesc} px`);
    setTxt('val-size-sku', `${c.sizeSku} px`);
    setTxt('val-size-stock', `${c.sizeStock} px`);
    setVal('pdf-color-titulo', c.colorTitulo);
    setVal('pdf-color-precio', c.colorPrecio);
    setVal('pdf-color-desc', c.colorDesc);
    setVal('pdf-color-sku', c.colorSku);
    setVal('pdf-color-stock', c.colorStock);
    setVal('pdf-color-stock-bg', c.colorStockBg);

    // Estilo, Fondos Avanzados y B&N
    setChk('pdf-modo-grises', c.modoGrises);
    setVal('pdf-color-acento', c.colorAcento);
    setVal('pdf-color-hoja', c.colorHoja);
    setVal('pdf-hoja-bg-tipo', c.hojaBgTipo || 'solid');
    setVal('pdf-color-hoja-2', c.colorHoja2 || '#e2e8f0');
    setVal('pdf-hoja-grad-dir', c.hojaGradDir || '180deg');
    setVal('pdf-hoja-bg-opacity', c.hojaBgOpacity ?? 40);
    setTxt('val-pdf-hoja-bg-opacity', `${c.hojaBgOpacity ?? 40}%`);

    setVal('pdf-color-card', c.colorCard);
    setVal('pdf-card-bg-tipo', c.cardBgTipo || 'solid');
    setVal('pdf-color-card-2', c.colorCard2 || '#f1f5f9');
    setVal('pdf-card-grad-dir', c.cardGradDir || '180deg');
    setVal('pdf-card-bg-opacity', c.cardBgOpacity ?? 40);
    setTxt('val-pdf-card-bg-opacity', `${c.cardBgOpacity ?? 40}%`);

    setVal('pdf-color-borde', c.colorBorde);
    setVal('pdf-border-width', c.borderWidth);
    setTxt('val-pdf-border-width', `${c.borderWidth} px`);

    actualizarVisibilidadControlesFondoPdf();

    document.querySelectorAll('#pdf-border-style-group .border-style-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-val') === c.borderStyle);
    });

    // Capas y Cabecera/Pie
    setChk('pdf-show-sku', c.showSku);
    setChk('pdf-show-desc', c.showDesc);
    setChk('pdf-show-stock', c.showStock);
    setChk('pdf-show-oferta', c.showOferta);
    setChk('pdf-show-unit-price', c.showUnitPrice);
    setVal('pdf-header-nombre', c.headerNombre);
    setVal('pdf-header-sub', c.headerSub);
    setVal('pdf-header-contacto', c.headerContacto);
    setVal('pdf-header-validez', c.headerValidez);
    setVal('pdf-footer-texto', c.footerTexto);

    // Fechas, Portada y Hoja de Cierre (con colores propios)
    setVal('pdf-fecha-creacion', c.fechaCreacion || '');
    setVal('pdf-fecha-validez', c.fechaValidez || '');

    setChk('pdf-incluir-portada', c.incluirPortada);
    setVal('pdf-portada-estilo', c.portadaEstilo);
    setVal('pdf-color-portada-titulo', c.colorPortadaTitulo || '#0f172a');
    setVal('pdf-color-portada-texto', c.colorPortadaTexto || '#475569');
    setVal('pdf-portada-titulo', c.portadaTitulo);
    setVal('pdf-portada-sub', c.portadaSub);
    setVal('pdf-portada-eslogan', c.portadaEslogan || '');

    setChk('pdf-incluir-cierre', c.incluirCierre);
    setVal('pdf-color-cierre-titulo', c.colorCierreTitulo || '#0f172a');
    setVal('pdf-color-cierre-texto', c.colorCierreTexto || '#475569');
    setVal('pdf-color-cierre-card', c.colorCierreCard || '#ffffff');
    setVal('pdf-color-cierre-borde', c.colorCierreBorde || '#e2e8f0');
    setVal('pdf-cierre-titulo', c.cierreTitulo);
    setVal('pdf-cierre-mensaje', c.cierreMensaje);
    setVal('pdf-cierre-pagos', c.cierrePagos || '');
    setVal('pdf-cierre-envios', c.cierreEnvios || '');
    setVal('pdf-cierre-redes', c.cierreRedes);

    actualizarVistaPreviaLogoPdf();

    // Segmentados
    document.querySelectorAll('#pdf-orientacion-group .seg-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-val') === c.orientacion);
    });
    document.querySelectorAll('#pdf-columnas-group .seg-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.getAttribute('data-val'), 10) === c.columnas);
    });
    document.querySelectorAll('#pdf-aspecto-group .seg-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-val') === c.aspectoFoto);
    });
    document.querySelectorAll('#pdf-img-align-group .seg-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-val') === c.imgAlign);
    });
    document.querySelectorAll('#pdf-text-align-group .seg-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-val') === c.textAlign);
    });
    document.querySelectorAll('#pdf-escala-group .seg-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.getAttribute('data-val'), 10) === Number(c.escalaGlobal || 100));
    });
}

function actualizarVisibilidadControlesFondoPdf() {
    const c = window.pdfConfig;
    const toggle = (id, show) => {
        const el = document.getElementById(id);
        if (el) el.style.display = show ? '' : 'none';
    };

    const hTipo = c.hojaBgTipo || 'solid';
    toggle('pdf-hoja-grad-c2-wrap', hTipo === 'gradient');
    toggle('pdf-hoja-grad-dir-wrap', hTipo === 'gradient');
    toggle('pdf-hoja-img-controls', hTipo === 'image');
    toggle('btn-pdf-quitar-hoja-bg', !!c.hojaBgImg);

    const cTipo = c.cardBgTipo || 'solid';
    toggle('pdf-card-grad-c2-wrap', cTipo === 'gradient');
    toggle('pdf-card-grad-dir-wrap', cTipo === 'gradient');
    toggle('pdf-card-img-controls', cTipo === 'image');
    toggle('btn-pdf-quitar-card-bg', !!c.cardBgImg);
}

function comprimirFondoImagenPdf(file, maxLado = 1000, calidad = 0.8) {
    return new Promise((resolve, reject) => {
        const urlObj = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(urlObj);
            const esc = Math.min(1, maxLado / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round((img.naturalWidth || 1) * esc));
            canvas.height = Math.max(1, Math.round((img.naturalHeight || 1) * esc));
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            let out = '';
            try { out = canvas.toDataURL('image/webp', calidad); } catch (_) {}
            if (!out || !out.startsWith('data:image/webp')) {
                out = canvas.toDataURL('image/jpeg', calidad);
            }
            resolve(out);
        };
        img.onerror = () => {
            URL.revokeObjectURL(urlObj);
            reject(new Error('No se pudo cargar la imagen de fondo'));
        };
        img.src = urlObj;
    });
}

function obtenerEstiloFondoHojaPdf() {
    const c = window.pdfConfig;
    if (c.hojaBgTipo === 'gradient') {
        return `background: linear-gradient(${c.hojaGradDir || '180deg'}, ${c.colorHoja}, ${c.colorHoja2 || '#e2e8f0'});`;
    }
    return `background: ${c.colorHoja};`;
}

function obtenerCapaImagenFondoHojaPdf() {
    const c = window.pdfConfig;
    if (c.hojaBgTipo !== 'image' || !c.hojaBgImg) return '';
    const op = Math.max(0.05, Math.min(1, (Number(c.hojaBgOpacity ?? 40)) / 100));
    return `<div class="a4-bg-layer" style="opacity: ${op};"><img src="${c.hojaBgImg}" alt="Fondo Hoja" style="object-fit: cover; object-position: center center;"></div>`;
}

function obtenerEstiloFondoTarjetaPdf() {
    const c = window.pdfConfig;
    if (c.cardBgTipo === 'gradient') {
        return `background: linear-gradient(${c.cardGradDir || '180deg'}, ${c.colorCard}, ${c.colorCard2 || '#f1f5f9'});`;
    }
    return `background: ${c.colorCard};`;
}

function obtenerCapaImagenFondoTarjetaPdf() {
    const c = window.pdfConfig;
    if (c.cardBgTipo !== 'image' || !c.cardBgImg) return '';
    const op = Math.max(0.05, Math.min(1, (Number(c.cardBgOpacity ?? 40)) / 100));
    return `<div class="a4-bg-layer" style="opacity: ${op};"><img src="${c.cardBgImg}" alt="Fondo Tarjeta" style="object-fit: cover; object-position: center center;"></div>`;
}

function obtenerTextoFechasCabeceraPdf() {
    const c = window.pdfConfig;
    const fIni = formatearFechaVisiblePdf(c.fechaCreacion);
    const fFin = formatearFechaVisiblePdf(c.fechaValidez);
    if (fIni && fFin) return `Vigencia: ${fIni} al ${fFin}`;
    if (fFin) return `Válido hasta: ${fFin}`;
    if (fIni) return `Elaborado: ${fIni}`;
    return 'Catálogo Digital';
}

function inicializarEventosDisenoPdf() {
    // 1. Pestañas
    document.querySelectorAll('#pdf-tabs-nav .pdf-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#pdf-tabs-nav .pdf-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.pdf-tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`pdf-panel-${btn.getAttribute('data-pdf-tab')}`)?.classList.add('active');
        });
    });

    // 2. Plantillas e Historial
    document.getElementById('pdf-select-plantilla')?.addEventListener('change', (e) => {
        aplicarPlantillaSeleccionadaPdf(e.target.value);
    });
    document.getElementById('btn-pdf-guardar-plantilla')?.addEventListener('click', guardarComoPlantillaPropiaPdf);
    document.getElementById('btn-pdf-borrar-plantilla')?.addEventListener('click', eliminarPlantillaPropiaPdf);
    document.getElementById('btn-pdf-undo')?.addEventListener('click', deshacerCambioPdf);
    document.getElementById('btn-pdf-redo')?.addEventListener('click', rehacerCambioPdf);

    if (!pdfShortcutsRegistrados) {
        document.addEventListener('keydown', (e) => {
            if (!document.getElementById('pdf-studio-root')) return;
            const tag = (document.activeElement?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea') return;

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
                e.preventDefault();
                deshacerCambioPdf();
            } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
                e.preventDefault();
                rehacerCambioPdf();
            }
        });
        pdfShortcutsRegistrados = true;
    }

    // 3. Visor A4 (Paginador, 1/2 hojas, Zoom, Pantalla Completa)
    document.getElementById('btn-pdf-page-prev')?.addEventListener('click', () => {
        if (window.pdfViewerState.paginaActual > 1) {
            window.pdfViewerState.paginaActual = Math.max(1, window.pdfViewerState.paginaActual - window.pdfViewerState.hojasVisibles);
            renderizarVisorPdf();
        }
    });
    document.getElementById('btn-pdf-page-next')?.addEventListener('click', () => {
        if (window.pdfViewerState.paginaActual + window.pdfViewerState.hojasVisibles <= window.pdfViewerState.totalPaginas) {
            window.pdfViewerState.paginaActual += window.pdfViewerState.hojasVisibles;
            renderizarVisorPdf();
        }
    });

    document.querySelectorAll('.pdf-view-mode .view-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pdf-view-mode .view-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            window.pdfViewerState.hojasVisibles = parseInt(btn.getAttribute('data-spread'), 10) || 1;
            if (window.pdfViewerState.hojasVisibles === 2 && window.pdfViewerState.zoom > 55) {
                window.pdfViewerState.zoom = 50;
            }
            renderizarVisorPdf();
        });
    });

    document.getElementById('btn-pdf-zoom-out')?.addEventListener('click', () => {
        window.pdfViewerState.zoom = Math.max(35, window.pdfViewerState.zoom - 10);
        aplicarZoomVisorPdf();
    });
    document.getElementById('btn-pdf-zoom-in')?.addEventListener('click', () => {
        window.pdfViewerState.zoom = Math.min(130, window.pdfViewerState.zoom + 10);
        aplicarZoomVisorPdf();
    });
    document.getElementById('btn-pdf-zoom-fit')?.addEventListener('click', ajustarZoomAutomaticoPdf);

    const btnFullscreen = document.getElementById('btn-pdf-fullscreen');
    const rootEl = document.getElementById('pdf-studio-root');
    if (btnFullscreen && rootEl) {
        btnFullscreen.addEventListener('click', () => {
            const activo = rootEl.classList.toggle('is-fullscreen');
            btnFullscreen.textContent = activo ? '✕ Salir Pantalla Completa' : '⛶ Pantalla Completa';
            setTimeout(ajustarZoomAutomaticoPdf, 60);
        });
    }

    // Helpers de enlace en vivo (mantienen siempre la página actual)
    const enlazarSelect = (id, prop) => {
        document.getElementById(id)?.addEventListener('change', (e) => {
            window.pdfConfig[prop] = e.target.value;
            guardarConfigPdf(true);
            renderizarVisorPdf();
        });
    };
    const enlazarCheckbox = (id, prop) => {
        document.getElementById(id)?.addEventListener('change', (e) => {
            window.pdfConfig[prop] = e.target.checked;
            guardarConfigPdf(true);
            renderizarVisorPdf();
        });
    };
    const enlazarSegmentado = (groupId, prop, esNumero = false) => {
        document.querySelectorAll(`#${groupId} .seg-btn`).forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll(`#${groupId} .seg-btn`).forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const val = btn.getAttribute('data-val');
                window.pdfConfig[prop] = esNumero ? parseInt(val, 10) : val;
                guardarConfigPdf(true);
                renderizarVisorPdf();
            });
        });
    };
    const enlazarRange = (id, labelId, prop, sufijo) => {
        document.getElementById(id)?.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            window.pdfConfig[prop] = val;
            const lbl = document.getElementById(labelId);
            if (lbl) lbl.textContent = `${val}${sufijo}`;
            guardarConfigPdf(true);
            renderizarVisorPdf();
        });
    };
    const enlazarColor = (id, prop) => {
        document.getElementById(id)?.addEventListener('input', (e) => {
            window.pdfConfig[prop] = e.target.value;
            guardarConfigPdf(true);
            renderizarVisorPdf();
        });
    };
    const enlazarTexto = (id, prop) => {
        document.getElementById(id)?.addEventListener('input', (e) => {
            window.pdfConfig[prop] = e.target.value;
            guardarConfigPdf(true);
            renderizarVisorPdf();
        });
    };

    // 4. Pestaña CONTENIDO
    enlazarSelect('pdf-precio-modo', 'precioModo');
    enlazarSelect('pdf-orden-productos', 'orden');
    enlazarCheckbox('pdf-ocultar-sinstock', 'ocultarSinStock');
    enlazarCheckbox('pdf-solo-ofertas', 'soloOfertas');
    enlazarCheckbox('pdf-show-cat-headers', 'showCatHeaders');

    document.getElementById('btn-pdf-cats-all')?.addEventListener('click', () => {
        document.querySelectorAll('#pdf-cats-checklist .pdf-cat-checkbox').forEach(chk => { chk.checked = true; });
        actualizarCategoriasExcluidasDesdeUI();
    });
    document.getElementById('btn-pdf-cats-none')?.addEventListener('click', () => {
        document.querySelectorAll('#pdf-cats-checklist .pdf-cat-checkbox').forEach(chk => { chk.checked = false; });
        actualizarCategoriasExcluidasDesdeUI();
    });

    // 5. Pestaña LAYOUT E IMAGEN
    enlazarSegmentado('pdf-orientacion-group', 'orientacion', false);
    enlazarSegmentado('pdf-columnas-group', 'columnas', true);
    enlazarSegmentado('pdf-escala-group', 'escalaGlobal', true);
    enlazarSegmentado('pdf-aspecto-group', 'aspectoFoto', false);
    enlazarSegmentado('pdf-text-align-group', 'textAlign', false);
    enlazarRange('pdf-range-margen', 'val-pdf-margen', 'margenMm', ' mm');
    enlazarRange('pdf-range-gap', 'val-pdf-gap', 'gapPx', ' px');
    enlazarRange('pdf-range-img-height', 'val-pdf-img-height', 'imgHeightPx', ' px');
    enlazarRange('pdf-range-img-width', 'val-pdf-img-width', 'imgWidthPct', '%');
    enlazarRange('pdf-range-radius', 'val-pdf-radius', 'radiusPx', ' px');
    enlazarRange('pdf-range-img-radius', 'val-pdf-img-radius', 'imgRadiusPx', ' px');
    enlazarColor('pdf-color-img-bg', 'colorImgBg');

    document.querySelectorAll('#pdf-img-align-group .seg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#pdf-img-align-group .seg-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const val = btn.getAttribute('data-val');
            window.pdfConfig.imgAlign = val;
            const fieldW = document.getElementById('pdf-field-img-width');
            if (fieldW) fieldW.style.display = (val === 'left' || val === 'right') ? 'block' : 'none';
            guardarConfigPdf(true);
            renderizarVisorPdf();
        });
    });

    // 6. Pestaña TIPOGRAFÍA Y TEXTOS
    enlazarSelect('pdf-font-family', 'fontFamily');
    enlazarRange('pdf-size-titulo', 'val-size-titulo', 'sizeTitulo', ' px');
    enlazarRange('pdf-size-precio', 'val-size-precio', 'sizePrecio', ' px');
    enlazarRange('pdf-size-desc', 'val-size-desc', 'sizeDesc', ' px');
    enlazarRange('pdf-size-sku', 'val-size-sku', 'sizeSku', ' px');
    enlazarRange('pdf-size-stock', 'val-size-stock', 'sizeStock', ' px');
    enlazarColor('pdf-color-titulo', 'colorTitulo');
    enlazarColor('pdf-color-precio', 'colorPrecio');
    enlazarColor('pdf-color-desc', 'colorDesc');
    enlazarColor('pdf-color-sku', 'colorSku');
    enlazarColor('pdf-color-stock', 'colorStock');
    enlazarColor('pdf-color-stock-bg', 'colorStockBg');

    // 7. Pestaña ESTILO, FONDOS AVANZADOS Y B&N
    enlazarCheckbox('pdf-modo-grises', 'modoGrises');
    enlazarColor('pdf-color-acento', 'colorAcento');
    enlazarColor('pdf-color-hoja', 'colorHoja');
    enlazarColor('pdf-color-hoja-2', 'colorHoja2');
    enlazarSelect('pdf-hoja-grad-dir', 'hojaGradDir');
    enlazarRange('pdf-hoja-bg-opacity', 'val-pdf-hoja-bg-opacity', 'hojaBgOpacity', '%');

    enlazarColor('pdf-color-card', 'colorCard');
    enlazarColor('pdf-color-card-2', 'colorCard2');
    enlazarSelect('pdf-card-grad-dir', 'cardGradDir');
    enlazarRange('pdf-card-bg-opacity', 'val-pdf-card-bg-opacity', 'cardBgOpacity', '%');

    enlazarColor('pdf-color-borde', 'colorBorde');
    enlazarRange('pdf-border-width', 'val-pdf-border-width', 'borderWidth', ' px');

    document.getElementById('pdf-hoja-bg-tipo')?.addEventListener('change', (e) => {
        window.pdfConfig.hojaBgTipo = e.target.value;
        actualizarVisibilidadControlesFondoPdf();
        guardarConfigPdf(true);
        renderizarVisorPdf();
    });
    document.getElementById('pdf-card-bg-tipo')?.addEventListener('change', (e) => {
        window.pdfConfig.cardBgTipo = e.target.value;
        actualizarVisibilidadControlesFondoPdf();
        guardarConfigPdf(true);
        renderizarVisorPdf();
    });

    const inputHojaBg = document.getElementById('pdf-input-hoja-bg-img');
    if (inputHojaBg) {
        inputHojaBg.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                window.pdfConfig.hojaBgImg = await comprimirFondoImagenPdf(file, 1000, 0.8);
                actualizarVisibilidadControlesFondoPdf();
                guardarConfigPdf(true);
                renderizarVisorPdf();
            } catch (err) {
                console.warn(err);
            }
            inputHojaBg.value = '';
        });
    }
    document.getElementById('btn-pdf-quitar-hoja-bg')?.addEventListener('click', () => {
        window.pdfConfig.hojaBgImg = '';
        actualizarVisibilidadControlesFondoPdf();
        guardarConfigPdf(true);
        renderizarVisorPdf();
    });

    const inputCardBg = document.getElementById('pdf-input-card-bg-img');
    if (inputCardBg) {
        inputCardBg.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                window.pdfConfig.cardBgImg = await comprimirFondoImagenPdf(file, 600, 0.8);
                actualizarVisibilidadControlesFondoPdf();
                guardarConfigPdf(true);
                renderizarVisorPdf();
            } catch (err) {
                console.warn(err);
            }
            inputCardBg.value = '';
        });
    }
    document.getElementById('btn-pdf-quitar-card-bg')?.addEventListener('click', () => {
        window.pdfConfig.cardBgImg = '';
        actualizarVisibilidadControlesFondoPdf();
        guardarConfigPdf(true);
        renderizarVisorPdf();
    });

    document.querySelectorAll('#pdf-border-style-group .border-style-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#pdf-border-style-group .border-style-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const estilo = btn.getAttribute('data-val');
            window.pdfConfig.borderStyle = estilo;

            if (['double', 'groove', 'ridge', 'inset'].includes(estilo) && Number(window.pdfConfig.borderWidth) < 3) {
                window.pdfConfig.borderWidth = 3;
                const inpW = document.getElementById('pdf-border-width');
                const lblW = document.getElementById('val-pdf-border-width');
                if (inpW) inpW.value = 3;
                if (lblW) lblW.textContent = '3 px';
            }

            guardarConfigPdf(true);
            renderizarVisorPdf();
        });
    });

    // 8. Pestaña CAPAS Y CABECERA / PIE
    enlazarCheckbox('pdf-show-sku', 'showSku');
    enlazarCheckbox('pdf-show-desc', 'showDesc');
    enlazarCheckbox('pdf-show-stock', 'showStock');
    enlazarCheckbox('pdf-show-oferta', 'showOferta');
    enlazarCheckbox('pdf-show-unit-price', 'showUnitPrice');
    enlazarTexto('pdf-header-nombre', 'headerNombre');
    enlazarTexto('pdf-header-sub', 'headerSub');
    enlazarTexto('pdf-header-contacto', 'headerContacto');
    enlazarTexto('pdf-header-validez', 'headerValidez');
    enlazarTexto('pdf-footer-texto', 'footerTexto');

    // 9. Pestaña CARÁTULA, LOGOS, FECHAS Y HOJA DE CIERRE
    enlazarSelect('pdf-fecha-creacion', 'fechaCreacion');
    enlazarSelect('pdf-fecha-validez', 'fechaValidez');

    enlazarCheckbox('pdf-incluir-portada', 'incluirPortada');
    enlazarSelect('pdf-portada-estilo', 'portadaEstilo');
    enlazarColor('pdf-color-portada-titulo', 'colorPortadaTitulo');
    enlazarColor('pdf-color-portada-texto', 'colorPortadaTexto');
    enlazarTexto('pdf-portada-titulo', 'portadaTitulo');
    enlazarTexto('pdf-portada-sub', 'portadaSub');
    enlazarTexto('pdf-portada-eslogan', 'portadaEslogan');

    enlazarCheckbox('pdf-incluir-cierre', 'incluirCierre');
    enlazarColor('pdf-color-cierre-titulo', 'colorCierreTitulo');
    enlazarColor('pdf-color-cierre-texto', 'colorCierreTexto');
    enlazarColor('pdf-color-cierre-card', 'colorCierreCard');
    enlazarColor('pdf-color-cierre-borde', 'colorCierreBorde');
    enlazarTexto('pdf-cierre-titulo', 'cierreTitulo');
    enlazarTexto('pdf-cierre-mensaje', 'cierreMensaje');
    enlazarTexto('pdf-cierre-pagos', 'cierrePagos');
    enlazarTexto('pdf-cierre-envios', 'cierreEnvios');
    enlazarTexto('pdf-cierre-redes', 'cierreRedes');

    const inputLogo = document.getElementById('pdf-input-logo');
    const btnQuitarLogo = document.getElementById('btn-pdf-quitar-logo');
    if (inputLogo) {
        inputLogo.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                window.pdfConfig.logoDataUrl = ev.target.result;
                window.pdfConfig.logoOrigen = 'custom';
                actualizarVistaPreviaLogoPdf();
                guardarConfigPdf(true);
                renderizarVisorPdf();
            };
            reader.readAsDataURL(file);
            inputLogo.value = '';
        });
    }
    if (btnQuitarLogo) {
        btnQuitarLogo.addEventListener('click', () => {
            window.pdfConfig.logoDataUrl = '';
            window.pdfConfig.logoOrigen = '';
            actualizarVistaPreviaLogoPdf();
            guardarConfigPdf(true);
            renderizarVisorPdf();
        });
    }

    // 10. Motores reales de exportación (Etapa 4)
    document.getElementById('btn-export-pdf-hd')?.addEventListener('click', () => {
        exportarCatalogoPdf('hd');
    });
    document.getElementById('btn-export-pdf-wa')?.addEventListener('click', () => {
        exportarCatalogoPdf('whatsapp');
    });
    document.getElementById('pdf-png-page-select')?.addEventListener('change', actualizarEtiquetaBotonPngPdf);
    document.getElementById('btn-export-png-zip')?.addEventListener('click', () => {
        exportarCatalogoPngZip();
    });
}

/* ==========================================================================
   MOTOR DE HOJAS A4 (PORTADA + PRODUCTOS + CIERRE) Y VISOR EN VIVO
   ========================================================================== */
function aplicarZoomVisorPdf() {
    const viewport = document.getElementById('pdf-sheets-viewport');
    const lblZoom = document.getElementById('pdf-zoom-val');
    const zoom = window.pdfViewerState.zoom;

    if (viewport) viewport.style.transform = `scale(${zoom / 100})`;
    if (lblZoom) lblZoom.textContent = `${zoom}%`;
}

function ajustarZoomAutomaticoPdf() {
    const stage = document.getElementById('pdf-stage');
    if (!stage) return;

    const anchoHoja = window.pdfConfig.orientacion === 'landscape' ? 1123 : 794;
    const anchoTotal = anchoHoja * window.pdfViewerState.hojasVisibles + (window.pdfViewerState.hojasVisibles === 2 ? 24 : 0);
    const anchoDisponible = Math.max(320, stage.clientWidth - 48);

    window.pdfViewerState.zoom = Math.min(100, Math.max(35, Math.floor((anchoDisponible / anchoTotal) * 100)));
    aplicarZoomVisorPdf();
}

/**
 * Construye la lista de hojas A4 midiendo el alto real en píxeles de cada fila y separador.
 * Funciona de forma exacta tanto en Vertical (794x1123) como en Horizontal (1123x794).
 */
function construirListaCompletaHojasPdf() {
    const c = window.pdfConfig;
    const productosPdf = obtenerProductosFiltradosYOrdenadosPdf();
    const esLista = c.columnas === 1 || c.aspectoFoto === 'none';
    const cols = esLista ? 1 : Math.max(1, c.columnas);

    const hojas = [];
    if (c.incluirPortada) {
        hojas.push({ tipo: 'portada' });
    }

    if (productosPdf.length === 0) {
        hojas.push({ tipo: 'productos', items: [] });
        if (c.incluirCierre) hojas.push({ tipo: 'cierre' });
        return { hojas, totalProductos: 0 };
    }

    // 1. Armar los bloques visuales (separadores de categoría + filas de productos)
    const bloques = [];
    let filaActual = [];
    let ultimaCat = null;

    const cerrarFila = () => {
        if (filaActual.length > 0) {
            bloques.push({ tipo: 'fila', items: filaActual });
            filaActual = [];
        }
    };

    productosPdf.forEach(prod => {
        const catActual = (prod.categoria || 'General').trim() || 'General';

        if (c.showCatHeaders && catActual.toLowerCase() !== (ultimaCat || '').toLowerCase()) {
            cerrarFila();
            bloques.push({ tipo: 'separador', categoria: catActual });
            ultimaCat = catActual;
        }

        filaActual.push(prod);
        if (filaActual.length >= cols) {
            cerrarFila();
        }
    });
    cerrarFila();

    // 2. Medir alturas exactas en un contenedor oculto con el ancho real de la hoja A4
    const anchoHoja = c.orientacion === 'landscape' ? 1123 : 794;
    const altoHoja = c.orientacion === 'landscape' ? 794 : 1123;
    const padPx = Math.round(c.margenMm * 3.2);
    const gap = Math.max(0, Number(c.gapPx) || 12);

    const medidor = document.createElement('div');
    medidor.className = obtenerClasesBaseHojaA4();
    medidor.style.position = 'fixed';
    medidor.style.left = '-10000px';
    medidor.style.top = '0';
    medidor.style.visibility = 'hidden';
    medidor.style.pointerEvents = 'none';
    medidor.style.height = 'auto';
    medidor.style.minHeight = '0';
    medidor.style.overflow = 'visible';
    medidor.style.padding = `${padPx}px`;
    medidor.style.fontFamily = c.fontFamily;
    medidor.style.width = `${anchoHoja}px`;

    const logoCabecera = c.logoDataUrl
        ? `<img src="${c.logoDataUrl}" alt="Logo" class="a4-brand-logo-img">`
        : `<div class="a4-brand-icon" style="background: ${c.colorAcento};">📦</div>`;

    const bloquesHtml = bloques.map((b, idx) => {
        if (b.tipo === 'separador') {
            return `<div class="a4-measure-row" data-bidx="${idx}" style="overflow:hidden;">
                <div class="a4-cat-separator" style="border-left-color: ${c.colorAcento};">${escaparHtmlPdf(b.categoria)}</div>
            </div>`;
        }
        return `<div class="a4-measure-row a4-grid" data-bidx="${idx}" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr)); gap: ${gap}px;">
            ${b.items.map(p => construirHtmlTarjetaA4(p, esLista)).join('')}
        </div>`;
    }).join('');

    medidor.innerHTML = `
        <header class="a4-header" style="border-bottom-color: ${c.colorAcento};">
            <div class="a4-brand-left">
                ${logoCabecera}
                <div>
                    <h3 class="a4-brand-name" style="color: ${c.colorTitulo};">${escaparHtmlPdf(c.headerNombre)}</h3>
                    <p class="a4-brand-sub" style="color: ${c.colorAcento};">${escaparHtmlPdf(c.headerSub)}</p>
                    <p class="a4-brand-contact">${escaparHtmlPdf(c.headerContacto)}</p>
                </div>
            </div>
            <div class="a4-header-right">
                <strong>${escaparHtmlPdf(c.headerValidez)}</strong>
                <span>${escaparHtmlPdf(obtenerTextoFechasCabeceraPdf())}</span>
            </div>
        </header>
        <div class="a4-measure-body">${bloquesHtml}</div>
        <footer class="a4-footer">
            <span>${escaparHtmlPdf(c.headerNombre)} • ${escaparHtmlPdf(c.footerTexto)}</span>
            <strong>Página 1 de 1</strong>
        </footer>
    `;

    document.body.appendChild(medidor);

    const headerEl = medidor.querySelector('.a4-header');
    const footerEl = medidor.querySelector('.a4-footer');
    const headerMarginBottom = headerEl ? parseFloat(getComputedStyle(headerEl).marginBottom) || 0 : 0;
    const altoHeader = (headerEl ? headerEl.getBoundingClientRect().height : 80) + headerMarginBottom;
    const altoFooter = footerEl ? footerEl.getBoundingClientRect().height : 32;
    const altoDisponible = Math.max(200, altoHoja - (padPx * 2) - altoHeader - altoFooter - 14);

    let altoSeparadorBase = 30;
    medidor.querySelectorAll('.a4-measure-row').forEach(el => {
        const idx = parseInt(el.getAttribute('data-bidx'), 10);
        const h = Math.ceil(el.getBoundingClientRect().height);
        if (bloques[idx]) {
            bloques[idx].alto = h;
            if (bloques[idx].tipo === 'separador') altoSeparadorBase = h;
        }
    });

    document.body.removeChild(medidor);

    // 3. Repartir bloques en páginas A4 respetando el alto real y evitando separadores huérfanos
    let itemsHoja = [];
    let altoUsado = 0;

    for (let i = 0; i < bloques.length; i++) {
        const bloque = bloques[i];

        if (bloque.tipo === 'separador') {
            const siguienteFila = (bloques[i + 1] && bloques[i + 1].tipo === 'fila') ? bloques[i + 1] : null;
            const gapAntes = altoUsado > 0 ? gap : 0;
            const altoNecesario = gapAntes + bloque.alto + (siguienteFila ? gap + siguienteFila.alto : 0);

            if (itemsHoja.length > 0 && altoUsado + altoNecesario > altoDisponible) {
                hojas.push({ tipo: 'productos', items: itemsHoja });
                itemsHoja = [];
                altoUsado = 0;
            }

            altoUsado += (altoUsado > 0 ? gap : 0) + bloque.alto;
            continue;
        }

        const gapAntes = altoUsado > 0 ? gap : 0;
        if (itemsHoja.length > 0 && altoUsado + gapAntes + bloque.alto > altoDisponible) {
            hojas.push({ tipo: 'productos', items: itemsHoja });
            itemsHoja = [];
            altoUsado = c.showCatHeaders ? altoSeparadorBase : 0;
        }

        itemsHoja.push(...bloque.items);
        altoUsado += (altoUsado > 0 ? gap : 0) + bloque.alto;
    }

    if (itemsHoja.length > 0) {
        hojas.push({ tipo: 'productos', items: itemsHoja });
    }

    if (c.incluirCierre) {
        hojas.push({ tipo: 'cierre' });
    }

    return { hojas, totalProductos: productosPdf.length };
}

function renderizarVisorPdf() {
    const viewport = document.getElementById('pdf-sheets-viewport');
    const stage = document.getElementById('pdf-stage');
    if (!viewport) return;

    const scrollPrevioY = stage ? stage.scrollTop : 0;
    const scrollPrevioX = stage ? stage.scrollLeft : 0;

    const { hojas, totalProductos } = construirListaCompletaHojasPdf();
    const totalPaginas = hojas.length;

    window.pdfViewerState.totalPaginas = totalPaginas;
    if (window.pdfViewerState.paginaActual > totalPaginas) {
        window.pdfViewerState.paginaActual = totalPaginas;
    }
    if (window.pdfViewerState.paginaActual < 1) {
        window.pdfViewerState.paginaActual = 1;
    }

    const indices = [window.pdfViewerState.paginaActual - 1];
    if (window.pdfViewerState.hojasVisibles === 2 && window.pdfViewerState.paginaActual < totalPaginas) {
        indices.push(window.pdfViewerState.paginaActual);
    }

    viewport.innerHTML = indices.map(idx => {
        const hoja = hojas[idx];
        const numPag = idx + 1;
        if (hoja.tipo === 'portada') return construirHtmlPortadaA4(numPag, totalPaginas);
        if (hoja.tipo === 'cierre') return construirHtmlCierreA4(numPag, totalPaginas);
        return construirHtmlHojaA4(hoja.items, numPag, totalPaginas);
    }).join('');

    actualizarMetricasYControlesVisor(totalProductos, hojas);
    aplicarZoomVisorPdf();

    if (stage) {
        stage.scrollTop = scrollPrevioY;
        stage.scrollLeft = scrollPrevioX;
    }
}

function obtenerClasesBaseHojaA4(extra = '') {
    const c = window.pdfConfig;
    return [
        'pdf-sheet-a4',
        c.orientacion === 'landscape' ? 'landscape' : '',
        c.modoGrises ? 'grayscale-mode' : '',
        extra
    ].filter(Boolean).join(' ');
}

function construirHtmlPortadaA4(numPagina, totalPaginas) {
    const c = window.pdfConfig;
    const padPx = Math.round(c.margenMm * 3.2);
    const colTit = c.colorPortadaTitulo || '#0f172a';
    const colTxt = c.colorPortadaTexto || '#475569';

    const logoHtml = c.logoDataUrl
        ? `<img src="${c.logoDataUrl}" alt="Logo" class="a4-cover-logo">`
        : '';

    const esloganHtml = c.portadaEslogan && c.portadaEslogan.trim()
        ? `<p class="a4-cover-slogan" style="color: ${colTxt};">${escaparHtmlPdf(c.portadaEslogan)}</p>`
        : '';

    const fIni = formatearFechaVisiblePdf(c.fechaCreacion);
    const fFin = formatearFechaVisiblePdf(c.fechaValidez);
    const fechasHtml = (fIni || fFin)
        ? `
            <div class="a4-cover-dates" style="color: ${colTxt};">
                ${fIni ? `<span class="a4-cover-date-pill">📅 Elaborado: ${fIni}</span>` : ''}
                ${fFin ? `<span class="a4-cover-date-pill">⏳ Válido hasta: ${fFin}</span>` : ''}
            </div>
        `
        : '';

    return `
        <article class="${obtenerClasesBaseHojaA4(`a4-cover-sheet cover-${c.portadaEstilo}`)}"
            style="padding: ${padPx}px; ${obtenerEstiloFondoHojaPdf()} font-family: ${c.fontFamily}; --cover-accent: ${c.colorAcento};">
            ${obtenerCapaImagenFondoHojaPdf()}
            <div class="a4-cover-inner">
                ${logoHtml}
                <span class="a4-cover-kicker" style="color: ${colTxt};">${escaparHtmlPdf(c.headerNombre)}</span>
                <h1 class="a4-cover-title" style="color: ${colTit};">${escaparHtmlPdf(c.portadaTitulo)}</h1>
                <div class="a4-cover-divider"></div>
                <p class="a4-cover-sub" style="color: ${colTxt};">${escaparHtmlPdf(c.portadaSub)}</p>
                ${esloganHtml}
                ${fechasHtml}
                <div class="a4-cover-meta" style="color: ${colTxt};">
                    <strong style="color: ${colTit};">${escaparHtmlPdf(c.headerValidez)}</strong>
                    <span>${escaparHtmlPdf(c.headerContacto)}</span>
                </div>
            </div>
        </article>
    `;
}

function construirHtmlCierreA4(numPagina, totalPaginas) {
    const c = window.pdfConfig;
    const padPx = Math.round(c.margenMm * 3.2);
    const colTit = c.colorCierreTitulo || '#0f172a';
    const colTxt = c.colorCierreTexto || '#475569';
    const colCardBg = c.colorCierreCard || '#ffffff';
    const colCardBorder = c.colorCierreBorde || '#e2e8f0';

    const cardEsOscura = esColorOscuroPdf(colCardBg);
    const subBoxBg = cardEsOscura ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.04)';
    const contactBoxBorder = cardEsOscura ? 'rgba(255, 255, 255, 0.16)' : 'rgba(15, 23, 42, 0.1)';

    const logoHtml = c.logoDataUrl
        ? `<img src="${c.logoDataUrl}" alt="Logo" class="a4-cover-logo" style="max-height: 85px;">`
        : `<div class="a4-brand-icon" style="width:56px; height:56px; font-size:1.6rem; background: ${c.colorAcento};">📦</div>`;

    const bloqueComercial = (c.cierrePagos || c.cierreEnvios)
        ? `
            <div class="a4-closing-commercial-grid" style="color: ${colTxt};">
                ${c.cierrePagos ? `
                    <div class="a4-closing-info-item" style="background: ${subBoxBg}; border-left-color: ${c.colorAcento};">
                        <span>💳</span>
                        <div>
                            <strong style="color: ${colTit};">Medios de Pago</strong>
                            <span>${escaparHtmlPdf(c.cierrePagos)}</span>
                        </div>
                    </div>
                ` : ''}
                ${c.cierreEnvios ? `
                    <div class="a4-closing-info-item" style="background: ${subBoxBg}; border-left-color: ${c.colorAcento};">
                        <span>🚚</span>
                        <div>
                            <strong style="color: ${colTit};">Métodos de Envío</strong>
                            <span>${escaparHtmlPdf(c.cierreEnvios)}</span>
                        </div>
                    </div>
                ` : ''}
            </div>
        `
        : '';

    const fechasTxt = obtenerTextoFechasCabeceraPdf();

    return `
        <article class="${obtenerClasesBaseHojaA4('a4-closing-sheet')}"
            style="padding: ${padPx}px; ${obtenerEstiloFondoHojaPdf()} font-family: ${c.fontFamily}; --cover-accent: ${c.colorAcento};">
            ${obtenerCapaImagenFondoHojaPdf()}
            <div class="a4-closing-card" style="background: ${colCardBg}; border-color: ${colCardBorder};">
                ${logoHtml}
                <h2 style="color: ${colTit};">${escaparHtmlPdf(c.cierreTitulo)}</h2>
                <p style="color: ${colTxt};">${escaparHtmlPdf(c.cierreMensaje)}</p>
                ${bloqueComercial}
                <div class="a4-closing-contact-box" style="background: ${subBoxBg}; border-color: ${contactBoxBorder}; color: ${colTxt};">
                    <span style="color: ${colTit}; font-weight: 700;">${escaparHtmlPdf(c.headerNombre)}</span>
                    <span>${escaparHtmlPdf(c.headerContacto)}</span>
                    <span>${escaparHtmlPdf(c.cierreRedes)}</span>
                </div>
                <small style="color: ${colTxt}; opacity: 0.78; margin-top:6px;">${escaparHtmlPdf(fechasTxt)} • Página ${numPagina} de ${totalPaginas}</small>
            </div>
        </article>
    `;
}

function construirHtmlHojaA4(productosHoja, numPagina, totalPaginas) {
    const c = window.pdfConfig;
    const padPx = Math.round(c.margenMm * 3.2);
    const esLista = c.columnas === 1 || c.aspectoFoto === 'none';

    const logoCabecera = c.logoDataUrl
        ? `<img src="${c.logoDataUrl}" alt="Logo" class="a4-brand-logo-img">`
        : `<div class="a4-brand-icon" style="background: ${c.colorAcento};">📦</div>`;

    let contenidoGrid = '';
    if (productosHoja.length === 0) {
        contenidoGrid = `
            <div class="a4-empty-state">
                <div style="font-size: 2rem;">📄</div>
                <strong>No hay productos para mostrar con los filtros actuales</strong>
                <span>Revisa las categorías seleccionadas o los filtros de stock y oferta en la pestaña Contenido.</span>
            </div>
        `;
    } else {
        let ultimaCat = null;
        const itemsHtml = productosHoja.map(p => {
            let sep = '';
            const catActual = (p.categoria || 'General').trim() || 'General';
            if (c.showCatHeaders && catActual.toLowerCase() !== (ultimaCat || '').toLowerCase()) {
                sep = `<div class="a4-cat-separator" style="border-left-color: ${c.colorAcento};">${escaparHtmlPdf(catActual)}</div>`;
                ultimaCat = catActual;
            }
            return sep + construirHtmlTarjetaA4(p, esLista);
        }).join('');

        contenidoGrid = `
            <div class="a4-grid" style="grid-template-columns: repeat(${esLista ? 1 : c.columnas}, minmax(0, 1fr)); gap: ${c.gapPx}px;">
                ${itemsHtml}
            </div>
        `;
    }

    return `
        <article class="${obtenerClasesBaseHojaA4()}" style="padding: ${padPx}px; ${obtenerEstiloFondoHojaPdf()} font-family: ${c.fontFamily};">
            ${obtenerCapaImagenFondoHojaPdf()}
            <header class="a4-header" style="border-bottom-color: ${c.colorAcento};">
                <div class="a4-brand-left">
                    ${logoCabecera}
                    <div>
                        <h3 class="a4-brand-name" style="color: ${c.colorTitulo};">${escaparHtmlPdf(c.headerNombre)}</h3>
                        <p class="a4-brand-sub" style="color: ${c.colorAcento};">${escaparHtmlPdf(c.headerSub)}</p>
                        <p class="a4-brand-contact">${escaparHtmlPdf(c.headerContacto)}</p>
                    </div>
                </div>
                <div class="a4-header-right">
                    <strong>${escaparHtmlPdf(c.headerValidez)}</strong>
                    <span>${escaparHtmlPdf(obtenerTextoFechasCabeceraPdf())}</span>
                </div>
            </header>

            ${contenidoGrid}

            <footer class="a4-footer">
                <span>${escaparHtmlPdf(c.headerNombre)} • ${escaparHtmlPdf(c.footerTexto)}</span>
                <strong>Página ${numPagina} de ${totalPaginas}</strong>
            </footer>
        </article>
    `;
}

function obtenerAbrevUnidadPdf(unidadMedida) {
    if (typeof window.obtenerAbrevUnidad === 'function') {
        return window.obtenerAbrevUnidad(unidadMedida);
    }
    const raw = String(unidadMedida || 'Unidad').trim().toLowerCase();
    if (raw.includes('kilogramo') || raw === 'kg') return 'kg';
    if (raw.includes('gramo') || raw === 'g') return 'g';
    if (raw.includes('mililitro') || raw === 'ml') return 'ml';
    if (raw.includes('litro') || raw === 'l') return 'L';
    if (raw.includes('cuadrado') || raw.includes('m²') || raw === 'm2') return 'm²';
    if (raw.includes('centímetro') || raw.includes('centimetro') || raw === 'cm') return 'cm';
    if (raw.includes('metro') || raw === 'm') return 'm';
    if (raw.includes('pack')) return 'pack';
    if (raw.includes('caja') || raw.includes('bulto')) return 'bulto';
    if (raw.includes('docena')) return 'doc.';
    if (raw.includes('par')) return 'par';
    return 'u.';
}

function formatearStockPdf(valor, familiaMedicion = 'unidad', unidadMedida = 'Unidad') {
    if (typeof window.formatearStockProducto === 'function') {
        return window.formatearStockProducto(valor, familiaMedicion, unidadMedida);
    }
    const num = Math.round((Number(valor) || 0) * 1000) / 1000;
    const abrev = obtenerAbrevUnidadPdf(unidadMedida);
    const esFraccionable3Dec = ['kg', 'L', 'm', 'm²'].includes(abrev) || familiaMedicion === 'peso' || familiaMedicion === 'longitud';
    if (num === 0) return '0';
    if (esFraccionable3Dec && !Number.isInteger(num)) return num.toFixed(3);
    return String(num);
}

function construirHtmlTarjetaA4(prod, esLista) {
    const c = window.pdfConfig;
    const esc = Math.max(0.5, Math.min(1, (Number(c.escalaGlobal) || 100) / 100));
    const alignClass = `text-align-${c.textAlign || 'left'}`;
    const esLateral = !esLista && c.aspectoFoto !== 'none' && (c.imgAlign === 'left' || c.imgAlign === 'right');
    const layoutClass = esLateral ? `layout-${c.imgAlign}` : '';

    const borderCss = (c.borderStyle === 'none' || Number(c.borderWidth) <= 0)
        ? 'border: none;'
        : `border: ${c.borderWidth}px ${c.borderStyle} ${c.colorBorde};`;
    const cardBgLayer = obtenerCapaImagenFondoTarjetaPdf();
    const cardStyle = `border-radius: ${c.radiusPx}px; ${obtenerEstiloFondoTarjetaPdf()} ${borderCss}`;

    const padBody = Math.max(5, Math.round(10 * esc));
    const gapBody = Math.max(3, Math.round(6 * esc));
    const bodyStyle = `padding: ${padBody}px; gap: ${gapBody}px;`;

    const sizeTituloEsc = Math.max(8, Math.round(c.sizeTitulo * esc * 10) / 10);
    const sizePrecioEsc = Math.max(9, Math.round(c.sizePrecio * esc * 10) / 10);
    const sizeDescEsc = Math.max(7, Math.round(c.sizeDesc * esc * 10) / 10);
    const sizeSkuEsc = Math.max(6.5, Math.round(c.sizeSku * esc * 10) / 10);
    const sizeStockEsc = Math.max(6.5, Math.round(c.sizeStock * esc * 10) / 10);
    const imgHeightEsc = Math.max(48, Math.round(c.imgHeightPx * esc));
    const imgRadius = Math.max(0, Number(c.imgRadiusPx ?? 6));

    const foto = (prod.imagenes && prod.imagenes[0]) ? prod.imagenes[0] : '../img/producto.png';
    const tieneOferta = Number(prod.precioOferta) > 0 && Number(prod.precioOferta) < Number(prod.precioNormal);
    const sinStock = Number(prod.stock) <= 0;

    const abrevUnidad = obtenerAbrevUnidadPdf(prod.unidadMedida);
    const unidadPrecioHtml = c.showUnitPrice
        ? `<span class="a4-price-unit">/ ${escaparHtmlPdf(abrevUnidad)}</span>`
        : '';
    const stockFormateado = formatearStockPdf(prod.stock, prod.familiaMedicion, prod.unidadMedida);

    let precioHtml = '';
    if (c.precioModo === 'mayorista') {
        const precioMay = Number(prod.precioMayorista) || 0;
        const valor = precioMay > 0 ? precioMay : (Number(prod.precioNormal) || 0);
        const txt = `$${valor.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
        precioHtml = `
            <div class="a4-price-wrap">
                <span class="a4-price-main" style="font-size: ${sizePrecioEsc}px; color: ${c.colorPrecio};">${txt}${unidadPrecioHtml}</span>
                ${precioMay > 0 ? '<span class="a4-price-tag">MAYORISTA</span>' : ''}
            </div>
        `;
    } else if (c.precioModo === 'publico') {
        const finalVal = tieneOferta ? Number(prod.precioOferta) : (Number(prod.precioNormal) || 0);
        const precioTxt = `$${finalVal.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
        const oldTxt = `$${(Number(prod.precioNormal) || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
        precioHtml = `
            <div class="a4-price-wrap">
                <span class="a4-price-main" style="font-size: ${sizePrecioEsc}px; color: ${c.colorPrecio};">${precioTxt}${unidadPrecioHtml}</span>
                ${tieneOferta ? `<span class="a4-price-old" style="font-size: ${Math.max(7, Math.round(sizePrecioEsc * 0.65))}px;">${oldTxt}</span>` : ''}
            </div>
        `;
    }

    const imgBoxStyle = esLateral
        ? `width: ${c.imgWidthPct || 40}%; min-height: ${imgHeightEsc}px; background: ${c.colorImgBg}; border-radius: ${imgRadius}px; overflow: hidden;`
        : `height: ${imgHeightEsc}px; background: ${c.colorImgBg}; border-radius: ${imgRadius}px; overflow: hidden;`;

    const bloqueImagen = c.aspectoFoto === 'none'
        ? ''
        : `
            <div class="a4-card-img-box" style="${imgBoxStyle}">
                ${(tieneOferta && c.showOferta && c.precioModo === 'publico') ? '<span class="a4-badge-offer">OFERTA</span>' : ''}
                <img src="${foto}" alt="${escaparHtmlPdf(prod.nombre)}" style="object-fit: ${c.aspectoFoto}; object-position: center center; border-radius: ${imgRadius}px;">
            </div>
        `;

    const bloqueTitulo = `
        <div>
            ${c.showSku ? `<div class="a4-sku" style="font-size: ${sizeSkuEsc}px; color: ${c.colorSku};">SKU: ${escaparHtmlPdf(prod.sku)}</div>` : ''}
            <h4 class="a4-prod-name" style="font-size: ${sizeTituloEsc}px; color: ${c.colorTitulo};">${escaparHtmlPdf(prod.nombre)}</h4>
        </div>
    `;

    const bloqueDesc = (c.showDesc && prod.descripcion)
        ? `<p class="a4-prod-desc" style="font-size: ${sizeDescEsc}px; color: ${c.colorDesc};">${escaparHtmlPdf(prod.descripcion)}</p>`
        : '';

    const estiloStock = sinStock
        ? `font-size: ${sizeStockEsc}px;`
        : `font-size: ${sizeStockEsc}px; color: ${c.colorStock}; background: ${c.colorStockBg};`;

    const bloqueStock = c.showStock
        ? `<div><span class="a4-stock-pill ${sinStock ? 'out' : ''}" style="${estiloStock}">${sinStock ? 'Sin stock' : `${stockFormateado} ${escaparHtmlPdf(abrevUnidad)}`}</span></div>`
        : '';

    if (esLista) {
        return `
            <div class="a4-card list-row ${alignClass}" style="${cardStyle}">
                ${cardBgLayer}
                ${bloqueImagen}
                <div class="a4-card-body" style="${bodyStyle}">
                    <div style="flex:1; min-width:0;">
                        ${bloqueTitulo}
                        ${bloqueDesc}
                    </div>
                    <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
                        ${precioHtml}
                        ${bloqueStock}
                    </div>
                </div>
            </div>
        `;
    }

    const mapaCapas = {
        imagen: bloqueImagen,
        titulo: bloqueTitulo,
        descripcion: bloqueDesc,
        precio: precioHtml,
        stock: bloqueStock
    };

    const orden = window.pdfConfig.ordenCapas;

    if (esLateral) {
        const restoSinImagen = orden.filter(k => k !== 'imagen').map(k => mapaCapas[k] || '').join('');
        return `
            <div class="a4-card ${layoutClass} ${alignClass}" style="${cardStyle}">
                ${cardBgLayer}
                ${bloqueImagen}
                <div class="a4-card-body" style="${bodyStyle}">${restoSinImagen}</div>
            </div>
        `;
    }

    if (orden[0] === 'imagen') {
        const resto = orden.slice(1).map(k => mapaCapas[k] || '').join('');
        return `
            <div class="a4-card ${alignClass}" style="${cardStyle}">
                ${cardBgLayer}
                ${bloqueImagen}
                <div class="a4-card-body" style="${bodyStyle}">${resto}</div>
            </div>
        `;
    }

    const todoEnOrden = orden.map(k => mapaCapas[k] || '').join('');
    return `
        <div class="a4-card ${alignClass}" style="${cardStyle}">
            ${cardBgLayer}
            <div class="a4-card-body" style="${bodyStyle}">${todoEnOrden}</div>
        </div>
    `;
}

function actualizarMetricasYControlesVisor(totalProductos, hojas) {
    const listaHojas = Array.isArray(hojas) ? hojas : [];
    const totalPaginas = Math.max(1, listaHojas.length);
    const totalHabilitados = obtenerProductosBasePdf().length;
    const pagActual = window.pdfViewerState.paginaActual;
    const spread = window.pdfViewerState.hojasVisibles;

    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

    setTxt('pdf-stat-top-count', totalHabilitados.toLocaleString('es-AR'));
    setTxt('pdf-filtered-badge', `${totalProductos} incluidos`);

    const elIndicator = document.getElementById('pdf-page-indicator');
    if (elIndicator) elIndicator.innerHTML = `Hoja <strong>${pagActual}</strong> de <strong>${totalPaginas}</strong>`;

    const btnPrev = document.getElementById('btn-pdf-page-prev');
    const btnNext = document.getElementById('btn-pdf-page-next');
    if (btnPrev) btnPrev.disabled = pagActual <= 1;
    if (btnNext) btnNext.disabled = pagActual + spread > totalPaginas;

    setTxt('pdf-metric-pages', `${totalPaginas} ${totalPaginas === 1 ? 'Página' : 'Páginas'} A4`);
    setTxt('pdf-metric-color', window.pdfConfig.modoGrises ? 'Escala de Grises (B&N)' : 'Color (RGB)');
    setTxt('pdf-metric-items', `${totalProductos.toLocaleString('es-AR')} Visibles`);

    const mbEstimado = Math.max(0.2, (totalPaginas * 0.35 + totalProductos * 0.04)).toFixed(1);
    setTxt('pdf-metric-weight', `~${mbEstimado} MB`);

    const selPng = document.getElementById('pdf-png-page-select');
    if (selPng) {
        const valorPrevio = selPng.value || 'all';
        const opciones = [
            `<option value="all">Todas las páginas (ZIP • ${totalPaginas} ${totalPaginas === 1 ? 'hoja' : 'hojas'})</option>`
        ];

        listaHojas.forEach((hoja, idx) => {
            const num = idx + 1;
            const tipoTxt = hoja.tipo === 'portada'
                ? 'Portada'
                : (hoja.tipo === 'cierre' ? 'Hoja de Cierre' : 'Productos');
            opciones.push(`<option value="${num}">Página ${num} — ${tipoTxt}</option>`);
        });

        selPng.innerHTML = opciones.join('');
        if (Array.from(selPng.options).some(o => o.value === valorPrevio)) {
            selPng.value = valorPrevio;
        } else {
            selPng.value = 'all';
        }
        actualizarEtiquetaBotonPngPdf();
    }
}

function actualizarEtiquetaBotonPngPdf() {
    const selPng = document.getElementById('pdf-png-page-select');
    const btnPng = document.getElementById('btn-export-png-zip');
    const badgePng = document.getElementById('pdf-png-mode-badge');
    if (!selPng || !btnPng) return;

    const val = selPng.value || 'all';
    if (val === 'all') {
        btnPng.textContent = '📦 Exportar todas en ZIP';
        btnPng.dataset.originalText = btnPng.textContent;
        if (badgePng) badgePng.textContent = 'ZIP';
    } else {
        btnPng.textContent = `🖼️ Descargar Página ${val} (PNG HD)`;
        btnPng.dataset.originalText = btnPng.textContent;
        if (badgePng) badgePng.textContent = 'PNG HD';
    }
}

function escaparHtmlPdf(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ==========================================================================
   ETAPA 4: MOTOR REAL DE EXPORTACIÓN (PDF HD, PDF WHATSAPP Y PNGs EN ZIP/HD)
   CON SISTEMA ANTI-FALLO DE IMÁGENES (SIN REEMPLAZOS FALSOS)
   ========================================================================== */
let exportacionEnCurso = false;

function obtenerSlugCatalogoPdf() {
    const base = (window.pdfConfig.headerNombre || 'catalogo')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    return base || 'catalogo';
}

function alternarEstadoBotonesExportacion(deshabilitar, btnActivo = null, textoActivo = '') {
    const ids = ['btn-export-pdf-hd', 'btn-export-pdf-wa', 'btn-export-png-zip'];
    ids.forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        if (deshabilitar) {
            if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
            btn.disabled = true;
            if (btn === btnActivo && textoActivo) btn.textContent = textoActivo;
        } else {
            btn.disabled = false;
            if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
        }
    });
}

function cargarElementoImagen(url, usarCors = false) {
    return new Promise((resolve) => {
        if (!url) return resolve(null);

        const img = new Image();
        if (usarCors) img.crossOrigin = 'anonymous';

        const timeout = setTimeout(() => resolve(null), 9000);

        img.onload = async () => {
            clearTimeout(timeout);
            try {
                if (typeof img.decode === 'function') await img.decode();
            } catch (_) { /* continuar con la imagen ya cargada */ }
            resolve(img.naturalWidth > 0 ? img : null);
        };

        img.onerror = () => {
            clearTimeout(timeout);
            resolve(null);
        };

        img.src = url;
    });
}

async function descargarImagenComoDataUrl(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    try {
        const resp = await fetch(url, { mode: 'cors', signal: controller.signal });
        if (!resp.ok) return null;

        const blob = await resp.blob();
        if (!blob || blob.size === 0) return null;

        if (blob.type && !blob.type.startsWith('image/') && blob.type !== 'application/octet-stream') {
            return null;
        }

        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch (_) {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

async function cargarImagenSeguraParaCanvas(src, cacheImagenes = null) {
    if (!src) return null;

    if (cacheImagenes && cacheImagenes.has(src)) {
        return cacheImagenes.get(src);
    }

    let resultado = null;

    if (src.startsWith('data:') || src.startsWith('blob:')) {
        resultado = await cargarElementoImagen(src, false);
        if (cacheImagenes) cacheImagenes.set(src, resultado);
        return resultado;
    }

    let urlAbsoluta = src;
    try {
        urlAbsoluta = new URL(src, window.location.href).href;
    } catch (_) { /* mantener src */ }

    if (urlAbsoluta.startsWith(window.location.origin)) {
        resultado = await cargarElementoImagen(urlAbsoluta, false);
        if (cacheImagenes) cacheImagenes.set(src, resultado);
        return resultado;
    }

    const dataDirecta = await descargarImagenComoDataUrl(urlAbsoluta);
    if (dataDirecta) {
        resultado = await cargarElementoImagen(dataDirecta, false);
    }
    if (!resultado) {
        resultado = await cargarElementoImagen(urlAbsoluta, true);
    }

    if (!resultado && /^https?:\/\//i.test(urlAbsoluta)) {
        const puentes = [
            `https://wsrv.nl/?url=${encodeURIComponent(urlAbsoluta)}&output=png`,
            `https://corsproxy.io/?${encodeURIComponent(urlAbsoluta)}`
        ];

        for (const urlPuente of puentes) {
            const dataPuente = await descargarImagenComoDataUrl(urlPuente);
            if (!dataPuente) continue;

            const imgPuente = await cargarElementoImagen(dataPuente, false);
            if (imgPuente) {
                resultado = imgPuente;
                break;
            }
        }
    }

    if (cacheImagenes) cacheImagenes.set(src, resultado);
    return resultado;
}

async function prepararImagenesParaExportacion(sheetEl, escala, cacheImagenes, erroresImagenes) {
    const imgs = Array.from(sheetEl.querySelectorAll('img'));
    const factor = Math.min(3, Math.max(1.5, Number(escala) || 2));

    for (const imgEl of imgs) {
        const srcOriginal = imgEl.getAttribute('src');
        if (!srcOriginal) continue;

        const imgCargada = await cargarImagenSeguraParaCanvas(srcOriginal, cacheImagenes);

        if (!imgCargada) {
            const nombreRef = imgEl.getAttribute('alt') || 'Imagen externa';
            console.warn('No se pudo exportar la imagen original:', nombreRef, srcOriginal);
            if (erroresImagenes) erroresImagenes.add(nombreRef);
            imgEl.style.display = 'none';
            continue;
        }

        const natW = imgCargada.naturalWidth;
        const natH = imgCargada.naturalHeight;
        if (!natW || !natH) continue;

        const estilos = getComputedStyle(imgEl);
        const padX = (parseFloat(estilos.paddingLeft) || 0) + (parseFloat(estilos.paddingRight) || 0);
        const padY = (parseFloat(estilos.paddingTop) || 0) + (parseFloat(estilos.paddingBottom) || 0);
        const rect = imgEl.getBoundingClientRect();

        let boxW = Math.round(rect.width - padX);
        let boxH = Math.round(rect.height - padY);

        if (boxW <= 0 || boxH <= 0) {
            const maxW = parseFloat(estilos.maxWidth) || natW;
            const maxH = parseFloat(estilos.maxHeight) || natH;
            const escAuto = Math.min(1, maxW / natW, maxH / natH);
            boxW = Math.max(1, Math.round(natW * escAuto));
            boxH = Math.max(1, Math.round(natH * escAuto));
        }

        const fit = estilos.objectFit || 'contain';
        const pos = (estilos.objectPosition || '50% 50%').toLowerCase();

        const ratio = fit === 'cover'
            ? Math.max(boxW / natW, boxH / natH)
            : Math.min(boxW / natW, boxH / natH);

        const drawW = natW * ratio;
        const drawH = natH * ratio;

        let dx = (boxW - drawW) / 2;
        if (pos.startsWith('0%') || pos.startsWith('left')) {
            dx = 0;
        } else if (pos.startsWith('100%') || pos.startsWith('right')) {
            dx = boxW - drawW;
        }
        const dy = (boxH - drawH) / 2;

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(boxW * factor));
        canvas.height = Math.max(1, Math.round(boxH * factor));

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
            imgCargada,
            dx * factor,
            dy * factor,
            drawW * factor,
            drawH * factor
        );

        try {
            const dataUrlEncuadrada = canvas.toDataURL('image/png');
            await new Promise((resolve) => {
                imgEl.onload = resolve;
                imgEl.onerror = resolve;
                imgEl.style.objectFit = 'fill';
                imgEl.style.objectPosition = 'center center';
                imgEl.src = dataUrlEncuadrada;
            });
        } catch (err) {
            console.warn('No se pudo convertir imagen a DataURL encuadrado:', err);
            const nombreRef = imgEl.getAttribute('alt') || 'Imagen externa';
            if (erroresImagenes) erroresImagenes.add(nombreRef);
            imgEl.style.display = 'none';
        }
    }
}

function convertirCanvasAEscalaDeGrises(canvas) {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
        let gris = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        gris = Math.min(255, Math.max(0, (gris - 128) * 1.06 + 128));
        data[i] = gris;
        data[i + 1] = gris;
        data[i + 2] = gris;
    }

    ctx.putImageData(imgData, 0, 0);
}

async function capturarTodasLasHojasEnCanvas(escala, onProgreso, indicesSeleccionados = null) {
    if (typeof html2canvas !== 'function') {
        throw new Error('No se cargó la librería html2canvas. Verifica tu conexión a internet.');
    }

    const { hojas } = construirListaCompletaHojasPdf();
    const totalPaginas = hojas.length;
    const indicesAProcesar = Array.isArray(indicesSeleccionados)
        ? indicesSeleccionados.filter(idx => idx >= 0 && idx < totalPaginas)
        : hojas.map((_, idx) => idx);

    const sandbox = document.createElement('div');
    sandbox.style.position = 'fixed';
    sandbox.style.left = '-10000px';
    sandbox.style.top = '0';
    sandbox.style.zIndex = '-1';
    sandbox.style.pointerEvents = 'none';
    document.body.appendChild(sandbox);

    const canvases = [];
    const cacheImagenes = new Map();
    const erroresImagenes = new Set();

    try {
        for (let k = 0; k < indicesAProcesar.length; k++) {
            const idxHoja = indicesAProcesar[k];
            if (typeof onProgreso === 'function') onProgreso(k + 1, indicesAProcesar.length);

            const hoja = hojas[idxHoja];
            const numPag = idxHoja + 1;
            let htmlHoja = '';

            if (hoja.tipo === 'portada') htmlHoja = construirHtmlPortadaA4(numPag, totalPaginas);
            else if (hoja.tipo === 'cierre') htmlHoja = construirHtmlCierreA4(numPag, totalPaginas);
            else htmlHoja = construirHtmlHojaA4(hoja.items, numPag, totalPaginas);

            sandbox.innerHTML = htmlHoja;
            const sheetEl = sandbox.firstElementChild;
            if (!sheetEl) continue;

            sheetEl.classList.remove('grayscale-mode');
            sheetEl.style.boxShadow = 'none';
            sheetEl.style.borderRadius = '0';

            await prepararImagenesParaExportacion(sheetEl, escala, cacheImagenes, erroresImagenes);

            const canvas = await html2canvas(sheetEl, {
                scale: escala,
                useCORS: true,
                allowTaint: false,
                backgroundColor: window.pdfConfig.colorHoja || '#ffffff',
                logging: false
            });

            if (window.pdfConfig.modoGrises) {
                convertirCanvasAEscalaDeGrises(canvas);
            }

            canvases.push(canvas);
        }
    } finally {
        document.body.removeChild(sandbox);
    }

    return { canvases, imagenesFallidas: Array.from(erroresImagenes) };
}

function notificarImagenesFallidasSiHubo(imagenesFallidas) {
    if (!imagenesFallidas || imagenesFallidas.length === 0) return;
    alert(
        `⚠️ El archivo se exportó, pero no se pudo acceder a la imagen externa de:\n\n• ${imagenesFallidas.join('\n• ')}\n\nSolución: edita esos productos en Inventario y sube o pega la imagen desde tu equipo para guardarla en Bóveda Local.`
    );
}

async function exportarCatalogoPdf(modo) {
    if (exportacionEnCurso) return;

    const jsPDFCtor = window.jspdf?.jsPDF;
    if (!jsPDFCtor) {
        alert('No se cargó la librería jsPDF. Recarga la página con conexión a internet.');
        return;
    }

    const esWhatsApp = modo === 'whatsapp';
    const btnActivo = document.getElementById(esWhatsApp ? 'btn-export-pdf-wa' : 'btn-export-pdf-hd');
    const escala = esWhatsApp ? 1.35 : 2.1;
    const calidadJpeg = esWhatsApp ? 0.72 : 0.94;
    const orientacion = window.pdfConfig.orientacion === 'landscape' ? 'l' : 'p';

    exportacionEnCurso = true;
    alternarEstadoBotonesExportacion(true, btnActivo, '⏳ Preparando catálogo...');

    try {
        const { canvases, imagenesFallidas } = await capturarTodasLasHojasEnCanvas(escala, (actual, total) => {
            if (btnActivo) btnActivo.textContent = `⏳ Generando hoja ${actual} de ${total}...`;
        });

        if (canvases.length === 0) {
            alert('No hay hojas para exportar.');
            return;
        }

        const pdf = new jsPDFCtor({
            orientation: orientacion,
            unit: 'mm',
            format: 'a4',
            compress: true
        });

        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();

        canvases.forEach((canvas, idx) => {
            if (idx > 0) pdf.addPage('a4', orientacion);
            const imgData = canvas.toDataURL('image/jpeg', calidadJpeg);
            pdf.addImage(imgData, 'JPEG', 0, 0, pageW, pageH, undefined, esWhatsApp ? 'FAST' : 'SLOW');
        });

        const sufijoBn = window.pdfConfig.modoGrises ? '-bn' : '';
        const sufijoModo = esWhatsApp ? '-whatsapp' : '-hd';
        const nombreArchivo = `catalogo-${obtenerSlugCatalogoPdf()}${sufijoModo}${sufijoBn}.pdf`;

        pdf.save(nombreArchivo);
        notificarImagenesFallidasSiHubo(imagenesFallidas);
    } catch (err) {
        console.error('Error exportando PDF:', err);
        alert('No se pudo generar el PDF. Revisa la consola (F12) para ver el detalle.');
    } finally {
        exportacionEnCurso = false;
        alternarEstadoBotonesExportacion(false);
        actualizarEtiquetaBotonPngPdf();
    }
}

async function exportarCatalogoPngZip() {
    if (exportacionEnCurso) return;

    const selPng = document.getElementById('pdf-png-page-select');
    const seleccion = selPng ? selPng.value : 'all';
    const esHojaUnica = seleccion !== 'all';
    const numPaginaElegida = esHojaUnica ? parseInt(seleccion, 10) : null;

    if (!esHojaUnica && typeof JSZip !== 'function') {
        alert('No se cargó la librería JSZip. Recarga la página con conexión a internet.');
        return;
    }

    const btnActivo = document.getElementById('btn-export-png-zip');
    exportacionEnCurso = true;
    alternarEstadoBotonesExportacion(
        true,
        btnActivo,
        esHojaUnica ? `⏳ Generando Página ${numPaginaElegida} HD...` : '⏳ Capturando láminas...'
    );

    try {
        const escala = esHojaUnica ? 2.5 : 2;
        const indices = esHojaUnica ? [numPaginaElegida - 1] : null;

        const { canvases, imagenesFallidas } = await capturarTodasLasHojasEnCanvas(
            escala,
            (actual, total) => {
                if (btnActivo) {
                    btnActivo.textContent = esHojaUnica
                        ? `⏳ Renderizando Página ${numPaginaElegida} HD...`
                        : `⏳ Exportando PNG ${actual} de ${total}...`;
                }
            },
            indices
        );

        if (canvases.length === 0) {
            alert('No hay hojas para exportar.');
            return;
        }

        const sufijoBn = window.pdfConfig.modoGrises ? '-bn' : '';

        if (esHojaUnica) {
            const blob = await new Promise(resolve => canvases[0].toBlob(resolve, 'image/png'));
            const numStr = String(numPaginaElegida).padStart(2, '0');
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `catalogo-${obtenerSlugCatalogoPdf()}-pagina-${numStr}${sufijoBn}.png`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 5000);
            notificarImagenesFallidasSiHubo(imagenesFallidas);
            return;
        }

        if (btnActivo) btnActivo.textContent = '📦 Comprimiendo ZIP...';
        const zip = new JSZip();
        const carpeta = zip.folder(`catalogo-${obtenerSlugCatalogoPdf()}`);

        for (let i = 0; i < canvases.length; i++) {
            const blob = await new Promise(resolve => canvases[i].toBlob(resolve, 'image/png'));
            const num = String(i + 1).padStart(2, '0');
            carpeta.file(`pagina-${num}.png`, blob);
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = `catalogo-${obtenerSlugCatalogoPdf()}-pngs${sufijoBn}.zip`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 5000);
        notificarImagenesFallidasSiHubo(imagenesFallidas);
    } catch (err) {
        console.error('Error exportando PNG:', err);
        alert('No se pudo generar la exportación PNG. Revisa la consola (F12) para ver el detalle.');
    } finally {
        exportacionEnCurso = false;
        alternarEstadoBotonesExportacion(false);
        actualizarEtiquetaBotonPngPdf();
    }
}

