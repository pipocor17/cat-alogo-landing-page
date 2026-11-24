/* ==========================================================================
   MÓDULO: CLIENTES & GESTIÓN DE CUENTAS CORRIENTES (ETAPAS 1 A 4 COMPLETAS)
   ========================================================================== */

const STORAGE_KEY_CLIENTES = 'cat_alogo_clientes_v1';
const STORAGE_KEY_COBRANZAS = 'cat_alogo_cobranzas_v1';
const STORAGE_KEY_CLI_CXP = 'cat_alogo_cuentas_pagar_v1';
const STORAGE_KEY_CLI_PEDIDOS = 'cat_alogo_pedidos_v1';

const CLIENTES_SEED_INICIAL = [
    {
        id: 'cli-1001',
        cuenta: 'AC092',
        nombre: 'Mariana Gómez',
        dni: '34.892.102',
        telefono: '+54 9 351 4829-1029',
        domicilio: 'Av. Rivadavia 4821',
        vip: true,
        cupoMaximo: 15000,
        bloqueadoPos: false,
        saldoActual: 12400,
        movimientos: [
            { id: 'm-103', fecha: new Date().toISOString(), tipo: 'credito', concepto: 'Abono Efectivo (Caja)', monto: 2500, medio: 'Efectivo', saldoResultante: 12400 },
            { id: 'm-102', fecha: new Date(Date.now() - 2 * 86400000).toISOString(), tipo: 'debito', concepto: 'Compra Fiada #0041', monto: 8450, medio: 'Cuenta Corriente', saldoResultante: 14900 },
            { id: 'm-101', fecha: new Date(Date.now() - 6 * 86400000).toISOString(), tipo: 'debito', concepto: 'Compra Fiada #0029 (Apertura)', monto: 6450, medio: 'Cuenta Corriente', saldoResultante: 6450 }
        ]
    },
    {
        id: 'cli-1002',
        cuenta: 'AC093',
        nombre: 'Lucas Benítez',
        dni: '29.183.031',
        telefono: '+54 9 351 5591-2290',
        domicilio: 'San Martín 310',
        vip: false,
        cupoMaximo: 40000,
        bloqueadoPos: false,
        saldoActual: 24500,
        movimientos: [
            { id: 'm-201', fecha: new Date(Date.now() - 3 * 86400000).toISOString(), tipo: 'debito', concepto: 'Compra Mayorista Fiada', monto: 24500, medio: 'Cuenta Corriente', saldoResultante: 24500 }
        ]
    },
    {
        id: 'cli-1003',
        cuenta: 'AC094',
        nombre: 'Sofía Martínez',
        dni: '38.211.894',
        telefono: '+54 9 351 4521-8891',
        domicilio: 'Belgrano 1140',
        vip: false,
        cupoMaximo: 30000,
        bloqueadoPos: true,
        saldoActual: 31800,
        movimientos: [
            { id: 'm-301', fecha: new Date(Date.now() - 4 * 86400000).toISOString(), tipo: 'debito', concepto: 'Saldo acumulado fiado', monto: 31800, medio: 'Cuenta Corriente', saldoResultante: 31800 }
        ]
    },
    {
        id: 'cli-1004',
        cuenta: 'AC095',
        nombre: 'Roberto Fontana',
        dni: '18.290.441',
        telefono: '+54 9 351 6720-1199',
        domicilio: '9 de Julio 540',
        vip: false,
        cupoMaximo: 25000,
        bloqueadoPos: false,
        saldoActual: 0,
        movimientos: []
    }
];

window.clientesState = {
    subtabActiva: 'clientes',
    filtroActivo: 'todos',
    busqueda: '',
    orden: 'saldo_desc',
    clienteActivoId: null,
    // Etapa 2
    editandoClienteId: null,
    fiadoClienteId: null,
    cupoClienteId: null,
    tonoWa: 'amigable',
    autoTicket80mm: true,
    // Etapa 3: Proveedores CxP e Historial Auditado
    cxpFiltroEstado: 'pendientes',
    cxpBusqueda: '',
    cxpLiquidandoId: null,
    histBusqueda: '',
    histFiltroTipo: 'todos',
    histFiltroMedio: 'todos',
    histFiltroPeriodo: 'todos',
    histLimite: 30
};

let clientesF2Registrado = false;

/* ==========================================================================
   HELPERS DE BÓVEDA LOCAL Y FORMATO
   ========================================================================== */
function obtenerClientesBoveda() {
    let lista = [];
    try {
        lista = JSON.parse(localStorage.getItem(STORAGE_KEY_CLIENTES) || 'null');
    } catch {
        lista = null;
    }

    if (!Array.isArray(lista)) {
        lista = JSON.parse(JSON.stringify(CLIENTES_SEED_INICIAL));
        localStorage.setItem(STORAGE_KEY_CLIENTES, JSON.stringify(lista));
    }

    window.bovedaClientes = lista;
    return lista;
}

function guardarClientesBoveda(lista) {
    window.bovedaClientes = lista;
    localStorage.setItem(STORAGE_KEY_CLIENTES, JSON.stringify(lista));
}

function obtenerTodasCuentasPagarCli() {
    try {
        const arr = JSON.parse(localStorage.getItem(STORAGE_KEY_CLI_CXP) || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function guardarTodasCuentasPagarCli(lista) {
    localStorage.setItem(STORAGE_KEY_CLI_CXP, JSON.stringify(lista));
}

function obtenerDeudasProveedoresCli() {
    return obtenerTodasCuentasPagarCli().filter(c => (Number(c.deudaPendiente) || 0) > 0);
}

function registrarLogCobranzaGlobal(registro) {
    let logs = [];
    try {
        logs = JSON.parse(localStorage.getItem(STORAGE_KEY_COBRANZAS) || '[]');
        if (!Array.isArray(logs)) logs = [];
    } catch {
        logs = [];
    }
    logs.unshift(registro);
    localStorage.setItem(STORAGE_KEY_COBRANZAS, JSON.stringify(logs));
}

function obtenerCobranzasHoyCli() {
    const clientes = obtenerClientesBoveda();
    const hoyStr = new Date().toDateString();
    let total = 0;
    let cantidad = 0;

    clientes.forEach(c => {
        (c.movimientos || []).forEach(m => {
            if (m.tipo === 'credito' && new Date(m.fecha).toDateString() === hoyStr) {
                total += Number(m.monto) || 0;
                cantidad++;
            }
        });
    });

    return { total: Math.round(total * 100) / 100, cantidad };
}

function escaparHtmlCli(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatearMonedaCli(valor) {
    const num = Number(valor) || 0;
    return `$${num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function obtenerInicialesCli(nombre) {
    const partes = String(nombre || 'CL').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return 'CL';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[1][0]).toUpperCase();
}

function evaluarEstadoCliente(cli) {
    const saldo = Math.max(0, Number(cli.saldoActual) || 0);
    const cupo = Math.max(0, Number(cli.cupoMaximo) || 0);
    const pct = cupo > 0 ? Math.round((saldo / cupo) * 1000) / 10 : (saldo > 0 ? 100 : 0);

    if (saldo <= 0) {
        return { pct: 0, pctReal: 0, etiqueta: 'AL DÍA', clasePill: 'st-aldia', claseAvatar: 'av-ok', claseFill: 'fill-ok', excedido: false, alerta: false };
    }
    if (cupo > 0 && saldo > cupo) {
        return { pct: Math.min(100, pct), pctReal: pct, etiqueta: `EXCEDIDO ${Math.round(pct)}%`, clasePill: 'st-excedido', claseAvatar: 'av-danger', claseFill: 'fill-danger', excedido: true, alerta: true };
    }
    if (pct >= 85) {
        return { pct, pctReal: pct, etiqueta: `ALERTA (${pct}%)`, clasePill: 'st-alerta', claseAvatar: 'av-alerta', claseFill: 'fill-alerta', excedido: false, alerta: true };
    }
    return { pct, pctReal: pct, etiqueta: `REGULAR (${Math.round(pct)}%)`, clasePill: 'st-regular', claseAvatar: 'av-regular', claseFill: 'fill-regular', excedido: false, alerta: false };
}

function obtenerDatosComercioCli() {
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

function slugArchivoCli(texto) {
    return String(texto || 'reporte')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'reporte';
}

/* ==========================================================================
   INICIALIZACIÓN DEL MÓDULO
   ========================================================================== */
function inicializarClientes() {
    if (!document.getElementById('clientes-module-root')) return;

    inicializarEventosClientes();
    renderizarTodoClientes();
}

function renderizarTodoClientes() {
    renderizarKpisYBadgesClientes();
    renderizarFiltrosClientes();
    renderizarDirectorioClientes();
    renderizarDetalleCliente();
    renderizarBloqueProveedoresPorPagar();
    renderizarHistorialAuditadoClientes();
}

/* ==========================================================================
   KPIs Y BADGES DE SUB-PESTAÑAS
   ========================================================================== */
function renderizarKpisYBadgesClientes() {
    const clientes = obtenerClientesBoveda();
    const deudasProv = obtenerDeudasProveedoresCli();
    const cobranzasHoy = obtenerCobranzasHoyCli();
    const libroAuditado = construirLibroAuditadoCompleto();

    let totalFiados = 0;
    let totalCupos = 0;
    let cantDeudores = 0;
    let cantAlertas = 0;
    let cantBloqueados = 0;

    clientes.forEach(c => {
        const saldo = Math.max(0, Number(c.saldoActual) || 0);
        const cupo = Math.max(0, Number(c.cupoMaximo) || 0);
        const est = evaluarEstadoCliente(c);

        totalFiados += saldo;
        totalCupos += cupo;
        if (saldo > 0) cantDeudores++;
        if (est.alerta) cantAlertas++;
        if (c.bloqueadoPos || est.excedido) cantBloqueados++;
    });

    const pctUsoGlobal = totalCupos > 0 ? Math.round((totalFiados / totalCupos) * 100) : 0;
    const totalDeudaProv = deudasProv.reduce((acc, d) => acc + (Number(d.deudaPendiente) || 0), 0);

    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

    setTxt('kpi-cli-total-fiados', `${formatearMonedaCli(totalFiados)} ARS`);
    setTxt('kpi-cli-deudores-count', `${cantDeudores} ${cantDeudores === 1 ? 'cliente con deuda' : 'clientes con deuda'}`);
    setTxt('kpi-cli-cupo-uso', `${pctUsoGlobal}% cupo global`);

    setTxt('kpi-cli-cobranzas-hoy', `+${formatearMonedaCli(cobranzasHoy.total)} ARS`);
    setTxt('kpi-cli-cobranzas-cant', `${cobranzasHoy.cantidad} ${cobranzasHoy.cantidad === 1 ? 'abono hoy' : 'abonos hoy'}`);

    setTxt('kpi-cli-alertas-count', `${cantAlertas} ${cantAlertas === 1 ? 'Cliente' : 'Clientes'}`);
    setTxt('kpi-cli-bloqueados-count', `${cantBloqueados} en bloqueo POS`);

    setTxt('kpi-cli-deuda-provs', `${formatearMonedaCli(totalDeudaProv)} ARS`);
    setTxt('kpi-cli-facturas-pend', `${deudasProv.length} ${deudasProv.length === 1 ? 'factura pendiente' : 'facturas pendientes'}`);
    setTxt('kpi-cli-provs-pend-tag', deudasProv.length > 0 ? 'Pendiente de liquidar' : 'Todo saldado');

    setTxt('tab-badge-fiados', `${formatearMonedaCli(totalFiados)} en calle`);
    setTxt('tab-badge-provs', `${formatearMonedaCli(totalDeudaProv)} a liquidar`);
    setTxt('tab-badge-hist', libroAuditado.length);

    const kpiAlerta = document.getElementById('kpi-card-cli-alerta');
    if (kpiAlerta) kpiAlerta.classList.toggle('has-alert', cantAlertas > 0);
}

/* ==========================================================================
   FILTROS Y DIRECTORIO DE CLIENTES (COLUMNA IZQUIERDA)
   ========================================================================== */
function renderizarFiltrosClientes() {
    const cont = document.getElementById('cli-filter-chips');
    if (!cont) return;

    const clientes = obtenerClientesBoveda();
    const conDeuda = clientes.filter(c => (Number(c.saldoActual) || 0) > 0).length;
    const excedidos = clientes.filter(c => evaluarEstadoCliente(c).excedido).length;
    const alDia = clientes.filter(c => (Number(c.saldoActual) || 0) <= 0).length;
    const activo = window.clientesState.filtroActivo;

    cont.innerHTML = `
        <button type="button" class="cli-chip ${activo === 'todos' ? 'active' : ''}" data-cfilter="todos">
            Todos (${clientes.length})
        </button>
        <button type="button" class="cli-chip ${activo === 'deuda' ? 'active' : ''}" data-cfilter="deuda">
            Con Deuda Activa (${conDeuda})
        </button>
        <button type="button" class="cli-chip chip-danger ${activo === 'excedido' ? 'active' : ''}" data-cfilter="excedido">
            Límite Excedido (${excedidos})
        </button>
        <button type="button" class="cli-chip ${activo === 'aldia' ? 'active' : ''}" data-cfilter="aldia">
            Al Día / Sin Saldo (${alDia})
        </button>
    `;

    cont.querySelectorAll('.cli-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            window.clientesState.filtroActivo = btn.getAttribute('data-cfilter');
            renderizarFiltrosClientes();
            renderizarDirectorioClientes();
            renderizarDetalleCliente();
        });
    });
}

function obtenerClientesFiltradosYOrdenados() {
    const st = window.clientesState;
    const clientes = obtenerClientesBoveda();
    const q = (st.busqueda || '').trim().toLowerCase();

    const filtrados = clientes.filter(c => {
        const saldo = Math.max(0, Number(c.saldoActual) || 0);
        const est = evaluarEstadoCliente(c);

        if (st.filtroActivo === 'deuda' && saldo <= 0) return false;
        if (st.filtroActivo === 'excedido' && !est.excedido) return false;
        if (st.filtroActivo === 'aldia' && saldo > 0) return false;

        if (q) {
            const corpus = `${c.nombre || ''} ${c.dni || ''} ${c.telefono || ''} ${c.cuenta || ''} ${c.domicilio || ''}`.toLowerCase();
            if (!corpus.includes(q)) return false;
        }
        return true;
    });

    filtrados.sort((a, b) => {
        const sa = Number(a.saldoActual) || 0;
        const sb = Number(b.saldoActual) || 0;
        switch (st.orden) {
            case 'saldo_asc':
                return sa - sb;
            case 'uso_desc':
                return (evaluarEstadoCliente(b).pctReal || 0) - (evaluarEstadoCliente(a).pctReal || 0);
            case 'nombre_asc':
                return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
            case 'saldo_desc':
            default:
                return sb - sa;
        }
    });

    return filtrados;
}

function renderizarDirectorioClientes() {
    const cont = document.getElementById('cli-directory-list');
    const titleEl = document.getElementById('cli-dir-title');
    if (!cont) return;

    const lista = obtenerClientesFiltradosYOrdenados();
    if (titleEl) titleEl.textContent = `DIRECTORIO DE CLIENTES (${lista.length})`;

    if (lista.length === 0) {
        window.clientesState.clienteActivoId = null;
        cont.innerHTML = `
            <div class="cli-card" style="padding: 2rem 1rem; text-align: center; color: #64748b; font-size: 0.82rem;">
                No se encontraron clientes con los filtros actuales.
            </div>
        `;
        return;
    }

    if (!lista.some(c => c.id === window.clientesState.clienteActivoId)) {
        window.clientesState.clienteActivoId = lista[0].id;
    }

    cont.innerHTML = lista.map(cli => {
        const est = evaluarEstadoCliente(cli);
        const activo = cli.id === window.clientesState.clienteActivoId;
        const saldo = Math.max(0, Number(cli.saldoActual) || 0);
        const cupo = Math.max(0, Number(cli.cupoMaximo) || 0);
        const bloqueado = cli.bloqueadoPos || est.excedido;

        const pieIzq = saldo <= 0
            ? '✓ Cuenta corriente libre de deuda'
            : (bloqueado ? '🔒 POS Bloqueado para fiar' : `📄 ${(cli.movimientos || []).length} mov. registrados`);

        return `
            <button type="button" class="cli-item-card ${activo ? 'active' : ''}" data-cli-id="${escaparHtmlCli(cli.id)}">
                <div class="cli-item-top">
                    <div class="cli-item-identity">
                        <span class="cli-avatar ${est.claseAvatar}">${escaparHtmlCli(obtenerInicialesCli(cli.nombre))}</span>
                        <div style="min-width:0;">
                            <div class="cli-item-name">${escaparHtmlCli(cli.nombre)}</div>
                            <div class="cli-item-sub">DNI ${escaparHtmlCli(cli.dni || '—')} • ${escaparHtmlCli(cli.telefono || 'Sin tel.')}</div>
                        </div>
                    </div>
                    <span class="cli-status-pill ${est.clasePill}">${est.etiqueta}</span>
                </div>

                <div class="cli-item-debt-row">
                    <span>${saldo > 0 ? 'Deuda actual:' : 'Saldo adeudado:'}</span>
                    <span>
                        <strong class="cli-item-debt-val ${est.excedido || est.alerta ? 'text-danger' : ''}">${formatearMonedaCli(saldo)}</strong>
                        <small> / Cupo ${formatearMonedaCli(cupo)}</small>
                    </span>
                </div>

                <div class="cli-cupo-bar">
                    <div class="cli-cupo-fill ${est.claseFill}" style="width: ${Math.min(100, est.pct)}%;"></div>
                </div>

                <div class="cli-item-foot">
                    <span class="${bloqueado ? 'text-danger' : ''}">${pieIzq}</span>
                    <span>Cta. ${escaparHtmlCli(cli.cuenta || '—')}</span>
                </div>
            </button>
        `;
    }).join('');
}

/* ==========================================================================
   FICHA DERECHA: DETALLE DEL CLIENTE, ABONOS, TICKET 80MM Y PDF ESTADO CUENTA
   ========================================================================== */
function construirMensajeWhatsAppCliente(cli, tono = 'amigable') {
    const comercio = obtenerDatosComercioCli().nombre;
    const saldo = Math.max(0, Number(cli.saldoActual) || 0);
    const cupo = Math.max(0, Number(cli.cupoMaximo) || 0);

    if (saldo <= 0) {
        return `Hola ${cli.nombre}, te saludamos desde ${comercio}. ¡Tu cuenta corriente (${cli.cuenta || ''}) se encuentra al día! Gracias por elegirnos.`;
    }

    if (tono === 'formal') {
        const extraExcedido = (cupo > 0 && saldo > cupo)
            ? ` (superando el límite asignado de ${formatearMonedaCli(cupo)})`
            : '';
        return `Estimado/a ${cli.nombre}: desde ${comercio} le informamos que su cuenta corriente (${cli.cuenta || ''}) registra un saldo pendiente de ${formatearMonedaCli(saldo)}${extraExcedido}. Le solicitamos regularizar el pago por transferencia o en nuestro local a la brevedad para mantener su crédito habilitado. Muchas gracias.`;
    }

    return `Hola ${cli.nombre}! Te recordamos desde ${comercio} que tu saldo actual en cuenta corriente es de ${formatearMonedaCli(saldo)}. Podés abonar por transferencia o acercarte al local. ¡Muchas gracias por tu confianza!`;
}

function renderizarDetalleCliente() {
    const panel = document.getElementById('cli-detail-panel');
    if (!panel) return;

    const cli = obtenerClientesBoveda().find(c => c.id === window.clientesState.clienteActivoId);
    if (!cli) {
        panel.innerHTML = `
            <div class="cli-detail-card" style="text-align:center; padding: 3rem 1.5rem; color: #64748b;">
                <div style="font-size:2.4rem;">👥</div>
                <strong style="color:#0f172a;">Selecciona un cliente del directorio</strong>
                <span style="font-size:0.82rem;">Aquí verás su cupo de crédito, registro de abonos, movimientos y cobranza por WhatsApp.</span>
            </div>
        `;
        return;
    }

    const est = evaluarEstadoCliente(cli);
    const saldo = Math.max(0, Number(cli.saldoActual) || 0);
    const cupo = Math.max(0, Number(cli.cupoMaximo) || 0);
    const disponible = Math.max(0, Math.round((cupo - saldo) * 100) / 100);
    const bloqueado = cli.bloqueadoPos || est.excedido;
    const tonoActual = window.clientesState.tonoWa || 'amigable';
    const mensajeWa = construirMensajeWhatsAppCliente(cli, tonoActual);

    const movs = Array.isArray(cli.movimientos) ? cli.movimientos : [];
    const filasMovs = movs.length === 0
        ? `<tr><td colspan="5" style="text-align:center; color:#64748b; padding:1.25rem;">Sin movimientos registrados en esta cuenta corriente.</td></tr>`
        : movs.slice(0, 12).map(m => {
            const fechaTxt = new Date(m.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            const esDebito = m.tipo === 'debito';
            const btnTicket = !esDebito
                ? `<button type="button" class="cli-mov-ticket-btn" data-mov-id="${escaparHtmlCli(m.id)}" title="Descargar Ticket de Abono 80mm">🧾</button>`
                : '';

            return `
                <tr>
                    <td>${fechaTxt}</td>
                    <td><strong>${escaparHtmlCli(m.concepto)}</strong></td>
                    <td class="text-danger" style="font-weight:700;">${esDebito ? `+${formatearMonedaCli(m.monto)}` : '—'}</td>
                    <td class="text-emerald" style="font-weight:700;">${!esDebito ? `-${formatearMonedaCli(m.monto)}` : '—'}</td>
                    <td style="text-align:right; font-weight:700; white-space:nowrap;">
                        ${formatearMonedaCli(m.saldoResultante)}${btnTicket}
                    </td>
                </tr>
            `;
        }).join('');

    panel.innerHTML = `
        <article class="cli-detail-card">
            <header class="cli-det-header">
                <div class="cli-item-identity">
                    <span class="cli-avatar ${est.claseAvatar}" style="width:44px; height:44px; font-size:0.95rem;">${escaparHtmlCli(obtenerInicialesCli(cli.nombre))}</span>
                    <div>
                        <div class="cli-det-title-row">
                            <h3>${escaparHtmlCli(cli.nombre)}</h3>
                            ${cli.vip ? '<span class="cli-vip-tag">⭐ Cliente VIP</span>' : ''}
                        </div>
                        <div class="cli-item-sub">
                            DNI ${escaparHtmlCli(cli.dni || '—')} • ${escaparHtmlCli(cli.domicilio || 'Sin domicilio')} • Cta. ${escaparHtmlCli(cli.cuenta || '—')}
                        </div>
                    </div>
                </div>

                <div class="cli-det-actions">
                    <button type="button" class="cli-btn cli-btn-light cli-btn-sm" id="btn-det-cargar-fiado" title="Cargar un fiado o consumo manual">
                        ➕ Cargar Fiado
                    </button>
                    <button type="button" class="cli-btn cli-btn-light cli-btn-sm" id="btn-det-estado-pdf" title="Descargar Estado de Cuenta en PDF (A4)">
                        📄 Resumen PDF
                    </button>
                    <button type="button" class="cli-btn cli-btn-light cli-btn-sm" id="btn-det-editar-cli" title="Editar ficha del cliente">
                        ✏️ Editar
                    </button>
                    <button type="button" class="cli-btn cli-btn-whatsapp cli-btn-sm" id="btn-det-wa-top">
                        💬 WhatsApp
                    </button>
                </div>
            </header>

            <div class="cli-det-metrics">
                <div class="cli-det-metric-box">
                    <span>Estado de Habilitación</span>
                    <strong class="${bloqueado ? 'text-danger' : 'text-emerald'}">
                        ${bloqueado ? '● Bloqueado para fiar' : '● Fiado POS Permitido'}
                    </strong>
                </div>
                <div class="cli-det-metric-box">
                    <span>Cupo Máximo Asignado</span>
                    <strong>
                        ${formatearMonedaCli(cupo)}
                        <button type="button" class="cli-inline-edit-btn" id="btn-det-editar-cupo" title="Ajustar cupo máximo y bloqueo POS">✏️</button>
                    </strong>
                </div>
                <div class="cli-det-metric-box">
                    <span>Saldo Disponible Restante</span>
                    <strong class="${disponible <= 0 && saldo > 0 ? 'text-danger' : 'text-amber'}">
                        ${formatearMonedaCli(disponible)}
                    </strong>
                </div>
            </div>

            <div class="cli-abono-box">
                <div class="cli-abono-head">
                    <strong>💳 Registrar Abono a Cuenta Corriente</strong>
                    <label class="cli-abono-ticket-chk">
                        <input type="checkbox" id="cli-chk-ticket-80mm" ${window.clientesState.autoTicket80mm ? 'checked' : ''}>
                        <span>🧾 Emitir Ticket 80mm</span>
                    </label>
                </div>
                <div class="cli-abono-row">
                    <input type="number" id="cli-abono-monto" class="cli-abono-input" min="0" step="0.01" value="${saldo > 0 ? saldo : 0}" placeholder="Monto a abonar...">
                    <button type="button" class="cli-quick-amt-btn" data-set="2000">$2.000</button>
                    <button type="button" class="cli-quick-amt-btn" data-set="5000">$5.000</button>
                    <button type="button" class="cli-quick-amt-btn" id="btn-abono-total">Total (${formatearMonedaCli(saldo)})</button>
                </div>
                <div class="cli-abono-row" style="justify-content: space-between;">
                    <select id="cli-abono-medio" class="cli-select">
                        <option value="Efectivo">💵 Efectivo (Caja)</option>
                        <option value="Transferencia">🏦 Transferencia</option>
                        <option value="QR / Débito">📱 QR / Débito</option>
                    </select>
                    <button type="button" class="cli-btn cli-btn-primary" id="btn-confirmar-abono-cli" ${saldo <= 0 ? 'disabled style="opacity:0.55; cursor:not-allowed;"' : ''}>
                        ${window.clientesState.autoTicket80mm ? '🧾 Confirmar y Ticket (80mm)' : '✅ Confirmar Abono'}
                    </button>
                </div>
            </div>

            <div>
                <div class="cli-movs-head">
                    <strong>Estado de Cuenta & Movimientos</strong>
                    <span>Mostrando ${Math.min(12, movs.length)} de ${movs.length} registros</span>
                </div>
                <div style="overflow-x:auto;">
                    <table class="cli-movs-table">
                        <thead>
                            <tr>
                                <th>FECHA / HORA</th>
                                <th>CONCEPTO / COMPROBANTE</th>
                                <th>DÉBITO (FIADO +)</th>
                                <th>CRÉDITO (ABONO -)</th>
                                <th style="text-align:right;">SALDO / TICKET</th>
                            </tr>
                        </thead>
                        <tbody id="cli-det-movs-tbody">
                            ${filasMovs}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="cli-wa-box">
                <div class="cli-wa-top">
                    <strong>💬 Plantilla de Cobranza (WhatsApp)</strong>
                    <select id="cli-wa-tono" class="cli-select" style="padding:0.25rem 0.5rem; font-size:0.72rem;">
                        <option value="amigable" ${tonoActual === 'amigable' ? 'selected' : ''}>Tono Amigable</option>
                        <option value="formal" ${tonoActual === 'formal' ? 'selected' : ''}>Tono Formal / Vencido</option>
                    </select>
                </div>
                <textarea id="cli-wa-textarea" class="cli-wa-textarea" rows="3">${escaparHtmlCli(mensajeWa)}</textarea>
                <div class="cli-wa-actions">
                    <button type="button" class="cli-btn cli-btn-light cli-btn-sm" id="btn-det-copiar-wa">📋 Copiar</button>
                    <button type="button" class="cli-btn cli-btn-whatsapp cli-btn-sm" id="btn-det-enviar-wa">
                        ➤ Enviar Ahora (${escaparHtmlCli(cli.telefono || 'Elegir contacto')})
                    </button>
                </div>
            </div>
        </article>
    `;

    const abrirWa = () => {
        const txtFinal = document.getElementById('cli-wa-textarea')?.value.trim() || mensajeWa;
        const tel = String(cli.telefono || '').replace(/[^\d]/g, '');
        const url = tel
            ? `https://wa.me/${tel}?text=${encodeURIComponent(txtFinal)}`
            : `https://wa.me/?text=${encodeURIComponent(txtFinal)}`;
        window.open(url, '_blank', 'noopener');
    };
    document.getElementById('btn-det-wa-top')?.addEventListener('click', abrirWa);
    document.getElementById('btn-det-enviar-wa')?.addEventListener('click', abrirWa);

    document.getElementById('cli-wa-tono')?.addEventListener('change', (e) => {
        window.clientesState.tonoWa = e.target.value;
        const ta = document.getElementById('cli-wa-textarea');
        if (ta) ta.value = construirMensajeWhatsAppCliente(cli, e.target.value);
    });

    document.getElementById('btn-det-copiar-wa')?.addEventListener('click', async () => {
        const txt = document.getElementById('cli-wa-textarea')?.value || '';
        if (!txt) return;
        try {
            await navigator.clipboard.writeText(txt);
            const btn = document.getElementById('btn-det-copiar-wa');
            if (btn) {
                btn.textContent = '✅ Copiado';
                setTimeout(() => { btn.textContent = '📋 Copiar'; }, 1500);
            }
        } catch {
            alert('Selecciona el texto y cópialo con Ctrl + C.');
        }
    });

    document.getElementById('cli-chk-ticket-80mm')?.addEventListener('change', (e) => {
        window.clientesState.autoTicket80mm = e.target.checked;
        const btnConf = document.getElementById('btn-confirmar-abono-cli');
        if (btnConf) {
            btnConf.textContent = e.target.checked ? '🧾 Confirmar y Ticket (80mm)' : '✅ Confirmar Abono';
        }
    });

    panel.querySelectorAll('.cli-quick-amt-btn[data-set]').forEach(btn => {
        btn.addEventListener('click', () => {
            const inp = document.getElementById('cli-abono-monto');
            if (!inp) return;
            const montoFijo = parseFloat(btn.getAttribute('data-set')) || 0;
            inp.value = Math.min(saldo, montoFijo);
            inp.focus();
        });
    });

    document.getElementById('btn-abono-total')?.addEventListener('click', () => {
        const inp = document.getElementById('cli-abono-monto');
        if (inp) {
            inp.value = saldo;
            inp.focus();
        }
    });

    // Reimprimir ticket 80mm desde cualquier movimiento de abono
    document.getElementById('cli-det-movs-tbody')?.addEventListener('click', (e) => {
        const btnT = e.target.closest('.cli-mov-ticket-btn');
        if (!btnT) return;
        const movId = btnT.getAttribute('data-mov-id');
        const mov = movs.find(m => String(m.id) === String(movId));
        if (mov) generarTicketAbono80mm(cli, mov);
    });

    document.getElementById('btn-confirmar-abono-cli')?.addEventListener('click', registrarAbonoClienteActivo);
    document.getElementById('btn-det-estado-pdf')?.addEventListener('click', () => generarEstadoCuentaPdfCliente(cli));
    document.getElementById('btn-det-cargar-fiado')?.addEventListener('click', () => abrirModalCargarFiado(cli.id));
    document.getElementById('btn-det-editar-cli')?.addEventListener('click', () => abrirModalCliente(cli.id));
    document.getElementById('btn-det-editar-cupo')?.addEventListener('click', () => editarCupoRapidoCliente(cli.id));
}

/* ==========================================================================
   ETAPA 2 + 4: MOTOR DE ABONOS REALES + EMISIÓN DE TICKET 80MM
   ========================================================================== */
function registrarAbonoClienteActivo() {
    const clientes = obtenerClientesBoveda();
    const cli = clientes.find(c => c.id === window.clientesState.clienteActivoId);
    if (!cli) return;

    const saldoActual = Math.max(0, Number(cli.saldoActual) || 0);
    if (saldoActual <= 0) {
        alert('Este cliente ya tiene su cuenta corriente en $0.');
        return;
    }

    const inpMonto = document.getElementById('cli-abono-monto');
    const medio = document.getElementById('cli-abono-medio')?.value || 'Efectivo';
    const emitirTicket = document.getElementById('cli-chk-ticket-80mm')?.checked ?? true;
    const monto = Math.round((parseFloat(inpMonto?.value) || 0) * 100) / 100;

    if (monto <= 0) {
        alert('Ingresa un monto mayor a $0 para registrar el abono.');
        inpMonto?.focus();
        return;
    }

    if (monto > saldoActual) {
        alert(`El monto ingresado (${formatearMonedaCli(monto)}) supera la deuda actual de ${formatearMonedaCli(saldoActual)}.`);
        if (inpMonto) inpMonto.value = saldoActual;
        return;
    }

    const nuevoSaldo = Math.round(Math.max(0, saldoActual - monto) * 100) / 100;
    const fechaIso = new Date().toISOString();
    const movimiento = {
        id: 'mov-' + Date.now(),
        fecha: fechaIso,
        tipo: 'credito',
        concepto: `Abono ${medio}`,
        monto,
        medio,
        saldoAnterior: saldoActual,
        saldoResultante: nuevoSaldo
    };

    cli.saldoActual = nuevoSaldo;
    if (!Array.isArray(cli.movimientos)) cli.movimientos = [];
    cli.movimientos.unshift(movimiento);

    guardarClientesBoveda(clientes);
    registrarLogCobranzaGlobal({
        id: 'cob-' + Date.now(),
        fecha: fechaIso,
        tipoOperacion: 'cobro_cliente',
        clienteId: cli.id,
        entidadNombre: cli.nombre,
        cuenta: cli.cuenta || '',
        concepto: `Abono a cuenta corriente (${medio})`,
        monto,
        medio,
        saldoResultante: nuevoSaldo
    });

    renderizarTodoClientes();

    if (emitirTicket) {
        generarTicketAbono80mm(cli, movimiento);
    }

    alert(`✅ Abono de ${formatearMonedaCli(monto)} (${medio}) registrado para ${cli.nombre}.\nNuevo saldo: ${formatearMonedaCli(nuevoSaldo)} ARS.`);
}

/* ==========================================================================
   ETAPA 4: TICKET DE ABONO 80MM, ESTADO DE CUENTA PDF Y EXPORTACIÓN PDF / CSV
   ========================================================================== */
function generarTicketAbono80mm(cli, mov) {
    const jsPDFCtor = window.jspdf?.jsPDF;
    if (!jsPDFCtor) {
        alert('No se cargó la librería jsPDF para emitir el ticket 80mm.');
        return;
    }

    const comercio = obtenerDatosComercioCli();
    const doc = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: [80, 128] });
    const fechaTxt = new Date(mov.fecha).toLocaleString('es-AR');
    const saldoAnt = typeof mov.saldoAnterior === 'number'
        ? mov.saldoAnterior
        : Math.round(((Number(mov.saldoResultante) || 0) + (Number(mov.monto) || 0)) * 100) / 100;
    const compNum = String(mov.id || '').slice(-6).toUpperCase();

    let y = 9;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(comercio.nombre.toUpperCase(), 40, y, { align: 'center' });

    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('COMPROBANTE DE ABONO CTA. CTE.', 40, y, { align: 'center' });

    y += 4;
    doc.text(`Recibo #${compNum}  •  ${fechaTxt}`, 40, y, { align: 'center' });

    y += 4;
    doc.setDrawColor(148, 163, 184);
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.line(5, y, 75, y);

    // Datos del cliente
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Cliente: ${cli.nombre}`, 6, y);

    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(`Cuenta: ${cli.cuenta || '—'}   |   DNI: ${cli.dni || '—'}`, 6, y);

    y += 4.5;
    doc.text(`Medio de pago: ${mov.medio || 'Efectivo'}`, 6, y);

    y += 4.5;
    doc.line(5, y, 75, y);

    // Detalle financiero
    y += 7;
    doc.setFontSize(8.5);
    doc.text('Saldo anterior:', 6, y);
    doc.text(`${formatearMonedaCli(saldoAnt)}`, 74, y, { align: 'right' });

    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(4, 120, 87);
    doc.text('ABONO RECIBIDO:', 6, y);
    doc.text(`-${formatearMonedaCli(mov.monto)}`, 74, y, { align: 'right' });

    y += 5;
    doc.setLineDashPattern([], 0);
    doc.setDrawColor(15, 23, 42);
    doc.line(5, y, 75, y);

    y += 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('SALDO ACTUAL:', 6, y);
    doc.text(`${formatearMonedaCli(mov.saldoResultante)} ARS`, 74, y, { align: 'right' });

    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    const estadoTxt = Number(mov.saldoResultante) <= 0
        ? '¡Cuenta corriente saldada al día!'
        : `Cupo asignado: ${formatearMonedaCli(cli.cupoMaximo)}`;
    doc.text(estadoTxt, 40, y, { align: 'center' });

    y += 8;
    doc.setFont('helvetica', 'italic');
    doc.text('Documento no válido como factura fiscal.', 40, y, { align: 'center' });
    y += 4.5;
    doc.text('¡Muchas gracias por su pago!', 40, y, { align: 'center' });

    doc.save(`ticket-80mm-${slugArchivoCli(cli.nombre)}-${compNum.toLowerCase()}.pdf`);
}

function generarEstadoCuentaPdfCliente(cli) {
    const jsPDFCtor = window.jspdf?.jsPDF;
    if (!jsPDFCtor) {
        alert('No se cargó la librería jsPDF.');
        return;
    }

    const doc = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: 'a4' });
    const comercio = obtenerDatosComercioCli();
    const fechaHoy = new Date().toLocaleString('es-AR');
    const saldo = Math.max(0, Number(cli.saldoActual) || 0);
    const cupo = Math.max(0, Number(cli.cupoMaximo) || 0);
    const disponible = Math.max(0, Math.round((cupo - saldo) * 100) / 100);

    // Cabecera corporativa
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('ESTADO DE CUENTA CORRIENTE', 14, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(`${comercio.nombre}  •  Cuenta ${cli.cuenta || '—'}`, 14, 21);
    doc.text(`Emitido: ${fechaHoy}`, 196, 21, { align: 'right' });

    // Datos del cliente
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(cli.nombre, 14, 39);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`DNI/CUIT: ${cli.dni || '—'}   •   Tel: ${cli.telefono || '—'}`, 14, 45);
    doc.text(`Domicilio: ${cli.domicilio || 'No registrado'}`, 14, 50);

    // Resumen numérico a la derecha
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(132, 34, 64, 21, 2, 2, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('SALDO ACTUAL ADEUDADO', 136, 40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(saldo > 0 ? 185 : 4, saldo > 0 ? 28 : 120, saldo > 0 ? 28 : 87);
    doc.text(`${formatearMonedaCli(saldo)} ARS`, 136, 47);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Cupo: ${formatearMonedaCli(cupo)}  |  Disp.: ${formatearMonedaCli(disponible)}`, 136, 52);

    // Tabla de movimientos
    let y = 64;
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y - 5, 182, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('FECHA / HORA', 16, y);
    doc.text('CONCEPTO', 52, y);
    doc.text('DÉBITO (+)', 135, y, { align: 'right' });
    doc.text('CRÉDITO (-)', 165, y, { align: 'right' });
    doc.text('SALDO', 194, y, { align: 'right' });

    y += 8;
    const movs = Array.isArray(cli.movimientos) ? cli.movimientos : [];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);

    if (movs.length === 0) {
        doc.setTextColor(100, 116, 139);
        doc.text('Esta cuenta no registra movimientos hasta la fecha.', 16, y);
    } else {
        movs.forEach(m => {
            if (y > 275) {
                doc.addPage();
                y = 20;
            }
            const fTxt = new Date(m.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
            const esDebito = m.tipo === 'debito';
            const conceptoCorto = String(m.concepto || '').length > 36 ? String(m.concepto).slice(0, 35) + '…' : String(m.concepto || '');

            doc.setTextColor(15, 23, 42);
            doc.text(fTxt, 16, y);
            doc.text(conceptoCorto, 52, y);

            doc.setTextColor(esDebito ? 185 : 148, esDebito ? 28 : 163, esDebito ? 28 : 184);
            doc.text(esDebito ? `+${formatearMonedaCli(m.monto)}` : '—', 135, y, { align: 'right' });

            doc.setTextColor(!esDebito ? 4 : 148, !esDebito ? 120 : 163, !esDebito ? 87 : 184);
            doc.text(!esDebito ? `-${formatearMonedaCli(m.monto)}` : '—', 165, y, { align: 'right' });

            doc.setTextColor(15, 23, 42);
            doc.setFont('helvetica', 'bold');
            doc.text(formatearMonedaCli(m.saldoResultante), 194, y, { align: 'right' });
            doc.setFont('helvetica', 'normal');

            doc.setDrawColor(226, 232, 240);
            doc.line(14, y + 2.5, 196, y + 2.5);
            y += 7.5;
        });
    }

    doc.save(`estado-cuenta-${slugArchivoCli(cli.nombre)}.pdf`);
}

function obtenerClientesParaExportacion() {
    const modo = document.getElementById('exp-cli-filtro')?.value || 'deuda';
    const todos = obtenerClientesBoveda();

    if (modo === 'deuda') return todos.filter(c => (Number(c.saldoActual) || 0) > 0);
    if (modo === 'excedido') return todos.filter(c => evaluarEstadoCliente(c).excedido);
    return todos;
}

function abrirModalExportarClientes() {
    const modal = document.getElementById('modal-cli-exportar');
    if (!modal) return;

    actualizarContadoresModalExportar();
    modal.classList.add('active');
}

function cerrarModalExportarClientes() {
    document.getElementById('modal-cli-exportar')?.classList.remove('active');
}

function actualizarContadoresModalExportar() {
    const lista = obtenerClientesParaExportacion();
    const libro = construirLibroAuditadoCompleto();

    const bCli = document.getElementById('exp-cli-count-badge');
    const bHist = document.getElementById('exp-hist-count-badge');
    if (bCli) bCli.textContent = `${lista.length} ${lista.length === 1 ? 'cliente' : 'clientes'}`;
    if (bHist) bHist.textContent = `${libro.length} ${libro.length === 1 ? 'registro' : 'registros'}`;
}

function exportarListadoClientesPdf() {
    const jsPDFCtor = window.jspdf?.jsPDF;
    if (!jsPDFCtor) {
        alert('No se cargó la librería jsPDF.');
        return;
    }

    const lista = obtenerClientesParaExportacion().sort((a, b) => (Number(b.saldoActual) || 0) - (Number(a.saldoActual) || 0));
    if (lista.length === 0) {
        alert('No hay clientes para exportar con el filtro elegido.');
        return;
    }

    const doc = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: 'a4' });
    const comercio = obtenerDatosComercioCli();
    const fechaTxt = new Date().toLocaleString('es-AR');
    const totalDeuda = lista.reduce((acc, c) => acc + Math.max(0, Number(c.saldoActual) || 0), 0);

    doc.setFillColor(4, 120, 87);
    doc.rect(0, 0, 210, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('REPORTE DE CUENTAS CORRIENTES Y DEUDORES', 14, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`${comercio.nombre}  •  ${lista.length} clientes listados`, 14, 19);
    doc.text(`Fecha: ${fechaTxt}`, 196, 19, { align: 'right' });

    let y = 37;
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y - 5, 182, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('CUENTA / CLIENTE', 16, y);
    doc.text('TELÉFONO', 88, y);
    doc.text('ESTADO', 132, y);
    doc.text('CUPO', 164, y, { align: 'right' });
    doc.text('SALDO', 194, y, { align: 'right' });

    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);

    lista.forEach(c => {
        if (y > 272) {
            doc.addPage();
            y = 20;
        }
        const est = evaluarEstadoCliente(c);
        const saldo = Math.max(0, Number(c.saldoActual) || 0);
        const nom = `${c.cuenta || '—'} • ${c.nombre}`;

        doc.setTextColor(15, 23, 42);
        doc.text(nom.length > 34 ? nom.slice(0, 33) + '…' : nom, 16, y);
        doc.setTextColor(71, 85, 105);
        doc.text(String(c.telefono || '—'), 88, y);
        doc.text(est.etiqueta, 132, y);
        doc.text(formatearMonedaCli(c.cupoMaximo), 164, y, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(saldo > 0 ? 185 : 4, saldo > 0 ? 28 : 120, saldo > 0 ? 28 : 87);
        doc.text(formatearMonedaCli(saldo), 194, y, { align: 'right' });
        doc.setFont('helvetica', 'normal');

        doc.setDrawColor(226, 232, 240);
        doc.line(14, y + 2.5, 196, y + 2.5);
        y += 7.5;
    });

    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`TOTAL EN CALLE (LISTADO): ${formatearMonedaCli(totalDeuda)} ARS`, 194, y, { align: 'right' });

    doc.save(`reporte-clientes-${new Date().toISOString().slice(0, 10)}.pdf`);
    cerrarModalExportarClientes();
}

function descargarCsvTexto(nombreArchivo, filas) {
    const escaparCelda = (val) => {
        const str = String(val ?? '').replace(/"/g, '""');
        return `"${str}"`;
    };
    const contenido = '\uFEFF' + filas.map(f => f.map(escaparCelda).join(';')).join('\r\n');
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nombreArchivo;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function exportarListadoClientesCsv() {
    const lista = obtenerClientesParaExportacion();
    if (lista.length === 0) {
        alert('No hay clientes para exportar con el filtro elegido.');
        return;
    }

    const filas = [
        ['Cuenta', 'Nombre', 'DNI / CUIT', 'Teléfono', 'Domicilio', 'VIP', 'Cupo Máximo (ARS)', 'Saldo Actual (ARS)', 'Disponible (ARS)', 'Estado']
    ];

    lista.forEach(c => {
        const saldo = Math.max(0, Number(c.saldoActual) || 0);
        const cupo = Math.max(0, Number(c.cupoMaximo) || 0);
        const disp = Math.max(0, Math.round((cupo - saldo) * 100) / 100);
        const est = evaluarEstadoCliente(c);
        filas.push([
            c.cuenta || '',
            c.nombre || '',
            c.dni || '',
            c.telefono || '',
            c.domicilio || '',
            c.vip ? 'Sí' : 'No',
            cupo,
            saldo,
            disp,
            est.etiqueta
        ]);
    });

    descargarCsvTexto(`clientes-cuentas-corrientes-${new Date().toISOString().slice(0, 10)}.csv`, filas);
    cerrarModalExportarClientes();
}

function exportarHistorialAuditadoCsv() {
    const libro = construirLibroAuditadoCompleto();
    if (libro.length === 0) {
        alert('Todavía no hay movimientos de cobros o pagos para exportar.');
        return;
    }

    const filas = [
        ['Fecha y Hora', 'Tipo', 'Entidad', 'Referencia', 'Concepto', 'Medio de Pago', 'Monto (ARS)']
    ];

    libro.forEach(r => {
        const esIng = r.tipoOperacion === 'cobro_cliente';
        filas.push([
            new Date(r.fecha).toLocaleString('es-AR'),
            esIng ? 'Cobro Cliente' : 'Pago Proveedor',
            r.entidad,
            r.subEntidad,
            r.concepto,
            r.medio,
            esIng ? r.monto : -r.monto
        ]);
    });

    descargarCsvTexto(`libro-auditado-pagos-${new Date().toISOString().slice(0, 10)}.csv`, filas);
    cerrarModalExportarClientes();
}

/* ==========================================================================
   ETAPA 2: MODAL CREAR / EDITAR / ELIMINAR CLIENTE
   ========================================================================== */
function generarCodigoCuentaCliente() {
    const clientes = obtenerClientesBoveda();
    return `AC${String(100 + clientes.length + 1).padStart(3, '0')}`;
}

function abrirModalCliente(clienteId = null) {
    const modal = document.getElementById('modal-cli-ficha');
    if (!modal) return;

    const cli = clienteId ? obtenerClientesBoveda().find(c => c.id === clienteId) : null;
    window.clientesState.editandoClienteId = cli ? cli.id : null;

    document.getElementById('form-cli-ficha')?.reset();

    const fieldSaldoIni = document.getElementById('cli-field-saldo-inicial');
    const deleteZone = document.getElementById('cli-delete-zone');

    if (cli) {
        document.getElementById('modal-cli-ficha-title').textContent = `✏️ Editar Cliente • ${cli.nombre}`;
        document.getElementById('modal-cli-ficha-sub').textContent = `Cuenta ${cli.cuenta || '—'} • Saldo actual: ${formatearMonedaCli(cli.saldoActual)}`;
        document.getElementById('btn-guardar-cli').textContent = '✅ Guardar Cambios';

        document.getElementById('cli-inp-nombre').value = cli.nombre || '';
        document.getElementById('cli-inp-dni').value = cli.dni || '';
        document.getElementById('cli-inp-telefono').value = cli.telefono || '';
        document.getElementById('cli-inp-domicilio').value = cli.domicilio || '';
        document.getElementById('cli-inp-cupo').value = cli.cupoMaximo ?? 20000;
        document.getElementById('cli-inp-cuenta').value = cli.cuenta || '';
        document.getElementById('cli-inp-vip').checked = !!cli.vip;
        document.getElementById('cli-inp-bloqueado').checked = !!cli.bloqueadoPos;

        if (fieldSaldoIni) fieldSaldoIni.style.display = 'none';

        if (deleteZone) {
            const tieneDeuda = (Number(cli.saldoActual) || 0) > 0;
            if (tieneDeuda) {
                deleteZone.innerHTML = `<span class="cli-lock-note" title="El cliente debe tener saldo $0 para eliminarse">🔒 Con deuda (${formatearMonedaCli(cli.saldoActual)}) — No eliminable</span>`;
            } else {
                deleteZone.innerHTML = `<button type="button" class="cli-btn cli-btn-danger-soft cli-btn-sm" id="btn-eliminar-cli-modal">🗑️ Eliminar Cliente</button>`;
                document.getElementById('btn-eliminar-cli-modal')?.addEventListener('click', () => eliminarClienteSinDeuda(cli.id));
            }
        }
    } else {
        document.getElementById('modal-cli-ficha-title').textContent = '👤 Nuevo Cliente / Cuenta Corriente';
        document.getElementById('modal-cli-ficha-sub').textContent = 'Configura los datos de contacto y el límite crediticio para fiados.';
        document.getElementById('btn-guardar-cli').textContent = '💾 Crear Cliente';

        document.getElementById('cli-inp-cupo').value = '20000';
        document.getElementById('cli-inp-cuenta').value = generarCodigoCuentaCliente();
        document.getElementById('cli-inp-saldo-inicial').value = '0';

        if (fieldSaldoIni) fieldSaldoIni.style.display = 'flex';
        if (deleteZone) deleteZone.innerHTML = '';
    }

    modal.classList.add('active');
    document.getElementById('cli-inp-nombre')?.focus();
}

function cerrarModalCliente() {
    document.getElementById('modal-cli-ficha')?.classList.remove('active');
    window.clientesState.editandoClienteId = null;
}

function guardarClienteFormulario(e) {
    e.preventDefault();

    const nombre = document.getElementById('cli-inp-nombre').value.trim();
    if (!nombre) {
        alert('Ingresa el nombre del cliente.');
        return;
    }

    const dni = document.getElementById('cli-inp-dni').value.trim();
    const telefono = document.getElementById('cli-inp-telefono').value.trim();
    const domicilio = document.getElementById('cli-inp-domicilio').value.trim();
    const cupoMaximo = Math.max(0, parseFloat(document.getElementById('cli-inp-cupo').value) || 0);
    const cuenta = document.getElementById('cli-inp-cuenta').value.trim() || generarCodigoCuentaCliente();
    const vip = document.getElementById('cli-inp-vip').checked;
    const bloqueadoPos = document.getElementById('cli-inp-bloqueado').checked;

    const clientes = obtenerClientesBoveda();
    const editId = window.clientesState.editandoClienteId;

    if (editId) {
        const idx = clientes.findIndex(c => c.id === editId);
        if (idx !== -1) {
            clientes[idx] = { ...clientes[idx], nombre, dni, telefono, domicilio, cupoMaximo, cuenta, vip, bloqueadoPos };
        }
        window.clientesState.clienteActivoId = editId;
    } else {
        const saldoInicial = Math.round(Math.max(0, parseFloat(document.getElementById('cli-inp-saldo-inicial')?.value) || 0) * 100) / 100;
        const nuevoId = 'cli-' + Date.now();
        const movsIniciales = saldoInicial > 0
            ? [{
                id: 'mov-' + Date.now(),
                fecha: new Date().toISOString(),
                tipo: 'debito',
                concepto: 'Saldo inicial de apertura',
                monto: saldoInicial,
                medio: 'Cuenta Corriente',
                saldoResultante: saldoInicial
            }]
            : [];

        clientes.unshift({
            id: nuevoId,
            cuenta,
            nombre,
            dni,
            telefono,
            domicilio,
            vip,
            cupoMaximo,
            bloqueadoPos,
            saldoActual: saldoInicial,
            movimientos: movsIniciales
        });
        window.clientesState.clienteActivoId = nuevoId;
    }

    guardarClientesBoveda(clientes);
    cerrarModalCliente();
    renderizarTodoClientes();
}

function eliminarClienteSinDeuda(clienteId) {
    const clientes = obtenerClientesBoveda();
    const cli = clientes.find(c => c.id === clienteId);
    if (!cli) return;

    if ((Number(cli.saldoActual) || 0) > 0) {
        alert('No se puede eliminar un cliente que tiene saldo deudor pendiente.');
        return;
    }

    if (!confirm(`¿Eliminar permanentemente a "${cli.nombre}" (Cuenta ${cli.cuenta})?`)) return;

    const restantes = clientes.filter(c => c.id !== clienteId);
    guardarClientesBoveda(restantes);
    window.clientesState.clienteActivoId = restantes.length > 0 ? restantes[0].id : null;
    cerrarModalCliente();
    renderizarTodoClientes();
}

/* ==========================================================================
   ETAPA 2: CARGA MANUAL DE FIADO
   ========================================================================== */
function abrirModalCargarFiado(clienteId) {
    const cli = obtenerClientesBoveda().find(c => c.id === clienteId);
    if (!cli) return;

    window.clientesState.fiadoClienteId = cli.id;
    document.getElementById('form-cli-fiado')?.reset();
    document.getElementById('modal-fiado-sub').textContent = `${cli.nombre} • Cuenta ${cli.cuenta || '—'}`;
    document.getElementById('fiado-saldo-actual').textContent = formatearMonedaCli(cli.saldoActual);
    document.getElementById('fiado-cupo-max').textContent = formatearMonedaCli(cli.cupoMaximo);

    actualizarPreviewFiadoManual();
    document.getElementById('modal-cli-fiado')?.classList.add('active');
    document.getElementById('fiado-monto')?.focus();
}

function cerrarModalCargarFiado() {
    document.getElementById('modal-cli-fiado')?.classList.remove('active');
    window.clientesState.fiadoClienteId = null;
}

function actualizarPreviewFiadoManual() {
    const cli = obtenerClientesBoveda().find(c => c.id === window.clientesState.fiadoClienteId);
    if (!cli) return;

    const saldoActual = Math.max(0, Number(cli.saldoActual) || 0);
    const cupo = Math.max(0, Number(cli.cupoMaximo) || 0);
    const monto = Math.max(0, parseFloat(document.getElementById('fiado-monto')?.value) || 0);
    const nuevoSaldo = Math.round((saldoActual + monto) * 100) / 100;
    const excede = cupo > 0 && nuevoSaldo > cupo;

    document.getElementById('fiado-nuevo-saldo').textContent = `${formatearMonedaCli(nuevoSaldo)} ARS`;
    const box = document.getElementById('fiado-preview-box');
    const warn = document.getElementById('fiado-preview-warn');
    if (box) box.classList.toggle('is-over', excede);
    if (warn) {
        warn.textContent = excede
            ? `⚠️ Supera el cupo asignado (${formatearMonedaCli(cupo)}) por ${formatearMonedaCli(nuevoSaldo - cupo)}.`
            : 'Dentro del límite de crédito asignado.';
    }
}

function guardarFiadoManualFormulario(e) {
    e.preventDefault();

    const clientes = obtenerClientesBoveda();
    const cli = clientes.find(c => c.id === window.clientesState.fiadoClienteId);
    if (!cli) return;

    const monto = Math.round((parseFloat(document.getElementById('fiado-monto')?.value) || 0) * 100) / 100;
    const concepto = document.getElementById('fiado-concepto')?.value.trim() || 'Consumo Fiado Manual';

    if (monto <= 0) {
        alert('Ingresa un monto mayor a $0.');
        return;
    }

    const nuevoSaldo = Math.round(((Number(cli.saldoActual) || 0) + monto) * 100) / 100;
    const cupo = Math.max(0, Number(cli.cupoMaximo) || 0);

    if (cupo > 0 && nuevoSaldo > cupo) {
        const ok = confirm(`⚠️ Este fiado llevará el saldo de ${cli.nombre} a ${formatearMonedaCli(nuevoSaldo)}, superando su cupo de ${formatearMonedaCli(cupo)}.\n\n¿Deseas autorizar y registrarlo igual?`);
        if (!ok) return;
    }

    cli.saldoActual = nuevoSaldo;
    if (!Array.isArray(cli.movimientos)) cli.movimientos = [];
    cli.movimientos.unshift({
        id: 'mov-' + Date.now(),
        fecha: new Date().toISOString(),
        tipo: 'debito',
        concepto,
        monto,
        medio: 'Cuenta Corriente',
        saldoResultante: nuevoSaldo
    });

    guardarClientesBoveda(clientes);
    cerrarModalCargarFiado();
    renderizarTodoClientes();
}

/* ==========================================================================
   ETAPA 2: EDICIÓN RÁPIDA DE CUPO Y BLOQUEO POS
   ========================================================================== */
function editarCupoRapidoCliente(clienteId) {
    const cli = obtenerClientesBoveda().find(c => c.id === clienteId);
    if (!cli) return;

    window.clientesState.cupoClienteId = cli.id;
    document.getElementById('modal-cupo-sub').textContent = `${cli.nombre} • Saldo actual: ${formatearMonedaCli(cli.saldoActual)}`;
    document.getElementById('cupo-rapido-val').value = cli.cupoMaximo ?? 0;
    document.getElementById('cupo-rapido-bloqueo').checked = !!cli.bloqueadoPos;

    document.getElementById('modal-cli-cupo')?.classList.add('active');
    document.getElementById('cupo-rapido-val')?.focus();
}

function cerrarModalCupoRapido() {
    document.getElementById('modal-cli-cupo')?.classList.remove('active');
    window.clientesState.cupoClienteId = null;
}

function guardarCupoRapidoFormulario(e) {
    e.preventDefault();

    const clientes = obtenerClientesBoveda();
    const cli = clientes.find(c => c.id === window.clientesState.cupoClienteId);
    if (!cli) return;

    cli.cupoMaximo = Math.max(0, parseFloat(document.getElementById('cupo-rapido-val')?.value) || 0);
    cli.bloqueadoPos = !!document.getElementById('cupo-rapido-bloqueo')?.checked;

    guardarClientesBoveda(clientes);
    cerrarModalCupoRapido();
    renderizarTodoClientes();
}

/* ==========================================================================
   ETAPA 3: PROVEEDORES & CUENTAS POR PAGAR (SINCRONIZADO CON CONTROL DE STOCK)
   ========================================================================== */
function renderizarBloqueProveedoresPorPagar() {
    const todas = obtenerTodasCuentasPagarCli();
    const pendientes = todas.filter(d => (Number(d.deudaPendiente) || 0) > 0);
    const previewCont = document.getElementById('cli-prov-debts-preview');
    const fullCont = document.getElementById('cli-prov-debts-full');
    const summaryBadge = document.getElementById('cli-cxp-summary-badge');

    const totalPend = pendientes.reduce((acc, d) => acc + (Number(d.deudaPendiente) || 0), 0);
    if (summaryBadge) {
        summaryBadge.textContent = `${formatearMonedaCli(totalPend)} pendiente (${pendientes.length})`;
    }

    const construirTarjetas = (lista, msgVacio) => {
        if (lista.length === 0) {
            return `
                <div style="grid-column: 1 / -1; text-align:center; padding: 1.5rem; color:#64748b; font-size:0.82rem; background:#f8fafc; border-radius:10px; border:1px dashed #cbd5e1;">
                    ${msgVacio}
                </div>
            `;
        }

        return lista.map(d => {
            const fechaTxt = new Date(d.fecha).toLocaleDateString('es-AR');
            const deuda = Math.max(0, Number(d.deudaPendiente) || 0);
            const saldado = deuda <= 0;
            const cantPagos = Array.isArray(d.pagos) ? d.pagos.length : 0;

            return `
                <article class="cli-cxp-card ${saldado ? 'is-paid' : ''}">
                    <div class="cli-cxp-top">
                        <div>
                            <strong style="font-size:0.92rem;">${escaparHtmlCli(d.proveedorNombre)}</strong>
                            <div style="font-size:0.72rem; color:#64748b;">
                                Orden ${escaparHtmlCli(d.codigoOrden || '—')} • ${fechaTxt}
                                ${d.comprobante ? `• Fac: ${escaparHtmlCli(d.comprobante)}` : ''}
                            </div>
                        </div>
                        <span class="cli-status-pill ${saldado ? 'st-aldia' : 'st-alerta'}">${saldado ? '✅ Saldada' : 'Pendiente'}</span>
                    </div>
                    <div class="cli-cxp-mid">
                        <span>${saldado ? 'Total liquidado:' : 'Deuda por liquidar:'}</span>
                        <strong class="${saldado ? 'text-emerald' : 'text-danger'}">${formatearMonedaCli(saldado ? d.totalGeneral : deuda)} ARS</strong>
                    </div>
                    <div class="cli-cxp-foot">
                        <span>Total: ${formatearMonedaCli(d.totalGeneral)} • Entregado: ${formatearMonedaCli(d.montoEntregado)} (${cantPagos} ${cantPagos === 1 ? 'pago' : 'pagos'})</span>
                        ${!saldado
                            ? `<button type="button" class="cli-btn cli-btn-primary cli-btn-sm btn-cli-liquidar-cxp" data-cxp-id="${escaparHtmlCli(d.id)}">💳 Liquidar / Abonar</button>`
                            : `<span class="text-emerald" style="font-weight:700;">Sincronizado en Stock ✓</span>`
                        }
                    </div>
                </article>
            `;
        }).join('');
    };

    if (previewCont) {
        previewCont.innerHTML = construirTarjetas(
            pendientes.slice(0, 2),
            '✅ No tienes deudas pendientes con proveedores. Las compras con saldo pendiente de Control de Stock aparecerán aquí automáticamente.'
        );
    }

    if (fullCont) {
        const st = window.clientesState;
        const q = (st.cxpBusqueda || '').trim().toLowerCase();
        const filtradas = todas.filter(d => {
            const deuda = Math.max(0, Number(d.deudaPendiente) || 0);
            if (st.cxpFiltroEstado === 'pendientes' && deuda <= 0) return false;
            if (st.cxpFiltroEstado === 'saldadas' && deuda > 0) return false;
            if (q) {
                const corpus = `${d.proveedorNombre || ''} ${d.codigoOrden || ''} ${d.comprobante || ''} ${d.notas || ''}`.toLowerCase();
                if (!corpus.includes(q)) return false;
            }
            return true;
        });

        fullCont.innerHTML = construirTarjetas(
            filtradas,
            'No hay facturas de proveedores que coincidan con este filtro.'
        );
    }
}

function abrirModalLiquidarProveedor(cxpId) {
    const cuenta = obtenerTodasCuentasPagarCli().find(c => c.id === cxpId);
    if (!cuenta) return;

    const deuda = Math.max(0, Number(cuenta.deudaPendiente) || 0);
    if (deuda <= 0) {
        alert('Esta cuenta ya se encuentra saldada.');
        return;
    }

    window.clientesState.cxpLiquidandoId = cuenta.id;
    document.getElementById('form-cli-liquidar-cxp')?.reset();
    document.getElementById('modal-cxp-sub').textContent = `${cuenta.codigoOrden || 'Orden'} • ${cuenta.proveedorNombre}`;
    document.getElementById('cxp-total-orig').textContent = `${formatearMonedaCli(cuenta.totalGeneral)} ARS`;
    document.getElementById('cxp-deuda-actual').textContent = `${formatearMonedaCli(deuda)} ARS`;
    document.getElementById('cxp-monto-pagar').value = deuda;
    document.getElementById('cxp-medio-pago').value = 'Transferencia';

    const aliasBar = document.getElementById('cxp-alias-bar');
    const aliasVal = document.getElementById('cxp-alias-val');
    if (aliasBar && aliasVal) {
        if (cuenta.proveedorAlias) {
            aliasVal.textContent = cuenta.proveedorAlias;
            aliasBar.style.display = 'flex';
        } else {
            aliasBar.style.display = 'none';
        }
    }

    const prevBox = document.getElementById('cxp-pagos-previos-box');
    const pagosPrev = Array.isArray(cuenta.pagos) ? cuenta.pagos : [];
    if (prevBox) {
        if (pagosPrev.length > 0) {
            prevBox.style.display = 'flex';
            prevBox.innerHTML = `<strong>Entregas anteriores (${pagosPrev.length})</strong>` + pagosPrev.map(pg => `
                <div class="cli-cxp-prev-row">
                    <span>${new Date(pg.fecha).toLocaleDateString('es-AR')} • ${escaparHtmlCli(pg.medio)} ${pg.nota ? `(${escaparHtmlCli(pg.nota)})` : ''}</span>
                    <strong class="text-emerald">${formatearMonedaCli(pg.monto)}</strong>
                </div>
            `).join('');
        } else {
            prevBox.style.display = 'none';
        }
    }

    actualizarPreviewLiquidacionCxp();
    document.getElementById('modal-cli-liquidar-cxp')?.classList.add('active');
    document.getElementById('cxp-monto-pagar')?.focus();
}

function cerrarModalLiquidarProveedor() {
    document.getElementById('modal-cli-liquidar-cxp')?.classList.remove('active');
    window.clientesState.cxpLiquidandoId = null;
}

function actualizarPreviewLiquidacionCxp() {
    const cuenta = obtenerTodasCuentasPagarCli().find(c => c.id === window.clientesState.cxpLiquidandoId);
    if (!cuenta) return;

    const deuda = Math.max(0, Number(cuenta.deudaPendiente) || 0);
    const pago = Math.min(deuda, Math.max(0, parseFloat(document.getElementById('cxp-monto-pagar')?.value) || 0));
    const restante = Math.round(Math.max(0, deuda - pago) * 100) / 100;

    document.getElementById('cxp-deuda-restante').textContent = `${formatearMonedaCli(restante)} ARS`;
    const box = document.getElementById('cxp-preview-box');
    const hint = document.getElementById('cxp-preview-hint');
    if (box) box.classList.toggle('is-over', restante > 0);
    if (hint) {
        hint.textContent = restante <= 0
            ? '✅ La deuda quedará en $0 y el pedido pasará a Saldado en Control de Stock.'
            : 'Pago parcial: el saldo restante seguirá pendiente hasta completarse.';
    }
}

function confirmarLiquidacionProveedorFormulario(e) {
    e.preventDefault();

    const cuentas = obtenerTodasCuentasPagarCli();
    const cuenta = cuentas.find(c => c.id === window.clientesState.cxpLiquidandoId);
    if (!cuenta) return;

    const deudaActual = Math.max(0, Number(cuenta.deudaPendiente) || 0);
    const monto = Math.round((parseFloat(document.getElementById('cxp-monto-pagar')?.value) || 0) * 100) / 100;
    const medio = document.getElementById('cxp-medio-pago')?.value || 'Transferencia';
    const nota = document.getElementById('cxp-nota-pago')?.value.trim() || 'Liquidación desde Cuentas Corrientes';

    if (monto <= 0) {
        alert('Ingresa un monto mayor a $0.');
        return;
    }

    if (monto > deudaActual) {
        alert(`El monto (${formatearMonedaCli(monto)}) supera el saldo pendiente de ${formatearMonedaCli(deudaActual)}.`);
        document.getElementById('cxp-monto-pagar').value = deudaActual;
        actualizarPreviewLiquidacionCxp();
        return;
    }

    const fechaIso = new Date().toISOString();
    const nuevoEntregado = Math.round(((Number(cuenta.montoEntregado) || 0) + monto) * 100) / 100;
    const nuevaDeuda = Math.round(Math.max(0, deudaActual - monto) * 100) / 100;

    cuenta.montoEntregado = nuevoEntregado;
    cuenta.deudaPendiente = nuevaDeuda;
    cuenta.estado = nuevaDeuda <= 0 ? 'pagado' : 'pendiente';
    if (!Array.isArray(cuenta.pagos)) cuenta.pagos = [];
    cuenta.pagos.push({ fecha: fechaIso, monto, medio, nota });

    guardarTodasCuentasPagarCli(cuentas);

    try {
        const pedidos = JSON.parse(localStorage.getItem(STORAGE_KEY_CLI_PEDIDOS) || '[]');
        if (Array.isArray(pedidos)) {
            const ped = pedidos.find(p => p.id === cuenta.pedidoId || p.codigo === cuenta.codigoOrden);
            if (ped && ped.pagoInfo) {
                ped.pagoInfo.montoEntregado = nuevoEntregado;
                ped.pagoInfo.deudaPendiente = nuevaDeuda;
                ped.pagoInfo.fechaUltimoPago = fechaIso;
                localStorage.setItem(STORAGE_KEY_CLI_PEDIDOS, JSON.stringify(pedidos));
            }
        }
    } catch (err) {
        console.warn('No se pudo sincronizar el pedido en Control de Stock:', err);
    }

    cerrarModalLiquidarProveedor();
    renderizarTodoClientes();

    const txtEstado = nuevaDeuda <= 0
        ? '✅ Deuda saldada al 100%. El pedido ya figura como Saldado en Control de Stock.'
        : `Saldo restante con ${cuenta.proveedorNombre}: ${formatearMonedaCli(nuevaDeuda)} ARS.`;

    alert(`💳 Pago de ${formatearMonedaCli(monto)} (${medio}) registrado para ${cuenta.proveedorNombre}.\n${txtEstado}`);
}

/* ==========================================================================
   ETAPA 3: HISTORIAL AUDITADO UNIFICADO (CLIENTES + PROVEEDORES)
   ========================================================================== */
function construirLibroAuditadoCompleto() {
    const registros = [];

    obtenerClientesBoveda().forEach(cli => {
        (cli.movimientos || []).forEach(m => {
            if (m.tipo !== 'credito') return;
            registros.push({
                id: `cli-${cli.id}-${m.id}`,
                fecha: m.fecha,
                tipoOperacion: 'cobro_cliente',
                entidad: cli.nombre,
                subEntidad: `Cuenta ${cli.cuenta || '—'}`,
                concepto: m.concepto || 'Abono de cliente',
                medio: m.medio || 'Efectivo',
                monto: Math.max(0, Number(m.monto) || 0)
            });
        });
    });

    obtenerTodasCuentasPagarCli().forEach(cxp => {
        const pagos = Array.isArray(cxp.pagos) ? cxp.pagos : [];
        if (pagos.length > 0) {
            pagos.forEach((pg, idx) => {
                registros.push({
                    id: `cxp-${cxp.id}-${idx}`,
                    fecha: pg.fecha || cxp.fecha,
                    tipoOperacion: 'pago_proveedor',
                    entidad: cxp.proveedorNombre,
                    subEntidad: `${cxp.codigoOrden || 'Orden'}${cxp.comprobante ? ` • ${cxp.comprobante}` : ''}`,
                    concepto: pg.nota || 'Pago a proveedor',
                    medio: pg.medio || cxp.medioPago || 'Efectivo',
                    monto: Math.max(0, Number(pg.monto) || 0)
                });
            });
        } else if ((Number(cxp.montoEntregado) || 0) > 0) {
            registros.push({
                id: `cxp-${cxp.id}-base`,
                fecha: cxp.fecha,
                tipoOperacion: 'pago_proveedor',
                entidad: cxp.proveedorNombre,
                subEntidad: cxp.codigoOrden || 'Orden',
                concepto: 'Pago en recepción de mercadería',
                medio: cxp.medioPago || 'Efectivo',
                monto: Math.max(0, Number(cxp.montoEntregado) || 0)
            });
        }
    });

    registros.sort((a, b) => (new Date(b.fecha).getTime() || 0) - (new Date(a.fecha).getTime() || 0));
    return registros;
}

function renderizarHistorialAuditadoClientes() {
    const tbody = document.getElementById('cli-hist-tbody');
    if (!tbody) return;

    const st = window.clientesState;
    const todos = construirLibroAuditadoCompleto();
    const q = (st.histBusqueda || '').trim().toLowerCase();
    const ahora = new Date();
    const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();

    const filtrados = todos.filter(r => {
        if (st.histFiltroTipo !== 'todos' && r.tipoOperacion !== st.histFiltroTipo) return false;
        if (st.histFiltroMedio !== 'todos' && (r.medio || '').toLowerCase() !== st.histFiltroMedio.toLowerCase()) return false;

        if (st.histFiltroPeriodo !== 'todos') {
            const ts = new Date(r.fecha).getTime();
            if (st.histFiltroPeriodo === 'hoy' && ts < inicioHoy) return false;
            if (st.histFiltroPeriodo === '7d' && (ahora.getTime() - ts) > 7 * 86400000) return false;
            if (st.histFiltroPeriodo === '30d' && (ahora.getTime() - ts) > 30 * 86400000) return false;
        }

        if (q) {
            const corpus = `${r.entidad} ${r.subEntidad} ${r.concepto} ${r.medio}`.toLowerCase();
            if (!corpus.includes(q)) return false;
        }
        return true;
    });

    let totalIng = 0;
    let totalEgr = 0;
    filtrados.forEach(r => {
        if (r.tipoOperacion === 'cobro_cliente') totalIng += r.monto;
        else totalEgr += r.monto;
    });
    const neto = Math.round((totalIng - totalEgr) * 100) / 100;

    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    setTxt('hist-stat-ingresos', `+${formatearMonedaCli(totalIng)} ARS`);
    setTxt('hist-stat-egresos', `-${formatearMonedaCli(totalEgr)} ARS`);

    const elNeto = document.getElementById('hist-stat-neto');
    if (elNeto) {
        elNeto.textContent = `${neto >= 0 ? '+' : '-'}${formatearMonedaCli(Math.abs(neto))} ARS`;
        elNeto.className = neto >= 0 ? 'text-emerald' : 'text-danger';
    }
    setTxt('cli-hist-count-lbl', `${filtrados.length} ${filtrados.length === 1 ? 'registro' : 'registros'}`);

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:#64748b;">No hay movimientos registrados con los filtros actuales.</td></tr>`;
        const wrapMas = document.getElementById('cli-hist-load-more-wrap');
        if (wrapMas) wrapMas.style.display = 'none';
        return;
    }

    const visibles = filtrados.slice(0, st.histLimite);
    const restantes = filtrados.length - visibles.length;

    tbody.innerHTML = visibles.map(r => {
        const fechaTxt = new Date(r.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
        const esIngreso = r.tipoOperacion === 'cobro_cliente';

        return `
            <tr>
                <td style="white-space:nowrap;">${fechaTxt}</td>
                <td>
                    <span class="cli-type-pill ${esIngreso ? 'in' : 'out'}">
                        ${esIngreso ? '▲ Cobro Cliente' : '▼ Pago Proveedor'}
                    </span>
                </td>
                <td>
                    <strong>${escaparHtmlCli(r.entidad)}</strong>
                    <div style="font-size:0.7rem; color:#64748b;">${escaparHtmlCli(r.subEntidad)}</div>
                </td>
                <td>${escaparHtmlCli(r.concepto)}</td>
                <td><span class="cli-subtab-badge badge-slate">${escaparHtmlCli(r.medio)}</span></td>
                <td style="text-align:right; font-weight:800;" class="${esIngreso ? 'text-emerald' : 'text-danger'}">
                    ${esIngreso ? '+' : '-'}${formatearMonedaCli(r.monto)}
                </td>
            </tr>
        `;
    }).join('');

    const wrapMas = document.getElementById('cli-hist-load-more-wrap');
    const btnMas = document.getElementById('btn-cli-hist-mas');
    if (wrapMas && btnMas) {
        if (restantes > 0) {
            wrapMas.style.display = 'flex';
            btnMas.textContent = `⬇️ Cargar más movimientos (quedan ${restantes})`;
        } else {
            wrapMas.style.display = 'none';
        }
    }
}

/* ==========================================================================
   EVENTOS DEL MÓDULO (ETAPAS 1 A 4 COMPLETAS)
   ========================================================================== */
function inicializarEventosClientes() {
    // Sub-pestañas
    document.querySelectorAll('.cli-subtab').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-clitab');
            window.clientesState.subtabActiva = tab;

            document.querySelectorAll('.cli-subtab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.cli-tab-view').forEach(v => v.classList.remove('active'));
            document.getElementById(`cli-view-${tab}`)?.classList.add('active');

            if (tab === 'proveedores') renderizarBloqueProveedoresPorPagar();
            if (tab === 'historial') renderizarHistorialAuditadoClientes();
        });
    });

    // Buscador principal y atajo F2
    document.getElementById('cli-search-input')?.addEventListener('input', (e) => {
        window.clientesState.busqueda = e.target.value;
        renderizarDirectorioClientes();
        renderizarDetalleCliente();
    });

    if (!clientesF2Registrado) {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F2' && document.getElementById('clientes-module-root')) {
                e.preventDefault();
                const inp = document.getElementById('cli-search-input');
                if (inp) {
                    inp.focus();
                    inp.select();
                }
            }
        });
        clientesF2Registrado = true;
    }

    // Ordenamiento clientes
    document.getElementById('cli-sort-select')?.addEventListener('change', (e) => {
        window.clientesState.orden = e.target.value;
        renderizarDirectorioClientes();
        renderizarDetalleCliente();
    });

    // Selección de cliente
    document.getElementById('cli-directory-list')?.addEventListener('click', (e) => {
        const card = e.target.closest('.cli-item-card');
        if (!card) return;
        window.clientesState.clienteActivoId = card.getAttribute('data-cli-id');
        renderizarDirectorioClientes();
        renderizarDetalleCliente();
    });

    // Navegación rápida
    document.getElementById('btn-cli-ver-todas-cxp')?.addEventListener('click', () => {
        document.querySelector('.cli-subtab[data-clitab="proveedores"]')?.click();
    });
    document.getElementById('btn-cli-ir-stock')?.addEventListener('click', () => {
        document.querySelector('.nav-link[data-vista="control-stock"]')?.click();
    });

    // Modal Alta / Edición de Cliente (Etapa 2A)
    document.getElementById('btn-cli-nuevo')?.addEventListener('click', () => abrirModalCliente(null));
    document.getElementById('btn-cerrar-modal-cli')?.addEventListener('click', cerrarModalCliente);
    document.getElementById('btn-cancelar-modal-cli')?.addEventListener('click', cerrarModalCliente);
    document.getElementById('modal-cli-ficha')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-cli-ficha') cerrarModalCliente();
    });
    document.getElementById('form-cli-ficha')?.addEventListener('submit', guardarClienteFormulario);

    // Modal Carga Manual de Fiado (Etapa 2B)
    document.getElementById('btn-cerrar-modal-fiado')?.addEventListener('click', cerrarModalCargarFiado);
    document.getElementById('btn-cancelar-modal-fiado')?.addEventListener('click', cerrarModalCargarFiado);
    document.getElementById('modal-cli-fiado')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-cli-fiado') cerrarModalCargarFiado();
    });
    document.getElementById('fiado-monto')?.addEventListener('input', actualizarPreviewFiadoManual);
    document.getElementById('form-cli-fiado')?.addEventListener('submit', guardarFiadoManualFormulario);

    // Modal Edición Rápida de Cupo (Etapa 2C)
    document.getElementById('btn-cerrar-modal-cupo')?.addEventListener('click', cerrarModalCupoRapido);
    document.getElementById('btn-cancelar-modal-cupo')?.addEventListener('click', cerrarModalCupoRapido);
    document.getElementById('modal-cli-cupo')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-cli-cupo') cerrarModalCupoRapido();
    });
    document.getElementById('form-cli-cupo')?.addEventListener('submit', guardarCupoRapidoFormulario);

    // Eventos Etapa 3: Proveedores CxP y Modal de Liquidación
    document.getElementById('cli-cxp-search')?.addEventListener('input', (e) => {
        window.clientesState.cxpBusqueda = e.target.value;
        renderizarBloqueProveedoresPorPagar();
    });

    document.querySelectorAll('#cli-cxp-filter-chips .cli-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#cli-cxp-filter-chips .cli-chip').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            window.clientesState.cxpFiltroEstado = btn.getAttribute('data-cxpfilter');
            renderizarBloqueProveedoresPorPagar();
        });
    });

    document.getElementById('clientes-module-root')?.addEventListener('click', (e) => {
        const btnLiq = e.target.closest('.btn-cli-liquidar-cxp');
        if (btnLiq) abrirModalLiquidarProveedor(btnLiq.getAttribute('data-cxp-id'));
    });

    document.getElementById('btn-cerrar-modal-cxp')?.addEventListener('click', cerrarModalLiquidarProveedor);
    document.getElementById('btn-cancelar-modal-cxp')?.addEventListener('click', cerrarModalLiquidarProveedor);
    document.getElementById('modal-cli-liquidar-cxp')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-cli-liquidar-cxp') cerrarModalLiquidarProveedor();
    });

    document.getElementById('cxp-monto-pagar')?.addEventListener('input', actualizarPreviewLiquidacionCxp);
    document.getElementById('btn-cxp-mitad')?.addEventListener('click', () => {
        const cuenta = obtenerTodasCuentasPagarCli().find(c => c.id === window.clientesState.cxpLiquidandoId);
        if (!cuenta) return;
        document.getElementById('cxp-monto-pagar').value = Math.round(((Number(cuenta.deudaPendiente) || 0) / 2) * 100) / 100;
        actualizarPreviewLiquidacionCxp();
    });
    document.getElementById('btn-cxp-total')?.addEventListener('click', () => {
        const cuenta = obtenerTodasCuentasPagarCli().find(c => c.id === window.clientesState.cxpLiquidandoId);
        if (!cuenta) return;
        document.getElementById('cxp-monto-pagar').value = Math.max(0, Number(cuenta.deudaPendiente) || 0);
        actualizarPreviewLiquidacionCxp();
    });
    document.getElementById('form-cli-liquidar-cxp')?.addEventListener('submit', confirmarLiquidacionProveedorFormulario);

    // Eventos Etapa 3: Filtros del Historial Auditado
    document.getElementById('cli-hist-search')?.addEventListener('input', (e) => {
        window.clientesState.histBusqueda = e.target.value;
        window.clientesState.histLimite = 30;
        renderizarHistorialAuditadoClientes();
    });
    document.getElementById('cli-hist-tipo')?.addEventListener('change', (e) => {
        window.clientesState.histFiltroTipo = e.target.value;
        window.clientesState.histLimite = 30;
        renderizarHistorialAuditadoClientes();
    });
    document.getElementById('cli-hist-medio')?.addEventListener('change', (e) => {
        window.clientesState.histFiltroMedio = e.target.value;
        window.clientesState.histLimite = 30;
        renderizarHistorialAuditadoClientes();
    });
    document.getElementById('cli-hist-periodo')?.addEventListener('change', (e) => {
        window.clientesState.histFiltroPeriodo = e.target.value;
        window.clientesState.histLimite = 30;
        renderizarHistorialAuditadoClientes();
    });
    document.getElementById('btn-cli-hist-mas')?.addEventListener('click', () => {
        window.clientesState.histLimite += 30;
        renderizarHistorialAuditadoClientes();
    });

    // Eventos Etapa 4: Modal de Exportación Masiva PDF / CSV
    document.getElementById('btn-cli-exportar')?.addEventListener('click', abrirModalExportarClientes);
    document.getElementById('btn-cerrar-modal-exp')?.addEventListener('click', cerrarModalExportarClientes);
    document.getElementById('btn-cancelar-modal-exp')?.addEventListener('click', cerrarModalExportarClientes);
    document.getElementById('modal-cli-exportar')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-cli-exportar') cerrarModalExportarClientes();
    });
    document.getElementById('exp-cli-filtro')?.addEventListener('change', actualizarContadoresModalExportar);
    document.getElementById('btn-exp-cli-pdf')?.addEventListener('click', exportarListadoClientesPdf);
    document.getElementById('btn-exp-cli-csv')?.addEventListener('click', exportarListadoClientesCsv);
    document.getElementById('btn-exp-hist-csv')?.addEventListener('click', exportarHistorialAuditadoCsv);
}
