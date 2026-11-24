/* ==========================================================================
   MÓDULO: DASHBOARD PRINCIPAL / PANEL OPERATIVO (ETAPA 1)
   (4 KPIS EN VIVO, CRONÓMETRO DE TURNO, BOTONERA DE 8 ACCESOS Y RADAR ALERTAS)
   ========================================================================== */

let iniTimerInterval = null;

function leerArrayIni(clave) {
    try {
        const arr = JSON.parse(localStorage.getItem(clave) || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function leerConfigFinanzasIni() {
    try {
        return JSON.parse(localStorage.getItem('cat_alogo_fin_config_v1') || 'null') || { margenGlobal: 30, dolarHoy: 1150 };
    } catch {
        return { margenGlobal: 30, dolarHoy: 1150 };
    }
}

function esTurnoAbiertoIni(t) {
    return !!(t && (t.estado === 'abierto' || t.estado === 'abierta' || t.abierto === true));
}

function esProductoVisibleWebIni(p) {
    if (!p) return false;
    if (p.publicarWeb !== undefined) return !!p.publicarWeb;
    if (p.visibleWeb !== undefined) return !!p.visibleWeb;
    return p.visible !== false;
}

function ventaPerteneceATurnoIni(v, turno) {
    if (!v || !turno) return false;
    const vTid = v.turnoId || v.cajaId;
    if (vTid) return String(vTid) === String(turno.id);
    const tsV = new Date(v.fecha || 0).getTime();
    const tsIni = new Date(turno.fechaApertura || 0).getTime() || 0;
    const tsFin = turno.fechaCierre ? (new Date(turno.fechaCierre).getTime() || Date.now()) : Date.now() + 60000;
    return !isNaN(tsV) && tsV >= tsIni && tsV <= tsFin;
}

function formatearArsIni(valor) {
    const num = Number(valor) || 0;
    return `$${num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function escaparHtmlIni(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function navegarModuloDesdeInicio(vista, callbackDespues = null) {
    const link = document.querySelector(`.nav-link[data-vista="${vista}"]`);
    if (link) {
        link.click();
        if (typeof callbackDespues === 'function') {
            setTimeout(callbackDespues, 260);
        }
        return true;
    }
    return false;
}

function formatearDuracionTurnoIni(fechaAperturaIso) {
    const ini = new Date(fechaAperturaIso).getTime();
    if (isNaN(ini)) return '0h 00m';
    const diffMin = Math.max(0, Math.floor((Date.now() - ini) / 60000));
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
}

/* ==========================================================================
   INICIALIZACIÓN Y RENDERIZADO PRINCIPAL
   ========================================================================== */
function inicializarInicio() {
    if (!document.getElementById('inicio-module-root')) return;

    const fechaEl = document.getElementById('ini-fecha-hoy');
    if (fechaEl) {
        fechaEl.textContent = new Date().toLocaleDateString('es-AR', {
            weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
        });
    }

    inicializarEventosInicio();
    renderizarTodoInicio();

    if (iniTimerInterval) clearInterval(iniTimerInterval);
    iniTimerInterval = setInterval(() => {
        if (!document.getElementById('inicio-module-root')) {
            clearInterval(iniTimerInterval);
            iniTimerInterval = null;
            return;
        }
        actualizarCronometroTurnoInicio();
    }, 30000);
}

function renderizarTodoInicio() {
    renderizarKpisYBotoneraInicio();
    renderizarRadarAlertasInicio();
}

function actualizarCronometroTurnoInicio() {
    const turno = leerArrayIni('cat_alogo_pos_turnos_v1').find(esTurnoAbiertoIni);
    const timerEl = document.getElementById('ini-caja-timer');
    if (!timerEl) return;
    timerEl.textContent = turno ? formatearDuracionTurnoIni(turno.fechaApertura) : 'Cerrada';
}

/* ==========================================================================
   4 KPIS EN VIVO + BOTONERA DE 8 ACCESOS
   ========================================================================== */
function renderizarKpisYBotoneraInicio() {
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

    const productos = leerArrayIni('cat_alogo_productos_v1');
    const turnos = leerArrayIni('cat_alogo_pos_turnos_v1');
    const ventas = leerArrayIni('cat_alogo_pos_ventas_v1').filter(v => v.estado !== 'anulada');
    const clientes = leerArrayIni('cat_alogo_clientes_v1');
    const cfgFin = leerConfigFinanzasIni();

    // 1. Bóveda Local & Visibilidad
    const totalProds = productos.length;
    const visibles = productos.filter(esProductoVisibleWebIni).length;
    const pctVis = totalProds > 0 ? Math.round((visibles / totalProds) * 1000) / 10 : 0;
    const catsUnicas = new Set(productos.map(p => (p.categoria || 'General').trim()).filter(Boolean)).size;

    setTxt('ini-kpi-total-prods', totalProds.toLocaleString('es-AR'));
    setTxt('ini-kpi-cats-count', `${catsUnicas} ${catsUnicas === 1 ? 'categoría activa' : 'categorías activas'}`);
    setTxt('ini-kpi-visibles', visibles.toLocaleString('es-AR'));
    setTxt('ini-kpi-visibles-pct', `${pctVis}% del total publicado`);

    // 2. Ventas Turno Activo (o Ventas de Hoy si caja cerrada) + Variación vs Ayer
    const turnoActivo = turnos.find(esTurnoAbiertoIni) || null;
    const ahora = new Date();
    const hoyIni = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0).getTime();
    const ayerIni = hoyIni - 86400000;
    const ayerFin = hoyIni - 1;

    const ventasTarget = turnoActivo
        ? ventas.filter(v => ventaPerteneceATurnoIni(v, turnoActivo))
        : ventas.filter(v => (new Date(v.fecha).getTime() || 0) >= hoyIni);

    const totalVentas = Math.round(ventasTarget.reduce((acc, v) => acc + (Number(v.total) || 0), 0) * 100) / 100;
    const cantTx = ventasTarget.length;
    const ticketProm = cantTx > 0 ? Math.round((totalVentas / cantTx) * 100) / 100 : 0;

    const ventasAyer = ventas
        .filter(v => {
            const ts = new Date(v.fecha).getTime() || 0;
            return ts >= ayerIni && ts <= ayerFin;
        })
        .reduce((acc, v) => acc + (Number(v.total) || 0), 0);

    setTxt('ini-kpi-ventas-lbl', turnoActivo ? `VENTAS TURNO #${turnoActivo.numero}` : 'VENTAS DE HOY');
    setTxt('ini-kpi-ventas-val', formatearArsIni(totalVentas));
    setTxt('ini-kpi-ventas-tx', `${cantTx} ${cantTx === 1 ? 'ticket emitido' : 'tickets emitidos'}${turnoActivo ? ` (${turnoActivo.nombre})` : ''}`);
    setTxt('ini-kpi-ticket-prom', `Ticket Prom: ${formatearArsIni(ticketProm)}`);

    const varEl = document.getElementById('ini-kpi-ventas-var');
    if (varEl) {
        if (ventasAyer > 0) {
            const pct = Math.round(((totalVentas - ventasAyer) / ventasAyer) * 1000) / 10;
            varEl.textContent = `${pct >= 0 ? '▲ +' : '▼ '}${pct}% vs ayer`;
            varEl.className = pct >= 0 ? 'text-emerald' : 'text-danger';
        } else {
            varEl.textContent = totalVentas > 0 ? 'Día activo ✓' : 'Sin ventas aún';
            varEl.className = 'text-emerald';
        }
    }

    // 3. Tarjeta de Caja / Turno
    const cajaCard = document.getElementById('ini-caja-card');
    const btnCaja = document.getElementById('btn-ini-caja-accion');
    if (turnoActivo) {
        cajaCard?.classList.remove('is-closed');
        setTxt('ini-caja-estado-badge', '● CAJA ABIERTA');
        setTxt('ini-caja-timer', formatearDuracionTurnoIni(turnoActivo.fechaApertura));
        setTxt('ini-caja-turno-num', `Turno #${turnoActivo.numero}`);
        setTxt('ini-caja-fondo', `Fondo Inicial: ${formatearArsIni(turnoActivo.fondoInicial)}`);
        setTxt('ini-caja-operador', turnoActivo.operador || turnoActivo.cajeroNombre || 'Cajero');
        if (btnCaja) btnCaja.textContent = '💵 Arqueo / Cerrar';
    } else {
        cajaCard?.classList.add('is-closed');
        setTxt('ini-caja-estado-badge', '● CAJA CERRADA');
        setTxt('ini-caja-timer', 'Inactiva');
        setTxt('ini-caja-turno-num', 'Sin Turno');
        setTxt('ini-caja-fondo', 'Abre un turno para vender en POS');
        setTxt('ini-caja-operador', 'Sin operador');
        if (btnCaja) btnCaja.textContent = '🔓 Abrir Turno';
    }

    // 4. Datos en vivo de la Botonera Operativa
    setTxt('tile-ini-dolar-val', `${formatearArsIni(cfgFin.dolarHoy || 1150)} USD`);

    const sinStock = productos.filter(p => (Number(p.stock) || 0) <= 0).length;
    const bajoStock = productos.filter(p => {
        const st = Number(p.stock) || 0;
        const min = Number(p.stockMinimo) || 5;
        return st > 0 && st <= min;
    }).length;
    const critTotal = sinStock + bajoStock;
    setTxt('tile-ini-stock-sub', critTotal > 0 ? `${sinStock} agot. • ${bajoStock} bajos` : 'Stock saludable ✓');

    const deudores = clientes.filter(c => (Number(c.saldoActual) || 0) > 0);
    const totalFiados = deudores.reduce((acc, c) => acc + (Number(c.saldoActual) || 0), 0);
    setTxt('tile-ini-fiados-cant', `${deudores.length} ${deudores.length === 1 ? 'Fiado' : 'Fiados'}`);
    setTxt('tile-ini-fiados-monto', `${formatearArsIni(totalFiados)} pend.`);
}

/* ==========================================================================
   RADAR DE ALERTAS ACCIONABLES DEL DÍA
   ========================================================================== */
function renderizarRadarAlertasInicio() {
    const wrap = document.getElementById('ini-alerts-wrap');
    const list = document.getElementById('ini-alerts-list');
    const countEl = document.getElementById('ini-alerts-count');
    if (!wrap || !list) return;

    const productos = leerArrayIni('cat_alogo_productos_v1');
    const clientes = leerArrayIni('cat_alogo_clientes_v1');
    const cxp = leerArrayIni('cat_alogo_cuentas_pagar_v1');
    const turnoActivo = leerArrayIni('cat_alogo_pos_turnos_v1').find(esTurnoAbiertoIni);

    const alertas = [];

    const sinStock = productos.filter(p => (Number(p.stock) || 0) <= 0);
    if (sinStock.length > 0) {
        alertas.push({
            cls: 'al-danger',
            titulo: `📦 ${sinStock.length} ${sinStock.length === 1 ? 'producto sin stock' : 'productos sin stock'}`,
            sub: `Ej: ${sinStock.slice(0, 2).map(p => p.nombre).join(', ')}`,
            accion: 'stock',
            btnTxt: 'Reponer →'
        });
    }

    const excedidos = clientes.filter(c => (Number(c.cupoMaximo) || 0) > 0 && (Number(c.saldoActual) || 0) > Number(c.cupoMaximo));
    if (excedidos.length > 0) {
        alertas.push({
            cls: 'al-amber',
            titulo: `⚠️ ${excedidos.length} ${excedidos.length === 1 ? 'cliente excedido' : 'clientes excedidos'} de cupo`,
            sub: `Ej: ${excedidos[0].nombre} (${formatearArsIni(excedidos[0].saldoActual)})`,
            accion: 'clientes',
            btnTxt: 'Cobrar →'
        });
    }

    const cxpPend = cxp.filter(c => (Number(c.deudaPendiente) || 0) > 0);
    if (cxpPend.length > 0) {
        const totCxp = cxpPend.reduce((a, c) => a + (Number(c.deudaPendiente) || 0), 0);
        alertas.push({
            cls: 'al-indigo',
            titulo: `🚚 ${cxpPend.length} ${cxpPend.length === 1 ? 'factura de proveedor' : 'facturas de proveedores'} por liquidar`,
            sub: `Total pendiente: ${formatearArsIni(totCxp)} ARS`,
            accion: 'finanzas_cxp',
            btnTxt: 'Liquidar →'
        });
    }

    if (turnoActivo) {
        const horas = (Date.now() - (new Date(turnoActivo.fechaApertura).getTime() || Date.now())) / 3600000;
        if (horas >= 12) {
            alertas.push({
                cls: 'al-amber',
                titulo: `🕒 Turno #${turnoActivo.numero} abierto hace ${Math.floor(horas)} hs`,
                sub: 'Conviene realizar un arqueo y cierre Corte Z para auditar la gaveta.',
                accion: 'corte_x',
                btnTxt: 'Cerrar Turno →'
            });
        }
    }

    if (alertas.length === 0) {
        wrap.style.display = 'none';
        return;
    }

    wrap.style.display = 'flex';
    if (countEl) countEl.textContent = `${alertas.length} ${alertas.length === 1 ? 'alerta activa' : 'alertas activas'}`;

    list.innerHTML = alertas.map(a => `
        <div class="ini-alert-item ${a.cls}">
            <div>
                <strong>${escaparHtmlIni(a.titulo)}</strong>
                <small>${escaparHtmlIni(a.sub)}</small>
            </div>
            <button type="button" class="ini-alert-btn" data-al-act="${a.accion}">${a.btnTxt}</button>
        </div>
    `).join('');
}

/* ==========================================================================
   EVENTOS DEL DASHBOARD (ETAPA 1)
   ========================================================================== */
function inicializarEventosInicio() {
    document.getElementById('btn-ini-resumen-diario')?.addEventListener('click', () => {
        if (typeof generarPdfReporteDiarioHibrido === 'function') {
            generarPdfReporteDiarioHibrido();
        } else {
            navegarModuloDesdeInicio('finanzas', () => {
                if (typeof abrirModalReportesPdfFinanzas === 'function') abrirModalReportesPdfFinanzas();
            });
        }
    });

    document.getElementById('btn-ini-caja-accion')?.addEventListener('click', () => {
        const turnoActivo = leerArrayIni('cat_alogo_pos_turnos_v1').find(esTurnoAbiertoIni);
        if (turnoActivo) {
            navegarModuloDesdeInicio('pos', () => {
                if (typeof abrirPanelArqueoPos === 'function') abrirPanelArqueoPos();
            });
        } else {
            document.getElementById('modal-ini-abrir-turno')?.classList.add('active');
            document.getElementById('ini-apt-fondo')?.focus();
        }
    });

    const cerrarModalTurno = () => document.getElementById('modal-ini-abrir-turno')?.classList.remove('active');
    document.getElementById('btn-cerrar-modal-ini-turno')?.addEventListener('click', cerrarModalTurno);
    document.getElementById('btn-cancelar-modal-ini-turno')?.addEventListener('click', cerrarModalTurno);
    document.getElementById('modal-ini-abrir-turno')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-ini-abrir-turno') cerrarModalTurno();
    });
    document.getElementById('form-ini-abrir-turno')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const turnos = leerArrayIni('cat_alogo_pos_turnos_v1');
        const numero = 101 + turnos.length;
        const operador = document.getElementById('ini-apt-operador')?.value.trim() || 'Cajero';
        turnos.unshift({
            id: 'turno-' + Date.now(),
            numero,
            nombre: document.getElementById('ini-apt-nombre')?.value || 'Caja #01 • Turno Mañana',
            operador,
            cajeroNombre: operador,
            fondoInicial: Math.max(0, parseFloat(document.getElementById('ini-apt-fondo')?.value) || 0),
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
        cerrarModalTurno();
        renderizarTodoInicio();
    });

    document.getElementById('tile-ini-pos')?.addEventListener('click', () => navegarModuloDesdeInicio('pos'));
    document.getElementById('tile-ini-finanzas')?.addEventListener('click', () => navegarModuloDesdeInicio('finanzas'));
    document.getElementById('tile-ini-gasto')?.addEventListener('click', () => {
        navegarModuloDesdeInicio('finanzas', () => {
            if (typeof abrirModalMovimientoFinanzas === 'function') abrirModalMovimientoFinanzas('gasto');
        });
    });
    document.getElementById('tile-ini-masiva')?.addEventListener('click', () => {
        navegarModuloDesdeInicio('finanzas', () => {
            if (typeof abrirModalHerramientasMayoristas === 'function') abrirModalHerramientasMayoristas();
        });
    });
    document.getElementById('tile-ini-nuevo-prod')?.addEventListener('click', () => {
        navegarModuloDesdeInicio('inventario', () => {
            document.getElementById('btn-nuevo-producto')?.click();
        });
    });
    document.getElementById('tile-ini-stock-critico')?.addEventListener('click', () => navegarModuloDesdeInicio('control-stock'));
    document.getElementById('tile-ini-fiados')?.addEventListener('click', () => navegarModuloDesdeInicio('clientes'));

    const cerrarModalUsd = () => document.getElementById('modal-ini-dolar')?.classList.remove('active');
    document.getElementById('tile-ini-dolar')?.addEventListener('click', () => {
        const cfg = leerConfigFinanzasIni();
        document.getElementById('ini-inp-dolar').value = cfg.dolarHoy || 1150;
        document.getElementById('modal-ini-dolar')?.classList.add('active');
        document.getElementById('ini-inp-dolar')?.focus();
    });
    document.getElementById('btn-cerrar-modal-ini-usd')?.addEventListener('click', cerrarModalUsd);
    document.getElementById('btn-cancelar-modal-ini-usd')?.addEventListener('click', cerrarModalUsd);
    document.getElementById('modal-ini-dolar')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-ini-dolar') cerrarModalUsd();
    });
    document.getElementById('form-ini-dolar')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const cfg = leerConfigFinanzasIni();
        cfg.dolarHoy = Math.max(1, parseFloat(document.getElementById('ini-inp-dolar')?.value) || 1150);
        localStorage.setItem('cat_alogo_fin_config_v1', JSON.stringify(cfg));
        cerrarModalUsd();
        renderizarKpisYBotoneraInicio();
    });

    document.getElementById('ini-alerts-list')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.ini-alert-btn');
        if (!btn) return;
        const act = btn.getAttribute('data-al-act');
        if (act === 'stock') navegarModuloDesdeInicio('control-stock');
        else if (act === 'clientes') navegarModuloDesdeInicio('clientes');
        else if (act === 'finanzas_cxp') {
            navegarModuloDesdeInicio('finanzas', () => {
                document.getElementById('fin-card-nivel-4')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        } else if (act === 'corte_x') {
            navegarModuloDesdeInicio('pos', () => {
                if (typeof abrirReporteCorteXPos === 'function') abrirReporteCorteXPos();
            });
        }
    });
}

/* ==========================================================================
   ETAPA 2: PLANTILLA ACTIVA & GRILLA DE PRODUCTOS RECIENTES EN VIVO
   ========================================================================== */
const INI_PRESETS_CATALOGO = {
    ejecutiva: {
        nombre: 'Lista Ejecutiva (Original)',
        meta: '• A4 Corporativo • Modo Claro',
        desc: 'Diseño corporativo optimizado para catálogo impreso en hoja A4 y envío directo por WhatsApp. Muestra SKU, precio minorista y disponibilidad.'
    },
    instagram: {
        nombre: 'Tarjeta Cuadrada (Instagram / Story)',
        meta: '• Formato 1:1 Visual • Redes Sociales',
        desc: 'Tarjetas de alto impacto con fotografía protagonista, etiqueta de oferta destacada y precio grande listas para compartir en WhatsApp Status o Instagram.'
    },
    mayorista: {
        nombre: 'Matriz Mayorista Sin Fotos (Compacta)',
        meta: '• Alta Densidad • Listado por Bulto',
        desc: 'Tabla liviana y compacta pensada para distribuidores y clientes mayoristas: muestra SKU, unidad, stock disponible y precios en pocas páginas.'
    },
    ofertas: {
        nombre: 'Volante de Ofertas de Fin de Semana',
        meta: '• Promociones • Precios Tachados',
        desc: 'Resalta automáticamente tus artículos con precio promocional, mostrando el precio anterior tachado y el ahorro real para impulsar ventas rápidas.'
    }
};

window.inicioStage2State = {
    busqueda: '',
    filtro: 'todos',
    limite: 12
};

let iniStage2EventosInit = false;

function leerConfigPlantillaInicio() {
    try {
        return JSON.parse(localStorage.getItem('cat_alogo_pdf_config_v1') || 'null') || {};
    } catch {
        return {};
    }
}

function renderizarPlantillaActivaInicio() {
    const cfg = leerConfigPlantillaInicio();
    const key = (cfg.plantillaActiva && INI_PRESETS_CATALOGO[cfg.plantillaActiva]) ? cfg.plantillaActiva : 'ejecutiva';
    const info = INI_PRESETS_CATALOGO[key];

    const elNom = document.getElementById('ini-tpl-nombre');
    const elMeta = document.getElementById('ini-tpl-meta');
    const elDesc = document.getElementById('ini-tpl-desc');

    if (elNom) elNom.textContent = info.nombre;
    if (elMeta) elMeta.textContent = info.meta;
    if (elDesc) elDesc.textContent = info.desc;

    document.querySelectorAll('#ini-tpl-presets .ini-preset-chip').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-preset') === key);
    });
}

function seleccionarPresetPlantillaInicio(presetKey) {
    if (!INI_PRESETS_CATALOGO[presetKey]) return;
    const cfg = leerConfigPlantillaInicio();
    cfg.plantillaActiva = presetKey;
    cfg.plantillaNombre = INI_PRESETS_CATALOGO[presetKey].nombre;
    localStorage.setItem('cat_alogo_pdf_config_v1', JSON.stringify(cfg));
    renderizarPlantillaActivaInicio();
}

function navegarPrimeraVistaDisponibleIni(candidatas) {
    for (const v of candidatas) {
        if (navegarModuloDesdeInicio(v)) return true;
    }
    return false;
}

function renderizarProductosRecientesInicio() {
    const grid = document.getElementById('ini-prods-grid');
    const counter = document.getElementById('ini-prods-counter');
    const moreWrap = document.getElementById('ini-prods-more-wrap');
    const btnMas = document.getElementById('btn-ini-ver-mas-prods');
    if (!grid) return;

    const productos = leerArrayIni('cat_alogo_productos_v1');
    const st = window.inicioStage2State;
    const q = (st.busqueda || '').trim().toLowerCase();

    const ordenados = [...productos].sort((a, b) => {
        const ta = new Date(a.actualizadoEn || 0).getTime() || Number(a.id) || 0;
        const tb = new Date(b.actualizadoEn || 0).getTime() || Number(b.id) || 0;
        return tb - ta;
    });

    const filtrados = ordenados.filter(p => {
        const visible = esProductoVisibleWebIni(p);
        const stock = Number(p.stock) || 0;
        const minStk = Number(p.stockMinimo) || 5;
        const oferta = Number(p.precioOferta) > 0 && Number(p.precioOferta) < Number(p.precioNormal);

        if (st.filtro === 'visibles' && !visible) return false;
        if (st.filtro === 'ocultos' && visible) return false;
        if (st.filtro === 'oferta' && !oferta) return false;
        if (st.filtro === 'critico' && stock > minStk) return false;

        if (q) {
            const corpus = `${p.nombre || ''} ${p.sku || ''} ${p.categoria || ''}`.toLowerCase();
            if (!corpus.includes(q)) return false;
        }
        return true;
    });

    const visiblesEnGrilla = filtrados.slice(0, st.limite);

    if (counter) {
        counter.textContent = `Mostrando ${visiblesEnGrilla.length} de ${filtrados.length} (Total: ${productos.length})`;
    }

    if (visiblesEnGrilla.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1 / -1; text-align:center; padding:2rem 1rem; background:#ffffff; border:1px dashed #cbd5e1; border-radius:12px; color:#64748b; font-size:0.82rem;">
                No se encontraron productos con ese filtro.
            </div>
        `;
        if (moreWrap) moreWrap.style.display = 'none';
        return;
    }

    grid.innerHTML = visiblesEnGrilla.map(p => {
        const foto = (p.imagenes && p.imagenes[0]) ? p.imagenes[0] : (p.imagen_url || '../img/producto.png');
        const visible = esProductoVisibleWebIni(p);
        const stock = Number(p.stock) || 0;
        const minStk = Number(p.stockMinimo) || 5;
        const sinStock = stock <= 0;
        const bajoStock = stock > 0 && stock <= minStk;
        const tieneOferta = Number(p.precioOferta) > 0 && Number(p.precioOferta) < Number(p.precioNormal);
        const precioFinal = tieneOferta ? Number(p.precioOferta) : (Number(p.precioNormal) || 0);
        const abrev = typeof window.obtenerAbrevUnidad === 'function' ? window.obtenerAbrevUnidad(p.unidadMedida) : 'u.';

        let tagHtml = '';
        if (sinStock) tagHtml = '<span class="ini-prod-tag tag-sinstk">Sin Stock</span>';
        else if (!visible) tagHtml = '<span class="ini-prod-tag tag-oculto">Oculto</span>';
        else if (tieneOferta) tagHtml = '<span class="ini-prod-tag tag-oferta">En Oferta</span>';
        else if (bajoStock) tagHtml = '<span class="ini-prod-tag tag-bajo">Stock Bajo</span>';

        return `
            <article class="ini-prod-card ${!visible ? 'is-hidden' : ''}" data-prod-id="${escaparHtmlIni(p.id)}">
                <div class="ini-prod-img-box">
                    <img src="${foto}" alt="${escaparHtmlIni(p.nombre)}">
                    <button type="button" class="ini-vis-toggle ${!visible ? 'is-off' : ''}" title="${visible ? 'Visible en catálogo Web (clic para ocultar)' : 'Oculto (clic para publicar)'}">
                        ${visible ? '👁️' : '🙈'}
                    </button>
                    ${tagHtml}
                </div>

                <div class="ini-prod-body">
                    <span class="ini-prod-sku">${escaparHtmlIni(p.sku || 'SIN-SKU')}</span>
                    <h4 class="ini-prod-name" title="${escaparHtmlIni(p.nombre)}">${escaparHtmlIni(p.nombre)}</h4>
                    <div class="ini-prod-stock ${sinStock || bajoStock ? 'crit' : ''}">
                        ${sinStock ? '0 ' + escaparHtmlIni(abrev) + ' • Reponer ya' : `Stock: ${stock} ${escaparHtmlIni(abrev)}`}
                    </div>

                    <div class="ini-prod-foot">
                        <div>
                            ${tieneOferta ? `<span class="ini-prod-old">${formatearArsIni(p.precioNormal)}</span>` : ''}
                            <span class="ini-prod-price">${formatearArsIni(precioFinal)}</span>
                        </div>
                        <button type="button" class="ini-prod-cart-btn" title="Enviar directo al Ticket POS" ${sinStock ? 'disabled' : ''}>
                            🛒
                        </button>
                    </div>
                </div>
            </article>
        `;
    }).join('');

    if (moreWrap) {
        const quedan = filtrados.length - visiblesEnGrilla.length;
        moreWrap.style.display = 'flex';
        if (btnMas) {
            btnMas.style.display = quedan > 0 ? 'inline-flex' : 'none';
            btnMas.textContent = `⬇️ Ver más productos (${quedan} restantes)`;
        }
    }
}

function alternarVisibilidadProductoInicio(prodId) {
    const productos = leerArrayIni('cat_alogo_productos_v1');
    const prod = productos.find(p => String(p.id) === String(prodId));
    if (!prod) return;

    const nuevo = !esProductoVisibleWebIni(prod);
    prod.visible = nuevo;
    prod.publicarWeb = nuevo;
    prod.visibleWeb = nuevo;
    prod.publicado = nuevo;
    prod.actualizadoEn = new Date().toISOString();

    window.bovedaProductos = productos;
    localStorage.setItem('cat_alogo_productos_v1', JSON.stringify(productos));

    renderizarKpisYBotoneraInicio();
    renderizarProductosRecientesInicio();
}

function enviarProductoDirectoAlPosInicio(prodId) {
    navegarModuloDesdeInicio('pos', () => {
        if (typeof agregarProductoAlTicketPos === 'function') {
            agregarProductoAlTicketPos(prodId, 1, null);
        }
    });
}

function inicializarEventosStage2Inicio() {
    if (iniStage2EventosInit) return;

    document.getElementById('ini-tpl-presets')?.addEventListener('click', (e) => {
        const chip = e.target.closest('.ini-preset-chip');
        if (chip) seleccionarPresetPlantillaInicio(chip.getAttribute('data-preset'));
    });

    document.getElementById('btn-ini-ir-editor')?.addEventListener('click', () => {
        if (!navegarPrimeraVistaDisponibleIni(['diseno-pdf', 'disenador', 'diseno', 'catalogo', 'exportar'])) {
            navegarModuloDesdeInicio('inventario');
        }
    });

    document.getElementById('btn-ini-exportar-cat')?.addEventListener('click', () => {
        if (!navegarPrimeraVistaDisponibleIni(['diseno-pdf', 'exportar', 'catalogo', 'disenador', 'diseno'])) {
            navegarModuloDesdeInicio('inventario');
        }
    });

    document.getElementById('ini-prod-search')?.addEventListener('input', (e) => {
        window.inicioStage2State.busqueda = e.target.value;
        window.inicioStage2State.limite = 12;
        renderizarProductosRecientesInicio();
    });

    document.getElementById('ini-prod-filters')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.ini-fchip');
        if (!btn) return;
        document.querySelectorAll('#ini-prod-filters .ini-fchip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        window.inicioStage2State.filtro = btn.getAttribute('data-pfilter');
        window.inicioStage2State.limite = 12;
        renderizarProductosRecientesInicio();
    });

    document.getElementById('ini-prods-grid')?.addEventListener('click', (e) => {
        const card = e.target.closest('.ini-prod-card');
        if (!card) return;
        const prodId = card.getAttribute('data-prod-id');

        if (e.target.closest('.ini-vis-toggle')) {
            alternarVisibilidadProductoInicio(prodId);
            return;
        }
        if (e.target.closest('.ini-prod-cart-btn')) {
            enviarProductoDirectoAlPosInicio(prodId);
        }
    });

    document.getElementById('btn-ini-ver-mas-prods')?.addEventListener('click', () => {
        window.inicioStage2State.limite += 12;
        renderizarProductosRecientesInicio();
    });

    document.getElementById('btn-ini-ir-inventario')?.addEventListener('click', () => {
        navegarModuloDesdeInicio('inventario');
    });

    iniStage2EventosInit = true;
}

const _renderizarTodoInicioStage1 = renderizarTodoInicio;
renderizarTodoInicio = function () {
    _renderizarTodoInicioStage1();
    renderizarPlantillaActivaInicio();
    renderizarProductosRecientesInicio();
};

const _inicializarEventosInicioStage1 = inicializarEventosInicio;
inicializarEventosInicio = function () {
    iniStage2EventosInit = false;
    _inicializarEventosInicioStage1();
    inicializarEventosStage2Inicio();
};

/* ==========================================================================
   ETAPA 3: INTEGRIDAD DE BÓVEDA (INDEXEDDB REAL), SEMÁFORO .CATBAK Y F12
   ========================================================================== */
const STORAGE_KEY_ULTIMO_CATBAK = 'cat_alogo_ultimo_respaldo_v1';
let iniStage3EventosInit = false;
let iniAtajoF12Registrado = false;

function formatearBytesBovedaInicio(bytes) {
    const b = Math.max(0, Number(bytes) || 0);
    if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)} MB`;
    return `${Math.max(1, Math.round(b / 1024))} KB`;
}

function analizarIntegridadBovedaInicio() {
    let colecciones = 0;
    let bytes = 0;
    let errores = 0;

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('cat_alogo_')) continue;
        const raw = localStorage.getItem(key) || '';
        bytes += new Blob([raw]).size;
        colecciones++;
        if (raw.startsWith('{') || raw.startsWith('[')) {
            try {
                JSON.parse(raw);
            } catch {
                errores++;
            }
        }
    }

    const kb = Math.max(1, Math.round(bytes / 1024));
    const mbTxt = formatearBytesBovedaInicio(bytes);

    return { colecciones, bytes, kb, mbTxt, errores };
}

function obtenerEstadoSemaforoCatbak() {
    const raw = localStorage.getItem(STORAGE_KEY_ULTIMO_CATBAK);
    if (!raw) {
        return {
            clase: 'sem-err',
            texto: '● Sin respaldo .catbak registrado',
            alertaDias: true
        };
    }

    const ts = new Date(raw).getTime();
    if (isNaN(ts)) {
        return { clase: 'sem-warn', texto: '● Respaldo sin fecha válida', alertaDias: true };
    }

    const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000));
    const diffHoras = Math.floor(diffMin / 60);
    const diffDias = Math.floor(diffHoras / 24);

    let haceTxt = '';
    if (diffMin < 2) haceTxt = 'recién guardado';
    else if (diffMin < 60) haceTxt = `hace ${diffMin} min`;
    else if (diffHoras < 24) haceTxt = `hace ${diffHoras} h`;
    else haceTxt = `hace ${diffDias} ${diffDias === 1 ? 'día' : 'días'}`;

    if (diffDias <= 3) {
        return { clase: 'sem-ok', texto: `● Último .catbak: ${haceTxt}`, alertaDias: false };
    }
    if (diffDias <= 7) {
        return { clase: 'sem-warn', texto: `● Último .catbak: ${haceTxt} (recomendado actualizar)`, alertaDias: false };
    }
    return { clase: 'sem-err', texto: `● Último .catbak: ${haceTxt} (respaldo vencido)`, alertaDias: true };
}

function renderizarBarraIntegridadInicio() {
    const info = analizarIntegridadBovedaInicio();
    const sem = obtenerEstadoSemaforoCatbak();

    const elInt = document.getElementById('ini-vault-integrity');
    const elSem = document.getElementById('ini-vault-semaforo');
    const elUsage = document.getElementById('ini-vault-usage-lbl');
    const elCols = document.getElementById('ini-vault-collections-lbl');
    const elMeter = document.getElementById('ini-vault-meter-fill');

    if (elInt) {
        elInt.textContent = info.errores === 0 ? '100% Sin Errores' : `${info.errores} clave(s) con advertencia`;
        elInt.className = info.errores === 0 ? 'text-emerald' : 'text-danger';
    }
    if (elSem) {
        elSem.className = `ini-vault-semaforo ${sem.clase}`;
        elSem.textContent = sem.texto;
    }
    if (elCols) {
        elCols.textContent = `${info.colecciones} ${info.colecciones === 1 ? 'colección activa' : 'colecciones activas'}`;
    }

    const aplicarCuotaVisual = (usadoBytes, cuotaBytes) => {
        const cuotaSegura = Math.max(500 * 1024 * 1024, Number(cuotaBytes) || 0);
        const pctReal = (usadoBytes / cuotaSegura) * 100;
        const pctTxt = pctReal > 0 && pctReal < 0.1 ? '<0.1%' : `${pctReal.toFixed(pctReal < 10 ? 1 : 0)}%`;
        const pctBarra = Math.min(100, Math.max(2, Math.round(pctReal)));

        if (elUsage) {
            elUsage.textContent = `Bóveda IndexedDB: ${formatearBytesBovedaInicio(usadoBytes)} / ${formatearBytesBovedaInicio(cuotaSegura)} (${pctTxt})`;
        }
        if (elMeter) {
            elMeter.style.width = `${pctBarra}%`;
            elMeter.classList.toggle('is-high', pctReal >= 75);
        }
    };

    // Estado inicial inmediato mientras responde navigator.storage.estimate()
    aplicarCuotaVisual(info.bytes, 500 * 1024 * 1024);

    if (navigator.storage && typeof navigator.storage.estimate === 'function') {
        navigator.storage.estimate().then((est) => {
            if (!document.getElementById('ini-vault-usage-lbl')) return;
            const usado = Math.max(info.bytes, Number(est.usage) || 0);
            const cuota = Number(est.quota) || (500 * 1024 * 1024);
            aplicarCuotaVisual(usado, cuota);
        }).catch(() => { /* conserva el cálculo inicial */ });
    }
}

function descargarBovedaDirectaInicio() {
    localStorage.setItem(STORAGE_KEY_ULTIMO_CATBAK, new Date().toISOString());

    if (typeof exportarRespaldoCatbak === 'function') {
        exportarRespaldoCatbak();
        renderizarBarraIntegridadInicio();
        return;
    }

    const payload = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('cat_alogo_')) continue;
        const raw = localStorage.getItem(key);
        try { payload[key] = JSON.parse(raw); } catch { payload[key] = raw; }
    }

    let comercio = 'Cat-Alogo Store';
    try {
        const pdfCfg = JSON.parse(localStorage.getItem('cat_alogo_pdf_config_v1') || 'null');
        if (pdfCfg?.headerNombre) comercio = pdfCfg.headerNombre;
    } catch { /* fallback */ }

    const backupObj = {
        formato: 'CAT_ALOGO_BOVEDA_BACKUP',
        version: '3.0',
        comercio,
        exportadoEn: new Date().toISOString(),
        totalClaves: Object.keys(payload).length,
        datos: payload
    };

    const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const fechaSlug = new Date().toISOString().slice(0, 10);

    const a = document.createElement('a');
    a.href = url;
    a.download = `respaldo-cat-alogo-${fechaSlug}.catbak`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);

    renderizarBarraIntegridadInicio();
    alert(`☁️ Respaldo descargado ("respaldo-cat-alogo-${fechaSlug}.catbak") con ${backupObj.totalClaves} colecciones.`);
}

function registrarAtajoGlobalF12Pos() {
    if (iniAtajoF12Registrado) return;

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'F12') return;
        if (e.ctrlKey || e.shiftKey || e.altKey) return;

        e.preventDefault();
        if (document.getElementById('pos-module-root')) {
            const inp = document.getElementById('pos-search-input');
            if (inp) { inp.focus(); inp.select(); }
        } else {
            navegarModuloDesdeInicio('pos', () => {
                const inp = document.getElementById('pos-search-input');
                if (inp) { inp.focus(); inp.select(); }
            });
        }
    });

    if (typeof window.exportarRespaldoCatbak === 'function' && !window.exportarRespaldoCatbak._conSemaforo) {
        const origExport = window.exportarRespaldoCatbak;
        window.exportarRespaldoCatbak = function (...args) {
            localStorage.setItem(STORAGE_KEY_ULTIMO_CATBAK, new Date().toISOString());
            const res = origExport.apply(this, args);
            if (document.getElementById('inicio-module-root')) renderizarBarraIntegridadInicio();
            return res;
        };
        window.exportarRespaldoCatbak._conSemaforo = true;
    }

    iniAtajoF12Registrado = true;
}

function inicializarEventosStage3Inicio() {
    if (iniStage3EventosInit) return;

    document.getElementById('btn-ini-descargar-catbak')?.addEventListener('click', descargarBovedaDirectaInicio);
    document.getElementById('btn-ini-ir-restaurar')?.addEventListener('click', () => {
        navegarModuloDesdeInicio('finanzas', () => {
            if (typeof abrirModalHerramientasMayoristas === 'function') {
                abrirModalHerramientasMayoristas();
                setTimeout(() => {
                    document.querySelector('.fin-htab[data-htab="backup"]')?.click();
                }, 80);
            }
        });
    });

    registrarAtajoGlobalF12Pos();
    iniStage3EventosInit = true;
}

const _renderizarTodoInicioStage2 = renderizarTodoInicio;
renderizarTodoInicio = function () {
    _renderizarTodoInicioStage2();
    renderizarBarraIntegridadInicio();
};

const _inicializarEventosInicioStage2 = inicializarEventosInicio;
inicializarEventosInicio = function () {
    iniStage3EventosInit = false;
    _inicializarEventosInicioStage2();
    inicializarEventosStage3Inicio();
};

registrarAtajoGlobalF12Pos();

/* ==========================================================================
   CONEXIÓN REAL: PLANTILLA ACTIVA & PRESETS RÁPIDOS (INICIO ↔ DISEÑO PDF)
   ========================================================================== */
(function () {
    const PRESETS_PDF_REALES = {
        ejecutiva: {
            orientacion: 'portrait',
            columnas: 3,
            aspectoFoto: 'contain',
            imgHeightPx: 145,
            radiusPx: 8,
            gapPx: 12,
            precioModo: 'publico',
            soloOfertas: false,
            showCatHeaders: false,
            showSku: true,
            showDesc: true,
            showStock: true,
            showOferta: true,
            sizeTitulo: 13,
            sizePrecio: 16,
            modoGrises: false,
            colorAcento: '#0f766e',
            colorPrecio: '#0f766e',
            colorHoja: '#ffffff',
            colorCard: '#ffffff',
            fontFamily: "'Inter', sans-serif",
            incluirPortada: false,
            incluirCierre: false
        },
        instagram: {
            orientacion: 'portrait',
            columnas: 2,
            aspectoFoto: 'cover',
            imgHeightPx: 210,
            radiusPx: 14,
            gapPx: 16,
            precioModo: 'publico',
            soloOfertas: false,
            showCatHeaders: false,
            showSku: false,
            showDesc: false,
            showStock: false,
            showOferta: true,
            sizeTitulo: 14,
            sizePrecio: 20,
            modoGrises: false,
            colorAcento: '#e11d48',
            colorPrecio: '#047857',
            colorHoja: '#ffffff',
            colorCard: '#ffffff',
            fontFamily: "'Inter', sans-serif",
            incluirPortada: false,
            incluirCierre: false
        },
        mayorista: {
            orientacion: 'portrait',
            columnas: 1,
            aspectoFoto: 'none',
            precioModo: 'mayorista',
            soloOfertas: false,
            showCatHeaders: true,
            orden: 'categoria',
            gapPx: 6,
            radiusPx: 6,
            showSku: true,
            showDesc: false,
            showStock: true,
            showOferta: true,
            sizeTitulo: 12,
            sizePrecio: 15,
            modoGrises: false,
            colorAcento: '#1e3a8a',
            colorPrecio: '#1e3a8a',
            colorHoja: '#ffffff',
            colorCard: '#ffffff',
            fontFamily: 'monospace',
            incluirPortada: false,
            incluirCierre: false
        },
        ofertas: {
            orientacion: 'portrait',
            columnas: 2,
            aspectoFoto: 'contain',
            imgHeightPx: 175,
            radiusPx: 12,
            gapPx: 14,
            precioModo: 'publico',
            soloOfertas: true,
            showCatHeaders: false,
            showSku: true,
            showDesc: true,
            showStock: false,
            showOferta: true,
            sizeTitulo: 14,
            sizePrecio: 19,
            modoGrises: false,
            colorAcento: '#dc2626',
            colorPrecio: '#dc2626',
            colorHoja: '#fffbeb',
            colorCard: '#ffffff',
            fontFamily: "'Inter', sans-serif",
            incluirPortada: false,
            incluirCierre: false
        }
    };

    seleccionarPresetPlantillaInicio = function (presetKey) {
        if (!INI_PRESETS_CATALOGO[presetKey]) return;
        const cfg = leerConfigPlantillaInicio();
        const cambiosReales = PRESETS_PDF_REALES[presetKey] || {};
        const nuevaCfg = {
            ...cfg,
            ...cambiosReales,
            plantillaActiva: presetKey,
            plantillaNombre: INI_PRESETS_CATALOGO[presetKey].nombre
        };

        localStorage.setItem('cat_alogo_pdf_config_v1', JSON.stringify(nuevaCfg));
        if (window.pdfConfig && typeof window.pdfConfig === 'object') {
            Object.assign(window.pdfConfig, nuevaCfg);
        }
        renderizarPlantillaActivaInicio();
    };

    function reconectarBotonesPlantillaInicio() {
        const btnEdit = document.getElementById('btn-ini-ir-editor');
        if (btnEdit && !btnEdit.dataset.pdfBridgeBound) {
            const nuevoEdit = btnEdit.cloneNode(true);
            nuevoEdit.dataset.pdfBridgeBound = '1';
            btnEdit.parentNode.replaceChild(nuevoEdit, btnEdit);

            nuevoEdit.addEventListener('click', () => {
                const cfg = leerConfigPlantillaInicio();
                const key = (cfg.plantillaActiva && PRESETS_PDF_REALES[cfg.plantillaActiva]) ? cfg.plantillaActiva : 'ejecutiva';
                seleccionarPresetPlantillaInicio(key);
                navegarModuloDesdeInicio('diseno-pdf');
            });
        }

        const btnExp = document.getElementById('btn-ini-exportar-cat');
        if (btnExp && !btnExp.dataset.pdfBridgeBound) {
            const nuevoExp = btnExp.cloneNode(true);
            nuevoExp.dataset.pdfBridgeBound = '1';
            btnExp.parentNode.replaceChild(nuevoExp, btnExp);

            nuevoExp.addEventListener('click', () => {
                const cfg = leerConfigPlantillaInicio();
                const key = (cfg.plantillaActiva && PRESETS_PDF_REALES[cfg.plantillaActiva]) ? cfg.plantillaActiva : 'ejecutiva';
                seleccionarPresetPlantillaInicio(key);

                navegarModuloDesdeInicio('diseno-pdf', () => {
                    setTimeout(() => {
                        if (typeof exportarCatalogoPdf === 'function') {
                            exportarCatalogoPdf('whatsapp');
                        } else {
                            document.getElementById('btn-export-pdf-wa')?.click();
                        }
                    }, 350);
                });
            });
        }
    }

    const _initEvPrevBridge = inicializarEventosInicio;
    inicializarEventosInicio = function () {
        _initEvPrevBridge();
        reconectarBotonesPlantillaInicio();
    };

    if (document.getElementById('ini-card-plantilla')) {
        reconectarBotonesPlantillaInicio();
    }
})();

