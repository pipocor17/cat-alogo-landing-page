/* ==========================================================================
   MÓDULO: COPIA DE SEGURIDAD EN GOOGLE DRIVE (WEB / PC ↔ APP ANDROID)
   - Carpeta compartida: "Cat-Alogo Backups"
   - Nomenclatura PC (hora local): cat-alogo-web-pc_YYYY-MM-DD_HH-mm.catbak / .json
   - Rotación automática (últimas 5 copias de PC; nunca borra archivos de Android)
   - Restauración cruzada (.catbak PC + catalogo_backup.json Android)
   - Cifrado opcional AES-GCM 256 + Auto-subida al cerrar turno (Corte Z)
   ========================================================================== */
(function () {
    const GOOGLE_CLIENT_ID = '819084532150-cs7inr5fhfij277qia1alku8c21q5lt9.apps.googleusercontent.com';
    const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
    const DRIVE_FOLDER_NAME = 'Cat-Alogo Backups';
    const PC_BACKUP_PREFIX = 'cat-alogo-web-pc';
    const STORAGE_KEY_GDRIVE = 'cat_alogo_gdrive_state_v1';
    const MAX_COPIAS_PC_DEFAULT = 5;

    const runtime = {
        gisCargado: false,
        tokenClient: null,
        accessToken: null,
        tokenExpiresAt: 0,
        ocupado: false
    };

    /* --- 1. ESTADO PERSISTENTE Y ESTILOS --- */
    function leerEstadoDrive() {
        const def = {
            linked: false,
            email: '',
            displayName: '',
            folderId: '',
            lastBackupAt: null,
            lastBackupName: '',
            lastBackupSize: '',
            autoUploadCierre: false,
            maxCopias: MAX_COPIAS_PC_DEFAULT
        };
        try {
            const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_GDRIVE) || 'null');
            return raw ? { ...def, ...raw } : def;
        } catch {
            return def;
        }
    }

    function guardarEstadoDrive(parcial) {
        const next = { ...leerEstadoDrive(), ...(parcial || {}) };
        localStorage.setItem(STORAGE_KEY_GDRIVE, JSON.stringify(next));
        return next;
    }

    function escHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fmtBytes(bytes) {
        if (typeof window.formatearBytesCfg === 'function') return window.formatearBytesCfg(bytes);
        const b = Number(bytes) || 0;
        if (b < 1024) return `${b} B`;
        if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
        return `${(b / (1024 * 1024)).toFixed(2)} MB`;
    }

    function asegurarEstilosDrive() {
        if (document.getElementById('cat-gdrive-styles')) return;
        const st = document.createElement('style');
        st.id = 'cat-gdrive-styles';
        st.textContent = `
            .gd-actions-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 0.55rem;
                margin-top: 0.65rem;
            }
            @media (max-width: 600px) {
                .gd-actions-grid { grid-template-columns: 1fr; }
            }
            .gd-meta-bar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 0.5rem;
                flex-wrap: wrap;
                padding: 0.55rem 0.75rem;
                border-radius: 10px;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                font-size: 0.76rem;
                color: #334155;
            }
            body.cat-dark-mode .gd-meta-bar {
                background: #0f172a;
                border-color: #334155;
                color: #cbd5e1;
            }
            .gd-warn-stale {
                padding: 0.5rem 0.75rem;
                border-radius: 10px;
                background: #fffbeb;
                border: 1px solid #fde68a;
                color: #92400e;
                font-size: 0.74rem;
                font-weight: 600;
            }
            .gd-file-list {
                display: flex;
                flex-direction: column;
                gap: 0.55rem;
                max-height: 55vh;
                overflow-y: auto;
                margin: 0.65rem 0;
            }
            .gd-file-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 0.75rem;
                padding: 0.65rem 0.8rem;
                border-radius: 12px;
                border: 1px solid #e2e8f0;
                background: #f8fafc;
            }
            body.cat-dark-mode .gd-file-row {
                background: #1e293b;
                border-color: #334155;
            }
            .gd-file-row strong {
                display: block;
                font-size: 0.8rem;
                word-break: break-all;
            }
            .gd-file-row small {
                display: block;
                font-size: 0.71rem;
                color: #64748b;
                margin-top: 2px;
            }
            .gd-origin-pill {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 0.68rem;
                font-weight: 700;
                padding: 2px 7px;
                border-radius: 999px;
                margin-bottom: 3px;
            }
            .gd-origin-pc { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
            .gd-origin-app { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
        `;
        document.head.appendChild(st);
    }

    /* --- 2. CARGA DINÁMICA DE GOOGLE IDENTITY SERVICES (GIS) Y TOKEN --- */
    function cargarScriptGIS() {
        return new Promise((resolve, reject) => {
            if (window.google?.accounts?.oauth2) {
                runtime.gisCargado = true;
                return resolve();
            }
            const existente = document.getElementById('google-gis-client-js');
            if (existente) {
                existente.addEventListener('load', () => { runtime.gisCargado = true; resolve(); });
                existente.addEventListener('error', () => reject(new Error('No se pudo cargar Google Identity Services.')));
                return;
            }
            const sc = document.createElement('script');
            sc.id = 'google-gis-client-js';
            sc.src = 'https://accounts.google.com/gsi/client';
            sc.async = true;
            sc.defer = true;
            sc.onload = () => { runtime.gisCargado = true; resolve(); };
            sc.onerror = () => reject(new Error('No se pudo cargar Google Identity Services. Verifica tu conexión.'));
            document.head.appendChild(sc);
        });
    }

    async function solicitarTokenDrive(forzarSelector = false) {
        if (!forzarSelector && runtime.accessToken && Date.now() < runtime.tokenExpiresAt - 60000) {
            return runtime.accessToken;
        }
        if (!navigator.onLine) {
            throw new Error('Sin conexión a internet para conectar con Google Drive.');
        }

        await cargarScriptGIS();

        return new Promise((resolve, reject) => {
            const st = leerEstadoDrive();
            const tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: DRIVE_SCOPE,
                hint: st.email || undefined,
                callback: (resp) => {
                    if (resp?.error) {
                        return reject(new Error(resp.error_description || resp.error));
                    }
                    if (!resp?.access_token) {
                        return reject(new Error('Google no devolvió un token de acceso válido.'));
                    }
                    runtime.accessToken = resp.access_token;
                    runtime.tokenExpiresAt = Date.now() + ((Number(resp.expires_in) || 3500) * 1000);
                    resolve(resp.access_token);
                },
                error_callback: (err) => {
                    reject(new Error(err?.message || 'Ventana de autorización cerrada o bloqueada por el navegador.'));
                }
            });

            runtime.tokenClient = tokenClient;
            tokenClient.requestAccessToken({
                prompt: forzarSelector ? 'select_account consent' : ''
            });
        });
    }

    async function driveFetch(url, options = {}, tokenOpt = null) {
        const token = tokenOpt || await solicitarTokenDrive(false);
        const headers = new Headers(options.headers || {});
        headers.set('Authorization', `Bearer ${token}`);

        const resp = await fetch(url, { ...options, headers });
        if (resp.status === 401) {
            runtime.accessToken = null;
            runtime.tokenExpiresAt = 0;
            throw new Error('La sesión de Google Drive expiró. Vuelve a presionar el botón para renovarla.');
        }
        return resp;
    }

    /* --- 3. OPERACIONES GOOGLE DRIVE API v3 --- */
    async function obtenerInfoUsuarioDrive(token) {
        try {
            const resp = await driveFetch(
                'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)',
                {},
                token
            );
            if (!resp.ok) return { email: '', displayName: '' };
            const json = await resp.json();
            return {
                email: json?.user?.emailAddress || '',
                displayName: json?.user?.displayName || ''
            };
        } catch {
            return { email: '', displayName: '' };
        }
    }

    async function asegurarCarpetaBackupsDrive(token) {
        const q = encodeURIComponent(
            `name = '${DRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
        );
        const resp = await driveFetch(
            `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)&pageSize=5`,
            {},
            token
        );
        if (!resp.ok) throw new Error(`Error buscando carpeta en Drive (HTTP ${resp.status})`);
        const data = await resp.json();
        if (Array.isArray(data.files) && data.files.length > 0) {
            const folderId = data.files[0].id;
            guardarEstadoDrive({ folderId });
            return folderId;
        }

        const createResp = await driveFetch(
            'https://www.googleapis.com/drive/v3/files?fields=id,name',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                body: JSON.stringify({
                    name: DRIVE_FOLDER_NAME,
                    mimeType: 'application/vnd.google-apps.folder'
                })
            },
            token
        );
        if (!createResp.ok) throw new Error(`No se pudo crear la carpeta "${DRIVE_FOLDER_NAME}" en Drive.`);
        const creada = await createResp.json();
        guardarEstadoDrive({ folderId: creada.id });
        return creada.id;
    }

    async function listarArchivosBackupsDrive(token) {
        const folderId = await asegurarCarpetaBackupsDrive(token);
        const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
        const resp = await driveFetch(
            `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id,name,size,modifiedTime,mimeType)&pageSize=40`,
            {},
            token
        );
        if (!resp.ok) throw new Error(`Error listando copias en Drive (HTTP ${resp.status})`);
        const data = await resp.json();
        return { folderId, files: Array.isArray(data.files) ? data.files : [] };
    }

    async function subirArchivoMultipartDrive(token, folderId, fileName, jsonString) {
        const boundary = 'cat_alogo_drive_boundary_' + Date.now().toString(36);
        const metadata = {
            name: fileName,
            parents: [folderId],
            mimeType: 'application/json'
        };

        const body =
            `--${boundary}\r\n` +
            `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
            `${JSON.stringify(metadata)}\r\n` +
            `--${boundary}\r\n` +
            `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
            `${jsonString}\r\n` +
            `--${boundary}--`;

        const resp = await driveFetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,modifiedTime',
            {
                method: 'POST',
                headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
                body
            },
            token
        );
        if (!resp.ok) {
            const errTxt = await resp.text().catch(() => '');
            throw new Error(`Error subiendo respaldo a Drive (HTTP ${resp.status}) ${errTxt.slice(0, 120)}`);
        }
        return await resp.json();
    }

    async function rotarCopiasAntiguasPcEnDrive(token, folderId, maxCopias = MAX_COPIAS_PC_DEFAULT) {
        try {
            const q = encodeURIComponent(
                `'${folderId}' in parents and name contains '${PC_BACKUP_PREFIX}' and trashed = false`
            );
            const resp = await driveFetch(
                `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime)&pageSize=50`,
                {},
                token
            );
            if (!resp.ok) return 0;
            const data = await resp.json();
            const archivosPc = (data.files || []).filter(f =>
                String(f.name || '').startsWith(PC_BACKUP_PREFIX)
            );
            if (archivosPc.length <= maxCopias) return 0;

            const aEliminar = archivosPc.slice(maxCopias);
            let borrados = 0;
            for (const f of aEliminar) {
                const delResp = await driveFetch(
                    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.id)}`,
                    { method: 'DELETE' },
                    token
                );
                if (delResp.ok || delResp.status === 204) borrados++;
            }
            return borrados;
        } catch (err) {
            console.warn('Error rotando copias antiguas en Drive:', err);
            return 0;
        }
    }

    /* --- 4. CONSTRUIR PAYLOAD DE RESPALDO PC (REUTILIZA MOTOR DE AJUSTES.JS) --- */
    async function construirRespaldoPcParaDrive(tipo = 'full', sufijoExtra = '', usarCifradoUI = true) {
        const esFull = tipo === 'full';
        const cifrar = usarCifradoUI && !!document.getElementById('cfg-chk-cifrar-bak')?.checked;
        let password = '';

        if (cifrar) {
            const p1 = (document.getElementById('cfg-inp-bak-pass')?.value || '').trim();
            const p2 = (document.getElementById('cfg-inp-bak-pass2')?.value || '').trim();
            if (p1.length < 4) {
                throw new Error('Ingresa una contraseña de al menos 4 caracteres para cifrar el archivo, o desmarca la casilla de cifrado.');
            }
            if (p1 !== p2) {
                throw new Error('Las contraseñas de cifrado no coinciden.');
            }
            password = p1;
        }

        const data = typeof window.recolectarDatosBovedaCfg === 'function'
            ? window.recolectarDatosBovedaCfg(esFull)
            : {};
        const resumen = typeof window.calcularResumenContenidoCfg === 'function'
            ? window.calcularResumenContenidoCfg(data)
            : { claves: Object.keys(data).length, productos: 0, ventas: 0, clientes: 0 };
        const payloadStr = JSON.stringify(data);
        const sha256 = typeof window.calcularSha256HexCfg === 'function'
            ? await window.calcularSha256HexCfg(payloadStr)
            : '';

        const ahora = new Date();
        const fechaIso = ahora.toISOString();

        const archivoObj = {
            formato: 'CAT-ALOGO-BACKUP',
            version: '4.2',
            origen: 'web_pc',
            tipo: esFull ? 'full' : 'liviano',
            fecha: fechaIso,
            cifrado: cifrar,
            sha256,
            resumen
        };

        if (cifrar) {
            archivoObj.crypto = await window.cifrarTextoAesCfg(payloadStr, password);
        } else {
            archivoObj.data = data;
        }

        const pad = (n) => String(n).padStart(2, '0');
        const stamp = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}_${pad(ahora.getHours())}-${pad(ahora.getMinutes())}`;
        const ext = esFull ? 'catbak' : 'json';
        const tagModo = sufijoExtra ? `-${sufijoExtra}` : (esFull ? '' : '-liviano');
        const nombreArchivo = `${PC_BACKUP_PREFIX}${tagModo}_${stamp}.${ext}`;
        const jsonString = JSON.stringify(archivoObj);

        return { nombreArchivo, jsonString, fechaIso, cifrar, sha256, resumen };
    }

    /* --- 5. FLUJOS DE USUARIO: VINCULAR, GUARDAR, RESTAURAR Y DESVINCULAR --- */
    async function vincularGoogleDrive() {
        if (runtime.ocupado) return;
        runtime.ocupado = true;
        actualizarUIEstadoDrive('⏳ Conectando con Google Drive…');
        try {
            const token = await solicitarTokenDrive(true);
            const infoUser = await obtenerInfoUsuarioDrive(token);
            const folderId = await asegurarCarpetaBackupsDrive(token);

            guardarEstadoDrive({
                linked: true,
                email: infoUser.email,
                displayName: infoUser.displayName,
                folderId
            });

            renderizarTarjetaGoogleDrive();
            alert(
                `✅ ¡Google Drive vinculado con éxito!\n\n` +
                `• Cuenta: ${infoUser.email || 'Conectada'}\n` +
                `• Carpeta compartida con la App: "${DRIVE_FOLDER_NAME}"\n\n` +
                `Ya puedes guardar o restaurar copias de seguridad directamente desde aquí.`
            );
        } catch (err) {
            console.error('Error vinculando Google Drive:', err);
            alert(`⚠️ No se pudo vincular Google Drive:\n${err.message}`);
            renderizarTarjetaGoogleDrive();
        } finally {
            runtime.ocupado = false;
        }
    }

    function desvincularGoogleDrive() {
        if (!confirm('¿Desvincular Google Drive de esta PC?\n\nTus copias ya guardadas en Google Drive NO se borrarán.')) {
            return;
        }
        if (runtime.accessToken && window.google?.accounts?.oauth2?.revoke) {
            try { window.google.accounts.oauth2.revoke(runtime.accessToken, () => {}); } catch { /* ignore */ }
        }
        runtime.accessToken = null;
        runtime.tokenExpiresAt = 0;
        guardarEstadoDrive({
            linked: false,
            email: '',
            displayName: '',
            folderId: '',
            autoUploadCierre: false
        });
        renderizarTarjetaGoogleDrive();
    }

    async function guardarCopiaEnDrive(tipo = 'full', opciones = {}) {
        if (runtime.ocupado) return false;
        const { silencioso = false, sufijoExtra = '', usarCifradoUI = true } = opciones;

        runtime.ocupado = true;
        actualizarUIEstadoDrive('⏳ Subiendo copia a Google Drive…');

        try {
            const token = await solicitarTokenDrive(false);
            const infoUser = await obtenerInfoUsuarioDrive(token);
            const folderId = await asegurarCarpetaBackupsDrive(token);

            const bak = await construirRespaldoPcParaDrive(tipo, sufijoExtra, usarCifradoUI);
            const subido = await subirArchivoMultipartDrive(token, folderId, bak.nombreArchivo, bak.jsonString);
            const st = leerEstadoDrive();
            const rotados = await rotarCopiasAntiguasPcEnDrive(token, folderId, st.maxCopias || MAX_COPIAS_PC_DEFAULT);
            const pesoFmt = fmtBytes(subido.size || new Blob([bak.jsonString]).size);

            guardarEstadoDrive({
                linked: true,
                email: infoUser.email || st.email,
                displayName: infoUser.displayName || st.displayName,
                folderId,
                lastBackupAt: bak.fechaIso,
                lastBackupName: bak.nombreArchivo,
                lastBackupSize: pesoFmt
            });

            if (typeof window.registrarRespaldoEnHistorialCfg === 'function') {
                window.registrarRespaldoEnHistorialCfg({
                    fecha: bak.fechaIso,
                    nombre: `☁️ ${bak.nombreArchivo}`,
                    tipo: tipo === 'full' ? 'drive-full' : 'drive-liviano',
                    cifrado: bak.cifrar,
                    peso: pesoFmt,
                    hash: bak.sha256,
                    resumen: bak.resumen
                });
            }
            if (typeof window.actualizarDiagnosticoBovedaCfg === 'function') {
                window.actualizarDiagnosticoBovedaCfg();
            }

            renderizarTarjetaGoogleDrive();

            if (!silencioso) {
                alert(
                    `✅ ¡Copia guardada en Google Drive!\n\n` +
                    `• Carpeta: ${DRIVE_FOLDER_NAME}\n` +
                    `• Archivo: ${bak.nombreArchivo}\n` +
                    `• Peso: ${pesoFmt}${bak.cifrar ? ' (🔐 Cifrado AES-256)' : ''}\n` +
                    (rotados > 0 ? `• Rotación: se limpiaron ${rotados} copia(s) antigua(s) de PC (máx. ${st.maxCopias || MAX_COPIAS_PC_DEFAULT}).` : '')
                );
            }
            return true;
        } catch (err) {
            console.error('Error guardando copia en Drive:', err);
            if (!silencioso) {
                alert(`❌ No se pudo guardar en Google Drive:\n${err.message}`);
            }
            renderizarTarjetaGoogleDrive();
            return false;
        } finally {
            runtime.ocupado = false;
        }
    }

    async function abrirModalRestaurarDesdeDrive() {
        if (runtime.ocupado) return;
        runtime.ocupado = true;
        actualizarUIEstadoDrive('⏳ Consultando copias en Google Drive…');

        try {
            const token = await solicitarTokenDrive(false);
            const infoUser = await obtenerInfoUsuarioDrive(token);
            const { files } = await listarArchivosBackupsDrive(token);

            guardarEstadoDrive({
                linked: true,
                email: infoUser.email || leerEstadoDrive().email,
                displayName: infoUser.displayName || leerEstadoDrive().displayName
            });

            mostrarModalListaDrive(files, token);
        } catch (err) {
            console.error('Error listando backups en Drive:', err);
            alert(`❌ No se pudieron leer las copias de Google Drive:\n${err.message}`);
        } finally {
            runtime.ocupado = false;
            renderizarTarjetaGoogleDrive();
        }
    }

    function asegurarModalListaDrive() {
        let modal = document.getElementById('modal-cfg-gdrive-restore');
        if (modal) return modal;

        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <div class="cfg-modal-overlay" id="modal-cfg-gdrive-restore" aria-hidden="true">
                <div class="cfg-modal-box" style="max-width:560px;" role="dialog" aria-labelledby="gd-modal-title">
                    <header class="cfg-modal-head">
                        <h3 id="gd-modal-title">☁️ Copias en Google Drive (${DRIVE_FOLDER_NAME})</h3>
                        <button type="button" class="cfg-close-btn" id="btn-gd-cerrar-modal">✕</button>
                    </header>
                    <div class="cfg-modal-body">
                        <p style="font-size:0.78rem; color:#64748b; margin:0;">
                            Selecciona una copia de <strong>Web/PC (.catbak)</strong> para restaurar tu bóveda con vista previa, o el respaldo de la <strong>App Android (catalogo_backup.json)</strong> para importarlo.
                        </p>
                        <div class="gd-file-list" id="gd-modal-file-list"></div>
                        <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
                            <button type="button" class="cfg-btn cfg-btn-light" id="btn-gd-cancelar-modal">Cerrar</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        modal = wrap.firstElementChild;
        document.body.appendChild(modal);

        const cerrar = () => modal.classList.remove('active');
        modal.querySelector('#btn-gd-cerrar-modal')?.addEventListener('click', cerrar);
        modal.querySelector('#btn-gd-cancelar-modal')?.addEventListener('click', cerrar);
        modal.addEventListener('click', (e) => { if (e.target === modal) cerrar(); });
        return modal;
    }

    function mostrarModalListaDrive(files, token) {
        const modal = asegurarModalListaDrive();
        const listEl = modal.querySelector('#gd-modal-file-list');
        if (!listEl) return;

        const backups = (files || []).filter(f => /\.(catbak|json)$/i.test(f.name || ''));

        if (backups.length === 0) {
            listEl.innerHTML = `
                <div style="text-align:center; padding:1.6rem; color:#64748b; font-size:0.8rem; border:1px dashed #cbd5e1; border-radius:12px;">
                    No se encontraron archivos <code>.catbak</code> ni <code>.json</code> en la carpeta <strong>${DRIVE_FOLDER_NAME}</strong>.
                </div>
            `;
        } else {
            listEl.innerHTML = backups.map(f => {
                const esPc = String(f.name || '').startsWith(PC_BACKUP_PREFIX) || String(f.name || '').endsWith('.catbak');
                const fecha = f.modifiedTime ? new Date(f.modifiedTime).toLocaleString('es-AR') : 'Fecha desconocida';
                const peso = fmtBytes(Number(f.size) || 0);
                return `
                    <div class="gd-file-row">
                        <div style="min-width:0; flex:1;">
                            <span class="gd-origin-pill ${esPc ? 'gd-origin-pc' : 'gd-origin-app'}">
                                ${esPc ? '💻 Web / PC' : '📱 App Android'}
                            </span>
                            <strong>${escHtml(f.name)}</strong>
                            <small>📅 ${escHtml(fecha)} • 📦 ${escHtml(peso)}</small>
                        </div>
                        <button type="button" class="cfg-btn cfg-btn-primary cfg-btn-sm btn-gd-descargar-restaurar" data-fid="${escHtml(f.id)}" data-fname="${escHtml(f.name)}">
                            📥 Usar copia
                        </button>
                    </div>
                `;
            }).join('');

            listEl.querySelectorAll('.btn-gd-descargar-restaurar').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const fid = btn.getAttribute('data-fid');
                    const fname = btn.getAttribute('data-fname') || 'respaldo.catbak';
                    const txtOrig = btn.textContent;
                    btn.disabled = true;
                    btn.textContent = '⏳ Bajando…';
                    try {
                        await descargarYProcesarBackupDesdeDrive(fid, fname, token);
                        modal.classList.remove('active');
                    } catch (err) {
                        alert(`❌ Error descargando "${fname}":\n${err.message}`);
                    } finally {
                        btn.disabled = false;
                        btn.textContent = txtOrig;
                    }
                });
            });
        }

        modal.classList.add('active');
    }

    async function descargarYProcesarBackupDesdeDrive(fileId, fileName, token) {
        const resp = await driveFetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
            {},
            token
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status} al descargar el archivo.`);
        const texto = await resp.text();

        let parsed = null;
        try { parsed = JSON.parse(texto); } catch {
            throw new Error('El archivo descargado no es un JSON válido.');
        }

        const fileObj = new File([texto], fileName, { type: 'application/json' });

        // Caso A: Respaldo nativo de Cat-Alogo Web/PC (.catbak / .json)
        if (parsed && parsed.formato === 'CAT-ALOGO-BACKUP' && typeof window.leerArchivoParaRestaurarCfg === 'function') {
            document.querySelector('#cfg-tabs-bar .cfg-tab[data-cfgtab="boveda"]')?.click();
            window.leerArchivoParaRestaurarCfg(fileObj);
            setTimeout(() => {
                document.getElementById('cfg-restore-preview')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 120);
            return;
        }

        // Caso B: Respaldo de App Android (catalogo_backup.json) -> inyectar en el importador móvil
        document.querySelector('#cfg-tabs-bar .cfg-tab[data-cfgtab="boveda"]')?.click();
        const appInput = document.querySelector(
            '#cfg-panel-boveda input[type="file"]:not(#cfg-restore-file-input)'
        );
        if (appInput && typeof DataTransfer !== 'undefined') {
            const dt = new DataTransfer();
            dt.items.add(fileObj);
            appInput.files = dt.files;
            appInput.dispatchEvent(new Event('change', { bubbles: true }));
            appInput.closest('.cfg-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        // Respaldo: descargar localmente para importación manual
        const blob = new Blob([texto], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        alert(`📥 Se descargó "${fileName}" en tu computadora. Arrástralo al recuadro "Importar desde App Móvil (.json)" para completar la importación.`);
    }

    /* --- 6. RENDERIZADO DE TARJETA EN BÓVEDA LOCAL Y SINCRONIZACIÓN CON PESTAÑA NUBE --- */
    function actualizarUIEstadoDrive(textoTemporal) {
        const statusEl = document.getElementById('gd-status-line');
        if (statusEl && textoTemporal) statusEl.textContent = textoTemporal;
    }

    function renderizarTarjetaGoogleDrive() {
        asegurarEstilosDrive();
        const panelBoveda = document.getElementById('cfg-panel-boveda');
        if (!panelBoveda) return;

        const leftCol = panelBoveda.querySelector('.cfg-grid-2-asym .cfg-col') || panelBoveda;
        let card = document.getElementById('cfg-card-google-drive');
        if (!card) {
            card = document.createElement('article');
            card.className = 'cfg-card';
            card.id = 'cfg-card-google-drive';
            const histCard = document.getElementById('cfg-bak-hist-list')?.closest('.cfg-card');
            if (histCard && histCard.parentElement === leftCol) {
                leftCol.insertBefore(card, histCard);
            } else {
                leftCol.appendChild(card);
            }
        }

        const st = leerEstadoDrive();
        const diasSinBackup = st.lastBackupAt
            ? Math.floor((Date.now() - new Date(st.lastBackupAt).getTime()) / 86400000)
            : null;
        const mostrarAvisoViejo = st.linked && diasSinBackup !== null && diasSinBackup >= 7;

        const ultimaTxt = st.lastBackupAt
            ? `${new Date(st.lastBackupAt).toLocaleString('es-AR')} • ${st.lastBackupName} (${st.lastBackupSize || 'OK'})`
            : 'Sin respaldos de PC subidos a Drive todavía';

        card.innerHTML = `
            <div class="cfg-card-head">
                <div>
                    <h3>☁️ Copia de Seguridad en Google Drive</h3>
                    <p>Guarda tus respaldos de PC en la misma carpeta <strong>${DRIVE_FOLDER_NAME}</strong> que tu App Android, sin pisar <code>catalogo_backup.json</code>.</p>
                </div>
                <span class="${st.linked ? 'cfg-badge-ok' : 'cfg-badge-soft'}">
                    ${st.linked ? '● Vinculado' : 'Sin vincular'}
                </span>
            </div>

            ${!st.linked ? `
                <div class="gd-meta-bar">
                    <span>🔒 Permiso seguro <code>drive.file</code> (solo accede a la carpeta <strong>${DRIVE_FOLDER_NAME}</strong>).</span>
                </div>
                <button type="button" class="cfg-btn cfg-btn-indigo" id="btn-gd-vincular" style="width:100%; margin-top:0.55rem;">
                    🔗 Vincular Google Drive
                </button>
            ` : `
                <div class="gd-meta-bar">
                    <div>
                        <strong>📧 ${escHtml(st.email || 'Cuenta Google vinculada')}</strong>
                        <div id="gd-status-line" style="font-size:0.72rem; color:#64748b; margin-top:2px;">
                            Última copia: ${escHtml(ultimaTxt)}
                        </div>
                    </div>
                    <button type="button" class="cfg-link-btn" id="btn-gd-desvincular" style="color:#dc2626;">Desvincular</button>
                </div>

                ${mostrarAvisoViejo ? `
                    <div class="gd-warn-stale">
                        ⚠️ Hace <strong>${diasSinBackup} días</strong> que no guardas una copia en Google Drive. Recomendamos respaldar hoy.
                    </div>
                ` : ''}

                <div class="gd-actions-grid">
                    <button type="button" class="cfg-btn cfg-btn-primary" id="btn-gd-guardar-full">
                        ☁️ Guardar .catbak Full en Drive
                    </button>
                    <button type="button" class="cfg-btn cfg-btn-indigo" id="btn-gd-restaurar">
                        📥 Restaurar desde Drive
                    </button>
                </div>

                <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; flex-wrap:wrap; margin-top:0.45rem;">
                    <button type="button" class="cfg-btn cfg-btn-light cfg-btn-sm" id="btn-gd-guardar-lite">
                        ⚡ Subir liviano (.json sin fotos)
                    </button>
                    <span style="font-size:0.71rem; color:#64748b;">
                        Rotación automática: conserva las últimas <strong>${st.maxCopias || MAX_COPIAS_PC_DEFAULT}</strong> copias de PC
                    </span>
                </div>

                <div class="cfg-toggle-item" style="margin-top:0.55rem;">
                    <div>
                        <strong>🔄 Subir copia a Drive al Cerrar Turno (Corte Z)</strong>
                        <small>Además de descargar el .catbak local, sube la copia a Drive si la sesión está activa.</small>
                    </div>
                    <label class="cfg-toggle-pill">
                        <input type="checkbox" id="chk-gd-auto-cierre" ${st.autoUploadCierre ? 'checked' : ''}>
                        <span class="cfg-toggle-slider"></span>
                    </label>
                </div>
            `}
        `;

        card.querySelector('#btn-gd-vincular')?.addEventListener('click', vincularGoogleDrive);
        card.querySelector('#btn-gd-desvincular')?.addEventListener('click', desvincularGoogleDrive);
        card.querySelector('#btn-gd-guardar-full')?.addEventListener('click', () => guardarCopiaEnDrive('full'));
        card.querySelector('#btn-gd-guardar-lite')?.addEventListener('click', () => guardarCopiaEnDrive('lite'));
        card.querySelector('#btn-gd-restaurar')?.addEventListener('click', abrirModalRestaurarDesdeDrive);
        card.querySelector('#chk-gd-auto-cierre')?.addEventListener('change', (e) => {
            guardarEstadoDrive({ autoUploadCierre: e.target.checked });
        });
    }

    function mejorarBotonDriveEnPestanaNube() {
        const btnNube = document.getElementById('btn-cfg-nube-bak-now');
        if (!btnNube || btnNube.dataset.gdUpgraded) return;
        btnNube.dataset.gdUpgraded = '1';

        const btnIr = document.createElement('button');
        btnIr.type = 'button';
        btnIr.className = 'cfg-btn cfg-btn-indigo';
        btnIr.textContent = '☁️ Gestionar Google Drive';
        btnIr.addEventListener('click', () => {
            document.querySelector('#cfg-tabs-bar .cfg-tab[data-cfgtab="boveda"]')?.click();
            setTimeout(() => {
                document.getElementById('cfg-card-google-drive')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        });
        btnNube.parentElement?.insertBefore(btnIr, btnNube);
    }

    /* --- 7. ENGANCHE CON AJUSTES Y AUTO-RESPALDO DE CIERRE DE CAJA --- */
    function enlazarHooksAjustes() {
        if (typeof window.inicializarConfiguracion === 'function' && !window.inicializarConfiguracion._conGDrive) {
            const origInit = window.inicializarConfiguracion;
            window.inicializarConfiguracion = function (...args) {
                const res = origInit.apply(this, args);
                renderizarTarjetaGoogleDrive();
                mejorarBotonDriveEnPestanaNube();
                return res;
            };
            window.inicializarConfiguracion._conGDrive = true;
        }

        if (typeof window.renderizarEtapa3NubeCfg === 'function' && !window.renderizarEtapa3NubeCfg._conGDrive) {
            const origNube = window.renderizarEtapa3NubeCfg;
            window.renderizarEtapa3NubeCfg = function (...args) {
                const res = origNube.apply(this, args);
                mejorarBotonDriveEnPestanaNube();
                return res;
            };
            window.renderizarEtapa3NubeCfg._conGDrive = true;
        }

        if (window.CatAlogoAjustes?.ejecutarAutoRespaldoCierreCaja && !window.CatAlogoAjustes._conGDriveCierre) {
            const origCierre = window.CatAlogoAjustes.ejecutarAutoRespaldoCierreCaja;
            window.CatAlogoAjustes.ejecutarAutoRespaldoCierreCaja = async function (numeroTurno = '') {
                await origCierre.call(this, numeroTurno);
                const st = leerEstadoDrive();
                if (st.linked && st.autoUploadCierre && runtime.accessToken && Date.now() < runtime.tokenExpiresAt - 60000) {
                    const tag = numeroTurno ? `cierre-turno-${numeroTurno}` : 'cierre-turno';
                    await guardarCopiaEnDrive('full', { silencioso: true, sufijoExtra: tag, usarCifradoUI: false });
                }
            };
            window.CatAlogoAjustes._conGDriveCierre = true;
        }
    }

    function arrancarModuloDrive() {
        enlazarHooksAjustes();
        if (document.getElementById('cfg-panel-boveda')) {
            renderizarTarjetaGoogleDrive();
            mejorarBotonDriveEnPestanaNube();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', arrancarModuloDrive);
    } else {
        arrancarModuloDrive();
    }

    // API pública por si se quiere invocar desde otro módulo
    window.CatAlogoGoogleDrive = {
        vincular: vincularGoogleDrive,
        desvincular: desvincularGoogleDrive,
        guardarCopia: guardarCopiaEnDrive,
        abrirRestaurar: abrirModalRestaurarDesdeDrive,
        obtenerEstado: leerEstadoDrive
    };
})();

