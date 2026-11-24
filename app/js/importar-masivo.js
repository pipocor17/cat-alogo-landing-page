/* ==========================================================================
   MÓDULO: IMPORTACIÓN MASIVA & RECONCILIACIÓN DE CATÁLOGO (ETAPA 1)
   (SHEETJS .XLSX/.CSV, PLANTILLA, EXPORTACIÓN IDA/VUELTA, SANITIZADOR Y MAPEO)
   ========================================================================== */

const IMP_CAMPOS_DESTINO = [
    { key: 'ignorar', label: '— Ignorar columna —' },
    { key: 'sku', label: 'Código SKU / Barras (Clave Única)' },
    { key: 'nombre', label: 'Nombre del Producto *' },
    { key: 'categoria', label: 'Categoría / Rubro' },
    { key: 'precioNormal', label: 'Precio Venta Público ($) *' },
    { key: 'precioCosto', label: 'Precio de Costo Privado (CMV)' },
    { key: 'precioOferta', label: 'Precio Oferta / Promo ($)' },
    { key: 'stock', label: 'Stock Actual' },
    { key: 'stockMinimo', label: 'Stock Mínimo (Alerta)' },
    { key: 'unidadMedida', label: 'Unidad (Unidad / Kg / L / m)' },
    { key: 'descripcion', label: 'Descripción' }
];

const IMP_SINONIMOS = {
    sku: ['sku', 'cod', 'codigo', 'cod_art', 'codart', 'ean', 'barcode', 'barras', 'articulo', 'id_art', 'clave'],
    nombre: ['nombre', 'producto', 'descripcion_corta', 'titulo', 'art', 'item', 'denominacion', 'detalle', 'desc'],
    categoria: ['categoria', 'rubro', 'familia', 'coleccion', 'linea', 'depto', 'departamento', 'grupo'],
    precioNormal: ['precio', 'precio_venta', 'pventa', 'venta', 'pvp', 'publico', 'precio_publico', 'precio_normal', 'lista', 'valor'],
    precioCosto: ['costo', 'precio_costo', 'pcosto', 'costo_priv', 'costo_compra', 'compra', 'cmv', 'neto'],
    precioOferta: ['oferta', 'precio_oferta', 'promo', 'promocion', 'descuento'],
    stock: ['stock', 'cantidad', 'cant', 'existencia', 'disponible', 'stock_actual', 'inventario', 'unidades'],
    stockMinimo: ['stock_min', 'minimo', 'stock_minimo', 'alerta'],
    unidadMedida: ['unidad', 'um', 'u_m', 'medida', 'unidad_medida', 'presentacion'],
    descripcion: ['descripcion', 'notas', 'observaciones', 'caracteristicas']
};

window.impState = {
    workbook: null,
    archivoNombre: '',
    archivoTamanoKb: 0,
    formato: '',
    hojaActiva: '',
    headers: [],
    rawRows: [],
    mapping: {},          // { colIndex: 'sku' | 'nombre' | ... }
    filasAuditadas: [],
    tabActiva: 'todos',
    filtroBusqueda: ''
};

/* ==========================================================================
   SANITIZADOR ARGENTINO DE NÚMEROS Y TEXTO
   ========================================================================== */
function normalizarClaveHeaderImp(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function sanitizarNumeroArgentinoImp(val) {
    if (typeof val === 'number' && !isNaN(val)) return Math.round(val * 1000) / 1000;
    let s = String(val ?? '').trim();
    if (!s) return NaN;

    // Limpiar símbolos de moneda, espacios y texto suelto (ej. "ARS $ 1.250,50")
    s = s.replace(/[^\d.,-]/g, '');
    if (!s || s === '-') return NaN;

    const tieneComa = s.includes(',');
    const tienePunto = s.includes('.');

    if (tieneComa && tienePunto) {
        // El último separador define el decimal: "1.250,50" -> coma decimal; "1,250.50" -> punto decimal
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            s = s.replace(/,/g, '');
        }
    } else if (tieneComa) {
        const partes = s.split(',');
        // Si hay una sola coma y 1-2 decimales -> decimal ("1250,50"); si tiene 3 dígitos exactos -> miles ("12,400")
        if (partes.length === 2 && partes[1].length <= 2) {
            s = s.replace(',', '.');
        } else {
            s = s.replace(/,/g, '');
        }
    } else if (tienePunto) {
        const partes = s.split('.');
        // Si hay múltiples puntos ("1.250.000") o exactamente 3 dígitos tras el punto ("12.400") -> separador de miles AR
        if (partes.length > 2 || (partes.length === 2 && partes[1].length === 3)) {
            s = s.replace(/\./g, '');
        }
    }

    const num = parseFloat(s);
    return isNaN(num) ? NaN : Math.round(num * 1000) / 1000;
}

function formatearMonedaImp(v) {
    const n = Number(v) || 0;
    return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function escaparHtmlImp(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function obtenerProductosActualesImp() {
    try {
        const arr = JSON.parse(localStorage.getItem('cat_alogo_productos_v1') || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

/* ==========================================================================
   PLANTILLA VACÍA Y EXPORTACIÓN DE INVENTARIO ACTUAL (IDA Y VUELTA)
   ========================================================================== */
function descargarPlantillaVaciaImp() {
    const filas = [
        ['SKU', 'Nombre', 'Categoria', 'Precio Venta', 'Precio Costo', 'Precio Oferta', 'Stock', 'Stock Minimo', 'Unidad', 'Descripcion'],
        ['REM-BAS-01', 'Remera Algodón Peinado', 'Indumentaria', 12800, 6200, 0, 25, 5, 'Unidad', 'Talles S al XL'],
        ['ALM-NAT-1K', 'Almendras Peladas Premium', 'Frutos Secos', 32000, 21000, 29500, 8.5, 2, 'Kilogramos (kg)', 'Venta fraccionada por kilo'],
        ['ALF-CHO-01', 'Alfajor de Chocolate Triple', 'Almacén', 1500, 850, 0, 48, 10, 'Unidad', 'Caja x 24 unidades']
    ];
    exportarFilasExcelOCsvImp(filas, 'plantilla-importacion-cat-alogo');
}

function exportarInventarioActualImp() {
    const productos = obtenerProductosActualesImp();
    if (productos.length === 0) {
        alert('Tu inventario todavía no tiene productos. Descarga la "Plantilla Vacía" para empezar.');
        return;
    }

    const filas = [
        ['SKU', 'Nombre', 'Categoria', 'Precio Venta', 'Precio Costo', 'Precio Oferta', 'Stock', 'Stock Minimo', 'Unidad', 'Descripcion']
    ];

    productos.forEach(p => {
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
            p.descripcion || ''
        ]);
    });

    const fecha = new Date().toISOString().slice(0, 10);
    exportarFilasExcelOCsvImp(filas, `inventario-cat-alogo-${fecha}`);
}

function exportarFilasExcelOCsvImp(filas, nombreBase) {
    if (typeof XLSX !== 'undefined') {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(filas);
        ws['!cols'] = [
            { wch: 16 }, { wch: 30 }, { wch: 18 }, { wch: 14 },
            { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 30 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Productos');
        XLSX.writeFile(wb, `${nombreBase}.xlsx`);
        return;
    }

    // Fallback CSV con separador ";" para Excel en español si no hay conexión a SheetJS
    const csv = '\uFEFF' + filas.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nombreBase}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/* ==========================================================================
   LECTURA DE ARCHIVO (.XLSX / .XLS / .CSV) Y MAPEO SEMÁNTICO AUTOMÁTICO
   ========================================================================== */
function procesarArchivoSeleccionadoImp(archivo) {
    if (!archivo) return;

    const ext = archivo.name.split('.').pop().toLowerCase();
    window.impState.archivoNombre = archivo.name;
    window.impState.archivoTamanoKb = Math.max(1, Math.round(archivo.size / 1024));

    if (ext === 'csv' || ext === 'txt') {
        const lector = new FileReader();
        lector.onload = (ev) => {
            const texto = String(ev.target.result || '').replace(/^\uFEFF/, '');
            const { sep, matriz } = parsearTextoCsvImp(texto);
            window.impState.workbook = null;
            window.impState.formato = `CSV (${sep === ';' ? 'Punto y coma' : (sep === '\t' ? 'Tab' : 'Coma')})`;
            window.impState.hojaActiva = 'CSV';
            cargarMatrizEnEstadoImp(matriz);
        };
        lector.readAsText(archivo, 'UTF-8');
        return;
    }

    if (typeof XLSX === 'undefined') {
        alert('No se cargó la librería SheetJS para leer archivos Excel (.xlsx). Verifica tu conexión o sube el archivo en formato .csv.');
        return;
    }

    const lector = new FileReader();
    lector.onload = (ev) => {
        try {
            const data = new Uint8Array(ev.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            window.impState.workbook = wb;
            window.impState.formato = `Excel (.${ext})`;

            const selHoja = document.getElementById('imp-select-hoja');
            const wrapHoja = document.getElementById('imp-hoja-wrap');
            if (selHoja && wrapHoja) {
                selHoja.innerHTML = wb.SheetNames.map(n => `<option value="${escaparHtmlImp(n)}">${escaparHtmlImp(n)}</option>`).join('');
                wrapHoja.style.display = wb.SheetNames.length > 1 ? 'block' : 'none';
            }

            cargarHojaExcelImp(wb.SheetNames[0]);
        } catch (err) {
            console.error(err);
            alert('❌ No se pudo leer el archivo Excel. Verifica que no esté protegido con contraseña o dañado.');
        }
    };
    lector.readAsArrayBuffer(archivo);
}

function cargarHojaExcelImp(nombreHoja) {
    const wb = window.impState.workbook;
    if (!wb || !wb.Sheets[nombreHoja]) return;
    window.impState.hojaActiva = nombreHoja;
    const matriz = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, defval: '' });
    cargarMatrizEnEstadoImp(matriz);
}

function parsearTextoCsvImp(texto) {
    const lineas = texto.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lineas.length === 0) return { sep: ';', matriz: [] };

    const primera = lineas[0];
    const cPuntoComa = (primera.match(/;/g) || []).length;
    const cComa = (primera.match(/,/g) || []).length;
    const cTab = (primera.match(/\t/g) || []).length;
    const sep = cTab >= cPuntoComa && cTab >= cComa && cTab > 0 ? '\t' : (cPuntoComa >= cComa ? ';' : ',');

    const matriz = lineas.map(linea => {
        const res = [];
        let cur = '';
        let enComillas = false;
        for (let i = 0; i < linea.length; i++) {
            const ch = linea[i];
            if (ch === '"') {
                if (enComillas && linea[i + 1] === '"') { cur += '"'; i++; }
                else enComillas = !enComillas;
            } else if (ch === sep && !enComillas) {
                res.push(cur.trim());
                cur = '';
            } else {
                cur += ch;
            }
        }
        res.push(cur.trim());
        return res;
    });

    return { sep, matriz };
}

function cargarMatrizEnEstadoImp(matriz) {
    // Buscar primera fila no vacía como encabezados
    const limpia = (matriz || []).filter(r => Array.isArray(r) && r.some(c => String(c ?? '').trim() !== ''));
    if (limpia.length < 2) {
        alert('El archivo no contiene suficientes filas (se necesita una fila de encabezados y al menos 1 producto).');
        return;
    }

    const headers = limpia[0].map((h, i) => String(h ?? '').trim() || `Columna ${i + 1}`);
    const rawRows = limpia.slice(1);

    window.impState.headers = headers;
    window.impState.rawRows = rawRows;
    window.impState.mapping = detectarMapeoAutomaticoImp(headers);

    // Mostrar metadatos del archivo
    document.getElementById('imp-dropzone').style.display = 'none';
    document.getElementById('imp-file-meta').style.display = 'flex';
    document.getElementById('imp-meta-nombre').textContent = window.impState.archivoNombre;
    document.getElementById('imp-meta-filas').textContent = rawRows.length.toLocaleString('es-AR');
    document.getElementById('imp-meta-formato').textContent = window.impState.formato;
    document.getElementById('imp-sanitizer-note').style.display = 'block';

    renderizarMapeoColumnasImp();
    recalcularAuditoriaYVistaPreviaImp();
}

function detectarMapeoAutomaticoImp(headers) {
    const map = {};
    const usados = new Set();

    headers.forEach((h, idx) => {
        const norm = normalizarClaveHeaderImp(h);
        let match = 'ignorar';

        for (const [campo, listaSin] of Object.entries(IMP_SINONIMOS)) {
            if (usados.has(campo)) continue;
            if (listaSin.some(s => norm === s || norm.includes(s))) {
                match = campo;
                usados.add(campo);
                break;
            }
        }
        map[idx] = match;
    });

    return map;
}

function renderizarMapeoColumnasImp() {
    const cont = document.getElementById('imp-mapping-list');
    if (!cont) return;

    const { headers, mapping } = window.impState;
    let asignados = 0;

    cont.innerHTML = headers.map((h, idx) => {
        const actual = mapping[idx] || 'ignorar';
        if (actual !== 'ignorar') asignados++;
        const opts = IMP_CAMPOS_DESTINO.map(c =>
            `<option value="${c.key}" ${c.key === actual ? 'selected' : ''}>${escaparHtmlImp(c.label)}</option>`
        ).join('');

        return `
            <div class="imp-map-row ${actual !== 'ignorar' ? 'is-mapped' : ''}">
                <span class="imp-map-src" title="${escaparHtmlImp(h)}">${escaparHtmlImp(h)}</span>
                <span class="imp-map-arrow">→</span>
                <select class="imp-map-select" data-col-idx="${idx}">${opts}</select>
            </div>
        `;
    }).join('');

    const pill = document.getElementById('imp-mapeo-pill');
    if (pill) pill.textContent = `${asignados}/${headers.length} asignados`;
}

/* ==========================================================================
   AUDITORÍA EN VIVO DE FILAS Y KPIs PREVIOS
   ========================================================================== */
function recalcularAuditoriaYVistaPreviaImp() {
    const st = window.impState;
    const productosActuales = obtenerProductosActualesImp();
    const skusExistentes = new Set(productosActuales.map(p => String(p.sku || '').trim().toLowerCase()).filter(Boolean));

    const getCol = (campo) => {
        const entry = Object.entries(st.mapping).find(([, val]) => val === campo);
        return entry ? parseInt(entry[0], 10) : -1;
    };

    const idxSku = getCol('sku');
    const idxNom = getCol('nombre');
    const idxCat = getCol('categoria');
    const idxPre = getCol('precioNormal');
    const idxCos = getCol('precioCosto');
    const idxOfe = getCol('precioOferta');
    const idxStk = getCol('stock');
    const idxMin = getCol('stockMinimo');
    const idxUni = getCol('unidadMedida');
    const idxDes = getCol('descripcion');

    let nuevos = 0, actualizaciones = 0, conCosto = 0;

    const auditadas = st.rawRows.map((row, rIdx) => {
        const skuRaw = idxSku >= 0 ? String(row[idxSku] ?? '').trim() : '';
        const sku = skuRaw || `IMP-${String(rIdx + 1).padStart(4, '0')}`;
        const nombre = idxNom >= 0 ? String(row[idxNom] ?? '').trim() : '';
        const categoria = idxCat >= 0 ? (String(row[idxCat] ?? '').trim() || 'General') : 'General';
        const precioNormal = idxPre >= 0 ? sanitizarNumeroArgentinoImp(row[idxPre]) : NaN;
        const precioCosto = idxCos >= 0 ? sanitizarNumeroArgentinoImp(row[idxCos]) : NaN;
        const precioOferta = idxOfe >= 0 ? sanitizarNumeroArgentinoImp(row[idxOfe]) : 0;
        const stockRaw = idxStk >= 0 ? sanitizarNumeroArgentinoImp(row[idxStk]) : 0;
        const stock = isNaN(stockRaw) ? 0 : Math.max(0, stockRaw);
        const stockMinimo = idxMin >= 0 ? (sanitizarNumeroArgentinoImp(row[idxMin]) || 5) : 5;
        const unidadMedida = idxUni >= 0 ? (String(row[idxUni] ?? '').trim() || 'Unidad') : 'Unidad';
        const descripcion = idxDes >= 0 ? String(row[idxDes] ?? '').trim() : '';

        const existe = skusExistentes.has(sku.toLowerCase());
        if (existe) actualizaciones++; else nuevos++;

        const costoVal = (!isNaN(precioCosto) && precioCosto > 0) ? precioCosto : 0;
        if (costoVal > 0) conCosto++;

        const errores = [];
        const avisos = [];

        if (!nombre) errores.push('Sin nombre');
        if (isNaN(precioNormal) || precioNormal <= 0) {
            if (costoVal > 0) avisos.push('Sin P. Venta (solo costo)');
            else errores.push('Precio inválido');
        }
        if (costoVal <= 0) avisos.push('Sin costo (usará regla global)');
        if (stock <= 0) avisos.push('Stock en 0');

        const estado = errores.length > 0 ? 'error' : (avisos.length > 0 ? 'aviso' : 'ok');
        const pVentaNum = (!isNaN(precioNormal) && precioNormal > 0) ? precioNormal : 0;
        const margenPct = (pVentaNum > 0 && costoVal > 0)
            ? Math.round(((pVentaNum - costoVal) / pVentaNum) * 1000) / 10
            : null;

        return {
            filaNum: rIdx + 2,
            sku,
            nombre,
            categoria,
            precioNormal: pVentaNum,
            precioCosto: costoVal,
            precioOferta: (!isNaN(precioOferta) && precioOferta > 0) ? precioOferta : 0,
            stock,
            stockMinimo,
            unidadMedida,
            descripcion,
            existe,
            margenPct,
            estado,
            mensajes: [...errores, ...avisos]
        };
    });

    st.filasAuditadas = auditadas;

    // Actualizar 4 KPIs superiores
    const total = auditadas.length;
    const colsAsig = Object.values(st.mapping).filter(v => v !== 'ignorar').length;
    const pctCmv = total > 0 ? Math.round((conCosto / total) * 100) : 0;

    const setTxt = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    setTxt('imp-kpi-archivo', st.archivoNombre || 'Sin archivo');
    setTxt('imp-kpi-archivo-sub', `${st.archivoTamanoKb} KB • ${total} filas listas`);
    setTxt('imp-kpi-mapeo', `${colsAsig} de ${st.headers.length} Columnas`);
    setTxt('imp-kpi-mapeo-sub', idxNom >= 0 ? 'Nombre detectado ✓' : '⚠️ Falta mapear Nombre');
    setTxt('imp-kpi-seguridad', `${nuevos} Nuevos / ${actualizaciones} Actualiz.`);
    setTxt('imp-kpi-seguridad-sub', 'Cruce automático por SKU');
    setTxt('imp-kpi-cmv', `${pctCmv}% Costos Declarados`);
    setTxt('imp-kpi-cmv-sub', `${100 - pctCmv}% usará Fricción Cero`);

    renderizarTablaVistaPreviaImp();
}

function renderizarTablaVistaPreviaImp() {
    const st = window.impState;
    const tbody = document.getElementById('imp-preview-tbody');
    if (!tbody) return;

    const todas = st.filasAuditadas || [];
    const listos = todas.filter(f => f.estado === 'ok');
    const avisos = todas.filter(f => f.estado === 'aviso');
    const errores = todas.filter(f => f.estado === 'error');

    const setTxt = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    setTxt('imp-cnt-todos', todas.length);
    setTxt('imp-cnt-listos', listos.length);
    setTxt('imp-cnt-avisos', avisos.length);
    setTxt('imp-cnt-errores', errores.length);

    const q = (st.filtroBusqueda || '').trim().toLowerCase();
    const filtradas = todas.filter(f => {
        if (st.tabActiva === 'listos' && f.estado !== 'ok') return false;
        if (st.tabActiva === 'avisos' && f.estado !== 'aviso') return false;
        if (st.tabActiva === 'errores' && f.estado !== 'error') return false;
        if (q && !`${f.sku} ${f.nombre} ${f.categoria}`.toLowerCase().includes(q)) return false;
        return true;
    });

    if (filtradas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:#64748b;">No hay filas que coincidan con este filtro.</td></tr>`;
    } else {
        tbody.innerHTML = filtradas.slice(0, 60).map(f => {
            const stBadge = f.estado === 'ok'
                ? `<span class="imp-st-badge st-ok">${f.existe ? '↻ Act.' : '＋ Nuevo'}</span>`
                : (f.estado === 'aviso'
                    ? `<span class="imp-st-badge st-warn" title="${escaparHtmlImp(f.mensajes.join(' • '))}">⚠️ Aviso</span>`
                    : `<span class="imp-st-badge st-err" title="${escaparHtmlImp(f.mensajes.join(' • '))}">✕ Error</span>`);

            return `
                <tr>
                    <td>${stBadge}</td>
                    <td style="font-family:monospace; font-size:0.71rem;">${escaparHtmlImp(f.sku)}</td>
                    <td>
                        <strong>${escaparHtmlImp(f.nombre || '(Sin nombre)')}</strong>
                        ${f.mensajes.length > 0 ? `<div style="font-size:0.66rem; color:#b45309;">${escaparHtmlImp(f.mensajes.join(' • '))}</div>` : ''}
                    </td>
                    <td>${escaparHtmlImp(f.categoria)}</td>
                    <td style="text-align:right;">${f.precioCosto > 0 ? formatearMonedaImp(f.precioCosto) : '—'}</td>
                    <td style="text-align:right; font-weight:800;">${f.precioNormal > 0 ? formatearMonedaImp(f.precioNormal) : '—'}</td>
                    <td style="text-align:right;">${f.margenPct !== null ? `${f.margenPct}%` : 'Auto'}</td>
                    <td style="text-align:right; font-weight:700;">${f.stock}</td>
                </tr>
            `;
        }).join('');
    }

    const importables = todas.length - errores.length;
    const btnRun = document.getElementById('btn-imp-ejecutar');
    const footInfo = document.getElementById('imp-footer-info');
    if (btnRun) {
        btnRun.disabled = importables <= 0;
        btnRun.textContent = `🚀 Ejecutar Ingesta Masiva (${importables} prod.)`;
    }
    if (footInfo) {
        footInfo.textContent = todas.length > 0
            ? `${importables} productos listos para ingesta (${errores.length} omitidos por error crítico).`
            : 'Esperando archivo para analizar...';
    }
}

/* ==========================================================================
   APERTURA, CIERRE Y EVENTOS DELEGADOS (FUNCIONA AUTOMÁTICAMENTE EN SPA)
   ========================================================================== */
function abrirModalImportarMasivo() {
    const modal = document.getElementById('modal-importar-masivo');
    if (!modal) return;
    modal.classList.add('active');
}

function cerrarModalImportarMasivo() {
    document.getElementById('modal-importar-masivo')?.classList.remove('active');
}

function reiniciarEstadoImportarMasivo() {
    window.impState.workbook = null;
    window.impState.headers = [];
    window.impState.rawRows = [];
    window.impState.mapping = {};
    window.impState.filasAuditadas = [];

    const dz = document.getElementById('imp-dropzone');
    const meta = document.getElementById('imp-file-meta');
    const note = document.getElementById('imp-sanitizer-note');
    if (dz) dz.style.display = 'flex';
    if (meta) meta.style.display = 'none';
    if (note) note.style.display = 'none';
    const inp = document.getElementById('imp-file-input');
    if (inp) inp.value = '';
}

// Delegación global única: funciona cada vez que el usuario entra a Inventario
document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-abrir-importar-masivo')) {
        abrirModalImportarMasivo();
        return;
    }
    if (e.target.closest('#btn-cerrar-modal-importar') || e.target.closest('#btn-imp-descartar')) {
        cerrarModalImportarMasivo();
        return;
    }
    if (e.target.id === 'modal-importar-masivo') {
        cerrarModalImportarMasivo();
        return;
    }
    if (e.target.closest('#btn-imp-plantilla-vacia')) {
        descargarPlantillaVaciaImp();
        return;
    }
    if (e.target.closest('#btn-imp-exportar-actual')) {
        exportarInventarioActualImp();
        return;
    }
    if (e.target.closest('#imp-dropzone') && e.target.id !== 'imp-file-input') {
        document.getElementById('imp-file-input')?.click();
        return;
    }
    if (e.target.closest('#btn-imp-cambiar-archivo')) {
        reiniciarEstadoImportarMasivo();
        document.getElementById('imp-file-input')?.click();
        return;
    }

    const tabBtn = e.target.closest('#imp-preview-tabs .imp-ptab');
    if (tabBtn) {
        document.querySelectorAll('#imp-preview-tabs .imp-ptab').forEach(b => b.classList.remove('active'));
        tabBtn.classList.add('active');
        window.impState.tabActiva = tabBtn.getAttribute('data-imptab');
        renderizarTablaVistaPreviaImp();
        return;
    }

    if (e.target.closest('#btn-imp-ejecutar')) {
        if (typeof ejecutarIngestaMasivaCatalogo === 'function') {
            ejecutarIngestaMasivaCatalogo();
        } else {
            alert('🚀 La ejecución final de ingesta, reglas de conflicto y botón Deshacer se activan en la Etapa 2.');
        }
    }
});

document.addEventListener('change', (e) => {
    if (e.target.id === 'imp-file-input') {
        const archivo = e.target.files?.[0];
        if (archivo) procesarArchivoSeleccionadoImp(archivo);
        return;
    }
    if (e.target.id === 'imp-select-hoja') {
        cargarHojaExcelImp(e.target.value);
        return;
    }
    if (e.target.classList.contains('imp-map-select')) {
        const idx = parseInt(e.target.getAttribute('data-col-idx'), 10);
        window.impState.mapping[idx] = e.target.value;
        renderizarMapeoColumnasImp();
        recalcularAuditoriaYVistaPreviaImp();
    }
});

document.addEventListener('input', (e) => {
    if (e.target.id === 'imp-preview-search') {
        window.impState.filtroBusqueda = e.target.value;
        renderizarTablaVistaPreviaImp();
    }
});

// Soporte Drag & Drop sobre la zona de carga
document.addEventListener('dragover', (e) => {
    const dz = e.target.closest?.('#imp-dropzone');
    if (!dz) return;
    e.preventDefault();
    dz.classList.add('is-dragover');
});
document.addEventListener('dragleave', (e) => {
    const dz = e.target.closest?.('#imp-dropzone');
    if (dz) dz.classList.remove('is-dragover');
});
document.addEventListener('drop', (e) => {
    const dz = e.target.closest?.('#imp-dropzone');
    if (!dz) return;
    e.preventDefault();
    dz.classList.remove('is-dragover');
    const archivo = e.dataTransfer?.files?.[0];
    if (archivo) procesarArchivoSeleccionadoImp(archivo);
});

/* ==========================================================================
   ETAPA 2: REGLAS DE CONFLICTO SKU, CÁLCULO DESDE COSTOS, INGESTA Y DESHACER
   ========================================================================== */
const STORAGE_KEY_IMP_BACKUP = 'cat_alogo_imp_backup_v1';

Object.assign(window.impState, {
    modoConflicto: 'upsert', // 'upsert' | 'solo_nuevos' | 'solo_actualizar' | 'reemplazar_todo'
    calcDesdeCosto: false,
    margenDesdeCostoPct: 40,
    redondeoCosto: 50,
    forzarPrecioDesdeCosto: false,
    crearCategoriasAuto: true,
    visiblesPorDefecto: true
});

function redondearPrecioImp(valor, paso) {
    const n = Number(valor) || 0;
    const p = Number(paso) || 0;
    if (p <= 0) return Math.round(n * 100) / 100;
    return Math.round(n / p) * p;
}

function detectarFamiliaUnidadImp(unidadTexto) {
    const s = String(unidadTexto || '').toLowerCase();
    if (/kg|kilo|gr|gramo/.test(s)) return 'peso';
    if (/litro|\bl\b|ml|cc/.test(s)) return 'peso';
    if (/metro|\bm\b|cm/.test(s)) return 'longitud';
    return 'unidad';
}

function obtenerBackupImportacionImp() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY_IMP_BACKUP) || 'null');
    } catch {
        return null;
    }
}

/* --- 1. RENDER DEL PANEL DE REGLAS EN #imp-stage2-rules-anchor --- */
function renderizarPanelReglasEtapa2Imp() {
    const anchor = document.getElementById('imp-stage2-rules-anchor');
    if (!anchor) return;

    const st = window.impState;
    const backup = obtenerBackupImportacionImp();

    const backupHtml = backup ? `
        <div class="imp-undo-banner">
            <div>
                <strong>↩️ Respaldo disponible</strong>
                <div>${new Date(backup.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} • ${backup.productos?.length || 0} productos previos</div>
            </div>
            <button type="button" class="imp-undo-btn" id="btn-imp-deshacer-ultima">↩️ Deshacer Última</button>
        </div>
    ` : '';

    anchor.innerHTML = `
        <section class="imp-panel imp-s2-panel">
            <div class="imp-panel-head">
                <strong>🛡️ Reglas de Conflicto (Cruce por SKU)</strong>
                <span class="imp-badge-soft">Etapa 2</span>
            </div>

            ${backupHtml}

            <div class="imp-radio-stack" id="imp-conflict-radios">
                <label class="imp-radio-card ${st.modoConflicto === 'upsert' ? 'is-selected' : ''}">
                    <input type="radio" name="imp-modo-conflicto" value="upsert" ${st.modoConflicto === 'upsert' ? 'checked' : ''}>
                    <div>
                        <strong>🔄 Actualizar existentes y crear nuevos (Recomendado)</strong>
                        <small>Si el SKU existe, actualiza precios y stock conservando tus fotos y variantes.</small>
                    </div>
                </label>

                <label class="imp-radio-card ${st.modoConflicto === 'solo_nuevos' ? 'is-selected' : ''}">
                    <input type="radio" name="imp-modo-conflicto" value="solo_nuevos" ${st.modoConflicto === 'solo_nuevos' ? 'checked' : ''}>
                    <div>
                        <strong>➕ Solo agregar productos nuevos</strong>
                        <small>Omite cualquier SKU que ya esté cargado en tu Bóveda Local.</small>
                    </div>
                </label>

                <label class="imp-radio-card ${st.modoConflicto === 'solo_actualizar' ? 'is-selected' : ''}">
                    <input type="radio" name="imp-modo-conflicto" value="solo_actualizar" ${st.modoConflicto === 'solo_actualizar' ? 'checked' : ''}>
                    <div>
                        <strong>✏️ Solo actualizar precios / stock existentes</strong>
                        <small>Ideal para listas de proveedores: actualiza tus SKUs actuales sin crear nuevos.</small>
                    </div>
                </label>

                <label class="imp-radio-card is-nuclear ${st.modoConflicto === 'reemplazar_todo' ? 'is-selected' : ''}">
                    <input type="radio" name="imp-modo-conflicto" value="reemplazar_todo" ${st.modoConflicto === 'reemplazar_todo' ? 'checked' : ''}>
                    <div>
                        <strong>☢️ Opción Nuclear: Reemplazar todo el inventario</strong>
                        <small>Borra el inventario actual y carga únicamente esta planilla (requiere confirmación).</small>
                    </div>
                </label>
            </div>

            <div class="imp-cost-box">
                <label class="imp-chk-inline">
                    <input type="checkbox" id="imp-chk-calc-costo" ${st.calcDesdeCosto ? 'checked' : ''}>
                    <span><strong>💰 Calcular Precio Venta desde Costo</strong> (para listas de proveedor sin PVP)</span>
                </label>

                <div class="imp-cost-grid" id="imp-cost-cfg-grid" style="${st.calcDesdeCosto ? '' : 'display:none;'}">
                    <div>
                        <label for="imp-inp-margen-costo">Margen sobre costo (%)</label>
                        <input type="number" id="imp-inp-margen-costo" min="1" max="500" step="1" value="${st.margenDesdeCostoPct}">
                    </div>
                    <div>
                        <label for="imp-sel-redondeo-costo">Redondeo</label>
                        <select id="imp-sel-redondeo-costo">
                            <option value="0" ${st.redondeoCosto === 0 ? 'selected' : ''}>Exacto</option>
                            <option value="10" ${st.redondeoCosto === 10 ? 'selected' : ''}>Al $10</option>
                            <option value="50" ${st.redondeoCosto === 50 ? 'selected' : ''}>Al $50</option>
                            <option value="100" ${st.redondeoCosto === 100 ? 'selected' : ''}>Al $100</option>
                        </select>
                    </div>
                </div>

                <label class="imp-chk-inline" id="imp-wrap-forzar-costo" style="${st.calcDesdeCosto ? '' : 'display:none;'}">
                    <input type="checkbox" id="imp-chk-forzar-costo" ${st.forzarPrecioDesdeCosto ? 'checked' : ''}>
                    <span>Recalcular también los productos que ya traen Precio Venta en la planilla</span>
                </label>
            </div>

            <label class="imp-chk-inline">
                <input type="checkbox" id="imp-chk-crear-cats" ${st.crearCategoriasAuto ? 'checked' : ''}>
                <span>🏷️ Crear automáticamente las categorías nuevas en el Gestor</span>
            </label>

            <label class="imp-chk-inline">
                <input type="checkbox" id="imp-chk-visibles-def" ${st.visiblesPorDefecto ? 'checked' : ''}>
                <span>🌐 Publicar los productos nuevos visibles en Catálogo Web y PDF</span>
            </label>
        </section>
    `;
}

/* --- 2. INTEGRAR CÁLCULO DESDE COSTOS Y FILTRO DE REGLA EN LA VISTA PREVIA --- */
const _recalcularAuditoriaE1 = recalcularAuditoriaYVistaPreviaImp;
recalcularAuditoriaYVistaPreviaImp = function () {
    _recalcularAuditoriaE1();

    const st = window.impState;
    if (!Array.isArray(st.filasAuditadas) || st.filasAuditadas.length === 0) return;

    const usarCosto = !!st.calcDesdeCosto;
    const pct = Math.max(0, Number(st.margenDesdeCostoPct) || 0);
    const pasoRed = Number(st.redondeoCosto) || 0;
    const forzar = !!st.forzarPrecioDesdeCosto;

    st.filasAuditadas.forEach(f => {
        if (usarCosto && f.precioCosto > 0 && (f.precioNormal <= 0 || forzar)) {
            f.precioNormal = redondearPrecioImp(f.precioCosto * (1 + pct / 100), pasoRed);
            f.margenPct = f.precioNormal > 0
                ? Math.round(((f.precioNormal - f.precioCosto) / f.precioNormal) * 1000) / 10
                : null;
            f.mensajes = f.mensajes.filter(m => m !== 'Precio inválido' && m !== 'Sin P. Venta (solo costo)');
            f.mensajes.push(`PVP calculado (+${pct}%)`);
            if (f.nombre && f.precioNormal > 0 && f.estado === 'error') {
                f.estado = 'aviso';
            }
        }

        // Indicar filas que se omitirán por regla de conflicto
        f.omitidaPorRegla =
            (st.modoConflicto === 'solo_nuevos' && f.existe) ||
            (st.modoConflicto === 'solo_actualizar' && !f.existe);
    });

    renderizarTablaVistaPreviaImp();

    // Ajustar conteo real del botón de ingesta según la regla activa
    const aplicables = st.filasAuditadas.filter(f => f.estado !== 'error' && !f.omitidaPorRegla);
    const btnRun = document.getElementById('btn-imp-ejecutar');
    const footInfo = document.getElementById('imp-footer-info');
    if (btnRun) {
        btnRun.disabled = aplicables.length <= 0;
        btnRun.textContent = st.modoConflicto === 'reemplazar_todo'
            ? `☢️ Reemplazar Inventario (${aplicables.length} prod.)`
            : `🚀 Ejecutar Ingesta Masiva (${aplicables.length} prod.)`;
    }
    if (footInfo) {
        const omitidasRegla = st.filasAuditadas.filter(f => f.estado !== 'error' && f.omitidaPorRegla).length;
        const errores = st.filasAuditadas.filter(f => f.estado === 'error').length;
        footInfo.textContent = `${aplicables.length} productos se procesarán • ${omitidasRegla} omitidos por regla • ${errores} con error crítico.`;
    }
};

/* --- 3. EJECUCIÓN REAL DE INGESTA EN BÓVEDA LOCAL + BACKUP AUTOMÁTICO --- */
window.ejecutarIngestaMasivaCatalogo = function () {
    const st = window.impState;
    const filasValidas = (st.filasAuditadas || []).filter(f => f.estado !== 'error' && !f.omitidaPorRegla);

    if (filasValidas.length === 0) {
        alert('No hay filas válidas para importar con la regla actual.');
        return;
    }

    if (st.modoConflicto === 'reemplazar_todo') {
        const confirmacion = prompt(
            `☢️ ATENCIÓN — OPCIÓN NUCLEAR\n\n` +
            `Esto reemplazará TODO tu inventario actual por los ${filasValidas.length} productos de esta planilla.\n` +
            `(Se guardará un respaldo automático para poder Deshacer).\n\n` +
            `Escribe REEMPLAZAR en mayúsculas para confirmar:`
        );
        if (String(confirmacion || '').trim() !== 'REEMPLAZAR') {
            alert('Operación cancelada. Tu inventario no fue modificado.');
            return;
        }
    }

    const productosPrevios = obtenerProductosActualesImp();
    let categoriasPrevias = [];
    try {
        categoriasPrevias = JSON.parse(localStorage.getItem('cat_alogo_categorias_v1') || '[]');
    } catch { categoriasPrevias = []; }

    // 1. Guardar respaldo completo antes de tocar la Bóveda (para botón Deshacer)
    localStorage.setItem(STORAGE_KEY_IMP_BACKUP, JSON.stringify({
        fecha: new Date().toISOString(),
        archivo: st.archivoNombre,
        productos: productosPrevios,
        categorias: categoriasPrevias
    }));

    // 2. Construir nuevo arreglo aplicando la regla de conflicto
    const resultado = st.modoConflicto === 'reemplazar_todo'
        ? []
        : JSON.parse(JSON.stringify(productosPrevios));

    const indicePorSku = new Map();
    resultado.forEach((p, idx) => {
        const k = String(p.sku || '').trim().toLowerCase();
        if (k) indicePorSku.set(k, idx);
    });

    let creados = 0;
    let actualizados = 0;
    const categoriasEnArchivo = new Set();
    const ahoraIso = new Date().toISOString();

    filasValidas.forEach((f, i) => {
        const skuKey = String(f.sku || '').trim().toLowerCase();
        const catLimpia = f.categoria || 'General';
        categoriasEnArchivo.add(catLimpia);

        const idxExistente = skuKey ? indicePorSku.get(skuKey) : undefined;

        if (idxExistente !== undefined && st.modoConflicto !== 'reemplazar_todo') {
            // Actualizar producto existente conservando sus imágenes, variantes y configuración
            const prod = resultado[idxExistente];
            prod.nombre = f.nombre || prod.nombre;
            prod.categoria = catLimpia || prod.categoria;
            if (f.precioNormal > 0) prod.precioNormal = f.precioNormal;
            if (f.precioCosto > 0) prod.precioCosto = f.precioCosto;
            if (f.precioOferta >= 0) prod.precioOferta = f.precioOferta;
            prod.stock = f.stock;
            prod.stockMinimo = f.stockMinimo || prod.stockMinimo || 5;
            if (f.unidadMedida) {
                prod.unidadMedida = f.unidadMedida;
                prod.familiaMedicion = detectarFamiliaUnidadImp(f.unidadMedida);
            }
            if (f.descripcion) prod.descripcion = f.descripcion;
            prod.actualizadoEn = ahoraIso;
            actualizados++;
        } else {
            // Crear producto nuevo
            const nuevo = {
                id: `prod-${Date.now()}-${i}`,
                sku: f.sku,
                nombre: f.nombre,
                categoria: catLimpia,
                precioNormal: f.precioNormal,
                precioCosto: f.precioCosto,
                precioOferta: f.precioOferta || 0,
                stock: f.stock,
                stockMinimo: f.stockMinimo || 5,
                unidadMedida: f.unidadMedida || 'Unidad',
                familiaMedicion: detectarFamiliaUnidadImp(f.unidadMedida),
                descripcion: f.descripcion || '',
                imagenes: [],
                variantesDetalle: [],
                visible: !!st.visiblesPorDefecto,
                visiblePdf: !!st.visiblesPorDefecto,
                creadoEn: ahoraIso,
                actualizadoEn: ahoraIso
            };
            resultado.unshift(nuevo);
            if (skuKey) indicePorSku.set(skuKey, 0);
            creados++;
        }
    });

    // 3. Crear automáticamente categorías nuevas si corresponde
    let catsNuevasCount = 0;
    if (st.crearCategoriasAuto) {
        const catsActuales = Array.isArray(categoriasPrevias) ? [...categoriasPrevias] : [];
        const nombresExistentes = new Set(
            catsActuales.map(c => String(typeof c === 'string' ? c : c?.nombre || '').trim().toLowerCase())
        );

        categoriasEnArchivo.forEach(catNom => {
            if (!catNom || catNom.toLowerCase() === 'general') return;
            if (!nombresExistentes.has(catNom.toLowerCase())) {
                const formatoObjeto = catsActuales.length > 0 && typeof catsActuales[0] === 'object';
                catsActuales.push(formatoObjeto ? { id: 'cat-' + Date.now() + '-' + catsNuevasCount, nombre: catNom } : catNom);
                nombresExistentes.add(catNom.toLowerCase());
                catsNuevasCount++;
            }
        });

        if (catsNuevasCount > 0) {
            localStorage.setItem('cat_alogo_categorias_v1', JSON.stringify(catsActuales));
            if (Array.isArray(window.bovedaCategorias)) window.bovedaCategorias = catsActuales;
        }
    }

    // 4. Persistir en Bóveda Local y refrescar UI de Inventario
    window.bovedaProductos = resultado;
    localStorage.setItem('cat_alogo_productos_v1', JSON.stringify(resultado));
    if (typeof sincronizarUIconCategorias === 'function') sincronizarUIconCategorias();
    if (typeof renderizarProductosCreados === 'function') renderizarProductosCreados();

    cerrarModalImportarMasivo();
    renderizarPanelReglasEtapa2Imp();

    alert(
        `✅ Importación Masiva completada en tu Bóveda Local.\n\n` +
        `• Productos creados: ${creados}\n` +
        `• Productos actualizados (conservando fotos): ${actualizados}\n` +
        `• Categorías nuevas creadas: ${catsNuevasCount}\n\n` +
        `Si necesitas revertirla, abre "📥 Importar CSV / Excel" y presiona "↩️ Deshacer Última".`
    );
};

/* --- 4. DESHACER ÚLTIMA IMPORTACIÓN --- */
function deshacerUltimaImportacionImp() {
    const backup = obtenerBackupImportacionImp();
    if (!backup || !Array.isArray(backup.productos)) {
        alert('No hay ningún respaldo de importación anterior disponible.');
        return;
    }

    const ok = confirm(
        `↩️ ¿Restaurar tu inventario exactamente como estaba antes de importar "${backup.archivo || 'la planilla'}"?\n\n` +
        `Volverás a tener ${backup.productos.length} producto(s).`
    );
    if (!ok) return;

    window.bovedaProductos = backup.productos;
    localStorage.setItem('cat_alogo_productos_v1', JSON.stringify(backup.productos));

    if (Array.isArray(backup.categorias)) {
        localStorage.setItem('cat_alogo_categorias_v1', JSON.stringify(backup.categorias));
        if (Array.isArray(window.bovedaCategorias)) window.bovedaCategorias = backup.categorias;
    }

    localStorage.removeItem(STORAGE_KEY_IMP_BACKUP);
    if (typeof sincronizarUIconCategorias === 'function') sincronizarUIconCategorias();
    if (typeof renderizarProductosCreados === 'function') renderizarProductosCreados();
    renderizarPanelReglasEtapa2Imp();
    recalcularAuditoriaYVistaPreviaImp();

    alert(`✅ Inventario restaurado correctamente (${backup.productos.length} productos).`);
}

/* --- 5. HOOK DE APERTURA Y EVENTOS DELEGADOS ETAPA 2 --- */
const _abrirModalImpE1 = abrirModalImportarMasivo;
abrirModalImportarMasivo = function () {
    _abrirModalImpE1();
    renderizarPanelReglasEtapa2Imp();
};

document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-imp-deshacer-ultima')) {
        deshacerUltimaImportacionImp();
    }
});

document.addEventListener('change', (e) => {
    if (e.target.name === 'imp-modo-conflicto') {
        window.impState.modoConflicto = e.target.value;
        document.querySelectorAll('#imp-conflict-radios .imp-radio-card').forEach(card => {
            const rad = card.querySelector('input[type="radio"]');
            card.classList.toggle('is-selected', rad && rad.checked);
        });
        recalcularAuditoriaYVistaPreviaImp();
        return;
    }

    if (e.target.id === 'imp-chk-calc-costo') {
        window.impState.calcDesdeCosto = e.target.checked;
        const g = document.getElementById('imp-cost-cfg-grid');
        const f = document.getElementById('imp-wrap-forzar-costo');
        if (g) g.style.display = e.target.checked ? 'grid' : 'none';
        if (f) f.style.display = e.target.checked ? 'flex' : 'none';
        recalcularAuditoriaYVistaPreviaImp();
        return;
    }

    if (e.target.id === 'imp-chk-forzar-costo') {
        window.impState.forzarPrecioDesdeCosto = e.target.checked;
        recalcularAuditoriaYVistaPreviaImp();
        return;
    }

    if (e.target.id === 'imp-sel-redondeo-costo') {
        window.impState.redondeoCosto = parseInt(e.target.value, 10) || 0;
        recalcularAuditoriaYVistaPreviaImp();
        return;
    }

    if (e.target.id === 'imp-chk-crear-cats') {
        window.impState.crearCategoriasAuto = e.target.checked;
        return;
    }

    if (e.target.id === 'imp-chk-visibles-def') {
        window.impState.visiblesPorDefecto = e.target.checked;
    }
});

document.addEventListener('input', (e) => {
    if (e.target.id === 'imp-inp-margen-costo') {
        window.impState.margenDesdeCostoPct = Math.max(0, parseFloat(e.target.value) || 0);
        recalcularAuditoriaYVistaPreviaImp();
    }
});

