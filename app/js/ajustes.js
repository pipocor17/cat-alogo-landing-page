/* ==========================================================================
   MÓDULO: CONFIGURACIÓN & BÓVEDA LOCAL (AJUSTES — ETAPAS 1, 2, 3 Y TICKETS)
   ========================================================================== */

const STORAGE_KEY_CFG_BAK_HIST = 'cat_alogo_bak_hist_v1';
const STORAGE_KEY_SISTEMA_CFG = 'cat_alogo_sistema_cfg_v1';
const STORAGE_KEY_CFG_PRO = 'cat_alogo_sistema_pro_v1';

const CFG_ETIQUETAS_CLAVES = {
    cat_alogo_productos_v1: '📦 Inventario & Productos',
    cat_alogo_categorias_v1: '🏷️ Categorías',
    cat_alogo_clientes_v1: '👥 Clientes & Cuentas Corrientes',
    cat_alogo_proveedores_v1: '🚚 Proveedores',
    cat_alogo_pos_ventas_v1: '🧾 Ventas POS & Cat-Web',
    cat_alogo_pos_turnos_v1: '🔐 Turnos de Caja & Cortes Z',
    cat_alogo_finanzas_movs_v1: '💰 Movimientos Financieros / OPEX',
    cat_alogo_finanzas_cfg_v1: '📊 Configuración Finanzas',
    cat_alogo_medios_pago_v1: '💳 Medios de Pago y Recargos',
    cat_alogo_pdf_config_v1: '📄 Diseño de Catálogo PDF',
    cat_alogo_web_config_v1: '🌐 Configuración Cat-Web',
    cat_alogo_web_pedidos_v1: '📡 Radar de Pedidos Cat-Web',
    cat_alogo_firebase_cfg_v1: '☁️ Puente Firebase',
    cat_alogo_ticket_cfg_v1: '🧾 Diseño de Tickets & Comprobantes'
};

const CFG_MONEDAS_PAISES = [
    { id: 'es-AR', label: 'Argentina (es-AR — $)', simbolo: '$', codigo: 'ARS' },
    { id: 'es-CL', label: 'Chile (es-CL — $)', simbolo: '$', codigo: 'CLP' },
    { id: 'es-UY', label: 'Uruguay (es-UY — $U)', simbolo: '$U', codigo: 'UYU' },
    { id: 'es-MX', label: 'México (es-MX — $)', simbolo: '$', codigo: 'MXN' },
    { id: 'es-CO', label: 'Colombia (es-CO — $)', simbolo: '$', codigo: 'COP' },
    { id: 'es-PE', label: 'Perú (es-PE — S/)', simbolo: 'S/', codigo: 'PEN' },
    { id: 'es-ES', label: 'España / Europa (es-ES — €)', simbolo: '€', codigo: 'EUR' },
    { id: 'en-US', label: 'Estados Unidos (en-US — US$)', simbolo: 'US$', codigo: 'USD' }
];

window.cfgState = {
    tabActiva: 'boveda',
    restoreRawObj: null,
    restorePayloadListo: null,
    restoreFilename: ''
};

window.tksStudioState = {
    previewTab: 'thermal', // 'thermal' | 'whatsapp' | 'modal'
    draft: null
};

/* ==========================================================================
   UTILIDADES DE BÓVEDA Y CRIPTOGRAFÍA NATIVA (WEB CRYPTO API)
   ========================================================================== */
function escaparHtmlCfg(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatearBytesCfg(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function recolectarDatosBovedaCfg(incluirImagenes = true) {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('cat_alogo_')) continue;
        if (k === STORAGE_KEY_CFG_BAK_HIST || k === 'cat_alogo_imp_backup_v1') continue;

        const raw = localStorage.getItem(k);
        if (incluirImagenes) {
            data[k] = raw;
        } else {
            try {
                const parsed = JSON.parse(raw);
                if (k === 'cat_alogo_productos_v1' && Array.isArray(parsed)) {
                    data[k] = JSON.stringify(parsed.map(p => ({ ...p, imagenes: [] })));
                } else if (k === 'cat_alogo_web_config_v1' && parsed && typeof parsed === 'object') {
                    data[k] = JSON.stringify({ ...parsed, bannerImg: '', logoImg: '' });
                } else {
                    data[k] = raw;
                }
            } catch {
                data[k] = raw;
            }
        }
    }
    return data;
}

function calcularResumenContenidoCfg(dataMap) {
    const contarArr = (key) => {
        try {
            const arr = JSON.parse(dataMap[key] || '[]');
            return Array.isArray(arr) ? arr.length : 0;
        } catch {
            return 0;
        }
    };
    return {
        claves: Object.keys(dataMap).length,
        productos: contarArr('cat_alogo_productos_v1'),
        ventas: contarArr('cat_alogo_pos_ventas_v1'),
        clientes: contarArr('cat_alogo_clientes_v1'),
        proveedores: contarArr('cat_alogo_proveedores_v1'),
        pedidosWeb: contarArr('cat_alogo_web_pedidos_v1')
    };
}

async function calcularSha256HexCfg(texto) {
    if (window.crypto?.subtle) {
        const buf = new TextEncoder().encode(texto);
        const hashBuf = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 2166136261;
    for (let i = 0; i < texto.length; i++) {
        h ^= texto.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

function bytesABase64Cfg(u8) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < u8.length; i += chunk) {
        bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return btoa(bin);
}

function base64ABytesCfg(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
}

async function derivarClaveAesCfg(password, saltBytes) {
    const keyMat = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBytes, iterations: 120000, hash: 'SHA-256' },
        keyMat,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function cifrarTextoAesCfg(textoPlano, password) {
    if (!window.crypto?.subtle) {
        throw new Error('Tu navegador requiere HTTPS o localhost para usar cifrado AES-GCM 256.');
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const clave = await derivarClaveAesCfg(password, salt);
    const cifrado = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        clave,
        new TextEncoder().encode(textoPlano)
    );
    return {
        algoritmo: 'AES-GCM-256',
        salt: bytesABase64Cfg(salt),
        iv: bytesABase64Cfg(iv),
        ciphertext: bytesABase64Cfg(new Uint8Array(cifrado))
    };
}

async function descifrarTextoAesCfg(bloque, password) {
    if (!window.crypto?.subtle) {
        throw new Error('Tu navegador no soporta Web Crypto API en este contexto.');
    }
    const salt = base64ABytesCfg(bloque.salt);
    const iv = base64ABytesCfg(bloque.iv);
    const data = base64ABytesCfg(bloque.ciphertext);
    const clave = await derivarClaveAesCfg(password, salt);
    const planoBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, clave, data);
    return new TextDecoder().decode(planoBuf);
}

/* ==========================================================================
   HISTORIAL DE RESPALDOS Y DIAGNÓSTICO REAL
   ========================================================================== */
function obtenerHistorialRespaldosCfg() {
    try {
        const arr = JSON.parse(localStorage.getItem(STORAGE_KEY_CFG_BAK_HIST) || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function registrarRespaldoEnHistorialCfg(item) {
    const hist = obtenerHistorialRespaldosCfg();
    hist.unshift(item);
    localStorage.setItem(STORAGE_KEY_CFG_BAK_HIST, JSON.stringify(hist.slice(0, 15)));
}

async function actualizarDiagnosticoBovedaCfg() {
    const dataFull = recolectarDatosBovedaCfg(true);
    const dataLite = recolectarDatosBovedaCfg(false);

    const strFull = JSON.stringify(dataFull);
    const strLite = JSON.stringify(dataLite);
    const bytesFull = new Blob([strFull]).size;
    const bytesLite = new Blob([strLite]).size;
    const limiteBytes = 5 * 1024 * 1024;
    const pctUso = Math.min(100, Math.round((bytesFull / limiteBytes) * 1000) / 10);

    const resumen = calcularResumenContenidoCfg(dataFull);
    const hash = await calcularSha256HexCfg(strFull);
    const hist = obtenerHistorialRespaldosCfg();

    const setTxt = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    setTxt('cfg-kpi-peso', `${formatearBytesCfg(bytesFull)} / 5 MB`);
    setTxt('cfg-kpi-desglose', `${resumen.productos} prod. • ${resumen.ventas} ventas • ${resumen.clientes} clientes`);

    const badgeUso = document.getElementById('cfg-kpi-uso-badge');
    if (badgeUso) {
        badgeUso.textContent = pctUso < 65 ? `Óptimo (${pctUso}%)` : (pctUso < 85 ? `Moderado (${pctUso}%)` : `Alto (${pctUso}%)`);
        badgeUso.className = pctUso < 65 ? 'cfg-badge-ok' : 'cfg-badge-warn';
    }
    const barra = document.getElementById('cfg-kpi-barra');
    if (barra) barra.style.width = `${Math.max(2, pctUso)}%`;

    setTxt('cfg-kpi-hash', `${hash.slice(0, 8)}…${hash.slice(-6)}`.toUpperCase());
    setTxt('cfg-kpi-copias-badge', `${hist.length} ${hist.length === 1 ? 'copia' : 'copias'}`);
    setTxt('cfg-kpi-ultimo-bak', hist[0] ? new Date(hist[0].fecha).toLocaleDateString('es-AR') : 'Sin respaldos');
    setTxt('cfg-kpi-ultimo-sub', hist[0] ? `${hist[0].nombre} (${hist[0].cifrado ? 'Cifrado' : 'Estándar'})` : 'Recomendado: al menos 1 copia semanal');
    setTxt('cfg-kpi-tablas', `${resumen.claves} colecciones`);

    setTxt('cfg-size-full', formatearBytesCfg(bytesFull));
    setTxt('cfg-size-lite', formatearBytesCfg(bytesLite));

    renderizarHistorialRespaldosCfg(hist);
    renderizarAuditoriaColeccionesCfg(dataFull);
}

function renderizarHistorialRespaldosCfg(hist) {
    const cont = document.getElementById('cfg-bak-hist-list');
    if (!cont) return;

    if (!hist || hist.length === 0) {
        cont.innerHTML = `<div style="text-align:center; padding:1.2rem; color:#64748b; font-size:0.76rem; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:10px;">Todavía no generaste copias de seguridad desde este equipo.</div>`;
        return;
    }

    cont.innerHTML = hist.map(h => `
        <div class="cfg-hist-row">
            <div>
                <strong>${escaparHtmlCfg(h.nombre)}</strong>
                <small>${new Date(h.fecha).toLocaleString('es-AR')} • ${h.resumen?.productos || 0} prod. • SHA-256: ${escaparHtmlCfg((h.hash || '').slice(0, 10))}</small>
            </div>
            <div style="display:flex; align-items:center; gap:0.4rem;">
                <span class="${h.cifrado ? 'cfg-badge-indigo' : 'cfg-badge-soft'}">${h.cifrado ? '🔐 Cifrado' : 'Estándar'}</span>
                <span class="cfg-badge-ok">${escaparHtmlCfg(h.peso)}</span>
            </div>
        </div>
    `).join('');
}

function renderizarAuditoriaColeccionesCfg(dataFull) {
    const cont = document.getElementById('cfg-audit-list');
    if (!cont) return;

    const filas = Object.entries(dataFull).map(([k, raw]) => {
        const bytes = new Blob([raw || '']).size;
        let detalle = 'Objeto de configuración';
        try {
            const p = JSON.parse(raw);
            if (Array.isArray(p)) detalle = `${p.length} registro(s)`;
        } catch { /* texto plano */ }
        return { key: k, label: CFG_ETIQUETAS_CLAVES[k] || k, bytes, detalle };
    }).sort((a, b) => b.bytes - a.bytes);

    if (filas.length === 0) {
        cont.innerHTML = `<div style="text-align:center; padding:1.2rem; color:#64748b; font-size:0.77rem;">La Bóveda Local está vacía.</div>`;
        return;
    }

    cont.innerHTML = filas.map(f => `
        <div class="cfg-audit-row">
            <div>
                <strong>${escaparHtmlCfg(f.label)}</strong>
                <small>${escaparHtmlCfg(f.detalle)}</small>
            </div>
            <span class="cfg-badge-soft">${formatearBytesCfg(f.bytes)}</span>
        </div>
    `).join('');
}

/* ==========================================================================
   EXPORTACIÓN DE RESPALDO (.CATBAK FULL / .JSON LIVIANO + CIFRADO OPCIONAL)
   ========================================================================== */
async function generarYDescargarRespaldoCfg(tipo = 'full') {
    const esFull = tipo === 'full';
    const cifrar = !!document.getElementById('cfg-chk-cifrar-bak')?.checked;
    let password = '';

    if (cifrar) {
        const p1 = (document.getElementById('cfg-inp-bak-pass')?.value || '').trim();
        const p2 = (document.getElementById('cfg-inp-bak-pass2')?.value || '').trim();
        if (p1.length < 4) {
            alert('🔐 Ingresa una contraseña de al menos 4 caracteres para cifrar el archivo, o desmarca la casilla de cifrado.');
            document.getElementById('cfg-inp-bak-pass')?.focus();
            return;
        }
        if (p1 !== p2) {
            alert('🔐 Las contraseñas no coinciden. Verifícalas antes de exportar.');
            document.getElementById('cfg-inp-bak-pass2')?.focus();
            return;
        }
        password = p1;
    }

    const data = recolectarDatosBovedaCfg(esFull);
    const resumen = calcularResumenContenidoCfg(data);
    const payloadStr = JSON.stringify(data);
    const sha256 = await calcularSha256HexCfg(payloadStr);
    const fechaIso = new Date().toISOString();

    const archivoObj = {
        formato: 'CAT-ALOGO-BACKUP',
        version: '4.2',
        tipo: esFull ? 'full' : 'liviano',
        fecha: fechaIso,
        cifrado: cifrar,
        sha256,
        resumen
    };

    try {
        if (cifrar) {
            archivoObj.crypto = await cifrarTextoAesCfg(payloadStr, password);
        } else {
            archivoObj.data = data;
        }
    } catch (err) {
        alert(`⚠️ No se pudo cifrar el archivo: ${err.message}`);
        return;
    }

    const contenidoFinal = JSON.stringify(archivoObj, null, 2);
    const blob = new Blob([contenidoFinal], { type: 'application/json;charset=utf-8' });
    const stamp = fechaIso.slice(0, 16).replace('T', '_').replace(':', '-');
    const ext = esFull ? 'catbak' : 'json';
    const nombreArchivo = `cat-alogo-${esFull ? 'full' : 'datos'}-${stamp}.${ext}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);

    registrarRespaldoEnHistorialCfg({
        fecha: fechaIso,
        nombre: nombreArchivo,
        tipo: esFull ? 'full' : 'liviano',
        cifrado: cifrar,
        peso: formatearBytesCfg(blob.size),
        hash: sha256,
        resumen
    });

    actualizarDiagnosticoBovedaCfg();
}

/* ==========================================================================
   RESTAURACIÓN CON VISTA PREVIA Y VERIFICACIÓN SHA-256
   ========================================================================== */
function leerArchivoParaRestaurarCfg(archivo) {
    if (!archivo) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const parsed = JSON.parse(String(ev.target.result || ''));
            if (!parsed || parsed.formato !== 'CAT-ALOGO-BACKUP') {
                alert('❌ El archivo seleccionado no tiene un formato válido de respaldo Cat-Alogo (.catbak / .json).');
                return;
            }

            window.cfgState.restoreRawObj = parsed;
            window.cfgState.restorePayloadListo = null;
            window.cfgState.restoreFilename = archivo.name;

            const dz = document.getElementById('cfg-restore-dropzone');
            const prev = document.getElementById('cfg-restore-preview');
            if (dz) dz.style.display = 'none';
            if (prev) prev.style.display = 'flex';

            document.getElementById('cfg-rp-filename').textContent = archivo.name;
            const badge = document.getElementById('cfg-rp-tipo');
            const passWrap = document.getElementById('cfg-rp-pass-wrap');
            const sumBox = document.getElementById('cfg-rp-summary');
            const btnAplicar = document.getElementById('btn-cfg-rp-aplicar');

            if (parsed.cifrado && parsed.crypto) {
                if (badge) badge.textContent = '🔐 Cifrado AES-256';
                if (passWrap) passWrap.style.display = 'block';
                if (sumBox) sumBox.style.display = 'none';
                if (btnAplicar) btnAplicar.disabled = true;
                const inpP = document.getElementById('cfg-rp-pass-inp');
                if (inpP) { inpP.value = ''; inpP.focus(); }
            } else {
                if (badge) badge.textContent = parsed.tipo === 'liviano' ? '⚡ Liviano (.json)' : '📦 Completo (.catbak)';
                if (passWrap) passWrap.style.display = 'none';
                await validarYMostrarVistaPreviaRestoreCfg(parsed.data, parsed);
            }
        } catch (err) {
            console.error(err);
            alert('❌ No se pudo leer el archivo. Asegúrate de que no esté corrupto.');
        }
    };
    reader.readAsText(archivo, 'UTF-8');
}

async function validarYMostrarVistaPreviaRestoreCfg(dataMap, metaObj) {
    const sumBox = document.getElementById('cfg-rp-summary');
    const btnAplicar = document.getElementById('btn-cfg-rp-aplicar');
    if (!dataMap || typeof dataMap !== 'object') {
        alert('❌ El respaldo no contiene datos válidos.');
        return;
    }

    const hashCalc = await calcularSha256HexCfg(JSON.stringify(dataMap));
    const integridadOk = !metaObj.sha256 || hashCalc === metaObj.sha256;
    const res = calcularResumenContenidoCfg(dataMap);
    const fechaTxt = metaObj.fecha ? new Date(metaObj.fecha).toLocaleString('es-AR') : 'Desconocida';

    window.cfgState.restorePayloadListo = dataMap;

    if (sumBox) {
        sumBox.style.display = 'flex';
        sumBox.innerHTML = `
            <div><strong>📅 Fecha de la copia:</strong> ${escaparHtmlCfg(fechaTxt)}</div>
            <div><strong>📦 Contenido detectado:</strong> ${res.productos} productos • ${res.ventas} ventas POS • ${res.clientes} clientes • ${res.proveedores} proveedores</div>
            <div><strong>🗂️ Colecciones:</strong> ${res.claves} tablas del sistema</div>
            <div style="color:${integridadOk ? '#059669' : '#d97706'}; font-weight:700;">
                ${integridadOk ? '✅ Firma digital SHA-256 verificada (archivo íntegro)' : '⚠️ Aviso: La firma SHA-256 difiere del original'}
            </div>
        `;
    }
    if (btnAplicar) btnAplicar.disabled = false;
}

function cancelarVistaPreviaRestoreCfg() {
    window.cfgState.restoreRawObj = null;
    window.cfgState.restorePayloadListo = null;
    const dz = document.getElementById('cfg-restore-dropzone');
    const prev = document.getElementById('cfg-restore-preview');
    const inp = document.getElementById('cfg-restore-file-input');
    if (dz) dz.style.display = 'flex';
    if (prev) prev.style.display = 'none';
    if (inp) inp.value = '';
}

function aplicarRestauracionBovedaCfg() {
    const dataMap = window.cfgState.restorePayloadListo;
    if (!dataMap) return;

    const ok = confirm(
        `⚠️ ¿Confirmar restauración de la Bóveda Local desde "${window.cfgState.restoreFilename}"?\n\n` +
        `Esto sobrescribirá los datos actuales de este navegador con los del respaldo y recargará la aplicación.`
    );
    if (!ok) return;

    const aBorrar = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('cat_alogo_') && k !== STORAGE_KEY_CFG_BAK_HIST) aBorrar.push(k);
    }
    aBorrar.forEach(k => localStorage.removeItem(k));

    Object.entries(dataMap).forEach(([k, val]) => {
        if (typeof val === 'string') localStorage.setItem(k, val);
    });

    alert('✅ Bóveda Local restaurada correctamente. La aplicación se recargará ahora para aplicar todos los cambios.');
    window.location.reload();
}

async function reiniciarBovedaLocalCfg() {
    const okPin = await verificarPinAdminSistemaCfg('reiniciar la Bóveda Local');
    if (!okPin) return;

    const resp = prompt(
        `⚠️ ZONA DE PELIGRO — REINICIAR BÓVEDA LOCAL\n\n` +
        `Esto borrará TODOS tus productos, ventas, turnos, clientes, proveedores y configuraciones de este navegador.\n` +
        `Esta acción NO se puede deshacer sin un archivo .catbak.\n\n` +
        `Escribe BORRAR TODO en mayúsculas para confirmar:`
    );
    if (String(resp || '').trim() !== 'BORRAR TODO') {
        alert('Operación cancelada. Tus datos siguen intactos.');
        return;
    }

    const claves = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('cat_alogo_')) claves.push(k);
    }
    claves.forEach(k => localStorage.removeItem(k));
    alert('🗑️ Bóveda Local reiniciada. La aplicación se recargará en limpio.');
    window.location.reload();
}

/* ==========================================================================
   ETAPA 2: PERFILES, MONEDA, DÓLAR OPCIONAL, PLANTILLA Y MODO OSCURO
   ========================================================================== */
function obtenerConfigSistemaCfg() {
    let nomPdf = 'Mi Comercio';
    try {
        const pdf = JSON.parse(localStorage.getItem('cat_alogo_pdf_config_v1') || 'null');
        if (pdf?.headerNombre) nomPdf = pdf.headerNombre;
    } catch { /* fallback */ }

    const defaults = {
        negocio: {
            logo: '',
            nombre: nomPdf,
            eslogan: '',
            whatsappVentas: '',
            firmaPie: 'Generado con Cat-Alogo',
            telefono: '',
            direccion: '',
            sitioWeb: '',
            idFiscal: '',
            descripcion: ''
        },
        usuario: {
            avatar: '',
            nombre: 'Administrador',
            email: '',
            telefono: '',
            rol: 'Administrador',
            bio: ''
        },
        moneda: {
            locale: 'es-AR',
            mostrarDecimales: true,
            zonaHoraria: 'America/Argentina/Buenos_Aires'
        },
        dolar: {
            valorManual: 1150,
            usarApiEnVivo: false,
            tipoApi: 'blue',
            ultimaActualizacion: null,
            margenCmvPct: 30
        },
        plantillaProveedor: 'Hola {PROVEEDOR}, te paso nuestro pedido para reponer stock:\n\n{PRODUCTOS}\n\n¿Me confirmas disponibilidad y total? ¡Gracias!',
        modoOscuro: false
    };

    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_SISTEMA_CFG) || 'null');
        if (!raw) return defaults;
        return {
            negocio: { ...defaults.negocio, ...(raw.negocio || {}) },
            usuario: { ...defaults.usuario, ...(raw.usuario || {}) },
            moneda: { ...defaults.moneda, ...(raw.moneda || {}) },
            dolar: { ...defaults.dolar, ...(raw.dolar || {}) },
            plantillaProveedor: raw.plantillaProveedor || defaults.plantillaProveedor,
            modoOscuro: !!raw.modoOscuro
        };
    } catch {
        return defaults;
    }
}

function guardarConfigSistemaCfg(cfg) {
    localStorage.setItem(STORAGE_KEY_SISTEMA_CFG, JSON.stringify(cfg));
    aplicarTemaGlobalCfg(cfg.modoOscuro);
    sincronizarPerfilConDashboardYEcosistemaCfg(cfg);
    window.dispatchEvent(new CustomEvent('cat-alogo:sistema-cfg-actualizado', { detail: cfg }));
}

function aplicarTemaGlobalCfg(oscuro) {
    document.body.classList.toggle('cat-dark-mode', !!oscuro);
}

function sincronizarPerfilConDashboardYEcosistemaCfg(cfg) {
    const u = cfg.usuario || {};
    const iniciales = String(u.nombre || 'AD').trim().split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();

    document.querySelectorAll('#topbar-user-name, .user-name, .topbar-user-name').forEach(el => {
        if (u.nombre) el.textContent = u.nombre;
    });
    document.querySelectorAll('#topbar-user-role, .user-role, .topbar-user-role').forEach(el => {
        if (u.rol) el.textContent = u.rol;
    });
    document.querySelectorAll('#topbar-user-avatar, .user-avatar, .topbar-avatar').forEach(el => {
        if (u.avatar) {
            el.innerHTML = `<img src="${u.avatar}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            el.textContent = iniciales;
        }
    });

    try {
        const pdfCfg = JSON.parse(localStorage.getItem('cat_alogo_pdf_config_v1') || '{}');
        if (cfg.negocio?.nombre) pdfCfg.headerNombre = cfg.negocio.nombre;
        const contactoPartes = [cfg.negocio?.whatsappVentas, cfg.negocio?.direccion].filter(Boolean);
        if (contactoPartes.length > 0) pdfCfg.headerContacto = contactoPartes.join(' • ');
        localStorage.setItem('cat_alogo_pdf_config_v1', JSON.stringify(pdfCfg));
    } catch { /* ignore */ }

    try {
        const finCfg = JSON.parse(localStorage.getItem('cat_alogo_finanzas_cfg_v1') || '{}');
        if (typeof cfg.dolar?.margenCmvPct === 'number') {
            finCfg.margenGlobalPct = cfg.dolar.margenCmvPct;
            localStorage.setItem('cat_alogo_finanzas_cfg_v1', JSON.stringify(finCfg));
        }
    } catch { /* ignore */ }
}

function formatearEjemploMonedaCfg(localeId, conDecimales) {
    const info = CFG_MONEDAS_PAISES.find(m => m.id === localeId) || CFG_MONEDAS_PAISES[0];
    const num = (1234.56).toLocaleString(info.id, {
        minimumFractionDigits: conDecimales ? 2 : 0,
        maximumFractionDigits: conDecimales ? 2 : 0
    });
    return `${info.simbolo} ${num}`;
}

async function consultarDolarEnVivoCfg(tipo = 'blue') {
    const endpoint = tipo === 'oficial'
        ? 'https://dolarapi.com/v1/dolares/oficial'
        : 'https://dolarapi.com/v1/dolares/blue';
    const resp = await fetch(endpoint);
    if (!resp.ok) throw new Error(`Error HTTP ${resp.status}`);
    const json = await resp.json();
    const valor = Number(json.venta || json.compra || 0);
    if (!valor) throw new Error('Respuesta sin cotización válida');
    return valor;
}

function renderizarEtapa2NegocioCfg() {
    const anchor = document.getElementById('cfg-stage2-negocio-anchor');
    if (!anchor) return;

    const cfg = obtenerConfigSistemaCfg();
    const n = cfg.negocio;
    const u = cfg.usuario;
    const m = cfg.moneda;
    const d = cfg.dolar;

    const monedasOpts = CFG_MONEDAS_PAISES.map(p =>
        `<option value="${p.id}" ${m.locale === p.id ? 'selected' : ''}>${escaparHtmlCfg(p.label)}</option>`
    ).join('');

    const iniUser = String(u.nombre || 'AD').trim().split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();

    anchor.innerHTML = `
        <div class="cfg-grid-2">
            <!-- COLUMNA IZQUIERDA: PERFIL DEL NEGOCIO + PLANTILLA PROVEEDORES -->
            <div class="cfg-col">
                <form id="form-cfg-negocio" class="cfg-card">
                    <div class="cfg-card-head">
                        <div>
                            <h3>🏪 Perfil del Negocio</h3>
                            <p>Aparece automáticamente en Tickets POS, Catálogo PDF y tu tienda Cat-Web.</p>
                        </div>
                        <span class="cfg-badge-ok">Fuente Única</span>
                    </div>

                    <div class="cfg-profile-head-row">
                        <div class="cfg-avatar-circle" id="cfg-neg-logo-prev">
                            ${n.logo ? `<img src="${n.logo}" alt="Logo">` : '🏪'}
                        </div>
                        <div style="display:flex; gap:0.45rem; flex-wrap:wrap;">
                            <label class="cfg-btn cfg-btn-indigo cfg-btn-sm" for="cfg-file-neg-logo" style="cursor:pointer;">🖼️ Subir Logotipo</label>
                            <input type="file" id="cfg-file-neg-logo" accept="image/*" hidden>
                            <button type="button" class="cfg-btn cfg-btn-light cfg-btn-sm" id="btn-cfg-del-neg-logo">Quitar</button>
                        </div>
                    </div>

                    <div class="cfg-form-grid-2">
                        <div class="cfg-field">
                            <label for="cfg-neg-nombre">Nombre del Negocio *</label>
                            <input type="text" id="cfg-neg-nombre" class="cfg-input" value="${escaparHtmlCfg(n.nombre)}" required>
                        </div>
                        <div class="cfg-field">
                            <label for="cfg-neg-eslogan">Subtítulo o Eslogan</label>
                            <input type="text" id="cfg-neg-eslogan" class="cfg-input" value="${escaparHtmlCfg(n.eslogan)}" placeholder="Ej: Almacén Saludable">
                        </div>
                        <div class="cfg-field">
                            <label for="cfg-neg-wa">WhatsApp de Ventas</label>
                            <input type="text" id="cfg-neg-wa" class="cfg-input" value="${escaparHtmlCfg(n.whatsappVentas)}" placeholder="+54 9 351 0000000">
                        </div>
                        <div class="cfg-field">
                            <label for="cfg-neg-tel">Teléfono del Negocio</label>
                            <input type="text" id="cfg-neg-tel" class="cfg-input" value="${escaparHtmlCfg(n.telefono)}" placeholder="Opcional">
                        </div>
                        <div class="cfg-field">
                            <label for="cfg-neg-dir">Dirección</label>
                            <input type="text" id="cfg-neg-dir" class="cfg-input" value="${escaparHtmlCfg(n.direccion)}" placeholder="Calle y número">
                        </div>
                        <div class="cfg-field">
                            <label for="cfg-neg-fiscal">ID Fiscal / CUIT / NIF</label>
                            <input type="text" id="cfg-neg-fiscal" class="cfg-input" value="${escaparHtmlCfg(n.idFiscal)}" placeholder="Ej: 20-12345678-9">
                        </div>
                        <div class="cfg-field">
                            <label for="cfg-neg-web">Sitio Web / Tienda Online</label>
                            <input type="text" id="cfg-neg-web" class="cfg-input" value="${escaparHtmlCfg(n.sitioWeb)}" placeholder="https://...">
                        </div>
                        <div class="cfg-field">
                            <label for="cfg-neg-firma">Firma de Pie de Página</label>
                            <input type="text" id="cfg-neg-firma" class="cfg-input" value="${escaparHtmlCfg(n.firmaPie)}">
                        </div>
                    </div>

                    <div class="cfg-field">
                        <label for="cfg-neg-desc">Descripción breve del comercio</label>
                        <textarea id="cfg-neg-desc" class="cfg-input" rows="2" placeholder="Horarios, envíos o rubro...">${escaparHtmlCfg(n.descripcion)}</textarea>
                    </div>

                    <div class="cfg-save-bar">
                        <button type="submit" class="cfg-btn cfg-btn-primary">💾 Guardar Perfil del Negocio</button>
                    </div>
                </form>

                <!-- PLANTILLA DE PEDIDO A PROVEEDORES -->
                <article class="cfg-card">
                    <div class="cfg-card-head">
                        <div>
                            <h3>📦 Plantilla de Pedido a Proveedores (WhatsApp)</h3>
                            <p>Personaliza el mensaje que se genera al pedir reposición de stock.</p>
                        </div>
                    </div>
                    <div class="cfg-vars-hint">
                        Variables disponibles: <code>{PROVEEDOR}</code> y <code>{PRODUCTOS}</code>.
                    </div>
                    <textarea id="cfg-inp-plantilla-prov" class="cfg-input" rows="4">${escaparHtmlCfg(cfg.plantillaProveedor)}</textarea>
                    <div class="cfg-save-bar">
                        <button type="button" class="cfg-btn cfg-btn-primary" id="btn-cfg-guardar-plantilla">💾 Guardar Plantilla</button>
                    </div>
                </article>
            </div>

            <!-- COLUMNA DERECHA: PERFIL USUARIO + MONEDA/DÓLAR + MODO OSCURO -->
            <div class="cfg-col">
                <form id="form-cfg-usuario" class="cfg-card">
                    <div class="cfg-card-head">
                        <div>
                            <h3>👤 Perfil del Usuario</h3>
                            <p>Se muestra en la barra superior y como operador por defecto.</p>
                        </div>
                    </div>

                    <div class="cfg-profile-head-row">
                        <div class="cfg-avatar-circle" id="cfg-usr-avatar-prev">
                            ${u.avatar ? `<img src="${u.avatar}" alt="Avatar">` : escaparHtmlCfg(iniUser)}
                        </div>
                        <div style="display:flex; gap:0.45rem; flex-wrap:wrap;">
                            <label class="cfg-btn cfg-btn-indigo cfg-btn-sm" for="cfg-file-usr-avatar" style="cursor:pointer;">📸 Subir Foto</label>
                            <input type="file" id="cfg-file-usr-avatar" accept="image/*" hidden>
                            <button type="button" class="cfg-btn cfg-btn-light cfg-btn-sm" id="btn-cfg-del-usr-avatar">Usar iniciales</button>
                        </div>
                    </div>

                    <div class="cfg-form-grid-2">
                        <div class="cfg-field">
                            <label for="cfg-usr-nombre">Nombre del Usuario *</label>
                            <input type="text" id="cfg-usr-nombre" class="cfg-input" value="${escaparHtmlCfg(u.nombre)}" required>
                        </div>
                        <div class="cfg-field">
                            <label for="cfg-usr-rol">Rol / Cargo</label>
                            <input type="text" id="cfg-usr-rol" class="cfg-input" value="${escaparHtmlCfg(u.rol)}" placeholder="Administrador / Cajero">
                        </div>
                        <div class="cfg-field">
                            <label for="cfg-usr-email">Email</label>
                            <input type="email" id="cfg-usr-email" class="cfg-input" value="${escaparHtmlCfg(u.email)}" placeholder="correo@ejemplo.com">
                        </div>
                        <div class="cfg-field">
                            <label for="cfg-usr-tel">Teléfono</label>
                            <input type="text" id="cfg-usr-tel" class="cfg-input" value="${escaparHtmlCfg(u.telefono)}">
                        </div>
                    </div>

                    <div class="cfg-field">
                        <label for="cfg-usr-bio">Nota / Biografía</label>
                        <input type="text" id="cfg-usr-bio" class="cfg-input" value="${escaparHtmlCfg(u.bio)}" placeholder="Opcional">
                    </div>

                    <div class="cfg-save-bar">
                        <button type="submit" class="cfg-btn cfg-btn-primary">💾 Guardar Perfil de Usuario</button>
                    </div>
                </form>

                <!-- MONEDA, DECIMALES, DÓLAR OPCIONAL Y MARGEN CMV -->
                <article class="cfg-card">
                    <div class="cfg-card-head">
                        <div>
                            <h3>💵 Moneda, Cotización Dólar y Margen CMV</h3>
                            <p>Compatible con cualquier país. La actualización automática de dólar es opcional.</p>
                        </div>
                    </div>

                    <div class="cfg-form-grid-2">
                        <div class="cfg-field">
                            <label for="cfg-mon-locale">País / Formato de Moneda</label>
                            <select id="cfg-mon-locale" class="cfg-input">${monedasOpts}</select>
                        </div>
                        <div class="cfg-field">
                            <label for="cfg-mon-tz">Zona Horaria</label>
                            <select id="cfg-mon-tz" class="cfg-input">
                                <option value="America/Argentina/Buenos_Aires" ${m.zonaHoraria === 'America/Argentina/Buenos_Aires' ? 'selected' : ''}>Argentina (ART)</option>
                                <option value="America/Santiago" ${m.zonaHoraria === 'America/Santiago' ? 'selected' : ''}>Chile (CLT)</option>
                                <option value="America/Montevideo" ${m.zonaHoraria === 'America/Montevideo' ? 'selected' : ''}>Uruguay (UYT)</option>
                                <option value="America/Mexico_City" ${m.zonaHoraria === 'America/Mexico_City' ? 'selected' : ''}>México (CST)</option>
                                <option value="America/Bogota" ${m.zonaHoraria === 'America/Bogota' ? 'selected' : ''}>Colombia / Perú (COT)</option>
                                <option value="Europe/Madrid" ${m.zonaHoraria === 'Europe/Madrid' ? 'selected' : ''}>España (CET)</option>
                            </select>
                        </div>
                    </div>

                    <label class="cfg-switch-row">
                        <input type="checkbox" id="cfg-mon-decimales" ${m.mostrarDecimales ? 'checked' : ''}>
                        <span><strong>Mostrar decimales en importes</strong> (ej: <code>$ 1.234,56</code> vs <code>$ 1.235</code>)</span>
                    </label>

                    <div class="cfg-currency-preview">
                        <small>Vista previa del formato</small>
                        <strong id="cfg-mon-preview-val">${formatearEjemploMonedaCfg(m.locale, m.mostrarDecimales)}</strong>
                    </div>

                    <div class="cfg-form-grid-2">
                        <div class="cfg-field">
                            <label for="cfg-dol-valor">Cotización Dólar Referencia (Manual)</label>
                            <input type="number" id="cfg-dol-valor" class="cfg-input" min="0" step="1" value="${d.valorManual}">
                        </div>
                        <div class="cfg-field">
                            <label for="cfg-cmv-margen">Margen de Seguridad CMV (%)</label>
                            <input type="number" id="cfg-cmv-margen" class="cfg-input" min="0" max="200" step="1" value="${d.margenCmvPct}">
                        </div>
                    </div>

                    <label class="cfg-switch-row">
                        <input type="checkbox" id="cfg-dol-api-opt" ${d.usarApiEnVivo ? 'checked' : ''}>
                        <span>
                            <strong>🌎 Cotización Dólar en vivo (Opcional — Solo Argentina / dolarapi.com)</strong>
                            <small>Déjalo desactivado si prefieres ingresar tu propia cotización manual o si operas desde otro país.</small>
                        </span>
                    </label>

                    <div class="cfg-dolar-live-bar" id="cfg-dol-live-bar" style="${d.usarApiEnVivo ? '' : 'display:none;'}">
                        <div style="display:flex; align-items:center; gap:0.45rem;">
                            <span>Referencia:</span>
                            <select id="cfg-dol-api-tipo" class="cfg-input" style="width:auto; padding:0.25rem 0.5rem; font-size:0.74rem;">
                                <option value="blue" ${d.tipoApi === 'blue' ? 'selected' : ''}>Dólar Blue</option>
                                <option value="oficial" ${d.tipoApi === 'oficial' ? 'selected' : ''}>Dólar Oficial</option>
                            </select>
                        </div>
                        <button type="button" class="cfg-btn cfg-btn-indigo cfg-btn-sm" id="btn-cfg-fetch-dolar">↻ Consultar ahora</button>
                    </div>

                    <div class="cfg-save-bar">
                        <button type="button" class="cfg-btn cfg-btn-primary" id="btn-cfg-guardar-moneda">💾 Guardar Moneda y Parámetros</button>
                    </div>
                </article>

                <!-- APARIENCIA (MODO OSCURO GLOBAL) -->
                <article class="cfg-card">
                    <div class="cfg-theme-card">
                        <div>
                            <strong>🌙 Modo Oscuro Global</strong>
                            <small style="display:block; font-size:0.72rem; color:#64748b;">Reduce el brillo en entornos de poca luz y se mantiene en todos los módulos.</small>
                        </div>
                        <label class="cfg-toggle-pill">
                            <input type="checkbox" id="cfg-chk-dark-mode" ${cfg.modoOscuro ? 'checked' : ''}>
                            <span class="cfg-toggle-slider"></span>
                        </label>
                    </div>
                </article>
            </div>
        </div>
    `;
}

function renderizarTarjetaRemoveBgCfg() {
    const panelPos = document.getElementById('cfg-panel-pos');
    if (!panelPos || document.getElementById('cfg-card-removebg')) return;

    const savedKey = localStorage.getItem('cat_alogo_removebg_key') || '';
    const card = document.createElement('article');
    card.className = 'cfg-card';
    card.id = 'cfg-card-removebg';
    card.innerHTML = `
        <div class="cfg-card-head">
            <div>
                <h3>🪄 Quitar Fondos con IA (Remove.bg API Key)</h3>
                <p>Comparte la misma clave con el Estudio Creativo IA de Inventario para borrar fondos en 1 clic.</p>
            </div>
            <span class="${savedKey ? 'cfg-badge-ok' : 'cfg-badge-soft'}" id="cfg-rmbg-badge">${savedKey ? 'API Lista ✓' : 'Sin API Key'}</span>
        </div>
        <div class="cfg-form-grid-2">
            <div class="cfg-field">
                <label for="cfg-inp-rmbg-key">Clave API de Remove.bg</label>
                <input type="password" id="cfg-inp-rmbg-key" class="cfg-input" value="${escaparHtmlCfg(savedKey)}" placeholder="Pega tu clave de remove.bg/api">
            </div>
            <div class="cfg-field" style="display:flex; align-items:flex-end; gap:0.45rem;">
                <button type="button" class="cfg-btn cfg-btn-primary" id="btn-cfg-save-rmbg">💾 Guardar Clave</button>
                <a href="https://www.remove.bg/es/api" target="_blank" rel="noopener" class="cfg-btn cfg-btn-light">Obtener gratis ↗</a>
            </div>
        </div>
    `;

    const anchorPos = document.getElementById('cfg-stage3-pos-anchor');
    if (anchorPos) panelPos.insertBefore(card, anchorPos);
    else panelPos.appendChild(card);
}

/* ==========================================================================
   ETAPA 3: CONFIG PRO, NUBE, OPTIMIZADOR WEBP, PIN Y ESTUDIO DE TICKETS
   ========================================================================== */
function obtenerConfigProCfg() {
    const defaults = {
        hardwarePos: {
            anchoTicketMm: 80,
            mensajePieTicket: '¡Gracias por su compra! Conserve este comprobante.',
            corteAutomatico: true,
            sonidoEscaner: true
        },
        autoRespaldo: {
            alCerrarCaja: true
        },
        seguridadPin: {
            activo: false,
            pinHash: '',
            protegerAnulacionPos: true
        }
    };
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_CFG_PRO) || 'null');
        if (!raw) return defaults;
        return {
            hardwarePos: { ...defaults.hardwarePos, ...(raw.hardwarePos || {}) },
            autoRespaldo: { ...defaults.autoRespaldo, ...(raw.autoRespaldo || {}) },
            seguridadPin: { ...defaults.seguridadPin, ...(raw.seguridadPin || {}) }
        };
    } catch {
        return defaults;
    }
}

function guardarConfigProCfg(cfg) {
    localStorage.setItem(STORAGE_KEY_CFG_PRO, JSON.stringify(cfg));
    window.dispatchEvent(new CustomEvent('cat-alogo:pro-cfg-actualizado', { detail: cfg }));
}

/* --- ESTUDIO VISUAL DE TICKETS, COMPROBANTES Y HARDWARE POS --- */
function obtenerVentaDemoParaPreviewCfg() {
    try {
        const ventas = JSON.parse(localStorage.getItem('cat_alogo_pos_ventas_v1') || '[]');
        if (Array.isArray(ventas) && ventas.length > 0) return ventas[0];
    } catch { /* fallback */ }

    return {
        numeroTicket: 'T-0009',
        turnoNumero: 104,
        fecha: new Date().toISOString(),
        operador: obtenerConfigSistemaCfg().usuario?.nombre || 'Cajero',
        clienteNombre: 'Consumidor Final',
        canal: 'pos',
        nota: 'Venta Mostrador',
        items: [
            { nombre: 'Remera Algodón Premium', cantidad: 1, precioUnit: 10000, unidadMedida: 'Unidad' }
        ],
        subtotal: 10000,
        descuentoPct: 20,
        descuentoMonto: 2000,
        recargoPct: 0,
        recargoMonto: 0,
        total: 8000,
        pagos: [{ medio: 'Efectivo', monto: 8000 }],
        estado: 'completada'
    };
}

function conConfigTemporalTicketCfg(draftCfg, fn) {
    const key = 'cat_alogo_ticket_cfg_v1';
    const prev = localStorage.getItem(key);
    try {
        localStorage.setItem(key, JSON.stringify(draftCfg));
        return fn();
    } finally {
        if (prev === null) localStorage.removeItem(key);
        else localStorage.setItem(key, prev);
    }
}

function resolverUrlQrPreviewCfg(draft, neg) {
    if (draft.qrDestino === 'custom' && draft.qrUrlCustom) return draft.qrUrlCustom.trim();
    if (draft.qrDestino === 'whatsapp' && neg.whatsapp) {
        const tel = neg.whatsapp.replace(/[^\d]/g, '');
        if (tel) return `https://wa.me/${tel}`;
    }
    return neg.urlWeb || '';
}

function formatearWhatsAppHtmlPreviewCfg(texto) {
    return escaparHtmlCfg(texto)
        .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
}

function actualizarVistaPreviaTicketStudioCfg() {
    const stage = document.getElementById('tks-preview-stage');
    if (!stage || !window.TicketEngine || !window.tksStudioState.draft) return;

    const draft = window.tksStudioState.draft;
    const tab = window.tksStudioState.previewTab || 'thermal';

    const ventaBase = obtenerVentaDemoParaPreviewCfg();
    const venta = { ...ventaBase };
    if (draft.mostrarNota && (!venta.nota || venta.nota === 'Venta Mostrador')) {
        venta.nota = draft.notaPorDefecto || 'Retira despues de las 18 hs (Ejemplo de nota)';
    }
    const neg = window.TicketEngine.obtenerDatosNegocio();
    const vNorm = window.TicketEngine.normalizarVenta(venta);

    if (tab === 'thermal') {
        const texto = conConfigTemporalTicketCfg(draft, () =>
            window.TicketEngine.construirTextoThermal(vNorm, draft.anchoMm)
        );
        const urlQr = draft.mostrarQrPie ? resolverUrlQrPreviewCfg(draft, neg) : '';
        const qrHtml = (draft.mostrarQrPie && urlQr)
            ? `
                <div class="tks-paper-qr">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=4&data=${encodeURIComponent(urlQr)}" alt="QR Ticket">
                    <small>${escaparHtmlCfg(draft.qrLeyenda || 'Escanea nuestro catalogo')}</small>
                </div>
            `
            : (draft.mostrarQrPie
                ? `<div class="tks-paper-qr"><small>Configura tu link en Cat-Web o pega una URL personalizada para ver el QR.</small></div>`
                : '');

        stage.innerHTML = `
            <div class="tks-paper ${draft.anchoMm === 58 ? 'is-58mm' : ''}">
                <pre>${escaparHtmlCfg(texto)}</pre>
                ${qrHtml}
            </div>
        `;
        return;
    }

    if (tab === 'whatsapp') {
        const textoWa = conConfigTemporalTicketCfg(draft, () =>
            window.TicketEngine.construirTextoWhatsApp(vNorm)
        );
        const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        stage.innerHTML = `
            <div class="tks-wa-stage">
                <div class="tks-wa-bubble">${formatearWhatsAppHtmlPreviewCfg(textoWa)}<span class="tks-wa-time">${hora} ✓✓</span></div>
            </div>
        `;
        return;
    }

    // Vista previa Modal Flotante PC
    const metaPartes = [];
    if (draft.mostrarDireccion && neg.direccion) metaPartes.push(neg.direccion);
    if (draft.mostrarCuit && neg.idFiscal) metaPartes.push(`CUIT/ID: ${neg.idFiscal}`);

    const logoHtml = (draft.mostrarLogoModal && neg.logo)
        ? `<img src="${neg.logo}" alt="Logo">`
        : '🧾';

    const itemsHtml = vNorm.items.map(it => {
        const sub = (Number(it.precioUnit) || 0) * (Number(it.cantidad) || 1);
        return `
            <div class="tks-pc-item">
                <div>
                    <strong style="display:block; color:#0f172a;">${escaparHtmlCfg(it.nombre || 'Producto')}</strong>
                    <small style="color:#64748b;">${it.cantidad || 1} × $${(Number(it.precioUnit) || 0).toLocaleString('es-AR')}</small>
                </div>
                <strong style="color:#0f172a;">$${sub.toLocaleString('es-AR')}</strong>
            </div>
        `;
    }).join('');

    stage.innerHTML = `
        <div class="tks-pc-card">
            <div class="tks-pc-top">
                <div class="tks-pc-ico">${logoHtml}</div>
                <h4>${escaparHtmlCfg(neg.nombre.toUpperCase())}</h4>
                ${metaPartes.length > 0 ? `<div class="tks-pc-meta">${escaparHtmlCfg(metaPartes.join(' • '))}</div>` : ''}
                <div class="tks-pc-meta" style="margin-top:4px; font-weight:700;">TICKET #${escaparHtmlCfg(vNorm.numeroLimpio)} • ${vNorm.canal === 'web' ? '🌐 Cat-Web' : '🏪 POS Mostrador'}</div>
            </div>
            <div class="tks-pc-body">
                ${itemsHtml}
                <div class="tks-pc-sum">
                    <div class="tks-pc-row"><span>Método de Pago:</span><strong>${escaparHtmlCfg((vNorm.pagos || []).map(p => p.medio).join(' + '))}</strong></div>
                    ${draft.mostrarNota && vNorm.nota ? `<div class="tks-pc-row"><span>Nota:</span><strong>${escaparHtmlCfg(vNorm.nota)}</strong></div>` : ''}
                    ${vNorm.descuentoMonto > 0 ? `<div class="tks-pc-row"><span>Descuento (${vNorm.descuentoPct}%):</span><strong style="color:#059669;">-$${vNorm.descuentoMonto.toLocaleString('es-AR')}</strong></div>` : ''}
                    ${vNorm.recargoMonto > 0 ? `<div class="tks-pc-row"><span>Recargo (${vNorm.recargoPct}%):</span><strong style="color:#dc2626;">+$${vNorm.recargoMonto.toLocaleString('es-AR')}</strong></div>` : ''}
                    <div class="tks-pc-total"><span>TOTAL:</span><span>$${vNorm.total.toLocaleString('es-AR')}</span></div>
                </div>
                <div class="tks-pc-pie">
                    ${draft.mostrarAhorro && vNorm.descuentoMonto > 0 ? `<div style="color:#059669; font-weight:700;">¡Ahorro aplicado: $${vNorm.descuentoMonto.toLocaleString('es-AR')}!</div>` : ''}
                    ${draft.mensajePie ? `<div>${escaparHtmlCfg(draft.mensajePie)}</div>` : ''}
                    ${draft.mostrarPieMarca && draft.textoPieMarca ? `<div style="font-weight:700; margin-top:2px;">${escaparHtmlCfg(draft.textoPieMarca)}</div>` : ''}
                </div>
            </div>
        </div>
    `;
}

function renderizarEtapa3PosCfg() {
    const anchor = document.getElementById('cfg-stage3-pos-anchor');
    if (!anchor) return;

    const tk = window.TicketEngine ? window.TicketEngine.obtenerConfig() : {
        anchoMm: 80, leyendaFiscal: 'COMPROBANTE NO FISCAL', mostrarLogoModal: true,
        mostrarDireccion: true, mostrarCuit: true, mostrarCajeroTurno: true,
        mostrarNota: true, mostrarAhorro: true, mostrarPieMarca: true,
        textoPieMarca: 'Cat-Alogo Local-First POS', notaPorDefecto: '',
        mensajePie: '¡Gracias por su compra! Conserve este comprobante.',
        corteAutomatico: true, mostrarQrPie: false, qrDestino: 'catweb',
        qrUrlCustom: '', qrLeyenda: 'Escanea nuestro catalogo online',
        whatsappUsarEmojis: false, whatsappEncabezado: 'Comprobante {TICKET} - {COMERCIO}',
        whatsappCierre: 'Muchas gracias por tu compra!', whatsappIncluirLinkWeb: false
    };

    const pro = obtenerConfigProCfg();
    window.tksStudioState.draft = { ...tk };

    anchor.innerHTML = `
        <article class="cfg-card" id="tks-studio-card">
            <div class="cfg-card-head">
                <div>
                    <h3>🧾 Estudio Visual de Tickets, Comprobantes y Hardware POS</h3>
                    <p>Personaliza desde un solo lugar tu Ticket Térmico (80mm/58mm), el mensaje de WhatsApp y la ventana flotante de PC.</p>
                </div>
                <span class="cfg-badge-ok">Vista Previa en Vivo</span>
            </div>

            <div class="tks-studio-grid">
                <!-- COLUMNA IZQUIERDA: VISTA PREVIA EN VIVO -->
                <div class="tks-preview-col">
                    <div class="tks-preview-tabs" id="tks-preview-tabs">
                        <button type="button" class="tks-ptab active" data-tkstab="thermal">🖨️ Térmico (<span id="tks-lbl-mm">${tk.anchoMm}</span>mm)</button>
                        <button type="button" class="tks-ptab" data-tkstab="whatsapp">💬 WhatsApp</button>
                        <button type="button" class="tks-ptab" data-tkstab="modal">🪟 Modal PC</button>
                    </div>

                    <div class="tks-stage" id="tks-preview-stage"></div>

                    <div class="tks-test-actions">
                        <button type="button" class="cfg-btn cfg-btn-light cfg-btn-sm" id="btn-tks-probar-pdf" style="flex:1;">
                            🧪 Probar PDF Térmico
                        </button>
                        <button type="button" class="cfg-btn cfg-btn-light cfg-btn-sm" id="btn-tks-probar-wa" style="flex:1;">
                            💬 Probar WhatsApp
                        </button>
                    </div>
                </div>

                <!-- COLUMNA DERECHA: CONTROLES DEL COMPROBANTE Y HARDWARE -->
                <div class="tks-controls-col">
                    <!-- 1. FORMATO TÉRMICO Y LEYENDA -->
                    <div class="tks-section-box">
                        <span class="tks-sec-title">1. Formato Térmico y Encabezado</span>
                        <div class="cfg-paper-grid" id="tks-paper-grid">
                            <button type="button" class="cfg-paper-btn ${tk.anchoMm === 80 ? 'active' : ''}" data-mm="80">
                                🖨️ 80 mm (Estándar)
                                <small>42 columnas • Mostrador</small>
                            </button>
                            <button type="button" class="cfg-paper-btn ${tk.anchoMm === 58 ? 'active' : ''}" data-mm="58">
                                🧾 58 mm (Mini POS)
                                <small>32 columnas • Portátil</small>
                            </button>
                        </div>

                        <div class="cfg-field">
                            <label for="tks-inp-leyenda">Leyenda de Cabecera</label>
                            <input type="text" id="tks-inp-leyenda" class="cfg-input" value="${escaparHtmlCfg(tk.leyendaFiscal)}" placeholder="COMPROBANTE NO FISCAL / PRESUPUESTO">
                        </div>

                        <div class="cfg-field">
                            <label for="tks-inp-pie">Mensaje al Pie del Ticket (se centra y ajusta automáticamente)</label>
                            <textarea id="tks-inp-pie" class="cfg-input" rows="2">${escaparHtmlCfg(tk.mensajePie)}</textarea>
                        </div>
                    </div>

                    <!-- 2. CAMPOS VISIBLES EN LOS COMPROBANTES -->
                    <div class="tks-section-box">
                        <span class="tks-sec-title">2. Campos Visibles</span>
                        <div class="tks-switches-grid">
                            <label class="tks-chk-pill"><input type="checkbox" id="tks-chk-logo" ${tk.mostrarLogoModal ? 'checked' : ''}> Logo en Modal PC</label>
                            <label class="tks-chk-pill"><input type="checkbox" id="tks-chk-dir" ${tk.mostrarDireccion ? 'checked' : ''}> Dirección / WhatsApp</label>
                            <label class="tks-chk-pill"><input type="checkbox" id="tks-chk-cuit" ${tk.mostrarCuit ? 'checked' : ''}> CUIT / ID Fiscal</label>
                            <label class="tks-chk-pill"><input type="checkbox" id="tks-chk-cajero" ${tk.mostrarCajeroTurno ? 'checked' : ''}> Cajero y Turno</label>
                            <label class="tks-chk-pill"><input type="checkbox" id="tks-chk-nota" ${tk.mostrarNota ? 'checked' : ''}> Nota de Venta</label>
                            <label class="tks-chk-pill"><input type="checkbox" id="tks-chk-ahorro" ${tk.mostrarAhorro ? 'checked' : ''}> Mostrar Ahorro ($)</label>
                            <label class="tks-chk-pill"><input type="checkbox" id="tks-chk-marca" ${tk.mostrarPieMarca ? 'checked' : ''}> Firma / Marca al pie</label>
                        </div>

                        <div class="cfg-form-grid-2" style="margin-top:0.35rem;">
                            <div class="cfg-field" id="tks-wrap-nota-def" style="${tk.mostrarNota ? '' : 'display:none;'}">
                                <label for="tks-inp-nota-def">Nota de Venta por defecto (opcional)</label>
                                <input type="text" id="tks-inp-nota-def" class="cfg-input" value="${escaparHtmlCfg(tk.notaPorDefecto || '')}" placeholder="Vacío = solo si el cajero escribe en POS">
                            </div>
                            <div class="cfg-field" id="tks-wrap-firma" style="${tk.mostrarPieMarca ? '' : 'display:none;'}">
                                <label for="tks-inp-firma">Texto de Firma / Marca al pie</label>
                                <input type="text" id="tks-inp-firma" class="cfg-input" value="${escaparHtmlCfg(tk.textoPieMarca || 'Cat-Alogo Local-First POS')}" placeholder="Ej: @mitienda • Cat-Alogo POS">
                            </div>
                        </div>
                    </div>

                    <!-- 3. CÓDIGO QR OPCIONAL AL PIE DEL TICKET -->
                    <div class="tks-section-box">
                        <label class="cfg-switch-row">
                            <input type="checkbox" id="tks-chk-qr" ${tk.mostrarQrPie ? 'checked' : ''}>
                            <span><strong>📱 Incluir Código QR al pie del Ticket Térmico (Opcional)</strong></span>
                        </label>
                        <div id="tks-qr-fields" style="${tk.mostrarQrPie ? 'display:flex; flex-direction:column; gap:0.5rem;' : 'display:none;'}">
                            <div class="cfg-form-grid-2">
                                <div class="cfg-field">
                                    <label for="tks-sel-qr-dest">Destino del QR</label>
                                    <select id="tks-sel-qr-dest" class="cfg-input">
                                        <option value="catweb" ${tk.qrDestino === 'catweb' ? 'selected' : ''}>Mi tienda Cat-Web</option>
                                        <option value="whatsapp" ${tk.qrDestino === 'whatsapp' ? 'selected' : ''}>WhatsApp del local</option>
                                        <option value="custom" ${tk.qrDestino === 'custom' ? 'selected' : ''}>URL personalizada</option>
                                    </select>
                                </div>
                                <div class="cfg-field">
                                    <label for="tks-inp-qr-leyenda">Texto bajo el QR</label>
                                    <input type="text" id="tks-inp-qr-leyenda" class="cfg-input" value="${escaparHtmlCfg(tk.qrLeyenda)}">
                                </div>
                            </div>
                            <div class="cfg-field" id="tks-qr-custom-wrap" style="${tk.qrDestino === 'custom' ? '' : 'display:none;'}">
                                <label for="tks-inp-qr-url">URL personalizada</label>
                                <input type="url" id="tks-inp-qr-url" class="cfg-input" value="${escaparHtmlCfg(tk.qrUrlCustom)}" placeholder="https://instagram.com/tutienda">
                            </div>
                        </div>
                    </div>

                    <!-- 4. COMPROBANTE DE WHATSAPP -->
                    <div class="tks-section-box">
                        <span class="tks-sec-title">4. Plantilla de Comprobante por WhatsApp</span>
                        <div class="cfg-field">
                            <label for="tks-wa-head">Encabezado (variables: <code>{TICKET}</code>, <code>{COMERCIO}</code>, <code>{CLIENTE}</code>, <code>{TOTAL}</code>)</label>
                            <input type="text" id="tks-wa-head" class="cfg-input" value="${escaparHtmlCfg(tk.whatsappEncabezado)}">
                        </div>
                        <div class="cfg-field">
                            <label for="tks-wa-cierre">Mensaje de cierre</label>
                            <input type="text" id="tks-wa-cierre" class="cfg-input" value="${escaparHtmlCfg(tk.whatsappCierre)}">
                        </div>
                        <div class="tks-switches-grid">
                            <label class="tks-chk-pill" title="Desactivado evita símbolos rombo en WhatsApp Desktop de Windows">
                                <input type="checkbox" id="tks-chk-wa-emojis" ${tk.whatsappUsarEmojis ? 'checked' : ''}> Usar emojis en WhatsApp
                            </label>
                            <label class="tks-chk-pill">
                                <input type="checkbox" id="tks-chk-wa-link" ${tk.whatsappIncluirLinkWeb ? 'checked' : ''}> Incluir link Cat-Web
                            </label>
                        </div>
                    </div>

                    <!-- 5. HARDWARE POS & CIERRE DE CAJA -->
                    <div class="tks-section-box">
                        <span class="tks-sec-title">5. Hardware POS &amp; Cierre de Caja</span>
                        <div class="cfg-toggle-list">
                            <div class="cfg-toggle-item">
                                <div>
                                    <strong>💾 Auto-respaldo .catbak al Cerrar Turno (Corte Z)</strong>
                                    <small>Guarda una copia automática al finalizar cada jornada.</small>
                                </div>
                                <label class="cfg-toggle-pill">
                                    <input type="checkbox" id="tks-chk-autobak" ${pro.autoRespaldo?.alCerrarCaja ? 'checked' : ''}>
                                    <span class="cfg-toggle-slider"></span>
                                </label>
                            </div>
                            <div class="cfg-toggle-item">
                                <div>
                                    <strong>✂️ Corte automático de papel</strong>
                                    <small>Agrega avance de papel al final del ticket térmico.</small>
                                </div>
                                <label class="cfg-toggle-pill">
                                    <input type="checkbox" id="tks-chk-corte" ${tk.corteAutomatico ? 'checked' : ''}>
                                    <span class="cfg-toggle-slider"></span>
                                </label>
                            </div>
                            <div class="cfg-toggle-item">
                                <div>
                                    <strong>🔊 Sonido acústico al escanear en POS</strong>
                                    <small>Beep corto al agregar productos al ticket.</small>
                                </div>
                                <label class="cfg-toggle-pill">
                                    <input type="checkbox" id="tks-chk-sonido" ${pro.hardwarePos?.sonidoEscaner ? 'checked' : ''}>
                                    <span class="cfg-toggle-slider"></span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="cfg-save-bar">
                        <button type="button" class="cfg-btn cfg-btn-primary" id="btn-tks-guardar-todo" style="width:100%;">
                            💾 Guardar Diseño de Tickets y Hardware POS
                        </button>
                    </div>
                </div>
            </div>
        </article>
    `;

    enlazarEventosTicketStudioCfg();
    actualizarVistaPreviaTicketStudioCfg();
}

function leerDraftDesdeControlesTicketStudioCfg() {
    const d = window.tksStudioState.draft;
    if (!d) return;

    d.leyendaFiscal = (document.getElementById('tks-inp-leyenda')?.value || '').trim();
    d.mensajePie = (document.getElementById('tks-inp-pie')?.value || '').trim();
    d.mostrarLogoModal = !!document.getElementById('tks-chk-logo')?.checked;
    d.mostrarDireccion = !!document.getElementById('tks-chk-dir')?.checked;
    d.mostrarCuit = !!document.getElementById('tks-chk-cuit')?.checked;
    d.mostrarCajeroTurno = !!document.getElementById('tks-chk-cajero')?.checked;
    d.mostrarNota = !!document.getElementById('tks-chk-nota')?.checked;
    d.mostrarAhorro = !!document.getElementById('tks-chk-ahorro')?.checked;
    d.mostrarPieMarca = !!document.getElementById('tks-chk-marca')?.checked;
    d.notaPorDefecto = (document.getElementById('tks-inp-nota-def')?.value || '').trim();
    d.textoPieMarca = (document.getElementById('tks-inp-firma')?.value || '').trim();

    d.mostrarQrPie = !!document.getElementById('tks-chk-qr')?.checked;
    d.qrDestino = document.getElementById('tks-sel-qr-dest')?.value || 'catweb';
    d.qrLeyenda = (document.getElementById('tks-inp-qr-leyenda')?.value || '').trim();
    d.qrUrlCustom = (document.getElementById('tks-inp-qr-url')?.value || '').trim();

    d.whatsappEncabezado = (document.getElementById('tks-wa-head')?.value || '').trim();
    d.whatsappCierre = (document.getElementById('tks-wa-cierre')?.value || '').trim();
    d.whatsappUsarEmojis = !!document.getElementById('tks-chk-wa-emojis')?.checked;
    d.whatsappIncluirLinkWeb = !!document.getElementById('tks-chk-wa-link')?.checked;
    d.corteAutomatico = !!document.getElementById('tks-chk-corte')?.checked;
}

function enlazarEventosTicketStudioCfg() {
    const card = document.getElementById('tks-studio-card');
    if (!card || card.dataset.tksBound) return;
    card.dataset.tksBound = '1';

    document.getElementById('tks-preview-tabs')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.tks-ptab');
        if (!btn) return;
        window.tksStudioState.previewTab = btn.getAttribute('data-tkstab');
        document.querySelectorAll('#tks-preview-tabs .tks-ptab').forEach(b => b.classList.toggle('active', b === btn));
        actualizarVistaPreviaTicketStudioCfg();
    });

    document.getElementById('tks-paper-grid')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.cfg-paper-btn');
        if (!btn) return;
        const mm = parseInt(btn.getAttribute('data-mm'), 10) || 80;
        window.tksStudioState.draft.anchoMm = mm;
        document.querySelectorAll('#tks-paper-grid .cfg-paper-btn').forEach(b => b.classList.toggle('active', b === btn));
        const lblMm = document.getElementById('tks-lbl-mm');
        if (lblMm) lblMm.textContent = String(mm);
        actualizarVistaPreviaTicketStudioCfg();
    });

    card.addEventListener('input', (e) => {
        if (!e.target.closest('.tks-controls-col')) return;
        leerDraftDesdeControlesTicketStudioCfg();
        actualizarVistaPreviaTicketStudioCfg();
    });

    card.addEventListener('change', (e) => {
        if (!e.target.closest('.tks-controls-col')) return;
        leerDraftDesdeControlesTicketStudioCfg();

        const wrapNota = document.getElementById('tks-wrap-nota-def');
        if (wrapNota) wrapNota.style.display = window.tksStudioState.draft.mostrarNota ? 'block' : 'none';
        const wrapFirma = document.getElementById('tks-wrap-firma');
        if (wrapFirma) wrapFirma.style.display = window.tksStudioState.draft.mostrarPieMarca ? 'block' : 'none';
        const qrBox = document.getElementById('tks-qr-fields');
        if (qrBox) qrBox.style.display = window.tksStudioState.draft.mostrarQrPie ? 'flex' : 'none';
        const customWrap = document.getElementById('tks-qr-custom-wrap');
        if (customWrap) customWrap.style.display = window.tksStudioState.draft.qrDestino === 'custom' ? 'block' : 'none';

        actualizarVistaPreviaTicketStudioCfg();
    });

    document.getElementById('btn-tks-guardar-todo')?.addEventListener('click', () => {
        leerDraftDesdeControlesTicketStudioCfg();
        if (window.TicketEngine) {
            window.TicketEngine.guardarConfig(window.tksStudioState.draft);
        }

        const pro = obtenerConfigProCfg();
        pro.hardwarePos = {
            ...(pro.hardwarePos || {}),
            anchoTicketMm: window.tksStudioState.draft.anchoMm,
            mensajePieTicket: window.tksStudioState.draft.mensajePie,
            corteAutomatico: !!window.tksStudioState.draft.corteAutomatico,
            sonidoEscaner: !!document.getElementById('tks-chk-sonido')?.checked
        };
        pro.autoRespaldo = {
            alCerrarCaja: !!document.getElementById('tks-chk-autobak')?.checked
        };
        guardarConfigProCfg(pro);

        alert(`✅ Diseño de Tickets (${window.tksStudioState.draft.anchoMm}mm, WhatsApp y Modal PC) y Hardware POS guardados.`);
    });

    document.getElementById('btn-tks-probar-pdf')?.addEventListener('click', async () => {
        if (!window.TicketEngine) return;
        leerDraftDesdeControlesTicketStudioCfg();
        window.TicketEngine.guardarConfig(window.tksStudioState.draft);
        await window.TicketEngine.descargarPdfThermal(obtenerVentaDemoParaPreviewCfg(), window.tksStudioState.draft.anchoMm);
    });

    document.getElementById('btn-tks-probar-wa')?.addEventListener('click', () => {
        if (!window.TicketEngine) return;
        leerDraftDesdeControlesTicketStudioCfg();
        window.TicketEngine.guardarConfig(window.tksStudioState.draft);
        window.TicketEngine.abrirWhatsAppTicket(obtenerVentaDemoParaPreviewCfg());
    });
}

/* --- ESTADO DE NUBE (FIREBASE CAT-WEB + RESPALDO DRIVE) --- */
function renderizarEtapa3NubeCfg() {
    const anchor = document.getElementById('cfg-stage3-nube-anchor');
    if (!anchor) return;

    let fb = null;
    try { fb = JSON.parse(localStorage.getItem('cat_alogo_firebase_cfg_v1') || 'null'); } catch { fb = null; }
    const fbConectado = Boolean(fb && fb.apiKey && fb.projectId && fb.uid);

    let webCfg = null;
    try { webCfg = JSON.parse(localStorage.getItem('cat_alogo_web_config_v1') || 'null'); } catch { webCfg = null; }
    const ultimaSync = webCfg?.ultimaSync
        ? new Date(webCfg.ultimaSync).toLocaleString('es-AR')
        : 'Sin sincronizar aún';

    anchor.innerHTML = `
        <div class="cfg-col">
            <article class="cfg-card">
                <div class="cfg-card-head">
                    <div>
                        <h3>🔥 Puente Firebase / Firestore (App Móvil ↔ PC ↔ Cat-Web)</h3>
                        <p>Estado en tiempo real de tu sincronización de catálogo y Radar de Pedidos.</p>
                    </div>
                    <span class="${fbConectado ? 'cfg-badge-ok' : 'cfg-badge-warn'}">
                        ${fbConectado ? '● Conectado' : '● Modo Local'}
                    </span>
                </div>

                <div class="cfg-cloud-card-row">
                    <div>
                        <strong>${fbConectado ? `Proyecto: ${escaparHtmlCfg(fb.projectId)}` : 'Sin credenciales Firebase configuradas'}</strong>
                        <small style="display:block; color:#64748b; margin-top:2px;">
                            ${fbConectado
                                ? `UID Tienda: ${escaparHtmlCfg(fb.uid)} • Ruta: ${escaparHtmlCfg(fb.colTiendas || 'tiendas')}/${escaparHtmlCfg(fb.uid)} • Última sync: ${escaparHtmlCfg(ultimaSync)}`
                                : 'Conecta el mismo proyecto Firebase de tu app móvil para sincronizar precios, stock y pedidos online.'}
                        </small>
                    </div>
                    <button type="button" class="cfg-btn cfg-btn-indigo" id="btn-cfg-ir-catweb-nube">
                        🌐 Ir a Cat-Web / Configurar Firebase
                    </button>
                </div>
            </article>

            <article class="cfg-card">
                <div class="cfg-card-head">
                    <div>
                        <h3>☁️ Respaldo Externo en Google Drive / Nube Personal</h3>
                        <p>Tu archivo <code>.catbak</code> es 100% portátil y compatible con Google Drive, Dropbox o OneDrive sin depender de servidores externos.</p>
                    </div>
                    <span class="cfg-badge-soft">Zero Lock-In</span>
                </div>

                <div class="cfg-cloud-card-row">
                    <div>
                        <strong>Copia portátil lista para subir a tu carpeta de Drive</strong>
                        <small style="display:block; color:#64748b; margin-top:2px;">
                            Recomendación: si vas a guardar tu respaldo en la nube, activa primero el cifrado opcional AES-GCM 256 en la pestaña Bóveda Local.
                        </small>
                    </div>
                    <div style="display:flex; gap:0.45rem; flex-wrap:wrap;">
                        <button type="button" class="cfg-btn cfg-btn-primary" id="btn-cfg-nube-bak-now">💾 Generar .catbak Ahora</button>
                        <a href="https://drive.google.com/drive/my-drive" target="_blank" rel="noopener" class="cfg-btn cfg-btn-light">Abrir Google Drive ↗</a>
                    </div>
                </div>
            </article>
        </div>
    `;
}

/* --- OPTIMIZADOR MASIVO WEBP + PIN DE SEGURIDAD --- */
function renderizarEtapa3MantCfg() {
    const anchor = document.getElementById('cfg-stage3-mant-anchor');
    if (!anchor) return;

    const pro = obtenerConfigProCfg();
    const pin = pro.seguridadPin;

    anchor.innerHTML = `
        <article class="cfg-card">
            <div class="cfg-card-head">
                <div>
                    <h3>⚡ Optimizador Masivo de Imágenes (WebP)</h3>
                    <p>Recorre todas las fotos de tu inventario y portada/logo de Cat-Web para comprimirlas a WebP y liberar espacio en tu navegador.</p>
                </div>
                <span class="cfg-badge-ok">Ahorro de Espacio</span>
            </div>

            <div id="cfg-opt-result-box" class="cfg-opt-result" style="display:none;"></div>

            <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                <button type="button" class="cfg-btn cfg-btn-primary" id="btn-cfg-optimizar-webp">
                    ⚡ Optimizar Todas las Fotos a WebP
                </button>
            </div>
        </article>

        <article class="cfg-card">
            <div class="cfg-card-head">
                <div>
                    <h3>🔐 PIN de Administrador (Opcional)</h3>
                    <p>Protege acciones sensibles (Reiniciar Bóveda, Anulaciones en POS) con un PIN numérico de 4 dígitos guardado como hash SHA-256.</p>
                </div>
                <span class="${pin.activo ? 'cfg-badge-ok' : 'cfg-badge-soft'}" id="cfg-pin-badge">
                    ${pin.activo ? '🔒 PIN Activo' : 'Desactivado'}
                </span>
            </div>

            <div class="cfg-form-grid-2">
                <div class="cfg-field">
                    <label for="cfg-inp-pin-1">${pin.activo ? 'Nuevo PIN (4 dígitos)' : 'Definir PIN (4 dígitos)'}</label>
                    <input type="password" id="cfg-inp-pin-1" class="cfg-input" inputmode="numeric" maxlength="6" placeholder="Ej: 1234">
                </div>
                <div class="cfg-field">
                    <label for="cfg-inp-pin-2">Confirmar PIN</label>
                    <input type="password" id="cfg-inp-pin-2" class="cfg-input" inputmode="numeric" maxlength="6" placeholder="Repite el PIN">
                </div>
            </div>

            <label class="cfg-switch-row">
                <input type="checkbox" id="cfg-chk-pin-pos" ${pin.protegerAnulacionPos ? 'checked' : ''}>
                <span>Solicitar PIN también al anular tickets o cerrar turno en el POS</span>
            </label>

            <div class="cfg-save-bar">
                ${pin.activo ? '<button type="button" class="cfg-btn cfg-btn-light" id="btn-cfg-desactivar-pin">🔓 Quitar PIN</button>' : ''}
                <button type="button" class="cfg-btn cfg-btn-indigo" id="btn-cfg-guardar-pin">💾 Guardar PIN de Seguridad</button>
            </div>
        </article>
    `;
}

function comprimirDataUrlWebpLocalCfg(src, maxSide = 900, maxKb = 85) {
    return new Promise((resolve) => {
        if (!src || typeof src !== 'string' || !src.startsWith('data:image/') || src.startsWith('data:image/svg+xml')) {
            resolve({ out: src, before: 0, after: 0, optimizada: false });
            return;
        }
        const before = Math.round(((src.split(',')[1] || '').length * 3) / 4);
        const img = new Image();
        img.onload = () => {
            try {
                const ratio = Math.min(1, maxSide / Math.max(img.width, img.height, 1));
                const w = Math.max(1, Math.round(img.width * ratio));
                const h = Math.max(1, Math.round(img.height * ratio));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);

                let q = 0.82;
                let res = canvas.toDataURL('image/webp', q);
                let after = Math.round(((res.split(',')[1] || '').length * 3) / 4);
                while (after > maxKb * 1024 && q > 0.35) {
                    q -= 0.12;
                    res = canvas.toDataURL('image/webp', q);
                    after = Math.round(((res.split(',')[1] || '').length * 3) / 4);
                }

                if (after < before) {
                    resolve({ out: res, before, after, optimizada: true });
                } else {
                    resolve({ out: src, before, after: before, optimizada: false });
                }
            } catch {
                resolve({ out: src, before, after: before, optimizada: false });
            }
        };
        img.onerror = () => resolve({ out: src, before, after: before, optimizada: false });
        img.src = src;
    });
}

async function ejecutarOptimizacionMasivaWebpCfg() {
    const btn = document.getElementById('btn-cfg-optimizar-webp');
    const resBox = document.getElementById('cfg-opt-result-box');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Optimizando imágenes…'; }

    let totalAntes = 0;
    let totalDespues = 0;
    let cantOpt = 0;

    try {
        const prods = JSON.parse(localStorage.getItem('cat_alogo_productos_v1') || '[]');
        if (Array.isArray(prods)) {
            for (const p of prods) {
                if (!Array.isArray(p.imagenes)) continue;
                for (let i = 0; i < p.imagenes.length; i++) {
                    const r = await comprimirDataUrlWebpLocalCfg(p.imagenes[i], 900, 85);
                    if (r.before > 0) {
                        totalAntes += r.before;
                        totalDespues += r.after;
                    }
                    if (r.optimizada) {
                        p.imagenes[i] = r.out;
                        cantOpt++;
                    }
                }
            }
            localStorage.setItem('cat_alogo_productos_v1', JSON.stringify(prods));
            if (Array.isArray(window.bovedaProductos)) window.bovedaProductos = prods;
        }

        const webCfg = JSON.parse(localStorage.getItem('cat_alogo_web_config_v1') || 'null');
        if (webCfg) {
            if (webCfg.bannerImg) {
                const rb = await comprimirDataUrlWebpLocalCfg(webCfg.bannerImg, 1200, 110);
                totalAntes += rb.before; totalDespues += rb.after;
                if (rb.optimizada) { webCfg.bannerImg = rb.out; cantOpt++; }
            }
            if (webCfg.logoImg) {
                const rl = await comprimirDataUrlWebpLocalCfg(webCfg.logoImg, 400, 50);
                totalAntes += rl.before; totalDespues += rl.after;
                if (rl.optimizada) { webCfg.logoImg = rl.out; cantOpt++; }
            }
            localStorage.setItem('cat_alogo_web_config_v1', JSON.stringify(webCfg));
        }

        const ahorrado = Math.max(0, totalAntes - totalDespues);
        const pct = totalAntes > 0 ? Math.round((ahorrado / totalAntes) * 100) : 0;

        if (resBox) {
            resBox.style.display = 'block';
            resBox.textContent = cantOpt > 0
                ? `✅ ¡Listo! ${cantOpt} imagen(es) convertidas a WebP. Espacio liberado: ${formatearBytesCfg(ahorrado)} (-${pct}%).`
                : '✅ Todas tus imágenes ya estaban optimizadas (no se encontraron fotos pesadas para comprimir).';
        }
        actualizarDiagnosticoBovedaCfg();
    } catch (err) {
        alert(`⚠️ Error durante la optimización: ${err.message}`);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '⚡ Optimizar Todas las Fotos a WebP'; }
    }
}

/* --- API GLOBAL PARA POS Y VERIFICACIÓN DE PIN --- */
async function verificarPinAdminSistemaCfg(motivo = 'esta acción') {
    const pro = obtenerConfigProCfg();
    if (!pro.seguridadPin?.activo || !pro.seguridadPin?.pinHash) return true;

    const ingresado = prompt(`🔐 PIN de Administrador requerido para ${motivo}:`);
    if (ingresado === null) return false;
    const hashIng = await calcularSha256HexCfg(`pin:${String(ingresado).trim()}`);
    if (hashIng !== pro.seguridadPin.pinHash) {
        alert('❌ PIN incorrecto. Acción cancelada.');
        return false;
    }
    return true;
}

async function ejecutarAutoRespaldoCierreCajaCfg(numeroTurno = '') {
    const pro = obtenerConfigProCfg();
    if (!pro.autoRespaldo?.alCerrarCaja) return;

    try {
        const data = recolectarDatosBovedaCfg(true);
        const resumen = calcularResumenContenidoCfg(data);
        const payloadStr = JSON.stringify(data);
        const sha256 = await calcularSha256HexCfg(payloadStr);
        const fechaIso = new Date().toISOString();

        const archivoObj = {
            formato: 'CAT-ALOGO-BACKUP',
            version: '4.2',
            tipo: 'cierre-caja',
            fecha: fechaIso,
            cifrado: false,
            sha256,
            resumen,
            data
        };

        const blob = new Blob([JSON.stringify(archivoObj)], { type: 'application/json;charset=utf-8' });
        const stamp = fechaIso.slice(0, 16).replace('T', '_').replace(':', '-');
        const tag = numeroTurno ? `turno-${numeroTurno}-` : '';
        const nombreArchivo = `cat-alogo-cierre-${tag}${stamp}.catbak`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombreArchivo;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 3000);

        registrarRespaldoEnHistorialCfg({
            fecha: fechaIso,
            nombre: nombreArchivo,
            tipo: 'cierre-caja',
            cifrado: false,
            peso: formatearBytesCfg(blob.size),
            hash: sha256,
            resumen
        });
    } catch (err) {
        console.warn('No se pudo generar el auto-respaldo de cierre de caja:', err);
    }
}

function reproducirBeepScannerCfg() {
    const pro = obtenerConfigProCfg();
    if (!pro.hardwarePos?.sonidoEscaner) return;
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1250, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    } catch { /* sin audio */ }
}

window.CatAlogoAjustes = {
    obtenerHardwarePos: () => obtenerConfigProCfg().hardwarePos,
    obtenerConfigPro: obtenerConfigProCfg,
    verificarPinAdmin: verificarPinAdminSistemaCfg,
    ejecutarAutoRespaldoCierreCaja: ejecutarAutoRespaldoCierreCajaCfg,
    reproducirBeepScanner: reproducirBeepScannerCfg
};

/* ==========================================================================
   INICIALIZACIÓN Y EVENTOS UNIFICADOS DEL MÓDULO AJUSTES
   ========================================================================== */
function inicializarConfiguracion() {
    const root = document.getElementById('config-module-root');
    if (!root) return;

    renderizarEtapa2NegocioCfg();
    renderizarTarjetaRemoveBgCfg();
    renderizarEtapa3PosCfg();
    renderizarEtapa3NubeCfg();
    renderizarEtapa3MantCfg();

    enlazarEventosConfiguracion();
    enlazarEventosConfiguracionEtapa2();
    enlazarEventosConfiguracionEtapa3();
    actualizarDiagnosticoBovedaCfg();
}

function enlazarEventosConfiguracion() {
    const root = document.getElementById('config-module-root');
    if (!root || root.dataset.cfgBound) return;
    root.dataset.cfgBound = '1';

    document.getElementById('cfg-tabs-bar')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.cfg-tab');
        if (!btn) return;
        const tab = btn.getAttribute('data-cfgtab');
        window.cfgState.tabActiva = tab;
        document.querySelectorAll('#cfg-tabs-bar .cfg-tab').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('#config-module-root .cfg-panel').forEach(p => {
            p.classList.toggle('active', p.id === `cfg-panel-${tab}`);
        });
    });

    document.getElementById('btn-cfg-backup-rapido')?.addEventListener('click', () => generarYDescargarRespaldoCfg('full'));
    document.getElementById('btn-cfg-abrir-restaurar')?.addEventListener('click', () => {
        document.querySelector('#cfg-tabs-bar .cfg-tab[data-cfgtab="boveda"]')?.click();
        document.getElementById('cfg-restore-file-input')?.click();
    });

    const modalGuia = document.getElementById('modal-cfg-guia');
    const cerrarGuia = () => modalGuia?.classList.remove('active');
    document.getElementById('btn-cfg-guia-app')?.addEventListener('click', () => modalGuia?.classList.add('active'));
    document.getElementById('btn-cfg-cerrar-guia')?.addEventListener('click', cerrarGuia);
    document.getElementById('btn-cfg-guia-ok')?.addEventListener('click', cerrarGuia);
    modalGuia?.addEventListener('click', (e) => { if (e.target === modalGuia) cerrarGuia(); });

    document.getElementById('cfg-chk-cifrar-bak')?.addEventListener('change', (e) => {
        const box = document.getElementById('cfg-crypto-fields');
        if (box) box.style.display = e.target.checked ? 'flex' : 'none';
    });

    document.getElementById('btn-cfg-descargar-full')?.addEventListener('click', () => generarYDescargarRespaldoCfg('full'));
    document.getElementById('btn-cfg-descargar-lite')?.addEventListener('click', () => generarYDescargarRespaldoCfg('lite'));

    document.getElementById('btn-cfg-limpiar-hist-bak')?.addEventListener('click', () => {
        if (!confirm('¿Limpiar el registro visual de respaldos anteriores? (No borra tus archivos descargados).')) return;
        localStorage.removeItem(STORAGE_KEY_CFG_BAK_HIST);
        actualizarDiagnosticoBovedaCfg();
    });

    const dz = document.getElementById('cfg-restore-dropzone');
    const fileInp = document.getElementById('cfg-restore-file-input');
    dz?.addEventListener('click', () => fileInp?.click());
    dz?.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-dragover'); });
    dz?.addEventListener('dragleave', () => dz.classList.remove('is-dragover'));
    dz?.addEventListener('drop', (e) => {
        e.preventDefault();
        dz.classList.remove('is-dragover');
        const f = e.dataTransfer?.files?.[0];
        if (f) leerArchivoParaRestaurarCfg(f);
    });
    fileInp?.addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        if (f) leerArchivoParaRestaurarCfg(f);
    });

    document.getElementById('btn-cfg-rp-descifrar')?.addEventListener('click', async () => {
        const raw = window.cfgState.restoreRawObj;
        const pass = (document.getElementById('cfg-rp-pass-inp')?.value || '').trim();
        if (!raw?.crypto || !pass) return;
        try {
            const plano = await descifrarTextoAesCfg(raw.crypto, pass);
            const dataMap = JSON.parse(plano);
            document.getElementById('cfg-rp-pass-wrap').style.display = 'none';
            await validarYMostrarVistaPreviaRestoreCfg(dataMap, raw);
        } catch {
            alert('❌ Contraseña incorrecta o archivo dañado. Intenta nuevamente.');
        }
    });

    document.getElementById('btn-cfg-rp-cancelar')?.addEventListener('click', cancelarVistaPreviaRestoreCfg);
    document.getElementById('btn-cfg-rp-aplicar')?.addEventListener('click', aplicarRestauracionBovedaCfg);
    document.getElementById('btn-cfg-reauditar')?.addEventListener('click', actualizarDiagnosticoBovedaCfg);
    document.getElementById('btn-cfg-reset-boveda')?.addEventListener('click', reiniciarBovedaLocalCfg);
}

function enlazarEventosConfiguracionEtapa2() {
    const root = document.getElementById('config-module-root');
    if (!root || root.dataset.cfgE2Bound) return;
    root.dataset.cfgE2Bound = '1';

    let draftNegLogo = obtenerConfigSistemaCfg().negocio.logo || '';
    let draftUsrAvatar = obtenerConfigSistemaCfg().usuario.avatar || '';

    const leerImgBase64 = (inputId, onReady) => {
        document.getElementById(inputId)?.addEventListener('change', (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = (ev) => onReady(ev.target.result);
            r.readAsDataURL(f);
            e.target.value = '';
        });
    };

    leerImgBase64('cfg-file-neg-logo', (dataUrl) => {
        draftNegLogo = dataUrl;
        const box = document.getElementById('cfg-neg-logo-prev');
        if (box) box.innerHTML = `<img src="${dataUrl}" alt="Logo">`;
    });
    document.getElementById('btn-cfg-del-neg-logo')?.addEventListener('click', () => {
        draftNegLogo = '';
        const box = document.getElementById('cfg-neg-logo-prev');
        if (box) box.textContent = '🏪';
    });

    leerImgBase64('cfg-file-usr-avatar', (dataUrl) => {
        draftUsrAvatar = dataUrl;
        const box = document.getElementById('cfg-usr-avatar-prev');
        if (box) box.innerHTML = `<img src="${dataUrl}" alt="Avatar">`;
    });
    document.getElementById('btn-cfg-del-usr-avatar')?.addEventListener('click', () => {
        draftUsrAvatar = '';
        const nom = document.getElementById('cfg-usr-nombre')?.value || 'AD';
        const ini = nom.trim().split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
        const box = document.getElementById('cfg-usr-avatar-prev');
        if (box) box.textContent = ini || 'AD';
    });

    document.getElementById('form-cfg-negocio')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const cfg = obtenerConfigSistemaCfg();
        cfg.negocio = {
            logo: draftNegLogo,
            nombre: (document.getElementById('cfg-neg-nombre')?.value || 'Mi Comercio').trim(),
            eslogan: (document.getElementById('cfg-neg-eslogan')?.value || '').trim(),
            whatsappVentas: (document.getElementById('cfg-neg-wa')?.value || '').trim(),
            telefono: (document.getElementById('cfg-neg-tel')?.value || '').trim(),
            direccion: (document.getElementById('cfg-neg-dir')?.value || '').trim(),
            idFiscal: (document.getElementById('cfg-neg-fiscal')?.value || '').trim(),
            sitioWeb: (document.getElementById('cfg-neg-web')?.value || '').trim(),
            firmaPie: (document.getElementById('cfg-neg-firma')?.value || '').trim(),
            descripcion: (document.getElementById('cfg-neg-desc')?.value || '').trim()
        };
        guardarConfigSistemaCfg(cfg);
        actualizarDiagnosticoBovedaCfg();
        actualizarVistaPreviaTicketStudioCfg();
        alert('✅ Perfil del Negocio guardado y sincronizado con el ecosistema.');
    });

    document.getElementById('form-cfg-usuario')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const cfg = obtenerConfigSistemaCfg();
        cfg.usuario = {
            avatar: draftUsrAvatar,
            nombre: (document.getElementById('cfg-usr-nombre')?.value || 'Administrador').trim(),
            rol: (document.getElementById('cfg-usr-rol')?.value || 'Administrador').trim(),
            email: (document.getElementById('cfg-usr-email')?.value || '').trim(),
            telefono: (document.getElementById('cfg-usr-tel')?.value || '').trim(),
            bio: (document.getElementById('cfg-usr-bio')?.value || '').trim()
        };
        guardarConfigSistemaCfg(cfg);
        alert('✅ Perfil del Usuario actualizado.');
    });

    document.getElementById('btn-cfg-guardar-plantilla')?.addEventListener('click', () => {
        const cfg = obtenerConfigSistemaCfg();
        cfg.plantillaProveedor = (document.getElementById('cfg-inp-plantilla-prov')?.value || '').trim();
        guardarConfigSistemaCfg(cfg);
        alert('✅ Plantilla de pedido a proveedores guardada.');
    });

    const actualizarPreviewMon = () => {
        const loc = document.getElementById('cfg-mon-locale')?.value || 'es-AR';
        const dec = !!document.getElementById('cfg-mon-decimales')?.checked;
        const el = document.getElementById('cfg-mon-preview-val');
        if (el) el.textContent = formatearEjemploMonedaCfg(loc, dec);
    };
    document.getElementById('cfg-mon-locale')?.addEventListener('change', actualizarPreviewMon);
    document.getElementById('cfg-mon-decimales')?.addEventListener('change', actualizarPreviewMon);

    document.getElementById('cfg-dol-api-opt')?.addEventListener('change', (e) => {
        const bar = document.getElementById('cfg-dol-live-bar');
        if (bar) bar.style.display = e.target.checked ? 'flex' : 'none';
    });

    document.getElementById('btn-cfg-fetch-dolar')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-cfg-fetch-dolar');
        const tipo = document.getElementById('cfg-dol-api-tipo')?.value || 'blue';
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Consultando…'; }
        try {
            const val = await consultarDolarEnVivoCfg(tipo);
            const inp = document.getElementById('cfg-dol-valor');
            if (inp) inp.value = val;
            alert(`✅ Cotización Dólar ${tipo === 'oficial' ? 'Oficial' : 'Blue'} actualizada: $${val.toLocaleString('es-AR')}. Presiona "Guardar Moneda y Parámetros" para fijarla.`);
        } catch (err) {
            alert(`⚠️ No se pudo consultar la cotización online (${err.message}). Puedes ingresarla manualmente.`);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '↻ Consultar ahora'; }
        }
    });

    document.getElementById('btn-cfg-guardar-moneda')?.addEventListener('click', () => {
        const cfg = obtenerConfigSistemaCfg();
        cfg.moneda = {
            locale: document.getElementById('cfg-mon-locale')?.value || 'es-AR',
            mostrarDecimales: !!document.getElementById('cfg-mon-decimales')?.checked,
            zonaHoraria: document.getElementById('cfg-mon-tz')?.value || 'America/Argentina/Buenos_Aires'
        };
        cfg.dolar = {
            valorManual: Math.max(0, parseFloat(document.getElementById('cfg-dol-valor')?.value) || 0),
            usarApiEnVivo: !!document.getElementById('cfg-dol-api-opt')?.checked,
            tipoApi: document.getElementById('cfg-dol-api-tipo')?.value || 'blue',
            ultimaActualizacion: new Date().toISOString(),
            margenCmvPct: Math.max(0, Math.min(200, parseFloat(document.getElementById('cfg-cmv-margen')?.value) || 0))
        };
        guardarConfigSistemaCfg(cfg);
        alert('✅ Configuración de Moneda, Dólar y Margen CMV guardada.');
    });

    document.getElementById('cfg-chk-dark-mode')?.addEventListener('change', (e) => {
        const cfg = obtenerConfigSistemaCfg();
        cfg.modoOscuro = e.target.checked;
        guardarConfigSistemaCfg(cfg);
    });

    document.getElementById('btn-cfg-save-rmbg')?.addEventListener('click', () => {
        const key = (document.getElementById('cfg-inp-rmbg-key')?.value || '').trim();
        const badge = document.getElementById('cfg-rmbg-badge');
        if (!key) {
            localStorage.removeItem('cat_alogo_removebg_key');
            if (badge) { badge.className = 'cfg-badge-soft'; badge.textContent = 'Sin API Key'; }
            alert('API Key de Remove.bg eliminada.');
            return;
        }
        localStorage.setItem('cat_alogo_removebg_key', key);
        if (badge) { badge.className = 'cfg-badge-ok'; badge.textContent = 'API Lista ✓'; }
        alert('✅ API Key de Remove.bg guardada (ya disponible en Inventario → Estudio IA).');
    });
}

function enlazarEventosConfiguracionEtapa3() {
    const root = document.getElementById('config-module-root');
    if (!root || root.dataset.cfgE3Bound) return;
    root.dataset.cfgE3Bound = '1';

    document.getElementById('btn-cfg-ir-catweb-nube')?.addEventListener('click', () => {
        document.querySelector('.nav-link[data-vista="cat-web"]')?.click();
    });
    document.getElementById('btn-cfg-nube-bak-now')?.addEventListener('click', () => {
        generarYDescargarRespaldoCfg('full');
    });

    document.getElementById('cfg-stage3-mant-anchor')?.addEventListener('click', async (e) => {
        if (e.target.closest('#btn-cfg-optimizar-webp')) {
            ejecutarOptimizacionMasivaWebpCfg();
            return;
        }

        if (e.target.closest('#btn-cfg-guardar-pin')) {
            const p1 = (document.getElementById('cfg-inp-pin-1')?.value || '').trim();
            const p2 = (document.getElementById('cfg-inp-pin-2')?.value || '').trim();
            const pro = obtenerConfigProCfg();

            if (!p1 && pro.seguridadPin.activo) {
                pro.seguridadPin.protegerAnulacionPos = !!document.getElementById('cfg-chk-pin-pos')?.checked;
                guardarConfigProCfg(pro);
                alert('✅ Preferencias de PIN actualizadas.');
                return;
            }
            if (!/^\d{4,6}$/.test(p1)) {
                alert('🔐 El PIN debe tener entre 4 y 6 números.');
                return;
            }
            if (p1 !== p2) {
                alert('🔐 Los PIN ingresados no coinciden.');
                return;
            }

            pro.seguridadPin = {
                activo: true,
                pinHash: await calcularSha256HexCfg(`pin:${p1}`),
                protegerAnulacionPos: !!document.getElementById('cfg-chk-pin-pos')?.checked
            };
            guardarConfigProCfg(pro);
            renderizarEtapa3MantCfg();
            alert('✅ PIN de Administrador activado.');
            return;
        }

        if (e.target.closest('#btn-cfg-desactivar-pin')) {
            const ok = await verificarPinAdminSistemaCfg('desactivar el PIN de seguridad');
            if (!ok) return;
            const pro = obtenerConfigProCfg();
            pro.seguridadPin = { activo: false, pinHash: '', protegerAnulacionPos: false };
            guardarConfigProCfg(pro);
            renderizarEtapa3MantCfg();
            alert('🔓 PIN de Administrador desactivado.');
        }
    });
}

// Aplicar Modo Oscuro y Perfil de Usuario automáticamente al cargar el Dashboard
document.addEventListener('DOMContentLoaded', () => {
    const cfg = obtenerConfigSistemaCfg();
    aplicarTemaGlobalCfg(cfg.modoOscuro);
    sincronizarPerfilConDashboardYEcosistemaCfg(cfg);
});

/* ==========================================================================
   EDITOR PRO: PLANTILLA DE PEDIDO A PROVEEDORES (WHATSAPP + VISTA PREVIA)
   ========================================================================== */
(function () {
    const KEY_PROV_TPL_OPTS = 'cat_alogo_plantilla_prov_opts_v1';

    const DEFAULT_PLANTILLA =
        'Hola {PROVEEDOR}, te paso nuestro pedido para reponer stock:\n\n{PRODUCTOS}\n\n¿Me confirmas disponibilidad y total? ¡Gracias!';

    const DEFAULT_OPTS = {
        estiloLista: 'num',       // 'num' | 'bullet' | 'dash'
        mostrarSku: true,
        negritaItems: true,
        mostrarSubtotal: false
    };

    const PRESETS_PROV = {
        directo: 'Hola *{PROVEEDOR}* 👋\nTe paso nuestro pedido:\n\n{PRODUCTOS}\n\n¡Muchas gracias! Quedo a la espera de confirmación.',
        formal: 'Estimados *{PROVEEDOR}*,\nSolicitamos cotización y reposición desde *{COMERCIO}* ({FECHA}):\n\n{PRODUCTOS}\n\n{NOTA}\nQuedamos atentos a su confirmación y total. Saludos cordiales.',
        detallado: '📦 *ORDEN DE REPOSICIÓN — {COMERCIO}*\n📅 {FECHA} • {HORA}\nProveedor: *{PROVEEDOR}*\n━━━━━━━━━━\n{PRODUCTOS}\n━━━━━━━━━━\nÍtems: *{CANTIDAD_ITEMS}* | Est.: *{TOTAL_ESTIMADO}*\n{NOTA}\n\nPor favor confirmame disponibilidad. ¡Gracias!'
    };

    function leerOptsProvTpl() {
        try {
            const raw = JSON.parse(localStorage.getItem(KEY_PROV_TPL_OPTS) || 'null');
            return raw ? { ...DEFAULT_OPTS, ...raw } : { ...DEFAULT_OPTS };
        } catch {
            return { ...DEFAULT_OPTS };
        }
    }

    function guardarOptsProvTpl(opts) {
        localStorage.setItem(KEY_PROV_TPL_OPTS, JSON.stringify(opts));
    }

    function insertarFormatoEnTextarea(ta, antes, despues = '', placeholder = 'texto') {
        if (!ta) return;
        const start = ta.selectionStart ?? ta.value.length;
        const end = ta.selectionEnd ?? ta.value.length;
        const sel = ta.value.slice(start, end);
        const contenido = sel || placeholder;
        const reemplazo = `${antes}${contenido}${despues}`;
        ta.value = ta.value.slice(0, start) + reemplazo + ta.value.slice(end);
        ta.focus();
        if (sel) {
            ta.setSelectionRange(start + reemplazo.length, start + reemplazo.length);
        } else {
            ta.setSelectionRange(start + antes.length, start + antes.length + contenido.length);
        }
        ta.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function insertarTextoEnCursor(ta, texto) {
        if (!ta) return;
        const start = ta.selectionStart ?? ta.value.length;
        const end = ta.selectionEnd ?? ta.value.length;
        ta.value = ta.value.slice(0, start) + texto + ta.value.slice(end);
        const pos = start + texto.length;
        ta.focus();
        ta.setSelectionRange(pos, pos);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function formatearWhatsAppPreviewHtml(texto) {
        let html = escaparHtmlCfg(texto);
        html = html.replace(/```([^`]+)```/g, '<code class="cfg-wa-mono">$1</code>');
        html = html.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
        html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');
        html = html.replace(/~([^~\n]+)~/g, '<del>$1</del>');
        html = html.replace(/^&gt; (.+)$/gm, '<span class="cfg-wa-quote">$1</span>');
        return html;
    }

    function actualizarVistaPreviaPlantillaProv() {
        const ta = document.getElementById('cfg-inp-plantilla-prov');
        const box = document.getElementById('cfg-prov-wa-preview');
        if (!ta || !box) return;

        const cfg = obtenerConfigSistemaCfg();
        const opts = {
            estiloLista: document.getElementById('cfg-ptpl-estilo')?.value || 'num',
            mostrarSku: !!document.getElementById('cfg-ptpl-sku')?.checked,
            negritaItems: !!document.getElementById('cfg-ptpl-bold')?.checked,
            mostrarSubtotal: !!document.getElementById('cfg-ptpl-sub')?.checked
        };

        const demoItems = [
            { nombre: 'Tostada de arroz', sku: 'PRD-8097', cant: '12 u.', sub: '$84.000' },
            { nombre: 'Harina de Lino', sku: 'PRD-5398', cant: '5 kg', sub: '$22.500' }
        ];

        const prodBloque = demoItems.map((it, idx) => {
            const pref = opts.estiloLista === 'bullet' ? '• ' : (opts.estiloLista === 'dash' ? '- ' : `${idx + 1}. `);
            const nom = opts.negritaItems ? `*${it.nombre}*` : it.nombre;
            const cant = opts.negritaItems ? `*${it.cant}*` : it.cant;
            const sku = opts.mostrarSku ? ` (SKU: ${it.sku})` : '';
            const sub = opts.mostrarSubtotal ? ` [${it.sub}]` : '';
            return `${pref}${nom}${sku} — ${cant}${sub}`;
        }).join('\n');

        const ahora = new Date();
        const mapa = {
            PROVEEDOR: 'Mayorista Central Prueba',
            PRODUCTOS: prodBloque,
            COMERCIO: cfg.negocio?.nombre || 'Mi Comercio',
            FECHA: ahora.toLocaleDateString('es-AR'),
            HORA: ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
            CANTIDAD_ITEMS: '2',
            TOTAL_ESTIMADO: '$106.500 ARS',
            NOTA: '📝 Nota: Entregar por la mañana'
        };

        const textoFinal = (ta.value || '').replace(
            /[\{\[](PROVEEDOR|PRODUCTOS|COMERCIO|FECHA|HORA|CANTIDAD_ITEMS|TOTAL_ESTIMADO|NOTA)[\}\]]/gi,
            (_, k) => mapa[k.toUpperCase()] ?? ''
        );

        const horaTxt = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        box.innerHTML = `${formatearWhatsAppPreviewHtml(textoFinal.trim() || 'Escribe tu mensaje arriba...')}<span class="cfg-ptpl-wa-time">${horaTxt} ✓✓</span>`;
    }

    function mejorarTarjetaPlantillaProveedores() {
        const ta = document.getElementById('cfg-inp-plantilla-prov');
        if (!ta || ta.dataset.proEditorReady) return;
        const card = ta.closest('.cfg-card');
        if (!card) return;

        ta.dataset.proEditorReady = '1';
        ta.rows = 6;

        const opts = leerOptsProvTpl();

        const oldHint = card.querySelector('.cfg-vars-hint');
        if (oldHint) oldHint.remove();

        const toolbar = document.createElement('div');
        toolbar.className = 'cfg-ptpl-toolbar';
        toolbar.innerHTML = `
            <div class="cfg-ptpl-row">
                <div class="cfg-ptpl-fmt-group" title="Formato nativo de WhatsApp">
                    <button type="button" class="cfg-ptpl-btn" data-fmt="bold" title="Negrita (*texto*)"><strong>B</strong></button>
                    <button type="button" class="cfg-ptpl-btn" data-fmt="italic" title="Cursiva (_texto_)"><em>I</em></button>
                    <button type="button" class="cfg-ptpl-btn" data-fmt="strike" title="Tachado (~texto~)"><del>S</del></button>
                    <button type="button" class="cfg-ptpl-btn" data-fmt="mono" title="Monoespaciado"><code>&lt;/&gt;</code></button>
                    <button type="button" class="cfg-ptpl-btn" data-fmt="quote" title="Bloque de cita">❝</button>
                    <button type="button" class="cfg-ptpl-btn" data-fmt="sep" title="Insertar línea separadora">―</button>
                </div>

                <div class="cfg-ptpl-emoji-group" title="Insertar emoji rápido">
                    <button type="button" class="cfg-ptpl-btn" data-emoji="📦">📦</button>
                    <button type="button" class="cfg-ptpl-btn" data-emoji="🛒">🛒</button>
                    <button type="button" class="cfg-ptpl-btn" data-emoji="📅">📅</button>
                    <button type="button" class="cfg-ptpl-btn" data-emoji="🚚">🚚</button>
                    <button type="button" class="cfg-ptpl-btn" data-emoji="✅">✅</button>
                    <button type="button" class="cfg-ptpl-btn" data-emoji="🙏">🙏</button>
                </div>

                <div class="cfg-ptpl-presets">
                    <button type="button" class="cfg-ptpl-preset" data-preset="directo">Directo</button>
                    <button type="button" class="cfg-ptpl-preset" data-preset="formal">Formal</button>
                    <button type="button" class="cfg-ptpl-preset" data-preset="detallado">Detallado</button>
                    <button type="button" class="cfg-ptpl-preset is-reset" data-preset="reset" title="Restablecer plantilla por defecto">↺ Restablecer</button>
                </div>
            </div>

            <div class="cfg-ptpl-vars-row">
                <span>Insertar variable:</span>
                <button type="button" class="cfg-ptpl-var" data-var="{PROVEEDOR}">{PROVEEDOR}</button>
                <button type="button" class="cfg-ptpl-var" data-var="{PRODUCTOS}">{PRODUCTOS}</button>
                <button type="button" class="cfg-ptpl-var" data-var="{COMERCIO}">{COMERCIO}</button>
                <button type="button" class="cfg-ptpl-var" data-var="{FECHA}">{FECHA}</button>
                <button type="button" class="cfg-ptpl-var" data-var="{HORA}">{HORA}</button>
                <button type="button" class="cfg-ptpl-var" data-var="{CANTIDAD_ITEMS}">{CANTIDAD_ITEMS}</button>
                <button type="button" class="cfg-ptpl-var" data-var="{TOTAL_ESTIMADO}">{TOTAL_ESTIMADO}</button>
                <button type="button" class="cfg-ptpl-var" data-var="{NOTA}">{NOTA}</button>
            </div>
        `;
        ta.parentNode.insertBefore(toolbar, ta);

        const extras = document.createElement('div');
        extras.className = 'cfg-ptpl-extras';
        extras.innerHTML = `
            <div class="cfg-ptpl-opts-bar">
                <label class="cfg-ptpl-opt">
                    <span>Lista {PRODUCTOS}:</span>
                    <select id="cfg-ptpl-estilo" class="cfg-input" style="width:auto; padding:0.2rem 0.45rem; font-size:0.73rem;">
                        <option value="num" ${opts.estiloLista === 'num' ? 'selected' : ''}>1. Numerada</option>
                        <option value="bullet" ${opts.estiloLista === 'bullet' ? 'selected' : ''}>• Viñetas</option>
                        <option value="dash" ${opts.estiloLista === 'dash' ? 'selected' : ''}>- Guiones</option>
                    </select>
                </label>
                <label class="cfg-ptpl-opt"><input type="checkbox" id="cfg-ptpl-sku" ${opts.mostrarSku ? 'checked' : ''}> Incluir SKU</label>
                <label class="cfg-ptpl-opt"><input type="checkbox" id="cfg-ptpl-bold" ${opts.negritaItems ? 'checked' : ''}> Negrita en ítems</label>
                <label class="cfg-ptpl-opt"><input type="checkbox" id="cfg-ptpl-sub" ${opts.mostrarSubtotal ? 'checked' : ''}> Mostrar subtotal</label>
            </div>

            <div class="cfg-ptpl-preview-wrap">
                <span class="cfg-ptpl-prev-lbl">💬 Vista previa en vivo (así llegará por WhatsApp)</span>
                <div class="cfg-ptpl-wa-stage">
                    <div class="cfg-ptpl-wa-bubble" id="cfg-prov-wa-preview"></div>
                </div>
            </div>
        `;
        ta.parentNode.insertBefore(extras, ta.nextSibling);

        toolbar.addEventListener('click', (e) => {
            const btnFmt = e.target.closest('[data-fmt]');
            if (btnFmt) {
                const f = btnFmt.getAttribute('data-fmt');
                if (f === 'bold') insertarFormatoEnTextarea(ta, '*', '*', 'negrita');
                else if (f === 'italic') insertarFormatoEnTextarea(ta, '_', '_', 'cursiva');
                else if (f === 'strike') insertarFormatoEnTextarea(ta, '~', '~', 'tachado');
                else if (f === 'mono') insertarFormatoEnTextarea(ta, '```', '```', 'codigo');
                else if (f === 'quote') insertarFormatoEnTextarea(ta, '> ', '', 'texto citado');
                else if (f === 'sep') insertarTextoEnCursor(ta, '\n━━━━━━━━━━\n');
                return;
            }
            const btnEmoji = e.target.closest('[data-emoji]');
            if (btnEmoji) {
                insertarTextoEnCursor(ta, btnEmoji.getAttribute('data-emoji'));
                return;
            }
            const btnVar = e.target.closest('[data-var]');
            if (btnVar) {
                insertarTextoEnCursor(ta, btnVar.getAttribute('data-var'));
                return;
            }
            const btnPreset = e.target.closest('[data-preset]');
            if (btnPreset) {
                const key = btnPreset.getAttribute('data-preset');
                if (key === 'reset') {
                    ta.value = DEFAULT_PLANTILLA;
                    document.getElementById('cfg-ptpl-estilo').value = DEFAULT_OPTS.estiloLista;
                    document.getElementById('cfg-ptpl-sku').checked = DEFAULT_OPTS.mostrarSku;
                    document.getElementById('cfg-ptpl-bold').checked = DEFAULT_OPTS.negritaItems;
                    document.getElementById('cfg-ptpl-sub').checked = DEFAULT_OPTS.mostrarSubtotal;
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                } else if (PRESETS_PROV[key]) {
                    ta.value = PRESETS_PROV[key];
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        });

        ta.addEventListener('input', actualizarVistaPreviaPlantillaProv);
        extras.addEventListener('change', actualizarVistaPreviaPlantillaProv);

        const btnSave = document.getElementById('btn-cfg-guardar-plantilla');
        if (btnSave && !btnSave.dataset.optsBound) {
            btnSave.addEventListener('click', () => {
                guardarOptsProvTpl({
                    estiloLista: document.getElementById('cfg-ptpl-estilo')?.value || 'num',
                    mostrarSku: !!document.getElementById('cfg-ptpl-sku')?.checked,
                    negritaItems: !!document.getElementById('cfg-ptpl-bold')?.checked,
                    mostrarSubtotal: !!document.getElementById('cfg-ptpl-sub')?.checked
                });
            });
            btnSave.dataset.optsBound = '1';
        }

        actualizarVistaPreviaPlantillaProv();
    }

    // Enganchar a ambos puntos de entrada de Ajustes para garantizar el montaje
    if (typeof window.renderizarEtapa2NegocioCfg === 'function' && !window.renderizarEtapa2NegocioCfg._conEditorProv) {
        const _renderE2Orig = window.renderizarEtapa2NegocioCfg;
        window.renderizarEtapa2NegocioCfg = function (...args) {
            const res = _renderE2Orig.apply(this, args);
            mejorarTarjetaPlantillaProveedores();
            return res;
        };
        window.renderizarEtapa2NegocioCfg._conEditorProv = true;
    }

    if (typeof window.inicializarConfiguracion === 'function' && !window.inicializarConfiguracion._conEditorProv) {
        const _initCfgOrig = window.inicializarConfiguracion;
        window.inicializarConfiguracion = function (...args) {
            const res = _initCfgOrig.apply(this, args);
            mejorarTarjetaPlantillaProveedores();
            return res;
        };
        window.inicializarConfiguracion._conEditorProv = true;
    }

    if (document.getElementById('cfg-inp-plantilla-prov')) {
        mejorarTarjetaPlantillaProveedores();
    }
})();

