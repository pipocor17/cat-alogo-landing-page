/* ==========================================================================
   MÓDULO: TERMINAL PUNTO DE VENTA (POS) - COMPLETO (ETAPAS 1 A 5 + VARIANTES)
   (TURNOS, CATÁLOGO, FIADO, COBRO MIXTO, ARQUEO, RETIROS, CORTE X/Z Y TICKETS)
   ========================================================================== */

const STORAGE_KEY_POS_TURNOS = 'cat_alogo_pos_turnos_v1';
const STORAGE_KEY_POS_VENTAS = 'cat_alogo_pos_ventas_v1';
const STORAGE_KEY_POS_ESPERA = 'cat_alogo_pos_espera_v1';
const STORAGE_KEY_POS_CLIENTES = 'cat_alogo_clientes_v1';
const STORAGE_KEY_POS_UMBRAL_GAVETA = 'cat_alogo_pos_umbral_gaveta_v1';

window.posState = {
    categoriaActiva: 'todos',
    busqueda: '',
    carrito: [],
    descuentoPct: 0,
    // Etapa 2: Cliente y Cobro Mixto
    clienteId: null,
    m1Tipo: 'Efectivo',
    m1Monto: 0,
    m1PagaCon: 0,
    m1RecargoPct: 10,
    pagoDividido: false,
    m2Tipo: 'Tarjeta Débito',
    m2Monto: 0,
    m2PagaCon: 0,
    m2RecargoPct: 10,
    m2Ref: '',
    ultimaVentaId: null,
    // Etapa 3: Arqueo de Caja
    modoCiego: false,
    // Etapa 4: Corte X y Alerta de Gaveta
    umbralGaveta: parseFloat(localStorage.getItem(STORAGE_KEY_POS_UMBRAL_GAVETA) || '75000') || 75000,
    // Etapa 5: Auditoría de Tickets Térmicos
    audTab: 'turno',
    audBusqueda: '',
    audVentaId: null,
    audAnchoMm: 80,
    audLimite: 30
};

let posShortcutsRegistrados = false;
let posArqueoChartInstance = null;

/* ==========================================================================
   HELPERS DE BÓVEDA LOCAL Y FORMATO
   ========================================================================== */
function obtenerProductosPos() {
    if (!Array.isArray(window.bovedaProductos) || window.bovedaProductos.length === 0) {
        window.bovedaProductos = JSON.parse(localStorage.getItem('cat_alogo_productos_v1') || '[]');
    }
    return window.bovedaProductos;
}

function guardarProductosPos() {
    if (typeof guardarBovedaLocal === 'function') {
        guardarBovedaLocal();
    } else {
        localStorage.setItem('cat_alogo_productos_v1', JSON.stringify(window.bovedaProductos || []));
    }
}

function obtenerClientesPos() {
    try {
        const arr = JSON.parse(localStorage.getItem(STORAGE_KEY_POS_CLIENTES) || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function guardarClientesPos(lista) {
    window.bovedaClientes = lista;
    localStorage.setItem(STORAGE_KEY_POS_CLIENTES, JSON.stringify(lista));
}

function obtenerTurnosPos() {
    try {
        const arr = JSON.parse(localStorage.getItem(STORAGE_KEY_POS_TURNOS) || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function guardarTurnosPos(lista) {
    localStorage.setItem(STORAGE_KEY_POS_TURNOS, JSON.stringify(lista));
    window.dispatchEvent(new CustomEvent('cat-alogo:turno-actualizado', { detail: lista }));
}

function obtenerTurnoActivoPos() {
    return obtenerTurnosPos().find(t => t && (t.estado === 'abierto' || t.estado === 'abierta')) || null;
}

function obtenerVentasPos() {
    try {
        const arr = JSON.parse(localStorage.getItem(STORAGE_KEY_POS_VENTAS) || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function guardarVentasPos(lista) {
    localStorage.setItem(STORAGE_KEY_POS_VENTAS, JSON.stringify(lista));
}

function obtenerTicketsEnEsperaPos() {
    try {
        const arr = JSON.parse(localStorage.getItem(STORAGE_KEY_POS_ESPERA) || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function guardarTicketsEnEsperaPos(lista) {
    localStorage.setItem(STORAGE_KEY_POS_ESPERA, JSON.stringify(lista));
    actualizarContadorEsperaPos();
}

function escaparHtmlPos(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatearMonedaPos(valor) {
    const num = Number(valor) || 0;
    return `$${num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function abrevUnidadPos(unidadMedida) {
    if (typeof window.obtenerAbrevUnidad === 'function') return window.obtenerAbrevUnidad(unidadMedida);
    return 'u.';
}

function formatearCantPos(valor, familia, unidad) {
    if (typeof window.formatearStockProducto === 'function') {
        return window.formatearStockProducto(valor, familia, unidad);
    }
    return String(Math.round((Number(valor) || 0) * 1000) / 1000);
}

/* --- HELPERS UNIFICADOS DE VARIANTES (PRECIO, OFERTA, COSTO, FOTO Y BÚSQUEDA SEGURA) --- */
function obtenerIndiceVarianteInicialPos(prod) {
    if (!Array.isArray(prod?.variantesDetalle) || prod.variantesDetalle.length === 0) return null;
    const disp = prod.variantesDetalle.findIndex(v => (Number(v?.stock) || 0) > 0);
    return disp >= 0 ? disp : 0;
}

function obtenerInfoVariantePos(prod, varIdx = null) {
    const portadaPadre = (Array.isArray(prod?.imagenes) && prod.imagenes[0])
        ? prod.imagenes[0]
        : (prod?.imagen_url || '../img/producto.png');
    const precioNormPadre = Number(prod?.precioNormal ?? prod?.precio) || 0;
    const precioOfPadre = Number(prod?.precioOferta) || 0;
    const costoPadre = Math.max(0, Number(prod?.precioCosto ?? prod?.precio_costo) || 0);

    if (varIdx !== null && varIdx !== undefined && Array.isArray(prod?.variantesDetalle) && prod.variantesDetalle[varIdx]) {
        const v = prod.variantesDetalle[varIdx];
        const pvNorm = (v.precio !== undefined && v.precio !== null && !isNaN(Number(v.precio)) && Number(v.precio) > 0)
            ? Number(v.precio)
            : precioNormPadre;
        const pvOf = Number(v.precioOferta) || 0;
        const tieneOferta = pvOf > 0 && pvOf < pvNorm;
        const precioFinal = tieneOferta ? pvOf : pvNorm;
        const costoVar = (v.precioCosto !== undefined && v.precioCosto !== null && !isNaN(Number(v.precioCosto)) && Number(v.precioCosto) > 0)
            ? Number(v.precioCosto)
            : costoPadre;
        const imgVar = (typeof v.imagen_url === 'string' && v.imagen_url.trim()) ? v.imagen_url.trim() : portadaPadre;

        return {
            variante: v,
            precioNormal: pvNorm,
            precioOferta: pvOf,
            tieneOferta,
            precioFinal,
            costoUnit: costoVar,
            imagen: imgVar
        };
    }

    const tieneOfertaPadre = precioOfPadre > 0 && precioOfPadre < precioNormPadre;
    return {
        variante: null,
        precioNormal: precioNormPadre,
        precioOferta: precioOfPadre,
        tieneOferta: tieneOfertaPadre,
        precioFinal: tieneOfertaPadre ? precioOfPadre : precioNormPadre,
        costoUnit: costoPadre,
        imagen: portadaPadre
    };
}

function obtenerPrecioVentaProdPos(prod, varIdx = null) {
    return obtenerInfoVariantePos(prod, varIdx).precioFinal;
}

function resolverIndiceVarianteEnProductoPos(prod, itemTicket) {
    if (!prod || !Array.isArray(prod.variantesDetalle) || prod.variantesDetalle.length === 0) return -1;
    const det = prod.variantesDetalle;

    // 1. Coincidencia exacta por SKU de variante
    const skuBuscado = String(itemTicket?.varSku || itemTicket?.sku || '').trim().toLowerCase();
    if (skuBuscado) {
        const porSku = det.findIndex(v => String(v?.sku || '').trim().toLowerCase() === skuBuscado);
        if (porSku !== -1) return porSku;
    }

    // 2. Coincidencia por índice + nombre (si no se reordenaron)
    const idx = itemTicket?.varIdx;
    const nomBuscado = String(itemTicket?.varNombre || '').trim().toLowerCase();
    if (idx !== null && idx !== undefined && det[idx]) {
        if (!nomBuscado || String(det[idx].nombre || '').trim().toLowerCase() === nomBuscado) {
            return idx;
        }
    }

    // 3. Coincidencia por nombre de variante
    if (nomBuscado) {
        const porNom = det.findIndex(v => String(v?.nombre || '').trim().toLowerCase() === nomBuscado);
        if (porNom !== -1) return porNom;
    }

    // 4. Fallback al índice original si sigue dentro del rango
    if (idx !== null && idx !== undefined && det[idx]) return idx;
    return -1;
}

function esProductoBalanzaPos(prod) {
    const fam = (prod.familiaMedicion || prod.familia || '').toLowerCase();
    return fam === 'peso' || fam === 'longitud';
}

function obtenerDatosComercioPos() {
    try {
        const pdfCfg = JSON.parse(localStorage.getItem('cat_alogo_pdf_config_v1') || 'null');
        if (pdfCfg) {
            return {
                nombre: pdfCfg.headerNombre || 'Cat-Alogo Store',
                contacto: pdfCfg.headerContacto || ''
            };
        }
    } catch { /* fallback */ }
    return { nombre: 'Cat-Alogo Store', contacto: '' };
}

function obtenerNombreComercioPos() {
    return obtenerDatosComercioPos().nombre;
}

/* ==========================================================================
   CÁLCULO DE FLUJOS Y MÉTRICAS DEL TURNO (ARQUEO, CORTE X Y CORTE Z)
   ========================================================================== */
function calcularFlujosTurnoPos(turno) {
    if (!turno) {
        return { fondoInicial: 0, ventasEfectivo: 0, totalRetiros: 0, efectivoTeorico: 0, ventasTurno: [], serieFlujo: [0] };
    }

    const turnoIdStr = String(turno.id);
    const tsInicio = new Date(turno.fechaApertura || 0).getTime() || 0;
    const tsFin = turno.fechaCierre ? (new Date(turno.fechaCierre).getTime() || Date.now()) : Date.now() + 60000;

    const ventasTurno = obtenerVentasPos().filter(v => {
        if (!v || v.estado === 'anulada') return false;
        const vTurnoId = v.turnoId || v.cajaId;
        if (vTurnoId) return String(vTurnoId) === turnoIdStr;
        const tsV = new Date(v.fecha || 0).getTime();
        return !isNaN(tsV) && tsV >= tsInicio && tsV <= tsFin;
    });

    let ventasEfectivo = 0;

    ventasTurno.forEach(v => {
        (v.pagos || []).forEach(pg => {
            if (String(pg.medio || '').toLowerCase().includes('efectivo')) {
                ventasEfectivo += Number(pg.monto) || 0;
            }
        });
    });

    const retiros = Array.isArray(turno.retiros) ? turno.retiros : [];
    const totalRetiros = retiros.reduce((acc, r) => acc + (Number(r.monto) || 0), 0);
    const fondoInicial = Math.max(0, Number(turno.fondoInicial) || 0);
    const efectivoTeorico = Math.round((fondoInicial + ventasEfectivo - totalRetiros) * 100) / 100;

    const eventos = [];
    ventasTurno.forEach(v => {
        const montoEfvo = (v.pagos || [])
            .filter(p => String(p.medio || '').toLowerCase().includes('efectivo'))
            .reduce((a, p) => a + (Number(p.monto) || 0), 0);
        if (montoEfvo > 0) eventos.push({ ts: new Date(v.fecha).getTime() || 0, delta: montoEfvo });
    });
    retiros.forEach(r => {
        eventos.push({ ts: new Date(r.fecha).getTime() || 0, delta: -(Number(r.monto) || 0) });
    });
    eventos.sort((a, b) => a.ts - b.ts);

    const serieFlujo = [fondoInicial];
    let acum = fondoInicial;
    eventos.forEach(ev => {
        acum = Math.round((acum + ev.delta) * 100) / 100;
        serieFlujo.push(acum);
    });
    if (serieFlujo.length === 1) serieFlujo.push(fondoInicial);

    return {
        fondoInicial,
        ventasEfectivo: Math.round(ventasEfectivo * 100) / 100,
        totalRetiros: Math.round(totalRetiros * 100) / 100,
        efectivoTeorico,
        ventasTurno,
        serieFlujo
    };
}

function calcularResumenCorteXPos(turno) {
    const flujos = calcularFlujosTurnoPos(turno);
    const ventas = flujos.ventasTurno;
    const cantTickets = ventas.length;

    let recaudacionNeta = 0;
    let costoTotal = 0;
    let unidadesVendidas = 0;
    let itemsTotales = 0;

    const mapaMedios = {
        'Efectivo': { medio: 'Efectivo', icono: '💵', desc: 'Tickets cobrados en efectivo', monto: 0, ops: 0 },
        'Tarjeta Débito': { medio: 'Tarjeta Débito', icono: '💳', desc: 'Acreditación directa', monto: 0, ops: 0 },
        'Tarjeta Crédito': { medio: 'Tarjeta Crédito', icono: '💳', desc: 'Con recargo financiero aplicado', monto: 0, ops: 0 },
        'QR / Transferencia': { medio: 'QR / Transferencia', icono: '📱', desc: 'Billeteras virtuales / Banco', monto: 0, ops: 0 },
        'Cuenta Corriente': { medio: 'Cuenta Corriente', icono: '📒', desc: 'Fiados asignados a clientes', monto: 0, ops: 0 }
    };

    const mapaProds = {};

    ventas.forEach(v => {
        recaudacionNeta += Number(v.total) || 0;
        costoTotal += Number(v.costoTotal) || 0;

        (v.pagos || []).forEach(pg => {
            const k = pg.medio || 'Efectivo';
            if (!mapaMedios[k]) {
                mapaMedios[k] = { medio: k, icono: '💰', desc: 'Otros medios', monto: 0, ops: 0 };
            }
            mapaMedios[k].monto = Math.round((mapaMedios[k].monto + (Number(pg.monto) || 0)) * 100) / 100;
            mapaMedios[k].ops++;
        });

        (v.items || []).forEach(it => {
            const cant = Number(it.cantidad) || 0;
            const sub = Math.round((Number(it.precioUnit) || 0) * cant * 100) / 100;
            unidadesVendidas += cant;
            itemsTotales++;

            const pKey = `${it.sku || ''}::${it.nombre || ''}`;
            if (!mapaProds[pKey]) {
                mapaProds[pKey] = {
                    nombre: it.nombre || 'Producto',
                    sku: it.sku || '',
                    unidadMedida: it.unidadMedida || 'Unidad',
                    familiaMedicion: it.familiaMedicion || 'unidad',
                    cantidad: 0,
                    subtotal: 0
                };
            }
            mapaProds[pKey].cantidad = Math.round((mapaProds[pKey].cantidad + cant) * 1000) / 1000;
            mapaProds[pKey].subtotal = Math.round((mapaProds[pKey].subtotal + sub) * 100) / 100;
        });
    });

    recaudacionNeta = Math.round(recaudacionNeta * 100) / 100;
    costoTotal = Math.round(costoTotal * 100) / 100;
    const gananciaBruta = Math.round((recaudacionNeta - costoTotal) * 100) / 100;
    const margenPct = recaudacionNeta > 0 ? Math.round((gananciaBruta / recaudacionNeta) * 1000) / 10 : 0;
    const ticketPromedio = cantTickets > 0 ? Math.round((recaudacionNeta / cantTickets) * 100) / 100 : 0;
    const itemsPorTicket = cantTickets > 0 ? Math.round((itemsTotales / cantTickets) * 10) / 10 : 0;

    const desgloseMedios = Object.values(mapaMedios)
        .filter(m => m.monto > 0 || m.medio === 'Efectivo')
        .map(m => ({
            ...m,
            porcentaje: recaudacionNeta > 0 ? Math.round((m.monto / recaudacionNeta) * 1000) / 10 : 0
        }))
        .sort((a, b) => b.monto - a.monto);

    const topProductos = Object.values(mapaProds)
        .sort((a, b) => b.subtotal - a.subtotal)
        .slice(0, 5);

    return {
        ...flujos,
        cantTickets,
        recaudacionNeta,
        costoTotal,
        gananciaBruta,
        margenPct,
        ticketPromedio,
        unidadesVendidas: Math.round(unidadesVendidas * 1000) / 1000,
        itemsPorTicket,
        desgloseMedios,
        topProductos
    };
}

/* ==========================================================================
   INICIALIZACIÓN DEL MÓDULO
   ========================================================================== */
function inicializarPos() {
    if (!document.getElementById('pos-module-root')) return;

    inicializarEventosPos();
    asegurarBotonCierreEnArqueoPos();
    renderizarTodoPos();

    if (!obtenerTurnoActivoPos()) {
        abrirModalAperturaTurnoPos();
    }
}

function renderizarTodoPos() {
    renderizarEstadoCajaPos();
    renderizarCategoriasPos();
    renderizarCatalogoPos();
    renderizarClienteAsignadoPos();
    renderizarTicketActivoPos(true);
    actualizarContadorEsperaPos();
}

/* ==========================================================================
   GESTIÓN DE TURNO / APERTURA DE CAJA
   ========================================================================== */
function renderizarEstadoCajaPos() {
    const turno = obtenerTurnoActivoPos();
    const pill = document.getElementById('pos-caja-pill');
    const lblTurno = document.getElementById('pos-turno-label');
    const lblOp = document.getElementById('pos-operador-label');
    const lblFondo = document.getElementById('pos-fondo-label');
    const banner = document.getElementById('pos-closed-banner');

    if (turno) {
        if (pill) pill.classList.remove('is-closed');
        if (lblTurno) lblTurno.textContent = `${turno.nombre} (#${turno.numero})`;
        if (lblOp) lblOp.textContent = turno.operador || turno.cajeroNombre || 'Cajero';
        if (lblFondo) lblFondo.textContent = `Fondo: ${formatearMonedaPos(turno.fondoInicial)}`;
        if (banner) banner.style.display = 'none';
    } else {
        if (pill) pill.classList.add('is-closed');
        if (lblTurno) lblTurno.textContent = 'Caja Cerrada • Abrir Turno';
        if (lblOp) lblOp.textContent = 'Sin operador';
        if (lblFondo) lblFondo.textContent = 'Fondo: $0';
        if (banner) banner.style.display = 'flex';
    }
}

function abrirModalAperturaTurnoPos() {
    if (obtenerTurnoActivoPos()) return;
    document.getElementById('modal-pos-apertura')?.classList.add('active');
    document.getElementById('pos-ap-fondo')?.focus();
}

function cerrarModalAperturaTurnoPos() {
    document.getElementById('modal-pos-apertura')?.classList.remove('active');
}

function guardarAperturaTurnoPos(e) {
    e.preventDefault();

    const nombre = document.getElementById('pos-ap-turno')?.value || 'Caja #01 • Turno Mañana';
    const operador = document.getElementById('pos-ap-operador')?.value.trim() || 'Cajero';
    const fondoInicial = Math.max(0, parseFloat(document.getElementById('pos-ap-fondo')?.value) || 0);

    const turnos = obtenerTurnosPos();
    const numero = 101 + turnos.length;

    turnos.unshift({
        id: 'turno-' + Date.now(),
        numero,
        nombre,
        operador,
        cajeroNombre: operador,
        fondoInicial,
        fechaApertura: new Date().toISOString(),
        fechaCierre: null,
        estado: 'abierto',
        estadoApp: 'abierta',
        abierto: true,
        dispositivoApertura: 'web_pc',
        dispositivoCierre: null,
        retiros: [],
        arqueos: [],
        ultimoArqueo: null,
        arqueoFinal: null
    });

    guardarTurnosPos(turnos);
    cerrarModalAperturaTurnoPos();
    renderizarEstadoCajaPos();
    actualizarCobroMixtoPos();
}

/* ==========================================================================
   CATÁLOGO POS (UNIDADES, BALANZA DECIMAL Y VARIANTES)
   ========================================================================== */
function renderizarCategoriasPos() {
    const bar = document.getElementById('pos-cats-bar');
    if (!bar) return;

    const productos = obtenerProductosPos();
    const mapa = {};
    productos.forEach(p => {
        const cat = (p.categoria || 'General').trim() || 'General';
        mapa[cat] = (mapa[cat] || 0) + 1;
    });

    const cats = Object.keys(mapa).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    const activa = window.posState.categoriaActiva;

    let html = `
        <button type="button" class="pos-cat-chip ${activa === 'todos' ? 'active' : ''}" data-poscat="todos">
            Todos (${productos.length})
        </button>
    `;

    cats.forEach(cat => {
        const key = cat.toLowerCase();
        html += `
            <button type="button" class="pos-cat-chip ${activa === key ? 'active' : ''}" data-poscat="${escaparHtmlPos(key)}">
                ${escaparHtmlPos(cat)} (${mapa[cat]})
            </button>
        `;
    });

    bar.innerHTML = html;
    bar.querySelectorAll('.pos-cat-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            window.posState.categoriaActiva = btn.getAttribute('data-poscat');
            renderizarCategoriasPos();
            renderizarCatalogoPos();
        });
    });
}

function renderizarCatalogoPos() {
    const grid = document.getElementById('pos-products-grid');
    const lblCount = document.getElementById('pos-catalog-count');
    if (!grid) return;

    const productos = obtenerProductosPos();
    const catActiva = window.posState.categoriaActiva;
    const q = (window.posState.busqueda || '').trim().toLowerCase();

    const filtrados = productos.filter(p => {
        if (catActiva !== 'todos') {
            if ((p.categoria || 'General').toLowerCase() !== catActiva) return false;
        }
        if (q) {
            const varSkus = Array.isArray(p.variantesDetalle)
                ? p.variantesDetalle.map(v => `${v.nombre || ''} ${v.sku || ''}`).join(' ')
                : '';
            const corpus = `${p.nombre || ''} ${p.sku || ''} ${p.categoria || ''} ${varSkus}`.toLowerCase();
            if (!corpus.includes(q)) return false;
        }
        return true;
    });

    if (lblCount) {
        lblCount.textContent = `${filtrados.length} ${filtrados.length === 1 ? 'producto disponible' : 'productos disponibles'}`;
    }

    if (filtrados.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align:center; padding:2.5rem 1rem; background:#ffffff; border:1px dashed #cbd5e1; border-radius:12px; color:#64748b; font-size:0.84rem;">
                No se encontraron productos con ese criterio.
            </div>
        `;
        return;
    }

    grid.innerHTML = filtrados.map(p => {
        const esBalanza = esProductoBalanzaPos(p);
        const tieneVariantes = Array.isArray(p.variantesDetalle) && p.variantesDetalle.length > 0;
        const defaultVarIdx = tieneVariantes ? obtenerIndiceVarianteInicialPos(p) : null;
        const infoVar = obtenerInfoVariantePos(p, defaultVarIdx);
        const foto = infoVar.imagen;
        const abrev = abrevUnidadPos(p.unidadMedida);

        const stockTotal = Number(p.stock) || 0;
        const sinStock = stockTotal <= 0;
        const stockTxt = formatearCantPos(stockTotal, p.familiaMedicion, p.unidadMedida);
        const badgeStockClass = sinStock ? 'out' : (stockTotal <= 5 ? 'low' : '');

        const precioBase = infoVar.precioFinal;
        const tieneOferta = infoVar.tieneOferta;

        let controlHtml = '';
        if (esBalanza) {
            const cantDef = abrev === 'kg' || abrev === 'L' || abrev === 'm' ? 0.5 : 1;
            const subDef = Math.round(precioBase * cantDef * 100) / 100;
            controlHtml = `
                <div class="pos-prod-ctrl-row">
                    <input type="number" class="pos-qty-input pos-balanza-qty" min="0.001" step="0.001" value="${cantDef}" data-precio="${precioBase}">
                    <span class="pos-prod-unit">${escaparHtmlPos(abrev)}</span>
                    <button type="button" class="pos-add-btn btn-pos-add-prod" data-prod-id="${p.id}" ${sinStock ? 'disabled' : ''}>
                        + ${formatearMonedaPos(subDef)}
                    </button>
                </div>
            `;
        } else {
            const varSelectorHtml = tieneVariantes
                ? `<select class="pos-var-select" data-prod-id="${p.id}">
                    ${p.variantesDetalle.map((v, idx) => {
                        const vst = Number(v.stock) || 0;
                        const vInfo = obtenerInfoVariantePos(p, idx);
                        const tagOf = vInfo.tieneOferta ? ' ★OF' : '';
                        return `<option value="${idx}" ${idx === defaultVarIdx ? 'selected' : ''} ${vst <= 0 ? 'disabled' : ''}>${escaparHtmlPos(v.nombre)} — ${formatearMonedaPos(vInfo.precioFinal)}${tagOf} (${vst} ${escaparHtmlPos(abrev)})</option>`;
                    }).join('')}
                   </select>`
                : '';

            controlHtml = `
                ${varSelectorHtml}
                <div class="pos-prod-ctrl-row">
                    <div class="pos-stepper">
                        <button type="button" class="pos-step-btn" data-step="-1">−</button>
                        <span class="pos-step-val">1</span>
                        <button type="button" class="pos-step-btn" data-step="1">+</button>
                    </div>
                    <button type="button" class="pos-add-btn btn-pos-add-prod" data-prod-id="${p.id}" ${sinStock ? 'disabled' : ''}>
                        🛒 Agregar
                    </button>
                </div>
            `;
        }

        return `
            <article class="pos-prod-card ${sinStock ? 'out-of-stock' : ''}" data-prod-id="${p.id}">
                <div class="pos-prod-img-wrap">
                    ${esBalanza ? '<span class="pos-badge-tl">⚖️ BALANZA</span>' : ''}
                    <span class="pos-badge-tr ${badgeStockClass}">${sinStock ? 'SIN STOCK' : `Stock: ${stockTxt} ${escaparHtmlPos(abrev)}`}</span>
                    <img src="${foto}" alt="${escaparHtmlPos(p.nombre)}">
                </div>
                <div class="pos-prod-body">
                    <span class="pos-prod-sku">${escaparHtmlPos(p.sku)}</span>
                    <h4 class="pos-prod-name">${escaparHtmlPos(p.nombre)}</h4>
                    <div class="pos-prod-price-row">
                        <span class="pos-prod-price">${formatearMonedaPos(precioBase)}</span>
                        <span class="pos-prod-unit">/ ${escaparHtmlPos(abrev)}</span>
                        ${tieneOferta ? `<span class="pos-prod-old">${formatearMonedaPos(infoVar.precioNormal)}</span>` : ''}
                    </div>
                    ${controlHtml}
                </div>
            </article>
        `;
    }).join('');
}

/* ==========================================================================
   ETAPA 2: CLIENTE ASIGNADO, TICKET ACTIVO Y COBRO MIXTO
   ========================================================================== */
function obtenerClienteSeleccionadoPos() {
    if (!window.posState.clienteId) return null;
    return obtenerClientesPos().find(c => c.id === window.posState.clienteId) || null;
}

function renderizarClienteAsignadoPos() {
    const cli = obtenerClienteSeleccionadoPos();
    const box = document.getElementById('pos-client-box');
    const av = document.getElementById('pos-client-avatar');
    const lblNom = document.getElementById('pos-cliente-nombre-lbl');
    const lblSub = document.getElementById('pos-cliente-sub-lbl');
    const btnQuitar = document.getElementById('btn-pos-quitar-cliente');
    const fiadoWrap = document.getElementById('pos-fiado-toggle-wrap');
    const fiadoTxt = document.getElementById('pos-fiado-toggle-txt');
    const chkFiado = document.getElementById('pos-chk-fiado');

    if (!cli) {
        if (box) { box.classList.remove('has-client', 'is-blocked'); }
        if (av) av.textContent = '👤';
        if (lblNom) lblNom.textContent = 'Consumidor Final';
        if (lblSub) lblSub.textContent = 'Venta al contado sin cuenta corriente';
        if (btnQuitar) btnQuitar.style.display = 'none';
        if (fiadoWrap) fiadoWrap.style.display = 'none';
        if (chkFiado) chkFiado.checked = false;
        return;
    }

    const saldo = Math.max(0, Number(cli.saldoActual) || 0);
    const cupo = Math.max(0, Number(cli.cupoMaximo) || 0);
    const disp = Math.max(0, Math.round((cupo - saldo) * 100) / 100);
    const excedido = cupo > 0 && saldo >= cupo;
    const bloqueado = cli.bloqueadoPos || excedido;

    const iniciales = String(cli.nombre || 'CL').trim().split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
    if (av) av.textContent = iniciales;
    if (lblNom) lblNom.textContent = `${cli.nombre}${cli.vip ? ' ⭐' : ''}`;
    if (lblSub) {
        lblSub.textContent = `Deuda: ${formatearMonedaPos(saldo)} • Disp: ${formatearMonedaPos(disp)} (Cupo ${formatearMonedaPos(cupo)})`;
    }
    if (btnQuitar) btnQuitar.style.display = 'inline-flex';
    if (box) {
        box.classList.toggle('has-client', !bloqueado);
        box.classList.toggle('is-blocked', bloqueado);
    }
    if (fiadoWrap) fiadoWrap.style.display = 'flex';
    if (fiadoTxt) {
        fiadoTxt.textContent = bloqueado
            ? '⚠️ Cliente con bloqueo o límite excedido (requiere autorización)'
            : 'Habilitar Venta a Crédito / Fiado para esta orden';
    }
    if (chkFiado) {
        const usaCtaCte = window.posState.m1Tipo === 'Cuenta Corriente' || (window.posState.pagoDividido && window.posState.m2Tipo === 'Cuenta Corriente');
        chkFiado.checked = usaCtaCte;
    }
}

function abrirSelectorClientePos() {
    const modal = document.getElementById('modal-pos-cliente');
    const inp = document.getElementById('pos-cli-search');
    if (!modal) return;
    if (inp) inp.value = '';
    renderizarListaSelectorClientesPos('');
    modal.classList.add('active');
    inp?.focus();
}

function renderizarListaSelectorClientesPos(filtro = '') {
    const cont = document.getElementById('pos-cli-picker-list');
    if (!cont) return;

    const clientes = obtenerClientesPos();
    const q = filtro.trim().toLowerCase();
    const lista = clientes.filter(c => {
        if (!q) return true;
        return `${c.nombre || ''} ${c.dni || ''} ${c.cuenta || ''} ${c.telefono || ''}`.toLowerCase().includes(q);
    });

    if (lista.length === 0) {
        cont.innerHTML = `<div style="text-align:center; padding:1.5rem; color:#64748b; font-size:0.82rem;">No se encontraron clientes. Crea uno desde el módulo <strong>Clientes</strong>.</div>`;
        return;
    }

    cont.innerHTML = lista.map(c => {
        const saldo = Math.max(0, Number(c.saldoActual) || 0);
        const cupo = Math.max(0, Number(c.cupoMaximo) || 0);
        const disp = Math.max(0, Math.round((cupo - saldo) * 100) / 100);
        const bloqueado = c.bloqueadoPos || (cupo > 0 && saldo > cupo);

        return `
            <button type="button" class="pos-cli-pick-item" data-pick-cli="${escaparHtmlPos(c.id)}">
                <div>
                    <strong>${escaparHtmlPos(c.nombre)} ${c.vip ? '⭐' : ''}</strong>
                    <small>Cta. ${escaparHtmlPos(c.cuenta || '—')} • DNI ${escaparHtmlPos(c.dni || '—')}</small>
                </div>
                <div class="pos-cli-pick-right">
                    <strong class="${bloqueado ? 'text-danger' : 'text-emerald'}">Disp: ${formatearMonedaPos(disp)}</strong>
                    <small style="display:block;">Deuda: ${formatearMonedaPos(saldo)}</small>
                </div>
            </button>
        `;
    }).join('');
}

function agregarProductoAlTicketPos(prodId, cantidad = 1, varIdx = null) {
    if (!obtenerTurnoActivoPos()) {
        abrirModalAperturaTurnoPos();
        return;
    }

    const prod = obtenerProductosPos().find(p => String(p.id) === String(prodId));
    if (!prod) return;

    const tieneVariantes = Array.isArray(prod.variantesDetalle) && prod.variantesDetalle.length > 0;
    let vIndex = tieneVariantes ? (varIdx !== null && varIdx !== undefined ? parseInt(varIdx, 10) : obtenerIndiceVarianteInicialPos(prod)) : null;

    if (tieneVariantes) {
        const vObj = prod.variantesDetalle[vIndex];
        if (!vObj || (Number(vObj.stock) || 0) <= 0) {
            const disponibleIdx = prod.variantesDetalle.findIndex(v => (Number(v.stock) || 0) > 0);
            if (disponibleIdx === -1) {
                alert(`"${prod.nombre}" no tiene stock disponible en ninguna variante.`);
                return;
            }
            vIndex = disponibleIdx;
        }
    }

    const vSel = tieneVariantes ? prod.variantesDetalle[vIndex] : null;
    const stockDisp = vSel ? (Number(vSel.stock) || 0) : (Number(prod.stock) || 0);
    if (stockDisp <= 0) {
        alert(`"${prod.nombre}" no tiene stock disponible.`);
        return;
    }

    const infoVar = obtenerInfoVariantePos(prod, vIndex);
    const cantAgregar = Math.round(Math.max(0.001, Number(cantidad) || 1) * 1000) / 1000;
    const key = vSel ? `${prod.id}::${vSel.sku || vIndex}` : `${prod.id}::main`;
    const existente = window.posState.carrito.find(it => it.key === key);

    if (existente) {
        const nuevaCant = Math.round((existente.cantidad + cantAgregar) * 1000) / 1000;
        if (nuevaCant > stockDisp) {
            alert(`Stock insuficiente. Disponible: ${formatearCantPos(stockDisp, prod.familiaMedicion, prod.unidadMedida)} ${abrevUnidadPos(prod.unidadMedida)}.`);
            existente.cantidad = stockDisp;
        } else {
            existente.cantidad = nuevaCant;
        }
    } else {
        const cantFinal = Math.min(stockDisp, cantAgregar);
        window.posState.carrito.push({
            key,
            prodId: String(prod.id),
            varIdx: vIndex,
            varNombre: vSel ? String(vSel.nombre || '') : '',
            varSku: vSel ? String(vSel.sku || '') : '',
            nombre: vSel ? `${prod.nombre} (${vSel.nombre})` : prod.nombre,
            sku: vSel ? (vSel.sku || prod.sku) : prod.sku,
            imagen: infoVar.imagen,
            precioUnit: infoVar.precioFinal,
            costoUnit: infoVar.costoUnit,
            tieneOferta: infoVar.tieneOferta,
            cantidad: cantFinal,
            unidadMedida: prod.unidadMedida || 'Unidad',
            familiaMedicion: prod.familiaMedicion || prod.familia || 'unidad',
            stockDisp
        });
    }

    renderizarTicketActivoPos(true);
}

function calcularTotalesTicketPos() {
    const st = window.posState;
    const subtotal = Math.round(
        st.carrito.reduce((acc, it) => acc + (it.precioUnit * it.cantidad), 0) * 100
    ) / 100;
    const descPct = Math.min(100, Math.max(0, Number(st.descuentoPct) || 0));
    const descMonto = Math.round(subtotal * (descPct / 100) * 100) / 100;
    const baseNeta = Math.round(Math.max(0, subtotal - descMonto) * 100) / 100;

    let recargoPct = 0;
    let recargoMonto = 0;

    if (baseNeta > 0) {
        if (!st.pagoDividido && st.m1Tipo === 'Tarjeta Crédito') {
            recargoPct = Math.max(0, Number(st.m1RecargoPct) || 0);
            recargoMonto = Math.round(baseNeta * (recargoPct / 100) * 100) / 100;
        } else if (st.pagoDividido) {
            if (st.m1Tipo === 'Tarjeta Crédito' && st.m2Tipo === 'Tarjeta Crédito') {
                recargoPct = Math.max(0, Number(st.m1RecargoPct) || 0);
                recargoMonto = Math.round(baseNeta * (recargoPct / 100) * 100) / 100;
            } else if (st.m2Tipo === 'Tarjeta Crédito') {
                recargoPct = Math.max(0, Number(st.m2RecargoPct) || 0);
                const baseCred = Math.max(0, baseNeta - Math.max(0, Number(st.m1Monto) || 0));
                recargoMonto = Math.round(baseCred * (recargoPct / 100) * 100) / 100;
            } else if (st.m1Tipo === 'Tarjeta Crédito') {
                recargoPct = Math.max(0, Number(st.m1RecargoPct) || 0);
                const baseCred = Math.min(baseNeta, Math.max(0, Number(st.m1Monto) || 0));
                recargoMonto = Math.round(baseCred * (recargoPct / 100) * 100) / 100;
            }
        }
    }

    const total = Math.round((baseNeta + recargoMonto) * 100) / 100;
    return { subtotal, descPct, descMonto, baseNeta, recargoPct, recargoMonto, total };
}

function renderizarTicketActivoPos(autoSincronizarMonto1 = false) {
    const cont = document.getElementById('pos-ticket-items');
    const titleEl = document.getElementById('pos-ticket-title');
    if (!cont) return;

    const items = window.posState.carrito;
    if (titleEl) {
        titleEl.textContent = `TICKET ACTIVO (${items.length} ${items.length === 1 ? 'ÍTEM' : 'ÍTEMS'})`;
    }

    if (items.length === 0) {
        cont.innerHTML = `
            <div class="pos-ticket-empty">
                🛒 Escanea un código o agrega productos desde el catálogo para armar el ticket.
            </div>
        `;
    } else {
        cont.innerHTML = items.map(it => {
            const abrev = abrevUnidadPos(it.unidadMedida);
            const sub = Math.round(it.precioUnit * it.cantidad * 100) / 100;
            const step = (it.familiaMedicion === 'peso' || it.familiaMedicion === 'longitud') ? '0.001' : '1';

            return `
                <div class="pos-ticket-row" data-key="${escaparHtmlPos(it.key)}">
                    <img src="${it.imagen}" alt="${escaparHtmlPos(it.nombre)}" class="pos-ticket-thumb">
                    <div class="pos-ticket-info">
                        <div class="pos-ticket-name" title="${escaparHtmlPos(it.nombre)}">${escaparHtmlPos(it.nombre)}</div>
                        <div class="pos-ticket-meta">
                            <input type="number" class="pos-mini-qty" min="0.001" max="${it.stockDisp}" step="${step}" value="${it.cantidad}">
                            <span>${escaparHtmlPos(abrev)} × ${formatearMonedaPos(it.precioUnit)}</span>
                        </div>
                    </div>
                    <strong class="pos-ticket-sub">${formatearMonedaPos(sub)}</strong>
                    <button type="button" class="pos-ticket-del" title="Quitar ítem">🗑️</button>
                </div>
            `;
        }).join('');
    }

    actualizarCobroMixtoPos(autoSincronizarMonto1);
}

function actualizarCobroMixtoPos(autoSincronizarMonto1 = false) {
    const st = window.posState;
    const { subtotal, descPct, descMonto, recargoPct, recargoMonto, total } = calcularTotalesTicketPos();

    if (autoSincronizarMonto1 && !st.pagoDividido) {
        st.m1Monto = total;
        st.m1PagaCon = total;
        st.m2Monto = 0;
        const inpM1 = document.getElementById('pos-m1-monto');
        const inpP1 = document.getElementById('pos-m1-paga-con');
        if (inpM1) inpM1.value = total;
        if (inpP1) inpP1.value = total;
    }

    if (st.carrito.length === 0) {
        st.m1Monto = 0;
        st.m1PagaCon = 0;
        st.m2Monto = 0;
        st.m2PagaCon = 0;
        const setZero = (id) => { const el = document.getElementById(id); if (el) el.value = 0; };
        setZero('pos-m1-monto');
        setZero('pos-m1-paga-con');
        setZero('pos-m2-monto');
        setZero('pos-m2-paga-con');
    }

    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    const toggleEl = (id, show, disp = 'flex') => { const el = document.getElementById(id); if (el) el.style.display = show ? disp : 'none'; };

    setTxt('pos-val-subtotal', formatearMonedaPos(subtotal));
    setTxt('pos-val-total', formatearMonedaPos(total));

    toggleEl('pos-row-descuento', descPct > 0);
    setTxt('pos-lbl-descuento', `Descuento Global (${descPct}%)`);
    setTxt('pos-val-descuento', `-${formatearMonedaPos(descMonto)}`);

    toggleEl('pos-row-recargo', recargoMonto > 0);
    setTxt('pos-lbl-recargo', `Recargo Tarjeta Crédito (${recargoPct}%)`);
    setTxt('pos-val-recargo', `+${formatearMonedaPos(recargoMonto)}`);

    toggleEl('pos-m1-efvo-wrap', st.m1Tipo === 'Efectivo');
    toggleEl('pos-m1-vuelto-bar', st.m1Tipo === 'Efectivo');
    toggleEl('pos-m1-cred-wrap', st.m1Tipo === 'Tarjeta Crédito');

    toggleEl('pos-m2-box', st.pagoDividido);
    toggleEl('pos-m2-efvo-wrap', st.m2Tipo === 'Efectivo');
    toggleEl('pos-m2-vuelto-bar', st.m2Tipo === 'Efectivo');
    toggleEl('pos-m2-cred-wrap', st.m2Tipo === 'Tarjeta Crédito');
    toggleEl('pos-m2-ref-wrap', st.m2Tipo !== 'Efectivo' && st.m2Tipo !== 'Tarjeta Crédito');

    const m1Monto = Math.max(0, Number(st.m1Monto) || 0);
    const m1PagaCon = Math.max(0, Number(st.m1PagaCon) || 0);
    const vuelto1 = st.m1Tipo === 'Efectivo' ? Math.round(Math.max(0, m1PagaCon - m1Monto) * 100) / 100 : 0;
    setTxt('pos-m1-vuelto-val', formatearMonedaPos(vuelto1));

    const m2Monto = st.pagoDividido ? Math.max(0, Number(st.m2Monto) || 0) : 0;
    const m2PagaCon = Math.max(0, Number(st.m2PagaCon) || 0);
    const vuelto2 = (st.pagoDividido && st.m2Tipo === 'Efectivo') ? Math.round(Math.max(0, m2PagaCon - m2Monto) * 100) / 100 : 0;
    setTxt('pos-m2-vuelto-val', formatearMonedaPos(vuelto2));

    const cubierto = Math.round((m1Monto + m2Monto) * 100) / 100;
    const diferencia = Math.round((total - cubierto) * 100) / 100;
    const cuadrado = st.carrito.length > 0 && Math.abs(diferencia) <= 0.05;

    setTxt('pos-sum-total', formatearMonedaPos(total));
    setTxt('pos-sum-cubierto', formatearMonedaPos(cubierto));
    setTxt('pos-sum-pendiente', formatearMonedaPos(Math.max(0, diferencia)));

    const pill = document.getElementById('pos-pago-status-pill');
    if (pill) {
        if (st.carrito.length === 0) {
            pill.className = 'pos-cuadre-pill ok';
            pill.textContent = 'LISTO';
        } else if (cuadrado) {
            pill.className = 'pos-cuadre-pill ok';
            pill.textContent = 'CUADRADO PERFECTO';
        } else if (diferencia > 0.05) {
            pill.className = 'pos-cuadre-pill warn';
            pill.textContent = `FALTA ${formatearMonedaPos(diferencia)}`;
        } else {
            pill.className = 'pos-cuadre-pill err';
            pill.textContent = `EXCEDE ${formatearMonedaPos(Math.abs(diferencia))}`;
        }
    }

    const btnCobrar = document.getElementById('btn-pos-ir-cobro');
    if (btnCobrar) {
        btnCobrar.disabled = st.carrito.length === 0 || !obtenerTurnoActivoPos() || !cuadrado;
    }

    renderizarClienteAsignadoPos();
}

function confirmarVentaPos() {
    const st = window.posState;
    const turno = obtenerTurnoActivoPos();
    if (!turno) {
        abrirModalAperturaTurnoPos();
        return;
    }
    if (st.carrito.length === 0) return;

    const { subtotal, descPct, descMonto, recargoPct, recargoMonto, total } = calcularTotalesTicketPos();
    const m1Monto = Math.round(Math.max(0, Number(st.m1Monto) || 0) * 100) / 100;
    const m2Monto = st.pagoDividido ? Math.round(Math.max(0, Number(st.m2Monto) || 0) * 100) / 100 : 0;
    const cubierto = Math.round((m1Monto + m2Monto) * 100) / 100;

    if (Math.abs(total - cubierto) > 0.05) {
        alert(`El cobro no está cuadrado. Total: ${formatearMonedaPos(total)} • Cubierto: ${formatearMonedaPos(cubierto)}.`);
        return;
    }

    const pagos = [];
    if (m1Monto > 0) {
        pagos.push({
            medio: st.m1Tipo,
            monto: m1Monto,
            pagaCon: st.m1Tipo === 'Efectivo' ? Math.max(m1Monto, Number(st.m1PagaCon) || m1Monto) : m1Monto,
            vuelto: st.m1Tipo === 'Efectivo' ? Math.round(Math.max(0, (Number(st.m1PagaCon) || 0) - m1Monto) * 100) / 100 : 0,
            referencia: ''
        });
    }
    if (st.pagoDividido && m2Monto > 0) {
        pagos.push({
            medio: st.m2Tipo,
            monto: m2Monto,
            pagaCon: st.m2Tipo === 'Efectivo' ? Math.max(m2Monto, Number(st.m2PagaCon) || m2Monto) : m2Monto,
            vuelto: st.m2Tipo === 'Efectivo' ? Math.round(Math.max(0, (Number(st.m2PagaCon) || 0) - m2Monto) * 100) / 100 : 0,
            referencia: st.m2Ref || ''
        });
    }

    const montoFiado = Math.round(
        pagos.filter(p => p.medio === 'Cuenta Corriente').reduce((acc, p) => acc + p.monto, 0) * 100
    ) / 100;

    const clientes = obtenerClientesPos();
    const clienteObj = st.clienteId ? clientes.find(c => c.id === st.clienteId) : null;

    if (montoFiado > 0) {
        if (!clienteObj) {
            alert('Para cobrar en Cuenta Corriente / Fiado primero debes seleccionar un cliente.');
            abrirSelectorClientePos();
            return;
        }
        const saldoPrevio = Math.max(0, Number(clienteObj.saldoActual) || 0);
        const cupo = Math.max(0, Number(clienteObj.cupoMaximo) || 0);
        const nuevoSaldo = Math.round((saldoPrevio + montoFiado) * 100) / 100;

        if (clienteObj.bloqueadoPos) {
            const ok = confirm(`🔒 ${clienteObj.nombre} tiene el POS bloqueado para fiar.\n¿Autorizar igualmente un fiado de ${formatearMonedaPos(montoFiado)}?`);
            if (!ok) return;
        } else if (cupo > 0 && nuevoSaldo > cupo) {
            const ok = confirm(`⚠️ Este fiado llevará el saldo de ${clienteObj.nombre} a ${formatearMonedaPos(nuevoSaldo)}, superando su cupo de ${formatearMonedaPos(cupo)}.\n\n¿Autorizar y confirmar venta igual?`);
            if (!ok) return;
        }
    }

    const productos = obtenerProductosPos();
    let costoTotalVenta = 0;

    st.carrito.forEach(it => {
        costoTotalVenta += (Number(it.costoUnit) || 0) * it.cantidad;
        const prod = productos.find(p => String(p.id) === String(it.prodId));
        if (!prod) return;

        const vIdxReal = resolverIndiceVarianteEnProductoPos(prod, it);
        if (vIdxReal !== -1 && Array.isArray(prod.variantesDetalle) && prod.variantesDetalle[vIdxReal]) {
            const actualVar = Number(prod.variantesDetalle[vIdxReal].stock) || 0;
            prod.variantesDetalle[vIdxReal].stock = Math.round(Math.max(0, actualVar - it.cantidad) * 1000) / 1000;
            prod.stock = Math.round(prod.variantesDetalle.reduce((acc, v) => acc + (Number(v.stock) || 0), 0) * 1000) / 1000;
        } else {
            const actual = Number(prod.stock) || 0;
            prod.stock = Math.round(Math.max(0, actual - it.cantidad) * 1000) / 1000;
        }
        prod.actualizadoEn = new Date().toISOString();
    });
    // Dispara sync-privada.js -> sube variantesDetalle[] y stock total actualizados a Firestore
    guardarProductosPos();

    const ventas = obtenerVentasPos();
    const numTicket = `T-${String(ventas.length + 1).padStart(4, '0')}`;
    const fechaIso = new Date().toISOString();
    const vueltoTotal = Math.round(pagos.reduce((acc, p) => acc + (p.vuelto || 0), 0) * 100) / 100;

    const nuevaVenta = {
        id: 'vta-' + Date.now(),
        numeroTicket: numTicket,
        fecha: fechaIso,
        turnoId: turno.id,
        turnoNumero: turno.numero,
        operador: turno.operador,
        clienteId: clienteObj ? clienteObj.id : null,
        clienteNombre: clienteObj ? clienteObj.nombre : 'Consumidor Final',
        clienteTelefono: clienteObj ? (clienteObj.telefono || '') : '',
        items: JSON.parse(JSON.stringify(st.carrito)),
        subtotal,
        descuentoPct: descPct,
        descuentoMonto: descMonto,
        recargoPct,
        recargoMonto,
        total,
        costoTotal: Math.round(costoTotalVenta * 100) / 100,
        gananciaBruta: Math.round((total - costoTotalVenta) * 100) / 100,
        pagos,
        vueltoTotal,
        estado: 'completada'
    };

    ventas.unshift(nuevaVenta);
    guardarVentasPos(ventas);
    st.ultimaVentaId = nuevaVenta.id;

    if (montoFiado > 0 && clienteObj) {
        const nuevoSaldo = Math.round(((Number(clienteObj.saldoActual) || 0) + montoFiado) * 100) / 100;
        const resumenItems = st.carrito.slice(0, 2).map(it => it.nombre).join(' + ') + (st.carrito.length > 2 ? '…' : '');
        clienteObj.saldoActual = nuevoSaldo;
        if (!Array.isArray(clienteObj.movimientos)) clienteObj.movimientos = [];
        clienteObj.movimientos.unshift({
            id: 'mov-' + Date.now(),
            fecha: fechaIso,
            tipo: 'debito',
            concepto: `Venta POS ${numTicket} (${resumenItems})`,
            monto: montoFiado,
            medio: 'Cuenta Corriente',
            saldoResultante: nuevoSaldo
        });
        guardarClientesPos(clientes);
    }

    st.carrito = [];
    st.descuentoPct = 0;
    st.clienteId = null;
    st.pagoDividido = false;
    st.m1Tipo = 'Efectivo';
    st.m1Monto = 0;
    st.m1PagaCon = 0;
    st.m2Monto = 0;
    st.m2PagaCon = 0;
    st.m2Ref = '';

    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal('pos-m1-tipo', 'Efectivo');
    setVal('pos-m2-ref', '');
    const chkSplit = document.getElementById('pos-chk-pago-dividido');
    if (chkSplit) chkSplit.checked = false;

    renderizarCatalogoPos();
    renderizarClienteAsignadoPos();
    renderizarTicketActivoPos(true);

    const txtVuelto = vueltoTotal > 0 ? `\n💵 Vuelto a entregar: ${formatearMonedaPos(vueltoTotal)}` : '';
    const txtFiado = montoFiado > 0 ? `\n📒 Cargado a cuenta corriente: ${formatearMonedaPos(montoFiado)}` : '';
    alert(`✅ Venta ${numTicket} confirmada por ${formatearMonedaPos(total)} ARS.\nStock descontado automáticamente.${txtVuelto}${txtFiado}`);
}

function enviarTicketVentaWhatsAppPos(venta) {
    if (!venta) {
        alert('Todavía no registraste ninguna venta para enviar.');
        return;
    }

    const comercio = obtenerNombreComercioPos();
    const fechaTxt = new Date(venta.fecha).toLocaleString('es-AR');
    let msg = `🧾 *Comprobante ${venta.numeroTicket}* — *${comercio}*\n`;
    if (venta.estado === 'anulada') msg += `🚫 *[COMPROBANTE ANULADO]*\n`;
    msg += `📅 ${fechaTxt}\n`;
    if (venta.clienteNombre && venta.clienteNombre !== 'Consumidor Final') {
        msg += `👤 Cliente: ${venta.clienteNombre}\n`;
    }
    msg += `\n`;
    (venta.items || []).forEach(it => {
        const abrev = abrevUnidadPos(it.unidadMedida);
        const sub = Math.round(it.precioUnit * it.cantidad * 100) / 100;
        msg += `• ${it.nombre} (${formatearCantPos(it.cantidad, it.familiaMedicion, it.unidadMedida)} ${abrev}) — ${formatearMonedaPos(sub)}\n`;
    });
    if (venta.descuentoMonto > 0) msg += `\n🏷️ Descuento (${venta.descuentoPct}%): -${formatearMonedaPos(venta.descuentoMonto)}`;
    if (venta.recargoMonto > 0) msg += `\n💳 Recargo Crédito (${venta.recargoPct}%): +${formatearMonedaPos(venta.recargoMonto)}`;
    msg += `\n\n*TOTAL: ${formatearMonedaPos(venta.total)} ARS*\n`;
    msg += `Medios: ${(venta.pagos || []).map(p => `${p.medio} (${formatearMonedaPos(p.monto)})`).join(' + ')}\n`;
    msg += `\n¡Muchas gracias por tu compra!`;

    const tel = String(venta.clienteTelefono || '').replace(/[^\d]/g, '');
    const url = tel
        ? `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener');
}

function enviarUltimoTicketWhatsAppPos() {
    const ventas = obtenerVentasPos();
    const venta = window.posState.ultimaVentaId
        ? ventas.find(v => v.id === window.posState.ultimaVentaId)
        : ventas[0];
    enviarTicketVentaWhatsAppPos(venta);
}

/* ==========================================================================
   ETAPA 3A: PANEL LATERAL DE ARQUEO DE CAJA & CONTEO CIEGO (F9)
   ========================================================================== */
function asegurarBotonCierreEnArqueoPos() {
    const foot = document.querySelector('#drawer-pos-arqueo .pos-drawer-footer');
    if (!foot || document.getElementById('btn-pos-arq-cerrar-turno')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-pos-arq-cerrar-turno';
    btn.className = 'pos-btn pos-btn-danger-solid';
    btn.textContent = '🔒 Cerrar Turno';
    btn.title = 'Guardar este arqueo y cerrar el turno actual (Corte Z)';
    btn.addEventListener('click', () => {
        const { totalDeclarado } = obtenerDetalleBilletesArqueo();
        if (totalDeclarado > 0) {
            guardarArqueoParcialTurnoPos(true);
        }
        cerrarPanelArqueoPos();
        ejecutarCierreDefinitivoCorteZ();
    });
    foot.appendChild(btn);
}

function precargarBilletesDesdeTurnoPos(turno) {
    const inputs = document.querySelectorAll('#pos-billetes-grid input');
    inputs.forEach(inp => { inp.value = '0'; });

    const arq = turno?.ultimoArqueo;
    if (!arq) return;

    const det = arq.detalleBilletes || {};
    const tieneBilletes = Object.keys(det).length > 0;
    if (tieneBilletes) {
        document.querySelectorAll('#pos-billetes-grid .pos-bill-inp').forEach(inp => {
            const denom = inp.getAttribute('data-denom');
            if (denom && det[denom]) inp.value = String(det[denom]);
        });
        const monInp = document.getElementById('bill-monedas');
        if (monInp && det.monedas) monInp.value = String(det.monedas);
    } else if (Number(arq.totalDeclarado) > 0) {
        const monInp = document.getElementById('bill-monedas');
        if (monInp) monInp.value = String(arq.totalDeclarado);
    }
}

function abrirPanelArqueoPos() {
    const turno = obtenerTurnoActivoPos();
    if (!turno) {
        alert('Primero debes abrir un turno de caja para realizar un arqueo.');
        abrirModalAperturaTurnoPos();
        return;
    }

    const drawer = document.getElementById('drawer-pos-arqueo');
    if (!drawer) return;

    asegurarBotonCierreEnArqueoPos();
    document.getElementById('pos-arq-sub').textContent = `${turno.nombre} (#${turno.numero}) • ${turno.operador}`;
    const chkCiego = document.getElementById('pos-chk-modo-ciego');
    if (chkCiego) chkCiego.checked = !!window.posState.modoCiego;

    precargarBilletesDesdeTurnoPos(turno);
    actualizarDatosArqueoPos();
    drawer.classList.add('active');
}

function cerrarPanelArqueoPos() {
    document.getElementById('drawer-pos-arqueo')?.classList.remove('active');
}

function obtenerDetalleBilletesArqueo() {
    const detalle = {};
    let total = 0;

    document.querySelectorAll('#pos-billetes-grid .pos-bill-inp').forEach(inp => {
        const denom = parseInt(inp.getAttribute('data-denom'), 10) || 0;
        const cant = Math.max(0, parseInt(inp.value, 10) || 0);
        if (cant > 0) detalle[denom] = cant;
        total += denom * cant;
    });

    const monedas = Math.max(0, parseFloat(document.getElementById('bill-monedas')?.value) || 0);
    if (monedas > 0) detalle.monedas = monedas;
    total = Math.round((total + monedas) * 100) / 100;

    return { detalle, totalDeclarado: total };
}

function dibujarCurvaFlujoArqueo(serie) {
    const canvas = document.getElementById('pos-arqueo-chart');
    if (!canvas || typeof Chart !== 'function') return;

    if (posArqueoChartInstance) {
        posArqueoChartInstance.destroy();
        posArqueoChartInstance = null;
    }

    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 90);
    grad.addColorStop(0, 'rgba(4, 120, 87, 0.25)');
    grad.addColorStop(1, 'rgba(4, 120, 87, 0.0)');

    posArqueoChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: serie.map((_, idx) => idx === 0 ? 'Apertura' : `Mov ${idx}`),
            datasets: [{
                data: serie,
                borderColor: '#047857',
                borderWidth: 2.5,
                backgroundColor: grad,
                fill: true,
                tension: 0.35,
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: !window.posState.modoCiego } },
            scales: { x: { display: false }, y: { display: false } }
        }
    });
}

function actualizarDatosArqueoPos() {
    const turno = obtenerTurnoActivoPos();
    if (!turno) return;

    const flujos = calcularFlujosTurnoPos(turno);
    const ciego = !!window.posState.modoCiego;

    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    setTxt('arq-val-fondo', formatearMonedaPos(flujos.fondoInicial));
    setTxt('arq-val-ventas-efvo', `+${formatearMonedaPos(flujos.ventasEfectivo)}`);
    setTxt('arq-val-retiros', `-${formatearMonedaPos(flujos.totalRetiros)}`);
    setTxt('arq-val-teorico', formatearMonedaPos(flujos.efectivoTeorico));

    document.getElementById('pos-arq-flow-list')?.classList.toggle('pos-arq-blind', ciego);
    document.getElementById('arq-val-teorico')?.classList.toggle('pos-arq-blind', ciego);

    dibujarCurvaFlujoArqueo(flujos.serieFlujo);
    recalcularDiferenciaArqueoPos();
}

function recalcularDiferenciaArqueoPos() {
    const turno = obtenerTurnoActivoPos();
    if (!turno) return;

    const flujos = calcularFlujosTurnoPos(turno);
    const { totalDeclarado } = obtenerDetalleBilletesArqueo();
    const ciego = !!window.posState.modoCiego;

    document.getElementById('arq-val-declarado').textContent = formatearMonedaPos(totalDeclarado);

    const diffBar = document.getElementById('pos-arq-diff-bar');
    const diffLbl = document.getElementById('arq-diff-label');
    const diffVal = document.getElementById('arq-diff-val');
    if (!diffBar || !diffLbl || !diffVal) return;

    if (ciego) {
        diffBar.className = 'pos-arq-diff-bar blind';
        diffLbl.textContent = '🙈 Modo Ciego activo (desactívalo o guarda para comparar)';
        diffVal.textContent = '•••';
        return;
    }

    const diff = Math.round((totalDeclarado - flujos.efectivoTeorico) * 100) / 100;
    if (Math.abs(diff) <= 0.05) {
        diffBar.className = 'pos-arq-diff-bar ok';
        diffLbl.textContent = '✅ Caja Cuadrada Exacta';
        diffVal.textContent = '$0';
    } else if (diff > 0) {
        diffBar.className = 'pos-arq-diff-bar warn';
        diffLbl.textContent = '⚠️ Sobrante en Gaveta';
        diffVal.textContent = `+${formatearMonedaPos(diff)}`;
    } else {
        diffBar.className = 'pos-arq-diff-bar err';
        diffLbl.textContent = '🔴 Faltante en Gaveta';
        diffVal.textContent = `-${formatearMonedaPos(Math.abs(diff))}`;
    }
}

function limpiarConteoBilletesPos() {
    document.querySelectorAll('#pos-billetes-grid input').forEach(inp => { inp.value = '0'; });
    recalcularDiferenciaArqueoPos();
}

function guardarArqueoParcialTurnoPos(silencioso = false) {
    const turnos = obtenerTurnosPos();
    const turno = turnos.find(t => t && (t.estado === 'abierto' || t.estado === 'abierta'));
    if (!turno) return;

    const flujos = calcularFlujosTurnoPos(turno);
    const { detalle, totalDeclarado } = obtenerDetalleBilletesArqueo();
    const diferencia = Math.round((totalDeclarado - flujos.efectivoTeorico) * 100) / 100;

    if (!Array.isArray(turno.arqueos)) turno.arqueos = [];
    const registro = {
        id: 'arq-' + Date.now(),
        fecha: new Date().toISOString(),
        operador: turno.operador,
        efectivoTeorico: flujos.efectivoTeorico,
        totalDeclarado,
        diferencia,
        detalleBilletes: detalle,
        fueCiego: !!window.posState.modoCiego
    };

    turno.arqueos.unshift(registro);
    turno.ultimoArqueo = registro;
    turno.contadoReal = totalDeclarado;
    turno.totalContado = totalDeclarado;
    turno.totalEsperado = flujos.efectivoTeorico;
    turno.diferencia = diferencia;
    turno.diferencias = { Efectivo: diferencia };
    guardarTurnosPos(turnos);

    window.posState.modoCiego = false;
    const chk = document.getElementById('pos-chk-modo-ciego');
    if (chk) chk.checked = false;
    actualizarDatosArqueoPos();

    if (document.getElementById('modal-pos-corte-x')?.classList.contains('active')) {
        renderizarContenidoCorteXPos();
    }
    if (document.getElementById('finanzas-module-root') && typeof window.renderizarTodoFinanzas === 'function') {
        window.renderizarTodoFinanzas();
    }

    if (!silencioso) {
        const estadoTxt = Math.abs(diferencia) <= 0.05
            ? '✅ Caja Cuadrada Exacta ($0 de diferencia).'
            : (diferencia > 0
                ? `⚠️ Sobrante detectado: +${formatearMonedaPos(diferencia)} ARS.`
                : `🔴 Faltante detectado: -${formatearMonedaPos(Math.abs(diferencia))} ARS.`);

        alert(`💾 Arqueo guardado en el Turno #${turno.numero}.\nDeclarado: ${formatearMonedaPos(totalDeclarado)} | Teórico: ${formatearMonedaPos(flujos.efectivoTeorico)}\n${estadoTxt}`);
    }
}

/* ==========================================================================
   ETAPA 3B: RETIROS Y GASTOS DE GAVETA (F8)
   ========================================================================== */
function abrirModalRetiroCajaPos(presetTipo = null, presetMonto = null, presetMotivo = null) {
    const turno = obtenerTurnoActivoPos();
    if (!turno) {
        alert('Primero debes abrir un turno de caja para registrar retiros o gastos.');
        abrirModalAperturaTurnoPos();
        return;
    }

    document.getElementById('form-pos-retiro')?.reset();
    if (presetTipo) document.getElementById('pos-ret-tipo').value = presetTipo;
    if (presetMonto) document.getElementById('pos-ret-monto').value = presetMonto;
    if (presetMotivo) document.getElementById('pos-ret-motivo').value = presetMotivo;

    renderizarHistorialRetirosTurnoPos();
    document.getElementById('modal-pos-retiro')?.classList.add('active');
    document.getElementById('pos-ret-monto')?.focus();
}

function cerrarModalRetiroCajaPos() {
    document.getElementById('modal-pos-retiro')?.classList.remove('active');
}

function renderizarHistorialRetirosTurnoPos() {
    const turno = obtenerTurnoActivoPos();
    if (!turno) return;

    const flujos = calcularFlujosTurnoPos(turno);
    const elDisp = document.getElementById('pos-ret-teorico-disp');
    if (elDisp) elDisp.textContent = `${formatearMonedaPos(flujos.efectivoTeorico)} ARS`;

    const retiros = Array.isArray(turno.retiros) ? turno.retiros : [];
    const elTitle = document.getElementById('pos-ret-hist-title');
    const cont = document.getElementById('pos-ret-hist-list');
    if (elTitle) elTitle.textContent = `Movimientos de salida en este turno (${retiros.length})`;
    if (!cont) return;

    if (retiros.length === 0) {
        cont.innerHTML = `<div style="text-align:center; padding:1rem; color:#64748b; font-size:0.78rem;">No se registraron retiros ni gastos en este turno.</div>`;
        return;
    }

    cont.innerHTML = retiros.map(r => `
        <div class="pos-ret-item" data-ret-id="${escaparHtmlPos(r.id)}">
            <div>
                <strong>${escaparHtmlPos(r.tipo)} • ${escaparHtmlPos(r.motivo)}</strong>
                <span>${new Date(r.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} • ${escaparHtmlPos(r.operador || turno.operador)}</span>
            </div>
            <div style="display:flex; align-items:center; gap:0.5rem;">
                <strong class="text-danger">-${formatearMonedaPos(r.monto)}</strong>
                <button type="button" class="pos-ticket-del btn-del-retiro" title="Eliminar salida">🗑️</button>
            </div>
        </div>
    `).join('');
}

function guardarRetiroCajaFormulario(e) {
    e.preventDefault();

    const turnos = obtenerTurnosPos();
    const turno = turnos.find(t => t && (t.estado === 'abierto' || t.estado === 'abierta'));
    if (!turno) return;

    const tipo = document.getElementById('pos-ret-tipo')?.value || 'Gasto Menor';
    const monto = Math.round((parseFloat(document.getElementById('pos-ret-monto')?.value) || 0) * 100) / 100;
    const motivo = document.getElementById('pos-ret-motivo')?.value.trim() || 'Salida de efectivo';

    if (monto <= 0) {
        alert('Ingresa un monto mayor a $0.');
        return;
    }

    if (!Array.isArray(turno.retiros)) turno.retiros = [];
    turno.retiros.unshift({
        id: 'ret-' + Date.now(),
        fecha: new Date().toISOString(),
        tipo,
        monto,
        motivo,
        operador: turno.operador
    });

    guardarTurnosPos(turnos);
    document.getElementById('form-pos-retiro')?.reset();
    renderizarHistorialRetirosTurnoPos();

    if (document.getElementById('drawer-pos-arqueo')?.classList.contains('active')) actualizarDatosArqueoPos();
    if (document.getElementById('modal-pos-corte-x')?.classList.contains('active')) renderizarContenidoCorteXPos();
}

/* ==========================================================================
   ETAPA 4: REPORTE INTERMEDIO (CORTE X), ALERTA DE GAVETA Y CIERRE Z
   ========================================================================== */
function abrirReporteCorteXPos() {
    const modal = document.getElementById('modal-pos-corte-x');
    if (!modal) return;

    const turno = obtenerTurnoActivoPos();
    const mainView = document.getElementById('pos-cx-main-view');
    const histView = document.getElementById('pos-cx-hist-view');

    if (!turno) {
        if (mainView) mainView.style.display = 'none';
        if (histView) histView.style.display = 'flex';
        document.getElementById('pos-cx-title').textContent = 'Historial de Turnos Cerrados (Cortes Z)';
        document.getElementById('pos-cx-estado-pill').textContent = '● CAJA CERRADA';
        renderizarHistorialTurnosCerrados();
        modal.classList.add('active');
        return;
    }

    if (mainView) mainView.style.display = 'flex';
    if (histView) histView.style.display = 'none';

    const inpUmbral = document.getElementById('cx-umbral-gaveta');
    if (inpUmbral) inpUmbral.value = window.posState.umbralGaveta;

    renderizarContenidoCorteXPos();
    modal.classList.add('active');
}

function cerrarReporteCorteXPos() {
    document.getElementById('modal-pos-corte-x')?.classList.remove('active');
}

function padLineThermal(izq, der, ancho = 40) {
    const sDer = String(der || '');
    const maxIzq = Math.max(1, ancho - sDer.length - 1);
    const sIzq = String(izq || '').slice(0, maxIzq);
    const esp = Math.max(1, ancho - sIzq.length - sDer.length);
    return sIzq + ' '.repeat(esp) + sDer;
}

function centrarLineaThermal(texto, ancho = 40) {
    const s = String(texto || '').slice(0, ancho);
    const izq = Math.max(0, Math.floor((ancho - s.length) / 2));
    return ' '.repeat(izq) + s;
}

function construirTextoTicketCorteX(turno, res, esCorteZ = false) {
    const comercio = obtenerNombreComercioPos().toUpperCase();
    const ahoraTxt = new Date().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    const apTxt = new Date(turno.fechaApertura).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const titulo = esCorteZ ? 'CIERRE DEFINITIVO (CORTE Z)' : 'CORTE PARCIAL DE CAJA (CORTE X)';

    const lines = [
        centrarLineaThermal(`[ ${comercio} ]`, 40),
        centrarLineaThermal(titulo, 40),
        '========================================',
        padLineThermal(`TURNO: #${turno.numero}`, `HORA: ${ahoraTxt.split(',')[1]?.trim() || ahoraTxt}`, 40),
        padLineThermal(`CAJERO: ${(turno.operador || '').slice(0, 18)}`, `AP: ${apTxt}`, 40),
        '----------------------------------------',
        padLineThermal('BASE INICIAL (FONDO):', formatearMonedaPos(res.fondoInicial), 40),
        padLineThermal(`VENTAS TOTALES (${res.cantTickets} TX):`, formatearMonedaPos(res.recaudacionNeta), 40),
        '----------------------------------------',
        'DESGLOSE MEDIOS DE PAGO:'
    ];

    res.desgloseMedios.forEach(m => {
        lines.push(padLineThermal(` - ${m.medio} (${m.ops}):`, formatearMonedaPos(m.monto), 40));
    });

    lines.push('----------------------------------------');
    lines.push(padLineThermal('RETIROS / GASTOS CAJA:', `-${formatearMonedaPos(res.totalRetiros)}`, 40));
    lines.push('========================================');
    lines.push(padLineThermal('EFECTIVO TEORICO GAVETA:', formatearMonedaPos(res.efectivoTeorico), 40));

    const arqRef = turno.arqueoFinal || turno.ultimoArqueo;
    if (arqRef) {
        const decl = Number(arqRef.totalDeclarado ?? turno.contadoReal ?? res.efectivoTeorico) || 0;
        const d = Math.round((decl - res.efectivoTeorico) * 100) / 100;
        lines.push(padLineThermal('CONTEO FISICO DECLARADO:', formatearMonedaPos(decl), 40));
        const dTxt = Math.abs(d) <= 0.05 ? '$0 (OK)' : `${d > 0 ? '+' : '-'}${formatearMonedaPos(Math.abs(d))}`;
        lines.push(padLineThermal('DIFERENCIA ARQUEO:', dTxt, 40));
    }

    lines.push('----------------------------------------');
    lines.push(padLineThermal('TICKET PROMEDIO:', formatearMonedaPos(res.ticketPromedio), 40));
    lines.push(padLineThermal('MARGEN BRUTO EST.:', `${res.margenPct}%`, 40));
    lines.push('----------------------------------------');
    lines.push(centrarLineaThermal('DOCUMENTO NO FISCAL CONTROL INTERNO', 40));
    lines.push(centrarLineaThermal(`EMITIDO: ${ahoraTxt}`, 40));
    return lines.join('\n');
}

function descargarPdfCorte80mm(turno, res, esCorteZ = false) {
    const jsPDFCtor = window.jspdf?.jsPDF;
    if (!jsPDFCtor) {
        console.warn('No se cargó la librería jsPDF.');
        return;
    }

    const texto = construirTextoTicketCorteX(turno, res, esCorteZ);
    const lineas = texto.split('\n');
    const altoMm = Math.max(125, lineas.length * 4.5 + 16);
    const doc = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: [80, altoMm] });

    doc.setFont('courier', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(15, 23, 42);

    let y = 9;
    lineas.forEach(l => {
        doc.text(l, 4, y);
        y += 4.3;
    });

    const prefijo = esCorteZ ? 'corte-z-cierre' : 'corte-x-parcial';
    doc.save(`${prefijo}-turno-${turno.numero}.pdf`);
}

function renderizarContenidoCorteXPos() {
    const turno = obtenerTurnoActivoPos();
    if (!turno) return;

    const res = calcularResumenCorteXPos(turno);
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

    setTxt('pos-cx-estado-pill', '● TURNO EN CURSO (ACTIVO)');
    setTxt('pos-cx-operador-pill', `👤 Operador: ${turno.operador}`);
    setTxt('pos-cx-apertura-pill', `🕒 Apertura: ${new Date(turno.fechaApertura).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`);
    setTxt('pos-cx-fondo-pill', `💵 Fondo inicial: ${formatearMonedaPos(res.fondoInicial)}`);
    setTxt('pos-cx-title', `Reporte Intermedio de Ventas • ${turno.nombre} (#${turno.numero}) — Corte X`);

    setTxt('cx-kpi-recaudacion', formatearMonedaPos(res.recaudacionNeta));
    setTxt('cx-kpi-tickets', `${res.cantTickets} ${res.cantTickets === 1 ? 'ticket emitido' : 'tickets emitidos'}`);
    setTxt('cx-kpi-efectivo', formatearMonedaPos(res.efectivoTeorico));
    setTxt('cx-kpi-efvo-formula', `Base ${formatearMonedaPos(res.fondoInicial)} + Efvo ${formatearMonedaPos(res.ventasEfectivo)} − Ret ${formatearMonedaPos(res.totalRetiros)}`);
    setTxt('cx-kpi-promedio', formatearMonedaPos(res.ticketPromedio));
    setTxt('cx-kpi-unidades', `${res.unidadesVendidas} unidades/kg`);
    setTxt('cx-kpi-items-por-ticket', `${res.itemsPorTicket} art./ticket`);
    setTxt('cx-kpi-margen', `${res.margenPct}%`);
    setTxt('cx-kpi-ganancia', `+${formatearMonedaPos(res.gananciaBruta)}`);

    setTxt('cx-medios-count', `${res.desgloseMedios.length} métodos`);
    const mediosCont = document.getElementById('cx-medios-list');
    if (mediosCont) {
        mediosCont.innerHTML = res.desgloseMedios.map(m => `
            <div class="pos-cx-medio-row">
                <div class="pos-cx-medio-left">
                    <strong>${m.icono} ${escaparHtmlPos(m.medio)} <span class="pos-cx-pct-tag">${m.porcentaje}%</span></strong>
                    <small>${m.ops} ${m.ops === 1 ? 'operación' : 'operaciones'} • ${escaparHtmlPos(m.desc)}</small>
                </div>
                <strong class="pos-cx-medio-monto">${formatearMonedaPos(m.monto)}</strong>
            </div>
        `).join('');
    }

    setTxt('cx-concil-facturacion', formatearMonedaPos(res.recaudacionNeta));
    setTxt('cx-concil-retiros', `-${formatearMonedaPos(res.totalRetiros)}`);
    setTxt('cx-concil-fondo', `+${formatearMonedaPos(res.fondoInicial)}`);
    setTxt('cx-concil-efvo-final', `${formatearMonedaPos(res.efectivoTeorico)} ARS`);

    const topTbody = document.getElementById('cx-top-productos-tbody');
    if (topTbody) {
        if (res.topProductos.length === 0) {
            topTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#64748b; padding:1.2rem;">Todavía no se registraron ventas en este turno.</td></tr>`;
        } else {
            topTbody.innerHTML = res.topProductos.map(p => {
                const abrev = abrevUnidadPos(p.unidadMedida);
                const cantTxt = `${formatearCantPos(p.cantidad, p.familiaMedicion, p.unidadMedida)} ${abrev}`;
                const prom = p.cantidad > 0 ? Math.round((p.subtotal / p.cantidad) * 100) / 100 : 0;
                return `
                    <tr>
                        <td>
                            <strong>${escaparHtmlPos(p.nombre)}</strong>
                            <div style="font-size:0.68rem; color:#64748b;">SKU: ${escaparHtmlPos(p.sku)}</div>
                        </td>
                        <td><strong>${escaparHtmlPos(cantTxt)}</strong></td>
                        <td>${formatearMonedaPos(prom)}/${escaparHtmlPos(abrev)}</td>
                        <td style="text-align:right; font-weight:800;">${formatearMonedaPos(p.subtotal)}</td>
                    </tr>
                `;
            }).join('');
        }
    }

    const preEl = document.getElementById('cx-thermal-preview');
    if (preEl) preEl.textContent = construirTextoTicketCorteX(turno, res, false);

    const umbral = Math.max(0, Number(window.posState.umbralGaveta) || 75000);
    const superado = umbral > 0 && res.efectivoTeorico >= umbral;
    const alertBox = document.getElementById('cx-gaveta-alert-box');
    const alertTitle = document.getElementById('cx-gaveta-alert-title');
    const alertBadge = document.getElementById('cx-gaveta-alert-badge');
    const alertMsg = document.getElementById('cx-gaveta-alert-msg');
    const btnCustodia = document.getElementById('btn-cx-retiro-custodia');

    if (alertBox) alertBox.classList.toggle('is-exceeded', superado);
    if (alertTitle) alertTitle.textContent = superado ? '⚠️ ALERTA DE CAPACIDAD DE GAVETA' : '✅ Capacidad de Gaveta Segura';
    if (alertBadge) alertBadge.textContent = superado ? 'Límite Superado' : 'Normal';
    if (alertMsg) {
        alertMsg.textContent = superado
            ? `El efectivo físico estimado (${formatearMonedaPos(res.efectivoTeorico)}) supera tu umbral de seguridad (${formatearMonedaPos(umbral)}). Se recomienda efectuar un retiro a caja fuerte.`
            : `El efectivo estimado (${formatearMonedaPos(res.efectivoTeorico)}) se encuentra dentro del límite seguro (${formatearMonedaPos(umbral)}).`;
    }
    if (btnCustodia) {
        if (superado) {
            const sugerido = Math.max(1000, Math.round((res.efectivoTeorico - res.fondoInicial) / 1000) * 1000);
            btnCustodia.style.display = 'inline-flex';
            btnCustodia.dataset.sugerido = sugerido;
            btnCustodia.textContent = `🔐 Realizar Retiro de Custodia (${formatearMonedaPos(sugerido)})`;
        } else {
            btnCustodia.style.display = 'none';
        }
    }
}

async function ejecutarCierreDefinitivoCorteZ() {
    const pro = window.CatAlogoAjustes?.obtenerConfigPro?.();
    if (pro?.seguridadPin?.activo && pro?.seguridadPin?.protegerAnulacionPos) {
        const okPin = await window.CatAlogoAjustes.verificarPinAdmin('cerrar el turno (Corte Z)');
        if (!okPin) return;
    }

    const turnos = obtenerTurnosPos();
    const turno = turnos.find(t => t && (t.estado === 'abierto' || t.estado === 'abierta'));
    if (!turno) {
        alert('No hay ningún turno abierto para cerrar.');
        return;
    }

    const res = calcularResumenCorteXPos(turno);
    const totalDeclarado = turno.ultimoArqueo
        ? Number(turno.ultimoArqueo.totalDeclarado)
        : (turno.contadoReal !== undefined && turno.contadoReal !== null ? Number(turno.contadoReal) : res.efectivoTeorico);
    const diferenciaFinal = Math.round((totalDeclarado - res.efectivoTeorico) * 100) / 100;

    const avisoArqueo = turno.ultimoArqueo
        ? `Último arqueo físico: ${formatearMonedaPos(totalDeclarado)} (Dif: ${formatearMonedaPos(diferenciaFinal)})`
        : `Sin arqueo previo: se cerrará igualado al teórico (${formatearMonedaPos(res.efectivoTeorico)}).`;

    const confirmar = confirm(
        `🔒 ¿Confirmar CIERRE DEFINITIVO (Corte Z) del Turno #${turno.numero} (${turno.operador})?\n\n` +
        `• Recaudación Neta: ${formatearMonedaPos(res.recaudacionNeta)} (${res.cantTickets} tickets)\n` +
        `• Efectivo Teórico en Gaveta: ${formatearMonedaPos(res.efectivoTeorico)}\n` +
        `• ${avisoArqueo}\n\n` +
        `El turno quedará congelado en PC y App Móvil y se descargará el comprobante Corte Z (80mm).`
    );
    if (!confirmar) return;

    const ahoraIso = new Date().toISOString();
    const arqueoFinalObj = {
        id: turno.ultimoArqueo?.id || ('arq-z-' + Date.now()),
        fecha: ahoraIso,
        operador: turno.operador || 'Cajero',
        efectivoTeorico: res.efectivoTeorico,
        totalDeclarado,
        diferencia: diferenciaFinal,
        detalleBilletes: turno.ultimoArqueo?.detalleBilletes || {},
        fueCiego: !!turno.ultimoArqueo?.fueCiego
    };

    turno.estado = 'cerrado';
    turno.estadoApp = 'cerrada';
    turno.abierto = false;
    turno.fechaCierre = ahoraIso;
    turno.dispositivoCierre = 'web_pc';
    turno.ultimoArqueo = arqueoFinalObj;
    turno.arqueoFinal = arqueoFinalObj;
    turno.contadoReal = totalDeclarado;
    turno.totalContado = totalDeclarado;
    turno.totalEsperado = res.efectivoTeorico;
    turno.diferencia = diferenciaFinal;
    turno.diferencias = { Efectivo: diferenciaFinal };
    turno.notasCierre = turno.notasCierre || '';
    turno.resumenCierre = {
        cantTickets: res.cantTickets,
        recaudacionNeta: res.recaudacionNeta,
        efectivoTeorico: res.efectivoTeorico,
        totalDeclarado,
        diferencia: diferenciaFinal,
        ventasEfectivo: res.ventasEfectivo,
        totalRetiros: res.totalRetiros,
        gananciaBruta: res.gananciaBruta,
        margenPct: res.margenPct,
        ticketPromedio: res.ticketPromedio,
        desgloseMedios: res.desgloseMedios
    };

    guardarTurnosPos(turnos);

    try {
        descargarPdfCorte80mm(turno, res, true);
    } catch (errPdf) {
        console.warn('No se pudo descargar el PDF Corte Z:', errPdf);
    }

    window.CatAlogoAjustes?.ejecutarAutoRespaldoCierreCaja?.(turno.numero);
    window.CatAlogoSync?.procesarColaPendiente?.();

    cerrarReporteCorteXPos();
    cerrarPanelArqueoPos();
    renderizarEstadoCajaPos();
    renderizarTicketActivoPos(false);
    if (document.getElementById('finanzas-module-root') && typeof window.renderizarTodoFinanzas === 'function') {
        window.renderizarTodoFinanzas();
    }
    alert(`✅ Turno #${turno.numero} cerrado correctamente (Corte Z descargado y sincronizado con la App).\nYa puedes abrir un nuevo turno de caja cuando lo necesites.`);
}

function renderizarHistorialTurnosCerrados() {
    const cont = document.getElementById('cx-turnos-cerrados-list');
    if (!cont) return;

    const cerrados = obtenerTurnosPos().filter(t => t.estado === 'cerrado');
    if (cerrados.length === 0) {
        cont.innerHTML = `<div style="text-align:center; padding:2rem; color:#64748b; font-size:0.84rem;">Todavía no hay turnos cerrados (Cortes Z) en el historial.</div>`;
        return;
    }

    cont.innerHTML = cerrados.map(t => {
        const rc = t.resumenCierre || calcularResumenCorteXPos(t);
        const fAp = new Date(t.fechaApertura).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const fCi = t.fechaCierre ? new Date(t.fechaCierre).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—';

        return `
            <div class="pos-cx-hist-item" data-turno-id="${escaparHtmlPos(t.id)}">
                <div>
                    <strong>Turno #${t.numero} • ${escaparHtmlPos(t.nombre)} (${escaparHtmlPos(t.operador)})</strong>
                    <small>Apertura: ${fAp} • Cierre: ${fCi} • ${rc.cantTickets || 0} tickets • Margen: ${rc.margenPct || 0}%</small>
                </div>
                <div style="display:flex; align-items:center; gap:0.85rem;">
                    <div style="text-align:right;">
                        <strong class="text-emerald" style="display:block;">Facturado: ${formatearMonedaPos(rc.recaudacionNeta)}</strong>
                        <small>Efectivo cierre: ${formatearMonedaPos(rc.efectivoTeorico)}</small>
                    </div>
                    <button type="button" class="pos-btn pos-btn-light pos-btn-xs btn-reimprimir-z">🧾 PDF Corte Z</button>
                </div>
            </div>
        `;
    }).join('');
}

/* ==========================================================================
   ETAPA 5: AUDITORÍA DE TICKETS TÉRMICOS (80MM / 58MM), IMPRESIÓN Y ANULACIÓN
   ========================================================================== */
function abrirModalAuditoriaTicketsPos(ventaIdInicial = null) {
    const modal = document.getElementById('modal-pos-auditoria-tickets');
    if (!modal) return;

    const turno = obtenerTurnoActivoPos();
    const ventas = obtenerVentasPos();
    const hayEnTurno = turno && ventas.some(v => String(v.turnoId || v.cajaId || '') === String(turno.id));

    window.posState.audTab = hayEnTurno ? 'turno' : 'todas';
    window.posState.audBusqueda = '';
    window.posState.audLimite = 30;
    window.posState.audVentaId = ventaIdInicial || window.posState.ultimaVentaId || (ventas[0]?.id || null);

    const inp = document.getElementById('pos-aud-search');
    if (inp) inp.value = '';

    document.querySelectorAll('.pos-aud-tab').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-audtab') === window.posState.audTab);
    });
    document.querySelectorAll('.pos-aud-wbtn').forEach(b => {
        b.classList.toggle('active', parseInt(b.getAttribute('data-width'), 10) === window.posState.audAnchoMm);
    });

    renderizarAuditoriaTicketsPos();
    modal.classList.add('active');
}

function cerrarModalAuditoriaTicketsPos() {
    document.getElementById('modal-pos-auditoria-tickets')?.classList.remove('active');
}

function construirTextoTicketVentaThermal(venta, anchoMm = 80) {
    const cols = anchoMm === 58 ? 30 : 40;
    const sepEq = '='.repeat(cols);
    const sepGu = '-'.repeat(cols);
    const comercio = obtenerDatosComercioPos();
    const fechaTxt = new Date(venta.fecha).toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
    });

    const lines = [
        centrarLineaThermal(comercio.nombre.toUpperCase(), cols)
    ];
    if (comercio.contacto) {
        lines.push(centrarLineaThermal(comercio.contacto, cols));
    }
    lines.push(centrarLineaThermal('COMPROBANTE NO FISCAL', cols));
    lines.push(sepEq);
    lines.push(padLineThermal(`TICKET: ${venta.numeroTicket}`, `T#${venta.turnoNumero || ''}`, cols));
    lines.push(padLineThermal(`FECHA: ${fechaTxt}`, '', cols));
    lines.push(padLineThermal(`CAJERO: ${venta.operador || 'Cajero'}`, '', cols));
    if (venta.clienteNombre && venta.clienteNombre !== 'Consumidor Final') {
        lines.push(padLineThermal(`CLIENTE: ${venta.clienteNombre}`, '', cols));
    }
    lines.push(sepGu);
    lines.push(padLineThermal('CANT x DESCRIPCION', 'SUBTOTAL', cols));
    lines.push(sepGu);

    (venta.items || []).forEach(it => {
        const abrev = abrevUnidadPos(it.unidadMedida);
        const cantStr = `${formatearCantPos(it.cantidad, it.familiaMedicion, it.unidadMedida)}${abrev}`;
        const sub = Math.round(it.precioUnit * it.cantidad * 100) / 100;
        const nombreLimpio = String(it.nombre || '').slice(0, cols);
        lines.push(nombreLimpio);
        lines.push(padLineThermal(`  ${cantStr} x ${formatearMonedaPos(it.precioUnit)}`, formatearMonedaPos(sub), cols));
    });

    lines.push(sepGu);
    lines.push(padLineThermal('SUBTOTAL:', formatearMonedaPos(venta.subtotal), cols));
    if (venta.descuentoMonto > 0) {
        lines.push(padLineThermal(`DESCUENTO (${venta.descuentoPct}%):`, `-${formatearMonedaPos(venta.descuentoMonto)}`, cols));
    }
    if (venta.recargoMonto > 0) {
        lines.push(padLineThermal(`RECARGO (${venta.recargoPct}%):`, `+${formatearMonedaPos(venta.recargoMonto)}`, cols));
    }
    lines.push(sepEq);
    lines.push(padLineThermal('TOTAL A PAGAR:', `${formatearMonedaPos(venta.total)}`, cols));
    lines.push(sepGu);
    lines.push('MEDIOS DE PAGO:');
    (venta.pagos || []).forEach(pg => {
        lines.push(padLineThermal(` - ${pg.medio}`, formatearMonedaPos(pg.monto), cols));
        if (pg.medio === 'Efectivo' && (Number(pg.vuelto) || 0) > 0) {
            lines.push(padLineThermal(`   Paga: ${formatearMonedaPos(pg.pagaCon)}`, `Vuelto: ${formatearMonedaPos(pg.vuelto)}`, cols));
        }
    });
    lines.push(sepGu);

    if (venta.estado === 'anulada') {
        lines.push(centrarLineaThermal('*** TICKET ANULADO ***', cols));
        if (venta.fechaAnulacion) {
            lines.push(centrarLineaThermal(`Anulado: ${new Date(venta.fechaAnulacion).toLocaleDateString('es-AR')}`, cols));
        }
        lines.push(sepGu);
    }

    lines.push(centrarLineaThermal('GRACIAS POR SU COMPRA!', cols));
    lines.push(centrarLineaThermal('Cat-Alogo Local-First POS', cols));
    return lines.join('\n');
}

function imprimirTicketDirectoThermal(venta, anchoMm = 80) {
    if (!venta) return;
    const texto = construirTextoTicketVentaThermal(venta, anchoMm);
    const fontSize = anchoMm === 58 ? '9.5px' : '11px';

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
        document.body.removeChild(iframe);
        return;
    }

    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Ticket ${escaparHtmlPos(venta.numeroTicket)}</title>
            <style>
                @page { size: ${anchoMm}mm auto; margin: 2mm; }
                body { margin: 0; padding: 2mm; font-family: 'Courier New', Courier, monospace; color: #000; }
                pre { margin: 0; font-size: ${fontSize}; line-height: 1.35; white-space: pre; }
            </style>
        </head>
        <body><pre>${escaparHtmlPos(texto)}</pre></body>
        </html>
    `);
    doc.close();

    setTimeout(() => {
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } finally {
            setTimeout(() => {
                if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            }, 1500);
        }
    }, 150);
}

function descargarPdfTicketVentaPos(venta, anchoMm = 80) {
    if (!venta) return;
    const jsPDFCtor = window.jspdf?.jsPDF;
    if (!jsPDFCtor) {
        alert('No se cargó la librería jsPDF.');
        return;
    }

    const texto = construirTextoTicketVentaThermal(venta, anchoMm);
    const lineas = texto.split('\n');
    const lineH = anchoMm === 58 ? 3.8 : 4.2;
    const altoMm = Math.max(95, lineas.length * lineH + 14);
    const doc = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: [anchoMm, altoMm] });

    doc.setFont('courier', 'normal');
    doc.setFontSize(anchoMm === 58 ? 6.4 : 7.4);
    doc.setTextColor(15, 23, 42);

    let y = 8;
    const margenX = anchoMm === 58 ? 3 : 4;
    lineas.forEach(l => {
        doc.text(l, margenX, y);
        y += lineH;
    });

    doc.save(`ticket-${venta.numeroTicket.toLowerCase()}-${anchoMm}mm.pdf`);
}

function anularVentaYDevolverStockPos(ventaId) {
    const ventas = obtenerVentasPos();
    const venta = ventas.find(v => v.id === ventaId);
    if (!venta) return;

    if (venta.estado === 'anulada') {
        alert('Este ticket ya fue anulado anteriormente.');
        return;
    }

    const montoFiado = Math.round(
        (venta.pagos || []).filter(p => p.medio === 'Cuenta Corriente').reduce((acc, p) => acc + (Number(p.monto) || 0), 0) * 100
    ) / 100;

    const avisoFiado = montoFiado > 0
        ? `\n• Se descontarán ${formatearMonedaPos(montoFiado)} de la deuda de ${venta.clienteNombre}.`
        : '';

    const motivo = prompt(
        `🚫 ¿Anular el ticket ${venta.numeroTicket} por ${formatearMonedaPos(venta.total)} ARS?\n\n` +
        `• Se devolverán automáticamente los ${venta.items.length} ítem(s) al stock de Inventario.${avisoFiado}\n` +
        `• Se descontará del Arqueo y Corte X del turno.\n\n` +
        `Motivo de la anulación:`,
        'Devolución / Error de cobro'
    );
    if (motivo === null) return;

    const productos = obtenerProductosPos();
    (venta.items || []).forEach(it => {
        const prod = productos.find(p => String(p.id) === String(it.prodId));
        if (!prod) return;

        const cant = Math.max(0, Number(it.cantidad) || 0);
        const vIdxReal = resolverIndiceVarianteEnProductoPos(prod, it);
        if (vIdxReal !== -1 && Array.isArray(prod.variantesDetalle) && prod.variantesDetalle[vIdxReal]) {
            const actualVar = Number(prod.variantesDetalle[vIdxReal].stock) || 0;
            prod.variantesDetalle[vIdxReal].stock = Math.round((actualVar + cant) * 1000) / 1000;
            prod.stock = Math.round(prod.variantesDetalle.reduce((acc, v) => acc + (Number(v.stock) || 0), 0) * 1000) / 1000;
        } else {
            const actual = Number(prod.stock) || 0;
            prod.stock = Math.round((actual + cant) * 1000) / 1000;
        }
        prod.actualizadoEn = new Date().toISOString();
    });
    // Sincroniza stock y variantesDetalle restaurados a Firestore
    guardarProductosPos();

    if (montoFiado > 0 && venta.clienteId) {
        const clientes = obtenerClientesPos();
        const cli = clientes.find(c => c.id === venta.clienteId);
        if (cli) {
            const nuevoSaldo = Math.round(Math.max(0, (Number(cli.saldoActual) || 0) - montoFiado) * 100) / 100;
            cli.saldoActual = nuevoSaldo;
            if (!Array.isArray(cli.movimientos)) cli.movimientos = [];
            cli.movimientos.unshift({
                id: 'mov-' + Date.now(),
                fecha: new Date().toISOString(),
                tipo: 'credito',
                concepto: `Anulación Ticket ${venta.numeroTicket} (${motivo.trim() || 'Devolución'})`,
                monto: montoFiado,
                medio: 'Anulación POS',
                saldoResultante: nuevoSaldo
            });
            guardarClientesPos(clientes);
        }
    }

    venta.estado = 'anulada';
    venta.fechaAnulacion = new Date().toISOString();
    venta.motivoAnulacion = motivo.trim() || 'Anulación manual';
    guardarVentasPos(ventas);

    renderizarCatalogoPos();
    renderizarClienteAsignadoPos();
    renderizarAuditoriaTicketsPos();

    alert(`✅ Ticket ${venta.numeroTicket} anulado.\nEl stock fue restaurado correctamente en tu Bóveda Local.`);
}

function renderizarAuditoriaTicketsPos() {
    const st = window.posState;
    const ventas = obtenerVentasPos();
    const turno = obtenerTurnoActivoPos();
    const q = (st.audBusqueda || '').trim().toLowerCase();

    const pillCount = document.getElementById('pos-aud-count-pill');
    if (pillCount) pillCount.textContent = `${ventas.length} ${ventas.length === 1 ? 'ticket registrado' : 'tickets registrados'}`;

    const filtradas = ventas.filter(v => {
        if (st.audTab === 'turno') {
            if (!turno || String(v.turnoId || v.cajaId || '') !== String(turno.id)) return false;
        } else if (st.audTab === 'anuladas') {
            if (v.estado !== 'anulada') return false;
        }
        if (q) {
            const itemsTxt = (v.items || []).map(it => `${it.nombre || ''} ${it.sku || ''}`).join(' ');
            const pagosTxt = (v.pagos || []).map(p => p.medio || '').join(' ');
            const corpus = `${v.numeroTicket || ''} ${v.clienteNombre || ''} ${v.operador || ''} ${itemsTxt} ${pagosTxt}`.toLowerCase();
            if (!corpus.includes(q)) return false;
        }
        return true;
    });

    const listEl = document.getElementById('pos-aud-list');
    const preEl = document.getElementById('pos-aud-thermal-pre');
    const paperEl = document.getElementById('pos-thermal-paper');
    const stampEl = document.getElementById('pos-thermal-void-stamp');
    const actionsEl = document.getElementById('pos-aud-actions-col');
    if (!listEl || !preEl || !actionsEl) return;

    if (filtradas.length === 0) {
        st.audVentaId = null;
        listEl.innerHTML = `<div style="text-align:center; padding:1.5rem 0.5rem; color:#64748b; font-size:0.8rem;">No hay tickets en esta vista.</div>`;
        preEl.textContent = 'Sin ticket seleccionado.';
        if (stampEl) stampEl.style.display = 'none';
        actionsEl.innerHTML = `<div style="text-align:center; color:#64748b; font-size:0.8rem; padding:2rem 0.5rem;">Realiza una venta en el POS o cambia el filtro superior para auditar comprobantes.</div>`;
        return;
    }

    if (!filtradas.some(v => v.id === st.audVentaId)) {
        st.audVentaId = filtradas[0].id;
    }

    const visibles = filtradas.slice(0, st.audLimite);
    const restantes = filtradas.length - visibles.length;

    let htmlLista = visibles.map(v => {
        const fTxt = new Date(v.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const esAnulada = v.estado === 'anulada';
        const medios = (v.pagos || []).map(p => p.medio).join(' + ');

        return `
            <button type="button" class="pos-aud-item ${v.id === st.audVentaId ? 'active' : ''} ${esAnulada ? 'is-void' : ''}" data-aud-vid="${escaparHtmlPos(v.id)}">
                <div class="pos-aud-item-top">
                    <strong>${escaparHtmlPos(v.numeroTicket)} • ${formatearMonedaPos(v.total)}</strong>
                    <span class="pos-cuadre-pill ${esAnulada ? 'err' : 'ok'}">${esAnulada ? 'ANULADO' : 'OK'}</span>
                </div>
                <div class="pos-aud-item-meta">${escaparHtmlPos(v.clienteNombre || 'Consumidor Final')} • ${fTxt}</div>
                <div class="pos-aud-item-meta">${(v.items || []).length} ítems • ${escaparHtmlPos(medios)}</div>
            </button>
        `;
    }).join('');

    if (restantes > 0) {
        htmlLista += `<button type="button" class="pos-btn pos-btn-light pos-btn-xs" id="btn-pos-aud-mas" style="width:100%;">⬇️ Cargar más (${restantes})</button>`;
    }
    listEl.innerHTML = htmlLista;

    const ventaSel = filtradas.find(v => v.id === st.audVentaId);
    if (!ventaSel) return;

    if (paperEl) {
        paperEl.classList.toggle('w-80', st.audAnchoMm === 80);
        paperEl.classList.toggle('w-58', st.audAnchoMm === 58);
    }
    if (stampEl) stampEl.style.display = ventaSel.estado === 'anulada' ? 'block' : 'none';
    preEl.textContent = construirTextoTicketVentaThermal(ventaSel, st.audAnchoMm);

    const esAnulada = ventaSel.estado === 'anulada';
    actionsEl.innerHTML = `
        <div class="pos-aud-meta-card">
            <span class="pos-arq-section-lbl">DETALLE DEL COMPROBANTE</span>
            <div class="pos-aud-meta-row"><span>Ticket:</span><strong>${escaparHtmlPos(ventaSel.numeroTicket)}</strong></div>
            <div class="pos-aud-meta-row"><span>Turno:</span><strong>#${ventaSel.turnoNumero || '—'} (${escaparHtmlPos(ventaSel.operador || 'Cajero')})</strong></div>
            <div class="pos-aud-meta-row"><span>Cliente:</span><strong>${escaparHtmlPos(ventaSel.clienteNombre || 'Consumidor Final')}</strong></div>
            <div class="pos-aud-meta-row"><span>Fecha:</span><strong>${new Date(ventaSel.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</strong></div>
            <div class="pos-aud-meta-row"><span>Total:</span><strong class="${esAnulada ? 'text-danger' : 'text-emerald'}">${formatearMonedaPos(ventaSel.total)} ARS</strong></div>
        </div>

        <div class="pos-aud-btn-stack">
            <button type="button" class="pos-btn pos-btn-primary" id="btn-aud-imprimir-directo">
                🖨️ Imprimir Térmico Directo (${st.audAnchoMm}mm)
            </button>
            <button type="button" class="pos-btn pos-btn-blue" id="btn-aud-pdf-thermal">
                📄 Descargar PDF Térmico (${st.audAnchoMm}mm)
            </button>
            <button type="button" class="pos-btn pos-btn-light" id="btn-aud-enviar-wa">
                💬 Enviar Comprobante por WhatsApp
            </button>
        </div>

        <div class="pos-aud-void-box">
            ${esAnulada ? `
                <strong>🚫 Comprobante Anulado</strong>
                <span>Fecha: ${ventaSel.fechaAnulacion ? new Date(ventaSel.fechaAnulacion).toLocaleString('es-AR') : '—'}</span>
                <span>Motivo: ${escaparHtmlPos(ventaSel.motivoAnulacion || 'Anulación manual')}</span>
                <span>Stock ya reintegrado a la Bóveda Local.</span>
            ` : `
                <strong>⚠️ Devolución / Corrección</strong>
                <span>Si hubo un error de cobro o devolución, puedes anular este ticket para restaurar automáticamente el stock y revertir el fiado.</span>
                <button type="button" class="pos-btn pos-btn-danger-solid pos-btn-xs" id="btn-aud-anular-venta" style="width:100%;">
                    🚫 Anular Venta y Devolver Stock
                </button>
            `}
        </div>
    `;

    document.getElementById('btn-aud-imprimir-directo')?.addEventListener('click', () => {
        imprimirTicketDirectoThermal(ventaSel, st.audAnchoMm);
    });
    document.getElementById('btn-aud-pdf-thermal')?.addEventListener('click', () => {
        descargarPdfTicketVentaPos(ventaSel, st.audAnchoMm);
    });
    document.getElementById('btn-aud-enviar-wa')?.addEventListener('click', () => {
        enviarTicketVentaWhatsAppPos(ventaSel);
    });
    document.getElementById('btn-aud-anular-venta')?.addEventListener('click', () => {
        anularVentaYDevolverStockPos(ventaSel.id);
    });
}

function aplicarDescuentoRapidoPos() {
    const actual = window.posState.descuentoPct || 0;
    const val = prompt('Ingresa el porcentaje de descuento global para esta venta (0 a 100%):', String(actual));
    if (val === null) return;
    const num = parseFloat(val);
    if (isNaN(num) || num < 0 || num > 100) {
        alert('Ingresa un porcentaje válido entre 0 y 100.');
        return;
    }
    window.posState.descuentoPct = Math.round(num * 100) / 100;
    renderizarTicketActivoPos(true);
}

/* ==========================================================================
   VENTAS PAUSADAS EN ESPERA ("PAUSAR TICKET")
   ========================================================================== */
function actualizarContadorEsperaPos() {
    const badge = document.getElementById('pos-espera-count');
    if (!badge) return;
    const cant = obtenerTicketsEnEsperaPos().length;
    badge.textContent = cant;
    badge.style.display = cant > 0 ? 'inline-block' : 'none';
}

function pausarTicketActualPos() {
    if (window.posState.carrito.length === 0) {
        alert('No hay ítems en el ticket actual para pausar.');
        return;
    }

    const cli = obtenerClienteSeleccionadoPos();
    const referencia = prompt('Referencia breve para reconocer este ticket en espera:', cli ? cli.nombre : 'Cliente en mostrador');
    if (referencia === null) return;

    const { total } = calcularTotalesTicketPos();
    const lista = obtenerTicketsEnEsperaPos();
    lista.unshift({
        id: 'esp-' + Date.now(),
        referencia: referencia.trim() || 'Venta en espera',
        fecha: new Date().toISOString(),
        total,
        descuentoPct: window.posState.descuentoPct,
        clienteId: window.posState.clienteId,
        carrito: JSON.parse(JSON.stringify(window.posState.carrito))
    });

    guardarTicketsEnEsperaPos(lista);
    window.posState.carrito = [];
    window.posState.descuentoPct = 0;
    window.posState.clienteId = null;
    renderizarClienteAsignadoPos();
    renderizarTicketActivoPos(true);
    alert('⏸️ Ticket guardado en Espera. Puedes continuar cobrando al siguiente cliente.');
}

function abrirModalTicketsEnEsperaPos() {
    const modal = document.getElementById('modal-pos-espera');
    const cont = document.getElementById('pos-espera-list');
    if (!modal || !cont) return;

    const lista = obtenerTicketsEnEsperaPos();
    if (lista.length === 0) {
        cont.innerHTML = `<div style="text-align:center; padding:1.75rem; color:#64748b; font-size:0.84rem;">No hay tickets pausados en espera.</div>`;
    } else {
        cont.innerHTML = lista.map(t => `
            <div class="pos-espera-card" data-esp-id="${escaparHtmlPos(t.id)}">
                <div>
                    <strong>${escaparHtmlPos(t.referencia)}</strong>
                    <span>${new Date(t.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} • ${t.carrito.length} ítems • <strong>${formatearMonedaPos(t.total)}</strong></span>
                </div>
                <div style="display:flex; gap:0.4rem;">
                    <button type="button" class="pos-btn pos-btn-primary pos-btn-xs btn-retomar-esp">▶ Retomar</button>
                    <button type="button" class="pos-btn pos-btn-light pos-btn-xs btn-borrar-esp">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    modal.classList.add('active');
}

/* ==========================================================================
   EVENTOS DEL MÓDULO (ETAPAS 1 A 5 COMPLETAS)
   ========================================================================== */
function inicializarEventosPos() {
    document.getElementById('pos-caja-pill')?.addEventListener('click', () => {
        if (!obtenerTurnoActivoPos()) abrirModalAperturaTurnoPos();
    });
    document.getElementById('btn-pos-abrir-turno-banner')?.addEventListener('click', abrirModalAperturaTurnoPos);
    document.getElementById('btn-cerrar-modal-apertura')?.addEventListener('click', cerrarModalAperturaTurnoPos);
    document.getElementById('btn-cancelar-modal-apertura')?.addEventListener('click', cerrarModalAperturaTurnoPos);
    document.getElementById('form-pos-apertura')?.addEventListener('submit', guardarAperturaTurnoPos);

    const inpSearch = document.getElementById('pos-search-input');
    if (inpSearch) {
        inpSearch.addEventListener('input', (e) => {
            window.posState.busqueda = e.target.value;
            renderizarCatalogoPos();
        });

        inpSearch.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const q = inpSearch.value.trim().toLowerCase();
            if (!q) return;

            const productos = obtenerProductosPos();
            for (const p of productos) {
                if (String(p.sku || '').toLowerCase() === q || (p.codigoBarras && String(p.codigoBarras).toLowerCase() === q)) {
                    e.preventDefault();
                    agregarProductoAlTicketPos(p.id, esProductoBalanzaPos(p) ? 0.5 : 1, null);
                    inpSearch.value = '';
                    window.posState.busqueda = '';
                    renderizarCatalogoPos();
                    return;
                }
                if (Array.isArray(p.variantesDetalle)) {
                    const vIdx = p.variantesDetalle.findIndex(v => String(v.sku || '').toLowerCase() === q);
                    if (vIdx !== -1) {
                        e.preventDefault();
                        agregarProductoAlTicketPos(p.id, 1, vIdx);
                        inpSearch.value = '';
                        window.posState.busqueda = '';
                        renderizarCatalogoPos();
                        return;
                    }
                }
            }
        });
    }

    const grid = document.getElementById('pos-products-grid');
    if (grid) {
        grid.addEventListener('change', (e) => {
            if (!e.target.classList.contains('pos-var-select')) return;
            const prodId = e.target.getAttribute('data-prod-id');
            const varIdx = parseInt(e.target.value, 10);
            const card = e.target.closest('.pos-prod-card');
            const prod = obtenerProductosPos().find(p => String(p.id) === String(prodId));
            if (!card || !prod || isNaN(varIdx)) return;

            const info = obtenerInfoVariantePos(prod, varIdx);
            const imgEl = card.querySelector('.pos-prod-img-wrap img');
            if (imgEl && info.imagen) imgEl.src = info.imagen;

            const priceRow = card.querySelector('.pos-prod-price-row');
            if (priceRow) {
                const abrev = abrevUnidadPos(prod.unidadMedida);
                priceRow.innerHTML = `
                    <span class="pos-prod-price">${formatearMonedaPos(info.precioFinal)}</span>
                    <span class="pos-prod-unit">/ ${escaparHtmlPos(abrev)}</span>
                    ${info.tieneOferta ? `<span class="pos-prod-old">${formatearMonedaPos(info.precioNormal)}</span>` : ''}
                `;
            }
        });

        grid.addEventListener('input', (e) => {
            if (!e.target.classList.contains('pos-balanza-qty')) return;
            const card = e.target.closest('.pos-prod-card');
            const precio = parseFloat(e.target.getAttribute('data-precio')) || 0;
            const cant = Math.max(0, parseFloat(e.target.value) || 0);
            const btn = card?.querySelector('.btn-pos-add-prod');
            if (btn) btn.textContent = `+ ${formatearMonedaPos(Math.round(precio * cant * 100) / 100)}`;
        });

        grid.addEventListener('click', (e) => {
            const stepBtn = e.target.closest('.pos-step-btn');
            if (stepBtn) {
                const stepper = stepBtn.closest('.pos-stepper');
                const valEl = stepper?.querySelector('.pos-step-val');
                if (!valEl) return;
                const delta = parseInt(stepBtn.getAttribute('data-step'), 10) || 0;
                const actual = parseInt(valEl.textContent, 10) || 1;
                valEl.textContent = String(Math.max(1, actual + delta));
                return;
            }

            const addBtn = e.target.closest('.btn-pos-add-prod');
            if (addBtn) {
                const card = addBtn.closest('.pos-prod-card');
                const prodId = addBtn.getAttribute('data-prod-id');
                const balanzaInp = card?.querySelector('.pos-balanza-qty');
                const stepVal = card?.querySelector('.pos-step-val');
                const varSel = card?.querySelector('.pos-var-select');

                const cant = balanzaInp
                    ? (parseFloat(balanzaInp.value) || 0.5)
                    : (parseInt(stepVal?.textContent, 10) || 1);
                const varIdx = varSel ? parseInt(varSel.value, 10) : null;

                agregarProductoAlTicketPos(prodId, cant, varIdx);
                if (stepVal) stepVal.textContent = '1';
            }
        });
    }

    const ticketList = document.getElementById('pos-ticket-items');
    if (ticketList) {
        ticketList.addEventListener('input', (e) => {
            if (!e.target.classList.contains('pos-mini-qty')) return;
            const row = e.target.closest('.pos-ticket-row');
            const key = row?.getAttribute('data-key');
            const item = window.posState.carrito.find(it => it.key === key);
            if (!item) return;

            const nueva = Math.min(item.stockDisp, Math.max(0.001, parseFloat(e.target.value) || 0));
            item.cantidad = Math.round(nueva * 1000) / 1000;

            const subEl = row.querySelector('.pos-ticket-sub');
            if (subEl) subEl.textContent = formatearMonedaPos(Math.round(item.precioUnit * item.cantidad * 100) / 100);
            actualizarCobroMixtoPos(!window.posState.pagoDividido);
        });

        ticketList.addEventListener('click', (e) => {
            const btnDel = e.target.closest('.pos-ticket-del');
            if (!btnDel) return;
            const key = btnDel.closest('.pos-ticket-row')?.getAttribute('data-key');
            window.posState.carrito = window.posState.carrito.filter(it => it.key !== key);
            renderizarTicketActivoPos(true);
        });
    }

    document.getElementById('btn-pos-elegir-cliente')?.addEventListener('click', abrirSelectorClientePos);
    document.getElementById('btn-cerrar-modal-pos-cli')?.addEventListener('click', () => {
        document.getElementById('modal-pos-cliente')?.classList.remove('active');
    });
    document.getElementById('modal-pos-cliente')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-pos-cliente') e.target.classList.remove('active');
    });
    document.getElementById('pos-cli-search')?.addEventListener('input', (e) => {
        renderizarListaSelectorClientesPos(e.target.value);
    });
    document.getElementById('btn-pos-cli-cf')?.addEventListener('click', () => {
        window.posState.clienteId = null;
        if (window.posState.m1Tipo === 'Cuenta Corriente') {
            window.posState.m1Tipo = 'Efectivo';
            document.getElementById('pos-m1-tipo').value = 'Efectivo';
        }
        if (window.posState.m2Tipo === 'Cuenta Corriente') {
            window.posState.m2Tipo = 'Tarjeta Débito';
            document.getElementById('pos-m2-tipo').value = 'Tarjeta Débito';
        }
        document.getElementById('modal-pos-cliente')?.classList.remove('active');
        actualizarCobroMixtoPos(!window.posState.pagoDividido);
    });
    document.getElementById('btn-pos-quitar-cliente')?.addEventListener('click', () => {
        document.getElementById('btn-pos-cli-cf')?.click();
    });
    document.getElementById('pos-cli-picker-list')?.addEventListener('click', (e) => {
        const item = e.target.closest('.pos-cli-pick-item');
        if (!item) return;
        window.posState.clienteId = item.getAttribute('data-pick-cli');
        document.getElementById('modal-pos-cliente')?.classList.remove('active');
        renderizarClienteAsignadoPos();
    });

    document.getElementById('pos-chk-fiado')?.addEventListener('change', (e) => {
        if (e.target.checked) {
            if (window.posState.pagoDividido) {
                window.posState.m2Tipo = 'Cuenta Corriente';
                document.getElementById('pos-m2-tipo').value = 'Cuenta Corriente';
            } else {
                window.posState.m1Tipo = 'Cuenta Corriente';
                document.getElementById('pos-m1-tipo').value = 'Cuenta Corriente';
            }
        } else {
            if (window.posState.m1Tipo === 'Cuenta Corriente') {
                window.posState.m1Tipo = 'Efectivo';
                document.getElementById('pos-m1-tipo').value = 'Efectivo';
            }
            if (window.posState.m2Tipo === 'Cuenta Corriente') {
                window.posState.m2Tipo = 'Tarjeta Débito';
                document.getElementById('pos-m2-tipo').value = 'Tarjeta Débito';
            }
        }
        actualizarCobroMixtoPos(!window.posState.pagoDividido);
    });

    document.getElementById('pos-m1-tipo')?.addEventListener('change', (e) => {
        if (e.target.value === 'Cuenta Corriente' && !window.posState.clienteId) abrirSelectorClientePos();
        window.posState.m1Tipo = e.target.value;
        actualizarCobroMixtoPos(!window.posState.pagoDividido);
    });

    document.getElementById('btn-pos-m1-total')?.addEventListener('click', () => {
        window.posState.pagoDividido = false;
        const chk = document.getElementById('pos-chk-pago-dividido');
        if (chk) chk.checked = false;
        actualizarCobroMixtoPos(true);
    });

    document.getElementById('pos-m1-monto')?.addEventListener('input', (e) => {
        window.posState.m1Monto = Math.max(0, parseFloat(e.target.value) || 0);
        if (window.posState.m1Tipo === 'Efectivo' && (Number(window.posState.m1PagaCon) || 0) < window.posState.m1Monto) {
            window.posState.m1PagaCon = window.posState.m1Monto;
            const inpP = document.getElementById('pos-m1-paga-con');
            if (inpP) inpP.value = window.posState.m1Monto;
        }
        actualizarCobroMixtoPos(false);
    });

    document.getElementById('pos-m1-paga-con')?.addEventListener('input', (e) => {
        window.posState.m1PagaCon = Math.max(0, parseFloat(e.target.value) || 0);
        actualizarCobroMixtoPos(false);
    });

    document.getElementById('pos-m1-recargo-pct')?.addEventListener('input', (e) => {
        window.posState.m1RecargoPct = Math.max(0, parseFloat(e.target.value) || 0);
        actualizarCobroMixtoPos(!window.posState.pagoDividido);
    });

    document.getElementById('pos-chk-pago-dividido')?.addEventListener('change', (e) => {
        window.posState.pagoDividido = e.target.checked;
        if (e.target.checked) {
            const { total } = calcularTotalesTicketPos();
            const mitad = Math.round((total / 2) * 100) / 100;
            window.posState.m1Monto = mitad;
            window.posState.m1PagaCon = mitad;
            window.posState.m2Monto = Math.round((total - mitad) * 100) / 100;
            document.getElementById('pos-m1-monto').value = window.posState.m1Monto;
            document.getElementById('pos-m1-paga-con').value = window.posState.m1PagaCon;
            document.getElementById('pos-m2-monto').value = window.posState.m2Monto;
            actualizarCobroMixtoPos(false);
        } else {
            actualizarCobroMixtoPos(true);
        }
    });

    document.getElementById('pos-m2-tipo')?.addEventListener('change', (e) => {
        if (e.target.value === 'Cuenta Corriente' && !window.posState.clienteId) abrirSelectorClientePos();
        window.posState.m2Tipo = e.target.value;
        actualizarCobroMixtoPos(false);
    });

    document.getElementById('btn-pos-m2-resto')?.addEventListener('click', () => {
        const { total } = calcularTotalesTicketPos();
        const resto = Math.round(Math.max(0, total - (Number(window.posState.m1Monto) || 0)) * 100) / 100;
        window.posState.m2Monto = resto;
        window.posState.m2PagaCon = resto;
        document.getElementById('pos-m2-monto').value = resto;
        document.getElementById('pos-m2-paga-con').value = resto;
        actualizarCobroMixtoPos(false);
    });

    document.getElementById('pos-m2-monto')?.addEventListener('input', (e) => {
        window.posState.m2Monto = Math.max(0, parseFloat(e.target.value) || 0);
        actualizarCobroMixtoPos(false);
    });

    document.getElementById('pos-m2-paga-con')?.addEventListener('input', (e) => {
        window.posState.m2PagaCon = Math.max(0, parseFloat(e.target.value) || 0);
        actualizarCobroMixtoPos(false);
    });

    document.getElementById('pos-m2-recargo-pct')?.addEventListener('input', (e) => {
        window.posState.m2RecargoPct = Math.max(0, parseFloat(e.target.value) || 0);
        const { total } = calcularTotalesTicketPos();
        const resto = Math.round(Math.max(0, total - (Number(window.posState.m1Monto) || 0)) * 100) / 100;
        window.posState.m2Monto = resto;
        document.getElementById('pos-m2-monto').value = resto;
        actualizarCobroMixtoPos(false);
    });

    document.getElementById('pos-m2-ref')?.addEventListener('input', (e) => {
        window.posState.m2Ref = e.target.value;
    });

    document.getElementById('btn-pos-ir-cobro')?.addEventListener('click', confirmarVentaPos);
    document.getElementById('btn-pos-wa-last')?.addEventListener('click', enviarUltimoTicketWhatsAppPos);

    const cancelarOrden = () => {
        if (window.posState.carrito.length === 0) return;
        if (!confirm('¿Vaciar todos los ítems del ticket actual?')) return;
        window.posState.carrito = [];
        window.posState.descuentoPct = 0;
        renderizarTicketActivoPos(true);
    };
    document.getElementById('btn-pos-vaciar-ticket')?.addEventListener('click', cancelarOrden);
    document.getElementById('btn-pos-cmd-cancelar')?.addEventListener('click', cancelarOrden);

    document.getElementById('btn-pos-cmd-desc')?.addEventListener('click', aplicarDescuentoRapidoPos);
    document.getElementById('btn-pos-cmd-pausar')?.addEventListener('click', pausarTicketActualPos);
    document.getElementById('btn-pos-tickets-espera')?.addEventListener('click', abrirModalTicketsEnEsperaPos);
    document.getElementById('btn-cerrar-modal-espera')?.addEventListener('click', () => {
        document.getElementById('modal-pos-espera')?.classList.remove('active');
    });

    document.getElementById('pos-espera-list')?.addEventListener('click', (e) => {
        const card = e.target.closest('.pos-espera-card');
        if (!card) return;
        const espId = card.getAttribute('data-esp-id');
        const lista = obtenerTicketsEnEsperaPos();

        if (e.target.closest('.btn-retomar-esp')) {
            const ticket = lista.find(t => t.id === espId);
            if (!ticket) return;
            window.posState.carrito = ticket.carrito || [];
            window.posState.descuentoPct = ticket.descuentoPct || 0;
            window.posState.clienteId = ticket.clienteId || null;
            guardarTicketsEnEsperaPos(lista.filter(t => t.id !== espId));
            document.getElementById('modal-pos-espera')?.classList.remove('active');
            renderizarClienteAsignadoPos();
            renderizarTicketActivoPos(true);
        } else if (e.target.closest('.btn-borrar-esp')) {
            guardarTicketsEnEsperaPos(lista.filter(t => t.id !== espId));
            abrirModalTicketsEnEsperaPos();
        }
    });

    document.getElementById('btn-pos-arqueo')?.addEventListener('click', abrirPanelArqueoPos);
    document.getElementById('btn-cerrar-drawer-arqueo')?.addEventListener('click', cerrarPanelArqueoPos);
    document.getElementById('btn-pos-arq-cerrar-foot')?.addEventListener('click', cerrarPanelArqueoPos);
    document.getElementById('drawer-pos-arqueo')?.addEventListener('click', (e) => {
        if (e.target.id === 'drawer-pos-arqueo') cerrarPanelArqueoPos();
    });
    document.getElementById('pos-chk-modo-ciego')?.addEventListener('change', (e) => {
        window.posState.modoCiego = e.target.checked;
        actualizarDatosArqueoPos();
    });
    document.getElementById('pos-billetes-grid')?.addEventListener('input', recalcularDiferenciaArqueoPos);
    document.getElementById('btn-pos-arq-limpiar')?.addEventListener('click', limpiarConteoBilletesPos);
    document.getElementById('btn-pos-arq-guardar')?.addEventListener('click', () => guardarArqueoParcialTurnoPos(false));
    document.getElementById('btn-pos-arq-ir-retiro')?.addEventListener('click', () => abrirModalRetiroCajaPos());

    document.getElementById('btn-pos-cmd-retiro')?.addEventListener('click', () => abrirModalRetiroCajaPos());
    document.getElementById('btn-cerrar-modal-retiro')?.addEventListener('click', cerrarModalRetiroCajaPos);
    document.getElementById('btn-cancelar-modal-retiro')?.addEventListener('click', cerrarModalRetiroCajaPos);
    document.getElementById('modal-pos-retiro')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-pos-retiro') cerrarModalRetiroCajaPos();
    });
    document.getElementById('form-pos-retiro')?.addEventListener('submit', guardarRetiroCajaFormulario);
    document.getElementById('pos-ret-hist-list')?.addEventListener('click', (e) => {
        const btnDel = e.target.closest('.btn-del-retiro');
        if (!btnDel) return;
        const retId = btnDel.closest('.pos-ret-item')?.getAttribute('data-ret-id');
        if (!retId || !confirm('¿Eliminar esta salida de efectivo del turno actual?')) return;

        const turnos = obtenerTurnosPos();
        const turno = turnos.find(t => t && (t.estado === 'abierto' || t.estado === 'abierta'));
        if (!turno) return;
        turno.retiros = (turno.retiros || []).filter(r => r.id !== retId);
        guardarTurnosPos(turnos);
        renderizarHistorialRetirosTurnoPos();
        if (document.getElementById('drawer-pos-arqueo')?.classList.contains('active')) actualizarDatosArqueoPos();
        if (document.getElementById('modal-pos-corte-x')?.classList.contains('active')) renderizarContenidoCorteXPos();
    });

    document.getElementById('btn-pos-corte-x')?.addEventListener('click', abrirReporteCorteXPos);
    document.getElementById('btn-cerrar-modal-cortex')?.addEventListener('click', cerrarReporteCorteXPos);
    document.getElementById('modal-pos-corte-x')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-pos-corte-x') cerrarReporteCorteXPos();
    });

    const descargarCorteXActual = () => {
        const turno = obtenerTurnoActivoPos();
        if (!turno) {
            alert('No hay turno activo para emitir Corte X.');
            return;
        }
        descargarPdfCorte80mm(turno, calcularResumenCorteXPos(turno), false);
    };
    document.getElementById('btn-cx-imprimir-80mm')?.addEventListener('click', descargarCorteXActual);
    document.getElementById('btn-cx-pdf-sim')?.addEventListener('click', descargarCorteXActual);

    document.getElementById('btn-cx-retiro')?.addEventListener('click', () => abrirModalRetiroCajaPos());
    document.getElementById('btn-cx-ir-arqueo')?.addEventListener('click', abrirPanelArqueoPos);
    document.getElementById('btn-cx-cerrar-z')?.addEventListener('click', ejecutarCierreDefinitivoCorteZ);

    document.getElementById('cx-umbral-gaveta')?.addEventListener('input', (e) => {
        const val = Math.max(0, parseFloat(e.target.value) || 0);
        window.posState.umbralGaveta = val;
        localStorage.setItem(STORAGE_KEY_POS_UMBRAL_GAVETA, String(val));
        renderizarContenidoCorteXPos();
    });

    document.getElementById('btn-cx-retiro-custodia')?.addEventListener('click', (e) => {
        const sug = parseFloat(e.currentTarget.dataset.sugerido) || 20000;
        abrirModalRetiroCajaPos('Retiro a Caja Fuerte', sug, 'Retiro de custodia por límite de gaveta');
    });

    document.getElementById('btn-cx-toggle-hist')?.addEventListener('click', () => {
        const mainView = document.getElementById('pos-cx-main-view');
        const histView = document.getElementById('pos-cx-hist-view');
        const mostrandoHist = histView?.style.display !== 'none';
        if (mostrandoHist && obtenerTurnoActivoPos()) {
            histView.style.display = 'none';
            mainView.style.display = 'flex';
            renderizarContenidoCorteXPos();
        } else {
            if (mainView) mainView.style.display = 'none';
            if (histView) histView.style.display = 'flex';
            renderizarHistorialTurnosCerrados();
        }
    });

    document.getElementById('btn-cx-volver-activo')?.addEventListener('click', () => {
        if (!obtenerTurnoActivoPos()) {
            cerrarReporteCorteXPos();
            abrirModalAperturaTurnoPos();
            return;
        }
        document.getElementById('pos-cx-hist-view').style.display = 'none';
        document.getElementById('pos-cx-main-view').style.display = 'flex';
        renderizarContenidoCorteXPos();
    });

    document.getElementById('cx-turnos-cerrados-list')?.addEventListener('click', (e) => {
        if (!e.target.closest('.btn-reimprimir-z')) return;
        const turnoId = e.target.closest('.pos-cx-hist-item')?.getAttribute('data-turno-id');
        const turno = obtenerTurnosPos().find(t => t.id === turnoId);
        if (turno) descargarPdfCorte80mm(turno, calcularResumenCorteXPos(turno), true);
    });

    document.getElementById('btn-pos-cmd-reimprimir')?.addEventListener('click', () => abrirModalAuditoriaTicketsPos());
    document.getElementById('btn-pos-print-last')?.addEventListener('click', () => abrirModalAuditoriaTicketsPos());
    document.getElementById('btn-cerrar-modal-auditoria')?.addEventListener('click', cerrarModalAuditoriaTicketsPos);
    document.getElementById('modal-pos-auditoria-tickets')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-pos-auditoria-tickets') cerrarModalAuditoriaTicketsPos();
    });

    document.getElementById('pos-aud-search')?.addEventListener('input', (e) => {
        window.posState.audBusqueda = e.target.value;
        window.posState.audLimite = 30;
        renderizarAuditoriaTicketsPos();
    });

    document.querySelectorAll('.pos-aud-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pos-aud-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            window.posState.audTab = btn.getAttribute('data-audtab');
            window.posState.audLimite = 30;
            renderizarAuditoriaTicketsPos();
        });
    });

    document.querySelectorAll('.pos-aud-wbtn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pos-aud-wbtn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            window.posState.audAnchoMm = parseInt(btn.getAttribute('data-width'), 10) || 80;
            renderizarAuditoriaTicketsPos();
        });
    });

    document.getElementById('pos-aud-list')?.addEventListener('click', (e) => {
        if (e.target.id === 'btn-pos-aud-mas') {
            window.posState.audLimite += 30;
            renderizarAuditoriaTicketsPos();
            return;
        }
        const item = e.target.closest('.pos-aud-item');
        if (!item) return;
        window.posState.audVentaId = item.getAttribute('data-aud-vid');
        renderizarAuditoriaTicketsPos();
    });

    if (!posShortcutsRegistrados) {
        document.addEventListener('keydown', (e) => {
            if (!document.getElementById('pos-module-root')) return;

            if (e.key === 'F2') {
                e.preventDefault();
                const inp = document.getElementById('pos-search-input');
                if (inp) { inp.focus(); inp.select(); }
            } else if (e.key === 'F4') {
                e.preventDefault();
                aplicarDescuentoRapidoPos();
            } else if (e.key === 'F6') {
                e.preventDefault();
                abrirModalAuditoriaTicketsPos();
            } else if (e.key === 'F8') {
                e.preventDefault();
                abrirModalRetiroCajaPos();
            } else if (e.key === 'F9') {
                e.preventDefault();
                abrirPanelArqueoPos();
            }
        });
        posShortcutsRegistrados = true;
    }
}

/* ==========================================================================
   ETAPA 2: INTEGRACIÓN POS CON MOTOR CENTRAL DE MEDIOS DE PAGO Y RECARGOS
   ========================================================================== */
window.posState.aplicarReglaAuto = true;

function esMedioTransferenciaOBilleteraPos(nombreMedio) {
    const s = String(nombreMedio || '').toLowerCase();
    return /transfer|alias|cbu|cvu|qr|billetera|mercado|homebanking|cuenta dni|modo|naranja/.test(s);
}

function iconoParaMedioPos(nombreMedio) {
    const s = String(nombreMedio || '').toLowerCase();
    if (s.includes('efectivo')) return '💵';
    if (s.includes('cuenta corriente')) return '📒';
    if (s.includes('transfer') || s.includes('homebanking') || s.includes('qr')) return '📱';
    if (s.includes('billetera') || s.includes('nfc') || s.includes('plataforma')) return '📲';
    return '💳';
}

function poblarSelectoresMediosPagoPos() {
    const sel1 = document.getElementById('pos-m1-tipo');
    const sel2 = document.getElementById('pos-m2-tipo');
    if (!sel1 || !sel2 || !window.MediosPagoEngine) return;

    const habilitados = window.MediosPagoEngine.obtenerMediosHabilitados();
    if (habilitados.length === 0) return;

    const construirOpciones = () => {
        const opts = habilitados.map(m => {
            let tag = '';
            if (m.modo === 'descuento' && m.porcentaje > 0) tag = ` (-${m.porcentaje}%)`;
            if (m.modo === 'recargo' && m.porcentaje > 0) tag = ` (+${m.porcentaje}%)`;
            return `<option value="${escaparHtmlPos(m.nombre)}">${iconoParaMedioPos(m.nombre)} ${escaparHtmlPos(m.nombre)}${tag}</option>`;
        });
        opts.push(`<option value="Cuenta Corriente">📒 Cuenta Corriente (Fiado)</option>`);
        return opts.join('');
    };

    const htmlOpts = construirOpciones();
    const prev1 = window.posState.m1Tipo;
    const prev2 = window.posState.m2Tipo;

    sel1.innerHTML = htmlOpts;
    sel2.innerHTML = htmlOpts;

    const nombresValidos = [...habilitados.map(m => m.nombre), 'Cuenta Corriente'];
    window.posState.m1Tipo = nombresValidos.includes(prev1) ? prev1 : habilitados[0].nombre;
    window.posState.m2Tipo = nombresValidos.includes(prev2)
        ? prev2
        : (habilitados[1]?.nombre || habilitados[0].nombre);

    sel1.value = window.posState.m1Tipo;
    sel2.value = window.posState.m2Tipo;
}

function actualizarBannerAliasPos() {
    const box = document.getElementById('pos-datos-transferencia-box');
    if (!box || !window.MediosPagoEngine) return;

    const st = window.posState;
    const usaTransf =
        esMedioTransferenciaOBilleteraPos(st.m1Tipo) ||
        (st.pagoDividido && esMedioTransferenciaOBilleteraPos(st.m2Tipo));

    const datos = window.MediosPagoEngine.obtenerConfig().datosBancarios || {};
    const tieneDatos = !!(datos.alias || datos.cbu);

    if (!usaTransf || !tieneDatos) {
        box.style.display = 'none';
        return;
    }

    const elTxt = document.getElementById('pos-alias-txt');
    const elSub = document.getElementById('pos-alias-sub');
    const btnCopy = document.getElementById('btn-pos-copiar-alias');

    if (elTxt) elTxt.textContent = datos.alias ? `🏦 Alias: ${datos.alias}` : `🏦 CBU/CVU: ${datos.cbu}`;
    const partesSub = [];
    if (datos.titular) partesSub.push(datos.titular);
    if (datos.banco) partesSub.push(datos.banco);
    if (datos.alias && datos.cbu) partesSub.push(`CBU: ${datos.cbu}`);
    if (elSub) elSub.textContent = partesSub.join(' • ') || 'Listo para transferencia';
    if (btnCopy) btnCopy.dataset.copyVal = datos.alias || datos.cbu || '';

    box.style.display = 'flex';
}

function calcularMontoElegibleSinOfertasPos() {
    const productos = obtenerProductosPos();
    let elegible = 0;

    (window.posState.carrito || []).forEach(it => {
        let tieneOferta = Boolean(it.tieneOferta);
        if (it.tieneOferta === undefined) {
            const prod = productos.find(p => String(p.id) === String(it.prodId));
            tieneOferta = prod ? obtenerInfoVariantePos(prod, it.varIdx).tieneOferta : false;
        }
        if (!tieneOferta) {
            elegible += (Number(it.precioUnit) || 0) * (Number(it.cantidad) || 0);
        }
    });

    return Math.round(elegible * 100) / 100;
}

const _calcularTotalesBasePos = calcularTotalesTicketPos;
calcularTotalesTicketPos = function () {
    if (!window.MediosPagoEngine) return _calcularTotalesBasePos();

    const st = window.posState;
    const subtotal = Math.round(
        st.carrito.reduce((acc, it) => acc + (it.precioUnit * it.cantidad), 0) * 100
    ) / 100;
    const descManualPct = Math.min(100, Math.max(0, Number(st.descuentoPct) || 0));
    const descManualMonto = Math.round(subtotal * (descManualPct / 100) * 100) / 100;
    const baseNeta = Math.round(Math.max(0, subtotal - descManualMonto) * 100) / 100;

    if (baseNeta <= 0) {
        return {
            subtotal: 0,
            descManualPct,
            descPct: descManualPct,
            descManualMonto: 0,
            descMedioMonto: 0,
            descMedioLabel: '',
            descMonto: 0,
            baseNeta: 0,
            recargoPct: 0,
            recargoMonto: 0,
            recargoLabel: '',
            motivoBloqueo: '',
            total: 0
        };
    }

    const montoElegibleSinOfertas = calcularMontoElegibleSinOfertasPos();
    const opciones = {
        aplicarReglaAutomatica: st.aplicarReglaAuto !== false,
        tieneDescuentoManual: descManualPct > 0,
        montoElegibleSinOfertas
    };

    let descMedioMonto = 0;
    let descMedioPct = 0;
    let recargoMonto = 0;
    let recargoPct = 0;
    let descMedioLabel = 'Descuento por Medio';
    let recargoLabel = 'Recargo por Medio';
    let motivoBloqueo = '';
    let total = baseNeta;

    if (!st.pagoDividido) {
        const aj = window.MediosPagoEngine.calcularAjusteMedio(baseNeta, st.m1Tipo, opciones);
        motivoBloqueo = aj.motivoBloqueo || '';
        if (aj.delta < 0) {
            descMedioMonto = Math.abs(aj.delta);
            descMedioPct = aj.porcentaje;
            descMedioLabel = `Descuento ${aj.medioNombre} (-${aj.porcentaje}%)`;
        } else if (aj.delta > 0) {
            recargoMonto = aj.delta;
            recargoPct = aj.porcentaje;
            recargoLabel = `Recargo ${aj.medioNombre} (+${aj.porcentaje}%)`;
        }
        total = aj.totalFinal;
    } else {
        const base1 = Math.min(baseNeta, Math.max(0, Number(st.m1Monto) || 0));
        const base2 = Math.round(Math.max(0, baseNeta - base1) * 100) / 100;

        const resMix = window.MediosPagoEngine.calcularAjustesPagosMixtos(
            [
                { medio: st.m1Tipo, montoBase: base1 },
                { medio: st.m2Tipo, montoBase: base2 }
            ],
            opciones
        );

        descMedioMonto = resMix.totalDescuento;
        recargoMonto = resMix.totalRecargo;
        total = resMix.totalFinal;

        const detDesc = resMix.detalle.filter(d => d.delta < 0);
        const detRec = resMix.detalle.filter(d => d.delta > 0);
        const bloq = resMix.detalle.find(d => d.motivoBloqueo)?.motivoBloqueo || '';

        if (detDesc.length > 0) {
            descMedioLabel = `Desc. Mixto (${detDesc.map(d => `${d.medioNombre} -${d.porcentaje}%`).join(', ')})`;
            descMedioPct = subtotal > 0 ? Math.round((descMedioMonto / subtotal) * 1000) / 10 : 0;
        }
        if (detRec.length > 0) {
            recargoLabel = `Recargo Mixto (${detRec.map(d => `${d.medioNombre} +${d.porcentaje}%`).join(', ')})`;
            recargoPct = baseNeta > 0 ? Math.round((recargoMonto / baseNeta) * 1000) / 10 : 0;
        }
        motivoBloqueo = bloq;
    }

    const descMonto = Math.round((descManualMonto + descMedioMonto) * 100) / 100;

    let descPct = 0;
    if (descManualMonto === 0 && !st.pagoDividido && descMedioPct > 0) {
        descPct = descMedioPct;
    } else if (descMonto > 0 && subtotal > 0) {
        descPct = Math.round((descMonto / subtotal) * 1000) / 10;
    }

    return {
        subtotal,
        descManualPct,
        descPct,
        descManualMonto,
        descMedioMonto,
        descMedioLabel,
        descMonto,
        baseNeta,
        recargoPct,
        recargoMonto,
        recargoLabel,
        motivoBloqueo,
        total
    };
};

const _actualizarCobroMixtoBasePos = actualizarCobroMixtoPos;
actualizarCobroMixtoPos = function (autoSincronizarMonto1 = false) {
    _actualizarCobroMixtoBasePos(autoSincronizarMonto1);

    if (!window.MediosPagoEngine) return;
    const tot = calcularTotalesTicketPos();

    const c1 = document.getElementById('pos-m1-cred-wrap');
    const c2 = document.getElementById('pos-m2-cred-wrap');
    if (c1) c1.style.display = 'none';
    if (c2) c2.style.display = 'none';

    const setTxt = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    const toggleEl = (id, show) => { const el = document.getElementById(id); if (el) el.style.display = show ? 'flex' : 'none'; };

    toggleEl('pos-row-descuento', tot.descManualMonto > 0);
    setTxt('pos-lbl-descuento', `Descuento Global (${tot.descManualPct}%)`);
    setTxt('pos-val-descuento', `-${formatearMonedaPos(tot.descManualMonto)}`);

    toggleEl('pos-row-desc-medio', tot.descMedioMonto > 0);
    setTxt('pos-lbl-desc-medio', tot.descMedioLabel);
    setTxt('pos-val-desc-medio', `-${formatearMonedaPos(tot.descMedioMonto)}`);

    toggleEl('pos-row-recargo', tot.recargoMonto > 0);
    setTxt('pos-lbl-recargo', tot.recargoLabel);
    setTxt('pos-val-recargo', `+${formatearMonedaPos(tot.recargoMonto)}`);

    const hintEl = document.getElementById('pos-regla-auto-hint');
    if (hintEl) hintEl.textContent = tot.motivoBloqueo ? `⚠️ ${tot.motivoBloqueo}` : '';

    actualizarBannerAliasPos();
};

const _construirTicketThermalBasePos = construirTextoTicketVentaThermal;
construirTextoTicketVentaThermal = function (venta, anchoMm = 80) {
    if (!venta) return _construirTicketThermalBasePos(venta, anchoMm);
    const copia = { ...venta };
    const sub = Number(copia.subtotal) || 0;
    const descM = Number(copia.descuentoMonto) || 0;
    const recM = Number(copia.recargoMonto) || 0;
    if (descM > 0 && !(Number(copia.descuentoPct) > 0) && sub > 0) {
        copia.descuentoPct = Math.round((descM / sub) * 1000) / 10;
    }
    if (recM > 0 && !(Number(copia.recargoPct) > 0) && sub > 0) {
        const baseRec = Math.max(1, sub - descM);
        copia.recargoPct = Math.round((recM / baseRec) * 1000) / 10;
    }
    return _construirTicketThermalBasePos(copia, anchoMm);
};

const _enviarWaBasePos = enviarTicketVentaWhatsAppPos;
enviarTicketVentaWhatsAppPos = function (venta) {
    if (!venta || !window.MediosPagoEngine) return _enviarWaBasePos(venta);

    const textoTransf = window.MediosPagoEngine.obtenerTextoTransferenciaWhatsApp();
    const usaTransfOFia = (venta.pagos || []).some(
        p => esMedioTransferenciaOBilleteraPos(p.medio) || p.medio === 'Cuenta Corriente'
    );

    if (!textoTransf || !usaTransfOFia) {
        return _enviarWaBasePos(venta);
    }

    const comercio = obtenerNombreComercioPos();
    const fechaTxt = new Date(venta.fecha).toLocaleString('es-AR');
    let msg = `🧾 *Comprobante ${venta.numeroTicket}* — *${comercio}*\n`;
    if (venta.estado === 'anulada') msg += `🚫 *[COMPROBANTE ANULADO]*\n`;
    msg += `📅 ${fechaTxt}\n`;
    if (venta.clienteNombre && venta.clienteNombre !== 'Consumidor Final') {
        msg += `👤 Cliente: ${venta.clienteNombre}\n`;
    }
    msg += `\n`;
    (venta.items || []).forEach(it => {
        const abrev = abrevUnidadPos(it.unidadMedida);
        const sub = Math.round(it.precioUnit * it.cantidad * 100) / 100;
        msg += `• ${it.nombre} (${formatearCantPos(it.cantidad, it.familiaMedicion, it.unidadMedida)} ${abrev}) — ${formatearMonedaPos(sub)}\n`;
    });
    if (venta.descuentoMonto > 0) msg += `\n🏷️ Descuento aplicado: -${formatearMonedaPos(venta.descuentoMonto)}`;
    if (venta.recargoMonto > 0) msg += `\n💳 Recargo por medio: +${formatearMonedaPos(venta.recargoMonto)}`;
    msg += `\n\n*TOTAL: ${formatearMonedaPos(venta.total)} ARS*\n`;
    msg += `Medios: ${(venta.pagos || []).map(p => `${p.medio} (${formatearMonedaPos(p.monto)})`).join(' + ')}\n`;
    msg += `\n${textoTransf}\n`;
    msg += `\n¡Muchas gracias por tu compra!`;

    const tel = String(venta.clienteTelefono || '').replace(/[^\d]/g, '');
    const url = tel
        ? `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener');
};

const _inicializarPosBaseMP = inicializarPos;
inicializarPos = function () {
    _inicializarPosBaseMP();
    poblarSelectoresMediosPagoPos();

    const chkAuto = document.getElementById('pos-chk-regla-auto');
    if (chkAuto && !chkAuto.dataset.mpBound) {
        chkAuto.checked = window.posState.aplicarReglaAuto !== false;
        chkAuto.addEventListener('change', (e) => {
            window.posState.aplicarReglaAuto = e.target.checked;
            actualizarCobroMixtoPos(!window.posState.pagoDividido);
        });
        chkAuto.dataset.mpBound = '1';
    }

    const btnCopy = document.getElementById('btn-pos-copiar-alias');
    if (btnCopy && !btnCopy.dataset.mpBound) {
        btnCopy.addEventListener('click', async () => {
            const val = btnCopy.dataset.copyVal || '';
            if (!val) return;
            try {
                await navigator.clipboard.writeText(val);
                const prev = btnCopy.textContent;
                btnCopy.textContent = '✅ Copiado';
                setTimeout(() => { btnCopy.textContent = prev; }, 1400);
            } catch {
                prompt('Copia tu Alias / CBU:', val);
            }
        });
        btnCopy.dataset.mpBound = '1';
    }

    actualizarCobroMixtoPos(!window.posState.pagoDividido);
};

if (!window._posMpSyncListener) {
    window.addEventListener('cat-alogo:medios-pago-actualizados', () => {
        if (!document.getElementById('pos-module-root')) return;
        poblarSelectoresMediosPagoPos();
        actualizarCobroMixtoPos(!window.posState.pagoDividido);
    });
    window._posMpSyncListener = true;
}

/* ==========================================================================
   CONEXIÓN CON AJUSTES ETAPA 3 (TICKET 80MM/58MM, PIE Y BEEP)
   ========================================================================== */
if (typeof construirTextoTicketVentaThermal === 'function' && !construirTextoTicketVentaThermal._conAjustes) {
    const _ticketBaseSinAjustes = construirTextoTicketVentaThermal;
    construirTextoTicketVentaThermal = function (venta, anchoMm) {
        const hw = window.CatAlogoAjustes?.obtenerHardwarePos?.();
        const anchoFinal = anchoMm || hw?.anchoTicketMm || 80;
        let texto = _ticketBaseSinAjustes(venta, anchoFinal);

        if (hw?.mensajePieTicket) {
            const pieLimpio = String(hw.mensajePieTicket)
                .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
                .trim();
            if (pieLimpio) {
                texto = texto.replace(/GRACIAS POR SU COMPRA!/i, pieLimpio);
            }
        }
        if (hw?.corteAutomatico) {
            texto += '\n\n';
        }
        return texto;
    };
    construirTextoTicketVentaThermal._conAjustes = true;
}

if (typeof agregarProductoAlTicketPos === 'function' && !agregarProductoAlTicketPos._conBeep) {
    const _agregarBasePos = agregarProductoAlTicketPos;
    agregarProductoAlTicketPos = function (...args) {
        const res = _agregarBasePos.apply(this, args);
        window.CatAlogoAjustes?.reproducirBeepScanner?.();
        return res;
    };
    agregarProductoAlTicketPos._conBeep = true;
}

/* ==========================================================================
   MEJORA POS: CAMPO "📝 NOTA DEL TICKET (OPCIONAL)"
   ========================================================================== */
function asegurarCampoNotaTicketPos() {
    const ctaWrap = document.querySelector('#pos-module-root .pos-ticket-cta-wrap');
    if (!ctaWrap || document.getElementById('pos-nota-ticket-wrap')) return;

    const wrap = document.createElement('div');
    wrap.id = 'pos-nota-ticket-wrap';
    wrap.style.cssText = 'margin-bottom:0.5rem;';
    wrap.innerHTML = `
        <input type="text"
               id="pos-nota-ticket-input"
               class="pos-input-sm"
               maxlength="140"
               placeholder="📝 Nota del ticket (opcional: ej. retira a las 18 hs, sin cambio...)"
               style="width:100%; padding:0.42rem 0.65rem; font-size:0.75rem; border:1px solid #cbd5e1; border-radius:8px; background:#f8fafc;">
    `;
    ctaWrap.insertBefore(wrap, ctaWrap.firstChild);
}

if (!window._posNotaTicketHooked) {
    if (typeof window.inicializarPos === 'function') {
        const _initPosPrev = window.inicializarPos;
        window.inicializarPos = function (...args) {
            const res = _initPosPrev.apply(this, args);
            asegurarCampoNotaTicketPos();
            return res;
        };
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#btn-pos-ir-cobro')) return;

        const inp = document.getElementById('pos-nota-ticket-input');
        const notaIngresada = (inp?.value || '').trim();
        if (!notaIngresada) return;

        let cantidadPrevia = 0;
        try {
            cantidadPrevia = JSON.parse(localStorage.getItem('cat_alogo_pos_ventas_v1') || '[]').length;
        } catch { cantidadPrevia = 0; }

        setTimeout(() => {
            try {
                const ventas = JSON.parse(localStorage.getItem('cat_alogo_pos_ventas_v1') || '[]');
                if (Array.isArray(ventas) && ventas.length > cantidadPrevia && ventas[0]) {
                    ventas[0].nota = notaIngresada;
                    localStorage.setItem('cat_alogo_pos_ventas_v1', JSON.stringify(ventas));
                    if (inp) inp.value = '';
                }
            } catch (err) {
                console.warn('No se pudo adjuntar la nota al ticket:', err);
            }
        }, 30);
    }, true);

    document.addEventListener('click', (e) => {
        if (e.target.closest('#btn-pos-vaciar-ticket') || e.target.closest('#btn-pos-cmd-cancelar')) {
            const inp = document.getElementById('pos-nota-ticket-input');
            if (inp) inp.value = '';
        }
    });

    window._posNotaTicketHooked = true;
}

/* ==========================================================================
   MEJORA POS PRO: PAGINACIÓN, ORDENAMIENTO, 3 VISTAS, ANCLADOS,
   SELECTOR DUAL DE CATEGORÍAS Y RECEPTOR GLOBAL DE ESCÁNER USB
   ========================================================================== */
(function () {
    const KEY_POS_UI_PREFS = 'cat_alogo_pos_ui_prefs_v1';
    const KEY_POS_PINNED   = 'cat_alogo_pos_pinned_v1';

    function leerJsonSeguroPos(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }

    const prefsGuardadas = leerJsonSeguroPos(KEY_POS_UI_PREFS, {}) || {};
    const pinesGuardados = leerJsonSeguroPos(KEY_POS_PINNED, []);

    Object.assign(window.posState, {
        catMode: prefsGuardadas.catMode || 'chips',       // 'dropdown' | 'chips'
        catDropdownSearch: '',
        viewMode: prefsGuardadas.viewMode || 'grid',      // 'grid' | 'list' | 'compact'
        sortBy: prefsGuardadas.sortBy || 'frecuente',     // 'frecuente' | 'nombre_asc' | ...
        onlyPinned: false,
        pinnedIds: new Set(Array.isArray(pinesGuardados) ? pinesGuardados.map(String) : []),
        paginaActual: 1,
        porPagina: Number(prefsGuardadas.porPagina) || 18,
        _ultimoFiltroKey: ''
    });

    function guardarPrefsUiPos() {
        localStorage.setItem(KEY_POS_UI_PREFS, JSON.stringify({
            catMode: window.posState.catMode,
            viewMode: window.posState.viewMode,
            sortBy: window.posState.sortBy,
            porPagina: window.posState.porPagina
        }));
    }

    function guardarPinesPos() {
        localStorage.setItem(KEY_POS_PINNED, JSON.stringify(Array.from(window.posState.pinnedIds)));
    }

    function asegurarEstiloPinGridPos() {
        if (document.getElementById('pos-pro-pin-grid-fix')) return;
        const st = document.createElement('style');
        st.id = 'pos-pro-pin-grid-fix';
        st.textContent = `.pos-products-grid:not(.view-list):not(.view-compact) .pos-pin-btn { top: 86px; bottom: auto; }`;
        document.head.appendChild(st);
    }

    function calcularMapaFrecuenciaVentasPos() {
        const mapa = new Map();
        const ventas = obtenerVentasPos();
        ventas.forEach(v => {
            if (v.estado === 'anulada') return;
            (v.items || []).forEach(it => {
                const id = String(it.prodId || '');
                if (!id) return;
                mapa.set(id, (mapa.get(id) || 0) + (Number(it.cantidad) || 1));
            });
        });
        return mapa;
    }

    function obtenerCategoriasOrdenadasPos() {
        const productos = obtenerProductosPos();
        const mapa = {};
        productos.forEach(p => {
            const cat = (p.categoria || 'General').trim() || 'General';
            mapa[cat] = (mapa[cat] || 0) + 1;
        });
        const cats = Object.keys(mapa).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
        return { productos, mapa, cats };
    }

    function renderizarListaDesplegableCategoriasPos() {
        const listEl = document.getElementById('pos-cat-dropdown-list');
        const lblBtn = document.getElementById('pos-cat-dropdown-label');
        if (!listEl) return;

        const { productos, mapa, cats } = obtenerCategoriasOrdenadasPos();
        const activa = window.posState.categoriaActiva || 'todos';
        const q = (window.posState.catDropdownSearch || '').trim().toLowerCase();

        if (lblBtn) {
            if (activa === 'todos') {
                lblBtn.textContent = `📂 Todas las categorías (${productos.length})`;
            } else {
                const match = cats.find(c => c.toLowerCase() === activa);
                lblBtn.textContent = match ? `📂 ${match} (${mapa[match]})` : '📂 Todas las categorías';
            }
        }

        let html = '';
        if (!q || 'todos'.includes(q) || 'todas'.includes(q)) {
            html += `
                <button type="button" class="pos-cat-dropdown-item ${activa === 'todos' ? 'active' : ''}" data-poscat="todos">
                    <span>Todas las categorías</span>
                    <span>${productos.length}</span>
                </button>
            `;
        }

        const filtradas = cats.filter(c => !q || c.toLowerCase().includes(q));
        filtradas.forEach(cat => {
            const key = cat.toLowerCase();
            html += `
                <button type="button" class="pos-cat-dropdown-item ${activa === key ? 'active' : ''}" data-poscat="${escaparHtmlPos(key)}">
                    <span>${escaparHtmlPos(cat)}</span>
                    <span>${mapa[cat]}</span>
                </button>
            `;
        });

        if (!html) {
            html = `<div style="padding:0.75rem; text-align:center; font-size:0.75rem; color:#64748b;">Sin categorías con ese nombre</div>`;
        }
        listEl.innerHTML = html;
    }

    function aplicarModoCategoriasUiPos() {
        const esDropdown = window.posState.catMode === 'dropdown';
        const wrapDrop = document.getElementById('pos-cats-dropdown-wrap');
        const barChips = document.getElementById('pos-cats-bar');
        const btnDrop  = document.getElementById('btn-pos-cat-mode-dropdown');
        const btnChips = document.getElementById('btn-pos-cat-mode-chips');

        if (wrapDrop) wrapDrop.style.display = esDropdown ? 'block' : 'none';
        if (barChips) barChips.style.display = esDropdown ? 'none' : 'flex';
        if (btnDrop)  btnDrop.classList.toggle('active', esDropdown);
        if (btnChips) btnChips.classList.toggle('active', !esDropdown);
    }

    renderizarCategoriasPos = function () {
        aplicarModoCategoriasUiPos();
        renderizarListaDesplegableCategoriasPos();

        const bar = document.getElementById('pos-cats-bar');
        if (!bar) return;

        const { productos, mapa, cats } = obtenerCategoriasOrdenadasPos();
        const activa = window.posState.categoriaActiva || 'todos';

        let html = `
            <button type="button" class="pos-cat-chip ${activa === 'todos' ? 'active' : ''}" data-poscat="todos">
                Todos (${productos.length})
            </button>
        `;
        cats.forEach(cat => {
            const key = cat.toLowerCase();
            html += `
                <button type="button" class="pos-cat-chip ${activa === key ? 'active' : ''}" data-poscat="${escaparHtmlPos(key)}">
                    ${escaparHtmlPos(cat)} (${mapa[cat]})
                </button>
            `;
        });

        bar.innerHTML = html;
        bar.querySelectorAll('.pos-cat-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                window.posState.categoriaActiva = btn.getAttribute('data-poscat');
                window.posState.paginaActual = 1;
                renderizarCategoriasPos();
                renderizarCatalogoPos();
            });
        });
    };

    renderizarCatalogoPos = function () {
        const grid = document.getElementById('pos-products-grid');
        const lblCount = document.getElementById('pos-catalog-count');
        if (!grid) return;

        const st = window.posState;
        const productos = obtenerProductosPos();
        const catActiva = st.categoriaActiva || 'todos';
        const q = (st.busqueda || '').trim().toLowerCase();

        grid.classList.toggle('view-list', st.viewMode === 'list');
        grid.classList.toggle('view-compact', st.viewMode === 'compact');

        const pinnedCountEl = document.getElementById('pos-pinned-count');
        const validPinned = productos.filter(p => st.pinnedIds.has(String(p.id))).length;
        if (pinnedCountEl) pinnedCountEl.textContent = String(validPinned);
        document.getElementById('btn-pos-only-pinned')?.classList.toggle('active', !!st.onlyPinned);

        const filtroKey = `${catActiva}|${q}|${st.sortBy}|${st.onlyPinned}|${st.porPagina}`;
        if (st._ultimoFiltroKey !== filtroKey) {
            st.paginaActual = 1;
            st._ultimoFiltroKey = filtroKey;
        }

        let filtrados = productos.filter(p => {
            if (st.onlyPinned && !st.pinnedIds.has(String(p.id))) return false;
            if (catActiva !== 'todos') {
                if (((p.categoria || 'General').trim() || 'General').toLowerCase() !== catActiva) return false;
            }
            if (q) {
                const varSkus = Array.isArray(p.variantesDetalle)
                    ? p.variantesDetalle.map(v => `${v.nombre || ''} ${v.sku || ''}`).join(' ')
                    : '';
                const corpus = `${p.nombre || ''} ${p.sku || ''} ${p.codigoBarras || ''} ${p.categoria || ''} ${varSkus}`.toLowerCase();
                if (!corpus.includes(q)) return false;
            }
            return true;
        });

        const freqMap = st.sortBy === 'frecuente' ? calcularMapaFrecuenciaVentasPos() : null;
        const precioDe = (p) => {
            const defIdx = obtenerIndiceVarianteInicialPos(p);
            return obtenerPrecioVentaProdPos(p, defIdx);
        };
        const esOferta = (p) => {
            const defIdx = obtenerIndiceVarianteInicialPos(p);
            if (obtenerInfoVariantePos(p, defIdx).tieneOferta) return true;
            if (Array.isArray(p.variantesDetalle)) {
                return p.variantesDetalle.some((_, idx) => obtenerInfoVariantePos(p, idx).tieneOferta);
            }
            return false;
        };

        filtrados.sort((a, b) => {
            const pinA = st.pinnedIds.has(String(a.id)) ? 1 : 0;
            const pinB = st.pinnedIds.has(String(b.id)) ? 1 : 0;
            if (pinA !== pinB) return pinB - pinA;

            switch (st.sortBy) {
                case 'nombre_asc':
                    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
                case 'nombre_desc':
                    return String(b.nombre || '').localeCompare(String(a.nombre || ''), 'es', { sensitivity: 'base' });
                case 'cat_asc': {
                    const c = String(a.categoria || 'General').localeCompare(String(b.categoria || 'General'), 'es', { sensitivity: 'base' });
                    return c !== 0 ? c : String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
                }
                case 'cat_desc': {
                    const c = String(b.categoria || 'General').localeCompare(String(a.categoria || 'General'), 'es', { sensitivity: 'base' });
                    return c !== 0 ? c : String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
                }
                case 'precio_desc':
                    return precioDe(b) - precioDe(a);
                case 'precio_asc':
                    return precioDe(a) - precioDe(b);
                case 'ofertas': {
                    const oa = esOferta(a) ? 1 : 0;
                    const ob = esOferta(b) ? 1 : 0;
                    if (oa !== ob) return ob - oa;
                    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
                }
                case 'balanza': {
                    const ba = esProductoBalanzaPos(a) ? 1 : 0;
                    const bb = esProductoBalanzaPos(b) ? 1 : 0;
                    if (ba !== bb) return bb - ba;
                    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
                }
                case 'stock_asc':
                    return (Number(a.stock) || 0) - (Number(b.stock) || 0);
                case 'frecuente':
                default: {
                    const fa = freqMap ? (freqMap.get(String(a.id)) || 0) : 0;
                    const fb = freqMap ? (freqMap.get(String(b.id)) || 0) : 0;
                    if (fa !== fb) return fb - fa;
                    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
                }
            }
        });

        const total = filtrados.length;
        const porPagina = Math.max(6, Number(st.porPagina) || 18);
        const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
        if (st.paginaActual > totalPaginas) st.paginaActual = totalPaginas;
        if (st.paginaActual < 1) st.paginaActual = 1;

        const inicio = (st.paginaActual - 1) * porPagina;
        const paginaItems = filtrados.slice(inicio, inicio + porPagina);

        if (lblCount) {
            lblCount.textContent = `${total} ${total === 1 ? 'producto disponible' : 'productos disponibles'}`;
        }

        const pagInfo = document.getElementById('pos-page-info');
        const btnPrev = document.getElementById('btn-pos-page-prev');
        const btnNext = document.getElementById('btn-pos-page-next');
        if (pagInfo) pagInfo.textContent = `Página ${st.paginaActual} de ${totalPaginas}`;
        if (btnPrev) btnPrev.disabled = st.paginaActual <= 1;
        if (btnNext) btnNext.disabled = st.paginaActual >= totalPaginas;

        if (paginaItems.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align:center; padding:2.5rem 1rem; background:#ffffff; border:1px dashed #cbd5e1; border-radius:12px; color:#64748b; font-size:0.84rem;">
                    ${st.onlyPinned ? 'Todavía no anclaste ningún producto. Presiona 📌 en cualquier producto para fijarlo arriba.' : 'No se encontraron productos con ese criterio.'}
                </div>
            `;
            return;
        }

        grid.innerHTML = paginaItems.map(p => {
            const esBalanza = esProductoBalanzaPos(p);
            const tieneVariantes = Array.isArray(p.variantesDetalle) && p.variantesDetalle.length > 0;
            const defaultVarIdx = tieneVariantes ? obtenerIndiceVarianteInicialPos(p) : null;
            const infoVar = obtenerInfoVariantePos(p, defaultVarIdx);
            const foto = infoVar.imagen;
            const abrev = abrevUnidadPos(p.unidadMedida);
            const isPinned = st.pinnedIds.has(String(p.id));

            const stockTotal = Number(p.stock) || 0;
            const sinStock = stockTotal <= 0;
            const stockTxt = formatearCantPos(stockTotal, p.familiaMedicion, p.unidadMedida);
            const badgeStockClass = sinStock ? 'out' : (stockTotal <= 5 ? 'low' : '');

            const tieneOferta = infoVar.tieneOferta;
            const precioBase = infoVar.precioFinal;

            let controlHtml = '';
            if (esBalanza) {
                const cantDef = abrev === 'kg' || abrev === 'L' || abrev === 'm' ? 0.5 : 1;
                const subDef = Math.round(precioBase * cantDef * 100) / 100;
                controlHtml = `
                    <div class="pos-prod-ctrl-row">
                        <input type="number" class="pos-qty-input pos-balanza-qty" min="0.001" step="0.001" value="${cantDef}" data-precio="${precioBase}">
                        <span class="pos-prod-unit">${escaparHtmlPos(abrev)}</span>
                        <button type="button" class="pos-add-btn btn-pos-add-prod" data-prod-id="${p.id}" ${sinStock ? 'disabled' : ''}>
                            + ${formatearMonedaPos(subDef)}
                        </button>
                    </div>
                `;
            } else {
                const varSelectorHtml = tieneVariantes
                    ? `<select class="pos-var-select" data-prod-id="${p.id}">
                        ${p.variantesDetalle.map((v, idx) => {
                            const vst = Number(v.stock) || 0;
                            const vInfo = obtenerInfoVariantePos(p, idx);
                            const tagOf = vInfo.tieneOferta ? ' ★OF' : '';
                            return `<option value="${idx}" ${idx === defaultVarIdx ? 'selected' : ''} ${vst <= 0 ? 'disabled' : ''}>${escaparHtmlPos(v.nombre)} — ${formatearMonedaPos(vInfo.precioFinal)}${tagOf} (${vst} ${escaparHtmlPos(abrev)})</option>`;
                        }).join('')}
                       </select>`
                    : '';

                controlHtml = `
                    ${varSelectorHtml}
                    <div class="pos-prod-ctrl-row">
                        <div class="pos-stepper">
                            <button type="button" class="pos-step-btn" data-step="-1">−</button>
                            <span class="pos-step-val">1</span>
                            <button type="button" class="pos-step-btn" data-step="1">+</button>
                        </div>
                        <button type="button" class="pos-add-btn btn-pos-add-prod" data-prod-id="${p.id}" ${sinStock ? 'disabled' : ''}>
                            🛒 Agregar
                        </button>
                    </div>
                `;
            }

            return `
                <article class="pos-prod-card ${sinStock ? 'out-of-stock' : ''} ${isPinned ? 'is-pinned' : ''}" data-prod-id="${p.id}">
                    <button type="button" class="pos-pin-btn ${isPinned ? 'is-pinned' : ''}" data-pin-id="${p.id}" title="${isPinned ? 'Quitar anclado' : 'Anclar arriba en el catálogo'}">📌</button>
                    <div class="pos-prod-img-wrap">
                        ${esBalanza ? '<span class="pos-badge-tl">⚖️ BALANZA</span>' : ''}
                        <span class="pos-badge-tr ${badgeStockClass}">${sinStock ? 'SIN STOCK' : `Stock: ${stockTxt} ${escaparHtmlPos(abrev)}`}</span>
                        <img src="${foto}" alt="${escaparHtmlPos(p.nombre)}" loading="lazy">
                    </div>
                    <div class="pos-prod-body">
                        <div class="pos-prod-main-info">
                            <span class="pos-prod-sku">${escaparHtmlPos(p.sku)}</span>
                            <span class="pos-list-stock-inline ${badgeStockClass}">${sinStock ? 'SIN STOCK' : `${stockTxt} ${escaparHtmlPos(abrev)}`}</span>
                            <h4 class="pos-prod-name">${escaparHtmlPos(p.nombre)}</h4>
                            <div class="pos-prod-price-row">
                                <span class="pos-prod-price">${formatearMonedaPos(precioBase)}</span>
                                <span class="pos-prod-unit">/ ${escaparHtmlPos(abrev)}</span>
                                ${tieneOferta ? `<span class="pos-prod-old">${formatearMonedaPos(infoVar.precioNormal)}</span>` : ''}
                            </div>
                        </div>
                        ${controlHtml}
                    </div>
                </article>
            `;
        }).join('');
    };

    function flashScannerPillPos(texto, esError = false) {
        const pill = document.getElementById('pos-scanner-pill');
        if (!pill) return;
        pill.textContent = texto;
        pill.classList.remove('is-scanning', 'is-error');
        pill.classList.add(esError ? 'is-error' : 'is-scanning');
        clearTimeout(pill._t);
        pill._t = setTimeout(() => {
            pill.textContent = '🔫 USB';
            pill.classList.remove('is-scanning', 'is-error');
        }, 1400);
    }

    function beepErrorScannerPos() {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, ctx.currentTime);
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.24);
        } catch { /* sin audio */ }
    }

    function procesarCodigoEscaneadoPos(codigoRaw) {
        const q = String(codigoRaw || '').trim().toLowerCase();
        if (!q) return false;

        const productos = obtenerProductosPos();
        for (const p of productos) {
            const skuMatch = String(p.sku || '').trim().toLowerCase() === q;
            const barMatch = p.codigoBarras && String(p.codigoBarras).trim().toLowerCase() === q;
            if (skuMatch || barMatch) {
                const cant = esProductoBalanzaPos(p) ? 0.5 : 1;
                agregarProductoAlTicketPos(p.id, cant, null);
                flashScannerPillPos(`✅ +1 ${String(p.nombre || '').slice(0, 14)}`, false);
                return true;
            }
            if (Array.isArray(p.variantesDetalle)) {
                const vIdx = p.variantesDetalle.findIndex(v => String(v.sku || '').trim().toLowerCase() === q);
                if (vIdx !== -1) {
                    agregarProductoAlTicketPos(p.id, 1, vIdx);
                    const vNom = p.variantesDetalle[vIdx]?.nombre || '';
                    flashScannerPillPos(`✅ +1 ${String(p.nombre || '').slice(0, 10)} (${vNom})`, false);
                    return true;
                }
            }
        }

        beepErrorScannerPos();
        flashScannerPillPos('❌ Sin SKU', true);
        const inp = document.getElementById('pos-search-input');
        if (inp) {
            inp.value = codigoRaw.trim();
            window.posState.busqueda = codigoRaw.trim();
            window.posState.paginaActual = 1;
            renderizarCatalogoPos();
        }
        return false;
    }

    if (!window._posUsbScannerBound) {
        let scanBuf = '';
        let lastKeyTs = 0;

        document.addEventListener('keydown', (e) => {
            if (!document.getElementById('pos-module-root')) return;
            if (document.querySelector('.pos-modal-overlay.active, .pos-drawer-overlay.active')) return;

            const tag = (e.target?.tagName || '').toLowerCase();
            const esInputExterno = (tag === 'input' || tag === 'textarea' || tag === 'select') && e.target.id !== 'pos-search-input';
            if (esInputExterno) return;
            if (e.target?.id === 'pos-search-input') return;

            const ahora = Date.now();
            if (ahora - lastKeyTs > 80) {
                scanBuf = '';
            }

            if (e.key === 'Enter') {
                if (scanBuf.length >= 4) {
                    e.preventDefault();
                    const code = scanBuf;
                    scanBuf = '';
                    procesarCodigoEscaneadoPos(code);
                } else {
                    scanBuf = '';
                }
                return;
            }

            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                scanBuf += e.key;
                lastKeyTs = ahora;
            }
        });

        window._posUsbScannerBound = true;
    }

    function enlazarEventosPosPro() {
        const root = document.getElementById('pos-module-root');
        if (!root || root.dataset.posProBound) return;
        root.dataset.posProBound = '1';

        asegurarEstiloPinGridPos();

        const sortSel = document.getElementById('pos-sort-select');
        if (sortSel) {
            sortSel.value = window.posState.sortBy;
            sortSel.addEventListener('change', (e) => {
                window.posState.sortBy = e.target.value;
                window.posState.paginaActual = 1;
                guardarPrefsUiPos();
                renderizarCatalogoPos();
            });
        }

        const pageSel = document.getElementById('pos-page-size-select');
        if (pageSel) {
            pageSel.value = String(window.posState.porPagina);
            pageSel.addEventListener('change', (e) => {
                window.posState.porPagina = Number(e.target.value) || 18;
                window.posState.paginaActual = 1;
                guardarPrefsUiPos();
                renderizarCatalogoPos();
            });
        }

        const viewSwitch = document.getElementById('pos-view-switcher');
        if (viewSwitch) {
            viewSwitch.querySelectorAll('.pos-view-btn').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-pos-view') === window.posState.viewMode);
            });
            viewSwitch.addEventListener('click', (e) => {
                const btn = e.target.closest('.pos-view-btn');
                if (!btn) return;
                window.posState.viewMode = btn.getAttribute('data-pos-view') || 'grid';
                viewSwitch.querySelectorAll('.pos-view-btn').forEach(b => b.classList.toggle('active', b === btn));
                guardarPrefsUiPos();
                renderizarCatalogoPos();
            });
        }

        document.getElementById('btn-pos-only-pinned')?.addEventListener('click', () => {
            window.posState.onlyPinned = !window.posState.onlyPinned;
            window.posState.paginaActual = 1;
            renderizarCatalogoPos();
        });

        document.getElementById('pos-products-grid')?.addEventListener('click', (e) => {
            const pinBtn = e.target.closest('.pos-pin-btn');
            if (!pinBtn) return;
            e.stopPropagation();
            const pid = String(pinBtn.getAttribute('data-pin-id') || '');
            if (!pid) return;
            if (window.posState.pinnedIds.has(pid)) window.posState.pinnedIds.delete(pid);
            else window.posState.pinnedIds.add(pid);
            guardarPinesPos();
            renderizarCatalogoPos();
        });

        const scrollTopCatalogo = () => {
            const area = document.getElementById('pos-catalog-scroll-area');
            if (area) area.scrollTop = 0;
        };
        document.getElementById('btn-pos-page-prev')?.addEventListener('click', () => {
            if (window.posState.paginaActual > 1) {
                window.posState.paginaActual--;
                renderizarCatalogoPos();
                scrollTopCatalogo();
            }
        });
        document.getElementById('btn-pos-page-next')?.addEventListener('click', () => {
            window.posState.paginaActual++;
            renderizarCatalogoPos();
            scrollTopCatalogo();
        });

        const setCatMode = (mode) => {
            window.posState.catMode = mode;
            guardarPrefsUiPos();
            renderizarCategoriasPos();
        };
        document.getElementById('btn-pos-cat-mode-dropdown')?.addEventListener('click', () => setCatMode('dropdown'));
        document.getElementById('btn-pos-cat-mode-chips')?.addEventListener('click', () => setCatMode('chips'));

        const dropWrap = document.getElementById('pos-cats-dropdown-wrap');
        const dropBtn  = document.getElementById('pos-cat-dropdown-btn');
        const dropSearch = document.getElementById('pos-cat-dropdown-search');
        const dropList = document.getElementById('pos-cat-dropdown-list');

        dropBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const abierto = dropWrap.classList.toggle('is-open');
            dropBtn.setAttribute('aria-expanded', abierto ? 'true' : 'false');
            if (abierto) {
                window.posState.catDropdownSearch = '';
                if (dropSearch) { dropSearch.value = ''; dropSearch.focus(); }
                renderizarListaDesplegableCategoriasPos();
            }
        });

        dropSearch?.addEventListener('input', (e) => {
            window.posState.catDropdownSearch = e.target.value;
            renderizarListaDesplegableCategoriasPos();
        });

        dropList?.addEventListener('click', (e) => {
            const item = e.target.closest('.pos-cat-dropdown-item');
            if (!item) return;
            window.posState.categoriaActiva = item.getAttribute('data-poscat');
            window.posState.paginaActual = 1;
            dropWrap?.classList.remove('is-open');
            dropBtn?.setAttribute('aria-expanded', 'false');
            renderizarCategoriasPos();
            renderizarCatalogoPos();
        });

        if (!window._posCatDropOutsideBound) {
            document.addEventListener('click', (e) => {
                const w = document.getElementById('pos-cats-dropdown-wrap');
                if (w && w.classList.contains('is-open') && !w.contains(e.target)) {
                    w.classList.remove('is-open');
                    document.getElementById('pos-cat-dropdown-btn')?.setAttribute('aria-expanded', 'false');
                }
            });
            window._posCatDropOutsideBound = true;
        }
    }

    if (typeof window.inicializarPos === 'function') {
        const _initPosPrevPro = window.inicializarPos;
        window.inicializarPos = function (...args) {
            const res = _initPosPrevPro.apply(this, args);
            enlazarEventosPosPro();
            renderizarCategoriasPos();
            renderizarCatalogoPos();
            return res;
        };
    }
})();

