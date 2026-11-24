/* ==========================================================================
   MÓDULO: CONTROL DE STOCK, REABASTECIMIENTO Y PROVEEDORES (ETAPAS 1 A 4)
   ========================================================================== */

const STORAGE_KEY_PROVEEDORES = 'cat_alogo_proveedores_v1';
const STORAGE_KEY_PEDIDOS = 'cat_alogo_pedidos_v1';
const STORAGE_KEY_CUENTAS_PAGAR = 'cat_alogo_cuentas_pagar_v1';
const STORAGE_KEY_UMBRAL_GLOBAL = 'cat_alogo_stock_umbral_global_v1';

const PROVEEDORES_DEFAULT_SEED = [
    { id: 'prov-1', nombre: 'Hilandería Norte S.A.', rubro: 'Textil & Indumentaria', whatsapp: '+54 9 351 5432-8890', entrega: 'Entrega 24 hs', alias: 'Hilanderia.Norte', notas: '' },
    { id: 'prov-2', nombre: 'Distribuidora Gourmet Sur', rubro: 'Almacén & Frescos', whatsapp: '+54 9 351 4981-2210', entrega: 'Entrega 48 hs', alias: 'GourmetSur.OK', notas: '' },
    { id: 'prov-3', nombre: 'Mayorista Central', rubro: 'Polirrubro Mayorista', whatsapp: '+54 9 351 654-1122', entrega: 'Programado', alias: 'Mayorista.Central', notas: '' }
];

window.stockState = {
    filtroActivo: 'todos',
    busqueda: '',
    paginaActual: 1,
    porPagina: 15,
    umbralGlobal: parseFloat(localStorage.getItem(STORAGE_KEY_UMBRAL_GLOBAL) || '5') || 5,
    expandidos: new Set(),
    ajusteRef: null,
    // Etapa 2: Agenda de Proveedores
    provEditandoId: null,
    provSeleccionProductos: new Set(),
    provFiltroProductos: 'todos',
    provBusquedaProductos: '',
    // Etapa 3: Generador de Pedidos
    pedProveedorNombre: '',
    pedVerTodos: false,
    pedBusqueda: '',
    pedItemsMap: new Map(),
    pedMensajeEditadoManual: false,
    // Etapa 4: Recepción en Tránsito, Filtros y Pagos
    recTabActiva: 'en_espera',
    recPedidoActivoId: null,
    recBusqueda: '',
    recFiltroProv: 'todos',
    recFiltroPago: 'todos',
    recFiltroPeriodo: 'todos',
    recOrden: 'recientes',
    recLimiteVisible: 25,
    pagoPedidoId: null
};

let stockF8Registrado = false;

/* ==========================================================================
   HELPERS DE BÓVEDA LOCAL Y FORMATO
   ========================================================================== */
function obtenerProductosStock() {
    if (!Array.isArray(window.bovedaProductos) || window.bovedaProductos.length === 0) {
        window.bovedaProductos = JSON.parse(localStorage.getItem('cat_alogo_productos_v1') || '[]');
    }
    return window.bovedaProductos;
}

function guardarProductosStock() {
    if (typeof guardarBovedaLocal === 'function') {
        guardarBovedaLocal();
    } else {
        localStorage.setItem('cat_alogo_productos_v1', JSON.stringify(window.bovedaProductos || []));
    }
}

function guardarProveedoresStock(lista) {
    window.bovedaProveedores = lista;
    localStorage.setItem(STORAGE_KEY_PROVEEDORES, JSON.stringify(lista));
    sincronizarSelectProveedoresInventario();
}

function obtenerProveedoresStock() {
    let lista = [];
    try {
        lista = JSON.parse(localStorage.getItem(STORAGE_KEY_PROVEEDORES) || '[]');
    } catch {
        lista = [];
    }

    if (!Array.isArray(lista) || lista.length === 0) {
        lista = [...PROVEEDORES_DEFAULT_SEED];
        localStorage.setItem(STORAGE_KEY_PROVEEDORES, JSON.stringify(lista));
    }

    const productos = obtenerProductosStock();
    let huboNuevos = false;
    productos.forEach(p => {
        const nom = (p.proveedor || '').trim();
        if (!nom || nom.toLowerCase() === 'sin proveedor') return;
        const existe = lista.some(pr => pr.nombre.toLowerCase() === nom.toLowerCase());
        if (!existe) {
            lista.push({
                id: 'prov-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                nombre: nom,
                rubro: p.categoria || 'General',
                whatsapp: '',
                entrega: 'Programado',
                alias: '',
                notas: ''
            });
            huboNuevos = true;
        }
    });

    if (huboNuevos) {
        localStorage.setItem(STORAGE_KEY_PROVEEDORES, JSON.stringify(lista));
    }

    window.bovedaProveedores = lista;
    return lista;
}

window.sincronizarSelectProveedoresInventario = function(valorSeleccionado = null) {
    const sel = document.getElementById('prod-proveedor');
    if (!sel) return;

    const actual = valorSeleccionado !== null ? valorSeleccionado : sel.value;
    const proveedores = obtenerProveedoresStock();

    let html = `<option value="">Seleccionar Proveedor</option>`;
    proveedores.forEach(pr => {
        html += `<option value="${escaparHtmlStock(pr.nombre)}">${escaparHtmlStock(pr.nombre)}</option>`;
    });
    html += `<option value="Producción Propia">Producción Propia</option>`;

    sel.innerHTML = html;
    if (actual && Array.from(sel.options).some(o => o.value === actual)) {
        sel.value = actual;
    }
};

function obtenerPedidosStock() {
    try {
        const arr = JSON.parse(localStorage.getItem(STORAGE_KEY_PEDIDOS) || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function guardarPedidosStock(lista) {
    localStorage.setItem(STORAGE_KEY_PEDIDOS, JSON.stringify(lista));
    actualizarBadgeTransitoStock();
}

function obtenerCuentasPagarStock() {
    try {
        const arr = JSON.parse(localStorage.getItem(STORAGE_KEY_CUENTAS_PAGAR) || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function guardarCuentasPagarStock(lista) {
    localStorage.setItem(STORAGE_KEY_CUENTAS_PAGAR, JSON.stringify(lista));
}

function escaparHtmlStock(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function abrevUnidadStock(unidadMedida) {
    if (typeof window.obtenerAbrevUnidad === 'function') return window.obtenerAbrevUnidad(unidadMedida);
    return 'u.';
}

function formatearCantidadStock(valor, familia, unidad) {
    if (typeof window.formatearStockProducto === 'function') {
        return window.formatearStockProducto(valor, familia, unidad);
    }
    return String(Math.round((Number(valor) || 0) * 1000) / 1000);
}

function formatearMonedaArs(valor) {
    const num = Number(valor) || 0;
    return `$${num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function obtenerUmbralProducto(prod) {
    if (prod.umbralCritico !== null && prod.umbralCritico !== undefined && prod.umbralCritico !== '') {
        const val = Number(prod.umbralCritico);
        if (!isNaN(val) && val >= 0) return val;
    }
    return Math.max(0, Number(window.stockState.umbralGlobal) || 5);
}

function evaluarEstadoStock(stock, umbral) {
    const s = Number(stock) || 0;
    const u = Math.max(0, Number(umbral) || 0);
    if (s <= 0) return { nivel: 'danger', tag: 'AGOTADO', claseTag: 'tag-agotado', critico: true };
    if (s <= u) return { nivel: 'danger', tag: 'CRÍTICO', claseTag: 'tag-critico', critico: true };
    if (u > 0 && s <= u * 1.5) return { nivel: 'warning', tag: 'PREVENTIVO', claseTag: 'tag-preventivo', critico: false };
    return { nivel: 'ok', tag: '', claseTag: '', critico: false };
}

function obtenerNombreComercioLocal() {
    try {
        const pdfCfg = JSON.parse(localStorage.getItem('cat_alogo_pdf_config_v1') || 'null');
        if (pdfCfg && pdfCfg.headerNombre) return pdfCfg.headerNombre;
    } catch { /* fallback */ }
    return 'Mi Comercio';
}

/* ==========================================================================
   INICIALIZACIÓN DEL MÓDULO
   ========================================================================== */
function inicializarControlStock() {
    if (!document.getElementById('stock-module-root')) return;

    const inpUmbral = document.getElementById('stock-umbral-global');
    if (inpUmbral) inpUmbral.value = window.stockState.umbralGlobal;

    inicializarEventosControlStock();
    renderizarTodoControlStock();
}

function renderizarTodoControlStock() {
    renderizarKpisYAutoOrdenStock();
    renderizarDirectorioProveedoresStock();
    renderizarFiltrosControlStock();
    renderizarTablaControlStock();
    actualizarBadgeTransitoStock();
}

function actualizarBadgeTransitoStock() {
    const badge = document.getElementById('stock-badge-transito');
    if (!badge) return;
    const pendientes = obtenerPedidosStock().filter(p => p.estado === 'en_espera').length;
    badge.textContent = pendientes;
    badge.style.display = pendientes > 0 ? 'inline-block' : 'none';
}

/* ==========================================================================
   KPIs Y TARJETA DE REPOSICIÓN AUTOMÁTICA 1-CLICK
   ========================================================================== */
function renderizarKpisYAutoOrdenStock() {
    const productos = obtenerProductosStock();
    const totalSkus = productos.length;

    let valorizadoDeposito = 0;
    let criticosCount = 0;
    let sumaMargenes = 0;
    let countConCosto = 0;
    let gananciaProyectada = 0;
    let costoReordenEstimado = 0;
    const proveedoresObjetivo = new Set();

    productos.forEach(p => {
        const stock = Math.max(0, Number(p.stock) || 0);
        const costo = Math.max(0, Number(p.precioCosto) || 0);
        const tieneOferta = Number(p.precioOferta) > 0 && Number(p.precioOferta) < Number(p.precioNormal);
        const venta = tieneOferta ? Number(p.precioOferta) : (Number(p.precioNormal) || 0);
        const umbral = obtenerUmbralProducto(p);

        valorizadoDeposito += stock * (costo > 0 ? costo : venta);

        if (costo > 0 && venta > 0) {
            sumaMargenes += ((venta - costo) / venta) * 100;
            countConCosto++;
            gananciaProyectada += Math.max(0, venta - costo) * stock;
        }

        if (stock <= umbral) {
            criticosCount++;
            const prov = (p.proveedor || 'Sin proveedor').trim();
            if (prov && prov.toLowerCase() !== 'sin proveedor') {
                proveedoresObjetivo.add(prov);
            }
            const faltanteSugerido = Math.max(1, Math.ceil((umbral * 2) - stock));
            costoReordenEstimado += faltanteSugerido * (costo > 0 ? costo : venta * 0.6);
        }
    });

    const margenProm = countConCosto > 0 ? (sumaMargenes / countConCosto).toFixed(1) : '0.0';
    const cantOrdenes = proveedoresObjetivo.size > 0 ? proveedoresObjetivo.size : (criticosCount > 0 ? 1 : 0);

    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

    setTxt('kpi-stock-total-skus', totalSkus.toLocaleString('es-AR'));
    setTxt('kpi-stock-valorizado', `${formatearMonedaArs(valorizadoDeposito)} ARS`);
    setTxt('kpi-stock-criticos', criticosCount.toLocaleString('es-AR'));
    setTxt('kpi-stock-margen', `${margenProm}%`);
    setTxt('kpi-stock-ganancia', `+${formatearMonedaArs(gananciaProyectada)} ARS`);
    setTxt('kpi-stock-ordenes', cantOrdenes.toLocaleString('es-AR'));
    setTxt('kpi-stock-provs-obj', proveedoresObjetivo.size > 0 ? Array.from(proveedoresObjetivo).join(', ') : 'Sin faltantes');

    setTxt('auto-orden-count', criticosCount.toLocaleString('es-AR'));
    setTxt('auto-orden-estimado', `${formatearMonedaArs(costoReordenEstimado)} ARS`);

    const kpiCardCritico = document.getElementById('kpi-card-critico');
    const kpiTag = document.getElementById('kpi-stock-critico-tag');
    if (kpiCardCritico) kpiCardCritico.classList.toggle('has-danger', criticosCount > 0);
    if (kpiTag) {
        kpiTag.textContent = criticosCount > 0 ? 'Urgente' : 'Saludable';
        kpiTag.classList.toggle('ok', criticosCount === 0);
    }
}

/* ==========================================================================
   DIRECTORIO LOGÍSTICO DE PROVEEDORES (SIN LÍMITE DE 6, CON SCROLL VERTICAL)
   ========================================================================== */
function renderizarDirectorioProveedoresStock() {
    const grid = document.getElementById('stock-providers-grid');
    const lblInfo = document.getElementById('stock-prov-criticos-info');
    if (!grid) return;

    const proveedores = obtenerProveedoresStock();
    const productos = obtenerProductosStock();

    if (lblInfo) {
        lblInfo.textContent = `${proveedores.length} ${proveedores.length === 1 ? 'proveedor registrado' : 'proveedores registrados'}`;
    }

    grid.innerHTML = proveedores.map(prov => {
        const asignados = productos.filter(p => (p.proveedor || '').toLowerCase() === prov.nombre.toLowerCase());
        const criticos = asignados.filter(p => (Number(p.stock) || 0) <= obtenerUmbralProducto(p)).length;

        const entregaLower = (prov.entrega || '').toLowerCase();
        const badgeClass = entregaLower.includes('24') ? 'fast' : (entregaLower.includes('48') ? 'med' : 'prog');

        return `
            <article class="stk-prov-card">
                <div class="stk-prov-top">
                    <span class="stk-delivery-badge ${badgeClass}">${escaparHtmlStock(prov.entrega || 'Programado')}</span>
                    <span class="dot-emerald" title="Activo">●</span>
                </div>
                <h4 class="stk-prov-name">${escaparHtmlStock(prov.nombre)}</h4>
                <span class="stk-prov-rubro">${escaparHtmlStock(prov.rubro || 'Proveedor General')}</span>
                <span class="stk-prov-phone">📞 ${escaparHtmlStock(prov.whatsapp || 'Sin WhatsApp cargado')}</span>
                <span class="stk-prov-meta">
                    ${asignados.length} ${asignados.length === 1 ? 'producto' : 'productos'}
                    ${criticos > 0 ? `• <strong class="text-danger">${criticos} bajo mínimo</strong>` : ''}
                </span>
                <div class="stk-prov-card-actions">
                    <button type="button" class="stk-prov-btn btn-stk-solicitar-prov" data-prov="${escaparHtmlStock(prov.nombre)}">
                        ➤ Solicitar Stock
                    </button>
                    <button type="button" class="stk-prov-edit-mini btn-stk-editar-prov" data-prov-id="${escaparHtmlStock(prov.id)}" title="Editar proveedor y sus productos">
                        ✏️
                    </button>
                </div>
            </article>
        `;
    }).join('');
}

/* ==========================================================================
   ETAPA 2: MODAL AGENDA DE PROVEEDORES Y ASIGNACIÓN DE PRODUCTOS
   ========================================================================== */
function abrirModalAgendaProveedores(provIdSeleccionado = null) {
    const modal = document.getElementById('modal-agenda-proveedores');
    if (!modal) return;

    const proveedores = obtenerProveedoresStock();
    window.stockState.provFiltroProductos = 'todos';
    window.stockState.provBusquedaProductos = '';

    const inpSearch = document.getElementById('prov-prod-search');
    if (inpSearch) inpSearch.value = '';

    document.querySelectorAll('.stk-mini-filter[data-pfilter]').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-pfilter') === 'todos');
    });

    if (provIdSeleccionado) {
        seleccionarProveedorEnAgenda(provIdSeleccionado);
    } else if (proveedores.length > 0) {
        seleccionarProveedorEnAgenda(proveedores[0].id);
    } else {
        prepararNuevoProveedorEnAgenda();
    }

    modal.classList.add('active');
}

function cerrarModalAgendaProveedores() {
    document.getElementById('modal-agenda-proveedores')?.classList.remove('active');
}

function renderizarListaLateralProveedores() {
    const cont = document.getElementById('stk-prov-list');
    if (!cont) return;

    const proveedores = obtenerProveedoresStock();
    const productos = obtenerProductosStock();
    const activoId = window.stockState.provEditandoId;

    if (proveedores.length === 0) {
        cont.innerHTML = `<div style="font-size:0.78rem; color:#64748b; text-align:center; padding:1rem;">Sin proveedores aún. Crea el primero arriba.</div>`;
        return;
    }

    cont.innerHTML = proveedores.map(pr => {
        const cant = productos.filter(p => (p.proveedor || '').toLowerCase() === pr.nombre.toLowerCase()).length;
        return `
            <button type="button" class="stk-prov-list-item ${String(pr.id) === String(activoId) ? 'active' : ''}" data-prov-id="${escaparHtmlStock(pr.id)}">
                <strong>${escaparHtmlStock(pr.nombre)}</strong>
                <span>${escaparHtmlStock(pr.rubro || 'General')} • ${cant} prod.</span>
            </button>
        `;
    }).join('');
}

function seleccionarProveedorEnAgenda(provId) {
    const prov = obtenerProveedoresStock().find(p => String(p.id) === String(provId));
    if (!prov) return prepararNuevoProveedorEnAgenda();

    window.stockState.provEditandoId = prov.id;

    document.getElementById('prov-editor-heading').textContent = `Editando: ${prov.nombre}`;
    document.getElementById('btn-prov-eliminar').style.display = 'inline-flex';
    document.getElementById('prov-nombre').value = prov.nombre || '';
    document.getElementById('prov-rubro').value = prov.rubro || '';
    document.getElementById('prov-whatsapp').value = prov.whatsapp || '';
    document.getElementById('prov-entrega').value = prov.entrega || 'Programado';
    document.getElementById('prov-alias').value = prov.alias || '';
    document.getElementById('prov-notas').value = prov.notas || '';

    const productos = obtenerProductosStock();
    window.stockState.provSeleccionProductos = new Set(
        productos
            .filter(p => (p.proveedor || '').toLowerCase() === prov.nombre.toLowerCase())
            .map(p => String(p.id))
    );

    renderizarListaLateralProveedores();
    renderizarChecklistAsignacionProductos();
}

function prepararNuevoProveedorEnAgenda() {
    window.stockState.provEditandoId = null;
    window.stockState.provSeleccionProductos = new Set();

    document.getElementById('prov-editor-heading').textContent = 'Nuevo Proveedor';
    document.getElementById('btn-prov-eliminar').style.display = 'none';
    document.getElementById('form-proveedor-agenda')?.reset();
    document.getElementById('prov-entrega').value = 'Entrega 24 hs';

    renderizarListaLateralProveedores();
    renderizarChecklistAsignacionProductos();
    document.getElementById('prov-nombre')?.focus();
}

function renderizarChecklistAsignacionProductos() {
    const cont = document.getElementById('prov-assign-list');
    const badge = document.getElementById('prov-assigned-count');
    if (!cont) return;

    const productos = obtenerProductosStock();
    const seleccion = window.stockState.provSeleccionProductos;
    const filtro = window.stockState.provFiltroProductos;
    const q = (window.stockState.provBusquedaProductos || '').trim().toLowerCase();

    const provActual = window.stockState.provEditandoId
        ? obtenerProveedoresStock().find(p => String(p.id) === String(window.stockState.provEditandoId))
        : null;
    const nombreProvActual = provActual ? provActual.nombre.toLowerCase() : '';

    if (badge) {
        badge.textContent = `${seleccion.size} ${seleccion.size === 1 ? 'seleccionado' : 'seleccionados'}`;
    }

    const filtrados = productos.filter(p => {
        const idStr = String(p.id);
        const estaMarcado = seleccion.has(idStr);
        const provProd = (p.proveedor || '').trim();
        const sinProv = !provProd || provProd.toLowerCase() === 'sin proveedor';

        if (filtro === 'asignados' && !estaMarcado) return false;
        if (filtro === 'libres' && !sinProv) return false;

        if (q) {
            const txt = `${p.nombre || ''} ${p.sku || ''} ${p.categoria || ''}`.toLowerCase();
            if (!txt.includes(q)) return false;
        }
        return true;
    });

    if (filtrados.length === 0) {
        cont.innerHTML = `<div style="font-size:0.78rem; color:#64748b; text-align:center; padding:1rem;">No hay productos para mostrar con este filtro.</div>`;
        return;
    }

    cont.innerHTML = filtrados.map(p => {
        const idStr = String(p.id);
        const checked = seleccion.has(idStr);
        const provProd = (p.proveedor || '').trim();
        const esOtroProv = provProd && provProd.toLowerCase() !== 'sin proveedor' && provProd.toLowerCase() !== nombreProvActual;
        const abrev = abrevUnidadStock(p.unidadMedida);
        const stockTxt = formatearCantidadStock(p.stock, p.familiaMedicion, p.unidadMedida);

        return `
            <label class="stk-assign-item ${checked ? 'checked' : ''}">
                <div class="stk-assign-left">
                    <input type="checkbox" class="chk-prov-assign" data-prod-id="${idStr}" ${checked ? 'checked' : ''}>
                    <div style="min-width:0;">
                        <div class="stk-assign-name">${escaparHtmlStock(p.nombre)}</div>
                        <div class="stk-assign-sub">${escaparHtmlStock(p.sku)} • ${escaparHtmlStock(p.categoria || 'General')} • Stock: ${stockTxt} ${escaparHtmlStock(abrev)}</div>
                    </div>
                </div>
                ${esOtroProv ? `<span class="stk-other-prov-tag" title="Actualmente asignado a otro proveedor">De: ${escaparHtmlStock(provProd)}</span>` : ''}
            </label>
        `;
    }).join('');
}

function guardarProveedorDesdeAgenda(e) {
    e.preventDefault();

    const nombre = document.getElementById('prov-nombre').value.trim();
    if (!nombre) {
        alert('Ingresa el nombre del proveedor.');
        return;
    }

    const rubro = document.getElementById('prov-rubro').value.trim() || 'General';
    const whatsapp = document.getElementById('prov-whatsapp').value.trim();
    const entrega = document.getElementById('prov-entrega').value;
    const alias = document.getElementById('prov-alias').value.trim();
    const notas = document.getElementById('prov-notas').value.trim();

    const proveedores = obtenerProveedoresStock();
    const editId = window.stockState.provEditandoId;

    const duplicado = proveedores.find(pr => pr.nombre.toLowerCase() === nombre.toLowerCase() && String(pr.id) !== String(editId));
    if (duplicado) {
        alert(`Ya existe un proveedor llamado "${duplicado.nombre}".`);
        return;
    }

    let nombreAnterior = '';
    let idGuardado = editId;

    if (editId) {
        const idx = proveedores.findIndex(pr => String(pr.id) === String(editId));
        if (idx !== -1) {
            nombreAnterior = proveedores[idx].nombre;
            proveedores[idx] = { ...proveedores[idx], nombre, rubro, whatsapp, entrega, alias, notas };
        }
    } else {
        idGuardado = 'prov-' + Date.now();
        proveedores.unshift({ id: idGuardado, nombre, rubro, whatsapp, entrega, alias, notas });
    }

    const productos = obtenerProductosStock();
    const seleccionados = window.stockState.provSeleccionProductos;

    productos.forEach(p => {
        const idStr = String(p.id);
        const eraDeEste = (p.proveedor || '').toLowerCase() === (nombreAnterior || nombre).toLowerCase();

        if (seleccionados.has(idStr)) {
            p.proveedor = nombre;
        } else if (eraDeEste) {
            p.proveedor = 'Sin proveedor';
        }
    });

    guardarProveedoresStock(proveedores);
    guardarProductosStock();
    renderizarTodoControlStock();
    seleccionarProveedorEnAgenda(idGuardado);
    alert(`✅ Proveedor "${nombre}" guardado con ${seleccionados.size} producto(s) asignado(s).`);
}

function eliminarProveedorActualAgenda() {
    const editId = window.stockState.provEditandoId;
    if (!editId) return;

    const proveedores = obtenerProveedoresStock();
    const actual = proveedores.find(pr => String(pr.id) === String(editId));
    if (!actual) return;

    if (!confirm(`¿Eliminar al proveedor "${actual.nombre}"? Sus productos quedarán como "Sin proveedor".`)) return;

    const restantes = proveedores.filter(pr => String(pr.id) !== String(editId));
    const productos = obtenerProductosStock();
    productos.forEach(p => {
        if ((p.proveedor || '').toLowerCase() === actual.nombre.toLowerCase()) {
            p.proveedor = 'Sin proveedor';
        }
    });

    guardarProveedoresStock(restantes);
    guardarProductosStock();
    renderizarTodoControlStock();

    if (restantes.length > 0) seleccionarProveedorEnAgenda(restantes[0].id);
    else prepararNuevoProveedorEnAgenda();
}

/* ==========================================================================
   ETAPA 3: GENERADOR DE PEDIDOS (WHATSAPP / PDF) Y PASO A "EN ESPERA"
   ========================================================================== */
function construirLineasCatalogoParaPedido() {
    const productos = obtenerProductosStock();
    const lineas = [];

    productos.forEach(p => {
        const umbral = obtenerUmbralProducto(p);
        const costoBase = Number(p.precioCosto) || 0;
        const tieneVariantes = Array.isArray(p.variantesDetalle) && p.variantesDetalle.length > 0;

        if (tieneVariantes) {
            p.variantesDetalle.forEach((v, vIdx) => {
                const stock = Number(v.stock) || 0;
                lineas.push({
                    key: `${p.id}::${vIdx}`,
                    prodId: p.id,
                    varIdx: vIdx,
                    nombre: `${p.nombre} (${v.nombre})`,
                    sku: v.sku || p.sku,
                    categoria: p.categoria || 'General',
                    proveedor: (p.proveedor || 'Sin proveedor').trim(),
                    unidadMedida: p.unidadMedida || 'Unidad',
                    familiaMedicion: p.familiaMedicion || 'variantes',
                    stock,
                    umbral,
                    costo: costoBase
                });
            });
        } else {
            const stock = Number(p.stock) || 0;
            lineas.push({
                key: `${p.id}::main`,
                prodId: p.id,
                varIdx: null,
                nombre: p.nombre,
                sku: p.sku,
                categoria: p.categoria || 'General',
                proveedor: (p.proveedor || 'Sin proveedor').trim(),
                unidadMedida: p.unidadMedida || 'Unidad',
                familiaMedicion: p.familiaMedicion || 'unidad',
                stock,
                umbral,
                costo: costoBase
            });
        }
    });

    return lineas;
}

function sugerirCantidadPedidoLinea(linea) {
    const objetivo = Math.max(linea.umbral * 2, linea.umbral + 1, 5);
    const faltante = Math.max(1, objetivo - linea.stock);
    if (linea.familiaMedicion === 'peso' || linea.familiaMedicion === 'longitud') {
        return Math.round(faltante * 1000) / 1000;
    }
    return Math.ceil(faltante);
}

function abrirModalPedidoProveedor(opciones = {}) {
    const modal = document.getElementById('modal-pedido-proveedor');
    if (!modal) return;

    const proveedores = obtenerProveedoresStock();
    const selProv = document.getElementById('ped-select-proveedor');
    if (!selProv) return;

    let provInicial = opciones.proveedor || '';

    if (opciones.prodId) {
        const prod = obtenerProductosStock().find(p => String(p.id) === String(opciones.prodId));
        if (prod && prod.proveedor && prod.proveedor.toLowerCase() !== 'sin proveedor') {
            provInicial = prod.proveedor;
        }
    }

    if (opciones.modoAuto && !provInicial) {
        const criticoConProv = obtenerProductosStock().find(p =>
            (Number(p.stock) || 0) <= obtenerUmbralProducto(p) &&
            p.proveedor && p.proveedor.toLowerCase() !== 'sin proveedor'
        );
        if (criticoConProv) provInicial = criticoConProv.proveedor;
    }

    if (!provInicial && proveedores.length > 0) {
        provInicial = proveedores[0].nombre;
    }

    let optsHtml = proveedores.map(pr =>
        `<option value="${escaparHtmlStock(pr.nombre)}">${escaparHtmlStock(pr.nombre)} (${escaparHtmlStock(pr.rubro || 'General')})</option>`
    ).join('');
    optsHtml += `<option value="__todos__">Todos los productos (Sin filtrar proveedor)</option>`;
    selProv.innerHTML = optsHtml;

    if (provInicial && Array.from(selProv.options).some(o => o.value === provInicial)) {
        selProv.value = provInicial;
    } else {
        selProv.value = '__todos__';
    }

    window.stockState.pedProveedorNombre = selProv.value;
    window.stockState.pedVerTodos = selProv.value === '__todos__';
    window.stockState.pedBusqueda = '';
    window.stockState.pedMensajeEditadoManual = false;
    window.stockState.pedItemsMap = new Map();

    const chkTodos = document.getElementById('ped-chk-ver-todos');
    if (chkTodos) chkTodos.checked = window.stockState.pedVerTodos;
    const inpBusc = document.getElementById('ped-buscar-item');
    if (inpBusc) inpBusc.value = '';
    const inpNota = document.getElementById('ped-nota-extra');
    if (inpNota) inpNota.value = '';

    const lineas = construirLineasCatalogoParaPedido();
    lineas.forEach(l => {
        const perteneceProv = window.stockState.pedProveedorNombre === '__todos__' ||
            l.proveedor.toLowerCase() === window.stockState.pedProveedorNombre.toLowerCase();
        const esCritico = l.stock <= l.umbral;

        let marcar = false;
        if (opciones.prodId && String(l.prodId) === String(opciones.prodId)) {
            marcar = true;
            if (!perteneceProv) {
                window.stockState.pedVerTodos = true;
                if (chkTodos) chkTodos.checked = true;
            }
        } else if (!opciones.prodId && perteneceProv && esCritico) {
            marcar = true;
        }

        window.stockState.pedItemsMap.set(l.key, {
            checked: marcar,
            cantidad: sugerirCantidadPedidoLinea(l),
            costo: l.costo
        });
    });

    renderizarListaItemsPedido();
    actualizarResumenYMensajePedido();
    modal.classList.add('active');
}

function cerrarModalPedidoProveedor() {
    document.getElementById('modal-pedido-proveedor')?.classList.remove('active');
}

function obtenerLineasVisiblesPedido() {
    const todas = construirLineasCatalogoParaPedido();
    const provSel = window.stockState.pedProveedorNombre;
    const verTodos = window.stockState.pedVerTodos || provSel === '__todos__';
    const q = (window.stockState.pedBusqueda || '').trim().toLowerCase();

    return todas.filter(l => {
        if (!verTodos && l.proveedor.toLowerCase() !== provSel.toLowerCase()) return false;
        if (q) {
            const txt = `${l.nombre} ${l.sku} ${l.categoria} ${l.proveedor}`.toLowerCase();
            if (!txt.includes(q)) return false;
        }
        return true;
    }).sort((a, b) => {
        const critA = a.stock <= a.umbral ? 0 : 1;
        const critB = b.stock <= b.umbral ? 0 : 1;
        if (critA !== critB) return critA - critB;
        return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    });
}

function renderizarListaItemsPedido() {
    const cont = document.getElementById('ped-items-list');
    if (!cont) return;

    const visibles = obtenerLineasVisiblesPedido();

    if (visibles.length === 0) {
        cont.innerHTML = `
            <div style="text-align:center; padding:2rem 1rem; color:#64748b; font-size:0.82rem;">
                Este proveedor todavía no tiene productos asignados.<br>
                Tilda <strong>"Mostrar también productos de otros proveedores"</strong> arriba o asígnalos desde <em>Agenda y Productos</em>.
            </div>
        `;
        return;
    }

    cont.innerHTML = visibles.map(l => {
        if (!window.stockState.pedItemsMap.has(l.key)) {
            window.stockState.pedItemsMap.set(l.key, {
                checked: false,
                cantidad: sugerirCantidadPedidoLinea(l),
                costo: l.costo
            });
        }
        const st = window.stockState.pedItemsMap.get(l.key);
        const abrev = abrevUnidadStock(l.unidadMedida);
        const estado = evaluarEstadoStock(l.stock, l.umbral);
        const stockTxt = formatearCantidadStock(l.stock, l.familiaMedicion, l.unidadMedida);
        const umbralTxt = formatearCantidadStock(l.umbral, l.familiaMedicion, l.unidadMedida);
        const stepCant = (l.familiaMedicion === 'peso' || l.familiaMedicion === 'longitud') ? '0.001' : '1';

        return `
            <div class="stk-ped-item-row ${st.checked ? 'selected' : ''}" data-line-key="${escaparHtmlStock(l.key)}">
                <input type="checkbox" class="ped-item-chk" ${st.checked ? 'checked' : ''}>
                <div class="stk-ped-item-info">
                    <div class="stk-ped-item-title">
                        <span>${escaparHtmlStock(l.nombre)}</span>
                        ${estado.tag ? `<span class="stk-tag-status ${estado.claseTag}">${estado.tag}</span>` : ''}
                    </div>
                    <div class="stk-ped-item-meta">
                        SKU: ${escaparHtmlStock(l.sku)} • Stock: <strong>${stockTxt} ${escaparHtmlStock(abrev)}</strong> (Mín: ${umbralTxt})
                    </div>
                </div>
                <div class="stk-ped-num-col">
                    <span>Cant. (${escaparHtmlStock(abrev)})</span>
                    <input type="number" class="stk-ped-num-input ped-item-cant" min="0.001" step="${stepCant}" value="${st.cantidad}">
                </div>
                <div class="stk-ped-num-col">
                    <span>Costo u. ($)</span>
                    <input type="number" class="stk-ped-num-input ped-item-costo" min="0" step="0.01" value="${st.costo}">
                </div>
            </div>
        `;
    }).join('');
}

function obtenerItemsSeleccionadosPedido() {
    const todas = construirLineasCatalogoParaPedido();
    const seleccionados = [];

    todas.forEach(l => {
        const st = window.stockState.pedItemsMap.get(l.key);
        if (st && st.checked && Number(st.cantidad) > 0) {
            const cant = Math.round(Number(st.cantidad) * 1000) / 1000;
            const costo = Math.max(0, Number(st.costo) || 0);
            seleccionados.push({
                ...l,
                cantidadPedida: cant,
                costoUnitario: costo,
                subtotal: Math.round(cant * costo * 100) / 100
            });
        }
    });

    return seleccionados;
}

function construirTextoMensajePedido(provObj, items, notaExtra = '') {
    if (!Array.isArray(items) || items.length === 0) {
        return 'Selecciona al menos 1 producto de la lista izquierda para generar el mensaje de pedido.';
    }

    // 1. Leer plantilla y opciones guardadas desde Ajustes
    let plantilla = '';
    let comercio = obtenerNombreComercioLocal();
    try {
        const sisCfg = JSON.parse(localStorage.getItem('cat_alogo_sistema_cfg_v1') || 'null');
        if (sisCfg?.plantillaProveedor && sisCfg.plantillaProveedor.trim()) {
            plantilla = sisCfg.plantillaProveedor;
        }
        if (sisCfg?.negocio?.nombre) comercio = sisCfg.negocio.nombre;
    } catch { /* fallback */ }

    if (!plantilla) {
        plantilla = 'Hola {PROVEEDOR}, te paso nuestro pedido de reposición desde *{COMERCIO}* ({FECHA}):\n\n{PRODUCTOS}\n\n¡Muchas gracias! Quedo a la espera de confirmación.';
    }

    let opts = { estiloLista: 'num', mostrarSku: true, negritaItems: true, mostrarSubtotal: false };
    try {
        const rawOpts = JSON.parse(localStorage.getItem('cat_alogo_plantilla_prov_opts_v1') || 'null');
        if (rawOpts && typeof rawOpts === 'object') opts = { ...opts, ...rawOpts };
    } catch { /* defaults */ }

    // 2. Formatear lista de productos según las preferencias elegidas
    const lineasProds = items.map((it, idx) => {
        const abrev = abrevUnidadStock(it.unidadMedida);
        const cantTxt = formatearCantidadStock(it.cantidadPedida, it.familiaMedicion, it.unidadMedida);
        const prefijo = opts.estiloLista === 'bullet' ? '• ' : (opts.estiloLista === 'dash' ? '- ' : `${idx + 1}. `);
        const nomFmt = opts.negritaItems ? `*${it.nombre}*` : it.nombre;
        const cantFmt = opts.negritaItems ? `*${cantTxt} ${abrev}*` : `${cantTxt} ${abrev}`;
        const skuTxt = (opts.mostrarSku && it.sku) ? ` (SKU: ${it.sku})` : '';
        const subTxt = (opts.mostrarSubtotal && Number(it.subtotal) > 0) ? ` [${formatearMonedaArs(it.subtotal)}]` : '';
        return `${prefijo}${nomFmt}${skuTxt} — ${cantFmt}${subTxt}`;
    }).join('\n');

    const nombreProv = provObj ? provObj.nombre : 'Proveedor';
    const ahora = new Date();
    const fechaHoy = ahora.toLocaleDateString('es-AR');
    const horaHoy = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const totalEstimado = items.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0);
    const notaLimpia = String(notaExtra || '').trim();

    // 3. Reemplazar variables ({VAR} y [VAR])
    const usaVarNota = /\{NOTA\}|\[NOTA\]/i.test(plantilla);
    const reemplazos = {
        PROVEEDOR: nombreProv,
        PRODUCTOS: lineasProds,
        COMERCIO: comercio,
        FECHA: fechaHoy,
        HORA: horaHoy,
        CANTIDAD_ITEMS: String(items.length),
        TOTAL_ESTIMADO: `${formatearMonedaArs(totalEstimado)} ARS`,
        NOTA: notaLimpia ? `📝 Nota: ${notaLimpia}` : ''
    };

    let msg = plantilla.replace(/[\{\[](PROVEEDOR|PRODUCTOS|COMERCIO|FECHA|HORA|CANTIDAD_ITEMS|TOTAL_ESTIMADO|NOTA)[\}\]]/gi, (_, key) => {
        return reemplazos[key.toUpperCase()] ?? '';
    });

    // Si hay nota adicional y la plantilla no incluía {NOTA}, la agregamos prolijamente al final
    if (notaLimpia && !usaVarNota) {
        msg = `${msg.trim()}\n\n📝 *Nota:* ${notaLimpia}`;
    }

    return msg.replace(/\n{3,}/g, '\n\n').trim();
}

function actualizarResumenYMensajePedido() {
    const provNombre = window.stockState.pedProveedorNombre;
    const provObj = obtenerProveedoresStock().find(p => p.nombre.toLowerCase() === String(provNombre || '').toLowerCase()) || null;
    const items = obtenerItemsSeleccionadosPedido();
    const totalEstimado = items.reduce((acc, it) => acc + it.subtotal, 0);

    const elWa = document.getElementById('ped-info-whatsapp');
    const elCount = document.getElementById('ped-info-items-count');
    const elTotal = document.getElementById('ped-info-total');

    if (elWa) elWa.textContent = (provObj && provObj.whatsapp) ? provObj.whatsapp : 'Sin número cargado';
    if (elCount) elCount.textContent = `${items.length} ${items.length === 1 ? 'ítem' : 'ítems'}`;
    if (elTotal) elTotal.textContent = `${formatearMonedaArs(totalEstimado)} ARS`;

    const textarea = document.getElementById('ped-mensaje-preview');
    const notaExtra = document.getElementById('ped-nota-extra')?.value || '';
    if (textarea && !window.stockState.pedMensajeEditadoManual) {
        textarea.value = construirTextoMensajePedido(provObj, items, notaExtra);
    }
}

function registrarPedidoEnEspera(canalSalida) {
    const items = obtenerItemsSeleccionadosPedido();
    if (items.length === 0) {
        alert('Selecciona al menos 1 producto con cantidad mayor a 0.');
        return null;
    }

    const provNombreSel = window.stockState.pedProveedorNombre;
    const provObj = obtenerProveedoresStock().find(p => p.nombre.toLowerCase() === String(provNombreSel || '').toLowerCase()) || null;
    const proveedorFinal = provObj ? provObj.nombre : (items[0].proveedor || 'Proveedor General');
    const notaExtra = document.getElementById('ped-nota-extra')?.value.trim() || '';
    const mensajeFinal = document.getElementById('ped-mensaje-preview')?.value.trim() || '';
    const totalEstimado = Math.round(items.reduce((acc, it) => acc + it.subtotal, 0) * 100) / 100;

    const pedidos = obtenerPedidosStock();
    const numeroOrden = `OC-${1001 + pedidos.length}`;

    const nuevoPedido = {
        id: 'ped-' + Date.now(),
        codigo: numeroOrden,
        fechaCreacion: new Date().toISOString(),
        proveedorId: provObj ? provObj.id : null,
        proveedorNombre: proveedorFinal,
        proveedorWhatsapp: provObj ? (provObj.whatsapp || '') : '',
        proveedorAlias: provObj ? (provObj.alias || '') : '',
        estado: 'en_espera',
        canal: canalSalida,
        nota: notaExtra,
        mensaje: mensajeFinal,
        totalEstimado,
        items: items.map(it => ({
            prodId: it.prodId,
            varIdx: it.varIdx,
            nombre: it.nombre,
            sku: it.sku,
            unidadMedida: it.unidadMedida,
            familiaMedicion: it.familiaMedicion,
            cantidadPedida: it.cantidadPedida,
            cantidadRecibida: it.cantidadPedida,
            costoUnitario: it.costoUnitario
        }))
    };

    pedidos.unshift(nuevoPedido);
    guardarPedidosStock(pedidos);
    return nuevoPedido;
}

function generarPdfOrdenCompra(pedido) {
    const jsPDFCtor = window.jspdf?.jsPDF;
    if (!jsPDFCtor) {
        alert('No se cargó la librería jsPDF. El pedido igual se guardó en estado "En Espera".');
        return;
    }

    const doc = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: 'a4' });
    const comercio = obtenerNombreComercioLocal();
    const fechaTxt = new Date(pedido.fechaCreacion).toLocaleString('es-AR');

    doc.setFillColor(4, 120, 87);
    doc.rect(0, 0, 210, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text('ORDEN DE COMPRA / PEDIDO', 14, 13);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${comercio}  •  ${pedido.codigo}`, 14, 21);
    doc.text(`Fecha: ${fechaTxt}`, 196, 21, { align: 'right' });

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Proveedor: ${pedido.proveedorNombre}`, 14, 39);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`WhatsApp: ${pedido.proveedorWhatsapp || 'No especificado'}`, 14, 45);
    doc.text(pedido.estado === 'recibido' ? 'Estado: RECIBIDO' : 'Estado: EN ESPERA DE RECEPCIÓN', 196, 39, { align: 'right' });

    let y = 55;
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y - 5, 182, 8, 'F');
    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('PRODUCTO', 16, y);
    doc.text('SKU', 105, y);
    doc.text('CANTIDAD', 140, y);
    doc.text('EST. SUBTOTAL', 194, y, { align: 'right' });

    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);

    pedido.items.forEach((it, idx) => {
        if (y > 268) {
            doc.addPage();
            y = 20;
        }
        const abrev = abrevUnidadStock(it.unidadMedida);
        const cantUsar = pedido.estado === 'recibido' ? (it.cantidadRecibida ?? it.cantidadPedida) : it.cantidadPedida;
        const cantTxt = `${formatearCantidadStock(cantUsar, it.familiaMedicion, it.unidadMedida)} ${abrev}`;
        const sub = Math.round(cantUsar * (Number(it.costoUnitario) || 0) * 100) / 100;

        const nombreCorto = it.nombre.length > 44 ? it.nombre.slice(0, 43) + '…' : it.nombre;
        doc.text(`${idx + 1}. ${nombreCorto}`, 16, y);
        doc.text(String(it.sku || ''), 105, y);
        doc.text(cantTxt, 140, y);
        doc.text(sub > 0 ? formatearMonedaArs(sub) : '—', 194, y, { align: 'right' });

        doc.setDrawColor(226, 232, 240);
        doc.line(14, y + 2.5, 196, y + 2.5);
        y += 8;
    });

    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(4, 120, 87);
    const totalPdf = pedido.pagoInfo?.totalGeneral ?? pedido.totalFinal ?? pedido.totalEstimado;
    doc.text(`Total: ${formatearMonedaArs(totalPdf)} ARS`, 194, y, { align: 'right' });

    if (pedido.nota) {
        y += 10;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text('Notas / Indicaciones:', 14, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const lineasNota = doc.splitTextToSize(pedido.nota, 180);
        doc.text(lineasNota, 14, y + 5);
    }

    const slugProv = pedido.proveedorNombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'proveedor';
    doc.save(`orden-${pedido.codigo.toLowerCase()}-${slugProv}.pdf`);
}

function despacharPedidoWhatsApp() {
    const pedido = registrarPedidoEnEspera('whatsapp');
    if (!pedido) return;

    const telLimpio = String(pedido.proveedorWhatsapp || '').replace(/[^\d]/g, '');
    const urlWa = telLimpio
        ? `https://wa.me/${telLimpio}?text=${encodeURIComponent(pedido.mensaje)}`
        : `https://wa.me/?text=${encodeURIComponent(pedido.mensaje)}`;

    window.open(urlWa, '_blank', 'noopener');
    cerrarModalPedidoProveedor();
    alert(`✅ Pedido ${pedido.codigo} registrado en estado "En Espera" (${pedido.items.length} ítems).\nCuando llegue la mercadería, recíbela desde "Recepción en Tránsito (F8)".`);
}

function despacharPedidoPdf() {
    const pedido = registrarPedidoEnEspera('pdf');
    if (!pedido) return;

    generarPdfOrdenCompra(pedido);
    cerrarModalPedidoProveedor();
    alert(`✅ Orden ${pedido.codigo} descargada en PDF y guardada en estado "En Espera".`);
}

function despacharPedidoSoloGuardar() {
    const pedido = registrarPedidoEnEspera('manual');
    if (!pedido) return;

    cerrarModalPedidoProveedor();
    alert(`⏳ Pedido ${pedido.codigo} guardado en estado "En Espera". Podrás recibirlo desde "Recepción en Tránsito (F8)".`);
}

/* ==========================================================================
   ETAPA 4: RECEPCIÓN EN TRÁNSITO (F8) + BUSCADOR, FILTROS, ORDEN Y PAGOS
   ========================================================================== */
function abrirModalRecepcionTransito(tabInicial = null) {
    const modal = document.getElementById('modal-recepcion-transito');
    if (!modal) return;

    const pedidos = obtenerPedidosStock();
    const hayEspera = pedidos.some(p => p.estado === 'en_espera');
    window.stockState.recTabActiva = tabInicial || (hayEspera ? 'en_espera' : 'recibido');
    window.stockState.recLimiteVisible = 25;

    document.querySelectorAll('.stk-rec-tab').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-rectab') === window.stockState.recTabActiva);
    });

    renderizarBandejaRecepcion();
    modal.classList.add('active');
}

function cerrarModalRecepcionTransito() {
    document.getElementById('modal-recepcion-transito')?.classList.remove('active');
}

function obtenerOrdenesFiltradasYOrdenadasRecepcion(listaBase) {
    const st = window.stockState;
    const q = (st.recBusqueda || '').trim().toLowerCase();
    const ahora = new Date();
    const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();

    const filtradas = listaBase.filter(ped => {
        // 1. Filtro por proveedor
        if (st.recFiltroProv !== 'todos') {
            if ((ped.proveedorNombre || '').toLowerCase() !== st.recFiltroProv.toLowerCase()) return false;
        }

        // 2. Filtro por estado de pago (solo en Recibidos / Historial)
        if (st.recTabActiva === 'recibido' && st.recFiltroPago !== 'todos') {
            const tienePago = !!ped.pagoInfo;
            const deuda = tienePago ? (Number(ped.pagoInfo.deudaPendiente) || 0) : 0;
            if (st.recFiltroPago === 'saldado' && !(tienePago && deuda <= 0)) return false;
            if (st.recFiltroPago === 'con_deuda' && !(tienePago && deuda > 0)) return false;
            if (st.recFiltroPago === 'sin_pago' && tienePago) return false;
        }

        // 3. Filtro por período de fecha
        if (st.recFiltroPeriodo !== 'todos') {
            const fechaRef = new Date(ped.fechaRecepcion || ped.fechaCreacion).getTime();
            if (st.recFiltroPeriodo === 'hoy' && fechaRef < inicioHoy) return false;
            if (st.recFiltroPeriodo === '7d' && (ahora.getTime() - fechaRef) > 7 * 86400000) return false;
            if (st.recFiltroPeriodo === '30d' && (ahora.getTime() - fechaRef) > 30 * 86400000) return false;
            if (st.recFiltroPeriodo === 'anio' && new Date(fechaRef).getFullYear() !== ahora.getFullYear()) return false;
        }

        // 4. Búsqueda multi-parámetro (orden, proveedor, productos, SKUs, factura, notas)
        if (q) {
            const itemsTxt = (ped.items || []).map(it => `${it.nombre || ''} ${it.sku || ''}`).join(' ');
            const pagoTxt = ped.pagoInfo ? `${ped.pagoInfo.comprobante || ''} ${ped.pagoInfo.medioPago || ''} ${ped.pagoInfo.notas || ''}` : '';
            const corpus = `${ped.codigo || ''} ${ped.proveedorNombre || ''} ${ped.nota || ''} ${itemsTxt} ${pagoTxt}`.toLowerCase();
            if (!corpus.includes(q)) return false;
        }

        return true;
    });

    // 5. Ordenamiento
    const montoOrden = (p) => Number(p.pagoInfo?.totalGeneral ?? p.totalFinal ?? p.totalEstimado) || 0;
    const deudaOrden = (p) => Number(p.pagoInfo?.deudaPendiente) || 0;
    const fechaOrden = (p) => new Date(p.fechaRecepcion || p.fechaCreacion).getTime() || 0;

    filtradas.sort((a, b) => {
        switch (st.recOrden) {
            case 'antiguos':
                return fechaOrden(a) - fechaOrden(b);
            case 'monto_desc':
                return montoOrden(b) - montoOrden(a);
            case 'monto_asc':
                return montoOrden(a) - montoOrden(b);
            case 'deuda_desc':
                return deudaOrden(b) - deudaOrden(a);
            case 'prov_asc':
                return String(a.proveedorNombre || '').localeCompare(String(b.proveedorNombre || ''), 'es', { sensitivity: 'base' });
            case 'recientes':
            default:
                return fechaOrden(b) - fechaOrden(a);
        }
    });

    return filtradas;
}

function renderizarBandejaRecepcion() {
    const st = window.stockState;
    const pedidos = obtenerPedidosStock();
    const enEspera = pedidos.filter(p => p.estado === 'en_espera');
    const recibidos = pedidos.filter(p => p.estado === 'recibido');

    const elCE = document.getElementById('rec-tab-count-espera');
    const elCR = document.getElementById('rec-tab-count-recibidos');
    if (elCE) elCE.textContent = enEspera.length;
    if (elCR) elCR.textContent = recibidos.length;

    const listaBase = st.recTabActiva === 'en_espera' ? enEspera : recibidos;

    // Mostrar u ocultar controles exclusivos de Historial
    const selPago = document.getElementById('rec-filter-pago');
    if (selPago) selPago.style.display = st.recTabActiva === 'recibido' ? '' : 'none';

    const btnLimpiarSaldados = document.getElementById('btn-rec-limpiar-saldados');
    const cantSaldados = recibidos.filter(p => p.pagoInfo && (Number(p.pagoInfo.deudaPendiente) || 0) <= 0).length;
    if (btnLimpiarSaldados) {
        btnLimpiarSaldados.style.display = (st.recTabActiva === 'recibido' && cantSaldados > 0) ? 'inline-flex' : 'none';
        btnLimpiarSaldados.textContent = `🧹 Limpiar saldados (${cantSaldados})`;
    }

    // Poblar selector de proveedores según las órdenes de la pestaña actual
    const selProv = document.getElementById('rec-filter-prov');
    if (selProv) {
        const provsUnicos = Array.from(new Set(listaBase.map(p => (p.proveedorNombre || '').trim()).filter(Boolean)))
            .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

        let opts = `<option value="todos">Todos los proveedores (${provsUnicos.length})</option>`;
        provsUnicos.forEach(pr => {
            opts += `<option value="${escaparHtmlStock(pr)}">${escaparHtmlStock(pr)}</option>`;
        });
        selProv.innerHTML = opts;
        if (st.recFiltroProv !== 'todos' && provsUnicos.some(p => p.toLowerCase() === st.recFiltroProv.toLowerCase())) {
            selProv.value = st.recFiltroProv;
        } else {
            st.recFiltroProv = 'todos';
            selProv.value = 'todos';
        }
    }

    // Mostrar botón de limpiar filtros si hay alguno activo
    const hayFiltros = !!(st.recBusqueda.trim() || st.recFiltroProv !== 'todos' || (st.recTabActiva === 'recibido' && st.recFiltroPago !== 'todos') || st.recFiltroPeriodo !== 'todos' || st.recOrden !== 'recientes');
    const btnClear = document.getElementById('btn-rec-clear-filters');
    if (btnClear) btnClear.style.display = hayFiltros ? 'inline-flex' : 'none';

    const listaFiltrada = obtenerOrdenesFiltradasYOrdenadasRecepcion(listaBase);

    // Resumen superior
    const elSummary = document.getElementById('rec-filter-summary');
    if (elSummary) {
        const deudaFiltrada = listaFiltrada.reduce((acc, p) => acc + (Number(p.pagoInfo?.deudaPendiente) || 0), 0);
        const txtDeuda = (st.recTabActiva === 'recibido' && deudaFiltrada > 0)
            ? ` • Deuda: ${formatearMonedaArs(deudaFiltrada)}`
            : '';
        elSummary.textContent = `${listaFiltrada.length} de ${listaBase.length} ${listaBase.length === 1 ? 'orden' : 'órdenes'}${txtDeuda}`;
    }

    const sidebar = document.getElementById('rec-orders-list');
    const detail = document.getElementById('rec-order-detail');
    if (!sidebar || !detail) return;

    if (listaFiltrada.length === 0) {
        st.recPedidoActivoId = null;
        sidebar.innerHTML = `<div style="text-align:center; color:#64748b; font-size:0.8rem; padding:1.5rem 0.5rem;">Sin coincidencias.</div>`;
        detail.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#64748b; padding:2rem; text-align:center; gap:0.4rem;">
                <div style="font-size:2.2rem;">${hayFiltros ? '🔍' : '🚚'}</div>
                <strong>${hayFiltros ? 'Ninguna orden coincide con los filtros' : (st.recTabActiva === 'en_espera' ? 'No tienes pedidos pendientes de recepción' : 'Todavía no recibiste pedidos')}</strong>
                <span style="font-size:0.8rem;">${hayFiltros ? 'Prueba limpiar la búsqueda o cambiar los filtros superiores.' : 'Genera una orden a un proveedor desde Control de Stock para verla aquí.'}</span>
            </div>
        `;
        return;
    }

    if (!listaFiltrada.some(p => p.id === st.recPedidoActivoId)) {
        st.recPedidoActivoId = listaFiltrada[0].id;
    }

    // Carga progresiva para soportar 1.000+ registros sin lag
    const visibles = listaFiltrada.slice(0, st.recLimiteVisible);
    const restantes = listaFiltrada.length - visibles.length;

    let cardsHtml = visibles.map(ped => {
        const fechaTxt = new Date(ped.fechaRecepcion || ped.fechaCreacion).toLocaleDateString('es-AR');
        let badgeHtml = `<span class="stk-rec-badge espera">⏳ En Espera</span>`;
        if (ped.estado === 'recibido') {
            if (!ped.pagoInfo) {
                badgeHtml = `<span class="stk-rec-badge sinpago">💳 Pago Pendiente</span>`;
            } else if (Number(ped.pagoInfo.deudaPendiente) > 0) {
                badgeHtml = `<span class="stk-rec-badge deuda">Saldo: ${formatearMonedaArs(ped.pagoInfo.deudaPendiente)}</span>`;
            } else {
                badgeHtml = `<span class="stk-rec-badge pagado">✅ Saldado</span>`;
            }
        }

        const totalMostrar = ped.pagoInfo?.totalGeneral ?? ped.totalFinal ?? ped.totalEstimado;
        return `
            <button type="button" class="stk-rec-order-card ${ped.id === st.recPedidoActivoId ? 'active' : ''}" data-ped-id="${escaparHtmlStock(ped.id)}">
                <div class="stk-rec-order-top">
                    <strong>${escaparHtmlStock(ped.codigo)}</strong>
                    ${badgeHtml}
                </div>
                <div class="stk-rec-order-prov">${escaparHtmlStock(ped.proveedorNombre)}</div>
                <div class="stk-rec-order-meta">${fechaTxt} • ${ped.items.length} ítems • ${formatearMonedaArs(totalMostrar)}</div>
            </button>
        `;
    }).join('');

    if (restantes > 0) {
        cardsHtml += `
            <button type="button" class="stk-rec-load-more" id="btn-rec-cargar-mas">
                ⬇️ Cargar más órdenes (quedan ${restantes})
            </button>
        `;
    }

    sidebar.innerHTML = cardsHtml;

    const pedidoSel = listaFiltrada.find(p => p.id === st.recPedidoActivoId);
    renderizarDetalleOrdenRecepcion(pedidoSel);
}

function renderizarDetalleOrdenRecepcion(pedido) {
    const detail = document.getElementById('rec-order-detail');
    if (!detail || !pedido) return;

    const esEspera = pedido.estado === 'en_espera';
    const tienePago = !!pedido.pagoInfo;
    const deudaActual = tienePago ? (Number(pedido.pagoInfo.deudaPendiente) || 0) : 0;
    const estaSaldado = !esEspera && tienePago && deudaActual <= 0;
    const tieneDeuda = !esEspera && tienePago && deudaActual > 0;

    const fechaTxt = new Date(pedido.fechaCreacion).toLocaleString('es-AR');
    const fechaRecTxt = pedido.fechaRecepcion ? new Date(pedido.fechaRecepcion).toLocaleString('es-AR') : '';

    const filasHtml = pedido.items.map((it, idx) => {
        const abrev = abrevUnidadStock(it.unidadMedida);
        const pedTxt = formatearCantidadStock(it.cantidadPedida, it.familiaMedicion, it.unidadMedida);
        const recVal = it.cantidadRecibida ?? it.cantidadPedida;
        const costoVal = Number(it.costoUnitario) || 0;
        const sub = Math.round(recVal * costoVal * 100) / 100;
        const stepCant = (it.familiaMedicion === 'peso' || it.familiaMedicion === 'longitud') ? '0.001' : '1';

        return `
            <tr data-rec-idx="${idx}">
                <td>
                    <strong>${escaparHtmlStock(it.nombre)}</strong>
                    <div style="font-size:0.7rem; color:#64748b;">SKU: ${escaparHtmlStock(it.sku)}</div>
                </td>
                <td>${pedTxt} ${escaparHtmlStock(abrev)}</td>
                <td>
                    ${esEspera
                        ? `<input type="number" class="stk-ped-num-input rec-inp-cant" min="0" step="${stepCant}" value="${recVal}" style="width:88px;">`
                        : `<strong>${formatearCantidadStock(recVal, it.familiaMedicion, it.unidadMedida)} ${escaparHtmlStock(abrev)}</strong>`
                    }
                </td>
                <td>
                    ${esEspera
                        ? `<input type="number" class="stk-ped-num-input rec-inp-costo" min="0" step="0.01" value="${costoVal}" style="width:96px;">`
                        : `${formatearMonedaArs(costoVal)}`
                    }
                </td>
                <td style="text-align:right; font-weight:700;" class="rec-row-sub">${formatearMonedaArs(sub)}</td>
            </tr>
        `;
    }).join('');

    const subtotalInicial = Math.round(pedido.items.reduce((acc, it) => acc + ((it.cantidadRecibida ?? it.cantidadPedida) * (Number(it.costoUnitario) || 0)), 0) * 100) / 100;

    let bloquePagoHistorial = '';
    if (!esEspera && pedido.pagoInfo) {
        const pi = pedido.pagoInfo;
        bloquePagoHistorial = `
            <div class="stk-rec-paid-summary">
                <div>
                    <span>Mercadería + Envío</span>
                    <strong>${formatearMonedaArs(pi.subtotalMercaderia)} + ${formatearMonedaArs(pi.costoEnvio)}</strong>
                </div>
                <div>
                    <span>Entregado (${escaparHtmlStock(pi.medioPago)})</span>
                    <strong class="text-emerald">${formatearMonedaArs(pi.montoEntregado)}</strong>
                </div>
                <div>
                    <span>Deuda en Finanzas</span>
                    <strong class="${pi.deudaPendiente > 0 ? 'text-danger' : 'text-emerald'}">${formatearMonedaArs(pi.deudaPendiente)}</strong>
                </div>
            </div>
        `;
    }

    let botonesFooterHtml = '';
    if (esEspera) {
        botonesFooterHtml = `
            <button type="button" class="stk-row-btn btn-danger-outline" id="btn-rec-cancelar-orden">🗑️ Cancelar Orden</button>
            <button type="button" class="stk-btn stk-btn-primary" id="btn-rec-confirmar-stock">
                ✅ Recibir Mercadería y Pasar a Pago
            </button>
        `;
    } else if (!tienePago) {
        botonesFooterHtml = `
            <span class="stk-lock-deuda-note">🔒 Pago sin registrar — No eliminable</span>
            <button type="button" class="stk-btn stk-btn-primary" id="btn-rec-abrir-pago">
                💳 Registrar Pago y Envío
            </button>
        `;
    } else if (tieneDeuda) {
        botonesFooterHtml = `
            <span class="stk-lock-deuda-note" title="Cancela el saldo pendiente desde Finanzas para habilitar la eliminación">
                🔒 Con deuda pendiente (${formatearMonedaArs(deudaActual)}) — No eliminable
            </span>
        `;
    } else if (estaSaldado) {
        botonesFooterHtml = `
            <button type="button" class="stk-row-btn btn-danger-outline" id="btn-rec-eliminar-historial">
                🗑️ Eliminar del Historial
            </button>
        `;
    }

    detail.innerHTML = `
        <div class="stk-rec-detail-scroll">
            <div class="stk-rec-head-card">
                <div>
                    <h4>${escaparHtmlStock(pedido.codigo)} • ${escaparHtmlStock(pedido.proveedorNombre)}</h4>
                    <p>Creado: ${fechaTxt}${fechaRecTxt ? ` • Recibido: ${fechaRecTxt}` : ''}</p>
                </div>
                <button type="button" class="stk-row-btn" id="btn-rec-descargar-pdf">📄 Ver PDF</button>
            </div>

            ${bloquePagoHistorial}

            <div style="overflow-x:auto;">
                <table class="stk-rec-items-table">
                    <thead>
                        <tr>
                            <th>PRODUCTO</th>
                            <th>PEDIDO</th>
                            <th>RECIBIDO REAL</th>
                            <th>COSTO UNIT. ($)</th>
                            <th style="text-align:right;">SUBTOTAL</th>
                        </tr>
                    </thead>
                    <tbody id="rec-items-tbody">
                        ${filasHtml}
                    </tbody>
                </table>
            </div>

            ${esEspera ? `
                <label class="stk-check-inline" style="margin-top:0.25rem;">
                    <input type="checkbox" id="rec-chk-actualizar-costos" checked>
                    <span>Actualizar también el <strong>Precio de Costo</strong> en Inventario si cambió en la factura</span>
                </label>
            ` : ''}
        </div>

        <footer class="stk-rec-footer">
            <div class="stk-rec-total-wrap">
                <span>Subtotal mercadería recibida</span>
                <strong id="rec-subtotal-live">${formatearMonedaArs(subtotalInicial)} ARS</strong>
            </div>
            <div class="stk-rec-footer-btns">
                ${botonesFooterHtml}
            </div>
        </footer>
    `;

    // Eventos dinámicos del detalle
    document.getElementById('btn-rec-descargar-pdf')?.addEventListener('click', () => generarPdfOrdenCompra(pedido));

    if (esEspera) {
        document.getElementById('rec-items-tbody')?.addEventListener('input', () => {
            let suma = 0;
            document.querySelectorAll('#rec-items-tbody tr').forEach(tr => {
                const cant = Math.max(0, parseFloat(tr.querySelector('.rec-inp-cant')?.value) || 0);
                const costo = Math.max(0, parseFloat(tr.querySelector('.rec-inp-costo')?.value) || 0);
                const sub = Math.round(cant * costo * 100) / 100;
                suma += sub;
                const cell = tr.querySelector('.rec-row-sub');
                if (cell) cell.textContent = formatearMonedaArs(sub);
            });
            const elSub = document.getElementById('rec-subtotal-live');
            if (elSub) elSub.textContent = `${formatearMonedaArs(Math.round(suma * 100) / 100)} ARS`;
        });

        document.getElementById('btn-rec-cancelar-orden')?.addEventListener('click', () => {
            if (!confirm(`¿Cancelar y eliminar la orden ${pedido.codigo} en espera?`)) return;
            const restantes = obtenerPedidosStock().filter(p => p.id !== pedido.id);
            guardarPedidosStock(restantes);
            renderizarBandejaRecepcion();
        });

        document.getElementById('btn-rec-confirmar-stock')?.addEventListener('click', () => {
            confirmarRecepcionMercaderia(pedido.id);
        });
    } else if (!tienePago) {
        document.getElementById('btn-rec-abrir-pago')?.addEventListener('click', () => {
            abrirModalPagoPedido(pedido.id);
        });
    } else if (estaSaldado) {
        document.getElementById('btn-rec-eliminar-historial')?.addEventListener('click', () => {
            if (!confirm(`¿Eliminar la orden saldada ${pedido.codigo} (${pedido.proveedorNombre}) del historial?\n\nEl stock de tus productos no se verá afectado.`)) return;
            const restantes = obtenerPedidosStock().filter(p => p.id !== pedido.id);
            guardarPedidosStock(restantes);
            window.stockState.recPedidoActivoId = null;
            renderizarBandejaRecepcion();
        });
    }
}

function confirmarRecepcionMercaderia(pedidoId) {
    const pedidos = obtenerPedidosStock();
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido || pedido.estado !== 'en_espera') return;

    const actualizarCostos = document.getElementById('rec-chk-actualizar-costos')?.checked !== false;
    const filas = Array.from(document.querySelectorAll('#rec-items-tbody tr'));
    const productos = obtenerProductosStock();

    let subtotalFinal = 0;

    filas.forEach(tr => {
        const idx = parseInt(tr.getAttribute('data-rec-idx'), 10);
        const item = pedido.items[idx];
        if (!item) return;

        const cantRec = Math.round(Math.max(0, parseFloat(tr.querySelector('.rec-inp-cant')?.value) || 0) * 1000) / 1000;
        const costoReal = Math.max(0, parseFloat(tr.querySelector('.rec-inp-costo')?.value) || 0);

        item.cantidadRecibida = cantRec;
        item.costoUnitario = costoReal;
        subtotalFinal += cantRec * costoReal;

        // Sumar automáticamente al stock real en la Bóveda Local
        const prod = productos.find(p => String(p.id) === String(item.prodId));
        if (prod && cantRec > 0) {
            if (item.varIdx !== null && item.varIdx !== undefined && Array.isArray(prod.variantesDetalle) && prod.variantesDetalle[item.varIdx]) {
                const actualVar = Number(prod.variantesDetalle[item.varIdx].stock) || 0;
                prod.variantesDetalle[item.varIdx].stock = Math.round((actualVar + cantRec) * 1000) / 1000;
                prod.stock = Math.round(prod.variantesDetalle.reduce((acc, v) => acc + (Number(v.stock) || 0), 0) * 1000) / 1000;
            } else {
                const actual = Number(prod.stock) || 0;
                prod.stock = Math.round((actual + cantRec) * 1000) / 1000;
            }

            if (actualizarCostos && costoReal > 0) {
                prod.precioCosto = costoReal;
            }
            prod.actualizadoEn = new Date().toISOString();
        }
    });

    pedido.estado = 'recibido';
    pedido.fechaRecepcion = new Date().toISOString();
    pedido.totalFinal = Math.round(subtotalFinal * 100) / 100;

    guardarProductosStock();
    guardarPedidosStock(pedidos);
    renderizarTodoControlStock();
    cerrarModalRecepcionTransito();

    // Abre automáticamente la ventana de pago para completar envío, entrega y deuda
    abrirModalPagoPedido(pedido.id);
}

/* ==========================================================================
   VENTANA DE PAGO (PAGO ÚNICO / DIVIDIDO, ENVÍO Y DEUDA PARA FINANZAS)
   ========================================================================== */
/* ==========================================================================
   VENTANA DE PAGO (SUBTOTAL AUTO/MANUAL, PAGO ÚNICO / DIVIDIDO, ENVÍO Y DEUDA)
   ========================================================================== */
function abrirModalPagoPedido(pedidoId) {
    const pedido = obtenerPedidosStock().find(p => p.id === pedidoId);
    if (!pedido) return;

    window.stockState.pagoPedidoId = pedido.id;
    const subtotalCalculado = Math.round((Number(pedido.totalFinal ?? pedido.totalEstimado) || 0) * 100) / 100;
    window.stockState.pagoSubtotalCalculado = subtotalCalculado;

    document.getElementById('modal-pago-sub').textContent = `${pedido.codigo} • ${pedido.proveedorNombre}`;

    const inpSub = document.getElementById('pago-subtotal-input');
    if (inpSub) inpSub.value = subtotalCalculado;

    const aliasBox = document.getElementById('pago-alias-box');
    const aliasVal = document.getElementById('pago-alias-val');
    if (aliasBox && aliasVal) {
        if (pedido.proveedorAlias) {
            aliasVal.textContent = pedido.proveedorAlias;
            aliasBox.style.display = 'flex';
        } else {
            aliasBox.style.display = 'none';
        }
    }

    document.getElementById('pago-costo-envio').value = '0';
    document.getElementById('pago-comprobante').value = '';
    document.getElementById('pago-notas').value = '';
    document.getElementById('pago-medio').value = 'Efectivo';

    const radioUnico = document.querySelector('input[name="pago-modalidad"][value="unico"]');
    if (radioUnico) radioUnico.checked = true;
    document.getElementById('lbl-modo-unico')?.classList.add('active');
    document.getElementById('lbl-modo-dividido')?.classList.remove('active');

    const inpEntregado = document.getElementById('pago-monto-entregado');
    inpEntregado.value = subtotalCalculado;
    inpEntregado.readOnly = true;

    recalcularResumenPagoPedido();
    document.getElementById('modal-pago-pedido')?.classList.add('active');

    // Si el pedido viene en $0 (sin costos cargados), enfocar directo el campo de mercadería
    if (subtotalCalculado <= 0 && inpSub) {
        setTimeout(() => { inpSub.focus(); inpSub.select(); }, 80);
    }
}

function cerrarModalPagoPedido() {
    document.getElementById('modal-pago-pedido')?.classList.remove('active');
    window.stockState.pagoPedidoId = null;
}

function recalcularResumenPagoPedido() {
    const pedido = obtenerPedidosStock().find(p => p.id === window.stockState.pagoPedidoId);
    if (!pedido) return;

    const subtotalCalculado = Number(window.stockState.pagoSubtotalCalculado ?? pedido.totalFinal ?? pedido.totalEstimado) || 0;
    const inpSub = document.getElementById('pago-subtotal-input');
    const subtotal = Math.round(Math.max(0, parseFloat(inpSub?.value) || 0) * 100) / 100;
    const envio = Math.round(Math.max(0, parseFloat(document.getElementById('pago-costo-envio')?.value) || 0) * 100) / 100;
    const totalGeneral = Math.round((subtotal + envio) * 100) / 100;

    // Indicador de diferencia vs. catálogo y botón de restaurar
    const diff = Math.round((subtotal - subtotalCalculado) * 100) / 100;
    const elHintSub = document.getElementById('pago-subtotal-hint');
    const btnRestaurar = document.getElementById('btn-pago-restaurar-sub');
    if (elHintSub) {
        if (subtotalCalculado <= 0) {
            elHintSub.textContent = subtotal > 0
                ? 'Monto manual de factura aplicado'
                : 'Sin costos en catálogo — ingresa el monto real de factura';
            elHintSub.style.color = subtotal > 0 ? '#047857' : '#b45309';
        } else if (Math.abs(diff) >= 0.01) {
            const signo = diff > 0 ? '+' : '-';
            elHintSub.textContent = `Catálogo: ${formatearMonedaArs(subtotalCalculado)} • Dif: ${signo}${formatearMonedaArs(Math.abs(diff))}`;
            elHintSub.style.color = '#b45309';
        } else {
            elHintSub.textContent = `Calculado por catálogo: ${formatearMonedaArs(subtotalCalculado)} ARS`;
            elHintSub.style.color = '#64748b';
        }
    }
    if (btnRestaurar) {
        btnRestaurar.style.display = (subtotalCalculado > 0 && Math.abs(diff) >= 0.01) ? 'inline-flex' : 'none';
    }

    const modalidad = document.querySelector('input[name="pago-modalidad"]:checked')?.value || 'unico';
    const inpEntregado = document.getElementById('pago-monto-entregado');

    if (modalidad === 'unico') {
        inpEntregado.value = totalGeneral;
        inpEntregado.readOnly = true;
    } else {
        inpEntregado.readOnly = false;
    }

    const entregado = Math.min(totalGeneral, Math.max(0, parseFloat(inpEntregado.value) || 0));
    const deuda = Math.round(Math.max(0, totalGeneral - entregado) * 100) / 100;

    document.getElementById('pago-total-general').textContent = `${formatearMonedaArs(totalGeneral)} ARS`;
    document.getElementById('pago-deuda-val').textContent = `${formatearMonedaArs(deuda)} ARS`;

    const boxDeuda = document.getElementById('pago-deuda-box');
    const lblHint = document.getElementById('pago-deuda-hint');
    if (boxDeuda) boxDeuda.classList.toggle('has-deuda', deuda > 0);
    if (lblHint) {
        lblHint.textContent = deuda > 0
            ? 'Este saldo quedará guardado en Cuentas por Pagar para cancelarlo desde Finanzas.'
            : 'Sin saldo pendiente. El pedido quedará marcado como saldado.';
    }
}

function guardarPagoPedidoFormulario(e) {
    e.preventDefault();

    const pedidos = obtenerPedidosStock();
    const pedido = pedidos.find(p => p.id === window.stockState.pagoPedidoId);
    if (!pedido) return;

    const subtotalCalculado = Number(window.stockState.pagoSubtotalCalculado ?? pedido.totalFinal ?? pedido.totalEstimado) || 0;
    const subtotal = Math.round(Math.max(0, parseFloat(document.getElementById('pago-subtotal-input')?.value) || 0) * 100) / 100;
    const costoEnvio = Math.round(Math.max(0, parseFloat(document.getElementById('pago-costo-envio')?.value) || 0) * 100) / 100;
    const totalGeneral = Math.round((subtotal + costoEnvio) * 100) / 100;

    if (totalGeneral <= 0) {
        alert('Ingresa el costo real de la mercadería o del envío antes de confirmar el pago.');
        document.getElementById('pago-subtotal-input')?.focus();
        return;
    }

    const modalidad = document.querySelector('input[name="pago-modalidad"]:checked')?.value || 'unico';
    const montoEntregado = modalidad === 'unico'
        ? totalGeneral
        : Math.min(totalGeneral, Math.max(0, parseFloat(document.getElementById('pago-monto-entregado')?.value) || 0));
    const deudaPendiente = Math.round(Math.max(0, totalGeneral - montoEntregado) * 100) / 100;
    const medioPago = document.getElementById('pago-medio')?.value || 'Efectivo';
    const comprobante = document.getElementById('pago-comprobante')?.value.trim() || '';
    const notas = document.getElementById('pago-notas')?.value.trim() || '';
    const fechaIso = new Date().toISOString();

    const registroFinanzas = {
        id: 'cxp-' + Date.now(),
        pedidoId: pedido.id,
        codigoOrden: pedido.codigo,
        fecha: fechaIso,
        proveedorId: pedido.proveedorId || null,
        proveedorNombre: pedido.proveedorNombre,
        proveedorAlias: pedido.proveedorAlias || '',
        costoMercaderia: subtotal,
        subtotalMercaderia: subtotal,
        subtotalCalculadoCatalogo: subtotalCalculado,
        costoEnvio,
        totalGeneral,
        modalidadPago: modalidad,
        montoEntregado,
        deudaPendiente,
        medioPago,
        comprobante,
        notas,
        estado: deudaPendiente > 0 ? 'pendiente' : 'pagado',
        pagos: montoEntregado > 0
            ? [{ id: 'pg-' + Date.now(), fecha: fechaIso, monto: montoEntregado, medio: medioPago, nota: 'Pago en recepción de mercadería' }]
            : []
    };

    const cuentas = obtenerCuentasPagarStock();
    cuentas.unshift(registroFinanzas);
    guardarCuentasPagarStock(cuentas);

    pedido.totalFinal = subtotal;
    pedido.pagoInfo = {
        cuentaPagarId: registroFinanzas.id,
        subtotalMercaderia: subtotal,
        subtotalCalculadoCatalogo: subtotalCalculado,
        costoEnvio,
        totalGeneral,
        modalidadPago: modalidad,
        montoEntregado,
        deudaPendiente,
        medioPago,
        comprobante,
        notas,
        fechaPago: fechaIso
    };
    guardarPedidosStock(pedidos);

    cerrarModalPagoPedido();

    // Refrescar historial de recepción si quedó abierto detrás
    const modalRec = document.getElementById('modal-recepcion-transito');
    if (modalRec && modalRec.classList.contains('active')) {
        renderizarBandejaRecepcion();
    }

    const msgDeuda = deudaPendiente > 0
        ? `\n📌 Saldo pendiente de ${formatearMonedaArs(deudaPendiente)} ARS registrado para Finanzas.`
        : '\n✅ Orden saldada en su totalidad.';

    alert(`✅ Stock actualizado y pago registrado por ${formatearMonedaArs(totalGeneral)} ARS para ${pedido.codigo} (${pedido.proveedorNombre}).${msgDeuda}`);
}

/* ==========================================================================
   FILTROS Y TABLA OPERATIVA DE STOCK
   ========================================================================== */
function renderizarFiltrosControlStock() {
    const cont = document.getElementById('stock-filter-chips');
    if (!cont) return;

    const productos = obtenerProductosStock();
    const criticosCount = productos.filter(p => (Number(p.stock) || 0) <= obtenerUmbralProducto(p)).length;

    const categoriasMap = {};
    productos.forEach(p => {
        const cat = (p.categoria || 'General').trim() || 'General';
        categoriasMap[cat] = (categoriasMap[cat] || 0) + 1;
    });

    const categorias = Object.keys(categoriasMap).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    const activo = window.stockState.filtroActivo;

    let html = `
        <button type="button" class="stk-chip ${activo === 'todos' ? 'active' : ''}" data-filter="todos">
            Todos (${productos.length})
        </button>
    `;

    categorias.slice(0, 5).forEach(cat => {
        const key = `cat:${cat.toLowerCase()}`;
        html += `
            <button type="button" class="stk-chip ${activo === key ? 'active' : ''}" data-filter="${escaparHtmlStock(key)}">
                ${escaparHtmlStock(cat)} (${categoriasMap[cat]})
            </button>
        `;
    });

    html += `
        <button type="button" class="stk-chip chip-critico ${activo === 'criticos' ? 'active' : ''}" data-filter="criticos">
            ! Solo Stock Crítico (${criticosCount})
        </button>
    `;

    cont.innerHTML = html;

    cont.querySelectorAll('.stk-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            window.stockState.filtroActivo = btn.getAttribute('data-filter');
            window.stockState.paginaActual = 1;
            renderizarFiltrosControlStock();
            renderizarTablaControlStock();
        });
    });
}

function renderizarTablaControlStock() {
    const tbody = document.getElementById('stock-table-tbody');
    const badgeCount = document.getElementById('stock-table-count-badge');
    const infoPag = document.getElementById('stock-pagination-info');
    if (!tbody) return;

    const productos = obtenerProductosStock();
    const filtro = window.stockState.filtroActivo;
    const q = (window.stockState.busqueda || '').trim().toLowerCase();

    const filtrados = productos.filter(p => {
        if (filtro === 'criticos') {
            if ((Number(p.stock) || 0) > obtenerUmbralProducto(p)) return false;
        } else if (filtro.startsWith('cat:')) {
            const buscada = filtro.slice(4);
            if ((p.categoria || 'General').toLowerCase() !== buscada) return false;
        }

        if (q) {
            const texto = `${p.nombre || ''} ${p.sku || ''} ${p.categoria || ''} ${p.proveedor || ''}`.toLowerCase();
            if (!texto.includes(q)) return false;
        }
        return true;
    });

    filtrados.sort((a, b) => {
        const critA = (Number(a.stock) || 0) <= obtenerUmbralProducto(a) ? 0 : 1;
        const critB = (Number(b.stock) || 0) <= obtenerUmbralProducto(b) ? 0 : 1;
        if (critA !== critB) return critA - critB;
        return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
    });

    const total = filtrados.length;
    const porPag = window.stockState.porPagina;
    const totalPags = Math.max(1, Math.ceil(total / porPag));
    if (window.stockState.paginaActual > totalPags) window.stockState.paginaActual = totalPags;

    const inicio = (window.stockState.paginaActual - 1) * porPag;
    const paginaItems = filtrados.slice(inicio, inicio + porPag);

    if (badgeCount) badgeCount.textContent = `${total} ${total === 1 ? 'ítem mostrado' : 'ítems mostrados'}`;
    if (infoPag) {
        const desde = total === 0 ? 0 : inicio + 1;
        const hasta = Math.min(total, inicio + paginaItems.length);
        infoPag.textContent = `Mostrando ${desde}-${hasta} de ${total} registros • Bóveda Local sincronizada`;
    }

    if (paginaItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align:center; padding:2.2rem; color:#64748b;">
                    No se encontraron productos con los filtros actuales.
                </td>
            </tr>
        `;
        renderizarPaginacionStock(1, 1);
        return;
    }

    const filasHtml = [];

    paginaItems.forEach(p => {
        const tieneVariantes = Array.isArray(p.variantesDetalle) && p.variantesDetalle.length > 0;
        const expandido = window.stockState.expandidos.has(String(p.id));

        const abrev = abrevUnidadStock(p.unidadMedida);
        const umbral = obtenerUmbralProducto(p);
        const estado = evaluarEstadoStock(p.stock, umbral);
        const stockTxt = formatearCantidadStock(p.stock, p.familiaMedicion, p.unidadMedida);
        const umbralTxt = formatearCantidadStock(umbral, p.familiaMedicion, p.unidadMedida);

        const costo = Number(p.precioCosto) || 0;
        const tieneOferta = Number(p.precioOferta) > 0 && Number(p.precioOferta) < Number(p.precioNormal);
        const venta = tieneOferta ? Number(p.precioOferta) : (Number(p.precioNormal) || 0);
        const margenPct = (costo > 0 && venta > 0) ? (((venta - costo) / venta) * 100).toFixed(1) : null;
        const margenClass = margenPct === null ? 'none' : (Number(margenPct) < 20 ? 'low' : '');

        const maxRef = Math.max(umbral * 2, Number(p.stock) || 1, 1);
        const pctBar = Math.min(100, Math.max(Number(p.stock) > 0 ? 6 : 0, Math.round(((Number(p.stock) || 0) / maxRef) * 100)));
        const foto = (p.imagenes && p.imagenes[0]) ? p.imagenes[0] : '../img/producto.png';

        filasHtml.push(`
            <tr class="stk-main-row" data-prod-id="${p.id}">
                <td>
                    <div class="stk-prod-cell">
                        ${tieneVariantes
                            ? `<button type="button" class="stk-expand-btn ${expandido ? 'open' : ''}" data-expand-id="${p.id}" title="Ver variantes">▶</button>`
                            : `<span class="stk-expand-spacer"></span>`
                        }
                        <img src="${foto}" alt="${escaparHtmlStock(p.nombre)}" class="stk-prod-thumb">
                        <div>
                            <div class="stk-prod-name-row">
                                <strong>${escaparHtmlStock(p.nombre)}</strong>
                                ${estado.tag ? `<span class="stk-tag-status ${estado.claseTag}">${estado.tag}</span>` : ''}
                            </div>
                            <div class="stk-prod-sub">
                                ${tieneVariantes
                                    ? `${p.variantesDetalle.length} variantes configuradas`
                                    : `${escaparHtmlStock(p.unidadMedida || 'Unidad')}`
                                }
                            </div>
                        </div>
                    </div>
                </td>
                <td><span class="stk-sku-code">${escaparHtmlStock(p.sku)}</span></td>
                <td><span class="stk-cat-pill">${escaparHtmlStock(p.categoria || 'General')}</span></td>
                <td>${costo > 0 ? formatearMonedaArs(costo) : '<span style="color:#94a3b8;">—</span>'}</td>
                <td><strong>${formatearMonedaArs(venta)}</strong><span class="stk-price-unit">/ ${escaparHtmlStock(abrev)}</span></td>
                <td><span class="stk-margin-pill ${margenClass}">${margenPct !== null ? `${margenPct}%` : 'Sin costo'}</span></td>
                <td>
                    <div class="stk-level-wrap">
                        <div class="stk-level-labels">
                            <span class="stk-level-val ${estado.nivel}">${stockTxt} ${escaparHtmlStock(abrev)}</span>
                            <span class="stk-level-min">Mín: ${umbralTxt} ${escaparHtmlStock(abrev)}</span>
                        </div>
                        <div class="stk-bar-track">
                            <div class="stk-bar-fill ${estado.nivel}" style="width: ${pctBar}%;"></div>
                        </div>
                    </div>
                </td>
                <td>${escaparHtmlStock(p.proveedor || 'Sin proveedor')}</td>
                <td>
                    <div class="stk-actions-cell">
                        <button type="button" class="stk-row-btn btn-stk-pedir-item ${estado.critico ? 'btn-pedir' : ''}" data-id="${p.id}">
                            ${estado.critico ? '🛒 Pedir' : '📦 Reponer'}
                        </button>
                        ${!tieneVariantes
                            ? `<button type="button" class="stk-row-btn btn-stk-ajustar" data-id="${p.id}" title="Ajuste rápido de stock (Merma / Conteo)">±</button>`
                            : ''
                        }
                    </div>
                </td>
            </tr>
        `);

        if (tieneVariantes && expandido) {
            p.variantesDetalle.forEach((v, vIdx) => {
                const vStock = Number(v.stock) || 0;
                const vEstado = evaluarEstadoStock(vStock, umbral);
                const vStockTxt = formatearCantidadStock(vStock, p.familiaMedicion, p.unidadMedida);

                filasHtml.push(`
                    <tr class="stk-variant-row ${vStock <= 0 ? 'is-empty' : ''}">
                        <td colspan="9">
                            <div class="stk-var-line">
                                <div class="stk-var-info">
                                    <span class="stk-var-dot" style="background:${escaparHtmlStock(v.color || '#0f766e')};"></span>
                                    <strong>${escaparHtmlStock(v.nombre)}</strong>
                                    <span class="stk-sku-code">SKU: ${escaparHtmlStock(v.sku)}</span>
                                    ${vEstado.tag ? `<span class="stk-tag-status ${vEstado.claseTag}">${vEstado.tag}</span>` : ''}
                                </div>
                                <div class="stk-var-right">
                                    <span>Stock: <strong class="stk-level-val ${vEstado.nivel}">${vStockTxt} ${escaparHtmlStock(abrev)}</strong></span>
                                    <button type="button" class="stk-row-btn btn-stk-ajustar-var" data-id="${p.id}" data-vidx="${vIdx}" title="Ajustar stock de esta variante">
                                        ± Ajustar
                                    </button>
                                </div>
                            </div>
                        </td>
                    </tr>
                `);
            });
        }
    });

    tbody.innerHTML = filasHtml.join('');
    renderizarPaginacionStock(window.stockState.paginaActual, totalPags);
}

function renderizarPaginacionStock(actual, total) {
    const cont = document.getElementById('stock-pagination-controls');
    if (!cont) return;

    let html = `<button type="button" class="stk-page-btn" data-p="${actual - 1}" ${actual <= 1 ? 'disabled' : ''}>Anterior</button>`;
    for (let i = 1; i <= total; i++) {
        if (total > 7 && i > 2 && i < total - 1 && Math.abs(i - actual) > 1) {
            if (i === 3 || i === total - 2) html += `<span style="padding:0 4px;">…</span>`;
            continue;
        }
        html += `<button type="button" class="stk-page-btn ${i === actual ? 'active' : ''}" data-p="${i}">${i}</button>`;
    }
    html += `<button type="button" class="stk-page-btn" data-p="${actual + 1}" ${actual >= total ? 'disabled' : ''}>Siguiente</button>`;

    cont.innerHTML = html;
    cont.querySelectorAll('.stk-page-btn:not(:disabled)').forEach(btn => {
        btn.addEventListener('click', () => {
            window.stockState.paginaActual = parseInt(btn.getAttribute('data-p'), 10) || 1;
            renderizarTablaControlStock();
        });
    });
}

/* ==========================================================================
   AJUSTE RÁPIDO DE STOCK (MERMA / CONTEO / INGRESO)
   ========================================================================== */
function abrirModalAjusteStock(prodId, varIdx = null) {
    const prod = obtenerProductosStock().find(p => String(p.id) === String(prodId));
    if (!prod) return;

    const esVariante = varIdx !== null && Array.isArray(prod.variantesDetalle) && prod.variantesDetalle[varIdx];
    const stockActual = esVariante ? (Number(prod.variantesDetalle[varIdx].stock) || 0) : (Number(prod.stock) || 0);
    const abrev = abrevUnidadStock(prod.unidadMedida);

    window.stockState.ajusteRef = { prodId: prod.id, varIdx: esVariante ? varIdx : null };

    document.getElementById('modal-ajuste-sub').textContent = esVariante
        ? `${prod.nombre} • Variante ${prod.variantesDetalle[varIdx].nombre}`
        : `${prod.nombre} (${prod.sku})`;

    document.getElementById('ajuste-stock-actual-val').textContent =
        `${formatearCantidadStock(stockActual, prod.familiaMedicion, prod.unidadMedida)} ${abrev}`;

    const inpCant = document.getElementById('ajuste-cantidad');
    inpCant.step = (prod.familiaMedicion === 'peso' || prod.familiaMedicion === 'longitud') ? '0.001' : '1';
    inpCant.value = '1';
    document.getElementById('ajuste-tipo').value = 'sumar';
    document.getElementById('ajuste-motivo').value = '';

    actualizarPreviewAjusteStock();
    document.getElementById('modal-ajuste-stock')?.classList.add('active');
}

function actualizarPreviewAjusteStock() {
    const ref = window.stockState.ajusteRef;
    if (!ref) return;
    const prod = obtenerProductosStock().find(p => String(p.id) === String(ref.prodId));
    if (!prod) return;

    const actual = ref.varIdx !== null ? (Number(prod.variantesDetalle[ref.varIdx].stock) || 0) : (Number(prod.stock) || 0);
    const tipo = document.getElementById('ajuste-tipo')?.value || 'sumar';
    const cant = Math.max(0, parseFloat(document.getElementById('ajuste-cantidad')?.value) || 0);

    let resultante = actual;
    if (tipo === 'sumar') resultante = actual + cant;
    else if (tipo === 'restar') resultante = Math.max(0, actual - cant);
    else if (tipo === 'fijar') resultante = cant;

    resultante = Math.round(resultante * 1000) / 1000;
    const abrev = abrevUnidadStock(prod.unidadMedida);
    const el = document.getElementById('ajuste-stock-resultante');
    if (el) el.textContent = `${formatearCantidadStock(resultante, prod.familiaMedicion, prod.unidadMedida)} ${abrev}`;
}

function cerrarModalAjusteStock() {
    document.getElementById('modal-ajuste-stock')?.classList.remove('active');
    window.stockState.ajusteRef = null;
}

/* ==========================================================================
   EVENTOS DEL MÓDULO (ETAPAS 1 A 4 COMPLETAS)
   ========================================================================== */
function inicializarEventosControlStock() {
    // Buscador principal
    document.getElementById('stock-search-input')?.addEventListener('input', (e) => {
        window.stockState.busqueda = e.target.value;
        window.stockState.paginaActual = 1;
        renderizarTablaControlStock();
    });

    // Umbral global por defecto
    document.getElementById('stock-umbral-global')?.addEventListener('input', (e) => {
        const val = Math.max(0, parseFloat(e.target.value) || 0);
        window.stockState.umbralGlobal = val;
        localStorage.setItem(STORAGE_KEY_UMBRAL_GLOBAL, String(val));
        renderizarTodoControlStock();
    });

    // Delegación en la tabla
    document.getElementById('stock-table-tbody')?.addEventListener('click', (e) => {
        const btnExpand = e.target.closest('.stk-expand-btn');
        if (btnExpand) {
            const id = String(btnExpand.getAttribute('data-expand-id'));
            if (window.stockState.expandidos.has(id)) window.stockState.expandidos.delete(id);
            else window.stockState.expandidos.add(id);
            renderizarTablaControlStock();
            return;
        }

        const btnAjuste = e.target.closest('.btn-stk-ajustar');
        if (btnAjuste) {
            abrirModalAjusteStock(btnAjuste.getAttribute('data-id'), null);
            return;
        }

        const btnAjusteVar = e.target.closest('.btn-stk-ajustar-var');
        if (btnAjusteVar) {
            abrirModalAjusteStock(btnAjusteVar.getAttribute('data-id'), parseInt(btnAjusteVar.getAttribute('data-vidx'), 10));
            return;
        }

        const btnPedir = e.target.closest('.btn-stk-pedir-item');
        if (btnPedir) {
            abrirModalPedidoProveedor({ prodId: btnPedir.getAttribute('data-id') });
        }
    });

    // Directorio de proveedores
    document.getElementById('btn-stock-gestionar-provs')?.addEventListener('click', () => {
        abrirModalAgendaProveedores();
    });

    document.getElementById('stock-providers-grid')?.addEventListener('click', (e) => {
        const btnEdit = e.target.closest('.btn-stk-editar-prov');
        if (btnEdit) {
            abrirModalAgendaProveedores(btnEdit.getAttribute('data-prov-id'));
            return;
        }

        const btnSol = e.target.closest('.btn-stk-solicitar-prov');
        if (btnSol) {
            abrirModalPedidoProveedor({ proveedor: btnSol.getAttribute('data-prov') });
        }
    });

    // Botones Auto-Orden
    const dispararAutoOrden = () => abrirModalPedidoProveedor({ modoAuto: true });
    document.getElementById('btn-stock-auto-orden')?.addEventListener('click', dispararAutoOrden);
    document.getElementById('btn-stock-generar-todos')?.addEventListener('click', dispararAutoOrden);

    // Eventos Modal Agenda de Proveedores (Etapa 2)
    document.getElementById('btn-cerrar-modal-prov')?.addEventListener('click', cerrarModalAgendaProveedores);
    document.getElementById('btn-cancelar-modal-prov')?.addEventListener('click', cerrarModalAgendaProveedores);
    document.getElementById('btn-prov-nuevo')?.addEventListener('click', prepararNuevoProveedorEnAgenda);
    document.getElementById('btn-prov-eliminar')?.addEventListener('click', eliminarProveedorActualAgenda);
    document.getElementById('form-proveedor-agenda')?.addEventListener('submit', guardarProveedorDesdeAgenda);

    document.getElementById('modal-agenda-proveedores')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-agenda-proveedores') cerrarModalAgendaProveedores();
    });

    document.getElementById('stk-prov-list')?.addEventListener('click', (e) => {
        const item = e.target.closest('.stk-prov-list-item');
        if (item) seleccionarProveedorEnAgenda(item.getAttribute('data-prov-id'));
    });

    document.getElementById('prov-prod-search')?.addEventListener('input', (e) => {
        window.stockState.provBusquedaProductos = e.target.value;
        renderizarChecklistAsignacionProductos();
    });

    document.querySelectorAll('.stk-mini-filter[data-pfilter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.stk-mini-filter[data-pfilter]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            window.stockState.provFiltroProductos = btn.getAttribute('data-pfilter');
            renderizarChecklistAsignacionProductos();
        });
    });

    document.getElementById('prov-assign-list')?.addEventListener('change', (e) => {
        const chk = e.target.closest('.chk-prov-assign');
        if (!chk) return;
        const idStr = String(chk.getAttribute('data-prod-id'));
        if (chk.checked) window.stockState.provSeleccionProductos.add(idStr);
        else window.stockState.provSeleccionProductos.delete(idStr);

        chk.closest('.stk-assign-item')?.classList.toggle('checked', chk.checked);
        const badge = document.getElementById('prov-assigned-count');
        if (badge) {
            const n = window.stockState.provSeleccionProductos.size;
            badge.textContent = `${n} ${n === 1 ? 'seleccionado' : 'seleccionados'}`;
        }
    });

    // Eventos Modal Generador de Pedidos (Etapa 3)
    document.getElementById('btn-cerrar-modal-pedido')?.addEventListener('click', cerrarModalPedidoProveedor);
    document.getElementById('modal-pedido-proveedor')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-pedido-proveedor') cerrarModalPedidoProveedor();
    });

    document.getElementById('ped-select-proveedor')?.addEventListener('change', (e) => {
        window.stockState.pedProveedorNombre = e.target.value;
        window.stockState.pedMensajeEditadoManual = false;
        if (e.target.value === '__todos__') {
            window.stockState.pedVerTodos = true;
            const chk = document.getElementById('ped-chk-ver-todos');
            if (chk) chk.checked = true;
        }
        renderizarListaItemsPedido();
        actualizarResumenYMensajePedido();
    });

    document.getElementById('ped-chk-ver-todos')?.addEventListener('change', (e) => {
        window.stockState.pedVerTodos = e.target.checked;
        renderizarListaItemsPedido();
    });

    document.getElementById('ped-buscar-item')?.addEventListener('input', (e) => {
        window.stockState.pedBusqueda = e.target.value;
        renderizarListaItemsPedido();
    });

    document.getElementById('btn-ped-auto-criticos')?.addEventListener('click', () => {
        const visibles = obtenerLineasVisiblesPedido();
        visibles.forEach(l => {
            const st = window.stockState.pedItemsMap.get(l.key) || { checked: false, cantidad: sugerirCantidadPedidoLinea(l), costo: l.costo };
            st.checked = l.stock <= l.umbral;
            if (st.checked && (!st.cantidad || st.cantidad <= 0)) st.cantidad = sugerirCantidadPedidoLinea(l);
            window.stockState.pedItemsMap.set(l.key, st);
        });
        window.stockState.pedMensajeEditadoManual = false;
        renderizarListaItemsPedido();
        actualizarResumenYMensajePedido();
    });

    document.getElementById('btn-ped-limpiar-sel')?.addEventListener('click', () => {
        window.stockState.pedItemsMap.forEach(st => { st.checked = false; });
        window.stockState.pedMensajeEditadoManual = false;
        renderizarListaItemsPedido();
        actualizarResumenYMensajePedido();
    });

    document.getElementById('ped-items-list')?.addEventListener('change', (e) => {
        const row = e.target.closest('.stk-ped-item-row');
        if (!row) return;
        const key = row.getAttribute('data-line-key');
        const st = window.stockState.pedItemsMap.get(key);
        if (!st) return;

        if (e.target.classList.contains('ped-item-chk')) {
            st.checked = e.target.checked;
            row.classList.toggle('selected', st.checked);
            window.stockState.pedMensajeEditadoManual = false;
            actualizarResumenYMensajePedido();
        }
    });

    document.getElementById('ped-items-list')?.addEventListener('input', (e) => {
        const row = e.target.closest('.stk-ped-item-row');
        if (!row) return;
        const key = row.getAttribute('data-line-key');
        const st = window.stockState.pedItemsMap.get(key);
        if (!st) return;

        if (e.target.classList.contains('ped-item-cant')) {
            st.cantidad = Math.max(0, parseFloat(e.target.value) || 0);
            if (st.cantidad > 0 && !st.checked) {
                st.checked = true;
                row.classList.add('selected');
                const chk = row.querySelector('.ped-item-chk');
                if (chk) chk.checked = true;
            }
            window.stockState.pedMensajeEditadoManual = false;
            actualizarResumenYMensajePedido();
        } else if (e.target.classList.contains('ped-item-costo')) {
            st.costo = Math.max(0, parseFloat(e.target.value) || 0);
            actualizarResumenYMensajePedido();
        }
    });

    document.getElementById('ped-nota-extra')?.addEventListener('input', () => {
        window.stockState.pedMensajeEditadoManual = false;
        actualizarResumenYMensajePedido();
    });

    document.getElementById('ped-mensaje-preview')?.addEventListener('input', () => {
        window.stockState.pedMensajeEditadoManual = true;
    });

    document.getElementById('btn-ped-copiar-msg')?.addEventListener('click', async () => {
        const txt = document.getElementById('ped-mensaje-preview')?.value || '';
        if (!txt) return;
        try {
            await navigator.clipboard.writeText(txt);
            const btn = document.getElementById('btn-ped-copiar-msg');
            if (btn) {
                const orig = btn.textContent;
                btn.textContent = '✅ Copiado';
                setTimeout(() => { btn.textContent = orig; }, 1500);
            }
        } catch {
            alert('No se pudo copiar automáticamente. Selecciona el texto y copia con Ctrl + C.');
        }
    });

    document.getElementById('btn-ped-enviar-wa')?.addEventListener('click', despacharPedidoWhatsApp);
    document.getElementById('btn-ped-descargar-pdf')?.addEventListener('click', despacharPedidoPdf);
    document.getElementById('btn-ped-solo-guardar')?.addEventListener('click', despacharPedidoSoloGuardar);

    // Eventos Etapa 4: Recepción en Tránsito (F8), Buscador, Filtros y Ordenamiento
    document.getElementById('btn-stock-recepcion-f8')?.addEventListener('click', () => abrirModalRecepcionTransito());
    document.getElementById('btn-cerrar-modal-recepcion')?.addEventListener('click', cerrarModalRecepcionTransito);
    document.getElementById('modal-recepcion-transito')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-recepcion-transito') cerrarModalRecepcionTransito();
    });

    document.querySelectorAll('.stk-rec-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.stk-rec-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            window.stockState.recTabActiva = btn.getAttribute('data-rectab');
            window.stockState.recPedidoActivoId = null;
            window.stockState.recLimiteVisible = 25;
            renderizarBandejaRecepcion();
        });
    });

    document.getElementById('rec-orders-list')?.addEventListener('click', (e) => {
        if (e.target.id === 'btn-rec-cargar-mas') {
            window.stockState.recLimiteVisible += 25;
            renderizarBandejaRecepcion();
            return;
        }
        const card = e.target.closest('.stk-rec-order-card');
        if (!card) return;
        window.stockState.recPedidoActivoId = card.getAttribute('data-ped-id');
        renderizarBandejaRecepcion();
    });

    document.getElementById('rec-search-input')?.addEventListener('input', (e) => {
        window.stockState.recBusqueda = e.target.value;
        window.stockState.recLimiteVisible = 25;
        renderizarBandejaRecepcion();
    });

    document.getElementById('rec-filter-prov')?.addEventListener('change', (e) => {
        window.stockState.recFiltroProv = e.target.value;
        window.stockState.recLimiteVisible = 25;
        renderizarBandejaRecepcion();
    });

    document.getElementById('rec-filter-pago')?.addEventListener('change', (e) => {
        window.stockState.recFiltroPago = e.target.value;
        window.stockState.recLimiteVisible = 25;
        renderizarBandejaRecepcion();
    });

    document.getElementById('rec-filter-periodo')?.addEventListener('change', (e) => {
        window.stockState.recFiltroPeriodo = e.target.value;
        window.stockState.recLimiteVisible = 25;
        renderizarBandejaRecepcion();
    });

    document.getElementById('rec-sort-select')?.addEventListener('change', (e) => {
        window.stockState.recOrden = e.target.value;
        renderizarBandejaRecepcion();
    });

    document.getElementById('btn-rec-clear-filters')?.addEventListener('click', () => {
        window.stockState.recBusqueda = '';
        window.stockState.recFiltroProv = 'todos';
        window.stockState.recFiltroPago = 'todos';
        window.stockState.recFiltroPeriodo = 'todos';
        window.stockState.recOrden = 'recientes';
        window.stockState.recLimiteVisible = 25;

        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        setVal('rec-search-input', '');
        setVal('rec-filter-prov', 'todos');
        setVal('rec-filter-pago', 'todos');
        setVal('rec-filter-periodo', 'todos');
        setVal('rec-sort-select', 'recientes');
        renderizarBandejaRecepcion();
    });

    document.getElementById('btn-rec-limpiar-saldados')?.addEventListener('click', () => {
        const pedidos = obtenerPedidosStock();
        const saldados = pedidos.filter(p => p.estado === 'recibido' && p.pagoInfo && (Number(p.pagoInfo.deudaPendiente) || 0) <= 0);
        if (saldados.length === 0) return;

        if (!confirm(`¿Eliminar las ${saldados.length} órdenes saldadas del historial?\n\nLas órdenes con deuda pendiente y el stock actual NO se verán afectados.`)) return;

        const idsSaldados = new Set(saldados.map(p => p.id));
        const restantes = pedidos.filter(p => !idsSaldados.has(p.id));
        guardarPedidosStock(restantes);
        window.stockState.recPedidoActivoId = null;
        renderizarBandejaRecepcion();
    });

    if (!stockF8Registrado) {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F8' && document.getElementById('stock-module-root')) {
                e.preventDefault();
                abrirModalRecepcionTransito();
            }
        });
        stockF8Registrado = true;
    }

    // Eventos Etapa 4B: Ventana de Pago y Deudas
    document.getElementById('btn-cerrar-modal-pago')?.addEventListener('click', cerrarModalPagoPedido);
    document.getElementById('btn-cancelar-modal-pago')?.addEventListener('click', cerrarModalPagoPedido);
    document.getElementById('modal-pago-pedido')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-pago-pedido') cerrarModalPagoPedido();
    });

    document.querySelectorAll('input[name="pago-modalidad"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const val = radio.value;
            document.getElementById('lbl-modo-unico')?.classList.toggle('active', val === 'unico');
            document.getElementById('lbl-modo-dividido')?.classList.toggle('active', val === 'dividido');
            recalcularResumenPagoPedido();
            if (val === 'dividido') {
                document.getElementById('pago-monto-entregado')?.focus();
            }
        });
    });

    document.getElementById('pago-subtotal-input')?.addEventListener('input', recalcularResumenPagoPedido);
    document.getElementById('btn-pago-restaurar-sub')?.addEventListener('click', () => {
        const inp = document.getElementById('pago-subtotal-input');
        if (inp) inp.value = Number(window.stockState.pagoSubtotalCalculado) || 0;
        recalcularResumenPagoPedido();
    });
    document.getElementById('pago-medio')?.addEventListener('change', (e) => {
        if (e.target.value === 'Cuenta Corriente') {
            const radioDiv = document.querySelector('input[name="pago-modalidad"][value="dividido"]');
            if (radioDiv) radioDiv.checked = true;
            document.getElementById('lbl-modo-unico')?.classList.remove('active');
            document.getElementById('lbl-modo-dividido')?.classList.add('active');
            const inpEnt = document.getElementById('pago-monto-entregado');
            if (inpEnt) inpEnt.value = '0';
            recalcularResumenPagoPedido();
        }
    });

    document.getElementById('pago-costo-envio')?.addEventListener('input', recalcularResumenPagoPedido);
    document.getElementById('pago-monto-entregado')?.addEventListener('input', recalcularResumenPagoPedido);
    document.getElementById('form-pago-pedido')?.addEventListener('submit', guardarPagoPedidoFormulario);

    // Eventos Modal Ajuste Rápido
    document.getElementById('btn-cerrar-modal-ajuste')?.addEventListener('click', cerrarModalAjusteStock);
    document.getElementById('btn-cancelar-modal-ajuste')?.addEventListener('click', cerrarModalAjusteStock);
    document.getElementById('ajuste-tipo')?.addEventListener('change', actualizarPreviewAjusteStock);
    document.getElementById('ajuste-cantidad')?.addEventListener('input', actualizarPreviewAjusteStock);

    document.getElementById('form-ajuste-stock')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const ref = window.stockState.ajusteRef;
        if (!ref) return;
        const prod = obtenerProductosStock().find(p => String(p.id) === String(ref.prodId));
        if (!prod) return;

        const tipo = document.getElementById('ajuste-tipo').value;
        const cant = Math.max(0, parseFloat(document.getElementById('ajuste-cantidad').value) || 0);

        const calcular = (actual) => {
            let res = actual;
            if (tipo === 'sumar') res = actual + cant;
            else if (tipo === 'restar') res = Math.max(0, actual - cant);
            else if (tipo === 'fijar') res = cant;
            return Math.round(res * 1000) / 1000;
        };

        if (ref.varIdx !== null && Array.isArray(prod.variantesDetalle) && prod.variantesDetalle[ref.varIdx]) {
            prod.variantesDetalle[ref.varIdx].stock = calcular(Number(prod.variantesDetalle[ref.varIdx].stock) || 0);
            prod.stock = Math.round(prod.variantesDetalle.reduce((acc, v) => acc + (Number(v.stock) || 0), 0) * 1000) / 1000;
        } else {
            prod.stock = calcular(Number(prod.stock) || 0);
        }

        prod.actualizadoEn = new Date().toISOString();
        guardarProductosStock();
        cerrarModalAjusteStock();
        renderizarTodoControlStock();
    });
}

