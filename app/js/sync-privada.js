/* ==========================================================================
   ETAPA 4+: MOTOR DE SINCRONIZACIÓN PRIVADA APP ↔ PC (FIRESTORE)
   (FORZAR SYNC, CAJA ÚNICA, FIADOS, CXP + ADELANTOS, PROVEEDORES, PEDIDOS, WEBP)
   * Visibilidad en Catálogo PDF (incluirPdf/visiblePdf/enCatalogo) 100% LOCAL
   * Modelo Unificado de Variantes/Talles (Padre + variantesDetalle[])
   ========================================================================== */
(function () {
    const STORAGE_KEY_SYNC_CFG = 'cat_alogo_sync_cfg_v1';
    const STORAGE_KEY_SYNC_QUEUE = 'cat_alogo_sync_queue_v1';
    const DEVICE_ID_KEY = 'cat_alogo_pc_device_id_v1';
    const COLORES_VARIANTES_SYNC = ['#1e3a8a', '#0f766e', '#d97706', '#6366f1', '#be185d', '#4d7c0f'];

    function getPcDeviceId() {
        let id = localStorage.getItem(DEVICE_ID_KEY);
        if (!id) {
            id = 'pc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
            localStorage.setItem(DEVICE_ID_KEY, id);
        }
        return id;
    }

    const COLECCIONES_ARRAY = {
        cat_alogo_productos_v1:       { subcol: 'inventario',          idField: 'id', atomicField: 'stock' },
        cat_alogo_clientes_v1:        { subcol: 'clientes',            idField: 'id', atomicField: null },
        cat_alogo_proveedores_v1:     { subcol: 'proveedores',         idField: 'id', atomicField: null },
        cat_alogo_pedidos_v1:         { subcol: 'pedidos_proveedores', idField: 'id', atomicField: null },
        cat_alogo_pos_turnos_v1:      { subcol: 'turnos_caja',         idField: 'id', atomicField: null },
        cat_alogo_pos_ventas_v1:      { subcol: 'finanzas_ventas',     idField: 'id', atomicField: null },
        cat_alogo_fin_movimientos_v1: { subcol: 'finanzas_gastos',     idField: 'id', atomicField: null },
        cat_alogo_cuentas_pagar_v1:   { subcol: 'cuentas_pagar',       idField: 'id', atomicField: null }
    };

    const DOCUMENTOS_CONFIG = {
        cat_alogo_categorias_v1:  { docId: 'categorias' },
        cat_alogo_sistema_cfg_v1: { docId: 'sistema' },
        cat_alogo_medios_pago_v1: { docId: 'medios_pago' },
        cat_alogo_ticket_cfg_v1:  { docId: 'tickets' }
    };

    const state = {
        activo: false,
        conectado: false,
        uid: null,
        db: null,
        storage: null,
        aplicandoDesdeNube: false,
        procesandoCola: false,
        reprocesarCola: false,
        forzandoSync: false,
        unsubs: [],
        snapshotsPrevios: new Map(),
        ultimaSync: null,
        ultimoError: ''
    };

    /* --- 1. CONFIGURACIÓN Y COLA OFFLINE --- */
    function leerJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }

    function obtenerTurnoActivoIdParaFecha(fechaIso) {
        const turnos = leerJson('cat_alogo_pos_turnos_v1', []);
        if (!Array.isArray(turnos)) return null;
        const abierto = turnos.find(t => t && (t.estado === 'abierto' || t.estado === 'abierta' || t.abierto === true));
        if (!abierto) return null;
        const tsMov = new Date(fechaIso || Date.now()).getTime();
        const tsAp = new Date(abierto.fechaApertura || 0).getTime();
        if (!isNaN(tsMov) && !isNaN(tsAp) && tsMov >= tsAp - 300000) {
            return String(abierto.id);
        }
        return null;
    }

    function obtenerConfigSync() {
        const def = { autoSync: true, ultimaSync: null };
        return { ...def, ...(leerJson(STORAGE_KEY_SYNC_CFG, {}) || {}) };
    }

    function guardarConfigSync(parcial) {
        const next = { ...obtenerConfigSync(), ...(parcial || {}) };
        localStorage.setItem(STORAGE_KEY_SYNC_CFG, JSON.stringify(next));
        return next;
    }

    function obtenerColaOffline() {
        const q = leerJson(STORAGE_KEY_SYNC_QUEUE, []);
        return Array.isArray(q) ? q : [];
    }

    function guardarColaOffline(cola) {
        localStorage.setItem(STORAGE_KEY_SYNC_QUEUE, JSON.stringify(cola));
        actualizarTarjetaSyncEnAjustes();
    }

    function encolarOperacion(op) {
        const cola = obtenerColaOffline();
        if (op.tipo === 'atomic') {
            const prev = cola.find(c => c.tipo === 'atomic' && c.subcol === op.subcol && c.docId === op.docId && c.field === op.field);
            if (prev) {
                prev.delta = Math.round((prev.delta + op.delta) * 1000) / 1000;
                prev.ts = Date.now();
                guardarColaOffline(cola);
                return;
            }
        } else {
            const idx = cola.findIndex(c => c.tipo === op.tipo && c.subcol === op.subcol && c.docId === op.docId);
            if (idx >= 0) cola.splice(idx, 1);
        }

        cola.push({ ...op, ts: Date.now() });
        guardarColaOffline(cola);
    }

    /* --- 2. COMPRESIÓN Y SUBIDA DE IMÁGENES BASE64 A FIREBASE STORAGE --- */
    function comprimirDataUrlAWebpBlob(dataUrl, maxSide = 900, quality = 0.8) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const ratio = Math.min(1, maxSide / Math.max(img.width, img.height, 1));
                const w = Math.max(1, Math.round(img.width * ratio));
                const h = Math.max(1, Math.round(img.height * ratio));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(
                    (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar blob WebP'))),
                    'image/webp',
                    quality
                );
            };
            img.onerror = () => reject(new Error('Imagen inválida para comprimir'));
            img.src = dataUrl;
        });
    }

    async function subirImagenesBase64SiAplica(subcol, docId, payload) {
        if (subcol !== 'inventario' || !state.storage || !state.uid) return payload;

        const copia = {
            ...payload,
            imagenes: Array.isArray(payload.imagenes) ? [...payload.imagenes] : [],
            variantesDetalle: Array.isArray(payload.variantesDetalle)
                ? payload.variantesDetalle.map(v => ({ ...v }))
                : []
        };

        let huboSubida = false;

        for (let i = 0; i < copia.imagenes.length; i++) {
            const src = copia.imagenes[i];
            if (typeof src !== 'string' || !src.startsWith('data:image/') || src.startsWith('data:image/svg+xml')) continue;
            try {
                const blob = await comprimirDataUrlAWebpBlob(src, 900, 0.8);
                const ruta = `users/${state.uid}/inventario/${docId}_${i}.webp`;
                const ref = state.storage.ref().child(ruta);
                await ref.put(blob, { contentType: 'image/webp' });
                const url = await ref.getDownloadURL();
                copia.imagenes[i] = url;
                if (i === 0) {
                    copia.imagen_url = url;
                    copia.imagen = url;
                }
                huboSubida = true;
            } catch (err) {
                console.warn('No se pudo subir imagen a Storage, omitiendo Base64 en Firestore:', err);
                if (src.length > 180000) copia.imagenes[i] = '';
            }
        }

        // Subir también fotos propias de variantes si vienen en Base64
        for (let idx = 0; idx < copia.variantesDetalle.length; idx++) {
            const v = copia.variantesDetalle[idx];
            const src = v?.imagen_url || '';
            if (typeof src !== 'string' || !src.startsWith('data:image/') || src.startsWith('data:image/svg+xml')) continue;
            try {
                const blob = await comprimirDataUrlAWebpBlob(src, 900, 0.8);
                const ruta = `users/${state.uid}/inventario/${docId}_var_${idx}.webp`;
                const ref = state.storage.ref().child(ruta);
                await ref.put(blob, { contentType: 'image/webp' });
                v.imagen_url = await ref.getDownloadURL();
            } catch (err) {
                console.warn(`No se pudo subir imagen de variante ${idx} a Storage:`, err);
                if (src.length > 180000) v.imagen_url = '';
            }
        }

        if (huboSubida) {
            copia.imagenes = copia.imagenes.filter(Boolean);
        }
        return copia;
    }

    /* --- 3. LIMPIEZA Y TRADUCCIÓN DE PAYLOADS --- */
    function sanitizarParaFirestore(obj) {
        if (obj === null || obj === undefined) return null;
        if (Array.isArray(obj)) return obj.map(sanitizarParaFirestore);
        if (typeof obj === 'object') {
            const limpio = {};
            Object.entries(obj).forEach(([k, v]) => {
                if (v === undefined || typeof v === 'function') return;
                limpio[k] = sanitizarParaFirestore(v);
            });
            return limpio;
        }
        return obj;
    }

    function normalizarVariantesDetalleSync(rawDetalle, rawNombres, prodBase) {
        const precioBase = (Number(prodBase?.precioOferta) > 0 && Number(prodBase?.precioOferta) < Number(prodBase?.precioNormal ?? prodBase?.precio))
            ? Number(prodBase.precioOferta)
            : (Number(prodBase?.precioNormal ?? prodBase?.precio) || 0);
        const skuBase = String(prodBase?.sku || 'PRD').trim();

        let fuente = [];
        if (Array.isArray(rawDetalle) && rawDetalle.length > 0) {
            fuente = rawDetalle;
        } else if (Array.isArray(rawNombres) && rawNombres.length > 0) {
            fuente = rawNombres.map(n => ({ nombre: n }));
        }

        return fuente
            .filter(v => v && String(v.nombre || '').trim() !== '')
            .map((v, idx) => {
                const nombre = String(v.nombre).trim();
                const sufijo = nombre.toUpperCase().replace(/[^A-Z0-9]/g, '') || String(idx + 1);
                const precio = (v.precio !== undefined && v.precio !== null && !isNaN(Number(v.precio)))
                    ? Math.max(0, Number(v.precio))
                    : precioBase;
                const precioOferta = (v.precioOferta !== undefined && v.precioOferta !== null && !isNaN(Number(v.precioOferta)))
                    ? Math.max(0, Number(v.precioOferta))
                    : 0;
                const precioCosto = (v.precioCosto !== undefined && v.precioCosto !== null && !isNaN(Number(v.precioCosto)))
                    ? Math.max(0, Number(v.precioCosto))
                    : null;
                const stock = Math.max(0, Math.round((Number(v.stock) || 0) * 1000) / 1000);
                const imgVar = typeof v.imagen_url === 'string' ? v.imagen_url.trim() : '';

                return {
                    nombre,
                    sku: String(v.sku || `${skuBase}-${sufijo}`).trim(),
                    stock,
                    precio,
                    precioOferta,
                    precioCosto,
                    color: String(v.color || COLORES_VARIANTES_SYNC[idx % COLORES_VARIANTES_SYNC.length]),
                    imagen_url: imgVar
                };
            });
    }

    function filtrarUrlsImagenesValidas(arr, fallbackSingle = '') {
        const esValida = (s) => typeof s === 'string' && (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:image/')) && !s.startsWith('data:image/svg+xml');
        const lista = Array.isArray(arr) ? arr.filter(esValida) : [];
        if (lista.length === 0 && esValida(fallbackSingle)) {
            lista.push(fallbackSingle);
        }
        return Array.from(new Set(lista));
    }

    function construirPayloadProductoCompat(prod) {
        // Excluir siempre campos de visibilidad en Catálogo PDF (son locales por dispositivo)
        const { incluirPdf, visiblePdf, enCatalogo, ...prodSinPdf } = prod || {};
        const imagenesLimpias = filtrarUrlsImagenesValidas(prodSinPdf.imagenes, prodSinPdf.imagen_url || prodSinPdf.imagen || '');
        const imgPrincipal = imagenesLimpias[0] || '';
        const enWeb = prodSinPdf.publicarWeb !== undefined
            ? !!prodSinPdf.publicarWeb
            : (prodSinPdf.visibleWeb !== undefined
                ? !!prodSinPdf.visibleWeb
                : (prodSinPdf.visible !== undefined ? !!prodSinPdf.visible : Boolean(prodSinPdf.publicado)));

        const variantesDetalle = normalizarVariantesDetalleSync(prodSinPdf.variantesDetalle, prodSinPdf.variantes, prodSinPdf);
        const tieneVariantes = variantesDetalle.length > 0;
        const familiaFinal = tieneVariantes
            ? 'variantes'
            : (prodSinPdf.familiaMedicion || prodSinPdf.familia || 'unidad');
        const stockFinal = tieneVariantes
            ? Math.round(variantesDetalle.reduce((acc, v) => acc + (Number(v.stock) || 0), 0) * 1000) / 1000
            : Math.max(0, Math.round((Number(prodSinPdf.stock) || 0) * 1000) / 1000);

        return sanitizarParaFirestore({
            ...prodSinPdf,
            precio: Number(prodSinPdf.precioNormal) || 0,
            precio_costo: Number(prodSinPdf.precioCosto) || 0,
            umbralCritico: Number(prodSinPdf.stockMinimo) || 5,
            descripcionCorta: prodSinPdf.descripcion || '',
            familia: familiaFinal,
            familiaMedicion: familiaFinal,
            stock: stockFinal,
            variantes: variantesDetalle.map(v => v.nombre),
            variantesDetalle,
            visible: enWeb,
            visibleWeb: enWeb,
            publicarWeb: enWeb,
            publicado: enWeb,
            imagenes: imagenesLimpias,
            imagen_url: imgPrincipal,
            imagen: imgPrincipal,
            unidadVenta: prodSinPdf.unidadMedida || 'U',
            _deleted: false,
            updatedAtMs: Date.now(),
            updatedBy: 'web_pc',
            deviceId: getPcDeviceId()
        });
    }

    function normalizarProductoRemotoAPc(docId, remoto, localPrev = null) {
        // Ignorar campos de visibilidad PDF que vengan de la nube
        const { incluirPdf: _rInc, visiblePdf: _rVis, enCatalogo: _rEnCat, ...remotoSinPdf } = remoto || {};
        let base = { ...remotoSinPdf, id: String(docId) };

        if (remotoSinPdf.precio !== undefined && remotoSinPdf.precioNormal === undefined && window.ImportadorAppJson?.mapearProductoAppAPc) {
            base = window.ImportadorAppJson.mapearProductoAppAPc({ ...remotoSinPdf, id: docId }, state.uid).producto;
        }

        const esDesdeApp = remotoSinPdf.updatedBy === 'app_android' || (remotoSinPdf.precio !== undefined && remotoSinPdf.precioNormal === undefined);
        const precioNorm = esDesdeApp
            ? (Number(remotoSinPdf.precio ?? remotoSinPdf.precioNormal) || 0)
            : (Number(remotoSinPdf.precioNormal ?? remotoSinPdf.precio) || 0);
        const precioOf = Number(remotoSinPdf.precioOferta) || 0;
        const precioCost = esDesdeApp
            ? (Number(remotoSinPdf.precio_costo ?? remotoSinPdf.precioCosto) || 0)
            : (Number(remotoSinPdf.precioCosto ?? remotoSinPdf.precio_costo) || 0);

        const enWeb = remotoSinPdf.publicarWeb !== undefined
            ? !!remotoSinPdf.publicarWeb
            : (remotoSinPdf.visibleWeb !== undefined
                ? !!remotoSinPdf.visibleWeb
                : (remotoSinPdf.publicado !== undefined ? !!remotoSinPdf.publicado : (remotoSinPdf.visible !== false)));

        // Conservar la selección PDF local si el producto ya existe; si es nuevo desde App, llega oculto en PDF
        const enPdfLocal = localPrev
            ? (localPrev.incluirPdf !== undefined
                ? !!localPrev.incluirPdf
                : (localPrev.visiblePdf !== undefined
                    ? !!localPrev.visiblePdf
                    : (localPrev.enCatalogo !== undefined ? !!localPrev.enCatalogo : true)))
            : false;

        const descVal = esDesdeApp
            ? (remotoSinPdf.descripcionCorta !== undefined ? String(remotoSinPdf.descripcionCorta) : String(remotoSinPdf.descripcion || ''))
            : (remotoSinPdf.descripcion !== undefined ? String(remotoSinPdf.descripcion) : String(remotoSinPdf.descripcionCorta || ''));

        const imgsValidas = filtrarUrlsImagenesValidas(remotoSinPdf.imagenes, remotoSinPdf.imagen_url || remotoSinPdf.imagen || '');
        const imagenesFinal = imgsValidas.length > 0
            ? imgsValidas
            : (Array.isArray(localPrev?.imagenes) ? localPrev.imagenes : (Array.isArray(base.imagenes) ? base.imagenes : []));

        const variantesDetalle = normalizarVariantesDetalleSync(
            remotoSinPdf.variantesDetalle,
            remotoSinPdf.variantes,
            { sku: remotoSinPdf.sku ?? base.sku, precioNormal: precioNorm, precioOferta: precioOf }
        );
        const tieneVariantes = variantesDetalle.length > 0;
        const familiaFinal = tieneVariantes
            ? 'variantes'
            : (remotoSinPdf.familiaMedicion || remotoSinPdf.familia || base.familiaMedicion || 'unidad');
        const stockFinal = tieneVariantes
            ? Math.round(variantesDetalle.reduce((acc, v) => acc + (Number(v.stock) || 0), 0) * 1000) / 1000
            : Math.max(0, Math.round((Number(remotoSinPdf.stock ?? base.stock) || 0) * 1000) / 1000);

        return {
            ...base,
            id: String(docId),
            nombre: String(remotoSinPdf.nombre || base.nombre || 'Producto').trim(),
            sku: String(remotoSinPdf.sku ?? base.sku ?? '').trim(),
            categoria: String(remotoSinPdf.categoria || base.categoria || 'General').trim() || 'General',
            descripcion: descVal,
            familia: familiaFinal,
            familiaMedicion: familiaFinal,
            precioNormal: precioNorm,
            precioOferta: precioOf,
            precioCosto: precioCost,
            stock: stockFinal,
            stockMinimo: Number(remotoSinPdf.stockMinimo ?? remotoSinPdf.umbralCritico ?? base.stockMinimo ?? 5) || 5,
            unidadMedida: String(remotoSinPdf.unidadMedida || remotoSinPdf.unidadVenta || base.unidadMedida || 'Unidad').trim(),
            variantes: variantesDetalle.map(v => v.nombre),
            variantesDetalle,
            visible: enWeb,
            visibleWeb: enWeb,
            publicarWeb: enWeb,
            publicado: enWeb,
            incluirPdf: enPdfLocal,
            visiblePdf: enPdfLocal,
            enCatalogo: enPdfLocal,
            imagenes: imagenesFinal,
            imagen_url: imagenesFinal[0] || base.imagen_url || ''
        };
    }

    function construirPayloadClienteCompat(cli) {
        const nombre = String(cli.nombre || cli.nombre_apellido || 'Cliente').trim();
        const domicilio = String(cli.domicilio ?? cli.direccion ?? '').trim();
        const saldo = Math.max(0, Math.round((Number(cli.saldoActual ?? cli.deudaTotal ?? cli.deuda) || 0) * 100) / 100);

        return sanitizarParaFirestore({
            ...cli,
            id: String(cli.id),
            nombre,
            nombre_apellido: nombre,
            telefono: String(cli.telefono || '').trim(),
            domicilio,
            direccion: domicilio,
            notas: String(cli.notas || '').trim(),
            saldoActual: saldo,
            deudaTotal: saldo,
            deuda: saldo,
            _deleted: false,
            updatedAtMs: Date.now(),
            updatedBy: 'web_pc',
            deviceId: getPcDeviceId()
        });
    }

    function construirPayloadsCobrosClienteCompat(cli) {
        const movs = Array.isArray(cli?.movimientos) ? cli.movimientos : [];
        if (movs.length === 0) return [];
        const myDeviceId = getPcDeviceId();
        const nombreCli = String(cli.nombre || cli.nombre_apellido || 'Cliente').trim();

        return movs
            .filter((m) => {
                if (!m || m.tipo !== 'credito') return false;
                if ((Number(m.monto) || 0) <= 0) return false;
                const mId = String(m.id || '');
                if (mId.startsWith('cobro_') || mId.startsWith('mov-app-')) return false;
                return true;
            })
            .map((m) => {
                const monto = Math.max(0, Math.round((Number(m.monto) || 0) * 100) / 100);
                const medio = String(m.medio || 'Efectivo').trim();
                const fecha = m.fecha || new Date().toISOString();
                const cajaId = obtenerTurnoActivoIdParaFecha(fecha);
                const docId = `cobro_pc_${cli.id}_${m.id}`;
                const concepto = `Cobro Cta. Cte.: ${nombreCli} • ${m.concepto || 'Abono ' + medio}`;

                return {
                    docId,
                    data: sanitizarParaFirestore({
                        id: docId,
                        cajaId,
                        turnoId: cajaId,
                        tipo: 'ingreso',
                        tipoApp: 'ingreso_cobro_deuda',
                        esCobroDeuda: true,
                        monto,
                        montoTotal: monto,
                        medio,
                        metodoPago: medio,
                        categoria: 'Cobro Cuenta Corriente',
                        concepto,
                        nota: concepto,
                        fecha,
                        estadoPago: 'Completado',
                        clienteId: String(cli.id),
                        clienteNombre: nombreCli,
                        origen: 'pc',
                        _deleted: false,
                        updatedAtMs: Date.now(),
                        updatedBy: 'web_pc',
                        deviceId: myDeviceId
                    })
                };
            });
    }

    function normalizarClienteRemotoAPc(docId, remoto, localPrev = null) {
        const esDesdeApp = remoto.updatedBy === 'app_android';
        const nombre = String(remoto.nombre || remoto.nombre_apellido || localPrev?.nombre || 'Cliente').trim();
        const domicilio = esDesdeApp
            ? String(remoto.direccion ?? remoto.domicilio ?? localPrev?.domicilio ?? '').trim()
            : String(remoto.domicilio ?? remoto.direccion ?? localPrev?.domicilio ?? '').trim();

        const saldoNuevo = esDesdeApp
            ? Math.max(0, Math.round((Number(remoto.deudaTotal ?? remoto.saldoActual ?? remoto.deuda) || 0) * 100) / 100)
            : Math.max(0, Math.round((Number(remoto.saldoActual ?? remoto.deudaTotal ?? remoto.deuda) || 0) * 100) / 100);

        const movsMap = new Map();
        const agregarMov = (m) => {
            if (!m || typeof m !== 'object') return;
            const key = String(m.id || `${m.fecha}_${m.tipo}_${m.monto}`);
            if (!movsMap.has(key)) movsMap.set(key, m);
        };
        (Array.isArray(localPrev?.movimientos) ? localPrev.movimientos : []).forEach(agregarMov);
        (Array.isArray(remoto.movimientos) ? remoto.movimientos : []).forEach(agregarMov);

        const movs = Array.from(movsMap.values()).sort(
            (a, b) => (new Date(b.fecha || 0).getTime() || 0) - (new Date(a.fecha || 0).getTime() || 0)
        );

        return {
            ...(localPrev || {}),
            ...remoto,
            id: String(docId),
            cuenta: remoto.cuenta || localPrev?.cuenta || `AC${String(docId).slice(-3).padStart(3, '0')}`,
            nombre,
            dni: remoto.dni ?? localPrev?.dni ?? '',
            telefono: String(remoto.telefono ?? localPrev?.telefono ?? '').trim(),
            domicilio,
            direccion: domicilio,
            notas: String(remoto.notas ?? localPrev?.notas ?? '').trim(),
            vip: remoto.vip !== undefined ? !!remoto.vip : !!localPrev?.vip,
            cupoMaximo: remoto.cupoMaximo !== undefined ? (Number(remoto.cupoMaximo) || 0) : (localPrev?.cupoMaximo ?? 20000),
            bloqueadoPos: remoto.bloqueadoPos !== undefined ? !!remoto.bloqueadoPos : !!localPrev?.bloqueadoPos,
            saldoActual: saldoNuevo,
            deudaTotal: saldoNuevo,
            movimientos: movs
        };
    }

    function normalizarNombreProvClave(str) {
        return String(str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function esProveedorDemoSinUso(prov) {
        if (!prov) return false;
        const idsDemo = new Set(['prov-1', 'prov-2', 'prov-3']);
        if (!idsDemo.has(String(prov.id))) return false;
        const claveNom = normalizarNombreProvClave(prov.nombre);
        const prods = leerJson('cat_alogo_productos_v1', []);
        const tieneEnInv = Array.isArray(prods) && prods.some(p => p && normalizarNombreProvClave(p.proveedor) === claveNom);
        const tieneIds = Array.isArray(prov.productosIds) && prov.productosIds.length > 0;
        return !tieneEnInv && !tieneIds;
    }

    function construirPayloadProveedorCompat(prov) {
        const nombre = String(prov.nombre || 'Proveedor').trim();
        const claveNom = normalizarNombreProvClave(nombre);
        const whatsapp = String(prov.whatsapp ?? prov.telefono ?? '').trim();
        const rubro = String(prov.rubro ?? prov.rubros ?? 'General').trim();

        const prods = leerJson('cat_alogo_productos_v1', []);
        const idsDesdeInv = Array.isArray(prods)
            ? prods.filter(p => p && normalizarNombreProvClave(p.proveedor) === claveNom).map(p => String(p.id))
            : [];
        const idsPrev = Array.isArray(prov.productosIds) ? prov.productosIds.map(String) : [];
        const productosIds = Array.from(new Set([...idsPrev, ...idsDesdeInv]));

        return sanitizarParaFirestore({
            ...prov,
            id: String(prov.id),
            nombre,
            whatsapp,
            telefono: whatsapp,
            rubro,
            rubros: rubro,
            entrega: prov.entrega || 'Programado',
            alias: String(prov.alias || '').trim(),
            notas: String(prov.notas || '').trim(),
            tiposProductos: String(prov.tiposProductos || '').trim(),
            productosIds,
            _deleted: false,
            updatedAtMs: Date.now(),
            updatedBy: 'web_pc',
            deviceId: getPcDeviceId()
        });
    }

    function normalizarProveedorRemotoAPc(docId, remoto, localPrev = null) {
        const esDesdeApp = remoto.updatedBy === 'app_android';
        const nombre = String(remoto.nombre || localPrev?.nombre || 'Proveedor').trim();
        const whatsapp = esDesdeApp
            ? String(remoto.telefono || remoto.whatsapp || localPrev?.whatsapp || '').trim()
            : String(remoto.whatsapp || remoto.telefono || localPrev?.whatsapp || '').trim();
        const rubro = esDesdeApp
            ? String(remoto.rubros || remoto.rubro || localPrev?.rubro || 'General').trim()
            : String(remoto.rubro || remoto.rubros || localPrev?.rubro || 'General').trim();

        if (esDesdeApp && Array.isArray(remoto.productosIds) && remoto.productosIds.length > 0) {
            const setIds = new Set(remoto.productosIds.map(String));
            const prods = leerJson('cat_alogo_productos_v1', []);
            let cambioInv = false;
            prods.forEach(p => {
                if (p && setIds.has(String(p.id)) && normalizarNombreProvClave(p.proveedor) !== normalizarNombreProvClave(nombre)) {
                    p.proveedor = nombre;
                    cambioInv = true;
                }
            });
            if (cambioInv) {
                escribirLocalSilencioso('cat_alogo_productos_v1', prods, 'id');
            }
        }

        const mergedIds = Array.from(new Set([
            ...(Array.isArray(localPrev?.productosIds) ? localPrev.productosIds.map(String) : []),
            ...(Array.isArray(remoto.productosIds) ? remoto.productosIds.map(String) : [])
        ]));

        return {
            ...(localPrev || {}),
            ...remoto,
            id: String(docId),
            nombre,
            rubro: rubro || 'General',
            rubros: rubro || 'General',
            whatsapp,
            telefono: whatsapp,
            entrega: remoto.entrega || localPrev?.entrega || 'Programado',
            alias: remoto.alias ?? localPrev?.alias ?? '',
            notas: remoto.notas ?? localPrev?.notas ?? '',
            tiposProductos: remoto.tiposProductos ?? localPrev?.tiposProductos ?? '',
            productosIds: mergedIds
        };
    }

    /* --- 3B. TRADUCTOR DE PEDIDOS A PROVEEDORES (FASE 2: EN TRÁNSITO ↔ RECEPCIÓN) --- */
    function construirPayloadPedidoCompat(ped) {
        const esRecibido = String(ped.estado || '').toLowerCase().includes('recib');
        const id = String(ped.id || ped.idPedido || `ped-${Date.now()}`);
        const codigo = String(ped.codigo || ped.codigoOrden || `OC-${id.slice(-4)}`);
        const itemsPc = Array.isArray(ped.items) ? ped.items : [];

        const productosSolicitados = itemsPc.map(it => ({
            idProducto: String(it.prodId || it.idProducto || it.id || ''),
            nombre: String(it.nombre || 'Producto').trim(),
            cantidad: Number(it.cantidadPedida ?? it.cantidad) || 0,
            unidad: String(it.unidadMedida || it.unidad || 'U')
        })).filter(it => it.cantidad > 0);

        return sanitizarParaFirestore({
            ...ped,
            id,
            idPedido: id,
            codigo,
            codigoOrden: codigo,
            fecha: ped.fechaCreacion || ped.fecha || new Date().toISOString(),
            fechaCreacion: ped.fechaCreacion || ped.fecha || new Date().toISOString(),
            fechaRecepcion: esRecibido ? (ped.fechaRecepcion || new Date().toISOString()) : null,
            proveedorId: ped.proveedorId || ped.idProveedor || null,
            idProveedor: ped.proveedorId || ped.idProveedor || null,
            proveedorNombre: String(ped.proveedorNombre || ped.nombreProveedor || 'Proveedor').trim(),
            nombreProveedor: String(ped.proveedorNombre || ped.nombreProveedor || 'Proveedor').trim(),
            estado: esRecibido ? 'Recibido' : 'Pendiente',
            estadoPc: esRecibido ? 'recibido' : 'en_espera',
            productosSolicitados,
            items: itemsPc,
            mensaje: String(ped.mensaje || ped.mensajeTexto || ''),
            mensajeTexto: String(ped.mensaje || ped.mensajeTexto || ''),
            _deleted: false,
            updatedAtMs: Date.now(),
            updatedBy: 'web_pc',
            deviceId: getPcDeviceId()
        });
    }

    function construirPagoInfoDesdeCxp(cxp) {
        if (!cxp) return null;
        return {
            cuentaPagarId: cxp.id,
            subtotalMercaderia: Number(cxp.costoMercaderia ?? cxp.subtotalMercaderia ?? cxp.totalGeneral) || 0,
            costoEnvio: Number(cxp.costoEnvio) || 0,
            totalGeneral: Number(cxp.totalGeneral) || 0,
            modalidadPago: (Number(cxp.deudaPendiente) || 0) > 0 ? 'dividido' : 'unico',
            montoEntregado: Number(cxp.montoEntregado) || 0,
            deudaPendiente: Number(cxp.deudaPendiente) || 0,
            medioPago: cxp.medioPago || cxp.metodoPago || 'Efectivo',
            comprobante: cxp.comprobante || '',
            notas: cxp.notas || 'Liquidado desde App Móvil',
            fechaPago: cxp.fecha || new Date().toISOString()
        };
    }

    function buscarCxpAsociadaAPedido(pedido) {
        const cuentas = leerJson('cat_alogo_cuentas_pagar_v1', []);
        if (!Array.isArray(cuentas) || cuentas.length === 0) return null;

        const porId = cuentas.find(c => c && c.pedidoId && String(c.pedidoId) === String(pedido.id));
        if (porId) return porId;

        const claveProv = normalizarNombreProvClave(pedido.proveedorNombre);
        const tsRef = new Date(pedido.fechaRecepcion || pedido.updatedAtMs || pedido.fechaCreacion || 0).getTime();
        if (!claveProv || isNaN(tsRef)) return null;

        return cuentas.find(c => {
            if (!c) return false;
            if (normalizarNombreProvClave(c.proveedorNombre) !== claveProv) return false;
            const tsCxp = new Date(c.fecha || 0).getTime();
            return !isNaN(tsCxp) && Math.abs(tsCxp - tsRef) < 900000;
        }) || null;
    }

    function vincularCxpConPedidoLocalSiAplica(cxp) {
        if (!cxp) return;
        const pedidos = leerJson('cat_alogo_pedidos_v1', []);
        if (!Array.isArray(pedidos) || pedidos.length === 0) return;

        const claveProv = normalizarNombreProvClave(cxp.proveedorNombre);
        const tsCxp = new Date(cxp.fecha || 0).getTime();
        let modificado = false;

        pedidos.forEach(p => {
            if (!p || p.estado !== 'recibido') return;
            const yaVinculado = p.pagoInfo && String(p.pagoInfo.cuentaPagarId || '') === String(cxp.id);
            const coincidePorId = cxp.pedidoId && String(cxp.pedidoId) === String(p.id);
            const tsRec = new Date(p.fechaRecepcion || p.updatedAtMs || p.fechaCreacion || 0).getTime();
            const coincidePorProvYFecha = !p.pagoInfo && claveProv && normalizarNombreProvClave(p.proveedorNombre) === claveProv && !isNaN(tsCxp) && !isNaN(tsRec) && Math.abs(tsCxp - tsRec) < 900000;

            if (yaVinculado || coincidePorId || coincidePorProvYFecha) {
                p.pagoInfo = construirPagoInfoDesdeCxp(cxp);
                p.totalFinal = Number(cxp.costoMercaderia ?? cxp.totalGeneral) || p.totalFinal || p.totalEstimado;
                modificado = true;
            }
        });

        if (modificado) {
            escribirLocalSilencioso('cat_alogo_pedidos_v1', pedidos, 'id');
        }
    }

    function normalizarPedidoRemotoAPc(docId, remoto, localPrev = null) {
        const estRaw = String(remoto.estadoPc || remoto.estado || 'en_espera').toLowerCase().trim();
        const remotoRecibido = estRaw.includes('recib') || estRaw.includes('complet');
        const localRecibido = localPrev && String(localPrev.estado || '').toLowerCase().includes('recib');
        const estadoFinal = (localRecibido || remotoRecibido) ? 'recibido' : 'en_espera';

        const provNombre = String(remoto.proveedorNombre || remoto.nombreProveedor || localPrev?.proveedorNombre || 'Proveedor').trim();
        const proveedores = leerJson('cat_alogo_proveedores_v1', []);
        const provLocal = Array.isArray(proveedores)
            ? proveedores.find(pr =>
                (remoto.proveedorId && String(pr.id) === String(remoto.proveedorId)) ||
                normalizarNombreProvClave(pr.nombre) === normalizarNombreProvClave(provNombre)
            )
            : null;

        const productosInv = leerJson('cat_alogo_productos_v1', []);
        const fuenteItems = (Array.isArray(remoto.items) && remoto.items.length > 0)
            ? remoto.items
            : (Array.isArray(remoto.productosSolicitados) ? remoto.productosSolicitados : (localPrev?.items || []));

        const itemsNorm = fuenteItems.map(it => {
            const prodId = String(it.prodId || it.productoId || it.idProducto || it.id || '');
            const prodInv = Array.isArray(productosInv)
                ? productosInv.find(p => (prodId && String(p.id) === prodId) || normalizarNombreProvClave(p.nombre) === normalizarNombreProvClave(it.nombre))
                : null;
            const cantPed = Number(it.cantidadPedida ?? it.cantidad) || 0;
            const cantRec = Number(it.cantidadRecibida ?? cantPed) || 0;
            const costo = Number(it.costoUnitario ?? it.costoUnit) || (Number(prodInv?.precioCosto) || 0);

            return {
                prodId: prodInv ? String(prodInv.id) : prodId,
                varIdx: it.varIdx ?? null,
                nombre: String(it.nombre || prodInv?.nombre || 'Producto').trim(),
                sku: String(it.sku || prodInv?.sku || '').trim(),
                unidadMedida: String(it.unidadMedida || it.unidad || prodInv?.unidadMedida || 'Unidad').trim(),
                familiaMedicion: String(it.familiaMedicion || prodInv?.familiaMedicion || 'unidad').trim(),
                cantidadPedida: cantPed,
                cantidadRecibida: cantRec,
                costoUnitario: costo
            };
        }).filter(it => it.cantidadPedida > 0 || it.cantidadRecibida > 0);

        const totalCalc = Math.round(itemsNorm.reduce((acc, it) => acc + ((it.cantidadRecibida || it.cantidadPedida) * (Number(it.costoUnitario) || 0)), 0) * 100) / 100;

        const pedidoBase = {
            ...(localPrev || {}),
            ...remoto,
            id: String(docId),
            codigo: String(remoto.codigo || remoto.codigoOrden || localPrev?.codigo || `APP-${String(docId).slice(-4)}`),
            fechaCreacion: remoto.fechaCreacion || remoto.fecha || localPrev?.fechaCreacion || new Date().toISOString(),
            fechaRecepcion: estadoFinal === 'recibido'
                ? (remoto.fechaRecepcion || localPrev?.fechaRecepcion || new Date(Number(remoto.updatedAtMs) || Date.now()).toISOString())
                : null,
            proveedorId: remoto.proveedorId || remoto.idProveedor || provLocal?.id || localPrev?.proveedorId || null,
            proveedorNombre: provNombre,
            proveedorWhatsapp: remoto.proveedorWhatsapp || provLocal?.whatsapp || localPrev?.proveedorWhatsapp || '',
            proveedorAlias: remoto.proveedorAlias || provLocal?.alias || localPrev?.proveedorAlias || '',
            estado: estadoFinal,
            canal: remoto.canal || localPrev?.canal || (remoto.updatedBy === 'app_android' ? 'app' : 'manual'),
            nota: String(remoto.nota ?? localPrev?.nota ?? '').trim(),
            mensaje: String(remoto.mensaje ?? remoto.mensajeTexto ?? localPrev?.mensaje ?? '').trim(),
            totalEstimado: Number(remoto.totalEstimado) || totalCalc,
            totalFinal: estadoFinal === 'recibido' ? (Number(remoto.totalFinal) || totalCalc) : (localPrev?.totalFinal ?? null),
            items: itemsNorm,
            pagoInfo: remoto.pagoInfo || localPrev?.pagoInfo || null
        };

        if (estadoFinal === 'recibido' && !pedidoBase.pagoInfo) {
            const cxpMatch = buscarCxpAsociadaAPedido(pedidoBase);
            if (cxpMatch) {
                pedidoBase.pagoInfo = construirPagoInfoDesdeCxp(cxpMatch);
                pedidoBase.totalFinal = Number(cxpMatch.costoMercaderia ?? cxpMatch.totalGeneral) || pedidoBase.totalFinal;
            }
        }

        return pedidoBase;
    }

    function construirPayloadVentaCompat(v) {
        const total = Math.max(0, Math.round((Number(v.total) || 0) * 100) / 100);
        const pagos = Array.isArray(v.pagos) ? v.pagos : [];
        const montoFiado = Math.round(
            pagos
                .filter(p => String(p.medio || '').toLowerCase().includes('corriente') || String(p.medio || '').toLowerCase().includes('fiado'))
                .reduce((a, p) => a + (Number(p.monto) || 0), 0) * 100
        ) / 100;
        const montoPagado = Math.max(0, Math.round((total - montoFiado) * 100) / 100);
        const esAnulada = v.estado === 'anulada';
        const estadoPago = esAnulada
            ? 'Anulado'
            : (montoFiado > 0 ? (montoPagado <= 0 ? 'Pendiente' : 'Parcial') : 'Completado');

        const medioPrincipal = pagos.length > 1
            ? 'Pago Mixto'
            : (pagos[0]?.medio || 'Efectivo');
        const esWeb = v.canal === 'web' || v.origen === 'web' || !!v.esPedidoWeb;

        return sanitizarParaFirestore({
            ...v,
            id: String(v.id),
            tipo: 'ingreso_venta',
            esPedidoWeb: esWeb,
            monto: montoPagado,
            montoPagado,
            montoTotal: total,
            total,
            deudaGenerada: montoFiado,
            metodoPago: medioPrincipal,
            desglosePagos: pagos.length > 1
                ? pagos.map(p => ({ metodo: p.medio || 'Efectivo', monto: Number(p.monto) || 0 }))
                : null,
            cajaId: v.turnoId || obtenerTurnoActivoIdParaFecha(v.fecha),
            concepto: `Ticket ${v.numeroTicket || ''} • ${v.clienteNombre || 'Consumidor Final'}`.trim(),
            estadoPago,
            canal: esWeb ? 'web' : (v.canal || 'pos'),
            origen: esWeb ? 'web' : (v.origen || 'pc'),
            _deleted: false,
            updatedAtMs: Date.now(),
            updatedBy: 'web_pc',
            deviceId: getPcDeviceId()
        });
    }

    function normalizarVentaRemotaAPc(docId, remoto) {
        const total = Math.max(0, Math.round((Number(remoto.total ?? remoto.montoTotal ?? remoto.monto) || 0) * 100) / 100);
        const medio = remoto.metodoPago || remoto.pagos?.[0]?.medio || 'Efectivo';
        const anulada = remoto.estado === 'anulada' || remoto.estadoPago === 'Anulado';
        const esWeb = remoto.canal === 'web' || remoto.origen === 'web' || !!remoto.esPedidoWeb;

        let pagos = [];
        if (Array.isArray(remoto.pagos) && remoto.pagos.length > 0) {
            pagos = remoto.pagos.map(p => ({ medio: p.medio || p.metodo || 'Efectivo', monto: Number(p.monto) || 0 }));
        } else if (Array.isArray(remoto.desglosePagos) && remoto.desglosePagos.length > 0) {
            pagos = remoto.desglosePagos.map(p => ({ medio: p.metodo || p.medio || 'Efectivo', monto: Number(p.monto) || 0 }));
        } else if (Number(remoto.deudaGenerada) > 0) {
            const deuda = Math.min(total, Math.round(Number(remoto.deudaGenerada) * 100) / 100);
            const pagado = Math.max(0, Math.round((total - deuda) * 100) / 100);
            if (pagado > 0) pagos.push({ medio: medio === 'Pago Mixto' ? 'Efectivo' : medio, monto: pagado });
            pagos.push({ medio: 'Cuenta Corriente', monto: deuda });
        } else {
            pagos = [{ medio, monto: total }];
        }

        return {
            ...remoto,
            id: String(docId),
            numeroTicket: remoto.numeroTicket || `${esWeb ? 'WEB' : 'APP'}-${String(docId).slice(-4)}`,
            fecha: remoto.fecha || new Date().toISOString(),
            turnoId: remoto.turnoId || remoto.cajaId || null,
            operador: remoto.operador || remoto.cajero || 'App Móvil',
            clienteId: remoto.clienteId || null,
            clienteNombre: remoto.clienteNombre || 'Consumidor Final',
            items: Array.isArray(remoto.items) ? remoto.items : (Array.isArray(remoto.detalleProductos) ? remoto.detalleProductos : []),
            subtotal: Number(remoto.subtotal) || total,
            descuentoPct: Number(remoto.descuentoPct) || 0,
            descuentoMonto: Number(remoto.descuentoMonto) || 0,
            recargoPct: Number(remoto.recargoPct) || 0,
            recargoMonto: Number(remoto.recargoMonto) || 0,
            total,
            costoTotal: Number(remoto.costoTotal) || 0,
            pagos,
            estado: anulada ? 'anulada' : 'completada',
            canal: esWeb ? 'web' : (remoto.canal || (remoto.updatedBy === 'app_android' ? 'app' : 'pos')),
            origen: esWeb ? 'web' : (remoto.origen || (remoto.updatedBy === 'app_android' ? 'app' : 'pc'))
        };
    }

    function construirPayloadMovFinCompat(mov) {
        const esIng = mov.tipo === 'ingreso';
        const medio = String(mov.medio || 'Efectivo').trim();
        const monto = Math.max(0, Math.round((Number(mov.monto) || 0) * 100) / 100);
        const cajaId = mov.cajaId || mov.turnoId || obtenerTurnoActivoIdParaFecha(mov.fecha);
        const concepto = String(mov.concepto || mov.categoria || 'Movimiento PC').trim();

        return sanitizarParaFirestore({
            ...mov,
            id: String(mov.id),
            cajaId,
            turnoId: cajaId,
            tipo: esIng ? 'ingreso' : 'gasto',
            tipoApp: esIng ? 'ingreso_manual' : 'gasto_operativo',
            monto,
            montoTotal: monto,
            medio,
            metodoPago: medio,
            categoria: String(mov.categoria || (esIng ? 'Otros Ingresos' : 'Otros Gastos Operativos')).trim(),
            concepto,
            nota: concepto,
            fecha: mov.fecha || new Date().toISOString(),
            estadoPago: 'Completado',
            origen: mov.origen || 'pc',
            _deleted: false,
            updatedAtMs: Date.now(),
            updatedBy: 'web_pc',
            deviceId: getPcDeviceId()
        });
    }

    function normalizarMovFinRemotoAPc(docId, remoto) {
        const esIng = String(remoto.tipo || '').toLowerCase().startsWith('ingreso');
        return {
            id: String(docId),
            tipo: esIng ? 'ingreso' : 'gasto',
            monto: Math.max(0, Math.round((Number(remoto.monto ?? remoto.montoTotal) || 0) * 100) / 100),
            medio: remoto.medio || remoto.metodoPago || 'Efectivo',
            categoria: String(remoto.categoria || (esIng ? 'Otros Ingresos' : 'Otros Gastos Operativos')).trim(),
            concepto: String(remoto.concepto || remoto.nota || remoto.categoria || 'Movimiento App').trim(),
            fecha: remoto.fecha || new Date().toISOString(),
            cajaId: remoto.cajaId || remoto.turnoId || null,
            origen: remoto.origen || (remoto.updatedBy === 'app_android' ? 'app' : 'pc')
        };
    }

    function separarPagosCxpCompat(cxp) {
        const pagosArr = Array.isArray(cxp.pagos) ? cxp.pagos : [];
        if (pagosArr.length === 0) {
            return { pagoInicial: null, adelantos: [] };
        }
        const primero = pagosArr[0];
        const tsOrden = new Date(cxp.fecha || 0).getTime() || 0;
        const tsPrimero = new Date(primero.fecha || cxp.fecha || 0).getTime() || 0;
        const notaLow = String(primero.nota || '').toLowerCase();
        const esInicial = Math.abs(tsPrimero - tsOrden) < 300000 || notaLow.includes('recepción') || notaLow.includes('inicial');

        return esInicial
            ? { pagoInicial: primero, adelantos: pagosArr.slice(1) }
            : { pagoInicial: null, adelantos: pagosArr };
    }

    function construirPayloadCxpCompat(cxp) {
        const total = Math.max(0, Math.round((Number(cxp.totalGeneral) || 0) * 100) / 100);
        const deuda = Math.max(0, Math.round((Number(cxp.deudaPendiente) || 0) * 100) / 100);
        const entregadoTotal = Math.max(0, Math.round((Number(cxp.montoEntregado ?? (total - deuda)) || 0) * 100) / 100);
        const costoEnvio = Math.max(0, Math.round((Number(cxp.costoEnvio) || 0) * 100) / 100);
        const costoMercaderia = cxp.costoMercaderia !== undefined
            ? Math.max(0, Math.round((Number(cxp.costoMercaderia) || 0) * 100) / 100)
            : Math.max(0, Math.round((total - costoEnvio) * 100) / 100);
        const saldado = deuda <= 0 || cxp.estado === 'pagado';

        const { pagoInicial, adelantos } = separarPagosCxpCompat(cxp);
        const montoInicial = pagoInicial
            ? Math.max(0, Math.round((Number(pagoInicial.monto) || 0) * 100) / 100)
            : (adelantos.length > 0 ? 0 : entregadoTotal);
        const medioInicial = String(pagoInicial?.medio || cxp.medioPago || 'Efectivo').trim();
        const cajaId = cxp.cajaId || cxp.turnoId || obtenerTurnoActivoIdParaFecha(cxp.fecha);

        return sanitizarParaFirestore({
            ...cxp,
            id: String(cxp.id),
            cajaId,
            turnoId: cajaId,
            tipo: 'pago_proveedor',
            costoMercaderia,
            costoEnvio,
            totalGeneral: total,
            totalLiquidacion: total,
            montoTotal: total,
            montoEntregado: entregadoTotal,
            montoPagado: montoInicial,
            adelanto: montoInicial,
            monto: montoInicial,
            deudaPendiente: saldado ? 0 : deuda,
            deuda: saldado ? 0 : deuda,
            saldado,
            estado: saldado ? 'pagado' : 'pendiente',
            estadoPago: saldado ? 'Pagado' : (entregadoTotal > 0 ? 'Parcial' : 'Pendiente'),
            estadoLiquidacion: saldado ? 'pagado' : (entregadoTotal > 0 ? 'parcial' : 'pendiente'),
            medioPago: medioInicial,
            metodoPago: medioInicial,
            origen: cxp.origen || 'pc',
            _deleted: false,
            updatedAtMs: Date.now(),
            updatedBy: 'web_pc',
            deviceId: getPcDeviceId()
        });
    }

    function construirPayloadsAdelantosCxpCompat(cxp) {
        const { adelantos } = separarPagosCxpCompat(cxp);
        if (adelantos.length === 0) return [];
        const myDeviceId = getPcDeviceId();

        return adelantos.map((pg, idx) => {
            const monto = Math.max(0, Math.round((Number(pg.monto) || 0) * 100) / 100);
            if (monto <= 0) return null;
            const docId = String(pg.id || `${cxp.id}_pg_${idx + 1}`);
            const medio = String(pg.medio || cxp.medioPago || 'Efectivo').trim();
            const fecha = pg.fecha || new Date().toISOString();
            const cajaId = obtenerTurnoActivoIdParaFecha(fecha) || cxp.cajaId || cxp.turnoId || null;
            const prov = String(cxp.proveedorNombre || 'Proveedor').trim();
            const cod = cxp.codigoOrden ? ` (${cxp.codigoOrden})` : '';

            return {
                docId,
                data: sanitizarParaFirestore({
                    id: docId,
                    tipo: 'pago_deuda_proveedor',
                    esPagoDeudaProveedor: true,
                    transaccionReferencia: String(cxp.id),
                    proveedorNombre: prov,
                    codigoOrden: cxp.codigoOrden || '',
                    concepto: `Abono Deuda: ${prov}${cod}`,
                    nota: String(pg.nota || 'Adelanto a proveedor'),
                    monto,
                    montoPagado: monto,
                    montoTotal: monto,
                    deuda: 0,
                    saldado: true,
                    estadoPago: 'Pagado',
                    medio,
                    metodoPago: medio,
                    fecha,
                    cajaId,
                    turnoId: cajaId,
                    origen: 'pc',
                    _deleted: false,
                    updatedAtMs: Date.now(),
                    updatedBy: 'web_pc',
                    deviceId: myDeviceId
                })
            };
        }).filter(Boolean);
    }

    function normalizarCxpRemotoAPc(docId, remoto, localPrev = null) {
        const total = Math.max(0, Math.round((Number(remoto.totalGeneral ?? remoto.totalLiquidacion ?? remoto.montoTotal ?? localPrev?.totalGeneral) || 0) * 100) / 100);
        const saldado = remoto.saldado === true || remoto.estado === 'pagado' || (remoto.deudaPendiente !== undefined && Number(remoto.deudaPendiente) <= 0) || (remoto.deuda !== undefined && Number(remoto.deuda) <= 0);
        const deuda = saldado ? 0 : Math.max(0, Math.round((Number(remoto.deudaPendiente ?? remoto.deuda ?? localPrev?.deudaPendiente) || 0) * 100) / 100);
        const entregado = saldado ? total : Math.max(0, Math.round((Number(remoto.montoEntregado ?? remoto.montoPagado ?? localPrev?.montoEntregado ?? (total - deuda)) || 0) * 100) / 100);
        const costoEnvio = Math.max(0, Math.round((Number(remoto.costoEnvio ?? localPrev?.costoEnvio) || 0) * 100) / 100);
        const costoMercaderia = remoto.costoMercaderia !== undefined
            ? Math.max(0, Math.round((Number(remoto.costoMercaderia) || 0) * 100) / 100)
            : (localPrev?.costoMercaderia ?? Math.max(0, Math.round((total - costoEnvio) * 100) / 100));

        const pagos = (Array.isArray(localPrev?.pagos) && localPrev.pagos.length > 0)
            ? localPrev.pagos
            : (Array.isArray(remoto.pagos) && remoto.pagos.length > 0
                ? remoto.pagos
                : (entregado > 0 ? [{ id: `init-${docId}`, fecha: remoto.fecha || new Date().toISOString(), monto: entregado, medio: remoto.metodoPago || remoto.medioPago || 'Efectivo', nota: 'Pago inicial (App)' }] : []));

        return {
            ...(localPrev || {}),
            ...remoto,
            id: String(docId),
            codigoOrden: remoto.codigoOrden || localPrev?.codigoOrden || `APP-${String(docId).slice(-4)}`,
            proveedorNombre: String(remoto.proveedorNombre || localPrev?.proveedorNombre || 'Proveedor').trim(),
            fecha: remoto.fecha || localPrev?.fecha || new Date().toISOString(),
            costoMercaderia,
            costoEnvio,
            totalGeneral: total,
            montoEntregado: entregado,
            deudaPendiente: deuda,
            estado: saldado ? 'pagado' : 'pendiente',
            medioPago: remoto.medioPago || remoto.metodoPago || localPrev?.medioPago || 'Efectivo',
            pagos,
            origen: remoto.origen || localPrev?.origen || (remoto.updatedBy === 'app_android' ? 'app' : 'pc')
        };
    }

    function construirPayloadTurnoCompat(turno) {
        const esAbierto = turno.estado === 'abierto' || turno.estado === 'abierta';
        const operador = String(turno.operador || turno.cajeroNombre || 'Cajero').trim() || 'Cajero';
        const fondoInicial = Math.max(0, Math.round((Number(turno.fondoInicial) || 0) * 100) / 100);

        return sanitizarParaFirestore({
            ...turno,
            id: String(turno.id),
            operador,
            cajeroNombre: operador,
            fondoInicial,
            estado: esAbierto ? 'abierto' : 'cerrado',
            estadoApp: esAbierto ? 'abierta' : 'cerrada',
            abierto: esAbierto,
            apertura: turno.fechaApertura || new Date().toISOString(),
            fechaApertura: turno.fechaApertura || new Date().toISOString(),
            fechaCierre: esAbierto ? null : (turno.fechaCierre || new Date().toISOString()),
            dispositivoApertura: turno.dispositivoApertura || 'web_pc',
            dispositivoCierre: esAbierto ? null : (turno.dispositivoCierre || 'web_pc'),
            _deleted: false,
            updatedAtMs: Date.now(),
            updatedBy: 'web_pc',
            deviceId: getPcDeviceId()
        });
    }

    function normalizarTurnoRemotoAPc(docId, remoto, localPrev = null, cantActual = 0) {
        const remotoAbierto = remoto.abierto !== undefined
            ? !!remoto.abierto
            : (remoto.estado === 'abierto' || remoto.estado === 'abierta' || remoto.estadoApp === 'abierta');

        const localCerrado = localPrev && (localPrev.estado === 'cerrado' || localPrev.estado === 'cerrada');
        const esAbierto = (localCerrado && remotoAbierto) ? false : remotoAbierto;

        const operador = String(remoto.operador || remoto.cajeroNombre || localPrev?.operador || 'Cajero').trim() || 'Cajero';
        const numero = Number(remoto.numero ?? localPrev?.numero) || (101 + cantActual);
        const nombre = String(
            remoto.nombre || localPrev?.nombre || (remoto.updatedBy === 'app_android' ? 'Caja Móvil • App' : 'Caja #01 • Turno')
        ).trim();

        return {
            ...(localPrev || {}),
            ...remoto,
            id: String(docId),
            numero,
            nombre,
            operador,
            cajeroNombre: operador,
            fondoInicial: Math.max(0, Math.round((Number(remoto.fondoInicial ?? localPrev?.fondoInicial) || 0) * 100) / 100),
            fechaApertura: remoto.fechaApertura || remoto.apertura || localPrev?.fechaApertura || new Date().toISOString(),
            fechaCierre: esAbierto ? null : (remoto.fechaCierre || localPrev?.fechaCierre || new Date().toISOString()),
            estado: esAbierto ? 'abierto' : 'cerrado',
            abierto: esAbierto,
            retiros: Array.isArray(remoto.retiros) ? remoto.retiros : (Array.isArray(localPrev?.retiros) ? localPrev.retiros : []),
            arqueos: Array.isArray(remoto.arqueos) ? remoto.arqueos : (Array.isArray(localPrev?.arqueos) ? localPrev.arqueos : []),
            ultimoArqueo: remoto.ultimoArqueo || localPrev?.ultimoArqueo || null,
            arqueoFinal: esAbierto ? null : (remoto.arqueoFinal || remoto.ultimoArqueo || localPrev?.arqueoFinal || null),
            resumenCierre: remoto.resumenCierre || localPrev?.resumenCierre || null,
            notasCierre: String(remoto.notasCierre ?? localPrev?.notasCierre ?? '').trim(),
            dispositivoApertura: remoto.dispositivoApertura || localPrev?.dispositivoApertura || (remoto.updatedBy === 'app_android' ? 'app_android' : 'web_pc'),
            dispositivoCierre: esAbierto ? null : (remoto.dispositivoCierre || localPrev?.dispositivoCierre || null)
        };
    }

    async function publicarPunteroEstadoCajaMaestra() {
        if (!puedeSincronizarAhora()) return;
        const turnos = leerJson('cat_alogo_pos_turnos_v1', []);
        const abierto = Array.isArray(turnos)
            ? turnos.find(t => t && (t.estado === 'abierto' || t.estado === 'abierta' || t.abierto === true))
            : null;
        try {
            await state.db.collection('users').doc(state.uid).collection('config').doc('estado_caja').set({
                turnoActivoId: abierto ? String(abierto.id) : null,
                estado: abierto ? 'abierto' : 'cerrado',
                operador: abierto ? (abierto.operador || abierto.cajeroNombre || 'Cajero') : null,
                fondoInicial: abierto ? (Number(abierto.fondoInicial) || 0) : 0,
                fechaApertura: abierto ? (abierto.fechaApertura || null) : null,
                updatedAtMs: Date.now(),
                updatedBy: 'web_pc',
                deviceId: getPcDeviceId()
            }, { merge: true });
        } catch (err) {
            console.warn('No se pudo actualizar puntero config/estado_caja:', err);
        }
    }

    /* --- 4. PROCESADOR DE COLA HACIA FIRESTORE --- */
    function puedeSincronizarAhora() {
        if (!state.db || !state.uid) return false;
        if (!navigator.onLine) return false;
        if (window.CatAlogoAuth && !window.CatAlogoAuth.estaSuscripcionActiva()) return false;
        return true;
    }

    let timerColaSync = null;

    function programarProcesarCola(delayMs = 150) {
        if (timerColaSync) clearTimeout(timerColaSync);
        timerColaSync = setTimeout(() => {
            timerColaSync = null;
            procesarColaPendiente();
        }, delayMs);
    }

    async function procesarColaPendiente() {
        if (!puedeSincronizarAhora()) return;
        if (state.procesandoCola) {
            state.reprocesarCola = true;
            return;
        }

        const lote = obtenerColaOffline();
        if (lote.length === 0) return;

        state.procesandoCola = true;
        state.reprocesarCola = false;
        state.ultimoError = '';
        guardarColaOffline([]);

        const fallidas = [];
        const userDoc = state.db.collection('users').doc(state.uid);
        const FieldValue = firebase.firestore.FieldValue;
        const myDeviceId = getPcDeviceId();
        let huboCambioTurno = false;

        for (let i = 0; i < lote.length; i++) {
            const op = lote[i];
            try {
                const docRef = userDoc.collection(op.subcol).doc(String(op.docId));

                if (op.tipo === 'atomic') {
                    await docRef.set({
                        [op.field]: FieldValue.increment(op.delta),
                        updatedAtMs: Date.now(),
                        updatedBy: 'web_pc',
                        deviceId: myDeviceId
                    }, { merge: true });
                } else if (op.tipo === 'delete') {
                    await docRef.set({
                        _deleted: true,
                        deletedAtMs: Date.now(),
                        updatedAtMs: Date.now(),
                        updatedBy: 'web_pc',
                        deviceId: myDeviceId
                    }, { merge: true });
                } else {
                    let data = op.data || {};
                    if (op.subcol === 'inventario') {
                        data = await subirImagenesBase64SiAplica(op.subcol, op.docId, data);
                        data = construirPayloadProductoCompat(data);
                    } else if (op.subcol === 'clientes') {
                        const cobrosDocs = construirPayloadsCobrosClienteCompat(data);
                        data = construirPayloadClienteCompat(data);
                        for (const cob of cobrosDocs) {
                            await userDoc.collection('finanzas_gastos').doc(cob.docId).set(cob.data, { merge: true });
                        }
                    } else if (op.subcol === 'proveedores') {
                        data = construirPayloadProveedorCompat(data);
                    } else if (op.subcol === 'pedidos_proveedores') {
                        data = construirPayloadPedidoCompat(data);
                    } else if (op.subcol === 'turnos_caja') {
                        data = construirPayloadTurnoCompat(data);
                        huboCambioTurno = true;
                    } else if (op.subcol === 'finanzas_ventas') {
                        data = construirPayloadVentaCompat(data);
                    } else if (op.subcol === 'finanzas_gastos') {
                        data = construirPayloadMovFinCompat(data);
                    } else if (op.subcol === 'cuentas_pagar') {
                        const adelantosDocs = construirPayloadsAdelantosCxpCompat(data);
                        data = construirPayloadCxpCompat(data);
                        for (const ad of adelantosDocs) {
                            await userDoc.collection('cuentas_pagar').doc(ad.docId).set(ad.data, { merge: true });
                        }
                    } else {
                        data = sanitizarParaFirestore({
                            ...data,
                            updatedAtMs: Date.now(),
                            updatedBy: 'web_pc',
                            deviceId: myDeviceId
                        });
                    }
                    await docRef.set(data, { merge: true });
                }
            } catch (err) {
                console.warn('Error sincronizando operación en Firestore, quedará en cola:', op, err);
                state.ultimoError = err?.message || 'Error de red/permisos';
                fallidas.push(op);
            }
        }

        if (huboCambioTurno && fallidas.length === 0) {
            await publicarPunteroEstadoCajaMaestra();
        }

        const nuevasEntrantes = obtenerColaOffline();
        guardarColaOffline([...fallidas, ...nuevasEntrantes]);

        if (fallidas.length === 0) {
            state.ultimaSync = new Date().toISOString();
            guardarConfigSync({ ultimaSync: state.ultimaSync });
        }

        state.procesandoCola = false;
        actualizarTarjetaSyncEnAjustes();

        if ((nuevasEntrantes.length > 0 || state.reprocesarCola) && fallidas.length === 0) {
            state.reprocesarCola = false;
            programarProcesarCola(80);
        }
    }

    /* --- 5. DETECCIÓN DE DIFFS LOCALES (ENCOLA INCLUSO ANTES DE TERMINAR AUTH) --- */
    function indexarArrayPorId(arr, idField = 'id') {
        const map = new Map();
        if (!Array.isArray(arr)) return map;
        arr.forEach((item, idx) => {
            if (!item || typeof item !== 'object') return;
            const id = String(item[idField] || item.numeroTicket || `idx-${idx}`);
            map.set(id, item);
        });
        return map;
    }

    function inicializarSnapshotsLocales() {
        Object.entries(COLECCIONES_ARRAY).forEach(([k, meta]) => {
            const arr = leerJson(k, []);
            state.snapshotsPrevios.set(k, indexarArrayPorId(arr, meta.idField));
        });
    }

    function detectarCambioSoloPdfLocal(prev, next) {
        if (!prev || !next) return false;
        const soloLocales = new Set(['incluirPdf', 'visiblePdf', 'enCatalogo', 'actualizadoEn', 'updatedAtMs', '_forzarActualizacion']);
        const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
        for (const k of keys) {
            if (soloLocales.has(k)) continue;
            if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) return false;
        }
        return true;
    }

    function detectarCambioSoloCampoAtomico(prev, next, atomicField) {
        if (!prev || !next || !atomicField) return null;
        const valPrev = Number(prev[atomicField]);
        const valNext = Number(next[atomicField]);
        if (isNaN(valPrev) || isNaN(valNext) || valPrev === valNext) return null;

        const ignorar = new Set([atomicField, 'actualizadoEn', 'updatedAtMs', '_forzarActualizacion', 'movimientos', 'incluirPdf', 'visiblePdf', 'enCatalogo']);
        const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
        for (const k of keys) {
            if (ignorar.has(k)) continue;
            if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) return null;
        }
        return Math.round((valNext - valPrev) * 1000) / 1000;
    }

    function procesarEscrituraLocal(key, rawValue) {
        if (state.aplicandoDesdeNube) return;
        if (!obtenerConfigSync().autoSync) return;

        if (COLECCIONES_ARRAY[key]) {
            const meta = COLECCIONES_ARRAY[key];
            let nuevoArr = [];
            try { nuevoArr = JSON.parse(rawValue); } catch { return; }
            if (!Array.isArray(nuevoArr)) return;

            const prevMap = state.snapshotsPrevios.get(key) || new Map();
            const nextMap = indexarArrayPorId(nuevoArr, meta.idField);

            nextMap.forEach((item, id) => {
                const prev = prevMap.get(id);
                if (!prev) {
                    encolarOperacion({ tipo: 'upsert', subcol: meta.subcol, docId: id, data: item });
                    return;
                }
                if (JSON.stringify(prev) === JSON.stringify(item)) return;

                // Si en Inventario solo cambió la visibilidad de Catálogo PDF, NO sincronizar con la nube
                if (key === 'cat_alogo_productos_v1' && detectarCambioSoloPdfLocal(prev, item)) return;

                const deltaAtomico = detectarCambioSoloCampoAtomico(prev, item, meta.atomicField);
                if (deltaAtomico !== null && deltaAtomico !== 0) {
                    encolarOperacion({
                        tipo: 'atomic',
                        subcol: meta.subcol,
                        docId: id,
                        field: meta.atomicField,
                        delta: deltaAtomico
                    });
                } else {
                    encolarOperacion({ tipo: 'upsert', subcol: meta.subcol, docId: id, data: item });
                }
            });

            prevMap.forEach((_, id) => {
                if (!nextMap.has(id)) {
                    encolarOperacion({ tipo: 'delete', subcol: meta.subcol, docId: id });
                }
            });

            state.snapshotsPrevios.set(key, nextMap);
            if (state.uid) programarProcesarCola(150);
            return;
        }

        if (DOCUMENTOS_CONFIG[key]) {
            const meta = DOCUMENTOS_CONFIG[key];
            let parsed = null;
            try { parsed = JSON.parse(rawValue); } catch { return; }
            encolarOperacion({
                tipo: 'upsert',
                subcol: 'config',
                docId: meta.docId,
                data: Array.isArray(parsed) ? { items: parsed } : parsed
            });
            if (state.uid) programarProcesarCola(150);
        }
    }

    const _origSetItemSync = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
        const res = _origSetItemSync.call(this, key, value);
        if (this === window.localStorage && typeof key === 'string' && (COLECCIONES_ARRAY[key] || DOCUMENTOS_CONFIG[key])) {
            procesarEscrituraLocal(key, String(value));
        }
        return res;
    };

    /* --- 6. ESCUCHA EN TIEMPO REAL (FIRESTORE -> BÓVEDA LOCAL) --- */
    function registrarCobroDeudaDesdeNubeEnClientes(docId, remoto) {
        const clientes = leerJson('cat_alogo_clientes_v1', []);
        if (!Array.isArray(clientes) || clientes.length === 0) return;

        const cliId = String(remoto.clienteId || '');
        const cliNombre = String(remoto.clienteNombre || '').trim().toLowerCase();
        const conceptoStr = String(remoto.concepto || '').toLowerCase();

        let cli = clientes.find(c => cliId && String(c.id) === cliId);
        if (!cli && cliNombre) {
            cli = clientes.find(c => String(c.nombre || '').trim().toLowerCase() === cliNombre);
        }
        if (!cli && conceptoStr) {
            cli = clientes.find(c => c.nombre && conceptoStr.includes(String(c.nombre).trim().toLowerCase()));
        }
        if (!cli) return;

        if (!Array.isArray(cli.movimientos)) cli.movimientos = [];
        const movId = `cobro_${docId}`;

        if (remoto._deleted) {
            const filtrados = cli.movimientos.filter(m =>
                String(m.id) !== movId &&
                String(m.id) !== String(docId) &&
                !(String(docId).startsWith('cobro_pc_') && String(docId).endsWith(`_${m.id}`))
            );
            if (filtrados.length !== cli.movimientos.length) {
                cli.movimientos = filtrados;
                escribirLocalSilencioso('cat_alogo_clientes_v1', clientes, 'id');
                if (document.getElementById('finanzas-module-root') && typeof window.renderizarTodoFinanzas === 'function') {
                    window.renderizarTodoFinanzas();
                }
            }
            return;
        }

        const monto = Math.max(0, Math.round((Number(remoto.monto ?? remoto.montoPagado ?? remoto.montoTotal) || 0) * 100) / 100);
        if (monto <= 0) return;

        const medio = String(remoto.metodoPago || remoto.medio || 'Efectivo').trim();
        const fecha = remoto.fecha || new Date().toISOString();
        const tsNuevo = new Date(fecha).getTime() || Date.now();

        const idxExist = cli.movimientos.findIndex(m =>
            String(m.id) === movId ||
            String(m.id) === String(docId) ||
            (String(docId).startsWith('cobro_pc_') && String(docId).endsWith(`_${m.id}`))
        );
        if (idxExist >= 0) {
            cli.movimientos[idxExist] = { ...cli.movimientos[idxExist], monto, medio, fecha, concepto: `Abono ${medio}` };
        } else {
            cli.movimientos = cli.movimientos.filter(m => {
                if (!String(m.id || '').startsWith('mov-app-')) return true;
                const mismoMonto = Math.abs((Number(m.monto) || 0) - monto) < 0.05;
                const cerca = Math.abs((new Date(m.fecha || 0).getTime() || 0) - tsNuevo) < 600000;
                return !(mismoMonto && cerca);
            });

            cli.movimientos.unshift({
                id: movId,
                fecha,
                tipo: 'credito',
                concepto: `Abono ${medio}`,
                monto,
                medio
            });
        }

        escribirLocalSilencioso('cat_alogo_clientes_v1', clientes, 'id');
        if (document.getElementById('finanzas-module-root') && typeof window.renderizarTodoFinanzas === 'function') {
            window.renderizarTodoFinanzas();
        }
    }

    function fusionarDocRemotoEnLocal(storageKey, meta, docId, remoto, ignorarEcoPropio = true) {
        if (!remoto || typeof remoto !== 'object') return;
        if (ignorarEcoPropio && remoto.deviceId && remoto.deviceId === getPcDeviceId()) return;

        const tApp = String(remoto.tipoApp || remoto.tipo || '').toLowerCase();
        if (
            (storageKey === 'cat_alogo_fin_movimientos_v1' || storageKey === 'cat_alogo_pos_ventas_v1') &&
            (remoto.esCobroDeuda === true || tApp === 'ingreso_cobro_deuda')
        ) {
            registrarCobroDeudaDesdeNubeEnClientes(docId, remoto);
            return;
        }

        if (storageKey === 'cat_alogo_fin_movimientos_v1') {
            if (
                tApp === 'pago_proveedor' ||
                tApp === 'pago_deuda_proveedor' ||
                tApp === 'liquidacion_recepcion' ||
                tApp === 'cierre_caja' ||
                tApp === 'apertura_caja'
            ) {
                return;
            }
        }

        const arr = leerJson(storageKey, []);

        if (storageKey === 'cat_alogo_cuentas_pagar_v1' && (remoto.tipo === 'pago_deuda_proveedor' || remoto.esPagoDeudaProveedor)) {
            const refId = String(remoto.transaccionReferencia || '');
            const cxpOrig = refId ? arr.find(x => String(x?.id || '') === refId) : null;
            if (cxpOrig) {
                if (!Array.isArray(cxpOrig.pagos)) cxpOrig.pagos = [];
                const yaRegistrado = cxpOrig.pagos.some(p => String(p.id || '') === String(docId));
                if (!yaRegistrado) {
                    const montoPago = Math.max(0, Math.round((Number(remoto.montoPagado ?? remoto.montoTotal ?? remoto.monto) || 0) * 100) / 100);
                    cxpOrig.pagos.push({
                        id: String(docId),
                        fecha: remoto.fecha || new Date().toISOString(),
                        monto: montoPago,
                        medio: remoto.medio || remoto.metodoPago || 'Efectivo',
                        nota: remoto.nota || 'Cancelación de deuda desde App Móvil'
                    });
                    cxpOrig.montoEntregado = Math.round(((Number(cxpOrig.montoEntregado) || 0) + montoPago) * 100) / 100;
                    cxpOrig.deudaPendiente = Math.max(0, Math.round(((Number(cxpOrig.totalGeneral) || 0) - cxpOrig.montoEntregado) * 100) / 100);
                    cxpOrig.estado = cxpOrig.deudaPendiente <= 0 ? 'pagado' : 'pendiente';
                    escribirLocalSilencioso(storageKey, arr, meta.idField);
                    vincularCxpConPedidoLocalSiAplica(cxpOrig);
                }
            }
            return;
        }

        let idx = arr.findIndex(x => String(x?.[meta.idField] || '') === String(docId));

        if (idx < 0 && storageKey === 'cat_alogo_proveedores_v1' && remoto.nombre) {
            const claveRem = normalizarNombreProvClave(remoto.nombre);
            if (claveRem) {
                idx = arr.findIndex(x => x && normalizarNombreProvClave(x.nombre) === claveRem);
            }
        }

        const esPedidoCancelado = storageKey === 'cat_alogo_pedidos_v1' &&
            String(remoto.estado || remoto.estadoPc || '').toLowerCase().includes('cancel');

        if (remoto._deleted || esPedidoCancelado) {
            if (idx >= 0) {
                arr.splice(idx, 1);
                escribirLocalSilencioso(storageKey, arr, meta.idField);
            }
            return;
        }

        const localPrev = idx >= 0 ? arr[idx] : null;
        const normalizado = storageKey === 'cat_alogo_productos_v1'
            ? normalizarProductoRemotoAPc(docId, remoto, localPrev)
            : (storageKey === 'cat_alogo_clientes_v1'
                ? normalizarClienteRemotoAPc(docId, remoto, localPrev)
                : (storageKey === 'cat_alogo_proveedores_v1'
                    ? normalizarProveedorRemotoAPc(docId, remoto, localPrev)
                    : (storageKey === 'cat_alogo_pedidos_v1'
                        ? normalizarPedidoRemotoAPc(docId, remoto, localPrev)
                        : (storageKey === 'cat_alogo_pos_turnos_v1'
                            ? normalizarTurnoRemotoAPc(docId, remoto, localPrev, arr.length)
                            : (storageKey === 'cat_alogo_pos_ventas_v1'
                                ? normalizarVentaRemotaAPc(docId, remoto)
                                : (storageKey === 'cat_alogo_fin_movimientos_v1'
                                    ? normalizarMovFinRemotoAPc(docId, remoto)
                                    : (storageKey === 'cat_alogo_cuentas_pagar_v1'
                                        ? normalizarCxpRemotoAPc(docId, remoto, localPrev)
                                        : { ...remoto, id: String(docId) })))))));

        if (idx >= 0) {
            const local = arr[idx];
            const tsLocal = Number(local.updatedAtMs || Date.parse(local.actualizadoEn) || 0);
            const tsRemoto = Number(remoto.updatedAtMs || 0);
            if (ignorarEcoPropio && tsRemoto > 0 && tsLocal > tsRemoto && remoto.updatedBy === 'web_pc') return;

            if (storageKey === 'cat_alogo_productos_v1') {
                const imgsRemotas = (Array.isArray(normalizado.imagenes) && normalizado.imagenes.length > 0)
                    ? normalizado.imagenes
                    : (normalizado.imagen_url ? [normalizado.imagen_url] : []);

                // Si el remoto trae explícitamente variantesDetalle (aunque sea vacío por quitar variantes), respetarlo
                const tieneCampoVarRemoto = Array.isArray(remoto.variantesDetalle);
                const variantesFinal = tieneCampoVarRemoto
                    ? normalizado.variantesDetalle
                    : (Array.isArray(normalizado.variantesDetalle) && normalizado.variantesDetalle.length > 0
                        ? normalizado.variantesDetalle
                        : (local.variantesDetalle || []));

                arr[idx] = {
                    ...local,
                    ...normalizado,
                    id: String(docId),
                    variantesDetalle: variantesFinal,
                    variantes: variantesFinal.map(v => v.nombre),
                    imagenes: imgsRemotas.length > 0 ? imgsRemotas : (local.imagenes || []),
                    imagen_url: imgsRemotas[0] || local.imagen_url || ''
                };
            } else {
                arr[idx] = {
                    ...local,
                    ...normalizado,
                    id: String(docId)
                };
            }
        } else {
            arr.unshift({ ...normalizado, id: String(docId) });
        }

        escribirLocalSilencioso(storageKey, arr, meta.idField);

        if (storageKey === 'cat_alogo_cuentas_pagar_v1') {
            vincularCxpConPedidoLocalSiAplica(normalizado);
        }
    }

    function escribirLocalSilencioso(storageKey, dataObj, idField = 'id') {
        state.aplicandoDesdeNube = true;
        try {
            localStorage.setItem(storageKey, JSON.stringify(dataObj));
            if (Array.isArray(dataObj)) {
                state.snapshotsPrevios.set(storageKey, indexarArrayPorId(dataObj, idField));
            }
            if (storageKey === 'cat_alogo_productos_v1') {
                window.bovedaProductos = dataObj;
                if (typeof window.renderizarProductosCreados === 'function') window.renderizarProductosCreados();
                if (document.getElementById('stock-module-root') && typeof window.renderizarTodoControlStock === 'function') {
                    window.renderizarTodoControlStock();
                }
                if (document.getElementById('catweb-module-root') && typeof window.renderizarTodoCatWeb === 'function') {
                    window.renderizarTodoCatWeb();
                }
            } else if (storageKey === 'cat_alogo_categorias_v1') {
                if (typeof window.cargarBovedaCategorias === 'function') window.cargarBovedaCategorias();
            } else if (storageKey === 'cat_alogo_clientes_v1') {
                window.bovedaClientes = dataObj;
                if (document.getElementById('clientes-module-root') && typeof window.renderizarTodoClientes === 'function') {
                    window.renderizarTodoClientes();
                }
                if (document.getElementById('pos-module-root') && typeof window.renderizarClienteAsignadoPos === 'function') {
                    window.renderizarClienteAsignadoPos();
                }
            } else if (storageKey === 'cat_alogo_proveedores_v1') {
                window.bovedaProveedores = dataObj;
                if (typeof window.sincronizarSelectProveedoresInventario === 'function') {
                    window.sincronizarSelectProveedoresInventario();
                }
                if (document.getElementById('stock-module-root') && typeof window.renderizarTodoControlStock === 'function') {
                    window.renderizarTodoControlStock();
                }
            } else if (storageKey === 'cat_alogo_pedidos_v1') {
                if (typeof window.actualizarBadgeTransitoStock === 'function') {
                    window.actualizarBadgeTransitoStock();
                }
                const modalRec = document.getElementById('modal-recepcion-transito');
                if (modalRec && modalRec.classList.contains('active') && typeof window.renderizarBandejaRecepcion === 'function') {
                    window.renderizarBandejaRecepcion();
                }
            } else if (storageKey === 'cat_alogo_pos_turnos_v1') {
                if (document.getElementById('pos-module-root')) {
                    if (typeof window.renderizarEstadoCajaPos === 'function') window.renderizarEstadoCajaPos();
                    if (typeof window.actualizarCobroMixtoPos === 'function') window.actualizarCobroMixtoPos(false);
                    if (Array.isArray(dataObj) && dataObj.some(t => t.estado === 'abierto') && typeof window.cerrarModalAperturaTurnoPos === 'function') {
                        window.cerrarModalAperturaTurnoPos();
                    }
                }
                if (document.getElementById('finanzas-module-root')) {
                    if (typeof window.renderizarSelectorTurnosFinanzas === 'function') window.renderizarSelectorTurnosFinanzas();
                    if (typeof window.renderizarTodoFinanzas === 'function') window.renderizarTodoFinanzas();
                }
                if (document.getElementById('inicio-module-root') && typeof window.renderizarTodoInicio === 'function') {
                    window.renderizarTodoInicio();
                }
            } else if (storageKey === 'cat_alogo_pos_ventas_v1' || storageKey === 'cat_alogo_fin_movimientos_v1' || storageKey === 'cat_alogo_cuentas_pagar_v1') {
                if (document.getElementById('finanzas-module-root') && typeof window.renderizarTodoFinanzas === 'function') {
                    window.renderizarTodoFinanzas();
                }
                if (document.getElementById('inicio-module-root') && typeof window.renderizarTodoInicio === 'function') {
                    window.renderizarTodoInicio();
                }
                if (storageKey === 'cat_alogo_cuentas_pagar_v1' && document.getElementById('clientes-module-root') && typeof window.renderizarTodoClientes === 'function') {
                    window.renderizarTodoClientes();
                }
            }
        } finally {
            state.aplicandoDesdeNube = false;
        }
    }

    function detenerListenersRemotos() {
        state.unsubs.forEach(u => { try { u(); } catch { /* ignore */ } });
        state.unsubs = [];
        state.conectado = false;
    }

    function iniciarListenersRemotos() {
        detenerListenersRemotos();
        if (!puedeSincronizarAhora() || !obtenerConfigSync().autoSync) return;

        const userDoc = state.db.collection('users').doc(state.uid);

        Object.entries(COLECCIONES_ARRAY).forEach(([storageKey, meta]) => {
            const unsub = userDoc.collection(meta.subcol).onSnapshot((snap) => {
                let huboCambios = false;
                snap.docChanges().forEach((change) => {
                    if (change.doc.metadata.hasPendingWrites) return;
                    const data = change.doc.data();
                    if (!data) return;
                    if (data.deviceId && data.deviceId === getPcDeviceId()) return;
                    fusionarDocRemotoEnLocal(storageKey, meta, change.doc.id, data, true);
                    huboCambios = true;
                });
                if (huboCambios) {
                    state.ultimaSync = new Date().toISOString();
                    guardarConfigSync({ ultimaSync: state.ultimaSync });
                    actualizarTarjetaSyncEnAjustes();
                }
            }, (err) => {
                console.warn(`Error en listener de ${meta.subcol}:`, err);
                state.ultimoError = `${meta.subcol}: ${err?.message || 'Error listener'}`;
                actualizarTarjetaSyncEnAjustes();
            });
            state.unsubs.push(unsub);
        });

        state.conectado = true;
        actualizarTarjetaSyncEnAjustes();
    }

    /* --- 7. FORZAR SINCRONIZACIÓN BIDIRECCIONAL RÁPIDA (PUSH RECIENTE + PULL COMPLETO) --- */
    async function forzarSincronizacionBidireccional(silencioso = false) {
        if (state.forzandoSync) return;
        conectarConAuthActual();

        if (!puedeSincronizarAhora()) {
            if (!silencioso) {
                const motivo = !navigator.onLine
                    ? 'Sin conexión a internet.'
                    : (!state.uid ? 'No hay sesión de Firebase activa.' : 'Tu suscripción no figura activa.');
                alert(`⚠️ No se puede sincronizar ahora: ${motivo}`);
            }
            return;
        }

        state.forzandoSync = true;
        state.ultimoError = '';
        const btn = document.getElementById('btn-sync-forzar-ahora');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Sincronizando…'; }

        try {
            await procesarColaPendiente();

            const userDoc = state.db.collection('users').doc(state.uid);
            const hace7Dias = Date.now() - (7 * 86400000);
            let subidos = 0;
            let recibidos = 0;

            const keysPush = [
                { key: 'cat_alogo_clientes_v1', subcol: 'clientes', build: construirPayloadClienteCompat, siempre: true },
                { key: 'cat_alogo_proveedores_v1', subcol: 'proveedores', build: construirPayloadProveedorCompat, siempre: true, omitirDemo: true },
                { key: 'cat_alogo_pedidos_v1', subcol: 'pedidos_proveedores', build: construirPayloadPedidoCompat, siempre: true },
                { key: 'cat_alogo_pos_turnos_v1', subcol: 'turnos_caja', build: construirPayloadTurnoCompat, siempre: true },
                { key: 'cat_alogo_pos_ventas_v1', subcol: 'finanzas_ventas', build: construirPayloadVentaCompat, siempre: false },
                { key: 'cat_alogo_fin_movimientos_v1', subcol: 'finanzas_gastos', build: construirPayloadMovFinCompat, siempre: false },
                { key: 'cat_alogo_cuentas_pagar_v1', subcol: 'cuentas_pagar', build: construirPayloadCxpCompat, siempre: false }
            ];

            for (const cfg of keysPush) {
                const items = leerJson(cfg.key, []);
                const filtrar = items.filter((it, idx) => {
                    if (!it?.id) return false;
                    if (cfg.omitirDemo && esProveedorDemoSinUso(it)) return false;
                    if (cfg.siempre) return idx < 30 || it.estado === 'abierto' || it.abierto === true || it.estado === 'en_espera';
                    const ts = new Date(it.fecha || it.fechaApertura || it.fechaCreacion || 0).getTime() || 0;
                    return ts >= hace7Dias || idx < 15;
                });

                if (filtrar.length === 0) continue;
                const batch = state.db.batch();
                filtrar.forEach((it) => {
                    const ref = userDoc.collection(cfg.subcol).doc(String(it.id));
                    batch.set(ref, cfg.build(it), { merge: true });
                    subidos++;
                    if (cfg.subcol === 'cuentas_pagar') {
                        construirPayloadsAdelantosCxpCompat(it).forEach((ad) => {
                            const adRef = userDoc.collection('cuentas_pagar').doc(ad.docId);
                            batch.set(adRef, ad.data, { merge: true });
                            subidos++;
                        });
                    }
                    if (cfg.subcol === 'clientes') {
                        construirPayloadsCobrosClienteCompat(it).forEach((cob) => {
                            const cobRef = userDoc.collection('finanzas_gastos').doc(cob.docId);
                            batch.set(cobRef, cob.data, { merge: true });
                            subidos++;
                        });
                    }
                });
                await batch.commit();
            }

            await publicarPunteroEstadoCajaMaestra();

            const colsPull = [
                'cat_alogo_clientes_v1',
                'cat_alogo_proveedores_v1',
                'cat_alogo_cuentas_pagar_v1',
                'cat_alogo_pedidos_v1',
                'cat_alogo_pos_turnos_v1',
                'cat_alogo_pos_ventas_v1',
                'cat_alogo_fin_movimientos_v1'
            ];

            for (const storageKey of colsPull) {
                const meta = COLECCIONES_ARRAY[storageKey];
                const snap = await userDoc.collection(meta.subcol).get();
                snap.forEach((doc) => {
                    fusionarDocRemotoEnLocal(storageKey, meta, doc.id, doc.data(), true);
                    recibidos++;
                });
            }

            if (!state.conectado && obtenerConfigSync().autoSync) {
                iniciarListenersRemotos();
            }

            state.ultimaSync = new Date().toISOString();
            guardarConfigSync({ ultimaSync: state.ultimaSync });
            actualizarTarjetaSyncEnAjustes();

            if (!silencioso) {
                alert(`✅ ¡Sincronización forzada completada!\n• Enviados a la nube: ${subidos} registro(s) recientes\n• Verificados desde la nube: ${recibidos} documento(s)\n• UID: ${state.uid}`);
            }
        } catch (err) {
            console.error('Error en forzarSincronizacionBidireccional:', err);
            state.ultimoError = err?.message || 'Error al sincronizar';
            actualizarTarjetaSyncEnAjustes();
            if (!silencioso) {
                alert(`❌ Error al forzar sincronización: ${state.ultimoError}`);
            }
        } finally {
            state.forzandoSync = false;
            if (btn) { btn.disabled = false; btn.textContent = '🔄 Forzar Sincronización Ahora'; }
        }
    }

    /* --- 8. SUBIDA Y DESCARGA COMPLETA --- */
    async function subirBovedaCompletaANube() {
        if (!puedeSincronizarAhora()) {
            alert('☁️ Inicia sesión con tu cuenta de Firebase para subir tu bóveda.');
            return;
        }

        const ok = confirm(
            '⬆️ ¿Subir toda tu Bóveda Local (productos, clientes, proveedores, pedidos, turnos de caja, ventas, gastos, cuentas por pagar y configuraciones) a tu espacio privado en Firestore?\n\n' +
            'Se usa merge: true para no borrar ningún campo exclusivo de la App Móvil.'
        );
        if (!ok) return;

        const btn = document.getElementById('btn-sync-subir-todo');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Subiendo lotes a Firestore…'; }

        try {
            const userDoc = state.db.collection('users').doc(state.uid);
            const myDeviceId = getPcDeviceId();
            let totalDocs = 0;

            for (const [storageKey, meta] of Object.entries(COLECCIONES_ARRAY)) {
                const items = leerJson(storageKey, []);
                if (!Array.isArray(items) || items.length === 0) continue;

                const chunkSize = (meta.subcol === 'cuentas_pagar' || meta.subcol === 'clientes') ? 150 : 400;
                for (let i = 0; i < items.length; i += chunkSize) {
                    const chunk = items.slice(i, i + chunkSize);
                    const batch = state.db.batch();

                    for (const item of chunk) {
                        if (meta.subcol === 'proveedores' && esProveedorDemoSinUso(item)) continue;
                        const docId = String(item[meta.idField] || `doc-${Date.now()}-${totalDocs}`);
                        const ref = userDoc.collection(meta.subcol).doc(docId);
                        let payload = item;
                        if (meta.subcol === 'inventario') {
                            payload = await subirImagenesBase64SiAplica(meta.subcol, docId, item);
                            payload = construirPayloadProductoCompat(payload);
                        } else if (meta.subcol === 'clientes') {
                            construirPayloadsCobrosClienteCompat(item).forEach((cob) => {
                                const cobRef = userDoc.collection('finanzas_gastos').doc(cob.docId);
                                batch.set(cobRef, cob.data, { merge: true });
                                totalDocs++;
                            });
                            payload = construirPayloadClienteCompat(item);
                        } else if (meta.subcol === 'proveedores') {
                            payload = construirPayloadProveedorCompat(item);
                        } else if (meta.subcol === 'pedidos_proveedores') {
                            payload = construirPayloadPedidoCompat(item);
                        } else if (meta.subcol === 'turnos_caja') {
                            payload = construirPayloadTurnoCompat(item);
                        } else if (meta.subcol === 'finanzas_ventas') {
                            payload = construirPayloadVentaCompat(item);
                        } else if (meta.subcol === 'finanzas_gastos') {
                            payload = construirPayloadMovFinCompat(item);
                        } else if (meta.subcol === 'cuentas_pagar') {
                            construirPayloadsAdelantosCxpCompat(item).forEach((ad) => {
                                const adRef = userDoc.collection('cuentas_pagar').doc(ad.docId);
                                batch.set(adRef, ad.data, { merge: true });
                                totalDocs++;
                            });
                            payload = construirPayloadCxpCompat(item);
                        } else {
                            payload = sanitizarParaFirestore({
                                ...item,
                                updatedAtMs: Date.now(),
                                updatedBy: 'web_pc',
                                deviceId: myDeviceId
                            });
                        }
                        batch.set(ref, payload, { merge: true });
                        totalDocs++;
                    }
                    await batch.commit();
                }
            }

            const cfgBatch = state.db.batch();
            Object.entries(DOCUMENTOS_CONFIG).forEach(([storageKey, meta]) => {
                const val = leerJson(storageKey, null);
                if (!val) return;
                const ref = userDoc.collection('config').doc(meta.docId);
                const payload = Array.isArray(val) ? { items: val } : val;
                cfgBatch.set(ref, sanitizarParaFirestore({
                    ...payload,
                    updatedAtMs: Date.now(),
                    updatedBy: 'web_pc',
                    deviceId: myDeviceId
                }), { merge: true });
                totalDocs++;
            });
            await cfgBatch.commit();
            await publicarPunteroEstadoCajaMaestra();

            state.ultimaSync = new Date().toISOString();
            guardarConfigSync({ ultimaSync: state.ultimaSync });
            actualizarTarjetaSyncEnAjustes();
            alert(`✅ ¡Sincronización inicial completada! Se subieron ${totalDocs} documento(s) a users/${state.uid}.`);
        } catch (err) {
            console.error(err);
            state.ultimoError = err?.message || 'Error subiendo bóveda';
            actualizarTarjetaSyncEnAjustes();
            alert(`❌ Error al subir la bóveda: ${err.message}`);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '⬆️ Subir Bóveda'; }
        }
    }

    async function bajarBovedaDesdeNube() {
        if (!puedeSincronizarAhora()) {
            alert('☁️ Inicia sesión con Firebase para descargar tus datos desde la nube privada.');
            return;
        }

        const btn = document.getElementById('btn-sync-bajar-todo');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Descargando…'; }

        try {
            const userDoc = state.db.collection('users').doc(state.uid);
            let recibidos = 0;

            for (const [storageKey, meta] of Object.entries(COLECCIONES_ARRAY)) {
                const snap = await userDoc.collection(meta.subcol).get();
                snap.forEach((doc) => {
                    fusionarDocRemotoEnLocal(storageKey, meta, doc.id, doc.data(), false);
                    recibidos++;
                });
            }

            state.ultimaSync = new Date().toISOString();
            guardarConfigSync({ ultimaSync: state.ultimaSync });
            actualizarTarjetaSyncEnAjustes();
            alert(`✅ Descarga completada: se fusionaron ${recibidos} documento(s) en tu Bóveda IndexedDB.`);
        } catch (err) {
            console.error(err);
            state.ultimoError = err?.message || 'Error descargando bóveda';
            actualizarTarjetaSyncEnAjustes();
            alert(`❌ Error descargando desde Firestore: ${err.message}`);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '⬇️ Traer de la Nube'; }
        }
    }

    /* --- 9. PANEL DE CONTROL EN AJUSTES -> ☁️ NUBE & SINCRONIZACIÓN --- */
    function actualizarTarjetaSyncEnAjustes() {
        const anchor = document.getElementById('cfg-stage3-nube-anchor') || document.getElementById('cfg-panel-nube');
        if (!anchor) return;

        let card = document.getElementById('cfg-card-sync-privada');
        if (!card) {
            card = document.createElement('article');
            card.className = 'cfg-card';
            card.id = 'cfg-card-sync-privada';
            const col = anchor.querySelector('.cfg-col') || anchor;
            const cuentaCard = document.getElementById('cfg-card-cuenta-licencia');
            if (cuentaCard && cuentaCard.nextSibling) col.insertBefore(card, cuentaCard.nextSibling);
            else col.prepend(card);
        }

        const cfg = obtenerConfigSync();
        const cola = obtenerColaOffline();
        const ultimaTxt = (state.ultimaSync || cfg.ultimaSync)
            ? new Date(state.ultimaSync || cfg.ultimaSync).toLocaleString('es-AR')
            : 'Pendiente';

        const estadoBadge = state.conectado
            ? '<span class="cfg-badge-ok">● En Tiempo Real</span>'
            : (state.uid ? '<span class="cfg-badge-warn">● Pausado / Offline</span>' : '<span class="cfg-badge-soft">Modo Local</span>');

        const errHtml = state.ultimoError
            ? `<div style="margin-top:0.5rem; padding:0.5rem 0.7rem; border-radius:8px; background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; font-size:0.75rem; font-weight:600;">⚠️ Último aviso: ${state.ultimoError}</div>`
            : '';

        card.innerHTML = `
            <div class="cfg-card-head">
                <div>
                    <h3>🔄 Sincronización Privada App ↔ PC (Firestore)</h3>
                    <p>Espejo bidireccional en vivo de stock, clientes, finanzas, proveedores, pedidos y turnos (<code>users/${state.uid || 'sin-sesion'}</code>).</p>
                </div>
                ${estadoBadge}
            </div>

            <div class="cfg-toggle-item">
                <div>
                    <strong>Sincronización automática en segundo plano</strong>
                    <small>Cola offline pendiente: <strong>${cola.length}</strong> operación(es) • Última sync: ${ultimaTxt}</small>
                </div>
                <label class="cfg-toggle-pill">
                    <input type="checkbox" id="chk-sync-priv-auto" ${cfg.autoSync ? 'checked' : ''}>
                    <span class="cfg-toggle-slider"></span>
                </label>
            </div>

            ${errHtml}

            <div class="cfg-cloud-card-row">
                <div>
                    <strong>Sincronización manual e inmediata</strong>
                    <small style="display:block; color:#64748b; margin-top:2px;">
                        Si abriste/cerraste caja, cargaste ventas o hiciste pedidos a proveedores y tardan en reflejarse, presiona "Forzar Sincronización".
                    </small>
                </div>
                <div style="display:flex; gap:0.45rem; flex-wrap:wrap;">
                    <button type="button" class="cfg-btn cfg-btn-primary cfg-btn-sm" id="btn-sync-forzar-ahora">🔄 Forzar Sincronización Ahora</button>
                    <button type="button" class="cfg-btn cfg-btn-light cfg-btn-sm" id="btn-sync-subir-todo">⬆️ Subir Bóveda</button>
                    <button type="button" class="cfg-btn cfg-btn-light cfg-btn-sm" id="btn-sync-bajar-todo">⬇️ Traer de la Nube</button>
                </div>
            </div>
        `;

        card.querySelector('#chk-sync-priv-auto')?.addEventListener('change', (e) => {
            guardarConfigSync({ autoSync: e.target.checked });
            if (e.target.checked) {
                iniciarListenersRemotos();
                procesarColaPendiente();
            } else {
                detenerListenersRemotos();
            }
            actualizarTarjetaSyncEnAjustes();
        });
        card.querySelector('#btn-sync-forzar-ahora')?.addEventListener('click', () => forzarSincronizacionBidireccional(false));
        card.querySelector('#btn-sync-subir-todo')?.addEventListener('click', subirBovedaCompletaANube);
        card.querySelector('#btn-sync-bajar-todo')?.addEventListener('click', bajarBovedaDesdeNube);
    }

    /* --- 10. CONEXIÓN CON AUTH, INDEXEDDB, RED Y CAMBIO DE PESTAÑA --- */
    function conectarConAuthActual() {
        const authState = window.CatAlogoAuth?.getState?.();
        state.db = window.CatAlogoAuth?.getDb?.() || null;
        state.storage = window.CatAlogoAuth?.getStorage?.() || null;
        state.uid = authState?.uid || null;

        if (state.uid && state.db) {
            inicializarSnapshotsLocales();
            iniciarListenersRemotos();
            procesarColaPendiente();
        } else {
            detenerListenersRemotos();
        }
        actualizarTarjetaSyncEnAjustes();
    }

    window.addEventListener('cat-alogo:auth-cambiado', conectarConAuthActual);
    window.addEventListener('cat-alogo:suscripcion-actualizada', conectarConAuthActual);
    window.addEventListener('cat-alogo:boveda-idb-lista', inicializarSnapshotsLocales);
    window.addEventListener('online', () => {
        procesarColaPendiente();
        actualizarTarjetaSyncEnAjustes();
    });
    window.addEventListener('offline', actualizarTarjetaSyncEnAjustes);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && puedeSincronizarAhora()) {
            procesarColaPendiente();
            if (!state.conectado && obtenerConfigSync().autoSync) {
                iniciarListenersRemotos();
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (e.target.closest('.nav-link[data-vista="ajustes"]') || e.target.closest('[data-cfgtab="nube"]')) {
            setTimeout(actualizarTarjetaSyncEnAjustes, 120);
            setTimeout(actualizarTarjetaSyncEnAjustes, 450);
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        inicializarSnapshotsLocales();
        conectarConAuthActual();

        if (typeof window.renderizarEtapa3NubeCfg === 'function' && !window.renderizarEtapa3NubeCfg._conSyncPriv) {
            const _nubePrev = window.renderizarEtapa3NubeCfg;
            window.renderizarEtapa3NubeCfg = function (...args) {
                const res = _nubePrev.apply(this, args);
                actualizarTarjetaSyncEnAjustes();
                return res;
            };
            window.renderizarEtapa3NubeCfg._conSyncPriv = true;
        }
    });

    window.CatAlogoSync = {
        forzarSincronizacion: () => forzarSincronizacionBidireccional(false),
        subirBovedaCompleta: subirBovedaCompletaANube,
        bajarBovedaDesdeNube,
        procesarColaPendiente,
        ajustarStockAtomico: (prodId, delta) => {
            if (!delta) return;
            encolarOperacion({ tipo: 'atomic', subcol: 'inventario', docId: String(prodId), field: 'stock', delta: Number(delta) });
            if (state.uid) programarProcesarCola(150);
        },
        ajustarDeudaAtomica: (cliId, delta) => {
            if (!delta) return;
            encolarOperacion({ tipo: 'atomic', subcol: 'clientes', docId: String(cliId), field: 'deuda', delta: Number(delta) });
            if (state.uid) programarProcesarCola(150);
        },
        obtenerEstado: () => ({
            conectado: state.conectado,
            uid: state.uid,
            colaPendiente: obtenerColaOffline().length,
            ultimaSync: state.ultimaSync || obtenerConfigSync().ultimaSync,
            ultimoError: state.ultimoError
        })
    };
})();

/* ==========================================================================
   FASE 4: SEMÁFORO DE SINCRONIZACIÓN EN BARRA SUPERIOR (🟢 / 🟡 / 🔴)
   ========================================================================== */
(function () {
    const PILL_ID = 'cat-sync-topbar-pill';

    function asegurarEstilosSemaforoSync() {
        if (document.getElementById('cat-sync-pill-styles')) return;
        const st = document.createElement('style');
        st.id = 'cat-sync-pill-styles';
        st.textContent = `
            #${PILL_ID} {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 5px 11px;
                border-radius: 999px;
                font-size: 0.74rem;
                font-weight: 700;
                cursor: pointer;
                border: 1px solid transparent;
                transition: transform 0.15s ease, box-shadow 0.15s ease;
                margin-left: 8px;
                white-space: nowrap;
                font-family: inherit;
            }
            #${PILL_ID}:hover { transform: translateY(-1px); box-shadow: 0 3px 10px rgba(15, 23, 42, 0.08); }
            #${PILL_ID}.st-ok { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
            #${PILL_ID}.st-warn { background: #fffbeb; color: #b45309; border-color: #fde68a; }
            #${PILL_ID}.st-err { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
        `;
        document.head.appendChild(st);
    }

    function obtenerContenedorBarraSuperior() {
        const titulo = document.getElementById('main-title');
        if (titulo && titulo.parentElement) return titulo.parentElement;
        return document.querySelector('header, .top-bar, .topbar, .dashboard-header');
    }

    function renderizarSemaforoTopbar() {
        asegurarEstilosSemaforoSync();
        const contenedor = obtenerContenedorBarraSuperior();
        if (!contenedor) return;

        let pill = document.getElementById(PILL_ID);
        if (!pill) {
            pill = document.createElement('button');
            pill.type = 'button';
            pill.id = PILL_ID;
            pill.addEventListener('click', () => {
                const info = window.CatAlogoSync?.obtenerEstado?.() || {};
                if (!navigator.onLine) {
                    alert('🔴 Sin conexión a internet.\nTus cambios se guardan en la Bóveda Local y se subirán apenas vuelva la red.');
                    return;
                }
                if (!info.uid) {
                    alert('🔴 Sin sesión activa.\nInicia sesión en Ajustes → Nube & Sincronización para activar el espejo con la App.');
                    return;
                }
                if (info.ultimoError) {
                    const reintentar = confirm(`🔴 Último error de sincronización:\n${info.ultimoError}\n\n¿Deseas forzar la sincronización ahora?`);
                    if (reintentar) window.CatAlogoSync?.forzarSincronizacion?.();
                    return;
                }
                window.CatAlogoSync?.forzarSincronizacion?.();
            });
            contenedor.appendChild(pill);
        }

        const info = window.CatAlogoSync?.obtenerEstado?.() || {};
        const online = navigator.onLine;
        const cola = Number(info.colaPendiente) || 0;

        if (!online) {
            pill.className = 'st-err';
            pill.textContent = cola > 0 ? `🔴 Sin red (${cola})` : '🔴 Sin conexión';
            pill.title = 'Sin internet. Clic para ver detalles.';
        } else if (!info.uid || info.ultimoError || !info.conectado) {
            pill.className = 'st-err';
            pill.textContent = !info.uid ? '🔴 Sin sesión' : '🔴 Sync pausada';
            pill.title = info.ultimoError || 'Clic para diagnosticar o reconectar.';
        } else if (cola > 0) {
            pill.className = 'st-warn';
            pill.textContent = `🟡 Pendiente (${cola})`;
            pill.title = 'Hay cambios en cola. Clic para forzar sincronización ahora.';
        } else {
            pill.className = 'st-ok';
            pill.textContent = '🟢 Sincronizado';
            pill.title = 'App y PC en tiempo real. Clic para forzar sincronización manual.';
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        renderizarSemaforoTopbar();
        setInterval(renderizarSemaforoTopbar, 3000);
    });
    window.addEventListener('online', renderizarSemaforoTopbar);
    window.addEventListener('offline', renderizarSemaforoTopbar);
    window.addEventListener('cat-alogo:auth-cambiado', renderizarSemaforoTopbar);
    window.addEventListener('cat-alogo:suscripcion-actualizada', renderizarSemaforoTopbar);
    window.addEventListener('cat-alogo:turno-actualizado', () => setTimeout(renderizarSemaforoTopbar, 250));
})();

