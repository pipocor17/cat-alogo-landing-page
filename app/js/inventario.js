/* ==========================================================================
   LÓGICA INTERACTIVA DEL MÓDULO INVENTARIO + ESTUDIO IA (9:16 + REMOVE.BG)
   ========================================================================== */
const STORAGE_KEY_REMOVEBG = 'cat_alogo_removebg_key';
window.productoEstudioActualId = null;
window.imagenRecortadaActual = null;
window.fondoSalidaSeleccionado = 'transparent';
window.imagenesProductoEstudio = [];
window.indiceFotoEstudio = 0;

// Placeholder vectorial limpio para productos sin foto cargada
const CAT_PLACEHOLDER_PRODUCTO_SVG =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">' +
        '<rect width="240" height="240" rx="18" fill="#f1f5f9"/>' +
        '<g fill="none" stroke="#94a3b8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="58" y="54" width="124" height="104" rx="14"/>' +
        '<circle cx="96" cy="90" r="10"/>' +
        '<path d="M182 132l-34-34-66 60"/>' +
        '</g>' +
        '<text x="120" y="192" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="700" fill="#64748b">Sin imagen</text>' +
        '</svg>'
    );

// Estado de personalización visual de la Historia 9:16
window.estiloHistoria = {
    bgMode: 'gradient',       // 'solid' | 'gradient' | 'image'
    bgSolid: '#0f172a',
    bgGrad1: '#0f172a',
    bgGrad2: '#0f766e',
    bgGradDir: '135deg',
    bgImage: '',
    bgOverlay: 35,
    hookBg: '#ef4444',
    hookText: '#ffffff',
    priceText: '#4ade80',
    titleText: '#ffffff',
    ctaBg: '#22c55e',
    ctaText: '#052e16',
    frameStyle: 'card',       // 'card' | 'none' | 'circle'
    imgZoom: 100
};

function inicializarInventario() {

    // 0. Renderizar productos guardados en la Bóveda Local
    if (typeof renderizarProductosCreados === 'function') {
        renderizarProductosCreados();
    }
    setTimeout(reemplazarImagenesGenericasInventario, 60);

    // Botón "+ Crear Nuevo Producto"
    const btnNuevoProd = document.getElementById('btn-nuevo-producto');
    if (btnNuevoProd) {
        btnNuevoProd.addEventListener('click', () => {
            if (typeof abrirModalNuevoProducto === 'function') {
                abrirModalNuevoProducto();
            }
        });
    }

    // Botón "🖨️ Exportar / Imprimir"
    const btnExportarImp = document.getElementById('btn-inv-exportar-imprimir');
    const modalExportar = document.getElementById('modal-inv-exportar');
    if (btnExportarImp && modalExportar) {
        btnExportarImp.addEventListener('click', () => {
            modalExportar.classList.add('active');
        });
    }

    // Botón "🏷️ Categorías" y sincronización de filtros dinámicos
    const btnGestorCat = document.getElementById('btn-gestor-categorias');
    if (btnGestorCat) {
        btnGestorCat.addEventListener('click', () => {
            if (typeof abrirModalGestorCategorias === 'function') {
                abrirModalGestorCategorias();
            }
        });
    }
    if (typeof sincronizarUIconCategorias === 'function') {
        sincronizarUIconCategorias();
    }

    // 1. Delegación de eventos en toda la columna de productos
    const listColumn = document.querySelector('.inv-list-column');
    if (listColumn) {
        listColumn.addEventListener('click', (e) => {

            // A) Botón EDITAR producto
            const btnEditar = e.target.closest('.btn-editar-prod');
            if (btnEditar) {
                const id = btnEditar.getAttribute('data-id');
                if (typeof abrirModalEditarProducto === 'function') {
                    abrirModalEditarProducto(id);
                }
                return;
            }

            // B) Botón ELIMINAR producto
            const btnEliminar = e.target.closest('.btn-eliminar-prod');
            if (btnEliminar) {
                const id = btnEliminar.getAttribute('data-id');
                if (typeof eliminarProductoBoveda === 'function') {
                    eliminarProductoBoveda(id);
                }
                return;
            }

            // C) Botón VISIBILIDAD EN WEB (Visible / Oculto)
            const btnVis = e.target.closest('.btn-toggle-visibilidad');
            if (btnVis) {
                const id = btnVis.getAttribute('data-id');
                if (typeof alternarVisibilidadProducto === 'function') {
                    alternarVisibilidadProducto(id);
                }
                return;
            }

            // C2) Botón VISIBILIDAD EN CATÁLOGO PDF
            const btnPdf = e.target.closest('.btn-toggle-pdf');
            if (btnPdf) {
                const id = btnPdf.getAttribute('data-id');
                if (typeof alternarVisibilidadPdfProducto === 'function') {
                    alternarVisibilidadPdfProducto(id);
                }
                return;
            }

            // D) Botón + AÑADIR VARIANTE
            const btnAddVar = e.target.closest('.btn-add-variante');
            if (btnAddVar) {
                const id = btnAddVar.getAttribute('data-id');
                if (typeof agregarVarianteRapida === 'function') {
                    agregarVarianteRapida(id);
                }
                return;
            }

            // D2) Botón EDITAR VARIANTE (clic sobre el precio de la variante)
            const btnEditVar = e.target.closest('.btn-editar-variante');
            if (btnEditVar) {
                const prodId = btnEditVar.getAttribute('data-prod-id');
                const varIdx = parseInt(btnEditVar.getAttribute('data-var-idx'), 10);
                if (typeof abrirModalEditarVariante === 'function') {
                    abrirModalEditarVariante(prodId, varIdx);
                }
                return;
            }

            // E) Botón ENVIAR A ESTUDIO IA
            const btnStory = e.target.closest('.btn-story-trigger');
            if (btnStory) {
                cargarProductoEnEstudioIA(btnStory);
                return;
            }

            // F) Control rápido de Stock por Variantes (+ / -)
            const stepBtn = e.target.closest('.step-btn');
            if (stepBtn) {
                const action = stepBtn.getAttribute('data-action');
                const delta = action === 'plus' ? 1 : -1;

                const prodId = stepBtn.getAttribute('data-prod-id');
                const varIdx = stepBtn.getAttribute('data-var-idx');
                if (prodId !== null && varIdx !== null && typeof actualizarStockVarianteBoveda === 'function') {
                    actualizarStockVarianteBoveda(prodId, parseInt(varIdx, 10), delta);
                    return;
                }

                // Fallback para la tarjeta de ejemplo estática
                const group = stepBtn.getAttribute('data-group');
                const valSpan = stepBtn.parentElement.querySelector('.step-val');
                let current = parseInt(valSpan.textContent, 10);
                if (action === 'plus') current++;
                if (action === 'minus' && current > 0) current--;
                valSpan.textContent = current;

                const allGroupVals = document.querySelectorAll(`.step-val[data-group="${group}"]`);
                let suma = 0;
                allGroupVals.forEach(el => suma += parseInt(el.textContent, 10));

                const totalLabel = document.getElementById(`total-stock-${group}`);
                const sumaLabel = document.getElementById(`suma-variantes-${group}`);
                if (totalLabel) totalLabel.textContent = `${suma} un.`;
                if (sumaLabel) sumaLabel.textContent = `${suma} unidades`;
            }
        });
    }

    // 2. Pestañas del Estudio Creativo IA (Stories vs Borrador de Fondo)
    const studioTabs = document.querySelectorAll('.studio-tab');
    const studioContents = document.querySelectorAll('.studio-tab-content');

    studioTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            studioTabs.forEach(t => t.classList.remove('active'));
            studioContents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const targetId = `tab-${tab.getAttribute('data-studio-tab')}`;
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) targetPanel.classList.add('active');
        });
    });

    // 3. Inicializar Editor Avanzado de Stories 9:16 (Textos, Colores, Fondos, Fotos y WhatsApp)
    inicializarEditorStoriesAvanzado();

    // 4. Inicializar Borrador de Fondos Real (API Remove.bg)
    inicializarBorradorRemoveBg();

    // 5. Buscador, selector de ordenamiento y cantidad por página
    const searchInput = document.getElementById('inv-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (typeof aplicarFiltrosYPaginacionInventario === 'function') {
                aplicarFiltrosYPaginacionInventario(true);
            }
        });
    }

    const sortSelect = document.getElementById('inv-sort-select');
    if (sortSelect) {
        sortSelect.value = window.ordenInventarioActual || 'recientes';
        sortSelect.addEventListener('change', (e) => {
            window.ordenInventarioActual = e.target.value;
            window.paginaActualInventario = 1;
            if (typeof renderizarProductosCreados === 'function') {
                renderizarProductosCreados();
            }
        });
    }

    const perPageSelect = document.getElementById('inv-per-page-select');
    if (perPageSelect) {
        perPageSelect.value = String(window.productosPorPagina || 30);
        perPageSelect.addEventListener('change', (e) => {
            const nuevoLimite = parseInt(e.target.value, 10) || 30;
            window.productosPorPagina = nuevoLimite;
            localStorage.setItem('cat_alogo_inv_por_pagina', String(nuevoLimite));
            if (typeof aplicarFiltrosYPaginacionInventario === 'function') {
                aplicarFiltrosYPaginacionInventario(true);
            }
        });
    }
}

/* ==========================================================================
   EDITOR AVANZADO DE STORIES 9:16 (COLORES, FONDOS, FOTOS Y WHATSAPP)
   ========================================================================== */
function inicializarEditorStoriesAvanzado() {
    document.querySelectorAll('.studio-subtab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.studio-subtab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.studio-subpanel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const panel = document.getElementById(`subpanel-${btn.getAttribute('data-subtab')}`);
            if (panel) panel.classList.add('active');
        });
    });

    const enlazarTexto = (inputId, previewId) => {
        const inp = document.getElementById(inputId);
        const prev = document.getElementById(previewId);
        if (inp && prev) {
            inp.addEventListener('input', e => { prev.textContent = e.target.value; });
        }
    };
    enlazarTexto('input-story-brand', 'preview-brand');
    enlazarTexto('input-story-hook', 'preview-hook');
    enlazarTexto('input-story-price', 'preview-price');
    enlazarTexto('input-story-old', 'preview-old-price');
    enlazarTexto('input-story-title', 'preview-title');
    enlazarTexto('input-story-cta', 'preview-cta');

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const hook = btn.getAttribute('data-hook');
            const inputHook = document.getElementById('input-story-hook');
            if (inputHook) inputHook.value = hook;
            const prevHook = document.getElementById('preview-hook');
            if (prevHook) prevHook.textContent = hook;
        });
    });

    const btnPrevFoto = document.getElementById('btn-story-photo-prev');
    const btnNextFoto = document.getElementById('btn-story-photo-next');
    if (btnPrevFoto) {
        btnPrevFoto.addEventListener('click', () => {
            if (window.imagenesProductoEstudio.length < 2) return;
            const total = window.imagenesProductoEstudio.length;
            seleccionarFotoEstudio((window.indiceFotoEstudio - 1 + total) % total);
        });
    }
    if (btnNextFoto) {
        btnNextFoto.addEventListener('click', () => {
            if (window.imagenesProductoEstudio.length < 2) return;
            const total = window.imagenesProductoEstudio.length;
            seleccionarFotoEstudio((window.indiceFotoEstudio + 1) % total);
        });
    }

    document.querySelectorAll('.bg-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.bg-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.getAttribute('data-bg-mode');
            window.estiloHistoria.bgMode = mode;

            ['solid', 'gradient', 'image'].forEach(m => {
                const cfg = document.getElementById(`cfg-bg-${m}`);
                if (cfg) cfg.style.display = (m === mode) ? 'block' : 'none';
            });
            aplicarEstilosVistaPreviaHistoria();
        });
    });

    const enlazarColor = (id, prop) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', (e) => {
            window.estiloHistoria[prop] = e.target.value;
            aplicarEstilosVistaPreviaHistoria();
        });
    };
    enlazarColor('color-bg-solid', 'bgSolid');
    enlazarColor('color-bg-grad1', 'bgGrad1');
    enlazarColor('color-bg-grad2', 'bgGrad2');
    enlazarColor('color-hook-bg', 'hookBg');
    enlazarColor('color-hook-text', 'hookText');
    enlazarColor('color-price-text', 'priceText');
    enlazarColor('color-title-text', 'titleText');
    enlazarColor('color-cta-bg', 'ctaBg');
    enlazarColor('color-cta-text', 'ctaText');

    const selDir = document.getElementById('select-bg-grad-dir');
    if (selDir) {
        selDir.addEventListener('change', (e) => {
            window.estiloHistoria.bgGradDir = e.target.value;
            aplicarEstilosVistaPreviaHistoria();
        });
    }

    const inputBgFile = document.getElementById('input-bg-img-file');
    if (inputBgFile) {
        inputBgFile.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                window.estiloHistoria.bgImage = ev.target.result;
                window.estiloHistoria.bgMode = 'image';
                aplicarEstilosVistaPreviaHistoria();
            };
            reader.readAsDataURL(file);
            inputBgFile.value = '';
        });
    }

    const btnApplyBgUrl = document.getElementById('btn-apply-bg-url');
    if (btnApplyBgUrl) {
        btnApplyBgUrl.addEventListener('click', () => {
            const url = document.getElementById('input-bg-img-url')?.value.trim();
            if (!url) return;
            window.estiloHistoria.bgImage = url;
            window.estiloHistoria.bgMode = 'image';
            aplicarEstilosVistaPreviaHistoria();
        });
    }

    const btnClearBgImg = document.getElementById('btn-clear-bg-img');
    if (btnClearBgImg) {
        btnClearBgImg.addEventListener('click', () => {
            window.estiloHistoria.bgImage = '';
            const inpUrl = document.getElementById('input-bg-img-url');
            if (inpUrl) inpUrl.value = '';
            aplicarEstilosVistaPreviaHistoria();
        });
    }

    const rangeOverlay = document.getElementById('range-bg-overlay');
    if (rangeOverlay) {
        rangeOverlay.addEventListener('input', (e) => {
            window.estiloHistoria.bgOverlay = parseInt(e.target.value, 10) || 0;
            const lbl = document.getElementById('val-bg-overlay');
            if (lbl) lbl.textContent = `${window.estiloHistoria.bgOverlay}%`;
            aplicarEstilosVistaPreviaHistoria();
        });
    }

    document.querySelectorAll('.frame-style-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.frame-style-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            window.estiloHistoria.frameStyle = btn.getAttribute('data-frame');
            aplicarEstilosVistaPreviaHistoria();
        });
    });

    const rangeZoom = document.getElementById('range-img-zoom');
    if (rangeZoom) {
        rangeZoom.addEventListener('input', (e) => {
            window.estiloHistoria.imgZoom = parseInt(e.target.value, 10) || 100;
            const lbl = document.getElementById('val-img-zoom');
            if (lbl) lbl.textContent = `${window.estiloHistoria.imgZoom}%`;
            aplicarEstilosVistaPreviaHistoria();
        });
    }

    const btnReset = document.getElementById('btn-reset-story-style');
    if (btnReset) {
        btnReset.addEventListener('click', restablecerEstiloHistoria);
    }

    const btnDescargar = document.getElementById('btn-descargar-historia');
    if (btnDescargar) btnDescargar.addEventListener('click', descargarHistoriaPNG);

    const btnWhatsApp = document.getElementById('btn-compartir-whatsapp');
    if (btnWhatsApp) btnWhatsApp.addEventListener('click', compartirHistoriaWhatsApp);

    aplicarEstilosVistaPreviaHistoria();
}

function aplicarEstilosVistaPreviaHistoria() {
    const s = window.estiloHistoria;
    const frame = document.getElementById('story-canvas-preview');
    const overlay = document.getElementById('story-bg-overlay');
    const brand = document.getElementById('preview-brand');
    const hook = document.getElementById('preview-hook');
    const price = document.getElementById('preview-price');
    const oldPrice = document.getElementById('preview-old-price');
    const title = document.getElementById('preview-title');
    const cta = document.getElementById('preview-cta');
    const imgBox = document.getElementById('preview-img-box');
    const imgEl = document.getElementById('preview-story-img');

    if (frame) {
        if (s.bgMode === 'solid') {
            frame.style.backgroundImage = 'none';
            frame.style.backgroundColor = s.bgSolid;
        } else if (s.bgMode === 'image' && s.bgImage) {
            frame.style.backgroundColor = s.bgSolid;
            frame.style.backgroundImage = `url("${s.bgImage}")`;
        } else {
            frame.style.backgroundColor = s.bgGrad1;
            frame.style.backgroundImage = `linear-gradient(${s.bgGradDir}, ${s.bgGrad1}, ${s.bgGrad2})`;
        }
    }

    if (overlay) {
        const alpha = (s.bgMode === 'image' && s.bgImage) ? (s.bgOverlay / 100) : 0;
        overlay.style.background = `rgba(0, 0, 0, ${alpha})`;
    }

    if (hook) {
        hook.style.background = s.hookBg;
        hook.style.color = s.hookText;
    }
    if (price) price.style.color = s.priceText;
    if (title) title.style.color = s.titleText;
    if (oldPrice) oldPrice.style.color = s.titleText;
    if (brand) brand.style.color = s.titleText;
    if (cta) {
        cta.style.background = s.ctaBg;
        cta.style.color = s.ctaText;
    }

    if (imgBox) {
        imgBox.classList.remove('style-card', 'style-none', 'style-circle');
        imgBox.classList.add(`style-${s.frameStyle}`);
    }

    if (imgEl) {
        imgEl.style.transform = `scale(${s.imgZoom / 100})`;
    }
}

function restablecerEstiloHistoria() {
    window.estiloHistoria = {
        bgMode: 'gradient',
        bgSolid: '#0f172a',
        bgGrad1: '#0f172a',
        bgGrad2: '#0f766e',
        bgGradDir: '135deg',
        bgImage: '',
        bgOverlay: 35,
        hookBg: '#ef4444',
        hookText: '#ffffff',
        priceText: '#4ade80',
        titleText: '#ffffff',
        ctaBg: '#22c55e',
        ctaText: '#052e16',
        frameStyle: 'card',
        imgZoom: 100
    };

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setVal('color-bg-solid', '#0f172a');
    setVal('color-bg-grad1', '#0f172a');
    setVal('color-bg-grad2', '#0f766e');
    setVal('select-bg-grad-dir', '135deg');
    setVal('input-bg-img-url', '');
    setVal('range-bg-overlay', 35);
    setVal('color-hook-bg', '#ef4444');
    setVal('color-hook-text', '#ffffff');
    setVal('color-price-text', '#4ade80');
    setVal('color-title-text', '#ffffff');
    setVal('color-cta-bg', '#22c55e');
    setVal('color-cta-text', '#052e16');
    setVal('range-img-zoom', 100);

    const lblZoom = document.getElementById('val-img-zoom');
    if (lblZoom) lblZoom.textContent = '100%';
    const lblOv = document.getElementById('val-bg-overlay');
    if (lblOv) lblOv.textContent = '35%';

    document.querySelectorAll('.bg-mode-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-bg-mode') === 'gradient'));
    ['solid', 'gradient', 'image'].forEach(m => {
        const cfg = document.getElementById(`cfg-bg-${m}`);
        if (cfg) cfg.style.display = (m === 'gradient') ? 'block' : 'none';
    });
    document.querySelectorAll('.frame-style-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-frame') === 'card'));

    aplicarEstilosVistaPreviaHistoria();
}

function cargarProductoEnEstudioIA(btn) {
    const prodId = btn.getAttribute('data-id') || null;
    window.productoEstudioActualId = prodId;
    window.imagenRecortadaActual = null;

    const title = btn.getAttribute('data-title') || 'Producto Destacado';
    const price = btn.getAttribute('data-price') || '$0';
    const oldPrice = btn.getAttribute('data-old') || '';

    const prod = Array.isArray(window.bovedaProductos)
        ? window.bovedaProductos.find(p => String(p.id) === String(prodId))
        : null;

    const esFotoReal = (src) => {
        const s = String(src || '').trim();
        return s !== '' && !s.includes('producto.png') && !s.startsWith('data:image/svg+xml');
    };

    let listaFotos = [];
    if (prod && Array.isArray(prod.imagenes) && prod.imagenes.length > 0) {
        listaFotos = prod.imagenes.filter(esFotoReal);
    } else {
        const card = btn.closest('.inv-product-card');
        const cardImg = card ? card.querySelector('img') : null;
        const imgFallback = btn.getAttribute('data-img') || (cardImg ? cardImg.src : '');
        if (esFotoReal(imgFallback)) listaFotos = [imgFallback];
    }

    window.imagenesProductoEstudio = listaFotos;
    window.indiceFotoEstudio = 0;

    document.getElementById('preview-title').textContent = title;
    document.getElementById('preview-price').textContent = price;
    document.getElementById('preview-old-price').textContent = oldPrice;

    const inputTitle = document.getElementById('input-story-title');
    const inputPrice = document.getElementById('input-story-price');
    const inputOld = document.getElementById('input-story-old');
    if (inputTitle) inputTitle.value = title;
    if (inputPrice) inputPrice.value = price;
    if (inputOld) inputOld.value = oldPrice;

    if (listaFotos.length > 0) {
        seleccionarFotoEstudio(0);
    } else {
        mostrarPlaceholderFotoEstudio();
    }
    renderizarSelectorFotosEstudio();

    const tabStories = document.querySelector('.studio-tab[data-studio-tab="stories"]');
    if (tabStories) tabStories.click();

    const studioPanel = document.getElementById('ia-studio-panel');
    if (studioPanel) {
        studioPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function mostrarPlaceholderFotoEstudio() {
    const storyImg = document.getElementById('preview-story-img');
    const placeholder = document.getElementById('preview-story-placeholder');
    if (storyImg) {
        storyImg.src = '';
        storyImg.style.display = 'none';
    }
    if (placeholder) placeholder.style.display = 'flex';

    const beforeImg = document.getElementById('remover-img-before');
    const afterImg = document.getElementById('remover-img-after');
    const phBefore = document.getElementById('remover-placeholder-before');
    const phAfter = document.getElementById('remover-placeholder-after');

    if (beforeImg) { beforeImg.src = ''; beforeImg.style.display = 'none'; }
    if (afterImg)  { afterImg.src = '';  afterImg.style.display = 'none'; }
    if (phBefore)  phBefore.style.display = 'flex';
    if (phAfter)   phAfter.style.display = 'flex';
}

function seleccionarFotoEstudio(idx) {
    if (!window.imagenesProductoEstudio[idx]) return;
    window.indiceFotoEstudio = idx;
    const imgSrc = window.imagenesProductoEstudio[idx];

    const storyImg = document.getElementById('preview-story-img');
    const placeholder = document.getElementById('preview-story-placeholder');
    if (storyImg) {
        storyImg.src = imgSrc;
        storyImg.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';

    const beforeImg = document.getElementById('remover-img-before');
    const afterImg = document.getElementById('remover-img-after');
    const phBefore = document.getElementById('remover-placeholder-before');
    const phAfter = document.getElementById('remover-placeholder-after');

    if (beforeImg) { beforeImg.src = imgSrc; beforeImg.style.display = 'block'; }
    if (afterImg)  { afterImg.src = imgSrc;  afterImg.style.display = 'block'; }
    if (phBefore)  phBefore.style.display = 'none';
    if (phAfter)   phAfter.style.display = 'none';

    const afterLabel = document.getElementById('remover-after-label');
    if (afterLabel) afterLabel.textContent = 'DESPUÉS: Sin Fondo';

    const counter = document.getElementById('story-photo-counter');
    if (counter) counter.textContent = `${idx + 1}/${window.imagenesProductoEstudio.length}`;

    document.querySelectorAll('#story-photo-thumbs .story-thumb-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === idx);
    });
}

function renderizarSelectorFotosEstudio() {
    const box = document.getElementById('story-product-photos-box');
    const thumbs = document.getElementById('story-photo-thumbs');
    const counter = document.getElementById('story-photo-counter');
    if (!box || !thumbs) return;

    const fotos = window.imagenesProductoEstudio;
    if (fotos.length <= 1) {
        box.style.display = 'none';
        thumbs.innerHTML = '';
        return;
    }

    box.style.display = 'block';
    if (counter) counter.textContent = `${window.indiceFotoEstudio + 1}/${fotos.length}`;

    thumbs.innerHTML = fotos.map((src, i) => `
        <button type="button" class="story-thumb-btn ${i === window.indiceFotoEstudio ? 'active' : ''}" data-photo-idx="${i}" title="Usar foto ${i + 1}">
            <img src="${src}" alt="Foto ${i + 1}">
        </button>
    `).join('');

    thumbs.querySelectorAll('.story-thumb-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            seleccionarFotoEstudio(parseInt(btn.getAttribute('data-photo-idx'), 10));
        });
    });
}

/* ==========================================================================
   MOTOR CANVAS 9:16 ULTRA HD (1080x1920) + COMPARTIR EN WHATSAPP
   ========================================================================== */
async function renderizarCanvasHistoria() {
    const W = 1080;
    const H = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const s = window.estiloHistoria;

    const brand = document.getElementById('preview-brand')?.textContent.trim() || 'cat-alogo.store';
    const hook = document.getElementById('preview-hook')?.textContent.trim() || 'OFERTA ESPECIAL';
    const title = document.getElementById('preview-title')?.textContent.trim() || 'Producto';
    const price = document.getElementById('preview-price')?.textContent.trim() || '$0';
    const oldPrice = document.getElementById('preview-old-price')?.textContent.trim() || '';
    const cta = document.getElementById('preview-cta')?.textContent.trim() || 'Pide por WhatsApp';
    const storyImgEl = document.getElementById('preview-story-img');
    const imgSrc = (storyImgEl && storyImgEl.style.display !== 'none' && storyImgEl.src) ? storyImgEl.src : '';

    if (s.bgMode === 'solid') {
        ctx.fillStyle = s.bgSolid;
        ctx.fillRect(0, 0, W, H);
    } else if (s.bgMode === 'image' && s.bgImage) {
        ctx.fillStyle = s.bgSolid;
        ctx.fillRect(0, 0, W, H);
        try {
            const bgImg = await cargarImagenCanvas(s.bgImage);
            const scale = Math.max(W / bgImg.width, H / bgImg.height);
            const dw = bgImg.width * scale;
            const dh = bgImg.height * scale;
            ctx.drawImage(bgImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
        } catch (err) {
            console.warn('No se pudo dibujar imagen de fondo por CORS:', err);
        }
        if (s.bgOverlay > 0) {
            ctx.fillStyle = `rgba(0, 0, 0, ${s.bgOverlay / 100})`;
            ctx.fillRect(0, 0, W, H);
        }
    } else {
        let x0 = 0, y0 = 0, x1 = W, y1 = H;
        if (s.bgGradDir === '180deg') { x0 = 0; y0 = 0; x1 = 0; y1 = H; }
        else if (s.bgGradDir === '90deg') { x0 = 0; y0 = 0; x1 = W; y1 = 0; }
        else if (s.bgGradDir === '45deg') { x0 = 0; y0 = H; x1 = W; y1 = 0; }
        const grad = ctx.createLinearGradient(x0, y0, x1, y1);
        grad.addColorStop(0, s.bgGrad1);
        grad.addColorStop(1, s.bgGrad2);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = s.titleText;
    ctx.font = '600 34px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(brand, 80, 120);
    ctx.restore();

    ctx.font = '800 40px Inter, sans-serif';
    const hookWidth = Math.min(ctx.measureText(hook).width + 120, W - 120);
    ctx.fillStyle = s.hookBg;
    dibujarRectRedondeado(ctx, (W - hookWidth) / 2, 220, hookWidth, 96, 48);
    ctx.fill();

    ctx.fillStyle = s.hookText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(hook, W / 2, 268, W - 180);

    const boxSize = 720;
    const boxX = (W - boxSize) / 2;
    const boxY = 390;

    ctx.save();
    if (s.frameStyle === 'card') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
        dibujarRectRedondeado(ctx, boxX, boxY, boxSize, boxSize, 48);
        ctx.fill();
        ctx.clip();
    } else if (s.frameStyle === 'circle') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
        ctx.beginPath();
        ctx.arc(W / 2, boxY + boxSize / 2, boxSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.clip();
    }

    if (imgSrc) {
        try {
            const img = await cargarImagenCanvas(imgSrc);
            const pad = s.frameStyle === 'none' ? 10 : 48;
            const maxSide = (boxSize - pad * 2) * (s.imgZoom / 100);
            const ratio = Math.min(maxSide / img.width, maxSide / img.height);
            const drawW = img.width * ratio;
            const drawH = img.height * ratio;
            ctx.drawImage(img, boxX + (boxSize - drawW) / 2, boxY + (boxSize - drawH) / 2, drawW, drawH);
        } catch (err) {
            console.warn('No se pudo dibujar la imagen externa por CORS:', err);
        }
    }
    ctx.restore();

    let cursorY = 1230;
    if (oldPrice) {
        ctx.save();
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = s.titleText;
        ctx.font = '600 48px Inter, sans-serif';
        ctx.fillText(oldPrice, W / 2, cursorY);
        const oldW = ctx.measureText(oldPrice).width;
        ctx.strokeStyle = s.titleText;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(W / 2 - oldW / 2 - 8, cursorY);
        ctx.lineTo(W / 2 + oldW / 2 + 8, cursorY);
        ctx.stroke();
        ctx.restore();
        cursorY += 105;
    }

    ctx.fillStyle = s.priceText;
    ctx.font = '900 135px Inter, sans-serif';
    ctx.fillText(price, W / 2, cursorY, W - 120);

    ctx.fillStyle = s.titleText;
    ctx.font = '700 54px Inter, sans-serif';
    ctx.fillText(title, W / 2, cursorY + 125, W - 140);

    const ctaW = W - 180;
    const ctaY = 1660;
    ctx.fillStyle = s.ctaBg;
    dibujarRectRedondeado(ctx, (W - ctaW) / 2, ctaY, ctaW, 120, 60);
    ctx.fill();

    ctx.fillStyle = s.ctaText;
    ctx.font = '800 42px Inter, sans-serif';
    ctx.fillText(cta, W / 2, ctaY + 62, ctaW - 80);

    return { canvas, title };
}

async function descargarHistoriaPNG() {
    try {
        const { canvas, title } = await renderizarCanvasHistoria();
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        link.download = `historia-${slug || 'cat-alogo'}.png`;
        link.href = dataUrl;
        link.click();
    } catch (error) {
        alert('No se pudo exportar la imagen porque alguna foto viene de una URL externa que bloquea descargas (CORS). Súbela desde tu PC para descargarla en Ultra HD.');
    }
}

async function compartirHistoriaWhatsApp() {
    try {
        const { canvas, title } = await renderizarCanvasHistoria();
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const fileName = `estado-${slug || 'cat-alogo'}.png`;

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('No se pudo generar la imagen.');

        const file = new File([blob], fileName, { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: title,
                text: `${title} - ${document.getElementById('preview-price')?.textContent || ''}`
            });
            return;
        }

        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = fileName;
        link.href = dataUrl;
        link.click();

        let copiada = false;
        if (navigator.clipboard && window.ClipboardItem) {
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                copiada = true;
            } catch (clipErr) {
                console.warn('No se pudo copiar al portapapeles automáticamente:', clipErr);
            }
        }

        window.open('https://web.whatsapp.com/', '_blank', 'noopener');
        alert(
            copiada
                ? '✅ Historia descargada y copiada al portapapeles.\n\nSe abrió WhatsApp Web: ve a "Estados" y pega (Ctrl + V) o sube la imagen descargada.'
                : '✅ Historia descargada en tu PC.\n\nSe abrió WhatsApp Web: ve a "Estados" y adjunta la imagen recién descargada.'
        );
    } catch (err) {
        console.error(err);
        window.open('https://web.whatsapp.com/', '_blank', 'noopener');
    }
}

function cargarImagenCanvas(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        if (src.startsWith('http')) img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function dibujarRectRedondeado(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/* ==========================================================================
   MOTOR REAL DE BORRADOR DE FONDOS (API REMOVE.BG)
   ========================================================================== */
function inicializarBorradorRemoveBg() {
    window.fondoSalidaSeleccionado = 'transparent';

    const inputKey = document.getElementById('input-removebg-key');
    const btnGuardarKey = document.getElementById('btn-guardar-apikey');
    const statusBadge = document.getElementById('remover-api-status');
    const btnEjecutar = document.getElementById('btn-ejecutar-removebg');
    const btnAplicar = document.getElementById('btn-aplicar-recorte');
    const btnDescargar = document.getElementById('btn-descargar-recorte');
    const bgPreviewBox = document.getElementById('bg-preview-box');

    const savedKey = localStorage.getItem(STORAGE_KEY_REMOVEBG) || '';
    if (inputKey && savedKey) {
        inputKey.value = savedKey;
        if (statusBadge) statusBadge.textContent = 'API Lista ✓';
    }

    if (btnGuardarKey) {
        btnGuardarKey.addEventListener('click', () => {
            const key = inputKey.value.trim();
            if (!key) {
                localStorage.removeItem(STORAGE_KEY_REMOVEBG);
                if (statusBadge) statusBadge.textContent = 'Sin API Key';
                alert('API Key eliminada.');
                return;
            }
            localStorage.setItem(STORAGE_KEY_REMOVEBG, key);
            if (statusBadge) statusBadge.textContent = 'API Lista ✓';
            alert('API Key de Remove.bg guardada en tu navegador.');
        });
    }

    document.querySelectorAll('.bg-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.bg-opt').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            const bg = opt.getAttribute('data-bg');
            window.fondoSalidaSeleccionado = bg;

            if (!bgPreviewBox) return;
            if (bg === 'transparent') {
                bgPreviewBox.style.background = '';
                bgPreviewBox.classList.add('checkerboard-bg');
            } else {
                bgPreviewBox.classList.remove('checkerboard-bg');
                bgPreviewBox.style.background = bg;
            }
        });
    });

    if (btnEjecutar) btnEjecutar.addEventListener('click', ejecutarRemoveBg);
    if (btnAplicar) btnAplicar.addEventListener('click', aplicarRecorteAlProducto);
    if (btnDescargar) btnDescargar.addEventListener('click', descargarRecortePNG);
}

async function ejecutarRemoveBg() {
    const apiKey = (document.getElementById('input-removebg-key')?.value || localStorage.getItem(STORAGE_KEY_REMOVEBG) || '').trim();
    if (!apiKey) {
        alert('Primero pega y guarda tu API Key gratuita de remove.bg/api.');
        document.getElementById('input-removebg-key')?.focus();
        return;
    }

    const imgBefore = document.getElementById('remover-img-before');
    const imgAfter = document.getElementById('remover-img-after');
    const phAfter = document.getElementById('remover-placeholder-after');
    const btnEjecutar = document.getElementById('btn-ejecutar-removebg');
    const afterLabel = document.getElementById('remover-after-label');

    const srcActual = imgBefore ? (imgBefore.getAttribute('src') || '').trim() : '';
    if (!imgBefore || imgBefore.style.display === 'none' || !srcActual) {
        alert('Primero selecciona un producto con foto usando el botón "✨ Estudio IA" en el listado.');
        return;
    }

    const textoOriginal = btnEjecutar.textContent;
    btnEjecutar.disabled = true;
    btnEjecutar.textContent = '⏳ Recortando fondo con IA...';

    try {
        const formData = new FormData();
        formData.append('size', 'auto');

        if (imgBefore.src.startsWith('data:') || imgBefore.src.startsWith(window.location.origin)) {
            const blobImg = await fetch(imgBefore.src).then(r => r.blob());
            formData.append('image_file', blobImg, 'producto.png');
        } else {
            formData.append('image_url', imgBefore.src);
        }

        const resp = await fetch('https://api.remove.bg/v1.0/removebg', {
            method: 'POST',
            headers: { 'X-Api-Key': apiKey },
            body: formData
        });

        if (!resp.ok) {
            if (resp.status === 403) throw new Error('API Key inválida. Verifícala en remove.bg.');
            if (resp.status === 402) throw new Error('Te quedaste sin créditos en tu cuenta de Remove.bg.');
            throw new Error(`Error de Remove.bg (código ${resp.status}).`);
        }

        const pngBlob = await resp.blob();
        const dataUrlTransparente = await blobADataURL(pngBlob);

        window.imagenRecortadaActual = dataUrlTransparente;
        if (imgAfter) {
            imgAfter.src = dataUrlTransparente;
            imgAfter.style.display = 'block';
        }
        if (phAfter) phAfter.style.display = 'none';
        if (afterLabel) afterLabel.textContent = 'DESPUÉS: PNG Transparente ✓';

        const storyImg = document.getElementById('preview-story-img');
        const placeholder = document.getElementById('preview-story-placeholder');
        if (storyImg) {
            storyImg.src = dataUrlTransparente;
            storyImg.style.display = 'block';
        }
        if (placeholder) placeholder.style.display = 'none';

    } catch (err) {
        console.error(err);
        alert(err.message || 'No se pudo borrar el fondo. Revisa tu conexión y tu API Key.');
    } finally {
        btnEjecutar.disabled = false;
        btnEjecutar.textContent = textoOriginal;
    }
}

async function generarImagenConFondoElegido() {
    if (!window.imagenRecortadaActual) return null;

    if (window.fondoSalidaSeleccionado === 'transparent') {
        return window.imagenRecortadaActual;
    }

    const img = await cargarImagenCanvas(window.imagenRecortadaActual);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');

    if (window.fondoSalidaSeleccionado.includes('gradient')) {
        const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        g.addColorStop(0, '#dcfce7');
        g.addColorStop(1, '#86efac');
        ctx.fillStyle = g;
    } else {
        ctx.fillStyle = window.fondoSalidaSeleccionado;
    }

    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
}

async function aplicarRecorteAlProducto() {
    if (!window.imagenRecortadaActual) {
        alert('Primero presiona "Borrar Fondo con IA" para generar el recorte.');
        return;
    }

    const imagenFinal = await generarImagenConFondoElegido();
    const storyImg = document.getElementById('preview-story-img');
    if (storyImg && imagenFinal) {
        storyImg.src = imagenFinal;
        storyImg.style.display = 'block';
    }

    if (window.productoEstudioActualId && Array.isArray(window.bovedaProductos)) {
        const idx = window.bovedaProductos.findIndex(p => String(p.id) === String(window.productoEstudioActualId));
        if (idx !== -1) {
            if (!Array.isArray(window.bovedaProductos[idx].imagenes)) {
                window.bovedaProductos[idx].imagenes = [];
            }
            window.bovedaProductos[idx].imagenes[window.indiceFotoEstudio || 0] = imagenFinal;
            if (typeof guardarBovedaLocal === 'function') guardarBovedaLocal();
            if (typeof renderizarProductosCreados === 'function') renderizarProductosCreados();
            alert('✅ Foto sin fondo aplicada y guardada en el producto.');
            return;
        }
    }

    alert('Recorte listo en el Estudio IA. Para guardarlo en una ficha, selecciona primero un producto creado con el botón "✨ Estudio IA".');
}

async function descargarRecortePNG() {
    if (!window.imagenRecortadaActual) {
        alert('Primero presiona "Borrar Fondo con IA" para generar el PNG sin fondo.');
        return;
    }

    const imagenFinal = await generarImagenConFondoElegido();
    const title = document.getElementById('preview-title')?.textContent.trim() || 'producto';
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const link = document.createElement('a');
    link.download = `${slug || 'producto'}-sin-fondo.png`;
    link.href = imagenFinal;
    link.click();
}

function blobADataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/* ==========================================================================
   MEJORAS INVENTARIO: EXPORTAR / IMPRIMIR + PLACEHOLDER VECTORIAL LIMPIO
   ========================================================================== */
window.CAT_PLACEHOLDER_PRODUCTO_SVG = CAT_PLACEHOLDER_PRODUCTO_SVG;

function reemplazarImagenesGenericasInventario(raiz = document) {
    if (!raiz || typeof raiz.querySelectorAll !== 'function') return;
    raiz.querySelectorAll('img').forEach(img => {
        const src = (img.getAttribute('src') || '').trim();
        if (!src || src.includes('producto.png')) {
            img.src = CAT_PLACEHOLDER_PRODUCTO_SVG;
            img.style.objectFit = 'contain';
        }
    });
}

// Reemplaza automáticamente cualquier producto.png cada vez que se renderizan tarjetas
if (typeof window.renderizarProductosCreados === 'function' && !window.renderizarProductosCreados._conPlaceholder) {
    const _renderizarProductosBaseInv = window.renderizarProductosCreados;
    window.renderizarProductosCreados = function (...args) {
        const res = _renderizarProductosBaseInv.apply(this, args);
        reemplazarImagenesGenericasInventario();
        return res;
    };
    window.renderizarProductosCreados._conPlaceholder = true;
}

// Interceptor global para Dashboard, POS, Control de Stock y Estudio de Diseño PDF
if (!window._catPlaceholderObserverActivo) {
    const iniciarObservadorPlaceholders = () => {
        reemplazarImagenesGenericasInventario(document);

        const obs = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === 'attributes' && m.target?.tagName === 'IMG') {
                    const src = (m.target.getAttribute('src') || '').trim();
                    if (!src || src.includes('producto.png')) {
                        m.target.src = CAT_PLACEHOLDER_PRODUCTO_SVG;
                    }
                    continue;
                }
                m.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    if (node.tagName === 'IMG') {
                        const src = (node.getAttribute('src') || '').trim();
                        if (!src || src.includes('producto.png')) {
                            node.src = CAT_PLACEHOLDER_PRODUCTO_SVG;
                        }
                    } else if (node.querySelectorAll) {
                        reemplazarImagenesGenericasInventario(node);
                    }
                });
            }
        });

        obs.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src']
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciarObservadorPlaceholders);
    } else {
        iniciarObservadorPlaceholders();
    }

    // Respaldo si alguna imagen externa se rompe al cargar
    document.addEventListener('error', (e) => {
        const el = e.target;
        if (el && el.tagName === 'IMG' && el.src !== CAT_PLACEHOLDER_PRODUCTO_SVG) {
            el.src = CAT_PLACEHOLDER_PRODUCTO_SVG;
        }
    }, true);

    window._catPlaceholderObserverActivo = true;
}

function obtenerProductosParaExportarInv() {
    let lista = [];
    try {
        lista = JSON.parse(localStorage.getItem('cat_alogo_productos_v1') || '[]');
    } catch {
        lista = [];
    }
    const soloVis = !!document.getElementById('inv-exp-solo-visibles')?.checked;
    return soloVis
        ? lista.filter(p => (p.publicarWeb !== undefined ? !!p.publicarWeb : (p.visibleWeb !== undefined ? !!p.visibleWeb : p.visible !== false)))
        : lista;
}

function exportarListaPreciosPdfInv() {
    const jsPDFCtor = window.jspdf?.jsPDF;
    if (!jsPDFCtor) { alert('No se cargó la librería jsPDF.'); return; }

    const lista = obtenerProductosParaExportarInv();
    if (lista.length === 0) { alert('No hay productos para exportar.'); return; }

    let comercio = 'CAT-ALOGO STORE';
    try {
        const cfg = JSON.parse(localStorage.getItem('cat_alogo_pdf_config_v1') || 'null');
        if (cfg?.headerNombre) comercio = cfg.headerNombre.toUpperCase();
    } catch { /* fallback */ }

    const doc = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: 'a4' });
    const fechaTxt = new Date().toLocaleDateString('es-AR');

    const dibujarCabecera = () => {
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, 210, 22, 'F');
        doc.setFillColor(4, 120, 87);
        doc.rect(0, 22, 210, 1.5, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12.5);
        doc.text(`LISTA DE PRECIOS E INVENTARIO — ${comercio.slice(0, 32)}`, 14, 10.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(203, 213, 225);
        doc.text(`Emitido: ${fechaTxt}  •  ${lista.length} artículos`, 14, 17.5);

        doc.setFillColor(241, 245, 249);
        doc.rect(14, 28, 182, 6.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(51, 65, 85);
        doc.text('SKU', 16, 32.3);
        doc.text('PRODUCTO', 44, 32.3);
        doc.text('CATEGORÍA', 124, 32.3);
        doc.text('STOCK', 166, 32.3, { align: 'right' });
        doc.text('PRECIO', 194, 32.3, { align: 'right' });
    };

    dibujarCabecera();
    let y = 39.5;

    lista.forEach((p, idx) => {
        if (y > 280) {
            doc.addPage();
            dibujarCabecera();
            y = 39.5;
        }
        if (idx % 2 === 1) {
            doc.setFillColor(248, 250, 252);
            doc.rect(14, y - 3.8, 182, 6, 'F');
        }
        const precio = (Number(p.precioOferta) > 0 && Number(p.precioOferta) < Number(p.precioNormal))
            ? Number(p.precioOferta)
            : (Number(p.precioNormal) || 0);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.6);
        doc.setTextColor(71, 85, 105);
        doc.text(String(p.sku || '—').slice(0, 14), 16, y);
        doc.setTextColor(15, 23, 42);
        doc.text(String(p.nombre || 'Producto').slice(0, 42), 44, y);
        doc.setTextColor(71, 85, 105);
        doc.text(String(p.categoria || 'General').slice(0, 18), 124, y);
        doc.text(String(Number(p.stock) || 0), 166, y, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(4, 120, 87);
        doc.text(`$${precio.toLocaleString('es-AR')}`, 194, y, { align: 'right' });
        y += 6;
    });

    doc.save(`lista-precios-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function exportarTablaArchivoInv(tipo) {
    const lista = obtenerProductosParaExportarInv();
    if (lista.length === 0) { alert('No hay productos para exportar.'); return; }

    const filas = [
        ['SKU', 'Nombre', 'Categoria', 'Precio Venta', 'Precio Costo', 'Precio Oferta', 'Stock', 'Stock Minimo', 'Unidad', 'Visible']
    ];
    lista.forEach(p => {
        const esVisWeb = p.publicarWeb !== undefined ? !!p.publicarWeb : (p.visibleWeb !== undefined ? !!p.visibleWeb : p.visible !== false);
        filas.push([
            p.sku || '',
            p.nombre || '',
            p.categoria || 'General',
            Number(p.precioNormal) || 0,
            Number(p.precioCosto) || 0,
            Number(p.precioOferta) || 0,
            Number(p.stock) || 0,
            Number(p.stockMinimo) || 5,
            p.unidadMedida || 'Unidad',
            esVisWeb ? 'SI' : 'NO'
        ]);
    });

    const slug = `inventario-cat-alogo-${new Date().toISOString().slice(0, 10)}`;

    if (tipo === 'xlsx' && typeof XLSX !== 'undefined') {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(filas);
        XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
        XLSX.writeFile(wb, `${slug}.xlsx`);
        return;
    }

    const csv = '\uFEFF' + filas.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// ==========================================================================
// APERTURA, CIERRE Y ACCIONES DEL MODAL EXPORTAR / IMPRIMIR (A PRUEBA DE CSS/SPA)
// ==========================================================================
function asegurarModalExportarInv() {
    let modal = document.getElementById('modal-inv-exportar');
    if (modal) return modal;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
        <div class="inv-exp-overlay" id="modal-inv-exportar" aria-hidden="true">
            <div class="inv-exp-box" role="dialog" aria-labelledby="inv-exp-title">
                <header class="inv-exp-head">
                    <div>
                        <h3 id="inv-exp-title">🖨️ Exportar / Imprimir Inventario</h3>
                        <p id="inv-exp-sub">Elige el formato de salida para tu lista de productos y precios.</p>
                    </div>
                    <button type="button" class="inv-exp-close" id="btn-cerrar-modal-inv-exp">✕</button>
                </header>

                <div class="inv-exp-body">
                    <label class="inv-exp-chk">
                        <input type="checkbox" id="inv-exp-solo-visibles">
                        <span>Incluir únicamente productos con <strong>visibilidad activa</strong></span>
                    </label>

                    <div class="inv-exp-grid">
                        <button type="button" class="inv-exp-card exp-pdf" id="btn-inv-exp-pdf">
                            <span class="exp-ico">📄</span>
                            <strong>Lista de Precios PDF (A4)</strong>
                            <small>Tabla lista para imprimir o enviar por WhatsApp (SKU, Stock y Precio)</small>
                        </button>

                        <button type="button" class="inv-exp-card exp-xls" id="btn-inv-exp-xlsx">
                            <span class="exp-ico">📊</span>
                            <strong>Planilla Excel (.xlsx)</strong>
                            <small>Con costos, precios, stock y categorías para editar y re-importar</small>
                        </button>

                        <button type="button" class="inv-exp-card exp-csv" id="btn-inv-exp-csv">
                            <span class="exp-ico">📑</span>
                            <strong>Archivo CSV (.csv)</strong>
                            <small>Formato liviano universal separado por punto y coma</small>
                        </button>

                        <button type="button" class="inv-exp-card exp-cat" id="btn-inv-exp-diseno">
                            <span class="exp-ico">🎨</span>
                            <strong>Catálogo Visual con Fotos</strong>
                            <small>Abrir el Estudio de Diseño PDF para exportar con tu marca</small>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    modal = wrap.firstElementChild;
    document.body.appendChild(modal);
    return modal;
}

function abrirModalExportarInv() {
    const todos = document.querySelectorAll('#modal-inv-exportar');
    if (todos.length > 1) {
        for (let i = 1; i < todos.length; i++) todos[i].remove();
    }

    const modal = asegurarModalExportarInv();

    if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }

    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.zIndex = '9999';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.background = 'rgba(15, 23, 42, 0.55)';
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
}

function cerrarModalExportarInv() {
    const modal = document.getElementById('modal-inv-exportar');
    if (!modal) return;
    modal.classList.remove('active');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
}

if (!window._invExportarDelegado) {
    document.addEventListener('click', (e) => {
        if (e.target.closest('#btn-inv-exportar-imprimir')) {
            e.preventDefault();
            abrirModalExportarInv();
            return;
        }
        if (e.target.closest('#btn-cerrar-modal-inv-exp') || e.target.id === 'modal-inv-exportar') {
            cerrarModalExportarInv();
            return;
        }
        if (e.target.closest('#btn-inv-exp-pdf')) {
            exportarListaPreciosPdfInv();
            cerrarModalExportarInv();
            return;
        }
        if (e.target.closest('#btn-inv-exp-xlsx')) {
            exportarTablaArchivoInv('xlsx');
            cerrarModalExportarInv();
            return;
        }
        if (e.target.closest('#btn-inv-exp-csv')) {
            exportarTablaArchivoInv('csv');
            cerrarModalExportarInv();
            return;
        }
        if (e.target.closest('#btn-inv-exp-diseno')) {
            cerrarModalExportarInv();
            document.querySelector('.nav-link[data-vista="diseno-pdf"]')?.click();
        }
    });
    window._invExportarDelegado = true;
}

/* ==========================================================================
   BOTÓN CABECERA: MOSTRAR / OCULTAR PANEL ESTUDIO MARKETING IA (#btn-toggle-studio)
   ========================================================================== */
function alternarPanelEstudioIA(forzarVisible = null) {
    const split = document.querySelector('.inv-split-layout');
    const studioCol = document.getElementById('ia-studio-panel');
    const btnToggle = document.getElementById('btn-toggle-studio');
    if (!studioCol || !split) return;

    const estaOculto = studioCol.style.display === 'none';
    const mostrar = forzarVisible !== null ? forzarVisible : estaOculto;

    if (mostrar) {
        studioCol.style.display = '';
        split.style.gridTemplateColumns = '';
        if (btnToggle) {
            btnToggle.innerHTML = '✨ Estudio Marketing IA <span class="tag-pro">PRO</span>';
            btnToggle.title = 'Ocultar panel lateral de Estudio IA para ampliar la lista';
        }
    } else {
        studioCol.style.display = 'none';
        split.style.gridTemplateColumns = '1fr';
        if (btnToggle) {
            btnToggle.innerHTML = '✨ Mostrar Estudio IA <span class="tag-pro">PRO</span>';
            btnToggle.title = 'Abrir panel lateral de Estudio Creativo & Marketing IA';
        }
    }
}

if (typeof cargarProductoEnEstudioIA === 'function' && !cargarProductoEnEstudioIA._autoAbrir) {
    const _cargarEstudioBase = cargarProductoEnEstudioIA;
    cargarProductoEnEstudioIA = function (btn) {
        alternarPanelEstudioIA(true);
        return _cargarEstudioBase(btn);
    };
    cargarProductoEnEstudioIA._autoAbrir = true;
}

if (!window._invToggleStudioDelegado) {
    document.addEventListener('click', (e) => {
        if (e.target.closest('#btn-toggle-studio')) {
            e.preventDefault();
            alternarPanelEstudioIA();
        }
    });
    window._invToggleStudioDelegado = true;
}

/* ==========================================================================
   ETAPA 1 INVENTARIO PRO: CATEGORÍAS DUALES + WEB/PDF, SALUD DEL INVENTARIO,
   TABLA RÁPIDA CON EDICIÓN EN LÍNEA, DUPLICAR, PIN 📌 Y ESCÁNER USB
   ========================================================================== */
(function () {
    const KEY_INV_PRO_PREFS = 'cat_alogo_inv_pro_prefs_v1';
    const KEY_INV_PINNED    = 'cat_alogo_inv_pinned_v1';

    function leerJsonInv(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }

    const prefs = leerJsonInv(KEY_INV_PRO_PREFS, {}) || {};
    const pines = leerJsonInv(KEY_INV_PINNED, []);

    window.invProState = {
        catMode: prefs.catMode || 'chips',       // 'dropdown' | 'chips'
        catDropdownSearch: '',
        viewMode: prefs.viewMode || 'cards',     // 'cards' | 'table'
        canalFiltro: '',                         // '' | 'en-web' | 'en-pdf'
        healthFiltro: 'todos',                   // 'todos' | 'anclados' | 'sin-stock' | 'stock-critico' | 'sin-foto' | 'sin-costo' | 'oferta' | 'balanza' | 'ocultos-web'
        pinnedIds: new Set(Array.isArray(pines) ? pines.map(String) : [])
    };

    function guardarPrefsInvPro() {
        localStorage.setItem(KEY_INV_PRO_PREFS, JSON.stringify({
            catMode: window.invProState.catMode,
            viewMode: window.invProState.viewMode
        }));
    }

    function guardarPinesInvPro() {
        localStorage.setItem(KEY_INV_PINNED, JSON.stringify(Array.from(window.invProState.pinnedIds)));
    }

    function escHtmlInv(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizarTextoInv(str) {
        return String(str || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    function textoLimpioChipInv(el) {
        return String(el?.textContent || '')
            .replace(/\s*\(\d+\)\s*$/, '')
            .replace(/^[^\p{L}\p{N}]+/u, '')
            .trim();
    }

    function fmtArsInv(v) {
        const n = Number(v) || 0;
        return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    }

    function obtenerListaProductosInv() {
        if (Array.isArray(window.bovedaProductos)) return window.bovedaProductos;
        return leerJsonInv('cat_alogo_productos_v1', []);
    }

    function estaEnWebInv(p) {
        if (p.publicarWeb !== undefined) return !!p.publicarWeb;
        if (p.visibleWeb !== undefined) return !!p.visibleWeb;
        return p.visible !== false;
    }

    function estaEnPdfInv(p) {
        if (p.incluirPdf !== undefined) return !!p.incluirPdf;
        if (p.visiblePdf !== undefined) return !!p.visiblePdf;
        if (p.enCatalogo !== undefined) return !!p.enCatalogo;
        return true;
    }

    function tieneFotoRealInv(p) {
        const src = (Array.isArray(p.imagenes) && p.imagenes[0]) ? p.imagenes[0] : (p.imagen_url || '');
        const s = String(src || '').trim();
        return s !== '' && !s.includes('producto.png') && !s.startsWith('data:image/svg+xml');
    }

    function esBalanzaInv(p) {
        const fam = String(p.familiaMedicion || '').toLowerCase();
        return fam === 'peso' || fam === 'longitud';
    }

    function precioEfectivoInv(p) {
        const norm = Number(p.precioNormal) || 0;
        const ofe  = Number(p.precioOferta) || 0;
        return (ofe > 0 && ofe < norm) ? ofe : norm;
    }

    function calcularMargenPctInv(p) {
        const costo = Number(p.precioCosto) || 0;
        const venta = precioEfectivoInv(p);
        if (costo <= 0 || venta <= 0) return null;
        return Math.round(((venta - costo) / costo) * 1000) / 10;
    }

    function renderBadgeMargenInv(p) {
        const m = calcularMargenPctInv(p);
        if (m === null) return `<span class="inv-margin-pill none">Sin costo</span>`;
        const cls = m <= 0 ? 'bad' : (m < 20 ? 'warn' : 'ok');
        return `<span class="inv-margin-pill ${cls}">${m > 0 ? '+' : ''}${m}%</span>`;
    }

    function limpiarTodosLosFiltrosInvPro() {
        window.invProState.canalFiltro = '';
        window.invProState.healthFiltro = 'todos';
        const sInp = document.getElementById('inv-search-input');
        if (sInp) sInp.value = '';
        const chipTodos = document.querySelector('#inv-filters .filter-chip[data-filter="todos"]');
        if (chipTodos) {
            document.querySelectorAll('#inv-filters .filter-chip').forEach(c => c.classList.remove('active'));
            chipTodos.classList.add('active');
        }
        aplicarVistaYPaginacionInvPro(true);
    }

    /* --- 1. CONTADORES DE SALUD, WEB Y PDF + SELECTOR DUAL DE CATEGORÍAS --- */
    function actualizarContadoresSaludYCanalesInv() {
        const productos = obtenerListaProductosInv();
        const st = window.invProState;

        const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };

        setTxt('inv-cnt-en-web', productos.filter(estaEnWebInv).length);
        setTxt('inv-cnt-en-pdf', productos.filter(estaEnPdfInv).length);
        setTxt('inv-hcnt-anclados', productos.filter(p => st.pinnedIds.has(String(p.id))).length);
        setTxt('inv-hcnt-sinstock', productos.filter(p => (Number(p.stock) || 0) <= 0).length);
        setTxt('inv-hcnt-critico', productos.filter(p => {
            const s = Number(p.stock) || 0;
            const min = Number(p.stockMinimo) || 5;
            return s > 0 && s <= min;
        }).length);
        setTxt('inv-hcnt-sinfoto', productos.filter(p => !tieneFotoRealInv(p)).length);
        setTxt('inv-hcnt-sincosto', productos.filter(p => (Number(p.precioCosto) || 0) <= 0).length);
        setTxt('inv-hcnt-oferta', productos.filter(p => Number(p.precioOferta) > 0 && Number(p.precioOferta) < Number(p.precioNormal)).length);
        setTxt('inv-hcnt-balanza', productos.filter(esBalanzaInv).length);
        setTxt('inv-hcnt-ocultosweb', productos.filter(p => !estaEnWebInv(p)).length);

        document.querySelectorAll('#inv-channel-quick-pills .inv-ch-pill').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-inv-ch') === st.canalFiltro);
        });
        document.querySelectorAll('#inv-health-filters .inv-health-chip').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-health') === st.healthFiltro);
        });
    }

    function obtenerFiltroChipActivoInv() {
        const active = document.querySelector('#inv-filters .filter-chip.active');
        if (!active) return { tipo: 'todos', valor: 'todos', labelNorm: 'todos', label: 'Todos' };

        const raw = String(active.getAttribute('data-filter') || 'todos').trim();
        const rawNorm = normalizarTextoInv(raw);
        const label = textoLimpioChipInv(active);
        const labelNorm = normalizarTextoInv(label);

        if (rawNorm === 'todos' || labelNorm === 'todos') {
            return { tipo: 'todos', valor: 'todos', labelNorm: 'todos', label: 'Todos' };
        }
        if (rawNorm === 'sin-stock' || rawNorm === 'sinstock' || labelNorm === 'sin stock') {
            return { tipo: 'sin-stock', valor: 'sin-stock', labelNorm, label };
        }
        if (rawNorm === 'oferta' || rawNorm === 'ofertas' || labelNorm === 'en oferta') {
            return { tipo: 'oferta', valor: 'oferta', labelNorm, label };
        }
        if (rawNorm === 'ocultos' || rawNorm === 'oculto' || labelNorm === 'ocultos') {
            return { tipo: 'ocultos', valor: 'ocultos', labelNorm, label };
        }

        const sinPrefijo = rawNorm.replace(/^(cat:|cat-|categoria:|categoria-)/, '');
        return { tipo: 'categoria', valor: sinPrefijo, labelNorm, label };
    }

    function renderizarDesplegableCategoriasInv() {
        const listEl = document.getElementById('inv-cat-dropdown-list');
        const lblBtn = document.getElementById('inv-cat-dropdown-label');
        if (!listEl) return;

        const productos = obtenerListaProductosInv();
        const mapa = {};
        productos.forEach(p => {
            const c = (p.categoria || 'General').trim() || 'General';
            mapa[c] = (mapa[c] || 0) + 1;
        });
        const cats = Object.keys(mapa).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

        const filtro = obtenerFiltroChipActivoInv();
        const q = normalizarTextoInv(window.invProState.catDropdownSearch || '');

        if (lblBtn) {
            if (filtro.tipo === 'todos') {
                lblBtn.textContent = `📂 Todas las categorías (${productos.length})`;
            } else if (filtro.tipo === 'categoria') {
                const match = cats.find(c => normalizarTextoInv(c) === filtro.labelNorm || normalizarTextoInv(c) === filtro.valor);
                lblBtn.textContent = match ? `📂 ${match} (${mapa[match]})` : `📂 ${filtro.label}`;
            } else {
                lblBtn.textContent = `📂 ${filtro.label}`;
            }
        }

        let html = '';
        if (!q || 'todos'.includes(q) || 'todas'.includes(q)) {
            html += `<button type="button" class="inv-cat-dropdown-item ${filtro.tipo === 'todos' ? 'active' : ''}" data-invcat="todos"><span>Todas las categorías</span><span>${productos.length}</span></button>`;
        }
        cats.filter(c => !q || normalizarTextoInv(c).includes(q)).forEach(c => {
            const cNorm = normalizarTextoInv(c);
            const isAct = filtro.tipo === 'categoria' && (cNorm === filtro.labelNorm || cNorm === filtro.valor);
            html += `<button type="button" class="inv-cat-dropdown-item ${isAct ? 'active' : ''}" data-invcat="${escHtmlInv(c)}"><span>${escHtmlInv(c)}</span><span>${mapa[c]}</span></button>`;
        });

        listEl.innerHTML = html || `<div style="padding:0.7rem; text-align:center; font-size:0.75rem; color:#64748b;">Sin categorías</div>`;
    }

    function aplicarModoCategoriasInv() {
        const esDrop = window.invProState.catMode === 'dropdown';
        const dropWrap = document.getElementById('inv-cats-dropdown-wrap');
        const chipsRow = document.getElementById('inv-filters');
        if (dropWrap) dropWrap.style.display = esDrop ? 'block' : 'none';
        if (chipsRow) chipsRow.style.display = esDrop ? 'none' : 'flex';
        document.getElementById('btn-inv-cat-mode-dropdown')?.classList.toggle('active', esDrop);
        document.getElementById('btn-inv-cat-mode-chips')?.classList.toggle('active', !esDrop);
    }

    /* --- 2. FILTRADO Y ORDENAMIENTO UNIFICADO (TARJETAS Y TABLA RÁPIDA) --- */
    function obtenerProductosFiltradosYOrdenadosInv() {
        const st = window.invProState;
        const productos = obtenerListaProductosInv();
        const filtroChip = obtenerFiltroChipActivoInv();
        const q = normalizarTextoInv(document.getElementById('inv-search-input')?.value || '');
        const orden = window.ordenInventarioActual || document.getElementById('inv-sort-select')?.value || 'recientes';

        let lista = productos.filter(p => {
            if (filtroChip.tipo === 'sin-stock') {
                if ((Number(p.stock) || 0) > 0) return false;
            } else if (filtroChip.tipo === 'oferta') {
                if (!(Number(p.precioOferta) > 0 && Number(p.precioOferta) < Number(p.precioNormal))) return false;
            } else if (filtroChip.tipo === 'ocultos') {
                if (estaEnWebInv(p)) return false;
            } else if (filtroChip.tipo === 'categoria') {
                const catP = normalizarTextoInv((p.categoria || 'General').trim() || 'General');
                if (catP !== filtroChip.labelNorm && catP !== filtroChip.valor) return false;
            }

            if (st.canalFiltro === 'en-web' && !estaEnWebInv(p)) return false;
            if (st.canalFiltro === 'en-pdf' && !estaEnPdfInv(p)) return false;

            if (st.healthFiltro === 'anclados' && !st.pinnedIds.has(String(p.id))) return false;
            if (st.healthFiltro === 'sin-stock' && (Number(p.stock) || 0) > 0) return false;
            if (st.healthFiltro === 'stock-critico') {
                const s = Number(p.stock) || 0;
                const min = Number(p.stockMinimo) || 5;
                if (!(s > 0 && s <= min)) return false;
            }
            if (st.healthFiltro === 'sin-foto' && tieneFotoRealInv(p)) return false;
            if (st.healthFiltro === 'sin-costo' && (Number(p.precioCosto) || 0) > 0) return false;
            if (st.healthFiltro === 'oferta' && !(Number(p.precioOferta) > 0 && Number(p.precioOferta) < Number(p.precioNormal))) return false;
            if (st.healthFiltro === 'balanza' && !esBalanzaInv(p)) return false;
            if (st.healthFiltro === 'ocultos-web' && estaEnWebInv(p)) return false;

            if (q) {
                const varTxt = Array.isArray(p.variantesDetalle)
                    ? p.variantesDetalle.map(v => `${v.nombre || ''} ${v.sku || ''}`).join(' ')
                    : '';
                const corpus = normalizarTextoInv(`${p.nombre || ''} ${p.sku || ''} ${p.codigoBarras || ''} ${p.categoria || ''} ${p.descripcion || ''} ${varTxt}`);
                if (!corpus.includes(q)) return false;
            }
            return true;
        });

        lista.sort((a, b) => {
            const pinA = st.pinnedIds.has(String(a.id)) ? 1 : 0;
            const pinB = st.pinnedIds.has(String(b.id)) ? 1 : 0;
            if (pinA !== pinB) return pinB - pinA;

            const esOfe = (x) => (Number(x.precioOferta) > 0 && Number(x.precioOferta) < Number(x.precioNormal)) ? 1 : 0;

            switch (orden) {
                case 'precio-desc':    return precioEfectivoInv(b) - precioEfectivoInv(a);
                case 'precio-asc':     return precioEfectivoInv(a) - precioEfectivoInv(b);
                case 'nombre-asc':     return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
                case 'nombre-desc':    return String(b.nombre || '').localeCompare(String(a.nombre || ''), 'es', { sensitivity: 'base' });
                case 'categoria-asc': {
                    const c = String(a.categoria || 'General').localeCompare(String(b.categoria || 'General'), 'es', { sensitivity: 'base' });
                    return c !== 0 ? c : String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
                }
                case 'categoria-desc': {
                    const c = String(b.categoria || 'General').localeCompare(String(a.categoria || 'General'), 'es', { sensitivity: 'base' });
                    return c !== 0 ? c : String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
                }
                case 'margen-desc':    return (calcularMargenPctInv(b) ?? -9999) - (calcularMargenPctInv(a) ?? -9999);
                case 'margen-asc':     return (calcularMargenPctInv(a) ?? 9999) - (calcularMargenPctInv(b) ?? 9999);
                case 'stock-asc':      return (Number(a.stock) || 0) - (Number(b.stock) || 0);
                case 'stock0-primero': return ((Number(a.stock) || 0) <= 0 ? 0 : 1) - ((Number(b.stock) || 0) <= 0 ? 0 : 1);
                case 'stock0-final':   return ((Number(a.stock) || 0) <= 0 ? 1 : 0) - ((Number(b.stock) || 0) <= 0 ? 1 : 0);
                case 'oferta-primero': return esOfe(b) - esOfe(a);
                case 'oferta-final':   return esOfe(a) - esOfe(b);
                case 'sin-foto':       return (tieneFotoRealInv(a) ? 1 : 0) - (tieneFotoRealInv(b) ? 1 : 0);
                case 'sin-costo':      return ((Number(a.precioCosto) || 0) > 0 ? 1 : 0) - ((Number(b.precioCosto) || 0) > 0 ? 1 : 0);
                case 'balanza':        return (esBalanzaInv(b) ? 1 : 0) - (esBalanzaInv(a) ? 1 : 0);
                case 'recientes':
                default: {
                    const ta = Date.parse(a.actualizadoEn || a.creadoEn || '') || Number(a.id) || 0;
                    const tb = Date.parse(b.actualizadoEn || b.creadoEn || '') || Number(b.id) || 0;
                    return tb - ta;
                }
            }
        });

        return lista;
    }

    /* --- 3. DUPLICAR PRODUCTO EN 1 CLIC --- */
    function duplicarProductoInv(prodId) {
        const lista = obtenerListaProductosInv();
        const orig = lista.find(p => String(p.id) === String(prodId));
        if (!orig) return;

        const copia = JSON.parse(JSON.stringify(orig));
        const nuevoId = String(Date.now());
        copia.id = nuevoId;
        copia.nombre = `${orig.nombre || 'Producto'} (Copia)`;
        copia.sku = orig.sku
            ? `${orig.sku}-C${nuevoId.slice(-3)}`
            : `PRD-${nuevoId.slice(-4)}`;
        copia.creadoEn = new Date().toISOString();
        copia.actualizadoEn = copia.creadoEn;

        if (!Array.isArray(window.bovedaProductos)) window.bovedaProductos = lista;
        window.bovedaProductos.unshift(copia);
        if (typeof guardarBovedaLocal === 'function') guardarBovedaLocal();
        else localStorage.setItem('cat_alogo_productos_v1', JSON.stringify(window.bovedaProductos));

        if (typeof renderizarProductosCreados === 'function') renderizarProductosCreados();
        if (typeof abrirModalEditarProducto === 'function') {
            setTimeout(() => abrirModalEditarProducto(nuevoId), 80);
        }
    }

    function alternarPinProductoInv(prodId) {
        const id = String(prodId || '');
        if (!id) return;
        if (window.invProState.pinnedIds.has(id)) window.invProState.pinnedIds.delete(id);
        else window.invProState.pinnedIds.add(id);
        guardarPinesInvPro();
        aplicarVistaYPaginacionInvPro(false);
    }

    /* --- 4. RENDER VISTA TABLA RÁPIDA (EDICIÓN EN LÍNEA) + MEJORAS EN TARJETAS --- */
    function renderizarControlesPaginacionInvPro(total, porPagina, paginaActual) {
        const infoEl = document.getElementById('inv-page-info');
        const ctrlEl = document.getElementById('inv-page-controls');
        const totalPags = Math.max(1, Math.ceil(total / porPagina));

        if (infoEl) {
            infoEl.innerHTML = `Página <strong>${paginaActual}</strong> de <strong>${totalPags}</strong> • <strong>${total}</strong> producto(s)`;
        }
        if (!ctrlEl) return;

        let html = `<button type="button" class="page-btn" data-inv-page="${paginaActual - 1}" ${paginaActual <= 1 ? 'disabled' : ''}>«</button>`;
        const maxBtns = 5;
        let ini = Math.max(1, paginaActual - 2);
        let fin = Math.min(totalPags, ini + maxBtns - 1);
        if (fin - ini < maxBtns - 1) ini = Math.max(1, fin - maxBtns + 1);

        if (ini > 1) html += `<button type="button" class="page-btn" data-inv-page="1">1</button><span class="page-ellipsis">…</span>`;
        for (let i = ini; i <= fin; i++) {
            html += `<button type="button" class="page-btn ${i === paginaActual ? 'active' : ''}" data-inv-page="${i}">${i}</button>`;
        }
        if (fin < totalPags) html += `<span class="page-ellipsis">…</span><button type="button" class="page-btn" data-inv-page="${totalPags}">${totalPags}</button>`;
        html += `<button type="button" class="page-btn" data-inv-page="${paginaActual + 1}" ${paginaActual >= totalPags ? 'disabled' : ''}>»</button>`;

        ctrlEl.innerHTML = html;
        ctrlEl.querySelectorAll('.page-btn[data-inv-page]').forEach(b => {
            b.addEventListener('click', () => {
                const p = parseInt(b.getAttribute('data-inv-page'), 10);
                if (isNaN(p) || p < 1 || p > totalPags) return;
                window.paginaActualInventario = p;
                aplicarVistaYPaginacionInvPro(false);
                const area = document.getElementById('inv-list-scroll-area');
                if (area) area.scrollTop = 0;
            });
        });
    }

    function inyectarBotonesExtraEnTarjetasInv() {
        const cont = document.getElementById('inv-productos-creados');
        if (!cont) return;

        cont.querySelectorAll('.inv-product-card').forEach(card => {
            const btnEdit = card.querySelector('.btn-editar-prod');
            const pid = card.getAttribute('data-prod-id') || btnEdit?.getAttribute('data-id') || card.getAttribute('data-id');
            if (!pid) return;
            card.dataset.invProdId = pid;

            const isPinned = window.invProState.pinnedIds.has(String(pid));
            card.classList.toggle('is-pinned', isPinned);

            const targetBtns = card.querySelector('.left-btns') || card.querySelector('.compact-actions');
            if (!targetBtns) return;

            let btnPin = card.querySelector('.inv-btn-pin');
            if (!btnPin) {
                btnPin = document.createElement('button');
                btnPin.type = 'button';
                btnPin.className = 'mini-btn inv-btn-pin';
                btnPin.setAttribute('data-pin-id', pid);
                targetBtns.prepend(btnPin);
            }
            btnPin.classList.toggle('is-pinned', isPinned);
            btnPin.textContent = isPinned ? '📌 Fijado' : '📌';
            btnPin.title = isPinned ? 'Quitar de anclados' : 'Anclar arriba en el inventario';

            if (!card.querySelector('.btn-duplicar-prod')) {
                const btnDup = document.createElement('button');
                btnDup.type = 'button';
                btnDup.className = 'mini-btn btn-duplicar-prod';
                btnDup.setAttribute('data-dup-id', pid);
                btnDup.textContent = '📋 Duplicar';
                btnDup.title = 'Clonar este producto para cargar una variante o sabor similar';
                targetBtns.appendChild(btnDup);
            }
        });
    }

    function renderizarTablaRapidaInv(paginaItems) {
        const wrap = document.getElementById('inv-tabla-rapida-wrap');
        if (!wrap) return;

        if (paginaItems.length === 0) {
            wrap.innerHTML = `
                <div style="text-align:center; padding:2.2rem 1rem; color:#64748b; font-size:0.84rem; display:flex; flex-direction:column; align-items:center; gap:0.65rem;">
                    <span>No hay productos que coincidan con los filtros o la búsqueda actual.</span>
                    <button type="button" class="inv-btn inv-btn-light btn-inv-reset-filtros-all">↺ Limpiar todos los filtros</button>
                </div>
            `;
            return;
        }

        const filas = paginaItems.map(p => {
            const pid = String(p.id);
            const isPinned = window.invProState.pinnedIds.has(pid);
            const foto = tieneFotoRealInv(p)
                ? ((Array.isArray(p.imagenes) && p.imagenes[0]) ? p.imagenes[0] : p.imagen_url)
                : CAT_PLACEHOLDER_PRODUCTO_SVG;
            const enWeb = estaEnWebInv(p);
            const enPdf = estaEnPdfInv(p);
            const abrev = typeof window.obtenerAbrevUnidad === 'function' ? window.obtenerAbrevUnidad(p.unidadMedida) : 'u.';
            const stepStock = esBalanzaInv(p) ? '0.001' : '1';
            const tieneOferta = Number(p.precioOferta) > 0 && Number(p.precioOferta) < Number(p.precioNormal);
            const precioStr = fmtArsInv(precioEfectivoInv(p));
            const oldStr = tieneOferta ? fmtArsInv(p.precioNormal) : '';

            return `
                <tr class="${isPinned ? 'is-pinned' : ''}" data-row-id="${escHtmlInv(pid)}">
                    <td>
                        <div class="inv-ft-prod-cell">
                            <button type="button" class="inv-ft-ico-btn inv-btn-pin ${isPinned ? 'is-pinned' : ''}" data-pin-id="${escHtmlInv(pid)}" title="Anclar arriba">📌</button>
                            <img src="${foto}" alt="${escHtmlInv(p.nombre)}" class="inv-ft-thumb" loading="lazy">
                            <div style="min-width:0;">
                                <div class="inv-ft-name">${escHtmlInv(p.nombre)}</div>
                                <div class="inv-ft-sub">
                                    <span>${escHtmlInv(p.sku || 'Sin SKU')}</span>
                                    <span>• ${escHtmlInv(p.categoria || 'General')}</span>
                                    ${esBalanzaInv(p) ? '<span>• ⚖️ Balanza</span>' : ''}
                                    ${tieneOferta ? `<span style="color:#dc2626; font-weight:700;">• Oferta ${fmtArsInv(p.precioOferta)}</span>` : ''}
                                </div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <input type="number" class="inv-inline-inp" data-inline-id="${escHtmlInv(pid)}" data-field="precioCosto" min="0" step="0.01" value="${Number(p.precioCosto) || 0}" title="Editar costo y presionar Enter">
                    </td>
                    <td>
                        <input type="number" class="inv-inline-inp" data-inline-id="${escHtmlInv(pid)}" data-field="precioNormal" min="0" step="0.01" value="${Number(p.precioNormal) || 0}" title="Editar precio de venta y presionar Enter">
                    </td>
                    <td class="inv-ft-margin-cell">${renderBadgeMargenInv(p)}</td>
                    <td>
                        <div class="inv-inline-stock-wrap">
                            <input type="number" class="inv-inline-inp" data-inline-id="${escHtmlInv(pid)}" data-field="stock" min="0" step="${stepStock}" value="${Number(p.stock) || 0}" title="Editar stock y presionar Enter">
                            <span style="font-size:0.7rem; color:#64748b; font-weight:700;">${escHtmlInv(abrev)}</span>
                        </div>
                    </td>
                    <td>
                        <div style="display:flex; gap:0.25rem;">
                            <button type="button" class="inv-ft-ico-btn btn-toggle-visibilidad ${enWeb ? 'is-on-web' : 'is-off'}" data-id="${escHtmlInv(pid)}" title="${enWeb ? 'Visible en Web (clic para ocultar)' : 'Oculto en Web (clic para publicar)'}">🌐</button>
                            <button type="button" class="inv-ft-ico-btn btn-toggle-pdf ${enPdf ? 'is-on-pdf' : 'is-off'}" data-id="${escHtmlInv(pid)}" title="${enPdf ? 'Visible en PDF (clic para ocultar)' : 'Oculto en PDF (clic para mostrar)'}">📄</button>
                        </div>
                    </td>
                    <td>
                        <div class="inv-ft-actions">
                            <button type="button" class="inv-ft-ico-btn btn-duplicar-prod" data-dup-id="${escHtmlInv(pid)}" title="Duplicar producto">📋</button>
                            <button type="button" class="inv-ft-ico-btn btn-story-trigger" data-id="${escHtmlInv(pid)}" data-title="${escHtmlInv(p.nombre)}" data-price="${escHtmlInv(precioStr)}" data-old="${escHtmlInv(oldStr)}" title="Enviar a Estudio IA">✨</button>
                            <button type="button" class="inv-ft-ico-btn btn-editar-prod" data-id="${escHtmlInv(pid)}" title="Editar ficha completa">✏️</button>
                            <button type="button" class="inv-ft-ico-btn is-del btn-eliminar-prod" data-id="${escHtmlInv(pid)}" title="Eliminar producto">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        wrap.innerHTML = `
            <table class="inv-fast-table">
                <thead>
                    <tr>
                        <th>Producto / SKU / Categoría</th>
                        <th>Costo ($)</th>
                        <th>Precio ($)</th>
                        <th>Margen</th>
                        <th>Stock</th>
                        <th>Catálogos</th>
                        <th style="text-align:right;">Acciones</th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
            </table>
        `;
    }

    function aplicarVistaYPaginacionInvPro(resetPage = false) {
        if (!document.getElementById('inv-productos-creados')) return;

        if (resetPage) window.paginaActualInventario = 1;
        const porPagina = Number(window.productosPorPagina) || Number(document.getElementById('inv-per-page-select')?.value) || 30;
        const filtrados = obtenerProductosFiltradosYOrdenadosInv();
        const total = filtrados.length;
        const totalPags = Math.max(1, Math.ceil(total / porPagina));
        let pagActual = Number(window.paginaActualInventario) || 1;
        if (pagActual > totalPags) pagActual = totalPags;
        if (pagActual < 1) pagActual = 1;
        window.paginaActualInventario = pagActual;

        const inicio = (pagActual - 1) * porPagina;
        const paginaItems = filtrados.slice(inicio, inicio + porPagina);

        const cardsWrap = document.getElementById('inv-productos-creados');
        const tableWrap = document.getElementById('inv-tabla-rapida-wrap');
        const esTabla = window.invProState.viewMode === 'table';

        if (esTabla) {
            if (cardsWrap) cardsWrap.style.display = 'none';
            if (tableWrap) tableWrap.style.display = 'block';
            renderizarTablaRapidaInv(paginaItems);
        } else {
            if (tableWrap) tableWrap.style.display = 'none';
            if (cardsWrap) {
                cardsWrap.style.display = '';
                inyectarBotonesExtraEnTarjetasInv();

                const mapaDom = new Map();
                cardsWrap.querySelectorAll('.inv-product-card').forEach(card => {
                    const pid = card.dataset.invProdId;
                    if (pid) mapaDom.set(String(pid), card);
                    card.style.display = 'none';
                });

                const frag = document.createDocumentFragment();
                paginaItems.forEach(p => {
                    const card = mapaDom.get(String(p.id));
                    if (card) {
                        card.style.display = '';
                        frag.appendChild(card);
                    }
                });
                if (frag.childNodes.length > 0) cardsWrap.prepend(frag);

                let emptyBox = document.getElementById('inv-empty-filter-box');
                if (paginaItems.length === 0) {
                    if (!emptyBox) {
                        emptyBox = document.createElement('div');
                        emptyBox.id = 'inv-empty-filter-box';
                        emptyBox.style.cssText = 'text-align:center; padding:2rem 1rem; background:#ffffff; border:1px dashed #cbd5e1; border-radius:12px; color:#64748b; font-size:0.84rem; display:flex; flex-direction:column; align-items:center; gap:0.65rem;';
                        cardsWrap.appendChild(emptyBox);
                    }
                    emptyBox.style.display = 'flex';
                    emptyBox.innerHTML = `
                        <span>No hay productos que coincidan con los filtros o la búsqueda actual.</span>
                        <button type="button" class="inv-btn inv-btn-light btn-inv-reset-filtros-all">↺ Limpiar todos los filtros</button>
                    `;
                } else if (emptyBox) {
                    emptyBox.style.display = 'none';
                }
            }
        }

        const footerStats = document.getElementById('inv-footer-stats');
        if (footerStats) {
            const todosAll = obtenerListaProductosInv();
            footerStats.innerHTML = `
                <span>🌐 N° de productos en catálogo Web: <strong>${todosAll.filter(estaEnWebInv).length}</strong> de <strong>${todosAll.length}</strong> productos</span>
                <span>📄 N° de productos en catálogo PDF: <strong>${todosAll.filter(estaEnPdfInv).length}</strong> de <strong>${todosAll.length}</strong> productos</span>
            `;
        }

        actualizarContadoresSaludYCanalesInv();
        renderizarDesplegableCategoriasInv();
        renderizarControlesPaginacionInvPro(total, porPagina, pagActual);
        reemplazarImagenesGenericasInventario();
    }

    /* --- 5. EDICIÓN RÁPIDA EN LÍNEA (COSTO, PRECIO Y STOCK) --- */
    function guardarEdicionInlineInv(inputEl) {
        const pid = inputEl.getAttribute('data-inline-id');
        const field = inputEl.getAttribute('data-field');
        const val = Math.max(0, parseFloat(inputEl.value) || 0);
        const lista = obtenerListaProductosInv();
        const prod = lista.find(p => String(p.id) === String(pid));
        if (!prod) return;

        const valFinal = field === 'stock'
            ? Math.round(val * 1000) / 1000
            : Math.round(val * 100) / 100;

        if (Number(prod[field]) === valFinal) return;
        prod[field] = valFinal;
        prod.actualizadoEn = new Date().toISOString();

        if (typeof guardarBovedaLocal === 'function') guardarBovedaLocal();
        else localStorage.setItem('cat_alogo_productos_v1', JSON.stringify(lista));

        const row = inputEl.closest('tr');
        const marginCell = row?.querySelector('.inv-ft-margin-cell');
        if (marginCell) marginCell.innerHTML = renderBadgeMargenInv(prod);

        inputEl.classList.add('is-saved');
        setTimeout(() => inputEl.classList.remove('is-saved'), 900);
        actualizarContadoresSaludYCanalesInv();
    }

    /* --- 6. RECEPTOR GLOBAL DE LECTOR DE CÓDIGO DE BARRAS USB EN INVENTARIO --- */
    function flashScannerPillInv(txt, cls = 'is-ok') {
        const pill = document.getElementById('inv-scanner-pill');
        if (!pill) return;
        pill.textContent = txt;
        pill.classList.remove('is-ok', 'is-new');
        pill.classList.add(cls);
        clearTimeout(pill._t);
        pill._t = setTimeout(() => {
            pill.textContent = '🔫 USB';
            pill.classList.remove('is-ok', 'is-new');
        }, 1600);
    }

    function procesarEscaneoUsbInventario(codigoRaw) {
        const code = String(codigoRaw || '').trim();
        if (!code) return;
        const q = code.toLowerCase();

        const lista = obtenerListaProductosInv();
        const match = lista.find(p =>
            String(p.sku || '').trim().toLowerCase() === q ||
            String(p.codigoBarras || '').trim().toLowerCase() === q ||
            (Array.isArray(p.variantesDetalle) && p.variantesDetalle.some(v => String(v.sku || '').trim().toLowerCase() === q))
        );

        window.CatAlogoAjustes?.reproducirBeepScanner?.();

        if (match) {
            flashScannerPillInv('✅ Editando SKU', 'is-ok');
            if (typeof abrirModalEditarProducto === 'function') {
                abrirModalEditarProducto(match.id);
            }
        } else {
            flashScannerPillInv('🆕 Nuevo SKU', 'is-new');
            if (typeof abrirModalNuevoProducto === 'function') {
                abrirModalNuevoProducto();
                setTimeout(() => {
                    const skuInp = document.querySelector('#prod-sku, #input-sku, #modal-prod-sku, input[name="sku"], input[placeholder*="SKU" i]');
                    if (skuInp) {
                        skuInp.value = code;
                        skuInp.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }, 90);
            }
        }
    }

    if (!window._invUsbScannerBound) {
        let scanBuf = '';
        let lastTs = 0;

        document.addEventListener('keydown', (e) => {
            if (!document.getElementById('inv-module-root')) return;

            if (e.key === 'F2') {
                e.preventDefault();
                const inp = document.getElementById('inv-search-input');
                if (inp) { inp.focus(); inp.select(); }
                return;
            }

            if (document.querySelector('.modal-overlay.active, .imp-modal-overlay.active, .inv-exp-overlay.active')) return;

            const tag = (e.target?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

            const now = Date.now();
            if (now - lastTs > 80) scanBuf = '';

            if (e.key === 'Enter') {
                if (scanBuf.length >= 4) {
                    e.preventDefault();
                    const c = scanBuf;
                    scanBuf = '';
                    procesarEscaneoUsbInventario(c);
                } else {
                    scanBuf = '';
                }
                return;
            }

            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                scanBuf += e.key;
                lastTs = now;
            }
        });
        window._invUsbScannerBound = true;
    }

    /* --- 7. ENLAZAR EVENTOS DE INVENTARIO PRO --- */
    function enlazarEventosInventarioPro() {
        const root = document.getElementById('inv-module-root');
        if (!root || root.dataset.invProBound) return;
        root.dataset.invProBound = '1';

        aplicarModoCategoriasInv();

        const viewSwitch = document.getElementById('inv-view-switcher');
        if (viewSwitch) {
            viewSwitch.querySelectorAll('.inv-view-btn').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-inv-view') === window.invProState.viewMode);
            });
            viewSwitch.addEventListener('click', (e) => {
                const btn = e.target.closest('.inv-view-btn');
                if (!btn) return;
                window.invProState.viewMode = btn.getAttribute('data-inv-view') || 'cards';
                viewSwitch.querySelectorAll('.inv-view-btn').forEach(b => b.classList.toggle('active', b === btn));
                guardarPrefsInvPro();
                aplicarVistaYPaginacionInvPro(false);
            });
        }

        const setCatMode = (mode) => {
            window.invProState.catMode = mode;
            guardarPrefsInvPro();
            aplicarModoCategoriasInv();
            renderizarDesplegableCategoriasInv();
        };
        document.getElementById('btn-inv-cat-mode-dropdown')?.addEventListener('click', () => setCatMode('dropdown'));
        document.getElementById('btn-inv-cat-mode-chips')?.addEventListener('click', () => setCatMode('chips'));

        const dropWrap = document.getElementById('inv-cats-dropdown-wrap');
        const dropBtn  = document.getElementById('inv-cat-dropdown-btn');
        const dropSearch = document.getElementById('inv-cat-dropdown-search');
        const dropList = document.getElementById('inv-cat-dropdown-list');

        dropBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = dropWrap.classList.toggle('is-open');
            dropBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (open) {
                window.invProState.catDropdownSearch = '';
                if (dropSearch) { dropSearch.value = ''; dropSearch.focus(); }
                renderizarDesplegableCategoriasInv();
            }
        });

        dropSearch?.addEventListener('input', (e) => {
            window.invProState.catDropdownSearch = e.target.value;
            renderizarDesplegableCategoriasInv();
        });

        dropList?.addEventListener('click', (e) => {
            const item = e.target.closest('.inv-cat-dropdown-item');
            if (!item) return;
            const catNorm = normalizarTextoInv(item.getAttribute('data-invcat'));
            const chips = document.querySelectorAll('#inv-filters .filter-chip');
            chips.forEach(ch => {
                const rawNorm = normalizarTextoInv(ch.getAttribute('data-filter') || '').replace(/^(cat:|cat-|categoria:|categoria-)/, '');
                const lblNorm = normalizarTextoInv(textoLimpioChipInv(ch));
                ch.classList.toggle('active', rawNorm === catNorm || lblNorm === catNorm);
            });
            dropWrap?.classList.remove('is-open');
            dropBtn?.setAttribute('aria-expanded', 'false');
            aplicarVistaYPaginacionInvPro(true);
        });

        document.getElementById('inv-filters')?.addEventListener('click', (e) => {
            if (!e.target.closest('.filter-chip')) return;
            setTimeout(() => aplicarVistaYPaginacionInvPro(true), 20);
        });

        document.getElementById('inv-channel-quick-pills')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.inv-ch-pill');
            if (!btn) return;
            const ch = btn.getAttribute('data-inv-ch');
            window.invProState.canalFiltro = (window.invProState.canalFiltro === ch) ? '' : ch;
            aplicarVistaYPaginacionInvPro(true);
        });

        document.getElementById('inv-health-filters')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.inv-health-chip');
            if (!btn) return;
            window.invProState.healthFiltro = btn.getAttribute('data-health') || 'todos';
            aplicarVistaYPaginacionInvPro(true);
        });

        document.getElementById('inv-search-input')?.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const val = e.target.value.trim();
            if (!val) return;
            const match = obtenerListaProductosInv().find(p =>
                String(p.sku || '').trim().toLowerCase() === val.toLowerCase() ||
                String(p.codigoBarras || '').trim().toLowerCase() === val.toLowerCase()
            );
            if (match) {
                e.preventDefault();
                procesarEscaneoUsbInventario(val);
            }
        });

        const listCol = document.querySelector('.inv-list-column');
        if (listCol) {
            listCol.addEventListener('click', (e) => {
                if (e.target.closest('.btn-inv-reset-filtros-all')) {
                    e.stopPropagation();
                    limpiarTodosLosFiltrosInvPro();
                    return;
                }
                const pinBtn = e.target.closest('.inv-btn-pin');
                if (pinBtn) {
                    e.stopPropagation();
                    alternarPinProductoInv(pinBtn.getAttribute('data-pin-id'));
                    return;
                }
                const dupBtn = e.target.closest('.btn-duplicar-prod');
                if (dupBtn) {
                    e.stopPropagation();
                    duplicarProductoInv(dupBtn.getAttribute('data-dup-id'));
                }
            });

            listCol.addEventListener('change', (e) => {
                if (e.target.classList.contains('inv-inline-inp')) {
                    guardarEdicionInlineInv(e.target);
                }
            });
            listCol.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.target.classList.contains('inv-inline-inp')) {
                    e.preventDefault();
                    guardarEdicionInlineInv(e.target);
                    e.target.blur();
                }
            });
        }

        if (!window._invCatDropOutsideBound) {
            document.addEventListener('click', (e) => {
                const w = document.getElementById('inv-cats-dropdown-wrap');
                if (w && w.classList.contains('is-open') && !w.contains(e.target)) {
                    w.classList.remove('is-open');
                    document.getElementById('inv-cat-dropdown-btn')?.setAttribute('aria-expanded', 'false');
                }
            });
            window._invCatDropOutsideBound = true;
        }
    }

    if (typeof window.aplicarFiltrosYPaginacionInventario === 'function' && !window.aplicarFiltrosYPaginacionInventario._invPro) {
        window.aplicarFiltrosYPaginacionInventario = function (resetPage = false) {
            aplicarVistaYPaginacionInvPro(resetPage);
        };
        window.aplicarFiltrosYPaginacionInventario._invPro = true;
    }

    if (typeof window.renderizarProductosCreados === 'function' && !window.renderizarProductosCreados._invPro) {
        const _renderOrigInv = window.renderizarProductosCreados;
        window.renderizarProductosCreados = function (...args) {
            const res = _renderOrigInv.apply(this, args);
            aplicarVistaYPaginacionInvPro(false);
            return res;
        };
        window.renderizarProductosCreados._invPro = true;
    }

    if (typeof window.sincronizarUIconCategorias === 'function' && !window.sincronizarUIconCategorias._invPro) {
        const _syncCatOrig = window.sincronizarUIconCategorias;
        window.sincronizarUIconCategorias = function (...args) {
            const res = _syncCatOrig.apply(this, args);
            renderizarDesplegableCategoriasInv();
            return res;
        };
        window.sincronizarUIconCategorias._invPro = true;
    }

    if (typeof window.inicializarInventario === 'function' && !window.inicializarInventario._invPro) {
        const _initInvOrig = window.inicializarInventario;
        window.inicializarInventario = function (...args) {
            window.invProState.canalFiltro = '';
            window.invProState.healthFiltro = 'todos';
            const res = _initInvOrig.apply(this, args);
            enlazarEventosInventarioPro();
            aplicarVistaYPaginacionInvPro(false);
            return res;
        };
        window.inicializarInventario._invPro = true;
    }
})();

/* ==========================================================================
   MODAL PRO: CALCULADORA DE MARGEN & COSTOS EN INVENTARIO
   ========================================================================== */
(function () {
    const calcState = {
        modoCalculo: 'markup', // 'markup' (sobre costo) | 'margen' (sobre venta)
        redondeo: 'none',      // 'none' | '10' | '50' | '100' | '99'
        precioFinalCalc: 0,
        costoTotalCalc: 0,
        costoDirectoCalc: 0
    };

    function fmtArsCalc(val) {
        const n = Number(val) || 0;
        return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    }

    function redondearComercialCalc(val, modo) {
        const n = Math.max(0, Number(val) || 0);
        if (n <= 0) return 0;
        if (modo === '10') return Math.round(n / 10) * 10;
        if (modo === '50') return Math.round(n / 50) * 50;
        if (modo === '100') return Math.round(n / 100) * 100;
        if (modo === '99') {
            return n >= 100
                ? Math.max(99, Math.round(n / 100) * 100 - 1)
                : Math.floor(n) + 0.99;
        }
        return Math.round(n * 100) / 100;
    }

    function obtenerProductosCalc() {
        if (Array.isArray(window.bovedaProductos) && window.bovedaProductos.length > 0) {
            return window.bovedaProductos;
        }
        try {
            const arr = JSON.parse(localStorage.getItem('cat_alogo_productos_v1') || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch {
            return [];
        }
    }

    function inyectarBotonCalculadoraInventario() {
        const actions = document.querySelector('#inv-module-root .inv-header-actions');
        if (!actions || document.getElementById('btn-abrir-calc-costos')) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'btn-abrir-calc-costos';
        btn.className = 'inv-btn inv-btn-light';
        btn.title = 'Calcular precio de venta según costo, gastos fijos, margen e IVA';
        btn.innerHTML = '🧮 Calc. Costos';

        const btnExport = document.getElementById('btn-inv-exportar-imprimir');
        if (btnExport) actions.insertBefore(btn, btnExport);
        else actions.prepend(btn);
    }

    function asegurarModalCalculadoraCostos() {
        let modal = document.getElementById('modal-inv-calc-costos');
        if (modal) return modal;

        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <div class="inv-calc-overlay" id="modal-inv-calc-costos" aria-hidden="true">
                <div class="inv-calc-box" role="dialog" aria-labelledby="inv-calc-title">
                    <header class="inv-calc-head">
                        <div>
                            <h3 id="inv-calc-title">🧮 Calculadora de Margen &amp; Costos</h3>
                            <p>Calcula el precio final cubriendo costo directo, gastos fijos, ganancia e IVA y aplícalo a tu inventario.</p>
                        </div>
                        <button type="button" class="inv-exp-close" id="btn-cerrar-modal-calc">✕</button>
                    </header>

                    <div class="inv-calc-body">
                        <div class="inv-calc-mode-bar" id="inv-calc-mode-bar">
                            <button type="button" class="inv-calc-mode-btn active" data-cmode="markup" title="Precio = Costo × (1 + Margen%)">
                                📈 Sobre Costo (Markup)
                            </button>
                            <button type="button" class="inv-calc-mode-btn" data-cmode="margen" title="Margen real sobre precio de venta: Costo ÷ (1 - Margen%)">
                                🎯 Margen Bruto Real
                            </button>
                        </div>

                        <div class="inv-calc-field">
                            <label for="calc-costo-directo">Precio de Compra (Costo Directo)</label>
                            <div class="inv-calc-inp-wrap">
                                <span>$</span>
                                <input type="number" id="calc-costo-directo" min="0" step="0.01" placeholder="Ej: 1000">
                            </div>
                        </div>

                        <div class="inv-calc-grid-2">
                            <div class="inv-calc-field">
                                <div class="inv-calc-field-head">
                                    <label for="calc-gastos-fijos">Gastos Fijos Mensuales</label>
                                    <button type="button" class="inv-calc-mini-link" id="btn-calc-traer-opex" title="Sumar gastos del mes actual cargados en Finanzas">⚡ Traer de Finanzas</button>
                                </div>
                                <div class="inv-calc-inp-wrap">
                                    <span>$</span>
                                    <input type="number" id="calc-gastos-fijos" min="0" step="1" placeholder="Ej: 20000">
                                </div>
                            </div>

                            <div class="inv-calc-field">
                                <label for="calc-volumen-mensual">Volumen Mensual (Unidades)</label>
                                <div class="inv-calc-inp-wrap">
                                    <input type="number" id="calc-volumen-mensual" min="1" step="1" placeholder="Ej: 100">
                                    <span>u.</span>
                                </div>
                            </div>
                        </div>

                        <div class="inv-calc-grid-2">
                            <div class="inv-calc-field">
                                <label for="calc-margen-pct">Margen de Ganancia Deseado</label>
                                <div class="inv-calc-inp-wrap">
                                    <input type="number" id="calc-margen-pct" min="0" max="1000" step="0.5" value="30">
                                    <span>%</span>
                                </div>
                                <div class="inv-calc-pills-row" id="calc-margen-presets">
                                    <button type="button" class="inv-calc-pill" data-mval="25">25%</button>
                                    <button type="button" class="inv-calc-pill active" data-mval="30">30%</button>
                                    <button type="button" class="inv-calc-pill" data-mval="45">45%</button>
                                    <button type="button" class="inv-calc-pill" data-mval="60">60%</button>
                                    <button type="button" class="inv-calc-pill" data-mval="100">100%</button>
                                </div>
                            </div>

                            <div class="inv-calc-field">
                                <label for="calc-iva-pct">Tasa de IVA</label>
                                <div class="inv-calc-inp-wrap">
                                    <input type="number" id="calc-iva-pct" min="0" max="100" step="0.5" value="21">
                                    <span>%</span>
                                </div>
                                <div class="inv-calc-pills-row" id="calc-iva-presets">
                                    <button type="button" class="inv-calc-pill" data-ival="0">0% (Exento/Mono)</button>
                                    <button type="button" class="inv-calc-pill" data-ival="10.5">10.5%</button>
                                    <button type="button" class="inv-calc-pill active" data-ival="21">21%</button>
                                </div>
                            </div>
                        </div>

                        <div class="inv-calc-results">
                            <div class="inv-calc-res-row">
                                <span>Costo Fijo prorrateado por unidad:</span>
                                <strong id="calc-res-fijo-unit">$0</strong>
                            </div>
                            <div class="inv-calc-res-row">
                                <span>Costo Total Unitario (Compra + Fijo):</span>
                                <strong id="calc-res-costo-total">$0</strong>
                            </div>
                            <div class="inv-calc-res-row is-profit">
                                <span>Ganancia Neta estimada por unidad:</span>
                                <strong id="calc-res-ganancia">+$0</strong>
                            </div>
                            <div class="inv-calc-res-row">
                                <span>Precio de Venta (sin IVA):</span>
                                <strong id="calc-res-sin-iva">$0</strong>
                            </div>
                            <div class="inv-calc-res-final">
                                <span>Precio Final (con IVA):</span>
                                <strong id="calc-res-final">$0</strong>
                            </div>
                        </div>

                        <div class="inv-calc-quick-box">
                            <div class="inv-calc-field">
                                <label for="calc-ajuste-paso">Ajuste Rápido de Margen (%)</label>
                                <div class="inv-calc-adj-ctrl">
                                    <button type="button" class="inv-calc-adj-btn is-minus" id="btn-calc-adj-minus" title="Restar al margen">−</button>
                                    <input type="number" id="calc-ajuste-paso" min="1" max="100" step="1" value="10">
                                    <button type="button" class="inv-calc-adj-btn is-plus" id="btn-calc-adj-plus" title="Sumar al margen">+</button>
                                </div>
                            </div>

                            <div class="inv-calc-field">
                                <label>Redondeo Comercial del Precio Final</label>
                                <div class="inv-calc-pills-row" id="calc-round-pills">
                                    <button type="button" class="inv-calc-pill active" data-round="none">Exacto</button>
                                    <button type="button" class="inv-calc-pill" data-round="10">$10</button>
                                    <button type="button" class="inv-calc-pill" data-round="50">$50</button>
                                    <button type="button" class="inv-calc-pill" data-round="100">$100</button>
                                    <button type="button" class="inv-calc-pill" data-round="99">...99</button>
                                </div>
                            </div>
                        </div>

                        <div class="inv-calc-apply-box">
                            <div class="inv-calc-field">
                                <label for="calc-buscar-prod">Aplicar a Producto del Inventario</label>
                                <input type="text" id="calc-buscar-prod" class="inv-sort-select" style="width:100%; margin-bottom:0.3rem;" placeholder="🔍 Filtrar producto por nombre o SKU...">
                                <select id="calc-select-prod" class="inv-sort-select" style="width:100%; padding:0.5rem 0.65rem;">
                                    <option value="">-- Selecciona un producto... --</option>
                                </select>
                            </div>

                            <div class="inv-calc-prod-compare" id="calc-prod-compare" style="display:none;">
                                <span id="calc-cmp-actual">Actual: $0</span>
                                <strong id="calc-cmp-diff" style="color:#0f766e;">Nuevo: $0</strong>
                            </div>

                            <label class="inv-calc-chk">
                                <input type="checkbox" id="calc-chk-guardar-costo" checked>
                                <span>Guardar también el <strong>Costo Directo</strong> en el producto (para reportes de Finanzas)</span>
                            </label>
                        </div>
                    </div>

                    <footer class="inv-calc-footer">
                        <button type="button" class="inv-btn inv-btn-light" id="btn-calc-limpiar">↺ Limpiar</button>
                        <div style="display:flex; gap:0.5rem;">
                            <button type="button" class="inv-btn inv-btn-light" id="btn-calc-cancelar">Cerrar</button>
                            <button type="button" class="inv-btn inv-btn-primary" id="btn-calc-aplicar">✅ Aplicar al Producto</button>
                        </div>
                    </footer>
                </div>
            </div>
        `;

        modal = wrap.firstElementChild;
        document.body.appendChild(modal);
        enlazarEventosModalCalculadora(modal);
        return modal;
    }

    function poblarSelectorProductosCalc(filtro = '') {
        const sel = document.getElementById('calc-select-prod');
        if (!sel) return;

        const prev = sel.value;
        const q = String(filtro || '').trim().toLowerCase();
        const productos = [...obtenerProductosCalc()].sort((a, b) =>
            String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' })
        );

        const filtrados = productos.filter(p => {
            if (!q) return true;
            return `${p.nombre || ''} ${p.sku || ''} ${p.categoria || ''}`.toLowerCase().includes(q);
        });

        let html = `<option value="">-- Selecciona un producto (${filtrados.length}) --</option>`;
        filtrados.forEach(p => {
            const precio = Number(p.precioNormal) || 0;
            const skuTxt = p.sku ? ` [${p.sku}]` : '';
            html += `<option value="${String(p.id)}">${String(p.nombre || 'Producto').replace(/</g, '&lt;')}${skuTxt} (${fmtArsCalc(precio)})</option>`;
        });

        sel.innerHTML = html;
        if (prev && Array.from(sel.options).some(o => o.value === prev)) {
            sel.value = prev;
        }
    }

    function recalcularMargenYCostos() {
        const costoDirecto = Math.max(0, parseFloat(document.getElementById('calc-costo-directo')?.value) || 0);
        const gastosFijos = Math.max(0, parseFloat(document.getElementById('calc-gastos-fijos')?.value) || 0);
        const volumen = Math.max(0, parseFloat(document.getElementById('calc-volumen-mensual')?.value) || 0);
        let margenPct = Math.max(0, parseFloat(document.getElementById('calc-margen-pct')?.value) || 0);
        const ivaPct = Math.max(0, parseFloat(document.getElementById('calc-iva-pct')?.value) || 0);

        const fijoUnit = (gastosFijos > 0 && volumen > 0) ? (gastosFijos / volumen) : 0;
        const costoTotal = costoDirecto + fijoUnit;

        let precioSinIva = 0;
        if (costoTotal > 0) {
            if (calcState.modoCalculo === 'margen') {
                const mSeg = Math.min(99, margenPct);
                precioSinIva = costoTotal / (1 - (mSeg / 100));
            } else {
                precioSinIva = costoTotal * (1 + (margenPct / 100));
            }
        }

        const precioConIvaBruto = precioSinIva * (1 + (ivaPct / 100));
        const precioFinal = redondearComercialCalc(precioConIvaBruto, calcState.redondeo);
        const precioSinIvaFinal = ivaPct > 0 ? (precioFinal / (1 + (ivaPct / 100))) : precioFinal;
        const gananciaNeta = Math.max(0, precioSinIvaFinal - costoTotal);

        calcState.costoDirectoCalc = Math.round(costoDirecto * 100) / 100;
        calcState.costoTotalCalc = Math.round(costoTotal * 100) / 100;
        calcState.precioFinalCalc = precioFinal;

        const setTxt = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
        setTxt('calc-res-fijo-unit', fmtArsCalc(Math.round(fijoUnit * 100) / 100));
        setTxt('calc-res-costo-total', fmtArsCalc(Math.round(costoTotal * 100) / 100));
        setTxt('calc-res-ganancia', `+${fmtArsCalc(Math.round(gananciaNeta * 100) / 100)}`);
        setTxt('calc-res-sin-iva', fmtArsCalc(Math.round(precioSinIva * 100) / 100));
        setTxt('calc-res-final', fmtArsCalc(precioFinal));

        actualizarComparativaProductoCalc();
    }

    function actualizarComparativaProductoCalc() {
        const box = document.getElementById('calc-prod-compare');
        const sel = document.getElementById('calc-select-prod');
        if (!box || !sel) return;

        const prod = obtenerProductosCalc().find(p => String(p.id) === String(sel.value));
        if (!prod) {
            box.style.display = 'none';
            return;
        }

        const actual = Number(prod.precioNormal) || 0;
        const nuevo = calcState.precioFinalCalc;
        const diff = Math.round((nuevo - actual) * 100) / 100;
        const pct = actual > 0 ? Math.round((diff / actual) * 1000) / 10 : 0;
        const signo = diff >= 0 ? '+' : '';

        box.style.display = 'flex';
        document.getElementById('calc-cmp-actual').textContent = `Precio actual: ${fmtArsCalc(actual)} (Costo: ${fmtArsCalc(prod.precioCosto || 0)})`;
        const elDiff = document.getElementById('calc-cmp-diff');
        elDiff.textContent = `Nuevo: ${fmtArsCalc(nuevo)} (${signo}${fmtArsCalc(diff)}${actual > 0 ? ` / ${signo}${pct}%` : ''})`;
        elDiff.style.color = diff >= 0 ? '#0f766e' : '#dc2626';
    }

    function abrirModalCalculadoraCostos() {
        const modal = asegurarModalCalculadoraCostos();
        poblarSelectorProductosCalc(document.getElementById('calc-buscar-prod')?.value || '');
        recalcularMargenYCostos();
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.getElementById('calc-costo-directo')?.focus();
    }

    function cerrarModalCalculadoraCostos() {
        const modal = document.getElementById('modal-inv-calc-costos');
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }

    function enlazarEventosModalCalculadora(modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.closest('#btn-cerrar-modal-calc') || e.target.closest('#btn-calc-cancelar')) {
                cerrarModalCalculadoraCostos();
                return;
            }

            const modeBtn = e.target.closest('.inv-calc-mode-btn');
            if (modeBtn) {
                calcState.modoCalculo = modeBtn.getAttribute('data-cmode') || 'markup';
                modal.querySelectorAll('.inv-calc-mode-btn').forEach(b => b.classList.toggle('active', b === modeBtn));
                recalcularMargenYCostos();
                return;
            }

            const mPill = e.target.closest('#calc-margen-presets .inv-calc-pill');
            if (mPill) {
                document.getElementById('calc-margen-pct').value = mPill.getAttribute('data-mval');
                modal.querySelectorAll('#calc-margen-presets .inv-calc-pill').forEach(b => b.classList.toggle('active', b === mPill));
                recalcularMargenYCostos();
                return;
            }

            const iPill = e.target.closest('#calc-iva-presets .inv-calc-pill');
            if (iPill) {
                document.getElementById('calc-iva-pct').value = iPill.getAttribute('data-ival');
                modal.querySelectorAll('#calc-iva-presets .inv-calc-pill').forEach(b => b.classList.toggle('active', b === iPill));
                recalcularMargenYCostos();
                return;
            }

            const rPill = e.target.closest('#calc-round-pills .inv-calc-pill');
            if (rPill) {
                calcState.redondeo = rPill.getAttribute('data-round') || 'none';
                modal.querySelectorAll('#calc-round-pills .inv-calc-pill').forEach(b => b.classList.toggle('active', b === rPill));
                recalcularMargenYCostos();
                return;
            }

            if (e.target.closest('#btn-calc-adj-plus') || e.target.closest('#btn-calc-adj-minus')) {
                const paso = Math.max(1, parseFloat(document.getElementById('calc-ajuste-paso')?.value) || 10);
                const inpMargen = document.getElementById('calc-margen-pct');
                const actual = parseFloat(inpMargen.value) || 0;
                const delta = e.target.closest('#btn-calc-adj-plus') ? paso : -paso;
                inpMargen.value = Math.max(0, Math.round((actual + delta) * 10) / 10);
                recalcularMargenYCostos();
                return;
            }

            if (e.target.closest('#btn-calc-traer-opex')) {
                try {
                    const movs = JSON.parse(localStorage.getItem('cat_alogo_fin_movimientos_v1') || '[]');
                    const ahora = new Date();
                    const mes = ahora.getMonth();
                    const anio = ahora.getFullYear();
                    const suma = (Array.isArray(movs) ? movs : [])
                        .filter(m => {
                            const t = String(m.tipo || '').toLowerCase();
                            const esGasto = t === 'egreso' || t === 'gasto' || t === 'gasto_operativo' || t === 'opex';
                            const f = new Date(m.fecha || 0);
                            return esGasto && f.getMonth() === mes && f.getFullYear() === anio;
                        })
                        .reduce((acc, m) => acc + (Number(m.monto) || 0), 0);

                    if (suma <= 0) {
                        alert('No se encontraron gastos registrados en Finanzas para este mes. Puedes ingresar el monto manualmente.');
                    } else {
                        document.getElementById('calc-gastos-fijos').value = Math.round(suma);
                        const vol = document.getElementById('calc-volumen-mensual');
                        if (vol && !vol.value) vol.value = '100';
                        recalcularMargenYCostos();
                    }
                } catch {
                    alert('No se pudieron leer los gastos de Finanzas.');
                }
                return;
            }

            if (e.target.closest('#btn-calc-limpiar')) {
                document.getElementById('calc-costo-directo').value = '';
                document.getElementById('calc-gastos-fijos').value = '';
                document.getElementById('calc-volumen-mensual').value = '';
                document.getElementById('calc-margen-pct').value = '30';
                document.getElementById('calc-iva-pct').value = '21';
                recalcularMargenYCostos();
                return;
            }

            if (e.target.closest('#btn-calc-aplicar')) {
                const prodId = document.getElementById('calc-select-prod')?.value;
                if (!prodId) {
                    alert('Selecciona primero un producto del listado para aplicar el precio.');
                    document.getElementById('calc-select-prod')?.focus();
                    return;
                }
                if (calcState.precioFinalCalc <= 0) {
                    alert('Ingresa un costo de compra para calcular un precio final mayor a $0.');
                    document.getElementById('calc-costo-directo')?.focus();
                    return;
                }

                const lista = obtenerProductosCalc();
                const prod = lista.find(p => String(p.id) === String(prodId));
                if (!prod) return;

                const guardarCosto = !!document.getElementById('calc-chk-guardar-costo')?.checked;
                prod.precioNormal = calcState.precioFinalCalc;
                if (guardarCosto && calcState.costoDirectoCalc > 0) {
                    prod.precioCosto = calcState.costoDirectoCalc;
                }
                prod.actualizadoEn = new Date().toISOString();

                window.bovedaProductos = lista;
                if (typeof guardarBovedaLocal === 'function') guardarBovedaLocal();
                else localStorage.setItem('cat_alogo_productos_v1', JSON.stringify(lista));

                if (typeof renderizarProductosCreados === 'function') renderizarProductosCreados();
                poblarSelectorProductosCalc(document.getElementById('calc-buscar-prod')?.value || '');
                actualizarComparativaProductoCalc();

                alert(
                    `✅ Precio aplicado a "${prod.nombre}":\n` +
                    `• Nuevo Precio de Venta: ${fmtArsCalc(prod.precioNormal)}\n` +
                    (guardarCosto ? `• Costo guardado: ${fmtArsCalc(prod.precioCosto)}` : '')
                );
            }
        });

        modal.addEventListener('input', (e) => {
            if (e.target.id === 'calc-buscar-prod') {
                poblarSelectorProductosCalc(e.target.value);
                return;
            }
            if (['calc-costo-directo', 'calc-gastos-fijos', 'calc-volumen-mensual', 'calc-margen-pct', 'calc-iva-pct'].includes(e.target.id)) {
                recalcularMargenYCostos();
            }
        });

        modal.addEventListener('change', (e) => {
            if (e.target.id === 'calc-select-prod') {
                const prod = obtenerProductosCalc().find(p => String(p.id) === String(e.target.value));
                if (prod && Number(prod.precioCosto) > 0) {
                    document.getElementById('calc-costo-directo').value = Number(prod.precioCosto);
                }
                recalcularMargenYCostos();
            }
        });
    }

    if (!window._invCalcDelegado) {
        document.addEventListener('click', (e) => {
            if (e.target.closest('#btn-abrir-calc-costos')) {
                e.preventDefault();
                abrirModalCalculadoraCostos();
            }
        });
        window._invCalcDelegado = true;
    }

    if (typeof window.inicializarInventario === 'function' && !window.inicializarInventario._conCalcCostos) {
        const _initInvCalcOrig = window.inicializarInventario;
        window.inicializarInventario = function (...args) {
            const res = _initInvCalcOrig.apply(this, args);
            inyectarBotonCalculadoraInventario();
            return res;
        };
        window.inicializarInventario._conCalcCostos = true;
    }

    if (document.getElementById('inv-module-root')) {
        inyectarBotonCalculadoraInventario();
    }
})();

