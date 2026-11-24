/* ==========================================================================
   MOTOR UNIFICADO DE TICKETS & COMPROBANTES (TÉRMICO 80/58MM, WHATSAPP Y PC)
   ========================================================================== */
(function () {
    const STORAGE_KEY_TICKET_CFG = 'cat_alogo_ticket_cfg_v1';

    /* --- 1. CONFIGURACIÓN UNIFICADA (FUENTE ÚNICA DE VERDAD) --- */
    function leerJsonSeguro(key, fallback = null) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }

    function obtenerDatosNegocio() {
        const sis = leerJsonSeguro('cat_alogo_sistema_cfg_v1', {}) || {};
        const neg = sis.negocio || {};
        const pdf = leerJsonSeguro('cat_alogo_pdf_config_v1', {}) || {};
        const web = leerJsonSeguro('cat_alogo_web_config_v1', {}) || {};

        const baseWeb = String(web.baseUrl || '').replace(/\/+$/, '');
        const slugWeb = String(web.slug || '').replace(/^\/+/, '');
        const urlWeb = (baseWeb && slugWeb) ? `${baseWeb}/${slugWeb}` : (neg.sitioWeb || '');

        return {
            nombre: (neg.nombre || pdf.headerNombre || web.nombre || 'MI COMERCIO').trim(),
            eslogan: (neg.eslogan || '').trim(),
            logo: neg.logo || web.logoImg || '',
            direccion: (neg.direccion || '').trim(),
            whatsapp: (neg.whatsappVentas || web.whatsapp || '').trim(),
            telefono: (neg.telefono || '').trim(),
            contactoLegacy: (pdf.headerContacto || '').trim(),
            idFiscal: (neg.idFiscal || '').trim(),
            urlWeb,
            monedaLocale: sis.moneda?.locale || 'es-AR',
            mostrarDecimales: sis.moneda?.mostrarDecimales === true
        };
    }

    function obtenerConfigTicket() {
        const pro = leerJsonSeguro('cat_alogo_sistema_pro_v1', {}) || {};
        const hw = pro.hardwarePos || {};
        const guardado = leerJsonSeguro(STORAGE_KEY_TICKET_CFG, {}) || {};

        const defaults = {
            anchoMm: Number(hw.anchoTicketMm) === 58 ? 58 : 80,
            leyendaFiscal: 'COMPROBANTE NO FISCAL',
            mostrarLogoModal: true,
            mostrarDireccion: true,
            mostrarCuit: true,
            mostrarCajeroTurno: true,
            mostrarNota: true,
            mostrarAhorro: true,
            mostrarPieMarca: true,
            textoPieMarca: 'Cat-Alogo Local-First POS',
            notaPorDefecto: '',
            mensajePie: hw.mensajePieTicket || '¡Gracias por su compra! Conserve este comprobante.',
            corteAutomatico: hw.corteAutomatico !== false,
            mostrarQrPie: false,
            qrDestino: 'catweb', // 'catweb' | 'whatsapp' | 'custom'
            qrUrlCustom: '',
            qrLeyenda: 'Escanea nuestro catalogo online',
            whatsappUsarEmojis: false, // Limpio por defecto para evitar rombos en Windows
            whatsappEncabezado: 'Comprobante {TICKET} - {COMERCIO}',
            whatsappCierre: 'Muchas gracias por tu compra!',
            whatsappIncluirLinkWeb: false
        };

        return { ...defaults, ...guardado };
    }

    function guardarConfigTicket(nuevaCfg) {
        const merged = { ...obtenerConfigTicket(), ...(nuevaCfg || {}) };
        localStorage.setItem(STORAGE_KEY_TICKET_CFG, JSON.stringify(merged));

        // Mantener sincronizado con Hardware POS en cat_alogo_sistema_pro_v1
        const pro = leerJsonSeguro('cat_alogo_sistema_pro_v1', {}) || {};
        pro.hardwarePos = {
            ...(pro.hardwarePos || {}),
            anchoTicketMm: merged.anchoMm === 58 ? 58 : 80,
            mensajePieTicket: merged.mensajePie,
            corteAutomatico: !!merged.corteAutomatico
        };
        localStorage.setItem('cat_alogo_sistema_pro_v1', JSON.stringify(pro));
        window.dispatchEvent(new CustomEvent('cat-alogo:ticket-cfg-actualizado', { detail: merged }));
        return merged;
    }

    /* --- 2. SANITIZACIÓN Y FORMATO DE TEXTO (ADIÓS Ø=Þ Y LÍNEAS CORTADAS) --- */
    function sanitizarParaPdfThermal(texto) {
        let s = String(texto ?? '');
        s = s
            .replace(/[\u{1F000}-\u{1FAFF}]/gu, '')
            .replace(/[\u{2600}-\u{27BF}]/gu, '')
            .replace(/[\uFE00-\uFE0F\u200D]/g, '')
            .replace(/[•·]/g, '-')
            .replace(/[—–]/g, '-')
            .replace(/[“”]/g, '"')
            .replace(/[‘’]/g, "'")
            .replace(/×/g, 'x')
            .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '');
        return s.replace(/[ \t]{2,}/g, ' ').trim();
    }

    function limpiarEmojisTexto(texto) {
        return String(texto ?? '')
            .replace(/[\u{1F000}-\u{1FAFF}]/gu, '')
            .replace(/[\u{2600}-\u{27BF}]/gu, '')
            .replace(/[\uFE00-\uFE0F\u200D]/g, '')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();
    }

    function envolverLineas(texto, ancho) {
        const max = Math.max(16, ancho || 42);
        const parrafos = String(texto || '').split(/\r?\n/);
        const resultado = [];

        parrafos.forEach((par) => {
            const palabras = par.trim().split(/\s+/).filter(Boolean);
            if (palabras.length === 0) return;
            let linea = '';
            palabras.forEach((pal) => {
                if (pal.length > max) {
                    if (linea) { resultado.push(linea); linea = ''; }
                    for (let i = 0; i < pal.length; i += max) {
                        resultado.push(pal.slice(i, i + max));
                    }
                    return;
                }
                const prueba = linea ? `${linea} ${pal}` : pal;
                if (prueba.length <= max) {
                    linea = prueba;
                } else {
                    if (linea) resultado.push(linea);
                    linea = pal;
                }
            });
            if (linea) resultado.push(linea);
        });

        return resultado;
    }

    function centrarLinea(linea, ancho) {
        const txt = String(linea || '').trim().slice(0, ancho);
        const pad = Math.max(0, Math.floor((ancho - txt.length) / 2));
        return ' '.repeat(pad) + txt;
    }

    function centrarBloque(texto, ancho) {
        return envolverLineas(texto, ancho).map(l => centrarLinea(l, ancho));
    }

    function lineaIzqDer(izq, der, ancho) {
        const d = String(der || '').trim();
        const maxIzq = Math.max(4, ancho - d.length - 1);
        const i = String(izq || '').trim().slice(0, maxIzq);
        const espacios = Math.max(1, ancho - i.length - d.length);
        return i + ' '.repeat(espacios) + d;
    }

    function formatearDinero(monto) {
        const n = Number(monto) || 0;
        const neg = obtenerDatosNegocio();
        const conDec = neg.mostrarDecimales && Math.abs(n % 1) > 0.001;
        return `$${n.toLocaleString(neg.monedaLocale || 'es-AR', {
            minimumFractionDigits: conDec ? 2 : 0,
            maximumFractionDigits: 2
        })}`;
    }

    function abrevUnidad(u) {
        const s = String(u || 'Unidad').toLowerCase();
        if (s.includes('kilo') || s === 'kg') return 'kg';
        if (s.includes('gram') || s === 'g') return 'g';
        if (s.includes('litro') || s === 'l') return 'L';
        if (s.includes('metro') || s === 'm') return 'm';
        return 'u.';
    }

    /* --- 3. NORMALIZACIÓN DE VENTA (PORCENTAJES REALES SIEMPRE) --- */
    function normalizarVenta(ventaRaw) {
        const v = ventaRaw || {};
        const items = Array.isArray(v.items) ? v.items : [];
        const subtotalCalc = items.reduce((acc, it) => acc + (Number(it.precioUnit) || 0) * (Number(it.cantidad) || 1), 0);
        const subtotal = Number(v.subtotal) > 0 ? Number(v.subtotal) : Math.round(subtotalCalc * 100) / 100;

        const descuentoMonto = Math.max(0, Number(v.descuentoMonto) || 0);
        const recargoMonto = Math.max(0, Number(v.recargoMonto) || 0);

        const descuentoPct = Number(v.descuentoPct) > 0
            ? Number(v.descuentoPct)
            : (descuentoMonto > 0 && subtotal > 0 ? Math.round((descuentoMonto / subtotal) * 1000) / 10 : 0);

        const baseRec = Math.max(1, subtotal - descuentoMonto);
        const recargoPct = Number(v.recargoPct) > 0
            ? Number(v.recargoPct)
            : (recargoMonto > 0 && subtotal > 0 ? Math.round((recargoMonto / baseRec) * 1000) / 10 : 0);

        const total = Number(v.total) >= 0 ? Number(v.total) : Math.max(0, subtotal - descuentoMonto + recargoMonto);
        const pagos = Array.isArray(v.pagos) && v.pagos.length > 0
            ? v.pagos
            : [{ medio: 'Efectivo', monto: total }];

        const numeroLimpio = String(v.numeroTicket || '0000').replace(/^T-/, '');
        const numeroConPrefijo = v.numeroTicket ? String(v.numeroTicket) : `T-${numeroLimpio}`;

        return {
            ...v,
            items,
            subtotal,
            descuentoMonto,
            descuentoPct,
            recargoMonto,
            recargoPct,
            total,
            pagos,
            numeroLimpio,
            numeroConPrefijo
        };
    }

    /* --- 4. CONSTRUCCIÓN DE TICKET TÉRMICO (80MM = 42 COLS / 58MM = 32 COLS) --- */
    function construirTextoThermal(ventaRaw, anchoMmOpt) {
        const cfg = obtenerConfigTicket();
        const neg = obtenerDatosNegocio();
        const v = normalizarVenta(ventaRaw);

        const anchoMm = Number(anchoMmOpt) === 58 ? 58 : (Number(anchoMmOpt) === 80 ? 80 : cfg.anchoMm);
        const cols = anchoMm === 58 ? 32 : 42;
        const sepDoble = '='.repeat(cols);
        const sepSimple = '-'.repeat(cols);
        const out = [];

        // Cabecera centrada con ajuste automático de línea
        out.push(...centrarBloque(sanitizarParaPdfThermal(neg.nombre).toUpperCase(), cols));
        if (neg.eslogan) {
            out.push(...centrarBloque(sanitizarParaPdfThermal(neg.eslogan), cols));
        }
        if (cfg.mostrarDireccion) {
            const dirContacto = [neg.direccion, neg.whatsapp ? `WhatsApp: ${neg.whatsapp}` : ''].filter(Boolean).join(' - ') || neg.contactoLegacy;
            if (dirContacto) out.push(...centrarBloque(sanitizarParaPdfThermal(dirContacto), cols));
        }
        if (cfg.mostrarCuit && neg.idFiscal) {
            out.push(...centrarBloque(sanitizarParaPdfThermal(`CUIT/ID: ${neg.idFiscal}`), cols));
        }
        if (cfg.leyendaFiscal) {
            out.push(...centrarBloque(sanitizarParaPdfThermal(cfg.leyendaFiscal).toUpperCase(), cols));
        }

        out.push(sepDoble);

        // Datos del ticket
        const turnoTag = v.turnoNumero ? `T#${v.turnoNumero}` : '';
        out.push(lineaIzqDer(`TICKET: ${sanitizarParaPdfThermal(v.numeroConPrefijo)}`, turnoTag, cols));

        const fObj = new Date(v.fecha || Date.now());
        const fechaTxt = isNaN(fObj.getTime())
            ? '-'
            : fObj.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
        out.push(`FECHA: ${sanitizarParaPdfThermal(fechaTxt)}`);

        if (cfg.mostrarCajeroTurno && v.operador) {
            out.push(`CAJERO: ${sanitizarParaPdfThermal(v.operador).slice(0, cols - 8)}`);
        }
        if (v.clienteNombre && v.clienteNombre !== 'Consumidor Final') {
            out.push(`CLIENTE: ${sanitizarParaPdfThermal(v.clienteNombre).slice(0, cols - 9)}`);
        }

        out.push(sepSimple);
        out.push(lineaIzqDer('CANT x DESCRIPCION', 'SUBTOTAL', cols));
        out.push(sepSimple);

        // Productos con nombre limpio y word-wrap prolijo
        v.items.forEach((it) => {
            const nom = sanitizarParaPdfThermal(it.nombre || 'Producto');
            const cant = Number(it.cantidad) || 1;
            const pu = Number(it.precioUnit) || 0;
            const sub = Math.round(cant * pu * 100) / 100;
            const abrev = abrevUnidad(it.unidadMedida);

            envolverLineas(nom, cols).forEach(l => out.push(l));
            out.push(lineaIzqDer(`  ${cant}${abrev} x ${formatearDinero(pu)}`, formatearDinero(sub), cols));
        });

        out.push(sepSimple);
        out.push(lineaIzqDer('SUBTOTAL:', formatearDinero(v.subtotal), cols));

        if (v.descuentoMonto > 0) {
            const lblD = v.descuentoPct > 0 ? `DESCUENTO (${v.descuentoPct}%):` : 'DESCUENTO:';
            out.push(lineaIzqDer(lblD, `-${formatearDinero(v.descuentoMonto)}`, cols));
        }
        if (v.recargoMonto > 0) {
            const lblR = v.recargoPct > 0 ? `RECARGO (${v.recargoPct}%):` : 'RECARGO:';
            out.push(lineaIzqDer(lblR, `+${formatearDinero(v.recargoMonto)}`, cols));
        }

        out.push(sepDoble);
        out.push(lineaIzqDer('TOTAL A PAGAR:', formatearDinero(v.total), cols));
        out.push(sepSimple);

        // Medios de pago
        out.push('MEDIOS DE PAGO:');
        v.pagos.forEach((p) => {
            out.push(lineaIzqDer(` - ${sanitizarParaPdfThermal(p.medio || 'Efectivo')}`, formatearDinero(p.monto), cols));
        });
        if (Number(v.vueltoTotal) > 0) {
            out.push(lineaIzqDer(' VUELTO:', formatearDinero(v.vueltoTotal), cols));
        }

        const notaEfectiva = (v.nota && v.nota !== 'Venta Mostrador')
            ? v.nota
            : (cfg.notaPorDefecto || '').trim();

        if (cfg.mostrarNota && notaEfectiva) {
            out.push(sepSimple);
            envolverLineas(`NOTA: ${sanitizarParaPdfThermal(notaEfectiva)}`, cols).forEach(l => out.push(l));
        }

        out.push(sepSimple);

        // Ahorro destacado del cliente
        if (cfg.mostrarAhorro && v.descuentoMonto > 0) {
            out.push(...centrarBloque(`AHORRASTE ${formatearDinero(v.descuentoMonto)} EN ESTA COMPRA!`, cols));
        }

        // Pie de ticket y firma centrados línea por línea (nunca se cortan)
        if (cfg.mensajePie) {
            out.push(...centrarBloque(sanitizarParaPdfThermal(cfg.mensajePie), cols));
        }
        if (cfg.mostrarPieMarca && cfg.textoPieMarca) {
            out.push(...centrarBloque(sanitizarParaPdfThermal(cfg.textoPieMarca), cols));
        }

        if (cfg.corteAutomatico) {
            out.push('', '');
        }

        return out.join('\n');
    }

    function resolverUrlQrTicket(cfg, neg) {
        if (cfg.qrDestino === 'custom' && cfg.qrUrlCustom) return cfg.qrUrlCustom.trim();
        if (cfg.qrDestino === 'whatsapp' && neg.whatsapp) {
            const tel = neg.whatsapp.replace(/[^\d]/g, '');
            if (tel) return `https://wa.me/${tel}`;
        }
        return neg.urlWeb || '';
    }

    function cargarQrDataUrl(urlDestino) {
        return new Promise((resolve) => {
            if (!urlDestino) { resolve(null); return; }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            const timer = setTimeout(() => resolve(null), 2600);
            img.onload = () => {
                clearTimeout(timer);
                try {
                    const c = document.createElement('canvas');
                    c.width = img.width;
                    c.height = img.height;
                    c.getContext('2d').drawImage(img, 0, 0);
                    resolve(c.toDataURL('image/png'));
                } catch {
                    resolve(null);
                }
            };
            img.onerror = () => { clearTimeout(timer); resolve(null); };
            img.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=4&data=${encodeURIComponent(urlDestino)}`;
        });
    }

    async function descargarPdfThermal(ventaRaw, anchoMmOpt) {
        const jsPDFCtor = window.jspdf?.jsPDF;
        if (!jsPDFCtor) {
            alert('No se cargó la librería jsPDF.');
            return;
        }

        const cfg = obtenerConfigTicket();
        const neg = obtenerDatosNegocio();
        const v = normalizarVenta(ventaRaw);
        const anchoMm = Number(anchoMmOpt) === 58 ? 58 : (Number(anchoMmOpt) === 80 ? 80 : cfg.anchoMm);

        const texto = construirTextoThermal(v, anchoMm);
        const lineas = texto.split('\n');
        const fontSize = anchoMm === 58 ? 7.2 : 8.2;
        const lineH = anchoMm === 58 ? 3.5 : 3.9;
        const margenX = anchoMm === 58 ? 3.5 : 4.5;

        let qrDataUrl = null;
        if (cfg.mostrarQrPie) {
            const urlQr = resolverUrlQrTicket(cfg, neg);
            if (urlQr) qrDataUrl = await cargarQrDataUrl(urlQr);
        }

        const altoQr = qrDataUrl ? 34 : 0;
        const altoMm = Math.max(75, Math.ceil(lineas.length * lineH + 16 + altoQr));

        const doc = new jsPDFCtor({
            orientation: 'p',
            unit: 'mm',
            format: [anchoMm, altoMm]
        });

        doc.setFont('courier', 'normal');
        doc.setFontSize(fontSize);
        doc.setTextColor(15, 23, 42);

        let y = 7;
        lineas.forEach((linea) => {
            doc.text(linea, margenX, y);
            y += lineH;
        });

        if (qrDataUrl) {
            const qrSize = 24;
            const qrX = (anchoMm - qrSize) / 2;
            doc.addImage(qrDataUrl, 'PNG', qrX, y + 1, qrSize, qrSize);
            if (cfg.qrLeyenda) {
                doc.setFontSize(6.5);
                doc.text(sanitizarParaPdfThermal(cfg.qrLeyenda).slice(0, 38), anchoMm / 2, y + qrSize + 4.5, { align: 'center' });
            }
        }

        doc.save(`ticket-${v.numeroConPrefijo}-${anchoMm}mm.pdf`);
    }

    /* --- 5. COMPROBANTE DE WHATSAPP (SIN ROMBOS Y CON PORCENTAJE REAL) --- */
    function construirTextoWhatsApp(ventaRaw) {
        const cfg = obtenerConfigTicket();
        const neg = obtenerDatosNegocio();
        const v = normalizarVenta(ventaRaw);
        const conEmojis = !!cfg.whatsappUsarEmojis;

        const clean = (txt) => conEmojis ? String(txt || '').trim() : limpiarEmojisTexto(txt);
        const ico = (emoji, fallback) => conEmojis ? emoji : fallback;

        const fObj = new Date(v.fecha || Date.now());
        const fechaTxt = isNaN(fObj.getTime())
            ? '-'
            : fObj.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        const encabezado = (cfg.whatsappEncabezado || 'Comprobante {TICKET} - {COMERCIO}')
            .replace(/\{TICKET\}/g, v.numeroConPrefijo)
            .replace(/\{COMERCIO\}/g, neg.nombre)
            .replace(/\{CLIENTE\}/g, v.clienteNombre || 'Consumidor Final')
            .replace(/\{TOTAL\}/g, formatearDinero(v.total));

        const lineas = [];
        lineas.push(`*${ico('🧾 ', '')}${clean(encabezado)}*`);
        lineas.push(`${ico('📅 ', 'Fecha: ')}${fechaTxt}`);
        if (v.clienteNombre && v.clienteNombre !== 'Consumidor Final') {
            lineas.push(`${ico('👤 ', 'Cliente: ')}${clean(v.clienteNombre)}`);
        }
        lineas.push('');

        v.items.forEach((it) => {
            const cant = Number(it.cantidad) || 1;
            const pu = Number(it.precioUnit) || 0;
            const sub = Math.round(cant * pu * 100) / 100;
            const abrev = abrevUnidad(it.unidadMedida);
            lineas.push(`• ${clean(it.nombre || 'Producto')} (${cant} ${abrev}) — ${formatearDinero(sub)}`);
        });

        lineas.push('');
        if (v.descuentoMonto > 0) {
            const lblD = v.descuentoPct > 0 ? `Descuento (${v.descuentoPct}%)` : 'Descuento';
            lineas.push(`${ico('🏷️ ', '')}${lblD}: -${formatearDinero(v.descuentoMonto)}`);
        }
        if (v.recargoMonto > 0) {
            const lblR = v.recargoPct > 0 ? `Recargo (${v.recargoPct}%)` : 'Recargo';
            lineas.push(`${ico('➕ ', '')}${lblR}: +${formatearDinero(v.recargoMonto)}`);
        }

        lineas.push(`*TOTAL: ${formatearDinero(v.total)}*`);

        const mediosStr = v.pagos.map(p => `${clean(p.medio || 'Efectivo')} (${formatearDinero(p.monto)})`).join(' + ');
        lineas.push(`Medios: ${mediosStr}`);

        if (cfg.mostrarAhorro && v.descuentoMonto > 0) {
            lineas.push(`Ahorro en esta compra: ${formatearDinero(v.descuentoMonto)}`);
        }

        const notaWa = (v.nota && v.nota !== 'Venta Mostrador')
            ? v.nota
            : (cfg.notaPorDefecto || '').trim();
        if (cfg.mostrarNota && notaWa) {
            lineas.push(`${ico('📝 ', 'Nota: ')}${clean(notaWa)}`);
        }

        if (cfg.whatsappCierre) {
            lineas.push('');
            lineas.push(clean(cfg.whatsappCierre));
        }

        if (cfg.whatsappIncluirLinkWeb && neg.urlWeb) {
            lineas.push(`Catálogo online: ${neg.urlWeb}`);
        }

        return lineas.join('\n');
    }

    function abrirWhatsAppTicket(ventaRaw, telefonoOpt = '') {
        const v = normalizarVenta(ventaRaw);
        const texto = construirTextoWhatsApp(v);
        const tel = String(telefonoOpt || v.clienteTelefono || '').replace(/[^\d]/g, '');
        const url = tel
            ? `https://api.whatsapp.com/send?phone=${tel}&text=${encodeURIComponent(texto)}`
            : `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
        window.open(url, '_blank', 'noopener');
    }

    /* --- 6. SINCRONIZAR MODAL FLOTANTE EN PC (FINANZAS Y POS) --- */
    function mejorarModalTicketPC(ventaRaw) {
        const modal = document.getElementById('modal-fin-ticket-detalle');
        if (!modal || !ventaRaw) return;

        const cfg = obtenerConfigTicket();
        const neg = obtenerDatosNegocio();
        const v = normalizarVenta(ventaRaw);

        const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

        // Logo o ícono en la cabecera del modal
        const icoBox = modal.querySelector('.fin-tk-ico');
        if (icoBox) {
            if (cfg.mostrarLogoModal && neg.logo) {
                icoBox.innerHTML = `<img src="${neg.logo}" alt="Logo" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                icoBox.style.padding = '0';
                icoBox.style.overflow = 'hidden';
            } else {
                icoBox.textContent = '🧾';
            }
        }

        setTxt('fin-tk-comercio', neg.nombre.toUpperCase());

        // Nota de venta y fallback por defecto
        const notaEl = document.getElementById('fin-tk-nota');
        const notaRow = notaEl?.closest('.fin-tk-sum-row');
        if (notaEl && (!v.nota || v.nota === 'Venta Mostrador') && cfg.notaPorDefecto) {
            notaEl.textContent = cfg.notaPorDefecto;
        }
        if (notaRow) {
            notaRow.style.display = cfg.mostrarNota ? 'flex' : 'none';
        }

        // Sub-información opcional (dirección / CUIT)
        let metaEl = document.getElementById('fin-tk-negocio-meta');
        if (!metaEl) {
            const titleEl = document.getElementById('fin-tk-comercio');
            if (titleEl && titleEl.parentElement) {
                metaEl = document.createElement('div');
                metaEl.id = 'fin-tk-negocio-meta';
                metaEl.style.cssText = 'font-size:0.71rem; color:#64748b; margin-top:2px; text-align:center;';
                titleEl.insertAdjacentElement('afterend', metaEl);
            }
        }
        if (metaEl) {
            const partes = [];
            if (cfg.mostrarDireccion && neg.direccion) partes.push(neg.direccion);
            if (cfg.mostrarCuit && neg.idFiscal) partes.push(`CUIT/ID: ${neg.idFiscal}`);
            metaEl.textContent = partes.join(' • ');
            metaEl.style.display = partes.length > 0 ? 'block' : 'none';
        }

        // Porcentajes reales en descuento y recargo
        const descRow = document.getElementById('fin-tk-desc-row');
        if (descRow) {
            descRow.style.display = v.descuentoMonto > 0 ? 'flex' : 'none';
            if (v.descuentoMonto > 0) {
                setTxt('fin-tk-desc-lbl', v.descuentoPct > 0 ? `Descuento (${v.descuentoPct}%):` : 'Descuento:');
                setTxt('fin-tk-desc-val', `-${formatearDinero(v.descuentoMonto)}`);
            }
        }

        const recRow = document.getElementById('fin-tk-rec-row');
        if (recRow) {
            recRow.style.display = v.recargoMonto > 0 ? 'flex' : 'none';
            if (v.recargoMonto > 0) {
                setTxt('fin-tk-rec-lbl', v.recargoPct > 0 ? `Recargo (${v.recargoPct}%):` : 'Recargo:');
                setTxt('fin-tk-rec-val', `+${formatearDinero(v.recargoMonto)}`);
            }
        }

        // Pie de ticket, ahorro y firma dentro del modal PC
        let pieEl = document.getElementById('fin-tk-pie-personalizado');
        if (!pieEl) {
            const body = modal.querySelector('.fin-tk-body');
            if (body) {
                pieEl = document.createElement('div');
                pieEl.id = 'fin-tk-pie-personalizado';
                pieEl.style.cssText = 'margin-top:0.65rem; text-align:center; font-size:0.72rem; color:#64748b; line-height:1.35;';
                body.appendChild(pieEl);
            }
        }
        if (pieEl) {
            const bloques = [];
            if (cfg.mostrarAhorro && v.descuentoMonto > 0) {
                bloques.push(`<div style="color:#059669; font-weight:700; margin-bottom:2px;">¡Ahorro aplicado: ${formatearDinero(v.descuentoMonto)}!</div>`);
            }
            if (cfg.mensajePie) {
                bloques.push(`<div>${String(cfg.mensajePie).replace(/</g, '&lt;')}</div>`);
            }
            if (cfg.mostrarPieMarca && cfg.textoPieMarca) {
                bloques.push(`<div style="margin-top:2px; font-weight:700; opacity:0.85;">${String(cfg.textoPieMarca).replace(/</g, '&lt;')}</div>`);
            }
            pieEl.innerHTML = bloques.join('');
            pieEl.style.display = bloques.length > 0 ? 'block' : 'none';
        }

        // Actualizar texto del botón PDF según ancho configurado (80mm / 58mm)
        const btnPdf = document.getElementById('btn-fin-tk-pdf80');
        if (btnPdf) btnPdf.textContent = `🖨️ Ticket ${cfg.anchoMm}mm (PDF)`;
    }

    /* --- 7. EXPONER API GLOBAL Y CONECTAR CON POS Y FINANZAS --- */
    window.TicketEngine = {
        obtenerConfig: obtenerConfigTicket,
        guardarConfig: guardarConfigTicket,
        obtenerDatosNegocio,
        normalizarVenta,
        construirTextoThermal,
        descargarPdfThermal,
        construirTextoWhatsApp,
        abrirWhatsAppTicket,
        mejorarModalTicketPC,
        sanitizarParaPdfThermal
    };

    // Enganchar funciones de POS y Finanzas automáticamente
    if (typeof window.construirTextoTicketVentaThermal === 'function') {
        window.construirTextoTicketVentaThermal = (venta, anchoMm) => construirTextoThermal(venta, anchoMm);
    }
    if (typeof window.descargarPdfTicket80mmDesdeFinanzas === 'function') {
        window.descargarPdfTicket80mmDesdeFinanzas = (venta) => descargarPdfThermal(venta);
    }
    if (typeof window.reenviarTicketWhatsAppDesdeFinanzas === 'function') {
        window.reenviarTicketWhatsAppDesdeFinanzas = (venta) => abrirWhatsAppTicket(venta);
    }
    if (typeof window.abrirModalTicketFinanzas === 'function') {
        const _origModalFin = window.abrirModalTicketFinanzas;
        window.abrirModalTicketFinanzas = function (venta) {
            _origModalFin(venta);
            mejorarModalTicketPC(venta);
        };
    }

    // Interceptar también envío de WhatsApp / PDF térmico si existe desde POS Auditoría
    ['enviarTicketWhatsAppPos', 'compartirTicketWhatsAppPos'].forEach((fnName) => {
        if (typeof window[fnName] === 'function') {
            window[fnName] = (venta, tel) => abrirWhatsAppTicket(venta, tel);
        }
    });
    ['descargarPdfTicketPos', 'descargarTicketPdf80mmPos'].forEach((fnName) => {
        if (typeof window[fnName] === 'function') {
            window[fnName] = (venta, anchoMm) => descargarPdfThermal(venta, anchoMm);
        }
    });
})();

