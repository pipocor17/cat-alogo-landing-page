/* ==========================================================================
   MÓDULO: HUB FINANCIERO DE 7 NIVELES & ERP (ETAPAS 1, 2 Y 3)
   (PERÍODOS, 7 NIVELES, CMV FRICCIÓN CERO, OPEX, CXP, ARQUEO, ANALÍTICA Y P&L)
   ========================================================================== */

const STORAGE_KEY_FIN_MOVS = 'cat_alogo_fin_movimientos_v1';
const STORAGE_KEY_FIN_CONFIG = 'cat_alogo_fin_config_v1';

const FIN_CONFIG_DEFAULT = {
    margenGlobal: 30,
    dolarHoy: 1150,
    mostrarUsd: false,
    categoriasOpex: [
        'Alquiler y Expensas',
        'Salarios y Personal',
        'Servicios (Luz / Gas / Internet)',
        'Fletes y Logística',
        'Insumos y Empaques',
        'Impuestos y Tasas',
        'Marketing y Comisiones',
        'Otros Gastos Operativos'
    ],
    categoriasIngreso: [
        'Aporte de Capital',
        'Ingreso Extraordinario',
        'Cobro de Servicio / Envío',
        'Devolución de Proveedor',
        'Otros Ingresos'
    ]
};

const FIN_OPEX_PALETTE = ['#ef4444', '#f59e0b', '#6366f1', '#0ea5e9', '#10b981', '#ec4899', '#8b5cf6', '#64748b'];
const FIN_CAT_PALETTE = ['#047857', '#0284c7', '#6366f1', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6', '#64748b'];

window.finanzasState = {
    periodo: 'turno',
    turnoSeleccionadoId: 'activo',
    fechaDesde: new Date().toISOString().slice(0, 10),
    fechaHasta: new Date().toISOString().slice(0, 10),
    nivelActivo: 1,
    // Etapa 2
    movModalTipo: 'gasto',
    cxpLiquidandoId: null,
    arqModoCiego: false,
    arqConteoManual: 0,
    _firmaArqCargado: '',
    // Etapa 3
    rankTab: 'rentables'
};

let finOpexChartInstance = null;
let finEvolucionChartInstance = null;
let finCatChartInstance = null;

/* ==========================================================================
   HELPERS DE BÓVEDA LOCAL Y FORMATO
   ========================================================================== */
function obtenerConfigFinanzas() {
    let cfg = null;
    try {
        cfg = JSON.parse(localStorage.getItem(STORAGE_KEY_FIN_CONFIG) || 'null');
    } catch {
        cfg = null;
    }
    return {
        ...FIN_CONFIG_DEFAULT,
        ...(cfg || {}),
        categoriasOpex: Array.isArray(cfg?.categoriasOpex) && cfg.categoriasOpex.length > 0
            ? cfg.categoriasOpex
            : [...FIN_CONFIG_DEFAULT.categoriasOpex],
        categoriasIngreso: Array.isArray(cfg?.categoriasIngreso) && cfg.categoriasIngreso.length > 0
            ? cfg.categoriasIngreso
            : [...FIN_CONFIG_DEFAULT.categoriasIngreso]
    };
}

function guardarConfigFinanzas(cfg) {
    localStorage.setItem(STORAGE_KEY_FIN_CONFIG, JSON.stringify(cfg));
}

function obtenerMovimientosFinanzas() {
    try {
        const arr = JSON.parse(localStorage.getItem(STORAGE_KEY_FIN_MOVS) || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function guardarMovimientosFinanzas(lista) {
    localStorage.setItem(STORAGE_KEY_FIN_MOVS, JSON.stringify(lista));
}

function leerArrayLocalFin(clave) {
    try {
        const arr = JSON.parse(localStorage.getItem(clave) || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function esTurnoAbiertoFin(t) {
    return !!(t && (t.estado === 'abierto' || t.estado === 'abierta' || t.abierto === true));
}

function ventaPerteneceATurnoFin(v, turno) {
    if (!v || !turno) return false;
    const vTid = v.turnoId || v.cajaId;
    if (vTid) return String(vTid) === String(turno.id);
    const tsV = new Date(v.fecha || 0).getTime();
    const tsIni = new Date(turno.fechaApertura || 0).getTime() || 0;
    const tsFin = turno.fechaCierre ? (new Date(turno.fechaCierre).getTime() || Date.now()) : Date.now() + 60000;
    return !isNaN(tsV) && tsV >= tsIni && tsV <= tsFin;
}

function obtenerDesgloseFiadoVentaFin(v) {
    const totalVenta = Math.max(0, Math.round((Number(v?.total ?? v?.montoTotal) || 0) * 100) / 100);
    const pagos = Array.isArray(v?.pagos) ? v.pagos : [];
    const esMedioFiado = (m) => {
        const s = String(m || '').toLowerCase();
        return s.includes('corriente') || s.includes('fiado');
    };

    let montoFiado = Math.round(
        pagos
            .filter(p => esMedioFiado(p.medio || p.metodo))
            .reduce((a, p) => a + (Number(p.monto) || 0), 0) * 100
    ) / 100;

    if (montoFiado <= 0 && Number(v?.deudaGenerada) > 0) {
        montoFiado = Math.min(totalVenta, Math.round(Number(v.deudaGenerada) * 100) / 100);
    }

    const esAnulada = v?.estado === 'anulada' || v?.estadoPago === 'Anulado';
    const montoCobrado = esAnulada
        ? 0
        : Math.max(0, Math.round((totalVenta - montoFiado) * 100) / 100);

    return { totalVenta, montoFiado, montoCobrado, esAnulada };
}

function escaparHtmlFin(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatearArsFin(valor) {
    const num = Number(valor) || 0;
    return `$${num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatearUsdFin(valorArs, dolarHoy) {
    const d = Math.max(1, Number(dolarHoy) || 1150);
    const usd = (Number(valorArs) || 0) / d;
    return `≈ US$ ${usd.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function obtenerNombreComercioFin() {
    try {
        const pdfCfg = JSON.parse(localStorage.getItem('cat_alogo_pdf_config_v1') || 'null');
        if (pdfCfg && pdfCfg.headerNombre) return pdfCfg.headerNombre;
    } catch { /* fallback */ }
    return 'Cat-Alogo Store';
}

function abrevUnidadFin(unidadMedida) {
    if (typeof window.obtenerAbrevUnidad === 'function') return window.obtenerAbrevUnidad(unidadMedida);
    return 'u.';
}

/* ==========================================================================
   MOTOR DE RANGO TEMPORAL Y CÁLCULO DE LOS 7 NIVELES
   ========================================================================== */
function obtenerRangoTemporalFinanzas() {
    const st = window.finanzasState;
    const turnos = leerArrayLocalFin('cat_alogo_pos_turnos_v1');
    const ahora = new Date();

    if (st.periodo === 'turno') {
        let turnoObj = null;
        if (st.turnoSeleccionadoId === 'activo') {
            turnoObj = turnos.find(esTurnoAbiertoFin) || turnos[0] || null;
        } else {
            turnoObj = turnos.find(t => String(t.id) === String(st.turnoSeleccionadoId)) || turnos[0] || null;
        }

        if (!turnoObj) {
            const ini = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0).getTime();
            return { modo: 'turno', turno: null, inicioTs: ini, finTs: Date.now(), etiqueta: 'Sin turnos registrados' };
        }

        const inicioTs = new Date(turnoObj.fechaApertura).getTime() || 0;
        const finTs = turnoObj.fechaCierre ? new Date(turnoObj.fechaCierre).getTime() : Date.now() + 60000;
        const estTag = esTurnoAbiertoFin(turnoObj) ? 'Activo' : 'Cerrado';
        return {
            modo: 'turno',
            turno: turnoObj,
            inicioTs,
            finTs,
            etiqueta: `Turno #${turnoObj.numero} (${turnoObj.operador || turnoObj.cajeroNombre || 'Cajero'} • ${estTag})`
        };
    }

    if (st.periodo === 'hoy') {
        const ini = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0).getTime();
        const fin = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999).getTime();
        return { modo: 'hoy', turno: null, inicioTs: ini, finTs: fin, etiqueta: `Hoy (${ahora.toLocaleDateString('es-AR')})` };
    }

    if (st.periodo === 'semana') {
        const diaSem = ahora.getDay() === 0 ? 6 : ahora.getDay() - 1;
        const lunes = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - diaSem, 0, 0, 0);
        const fin = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999);
        return { modo: 'semana', turno: null, inicioTs: lunes.getTime(), finTs: fin.getTime(), etiqueta: `Esta Semana (desde ${lunes.toLocaleDateString('es-AR')})` };
    }

    if (st.periodo === 'mes') {
        const ini = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0);
        const fin = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59, 999);
        const nomMes = ahora.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
        return { modo: 'mes', turno: null, inicioTs: ini.getTime(), finTs: fin.getTime(), etiqueta: `Mes en Curso (${nomMes.charAt(0).toUpperCase() + nomMes.slice(1)})` };
    }

    if (st.periodo === 'anio') {
        const ini = new Date(ahora.getFullYear(), 0, 1, 0, 0, 0);
        const fin = new Date(ahora.getFullYear(), 11, 31, 23, 59, 59, 999);
        return { modo: 'anio', turno: null, inicioTs: ini.getTime(), finTs: fin.getTime(), etiqueta: `Año ${ahora.getFullYear()}` };
    }

    const d1 = st.fechaDesde ? new Date(st.fechaDesde + 'T00:00:00') : new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const d2 = st.fechaHasta ? new Date(st.fechaHasta + 'T23:59:59') : ahora;
    return {
        modo: 'custom',
        turno: null,
        inicioTs: Math.min(d1.getTime(), d2.getTime()),
        finTs: Math.max(d1.getTime(), d2.getTime()),
        etiqueta: `Del ${d1.toLocaleDateString('es-AR')} al ${d2.toLocaleDateString('es-AR')}`
    };
}

function construirSerieEvolucionFinanzas(rango, ventasValidas, gastosLista) {
    const mapa = new Map();
    const modo = rango.modo;

    const claveFecha = (iso) => {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        if (modo === 'turno' || modo === 'hoy') {
            return `${String(d.getHours()).padStart(2, '0')}:00`;
        }
        if (modo === 'anio') {
            return d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
        }
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    };

    if (modo === 'anio') {
        const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        meses.forEach(ms => mapa.set(ms, { ventas: 0, gastos: 0 }));
    }

    ventasValidas.forEach(v => {
        const k = claveFecha(v.fecha);
        if (!k) return;
        if (!mapa.has(k)) mapa.set(k, { ventas: 0, gastos: 0 });
        mapa.get(k).ventas = Math.round((mapa.get(k).ventas + (Number(v.total) || 0)) * 100) / 100;
    });

    gastosLista.forEach(g => {
        const k = claveFecha(g.fecha);
        if (!k) return;
        if (!mapa.has(k)) mapa.set(k, { ventas: 0, gastos: 0 });
        mapa.get(k).gastos = Math.round((mapa.get(k).gastos + (Number(g.monto) || 0)) * 100) / 100;
    });

    const entries = Array.from(mapa.entries());
    if (modo !== 'anio') {
        entries.sort((a, b) => a[0].localeCompare(b[0]));
    }

    return {
        labels: entries.map(e => e[0]),
        ventas: entries.map(e => e[1].ventas),
        gastos: entries.map(e => e[1].gastos)
    };
}

function calcularMetricasFinanzasPeriodo() {
    const cfg = obtenerConfigFinanzas();
    const rango = obtenerRangoTemporalFinanzas();
    const margenRespaldo = Math.min(95, Math.max(1, Number(cfg.margenGlobal) || 30));

    const productos = leerArrayLocalFin('cat_alogo_productos_v1');
    const prodMap = new Map(productos.map(p => [String(p.id), p]));

    const todasVentas = leerArrayLocalFin('cat_alogo_pos_ventas_v1');
    const todosTurnos = leerArrayLocalFin('cat_alogo_pos_turnos_v1');
    const todosClientes = leerArrayLocalFin('cat_alogo_clientes_v1');
    const todasCxp = leerArrayLocalFin('cat_alogo_cuentas_pagar_v1');
    const todosMovsFin = obtenerMovimientosFinanzas();

    const enRango = (fechaIso) => {
        const ts = new Date(fechaIso).getTime();
        return !isNaN(ts) && ts >= rango.inicioTs && ts <= rango.finTs;
    };

    const ventasPeriodo = todasVentas.filter(v => {
        if (rango.modo === 'turno') return rango.turno && ventaPerteneceATurnoFin(v, rango.turno);
        return enRango(v.fecha);
    });

    const ventasValidas = ventasPeriodo.filter(v => v.estado !== 'anulada');
    const ventasAnuladas = ventasPeriodo.filter(v => v.estado === 'anulada');

    let ventasBrutas = 0;
    let descuentosTotales = 0;
    let recargosTotales = 0;
    let anulacionesTotal = ventasAnuladas.reduce((acc, v) => acc + (Number(v.total) || 0), 0);
    let ventasNetas = 0;

    let cmvTotal = 0;
    let montoItemsCostoExacto = 0;
    let montoItemsReglaGlobal = 0;

    const mediosMap = {
        'Efectivo': { medio: 'Efectivo', icono: '💵', monto: 0, ops: 0 },
        'Tarjeta Débito': { medio: 'Tarjeta Débito', icono: '💳', monto: 0, ops: 0 },
        'Tarjeta Crédito': { medio: 'Tarjeta Crédito', icono: '💳', monto: 0, ops: 0 },
        'QR / Transferencia': { medio: 'QR / Transferencia', icono: '📱', monto: 0, ops: 0 },
        'Cuenta Corriente': { medio: 'Cuenta Corriente', icono: '📒', monto: 0, ops: 0 }
    };

    const opexPorCategoria = {};
    const movsManualesPeriodo = [];
    const operacionesAuditadas = [];
    const gastosSerie = [];

    const prodStatsMap = {};
    const catVentasMap = {};

    const sumarOpexCat = (cat, monto) => {
        const c = (cat || 'Otros Gastos Operativos').trim();
        opexPorCategoria[c] = Math.round(((opexPorCategoria[c] || 0) + monto) * 100) / 100;
    };

    ventasValidas.forEach(v => {
        ventasBrutas += Number(v.subtotal) || Number(v.total) || 0;
        descuentosTotales += Number(v.descuentoMonto) || 0;
        recargosTotales += Number(v.recargoMonto) || 0;
        ventasNetas += Number(v.total) || 0;

        (v.pagos || []).forEach(pg => {
            const k = pg.medio || 'Efectivo';
            if (!mediosMap[k]) mediosMap[k] = { medio: k, icono: '💰', monto: 0, ops: 0 };
            mediosMap[k].monto = Math.round((mediosMap[k].monto + (Number(pg.monto) || 0)) * 100) / 100;
            mediosMap[k].ops++;
        });

        (v.items || []).forEach(it => {
            const cant = Math.max(0, Number(it.cantidad) || 0);
            const ventaItem = (Number(it.precioUnit) || 0) * cant;
            const prodRef = prodMap.get(String(it.prodId));
            let costoUnit = Number(it.costoUnit) || 0;

            if (costoUnit <= 0 && prodRef && (Number(prodRef.precioCosto) || 0) > 0) {
                costoUnit = Number(prodRef.precioCosto);
            }

            let costoItem = 0;
            if (costoUnit > 0) {
                costoItem = costoUnit * cant;
                montoItemsCostoExacto += ventaItem;
            } else {
                costoItem = ventaItem * (1 - (margenRespaldo / 100));
                montoItemsReglaGlobal += ventaItem;
            }
            cmvTotal += costoItem;

            const gananciaItem = Math.round((ventaItem - costoItem) * 100) / 100;
            const catNombre = (prodRef?.categoria || 'General').trim() || 'General';
            catVentasMap[catNombre] = Math.round(((catVentasMap[catNombre] || 0) + ventaItem) * 100) / 100;

            const pKey = `${it.sku || it.prodId}::${it.nombre || ''}`;
            if (!prodStatsMap[pKey]) {
                prodStatsMap[pKey] = {
                    nombre: it.nombre || 'Producto',
                    sku: it.sku || '—',
                    categoria: catNombre,
                    unidadMedida: it.unidadMedida || 'Unidad',
                    cantidad: 0,
                    facturacion: 0,
                    costo: 0,
                    gananciaBruta: 0
                };
            }
            prodStatsMap[pKey].cantidad = Math.round((prodStatsMap[pKey].cantidad + cant) * 1000) / 1000;
            prodStatsMap[pKey].facturacion = Math.round((prodStatsMap[pKey].facturacion + ventaItem) * 100) / 100;
            prodStatsMap[pKey].costo = Math.round((prodStatsMap[pKey].costo + costoItem) * 100) / 100;
            prodStatsMap[pKey].gananciaBruta = Math.round((prodStatsMap[pKey].gananciaBruta + gananciaItem) * 100) / 100;
        });

        const mediosTxt = (v.pagos || []).map(p => p.medio).join(' + ') || 'Efectivo';
        const { totalVenta, montoFiado, montoCobrado } = obtenerDesgloseFiadoVentaFin(v);
        operacionesAuditadas.push({
            fecha: v.fecha,
            tipo: 'in',
            origen: 'Venta POS',
            concepto: montoFiado > 0
                ? `Ticket ${v.numeroTicket} • ${v.clienteNombre || 'Consumidor Final'} (Total ${formatearArsFin(totalVenta)} • Fiado ${formatearArsFin(montoFiado)})`
                : `Ticket ${v.numeroTicket} • ${v.clienteNombre || 'Consumidor Final'}`,
            medio: mediosTxt,
            monto: montoCobrado
        });
    });

    // Cobranzas de Clientes
    let cobranzasClientes = 0;
    todosClientes.forEach(cli => {
        (cli.movimientos || []).forEach(m => {
            if (m.tipo !== 'credito' || m.medio === 'Anulación POS') return;
            if (!enRango(m.fecha)) return;

            const monto = Math.max(0, Number(m.monto) || 0);
            cobranzasClientes += monto;

            const k = m.medio || 'Efectivo';
            if (!mediosMap[k]) mediosMap[k] = { medio: k, icono: '💰', monto: 0, ops: 0 };
            mediosMap[k].monto = Math.round((mediosMap[k].monto + monto) * 100) / 100;
            mediosMap[k].ops++;

            operacionesAuditadas.push({
                fecha: m.fecha, tipo: 'in', origen: 'Cobro Cta. Cte.',
                concepto: `${cli.nombre} • ${m.concepto || 'Abono'}`,
                medio: k, monto
            });
        });
    });

    // Movimientos manuales de Finanzas (Ingresos y Gastos OPEX)
    let ingresosManuales = 0;
    let gastosOpexPuros = 0;
    let impuestosTasas = 0;
    let cantGastosOpex = 0;

    todosMovsFin.forEach(m => {
        if (!enRango(m.fecha)) return;
        const monto = Math.max(0, Number(m.monto) || 0);
        movsManualesPeriodo.push(m);

        if (m.tipo === 'ingreso') {
            ingresosManuales += monto;
            const k = m.medio || 'Efectivo';
            if (!mediosMap[k]) mediosMap[k] = { medio: k, icono: '💰', monto: 0, ops: 0 };
            mediosMap[k].monto = Math.round((mediosMap[k].monto + monto) * 100) / 100;
            mediosMap[k].ops++;
            operacionesAuditadas.push({
                fecha: m.fecha, tipo: 'in', origen: 'Ingreso Manual',
                concepto: `${m.categoria || 'Extraordinario'} • ${m.concepto || ''}`,
                medio: k, monto
            });
        } else {
            const catLower = String(m.categoria || '').toLowerCase();
            if (catLower.includes('impuesto') || catLower.includes('tasa') || catLower.includes('monotributo')) {
                impuestosTasas += monto;
            } else {
                gastosOpexPuros += monto;
            }
            cantGastosOpex++;
            sumarOpexCat(m.categoria || 'Otros Gastos Operativos', monto);
            gastosSerie.push({ fecha: m.fecha, monto });
            operacionesAuditadas.push({
                fecha: m.fecha, tipo: 'out', origen: 'Gasto OPEX',
                concepto: `${m.categoria || 'Operativo'} • ${m.concepto || ''}`,
                medio: m.medio || 'Efectivo', monto
            });
        }
    });

    // Retiros / Gastos menores de caja POS
    let gastosCajaPos = 0;
    let retirosCustodiaPos = 0;
    const turnosFiltrados = rango.modo === 'turno' ? (rango.turno ? [rango.turno] : []) : todosTurnos;

    turnosFiltrados.forEach(t => {
        (t.retiros || []).forEach(r => {
            if (rango.modo !== 'turno' && !enRango(r.fecha)) return;
            const monto = Math.max(0, Number(r.monto) || 0);
            if (String(r.tipo || '').toLowerCase().includes('gasto')) {
                gastosCajaPos += monto;
                cantGastosOpex++;
                sumarOpexCat('Gastos Menores de Caja POS', monto);
                gastosSerie.push({ fecha: r.fecha, monto });
            } else {
                retirosCustodiaPos += monto;
            }
            operacionesAuditadas.push({
                fecha: r.fecha, tipo: 'out', origen: r.tipo || 'Retiro Caja',
                concepto: `${r.motivo || 'Salida gaveta'} (Turno #${t.numero})`,
                medio: 'Efectivo', monto
            });
        });
    });

    // Proveedores CxP (Nivel 4)
    const facturasPendientes = todasCxp.filter(c => (Number(c.deudaPendiente) || 0) > 0);
    const deudaProveedoresTotal = facturasPendientes.reduce((acc, c) => acc + Math.max(0, Number(c.deudaPendiente) || 0), 0);
    let pagosProveedoresPeriodo = 0;

    todasCxp.forEach(cxp => {
        const pagos = Array.isArray(cxp.pagos) ? cxp.pagos : [];
        pagos.forEach(pg => {
            if (!enRango(pg.fecha || cxp.fecha)) return;
            const monto = Math.max(0, Number(pg.monto) || 0);
            pagosProveedoresPeriodo += monto;
            operacionesAuditadas.push({
                fecha: pg.fecha || cxp.fecha,
                tipo: 'out',
                origen: 'Pago Proveedor',
                concepto: `${cxp.proveedorNombre} (${cxp.codigoOrden || 'OC'})`,
                medio: pg.medio || cxp.medioPago || 'Efectivo',
                monto
            });
        });
    });

    ventasNetas = Math.round(ventasNetas * 100) / 100;
    cmvTotal = Math.round(cmvTotal * 100) / 100;
    const utilidadBruta = Math.round((ventasNetas - cmvTotal) * 100) / 100;
    const margenBrutoPct = ventasNetas > 0 ? Math.round((utilidadBruta / ventasNetas) * 1000) / 10 : 0;

    const totalBaseCmv = montoItemsCostoExacto + montoItemsReglaGlobal;
    const pctCostoExacto = totalBaseCmv > 0 ? Math.round((montoItemsCostoExacto / totalBaseCmv) * 100) : 100;
    const pctReglaGlobal = totalBaseCmv > 0 ? Math.max(0, 100 - pctCostoExacto) : 0;

    const opexOperativo = Math.round((gastosOpexPuros + gastosCajaPos) * 100) / 100;
    impuestosTasas = Math.round(impuestosTasas * 100) / 100;
    const opexTotal = Math.round((opexOperativo + impuestosTasas) * 100) / 100;

    const ebitda = Math.round((utilidadBruta - opexOperativo) * 100) / 100;
    const ebitdaPct = ventasNetas > 0 ? Math.round((ebitda / ventasNetas) * 1000) / 10 : 0;
    const utilidadNeta = Math.round((ebitda - impuestosTasas) * 100) / 100;
    const utilidadNetaPct = ventasNetas > 0 ? Math.round((utilidadNeta / ventasNetas) * 1000) / 10 : 0;

    const fiadoDelPeriodo = mediosMap['Cuenta Corriente']?.monto || 0;
    const ingresosEfectivos = Math.round((Math.max(0, ventasNetas - fiadoDelPeriodo) + cobranzasClientes + ingresosManuales) * 100) / 100;
    const egresosTotales = Math.round((opexTotal + pagosProveedoresPeriodo + retirosCustodiaPos) * 100) / 100;
    const cashFlowNeto = Math.round((ingresosEfectivos - egresosTotales) * 100) / 100;

    const ticketPromedio = ventasValidas.length > 0 ? Math.round((ventasNetas / ventasValidas.length) * 100) / 100 : 0;
    const puntoEquilibrio = (margenBrutoPct > 0 && opexTotal > 0)
        ? Math.round((opexTotal / (margenBrutoPct / 100)) * 100) / 100
        : 0;

    const prodStatsArr = Object.values(prodStatsMap).map(p => ({
        ...p,
        margenPct: p.facturacion > 0 ? Math.round((p.gananciaBruta / p.facturacion) * 1000) / 10 : 0
    }));

    const topRentables = [...prodStatsArr].sort((a, b) => b.gananciaBruta - a.gananciaBruta).slice(0, 5);
    const topVendidos = [...prodStatsArr].sort((a, b) => b.facturacion - a.facturacion).slice(0, 5);

    const ventasPorCategoria = Object.entries(catVentasMap)
        .map(([categoria, monto]) => ({
            categoria,
            monto,
            pct: ventasNetas > 0 ? Math.round((monto / ventasNetas) * 1000) / 10 : 0
        }))
        .sort((a, b) => b.monto - a.monto);

    const duracionMs = Math.max(86400000, rango.finTs - rango.inicioTs);
    const diasPeriodo = Math.max(1, Math.round(duracionMs / 86400000));
    const proyeccionMensual = Math.round((ventasNetas / diasPeriodo) * 30 * 100) / 100;

    const prevFin = rango.inicioTs - 1;
    const prevIni = prevFin - duracionMs;
    const ventasPrevias = todasVentas
        .filter(v => v.estado !== 'anulada')
        .filter(v => {
            const ts = new Date(v.fecha).getTime();
            return !isNaN(ts) && ts >= prevIni && ts <= prevFin;
        })
        .reduce((acc, v) => acc + (Number(v.total) || 0), 0);

    let crecimientoPct = null;
    if (ventasPrevias > 0) {
        crecimientoPct = Math.round(((ventasNetas - ventasPrevias) / ventasPrevias) * 1000) / 10;
    }

    const serieEvolucion = construirSerieEvolucionFinanzas(rango, ventasValidas, gastosSerie);

    operacionesAuditadas.sort((a, b) => (new Date(b.fecha).getTime() || 0) - (new Date(a.fecha).getTime() || 0));
    movsManualesPeriodo.sort((a, b) => (new Date(b.fecha).getTime() || 0) - (new Date(a.fecha).getTime() || 0));

    const desgloseMedios = Object.values(mediosMap)
        .filter(m => m.monto > 0 || m.medio === 'Efectivo')
        .sort((a, b) => b.monto - a.monto);

    const desgloseOpex = Object.entries(opexPorCategoria)
        .map(([categoria, monto]) => ({
            categoria,
            monto,
            pctOpex: opexTotal > 0 ? Math.round((monto / opexTotal) * 1000) / 10 : 0,
            pctVentas: ventasNetas > 0 ? Math.round((monto / ventasNetas) * 1000) / 10 : 0
        }))
        .sort((a, b) => b.monto - a.monto);

    return {
        cfg,
        rango,
        cantTickets: ventasValidas.length,
        ventasBrutas: Math.round(ventasBrutas * 100) / 100,
        descuentosTotales: Math.round(descuentosTotales * 100) / 100,
        recargosTotales: Math.round(recargosTotales * 100) / 100,
        anulacionesTotal: Math.round(anulacionesTotal * 100) / 100,
        ventasNetas,
        ticketPromedio,
        ingresosEfectivos,
        egresosTotales,
        cashFlowNeto,
        opexOperativo,
        impuestosTasas,
        opexTotal,
        cantGastosOpex,
        desgloseOpex,
        movsManualesPeriodo,
        facturasPendientes,
        deudaProveedoresTotal: Math.round(deudaProveedoresTotal * 100) / 100,
        facturasPendientesCount: facturasPendientes.length,
        cmvTotal,
        utilidadBruta,
        margenBrutoPct,
        pctCostoExacto,
        pctReglaGlobal,
        ebitda,
        ebitdaPct,
        utilidadNeta,
        utilidadNetaPct,
        puntoEquilibrio,
        desgloseMedios,
        operacionesAuditadas,
        topRentables,
        topVendidos,
        ventasPorCategoria,
        proyeccionMensual,
        crecimientoPct,
        serieEvolucion
    };
}

/* ==========================================================================
   INICIALIZACIÓN Y RENDERIZADO GENERAL (ETAPAS 1, 2 Y 3)
   ========================================================================== */
function inicializarFinanzas() {
    if (!document.getElementById('finanzas-module-root')) return;

    const cfg = obtenerConfigFinanzas();
    const chkUsd = document.getElementById('fin-chk-mostrar-usd');
    if (chkUsd) chkUsd.checked = !!cfg.mostrarUsd;

    const inpD1 = document.getElementById('fin-date-desde');
    const inpD2 = document.getElementById('fin-date-hasta');
    if (inpD1) inpD1.value = window.finanzasState.fechaDesde;
    if (inpD2) inpD2.value = window.finanzasState.fechaHasta;

    inicializarEventosFinanzas();
    renderizarSelectorTurnosFinanzas();
    renderizarTodoFinanzas();
}

function renderizarSelectorTurnosFinanzas() {
    const sel = document.getElementById('fin-select-turno');
    if (!sel) return;

    const turnos = leerArrayLocalFin('cat_alogo_pos_turnos_v1');
    if (turnos.length === 0) {
        sel.innerHTML = `<option value="activo">Sin turnos en POS aún</option>`;
        return;
    }

    const activo = turnos.find(esTurnoAbiertoFin);
    let html = '';
    if (activo) {
        html += `<option value="activo">🟢 Turno Actual #${activo.numero} (${escaparHtmlFin(activo.operador)})</option>`;
    }
    turnos.filter(t => !esTurnoAbiertoFin(t)).forEach(t => {
        const f = new Date(t.fechaApertura).toLocaleDateString('es-AR');
        html += `<option value="${escaparHtmlFin(t.id)}">🔒 Turno #${t.numero} • ${f} (${escaparHtmlFin(t.operador)})</option>`;
    });

    sel.innerHTML = html;
    if (Array.from(sel.options).some(o => o.value === window.finanzasState.turnoSeleccionadoId)) {
        sel.value = window.finanzasState.turnoSeleccionadoId;
    } else {
        window.finanzasState.turnoSeleccionadoId = sel.value;
    }
}

function renderizarTodoFinanzas() {
    const m = calcularMetricasFinanzasPeriodo();
    const { cfg } = m;
    const verUsd = !!cfg.mostrarUsd;
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    const toggleUsd = (id, arsVal) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = verUsd ? 'inline-block' : 'none';
        if (verUsd) el.textContent = formatearUsdFin(arsVal, cfg.dolarHoy);
    };

    setTxt('fin-lbl-margen-global', `${cfg.margenGlobal}%`);
    setTxt('fin-lbl-dolar', formatearArsFin(cfg.dolarHoy));
    setTxt('fin-periodo-activo-lbl', m.rango.etiqueta);

    const wrapTurno = document.getElementById('fin-turno-picker-wrap');
    const wrapCustom = document.getElementById('fin-custom-dates-wrap');
    if (wrapTurno) wrapTurno.style.display = window.finanzasState.periodo === 'turno' ? 'flex' : 'none';
    if (wrapCustom) wrapCustom.style.display = window.finanzasState.periodo === 'custom' ? 'flex' : 'none';

    setTxt('lad-n1-val', formatearArsFin(m.ventasNetas));
    setTxt('lad-n1-sub', `${m.cantTickets} ${m.cantTickets === 1 ? 'ticket' : 'tickets'}`);

    setTxt('lad-n2-val', `${m.cashFlowNeto >= 0 ? '+' : '-'}${formatearArsFin(Math.abs(m.cashFlowNeto))}`);
    setTxt('lad-n2-sub', m.cashFlowNeto >= 0 ? 'Superávit neto' : 'Déficit neto');

    setTxt('lad-n3-val', formatearArsFin(m.opexTotal));
    setTxt('lad-n3-sub', `${m.cantGastosOpex} ${m.cantGastosOpex === 1 ? 'gasto' : 'gastos'}`);

    setTxt('lad-n4-val', formatearArsFin(m.deudaProveedoresTotal));
    setTxt('lad-n4-sub', `${m.facturasPendientesCount} pend.`);

    setTxt('lad-n5-val', formatearArsFin(m.utilidadBruta));
    setTxt('lad-n5-sub', `${m.margenBrutoPct}% Bruto`);

    setTxt('lad-n6-val', m.topRentables.length > 0 ? `Top ${m.topRentables.length}` : 'Sin datos');
    setTxt('lad-n6-sub', m.crecimientoPct !== null ? `${m.crecimientoPct >= 0 ? '+' : ''}${m.crecimientoPct}% tend.` : 'Ranking SKU');

    setTxt('lad-n7-val', formatearArsFin(m.utilidadNeta));
    setTxt('lad-n7-sub', `${m.utilidadNetaPct}% Neto`);

    setTxt('kpi-fin-ventas', formatearArsFin(m.ventasNetas));
    toggleUsd('kpi-fin-ventas-usd', m.ventasNetas);
    setTxt('kpi-fin-tx', `${m.cantTickets} ${m.cantTickets === 1 ? 'Transacción' : 'Transacciones'}`);
    setTxt('kpi-fin-ticket-prom', `Ticket Prom: ${formatearArsFin(m.ticketPromedio)}`);

    const efvoM = m.desgloseMedios.find(x => x.medio === 'Efectivo')?.monto || 0;
    const fiadoM = m.desgloseMedios.find(x => x.medio === 'Cuenta Corriente')?.monto || 0;
    const digM = m.desgloseMedios.filter(x => x.medio !== 'Efectivo' && x.medio !== 'Cuenta Corriente').reduce((a, x) => a + x.monto, 0);
    const totalM = Math.max(1, efvoM + digM + fiadoM);

    const barM = document.getElementById('kpi-fin-medios-bar');
    if (barM) {
        barM.innerHTML = `
            <span class="bar-efvo" style="width:${Math.round((efvoM / totalM) * 100)}%;"></span>
            <span class="bar-dig" style="width:${Math.round((digM / totalM) * 100)}%;"></span>
            <span class="bar-fiado" style="width:${Math.round((fiadoM / totalM) * 100)}%;"></span>
        `;
    }
    const footM = document.getElementById('kpi-fin-medios-foot');
    if (footM) {
        footM.innerHTML = `<span>Efvo: ${formatearArsFin(efvoM)}</span><span>Dig/Tarj: ${formatearArsFin(digM)}</span><span>Fiado: ${formatearArsFin(fiadoM)}</span>`;
    }

    const elCf = document.getElementById('kpi-fin-cashflow');
    if (elCf) {
        elCf.textContent = `${m.cashFlowNeto >= 0 ? '+' : '-'}${formatearArsFin(Math.abs(m.cashFlowNeto))}`;
        elCf.className = `fin-kpi-val ${m.cashFlowNeto >= 0 ? 'text-emerald' : 'text-danger'}`;
    }
    toggleUsd('kpi-fin-cashflow-usd', m.cashFlowNeto);
    const pillCf = document.getElementById('kpi-fin-cf-pill');
    if (pillCf) {
        pillCf.textContent = m.cashFlowNeto >= 0 ? 'Superávit Saludable' : 'Déficit en Caja';
        pillCf.className = `fin-status-pill ${m.cashFlowNeto >= 0 ? 'ok' : 'err'}`;
    }
    setTxt('kpi-fin-ingresos', formatearArsFin(m.ingresosEfectivos));
    setTxt('kpi-fin-egresos', formatearArsFin(m.egresosTotales));
    const ratioCf = m.ingresosEfectivos > 0 ? Math.round((m.cashFlowNeto / m.ingresosEfectivos) * 100) : 0;
    setTxt('kpi-fin-cf-ratio', `${ratioCf}% retención`);

    setTxt('kpi-fin-margen-pct', `${m.margenBrutoPct}%`);
    setTxt('kpi-fin-margen-ars', `(${formatearArsFin(m.utilidadBruta)})`);
    toggleUsd('kpi-fin-margen-usd', m.utilidadBruta);
    setTxt('kpi-fin-cmv', formatearArsFin(m.cmvTotal));
    setTxt('kpi-fin-cmv-exact-lbl', `${m.pctCostoExacto}% Costo Exacto SKU`);
    setTxt('kpi-fin-cmv-est-lbl', `${m.pctReglaGlobal}% Regla ${cfg.margenGlobal}%`);
    const bEx = document.getElementById('bar-cmv-exact');
    const bEs = document.getElementById('bar-cmv-est');
    if (bEx) bEx.style.width = `${m.pctCostoExacto}%`;
    if (bEs) bEs.style.width = `${m.pctReglaGlobal}%`;

    const elEb = document.getElementById('kpi-fin-ebitda');
    if (elEb) {
        elEb.textContent = formatearArsFin(m.utilidadNeta);
        elEb.className = `fin-kpi-val ${m.utilidadNeta >= 0 ? 'text-emerald' : 'text-danger'}`;
    }
    toggleUsd('kpi-fin-ebitda-usd', m.utilidadNeta);
    setTxt('kpi-fin-ebitda-pct', `EBITDA: ${m.ebitdaPct}%`);
    if (m.puntoEquilibrio > 0) {
        const superado = m.ventasNetas >= m.puntoEquilibrio;
        setTxt('kpi-fin-breakeven-tag', superado ? '✅ Break-Even Superado' : `Falta ${formatearArsFin(m.puntoEquilibrio - m.ventasNetas)}`);
        setTxt('kpi-fin-breakeven-sub', `Punto de equilibrio: ${formatearArsFin(m.puntoEquilibrio)}`);
    } else {
        setTxt('kpi-fin-breakeven-tag', 'Sin OPEX cargado');
        setTxt('kpi-fin-breakeven-sub', 'Registra gastos fijos para calcular Break-Even');
    }

    const totalMedios = m.desgloseMedios.reduce((a, x) => a + x.monto, 0);
    setTxt('fin-medios-total-badge', `${formatearArsFin(totalMedios)} ARS`);
    const mediosCont = document.getElementById('fin-medios-list');
    if (mediosCont) {
        mediosCont.innerHTML = m.desgloseMedios.map(item => {
            const pct = totalMedios > 0 ? Math.round((item.monto / totalMedios) * 1000) / 10 : 0;
            return `
                <div class="fin-medio-row">
                    <div>
                        <strong>${item.icono} ${escaparHtmlFin(item.medio)}</strong>
                        <small>${item.ops} ${item.ops === 1 ? 'operación' : 'operaciones'} • ${pct}% del total</small>
                    </div>
                    <strong style="font-size:0.95rem;">${formatearArsFin(item.monto)}</strong>
                </div>
            `;
        }).join('');
    }

    setTxt('fin-ops-count-badge', `${m.operacionesAuditadas.length} movimientos`);
    const opsTbody = document.getElementById('fin-ops-tbody');
    if (opsTbody) {
        if (m.operacionesAuditadas.length === 0) {
            opsTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.8rem; color:#64748b;">No hay operaciones registradas en el período seleccionado.</td></tr>`;
        } else {
            opsTbody.innerHTML = m.operacionesAuditadas.slice(0, 40).map(op => {
                const fTxt = new Date(op.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                const esIn = op.tipo === 'in';
                return `
                    <tr>
                        <td style="white-space:nowrap;">${fTxt}</td>
                        <td><span class="fin-type-tag ${esIn ? 'in' : 'out'}">${escaparHtmlFin(op.origen)}</span></td>
                        <td><strong>${escaparHtmlFin(op.concepto)}</strong></td>
                        <td>${escaparHtmlFin(op.medio)}</td>
                        <td style="text-align:right; font-weight:800;" class="${esIn ? 'text-emerald' : 'text-danger'}">
                            ${esIn ? '+' : '-'}${formatearArsFin(op.monto)}
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    renderizarNivel3Opex(m);
    renderizarNivel4ProveedoresFinanzas(m);
    renderizarTarjetaArqueoFinanzas();
    renderizarNivel6Analitica(m);
    renderizarNivel7Pnl(m);
}

/* ==========================================================================
   ETAPA 3A: NIVEL 6 — GRÁFICOS COMPARATIVOS, PROYECCIÓN Y RANKINGS TOP 5
   ========================================================================== */
function renderizarNivel6Analitica(m) {
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

    setTxt('fin-n6-proyeccion-pill', `Proyección Mensual Est.: ${formatearArsFin(m.proyeccionMensual)}`);

    const trendPill = document.getElementById('fin-n6-trend-pill');
    if (trendPill) {
        if (m.crecimientoPct === null) {
            trendPill.className = 'fin-trend-pill';
            trendPill.textContent = 'Sin base anterior para comparar';
        } else {
            const sube = m.crecimientoPct >= 0;
            trendPill.className = `fin-trend-pill ${sube ? 'up' : 'down'}`;
            trendPill.textContent = `${sube ? '▲ +' : '▼ '}${m.crecimientoPct}% vs período ant.`;
        }
    }

    setTxt('fin-evo-sub', `${m.serieEvolucion.labels.length} puntos en ${m.rango.etiqueta}`);
    setTxt('fin-cat-sub', `${m.ventasPorCategoria.length} ${m.ventasPorCategoria.length === 1 ? 'categoría' : 'categorías'}`);

    const canvasEvo = document.getElementById('fin-evolucion-chart');
    if (canvasEvo && typeof Chart === 'function') {
        if (finEvolucionChartInstance) {
            finEvolucionChartInstance.destroy();
            finEvolucionChartInstance = null;
        }

        const hayDatos = m.serieEvolucion.labels.length > 0;
        const labels = hayDatos ? m.serieEvolucion.labels : ['Sin datos'];
        const dsVentas = hayDatos ? m.serieEvolucion.ventas : [0];
        const dsGastos = hayDatos ? m.serieEvolucion.gastos : [0];

        finEvolucionChartInstance = new Chart(canvasEvo.getContext('2d'), {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Ventas Netas',
                        data: dsVentas,
                        backgroundColor: 'rgba(4, 120, 87, 0.82)',
                        borderRadius: 6,
                        maxBarThickness: 34
                    },
                    {
                        label: 'Gastos OPEX',
                        data: dsGastos,
                        backgroundColor: 'rgba(239, 68, 68, 0.78)',
                        borderRadius: 6,
                        maxBarThickness: 34
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: { size: 10 },
                            callback: (v) => `$${Number(v).toLocaleString('es-AR')}`
                        }
                    },
                    x: { ticks: { font: { size: 10 } } }
                }
            }
        });
    }

    const canvasCat = document.getElementById('fin-categorias-chart');
    if (canvasCat && typeof Chart === 'function') {
        if (finCatChartInstance) {
            finCatChartInstance.destroy();
            finCatChartInstance = null;
        }

        const hayCat = m.ventasPorCategoria.length > 0;
        const labelsCat = hayCat ? m.ventasPorCategoria.map(c => `${c.categoria} (${c.pct}%)`) : ['Sin ventas'];
        const valsCat = hayCat ? m.ventasPorCategoria.map(c => c.monto) : [1];
        const colsCat = hayCat
            ? m.ventasPorCategoria.map((_, i) => FIN_CAT_PALETTE[i % FIN_CAT_PALETTE.length])
            : ['#e2e8f0'];

        finCatChartInstance = new Chart(canvasCat.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: labelsCat,
                datasets: [{ data: valsCat, backgroundColor: colsCat, borderWidth: 0, hoverOffset: 5 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '58%',
                plugins: {
                    legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10.5 } } },
                    tooltip: { enabled: hayCat }
                }
            }
        });
    }

    const rankCont = document.getElementById('fin-n6-ranking-list');
    if (!rankCont) return;

    const esRentables = window.finanzasState.rankTab !== 'vendidos';
    const lista = esRentables ? m.topRentables : m.topVendidos;

    if (lista.length === 0) {
        rankCont.innerHTML = `
            <div style="text-align:center; padding:1.4rem; color:#64748b; font-size:0.8rem; background:#f8fafc; border-radius:10px; border:1px dashed #cbd5e1;">
                Todavía no hay productos vendidos en el período seleccionado para construir el ranking.
            </div>
        `;
        return;
    }

    rankCont.innerHTML = lista.map((p, idx) => {
        const abrev = abrevUnidadFin(p.unidadMedida);
        const valorPrincipal = esRentables ? p.gananciaBruta : p.facturacion;
        const subValor = esRentables ? 'Ganancia Bruta' : 'Facturación Total';
        return `
            <div class="fin-rank-row">
                <div class="fin-rank-left">
                    <span class="fin-rank-pos pos-${idx + 1}">${idx + 1}</span>
                    <div style="min-width:0;">
                        <strong>${escaparHtmlFin(p.nombre)}</strong>
                        <small>${p.cantidad} ${escaparHtmlFin(abrev)} vendidas • SKU: ${escaparHtmlFin(p.sku)} • ${escaparHtmlFin(p.categoria)}</small>
                    </div>
                </div>
                <div class="fin-rank-right">
                    <div class="fin-rank-val">
                        <strong class="${esRentables ? 'text-emerald' : ''}">${formatearArsFin(valorPrincipal)}</strong>
                        <small>${subValor}</small>
                    </div>
                    <span class="fin-margin-chip">${p.margenPct}% margen</span>
                </div>
            </div>
        `;
    }).join('');
}

/* ==========================================================================
   ETAPA 3B: NIVEL 7 — ESTADO DE RESULTADOS (P&L) & BARRA BREAK-EVEN
   ========================================================================== */
function renderizarNivel7Pnl(m) {
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    const { cfg } = m;
    const verUsd = !!cfg.mostrarUsd;

    const cobRatio = m.opexTotal > 0 ? Math.round((m.utilidadBruta / m.opexTotal) * 10) / 10 : null;
    setTxt('fin-n7-cobertura-pill', cobRatio !== null ? `Ratio Cobertura OPEX: ${cobRatio}x` : 'Sin OPEX en el período');

    const beBox = document.getElementById('fin-breakeven-box');
    const beFill = document.getElementById('fin-be-fill');

    if (m.puntoEquilibrio > 0) {
        const pctBe = Math.round((m.ventasNetas / m.puntoEquilibrio) * 100);
        const superado = m.ventasNetas >= m.puntoEquilibrio;
        if (beBox) beBox.classList.toggle('is-reached', superado);
        if (beFill) beFill.style.width = `${Math.min(100, Math.max(2, pctBe))}%`;

        setTxt('fin-be-pct-lbl', `${pctBe}%`);
        setTxt('fin-be-meta-lbl', `Meta: ${formatearArsFin(m.puntoEquilibrio)}`);
        setTxt('fin-be-actual-lbl', `Ventas Netas actuales: ${formatearArsFin(m.ventasNetas)}`);
        setTxt(
            'fin-be-estado-lbl',
            superado
                ? `✅ Superado por +${formatearArsFin(m.ventasNetas - m.puntoEquilibrio)} (Zona de Ganancia Neta)`
                : `Faltan ${formatearArsFin(m.puntoEquilibrio - m.ventasNetas)} en ventas para cubrir gastos fijos`
        );
    } else {
        if (beBox) beBox.classList.remove('is-reached');
        if (beFill) beFill.style.width = m.ventasNetas > 0 ? '100%' : '0%';
        setTxt('fin-be-pct-lbl', m.ventasNetas > 0 ? '100%' : '0%');
        setTxt('fin-be-meta-lbl', 'Meta: $0');
        setTxt('fin-be-actual-lbl', `Ventas Netas actuales: ${formatearArsFin(m.ventasNetas)}`);
        setTxt('fin-be-estado-lbl', 'Registra gastos fijos (OPEX) en Nivel 3 para activar el cálculo');
    }

    const tbody = document.getElementById('fin-pnl-tbody');
    if (!tbody) return;

    const pctSobreVentas = (monto) => {
        if (m.ventasNetas <= 0) return '0.0%';
        return `${(Math.round((Math.abs(monto) / m.ventasNetas) * 1000) / 10).toFixed(1)}%`;
    };

    const fmtConUsd = (monto, prefijo = '') => {
        const base = `${prefijo}${formatearArsFin(Math.abs(monto))}`;
        if (!verUsd) return base;
        return `${base} <small style="opacity:0.78; font-weight:600; display:block;">${formatearUsdFin(Math.abs(monto), cfg.dolarHoy)}</small>`;
    };

    const filas = [
        {
            clase: '',
            concepto: 'Ventas Brutas Totales (POS)',
            montoHtml: fmtConUsd(m.ventasBrutas),
            pct: m.ventasNetas > 0 ? pctSobreVentas(m.ventasBrutas) : '100.0%',
            estado: `${m.cantTickets} operaciones activas`
        },
        {
            clase: '',
            concepto: '(-) Descuentos & Promociones Comerciales',
            montoHtml: `<span class="text-danger">${fmtConUsd(m.descuentosTotales, m.descuentosTotales > 0 ? '-' : '')}</span>`,
            pct: pctSobreVentas(m.descuentosTotales),
            estado: m.descuentosTotales > 0 ? 'Bonificaciones aplicadas' : 'Sin descuentos'
        },
        {
            clase: '',
            concepto: '(-) Devoluciones / Tickets Anulados',
            montoHtml: `<span class="text-danger">${fmtConUsd(m.anulacionesTotal, m.anulacionesTotal > 0 ? '-' : '')}</span>`,
            pct: pctSobreVentas(m.anulacionesTotal),
            estado: m.anulacionesTotal > 0 ? 'Stock reintegrado' : 'Sin anulaciones'
        },
        {
            clase: 'pnl-subtotal',
            concepto: '(=) VENTAS NETAS EFECTIVAS',
            montoHtml: fmtConUsd(m.ventasNetas),
            pct: '100.0%',
            estado: 'Base de cálculo P&L'
        },
        {
            clase: '',
            concepto: '(-) Costo de Mercadería Vendida (CMV Auditado)',
            montoHtml: `<span class="text-danger">${fmtConUsd(m.cmvTotal, '-')}</span>`,
            pct: pctSobreVentas(m.cmvTotal),
            estado: `${m.pctCostoExacto}% SKU exacto / ${m.pctReglaGlobal}% regla ${cfg.margenGlobal}%`
        },
        {
            clase: 'pnl-highlight',
            concepto: '(=) UTILIDAD BRUTA DEL PERÍODO',
            montoHtml: fmtConUsd(m.utilidadBruta),
            pct: `${m.margenBrutoPct.toFixed(1)}%`,
            estado: m.margenBrutoPct >= 30 ? 'Margen Bruto Saludable' : (m.ventasNetas > 0 ? 'Revisar precios / costos' : 'Sin ventas')
        },
        {
            clase: '',
            concepto: '(-) Gastos de Operación (OPEX: Alquiler, Personal, Servicios, Fletes)',
            montoHtml: `<span class="text-danger">${fmtConUsd(m.opexOperativo, m.opexOperativo > 0 ? '-' : '')}</span>`,
            pct: pctSobreVentas(m.opexOperativo),
            estado: `${m.cantGastosOpex} egresos operativos`
        },
        {
            clase: 'pnl-subtotal',
            concepto: '(=) RESULTADO OPERATIVO (EBITDA)',
            montoHtml: `<span class="${m.ebitda >= 0 ? 'text-emerald' : 'text-danger'}">${fmtConUsd(m.ebitda, m.ebitda < 0 ? '-' : '')}</span>`,
            pct: `${m.ebitdaPct.toFixed(1)}%`,
            estado: m.ebitda >= 0 ? 'Operación rentable' : 'Déficit operativo'
        },
        {
            clase: '',
            concepto: '(-) Impuestos, Monotributo y Tasas',
            montoHtml: `<span class="text-danger">${fmtConUsd(m.impuestosTasas, m.impuestosTasas > 0 ? '-' : '')}</span>`,
            pct: pctSobreVentas(m.impuestosTasas),
            estado: m.impuestosTasas > 0 ? 'Carga fiscal imputada' : 'Sin impuestos cargados'
        },
        {
            clase: `pnl-net-final ${m.utilidadNeta < 0 ? 'is-loss' : ''}`,
            concepto: '(=) UTILIDAD NETA FINAL DEL PERÍODO',
            montoHtml: fmtConUsd(m.utilidadNeta, m.utilidadNeta < 0 ? '-' : ''),
            pct: `${m.utilidadNetaPct.toFixed(1)}%`,
            estado: m.utilidadNeta > 0 ? 'Rendimiento Positivo ✓' : (m.utilidadNeta < 0 ? 'Pérdida Neta' : 'Equilibrio $0')
        }
    ];

    tbody.innerHTML = filas.map(f => `
        <tr class="${f.clase}">
            <td>${f.concepto}</td>
            <td style="text-align:right;">${f.montoHtml}</td>
            <td style="text-align:right;">${f.pct}</td>
            <td style="text-align:right;">${f.estado}</td>
        </tr>
    `).join('');
}

/* ==========================================================================
   ETAPA 2: NIVEL 3 — AUDITORÍA OPEX (GRÁFICO + BARRAS + LISTADO MANUAL)
   ========================================================================== */
function renderizarNivel3Opex(m) {
    const elTotal = document.getElementById('fin-opex-chart-total');
    if (elTotal) elTotal.textContent = formatearArsFin(m.opexTotal);

    const barsCont = document.getElementById('fin-opex-bars-list');
    if (barsCont) {
        if (m.desgloseOpex.length === 0) {
            barsCont.innerHTML = `
                <div style="text-align:center; padding:1.25rem; color:#64748b; font-size:0.8rem; background:#f8fafc; border-radius:10px; border:1px dashed #cbd5e1;">
                    No hay gastos operativos (OPEX) cargados en este período.<br>
                    Usa las <strong>plantillas rápidas</strong> de arriba para cargar tus gastos fijos en segundos.
                </div>
            `;
        } else {
            barsCont.innerHTML = m.desgloseOpex.map((item, idx) => {
                const color = FIN_OPEX_PALETTE[idx % FIN_OPEX_PALETTE.length];
                return `
                    <div class="fin-opex-bar-item">
                        <div class="fin-opex-bar-top">
                            <strong>${escaparHtmlFin(item.categoria)}</strong>
                            <span><strong>${formatearArsFin(item.monto)}</strong> (${item.pctOpex}% OPEX)</span>
                        </div>
                        <div class="fin-opex-track">
                            <div class="fin-opex-fill" style="width:${Math.max(4, item.pctOpex)}%; background:${color};"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    const canvas = document.getElementById('fin-opex-chart');
    if (canvas && typeof Chart === 'function') {
        if (finOpexChartInstance) {
            finOpexChartInstance.destroy();
            finOpexChartInstance = null;
        }
        const tieneDatos = m.desgloseOpex.length > 0;
        const labels = tieneDatos ? m.desgloseOpex.map(d => d.categoria) : ['Sin gastos'];
        const dataVals = tieneDatos ? m.desgloseOpex.map(d => d.monto) : [1];
        const colors = tieneDatos
            ? m.desgloseOpex.map((_, i) => FIN_OPEX_PALETTE[i % FIN_OPEX_PALETTE.length])
            : ['#e2e8f0'];

        finOpexChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data: dataVals, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: { legend: { display: false }, tooltip: { enabled: tieneDatos } }
            }
        });
    }

    const wrapRec = document.getElementById('fin-opex-recent-wrap');
    const listRec = document.getElementById('fin-opex-recent-list');
    const countRec = document.getElementById('fin-opex-recent-count');

    if (wrapRec && listRec) {
        const manuales = m.movsManualesPeriodo || [];
        if (manuales.length === 0) {
            wrapRec.style.display = 'none';
        } else {
            wrapRec.style.display = 'flex';
            if (countRec) countRec.textContent = `${manuales.length} ${manuales.length === 1 ? 'registro' : 'registros'}`;
            listRec.innerHTML = manuales.slice(0, 12).map(mov => {
                const esIng = mov.tipo === 'ingreso';
                const fTxt = new Date(mov.fecha).toLocaleDateString('es-AR');
                return `
                    <div class="fin-opex-recent-row" data-finmov-id="${escaparHtmlFin(mov.id)}">
                        <div>
                            <strong>${escaparHtmlFin(mov.categoria)} • ${escaparHtmlFin(mov.concepto)}</strong>
                            <small>${fTxt} • ${escaparHtmlFin(mov.medio || 'Efectivo')}</small>
                        </div>
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <strong class="${esIng ? 'text-emerald' : 'text-danger'}">${esIng ? '+' : '-'}${formatearArsFin(mov.monto)}</strong>
                            <button type="button" class="fin-del-mini btn-del-fin-mov" title="Eliminar registro">🗑️</button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

/* ==========================================================================
   ETAPA 2: MODAL GASTO OPEX / INGRESO MANUAL
   ========================================================================== */
function poblarSelectCategoriasMovFin(tipo, valorPreseleccionado = null) {
    const sel = document.getElementById('fin-mov-categoria');
    if (!sel) return;
    const cfg = obtenerConfigFinanzas();
    const lista = tipo === 'ingreso' ? cfg.categoriasIngreso : cfg.categoriasOpex;

    sel.innerHTML = lista.map(cat => `<option value="${escaparHtmlFin(cat)}">${escaparHtmlFin(cat)}</option>`).join('');
    if (valorPreseleccionado && lista.includes(valorPreseleccionado)) {
        sel.value = valorPreseleccionado;
    }
}

function abrirModalMovimientoFinanzas(tipo = 'gasto', presetCat = null, presetConcepto = null) {
    const modal = document.getElementById('modal-fin-mov');
    if (!modal) return;

    window.finanzasState.movModalTipo = tipo === 'ingreso' ? 'ingreso' : 'gasto';
    document.getElementById('form-fin-mov')?.reset();

    document.querySelectorAll('.fin-mtype-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-mtype') === window.finanzasState.movModalTipo);
    });

    const esIng = window.finanzasState.movModalTipo === 'ingreso';
    document.getElementById('modal-fin-mov-title').textContent = esIng
        ? '➕ Registrar Ingreso Manual / Extraordinario'
        : '➖ Registrar Gasto Operativo (OPEX)';
    document.getElementById('btn-guardar-fin-mov').textContent = esIng
        ? '✅ Registrar Ingreso'
        : '✅ Registrar Gasto OPEX';

    poblarSelectCategoriasMovFin(window.finanzasState.movModalTipo, presetCat);

    const hoyIso = new Date().toISOString().slice(0, 10);
    document.getElementById('fin-mov-fecha').value = hoyIso;
    if (presetConcepto) document.getElementById('fin-mov-concepto').value = presetConcepto;

    modal.classList.add('active');
    document.getElementById('fin-mov-monto')?.focus();
}

function cerrarModalMovimientoFinanzas() {
    document.getElementById('modal-fin-mov')?.classList.remove('active');
}

function guardarMovimientoFinanzasFormulario(e) {
    e.preventDefault();

    const tipo = window.finanzasState.movModalTipo || 'gasto';
    const monto = Math.round((parseFloat(document.getElementById('fin-mov-monto')?.value) || 0) * 100) / 100;
    const medio = document.getElementById('fin-mov-medio')?.value || 'Efectivo';
    const categoria = document.getElementById('fin-mov-categoria')?.value || 'Otros';
    const fechaInput = document.getElementById('fin-mov-fecha')?.value;
    const concepto = document.getElementById('fin-mov-concepto')?.value.trim() || categoria;

    if (monto <= 0) {
        alert('Ingresa un monto mayor a $0.');
        return;
    }

    const ahora = new Date();
    const hoyIso = ahora.toISOString().slice(0, 10);
    const fechaFinalIso = (!fechaInput || fechaInput === hoyIso)
        ? ahora.toISOString()
        : new Date(fechaInput + 'T12:00:00').toISOString();

    const lista = obtenerMovimientosFinanzas();
    lista.unshift({
        id: 'finmov-' + Date.now(),
        tipo,
        monto,
        medio,
        categoria,
        concepto,
        fecha: fechaFinalIso
    });

    guardarMovimientosFinanzas(lista);
    cerrarModalMovimientoFinanzas();
    renderizarTodoFinanzas();
}

/* ==========================================================================
   ETAPA 2: NIVEL 4 — PROVEEDORES & LIQUIDACIÓN DIRECTA
   ========================================================================== */
function renderizarNivel4ProveedoresFinanzas(m) {
    const badge = document.getElementById('fin-n4-pend-badge');
    const cont = document.getElementById('fin-cxp-list');
    if (badge) badge.textContent = `${formatearArsFin(m.deudaProveedoresTotal)} pendiente (${m.facturasPendientesCount})`;
    if (!cont) return;

    if (m.facturasPendientes.length === 0) {
        cont.innerHTML = `
            <div style="text-align:center; padding:1.2rem; color:#64748b; font-size:0.8rem; background:#f8fafc; border-radius:10px; border:1px dashed #cbd5e1;">
                ✅ No tienes cuentas por pagar pendientes con proveedores.
            </div>
        `;
        return;
    }

    cont.innerHTML = m.facturasPendientes.map(d => {
        const fTxt = new Date(d.fecha).toLocaleDateString('es-AR');
        return `
            <div class="fin-cxp-row">
                <div>
                    <strong>${escaparHtmlFin(d.proveedorNombre)}</strong>
                    <small>Orden ${escaparHtmlFin(d.codigoOrden || '—')} • ${fTxt}${d.comprobante ? ` • Fac: ${escaparHtmlFin(d.comprobante)}` : ''}</small>
                </div>
                <div class="fin-cxp-right">
                    <div style="text-align:right;">
                        <strong class="text-danger" style="font-size:0.95rem;">${formatearArsFin(d.deudaPendiente)}</strong>
                        <small>de ${formatearArsFin(d.totalGeneral)}</small>
                    </div>
                    <button type="button" class="fin-btn fin-btn-primary fin-btn-xs btn-fin-liquidar-cxp" data-cxp-id="${escaparHtmlFin(d.id)}">
                        💳 Liquidar
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function actualizarPreviewLiquidacionCxpFin() {
    const cuentas = leerArrayLocalFin('cat_alogo_cuentas_pagar_v1');
    const cuenta = cuentas.find(c => c.id === window.finanzasState.cxpLiquidandoId);
    const box = document.getElementById('fin-cxp-preview-box');
    const btnSubmit = document.querySelector('#form-fin-cxp button[type="submit"]');
    if (!cuenta || !box) return;

    const deudaActual = Math.max(0, Number(cuenta.deudaPendiente) || 0);
    const monto = Math.round((parseFloat(document.getElementById('fin-cxp-monto')?.value) || 0) * 100) / 100;
    const restante = Math.round(Math.max(0, deudaActual - monto) * 100) / 100;

    if (monto <= 0) {
        box.style.background = '#f8fafc';
        box.style.borderColor = '#cbd5e1';
        box.style.color = '#475569';
        box.innerHTML = 'Ingresa el monto del adelanto o el total a cancelar hoy.';
        if (btnSubmit) btnSubmit.textContent = '✅ Confirmar Pago';
    } else if (monto > deudaActual + 0.01) {
        box.style.background = '#fef2f2';
        box.style.borderColor = '#fecaca';
        box.style.color = '#b91c1c';
        box.innerHTML = `⚠️ El monto supera la deuda pendiente (${formatearArsFin(deudaActual)}).`;
        if (btnSubmit) btnSubmit.textContent = '⚠️ Monto excedido';
    } else if (restante <= 0.01) {
        box.style.background = '#ecfdf5';
        box.style.borderColor = '#a7f3d0';
        box.style.color = '#047857';
        box.innerHTML = '✅ Con este pago la factura quedará <strong>SALDADA ($0 deuda)</strong>.';
        if (btnSubmit) btnSubmit.textContent = `✅ Saldar Total (${formatearArsFin(monto)})`;
    } else {
        box.style.background = '#fffbeb';
        box.style.borderColor = '#fde68a';
        box.style.color = '#b45309';
        box.innerHTML = `⏳ <strong>Adelanto parcial:</strong> luego de este pago quedarán <strong>${formatearArsFin(restante)}</strong> pendientes.`;
        if (btnSubmit) btnSubmit.textContent = `✅ Registrar Adelanto (${formatearArsFin(monto)})`;
    }
}

function asegurarControlesParcialesModalCxp() {
    const inpMonto = document.getElementById('fin-cxp-monto');
    if (!inpMonto) return;

    if (!inpMonto.dataset.cxpPreviewBound) {
        inpMonto.addEventListener('input', actualizarPreviewLiquidacionCxpFin);
        inpMonto.dataset.cxpPreviewBound = '1';
    }

    if (document.getElementById('fin-cxp-parcial-tools')) return;

    const fieldWrap = inpMonto.closest('.fin-field') || inpMonto.parentElement;
    if (!fieldWrap || !fieldWrap.parentElement) return;

    const tools = document.createElement('div');
    tools.id = 'fin-cxp-parcial-tools';
    tools.style.cssText = 'display:flex; flex-direction:column; gap:0.55rem; margin-top:0.5rem;';
    tools.innerHTML = `
        <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
            <button type="button" class="fin-btn fin-btn-light fin-btn-xs" data-cxp-pct="25" style="flex:1;">25%</button>
            <button type="button" class="fin-btn fin-btn-light fin-btn-xs" data-cxp-pct="50" style="flex:1;">50%</button>
            <button type="button" class="fin-btn fin-btn-light fin-btn-xs" data-cxp-pct="100" style="flex:1.3;">💯 100% Saldar</button>
        </div>
        <div id="fin-cxp-preview-box" style="padding:0.55rem 0.75rem; border-radius:10px; border:1px solid #cbd5e1; background:#f8fafc; font-size:0.78rem; line-height:1.35;"></div>
        <div id="fin-cxp-historial-box" style="display:none; padding:0.55rem 0.75rem; border-radius:10px; border:1px dashed #cbd5e1; background:#f8fafc; font-size:0.74rem; color:#475569;"></div>
    `;

    tools.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-cxp-pct]');
        if (!btn) return;
        const pct = Number(btn.getAttribute('data-cxp-pct')) || 100;
        const cuenta = leerArrayLocalFin('cat_alogo_cuentas_pagar_v1').find(c => c.id === window.finanzasState.cxpLiquidandoId);
        if (!cuenta) return;
        const deuda = Math.max(0, Number(cuenta.deudaPendiente) || 0);
        const calc = pct >= 100 ? deuda : Math.round((deuda * (pct / 100)) * 100) / 100;
        inpMonto.value = calc;
        actualizarPreviewLiquidacionCxpFin();
    });

    fieldWrap.insertAdjacentElement('afterend', tools);
}

function abrirModalLiquidarCxpFinanzas(cxpId) {
    const cuentas = leerArrayLocalFin('cat_alogo_cuentas_pagar_v1');
    const cuenta = cuentas.find(c => c.id === cxpId);
    if (!cuenta) return;

    const deuda = Math.max(0, Number(cuenta.deudaPendiente) || 0);
    if (deuda <= 0) return;

    window.finanzasState.cxpLiquidandoId = cuenta.id;
    document.getElementById('form-fin-cxp')?.reset();
    document.getElementById('modal-fin-cxp-sub').textContent = `${cuenta.codigoOrden || 'Orden'} • ${cuenta.proveedorNombre}`;
    document.getElementById('fin-cxp-deuda-actual').textContent = `${formatearArsFin(deuda)} ARS`;
    document.getElementById('fin-cxp-monto').value = deuda;

    const aliasBar = document.getElementById('fin-cxp-alias-bar');
    const aliasVal = document.getElementById('fin-cxp-alias-val');
    if (aliasBar && aliasVal) {
        if (cuenta.proveedorAlias) {
            aliasVal.textContent = cuenta.proveedorAlias;
            aliasBar.style.display = 'flex';
        } else {
            aliasBar.style.display = 'none';
        }
    }

    asegurarControlesParcialesModalCxp();

    const histBox = document.getElementById('fin-cxp-historial-box');
    if (histBox) {
        const pagosPrev = Array.isArray(cuenta.pagos) ? cuenta.pagos : [];
        if (pagosPrev.length > 0) {
            histBox.style.display = 'block';
            const filas = pagosPrev.slice(-4).map(pg => {
                const f = new Date(pg.fecha || cuenta.fecha).toLocaleDateString('es-AR');
                return `<div style="display:flex; justify-content:space-between; gap:8px; margin-top:3px;">
                    <span>• ${f} (${escaparHtmlFin(pg.medio || cuenta.medioPago || 'Efectivo')})</span>
                    <strong>${formatearArsFin(pg.monto)}</strong>
                </div>`;
            }).join('');
            histBox.innerHTML = `<strong style="display:block; margin-bottom:2px; color:#334155;">Historial de adelantos (${pagosPrev.length}):</strong>${filas}`;
        } else {
            histBox.style.display = 'none';
        }
    }

    actualizarPreviewLiquidacionCxpFin();
    document.getElementById('modal-fin-cxp')?.classList.add('active');
    const inp = document.getElementById('fin-cxp-monto');
    if (inp) { inp.focus(); inp.select(); }
}

function confirmarLiquidacionCxpFinanzas(e) {
    e.preventDefault();

    const cuentas = leerArrayLocalFin('cat_alogo_cuentas_pagar_v1');
    const cuenta = cuentas.find(c => c.id === window.finanzasState.cxpLiquidandoId);
    if (!cuenta) return;

    const deudaActual = Math.max(0, Number(cuenta.deudaPendiente) || 0);
    const monto = Math.round((parseFloat(document.getElementById('fin-cxp-monto')?.value) || 0) * 100) / 100;
    const medio = document.getElementById('fin-cxp-medio')?.value || 'Transferencia';
    const notaInp = document.getElementById('fin-cxp-nota')?.value.trim();

    if (monto <= 0 || monto > deudaActual + 0.01) {
        alert(`Ingresa un monto entre $1 y ${formatearArsFin(deudaActual)}.`);
        return;
    }

    const fechaIso = new Date().toISOString();
    const nuevoEntregado = Math.round(((Number(cuenta.montoEntregado) || 0) + monto) * 100) / 100;
    const nuevaDeuda = Math.round(Math.max(0, deudaActual - monto) * 100) / 100;
    const nota = notaInp || (nuevaDeuda > 0 ? 'Adelanto parcial desde Finanzas' : 'Cancelación de saldo desde Finanzas');

    cuenta.montoEntregado = nuevoEntregado;
    cuenta.deudaPendiente = nuevaDeuda;
    cuenta.estado = nuevaDeuda <= 0 ? 'pagado' : 'pendiente';
    cuenta.updatedAtMs = Date.now();
    if (!Array.isArray(cuenta.pagos)) cuenta.pagos = [];
    cuenta.pagos.push({ id: 'pg-' + Date.now(), fecha: fechaIso, monto, medio, nota });
    localStorage.setItem('cat_alogo_cuentas_pagar_v1', JSON.stringify(cuentas));

    try {
        const pedidos = leerArrayLocalFin('cat_alogo_pedidos_v1');
        const ped = pedidos.find(p =>
            p.id === cuenta.pedidoId ||
            p.codigo === cuenta.codigoOrden ||
            (p.pagoInfo && p.pagoInfo.cuentaPagarId === cuenta.id)
        );
        if (ped && ped.pagoInfo) {
            ped.pagoInfo.montoEntregado = nuevoEntregado;
            ped.pagoInfo.deudaPendiente = nuevaDeuda;
            ped.pagoInfo.fechaUltimoPago = fechaIso;
            localStorage.setItem('cat_alogo_pedidos_v1', JSON.stringify(pedidos));
        }
    } catch { /* sin bloqueo */ }

    window.CatAlogoSync?.procesarColaPendiente?.();
    document.getElementById('modal-fin-cxp')?.classList.remove('active');
    window.finanzasState.cxpLiquidandoId = null;
    renderizarTodoFinanzas();

    if (nuevaDeuda > 0) {
        alert(`✅ Adelanto de ${formatearArsFin(monto)} registrado para ${cuenta.proveedorNombre}.\n⏳ Saldo pendiente restante: ${formatearArsFin(nuevaDeuda)} ARS.`);
    } else {
        alert(`✅ Deuda saldada al 100% con ${cuenta.proveedorNombre} (último pago: ${formatearArsFin(monto)}).`);
    }
}

/* ==========================================================================
   ETAPA 2: TARJETA DE ARQUEO CIEGO & CIERRE DE TURNO EN VIVO
   ========================================================================== */
function calcularArqueoTurnoActivoFinanzas() {
    const turnos = leerArrayLocalFin('cat_alogo_pos_turnos_v1');
    const turno = turnos.find(esTurnoAbiertoFin) || null;
    if (!turno) return null;

    const inicioTs = new Date(turno.fechaApertura).getTime() || 0;
    const ventasTurno = leerArrayLocalFin('cat_alogo_pos_ventas_v1').filter(v => v.estado !== 'anulada' && ventaPerteneceATurnoFin(v, turno));

    let posEfvo = 0;
    ventasTurno.forEach(v => {
        (v.pagos || []).forEach(pg => {
            if (String(pg.medio || '').toLowerCase().includes('efectivo')) {
                posEfvo += Number(pg.monto) || 0;
            }
        });
    });

    let cliEfvo = 0;
    leerArrayLocalFin('cat_alogo_clientes_v1').forEach(cli => {
        (cli.movimientos || []).forEach(m => {
            if (m.tipo === 'credito' && String(m.medio || '').toLowerCase().includes('efectivo') && (new Date(m.fecha).getTime() || 0) >= inicioTs) {
                cliEfvo += Number(m.monto) || 0;
            }
        });
    });

    let salidasEfvo = (turno.retiros || []).reduce((acc, r) => acc + (Number(r.monto) || 0), 0);
    obtenerMovimientosFinanzas().forEach(m => {
        if (m.tipo === 'gasto' && String(m.medio || '').toLowerCase().includes('efectivo') && (new Date(m.fecha).getTime() || 0) >= inicioTs) {
            salidasEfvo += Number(m.monto) || 0;
        }
    });
    // Descontar también pagos/adelantos a proveedores realizados en Efectivo durante el turno
    leerArrayLocalFin('cat_alogo_cuentas_pagar_v1').forEach(cxp => {
        (cxp.pagos || []).forEach(pg => {
            const medioPg = String(pg.medio || cxp.medioPago || '').toLowerCase();
            const tsPg = new Date(pg.fecha || cxp.fecha).getTime() || 0;
            if (medioPg.includes('efectivo') && tsPg >= inicioTs) {
                salidasEfvo += Math.max(0, Number(pg.monto) || 0);
            }
        });
    });

    const fondo = Math.max(0, Number(turno.fondoInicial) || 0);
    const teorico = Math.round((fondo + posEfvo + cliEfvo - salidasEfvo) * 100) / 100;

    return {
        turno,
        fondo,
        posEfvo: Math.round(posEfvo * 100) / 100,
        cliEfvo: Math.round(cliEfvo * 100) / 100,
        salidasEfvo: Math.round(salidasEfvo * 100) / 100,
        teorico,
        cantVentas: ventasTurno.length
    };
}

function renderizarTarjetaArqueoFinanzas() {
    const datos = calcularArqueoTurnoActivoFinanzas();
    const openBox = document.getElementById('fin-arq-open-box');
    const closedBox = document.getElementById('fin-arq-closed-box');
    const pill = document.getElementById('fin-arq-estado-pill');
    const sub = document.getElementById('fin-arq-turno-sub');

    if (!datos) {
        if (openBox) openBox.style.display = 'none';
        if (closedBox) closedBox.style.display = 'flex';
        if (pill) { pill.textContent = 'Cerrada'; pill.className = 'fin-status-pill err'; }
        if (sub) sub.textContent = 'Sin turno activo en este momento';
        window.finanzasState._firmaArqCargado = '';
        return;
    }

    if (openBox) openBox.style.display = 'flex';
    if (closedBox) closedBox.style.display = 'none';
    if (pill) { pill.textContent = `Abierta #${datos.turno.numero}`; pill.className = 'fin-status-pill ok'; }
    if (sub) sub.textContent = `${datos.turno.nombre} • ${datos.turno.operador || datos.turno.cajeroNombre || 'Cajero'}`;

    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    setTxt('fin-arq-fondo', formatearArsFin(datos.fondo));
    setTxt('fin-arq-pos-efvo', `+${formatearArsFin(datos.posEfvo)}`);
    setTxt('fin-arq-cli-efvo', `+${formatearArsFin(datos.cliEfvo)}`);
    setTxt('fin-arq-salidas', `-${formatearArsFin(datos.salidasEfvo)}`);
    setTxt('fin-arq-teorico', formatearArsFin(datos.teorico));

    const inpConteo = document.getElementById('fin-arq-conteo-inp');
    if (inpConteo) {
        const arqGuardado = datos.turno.ultimoArqueo || datos.turno.arqueoFinal || null;
        const declGuardado = arqGuardado?.totalDeclarado ?? datos.turno.contadoReal ?? null;
        const firmaArq = `${datos.turno.id}::${arqGuardado?.id || ''}::${declGuardado ?? ''}`;
        if (declGuardado !== null && declGuardado !== undefined && window.finanzasState._firmaArqCargado !== firmaArq) {
            inpConteo.value = Number(declGuardado) || 0;
            window.finanzasState._firmaArqCargado = firmaArq;
        }
    }

    const ciego = !!window.finanzasState.arqModoCiego;
    document.getElementById('fin-arq-flows-wrap')?.classList.toggle('fin-arq-blind', ciego);
    document.getElementById('fin-arq-teorico')?.classList.toggle('fin-arq-blind', ciego);

    actualizarDiferenciaArqueoFinanzas();
}

function actualizarDiferenciaArqueoFinanzas() {
    const datos = calcularArqueoTurnoActivoFinanzas();
    if (!datos) return;

    const strip = document.getElementById('fin-arq-diff-strip');
    const lbl = document.getElementById('fin-arq-diff-lbl');
    const val = document.getElementById('fin-arq-diff-val');
    if (!strip || !lbl || !val) return;

    if (window.finanzasState.arqModoCiego) {
        strip.className = 'fin-arq-diff-strip blind';
        lbl.textContent = '🙈 Modo Ciego activo';
        val.textContent = '•••';
        return;
    }

    const contado = Math.max(0, parseFloat(document.getElementById('fin-arq-conteo-inp')?.value) || 0);
    const diff = Math.round((contado - datos.teorico) * 100) / 100;

    if (Math.abs(diff) <= 0.05) {
        strip.className = 'fin-arq-diff-strip ok';
        lbl.textContent = '✅ Cuadre Perfecto';
        val.textContent = '$0';
    } else if (diff > 0) {
        strip.className = 'fin-arq-diff-strip warn';
        lbl.textContent = '⚠️ Sobrante en Caja';
        val.textContent = `+${formatearArsFin(diff)}`;
    } else {
        strip.className = 'fin-arq-diff-strip err';
        lbl.textContent = '🔴 Faltante en Caja';
        val.textContent = `-${formatearArsFin(Math.abs(diff))}`;
    }
}

function descargarBalanceTermico80mmFinanzas() {
    const datos = calcularArqueoTurnoActivoFinanzas();
    if (!datos) {
        console.warn('No hay turno activo para emitir el balance térmico.');
        return;
    }
    const jsPDFCtor = window.jspdf?.jsPDF;
    if (!jsPDFCtor) {
        console.warn('No se cargó la librería jsPDF.');
        return;
    }

    const contado = Math.max(0, parseFloat(document.getElementById('fin-arq-conteo-inp')?.value) || 0);
    const diff = Math.round((contado - datos.teorico) * 100) / 100;
    const comercio = obtenerNombreComercioFin().toUpperCase();
    const ahoraTxt = new Date().toLocaleString('es-AR');

    const pad = (a, b) => {
        const sB = String(b || '');
        const sA = String(a || '').slice(0, Math.max(1, 38 - sB.length));
        return sA + ' '.repeat(Math.max(1, 40 - sA.length - sB.length)) + sB;
    };

    const lineas = [
        `  [ ${comercio.slice(0, 32)} ]`,
        '      BALANCE DE CAJA Y ARQUEO (80MM)',
        '========================================',
        pad(`TURNO: #${datos.turno.numero}`, `OP: ${(datos.turno.operador || '').slice(0, 14)}`),
        pad('EMITIDO:', ahoraTxt.slice(0, 17)),
        '----------------------------------------',
        pad('FONDO INICIAL APERTURA:', formatearArsFin(datos.fondo)),
        pad('+ COBROS EFECTIVO POS:', `+${formatearArsFin(datos.posEfvo)}`),
        pad('+ ABONOS EFECTIVO CLI.:', `+${formatearArsFin(datos.cliEfvo)}`),
        pad('- RETIROS / GASTOS EFVO:', `-${formatearArsFin(datos.salidasEfvo)}`),
        '========================================',
        pad('EFECTIVO TEORICO:', formatearArsFin(datos.teorico)),
        pad('CONTEO FISICO REAL:', formatearArsFin(contado)),
        pad('DIFERENCIA ARQUEO:', `${diff >= 0 ? '+' : '-'}${formatearArsFin(Math.abs(diff))}`),
        '----------------------------------------',
        '   AUDITORIA LOCAL CAT-ALOGO FINANZAS'
    ];

    const doc = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: [80, 115] });
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.4);
    let y = 9;
    lineas.forEach(l => { doc.text(l, 4, y); y += 4.5; });
    doc.save(`balance-caja-turno-${datos.turno.numero}-80mm.pdf`);
}

async function cerrarTurnoDesdeFinanzas() {
    const pro = window.CatAlogoAjustes?.obtenerConfigPro?.();
    if (pro?.seguridadPin?.activo && pro?.seguridadPin?.protegerAnulacionPos) {
        const okPin = await window.CatAlogoAjustes.verificarPinAdmin('cerrar el turno (Corte Z)');
        if (!okPin) return;
    }

    const datos = calcularArqueoTurnoActivoFinanzas();
    if (!datos) {
        alert('No hay ningún turno abierto para cerrar.');
        return;
    }

    const contado = Math.max(0, parseFloat(document.getElementById('fin-arq-conteo-inp')?.value) || 0);
    const diff = Math.round((contado - datos.teorico) * 100) / 100;

    const ok = confirm(
        `🔒 ¿Confirmar CIERRE DEFINITIVO (Corte Z) del Turno #${datos.turno.numero}?\n\n` +
        `• Efectivo Teórico Esperado: ${formatearArsFin(datos.teorico)}\n` +
        `• Conteo Físico Declarado: ${formatearArsFin(contado)}\n` +
        `• Diferencia: ${diff >= 0 ? '+' : '-'}${formatearArsFin(Math.abs(diff))}\n\n` +
        `El cierre y el arqueo se sincronizarán con la App Móvil y se descargará el Balance Térmico 80mm.`
    );
    if (!ok) return;

    const turnos = leerArrayLocalFin('cat_alogo_pos_turnos_v1');
    const tObj = turnos.find(t => String(t.id) === String(datos.turno.id));
    if (!tObj) return;

    const ahoraIso = new Date().toISOString();
    const arqueoRegistro = {
        id: 'arq-z-' + Date.now(),
        fecha: ahoraIso,
        operador: tObj.operador || tObj.cajeroNombre || 'Cajero',
        efectivoTeorico: datos.teorico,
        totalDeclarado: contado,
        diferencia: diff,
        detalleBilletes: tObj.ultimoArqueo?.detalleBilletes || {},
        fueCiego: !!window.finanzasState.arqModoCiego
    };

    try {
        descargarBalanceTermico80mmFinanzas();
    } catch (errPdf) {
        console.warn('No se pudo descargar el PDF Balance 80mm:', errPdf);
    }

    tObj.estado = 'cerrado';
    tObj.estadoApp = 'cerrada';
    tObj.abierto = false;
    tObj.fechaCierre = ahoraIso;
    tObj.dispositivoCierre = 'web_pc';
    tObj.ultimoArqueo = arqueoRegistro;
    tObj.arqueoFinal = arqueoRegistro;
    tObj.contadoReal = contado;
    tObj.totalContado = contado;
    tObj.totalEsperado = datos.teorico;
    tObj.diferencia = diff;
    tObj.diferencias = { Efectivo: diff };
    tObj.notasCierre = tObj.notasCierre || '';
    if (!Array.isArray(tObj.arqueos)) tObj.arqueos = [];
    tObj.arqueos.unshift(arqueoRegistro);
    tObj.resumenCierre = {
        cantTickets: datos.cantVentas,
        efectivoTeorico: datos.teorico,
        totalDeclarado: contado,
        diferencia: diff,
        ventasEfectivo: datos.posEfvo,
        totalRetiros: datos.salidasEfvo
    };

    localStorage.setItem('cat_alogo_pos_turnos_v1', JSON.stringify(turnos));
    window.dispatchEvent(new CustomEvent('cat-alogo:turno-actualizado', { detail: turnos }));
    window.CatAlogoAjustes?.ejecutarAutoRespaldoCierreCaja?.(tObj.numero);
    window.CatAlogoSync?.procesarColaPendiente?.();

    window.finanzasState.arqModoCiego = false;
    window.finanzasState._firmaArqCargado = '';
    const chk = document.getElementById('fin-chk-arq-ciego');
    if (chk) chk.checked = false;
    const inp = document.getElementById('fin-arq-conteo-inp');
    if (inp) inp.value = 0;

    renderizarSelectorTurnosFinanzas();
    renderizarTodoFinanzas();
    alert(`✅ Turno #${tObj.numero} cerrado, auditado y sincronizado con la App.`);
}

/* ==========================================================================
   MODAL CONFIGURACIÓN MOTOR FRICCIÓN CERO & DÓLAR
   ========================================================================== */
function abrirModalConfigFinanzas() {
    const cfg = obtenerConfigFinanzas();
    document.getElementById('fin-cfg-margen').value = cfg.margenGlobal;
    document.getElementById('fin-cfg-dolar').value = cfg.dolarHoy;
    document.getElementById('modal-fin-config')?.classList.add('active');
    document.getElementById('fin-cfg-margen')?.focus();
}

function cerrarModalConfigFinanzas() {
    document.getElementById('modal-fin-config')?.classList.remove('active');
}

/* ==========================================================================
   EVENTOS DEL MÓDULO (ETAPAS 1, 2 Y 3 + HOOKS ETAPAS 4 Y 5)
   ========================================================================== */
function inicializarEventosFinanzas() {
    document.querySelectorAll('#fin-period-tabs .fin-ptab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#fin-period-tabs .fin-ptab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            window.finanzasState.periodo = btn.getAttribute('data-periodo');
            if (window.finanzasState.periodo === 'turno') renderizarSelectorTurnosFinanzas();
            renderizarTodoFinanzas();
        });
    });

    document.getElementById('fin-select-turno')?.addEventListener('change', (e) => {
        window.finanzasState.turnoSeleccionadoId = e.target.value;
        renderizarTodoFinanzas();
    });

    document.getElementById('fin-date-desde')?.addEventListener('change', (e) => {
        window.finanzasState.fechaDesde = e.target.value;
        renderizarTodoFinanzas();
    });
    document.getElementById('fin-date-hasta')?.addEventListener('change', (e) => {
        window.finanzasState.fechaHasta = e.target.value;
        renderizarTodoFinanzas();
    });

    document.getElementById('fin-chk-mostrar-usd')?.addEventListener('change', (e) => {
        const cfg = obtenerConfigFinanzas();
        cfg.mostrarUsd = e.target.checked;
        guardarConfigFinanzas(cfg);
        renderizarTodoFinanzas();
    });

    document.getElementById('btn-fin-config-motor')?.addEventListener('click', abrirModalConfigFinanzas);
    document.getElementById('btn-cerrar-modal-fin-cfg')?.addEventListener('click', cerrarModalConfigFinanzas);
    document.getElementById('btn-cancelar-modal-fin-cfg')?.addEventListener('click', cerrarModalConfigFinanzas);
    document.getElementById('modal-fin-config')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-fin-config') cerrarModalConfigFinanzas();
    });
    document.getElementById('form-fin-config')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const cfg = obtenerConfigFinanzas();
        cfg.margenGlobal = Math.min(95, Math.max(1, parseFloat(document.getElementById('fin-cfg-margen').value) || 30));
        cfg.dolarHoy = Math.max(1, parseFloat(document.getElementById('fin-cfg-dolar').value) || 1150);
        guardarConfigFinanzas(cfg);
        cerrarModalConfigFinanzas();
        renderizarTodoFinanzas();
    });

    document.querySelectorAll('#fin-ladder-grid .fin-step-card').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#fin-ladder-grid .fin-step-card').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const n = parseInt(btn.getAttribute('data-nivel'), 10) || 1;
            window.finanzasState.nivelActivo = n;
            const mapaDest = {
                3: 'fin-card-nivel-3',
                4: 'fin-card-nivel-4',
                6: 'fin-card-nivel-6',
                7: 'fin-card-nivel-7'
            };
            if (mapaDest[n]) {
                document.getElementById(mapaDest[n])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    document.querySelectorAll('.fin-rtab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.fin-rtab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            window.finanzasState.rankTab = btn.getAttribute('data-rtab');
            renderizarNivel6Analitica(calcularMetricasFinanzasPeriodo());
        });
    });

    document.getElementById('btn-fin-nuevo-gasto')?.addEventListener('click', () => abrirModalMovimientoFinanzas('gasto'));
    document.getElementById('btn-fin-opex-rapido')?.addEventListener('click', () => abrirModalMovimientoFinanzas('gasto'));
    document.getElementById('btn-fin-nuevo-ingreso')?.addEventListener('click', () => abrirModalMovimientoFinanzas('ingreso'));

    document.querySelectorAll('.fin-tpl-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            abrirModalMovimientoFinanzas('gasto', chip.getAttribute('data-tpl-cat'), chip.getAttribute('data-tpl-txt'));
        });
    });

    document.querySelectorAll('.fin-mtype-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tipo = btn.getAttribute('data-mtype');
            window.finanzasState.movModalTipo = tipo;
            document.querySelectorAll('.fin-mtype-btn').forEach(b => b.classList.toggle('active', b === btn));
            document.getElementById('modal-fin-mov-title').textContent = tipo === 'ingreso'
                ? '➕ Registrar Ingreso Manual / Extraordinario'
                : '➖ Registrar Gasto Operativo (OPEX)';
            document.getElementById('btn-guardar-fin-mov').textContent = tipo === 'ingreso'
                ? '✅ Registrar Ingreso'
                : '✅ Registrar Gasto OPEX';
            poblarSelectCategoriasMovFin(tipo);
        });
    });

    document.getElementById('btn-fin-nueva-cat-opex')?.addEventListener('click', () => {
        const tipo = window.finanzasState.movModalTipo || 'gasto';
        const nueva = prompt(`Nombre de la nueva categoría de ${tipo === 'ingreso' ? 'Ingreso' : 'Gasto OPEX'}:`);
        if (!nueva || !nueva.trim()) return;
        const limpia = nueva.trim();
        const cfg = obtenerConfigFinanzas();
        const arr = tipo === 'ingreso' ? cfg.categoriasIngreso : cfg.categoriasOpex;
        if (!arr.includes(limpia)) {
            arr.push(limpia);
            guardarConfigFinanzas(cfg);
        }
        poblarSelectCategoriasMovFin(tipo, limpia);
    });

    document.getElementById('btn-cerrar-modal-fin-mov')?.addEventListener('click', cerrarModalMovimientoFinanzas);
    document.getElementById('btn-cancelar-modal-fin-mov')?.addEventListener('click', cerrarModalMovimientoFinanzas);
    document.getElementById('modal-fin-mov')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-fin-mov') cerrarModalMovimientoFinanzas();
    });
    document.getElementById('form-fin-mov')?.addEventListener('submit', guardarMovimientoFinanzasFormulario);

    document.getElementById('fin-opex-recent-list')?.addEventListener('click', (e) => {
        const btnDel = e.target.closest('.btn-del-fin-mov');
        if (!btnDel) return;
        const id = btnDel.closest('.fin-opex-recent-row')?.getAttribute('data-finmov-id');
        if (!id || !confirm('¿Eliminar este movimiento manual de Finanzas?')) return;
        guardarMovimientosFinanzas(obtenerMovimientosFinanzas().filter(m => m.id !== id));
        renderizarTodoFinanzas();
    });

    document.getElementById('fin-cxp-list')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-fin-liquidar-cxp');
        if (btn) abrirModalLiquidarCxpFinanzas(btn.getAttribute('data-cxp-id'));
    });
    document.getElementById('btn-cerrar-modal-fin-cxp')?.addEventListener('click', () => {
        document.getElementById('modal-fin-cxp')?.classList.remove('active');
    });
    document.getElementById('btn-cancelar-modal-fin-cxp')?.addEventListener('click', () => {
        document.getElementById('modal-fin-cxp')?.classList.remove('active');
    });
    document.getElementById('modal-fin-cxp')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-fin-cxp') e.target.classList.remove('active');
    });
    document.getElementById('btn-fin-cxp-saldar-100')?.addEventListener('click', () => {
        const cuenta = leerArrayLocalFin('cat_alogo_cuentas_pagar_v1').find(c => c.id === window.finanzasState.cxpLiquidandoId);
        if (cuenta) document.getElementById('fin-cxp-monto').value = Math.max(0, Number(cuenta.deudaPendiente) || 0);
    });
    document.getElementById('form-fin-cxp')?.addEventListener('submit', confirmarLiquidacionCxpFinanzas);

    document.getElementById('btn-fin-arqueo-cierre')?.addEventListener('click', () => {
        document.getElementById('fin-card-arqueo')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    document.getElementById('fin-chk-arq-ciego')?.addEventListener('change', (e) => {
        window.finanzasState.arqModoCiego = e.target.checked;
        renderizarTarjetaArqueoFinanzas();
    });

    document.getElementById('fin-arq-conteo-inp')?.addEventListener('input', actualizarDiferenciaArqueoFinanzas);

    document.getElementById('btn-fin-arq-igualar')?.addEventListener('click', () => {
        const datos = calcularArqueoTurnoActivoFinanzas();
        if (!datos) return;
        document.getElementById('fin-arq-conteo-inp').value = datos.teorico;
        actualizarDiferenciaArqueoFinanzas();
    });

    document.querySelectorAll('.fin-bill-chip[data-add]').forEach(btn => {
        btn.addEventListener('click', () => {
            const inp = document.getElementById('fin-arq-conteo-inp');
            if (!inp) return;
            const actual = Math.max(0, parseFloat(inp.value) || 0);
            const suma = parseFloat(btn.getAttribute('data-add')) || 0;
            inp.value = Math.round((actual + suma) * 100) / 100;
            actualizarDiferenciaArqueoFinanzas();
        });
    });

    document.getElementById('btn-fin-arq-reset')?.addEventListener('click', () => {
        const inp = document.getElementById('fin-arq-conteo-inp');
        if (inp) inp.value = 0;
        actualizarDiferenciaArqueoFinanzas();
    });

    document.getElementById('btn-fin-balance-80mm')?.addEventListener('click', descargarBalanceTermico80mmFinanzas);
    document.getElementById('btn-fin-cerrar-turno-z')?.addEventListener('click', cerrarTurnoDesdeFinanzas);

    document.getElementById('btn-fin-abrir-turno-card')?.addEventListener('click', () => {
        document.getElementById('modal-fin-abrir-turno')?.classList.add('active');
        document.getElementById('fin-apt-fondo')?.focus();
    });
    const cerrarApt = () => document.getElementById('modal-fin-abrir-turno')?.classList.remove('active');
    document.getElementById('btn-cerrar-modal-fin-apt')?.addEventListener('click', cerrarApt);
    document.getElementById('btn-cancelar-modal-fin-apt')?.addEventListener('click', cerrarApt);
    document.getElementById('form-fin-abrir-turno')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const turnos = leerArrayLocalFin('cat_alogo_pos_turnos_v1');
        const numero = 101 + turnos.length;
        const operador = document.getElementById('fin-apt-operador')?.value.trim() || 'Cajero';
        turnos.unshift({
            id: 'turno-' + Date.now(),
            numero,
            nombre: document.getElementById('fin-apt-nombre')?.value || 'Caja #01 • Turno Mañana',
            operador,
            cajeroNombre: operador,
            fondoInicial: Math.max(0, parseFloat(document.getElementById('fin-apt-fondo')?.value) || 0),
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
        localStorage.setItem('cat_alogo_pos_turnos_v1', JSON.stringify(turnos));
        window.dispatchEvent(new CustomEvent('cat-alogo:turno-actualizado', { detail: turnos }));
        window.CatAlogoSync?.procesarColaPendiente?.();
        window.finanzasState.turnoSeleccionadoId = 'activo';
        window.finanzasState._firmaArqCargado = '';
        cerrarApt();
        renderizarSelectorTurnosFinanzas();
        renderizarTodoFinanzas();
    });

    document.getElementById('btn-fin-reporte-pdf')?.addEventListener('click', () => {
        if (typeof abrirModalReportesPdfFinanzas === 'function') abrirModalReportesPdfFinanzas();
        else alert('📄 El Sistema de Reportes Inteligentes PDF se activa en la Etapa 4.');
    });
    document.getElementById('btn-fin-herramientas')?.addEventListener('click', () => {
        if (typeof abrirModalHerramientasMayoristas === 'function') abrirModalHerramientasMayoristas();
        else alert('⚙️ El Actualizador Masivo de Precios y Respaldo .catbak se activan en la Etapa 5.');
    });
}

if (!window._finTurnoSyncListener) {
    window.addEventListener('cat-alogo:turno-actualizado', () => {
        if (!document.getElementById('finanzas-module-root')) return;
        renderizarSelectorTurnosFinanzas();
        renderizarTodoFinanzas();
    });
    window._finTurnoSyncListener = true;
}

/* ==========================================================================
   ETAPA 4: SISTEMA DE REPORTES INTELIGENTES EN PDF (4 MODELOS CONTABLES)
   ========================================================================== */
let finPdfEventosRegistrados = false;

function abrirModalReportesPdfFinanzas() {
    const modal = document.getElementById('modal-fin-reportes-pdf');
    if (!modal) return;

    const rango = obtenerRangoTemporalFinanzas();
    const lblPer = document.getElementById('fin-pdf-periodo-actual');
    if (lblPer) lblPer.textContent = rango.etiqueta;

    const ahora = new Date();
    const inpMes = document.getElementById('fin-pdf-mes-sel');
    if (inpMes && !inpMes.value) {
        inpMes.value = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
    }

    const selAnio = document.getElementById('fin-pdf-anio-sel');
    if (selAnio && selAnio.options.length === 0) {
        const yAct = ahora.getFullYear();
        let opts = '';
        for (let y = yAct; y >= yAct - 3; y--) {
            opts += `<option value="${y}">${y}</option>`;
        }
        selAnio.innerHTML = opts;
    }

    if (!finPdfEventosRegistrados) {
        const cerrar = () => modal.classList.remove('active');
        document.getElementById('btn-cerrar-modal-fin-pdf')?.addEventListener('click', cerrar);
        document.getElementById('btn-cancelar-modal-fin-pdf')?.addEventListener('click', cerrar);
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'modal-fin-reportes-pdf') cerrar();
        });

        document.getElementById('btn-gen-pdf-diario')?.addEventListener('click', () => {
            generarPdfReporteDiarioHibrido();
            cerrar();
        });
        document.getElementById('btn-gen-pdf-semanal')?.addEventListener('click', () => {
            generarPdfReporteSemanal();
            cerrar();
        });
        document.getElementById('btn-gen-pdf-mensual')?.addEventListener('click', () => {
            generarPdfReporteMensualPnl();
            cerrar();
        });
        document.getElementById('btn-gen-pdf-anual')?.addEventListener('click', () => {
            generarPdfReporteAnual();
            cerrar();
        });

        finPdfEventosRegistrados = true;
    }

    modal.classList.add('active');
}

function calcularResumenRangoPdfFin(inicioTs, finTs, turnoObj = null) {
    const cfg = obtenerConfigFinanzas();
    const margenRespaldo = Math.min(95, Math.max(1, Number(cfg.margenGlobal) || 30));

    const productos = leerArrayLocalFin('cat_alogo_productos_v1');
    const prodMap = new Map(productos.map(p => [String(p.id), p]));
    const todasVentas = leerArrayLocalFin('cat_alogo_pos_ventas_v1');
    const todosTurnos = leerArrayLocalFin('cat_alogo_pos_turnos_v1');
    const todosClientes = leerArrayLocalFin('cat_alogo_clientes_v1');
    const todosMovs = obtenerMovimientosFinanzas();

    const enRango = (iso) => {
        const ts = new Date(iso).getTime();
        return !isNaN(ts) && ts >= inicioTs && ts <= finTs;
    };

    const ventasRango = todasVentas.filter(v => (turnoObj ? ventaPerteneceATurnoFin(v, turnoObj) : enRango(v.fecha)));
    const validas = ventasRango.filter(v => v.estado !== 'anulada');
    const anuladas = ventasRango.filter(v => v.estado === 'anulada');

    let ventasBrutas = 0;
    let descuentos = 0;
    let anulaciones = anuladas.reduce((a, v) => a + (Number(v.total) || 0), 0);
    let ventasNetas = 0;
    let cmv = 0;
    let ventasEfvo = 0;

    const mediosMap = {};
    const prodsMap = {};
    const catMap = {};
    const opexCatMap = {};
    let opexOperativo = 0;
    let impuestos = 0;
    let retirosEfvo = 0;
    let gastosCajaEfvo = 0;
    let cobranzasEfvo = 0;

    validas.forEach(v => {
        ventasBrutas += Number(v.subtotal) || Number(v.total) || 0;
        descuentos += Number(v.descuentoMonto) || 0;
        ventasNetas += Number(v.total) || 0;

        (v.pagos || []).forEach(pg => {
            const k = pg.medio || 'Efectivo';
            mediosMap[k] = Math.round(((mediosMap[k] || 0) + (Number(pg.monto) || 0)) * 100) / 100;
            if (String(k).toLowerCase().includes('efectivo')) ventasEfvo += Number(pg.monto) || 0;
        });

        (v.items || []).forEach(it => {
            const cant = Math.max(0, Number(it.cantidad) || 0);
            const sub = (Number(it.precioUnit) || 0) * cant;
            const prodRef = prodMap.get(String(it.prodId));
            let cUnit = Number(it.costoUnit) || 0;
            if (cUnit <= 0 && prodRef && (Number(prodRef.precioCosto) || 0) > 0) cUnit = Number(prodRef.precioCosto);

            const costoIt = cUnit > 0 ? cUnit * cant : sub * (1 - margenRespaldo / 100);
            cmv += costoIt;

            const cat = (prodRef?.categoria || 'General').trim() || 'General';
            catMap[cat] = Math.round(((catMap[cat] || 0) + sub) * 100) / 100;

            const pk = `${it.sku || it.prodId}::${it.nombre || ''}`;
            if (!prodsMap[pk]) {
                prodsMap[pk] = { nombre: it.nombre || 'Producto', unidad: abrevUnidadFin(it.unidadMedida), cant: 0, total: 0 };
            }
            prodsMap[pk].cant = Math.round((prodsMap[pk].cant + cant) * 1000) / 1000;
            prodsMap[pk].total = Math.round((prodsMap[pk].total + sub) * 100) / 100;
        });
    });

    todosMovs.forEach(m => {
        if (m.tipo !== 'gasto' || !enRango(m.fecha)) return;
        const monto = Math.max(0, Number(m.monto) || 0);
        const cat = (m.categoria || 'Otros Gastos Operativos').trim();
        const catLow = cat.toLowerCase();
        if (catLow.includes('impuesto') || catLow.includes('tasa') || catLow.includes('monotributo')) {
            impuestos += monto;
        } else {
            opexOperativo += monto;
            opexCatMap[cat] = Math.round(((opexCatMap[cat] || 0) + monto) * 100) / 100;
        }
        if (String(m.medio || '').toLowerCase().includes('efectivo')) gastosCajaEfvo += monto;
    });

    const turnosEval = turnoObj ? [turnoObj] : todosTurnos;
    turnosEval.forEach(t => {
        (t.retiros || []).forEach(r => {
            if (!turnoObj && !enRango(r.fecha)) return;
            const monto = Math.max(0, Number(r.monto) || 0);
            if (String(r.tipo || '').toLowerCase().includes('gasto')) {
                opexOperativo += monto;
                gastosCajaEfvo += monto;
                opexCatMap['Gastos Menores de Caja'] = Math.round(((opexCatMap['Gastos Menores de Caja'] || 0) + monto) * 100) / 100;
            } else {
                retirosEfvo += monto;
            }
        });
    });

    todosClientes.forEach(cli => {
        (cli.movimientos || []).forEach(m => {
            if (m.tipo === 'credito' && String(m.medio || '').toLowerCase().includes('efectivo') && enRango(m.fecha)) {
                cobranzasEfvo += Math.max(0, Number(m.monto) || 0);
            }
        });
    });

    ventasNetas = Math.round(ventasNetas * 100) / 100;
    cmv = Math.round(cmv * 100) / 100;
    const margenBruto = Math.round((ventasNetas - cmv) * 100) / 100;
    const margenPct = ventasNetas > 0 ? Math.round((margenBruto / ventasNetas) * 1000) / 10 : 0;
    opexOperativo = Math.round(opexOperativo * 100) / 100;
    impuestos = Math.round(impuestos * 100) / 100;
    const opexTotal = Math.round((opexOperativo + impuestos) * 100) / 100;
    const ebitda = Math.round((margenBruto - opexOperativo) * 100) / 100;
    const utilidadNeta = Math.round((ebitda - impuestos) * 100) / 100;

    return {
        cfg,
        cantOps: validas.length,
        ventasBrutas: Math.round(ventasBrutas * 100) / 100,
        descuentos: Math.round(descuentos * 100) / 100,
        anulaciones: Math.round(anulaciones * 100) / 100,
        ventasNetas,
        cmv,
        margenBruto,
        margenPct,
        opexOperativo,
        impuestos,
        opexTotal,
        ebitda,
        utilidadNeta,
        ventasEfvo: Math.round(ventasEfvo * 100) / 100,
        cobranzasEfvo: Math.round(cobranzasEfvo * 100) / 100,
        gastosCajaEfvo: Math.round(gastosCajaEfvo * 100) / 100,
        retirosEfvo: Math.round(retirosEfvo * 100) / 100,
        mediosMap,
        opexCatMap,
        catMap,
        topProductos: Object.values(prodsMap).sort((a, b) => b.total - a.total).slice(0, 5)
    };
}

function dibujarHeaderPdfFin(doc, titulo, subtitulo) {
    const comercio = obtenerNombreComercioFin();
    const emitido = new Date().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 26, 'F');
    doc.setFillColor(4, 120, 87);
    doc.rect(0, 26, 210, 1.8, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    doc.text(titulo, 14, 11.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225);
    doc.text(`${comercio.toUpperCase()}  •  ${subtitulo}`, 14, 19.5);
    doc.text(`Emitido: ${emitido}`, 196, 19.5, { align: 'right' });
}

function agregarPiesPaginaPdfFin(doc) {
    const totalPags = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPags; i++) {
        doc.setPage(i);
        doc.setDrawColor(226, 232, 240);
        doc.line(14, 286, 196, 286);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('Cat-Alogo ERP • Sistema de Reporteo Financiero Local-First', 14, 291);
        doc.text(`Página ${i} de ${totalPags}`, 196, 291, { align: 'right' });
    }
}

function dibujarKpiStripPdfFin(doc, y, items) {
    const n = items.length;
    const gap = 3;
    const w = (182 - gap * (n - 1)) / n;

    items.forEach((it, idx) => {
        const x = 14 + idx * (w + gap);
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x, y, w, 19, 2, 2, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(it.label.toUpperCase(), x + 3, y + 5.5);

        doc.setFontSize(10.5);
        const rgb = it.color || [15, 23, 42];
        doc.setTextColor(rgb[0], rgb[1], rgb[2]);
        doc.text(it.val, x + 3, y + 12.2);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(71, 85, 105);
        doc.text(String(it.sub || '').slice(0, 26), x + 3, y + 16.8);
    });

    return y + 24;
}

function generarPdfReporteDiarioHibrido() {
    const jsPDFCtor = window.jspdf?.jsPDF;
    if (!jsPDFCtor) { alert('No se cargó jsPDF.'); return; }

    const m = calcularMetricasFinanzasPeriodo();
    const r = calcularResumenRangoPdfFin(m.rango.inicioTs, m.rango.finTs, m.rango.turno);
    const doc = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: 'a4' });

    dibujarHeaderPdfFin(doc, 'REPORTE FINANCIERO DIARIO / TURNO (MODELO HÍBRIDO)', m.rango.etiqueta);

    const turno = m.rango.turno;
    const fondoIni = turno ? (Number(turno.fondoInicial) || 0) : 0;
    const efvoEsp = Math.round((fondoIni + r.ventasEfvo + r.cobranzasEfvo - r.gastosCajaEfvo - r.retirosEfvo) * 100) / 100;
    const ultArq = turno?.arqueoFinal || turno?.ultimoArqueo || null;
    const diffArq = ultArq ? Number(ultArq.diferencia) || 0 : 0;

    let y = 33;
    y = dibujarKpiStripPdfFin(doc, y, [
        { label: 'PERÍODO / TURNO', val: turno ? `Turno #${turno.numero}` : new Date().toLocaleDateString('es-AR'), sub: turno ? turno.operador : m.rango.etiqueta },
        { label: 'VENTAS NETAS', val: formatearArsFin(r.ventasNetas), sub: `${r.cantOps} Operaciones` },
        { label: 'MARGEN BRUTO ($)', val: formatearArsFin(r.margenBruto), sub: `Margen: ${r.margenPct.toFixed(1)}%`, color: [4, 120, 87] },
        { label: 'EFECTIVO EN CAJA', val: formatearArsFin(efvoEsp), sub: ultArq ? `Dif. Arqueo: ${formatearArsFin(diffArq)}` : 'Teórico en gaveta', color: diffArq < 0 ? [185, 28, 28] : [4, 120, 87] }
    ]);

    const dibujarTablaMini = (x, yStart, ancho, titulo, filas) => {
        doc.setFillColor(15, 23, 42);
        doc.rect(x, yStart, ancho, 6.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text(titulo, x + 2.5, yStart + 4.5);

        let cy = yStart + 10.5;
        filas.forEach((f, i) => {
            if (f.hl) {
                doc.setFillColor(236, 253, 245);
                doc.rect(x, cy - 3.8, ancho, 5.8, 'F');
            } else if (i % 2 === 1) {
                doc.setFillColor(248, 250, 252);
                doc.rect(x, cy - 3.8, ancho, 5.8, 'F');
            }
            doc.setFont('helvetica', f.bold ? 'bold' : 'normal');
            doc.setFontSize(7.6);
            doc.setTextColor(f.hl ? 6 : 30, f.hl ? 95 : 41, f.hl ? 70 : 59);
            doc.text(f.k, x + 2.5, cy);
            doc.text(f.v, x + ancho - 2.5, cy, { align: 'right' });
            cy += 5.8;
        });
        return cy;
    };

    const yA = dibujarTablaMini(14, y, 89, 'A. RESULTADO ECONÓMICO (DEVENGADO)', [
        { k: 'Ventas Brutas Totales', v: formatearArsFin(r.ventasBrutas) },
        { k: '(-) Descuentos Aplicados', v: `-${formatearArsFin(r.descuentos)}` },
        { k: '(-) Anulaciones / Devoluciones', v: `-${formatearArsFin(r.anulaciones)}` },
        { k: '(=) Ventas Netas', v: formatearArsFin(r.ventasNetas), bold: true },
        { k: '(-) Costo Mercadería (CMV)*', v: `-${formatearArsFin(r.cmv)}` },
        { k: '(=) MARGEN BRUTO ($)', v: formatearArsFin(r.margenBruto), bold: true, hl: true },
        { k: 'MARGEN BRUTO (%)', v: `${r.margenPct.toFixed(1)}%`, bold: true }
    ]);

    const filasCaja = [
        { k: 'Fondo Inicial / Apertura', v: formatearArsFin(fondoIni) },
        { k: '(+) Cobros Efectivo POS', v: `+${formatearArsFin(r.ventasEfvo)}` },
        { k: '(+) Abonos Efectivo Clientes', v: `+${formatearArsFin(r.cobranzasEfvo)}` },
        { k: '(-) Gastos Operativos Efectivo', v: `-${formatearArsFin(r.gastosCajaEfvo)}` },
        { k: '(-) Retiros de Custodia', v: `-${formatearArsFin(r.retirosEfvo)}` },
        { k: '(=) Efectivo Esperado Caja', v: formatearArsFin(efvoEsp), bold: true, hl: true },
        { k: ultArq ? 'Efectivo Real (Arqueo)' : 'Arqueo Físico', v: ultArq ? formatearArsFin(ultArq.totalDeclarado) : 'Sin declarar' }
    ];
    const yB = dibujarTablaMini(107, y, 89, 'B. CONTROL DE CAJA Y FONDOS (EFECTIVO)', filasCaja);

    y = Math.max(yA, yB) + 2;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(`*CMV calculado con costo exacto por SKU o regla Fricción Cero (${r.cfg.margenGlobal}% margen global) en ítems sin costo.`, 14, y);
    y += 6;

    const mediosArr = Object.entries(r.mediosMap).sort((a, b) => b[1] - a[1]);
    const totalMed = mediosArr.reduce((a, x) => a + x[1], 0);
    const filasMed = mediosArr.length > 0
        ? mediosArr.map(([med, mon]) => ({ k: `${med} (${totalMed > 0 ? Math.round((mon / totalMed) * 100) : 0}%)`, v: formatearArsFin(mon) }))
        : [{ k: 'Sin cobros registrados', v: '$0' }];
    const yC = dibujarTablaMini(14, y, 89, 'DESGLOSE POR MEDIO DE PAGO', filasMed);

    const filasTop = r.topProductos.length > 0
        ? r.topProductos.map(p => ({ k: `${p.nombre.slice(0, 24)} (${p.cant} ${p.unidad})`, v: formatearArsFin(p.total) }))
        : [{ k: 'Sin productos vendidos', v: '$0' }];
    const yD = dibujarTablaMini(107, y, 89, 'TOP 5 PRODUCTOS VENDIDOS', filasTop);

    y = Math.max(yC, yD) + 6;

    const dibujarHeaderMovs = (yy) => {
        doc.setFillColor(15, 23, 42);
        doc.rect(14, yy, 182, 6.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.4);
        doc.setTextColor(255, 255, 255);
        doc.text('MOVIMIENTOS DETALLADOS DEL PERÍODO (AUDITORÍA CRONOLÓGICA)', 16.5, yy + 4.4);

        yy += 10.5;
        doc.setFillColor(241, 245, 249);
        doc.rect(14, yy - 4, 182, 6, 'F');
        doc.setTextColor(51, 65, 85);
        doc.setFontSize(7);
        doc.text('FECHA / HORA', 16, yy);
        doc.text('TIPO', 45, yy);
        doc.text('MEDIO', 74, yy);
        doc.text('DETALLE / CONCEPTO', 102, yy);
        doc.text('MONTO', 194, yy, { align: 'right' });
        return yy + 5.5;
    };

    if (y > 245) { doc.addPage(); y = 18; }
    y = dibujarHeaderMovs(y);

    const ops = m.operacionesAuditadas || [];
    if (ops.length === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('No se registraron movimientos en este período.', 16, y);
    } else {
        ops.forEach((op, idx) => {
            if (y > 276) {
                doc.addPage();
                y = dibujarHeaderMovs(16);
            }
            if (idx % 2 === 1) {
                doc.setFillColor(248, 250, 252);
                doc.rect(14, y - 3.6, 182, 5.4, 'F');
            }
            const fTxt = new Date(op.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            const esIn = op.tipo === 'in';
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.2);
            doc.setTextColor(30, 41, 59);
            doc.text(fTxt, 16, y);
            doc.text(String(op.origen || '').slice(0, 15), 45, y);
            doc.text(String(op.medio || '').slice(0, 14), 74, y);
            doc.text(String(op.concepto || '').slice(0, 38), 102, y);

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(esIn ? 4 : 185, esIn ? 120 : 28, esIn ? 87 : 28);
            doc.text(`${esIn ? '+' : '-'}${formatearArsFin(op.monto)}`, 194, y, { align: 'right' });
            y += 5.4;
        });
    }

    agregarPiesPaginaPdfFin(doc);
    doc.save(`reporte-hibrido-diario-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function generarPdfReporteSemanal() {
    const jsPDFCtor = window.jspdf?.jsPDF;
    if (!jsPDFCtor) { alert('No se cargó jsPDF.'); return; }

    const ahora = new Date();
    const diaSem = ahora.getDay() === 0 ? 6 : ahora.getDay() - 1;
    const lunes = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - diaSem, 0, 0, 0);
    const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6, 23, 59, 59, 999);

    const diasNombres = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const filasDias = [];
    let totVentas = 0, totCmv = 0, totMargen = 0, totOpex = 0, totNeto = 0;

    for (let i = 0; i < 7; i++) {
        const dIni = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i, 0, 0, 0).getTime();
        const dFin = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i, 23, 59, 59, 999).getTime();
        const r = calcularResumenRangoPdfFin(dIni, dFin, null);
        filasDias.push({
            dia: diasNombres[i],
            fecha: new Date(dIni).toLocaleDateString('es-AR'),
            ...r
        });
        totVentas += r.ventasNetas;
        totCmv += r.cmv;
        totMargen += r.margenBruto;
        totOpex += r.opexTotal;
        totNeto += r.utilidadNeta;
    }

    const margenTotPct = totVentas > 0 ? ((totMargen / totVentas) * 100).toFixed(1) : '0.0';
    const netoTotPct = totVentas > 0 ? ((totNeto / totVentas) * 100).toFixed(1) : '0.0';

    const doc = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: 'a4' });
    dibujarHeaderPdfFin(
        doc,
        'RESUMEN FINANCIERO SEMANAL (CONSOLIDADO DE GESTIÓN)',
        `Del ${lunes.toLocaleDateString('es-AR')} al ${domingo.toLocaleDateString('es-AR')}`
    );

    let y = 33;
    y = dibujarKpiStripPdfFin(doc, y, [
        { label: 'VENTAS SEMANALES', val: formatearArsFin(totVentas), sub: 'Consolidado 7 días' },
        { label: 'CMV SEMANAL', val: formatearArsFin(totCmv), sub: 'Costo Mercadería' },
        { label: 'MARGEN BRUTO', val: formatearArsFin(totMargen), sub: `Margen: ${margenTotPct}%`, color: [4, 120, 87] },
        { label: 'GASTOS (OPEX)', val: formatearArsFin(totOpex), sub: 'Egresos operativos', color: [185, 28, 28] },
        { label: 'RESULTADO NETO', val: formatearArsFin(totNeto), sub: `Utilidad: ${netoTotPct}%`, color: totNeto >= 0 ? [4, 120, 87] : [185, 28, 28] }
    ]);

    y += 4;
    doc.setFillColor(15, 23, 42);
    doc.rect(14, y, 182, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(255, 255, 255);
    doc.text('DÍA', 16, y + 4.8);
    doc.text('FECHA', 38, y + 4.8);
    doc.text('VENTAS NETAS', 84, y + 4.8, { align: 'right' });
    doc.text('COSTO (CMV)', 111, y + 4.8, { align: 'right' });
    doc.text('MARGEN ($)', 136, y + 4.8, { align: 'right' });
    doc.text('M. %', 150, y + 4.8, { align: 'right' });
    doc.text('OPEX', 171, y + 4.8, { align: 'right' });
    doc.text('NETO', 194, y + 4.8, { align: 'right' });

    y += 12;
    filasDias.forEach((f, idx) => {
        if (idx % 2 === 1) {
            doc.setFillColor(248, 250, 252);
            doc.rect(14, y - 4.2, 182, 7.2, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text(f.dia, 16, y);
        doc.setTextColor(71, 85, 105);
        doc.text(f.fecha, 38, y);
        doc.setTextColor(15, 23, 42);
        doc.text(formatearArsFin(f.ventasNetas), 84, y, { align: 'right' });
        doc.text(formatearArsFin(f.cmv), 111, y, { align: 'right' });
        doc.text(formatearArsFin(f.margenBruto), 136, y, { align: 'right' });
        doc.text(`${f.margenPct.toFixed(1)}%`, 150, y, { align: 'right' });
        doc.setTextColor(185, 28, 28);
        doc.text(formatearArsFin(f.opexTotal), 171, y, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(f.utilidadNeta >= 0 ? 4 : 185, f.utilidadNeta >= 0 ? 120 : 28, f.utilidadNeta >= 0 ? 87 : 28);
        doc.text(formatearArsFin(f.utilidadNeta), 194, y, { align: 'right' });
        y += 7.2;
    });

    doc.setFillColor(236, 253, 245);
    doc.rect(14, y - 4.2, 182, 8.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.3);
    doc.setTextColor(6, 95, 70);
    doc.text('TOTAL SEMANA', 16, y + 0.5);
    doc.text(formatearArsFin(totVentas), 84, y + 0.5, { align: 'right' });
    doc.text(formatearArsFin(totCmv), 111, y + 0.5, { align: 'right' });
    doc.text(formatearArsFin(totMargen), 136, y + 0.5, { align: 'right' });
    doc.text(`${margenTotPct}%`, 150, y + 0.5, { align: 'right' });
    doc.text(formatearArsFin(totOpex), 171, y + 0.5, { align: 'right' });
    doc.text(formatearArsFin(totNeto), 194, y + 0.5, { align: 'right' });

    agregarPiesPaginaPdfFin(doc);
    doc.save(`resumen-semanal-${lunes.toISOString().slice(0, 10)}.pdf`);
}

function generarPdfReporteMensualPnl() {
    const jsPDFCtor = window.jspdf?.jsPDF;
    if (!jsPDFCtor) { alert('No se cargó jsPDF.'); return; }

    const mesVal = document.getElementById('fin-pdf-mes-sel')?.value;
    const ahora = new Date();
    const [anioNum, mesNum] = mesVal ? mesVal.split('-').map(Number) : [ahora.getFullYear(), ahora.getMonth() + 1];

    const dIni = new Date(anioNum, mesNum - 1, 1, 0, 0, 0);
    const dFin = new Date(anioNum, mesNum, 0, 23, 59, 59, 999);
    const nomMes = dIni.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    const nomMesCap = nomMes.charAt(0).toUpperCase() + nomMes.slice(1);

    const r = calcularResumenRangoPdfFin(dIni.getTime(), dFin.getTime(), null);
    const doc = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: 'a4' });

    dibujarHeaderPdfFin(doc, 'RESUMEN FINANCIERO MENSUAL (ESTADO DE RESULTADOS - P&L)', `Período: ${nomMesCap}`);

    const pctV = (v) => (r.ventasNetas > 0 ? `${((Math.abs(v) / r.ventasNetas) * 100).toFixed(1)}%` : '0.0%');
    const puntoEq = (r.margenPct > 0 && r.opexTotal > 0) ? Math.round(r.opexTotal / (r.margenPct / 100)) : 0;
    const ticketProm = r.cantOps > 0 ? Math.round(r.ventasNetas / r.cantOps) : 0;

    let y = 33;
    y = dibujarKpiStripPdfFin(doc, y, [
        { label: 'VENTAS NETAS MES', val: formatearArsFin(r.ventasNetas), sub: `${r.cantOps} tickets emitidos` },
        { label: 'UTILIDAD BRUTA', val: formatearArsFin(r.margenBruto), sub: `Margen: ${r.margenPct.toFixed(1)}%`, color: [4, 120, 87] },
        { label: 'EBITDA OPERATIVO', val: formatearArsFin(r.ebitda), sub: `${pctV(r.ebitda)} sobre ventas`, color: r.ebitda >= 0 ? [4, 120, 87] : [185, 28, 28] },
        { label: 'UTILIDAD NETA FINAL', val: formatearArsFin(r.utilidadNeta), sub: `${pctV(r.utilidadNeta)} neto`, color: r.utilidadNeta >= 0 ? [4, 120, 87] : [185, 28, 28] }
    ]);

    y += 3;
    doc.setFillColor(15, 23, 42);
    doc.rect(14, y, 182, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(255, 255, 255);
    doc.text('ESTRUCTURA P&L (ESTADO DE RESULTADOS)', 16.5, y + 4.8);
    doc.text('MONTO (ARS)', 160, y + 4.8, { align: 'right' });
    doc.text('% VENTAS', 193, y + 4.8, { align: 'right' });

    const filasPnl = [
        { k: 'Ingresos Operativos (Ventas Netas)', v: formatearArsFin(r.ventasNetas), p: '100.0%', bold: true },
        { k: '(-) Costo de Mercadería Vendida (CMV)', v: `-${formatearArsFin(r.cmv)}`, p: pctV(r.cmv), red: true },
        { k: '(=) UTILIDAD BRUTA', v: formatearArsFin(r.margenBruto), p: `${r.margenPct.toFixed(1)}%`, bold: true, hl: true }
    ];

    const opexEntries = Object.entries(r.opexCatMap).sort((a, b) => b[1] - a[1]);
    if (opexEntries.length === 0) {
        filasPnl.push({ k: '(-) Gastos Operativos (OPEX)', v: '$0', p: '0.0%' });
    } else {
        opexEntries.forEach(([cat, mon]) => {
            filasPnl.push({ k: `(-) ${cat}`, v: `-${formatearArsFin(mon)}`, p: pctV(mon), red: true });
        });
    }

    filasPnl.push(
        { k: '(=) RESULTADO OPERATIVO (EBITDA)', v: formatearArsFin(r.ebitda), p: pctV(r.ebitda), bold: true, sub: true },
        { k: '(-) Impuestos, Monotributo y Tasas', v: `-${formatearArsFin(r.impuestos)}`, p: pctV(r.impuestos), red: true },
        { k: '(=) UTILIDAD NETA DEL MES', v: formatearArsFin(r.utilidadNeta), p: pctV(r.utilidadNeta), bold: true, final: true }
    );

    y += 12;
    filasPnl.forEach((f, idx) => {
        if (f.final) {
            doc.setFillColor(r.utilidadNeta >= 0 ? 4 : 185, r.utilidadNeta >= 0 ? 120 : 28, r.utilidadNeta >= 0 ? 87 : 28);
            doc.rect(14, y - 4.4, 182, 7.6, 'F');
            doc.setTextColor(255, 255, 255);
        } else if (f.hl) {
            doc.setFillColor(236, 253, 245);
            doc.rect(14, y - 4.4, 182, 7.2, 'F');
            doc.setTextColor(6, 95, 70);
        } else if (f.sub) {
            doc.setFillColor(241, 245, 249);
            doc.rect(14, y - 4.4, 182, 7.2, 'F');
            doc.setTextColor(15, 23, 42);
        } else {
            if (idx % 2 === 1) { doc.setFillColor(248, 250, 252); doc.rect(14, y - 4.4, 182, 6.8, 'F'); }
            doc.setTextColor(f.red ? 185 : 30, f.red ? 28 : 41, f.red ? 28 : 59);
        }

        doc.setFont('helvetica', f.bold ? 'bold' : 'normal');
        doc.setFontSize(f.final ? 9 : 8.2);
        doc.text(f.k, 16.5, y);
        doc.text(f.v, 160, y, { align: 'right' });
        doc.text(f.p, 193, y, { align: 'right' });
        y += f.final ? 9 : 7;
    });

    y += 4;
    if (y > 225) { doc.addPage(); y = 18; }
    doc.setFillColor(15, 23, 42);
    doc.rect(14, y, 182, 6.8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('VENTAS POR CATEGORÍA DE PRODUCTO', 16.5, y + 4.6);
    doc.text('VENTA (ARS)', 160, y + 4.6, { align: 'right' });
    doc.text('% PART.', 193, y + 4.6, { align: 'right' });
    y += 11.5;

    const catsArr = Object.entries(r.catMap).sort((a, b) => b[1] - a[1]);
    if (catsArr.length === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('Sin ventas registradas en este mes.', 16.5, y);
        y += 8;
    } else {
        catsArr.forEach(([cat, mon], idx) => {
            if (idx % 2 === 1) { doc.setFillColor(248, 250, 252); doc.rect(14, y - 4, 182, 6.4, 'F'); }
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(15, 23, 42);
            doc.text(cat, 16.5, y);
            doc.text(formatearArsFin(mon), 160, y, { align: 'right' });
            doc.text(pctV(mon), 193, y, { align: 'right' });
            y += 6.4;
        });
    }

    y += 5;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(14, y, 182, 23, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(15, 23, 42);
    doc.text('INDICADORES CLAVE DE SALUD FINANCIERA', 18, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(`• Punto de Equilibrio (Break-Even) del Mes: ${puntoEq > 0 ? formatearArsFin(puntoEq) : 'Sin gastos fijos cargados'}`, 18, y + 12.2);
    doc.text(`• Ticket Promedio Mensual: ${formatearArsFin(ticketProm)}   |   Equivalencia Utilidad Neta: ${formatearUsdFin(r.utilidadNeta, r.cfg.dolarHoy)}`, 18, y + 18.2);

    agregarPiesPaginaPdfFin(doc);
    doc.save(`estado-resultados-pnl-${anioNum}-${String(mesNum).padStart(2, '0')}.pdf`);
}

function generarPdfReporteAnual() {
    const jsPDFCtor = window.jspdf?.jsPDF;
    if (!jsPDFCtor) { alert('No se cargó jsPDF.'); return; }

    const anio = parseInt(document.getElementById('fin-pdf-anio-sel')?.value, 10) || new Date().getFullYear();
    const mesesNom = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const filasMes = [];
    let totVentas = 0, totCmv = 0, totMargen = 0, totOpex = 0, totNeto = 0;
    let prevVentas = 0;

    for (let m = 0; m < 12; m++) {
        const dIni = new Date(anio, m, 1, 0, 0, 0).getTime();
        const dFin = new Date(anio, m + 1, 0, 23, 59, 59, 999).getTime();
        const r = calcularResumenRangoPdfFin(dIni, dFin, null);
        let crecTxt = '—';
        if (prevVentas > 0 && r.ventasNetas > 0) {
            const p = ((r.ventasNetas - prevVentas) / prevVentas) * 100;
            crecTxt = `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;
        }
        if (r.ventasNetas > 0) prevVentas = r.ventasNetas;

        filasMes.push({ mes: mesesNom[m], crecTxt, ...r });
        totVentas += r.ventasNetas;
        totCmv += r.cmv;
        totMargen += r.margenBruto;
        totOpex += r.opexTotal;
        totNeto += r.utilidadNeta;
    }

    const margenAnualPct = totVentas > 0 ? ((totMargen / totVentas) * 100).toFixed(1) : '0.0';
    const doc = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: 'a4' });

    dibujarHeaderPdfFin(doc, `RESUMEN FINANCIERO ANUAL — EVOLUCIÓN ${anio}`, `Ejercicio Fiscal ${anio} (Consolidado Enero a Diciembre)`);

    let y = 33;
    y = dibujarKpiStripPdfFin(doc, y, [
        { label: `VENTAS ACUMULADAS ${anio}`, val: formatearArsFin(totVentas), sub: '12 meses consolidados' },
        { label: 'MARGEN BRUTO ANUAL', val: formatearArsFin(totMargen), sub: `Promedio: ${margenAnualPct}%`, color: [4, 120, 87] },
        { label: 'GASTOS OPEX ANUALES', val: formatearArsFin(totOpex), sub: 'Egresos operativos', color: [185, 28, 28] },
        { label: 'RESULTADO NETO ANUAL', val: formatearArsFin(totNeto), sub: formatearUsdFin(totNeto, obtenerConfigFinanzas().dolarHoy), color: totNeto >= 0 ? [4, 120, 87] : [185, 28, 28] }
    ]);

    y += 4;
    doc.setFillColor(15, 23, 42);
    doc.rect(14, y, 182, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(255, 255, 255);
    doc.text('MES', 16, y + 4.8);
    doc.text('VENTAS NETAS', 65, y + 4.8, { align: 'right' });
    doc.text('COSTO (CMV)', 94, y + 4.8, { align: 'right' });
    doc.text('MARGEN ($)', 122, y + 4.8, { align: 'right' });
    doc.text('M. %', 136, y + 4.8, { align: 'right' });
    doc.text('OPEX', 158, y + 4.8, { align: 'right' });
    doc.text('RESULTADO', 181, y + 4.8, { align: 'right' });
    doc.text('CREC.', 195, y + 4.8, { align: 'right' });

    y += 12;
    filasMes.forEach((f, idx) => {
        if (idx % 2 === 1) {
            doc.setFillColor(248, 250, 252);
            doc.rect(14, y - 4.2, 182, 7.2, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.8);
        doc.setTextColor(15, 23, 42);
        doc.text(f.mes, 16, y);
        doc.text(formatearArsFin(f.ventasNetas), 65, y, { align: 'right' });
        doc.text(formatearArsFin(f.cmv), 94, y, { align: 'right' });
        doc.text(formatearArsFin(f.margenBruto), 122, y, { align: 'right' });
        doc.text(`${f.margenPct.toFixed(1)}%`, 136, y, { align: 'right' });
        doc.setTextColor(185, 28, 28);
        doc.text(formatearArsFin(f.opexTotal), 158, y, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(f.utilidadNeta >= 0 ? 4 : 185, f.utilidadNeta >= 0 ? 120 : 28, f.utilidadNeta >= 0 ? 87 : 28);
        doc.text(formatearArsFin(f.utilidadNeta), 181, y, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(f.crecTxt, 195, y, { align: 'right' });
        y += 7.2;
    });

    doc.setFillColor(236, 253, 245);
    doc.rect(14, y - 4.2, 182, 8.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.1);
    doc.setTextColor(6, 95, 70);
    doc.text(`ACUMULADO ${anio}`, 16, y + 0.6);
    doc.text(formatearArsFin(totVentas), 65, y + 0.6, { align: 'right' });
    doc.text(formatearArsFin(totCmv), 94, y + 0.6, { align: 'right' });
    doc.text(formatearArsFin(totMargen), 122, y + 0.6, { align: 'right' });
    doc.text(`${margenAnualPct}%`, 136, y + 0.6, { align: 'right' });
    doc.text(formatearArsFin(totOpex), 158, y + 0.6, { align: 'right' });
    doc.text(formatearArsFin(totNeto), 181, y + 0.6, { align: 'right' });
    doc.text('100%', 195, y + 0.6, { align: 'right' });

    agregarPiesPaginaPdfFin(doc);
    doc.save(`resumen-anual-${anio}.pdf`);
}

/* ==========================================================================
   ETAPA 5: HERRAMIENTAS MAYORISTAS (PRECIOS POR LOTE, REDONDEO Y .CATBAK)
   ========================================================================== */
const STORAGE_KEY_PRECIOS_UNDO = 'cat_alogo_precios_undo_v1';
let finHerrEventosRegistrados = false;

function aplicarReglaRedondeoFin(valor, regla) {
    const num = Math.max(0, Number(valor) || 0);
    if (num <= 0) return 0;

    switch (regla) {
        case 'entero':
            return Math.round(num);
        case 'mult100':
            return Math.max(100, Math.round(num / 100) * 100);
        case 'mult50':
            return Math.max(50, Math.round(num / 50) * 50);
        case 'mult10':
            return Math.max(10, Math.round(num / 10) * 10);
        case 'mult5':
            return Math.max(5, Math.round(num / 5) * 5);
        case '99':
            return Math.round((Math.floor(num) + 0.99) * 100) / 100;
        case '90':
            return Math.round((Math.floor(num) + 0.90) * 100) / 100;
        case 'none':
        default:
            return Math.round(num * 100) / 100;
    }
}

function calcularNuevoPrecioLoteFin(precioActual, modo, valor, regla) {
    const base = Math.max(0, Number(precioActual) || 0);
    if (base <= 0) return 0;

    let calculado = base;
    if (modo === 'pct') {
        calculado = base * (1 + (valor / 100));
    } else if (modo === 'fijo') {
        calculado = base + valor;
    }

    if (calculado < 0) calculado = 0;
    return aplicarReglaRedondeoFin(calculado, regla);
}

function abrirModalHerramientasMayoristas() {
    const modal = document.getElementById('modal-fin-herramientas');
    if (!modal) return;

    poblarCategoriasLotePrecios();
    actualizarBannerDeshacerLote();
    renderizarVistaPreviaLotePrecios();
    renderizarResumenBovedaCatbak();

    if (!finHerrEventosRegistrados) {
        const cerrar = () => modal.classList.remove('active');
        document.getElementById('btn-cerrar-modal-fin-herr')?.addEventListener('click', cerrar);
        document.getElementById('btn-cancelar-modal-fin-herr')?.addEventListener('click', cerrar);
        document.getElementById('btn-cerrar-modal-fin-bak')?.addEventListener('click', cerrar);
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'modal-fin-herramientas') cerrar();
        });

        document.querySelectorAll('.fin-htab').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.getAttribute('data-htab');
                document.querySelectorAll('.fin-htab').forEach(b => b.classList.toggle('active', b === btn));
                document.querySelectorAll('.fin-herr-view').forEach(v => v.classList.remove('active'));
                document.getElementById(`fin-herr-view-${tab}`)?.classList.add('active');
                if (tab === 'backup') renderizarResumenBovedaCatbak();
            });
        });

        ['fin-lote-cat', 'fin-lote-redondeo', 'fin-lote-modo', 'fin-lote-valor'].forEach(id => {
            const el = document.getElementById(id);
            el?.addEventListener('input', renderizarVistaPreviaLotePrecios);
            el?.addEventListener('change', renderizarVistaPreviaLotePrecios);
        });

        document.getElementById('fin-lote-modo')?.addEventListener('change', (e) => {
            const modo = e.target.value;
            const wrap = document.getElementById('fin-lote-valor-wrap');
            const lbl = document.getElementById('fin-lote-valor-lbl');
            if (wrap) wrap.style.display = modo === 'solo_redondeo' ? 'none' : 'flex';
            if (lbl) lbl.textContent = modo === 'fijo' ? 'Monto fijo a sumar/restar ($ ARS)' : 'Porcentaje de ajuste (%)';
        });

        document.getElementById('btn-fin-aplicar-lote')?.addEventListener('click', aplicarActualizacionMasivaPrecios);
        document.getElementById('btn-fin-deshacer-lote')?.addEventListener('click', deshacerUltimoLotePrecios);

        document.getElementById('btn-fin-exportar-catbak')?.addEventListener('click', exportarRespaldoCatbak);
        document.getElementById('btn-fin-restaurar-catbak')?.addEventListener('click', () => {
            document.getElementById('fin-inp-restaurar-catbak')?.click();
        });
        document.getElementById('fin-inp-restaurar-catbak')?.addEventListener('change', importarRespaldoCatbak);

        finHerrEventosRegistrados = true;
    }

    modal.classList.add('active');
}

function poblarCategoriasLotePrecios() {
    const sel = document.getElementById('fin-lote-cat');
    if (!sel) return;

    const productos = leerArrayLocalFin('cat_alogo_productos_v1');
    const cats = [...new Set(productos.map(p => (p.categoria || 'General').trim() || 'General'))]
        .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

    let html = `<option value="todas">Todo el catálogo completo (${productos.length} productos)</option>`;
    cats.forEach(cat => {
        const cant = productos.filter(p => ((p.categoria || 'General').trim() || 'General') === cat).length;
        html += `<option value="${escaparHtmlFin(cat)}">${escaparHtmlFin(cat)} (${cant})</option>`;
    });
    sel.innerHTML = html;
}

function actualizarBannerDeshacerLote() {
    const banner = document.getElementById('fin-precios-undo-banner');
    const meta = document.getElementById('fin-precios-undo-meta');
    if (!banner || !meta) return;

    let snap = null;
    try {
        snap = JSON.parse(localStorage.getItem(STORAGE_KEY_PRECIOS_UNDO) || 'null');
    } catch {
        snap = null;
    }

    if (snap && Array.isArray(snap.productos)) {
        banner.style.display = 'flex';
        const fTxt = new Date(snap.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        meta.textContent = `${snap.descripcion || 'Ajuste masivo'} • Guardado el ${fTxt}`;
    } else {
        banner.style.display = 'none';
    }
}

function renderizarVistaPreviaLotePrecios() {
    const tbody = document.getElementById('fin-lote-preview-tbody');
    const pill = document.getElementById('fin-lote-count-pill');
    if (!tbody) return;

    const catSel = document.getElementById('fin-lote-cat')?.value || 'todas';
    const modo = document.getElementById('fin-lote-modo')?.value || 'pct';
    const valor = parseFloat(document.getElementById('fin-lote-valor')?.value) || 0;
    const regla = document.getElementById('fin-lote-redondeo')?.value || 'entero';

    const productos = leerArrayLocalFin('cat_alogo_productos_v1');
    const alcanzados = productos.filter(p => {
        if (catSel === 'todas') return true;
        return ((p.categoria || 'General').trim() || 'General') === catSel;
    });

    if (pill) {
        pill.textContent = `${alcanzados.length} ${alcanzados.length === 1 ? 'producto alcanzado' : 'productos alcanzados'}`;
    }

    if (alcanzados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.25rem; color:#64748b;">No hay productos en esta categoría.</td></tr>`;
        return;
    }

    const muestra = alcanzados.slice(0, 6);
    tbody.innerHTML = muestra.map(p => {
        const actual = Number(p.precioNormal) || 0;
        const nuevo = calcularNuevoPrecioLoteFin(actual, modo, valor, regla);
        const diff = Math.round((nuevo - actual) * 100) / 100;
        const diffClase = diff > 0 ? 'text-emerald' : (diff < 0 ? 'text-danger' : '');

        return `
            <tr>
                <td>
                    <strong>${escaparHtmlFin(p.nombre)}</strong>
                    <div style="font-size:0.68rem; color:#64748b;">${escaparHtmlFin(p.categoria || 'General')}</div>
                </td>
                <td style="text-align:right;">${formatearArsFin(actual)}</td>
                <td style="text-align:center; color:#94a3b8;">→</td>
                <td style="text-align:right; font-weight:800;">${formatearArsFin(nuevo)}</td>
                <td style="text-align:right; font-weight:700;" class="${diffClase}">
                    ${diff > 0 ? '+' : (diff < 0 ? '-' : '')}${formatearArsFin(Math.abs(diff))}
                </td>
            </tr>
        `;
    }).join('');
}

function aplicarActualizacionMasivaPrecios() {
    const catSel = document.getElementById('fin-lote-cat')?.value || 'todas';
    const modo = document.getElementById('fin-lote-modo')?.value || 'pct';
    const valor = parseFloat(document.getElementById('fin-lote-valor')?.value) || 0;
    const regla = document.getElementById('fin-lote-redondeo')?.value || 'entero';
    const ajustarCosto = !!document.getElementById('fin-lote-chk-costo')?.checked;
    const ajustarOfertaVar = !!document.getElementById('fin-lote-chk-oferta')?.checked;

    const productos = leerArrayLocalFin('cat_alogo_productos_v1');
    const alcanzados = productos.filter(p => catSel === 'todas' || ((p.categoria || 'General').trim() || 'General') === catSel);

    if (alcanzados.length === 0) {
        alert('No hay productos para actualizar.');
        return;
    }

    const descAjuste = modo === 'solo_redondeo'
        ? `Redondeo (${regla})`
        : (modo === 'fijo' ? `${valor >= 0 ? '+' : ''}${formatearArsFin(valor)} fijo` : `${valor >= 0 ? '+' : ''}${valor}%`);

    const ok = confirm(
        `🏷️ ¿Aplicar "${descAjuste}" con redondeo "${regla}" sobre ${alcanzados.length} producto(s) (${catSel === 'todas' ? 'Todo el catálogo' : catSel})?\n\n` +
        `Se guardará automáticamente una copia de seguridad para deshacer en 1 clic si lo necesitas.`
    );
    if (!ok) return;

    localStorage.setItem(STORAGE_KEY_PRECIOS_UNDO, JSON.stringify({
        fecha: new Date().toISOString(),
        descripcion: `${descAjuste} en ${catSel === 'todas' ? 'Todo el catálogo' : catSel} (${alcanzados.length} prod.)`,
        productos: JSON.parse(JSON.stringify(productos))
    }));

    const ahoraIso = new Date().toISOString();
    productos.forEach(p => {
        if (catSel !== 'todas' && ((p.categoria || 'General').trim() || 'General') !== catSel) return;

        p.precioNormal = calcularNuevoPrecioLoteFin(p.precioNormal, modo, valor, regla);

        if (ajustarCosto && (Number(p.precioCosto) || 0) > 0) {
            p.precioCosto = calcularNuevoPrecioLoteFin(p.precioCosto, modo, valor, regla);
        }

        if (ajustarOfertaVar) {
            if ((Number(p.precioOferta) || 0) > 0) {
                p.precioOferta = calcularNuevoPrecioLoteFin(p.precioOferta, modo, valor, regla);
            }
            if (Array.isArray(p.variantesDetalle)) {
                p.variantesDetalle.forEach(v => {
                    if ((Number(v.precio) || 0) > 0) {
                        v.precio = calcularNuevoPrecioLoteFin(v.precio, modo, valor, regla);
                    }
                });
            }
        }
        p.actualizadoEn = ahoraIso;
    });

    window.bovedaProductos = productos;
    localStorage.setItem('cat_alogo_productos_v1', JSON.stringify(productos));

    actualizarBannerDeshacerLote();
    renderizarVistaPreviaLotePrecios();
    renderizarTodoFinanzas();
    alert(`✅ Precios actualizados en ${alcanzados.length} producto(s). Ya están reflejados en Inventario y Punto de Venta.`);
}

function deshacerUltimoLotePrecios() {
    let snap = null;
    try {
        snap = JSON.parse(localStorage.getItem(STORAGE_KEY_PRECIOS_UNDO) || 'null');
    } catch {
        snap = null;
    }

    if (!snap || !Array.isArray(snap.productos)) {
        alert('No hay ningún lote anterior disponible para deshacer.');
        return;
    }

    if (!confirm(`↩️ ¿Revertir el catálogo al estado previo a "${snap.descripcion}"?`)) return;

    window.bovedaProductos = snap.productos;
    localStorage.setItem('cat_alogo_productos_v1', JSON.stringify(snap.productos));
    localStorage.removeItem(STORAGE_KEY_PRECIOS_UNDO);

    actualizarBannerDeshacerLote();
    renderizarVistaPreviaLotePrecios();
    renderizarTodoFinanzas();
    alert('✅ Precios restaurados exactamente como estaban antes del último ajuste masivo.');
}

/* ==========================================================================
   ETAPA 5B: RESPALDO Y RESTAURACIÓN DE BÓVEDA LOCAL (.CATBAK)
   ========================================================================== */
function recopilarBovedaCompletaCatbak() {
    const payload = {};
    let bytesTotales = 0;

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('cat_alogo_')) continue;
        const raw = localStorage.getItem(key);
        bytesTotales += (raw || '').length;
        try {
            payload[key] = JSON.parse(raw);
        } catch {
            payload[key] = raw;
        }
    }

    return { payload, bytesTotales };
}

function renderizarResumenBovedaCatbak() {
    const cont = document.getElementById('fin-bak-stats');
    if (!cont) return;

    const prods = leerArrayLocalFin('cat_alogo_productos_v1').length;
    const ventas = leerArrayLocalFin('cat_alogo_pos_ventas_v1').length;
    const clientes = leerArrayLocalFin('cat_alogo_clientes_v1').length;
    const { bytesTotales } = recopilarBovedaCompletaCatbak();
    const kb = Math.max(1, Math.round(bytesTotales / 1024));

    cont.innerHTML = `
        <div class="fin-bak-stat-pill"><span>PRODUCTOS</span><strong>${prods}</strong></div>
        <div class="fin-bak-stat-pill"><span>VENTAS POS</span><strong>${ventas}</strong></div>
        <div class="fin-bak-stat-pill"><span>CLIENTES</span><strong>${clientes}</strong></div>
        <div class="fin-bak-stat-pill"><span>TAMAÑO BÓVEDA</span><strong>${kb} KB</strong></div>
    `;
}

function exportarRespaldoCatbak() {
    const { payload } = recopilarBovedaCompletaCatbak();
    const backupObj = {
        formato: 'CAT_ALOGO_BOVEDA_BACKUP',
        version: '3.0',
        comercio: obtenerNombreComercioFin(),
        exportadoEn: new Date().toISOString(),
        totalClaves: Object.keys(payload).length,
        datos: payload
    };

    const jsonStr = JSON.stringify(backupObj, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const fechaSlug = new Date().toISOString().slice(0, 10);

    const a = document.createElement('a');
    a.href = url;
    a.download = `respaldo-cat-alogo-${fechaSlug}.catbak`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);

    alert(`☁️ Respaldo descargado ("respaldo-cat-alogo-${fechaSlug}.catbak") con ${backupObj.totalClaves} colecciones.\nSúbelo a tu Google Drive privado para mantener tus datos protegidos.`);
}

function importarRespaldoCatbak(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;

    const lector = new FileReader();
    lector.onload = (ev) => {
        try {
            const parsed = JSON.parse(String(ev.target.result || ''));
            if (!parsed || parsed.formato !== 'CAT_ALOGO_BOVEDA_BACKUP' || typeof parsed.datos !== 'object') {
                alert('❌ El archivo seleccionado no tiene un formato .catbak válido de Cat-Alogo.');
                return;
            }

            const claves = Object.keys(parsed.datos).filter(k => k.startsWith('cat_alogo_'));
            if (claves.length === 0) {
                alert('❌ El respaldo no contiene colecciones válidas.');
                return;
            }

            const fTxt = parsed.exportadoEn ? new Date(parsed.exportadoEn).toLocaleString('es-AR') : 'desconocida';
            const ok = confirm(
                `♻️ ¿Restaurar la Bóveda Local desde "${archivo.name}"?\n\n` +
                `• Comercio: ${parsed.comercio || 'Cat-Alogo'}\n` +
                `• Fecha del respaldo: ${fTxt}\n` +
                `• Colecciones incluidas: ${claves.length}\n\n` +
                `Esta acción reemplazará los datos actuales de este navegador.`
            );
            if (!ok) return;

            claves.forEach(k => {
                const val = parsed.datos[k];
                localStorage.setItem(k, typeof val === 'string' ? val : JSON.stringify(val));
            });

            window.bovedaProductos = leerArrayLocalFin('cat_alogo_productos_v1');
            window.bovedaClientes = leerArrayLocalFin('cat_alogo_clientes_v1');

            alert('✅ Bóveda Local restaurada con éxito. Se recargará la aplicación para sincronizar todos los módulos.');
            window.location.reload();
        } catch (err) {
            console.error(err);
            alert('❌ Error al leer el archivo .catbak. Verifica que no esté dañado.');
        }
    };
    lector.readAsText(archivo);
}

/* ==========================================================================
   PARIDAD APP -> WEB: TICKETS POS/CAT-WEB, SALDO NETO, PROVEEDORES Y RUNWAY
   ========================================================================== */
const STORAGE_KEY_CATWEB_PEDIDOS = 'cat_alogo_catweb_pedidos_v1';
let finParidadEventosInit = false;
let finTicketActivoObj = null;

if (!window.finanzasState.opsFiltroCanal) {
    window.finanzasState.opsFiltroCanal = 'todos';
}

function obtenerVentasWebNormalizadasFin() {
    const crudos = leerArrayLocalFin(STORAGE_KEY_CATWEB_PEDIDOS);
    return crudos
        .filter(p => p && p.estado !== 'pendiente' && p.estado !== 'cancelado')
        .map(p => ({
            id: p.id || ('web-' + Date.now()),
            canal: 'web',
            numeroTicket: p.numeroPedido || p.codigo || `WEB-${String(p.id || '').slice(-4)}`,
            fecha: p.fecha || new Date().toISOString(),
            turnoId: p.turnoId || null,
            operador: p.operador || 'Cat-Web',
            clienteNombre: p.clienteNombre || p.cliente || 'Cliente Web',
            clienteTelefono: p.clienteTelefono || p.telefono || '',
            items: Array.isArray(p.items) ? p.items : [],
            subtotal: Number(p.subtotal) || Number(p.total) || 0,
            descuentoPct: Number(p.descuentoPct) || 0,
            descuentoMonto: Number(p.descuentoMonto) || 0,
            recargoPct: Number(p.recargoPct) || 0,
            recargoMonto: Number(p.recargoMonto) || 0,
            total: Number(p.total) || 0,
            pagos: Array.isArray(p.pagos) && p.pagos.length > 0
                ? p.pagos
                : [{ medio: p.medioPago || 'QR / Transferencia', monto: Number(p.total) || 0 }],
            estado: p.estado === 'anulada' ? 'anulada' : 'completada',
            nota: p.nota || 'Pedido Cat-Web'
        }));
}

function obtenerTodasVentasUnificadasFin() {
    const pos = leerArrayLocalFin('cat_alogo_pos_ventas_v1').map(v => ({
        ...v,
        canal: v.canal || 'pos'
    }));
    const web = obtenerVentasWebNormalizadasFin();
    return [...pos, ...web];
}

function calcularSaldoNetoMediosPeriodoFin(m) {
    const rango = m.rango;
    const enRango = (iso) => {
        const ts = new Date(iso).getTime();
        return !isNaN(ts) && ts >= rango.inicioTs && ts <= rango.finTs;
    };

    const mapa = {
        'Efectivo': { medio: 'Efectivo', icono: '💵', ingresos: 0, egresos: 0 },
        'Tarjeta Débito': { medio: 'Tarjeta Débito', icono: '💳', ingresos: 0, egresos: 0 },
        'Tarjeta Crédito': { medio: 'Tarjeta Crédito', icono: '💳', ingresos: 0, egresos: 0 },
        'QR / Transferencia': { medio: 'QR / Transferencia', icono: '📱', ingresos: 0, egresos: 0 },
        'Cuenta Corriente': { medio: 'Cuenta Corriente', icono: '📒', ingresos: 0, egresos: 0 }
    };

    const add = (medioRaw, tipo, monto) => {
        const val = Math.max(0, Number(monto) || 0);
        if (val <= 0) return;
        let k = String(medioRaw || 'Efectivo').trim();
        if (k === 'Transferencia' || k === 'Mercado Pago') k = 'QR / Transferencia';
        if (!mapa[k]) mapa[k] = { medio: k, icono: '💰', ingresos: 0, egresos: 0 };
        if (tipo === 'in') mapa[k].ingresos = Math.round((mapa[k].ingresos + val) * 100) / 100;
        else mapa[k].egresos = Math.round((mapa[k].egresos + val) * 100) / 100;
    };

    const ventas = obtenerTodasVentasUnificadasFin().filter(v => {
        if (v.estado === 'anulada') return false;
        if (rango.modo === 'turno') return rango.turno && (ventaPerteneceATurnoFin(v, rango.turno) || (v.canal === 'web' && enRango(v.fecha)));
        return enRango(v.fecha);
    });
    ventas.forEach(v => (v.pagos || []).forEach(pg => add(pg.medio, 'in', pg.monto)));

    leerArrayLocalFin('cat_alogo_clientes_v1').forEach(cli => {
        (cli.movimientos || []).forEach(mov => {
            if (mov.tipo === 'credito' && mov.medio !== 'Anulación POS' && enRango(mov.fecha)) {
                add(mov.medio, 'in', mov.monto);
                add('Cuenta Corriente', 'out', mov.monto);
            }
        });
    });

    obtenerMovimientosFinanzas().forEach(mov => {
        if (!enRango(mov.fecha)) return;
        add(mov.medio, mov.tipo === 'ingreso' ? 'in' : 'out', mov.monto);
    });

    const turnos = rango.modo === 'turno' ? (rango.turno ? [rango.turno] : []) : leerArrayLocalFin('cat_alogo_pos_turnos_v1');
    turnos.forEach(t => {
        (t.retiros || []).forEach(r => {
            if (rango.modo === 'turno' || enRango(r.fecha)) add('Efectivo', 'out', r.monto);
        });
    });

    leerArrayLocalFin('cat_alogo_cuentas_pagar_v1').forEach(cxp => {
        (cxp.pagos || []).forEach(pg => {
            if (enRango(pg.fecha || cxp.fecha)) add(pg.medio || cxp.medioPago, 'out', pg.monto);
        });
    });

    return Object.values(mapa)
        .filter(x => x.ingresos > 0 || x.egresos > 0 || x.medio === 'Efectivo')
        .map(x => ({ ...x, neto: Math.round((x.ingresos - x.egresos) * 100) / 100 }))
        .sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto));
}

function construirOperacionesEnriquecidasFin(m) {
    const rango = m.rango;
    const enRango = (iso) => {
        const ts = new Date(iso).getTime();
        return !isNaN(ts) && ts >= rango.inicioTs && ts <= rango.finTs;
    };

    const lista = [];

    const ventas = obtenerTodasVentasUnificadasFin().filter(v => {
        if (rango.modo === 'turno') return rango.turno && (ventaPerteneceATurnoFin(v, rango.turno) || (v.canal === 'web' && enRango(v.fecha)));
        return enRango(v.fecha);
    });

    ventas.forEach(v => {
        const { totalVenta, montoFiado, montoCobrado, esAnulada } = obtenerDesgloseFiadoVentaFin(v);
        const tieneFiado = montoFiado > 0;
        const soloFiado = tieneFiado && montoCobrado <= 0;

        let estadoTxt = 'PAGADO';
        let estadoClass = 'est-pagado';
        if (esAnulada) { estadoTxt = 'ANULADO'; estadoClass = 'est-anulado'; }
        else if (soloFiado) { estadoTxt = 'FIADO'; estadoClass = 'est-fiado'; }
        else if (tieneFiado) { estadoTxt = 'PARCIAL'; estadoClass = 'est-parcial'; }

        const mediosTxt = (v.pagos || []).map(p => p.medio).join(' + ') || 'Efectivo';
        const esWeb = v.canal === 'web';
        const esApp = !esWeb && (v.canal === 'app' || v.origen === 'app' || String(v.numeroTicket || '').startsWith('APP-'));

        lista.push({
            fecha: v.fecha,
            tipo: 'in',
            canal: esWeb ? 'web' : (esApp ? 'app' : 'pos'),
            origen: esWeb ? '🌐 Cat-Web' : (esApp ? '📱 Venta App' : '🏪 Venta POS'),
            estadoTxt,
            estadoClass,
            concepto: `${v.numeroTicket} • ${v.clienteNombre || 'Consumidor Final'}`,
            medio: mediosTxt,
            monto: montoCobrado,
            montoTotalVenta: totalVenta,
            montoFiado,
            ticketObj: v
        });
    });

    leerArrayLocalFin('cat_alogo_clientes_v1').forEach(cli => {
        (cli.movimientos || []).forEach(mov => {
            if (mov.tipo !== 'credito' || mov.medio === 'Anulación POS' || !enRango(mov.fecha)) return;
            lista.push({
                fecha: mov.fecha,
                tipo: 'in',
                canal: 'cobro',
                origen: 'Cobro Cta. Cte.',
                estadoTxt: 'PAGADO',
                estadoClass: 'est-pagado',
                concepto: `${cli.nombre} • ${mov.concepto || 'Abono'}`,
                medio: mov.medio || 'Efectivo',
                monto: Number(mov.monto) || 0,
                ticketObj: null
            });
        });
    });

    obtenerMovimientosFinanzas().forEach(mov => {
        if (!enRango(mov.fecha)) return;
        const esIng = mov.tipo === 'ingreso';
        lista.push({
            fecha: mov.fecha,
            tipo: esIng ? 'in' : 'out',
            canal: esIng ? 'ingreso' : 'egreso',
            origen: esIng ? 'Ingreso Manual' : 'Gasto OPEX',
            estadoTxt: 'PAGADO',
            estadoClass: 'est-pagado',
            concepto: `${mov.categoria || ''} • ${mov.concepto || ''}`,
            medio: mov.medio || 'Efectivo',
            monto: Number(mov.monto) || 0,
            ticketObj: null
        });
    });

    const turnos = rango.modo === 'turno' ? (rango.turno ? [rango.turno] : []) : leerArrayLocalFin('cat_alogo_pos_turnos_v1');
    turnos.forEach(t => {
        (t.retiros || []).forEach(r => {
            if (rango.modo !== 'turno' && !enRango(r.fecha)) return;
            lista.push({
                fecha: r.fecha,
                tipo: 'out',
                canal: 'egreso',
                origen: r.tipo || 'Retiro Caja',
                estadoTxt: 'PAGADO',
                estadoClass: 'est-pagado',
                concepto: `${r.motivo || 'Salida caja'} (Turno #${t.numero})`,
                medio: 'Efectivo',
                monto: Number(r.monto) || 0,
                ticketObj: null
            });
        });
    });

    leerArrayLocalFin('cat_alogo_cuentas_pagar_v1').forEach(cxp => {
        const esParcial = (Number(cxp.deudaPendiente) || 0) > 0;
        (cxp.pagos || []).forEach(pg => {
            if (!enRango(pg.fecha || cxp.fecha)) return;
            lista.push({
                fecha: pg.fecha || cxp.fecha,
                tipo: 'out',
                canal: 'egreso',
                origen: 'Proveedor',
                estadoTxt: esParcial ? 'PARCIAL' : 'PAGADO',
                estadoClass: esParcial ? 'est-parcial' : 'est-pagado',
                concepto: `${cxp.proveedorNombre} (${cxp.codigoOrden || 'OC'})`,
                medio: pg.medio || cxp.medioPago || 'Efectivo',
                monto: Number(pg.monto) || 0,
                ticketObj: null
            });
        });
    });

    lista.sort((a, b) => (new Date(b.fecha).getTime() || 0) - (new Date(a.fecha).getTime() || 0));
    return lista;
}

function descargarPdfTicket80mmDesdeFinanzas(venta) {
    if (!venta) return;
    if (typeof descargarPdfTicketVentaPos === 'function') {
        descargarPdfTicketVentaPos(venta, 80);
        return;
    }
    const jsPDFCtor = window.jspdf?.jsPDF;
    if (!jsPDFCtor) { alert('No se cargó jsPDF.'); return; }

    const comercio = obtenerNombreComercioFin().toUpperCase();
    const lineas = [
        `  ${comercio.slice(0, 34)}`,
        `  COMPROBANTE ${venta.numeroTicket || ''}`,
        '======================================',
        `Fecha: ${new Date(venta.fecha).toLocaleString('es-AR')}`,
        `Cliente: ${venta.clienteNombre || 'Consumidor Final'}`,
        '--------------------------------------'
    ];
    (venta.items || []).forEach(it => {
        const sub = Math.round((Number(it.cantidad) || 1) * (Number(it.precioUnit) || 0) * 100) / 100;
        lineas.push(`${String(it.nombre || '').slice(0, 36)}`);
        lineas.push(`  ${it.cantidad} x ${formatearArsFin(it.precioUnit)} = ${formatearArsFin(sub)}`);
    });
    lineas.push('======================================');
    lineas.push(`TOTAL: ${formatearArsFin(venta.total)} ARS`);
    lineas.push(`Medio: ${(venta.pagos || []).map(p => p.medio).join(' + ')}`);

    const doc = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: [80, Math.max(95, lineas.length * 4.5 + 14)] });
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.4);
    let y = 8;
    lineas.forEach(l => { doc.text(l, 4, y); y += 4.3; });
    doc.save(`ticket-${String(venta.numeroTicket || 'venta').toLowerCase()}-80mm.pdf`);
}

function reenviarTicketWhatsAppDesdeFinanzas(venta) {
    if (!venta) return;
    if (typeof enviarTicketVentaWhatsAppPos === 'function') {
        enviarTicketVentaWhatsAppPos(venta);
        return;
    }
    let msg = `🧾 *Comprobante ${venta.numeroTicket}* — *${obtenerNombreComercioFin()}*\n`;
    msg += `📅 ${new Date(venta.fecha).toLocaleString('es-AR')}\n\n`;
    (venta.items || []).forEach(it => {
        const sub = Math.round((Number(it.cantidad) || 1) * (Number(it.precioUnit) || 0) * 100) / 100;
        msg += `• ${it.nombre} (${it.cantidad} × ${formatearArsFin(it.precioUnit)}) — ${formatearArsFin(sub)}\n`;
    });
    msg += `\n*TOTAL: ${formatearArsFin(venta.total)} ARS*\n¡Muchas gracias por tu compra!`;
    const tel = String(venta.clienteTelefono || '').replace(/[^\d]/g, '');
    window.open(tel ? `https://wa.me/${tel}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
}

function aplicarMejorasParidadAppEnFinanzas(m) {
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

    const mediosNetos = calcularSaldoNetoMediosPeriodoFin(m);
    const sumaNetos = mediosNetos
        .filter(x => x.medio !== 'Cuenta Corriente')
        .reduce((a, x) => a + x.neto, 0);
    setTxt('fin-medios-total-badge', `Cobrado Neto: ${formatearArsFin(sumaNetos)}`);

    // NIVEL 1 (PC = APP): Mostrar Ingresos Totales Reales ($39.500) sin Ticket Promedio
    const todasOpsTemp = construirOperacionesEnriquecidasFin(m);
    const cantIngresosN1 = todasOpsTemp.filter(op => op.tipo === 'in' && (Number(op.monto) || 0) > 0).length;

    setTxt('lad-n1-val', formatearArsFin(m.ingresosEfectivos));
    setTxt('lad-n1-sub', `${cantIngresosN1} ${cantIngresosN1 === 1 ? 'ingreso' : 'ingresos'}`);
    setTxt('kpi-fin-ventas', formatearArsFin(m.ingresosEfectivos));
    setTxt('kpi-fin-tx', `${cantIngresosN1} ${cantIngresosN1 === 1 ? 'Ingreso registrado' : 'Ingresos registrados'}`);
    setTxt('kpi-fin-ticket-prom', `Ventas POS: ${formatearArsFin(m.ventasNetas)}`);

    const elN1Usd = document.getElementById('kpi-fin-ventas-usd');
    if (elN1Usd) {
        elN1Usd.style.display = m.cfg?.mostrarUsd ? 'inline-block' : 'none';
        if (m.cfg?.mostrarUsd) elN1Usd.textContent = formatearUsdFin(m.ingresosEfectivos, m.cfg.dolarHoy);
    }

    // Barra de medios de Nivel 1: coincide exacto con Ingresos Totales (Efvo + Dig/Tarj)
    const efvoIng = mediosNetos.find(x => x.medio === 'Efectivo')?.ingresos || 0;
    const digIng = mediosNetos
        .filter(x => x.medio !== 'Efectivo' && x.medio !== 'Cuenta Corriente')
        .reduce((a, x) => a + (Number(x.ingresos) || 0), 0);
    const fiadoTurno = mediosNetos.find(x => x.medio === 'Cuenta Corriente')?.ingresos || 0;
    const totalCobradoBarra = Math.max(1, efvoIng + digIng);

    const barM = document.getElementById('kpi-fin-medios-bar');
    if (barM) {
        barM.innerHTML = `
            <span class="bar-efvo" style="width:${Math.round((efvoIng / totalCobradoBarra) * 100)}%;"></span>
            <span class="bar-dig" style="width:${Math.round((digIng / totalCobradoBarra) * 100)}%;"></span>
        `;
    }
    const footM = document.getElementById('kpi-fin-medios-foot');
    if (footM) {
        footM.innerHTML = `<span>Efvo: ${formatearArsFin(efvoIng)}</span><span>Dig/Tarj: ${formatearArsFin(digIng)}</span><span>Fiado: ${formatearArsFin(fiadoTurno)}</span>`;
    }

    // Nivel 5: Saldo Neto por Medio de Pago (Cuenta Corriente muestra Recupero si cobró más de lo fiado)
    const mediosCont = document.getElementById('fin-medios-list');
    if (mediosCont) {
        mediosCont.innerHTML = mediosNetos.map(item => {
            const esCtaCte = item.medio === 'Cuenta Corriente';
            const esRecupero = esCtaCte && item.neto < 0;
            const lblNeto = esCtaCte ? (esRecupero ? 'Recupero:' : 'Pendiente:') : 'Neto:';
            const lblIn = esCtaCte ? 'Fiado:' : 'I:';
            const lblOut = esCtaCte ? 'Cobrado:' : 'E:';
            const claseNeto = esCtaCte
                ? (item.neto > 0 ? 'text-danger' : 'text-emerald')
                : (item.neto >= 0 ? 'text-emerald' : 'text-danger');
            const valorMostrar = esRecupero
                ? `+${formatearArsFin(Math.abs(item.neto))}`
                : `${item.neto < 0 ? '-' : ''}${formatearArsFin(Math.abs(item.neto))}`;

            return `
            <div class="fin-medio-net-card">
                <div class="fin-medio-net-top">
                    <strong>${item.icono} ${escaparHtmlFin(item.medio)}</strong>
                    <strong class="${claseNeto}" style="font-size:0.95rem;">
                        ${lblNeto} ${valorMostrar}
                    </strong>
                </div>
                <div class="fin-medio-net-ie">
                    <span class="${esCtaCte ? 'text-danger' : 'text-emerald'}">${lblIn} +${formatearArsFin(item.ingresos)}</span>
                    <span class="${esCtaCte ? 'text-emerald' : 'text-danger'}">${lblOut} -${formatearArsFin(item.egresos)}</span>
                </div>
            </div>
            `;
        }).join('');
    }

    const totIE = Math.max(0.01, m.ingresosEfectivos + m.egresosTotales);
    const pctIn = (m.ingresosEfectivos + m.egresosTotales) > 0 ? Math.round((m.ingresosEfectivos / totIE) * 100) : 0;
    const pctOut = (m.ingresosEfectivos + m.egresosTotales) > 0 ? Math.max(0, 100 - pctIn) : 0;

    setTxt('fin-bal-ing-lbl', `Ingresos (${pctIn}%) • ${formatearArsFin(m.ingresosEfectivos)}`);
    setTxt('fin-bal-egr-lbl', `Egresos (${pctOut}%) • ${formatearArsFin(m.egresosTotales)}`);
    const bIn = document.getElementById('fin-bal-bar-in');
    const bOut = document.getElementById('fin-bal-bar-out');
    if (bIn) bIn.style.width = `${pctIn || (pctOut ? 0 : 50)}%`;
    if (bOut) bOut.style.width = `${pctOut || (pctIn ? 0 : 50)}%`;

    const todasOps = construirOperacionesEnriquecidasFin(m);
    window._finOpsCache = todasOps;
    const filtro = window.finanzasState.opsFiltroCanal || 'todos';
    const opsVisibles = todasOps.filter(op => {
        if (filtro === 'pos') return op.canal === 'pos' || op.canal === 'app';
        if (filtro === 'web') return op.canal === 'web';
        if (filtro === 'egresos') return op.tipo === 'out';
        return true;
    });

    setTxt('fin-ops-count-badge', `${opsVisibles.length} / ${todasOps.length} registros`);
    const opsTbody = document.getElementById('fin-ops-tbody');
    if (opsTbody) {
        if (opsVisibles.length === 0) {
            opsTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.6rem; color:#64748b;">No hay registros para este filtro en el período actual.</td></tr>`;
        } else {
            opsTbody.innerHTML = opsVisibles.slice(0, 45).map(op => {
                const idxGlobal = todasOps.indexOf(op);
                const fTxt = new Date(op.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                const esIn = op.tipo === 'in';
                const btnTicket = op.ticketObj
                    ? `<button type="button" class="fin-ticket-pill-btn btn-fin-ver-ticket" data-op-idx="${idxGlobal}">🧾 Ticket</button>`
                    : '';
                const detalleFiadoHtml = (op.montoFiado > 0)
                    ? `<div style="font-size:0.68rem; font-weight:600; color:#64748b;">Total ${formatearArsFin(op.montoTotalVenta)} • Fiado ${formatearArsFin(op.montoFiado)}</div>`
                    : '';

                return `
                    <tr>
                        <td style="white-space:nowrap;">${fTxt}</td>
                        <td>
                            <span class="fin-type-tag ${esIn ? 'in' : 'out'}">${escaparHtmlFin(op.origen)}</span>
                            <div><span class="fin-est-pill ${op.estadoClass}">${op.estadoTxt}</span></div>
                        </td>
                        <td>
                            <strong>${escaparHtmlFin(op.concepto)}</strong>${btnTicket}
                        </td>
                        <td>${escaparHtmlFin(op.medio)}</td>
                        <td style="text-align:right; font-weight:800;" class="${esIn ? 'text-emerald' : 'text-danger'}">
                            ${esIn ? '+' : '-'}${formatearArsFin(op.monto)}
                            ${detalleFiadoHtml}
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    const topCatBox = document.getElementById('fin-opex-top-cat');
    const topCatVal = document.getElementById('fin-opex-top-cat-val');
    if (topCatBox && topCatVal) {
        if (m.desgloseOpex && m.desgloseOpex.length > 0) {
            const top = m.desgloseOpex[0];
            topCatBox.style.display = 'flex';
            topCatVal.textContent = `${top.categoria} — ${formatearArsFin(top.monto)} (${top.pctOpex}%)`;
        } else {
            topCatBox.style.display = 'none';
        }
    }

    const todasCxp = leerArrayLocalFin('cat_alogo_cuentas_pagar_v1');
    const pedidosStock = leerArrayLocalFin('cat_alogo_pedidos_v1');
    const enRango = (iso) => {
        const ts = new Date(iso).getTime();
        return !isNaN(ts) && ts >= m.rango.inicioTs && ts <= m.rango.finTs;
    };

    let pagosProvPeriodo = 0;
    let pagosMerc = 0;
    let pagosFlete = 0;

    todasCxp.forEach(cxp => {
        const ped = pedidosStock.find(p => p.id === cxp.pedidoId || p.codigo === cxp.codigoOrden);
        const fleteOrig = Number(cxp.costoEnvio ?? ped?.pagoInfo?.costoEnvio ?? ped?.costoEnvio ?? 0) || 0;
        const totOrig = Math.max(1, Number(cxp.totalGeneral) || 1);
        const propFlete = Math.min(1, Math.max(0, fleteOrig / totOrig));

        (cxp.pagos || []).forEach(pg => {
            if (!enRango(pg.fecha || cxp.fecha)) return;
            const mon = Math.max(0, Number(pg.monto) || 0);
            pagosProvPeriodo += mon;
            const parteFlete = Math.round(mon * propFlete * 100) / 100;
            pagosFlete += parteFlete;
            pagosMerc += Math.round((mon - parteFlete) * 100) / 100;
        });
    });

    setTxt('fin-n4-pagos-total', formatearArsFin(pagosProvPeriodo));
    setTxt('fin-n4-pagos-merc', formatearArsFin(pagosMerc));
    setTxt('fin-n4-pagos-flete', formatearArsFin(pagosFlete));
    setTxt('fin-n4-deuda-total', formatearArsFin(m.deudaProveedoresTotal));
    setTxt('fin-n4-deuda-sub', `${m.facturasPendientesCount} ${m.facturasPendientesCount === 1 ? 'factura pendiente' : 'facturas pendientes'} de liquidación`);

    renderizarNivel4CxpAvanzadoFin();

    const arqActivo = calcularArqueoTurnoActivoFinanzas();
    const cajaDisp = Math.max(0, arqActivo ? arqActivo.teorico : Math.max(0, m.cashFlowNeto));
    const durDias = Math.max(1, Math.round((m.rango.finTs - m.rango.inicioTs) / 86400000));
    const opexMensualEst = m.opexTotal > 0 ? (m.opexTotal / durDias) * 30 : 0;

    if (opexMensualEst > 0) {
        const meses = Math.round((cajaDisp / opexMensualEst) * 10) / 10;
        setTxt('fin-n6-runway-val', `${meses.toLocaleString('es-AR')} Meses`);
        setTxt('fin-n6-runway-sub', `Caja actual (${formatearArsFin(cajaDisp)}) vs OPEX mensual est. (${formatearArsFin(opexMensualEst)})`);
    } else {
        setTxt('fin-n6-runway-val', cajaDisp > 0 ? '∞ Meses' : 'Sin OPEX');
        setTxt('fin-n6-runway-sub', 'Carga tus gastos fijos en Nivel 3 para medir sostenibilidad en meses.');
    }

    const insCont = document.getElementById('fin-n6-insights-list');
    if (insCont) {
        const insights = [];
        if (m.ventasNetas > 0) {
            const pctCmv = Math.round((m.cmvTotal / m.ventasNetas) * 100);
            insights.push({
                cls: pctCmv > 70 ? 'ins-amber' : 'ins-blue',
                html: `<strong>Estructura de Costos:</strong> El Costo de Mercadería Vendida (CMV) representa el <strong>${pctCmv}%</strong> de tus ventas netas.`
            });
            insights.push({
                cls: m.utilidadNeta >= 0 ? 'ins-green' : 'ins-amber',
                html: `<strong>Rentabilidad del Período:</strong> Margen bruto del <strong>${m.margenBrutoPct}%</strong> y resultado neto de <strong>${formatearArsFin(m.utilidadNeta)}</strong> (${m.utilidadNetaPct}%).`
            });
            const efvo = m.desgloseMedios.find(x => x.medio === 'Efectivo')?.monto || 0;
            const fiado = m.desgloseMedios.find(x => x.medio === 'Cuenta Corriente')?.monto || 0;
            if (fiado > 0 && (fiado / m.ventasNetas) >= 0.25) {
                insights.push({
                    cls: 'ins-amber',
                    html: `<strong>Alerta de Liquidez:</strong> El <strong>${Math.round((fiado / m.ventasNetas) * 100)}%</strong> de tus ventas del período fue en Cuenta Corriente (Fiado).`
                });
            } else if (efvo > 0) {
                insights.push({
                    cls: 'ins-blue',
                    html: `<strong>Canal Principal:</strong> Efectivo concentra el <strong>${Math.round((efvo / m.ventasNetas) * 100)}%</strong> de la facturación cobrada.`
                });
            }
        } else {
            insights.push({
                cls: 'ins-blue',
                html: `<strong>Listo para analizar:</strong> Registra ventas en el POS o selecciona un período con actividad para generar diagnósticos automáticos.`
            });
        }

        insCont.innerHTML = insights.map(i => `<div class="fin-insight-item ${i.cls}">${i.html}</div>`).join('');
    }
}

const _renderizarTodoFinanzasBase = renderizarTodoFinanzas;
renderizarTodoFinanzas = function () {
    _renderizarTodoFinanzasBase();
    aplicarMejorasParidadAppEnFinanzas(calcularMetricasFinanzasPeriodo());
};

/* ==========================================================================
   FIX SPA BOTONES NIVEL 1 & 2 + ADMINISTRADOR DE TURNOS (CANDADO / ARCHIVO)
   ========================================================================== */
window.finanzasState.gtTab = 'visibles';
window.finanzasState.gtBusqueda = '';

function obtenerLimiteTurnosFin() {
    const cfg = obtenerConfigFinanzas();
    const lim = parseInt(cfg.limiteTurnosSelector, 10);
    return isNaN(lim) ? 10 : Math.max(0, lim);
}

renderizarSelectorTurnosFinanzas = function () {
    const sel = document.getElementById('fin-select-turno');
    if (!sel) return;

    const turnos = leerArrayLocalFin('cat_alogo_pos_turnos_v1');
    if (turnos.length === 0) {
        sel.innerHTML = `<option value="activo">Sin turnos en POS aún</option>`;
        return;
    }

    const limite = obtenerLimiteTurnosFin();
    const activo = turnos.find(esTurnoAbiertoFin);
    const cerradosNoArchivados = turnos.filter(t => !esTurnoAbiertoFin(t) && !t.archivado);
    const cerradosVisibles = limite > 0 ? cerradosNoArchivados.slice(0, limite) : cerradosNoArchivados;
    const ocultosPorLimite = Math.max(0, cerradosNoArchivados.length - cerradosVisibles.length);
    const cantArchivados = turnos.filter(t => !esTurnoAbiertoFin(t) && t.archivado).length;

    let html = '';
    if (activo) {
        html += `<option value="activo">🟢 Turno Actual #${activo.numero} (${escaparHtmlFin(activo.operador || activo.cajeroNombre || 'Cajero')})</option>`;
    }

    cerradosVisibles.forEach(t => {
        const f = new Date(t.fechaApertura).toLocaleDateString('es-AR');
        const ico = t.bloqueado ? '🔒' : '✅';
        html += `<option value="${escaparHtmlFin(t.id)}">${ico} Turno #${t.numero} • ${f} (${escaparHtmlFin(t.operador || t.cajeroNombre || 'Cajero')})</option>`;
    });

    const selId = window.finanzasState.turnoSeleccionadoId;
    if (selId && selId !== 'activo' && !cerradosVisibles.some(t => String(t.id) === String(selId))) {
        const extra = turnos.find(t => String(t.id) === String(selId));
        if (extra && !esTurnoAbiertoFin(extra)) {
            const f = new Date(extra.fechaApertura).toLocaleDateString('es-AR');
            const tag = extra.archivado ? '📦 Archivado' : '📂 Histórico';
            html += `<option value="${escaparHtmlFin(extra.id)}">${tag} • Turno #${extra.numero} • ${f}</option>`;
        }
    }

    if (ocultosPorLimite > 0 || cantArchivados > 0) {
        html += `<option value="__gestionar__">⚙️ Ver más (${ocultosPorLimite} antiguos / ${cantArchivados} archivados)…</option>`;
    }

    sel.innerHTML = html;
    if (Array.from(sel.options).some(o => o.value === selId)) {
        sel.value = selId;
    } else {
        window.finanzasState.turnoSeleccionadoId = sel.value;
    }
};

function abrirModalGestorTurnosFin() {
    const modal = document.getElementById('modal-fin-gestor-turnos');
    if (!modal) return;

    const limiteActual = obtenerLimiteTurnosFin();
    const selLim = document.getElementById('fin-gt-limit-select');
    const inpCustom = document.getElementById('fin-gt-limit-custom');

    if (selLim && inpCustom) {
        const presets = ['5', '10', '20', '50', '0'];
        if (presets.includes(String(limiteActual))) {
            selLim.value = String(limiteActual);
            inpCustom.style.display = 'none';
        } else {
            selLim.value = 'custom';
            inpCustom.value = limiteActual;
            inpCustom.style.display = 'inline-block';
        }
    }

    renderizarListaGestorTurnosFin();
    modal.classList.add('active');
}

function renderizarListaGestorTurnosFin() {
    const cont = document.getElementById('fin-gt-list');
    if (!cont) return;

    const turnos = leerArrayLocalFin('cat_alogo_pos_turnos_v1');
    const todasVentas = leerArrayLocalFin('cat_alogo_pos_ventas_v1');

    const visiblesArr = turnos.filter(t => esTurnoAbiertoFin(t) || !t.archivado);
    const archivadosArr = turnos.filter(t => !esTurnoAbiertoFin(t) && !!t.archivado);

    const elVis = document.getElementById('fin-gt-cnt-visibles');
    const elArc = document.getElementById('fin-gt-cnt-archivados');
    if (elVis) elVis.textContent = visiblesArr.length;
    if (elArc) elArc.textContent = archivadosArr.length;

    const tab = window.finanzasState.gtTab || 'visibles';
    const q = (window.finanzasState.gtBusqueda || '').trim().toLowerCase();
    const base = tab === 'archivados' ? archivadosArr : visiblesArr;

    const filtrados = base.filter(t => {
        if (!q) return true;
        const fTxt = new Date(t.fechaApertura).toLocaleDateString('es-AR');
        return `#${t.numero} ${t.operador || ''} ${t.nombre || ''} ${fTxt}`.toLowerCase().includes(q);
    });

    if (filtrados.length === 0) {
        cont.innerHTML = `
            <div style="text-align:center; padding:1.8rem; color:#64748b; font-size:0.8rem; background:#f8fafc; border-radius:10px; border:1px dashed #cbd5e1;">
                ${tab === 'archivados' ? 'No tienes turnos archivados todavía.' : 'No se encontraron turnos con ese criterio.'}
            </div>
        `;
        return;
    }

    cont.innerHTML = filtrados.map(t => {
        const esAbierto = esTurnoAbiertoFin(t);
        const bloqueado = !!t.bloqueado;
        const archivado = !!t.archivado;

        const ventasT = todasVentas.filter(v => v.estado !== 'anulada' && ventaPerteneceATurnoFin(v, t));
        const totT = ventasT.reduce((a, v) => a + (Number(v.total) || 0), 0);
        const fAp = new Date(t.fechaApertura).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        const badges = [];
        if (esAbierto) badges.push('<span class="fin-est-pill est-pagado">ACTIVO</span>');
        if (bloqueado) badges.push('<span class="fin-est-pill est-fiado">🔒 CANDADO</span>');
        if (archivado) badges.push('<span class="fin-est-pill est-parcial">📦 ARCHIVADO</span>');

        return `
            <div class="fin-gt-row ${esAbierto ? 'is-open' : (bloqueado ? 'is-locked' : '')}" data-turno-id="${escaparHtmlFin(t.id)}">
                <div class="fin-gt-info">
                    <strong>Turno #${t.numero} • ${escaparHtmlFin(t.operador || 'Cajero')} ${badges.join(' ')}</strong>
                    <small>${fAp} • ${ventasT.length} tickets • Ventas: <strong>${formatearArsFin(totT)}</strong> • Fondo: ${formatearArsFin(t.fondoInicial)}</small>
                </div>
                <div class="fin-gt-actions">
                    <button type="button" class="fin-gt-btn btn-auditar" data-gt-act="auditar" title="Cargar este turno en Finanzas para auditarlo">
                        👁️ Auditar
                    </button>
                    ${!esAbierto ? `
                        <button type="button" class="fin-gt-btn ${bloqueado ? 'btn-lock-on' : ''}" data-gt-act="candado" title="${bloqueado ? 'Quitar candado de protección' : 'Colocar candado para evitar borrado accidental'}">
                            ${bloqueado ? '🔓 Quitar Candado' : '🔒 Candado'}
                        </button>
                        <button type="button" class="fin-gt-btn" data-gt-act="archivar" title="${archivado ? 'Devolver a la lista Auditar' : 'Ocultar de la lista sin borrar'}">
                            ${archivado ? '📤 Restaurar' : '📦 Almacenar'}
                        </button>
                        <button type="button" class="fin-gt-btn btn-del" data-gt-act="eliminar" ${bloqueado ? 'disabled title="Quita el candado antes de eliminar"' : 'title="Eliminar turno definitivamente"'}>
                            🗑️ Eliminar
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function ejecutarAccionGestorTurnoFin(turnoId, accion) {
    const turnos = leerArrayLocalFin('cat_alogo_pos_turnos_v1');
    const idx = turnos.findIndex(t => String(t.id) === String(turnoId));
    if (idx === -1) return;
    const t = turnos[idx];

    if (accion === 'auditar') {
        window.finanzasState.periodo = 'turno';
        window.finanzasState.turnoSeleccionadoId = esTurnoAbiertoFin(t) ? 'activo' : t.id;
        document.querySelectorAll('#fin-period-tabs .fin-ptab').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-periodo') === 'turno');
        });
        document.getElementById('modal-fin-gestor-turnos')?.classList.remove('active');
        renderizarSelectorTurnosFinanzas();
        renderizarTodoFinanzas();
        return;
    }

    if (accion === 'candado') {
        t.bloqueado = !t.bloqueado;
        localStorage.setItem('cat_alogo_pos_turnos_v1', JSON.stringify(turnos));
        renderizarListaGestorTurnosFin();
        renderizarSelectorTurnosFinanzas();
        return;
    }

    if (accion === 'archivar') {
        t.archivado = !t.archivado;
        localStorage.setItem('cat_alogo_pos_turnos_v1', JSON.stringify(turnos));
        renderizarListaGestorTurnosFin();
        renderizarSelectorTurnosFinanzas();
        return;
    }

    if (accion === 'eliminar') {
        if (esTurnoAbiertoFin(t)) {
            alert('No puedes eliminar un turno abierto. Ciérralo primero.');
            return;
        }
        if (t.bloqueado) {
            alert('🔒 Este turno tiene candado puesto. Quita el candado primero si deseas eliminarlo.');
            return;
        }
        const ok = confirm(
            `🗑️ ¿Eliminar definitivamente el Turno #${t.numero} (${t.operador}) de la lista de turnos?\n\n` +
            `Nota: Las ventas históricas del POS se conservan en el historial general por fecha.`
        );
        if (!ok) return;

        turnos.splice(idx, 1);
        localStorage.setItem('cat_alogo_pos_turnos_v1', JSON.stringify(turnos));
        if (window.finanzasState.turnoSeleccionadoId === turnoId) {
            window.finanzasState.turnoSeleccionadoId = 'activo';
        }
        renderizarListaGestorTurnosFin();
        renderizarSelectorTurnosFinanzas();
        renderizarTodoFinanzas();
    }
}

function enlazarEventosSegurosFinanzasSPA() {
    finPdfEventosRegistrados = false;
    finHerrEventosRegistrados = false;
    finParidadEventosInit = true;

    const filterBar = document.getElementById('fin-ops-filter-bar');
    if (filterBar && !filterBar.dataset.finBound) {
        filterBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.fin-opchip');
            if (!btn) return;
            window.finanzasState.opsFiltroCanal = btn.getAttribute('data-opfilter') || 'todos';
            sincronizarVisualFiltroOpsFin();
            aplicarMejorasParidadAppEnFinanzas(calcularMetricasFinanzasPeriodo());
        });
        filterBar.dataset.finBound = '1';
    }
    sincronizarVisualFiltroOpsFin();

    const opsTbody = document.getElementById('fin-ops-tbody');
    if (opsTbody && !opsTbody.dataset.finBound) {
        opsTbody.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-fin-ver-ticket');
            if (!btn) return;
            const idx = parseInt(btn.getAttribute('data-op-idx'), 10);
            const op = (window._finOpsCache || [])[idx];
            if (op && op.ticketObj) abrirModalTicketFinanzas(op.ticketObj);
        });
        opsTbody.dataset.finBound = '1';
    }

    const modalTk = document.getElementById('modal-fin-ticket-detalle');
    if (modalTk && !modalTk.dataset.finBound) {
        const cerrarTk = () => modalTk.classList.remove('active');
        document.getElementById('btn-cerrar-modal-fin-tk')?.addEventListener('click', cerrarTk);
        document.getElementById('btn-fin-tk-cerrar-cta')?.addEventListener('click', cerrarTk);
        modalTk.addEventListener('click', (e) => { if (e.target === modalTk) cerrarTk(); });
        document.getElementById('btn-fin-tk-pdf80')?.addEventListener('click', () => descargarPdfTicket80mmDesdeFinanzas(finTicketActivoObj));
        document.getElementById('btn-fin-tk-wa')?.addEventListener('click', () => reenviarTicketWhatsAppDesdeFinanzas(finTicketActivoObj));
        modalTk.dataset.finBound = '1';
    }

    const selTurno = document.getElementById('fin-select-turno');
    if (selTurno && !selTurno.dataset.finGtBound) {
        selTurno.addEventListener('change', (e) => {
            if (e.target.value === '__gestionar__') {
                renderizarSelectorTurnosFinanzas();
                abrirModalGestorTurnosFin();
            }
        });
        selTurno.dataset.finGtBound = '1';
    }

    const btnGt = document.getElementById('btn-fin-gestionar-turnos');
    if (btnGt && !btnGt.dataset.finBound) {
        btnGt.addEventListener('click', abrirModalGestorTurnosFin);
        btnGt.dataset.finBound = '1';
    }

    const modalGt = document.getElementById('modal-fin-gestor-turnos');
    if (modalGt && !modalGt.dataset.finBound) {
        const cerrarGt = () => modalGt.classList.remove('active');
        document.getElementById('btn-cerrar-modal-fin-gt')?.addEventListener('click', cerrarGt);
        document.getElementById('btn-cerrar-modal-fin-gt-foot')?.addEventListener('click', cerrarGt);
        modalGt.addEventListener('click', (e) => { if (e.target === modalGt) cerrarGt(); });

        document.getElementById('fin-gt-limit-select')?.addEventListener('change', (e) => {
            const inp = document.getElementById('fin-gt-limit-custom');
            if (inp) {
                inp.style.display = e.target.value === 'custom' ? 'inline-block' : 'none';
                if (e.target.value === 'custom') inp.focus();
            }
        });

        document.getElementById('btn-fin-gt-guardar-limite')?.addEventListener('click', () => {
            const selVal = document.getElementById('fin-gt-limit-select')?.value;
            let nuevoLim = 10;
            if (selVal === 'custom') {
                nuevoLim = Math.max(1, parseInt(document.getElementById('fin-gt-limit-custom')?.value, 10) || 10);
            } else {
                nuevoLim = Math.max(0, parseInt(selVal, 10) || 0);
            }
            const cfg = obtenerConfigFinanzas();
            cfg.limiteTurnosSelector = nuevoLim;
            guardarConfigFinanzas(cfg);
            renderizarSelectorTurnosFinanzas();
            alert(nuevoLim === 0 ? '✅ Ahora se muestran todos los turnos no archivados.' : `✅ Lista "Auditar" limitada a los últimos ${nuevoLim} turnos cerrados.`);
        });

        document.querySelectorAll('#modal-fin-gestor-turnos .fin-gttab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#modal-fin-gestor-turnos .fin-gttab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                window.finanzasState.gtTab = btn.getAttribute('data-gttab');
                renderizarListaGestorTurnosFin();
            });
        });

        document.getElementById('fin-gt-search')?.addEventListener('input', (e) => {
            window.finanzasState.gtBusqueda = e.target.value;
            renderizarListaGestorTurnosFin();
        });

        document.getElementById('fin-gt-list')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-gt-act]');
            if (!btn) return;
            const row = btn.closest('.fin-gt-row');
            const id = row?.getAttribute('data-turno-id');
            if (id) ejecutarAccionGestorTurnoFin(id, btn.getAttribute('data-gt-act'));
        });

        modalGt.dataset.finBound = '1';
    }
}

function sincronizarVisualFiltroOpsFin() {
    const activo = window.finanzasState.opsFiltroCanal || 'todos';
    document.querySelectorAll('#fin-ops-filter-bar .fin-opchip').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-opfilter') === activo);
    });
}

const _inicializarFinanzasPrevFix = inicializarFinanzas;
inicializarFinanzas = function () {
    _inicializarFinanzasPrevFix();
    enlazarEventosSegurosFinanzasSPA();
};

/* ==========================================================================
   FIX DEFINITIVO: MODAL DE TICKET AUTOCONTENIDO (POS Y CAT-WEB)
   ========================================================================== */
function asegurarModalTicketEnDomFin() {
    let modal = document.getElementById('modal-fin-ticket-detalle');
    if (modal) return modal;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
        <div class="fin-modal-overlay" id="modal-fin-ticket-detalle" aria-hidden="true" style="z-index: 3200;">
            <div class="fin-modal-box fin-modal-ticket" role="dialog" aria-labelledby="fin-tk-comercio">
                <div class="fin-tk-top">
                    <button type="button" class="fin-modal-close fin-tk-x" id="btn-cerrar-modal-fin-tk">✕</button>
                    <div class="fin-tk-ico">🧾</div>
                    <h3 id="fin-tk-comercio">MI COMERCIO</h3>
                    <div class="fin-tk-num-row">
                        <span id="fin-tk-numero">TICKET #0000</span>
                        <span class="fin-tk-canal-pill" id="fin-tk-canal">🏪 POS Mostrador</span>
                    </div>
                    <div class="fin-tk-datetime">
                        <span id="fin-tk-fecha">📅 —</span>
                        <span id="fin-tk-hora">🕒 —</span>
                    </div>
                    <div class="fin-tk-cliente" id="fin-tk-cliente">👤 Consumidor Final</div>
                </div>

                <div class="fin-tk-body">
                    <span class="fin-tk-sec-lbl">PRODUCTOS EN EL PEDIDO</span>
                    <div class="fin-tk-items" id="fin-tk-items"></div>

                    <div class="fin-tk-summary-box">
                        <div class="fin-tk-sum-row">
                            <span>Método de Pago:</span>
                            <strong class="fin-tk-medio-pill" id="fin-tk-medio">EFECTIVO</strong>
                        </div>
                        <div class="fin-tk-sum-row">
                            <span>Estado:</span>
                            <strong id="fin-tk-estado">PAGADO</strong>
                        </div>
                        <div class="fin-tk-sum-row">
                            <span>Concepto / Nota:</span>
                            <strong id="fin-tk-nota">Venta Mostrador</strong>
                        </div>
                        <div class="fin-tk-sum-row" id="fin-tk-desc-row" style="display:none;">
                            <span id="fin-tk-desc-lbl">Descuento:</span>
                            <strong class="text-emerald" id="fin-tk-desc-val">-$0</strong>
                        </div>
                        <div class="fin-tk-sum-row" id="fin-tk-rec-row" style="display:none;">
                            <span id="fin-tk-rec-lbl">Recargo:</span>
                            <strong class="text-danger" id="fin-tk-rec-val">+$0</strong>
                        </div>
                        <div class="fin-tk-sum-row" id="fin-tk-pagado-row" style="display:none;">
                            <span>Pagado en el acto:</span>
                            <strong class="text-emerald" id="fin-tk-pagado-val">$0</strong>
                        </div>
                        <div class="fin-tk-sum-row" id="fin-tk-fiado-row" style="display:none;">
                            <span>Saldo a Cuenta Corriente:</span>
                            <strong class="text-danger" id="fin-tk-fiado-val">$0</strong>
                        </div>
                        <div class="fin-tk-total-row">
                            <strong>TOTAL DE LA VENTA:</strong>
                            <span id="fin-tk-total">$0</span>
                        </div>
                    </div>
                </div>

                <div class="fin-tk-footer">
                    <div class="fin-tk-footer-actions">
                        <button type="button" class="fin-btn fin-btn-blue-soft" id="btn-fin-tk-pdf80" style="flex:1;">
                            🖨️ Ticket 80mm (PDF)
                        </button>
                        <button type="button" class="fin-btn fin-btn-emerald-soft" id="btn-fin-tk-wa" style="flex:1;">
                            💬 WhatsApp
                        </button>
                    </div>
                    <button type="button" class="fin-btn fin-btn-dark-solid" id="btn-fin-tk-cerrar-cta" style="width:100%;">
                        Cerrar Ticket
                    </button>
                </div>
            </div>
        </div>
    `;
    modal = wrapper.firstElementChild;
    document.body.appendChild(modal);
    return modal;
}

function abrirModalTicketFinanzas(venta) {
    if (!venta) return;
    finTicketActivoObj = venta;

    const modal = asegurarModalTicketEnDomFin();
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

    const fObj = new Date(venta.fecha || Date.now());
    const fechaValida = !isNaN(fObj.getTime());

    setTxt('fin-tk-comercio', obtenerNombreComercioFin().toUpperCase());
    setTxt('fin-tk-numero', `TICKET #${String(venta.numeroTicket || '').replace(/^T-/, '')}`);
    const esWebTk = venta.canal === 'web';
    const esAppTk = !esWebTk && (venta.canal === 'app' || venta.origen === 'app' || String(venta.numeroTicket || '').startsWith('APP-'));
    setTxt('fin-tk-canal', esWebTk ? '🌐 Cat-Web' : (esAppTk ? '📱 Venta App' : '🏪 POS Mostrador'));
    setTxt('fin-tk-fecha', `📅 ${fechaValida ? fObj.toLocaleDateString('es-AR') : '—'}`);
    setTxt('fin-tk-hora', `🕒 ${fechaValida ? fObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—'} hs`);
    setTxt('fin-tk-cliente', `👤 ${venta.clienteNombre || 'Consumidor Final'}`);

    const itemsCont = document.getElementById('fin-tk-items');
    if (itemsCont) {
        const items = Array.isArray(venta.items) ? venta.items : [];
        if (items.length === 0) {
            itemsCont.innerHTML = `<div style="text-align:center; color:#64748b; font-size:0.78rem; padding:0.75rem;">Sin detalle de artículos registrado.</div>`;
        } else {
            itemsCont.innerHTML = items.map(it => {
                const cant = Number(it.cantidad) || 1;
                const pu = Number(it.precioUnit) || 0;
                const sub = Math.round(cant * pu * 100) / 100;
                const abrev = abrevUnidadFin(it.unidadMedida);
                return `
                    <div class="fin-tk-item-row">
                        <div>
                            <strong>${escaparHtmlFin(it.nombre || 'Producto')}</strong>
                            <small>${cant} ${escaparHtmlFin(abrev)} × ${formatearArsFin(pu)}</small>
                        </div>
                        <span class="fin-tk-item-sub">${formatearArsFin(sub)}</span>
                    </div>
                `;
            }).join('');
        }
    }

    const { montoFiado, montoCobrado, esAnulada } = obtenerDesgloseFiadoVentaFin(venta);
    const mediosTxt = (venta.pagos || []).map(p => p.medio).join(' + ') || 'EFECTIVO';
    setTxt('fin-tk-medio', mediosTxt);

    let estadoTk = '✅ PAGADO';
    if (esAnulada) estadoTk = '🚫 ANULADO';
    else if (montoFiado > 0 && montoCobrado <= 0) estadoTk = '📒 FIADO (CTA. CTE.)';
    else if (montoFiado > 0) estadoTk = '⏳ PAGO PARCIAL';
    setTxt('fin-tk-estado', estadoTk);

    setTxt('fin-tk-nota', venta.nota || (venta.canal === 'web' ? 'Pedido Tienda Web' : 'Venta Mostrador'));

    const subBase = Number(venta.subtotal) ||
        (Array.isArray(venta.items)
            ? venta.items.reduce((a, it) => a + (Number(it.precioUnit) || 0) * (Number(it.cantidad) || 0), 0)
            : 0);

    const descRow = document.getElementById('fin-tk-desc-row');
    if (descRow) {
        const descM = Number(venta.descuentoMonto) || 0;
        const hayD = descM > 0;
        descRow.style.display = hayD ? 'flex' : 'none';
        if (hayD) {
            const pctD = Number(venta.descuentoPct) > 0
                ? Number(venta.descuentoPct)
                : (subBase > 0 ? Math.round((descM / subBase) * 1000) / 10 : 0);
            setTxt('fin-tk-desc-lbl', pctD > 0 ? `Descuento (${pctD}%):` : 'Descuento:');
            setTxt('fin-tk-desc-val', `-${formatearArsFin(descM)}`);
        }
    }

    const recRow = document.getElementById('fin-tk-rec-row');
    if (recRow) {
        const recM = Number(venta.recargoMonto) || 0;
        const hayR = recM > 0;
        recRow.style.display = hayR ? 'flex' : 'none';
        if (hayR) {
            const baseRec = Math.max(1, subBase - (Number(venta.descuentoMonto) || 0));
            const pctR = Number(venta.recargoPct) > 0
                ? Number(venta.recargoPct)
                : (subBase > 0 ? Math.round((recM / baseRec) * 1000) / 10 : 0);
            setTxt('fin-tk-rec-lbl', pctR > 0 ? `Recargo (${pctR}%):` : 'Recargo:');
            setTxt('fin-tk-rec-val', `+${formatearArsFin(recM)}`);
        }
    }

    // Mostrar desglose Pagado / Fiado en el ticket si corresponde
    let pagadoRow = document.getElementById('fin-tk-pagado-row');
    let fiadoRow = document.getElementById('fin-tk-fiado-row');
    const summaryBox = modal.querySelector('.fin-tk-summary-box');
    const totalRow = modal.querySelector('.fin-tk-total-row');
    if (summaryBox && totalRow && (!pagadoRow || !fiadoRow)) {
        if (!pagadoRow) {
            pagadoRow = document.createElement('div');
            pagadoRow.className = 'fin-tk-sum-row';
            pagadoRow.id = 'fin-tk-pagado-row';
            pagadoRow.innerHTML = '<span>Pagado en el acto:</span><strong class="text-emerald" id="fin-tk-pagado-val">$0</strong>';
            summaryBox.insertBefore(pagadoRow, totalRow);
        }
        if (!fiadoRow) {
            fiadoRow = document.createElement('div');
            fiadoRow.className = 'fin-tk-sum-row';
            fiadoRow.id = 'fin-tk-fiado-row';
            fiadoRow.innerHTML = '<span>Saldo a Cuenta Corriente:</span><strong class="text-danger" id="fin-tk-fiado-val">$0</strong>';
            summaryBox.insertBefore(fiadoRow, totalRow);
        }
    }
    if (pagadoRow && fiadoRow) {
        const mostrarFiado = montoFiado > 0 && !esAnulada;
        pagadoRow.style.display = mostrarFiado ? 'flex' : 'none';
        fiadoRow.style.display = mostrarFiado ? 'flex' : 'none';
        if (mostrarFiado) {
            setTxt('fin-tk-pagado-val', formatearArsFin(montoCobrado));
            setTxt('fin-tk-fiado-val', formatearArsFin(montoFiado));
        }
    }

    setTxt('fin-tk-total', formatearArsFin(venta.total));
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function cerrarModalTicketFinanzasSeguro() {
    const modal = document.getElementById('modal-fin-ticket-detalle');
    if (!modal) return;
    modal.classList.remove('active');
    modal.style.display = 'none';
}

if (!window._finTicketGlobalDelegated) {
    document.addEventListener('click', (e) => {
        const btnVer = e.target.closest('.btn-fin-ver-ticket');
        if (btnVer) {
            e.preventDefault();
            e.stopPropagation();
            const idx = parseInt(btnVer.getAttribute('data-op-idx'), 10);
            const op = (window._finOpsCache || [])[idx];
            if (op && op.ticketObj) {
                abrirModalTicketFinanzas(op.ticketObj);
            }
            return;
        }

        if (
            e.target.closest('#btn-cerrar-modal-fin-tk') ||
            e.target.closest('#btn-fin-tk-cerrar-cta') ||
            e.target.id === 'modal-fin-ticket-detalle'
        ) {
            e.preventDefault();
            e.stopPropagation();
            cerrarModalTicketFinanzasSeguro();
            return;
        }

        if (e.target.closest('#btn-fin-tk-pdf80')) {
            e.preventDefault();
            e.stopPropagation();
            descargarPdfTicket80mmDesdeFinanzas(finTicketActivoObj);
            return;
        }

        if (e.target.closest('#btn-fin-tk-wa')) {
            e.preventDefault();
            e.stopPropagation();
            reenviarTicketWhatsAppDesdeFinanzas(finTicketActivoObj);
        }
    }, true);

    window._finTicketGlobalDelegated = true;
}

/* ==========================================================================
   NIVEL 4 PRO: SCROLL INTELIGENTE, FILTROS, TARJETAS COMPACTAS Y LIMPIEZA
   ========================================================================== */
if (!window.finanzasState.cxpFiltroEstado) window.finanzasState.cxpFiltroEstado = 'todos';
if (window.finanzasState.cxpBusqueda === undefined) window.finanzasState.cxpBusqueda = '';
if (window.finanzasState.cxpVerArchivados === undefined) window.finanzasState.cxpVerArchivados = false;
if (!window.finanzasState.cxpExpandidos) window.finanzasState.cxpExpandidos = new Set();
if (window.finanzasState.cxpLimpiarDias === undefined) window.finanzasState.cxpLimpiarDias = 5;

function asegurarEstilosNivel4CxpUx() {
    if (document.getElementById('fin-n4-ux-styles')) return;
    const st = document.createElement('style');
    st.id = 'fin-n4-ux-styles';
    st.textContent = `
        .fin-n4-toolbar {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 0.6rem;
            margin: 0.75rem 0 0.65rem;
            padding: 0.55rem 0.7rem;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
        }
        .fin-n4-tabs {
            display: flex;
            flex-wrap: wrap;
            gap: 0.35rem;
        }
        .fin-n4-tab {
            border: 1px solid #cbd5e1;
            background: #ffffff;
            color: #334155;
            font-size: 0.74rem;
            font-weight: 700;
            padding: 0.34rem 0.68rem;
            border-radius: 999px;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .fin-n4-tab:hover { border-color: #94a3b8; }
        .fin-n4-tab.active {
            background: #0f172a;
            color: #ffffff;
            border-color: #0f172a;
        }
        .fin-n4-controls {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.5rem;
            flex: 1;
            justify-content: flex-end;
            min-width: 240px;
        }
        .fin-n4-search-wrap {
            position: relative;
            flex: 1;
            min-width: 170px;
            max-width: 260px;
        }
        .fin-n4-search-wrap input {
            width: 100%;
            padding: 0.36rem 0.65rem 0.36rem 1.85rem;
            border: 1px solid #cbd5e1;
            border-radius: 999px;
            font-size: 0.76rem;
            background: #ffffff;
            color: #0f172a;
            outline: none;
        }
        .fin-n4-search-wrap input:focus { border-color: #047857; box-shadow: 0 0 0 2px rgba(4, 120, 87, 0.12); }
        .fin-n4-search-wrap span {
            position: absolute;
            left: 0.62rem;
            top: 50%;
            transform: translateY(-50%);
            font-size: 0.75rem;
            opacity: 0.65;
            pointer-events: none;
        }
        .fin-n4-arch-toggle {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            font-size: 0.73rem;
            font-weight: 600;
            color: #475569;
            cursor: pointer;
            user-select: none;
            white-space: nowrap;
        }
        #fin-cxp-list.fin-cxp-scroll-box {
            max-height: 480px;
            overflow-y: auto;
            padding-right: 6px;
            display: flex;
            flex-direction: column;
            gap: 0.55rem;
            scrollbar-width: thin;
            scrollbar-color: #cbd5e1 transparent;
        }
        #fin-cxp-list.fin-cxp-scroll-box::-webkit-scrollbar { width: 6px; }
        #fin-cxp-list.fin-cxp-scroll-box::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; }
        .fin-cxp-card-compact {
            display: flex;
            flex-direction: column;
            gap: 0.45rem;
            padding: 0.7rem 0.85rem;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            transition: border-color 0.15s ease;
        }
        .fin-cxp-card-compact:hover { border-color: #cbd5e1; }
        .fin-cxp-card-compact.is-archived {
            background: #f8fafc;
            border-style: dashed;
            opacity: 0.88;
        }
        .fin-cxp-top-line {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 0.5rem;
            flex-wrap: wrap;
        }
        .fin-cxp-meta-line {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.38rem;
            font-size: 0.74rem;
            color: #64748b;
            margin-top: 2px;
        }
        .fin-cxp-pagos-toggle {
            background: #eff6ff;
            color: #1d4ed8;
            border: 1px solid #bfdbfe;
            border-radius: 999px;
            padding: 1px 8px;
            font-size: 0.7rem;
            font-weight: 700;
            cursor: pointer;
        }
        .fin-cxp-pagos-toggle:hover { background: #dbeafe; }
        .fin-cxp-age-pill {
            display: inline-flex;
            align-items: center;
            padding: 1px 7px;
            border-radius: 999px;
            font-size: 0.69rem;
            font-weight: 700;
        }
        .fin-cxp-age-pill.age-today { background: #f1f5f9; color: #475569; }
        .fin-cxp-age-pill.age-recent { background: #eff6ff; color: #1d4ed8; }
        .fin-cxp-age-pill.age-warn { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
        .fin-cxp-age-pill.age-danger { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
        .fin-cxp-compact-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.5rem;
            padding: 0.45rem 0.65rem;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 9px;
            font-size: 0.78rem;
        }
        .fin-cxp-pagos-drawer {
            padding: 0.5rem 0.65rem;
            background: #f8fafc;
            border: 1px dashed #cbd5e1;
            border-radius: 9px;
            display: flex;
            flex-direction: column;
            gap: 0.3rem;
            font-size: 0.74rem;
            color: #334155;
        }
        .fin-cxp-pago-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 0.5rem;
            padding-bottom: 0.25rem;
            border-bottom: 1px solid #e2e8f0;
        }
        .fin-cxp-pago-item:last-child { border-bottom: none; padding-bottom: 0; }
        .fin-clean-presets {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 0.4rem;
            margin-bottom: 0.75rem;
        }
        .fin-clean-preset-btn {
            padding: 0.48rem 0.4rem;
            border-radius: 10px;
            border: 1px solid #cbd5e1;
            background: #ffffff;
            font-size: 0.75rem;
            font-weight: 700;
            color: #334155;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .fin-clean-preset-btn.active {
            background: #0f172a;
            color: #ffffff;
            border-color: #0f172a;
        }
        .fin-clean-preview {
            padding: 0.7rem 0.85rem;
            border-radius: 10px;
            border: 1px solid #a7f3d0;
            background: #ecfdf5;
            color: #065f46;
            font-size: 0.8rem;
            line-height: 1.45;
            margin: 0.75rem 0;
        }
        .fin-clean-preview.is-empty {
            border-color: #cbd5e1;
            background: #f8fafc;
            color: #475569;
        }
        .fin-clean-danger-box {
            margin-top: 0.85rem;
            padding-top: 0.75rem;
            border-top: 1px dashed #cbd5e1;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 0.6rem;
            flex-wrap: wrap;
        }
    `;
    document.head.appendChild(st);
}

function obtenerFechaSaldadoCxpFin(cxp) {
    const pagos = Array.isArray(cxp?.pagos) ? cxp.pagos : [];
    let maxTs = 0;
    pagos.forEach(pg => {
        const ts = new Date(pg?.fecha || 0).getTime();
        if (!isNaN(ts) && ts > maxTs) maxTs = ts;
    });
    if (maxTs > 0) return maxTs;
    return new Date(cxp?.fecha || 0).getTime() || 0;
}

function obtenerBadgeAntiguedadDeudaCxp(fechaIso) {
    const f = new Date(fechaIso || Date.now());
    if (isNaN(f.getTime())) return '';
    const hoy = new Date();
    const iniHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
    const iniF = new Date(f.getFullYear(), f.getMonth(), f.getDate()).getTime();
    const dias = Math.max(0, Math.round((iniHoy - iniF) / 86400000));

    if (dias === 0) return '<span class="fin-cxp-age-pill age-today">🕒 Hoy</span>';
    if (dias < 7) return `<span class="fin-cxp-age-pill age-recent">🕒 Hace ${dias} ${dias === 1 ? 'día' : 'días'}</span>`;
    if (dias < 15) return `<span class="fin-cxp-age-pill age-warn">⚠️ Hace ${dias} días</span>`;
    return `<span class="fin-cxp-age-pill age-danger">🔴 Hace ${dias} días</span>`;
}

function asegurarToolbarNivel4Cxp(cxpCont) {
    let toolbar = document.getElementById('fin-n4-ux-toolbar');
    if (toolbar) return toolbar;

    toolbar = document.createElement('div');
    toolbar.id = 'fin-n4-ux-toolbar';
    toolbar.className = 'fin-n4-toolbar';
    toolbar.innerHTML = `
        <div class="fin-n4-tabs" id="fin-n4-tabs-wrap">
            <button type="button" class="fin-n4-tab active" data-n4tab="todos">Todos (0)</button>
            <button type="button" class="fin-n4-tab" data-n4tab="deuda">🔴 Con Deuda (0)</button>
            <button type="button" class="fin-n4-tab" data-n4tab="saldado">✅ Saldados (0)</button>
        </div>
        <div class="fin-n4-controls">
            <div class="fin-n4-search-wrap">
                <span>🔍</span>
                <input type="text" id="fin-n4-search-input" placeholder="Buscar proveedor u orden (OC-...)...">
            </div>
            <label class="fin-n4-arch-toggle" title="Mostrar facturas saldadas que archivaste de esta lista">
                <input type="checkbox" id="fin-n4-chk-archivados">
                <span id="fin-n4-arch-lbl">Ver archivados (0)</span>
            </label>
            <button type="button" class="fin-btn fin-btn-light fin-btn-xs" id="btn-fin-n4-limpiar-saldados">
                🧹 Limpiar Saldados
            </button>
        </div>
    `;

    cxpCont.insertAdjacentElement('beforebegin', toolbar);

    toolbar.querySelector('#fin-n4-tabs-wrap')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.fin-n4-tab');
        if (!btn) return;
        window.finanzasState.cxpFiltroEstado = btn.getAttribute('data-n4tab') || 'todos';
        renderizarNivel4CxpAvanzadoFin();
    });

    const inpSearch = toolbar.querySelector('#fin-n4-search-input');
    if (inpSearch) {
        inpSearch.value = window.finanzasState.cxpBusqueda || '';
        inpSearch.addEventListener('input', (e) => {
            window.finanzasState.cxpBusqueda = e.target.value;
            renderizarNivel4CxpAvanzadoFin();
        });
    }

    const chkArch = toolbar.querySelector('#fin-n4-chk-archivados');
    if (chkArch) {
        chkArch.checked = !!window.finanzasState.cxpVerArchivados;
        chkArch.addEventListener('change', (e) => {
            window.finanzasState.cxpVerArchivados = e.target.checked;
            renderizarNivel4CxpAvanzadoFin();
        });
    }

    toolbar.querySelector('#btn-fin-n4-limpiar-saldados')?.addEventListener('click', abrirModalLimpiarSaldadosCxp);
    return toolbar;
}

function renderizarNivel4CxpAvanzadoFin() {
    const cxpCont = document.getElementById('fin-cxp-list');
    if (!cxpCont) return;

    asegurarEstilosNivel4CxpUx();
    cxpCont.classList.add('fin-cxp-scroll-box');
    const toolbar = asegurarToolbarNivel4Cxp(cxpCont);

    if (!cxpCont.dataset.cxpUxBound) {
        cxpCont.addEventListener('click', (e) => {
            const btnPagos = e.target.closest('.btn-cxp-toggle-pagos');
            if (btnPagos) {
                e.preventDefault();
                const id = String(btnPagos.getAttribute('data-cxp-id') || '');
                if (!id) return;
                if (window.finanzasState.cxpExpandidos.has(id)) window.finanzasState.cxpExpandidos.delete(id);
                else window.finanzasState.cxpExpandidos.add(id);
                renderizarNivel4CxpAvanzadoFin();
                return;
            }

            const btnRestaurar = e.target.closest('.btn-cxp-restaurar-arch');
            if (btnRestaurar) {
                e.preventDefault();
                const id = String(btnRestaurar.getAttribute('data-cxp-id') || '');
                const cuentas = leerArrayLocalFin('cat_alogo_cuentas_pagar_v1');
                const c = cuentas.find(x => String(x.id) === id);
                if (c) {
                    c.archivadoNivel4 = false;
                    localStorage.setItem('cat_alogo_cuentas_pagar_v1', JSON.stringify(cuentas));
                    renderizarNivel4CxpAvanzadoFin();
                }
            }
        });
        cxpCont.dataset.cxpUxBound = '1';
    }

    const todasCxp = leerArrayLocalFin('cat_alogo_cuentas_pagar_v1');
    const verArch = !!window.finanzasState.cxpVerArchivados;
    const cantArchivados = todasCxp.filter(c => c.archivadoNivel4 === true && (Number(c.deudaPendiente) || 0) <= 0).length;

    const baseVisibles = todasCxp.filter(c => {
        const tieneDeuda = (Number(c.deudaPendiente) || 0) > 0;
        if (tieneDeuda) return true; // Las deudas pendientes SIEMPRE visibles y protegidas
        return verArch ? true : !c.archivadoNivel4;
    });

    const cntTodos = baseVisibles.length;
    const cntDeuda = baseVisibles.filter(c => (Number(c.deudaPendiente) || 0) > 0).length;
    const cntSaldado = baseVisibles.filter(c => (Number(c.deudaPendiente) || 0) <= 0).length;

    // Actualizar textos de pestañas y contador de archivados
    const filtro = window.finanzasState.cxpFiltroEstado || 'todos';
    const tabMap = {
        todos: `Todos (${cntTodos})`,
        deuda: `🔴 Con Deuda (${cntDeuda})`,
        saldado: `✅ Saldados (${cntSaldado})`
    };
    toolbar.querySelectorAll('.fin-n4-tab').forEach(btn => {
        const k = btn.getAttribute('data-n4tab');
        if (tabMap[k]) btn.textContent = tabMap[k];
        btn.classList.toggle('active', k === filtro);
    });
    const lblArch = toolbar.querySelector('#fin-n4-arch-lbl');
    if (lblArch) lblArch.textContent = `Ver archivados (${cantArchivados})`;

    const q = (window.finanzasState.cxpBusqueda || '').trim().toLowerCase();
    const filtradas = baseVisibles.filter(d => {
        const tieneDeuda = (Number(d.deudaPendiente) || 0) > 0;
        if (filtro === 'deuda' && !tieneDeuda) return false;
        if (filtro === 'saldado' && tieneDeuda) return false;
        if (q) {
            const corpus = `${d.proveedorNombre || ''} ${d.codigoOrden || ''} ${d.comprobante || ''} ${d.notas || ''}`.toLowerCase();
            if (!corpus.includes(q)) return false;
        }
        return true;
    }).sort((a, b) => {
        const dA = Number(a.deudaPendiente) || 0;
        const dB = Number(b.deudaPendiente) || 0;
        if ((dB > 0) !== (dA > 0)) return dB > 0 ? 1 : -1;
        return (new Date(b.fecha || 0).getTime() || 0) - (new Date(a.fecha || 0).getTime() || 0);
    });

    if (filtradas.length === 0) {
        cxpCont.innerHTML = `
            <div style="text-align:center; padding:1.4rem; color:#64748b; font-size:0.8rem; background:#f8fafc; border-radius:10px; border:1px dashed #cbd5e1;">
                ${q ? `No hay registros que coincidan con "${escaparHtmlFin(window.finanzasState.cxpBusqueda)}".` : '✅ No hay facturas para mostrar en esta vista.'}
            </div>
        `;
        return;
    }

    cxpCont.innerHTML = filtradas.map(d => {
        const deuda = Math.max(0, Number(d.deudaPendiente) || 0);
        const pagado = deuda <= 0;
        const archivado = pagado && d.archivadoNivel4 === true;
        const fTxt = new Date(d.fecha).toLocaleDateString('es-AR');
        const pagos = Array.isArray(d.pagos) ? d.pagos : [];
        const expandido = window.finanzasState.cxpExpandidos.has(String(d.id));
        const ageBadge = !pagado ? obtenerBadgeAntiguedadDeudaCxp(d.fecha) : '';

        const btnPagosHtml = pagos.length > 0
            ? `<button type="button" class="fin-cxp-pagos-toggle btn-cxp-toggle-pagos" data-cxp-id="${escaparHtmlFin(d.id)}" title="Ver detalle de pagos">
                   ${pagos.length} ${pagos.length === 1 ? 'pago' : 'pagos'} ${expandido ? '▴' : '▾'}
               </button>`
            : '';

        const drawerHtml = (expandido && pagos.length > 0)
            ? `<div class="fin-cxp-pagos-drawer">
                   ${pagos.map((pg, idx) => {
                       const fp = new Date(pg.fecha || d.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
                       return `
                           <div class="fin-cxp-pago-item">
                               <div>
                                   <strong>#${idx + 1} • ${fp}</strong> • ${escaparHtmlFin(pg.medio || d.medioPago || 'Efectivo')}
                                   ${pg.nota ? `<span style="color:#64748b;"> — ${escaparHtmlFin(pg.nota)}</span>` : ''}
                               </div>
                               <strong class="text-emerald">${formatearArsFin(pg.monto)}</strong>
                           </div>
                       `;
                   }).join('')}
               </div>`
            : '';

        return `
            <div class="fin-cxp-card-compact ${archivado ? 'is-archived' : ''}">
                <div class="fin-cxp-top-line">
                    <div style="min-width:0;">
                        <strong style="font-size:0.9rem; color:#0f172a;">${escaparHtmlFin(d.proveedorNombre)}</strong>
                        <div class="fin-cxp-meta-line">
                            <span>Orden ${escaparHtmlFin(d.codigoOrden || '—')} • ${fTxt}</span>
                            ${btnPagosHtml}
                            ${ageBadge}
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.4rem;">
                        ${archivado ? `<button type="button" class="fin-btn fin-btn-light fin-btn-xs btn-cxp-restaurar-arch" data-cxp-id="${escaparHtmlFin(d.id)}">📤 Restaurar</button>` : ''}
                        <span class="fin-est-pill ${archivado ? 'est-fiado' : (pagado ? 'est-pagado' : 'est-parcial')}">
                            ${archivado ? 'ARCHIVADO' : (pagado ? 'SALDADO' : 'PARCIAL / PENDIENTE')}
                        </span>
                    </div>
                </div>

                <div class="fin-cxp-compact-bar">
                    <span>
                        Total: <strong>${formatearArsFin(d.totalGeneral)}</strong>
                        &nbsp;•&nbsp;
                        Adelantó: <strong class="text-emerald">${formatearArsFin(d.montoEntregado)}</strong>
                    </span>
                    <strong class="${pagado ? 'text-emerald' : 'text-danger'}" style="font-size:0.86rem;">
                        ${pagado ? 'Deuda: $0' : `Deuda: ${formatearArsFin(deuda)}`}
                    </strong>
                </div>

                ${drawerHtml}

                ${!pagado ? `
                    <button type="button" class="fin-btn fin-btn-danger-soft fin-btn-xs btn-fin-liquidar-cxp" data-cxp-id="${escaparHtmlFin(d.id)}" style="width:100%;">
                        💳 ABONAR / SALDAR DEUDA (${formatearArsFin(deuda)})
                    </button>
                ` : ''}
            </div>
        `;
    }).join('');
}

/* --- MODAL DE LIMPIEZA INTELIGENTE DE SALDADOS (ARCHIVO SEGURO + OPCIÓN +90 DÍAS) --- */
function asegurarModalLimpiarSaldadosCxp() {
    let modal = document.getElementById('modal-fin-cxp-limpiar');
    if (modal) return modal;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
        <div class="fin-modal-overlay" id="modal-fin-cxp-limpiar" aria-hidden="true" style="z-index: 3300;">
            <div class="fin-modal-box" style="max-width:480px; width:94%;" role="dialog" aria-labelledby="fin-clean-title">
                <header class="fin-modal-header">
                    <div>
                        <h3 id="fin-clean-title">🧹 Limpiar Facturas Saldadas</h3>
                        <p>Archiva de Nivel 4 las facturas ya pagadas sin afectar tus reportes ni la App.</p>
                    </div>
                    <button type="button" class="fin-modal-close" id="btn-cerrar-modal-cxp-clean">✕</button>
                </header>

                <div class="fin-modal-body" style="padding: 1rem 1.25rem;">
                    <label style="display:block; font-size:0.76rem; font-weight:700; color:#334155; margin-bottom:0.45rem;">
                        Antigüedad desde la fecha del último pago (saldado):
                    </label>
                    <div class="fin-clean-presets" id="fin-clean-presets">
                        <button type="button" class="fin-clean-preset-btn" data-days="5">+5 días</button>
                        <button type="button" class="fin-clean-preset-btn" data-days="15">+15 días</button>
                        <button type="button" class="fin-clean-preset-btn" data-days="30">+30 días</button>
                        <button type="button" class="fin-clean-preset-btn" data-days="0">Todos</button>
                    </div>

                    <div class="fin-field" style="margin-bottom:0;">
                        <label for="fin-clean-custom-days">Personalizado (días de antigüedad — 0 = todos los saldados)</label>
                        <input type="number" id="fin-clean-custom-days" class="fin-input" min="0" step="1" value="5">
                    </div>

                    <div class="fin-clean-preview" id="fin-clean-preview-box"></div>

                    <div class="fin-modal-footer" style="padding:0; border:none; margin-top:0.5rem;">
                        <button type="button" class="fin-btn fin-btn-light" id="btn-cancelar-cxp-clean">Cancelar</button>
                        <button type="button" class="fin-btn fin-btn-primary" id="btn-confirmar-cxp-clean">
                            📦 Archivar Saldados
                        </button>
                    </div>

                    <div class="fin-clean-danger-box">
                        <div style="font-size:0.71rem; color:#64748b; max-width:255px;">
                            <strong>Mantenimiento opcional:</strong> borra definitivamente saldados con más de 90 días para liberar espacio.
                        </div>
                        <button type="button" class="fin-btn fin-btn-danger-soft fin-btn-xs" id="btn-cxp-purgar-90">
                            🗑️ Eliminar +90 días (0)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    modal = wrap.firstElementChild;
    document.body.appendChild(modal);

    const cerrar = () => {
        modal.classList.remove('active');
        modal.style.display = 'none';
    };

    modal.querySelector('#btn-cerrar-modal-cxp-clean')?.addEventListener('click', cerrar);
    modal.querySelector('#btn-cancelar-cxp-clean')?.addEventListener('click', cerrar);
    modal.addEventListener('click', (e) => { if (e.target === modal) cerrar(); });

    modal.querySelector('#fin-clean-presets')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-days]');
        if (!btn) return;
        const dias = Math.max(0, parseInt(btn.getAttribute('data-days'), 10) || 0);
        window.finanzasState.cxpLimpiarDias = dias;
        const inp = modal.querySelector('#fin-clean-custom-days');
        if (inp) inp.value = dias;
        actualizarPreviewLimpiarSaldadosCxp();
    });

    modal.querySelector('#fin-clean-custom-days')?.addEventListener('input', (e) => {
        window.finanzasState.cxpLimpiarDias = Math.max(0, parseInt(e.target.value, 10) || 0);
        actualizarPreviewLimpiarSaldadosCxp();
    });

    modal.querySelector('#btn-confirmar-cxp-clean')?.addEventListener('click', () => {
        const dias = Math.max(0, Number(window.finanzasState.cxpLimpiarDias) || 0);
        const corteTs = dias > 0 ? (Date.now() - dias * 86400000) : Infinity;
        const cuentas = leerArrayLocalFin('cat_alogo_cuentas_pagar_v1');
        let archivadosAhora = 0;

        cuentas.forEach(c => {
            const saldado = (Number(c.deudaPendiente) || 0) <= 0;
            if (!saldado || c.archivadoNivel4 === true) return;
            const tsSaldado = obtenerFechaSaldadoCxpFin(c);
            if (dias === 0 || tsSaldado <= corteTs) {
                c.archivadoNivel4 = true;
                archivadosAhora++;
            }
        });

        if (archivadosAhora === 0) return;
        localStorage.setItem('cat_alogo_cuentas_pagar_v1', JSON.stringify(cuentas));
        cerrar();
        renderizarNivel4CxpAvanzadoFin();
        alert(`✅ Se archivaron ${archivadosAhora} ${archivadosAhora === 1 ? 'factura saldada' : 'facturas saldadas'} de Nivel 4.\nTus reportes mensuales/anuales y la App Android siguen intactos.`);
    });

    modal.querySelector('#btn-cxp-purgar-90')?.addEventListener('click', () => {
        const corte90 = Date.now() - 90 * 86400000;
        const cuentas = leerArrayLocalFin('cat_alogo_cuentas_pagar_v1');
        const elegibles = cuentas.filter(c => (Number(c.deudaPendiente) || 0) <= 0 && obtenerFechaSaldadoCxpFin(c) <= corte90);
        if (elegibles.length === 0) return;

        const ok = confirm(
            `⚠️ ¿Eliminar DEFINITIVAMENTE ${elegibles.length} ${elegibles.length === 1 ? 'factura saldada' : 'facturas saldadas'} con más de 90 días?\n\n` +
            `• Tus deudas pendientes NO se tocarán.\n` +
            `• Esta acción no se puede deshacer y quitará esos registros antiguos del historial anual.`
        );
        if (!ok) return;

        const idsBorrar = new Set(elegibles.map(c => String(c.id)));
        const restantes = cuentas.filter(c => !idsBorrar.has(String(c.id)));
        localStorage.setItem('cat_alogo_cuentas_pagar_v1', JSON.stringify(restantes));
        cerrar();
        renderizarTodoFinanzas();
        alert(`🗑️ Se eliminaron definitivamente ${elegibles.length} registro(s) antiguos (+90 días).`);
    });

    return modal;
}

function actualizarPreviewLimpiarSaldadosCxp() {
    const modal = document.getElementById('modal-fin-cxp-limpiar');
    if (!modal) return;

    const dias = Math.max(0, Number(window.finanzasState.cxpLimpiarDias) || 0);
    const corteTs = dias > 0 ? (Date.now() - dias * 86400000) : Infinity;

    modal.querySelectorAll('.fin-clean-preset-btn').forEach(btn => {
        const dBtn = parseInt(btn.getAttribute('data-days'), 10);
        btn.classList.toggle('active', dBtn === dias);
    });

    const cuentas = leerArrayLocalFin('cat_alogo_cuentas_pagar_v1');
    const pendientes = cuentas.filter(c => (Number(c.deudaPendiente) || 0) > 0);
    const deudaTot = pendientes.reduce((a, c) => a + Math.max(0, Number(c.deudaPendiente) || 0), 0);

    const aArchivar = cuentas.filter(c => {
        if ((Number(c.deudaPendiente) || 0) > 0 || c.archivadoNivel4 === true) return false;
        return dias === 0 || obtenerFechaSaldadoCxpFin(c) <= corteTs;
    });

    const corte90 = Date.now() - 90 * 86400000;
    const purga90Count = cuentas.filter(c => (Number(c.deudaPendiente) || 0) <= 0 && obtenerFechaSaldadoCxpFin(c) <= corte90).length;

    const box = modal.querySelector('#fin-clean-preview-box');
    const btnOk = modal.querySelector('#btn-confirmar-cxp-clean');
    const btn90 = modal.querySelector('#btn-cxp-purgar-90');

    const textoProtegidas = pendientes.length > 0
        ? `Tus <strong>${pendientes.length} ${pendientes.length === 1 ? 'deuda pendiente' : 'deudas pendientes'} (${formatearArsFin(deudaTot)})</strong> están protegidas y no se tocarán.`
        : 'No tienes deudas pendientes en riesgo.';

    if (box) {
        if (aArchivar.length === 0) {
            box.className = 'fin-clean-preview is-empty';
            box.innerHTML = `No hay facturas saldadas${dias > 0 ? ` con más de <strong>${dias} días</strong>` : ''} para archivar.<br>${textoProtegidas}`;
        } else {
            const fechaCorteTxt = new Date(corteTs).toLocaleDateString('es-AR');
            const rangoTxt = dias > 0 ? ` anteriores al <strong>${fechaCorteTxt}</strong>` : '';
            box.className = 'fin-clean-preview';
            box.innerHTML = `Se archivarán <strong>${aArchivar.length} ${aArchivar.length === 1 ? 'factura saldada' : 'facturas saldadas'}</strong>${rangoTxt} (quedan ocultas de Nivel 4, pero intactas en reportes y App).<br>${textoProtegidas}`;
        }
    }

    if (btnOk) {
        btnOk.disabled = aArchivar.length === 0;
        btnOk.textContent = aArchivar.length > 0
            ? `📦 Archivar ${aArchivar.length} Saldado${aArchivar.length === 1 ? '' : 's'}`
            : 'Sin saldados para archivar';
    }

    if (btn90) {
        btn90.disabled = purga90Count === 0;
        btn90.textContent = `🗑️ Eliminar +90 días (${purga90Count})`;
    }
}

function abrirModalLimpiarSaldadosCxp() {
    const modal = asegurarModalLimpiarSaldadosCxp();
    const inp = modal.querySelector('#fin-clean-custom-days');
    if (inp) inp.value = window.finanzasState.cxpLimpiarDias ?? 5;
    actualizarPreviewLimpiarSaldadosCxp();
    modal.style.display = 'flex';
    modal.classList.add('active');
}

