/* ==========================================================================
   ETAPA 1: MOTOR LOCAL-FIRST EN INDEXEDDB (PUENTE TRANSPARENTE +200 PRODS)
   ========================================================================== */
(function () {
    const DB_NAME = 'CatAlogoBovedaDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'kv_store';
    const PREFIJO = 'cat_alogo_';
    const FLAG_MIGRADO = 'cat_alogo_idb_migrado_v1';

    // Claves livianas que también se reflejan en localStorage para arranque visual sin parpadeo (ej. Modo Oscuro)
    const CLAVES_MIRROR_RAPIDO = new Set([
        'cat_alogo_sistema_cfg_v1',
        'cat_alogo_sistema_pro_v1',
        'cat_alogo_ticket_cfg_v1',
        'cat_alogo_inv_por_pagina'
    ]);

    const origGetItem = Storage.prototype.getItem;
    const origSetItem = Storage.prototype.setItem;
    const origRemoveItem = Storage.prototype.removeItem;
    const origKey = Storage.prototype.key;
    const origClear = Storage.prototype.clear;
    const origLengthDesc = Object.getOwnPropertyDescriptor(Storage.prototype, 'length');

    const ramCache = new Map();
    const escriturasPendientes = new Set();
    let dbInstancia = null;
    let idbListo = false;

    /* --- 1. PRECARGA INMEDIATA DESDE LOCALSTORAGE (MIENTRAS ABRE INDEXEDDB) --- */
    function precargarDesdeLocalStorage() {
        const len = origLengthDesc ? origLengthDesc.get.call(window.localStorage) : 0;
        for (let i = 0; i < len; i++) {
            const k = origKey.call(window.localStorage, i);
            if (k && k.startsWith(PREFIJO) && k !== FLAG_MIGRADO) {
                const v = origGetItem.call(window.localStorage, k);
                if (v !== null) ramCache.set(k, v);
            }
        }
    }
    precargarDesdeLocalStorage();

    /* --- 2. CONEXIÓN Y OPERACIONES EN INDEXEDDB --- */
    function abrirBaseIndexedDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB no disponible en este navegador.'));
                return;
            }
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (ev) => {
                const db = ev.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                }
            };
            req.onsuccess = (ev) => resolve(ev.target.result);
            req.onerror = (ev) => reject(ev.target.error || new Error('Error abriendo IndexedDB'));
        });
    }

    function leerTodoDeIdb(db) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    function escribirEnIdb(key, value) {
        if (!dbInstancia) return Promise.resolve();
        const p = new Promise((resolve) => {
            try {
                const tx = dbInstancia.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).put({
                    key: String(key),
                    value: String(value),
                    updatedAt: Date.now()
                });
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
                tx.onabort = () => resolve();
            } catch {
                resolve();
            }
        });
        escriturasPendientes.add(p);
        p.finally(() => escriturasPendientes.delete(p));
        return p;
    }

    function eliminarDeIdb(key) {
        if (!dbInstancia) return Promise.resolve();
        const p = new Promise((resolve) => {
            try {
                const tx = dbInstancia.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).delete(String(key));
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
                tx.onabort = () => resolve();
            } catch {
                resolve();
            }
        });
        escriturasPendientes.add(p);
        p.finally(() => escriturasPendientes.delete(p));
        return p;
    }

    async function esperarPendientes() {
        while (escriturasPendientes.size > 0) {
            await Promise.all(Array.from(escriturasPendientes));
        }
    }

    /* --- 3. INTERCEPTOR TRANSPARENTE SOBRE LOCALSTORAGE (SOLO CLAVES cat_alogo_*) --- */
    function obtenerListaClavesCombinadas() {
        const set = new Set();
        const len = origLengthDesc ? origLengthDesc.get.call(window.localStorage) : 0;
        for (let i = 0; i < len; i++) {
            const k = origKey.call(window.localStorage, i);
            if (k && !k.startsWith(PREFIJO)) set.add(k);
        }
        ramCache.forEach((_, k) => set.add(k));
        return Array.from(set);
    }

    Storage.prototype.getItem = function (key) {
        if (this === window.localStorage && typeof key === 'string' && key.startsWith(PREFIJO) && key !== FLAG_MIGRADO) {
            return ramCache.has(key) ? ramCache.get(key) : null;
        }
        return origGetItem.call(this, key);
    };

    Storage.prototype.setItem = function (key, value) {
        if (this === window.localStorage && typeof key === 'string' && key.startsWith(PREFIJO) && key !== FLAG_MIGRADO) {
            const strVal = String(value);
            ramCache.set(key, strVal);
            escribirEnIdb(key, strVal);

            // Solo espejar en localStorage claves livianas (< 40 KB) para arranque instantáneo
            if (CLAVES_MIRROR_RAPIDO.has(key) && strVal.length < 40000) {
                try { origSetItem.call(this, key, strVal); } catch { /* ignore */ }
            } else {
                // Liberar la clave pesada de localStorage para nunca alcanzar los 5 MB
                try { origRemoveItem.call(this, key); } catch { /* ignore */ }
            }
            return;
        }
        return origSetItem.call(this, key, value);
    };

    Storage.prototype.removeItem = function (key) {
        if (this === window.localStorage && typeof key === 'string' && key.startsWith(PREFIJO) && key !== FLAG_MIGRADO) {
            ramCache.delete(key);
            eliminarDeIdb(key);
            try { origRemoveItem.call(this, key); } catch { /* ignore */ }
            return;
        }
        return origRemoveItem.call(this, key);
    };

    Storage.prototype.key = function (index) {
        if (this === window.localStorage) {
            const todas = obtenerListaClavesCombinadas();
            return todas[index] ?? null;
        }
        return origKey.call(this, index);
    };

    Storage.prototype.clear = function () {
        if (this === window.localStorage) {
            const claves = Array.from(ramCache.keys());
            ramCache.clear();
            claves.forEach(k => eliminarDeIdb(k));
        }
        return origClear.call(this);
    };

    if (origLengthDesc && origLengthDesc.configurable) {
        Object.defineProperty(Storage.prototype, 'length', {
            configurable: true,
            get: function () {
                if (this === window.localStorage) {
                    return obtenerListaClavesCombinadas().length;
                }
                return origLengthDesc.get.call(this);
            }
        });
    }

    /* --- 4. HIDRATACIÓN INICIAL, MIGRACIÓN AUTOMÁTICA Y REFRESCO DE VISTAS --- */
    function sincronizarVariablesGlobalesYVista() {
        try {
            const prodsRaw = ramCache.get('cat_alogo_productos_v1');
            if (prodsRaw) {
                const arr = JSON.parse(prodsRaw);
                if (Array.isArray(arr)) window.bovedaProductos = arr;
            }
        } catch { /* ignore */ }

        try {
            if (typeof window.cargarBovedaCategorias === 'function') {
                window.cargarBovedaCategorias();
            }
        } catch { /* ignore */ }

        try {
            if (typeof window.obtenerConfigSistemaCfg === 'function') {
                const sisCfg = window.obtenerConfigSistemaCfg();
                if (typeof window.aplicarTemaGlobalCfg === 'function') window.aplicarTemaGlobalCfg(sisCfg.modoOscuro);
                if (typeof window.sincronizarPerfilConDashboardYEcosistemaCfg === 'function') {
                    window.sincronizarPerfilConDashboardYEcosistemaCfg(sisCfg);
                }
            }
        } catch { /* ignore */ }

        // Refrescar el módulo actualmente visible si ya se había renderizado antes de terminar IndexedDB
        try {
            if (document.getElementById('inv-productos-creados') && typeof window.renderizarProductosCreados === 'function') {
                window.renderizarProductosCreados();
            }
            if (document.getElementById('catweb-module-root') && typeof window.renderizarTodoCatWeb === 'function') {
                window.renderizarTodoCatWeb();
            }
            if (document.getElementById('config-module-root') && typeof window.actualizarDiagnosticoBovedaCfg === 'function') {
                window.actualizarDiagnosticoBovedaCfg();
            }
            if (document.getElementById('pos-module-root') && typeof window.inicializarPos === 'function') {
                window.inicializarPos();
            }
            if (document.getElementById('finanzas-module-root') && typeof window.inicializarFinanzas === 'function') {
                window.inicializarFinanzas();
            }
            if (document.getElementById('inicio-module-root') && typeof window.inicializarInicio === 'function') {
                window.inicializarInicio();
            }
        } catch (err) {
            console.warn('Aviso al refrescar vista tras hidratar IndexedDB:', err);
        }
    }

    async function inicializarMotorIndexedDB() {
        try {
            dbInstancia = await abrirBaseIndexedDB();
            const registrosIdb = await leerTodoDeIdb(dbInstancia);

            if (registrosIdb.length === 0 && ramCache.size > 0) {
                // Primera migración: pasar todo lo que estaba en localStorage hacia IndexedDB
                const promesas = [];
                ramCache.forEach((val, k) => {
                    promesas.push(escribirEnIdb(k, val));
                    if (!CLAVES_MIRROR_RAPIDO.has(k) || val.length >= 40000) {
                        try { origRemoveItem.call(window.localStorage, k); } catch { /* ignore */ }
                    }
                });
                await Promise.all(promesas);
                try { origSetItem.call(window.localStorage, FLAG_MIGRADO, new Date().toISOString()); } catch { /* ignore */ }
                console.info(`✅ Bóveda migrada a IndexedDB (${ramCache.size} colecciones).`);
            } else if (registrosIdb.length > 0) {
                // Cargar desde IndexedDB hacia RAM (IndexedDB es la fuente de verdad)
                registrosIdb.forEach((item) => {
                    if (item && typeof item.key === 'string') {
                        ramCache.set(item.key, item.value);
                    }
                });
                // Si había claves nuevas aún en localStorage sin migrar, subirlas también
                const len = origLengthDesc ? origLengthDesc.get.call(window.localStorage) : 0;
                const aLimpiar = [];
                for (let i = 0; i < len; i++) {
                    const k = origKey.call(window.localStorage, i);
                    if (k && k.startsWith(PREFIJO) && k !== FLAG_MIGRADO) {
                        if (!ramCache.has(k)) {
                            const v = origGetItem.call(window.localStorage, k);
                            if (v !== null) {
                                ramCache.set(k, v);
                                await escribirEnIdb(k, v);
                            }
                        }
                        if (!CLAVES_MIRROR_RAPIDO.has(k)) aLimpiar.push(k);
                    }
                }
                aLimpiar.forEach(k => { try { origRemoveItem.call(window.localStorage, k); } catch { /* ignore */ } });
            }

            idbListo = true;
            sincronizarVariablesGlobalesYVista();
            actualizarIndicadoresCuotaIdb();
            window.dispatchEvent(new CustomEvent('cat-alogo:boveda-idb-lista', { detail: { claves: ramCache.size } }));
        } catch (err) {
            console.error('No se pudo inicializar IndexedDB, continuando en modo fallback:', err);
        }
    }

    /* --- 5. CUOTA REAL DE INDEXEDDB PARA EL KPI DE AJUSTES --- */
    async function obtenerEstadisticasIdb() {
        let bytesUsados = 0;
        ramCache.forEach((v) => { bytesUsados += new Blob([v || '']).size; });

        let cuotaBytes = 500 * 1024 * 1024; // 500 MB referencia segura
        if (navigator.storage?.estimate) {
            try {
                const est = await navigator.storage.estimate();
                if (est?.quota && est.quota > 0) {
                    cuotaBytes = Math.min(est.quota, 2 * 1024 * 1024 * 1024); // mostrar hasta 2 GB legibles
                }
            } catch { /* fallback */ }
        }
        return {
            activo: idbListo,
            dbName: DB_NAME,
            colecciones: ramCache.size,
            bytesUsados,
            cuotaBytes,
            pctUso: Math.min(100, Math.round((bytesUsados / Math.max(1, cuotaBytes)) * 1000) / 10)
        };
    }

    async function actualizarIndicadoresCuotaIdb() {
        const stats = await obtenerEstadisticasIdb();
        const elPeso = document.getElementById('cfg-kpi-peso');
        const elBarra = document.getElementById('cfg-kpi-barra');
        const elBadge = document.getElementById('cfg-kpi-uso-badge');
        const elHeader = document.getElementById('cfg-header-version');

        const fmt = (b) => b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / (1024 * 1024)).toFixed(2)} MB`;
        const cuotaTxt = stats.cuotaBytes >= 1024 * 1024 * 1024
            ? `${(stats.cuotaBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
            : `${Math.round(stats.cuotaBytes / (1024 * 1024))} MB`;

        if (elPeso && stats.activo) elPeso.textContent = `${fmt(stats.bytesUsados)} / ${cuotaTxt}`;
        if (elBarra && stats.activo) elBarra.style.width = `${Math.max(2, stats.pctUso)}%`;
        if (elBadge && stats.activo) {
            elBadge.textContent = `IndexedDB (${stats.pctUso}%)`;
            elBadge.className = stats.pctUso < 75 ? 'cfg-badge-ok' : 'cfg-badge-warn';
        }
        if (elHeader && stats.activo) elHeader.textContent = 'Bóveda IndexedDB v4.2 • Activa';
    }

    // Asegurar que al restaurar o reiniciar en Ajustes se terminen de escribir todos los datos antes de recargar
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof window.actualizarDiagnosticoBovedaCfg === 'function' && !window.actualizarDiagnosticoBovedaCfg._conIdb) {
            const _diagOrig = window.actualizarDiagnosticoBovedaCfg;
            window.actualizarDiagnosticoBovedaCfg = async function (...args) {
                await _diagOrig.apply(this, args);
                await actualizarIndicadoresCuotaIdb();
            };
            window.actualizarDiagnosticoBovedaCfg._conIdb = true;
        }

        if (typeof window.aplicarRestauracionBovedaCfg === 'function' && !window.aplicarRestauracionBovedaCfg._conFlush) {
            const _restOrig = window.aplicarRestauracionBovedaCfg;
            window.aplicarRestauracionBovedaCfg = async function () {
                const origReload = window.location.reload.bind(window.location);
                window.location.reload = async () => {
                    await esperarPendientes();
                    origReload();
                };
                try { _restOrig(); } finally {
                    setTimeout(() => { window.location.reload = origReload; }, 2000);
                }
            };
            window.aplicarRestauracionBovedaCfg._conFlush = true;
        }
    });

    const readyPromise = inicializarMotorIndexedDB();

    window.BovedaIDB = {
        ready: readyPromise,
        esperarPendientes,
        obtenerEstadisticas: obtenerEstadisticasIdb,
        estaActivo: () => idbListo,
        obtenerTodasLasClaves: () => Array.from(ramCache.keys())
    };
})();

