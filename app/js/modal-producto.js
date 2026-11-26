/* ==========================================================================
   MÓDULO: MODAL DE CREACIÓN, EDICIÓN, VARIANTES Y ELIMINACIÓN DE PRODUCTOS
   (CON PEGADO CTRL+V, DRAG & DROP, COMPRESIÓN, DECIMALES EXACTOS, UNIDADES,
    FOTO Y PRECIO OFERTA OPCIONALES POR VARIANTE)
   ========================================================================== */

const MAX_IMAGENES_WEB = 5;
const STORAGE_KEY_PRODUCTOS = 'cat_alogo_productos_v1';
const COLORES_VARIANTES_DEFAULT = ['#1e3a8a', '#0f766e', '#d97706', '#6366f1', '#be185d', '#4d7c0f'];

let modalProductoCargado = false;
let modalVarianteCargado = false;
let familiaActiva = 'unidad';
let galeriaImagenes = [];
let productoEditandoId = null;
let varianteEditandoRef = { prodId: null, varIdx: null };
let varianteImagenActual = '';
let pasteListenerRegistrado = false;

// Carga inicial desde localStorage (bóveda temporal antes de IndexedDB)
window.bovedaProductos = JSON.parse(localStorage.getItem(STORAGE_KEY_PRODUCTOS) || '[]');

const UNIDADES_POR_FAMILIA = {
    unidad:    { step: '1',     label: 'Stock Inicial (U)',      opciones: ['Unidad', 'Pack', 'Caja / Bulto', 'Docena'] },
    peso:      { step: '0.001', label: 'Stock Inicial (Kg / L)', opciones: ['Kilogramo (Kg)', 'Gramo (g)', 'Litro (L)', 'Mililitro (ml)'] },
    longitud:  { step: '0.001', label: 'Stock Inicial (m / m²)', opciones: ['Metro (m)', 'Centímetro (cm)', 'Metro Cuadrado (m²)'] },
    variantes: { step: '1',     label: 'Stock por Variante (U)', opciones: ['Unidad', 'Par', 'Pack'] }
};

function guardarBovedaLocal() {
    try {
        localStorage.setItem(STORAGE_KEY_PRODUCTOS, JSON.stringify(window.bovedaProductos));
    } catch (err) {
        console.warn('Límite de localStorage alcanzado:', err);
        alert('⚠️ El almacenamiento local temporal está cerca del límite. Reduce la cantidad de fotos por producto mientras migramos las imágenes a IndexedDB.');
    }
}

function escaparHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function obtenerPrecioBaseProducto(prod) {
    const tieneOferta = prod.precioOferta > 0 && prod.precioOferta < prod.precioNormal;
    return tieneOferta ? prod.precioOferta : (Number(prod.precioNormal) || 0);
}

/**
- Traduce la unidad de medida guardada a su abreviatura comercial corta
 */
window.obtenerAbrevUnidad = function(unidadMedida) {
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
};

/**
- Formatea el stock respetando decimales exactos (evita errores flotantes y conserva ceros como 0.150 o 0.875)
 */
window.formatearStockProducto = function(valor, familiaMedicion = 'unidad', unidadMedida = 'Unidad') {
    const num = Math.round((Number(valor) || 0) * 1000) / 1000;
    const abrev = window.obtenerAbrevUnidad(unidadMedida);
    const esFraccionable3Dec = ['kg', 'L', 'm', 'm²'].includes(abrev) || familiaMedicion === 'peso' || familiaMedicion === 'longitud';

    if (num === 0) return '0';

    if (esFraccionable3Dec && !Number.isInteger(num)) {
        return num.toFixed(3);
    }

    if (!Number.isInteger(num)) {
        return String(num);
    }

    return String(num);
};

/**
- Selecciona automáticamente el contenido al hacer clic en el texto de un campo numérico,
- sin interferir con las flechas nativas de subir/bajar (spinbuttons)
 */
(function activarAutoSeleccionCamposNumericos() {
    if (window.__autoSelectNumericReady) return;
    window.__autoSelectNumericReady = true;

    document.addEventListener('mousedown', (e) => {
        const el = e.target;
        if (!el || el.tagName !== 'INPUT' || el.type !== 'number' || el.readOnly || el.disabled) return;

        const rect = el.getBoundingClientRect();
        const clicEnFlechas = (rect.right - e.clientX) <= 26;

        if (clicEnFlechas) {
            el.dataset.skipAutoSelect = '1';
        } else {
            delete el.dataset.skipAutoSelect;
            el.dataset.selectOnMouseUp = '1';
        }
    });

    document.addEventListener('mouseup', (e) => {
        const el = e.target;
        if (!el || el.tagName !== 'INPUT' || el.type !== 'number') return;

        if (el.dataset.selectOnMouseUp === '1') {
            delete el.dataset.selectOnMouseUp;
            requestAnimationFrame(() => {
                if (document.activeElement === el) el.select();
            });
        }
        delete el.dataset.skipAutoSelect;
    });

    document.addEventListener('focusin', (e) => {
        const el = e.target;
        if (!el || el.tagName !== 'INPUT' || el.type !== 'number' || el.readOnly || el.disabled) return;
        if (el.dataset.skipAutoSelect === '1' || el.dataset.selectOnMouseUp === '1') return;

        el.select();
    });
})();


/* ==========================================================================
   MOTOR DE OPTIMIZACIÓN Y AUTO-LOCALIZACIÓN DE IMÁGENES (ETAPA B)
   ========================================================================== */
function mostrarEstadoCargaImagen(tipo, mensaje, targetId = 'img-upload-status') {
    const box = document.getElementById(targetId);
    if (!box) return;

    if (!mensaje) {
        box.style.display = 'none';
        box.textContent = '';
        return;
    }

    const estilos = {
        info:    { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
        success: { bg: '#ecfdf5', border: '#a7f3d0', color: '#047857' },
        warn:    { bg: '#fffbeb', border: '#fde68a', color: '#b45309' },
        error:   { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c' }
    };
    const est = estilos[tipo] || estilos.info;

    box.style.display = 'block';
    box.style.background = est.bg;
    box.style.border = `1px solid ${est.border}`;
    box.style.color = est.color;
    box.innerHTML = mensaje;
}

/**
- Convierte un File o Blob de imagen en DataURL comprimido (máx. 900px, WebP liviano)
- manteniendo proporciones y transparencia, 100% libre de CORS.
 */
function comprimirBlobImagenALocal(blob, maxLado = 900, calidad = 0.84) {
    return new Promise((resolve, reject) => {
        if (!blob) return reject(new Error('Archivo de imagen vacío'));

        const urlObj = URL.createObjectURL(blob);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(urlObj);
            const natW = img.naturalWidth || 1;
            const natH = img.naturalHeight || 1;
            const escala = Math.min(1, maxLado / Math.max(natW, natH));

            const w = Math.max(1, Math.round(natW * escala));
            const h = Math.max(1, Math.round(natH * escala));

            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, w, h);

            let dataUrl = '';
            try {
                dataUrl = canvas.toDataURL('image/webp', calidad);
            } catch (_) {
                dataUrl = '';
            }
            if (!dataUrl || !dataUrl.startsWith('data:image/webp')) {
                dataUrl = canvas.toDataURL('image/jpeg', calidad);
            }
            resolve(dataUrl);
        };

        img.onerror = () => {
            URL.revokeObjectURL(urlObj);
            reject(new Error('No se pudo leer la imagen'));
        };

        img.src = urlObj;
    });
}

async function procesarArchivosImagenParaGaleria(archivos, origenLabel = 'equipo') {
    const lista = Array.from(archivos || []).filter(f => f && (!f.type || f.type.startsWith('image/')));
    if (lista.length === 0) return;

    let agregadas = 0;
    mostrarEstadoCargaImagen('info', '⏳ Optimizando imagen para tu Bóveda Local...');

    for (const file of lista) {
        if (galeriaImagenes.length >= MAX_IMAGENES_WEB) {
            mostrarEstadoCargaImagen('warn', `⚠️ Límite alcanzado: máximo ${MAX_IMAGENES_WEB} fotos por producto.`);
            break;
        }
        try {
            const dataUrlLocal = await comprimirBlobImagenALocal(file);
            galeriaImagenes.push(dataUrlLocal);
            agregadas++;
        } catch (err) {
            console.warn('Error comprimiendo imagen:', err);
        }
    }

    renderizarGaleriaSlots();
    if (agregadas > 0) {
        mostrarEstadoCargaImagen(
            'success',
            `✅ ${agregadas === 1 ? 'Imagen guardada' : `${agregadas} imágenes guardadas`} en Bóveda Local desde ${origenLabel} (100% compatible con PDF y PNG).`
        );
    }
}

async function descargarBlobDesdeUrlConTimeout(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const resp = await fetch(url, { mode: 'cors', signal: controller.signal });
        if (!resp.ok) return null;
        const blob = await resp.blob();
        if (!blob || blob.size === 0) return null;
        if (blob.type && !blob.type.startsWith('image/') && blob.type !== 'application/octet-stream') {
            return null;
        }
        return blob;
    } catch (_) {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

async function intentarLocalizarUrlExterna(url) {
    const candidatos = [
        url,
        `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`,
        `https://corsproxy.io/?${encodeURIComponent(url)}`
    ];

    for (const candidato of candidatos) {
        const blob = await descargarBlobDesdeUrlConTimeout(candidato);
        if (!blob) continue;
        try {
            return await comprimirBlobImagenALocal(blob);
        } catch (_) {
            /* probar siguiente puente */
        }
    }
    return null;
}

function registrarListenerPegadoGlobal() {
    if (pasteListenerRegistrado) return;
    document.addEventListener('paste', async (e) => {
        const modalVarAbierto = document.getElementById('modal-editar-variante')?.classList.contains('active');
        const modalProdAbierto = document.getElementById('modal-nuevo-producto')?.classList.contains('active');
        if (!modalVarAbierto && !modalProdAbierto) return;

        const items = Array.from(e.clipboardData?.items || []);
        const archivosImg = items
            .filter(it => it.type && it.type.startsWith('image/'))
            .map(it => it.getAsFile())
            .filter(Boolean);

        if (archivosImg.length === 0) return;
        e.preventDefault();

        if (modalVarAbierto) {
            mostrarEstadoCargaImagen('info', '⏳ Optimizando foto pegada para esta variante...', 'var-img-status');
            try {
                varianteImagenActual = await comprimirBlobImagenALocal(archivosImg[0]);
                renderizarPreviewFotoVariante();
                mostrarEstadoCargaImagen('success', '✅ Foto de variante pegada desde portapapeles (Ctrl + V).', 'var-img-status');
            } catch (err) {
                console.warn('Error pegando imagen en variante:', err);
                mostrarEstadoCargaImagen('error', '❌ No se pudo procesar la imagen pegada.', 'var-img-status');
            }
            return;
        }

        if (modalProdAbierto) {
            await procesarArchivosImagenParaGaleria(archivosImg, 'portapapeles (Ctrl + V)');
        }
    });
    pasteListenerRegistrado = true;
}

/**
- Asegura que cada variante tenga nombre, sku, stock, precio, oferta, costo, color y foto opcional
 */
function asegurarVariantesDetalle(prod) {
    if (!Array.isArray(prod.variantes) || prod.variantes.length === 0) {
        prod.variantesDetalle = [];
        return;
    }

    const precioBase = obtenerPrecioBaseProducto(prod);
    let huboCambios = false;

    if (!Array.isArray(prod.variantesDetalle) || prod.variantesDetalle.length === 0) {
        const stockBase = Number(prod.stock) || 0;
        prod.variantesDetalle = prod.variantes.map((nombreVar, idx) => ({
            nombre: nombreVar,
            sku: `${prod.sku}-${String(nombreVar).toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
            stock: stockBase,
            precio: precioBase,
            precioOferta: 0,
            precioCosto: Number(prod.precioCosto) > 0 ? Number(prod.precioCosto) : null,
            color: COLORES_VARIANTES_DEFAULT[idx % COLORES_VARIANTES_DEFAULT.length],
            imagen_url: ''
        }));
        prod.stock = prod.variantesDetalle.reduce((acc, v) => acc + (Number(v.stock) || 0), 0);
        huboCambios = true;
    } else {
        prod.variantesDetalle.forEach((v, idx) => {
            if (typeof v.precio !== 'number' || isNaN(v.precio)) {
                v.precio = precioBase;
                huboCambios = true;
            }
            if (v.precioOferta === undefined || v.precioOferta === null || isNaN(Number(v.precioOferta))) {
                v.precioOferta = 0;
                huboCambios = true;
            }
            if (!v.color) {
                v.color = COLORES_VARIANTES_DEFAULT[idx % COLORES_VARIANTES_DEFAULT.length];
                huboCambios = true;
            }
            if (typeof v.imagen_url !== 'string') {
                v.imagen_url = '';
                huboCambios = true;
            }
        });
    }

    if (huboCambios) guardarBovedaLocal();
}

async function asegurarModalCargado() {
    if (modalProductoCargado) return true;
    try {
        const resp = await fetch('modales/modal-producto.html');
        if (!resp.ok) throw new Error('No se encontró app/modales/modal-producto.html');
        const html = await resp.text();

        const container = document.getElementById('modals-container') || document.body;
        container.insertAdjacentHTML('beforeend', html);

        inicializarEventosModalProducto();
        modalProductoCargado = true;
        return true;
    } catch (err) {
        console.error(err);
        alert('Error cargando el modal de producto. Asegúrate de abrir con Live Server.');
        return false;
    }
}

async function asegurarModalVarianteCargado() {
    if (modalVarianteCargado) return true;
    try {
        const resp = await fetch('modales/modal-variante.html');
        if (!resp.ok) throw new Error('No se encontró app/modales/modal-variante.html');
        const html = await resp.text();

        const container = document.getElementById('modals-container') || document.body;
        container.insertAdjacentHTML('beforeend', html);

        inicializarEventosModalVariante();
        modalVarianteCargado = true;
        return true;
    } catch (err) {
        console.error(err);
        alert('Error cargando el modal de variante. Verifica que exista app/modales/modal-variante.html.');
        return false;
    }
}

function renderizarPreviewFotoVariante() {
    const imgEl = document.getElementById('var-img-preview');
    const emptyEl = document.getElementById('var-img-empty');
    const btnQuitar = document.getElementById('btn-var-quitar-img');
    if (!imgEl || !emptyEl || !btnQuitar) return;

    if (varianteImagenActual) {
        imgEl.src = varianteImagenActual;
        imgEl.style.display = 'block';
        emptyEl.style.display = 'none';
        btnQuitar.style.display = 'inline-flex';
    } else {
        imgEl.src = '';
        imgEl.style.display = 'none';
        emptyEl.style.display = 'block';
        btnQuitar.style.display = 'none';
    }
}

/* ==========================================================================
   MODAL DE EDICIÓN DE VARIANTE INDIVIDUAL (PRECIO, OFERTA, COSTO, FOTO, COLOR, SKU Y STOCK)
   ========================================================================== */
async function abrirModalEditarVariante(prodId, varIdx) {
    const prod = window.bovedaProductos.find(p => String(p.id) === String(prodId));
    if (!prod) return;

    asegurarVariantesDetalle(prod);
    const variante = prod.variantesDetalle[varIdx];
    if (!variante) return;

    const listo = await asegurarModalVarianteCargado();
    if (!listo) return;

    varianteEditandoRef = { prodId: prod.id, varIdx };

    document.getElementById('modal-var-title').textContent = `Editar Variante • ${variante.nombre}`;
    document.getElementById('modal-var-parent').textContent = `${prod.nombre} (${prod.sku})`;
    document.getElementById('var-edit-nombre').value = variante.nombre || '';
    document.getElementById('var-edit-sku').value = variante.sku || '';
    document.getElementById('var-edit-precio').value = variante.precio ?? obtenerPrecioBaseProducto(prod);

    const inpOferta = document.getElementById('var-edit-precio-oferta');
    if (inpOferta) {
        inpOferta.value = Number(variante.precioOferta) > 0 ? Number(variante.precioOferta) : '';
    }

    const inpCosto = document.getElementById('var-edit-costo');
    if (inpCosto) {
        inpCosto.value = (variante.precioCosto !== null && variante.precioCosto !== undefined && Number(variante.precioCosto) > 0)
            ? Number(variante.precioCosto)
            : '';
    }

    document.getElementById('var-edit-stock').value = variante.stock ?? 0;

    varianteImagenActual = typeof variante.imagen_url === 'string' ? variante.imagen_url.trim() : '';
    const inpVarUrl = document.getElementById('input-var-img-url');
    if (inpVarUrl) inpVarUrl.value = '';
    mostrarEstadoCargaImagen('', '', 'var-img-status');
    renderizarPreviewFotoVariante();

    const colorActual = (variante.color || '#1e3a8a').toLowerCase();
    document.getElementById('var-edit-color').value = colorActual;
    document.getElementById('var-color-hex').textContent = colorActual.toUpperCase();

    document.querySelectorAll('#var-color-swatches .swatch-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-color').toLowerCase() === colorActual);
    });

    const overlay = document.getElementById('modal-editar-variante');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function cerrarModalEditarVariante() {
    const overlay = document.getElementById('modal-editar-variante');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
    varianteEditandoRef = { prodId: null, varIdx: null };
    varianteImagenActual = '';
}

function inicializarEventosModalVariante() {
    const overlay = document.getElementById('modal-editar-variante');
    const btnCerrar = document.getElementById('btn-cerrar-modal-var');
    const btnCancelar = document.getElementById('btn-cancelar-modal-var');
    const btnEliminar = document.getElementById('btn-eliminar-variante');
    const form = document.getElementById('form-editar-variante');
    const inputColor = document.getElementById('var-edit-color');
    const hexLabel = document.getElementById('var-color-hex');

    registrarListenerPegadoGlobal();

    btnCerrar.addEventListener('click', cerrarModalEditarVariante);
    btnCancelar.addEventListener('click', cerrarModalEditarVariante);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cerrarModalEditarVariante();
    });

    // Subir foto de variante desde equipo
    const inputVarFile = document.getElementById('input-var-img-file');
    if (inputVarFile) {
        inputVarFile.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            inputVarFile.value = '';
            if (!file) return;
            mostrarEstadoCargaImagen('info', '⏳ Optimizando foto de variante...', 'var-img-status');
            try {
                varianteImagenActual = await comprimirBlobImagenALocal(file);
                renderizarPreviewFotoVariante();
                mostrarEstadoCargaImagen('success', '✅ Foto cargada y lista para guardar.', 'var-img-status');
            } catch (err) {
                console.warn('Error cargando foto de variante:', err);
                mostrarEstadoCargaImagen('error', '❌ No se pudo leer la imagen seleccionada.', 'var-img-status');
            }
        });
    }

    // Aplicar URL externa a la variante con auto-localización
    const btnAplicarUrlVar = document.getElementById('btn-var-aplicar-url');
    if (btnAplicarUrlVar) {
        btnAplicarUrlVar.addEventListener('click', async () => {
            const inp = document.getElementById('input-var-img-url');
            const url = (inp?.value || '').trim();
            if (!url) return;

            const txtOrig = btnAplicarUrlVar.textContent;
            btnAplicarUrlVar.disabled = true;
            btnAplicarUrlVar.textContent = '⏳...';
            mostrarEstadoCargaImagen('info', '⏳ Descargando imagen...', 'var-img-status');

            try {
                const dataUrlLocal = await intentarLocalizarUrlExterna(url);
                if (dataUrlLocal) {
                    varianteImagenActual = dataUrlLocal;
                    if (inp) inp.value = '';
                    renderizarPreviewFotoVariante();
                    mostrarEstadoCargaImagen('success', '✅ Foto guardada en tu Bóveda Local.', 'var-img-status');
                } else {
                    mostrarEstadoCargaImagen(
                        'error',
                        '🚫 Esta web bloquea descargas externas. Haz clic derecho → "Copiar imagen" y pégala aquí con <strong>Ctrl + V</strong>.',
                        'var-img-status'
                    );
                }
            } finally {
                btnAplicarUrlVar.disabled = false;
                btnAplicarUrlVar.textContent = txtOrig;
            }
        });
    }

    // Quitar foto propia de variante
    const btnQuitarVarImg = document.getElementById('btn-var-quitar-img');
    if (btnQuitarVarImg) {
        btnQuitarVarImg.addEventListener('click', () => {
            varianteImagenActual = '';
            renderizarPreviewFotoVariante();
            mostrarEstadoCargaImagen('info', 'ℹ️ Se quitará la foto propia (usará la portada del producto).', 'var-img-status');
        });
    }

    inputColor.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        hexLabel.textContent = val.toUpperCase();
        document.querySelectorAll('#var-color-swatches .swatch-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-color').toLowerCase() === val);
        });
    });

    document.querySelectorAll('#var-color-swatches .swatch-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const color = btn.getAttribute('data-color');
            inputColor.value = color;
            hexLabel.textContent = color.toUpperCase();
            document.querySelectorAll('#var-color-swatches .swatch-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const { prodId, varIdx } = varianteEditandoRef;
        const prod = window.bovedaProductos.find(p => String(p.id) === String(prodId));
        if (!prod || !prod.variantesDetalle || !prod.variantesDetalle[varIdx]) return;

        const nombre = document.getElementById('var-edit-nombre').value.trim();
        const sku = document.getElementById('var-edit-sku').value.trim();
        const precio = Math.max(0, parseFloat(document.getElementById('var-edit-precio').value) || 0);
        const ofertaRaw = document.getElementById('var-edit-precio-oferta')?.value;
        const precioOferta = ofertaRaw ? Math.max(0, parseFloat(ofertaRaw) || 0) : 0;
        const costoRaw = document.getElementById('var-edit-costo')?.value;
        const precioCosto = (costoRaw !== undefined && costoRaw !== '' && !isNaN(parseFloat(costoRaw)))
            ? Math.max(0, parseFloat(costoRaw))
            : null;
        const stock = Math.max(0, parseInt(document.getElementById('var-edit-stock').value, 10) || 0);
        const color = document.getElementById('var-edit-color').value || '#1e3a8a';

        prod.variantesDetalle[varIdx] = {
            ...prod.variantesDetalle[varIdx],
            nombre,
            sku,
            precio,
            precioOferta,
            precioCosto,
            stock,
            color,
            imagen_url: varianteImagenActual || ''
        };
        prod.variantes = prod.variantesDetalle.map(v => v.nombre);
        prod.stock = prod.variantesDetalle.reduce((acc, v) => acc + (Number(v.stock) || 0), 0);
        prod.actualizadoEn = new Date().toISOString();

        guardarBovedaLocal();
        renderizarProductosCreados();
        cerrarModalEditarVariante();
    });

    btnEliminar.addEventListener('click', () => {
        const { prodId, varIdx } = varianteEditandoRef;
        const prod = window.bovedaProductos.find(p => String(p.id) === String(prodId));
        if (!prod || !prod.variantesDetalle || !prod.variantesDetalle[varIdx]) return;

        const nombreVar = prod.variantesDetalle[varIdx].nombre;
        if (!confirm(`¿Eliminar la variante "${nombreVar}" de "${prod.nombre}"?`)) return;

        prod.variantesDetalle.splice(varIdx, 1);
        prod.variantes = prod.variantesDetalle.map(v => v.nombre);
        prod.stock = prod.variantesDetalle.reduce((acc, v) => acc + (Number(v.stock) || 0), 0);

        guardarBovedaLocal();
        renderizarProductosCreados();
        cerrarModalEditarVariante();
    });
}

/* ==========================================================================
   MODAL DE CREACIÓN / EDICIÓN DE PRODUCTO PRINCIPAL
   ========================================================================== */
async function abrirModalNuevoProducto() {
    const listo = await asegurarModalCargado();
    if (!listo) return;

    productoEditandoId = null;
    resetearFormularioProducto();

    if (typeof window.sincronizarSelectProveedoresInventario === 'function') {
        window.sincronizarSelectProveedoresInventario();
    }

    document.getElementById('modal-prod-title').textContent = 'Crear Nuevo Producto';
    document.getElementById('btn-guardar-prod').textContent = '💾 Guardar Producto';

    const overlay = document.getElementById('modal-nuevo-producto');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

async function abrirModalEditarProducto(idProducto) {
    const prod = window.bovedaProductos.find(p => String(p.id) === String(idProducto));
    if (!prod) return;

    const listo = await asegurarModalCargado();
    if (!listo) return;

    productoEditandoId = prod.id;
    resetearFormularioProducto();

    document.getElementById('modal-prod-title').textContent = `Editar Producto • ${prod.sku}`;
    document.getElementById('btn-guardar-prod').textContent = '✅ Guardar Cambios';

    familiaActiva = prod.familiaMedicion || (prod.variantes && prod.variantes.length > 0 ? 'variantes' : 'unidad');
    document.querySelectorAll('.family-card').forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-family') === familiaActiva);
    });
    actualizarSegunFamilia(familiaActiva);

    if (prod.variantes && prod.variantes.length > 0) {
        document.getElementById('prod-variantes').value = prod.variantes.join(', ');
        actualizarVistaPreviaVariantes();
    }

    document.getElementById('prod-nombre').value = prod.nombre || '';
    document.getElementById('prod-sku').value = prod.sku || '';

    if (typeof sincronizarUIconCategorias === 'function') {
        sincronizarUIconCategorias(prod.categoria || 'General');
    }
    document.getElementById('prod-categoria').value = prod.categoria || 'General';

    document.getElementById('prod-descripcion').value = prod.descripcion || '';
    document.getElementById('prod-precio-normal').value = prod.precioNormal || '';
    document.getElementById('prod-precio-oferta').value = prod.precioOferta || '';
    document.getElementById('prod-precio-costo').value = prod.precioCosto || '';
    document.getElementById('prod-precio-mayorista').value = prod.precioMayorista || '';
    document.getElementById('prod-unidad').value = prod.unidadMedida || 'Unidad';

    const proveedorActual = prod.proveedor === 'Sin proveedor' ? '' : (prod.proveedor || '');
    if (typeof window.sincronizarSelectProveedoresInventario === 'function') {
        window.sincronizarSelectProveedoresInventario(proveedorActual);
    }
    document.getElementById('prod-proveedor').value = proveedorActual;

    document.getElementById('prod-stock').value = window.formatearStockProducto(prod.stock ?? 0, familiaActiva, prod.unidadMedida);
    document.getElementById('prod-umbral').value = prod.umbralCritico ?? '';
    document.getElementById('prod-publicar-web').checked = !!prod.publicarWeb;
    document.getElementById('prod-incluir-pdf').checked = prod.incluirPdf !== false;

    galeriaImagenes = Array.isArray(prod.imagenes) ? [...prod.imagenes] : [];
    renderizarGaleriaSlots();
    calcularRentabilidadEnVivo();

    const tieneUrlExterna = galeriaImagenes.some(src => /^https?:\/\//i.test(String(src || '')));
    if (tieneUrlExterna) {
        mostrarEstadoCargaImagen(
            'warn',
            '🌐 Este producto tiene una foto cargada por enlace externo. Si falla al exportar PNG/PDF, quítala y pégala aquí con <strong>Ctrl + V</strong> para guardarla en tu Bóveda Local.'
        );
    }

    document.getElementById('modal-save-summary').innerHTML =
        `✏️ Editando ficha <strong>${escaparHtml(prod.sku)}</strong> en la Bóveda Local`;

    const overlay = document.getElementById('modal-nuevo-producto');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function cerrarModalNuevoProducto() {
    const overlay = document.getElementById('modal-nuevo-producto');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
    productoEditandoId = null;
}

function eliminarProductoBoveda(idProducto) {
    const prod = window.bovedaProductos.find(p => String(p.id) === String(idProducto));
    if (!prod) return;

    const confirmado = confirm(`¿Seguro que deseas eliminar "${prod.nombre}" (SKU: ${prod.sku}) de tu inventario? Esta acción no se puede deshacer.`);
    if (!confirmado) return;

    window.bovedaProductos = window.bovedaProductos.filter(p => String(p.id) !== String(idProducto));
    guardarBovedaLocal();
    renderizarProductosCreados();
}

function alternarVisibilidadProducto(idProducto) {
    const prod = window.bovedaProductos.find(p => String(p.id) === String(idProducto));
    if (!prod) return;

    const nuevo = !(prod.publicarWeb !== undefined ? !!prod.publicarWeb : prod.visible !== false);
    prod.publicarWeb = nuevo;
    prod.visible = nuevo;
    prod.visibleWeb = nuevo;
    prod.publicado = nuevo;
    guardarBovedaLocal();
    renderizarProductosCreados();
}

function alternarVisibilidadPdfProducto(idProducto) {
    const prod = window.bovedaProductos.find(p => String(p.id) === String(idProducto));
    if (!prod) return;

    const nuevo = !(prod.incluirPdf !== false);
    prod.incluirPdf = nuevo;
    prod.visiblePdf = nuevo;
    prod.enCatalogo = nuevo;
    guardarBovedaLocal();
    renderizarProductosCreados();
}

function agregarVarianteRapida(idProducto) {
    const prod = window.bovedaProductos.find(p => String(p.id) === String(idProducto));
    if (!prod) return;

    const nombreVar = prompt(`Nueva variante para "${prod.nombre}" (ej: XL, Rojo, 42):`);
    if (!nombreVar || !nombreVar.trim()) return;

    const limpio = nombreVar.trim();
    asegurarVariantesDetalle(prod);

    const stockStr = prompt(`Stock inicial para la variante "${limpio}":`, '10');
    const stockInicial = Math.max(0, parseInt(stockStr, 10) || 0);
    const precioBase = obtenerPrecioBaseProducto(prod);
    const colorDefault = COLORES_VARIANTES_DEFAULT[prod.variantesDetalle.length % COLORES_VARIANTES_DEFAULT.length];

    prod.variantes.push(limpio);
    prod.variantesDetalle.push({
        nombre: limpio,
        sku: `${prod.sku}-${limpio.toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
        stock: stockInicial,
        precio: precioBase,
        precioOferta: 0,
        precioCosto: Number(prod.precioCosto) > 0 ? Number(prod.precioCosto) : null,
        color: colorDefault,
        imagen_url: ''
    });
    prod.stock = prod.variantesDetalle.reduce((acc, v) => acc + (Number(v.stock) || 0), 0);

    guardarBovedaLocal();
    renderizarProductosCreados();
}

function actualizarStockVarianteBoveda(idProducto, varIdx, delta) {
    const prod = window.bovedaProductos.find(p => String(p.id) === String(idProducto));
    if (!prod) return;

    asegurarVariantesDetalle(prod);
    const variante = prod.variantesDetalle[varIdx];
    if (!variante) return;

    const nuevoStock = Math.max(0, (Number(variante.stock) || 0) + delta);
    variante.stock = nuevoStock;
    prod.stock = prod.variantesDetalle.reduce((acc, v) => acc + (Number(v.stock) || 0), 0);

    guardarBovedaLocal();

    const abrev = window.obtenerAbrevUnidad(prod.unidadMedida);
    const stockTxt = window.formatearStockProducto(prod.stock, prod.familiaMedicion, prod.unidadMedida);

    const card = document.querySelector(`.inv-product-card[data-prod-id="${prod.id}"]`);
    if (card) {
        const valSpan = card.querySelector(`.step-val[data-var-idx="${varIdx}"]`);
        if (valSpan) valSpan.textContent = nuevoStock;

        const totalEl = card.querySelector('.prod-total-stock-val');
        if (totalEl) totalEl.textContent = `${stockTxt} ${abrev}`;

        const sumaEl = card.querySelector('.prod-variants-sum');
        if (sumaEl) sumaEl.textContent = `${stockTxt} ${abrev}`;
    }

    if (typeof sincronizarUIconCategorias === 'function') {
        sincronizarUIconCategorias();
    }
}

function inicializarEventosModalProducto() {
    const overlay = document.getElementById('modal-nuevo-producto');
    const btnCerrar = document.getElementById('btn-cerrar-modal-prod');
    const btnCancelar = document.getElementById('btn-cancelar-modal-prod');
    const form = document.getElementById('form-nuevo-producto');

    btnCerrar.addEventListener('click', cerrarModalNuevoProducto);
    btnCancelar.addEventListener('click', cerrarModalNuevoProducto);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cerrarModalNuevoProducto();
    });

    const btnAbrirCatModal = document.getElementById('btn-abrir-gestor-cat-modal');
    if (btnAbrirCatModal) {
        btnAbrirCatModal.addEventListener('click', () => {
            if (typeof abrirModalGestorCategorias === 'function') {
                abrirModalGestorCategorias();
            }
        });
    }

    const selectCat = document.getElementById('prod-categoria');
    const boxCatRapida = document.getElementById('box-nueva-cat-rapida');
    const inputCatRapida = document.getElementById('input-cat-rapida');
    const btnGuardarCatRapida = document.getElementById('btn-guardar-cat-rapida');
    const btnCancelarCatRapida = document.getElementById('btn-cancelar-cat-rapida');
    let ultimaCategoriaValida = 'General';

    if (selectCat && boxCatRapida) {
        selectCat.addEventListener('change', () => {
            if (selectCat.value === '__nueva__') {
                boxCatRapida.style.display = 'flex';
                inputCatRapida.value = '';
                inputCatRapida.focus();
            } else {
                ultimaCategoriaValida = selectCat.value;
                boxCatRapida.style.display = 'none';
            }
        });

        const confirmarNuevaCategoriaRapida = () => {
            const nueva = inputCatRapida.value.trim();
            if (!nueva) {
                inputCatRapida.focus();
                return;
            }
            const creada = typeof registrarCategoriaSiNoExiste === 'function'
                ? registrarCategoriaSiNoExiste(nueva)
                : nueva;
            ultimaCategoriaValida = creada;
            if (typeof sincronizarUIconCategorias === 'function') {
                sincronizarUIconCategorias(creada);
            }
            boxCatRapida.style.display = 'none';
        };

        btnGuardarCatRapida.addEventListener('click', confirmarNuevaCategoriaRapida);
        inputCatRapida.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmarNuevaCategoriaRapida();
            } else if (e.key === 'Escape') {
                selectCat.value = ultimaCategoriaValida;
                boxCatRapida.style.display = 'none';
            }
        });

        btnCancelarCatRapida.addEventListener('click', () => {
            selectCat.value = ultimaCategoriaValida;
            boxCatRapida.style.display = 'none';
        });
    }

    const familyCards = document.querySelectorAll('.family-card');
    familyCards.forEach(card => {
        card.addEventListener('click', () => {
            familyCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            familiaActiva = card.getAttribute('data-family');
            actualizarSegunFamilia(familiaActiva);
        });
    });

    document.getElementById('prod-variantes').addEventListener('input', actualizarVistaPreviaVariantes);

    document.getElementById('btn-gen-sku').addEventListener('click', () => {
        document.getElementById('prod-sku').value = generarSkuAleatorio();
    });

    document.getElementById('btn-scan-sku').addEventListener('click', () => {
        alert('Escáner por cámara web disponible al conectar el módulo de lectura de códigos de barras.');
    });

    const imgTabs = document.querySelectorAll('.img-tab');
    imgTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            imgTabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.img-mode-panel').forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            const mode = tab.getAttribute('data-img-mode');
            document.getElementById(`panel-img-${mode}`).classList.add('active');
        });
    });

    const inputFiles = document.getElementById('input-file-imagenes');
    inputFiles.addEventListener('change', async (e) => {
        await procesarArchivosImagenParaGaleria(e.target.files, 'tu equipo');
        inputFiles.value = '';
    });

    const dropzone = document.getElementById('dropzone-imagenes');
    if (dropzone) {
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '#0f766e';
            dropzone.style.background = '#f0fdfa';
        });
        dropzone.addEventListener('dragleave', () => {
            dropzone.style.borderColor = '';
            dropzone.style.background = '';
        });
        dropzone.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '';
            dropzone.style.background = '';
            if (e.dataTransfer?.files?.length) {
                await procesarArchivosImagenParaGaleria(e.dataTransfer.files, 'arrastrar y soltar');
            }
        });
    }

    registrarListenerPegadoGlobal();

    const btnAgregarUrl = document.getElementById('btn-agregar-url');
    btnAgregarUrl.addEventListener('click', async () => {
        const inputUrl = document.getElementById('input-url-imagen');
        const url = inputUrl.value.trim();
        if (!url) return;

        if (galeriaImagenes.length >= MAX_IMAGENES_WEB) {
            mostrarEstadoCargaImagen('warn', `⚠️ Límite alcanzado: máximo ${MAX_IMAGENES_WEB} imágenes por producto.`);
            return;
        }

        const txtOriginal = btnAgregarUrl.textContent;
        btnAgregarUrl.disabled = true;
        btnAgregarUrl.textContent = '⏳...';
        mostrarEstadoCargaImagen('info', '⏳ Descargando y guardando imagen en tu Bóveda Local...');

        try {
            const dataUrlLocal = await intentarLocalizarUrlExterna(url);
            if (dataUrlLocal) {
                galeriaImagenes.push(dataUrlLocal);
                inputUrl.value = '';
                renderizarGaleriaSlots();
                mostrarEstadoCargaImagen('success', '✅ Imagen descargada y guardada en tu Bóveda Local (exporta perfecto en PDF y PNG).');
            } else {
                mostrarEstadoCargaImagen(
                    'error',
                    '🚫 Esta web bloquea descargas externas (no se podría exportar a PNG/PDF).<br><strong>Solución rápida (2 seg):</strong> haz clic derecho en la foto original → <em>"Copiar imagen"</em> y pégala aquí con <strong>Ctrl + V</strong>.'
                );
            }
        } finally {
            btnAgregarUrl.disabled = false;
            btnAgregarUrl.textContent = txtOriginal;
        }
    });

    ['prod-precio-normal', 'prod-precio-oferta', 'prod-precio-costo'].forEach(id => {
        document.getElementById(id).addEventListener('input', calcularRentabilidadEnVivo);
    });

    form.addEventListener('submit', guardarProductoFormulario);
}

function actualizarSegunFamilia(familia) {
    const config = UNIDADES_POR_FAMILIA[familia] || UNIDADES_POR_FAMILIA.unidad;
    const selectUnidad = document.getElementById('prod-unidad');
    const inputStock = document.getElementById('prod-stock');
    const labelStock = document.getElementById('label-stock');
    const boxVariantes = document.getElementById('box-variantes');

    selectUnidad.innerHTML = config.opciones
        .map(u => `<option value="${u}">${u}</option>`)
        .join('');

    inputStock.step = config.step;
    labelStock.textContent = config.label;
    boxVariantes.style.display = familia === 'variantes' ? 'flex' : 'none';
    actualizarVistaPreviaVariantes();
}

function actualizarVistaPreviaVariantes() {
    const chipsContainer = document.getElementById('variantes-chips');
    const summary = document.getElementById('modal-save-summary');

    if (familiaActiva !== 'variantes') {
        chipsContainer.innerHTML = '';
        if (!productoEditandoId) {
            summary.innerHTML = '💾 Se guardará <strong>1 producto</strong> en la Bóveda Local';
        }
        return;
    }

    const raw = document.getElementById('prod-variantes').value;
    const lista = raw.split(',').map(v => v.trim()).filter(Boolean);

    chipsContainer.innerHTML = lista
        .map(v => `<span class="var-chip">${escaparHtml(v)}</span>`)
        .join('');

    if (!productoEditandoId) {
        summary.innerHTML = lista.length > 0
            ? `🧩 Se crearán <strong>${lista.length} variantes</strong> vinculadas automáticamente`
            : '⚠️ Ingresa al menos una variante separada por coma (ej: S, M, L)';
    }
}

function renderizarGaleriaSlots() {
    const container = document.getElementById('gallery-slots');
    const counter = document.getElementById('img-counter');
    counter.textContent = `${galeriaImagenes.length} / ${MAX_IMAGENES_WEB} fotos`;
    container.innerHTML = '';

    for (let i = 0; i < MAX_IMAGENES_WEB; i++) {
        const slot = document.createElement('div');
        const imgSrc = galeriaImagenes[i];

        if (imgSrc) {
            const esExterna = /^https?:\/\//i.test(String(imgSrc));
            slot.className = `img-slot filled ${i === 0 ? 'is-cover' : ''}`;
            slot.title = i === 0 ? 'Foto de portada' : 'Haz clic para usar como portada';
            slot.innerHTML = `
                <img src="${imgSrc}" alt="Foto ${i + 1}">
                ${i === 0 ? '<span class="slot-cover-tag">PORTADA</span>' : ''}
                ${esExterna ? '<span title="Enlace externo: puede fallar en PNG/PDF" style="position:absolute;bottom:4px;left:4px;background:rgba(180,83,9,0.9);color:#fff;font-size:9px;padding:1px 4px;border-radius:4px;font-weight:700;">🌐 URL</span>' : ''}
                <button type="button" class="slot-remove-btn" title="Quitar foto">✕</button>
            `;

            slot.addEventListener('click', (e) => {
                if (e.target.classList.contains('slot-remove-btn')) return;
                if (i > 0) {
                    const seleccionada = galeriaImagenes.splice(i, 1)[0];
                    galeriaImagenes.unshift(seleccionada);
                    renderizarGaleriaSlots();
                }
            });

            slot.querySelector('.slot-remove-btn').addEventListener('click', () => {
                galeriaImagenes.splice(i, 1);
                renderizarGaleriaSlots();
            });
        } else {
            slot.className = 'img-slot';
            slot.textContent = `Foto ${i + 1}`;
        }

        container.appendChild(slot);
    }
}

function calcularRentabilidadEnVivo() {
    const normal = parseFloat(document.getElementById('prod-precio-normal').value) || 0;
    const oferta = parseFloat(document.getElementById('prod-precio-oferta').value) || 0;
    const costo = parseFloat(document.getElementById('prod-precio-costo').value) || 0;

    const precioVenta = oferta > 0 && oferta < normal ? oferta : normal;
    const elGanancia = document.getElementById('calc-ganancia');
    const elMargen = document.getElementById('calc-margen');
    const elDescuento = document.getElementById('calc-descuento');

    if (precioVenta > 0 && costo > 0) {
        const ganancia = precioVenta - costo;
        const margen = (ganancia / precioVenta) * 100;
        elGanancia.textContent = `$${ganancia.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        elMargen.textContent = `${margen.toFixed(1)}%`;
        elMargen.className = margen >= 20 ? 'badge-margin-good' : (margen < 0 ? 'badge-margin-bad' : 'badge-margin-neutral');
    } else {
        elGanancia.textContent = '$0.00';
        elMargen.textContent = '0%';
        elMargen.className = 'badge-margin-neutral';
    }

    if (normal > 0 && oferta > 0 && oferta < normal) {
        const dto = ((normal - oferta) / normal) * 100;
        elDescuento.textContent = `-${dto.toFixed(0)}% OFF`;
        elDescuento.className = 'badge-margin-good';
    } else {
        elDescuento.textContent = '—';
        elDescuento.className = '';
    }
}

function guardarProductoFormulario(e) {
    e.preventDefault();

    const nombre = document.getElementById('prod-nombre').value.trim();
    const sku = document.getElementById('prod-sku').value.trim() || generarSkuAleatorio();

    let rawCategoria = document.getElementById('prod-categoria').value;
    if (rawCategoria === '__nueva__') {
        rawCategoria = document.getElementById('input-cat-rapida')?.value.trim() || 'General';
    }
    const categoria = typeof registrarCategoriaSiNoExiste === 'function'
        ? registrarCategoriaSiNoExiste(rawCategoria)
        : rawCategoria;

    const descripcion = document.getElementById('prod-descripcion').value.trim();
    const precioNormal = parseFloat(document.getElementById('prod-precio-normal').value) || 0;
    const precioOferta = parseFloat(document.getElementById('prod-precio-oferta').value) || 0;
    const precioCosto = parseFloat(document.getElementById('prod-precio-costo').value) || 0;
    const precioMayorista = parseFloat(document.getElementById('prod-precio-mayorista').value) || 0;
    const unidad = document.getElementById('prod-unidad').value;
    const proveedor = document.getElementById('prod-proveedor').value || 'Sin proveedor';
    const stockInput = Math.round((parseFloat(document.getElementById('prod-stock').value) || 0) * 1000) / 1000;
    const umbral = document.getElementById('prod-umbral').value ? parseFloat(document.getElementById('prod-umbral').value) : null;
    const publicarWeb = document.getElementById('prod-publicar-web').checked;
    const incluirPdf = document.getElementById('prod-incluir-pdf').checked;

    const variantes = familiaActiva === 'variantes'
        ? document.getElementById('prod-variantes').value.split(',').map(v => v.trim()).filter(Boolean)
        : [];

    if (familiaActiva === 'variantes' && variantes.length === 0) {
        alert('Ingresa al menos una variante o talle (ej: S, M, L).');
        return;
    }

    const prodPrevio = productoEditandoId
        ? window.bovedaProductos.find(p => String(p.id) === String(productoEditandoId))
        : null;

    const precioBaseNuevo = (precioOferta > 0 && precioOferta < precioNormal) ? precioOferta : precioNormal;
    let variantesDetalle = [];
    let stockFinal = stockInput;

    if (variantes.length > 0) {
        const previos = (prodPrevio && Array.isArray(prodPrevio.variantesDetalle)) ? prodPrevio.variantesDetalle : [];
        variantesDetalle = variantes.map((nombreVar, idx) => {
            const match = previos.find(v => v.nombre.toLowerCase() === nombreVar.toLowerCase());
            return {
                nombre: nombreVar,
                sku: match ? match.sku : `${sku}-${nombreVar.toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
                stock: match ? match.stock : stockInput,
                precio: (match && typeof match.precio === 'number') ? match.precio : precioBaseNuevo,
                precioOferta: (match && Number(match.precioOferta) > 0) ? Number(match.precioOferta) : 0,
                precioCosto: (match && match.precioCosto !== undefined) ? match.precioCosto : (precioCosto > 0 ? precioCosto : null),
                color: (match && match.color) ? match.color : COLORES_VARIANTES_DEFAULT[idx % COLORES_VARIANTES_DEFAULT.length],
                imagen_url: (match && typeof match.imagen_url === 'string') ? match.imagen_url : ''
            };
        });
        stockFinal = Math.round(variantesDetalle.reduce((acc, v) => acc + (Number(v.stock) || 0), 0) * 1000) / 1000;
    }

    const datosProducto = {
        id: productoEditandoId || Date.now(),
        sku,
        nombre,
        categoria,
        descripcion,
        familia: familiaActiva,
        familiaMedicion: familiaActiva,
        unidadMedida: unidad,
        precioNormal,
        precioOferta,
        precioCosto,
        precioMayorista,
        proveedor,
        stock: stockFinal,
        umbralCritico: umbral,
        variantes,
        variantesDetalle,
        imagenes: [...galeriaImagenes],
        publicarWeb,
        visible: publicarWeb,
        visibleWeb: publicarWeb,
        publicado: publicarWeb,
        incluirPdf,
        visiblePdf: incluirPdf,
        enCatalogo: incluirPdf,
        actualizadoEn: new Date().toISOString()
    };

    if (productoEditandoId) {
        const idx = window.bovedaProductos.findIndex(p => String(p.id) === String(productoEditandoId));
        if (idx !== -1) {
            window.bovedaProductos[idx] = datosProducto;
        }
    } else {
        window.bovedaProductos.unshift(datosProducto);
    }

    guardarBovedaLocal();
    renderizarProductosCreados();
    cerrarModalNuevoProducto();
}

function renderizarProductosCreados() {
    const contenedor = document.getElementById('inv-productos-creados');
    if (!contenedor) return;

    const productosOrdenados = obtenerProductosOrdenados(window.bovedaProductos);

    contenedor.innerHTML = productosOrdenados.map(prod => {
        asegurarVariantesDetalle(prod);

        const fotoPortada = (prod.imagenes && prod.imagenes[0]) ? prod.imagenes[0] : '../img/producto.png';
        const tieneOferta = prod.precioOferta > 0 && prod.precioOferta < prod.precioNormal;
        const precioFinal = tieneOferta ? prod.precioOferta : prod.precioNormal;
        const precioFinalTxt = `$${precioFinal.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
        const precioNormalTxt = `$${prod.precioNormal.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
        const abrevUnidad = window.obtenerAbrevUnidad(prod.unidadMedida);
        const unidadPrecioHtml = `<span style="font-size:0.72em; font-weight:600; opacity:0.72; margin-left:2px;">/ ${escaparHtml(abrevUnidad)}</span>`;
        const stockFormateado = window.formatearStockProducto(prod.stock, prod.familiaMedicion, prod.unidadMedida);
        const margenPct = prod.precioCosto > 0 && precioFinal > 0
            ? (((precioFinal - prod.precioCosto) / precioFinal) * 100).toFixed(1)
            : null;

        const badgeFotos = prod.imagenes && prod.imagenes.length > 1
            ? `<span class="sku-tag">📸 ${prod.imagenes.length} fotos</span>`
            : '';
        const badgeSinStock = prod.stock <= 0
            ? '<span class="badge-danger-solid">SIN STOCK</span>'
            : '';
        const catLimpia = (prod.categoria || 'General').toLowerCase();
        const incluirEnPdf = prod.incluirPdf !== false;
        const dataCat = `${catLimpia} ${tieneOferta ? 'oferta' : ''} ${prod.stock <= 0 ? 'sinstock' : ''} ${!prod.publicarWeb ? 'ocultos' : ''}`;

        // TARJETA EXPANDIDA (PRODUCTOS CON VARIANTES / TALLES)
        if (prod.variantesDetalle && prod.variantesDetalle.length > 0) {
            const variantesHtml = prod.variantesDetalle.map((v, idx) => {
                const colorDot = v.color || COLORES_VARIANTES_DEFAULT[idx % COLORES_VARIANTES_DEFAULT.length];
                const precioVar = typeof v.precio === 'number' ? v.precio : precioFinal;
                const ofertaVar = Number(v.precioOferta) || 0;
                const tieneOfertaVar = ofertaVar > 0 && ofertaVar < precioVar;
                const precioVarTxt = `$${precioVar.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
                const ofertaVarTxt = `$${ofertaVar.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
                const fotoVarHtml = v.imagen_url
                    ? `<img src="${escaparHtml(v.imagen_url)}" alt="${escaparHtml(v.nombre)}" style="width:28px; height:28px; border-radius:6px; object-fit:cover; border:1px solid #e2e8f0; flex-shrink:0;">`
                    : '';

                return `
                    <div class="variant-card">
                        <div class="variant-top">
                            <div style="display:flex; align-items:center; gap:0.45rem; min-width:0;">
                                ${fotoVarHtml}
                                <div style="min-width:0;">
                                    <span class="color-dot" style="background:${escaparHtml(colorDot)};"></span>
                                    <strong>${escaparHtml(v.nombre)}</strong>
                                    <div class="variant-sku">${escaparHtml(v.sku)}</div>
                                </div>
                            </div>
                            <button type="button" class="variant-price btn-editar-variante"
                                data-prod-id="${prod.id}"
                                data-var-idx="${idx}"
                                title="Clic para editar precio, oferta, foto, color, código y stock de esta variante"
                                style="display:flex; flex-direction:column; align-items:flex-end; line-height:1.15;">
                                ${tieneOfertaVar
                                    ? `<span style="color:#dc2626; font-weight:800;">${ofertaVarTxt}</span><del style="font-size:0.72em; color:#94a3b8; font-weight:600;">${precioVarTxt}</del>`
                                    : precioVarTxt}
                            </button>
                        </div>
                        <div class="variant-stock-ctrl">
                            <span>Stock rápido</span>
                            <div class="stepper">
                                <button type="button" class="step-btn" data-action="minus" data-prod-id="${prod.id}" data-var-idx="${idx}">−</button>
                                <span class="step-val" data-var-idx="${idx}">${v.stock}</span>
                                <button type="button" class="step-btn" data-action="plus" data-prod-id="${prod.id}" data-var-idx="${idx}">+</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <article class="inv-product-card expanded" data-prod-id="${prod.id}" data-prod-cat="${escaparHtml(catLimpia)}" data-category="${escaparHtml(dataCat)}">
                    <div class="prod-main-row">
                        <div class="prod-thumb-wrap">
                            <span class="thumb-badge ${tieneOferta ? 'badge-amber-solid' : 'badge-dark'}">
                                ${prod.variantesDetalle.length} Talles
                            </span>
                            <img src="${fotoPortada}" alt="${escaparHtml(prod.nombre)}">
                        </div>

                        <div class="prod-details">
                            <div class="prod-top-line">
                                <div>
                                    <h3 class="prod-name">
                                        ${escaparHtml(prod.nombre)}
                                        <span class="sku-tag">${escaparHtml(prod.sku)}</span>
                                        ${badgeFotos}
                                        ${badgeSinStock}
                                    </h3>
                                    <p class="prod-sub">🏷️ ${escaparHtml(prod.categoria)} • 🏭 ${escaparHtml(prod.proveedor || 'Sin proveedor')}</p>
                                </div>
                                <div class="visibility-pills-group">
                                    <button type="button" class="visibility-pill btn-toggle-visibilidad ${prod.publicarWeb ? 'visible' : 'hidden'}" data-id="${prod.id}" title="Cambiar visibilidad en Catálogo Web">
                                        ${prod.publicarWeb ? '👁️ Visible en Web' : '🚫 Oculto en Web'}
                                    </button>
                                    <button type="button" class="visibility-pill btn-toggle-pdf ${incluirEnPdf ? 'pdf-visible' : 'hidden'}" data-id="${prod.id}" title="Incluir o quitar del Catálogo PDF">
                                        ${incluirEnPdf ? '📄 En Catálogo PDF' : '🚫 Oculto en PDF'}
                                    </button>
                                </div>
                            </div>

                            <div class="prod-metrics-grid">
                                <div class="metric-box">
                                    <span class="metric-label">P. PÚBLICO</span>
                                    <div class="metric-val">${precioFinalTxt}${unidadPrecioHtml} ${tieneOferta ? `<del>${precioNormalTxt}</del>` : ''}</div>
                                </div>
                                <div class="metric-box">
                                    <span class="metric-label">COSTO INTERNO</span>
                                    <div class="metric-val">${prod.precioCosto > 0 ? `$${prod.precioCosto.toLocaleString('es-AR')} 🔒` : '—'}</div>
                                </div>
                                <div class="metric-box">
                                    <span class="metric-label">MARGEN BRUTO</span>
                                    <div class="metric-val">
                                        ${margenPct !== null ? `<span class="badge-margin">${margenPct}% GANANCIA</span>` : '<span class="cost-pill">Sin costo</span>'}
                                    </div>
                                </div>
                                <div class="metric-box">
                                    <span class="metric-label">STOCK TOTAL</span>
                                    <div class="metric-val prod-total-stock-val">${stockFormateado} ${escaparHtml(abrevUnidad)}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="variants-drawer">
                        <div class="variants-header">
                            <span>🧩 <strong>${prod.variantesDetalle.length} Variantes configuradas</strong> (clic en el precio para editar foto, oferta y stock) &nbsp;|&nbsp; Suma: <strong class="prod-variants-sum">${stockFormateado} ${escaparHtml(abrevUnidad)}</strong></span>
                            <button type="button" class="link-btn btn-add-variante" data-id="${prod.id}">+ Añadir Variante</button>
                        </div>
                        <div class="variants-grid">
                            ${variantesHtml}
                        </div>
                    </div>

                    <div class="prod-footer-actions">
                        <div class="left-btns">
                            <button type="button" class="mini-btn btn-editar-prod" data-id="${prod.id}">✏️ Editar Ficha</button>
                            <button type="button" class="mini-btn btn-danger-soft btn-eliminar-prod" data-id="${prod.id}">🗑️ Eliminar</button>
                        </div>
                        <button type="button" class="mini-btn btn-story-trigger"
                            data-id="${prod.id}"
                            data-title="${escaparHtml(prod.nombre)}"
                            data-price="${precioFinalTxt}"
                            data-old="${tieneOferta ? precioNormalTxt : ''}"
                            data-img="${fotoPortada}">
                            ✨ Estudio IA
                        </button>
                    </div>
                </article>
            `;
        }

        // TARJETA COMPACTA (PRODUCTOS SIMPLES SIN VARIANTES)
        const margenTxt = margenPct !== null
            ? `Costo: $${prod.precioCosto.toLocaleString('es-AR')} (Margen: ${Math.round(margenPct)}%)`
            : 'Sin costo cargado';

        return `
            <article class="inv-product-card compact" data-prod-id="${prod.id}" data-prod-cat="${escaparHtml(catLimpia)}" data-category="${escaparHtml(dataCat)}">
                <div class="compact-left">
                    <div class="compact-thumb">
                        ${tieneOferta ? '<span class="thumb-badge badge-amber-solid">OFERTA</span>' : ''}
                        <img src="${fotoPortada}" alt="${escaparHtml(prod.nombre)}">
                    </div>
                    <div>
                        <h4 class="prod-name">${escaparHtml(prod.nombre)} ${badgeFotos} ${badgeSinStock}</h4>
                        <p class="prod-sub">SKU: ${escaparHtml(prod.sku)} • ${escaparHtml(prod.categoria)} • Stock: <strong>${stockFormateado} ${escaparHtml(abrevUnidad)}</strong></p>
                        <div class="compact-pricing">
                            <strong>${precioFinalTxt}${unidadPrecioHtml}</strong>
                            ${tieneOferta ? `<del>${precioNormalTxt}</del>` : ''}
                            <span class="cost-pill">${margenTxt}</span>
                        </div>
                    </div>
                </div>
                <div class="compact-actions">
                    <div class="visibility-pills-group compact-pills">
                        <button type="button" class="visibility-pill btn-toggle-visibilidad ${prod.publicarWeb ? 'visible' : 'hidden'}" data-id="${prod.id}" title="Cambiar visibilidad en Catálogo Web">
                            ${prod.publicarWeb ? '👁️ Visible en Web' : '🚫 Oculto en Web'}
                        </button>
                        <button type="button" class="visibility-pill btn-toggle-pdf ${incluirEnPdf ? 'pdf-visible' : 'hidden'}" data-id="${prod.id}" title="Incluir o quitar del Catálogo PDF">
                            ${incluirEnPdf ? '📄 En Catálogo PDF' : '🚫 Oculto en PDF'}
                        </button>
                    </div>
                    <button type="button" class="mini-btn btn-editar-prod" data-id="${prod.id}">✏️ Editar</button>
                    <button type="button" class="mini-btn btn-danger-soft btn-eliminar-prod" data-id="${prod.id}" title="Eliminar producto">🗑️ Eliminar</button>
                    <button type="button" class="mini-btn btn-story-trigger"
                        data-id="${prod.id}"
                        data-title="${escaparHtml(prod.nombre)}"
                        data-price="${precioFinalTxt}"
                        data-old="${tieneOferta ? precioNormalTxt : ''}"
                        data-img="${fotoPortada}">
                        ✨ Estudio IA
                    </button>
                </div>
            </article>
        `;
    }).join('');

    if (typeof sincronizarUIconCategorias === 'function') {
        sincronizarUIconCategorias();
    }

    actualizarEstadisticasEncabezadoInventario();
    aplicarFiltrosYPaginacionInventario(false);
}

/**
- Devuelve una copia ordenada de los productos según el criterio elegido en #inv-sort-select
 */
function obtenerProductosOrdenados(lista) {
    const copia = Array.isArray(lista) ? [...lista] : [];
    const criterio = window.ordenInventarioActual || 'recientes';

    const tieneOferta = (p) => Number(p.precioOferta) > 0 && Number(p.precioOferta) < Number(p.precioNormal);
    const sinStock = (p) => Number(p.stock) <= 0;

    return copia.sort((a, b) => {
        const precioA = obtenerPrecioBaseProducto(a);
        const precioB = obtenerPrecioBaseProducto(b);
        const nombreA = String(a.nombre || '');
        const nombreB = String(b.nombre || '');
        const catA = String(a.categoria || 'General');
        const catB = String(b.categoria || 'General');

        switch (criterio) {
            case 'precio-desc':
                return precioB - precioA;
            case 'precio-asc':
                return precioA - precioB;
            case 'nombre-asc':
                return nombreA.localeCompare(nombreB, 'es', { sensitivity: 'base' });
            case 'nombre-desc':
                return nombreB.localeCompare(nombreA, 'es', { sensitivity: 'base' });
            case 'categoria-asc': {
                const cmpCat = catA.localeCompare(catB, 'es', { sensitivity: 'base' });
                return cmpCat !== 0 ? cmpCat : nombreA.localeCompare(nombreB, 'es', { sensitivity: 'base' });
            }
            case 'oferta-primero':
                return (tieneOferta(b) ? 1 : 0) - (tieneOferta(a) ? 1 : 0);
            case 'oferta-final':
                return (tieneOferta(a) ? 1 : 0) - (tieneOferta(b) ? 1 : 0);
            case 'stock0-primero':
                return (sinStock(b) ? 1 : 0) - (sinStock(a) ? 1 : 0);
            case 'stock0-final':
                return (sinStock(a) ? 1 : 0) - (sinStock(b) ? 1 : 0);
            case 'recientes':
            default:
                return (Number(b.id) || 0) - (Number(a.id) || 0);
        }
    });
}

const STORAGE_KEY_POR_PAGINA = 'cat_alogo_inv_por_pagina';
window.paginaActualInventario = 1;
window.productosPorPagina = parseInt(localStorage.getItem(STORAGE_KEY_POR_PAGINA) || '30', 10) || 30;

/**
- Aplica en conjunto: filtro de categoría/estado + buscador de texto + paginación real.
 */
function aplicarFiltrosYPaginacionInventario(resetearPagina = false) {
    if (resetearPagina) {
        window.paginaActualInventario = 1;
    }

    const filtroActivo = document.querySelector('#inv-filters .filter-chip.active')?.getAttribute('data-filter') || 'todos';
    const terminoBusqueda = (document.getElementById('inv-search-input')?.value || '').trim().toLowerCase();

    const todasLasTarjetas = Array.from(document.querySelectorAll('#inv-productos-creados .inv-product-card'));
    const tarjetasCoincidentes = [];

    todasLasTarjetas.forEach(card => {
        let coincideFiltro = true;

        if (filtroActivo !== 'todos') {
            if (filtroActivo.startsWith('cat:')) {
                const catBuscada = filtroActivo.slice(4);
                const cardCat = (card.getAttribute('data-prod-cat') || '').toLowerCase();
                coincideFiltro = cardCat === catBuscada;
            } else {
                const cats = (card.getAttribute('data-category') || '').toLowerCase();
                coincideFiltro = cats.includes(filtroActivo);
            }
        }

        const coincideTexto = !terminoBusqueda || card.textContent.toLowerCase().includes(terminoBusqueda);

        if (coincideFiltro && coincideTexto) {
            tarjetasCoincidentes.push(card);
        }
    });

    const porPagina = Math.max(1, Number(window.productosPorPagina) || 30);
    const totalCoincidentes = tarjetasCoincidentes.length;
    const totalPaginas = Math.max(1, Math.ceil(totalCoincidentes / porPagina));

    if (window.paginaActualInventario > totalPaginas) {
        window.paginaActualInventario = totalPaginas;
    }
    if (window.paginaActualInventario < 1) {
        window.paginaActualInventario = 1;
    }

    const paginaActual = window.paginaActualInventario;
    const inicio = (paginaActual - 1) * porPagina;
    const fin = inicio + porPagina;

    todasLasTarjetas.forEach(card => { card.style.display = 'none'; });
    const tarjetasPagina = tarjetasCoincidentes.slice(inicio, fin);
    tarjetasPagina.forEach(card => { card.style.display = ''; });

    const elInfo = document.getElementById('inv-page-info');
    if (elInfo) {
        const cant = tarjetasPagina.length;
        elInfo.innerHTML = `Página <strong>${paginaActual}</strong> de <strong>${totalPaginas}</strong> • <strong>${cant}</strong> ${cant === 1 ? 'producto' : 'productos'}`;
    }

    actualizarPiePaginacionInventario();
    renderizarControlesPaginacion(paginaActual, totalPaginas);
}

function actualizarPiePaginacionInventario() {
    const elFooterStats = document.getElementById('inv-footer-stats');
    if (!elFooterStats) return;

    const productos = Array.isArray(window.bovedaProductos) ? window.bovedaProductos : [];
    const total = productos.length;
    const enWeb = productos.filter(p => !!p.publicarWeb).length;
    const enPdf = productos.filter(p => p.incluirPdf !== false).length;

    elFooterStats.innerHTML = `
        <span>🌐 N° de productos en catálogo Web: <strong>${enWeb.toLocaleString('es-AR')}</strong> de <strong>${total.toLocaleString('es-AR')}</strong> productos</span>
        <span>📄 N° de productos en catálogo PDF: <strong>${enPdf.toLocaleString('es-AR')}</strong> de <strong>${total.toLocaleString('es-AR')}</strong> productos</span>
    `;
}

function renderizarControlesPaginacion(paginaActual, totalPaginas) {
    const contenedor = document.getElementById('inv-page-controls');
    if (!contenedor) return;

    let html = `<button type="button" class="page-btn" data-page="${paginaActual - 1}" ${paginaActual <= 1 ? 'disabled' : ''}>Anterior</button>`;

    const paginasAMostrar = [];
    if (totalPaginas <= 7) {
        for (let i = 1; i <= totalPaginas; i++) paginasAMostrar.push(i);
    } else {
        paginasAMostrar.push(1);
        if (paginaActual > 3) paginasAMostrar.push('...');
        const desde = Math.max(2, paginaActual - 1);
        const hasta = Math.min(totalPaginas - 1, paginaActual + 1);
        for (let i = desde; i <= hasta; i++) paginasAMostrar.push(i);
        if (paginaActual < totalPaginas - 2) paginasAMostrar.push('...');
        paginasAMostrar.push(totalPaginas);
    }

    paginasAMostrar.forEach(item => {
        if (item === '...') {
            html += `<span class="page-ellipsis">…</span>`;
        } else {
            html += `<button type="button" class="page-btn ${item === paginaActual ? 'active' : ''}" data-page="${item}">${item}</button>`;
        }
    });

    html += `<button type="button" class="page-btn" data-page="${paginaActual + 1}" ${paginaActual >= totalPaginas ? 'disabled' : ''}>Siguiente</button>`;

    contenedor.innerHTML = html;

    contenedor.querySelectorAll('.page-btn:not(:disabled)').forEach(btn => {
        btn.addEventListener('click', () => {
            const nuevaPagina = parseInt(btn.getAttribute('data-page'), 10);
            if (!isNaN(nuevaPagina)) {
                window.paginaActualInventario = nuevaPagina;
                aplicarFiltrosYPaginacionInventario(false);
                document.querySelector('.inv-list-column')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

function actualizarEstadisticasEncabezadoInventario() {
    const productos = Array.isArray(window.bovedaProductos) ? window.bovedaProductos : [];

    const total = productos.length;
    const visiblesPdf = productos.filter(p => p.incluirPdf !== false).length;
    const visiblesWeb = productos.filter(p => !!p.publicarWeb).length;

    const elTotal = document.getElementById('stat-total-articulos');
    const elPdf = document.getElementById('stat-visibles-pdf');
    const elWeb = document.getElementById('stat-visibles-web');

    if (elTotal) elTotal.textContent = total.toLocaleString('es-AR');
    if (elPdf) elPdf.textContent = visiblesPdf.toLocaleString('es-AR');
    if (elWeb) elWeb.textContent = visiblesWeb.toLocaleString('es-AR');
}

function resetearFormularioProducto() {
    const form = document.getElementById('form-nuevo-producto');
    if (form) form.reset();

    familiaActiva = 'unidad';
    galeriaImagenes = [];
    mostrarEstadoCargaImagen('', '');

    document.querySelectorAll('.family-card').forEach(c => c.classList.remove('active'));
    const defaultFam = document.querySelector('.family-card[data-family="unidad"]');
    if (defaultFam) defaultFam.classList.add('active');

    document.getElementById('prod-sku').value = generarSkuAleatorio();
    actualizarSegunFamilia('unidad');
    renderizarGaleriaSlots();
    calcularRentabilidadEnVivo();

    const boxCatRapida = document.getElementById('box-nueva-cat-rapida');
    if (boxCatRapida) boxCatRapida.style.display = 'none';
    if (typeof sincronizarUIconCategorias === 'function') {
        sincronizarUIconCategorias('General');
    }
}

function generarSkuAleatorio() {
    return 'PRD-' + Math.floor(10000 + Math.random() * 90000);
}
