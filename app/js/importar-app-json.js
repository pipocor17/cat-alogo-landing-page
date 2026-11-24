/* ==========================================================================
   ETAPA 3: IMPORTADOR DIRECTO DE RESPALDO APP MÓVIL (catalogo_backup.json)
   (MAPEO EXACTO SCHEMA v2.1 -> BÓVEDA INDEXEDDB PC, FILTRO file:// Y UNDO)
   ========================================================================== */
(function () {
    const STORAGE_KEY_BACKUP_PREV = 'cat_alogo_imp_backup_v1';

    let jsonAppCargado = null;
    let analisisActual = null;
    let archivoNombre = '';

    /* --- 1. UTILIDADES DE NORMALIZACIÓN APP -> PC --- */
    function escHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizarUnidadApp(unidadRaw, familiaRaw, aceptaDec) {
        const u = String(unidadRaw || '').trim().toLowerCase();
        const f = String(familiaRaw || '').trim().toLowerCase();

        if (u === 'kg' || u.includes('kilo')) {
            return { unidadMedida: 'Kilogramo (Kg)', familiaMedicion: 'peso' };
        }
        if (u === 'g' || u === 'gr' || u.includes('gram')) {
            return { unidadMedida: 'Gramo (g)', familiaMedicion: 'peso' };
        }
        if (u === 'l' || u.includes('litro')) {
            return { unidadMedida: 'Litro (L)', familiaMedicion: 'peso' };
        }
        if (u === 'ml' || u.includes('mililitro')) {
            return { unidadMedida: 'Mililitro (ml)', familiaMedicion: 'peso' };
        }
        if (u === 'm' || u.includes('metro')) {
            return { unidadMedida: 'Metro (m)', familiaMedicion: 'longitud' };
        }
        if (u === 'cm') {
            return { unidadMedida: 'Centímetro (cm)', familiaMedicion: 'longitud' };
        }
        if (f === 'peso' || aceptaDec === true) {
            return { unidadMedida: 'Kilogramo (Kg)', familiaMedicion: 'peso' };
        }
        if (f === 'longitud') {
            return { unidadMedida: 'Metro (m)', familiaMedicion: 'longitud' };
        }
        return { unidadMedida: 'Unidad', familiaMedicion: 'unidad' };
    }

    function extraerImagenValidaApp(prod) {
        const candidatas = [prod.imagen_url, prod.imagen, prod.imagenBlob];
        let encontroFileAndroid = false;

        for (const c of candidatas) {
            if (typeof c !== 'string') continue;
            const url = c.trim();
            if (!url) continue;
            if (url.startsWith('file://') || url.startsWith('content://')) {
                encontroFileAndroid = true;
                continue;
            }
            if (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('data:image/')) {
                return { url, esFileAndroid: false };
            }
        }
        return { url: '', esFileAndroid: encontroFileAndroid };
    }

    function mapearProductoAppAPc(p, ownerIdFallback) {
        const { unidadMedida, familiaMedicion } = normalizarUnidadApp(
            p.unidadVenta || p.unidadMedida,
            p.familia,
            p.aceptaDecimales
        );
        const imgInfo = extraerImagenValidaApp(p);
        const ahoraIso = new Date().toISOString();
        const publicarWeb = Boolean(p.publicarWeb || p.publicado || p.enCatalogo);

        return {
            producto: {
                id: String(p.id || `app-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
                sku: String(p.sku || '').trim() || `APP-${String(p.id || '').slice(-5)}`,
                nombre: String(p.nombre || 'Producto sin nombre').trim(),
                categoria: String(p.categoria || 'General').trim() || 'General',
                precioNormal: Math.max(0, Number(p.precio) || 0),
                precioOferta: Math.max(0, Number(p.precioOferta) || 0),
                precioCosto: p.precio_costo !== null && p.precio_costo !== undefined ? Math.max(0, Number(p.precio_costo) || 0) : 0,
                stock: Math.max(0, Math.round((Number(p.stock) || 0) * 1000) / 1000),
                stockMinimo: p.umbralCritico !== null && p.umbralCritico !== undefined ? Math.max(0, Number(p.umbralCritico) || 0) : 5,
                unidadMedida,
                familiaMedicion,
                descripcion: String(p.descripcionCorta || p.descripcion || '').trim(),
                imagenes: imgInfo.url ? [imgInfo.url] : [],
                variantesDetalle: Array.isArray(p.variantesDetalle) ? p.variantesDetalle : [],
                visible: p.visible !== false,
                visiblePdf: p.visible !== false,
                publicarWeb,
                proveedorId: String(p.proveedorId || '').trim(),
                userId: String(p.userId || ownerIdFallback || '').trim(),
                origenApp: true,
                creadoEn: ahoraIso,
                actualizadoEn: ahoraIso
            },
            esFileAndroid: imgInfo.esFileAndroid,
            esBase64: imgInfo.url.startsWith('data:image/')
        };
    }

    function analizarBackupApp(json) {
        const productosRaw = Array.isArray(json.products)
            ? json.products
            : (Array.isArray(json.productos) ? json.productos : []);

        const cats = new Set();
        let conFotoValida = 0;
        let conFileAndroid = 0;
        let conBase64 = 0;
        let publicadosWeb = 0;
        let conCosto = 0;

        productosRaw.forEach((p) => {
            if (p.categoria) cats.add(String(p.categoria).trim());
            const img = extraerImagenValidaApp(p);
            if (img.url) {
                conFotoValida++;
                if (img.url.startsWith('data:image/')) conBase64++;
            } else if (img.esFileAndroid) {
                conFileAndroid++;
            }
            if (p.publicarWeb || p.publicado || p.enCatalogo) publicadosWeb++;
            if (Number(p.precio_costo) > 0) conCosto++;
        });

        // Contar clientes / proveedores si el respaldo también los incluye
        const clientesRaw = Array.isArray(json.clientes) ? json.clientes : (Array.isArray(json.clients) ? json.clients : []);
        const proveedoresRaw = Array.isArray(json.proveedores) ? json.proveedores : (Array.isArray(json.suppliers) ? json.suppliers : []);

        return {
            schemaVersion: json.schemaVersion || '2.x',
            exportedAt: json.exportedAt || null,
            ownerId: json.ownerId || '',
            nombreNegocio: json.appSettings?.nombreNegocio || 'Comercio App Móvil',
            totalProductos: productosRaw.length,
            totalCategorias: cats.size,
            conFotoValida,
            conFileAndroid,
            conBase64,
            publicadosWeb,
            conCosto,
            totalClientes: clientesRaw.length,
            totalProveedores: proveedoresRaw.length,
            tieneAppSettings: Boolean(json.appSettings && typeof json.appSettings === 'object')
        };
    }

    /* --- 2. EJECUCIÓN DE IMPORTACIÓN EN BÓVEDA INDEXEDDB --- */
    async function ejecutarImportacionAppJson() {
        if (!jsonAppCargado || !analisisActual) return;

        const modo = document.querySelector('input[name="imp-app-modo"]:checked')?.value || 'upsert';
        const importarCats = !!document.getElementById('imp-app-chk-cats')?.checked;
        const importarPerfil = !!document.getElementById('imp-app-chk-perfil')?.checked;

        if (modo === 'reemplazar') {
            const conf = prompt(
                `⚠️ REEMPLAZAR INVENTARIO ACTUAL\n\n` +
                `Se cargarán los ${analisisActual.totalProductos} productos de "${analisisActual.nombreNegocio}" reemplazando los productos actuales de la PC.\n` +
                `(Se guardará una copia previa para poder Deshacer).\n\n` +
                `Escribe IMPORTAR en mayúsculas para confirmar:`
            );
            if (String(conf || '').trim() !== 'IMPORTAR') return;
        }

        const btnRun = document.getElementById('btn-imp-app-ejecutar');
        if (btnRun) { btnRun.disabled = true; btnRun.textContent = '⏳ Importando en IndexedDB…'; }

        try {
            // 1. Respaldo previo automático para Deshacer
            let prodsPrevios = [];
            let catsPrevias = [];
            try { prodsPrevios = JSON.parse(localStorage.getItem('cat_alogo_productos_v1') || '[]'); } catch { prodsPrevios = []; }
            try { catsPrevias = JSON.parse(localStorage.getItem('cat_alogo_categorias_v1') || '[]'); } catch { catsPrevias = []; }

            localStorage.setItem(STORAGE_KEY_BACKUP_PREV, JSON.stringify({
                fecha: new Date().toISOString(),
                archivo: archivoNombre || 'catalogo_backup.json',
                productos: prodsPrevios,
                categorias: catsPrevias
            }));

            // 2. Mapear e integrar productos
            const productosRaw = Array.isArray(jsonAppCargado.products)
                ? jsonAppCargado.products
                : (Array.isArray(jsonAppCargado.productos) ? jsonAppCargado.productos : []);

            const resultado = modo === 'reemplazar' ? [] : JSON.parse(JSON.stringify(prodsPrevios));
            const mapaId = new Map();
            const mapaSku = new Map();

            resultado.forEach((p, idx) => {
                if (p.id) mapaId.set(String(p.id), idx);
                if (p.sku) mapaSku.set(String(p.sku).trim().toLowerCase(), idx);
            });

            let creados = 0;
            let actualizados = 0;
            let omitidos = 0;
            const categoriasDetectadas = new Set();

            productosRaw.forEach((raw) => {
                const { producto } = mapearProductoAppAPc(raw, jsonAppCargado.ownerId);
                categoriasDetectadas.add(producto.categoria);

                const idxPorId = mapaId.get(String(producto.id));
                const idxPorSku = producto.sku ? mapaSku.get(String(producto.sku).trim().toLowerCase()) : undefined;
                const idxExistente = idxPorId !== undefined ? idxPorId : idxPorSku;

                if (idxExistente !== undefined && modo !== 'reemplazar') {
                    if (modo === 'solo_nuevos') {
                        omitidos++;
                        return;
                    }
                    // Upsert no destructivo: conserva variantes y fotos de PC si el producto de la app venía con file://
                    const actual = resultado[idxExistente];
                    resultado[idxExistente] = {
                        ...actual,
                        ...producto,
                        imagenes: producto.imagenes.length > 0 ? producto.imagenes : (actual.imagenes || []),
                        variantesDetalle: (actual.variantesDetalle && actual.variantesDetalle.length > 0)
                            ? actual.variantesDetalle
                            : producto.variantesDetalle,
                        precioCosto: producto.precioCosto > 0 ? producto.precioCosto : (actual.precioCosto || 0)
                    };
                    actualizados++;
                } else {
                    resultado.push(producto);
                    const nuevoIdx = resultado.length - 1;
                    mapaId.set(String(producto.id), nuevoIdx);
                    if (producto.sku) mapaSku.set(String(producto.sku).trim().toLowerCase(), nuevoIdx);
                    creados++;
                }
            });

            // Persistir productos en IndexedDB
            window.bovedaProductos = resultado;
            localStorage.setItem('cat_alogo_productos_v1', JSON.stringify(resultado));

            // 3. Importar categorías nuevas
            let catsNuevas = 0;
            if (importarCats) {
                const listaCats = Array.isArray(catsPrevias) ? [...catsPrevias] : [];
                const formatoObj = listaCats.length > 0 && typeof listaCats[0] === 'object';
                const existentes = new Set(
                    listaCats.map(c => String(typeof c === 'string' ? c : c?.nombre || '').trim().toLowerCase())
                );
                categoriasDetectadas.forEach((nom) => {
                    if (!nom || existentes.has(nom.toLowerCase())) return;
                    listaCats.push(formatoObj ? { id: `cat-app-${Date.now()}-${catsNuevas}`, nombre: nom } : nom);
                    existentes.add(nom.toLowerCase());
                    catsNuevas++;
                });
                localStorage.setItem('cat_alogo_categorias_v1', JSON.stringify(listaCats));
                if (typeof window.cargarBovedaCategorias === 'function') window.cargarBovedaCategorias();
            }

            // 4. Importar Perfil del Negocio, Moneda, Dólar y Cat-Web (si está tildado)
            if (importarPerfil && jsonAppCargado.appSettings) {
                aplicarSettingsAppEnPc(jsonAppCargado);
            }

            // 5. Esperar a que IndexedDB termine de grabar todo en disco
            if (window.BovedaIDB?.esperarPendientes) {
                await window.BovedaIDB.esperarPendientes();
            }

            // Refrescar UI actual
            if (typeof window.actualizarDiagnosticoBovedaCfg === 'function') await window.actualizarDiagnosticoBovedaCfg();
            if (typeof window.renderizarEtapa2NegocioCfg === 'function') window.renderizarEtapa2NegocioCfg();
            if (typeof window.renderizarProductosCreados === 'function') window.renderizarProductosCreados();

            const cantFileAndroid = analisisActual?.conFileAndroid || 0;
            
            cancelarPreviewAppJson();
            actualizarBannerUndoApp();

            const avisoAndroid = cantFileAndroid > 0
                ? `\n\n📷 Nota: ${cantFileAndroid} producto(s) tenían foto guardada solo en la memoria interna del teléfono (file://) y se importaron sin imagen rota para que puedas subirles foto o sincronizarlos desde Firebase Storage.`
                : '';

            alert(
                `✅ ¡Importación desde App Móvil completada en IndexedDB!\n\n` +
                `• Productos creados: ${creados}\n` +
                `• Productos actualizados: ${actualizados}\n` +
                `• Omitidos: ${omitidos}\n` +
                `• Categorías nuevas: ${catsNuevas}\n` +
                `• Total en tu Bóveda IndexedDB: ${resultado.length} productos` +
                avisoAndroid
            );
        } catch (err) {
            console.error(err);
            alert(`❌ Error al importar el archivo de la app: ${err.message}`);
        } finally {
            if (btnRun) { btnRun.disabled = false; btnRun.textContent = '🚀 Importar a Bóveda IndexedDB'; }
        }
    }

    function aplicarSettingsAppEnPc(json) {
        const s = json.appSettings || {};
        const cur = json.currencyConfig || {};
        const dol = json.dolar || {};

        // 1. Sistema / Negocio / Usuario / Moneda
        let sisCfg = typeof window.obtenerConfigSistemaCfg === 'function'
            ? window.obtenerConfigSistemaCfg()
            : JSON.parse(localStorage.getItem('cat_alogo_sistema_cfg_v1') || '{}');

        sisCfg.negocio = {
            ...(sisCfg.negocio || {}),
            logo: s.logoNegocio || s.logo || s.logo_url || sisCfg.negocio?.logo || '',
            nombre: s.nombreNegocio || sisCfg.negocio?.nombre || 'Mi Comercio',
            eslogan: s.subtituloCatalogo || sisCfg.negocio?.eslogan || '',
            whatsappVentas: s.whatsapp || sisCfg.negocio?.whatsappVentas || '',
            telefono: s.telefonoNegocio || sisCfg.negocio?.telefono || '',
            direccion: s.direccionNegocio || sisCfg.negocio?.direccion || '',
            firmaPie: s.firmaFooter || sisCfg.negocio?.firmaPie || '',
            descripcion: s.descripcionNegocio || sisCfg.negocio?.descripcion || ''
        };
        sisCfg.usuario = {
            ...(sisCfg.usuario || {}),
            nombre: s.nombreUsuario || sisCfg.usuario?.nombre || 'Administrador',
            email: s.usuarioEmail || sisCfg.usuario?.email || '',
            rol: s.usuarioRol || sisCfg.usuario?.rol || 'Administrador'
        };
        sisCfg.moneda = {
            ...(sisCfg.moneda || {}),
            locale: cur.locale || sisCfg.moneda?.locale || 'es-AR',
            mostrarDecimales: typeof cur.showDecimals === 'boolean' ? cur.showDecimals : !!sisCfg.moneda?.mostrarDecimales,
            zonaHoraria: s.timeZone || sisCfg.moneda?.zonaHoraria || 'America/Argentina/Buenos_Aires'
        };
        if (Number(dol.tasa) > 0) {
            sisCfg.dolar = { ...(sisCfg.dolar || {}), valorManual: Number(dol.tasa) };
        }
        if (s.mensajePedido) {
            sisCfg.plantillaProveedor = String(s.mensajePedido)
                .replace(/\[PROVEEDOR\]/g, '{PROVEEDOR}')
                .replace(/\[PRODUCTOS\]/g, '{PRODUCTOS}');
        }

        if (typeof window.guardarConfigSistemaCfg === 'function') {
            window.guardarConfigSistemaCfg(sisCfg);
        } else {
            localStorage.setItem('cat_alogo_sistema_cfg_v1', JSON.stringify(sisCfg));
        }

        // 2. Cat-Web Config
        try {
            const webCfg = JSON.parse(localStorage.getItem('cat_alogo_web_config_v1') || '{}');
            webCfg.nombre = s.nombreNegocio || webCfg.nombre || '';
            webCfg.subtitulo = s.subtituloCatalogo || webCfg.subtitulo || '';
            webCfg.whatsapp = s.whatsapp || webCfg.whatsapp || '';
            webCfg.colorPrimario = s.colorPrimario || s.colorTema || webCfg.colorPrimario || '#10b981';
            if (s.logoNegocio || s.logo) webCfg.logoImg = s.logoNegocio || s.logo;
            if (s.portadaNegocio || s.banner) webCfg.bannerImg = s.portadaNegocio || s.banner;
            if (s.valorEnvio !== undefined && s.valorEnvio !== '') webCfg.costoEnvio = Number(s.valorEnvio) || 0;
            if (Array.isArray(s.agrupacionesWeb)) webCfg.agrupacionesWeb = s.agrupacionesWeb;
            localStorage.setItem('cat_alogo_web_config_v1', JSON.stringify(webCfg));
        } catch { /* ignore */ }

        // 3. Remove.bg API Key y UID de referencia
        if (s.removeBgApiKey) {
            localStorage.setItem('cat_alogo_removebg_key', String(s.removeBgApiKey).trim());
        }
        if (json.ownerId) {
            try {
                const fbCfg = JSON.parse(localStorage.getItem('cat_alogo_firebase_cfg_v1') || '{}');
                if (!fbCfg.uid) {
                    fbCfg.uid = json.ownerId;
                    fbCfg.colTiendas = fbCfg.colTiendas || 'vendors';
                    fbCfg.colPedidos = fbCfg.colPedidos || 'orders';
                    localStorage.setItem('cat_alogo_firebase_cfg_v1', JSON.stringify(fbCfg));
                }
            } catch { /* ignore */ }
        }
    }

    /* --- 3. LECTURA DEL ARCHIVO Y VISTA PREVIA --- */
    function leerArchivoBackupApp(archivo) {
        if (!archivo) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const parsed = JSON.parse(String(ev.target.result || ''));
                const prods = Array.isArray(parsed?.products)
                    ? parsed.products
                    : (Array.isArray(parsed?.productos) ? parsed.productos : null);

                if (!parsed || !prods) {
                    alert('❌ Este archivo no tiene el formato de respaldo de la App Móvil (no se encontró el listado "products").\n\nSi es un archivo .catbak de la PC, usa la tarjeta "Restaurar Bóveda desde Archivo".');
                    return;
                }

                jsonAppCargado = parsed;
                archivoNombre = archivo.name;
                analisisActual = analizarBackupApp(parsed);
                mostrarPreviewAppJson();
            } catch (err) {
                console.error(err);
                alert('❌ No se pudo leer el archivo JSON. Verifica que no esté corrupto.');
            }
        };
        reader.readAsText(archivo, 'UTF-8');
    }

    function mostrarPreviewAppJson() {
        const dz = document.getElementById('imp-app-dropzone');
        const prev = document.getElementById('imp-app-preview');
        const sum = document.getElementById('imp-app-summary');
        if (!analisisActual || !prev || !sum) return;

        if (dz) dz.style.display = 'none';
        prev.style.display = 'flex';

        const a = analisisActual;
        const fechaTxt = a.exportedAt ? new Date(a.exportedAt).toLocaleString('es-AR') : 'Sin fecha';

        sum.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; margin-bottom:4px;">
                <strong>🏪 ${escHtml(a.nombreNegocio)}</strong>
                <span class="cfg-badge-indigo">App v${escHtml(a.schemaVersion)}</span>
            </div>
            <div>📅 <strong>Exportado:</strong> ${escHtml(fechaTxt)}</div>
            <div>📦 <strong>Productos detectados:</strong> ${a.totalProductos} (${a.totalCategorias} categorías • ${a.publicadosWeb} en Cat-Web • ${a.conCosto} con costo)</div>
            <div>🖼️ <strong>Fotos listas para PC:</strong> ${a.conFotoValida} ${a.conBase64 > 0 ? `(${a.conBase64} embebidas)` : ''}</div>
            ${a.conFileAndroid > 0 ? `<div style="color:#b45309; font-weight:700;">⚠️ ${a.conFileAndroid} producto(s) tienen foto interna de Android (file://) — se importarán sin imagen rota.</div>` : ''}
        `;
    }

    function cancelarPreviewAppJson() {
        jsonAppCargado = null;
        analisisActual = null;
        const dz = document.getElementById('imp-app-dropzone');
        const prev = document.getElementById('imp-app-preview');
        const inp = document.getElementById('imp-app-file-input');
        if (dz) dz.style.display = 'flex';
        if (prev) prev.style.display = 'none';
        if (inp) inp.value = '';
    }

    function actualizarBannerUndoApp() {
        const box = document.getElementById('imp-app-undo-wrap');
        if (!box) return;
        let bak = null;
        try { bak = JSON.parse(localStorage.getItem(STORAGE_KEY_BACKUP_PREV) || 'null'); } catch { bak = null; }
        if (!bak || !Array.isArray(bak.productos)) {
            box.style.display = 'none';
            return;
        }
        box.style.display = 'flex';
        box.innerHTML = `
            <div style="font-size:0.72rem; color:#92400e;">
                <strong>↩️ Respaldo previo disponible</strong> (${bak.productos.length} prod. antes de importar)
            </div>
            <button type="button" class="cfg-btn cfg-btn-light cfg-btn-sm" id="btn-imp-app-deshacer">↩️ Deshacer</button>
        `;
    }

    /* --- 4. INYECTAR TARJETA EN AJUSTES -> BÓVEDA LOCAL --- */
    function inyectarTarjetaImportarAppEnAjustes() {
        const panelBoveda = document.getElementById('cfg-panel-boveda');
        if (!panelBoveda || document.getElementById('cfg-card-importar-app')) return;

        const cols = panelBoveda.querySelectorAll('.cfg-col');
        const colDestino = cols[1] || cols[0] || panelBoveda;

        const card = document.createElement('article');
        card.className = 'cfg-card';
        card.id = 'cfg-card-importar-app';
        card.innerHTML = `
            <div class="cfg-card-head">
                <div>
                    <h3>📱 Importar desde App Móvil (.json)</h3>
                    <p>Trae tus +200 productos, categorías, fotos y configuración desde el respaldo <code>catalogo_backup.json</code> de Android directo a IndexedDB.</p>
                </div>
                <span class="cfg-badge-ok">Etapa 3</span>
            </div>

            <div id="imp-app-undo-wrap" style="display:none; justify-content:space-between; align-items:center; gap:0.5rem; padding:0.55rem 0.75rem; border-radius:10px; background:#fffbeb; border:1px solid #fcd34d;"></div>

            <div class="cfg-dropzone" id="imp-app-dropzone">
                <input type="file" id="imp-app-file-input" accept=".json" hidden>
                <div class="cfg-drop-ico">📱</div>
                <strong>Selecciona tu catalogo_backup.json de la App</strong>
                <span>Arrastra el archivo aquí o haz clic para analizarlo antes de importar</span>
            </div>

            <div class="cfg-restore-preview" id="imp-app-preview" style="display:none;">
                <div class="cfg-rp-summary" id="imp-app-summary"></div>

                <div style="display:flex; flex-direction:column; gap:0.35rem; font-size:0.75rem;">
                    <label style="display:flex; align-items:center; gap:0.45rem; cursor:pointer;">
                        <input type="radio" name="imp-app-modo" value="upsert" checked>
                        <span><strong>🔄 Actualizar existentes y sumar nuevos</strong> (conserva variantes de PC)</span>
                    </label>
                    <label style="display:flex; align-items:center; gap:0.45rem; cursor:pointer;">
                        <input type="radio" name="imp-app-modo" value="solo_nuevos">
                        <span><strong>➕ Solo agregar productos nuevos</strong> (no toca los ya cargados en PC)</span>
                    </label>
                    <label style="display:flex; align-items:center; gap:0.45rem; cursor:pointer;">
                        <input type="radio" name="imp-app-modo" value="reemplazar">
                        <span><strong>☢️ Reemplazar todo el inventario actual de la PC</strong></span>
                    </label>
                </div>

                <div style="display:flex; flex-direction:column; gap:0.3rem; font-size:0.74rem; padding-top:0.25rem; border-top:1px solid #e2e8f0;">
                    <label style="display:flex; align-items:center; gap:0.45rem; cursor:pointer;">
                        <input type="checkbox" id="imp-app-chk-cats" checked>
                        <span>🏷️ Crear automáticamente todas las categorías de la App</span>
                    </label>
                    <label style="display:flex; align-items:center; gap:0.45rem; cursor:pointer;">
                        <input type="checkbox" id="imp-app-chk-perfil" checked>
                        <span>🏪 Importar también Perfil del Negocio, Logo, Portada, WhatsApp y Cat-Web</span>
                    </label>
                </div>

                <div class="cfg-rp-actions">
                    <button type="button" class="cfg-btn cfg-btn-light" id="btn-imp-app-cancelar">Cancelar</button>
                    <button type="button" class="cfg-btn cfg-btn-primary" id="btn-imp-app-ejecutar">
                        🚀 Importar a Bóveda IndexedDB
                    </button>
                </div>
            </div>
        `;

        colDestino.prepend(card);
        actualizarBannerUndoApp();
        enlazarEventosTarjetaImportarApp();
    }

    function enlazarEventosTarjetaImportarApp() {
        const card = document.getElementById('cfg-card-importar-app');
        if (!card || card.dataset.impAppBound) return;
        card.dataset.impAppBound = '1';

        const dz = document.getElementById('imp-app-dropzone');
        const inp = document.getElementById('imp-app-file-input');

        dz?.addEventListener('click', () => inp?.click());
        dz?.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-dragover'); });
        dz?.addEventListener('dragleave', () => dz.classList.remove('is-dragover'));
        dz?.addEventListener('drop', (e) => {
            e.preventDefault();
            dz.classList.remove('is-dragover');
            const f = e.dataTransfer?.files?.[0];
            if (f) leerArchivoBackupApp(f);
        });
        inp?.addEventListener('change', (e) => {
            const f = e.target.files?.[0];
            if (f) leerArchivoBackupApp(f);
        });

        document.getElementById('btn-imp-app-cancelar')?.addEventListener('click', cancelarPreviewAppJson);
        document.getElementById('btn-imp-app-ejecutar')?.addEventListener('click', ejecutarImportacionAppJson);

        card.addEventListener('click', (e) => {
            if (!e.target.closest('#btn-imp-app-deshacer')) return;
            if (typeof window.deshacerUltimaImportacionImp === 'function') {
                window.deshacerUltimaImportacionImp();
                actualizarBannerUndoApp();
                if (typeof window.actualizarDiagnosticoBovedaCfg === 'function') window.actualizarDiagnosticoBovedaCfg();
            }
        });
    }

    // Enganchar automáticamente al entrar a Ajustes
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof window.inicializarConfiguracion === 'function' && !window.inicializarConfiguracion._conImpApp) {
            const _origInitCfg = window.inicializarConfiguracion;
            window.inicializarConfiguracion = function (...args) {
                const res = _origInitCfg.apply(this, args);
                inyectarTarjetaImportarAppEnAjustes();
                return res;
            };
            window.inicializarConfiguracion._conImpApp = true;
        }
        inyectarTarjetaImportarAppEnAjustes();
    });

    window.ImportadorAppJson = {
        analizarBackupApp,
        mapearProductoAppAPc
    };
})();

