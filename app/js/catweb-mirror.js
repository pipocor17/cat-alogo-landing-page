/* ==========================================================================
   ETAPA 5 (UNIFICADA): ESPEJO BIDIRECCIONAL CAT-WEB & RADAR EN TIEMPO REAL
   (vendors/{uid}, vendors/{uid}/products, vendors/{uid}/orders + PAGA CON/VUELTO)
   ========================================================================== */
(function () {
    const STORAGE_KEY_WEB_CFG = 'cat_alogo_web_config_v1';
    const STORAGE_KEY_WEB_PEDIDOS = 'cat_alogo_web_pedidos_v1';
    const STORAGE_KEY_PRODUCTOS = 'cat_alogo_productos_v1';
    const BASE_URL_DEFAULT = 'https://catalogo-web-chi.vercel.app';

    const state = {
        db: null,
        storage: null,
        uid: null,
        unsubVendor: null,
        unsubProducts: null,
        unsubOrders: null,
        publicando: false,
        idsNotificados: new Set(),
        cargaInicialOrdersLista: false
    };

    /* --- 1. HELPERS SEGUROS --- */
    function leerJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }

    function fmtArs(v) {
        const n = Number(v) || 0;
        return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    }

    function slugify(texto) {
        return String(texto || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'mi-tienda';
    }

    function esImagenWebValida(url) {
        if (typeof url !== 'string') return false;
        const s = url.trim();
        return s.startsWith('https://') || s.startsWith('http://');
    }

    function esBase64Img(url) {
        return typeof url === 'string' && url.startsWith('data:image/') && !url.startsWith('data:image/svg+xml');
    }

    function comprimirDataUrlAWebp(dataUrl, maxSide = 900, quality = 0.8) {
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
                    (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo convertir a WebP'))),
                    'image/webp',
                    quality
                );
            };
            img.onerror = () => reject(new Error('Imagen no legible'));
            img.src = dataUrl;
        });
    }

    async function subirImagenPublicaStorage(src, rutaStorage, maxSide = 900) {
        if (esImagenWebValida(src)) return src.trim();
        if (!esBase64Img(src) || !state.storage || !state.uid) return '';
        try {
            const blob = await comprimirDataUrlAWebp(src, maxSide, 0.8);
            const ref = state.storage.ref().child(rutaStorage);
            await ref.put(blob, { contentType: 'image/webp' });
            return await ref.getDownloadURL();
        } catch (err) {
            console.warn(`No se pudo subir ${rutaStorage} a Firebase Storage:`, err);
            return '';
        }
    }

    function unidadCortaPublica(prod) {
        const u = String(prod.unidadMedida || prod.unidadVenta || 'U').trim();
        const low = u.toLowerCase();
        if (low.includes('kilo') || low === 'kg') return 'Kg';
        if (low.includes('gram') || low === 'g') return 'g';
        if (low.includes('litro') || low === 'l') return 'L';
        if (low.includes('ml')) return 'ml';
        if (low.includes('metro') || low === 'm') return 'm';
        return 'U';
    }

    function aceptaDecimalesPublico(prod) {
        if (prod.familiaMedicion === 'peso' || prod.familiaMedicion === 'longitud') return true;
        const u = unidadCortaPublica(prod).toLowerCase();
        return ['kg', 'g', 'l', 'ml', 'm'].includes(u);
    }

    function reproducirAlertaPedidoNuevo() {
        const chk = document.getElementById('cw-chk-sonido');
        if (chk && !chk.checked) return;
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            [880, 1175].forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.14);
                gain.gain.setValueAtTime(0.11, ctx.currentTime + idx * 0.14);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.14 + 0.18);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + idx * 0.14);
                osc.stop(ctx.currentTime + idx * 0.14 + 0.2);
            });
        } catch { /* sin audio */ }
    }

    function refrescarUiCatWebSiAbierta() {
        if (document.getElementById('catweb-module-root') && typeof window.renderizarTodoCatWeb === 'function') {
            window.renderizarTodoCatWeb();
        }
    }

    function actualizarBadgeEstadoUnificado() {
        const badge = document.getElementById('cw-sync-badge');
        if (!badge) return;
        if (state.db && state.uid) {
            badge.classList.add('is-cloud');
            badge.textContent = `● ESPEJO CAT-WEB & RADAR EN VIVO (UID: ${state.uid.slice(0, 8)}…)`;
        } else {
            badge.classList.remove('is-cloud');
            badge.textContent = '● MODO LOCAL-FIRST';
        }
    }

    /* --- 2. PUBLICACIÓN ESPEJO PC -> NUBE (vendors/{uid} + products SIN COSTOS) --- */
    function construirDocumentoPublicoProducto(prod, imgUrlPublica, ocultarSinStock) {
        const stockNum = Math.max(0, Math.round((Number(prod.stock) || 0) * 1000) / 1000);
        const visibleProd = prod.visible !== false;
        const publicado = visibleProd && (!ocultarSinStock || stockNum > 0);
        const unidad = unidadCortaPublica(prod);
        const esDec = aceptaDecimalesPublico(prod);

        return {
            id: String(prod.id),
            sku: String(prod.sku || '').trim(),
            nombre: String(prod.nombre || 'Producto').trim(),
            categoria: String(prod.categoria || 'General').trim() || 'General',
            descripcionCorta: String(prod.descripcion || '').trim(),
            precio: Math.max(0, Number(prod.precioNormal) || 0),
            precioOferta: Math.max(0, Number(prod.precioOferta) || 0),
            stock: stockNum,
            controlarStock: true,
            unidadVenta: unidad,
            unidadMedida: unidad,
            aceptaDecimales: esDec,
            imagen_url: imgUrlPublica || '',
            imagen: imgUrlPublica || '',
            publicado,
            publicarWeb: publicado,
            enCatalogo: publicado,
            visible: visibleProd,
            updatedAtMs: Date.now(),
            updatedBy: 'web_pc'
        };
    }

    async function publicarCatalogoPublicoEnVivo() {
        if (state.publicando) return;
        if (!state.db || !state.uid) {
            alert('☁️ Inicia sesión con tu cuenta de Firebase para publicar cambios en la tienda online.');
            return;
        }
        if (window.CatAlogoAuth && !window.CatAlogoAuth.estaSuscripcionActiva()) {
            alert('🔒 Tu suscripción debe estar activa para publicar cambios en la tienda online.');
            return;
        }

        state.publicando = true;
        const btn = document.getElementById('btn-cw-sincronizar');
        const txtOrig = btn ? btn.textContent : '🌐 Publicar en Cat-Web (En Vivo)';
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Publicando y limpiando Cat-Web…'; }

        try {
            const webCfg = leerJson(STORAGE_KEY_WEB_CFG, {}) || {};
            const sisCfg = leerJson('cat_alogo_sistema_cfg_v1', {}) || {};
            const neg = sisCfg.negocio || {};

            const nombreTienda = (webCfg.nombre || neg.nombre || 'Mi Tienda').trim();
            const slug = slugify(webCfg.slug || nombreTienda);
            const envioTipo = webCfg.envioTipo || 'fijo';
            const envioValor = envioTipo === 'gratis' ? 0 : (Number(webCfg.envioValor) || 0);
            const gruposMenu = Array.isArray(webCfg.gruposMenu) ? webCfg.gruposMenu : [];
            const agrupacionesWeb = gruposMenu.map(g => ({
                id: g.id || `grp_${Date.now()}`,
                nombre: g.nombre || '',
                hijas: Array.isArray(g.categorias) ? g.categorias : []
            }));

            const logoUrl = await subirImagenPublicaStorage(
                webCfg.logoImg || neg.logo || '',
                `vendors/${state.uid}/logoNegocio.webp`,
                512
            );
            const portadaUrl = await subirImagenPublicaStorage(
                webCfg.bannerImg || '',
                `vendors/${state.uid}/portadaNegocio.webp`,
                1280
            );

            const vendorRef = state.db.collection('vendors').doc(state.uid);
            const vendorPayload = {
                uid: state.uid,
                slug,
                nombreNegocio: nombreTienda,
                nombre: nombreTienda,
                descripcionNegocio: (webCfg.descripcion || neg.descripcion || '').trim(),
                descripcion: (webCfg.descripcion || neg.descripcion || '').trim(),
                whatsapp: (webCfg.whatsapp || neg.whatsappVentas || '').trim(),
                colorPrimario: webCfg.colorPrimario || '#10b981',
                colorTema: webCfg.colorPrimario || '#10b981',
                color_tema: webCfg.colorPrimario || '#10b981',
                tipoEnvio: envioTipo,
                envioTipo,
                valorEnvio: String(envioValor),
                envioValor,
                ocultarSinStock: webCfg.ocultarSinStock !== false,
                agrupacionesWeb,
                gruposMenu,
                updatedAtMs: Date.now(),
                updatedBy: 'web_pc'
            };
            if (logoUrl) {
                vendorPayload.logoNegocio = logoUrl;
                vendorPayload.logo = logoUrl;
                vendorPayload.logo_url = logoUrl;
            }
            if (portadaUrl) {
                vendorPayload.portadaNegocio = portadaUrl;
                vendorPayload.portada_url = portadaUrl;
                vendorPayload.banner = portadaUrl;
            }

            await vendorRef.set(vendorPayload, { merge: true });

            // 1. Preparar operaciones de publicación solo para productos actualmente visibles
            const productos = leerJson(STORAGE_KEY_PRODUCTOS, []);
            const ocultarSinStock = webCfg.ocultarSinStock !== false;
            const productsCol = vendorRef.collection('products');
            const idsPublicados = new Set();
            const operaciones = [];

            for (let i = 0; i < productos.length; i++) {
                const p = productos[i];
                const prodId = String(p.id || `prod-${i}`);
                const stockNum = Math.max(0, Math.round((Number(p.stock) || 0) * 1000) / 1000);
                const debePublicarse = (p.visible !== false) && (!ocultarSinStock || stockNum > 0);

                if (!debePublicarse) continue;

                const rawImg = (Array.isArray(p.imagenes) && p.imagenes[0]) ? p.imagenes[0] : (p.imagen_url || '');
                const imgUrl = await subirImagenPublicaStorage(
                    rawImg,
                    `vendors/${state.uid}/products/${prodId}.webp`,
                    900
                );
                const docPublico = construirDocumentoPublicoProducto(p, imgUrl, ocultarSinStock);
                idsPublicados.add(prodId);
                operaciones.push({ tipo: 'set', ref: productsCol.doc(prodId), data: docPublico });
            }

            // 2. Detectar y eliminar de Firestore productos fantasma (borrados) u ocultos
            const snapRemotos = await productsCol.get();
            let eliminadosNube = 0;
            snapRemotos.forEach((docSnap) => {
                if (!idsPublicados.has(String(docSnap.id))) {
                    operaciones.push({ tipo: 'delete', ref: docSnap.ref });
                    eliminadosNube++;
                }
            });

            // 3. Ejecutar en lotes seguros de 400 operaciones
            for (let i = 0; i < operaciones.length; i += 400) {
                const chunk = operaciones.slice(i, i + 400);
                const batch = state.db.batch();
                chunk.forEach((op) => {
                    if (op.tipo === 'delete') batch.delete(op.ref);
                    else batch.set(op.ref, op.data, { merge: true });
                });
                await batch.commit();
            }

            const nuevaCfgWeb = {
                ...webCfg,
                slug,
                baseUrl: webCfg.baseUrl || BASE_URL_DEFAULT,
                logoImg: logoUrl || webCfg.logoImg || '',
                bannerImg: portadaUrl || webCfg.bannerImg || '',
                envioTipo,
                envioValor,
                ultimaSync: new Date().toISOString()
            };
            localStorage.setItem(STORAGE_KEY_WEB_CFG, JSON.stringify(nuevaCfgWeb));
            refrescarUiCatWebSiAbierta();

            alert(
                `✅ ¡Cat-Web sincronizado en vivo!\n\n` +
                `• Enlace: ${(nuevaCfgWeb.baseUrl || BASE_URL_DEFAULT).replace(/\/+$/, '')}/${slug}\n` +
                `• Productos visibles online: ${idsPublicados.size}\n` +
                `• Productos fantasma / ocultos limpiados de la nube: ${eliminadosNube}\n` +
                `• Costo de envío: ${envioTipo === 'gratis' ? 'Gratis' : (envioTipo === 'porcentaje' ? envioValor + '%' : fmtArs(envioValor))}`
            );
        } catch (err) {
            console.error(err);
            alert(`❌ Error al publicar en Cat-Web: ${err.message}`);
        } finally {
            state.publicando = false;
            if (btn) { btn.disabled = false; btn.textContent = txtOrig; }
            actualizarBadgeEstadoUnificado();
        }
    }

    /* --- 3. ESCUCHA EN VIVO APP/NUBE -> PC (vendors/{uid} + products + orders) --- */
    function aplicarVendorRemotoEnLocal(d) {
        if (!d || typeof d !== 'object') return;
        const actual = leerJson(STORAGE_KEY_WEB_CFG, {}) || {};

        // Resolver costo de envío desde cualquier formato (App Android o PC)
        const tipoRemoto = String(d.tipoEnvio || d.envioTipo || d.appSettings?.tipoEnvio || '').toLowerCase();
        const valRaw = d.valorEnvio ?? d.envioValor ?? d.costoEnvio ?? d.appSettings?.valorEnvio;
        const valNum = valRaw !== undefined && valRaw !== '' ? (Number(valRaw) || 0) : null;

        let envioTipo = actual.envioTipo || 'fijo';
        let envioValor = Number(actual.envioValor) || 0;
        if (tipoRemoto === 'gratis' || tipoRemoto === 'fijo' || tipoRemoto === 'porcentaje') {
            envioTipo = tipoRemoto;
            envioValor = envioTipo === 'gratis' ? 0 : (valNum !== null ? valNum : envioValor);
        } else if (valNum !== null) {
            envioTipo = valNum > 0 ? 'fijo' : 'gratis';
            envioValor = valNum;
        }

        // Resolver grupos de menú (agrupacionesWeb de App <-> gruposMenu de PC)
        let gruposMenu = Array.isArray(actual.gruposMenu) ? actual.gruposMenu : [];
        if (Array.isArray(d.gruposMenu) && d.gruposMenu.length > 0) {
            gruposMenu = d.gruposMenu;
        } else if (Array.isArray(d.agrupacionesWeb)) {
            gruposMenu = d.agrupacionesWeb.map(g => ({
                id: g.id || `grp-${Date.now()}`,
                nombre: g.nombre || '',
                categorias: Array.isArray(g.hijas) ? g.hijas : (Array.isArray(g.categorias) ? g.categorias : [])
            }));
        }

        const fusion = {
            ...actual,
            baseUrl: actual.baseUrl || BASE_URL_DEFAULT,
            slug: d.slug || actual.slug || '',
            nombre: d.nombreNegocio || d.nombre || actual.nombre || '',
            descripcion: d.descripcionNegocio || d.descripcion || d.subtituloCatalogo || actual.descripcion || '',
            whatsapp: d.whatsapp || actual.whatsapp || '',
            colorPrimario: d.colorPrimario || d.colorTema || d.color_tema || actual.colorPrimario || '#10b981',
            logoImg: d.logoNegocio || d.logo || d.logo_url || actual.logoImg || '',
            bannerImg: d.portadaNegocio || d.banner || d.portada_url || actual.bannerImg || '',
            envioTipo,
            envioValor,
            ocultarSinStock: d.ocultarSinStock !== undefined ? !!d.ocultarSinStock : (actual.ocultarSinStock !== false),
            gruposMenu,
            ultimaSync: new Date().toISOString()
        };

        if (JSON.stringify(fusion) !== JSON.stringify(actual)) {
            localStorage.setItem(STORAGE_KEY_WEB_CFG, JSON.stringify(fusion));
            refrescarUiCatWebSiAbierta();
        }
    }

    function iniciarEscuchaVendorYProductos() {
        if (!state.db || !state.uid) return;
        const vendorRef = state.db.collection('vendors').doc(state.uid);

        // A. Escucha en vivo de la configuración pública (color, envío, nombre, logo, grupos)
        state.unsubVendor = vendorRef.onSnapshot((snap) => {
            if (!snap.exists || snap.metadata.hasPendingWrites) return;
            const d = snap.data() || {};
            if (d.updatedBy === 'web_pc') return;
            aplicarVendorRemotoEnLocal(d);
        }, (err) => console.warn('Error escuchando vendors/{uid}:', err));

        // B. Escucha en vivo de productos públicos (visibilidad, precio, oferta y stock desde la App)
        state.unsubProducts = vendorRef.collection('products').onSnapshot((snap) => {
            const cambios = snap.docChanges().filter(ch => !ch.doc.metadata.hasPendingWrites && ch.type !== 'removed');
            if (cambios.length === 0) return;

            const locales = leerJson(STORAGE_KEY_PRODUCTOS, []);
            const mapaId = new Map(locales.map((p, idx) => [String(p.id), idx]));
            let huboCambio = false;

            cambios.forEach((ch) => {
                const d = ch.doc.data() || {};
                if (d.updatedBy === 'web_pc') return;
                const docId = String(ch.doc.id);
                const idx = mapaId.get(docId);
                const visibleRemoto = Boolean(d.publicarWeb ?? d.publicado ?? d.visible ?? true);
                const imgRemota = esImagenWebValida(d.imagen_url) ? d.imagen_url : (esImagenWebValida(d.imagen) ? d.imagen : '');

                if (idx !== undefined) {
                    const p = locales[idx];
                    const nuevoPrecio = d.precio !== undefined ? (Number(d.precio) || 0) : p.precioNormal;
                    const nuevaOferta = d.precioOferta !== undefined ? (Number(d.precioOferta) || 0) : p.precioOferta;
                    const nuevoStock = d.stock !== undefined ? (Number(d.stock) || 0) : p.stock;

                    if (
                        p.visible !== visibleRemoto ||
                        p.precioNormal !== nuevoPrecio ||
                        p.precioOferta !== nuevaOferta ||
                        p.stock !== nuevoStock ||
                        (imgRemota && (!p.imagenes || p.imagenes[0] !== imgRemota))
                    ) {
                        locales[idx] = {
                            ...p,
                            nombre: d.nombre || p.nombre,
                            categoria: d.categoria || p.categoria,
                            descripcion: d.descripcionCorta !== undefined ? d.descripcionCorta : p.descripcion,
                            precioNormal: nuevoPrecio,
                            precioOferta: nuevaOferta,
                            stock: nuevoStock,
                            visible: visibleRemoto,
                            publicarWeb: visibleRemoto,
                            imagenes: imgRemota ? [imgRemota, ...(p.imagenes || []).slice(1)] : (p.imagenes || [])
                        };
                        huboCambio = true;
                    }
                }
            });

            if (huboCambio) {
                window.bovedaProductos = locales;
                localStorage.setItem(STORAGE_KEY_PRODUCTOS, JSON.stringify(locales));
                refrescarUiCatWebSiAbierta();
            }
        }, (err) => console.warn('Error escuchando vendors/{uid}/products:', err));
    }

    /* --- 4. RADAR DE PEDIDOS CON PAGA CON, VUELTO, TIPO Y REFERENCIAS --- */
    function normalizarEstadoPedidoRemoto(estRaw) {
        const s = String(estRaw || 'nuevo').toLowerCase();
        if (s === 'pendiente' || s === 'nuevo' || s === 'pending') return 'nuevo';
        if (s === 'preparando' || s === 'en_preparacion') return 'preparando';
        if (s === 'facturado' || s === 'completado' || s === 'pagado') return 'facturado';
        if (s === 'despachado' || s === 'enviado' || s === 'entregado') return 'despachado';
        if (s === 'cancelado' || s === 'anulado') return 'cancelado';
        return 'nuevo';
    }

    function normalizarPedidoRemotoACw(docId, d) {
        const itemsRaw = Array.isArray(d.items)
            ? d.items
            : (Array.isArray(d.productos) ? d.productos : (Array.isArray(d.carrito) ? d.carrito : []));

        const items = itemsRaw.map((it) => ({
            prodId: String(it.prodId || it.id || ''),
            nombre: String(it.nombre || 'Producto'),
            cantidad: Number(it.cantidad) || 1,
            precioUnit: Number(it.precioUnit ?? it.precioFinal ?? it.precio) || 0,
            unidadMedida: it.unidadMedida || it.unidadVenta || 'Unidad'
        }));

        const subtotalItems = items.reduce((acc, it) => acc + it.cantidad * it.precioUnit, 0);
        const costoEnvio = Number(d.costoEnvio ?? d.valorEnvio ?? d.envio ?? 0) || 0;
        const total = Number(d.total) > 0 ? Number(d.total) : (subtotalItems + costoEnvio);

        // Paga con y Vuelto (igual que App Android)
        const pagaConRaw = d.pagoCon ?? d.pagaCon ?? d.abonaCon ?? d.montoPago ?? d.efectivoRecibido;
        const pagaCon = Number(String(pagaConRaw ?? '').replace(/[^\d.]/g, '')) || 0;
        const vueltoRaw = Number(d.vuelto ?? d.cambio ?? 0) || 0;
        const vuelto = vueltoRaw > 0 ? vueltoRaw : (pagaCon > total ? Math.round((pagaCon - total) * 100) / 100 : 0);

        let fechaIso = new Date().toISOString();
        if (typeof d.fecha === 'string') fechaIso = d.fecha;
        else if (typeof d.createdAt?.toDate === 'function') fechaIso = d.createdAt.toDate().toISOString();
        else if (typeof d.timestamp?.toDate === 'function') fechaIso = d.timestamp.toDate().toISOString();
        else if (typeof d.createdAt === 'number') fechaIso = new Date(d.createdAt).toISOString();

        const modalidadRaw = String(d.modalidad || d.metodoEntrega || 'retiro').toLowerCase();
        const modalidad = modalidadRaw.includes('envio') || modalidadRaw.includes('delivery') ? 'envio' : 'retiro';

        const tipoBase = String(d.tipoEdificacion || d.tipoVivienda || '').trim().toUpperCase();
        const detalleEd = String(d.detalleEdificacion || '').trim();
        const tipoVivienda = [tipoBase, detalleEd].filter(Boolean).join(' • ');
        const referencia = String(d.clienteReferencias || d.referencias || d.referencia || '').trim();

        return {
            id: String(docId),
            codigo: String(d.codigo || d.numeroOrden || `#${String(docId).slice(-4).toUpperCase()}`),
            fecha: fechaIso,
            estado: normalizarEstadoPedidoRemoto(d.estado || d.status),
            clienteNombre: String(d.clienteNombre || d.cliente || d.nombreCliente || 'Cliente Web'),
            clienteTelefono: String(d.clienteTelefono || d.telefono || d.whatsappCliente || ''),
            modalidad,
            direccion: String(d.direccion || d.clienteDireccion || ''),
            tipoVivienda,
            referencia,
            costoEnvio,
            medioPago: String(d.medioPago || d.formaPago || 'Efectivo'),
            pagaCon,
            vuelto,
            notas: String(d.notas || d.clienteNotas || ''),
            items,
            subtotal: subtotalItems,
            total,
            ticketPosNumero: d.ticketPosNumero || '',
            origenNube: true
        };
    }

    function iniciarEscuchaRadarOrders() {
        if (!state.db || !state.uid) return;
        const ordersRef = state.db.collection('vendors').doc(state.uid).collection('orders');
        state.cargaInicialOrdersLista = false;

        state.unsubOrders = ordersRef.onSnapshot((snap) => {
            const locales = leerJson(STORAGE_KEY_WEB_PEDIDOS, []);
            const mapa = new Map(locales.map(p => [String(p.id), p]));
            let huboNuevos = false;
            let huboCambios = false;

            snap.docChanges().forEach((change) => {
                const docId = String(change.doc.id);
                if (change.type === 'removed') {
                    if (mapa.has(docId)) {
                        mapa.delete(docId);
                        huboCambios = true;
                    }
                    return;
                }

                const pedNorm = normalizarPedidoRemotoACw(docId, change.doc.data() || {});
                const prev = mapa.get(docId);

                if (change.type === 'added' && state.cargaInicialOrdersLista && !state.idsNotificados.has(docId) && pedNorm.estado === 'nuevo') {
                    huboNuevos = true;
                }
                state.idsNotificados.add(docId);
                mapa.set(docId, { ...(prev || {}), ...pedNorm });
                huboCambios = true;
            });

            state.cargaInicialOrdersLista = true;

            if (huboCambios) {
                const listaOrdenada = Array.from(mapa.values()).sort((a, b) =>
                    (Date.parse(b.fecha) || 0) - (Date.parse(a.fecha) || 0)
                );
                localStorage.setItem(STORAGE_KEY_WEB_PEDIDOS, JSON.stringify(listaOrdenada));
                refrescarUiCatWebSiAbierta();
            }

            if (huboNuevos) reproducirAlertaPedidoNuevo();
            actualizarBadgeEstadoUnificado();
        }, (err) => console.warn('Error escuchando vendors/{uid}/orders:', err));
    }

    function detenerTodasLasEscuchas() {
        [state.unsubVendor, state.unsubProducts, state.unsubOrders].forEach(u => {
            if (typeof u === 'function') { try { u(); } catch { /* ignore */ } }
        });
        state.unsubVendor = null;
        state.unsubProducts = null;
        state.unsubOrders = null;
    }

    /* --- 5. INYECTAR "PAGA CON" Y "VUELTO" EN RADAR Y MODAL TICKET WEB --- */
    function inyectarPagaConYVueltoEnRadar() {
        const pedidos = leerJson(STORAGE_KEY_WEB_PEDIDOS, []);
        const mapa = new Map(pedidos.map(p => [String(p.id), p]));

        document.querySelectorAll('#cw-radar-list .cw-order-card[data-oid]').forEach((card) => {
            if (card.querySelector('.cw-order-cash-bar')) return;
            const ped = mapa.get(card.getAttribute('data-oid'));
            if (!ped || !(Number(ped.pagaCon) > 0)) return;

            const vuelto = Number(ped.vuelto) > 0
                ? Number(ped.vuelto)
                : Math.max(0, Math.round((Number(ped.pagaCon) - Number(ped.total)) * 100) / 100);

            const bar = document.createElement('div');
            bar.className = 'cw-order-cash-bar';
            bar.innerHTML = `
                <span>💵 Paga con: <strong>${fmtArs(ped.pagaCon)}</strong></span>
                <span class="cw-vuelto-val">Vuelto: ${fmtArs(vuelto)}</span>
            `;
            const actions = card.querySelector('.cw-order-actions');
            if (actions) card.insertBefore(bar, actions);
            else card.appendChild(bar);
        });
    }

    function inyectarPagaConYVueltoEnModalTicket(pedidoId) {
        const body = document.getElementById('cw-tk-body');
        if (!body || body.querySelector('.cw-order-cash-bar')) return;
        const ped = leerJson(STORAGE_KEY_WEB_PEDIDOS, []).find(p => String(p.id) === String(pedidoId));
        if (!ped || !(Number(ped.pagaCon) > 0)) return;

        const vuelto = Number(ped.vuelto) > 0
            ? Number(ped.vuelto)
            : Math.max(0, Math.round((Number(ped.pagaCon) - Number(ped.total)) * 100) / 100);

        const bar = document.createElement('div');
        bar.className = 'cw-order-cash-bar';
        bar.innerHTML = `
            <span>💵 Paga con: <strong>${fmtArs(ped.pagaCon)}</strong></span>
            <span class="cw-vuelto-val">Vuelto: ${fmtArs(vuelto)}</span>
        `;
        body.appendChild(bar);
    }

    /* --- 6. ESPEJO DE ESTADO DE PEDIDOS Y DESCUENTO ATÓMICO --- */
    async function sincronizarEstadoPedidoPublico(pedido) {
        if (!state.db || !state.uid || !pedido?.id) return;
        try {
            await state.db
                .collection('vendors').doc(state.uid)
                .collection('orders').doc(String(pedido.id))
                .set({
                    estado: pedido.estado,
                    ticketPosNumero: pedido.ticketPosNumero || '',
                    updatedAtMs: Date.now(),
                    updatedBy: 'web_pc'
                }, { merge: true });
        } catch (err) {
            console.warn('Error actualizando pedido en vendors/orders:', err);
        }
    }

    async function borrarPedidoPublico(pedido) {
        if (!state.db || !state.uid || !pedido?.id) return;
        try {
            await state.db
                .collection('vendors').doc(state.uid)
                .collection('orders').doc(String(pedido.id))
                .delete();
        } catch (err) {
            console.warn('Error borrando pedido en vendors/orders:', err);
        }
    }

    async function descontarStockPublicoAtomico(items) {
        if (!state.db || !state.uid || !Array.isArray(items) || items.length === 0) return;
        const FieldValue = firebase.firestore.FieldValue;
        const productsCol = state.db.collection('vendors').doc(state.uid).collection('products');

        for (const it of items) {
            const prodId = String(it.prodId || it.id || '');
            const cant = Number(it.cantidad) || 0;
            if (!prodId || cant <= 0) continue;
            try {
                await productsCol.doc(prodId).set({
                    stock: FieldValue.increment(-cant),
                    updatedAtMs: Date.now(),
                    updatedBy: 'web_pc'
                }, { merge: true });
            } catch { /* producto no publicado */ }
        }
    }

    /* --- 7. UNIFICAR BOTÓN VERDE EN CAT-WEB (SIN BARRA DUPLICADA) --- */
    function unificarBotonPublicarCatWeb() {
        // Quitar barra oscura vieja si hubiera quedado
        document.getElementById('cw-mirror-live-bar')?.remove();

        const btnSync = document.getElementById('btn-cw-sincronizar');
        if (btnSync && !btnSync.dataset.mirrorUnified) {
            const clon = btnSync.cloneNode(true);
            clon.dataset.mirrorUnified = '1';
            clon.textContent = '🌐 Publicar en Cat-Web (En Vivo)';
            btnSync.parentNode.replaceChild(clon, btnSync);
            clon.addEventListener('click', publicarCatalogoPublicoEnVivo);
        }
        actualizarBadgeEstadoUnificado();
    }

    function conectarEspejoConAuth() {
        const authSt = window.CatAlogoAuth?.getState?.();
        state.db = window.CatAlogoAuth?.getDb?.() || null;
        state.storage = window.CatAlogoAuth?.getStorage?.() || null;
        state.uid = authSt?.uid || null;

        detenerTodasLasEscuchas();
        if (state.db && state.uid && (!window.CatAlogoAuth || window.CatAlogoAuth.estaSuscripcionActiva())) {
            iniciarEscuchaVendorYProductos();
            iniciarEscuchaRadarOrders();
        }
        actualizarBadgeEstadoUnificado();
    }

    window.addEventListener('cat-alogo:auth-cambiado', conectarEspejoConAuth);
    window.addEventListener('cat-alogo:suscripcion-actualizada', conectarEspejoConAuth);

    document.addEventListener('DOMContentLoaded', () => {
        // Desactivar el puente manual antiguo de cat-web.js para evitar doble listener en orders
        window.conectarPuenteFirebaseCw = () => {
            actualizarBadgeEstadoUnificado();
            return Boolean(state.db && state.uid);
        };
        window.sincronizarEstadoPedidoEnNubeCw = sincronizarEstadoPedidoPublico;
        window.borrarDocumentoPedidoNubeCw = borrarPedidoPublico;

        // Envolver render del Radar y Modal Ticket Web para mostrar "Paga con / Vuelto"
        if (typeof window.renderizarRadarPedidosCw === 'function' && !window.renderizarRadarPedidosCw._conCash) {
            const _radOrig = window.renderizarRadarPedidosCw;
            window.renderizarRadarPedidosCw = function (...args) {
                const r = _radOrig.apply(this, args);
                inyectarPagaConYVueltoEnRadar();
                return r;
            };
            window.renderizarRadarPedidosCw._conCash = true;
        }

        if (typeof window.abrirModalTicketWebCw === 'function' && !window.abrirModalTicketWebCw._conCash) {
            const _tkOrig = window.abrirModalTicketWebCw;
            window.abrirModalTicketWebCw = function (pedidoId, ...rest) {
                const r = _tkOrig.apply(this, [pedidoId, ...rest]);
                inyectarPagaConYVueltoEnModalTicket(pedidoId);
                return r;
            };
            window.abrirModalTicketWebCw._conCash = true;
        }

        if (typeof window.inicializarCatWeb === 'function' && !window.inicializarCatWeb._conMirror) {
            const _initCwPrev = window.inicializarCatWeb;
            window.inicializarCatWeb = function (...args) {
                const res = _initCwPrev.apply(this, args);
                unificarBotonPublicarCatWeb();
                inyectarPagaConYVueltoEnRadar();
                return res;
            };
            window.inicializarCatWeb._conMirror = true;
        }

        // Al facturar un pedido desde el Radar, sincronizar estado y descontar stock público atómico
        document.addEventListener('click', (e) => {
            const btnFact = e.target.closest('#cw-radar-list [data-oact="facturar"]');
            if (!btnFact || !state.db || !state.uid) return;
            const oid = btnFact.closest('[data-oid]')?.getAttribute('data-oid');
            if (!oid) return;
            setTimeout(() => {
                const ped = leerJson(STORAGE_KEY_WEB_PEDIDOS, []).find(p => String(p.id) === String(oid));
                if (ped && ped.estado === 'facturado') {
                    sincronizarEstadoPedidoPublico(ped);
                    descontarStockPublicoAtomico(ped.items);
                }
            }, 120);
        });

        conectarEspejoConAuth();
    });

    window.CatWebMirror = {
        publicarCatalogo: publicarCatalogoPublicoEnVivo,
        descontarStockPublicoAtomico,
        sincronizarEstadoPedido: sincronizarEstadoPedidoPublico
    };
})();

/* ==========================================================================
   PUENTE UNIFICADOR DE VISIBILIDAD WEB (INVENTARIO ↔ MODAL EDITAR ↔ CAT-WEB)
   ========================================================================== */
(function () {
    const PROD_KEY = 'cat_alogo_productos_v1';
    const prevFlags = new Map();

    function leerBool(v) {
        return typeof v === 'boolean' ? v : undefined;
    }

    function capturarSnapshot(lista) {
        prevFlags.clear();
        if (!Array.isArray(lista)) return;
        lista.forEach((p) => {
            if (!p || p.id === undefined) return;
            prevFlags.set(String(p.id), {
                visible: leerBool(p.visible),
                visibleWeb: leerBool(p.visibleWeb),
                publicarWeb: leerBool(p.publicarWeb),
                webVisible: leerBool(p.webVisible),
                publicadoWeb: leerBool(p.publicadoWeb),
                enWeb: leerBool(p.enWeb)
            });
        });
    }

function aplicarValorUnificado(p, val) {
        p.visible = val;
        p.visibleWeb = val;
        p.publicarWeb = val;
        if ('webVisible' in p) p.webVisible = val;
        if ('publicadoWeb' in p) p.publicadoWeb = val;
        if ('enWeb' in p) p.enWeb = val;
    }

    function reconciliarListaProductos(lista, esInicial = false) {
        if (!Array.isArray(lista)) return { lista, cambio: false };
        let cambio = false;

        lista.forEach((p) => {
            if (!p || p.id === undefined) return;
            const id = String(p.id);
            const prev = prevFlags.get(id);

            const cur = {
                visible: leerBool(p.visible),
                visibleWeb: leerBool(p.visibleWeb),
                publicarWeb: leerBool(p.publicarWeb),
                webVisible: leerBool(p.webVisible),
                publicadoWeb: leerBool(p.publicadoWeb),
                enWeb: leerBool(p.enWeb)
            };

            let elegido = undefined;

            if (esInicial || !prev) {
                // Prioriza el campo del modal/tarjeta de Inventario si difiere
                elegido =
                    cur.visibleWeb ??
                    cur.webVisible ??
                    cur.publicadoWeb ??
                    cur.enWeb ??
                    cur.publicarWeb ??
                    cur.visible ??
                    true;
            } else {
                // Detecta desde qué pantalla se accionó el interruptor
                const claves = ['visibleWeb', 'webVisible', 'publicadoWeb', 'enWeb', 'publicarWeb', 'visible'];
                for (const k of claves) {
                    if (cur[k] !== undefined && cur[k] !== prev[k]) {
                        elegido = cur[k];
                        break;
                    }
                }
            }

            if (elegido !== undefined) {
                if (
                    p.visible !== elegido ||
                    p.visibleWeb !== elegido ||
                    p.publicarWeb !== elegido ||
                    p.enCatalogo !== elegido
                ) {
                    aplicarValorUnificado(p, elegido);
                    cambio = true;
                }
            }
        });

        capturarSnapshot(lista);
        return { lista, cambio };
    }

    // Intercepta cualquier escritura de productos para mantener Inventario y Cat-Web en espejo
    if (!window._catWebVisBridgeBound) {
        const _origSetItemVis = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
            if (this === window.localStorage && key === PROD_KEY && typeof value === 'string') {
                try {
                    const parsed = JSON.parse(value);
                    if (Array.isArray(parsed)) {
                        const { lista, cambio } = reconciliarListaProductos(parsed, false);
                        if (cambio) {
                            window.bovedaProductos = lista;
                            value = JSON.stringify(lista);
                        }
                    }
                } catch { /* continuar sin alterar */ }
            }
            return _origSetItemVis.call(this, key, value);
        };
        window._catWebVisBridgeBound = true;
    }

    // Alinea automáticamente productos que ya quedaron desfasados al abrir la web
    function reconciliarAlInicio() {
        try {
            const raw = localStorage.getItem(PROD_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return;
            const { lista, cambio } = reconciliarListaProductos(parsed, true);
            if (cambio) {
                window.bovedaProductos = lista;
                localStorage.setItem(PROD_KEY, JSON.stringify(lista));
                if (typeof window.renderizarProductosCreados === 'function') window.renderizarProductosCreados();
                if (document.getElementById('catweb-module-root') && typeof window.renderizarTodoCatWeb === 'function') {
                    window.renderizarTodoCatWeb();
                }
            }
        } catch { /* ignore */ }
    }

    document.addEventListener('DOMContentLoaded', () => setTimeout(reconciliarAlInicio, 120));
    window.addEventListener('cat-alogo:boveda-idb-lista', reconciliarAlInicio);
})();

