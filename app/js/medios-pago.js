/* ==========================================================================
   MOTOR CENTRAL: MEDIOS DE PAGO, RECARGOS, DESCUENTOS, REDONDEO Y ALIAS/CBU
   (BÓVEDA LOCAL COMPARTIDA ENTRE POS, FINANZAS, CAT-WEB Y AJUSTES)
   ========================================================================== */
(function () {
    const STORAGE_KEY_MP = 'cat_alogo_medios_pago_v1';

    const DEFAULT_CONFIG_MP = {
        reglasGlobales: {
            noAcumularConOfertas: false,
            noAcumularConDescuentoManual: true,
            redondeo: 0 // 0 = exacto, 10, 50, 100
        },
        datosBancarios: {
            alias: '',
            cbu: '',
            titular: '',
            banco: ''
        },
        medios: [
            // Medios físicos y bancarios
            { id: 'efectivo', nombre: 'Efectivo', grupo: 'fisicos', habilitado: true, modo: 'sin_modificar', porcentaje: 10, esPersonalizado: false },
            { id: 'debito', nombre: 'Tarjeta de débito', grupo: 'fisicos', habilitado: true, modo: 'recargo', porcentaje: 5, esPersonalizado: false },
            { id: 'credito', nombre: 'Tarjeta de crédito', grupo: 'fisicos', habilitado: false, modo: 'recargo', porcentaje: 10, esPersonalizado: false },
            { id: 'prepaga', nombre: 'Tarjeta prepaga', grupo: 'fisicos', habilitado: false, modo: 'sin_modificar', porcentaje: 0, esPersonalizado: false },
            { id: 'transferencia', nombre: 'Transferencia / CBU / Alias', grupo: 'fisicos', habilitado: true, modo: 'sin_modificar', porcentaje: 0, esPersonalizado: false },
            { id: 'homebanking', nombre: 'Homebanking', grupo: 'fisicos', habilitado: false, modo: 'sin_modificar', porcentaje: 0, esPersonalizado: false },
            // Medios digitales y electrónicos
            { id: 'billeteras', nombre: 'Billeteras virtuales', grupo: 'digitales', habilitado: false, modo: 'sin_modificar', porcentaje: 0, esPersonalizado: false },
            { id: 'nfc', nombre: 'Pagos sin contacto (NFC)', grupo: 'digitales', habilitado: false, modo: 'sin_modificar', porcentaje: 0, esPersonalizado: false },
            { id: 'plataformas', nombre: 'Plataformas online', grupo: 'digitales', habilitado: false, modo: 'recargo', porcentaje: 6, esPersonalizado: false }
        ]
    };

    let draftConfig = null;

    function clonar(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function escaparHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatearArs(v) {
        const n = Number(v) || 0;
        return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    }

    /* ======================================================================
       LECTURA / ESCRITURA EN BÓVEDA LOCAL
       ====================================================================== */
    function obtenerConfig() {
        try {
            const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_MP) || 'null');
            if (!raw || !Array.isArray(raw.medios) || raw.medios.length === 0) {
                return clonar(DEFAULT_CONFIG_MP);
            }
            return {
                reglasGlobales: {
                    ...DEFAULT_CONFIG_MP.reglasGlobales,
                    ...(raw.reglasGlobales || {})
                },
                datosBancarios: {
                    ...DEFAULT_CONFIG_MP.datosBancarios,
                    ...(raw.datosBancarios || {})
                },
                medios: raw.medios.map(m => ({
                    id: String(m.id || ''),
                    nombre: String(m.nombre || 'Medio'),
                    grupo: m.grupo || 'fisicos',
                    habilitado: !!m.habilitado,
                    modo: ['sin_modificar', 'descuento', 'recargo'].includes(m.modo) ? m.modo : 'sin_modificar',
                    porcentaje: Math.max(0, Math.min(100, Number(m.porcentaje) || 0)),
                    esPersonalizado: !!m.esPersonalizado
                }))
            };
        } catch {
            return clonar(DEFAULT_CONFIG_MP);
        }
    }

    function guardarConfig(cfg) {
        localStorage.setItem(STORAGE_KEY_MP, JSON.stringify(cfg));
        window.dispatchEvent(new CustomEvent('cat-alogo:medios-pago-actualizados', { detail: cfg }));
    }

    function obtenerMediosHabilitados() {
        return obtenerConfig().medios.filter(m => m.habilitado);
    }

    function buscarMedio(idONombre, cfgOpt) {
        const cfg = cfgOpt || obtenerConfig();
        const q = String(idONombre || '').trim().toLowerCase();
        if (!q) return null;
        return cfg.medios.find(m => m.id.toLowerCase() === q || m.nombre.toLowerCase() === q) || null;
    }

    /* ======================================================================
       MOTOR DE CÁLCULO (INDIVIDUAL, MIXTO PROPORCIONAL Y REDONDEO)
       ====================================================================== */
    function redondearMonto(monto, paso) {
        const n = Number(monto) || 0;
        const p = Number(paso) || 0;
        if (p <= 0) return Math.round(n * 100) / 100;
        return Math.round(n / p) * p;
    }

    /**
     * Calcula el ajuste para un monto y medio de pago.
     * opciones: { aplicarReglaAutomatica: true, tieneDescuentoManual: false, montoElegibleSinOfertas: null }
     */
    function calcularAjusteMedio(montoBase, medioIdONombre, opciones = {}) {
        const cfg = obtenerConfig();
        const base = Math.max(0, Number(montoBase) || 0);
        const medio = buscarMedio(medioIdONombre, cfg);

        const aplicarAuto = opciones.aplicarReglaAutomatica !== false;
        if (!aplicarAuto || !medio || medio.modo === 'sin_modificar' || medio.porcentaje <= 0 || base <= 0) {
            return {
                medioNombre: medio ? medio.nombre : String(medioIdONombre || ''),
                modo: 'sin_modificar',
                porcentaje: 0,
                montoBase: base,
                delta: 0,
                totalFinal: redondearMonto(base, cfg.reglasGlobales.redondeo),
                motivoBloqueo: !aplicarAuto ? 'Excepción manual en caja' : ''
            };
        }

        // Protección de margen: no acumular descuento con descuento manual
        if (medio.modo === 'descuento' && cfg.reglasGlobales.noAcumularConDescuentoManual && opciones.tieneDescuentoManual) {
            return {
                medioNombre: medio.nombre,
                modo: 'sin_modificar',
                porcentaje: 0,
                montoBase: base,
                delta: 0,
                totalFinal: redondearMonto(base, cfg.reglasGlobales.redondeo),
                motivoBloqueo: 'No acumulable con descuento manual'
            };
        }

        // Protección de margen: excluir artículos que ya están en Precio Oferta (si el POS pasa montoElegibleSinOfertas)
        let baseCalculo = base;
        if (
            medio.modo === 'descuento' &&
            cfg.reglasGlobales.noAcumularConOfertas &&
            typeof opciones.montoElegibleSinOfertas === 'number'
        ) {
            baseCalculo = Math.max(0, Math.min(base, opciones.montoElegibleSinOfertas));
        }

        const signo = medio.modo === 'descuento' ? -1 : 1;
        const deltaBruto = baseCalculo * (medio.porcentaje / 100) * signo;
        const totalRedondeado = redondearMonto(base + deltaBruto, cfg.reglasGlobales.redondeo);
        const deltaFinal = Math.round((totalRedondeado - base) * 100) / 100;

        return {
            medioNombre: medio.nombre,
            modo: medio.modo,
            porcentaje: medio.porcentaje,
            montoBase: base,
            delta: deltaFinal,
            totalFinal: Math.max(0, totalRedondeado),
            motivoBloqueo: ''
        };
    }

    /**
     * Calcula ajustes proporcionales para Pagos Mixtos:
     * listaPagos = [{ medio: 'Efectivo', montoBase: 20000 }, { medio: 'Tarjeta de débito', montoBase: 10000 }]
     */
    function calcularAjustesPagosMixtos(listaPagos, opciones = {}) {
        const cfg = obtenerConfig();
        const detalle = (listaPagos || []).map(p => calcularAjusteMedio(p.montoBase, p.medio, opciones));
        const totalBase = detalle.reduce((a, d) => a + d.montoBase, 0);
        const totalDescuento = detalle.filter(d => d.delta < 0).reduce((a, d) => a + Math.abs(d.delta), 0);
        const totalRecargo = detalle.filter(d => d.delta > 0).reduce((a, d) => a + d.delta, 0);
        const totalFinal = redondearMonto(totalBase - totalDescuento + totalRecargo, cfg.reglasGlobales.redondeo);

        return {
            detalle,
            totalBase: Math.round(totalBase * 100) / 100,
            totalDescuento: Math.round(totalDescuento * 100) / 100,
            totalRecargo: Math.round(totalRecargo * 100) / 100,
            totalFinal: Math.max(0, totalFinal)
        };
    }

    function obtenerTextoTransferenciaWhatsApp() {
        const d = obtenerConfig().datosBancarios;
        if (!d.alias && !d.cbu) return '';
        const lineas = ['🏦 *Datos para Transferencia:*'];
        if (d.alias) lineas.push(`• Alias: *${d.alias}*`);
        if (d.cbu) lineas.push(`• CBU/CVU: ${d.cbu}`);
        if (d.titular) lineas.push(`• Titular: ${d.titular}`);
        if (d.banco) lineas.push(`• Entidad: ${d.banco}`);
        return lineas.join('\n');
    }

    /* ======================================================================
       MODAL AUTOCONTENIDO (SE INYECTA UNA VEZ EN DOCUMENT.BODY)
       ====================================================================== */
    function asegurarModalEnDom() {
        let modal = document.getElementById('modal-medios-pago-global');
        if (modal) return modal;

        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <div class="mp-modal-overlay" id="modal-medios-pago-global" aria-hidden="true">
                <div class="mp-modal-xl" role="dialog" aria-labelledby="mp-modal-title">
                    <header class="mp-header">
                        <div>
                            <h3 id="mp-modal-title">💳 Medios de Pago, Recargos y Descuentos</h3>
                            <p>Configura los medios habilitados en caja, porcentajes automáticos, protección de margen, redondeo y tus datos de Transferencia.</p>
                        </div>
                        <button type="button" class="mp-close-btn" id="btn-mp-cerrar" title="Cerrar">✕</button>
                    </header>

                    <div class="mp-body-grid">
                        <!-- COLUMNA IZQUIERDA: HABILITADOS + PERSONALIZADOS + ALIAS/CBU -->
                        <div class="mp-col">
                            <section class="mp-card">
                                <div class="mp-card-head">
                                    <strong>✅ Métodos de Pago Habilitados</strong>
                                    <span class="mp-pill-count" id="mp-pill-activos">0 activos</span>
                                </div>
                                <p class="mp-card-sub">Los medios marcados estarán disponibles en POS, Finanzas y Cat-Web.</p>

                                <span class="mp-group-lbl">Medios Físicos y Bancarios</span>
                                <div class="mp-check-list" id="mp-list-fisicos"></div>

                                <span class="mp-group-lbl is-digital">Medios Digitales y Electrónicos</span>
                                <div class="mp-check-list" id="mp-list-digitales"></div>

                                <span class="mp-group-lbl is-custom" id="mp-lbl-custom" style="display:none;">Medios Personalizados</span>
                                <div class="mp-check-list" id="mp-list-custom"></div>

                                <div class="mp-add-custom-row">
                                    <input type="text" id="mp-new-name" class="mp-input" placeholder="Ej: Cuenta DNI, Crédito 3 cuotas...">
                                    <select id="mp-new-group" class="mp-select">
                                        <option value="digitales">Digital</option>
                                        <option value="fisicos">Físico / Banc.</option>
                                    </select>
                                    <button type="button" class="mp-btn mp-btn-indigo" id="btn-mp-add-custom">+ Agregar</button>
                                </div>
                            </section>

                            <section class="mp-card">
                                <div class="mp-card-head">
                                    <strong>🏦 Datos de Cobro (Transferencia / Billeteras)</strong>
                                </div>
                                <p class="mp-card-sub">Se muestran en pantalla al cobrar y se incluyen automáticamente en comprobantes de WhatsApp.</p>
                                <div class="mp-form-grid-2">
                                    <div class="mp-field">
                                        <label for="mp-inp-alias">Alias</label>
                                        <input type="text" id="mp-inp-alias" class="mp-input" placeholder="Ej: mi.comercio.mp">
                                    </div>
                                    <div class="mp-field">
                                        <label for="mp-inp-banco">Banco / Billetera</label>
                                        <input type="text" id="mp-inp-banco" class="mp-input" placeholder="Ej: Mercado Pago / Galicia">
                                    </div>
                                    <div class="mp-field">
                                        <label for="mp-inp-cbu">CBU / CVU</label>
                                        <input type="text" id="mp-inp-cbu" class="mp-input" placeholder="22 dígitos">
                                    </div>
                                    <div class="mp-field">
                                        <label for="mp-inp-titular">Titular</label>
                                        <input type="text" id="mp-inp-titular" class="mp-input" placeholder="Nombre y Apellido / Razón Social">
                                    </div>
                                </div>
                            </section>
                        </div>

                        <!-- COLUMNA DERECHA: RECARGOS Y DESCUENTOS + SIMULADOR + PROTECCIÓN -->
                        <div class="mp-col">
                            <section class="mp-card">
                                <div class="mp-card-head">
                                    <strong>🏷️ Recargos y Descuentos por Pago</strong>
                                    <span class="mp-pill-count">Simulador base: $10.000</span>
                                </div>
                                <p class="mp-card-sub">Aplica porcentajes automáticos sobre el subtotal según la forma de pago elegida (en pagos mixtos se calcula proporcionalmente).</p>

                                <div class="mp-rules-list" id="mp-rules-list"></div>
                            </section>

                            <section class="mp-card">
                                <div class="mp-card-head">
                                    <strong>🛡️ Protección de Margen y Redondeo de Caja</strong>
                                </div>

                                <label class="mp-switch-opt">
                                    <input type="checkbox" id="mp-chk-no-ofertas">
                                    <span><strong>No acumular con Ofertas:</strong> evita aplicar descuento por pago sobre artículos que ya tienen Precio Oferta.</span>
                                </label>

                                <label class="mp-switch-opt">
                                    <input type="checkbox" id="mp-chk-no-desc-manual">
                                    <span><strong>No acumular con Descuento Manual:</strong> si el cajero carga un descuento manual en el POS, no suma el descuento del medio de pago.</span>
                                </label>

                                <div class="mp-field" style="margin-top:0.2rem;">
                                    <label for="mp-sel-redondeo">Redondeo automático al aplicar recargo/descuento</label>
                                    <select id="mp-sel-redondeo" class="mp-select">
                                        <option value="0">Sin redondeo (monto exacto)</option>
                                        <option value="10">Redondear al $10 más cercano</option>
                                        <option value="50">Redondear al $50 más cercano</option>
                                        <option value="100">Redondear al $100 más cercano</option>
                                    </select>
                                </div>
                            </section>
                        </div>
                    </div>

                    <footer class="mp-footer">
                        <span class="mp-footer-meta" id="mp-footer-meta">—</span>
                        <div class="mp-footer-actions">
                            <button type="button" class="mp-btn mp-btn-light" id="btn-mp-cancelar">Cancelar</button>
                            <button type="button" class="mp-btn mp-btn-primary" id="btn-mp-guardar">💾 Guardar Configuración</button>
                        </div>
                    </footer>
                </div>
            </div>
        `;
        modal = wrap.firstElementChild;
        document.body.appendChild(modal);
        enlazarEventosModal(modal);
        return modal;
    }

    function renderizarModal() {
        if (!draftConfig) return;
        const { medios, reglasGlobales, datosBancarios } = draftConfig;

        const activos = medios.filter(m => m.habilitado);
        const pill = document.getElementById('mp-pill-activos');
        if (pill) pill.textContent = `${activos.length} activos de ${medios.length}`;

        const renderGrupo = (lista, contId) => {
            const cont = document.getElementById(contId);
            if (!cont) return;
            cont.innerHTML = lista.map(m => `
                <label class="mp-check-item ${m.habilitado ? 'is-enabled' : ''}">
                    <span class="mp-check-left">${escaparHtml(m.nombre)}</span>
                    <span class="mp-check-right">
                        ${m.esPersonalizado ? `<button type="button" class="mp-del-custom" data-mp-del="${escaparHtml(m.id)}" title="Eliminar medio personalizado">✕</button>` : ''}
                        <input type="checkbox" data-mp-toggle="${escaparHtml(m.id)}" ${m.habilitado ? 'checked' : ''}>
                    </span>
                </label>
            `).join('');
        };

        renderGrupo(medios.filter(m => !m.esPersonalizado && m.grupo === 'fisicos'), 'mp-list-fisicos');
        renderGrupo(medios.filter(m => !m.esPersonalizado && m.grupo === 'digitales'), 'mp-list-digitales');

        const personalizados = medios.filter(m => m.esPersonalizado);
        const lblCustom = document.getElementById('mp-lbl-custom');
        if (lblCustom) lblCustom.style.display = personalizados.length > 0 ? 'block' : 'none';
        renderGrupo(personalizados, 'mp-list-custom');

        // Columna derecha: solo medios habilitados con simulador sobre $10.000
        const rulesCont = document.getElementById('mp-rules-list');
        if (rulesCont) {
            if (activos.length === 0) {
                rulesCont.innerHTML = `<div style="text-align:center; padding:1.4rem; color:#64748b; font-size:0.78rem; border:1px dashed #cbd5e1; border-radius:10px;">Habilita al menos un medio de pago a la izquierda para configurar sus porcentajes.</div>`;
            } else {
                const pasoRed = Number(reglasGlobales.redondeo) || 0;
                rulesCont.innerHTML = activos.map(m => {
                    const baseSim = 10000;
                    const signo = m.modo === 'descuento' ? -1 : (m.modo === 'recargo' ? 1 : 0);
                    const finalSim = signo === 0 ? baseSim : redondearMonto(baseSim + baseSim * (m.porcentaje / 100) * signo, pasoRed);
                    const diffSim = finalSim - baseSim;

                    let simHtml = `<span class="mp-sim-pill">$10.000 → Sin cambio</span>`;
                    if (diffSim < 0) simHtml = `<span class="mp-sim-pill is-desc">$10.000 → ${formatearArs(finalSim)} (${formatearArs(diffSim)})</span>`;
                    if (diffSim > 0) simHtml = `<span class="mp-sim-pill is-rec">$10.000 → ${formatearArs(finalSim)} (+${formatearArs(diffSim)})</span>`;

                    return `
                        <div class="mp-rule-row mode-${m.modo}">
                            <div class="mp-rule-top">
                                <span class="mp-rule-name">${escaparHtml(m.nombre)}</span>
                                ${simHtml}
                            </div>
                            <div class="mp-rule-controls">
                                <select class="mp-select" data-mp-modo="${escaparHtml(m.id)}">
                                    <option value="sin_modificar" ${m.modo === 'sin_modificar' ? 'selected' : ''}>Sin modificar</option>
                                    <option value="descuento" ${m.modo === 'descuento' ? 'selected' : ''}>Descuento (-)</option>
                                    <option value="recargo" ${m.modo === 'recargo' ? 'selected' : ''}>Recargo (+)</option>
                                </select>
                                <div class="mp-pct-wrap">
                                    <input type="number" class="mp-input" data-mp-pct="${escaparHtml(m.id)}" min="0" max="100" step="0.5" value="${m.porcentaje}">
                                    <span>%</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        // Reglas globales y datos bancarios
        const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };

        setChk('mp-chk-no-ofertas', reglasGlobales.noAcumularConOfertas);
        setChk('mp-chk-no-desc-manual', reglasGlobales.noAcumularConDescuentoManual);
        setVal('mp-sel-redondeo', String(reglasGlobales.redondeo || 0));

        setVal('mp-inp-alias', datosBancarios.alias);
        setVal('mp-inp-banco', datosBancarios.banco);
        setVal('mp-inp-cbu', datosBancarios.cbu);
        setVal('mp-inp-titular', datosBancarios.titular);

        const foot = document.getElementById('mp-footer-meta');
        if (foot) {
            const conRegla = activos.filter(m => m.modo !== 'sin_modificar' && m.porcentaje > 0).length;
            foot.textContent = `${activos.length} medios activos • ${conRegla} con ajuste automático • Redondeo: ${reglasGlobales.redondeo > 0 ? '$' + reglasGlobales.redondeo : 'Exacto'}`;
        }
    }

    function enlazarEventosModal(modal) {
        const cerrar = () => {
            modal.classList.remove('active');
            modal.style.display = 'none';
        };

        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.closest('#btn-mp-cerrar') || e.target.closest('#btn-mp-cancelar')) {
                cerrar();
                return;
            }

            // Eliminar medio personalizado
            const btnDel = e.target.closest('[data-mp-del]');
            if (btnDel && draftConfig) {
                e.preventDefault();
                e.stopPropagation();
                const id = btnDel.getAttribute('data-mp-del');
                draftConfig.medios = draftConfig.medios.filter(m => m.id !== id);
                renderizarModal();
                return;
            }

            // Agregar medio personalizado
            if (e.target.closest('#btn-mp-add-custom') && draftConfig) {
                const inp = document.getElementById('mp-new-name');
                const grp = document.getElementById('mp-new-group')?.value || 'digitales';
                const nombre = (inp?.value || '').trim();
                if (!nombre) { inp?.focus(); return; }
                const id = 'custom_' + Date.now();
                draftConfig.medios.push({
                    id,
                    nombre,
                    grupo: grp,
                    habilitado: true,
                    modo: 'sin_modificar',
                    porcentaje: 0,
                    esPersonalizado: true
                });
                if (inp) inp.value = '';
                renderizarModal();
                return;
            }

            // Guardar configuración
            if (e.target.closest('#btn-mp-guardar') && draftConfig) {
                const activos = draftConfig.medios.filter(m => m.habilitado);
                if (activos.length === 0) {
                    alert('Debes dejar habilitado al menos 1 medio de pago.');
                    return;
                }
                guardarConfig(draftConfig);
                cerrar();
                alert('✅ Configuración de Medios de Pago, Recargos y Descuentos guardada en tu Bóveda Local.');
            }
        });

        modal.addEventListener('change', (e) => {
            if (!draftConfig) return;

            const toggleId = e.target.getAttribute('data-mp-toggle');
            if (toggleId) {
                const m = draftConfig.medios.find(x => x.id === toggleId);
                if (m) m.habilitado = e.target.checked;
                renderizarModal();
                return;
            }

            const modoId = e.target.getAttribute('data-mp-modo');
            if (modoId) {
                const m = draftConfig.medios.find(x => x.id === modoId);
                if (m) m.modo = e.target.value;
                renderizarModal();
                return;
            }

            if (e.target.id === 'mp-chk-no-ofertas') {
                draftConfig.reglasGlobales.noAcumularConOfertas = e.target.checked;
                return;
            }
            if (e.target.id === 'mp-chk-no-desc-manual') {
                draftConfig.reglasGlobales.noAcumularConDescuentoManual = e.target.checked;
                return;
            }
            if (e.target.id === 'mp-sel-redondeo') {
                draftConfig.reglasGlobales.redondeo = parseInt(e.target.value, 10) || 0;
                renderizarModal();
            }
        });

        modal.addEventListener('input', (e) => {
            if (!draftConfig) return;

            const pctId = e.target.getAttribute('data-mp-pct');
            if (pctId) {
                const m = draftConfig.medios.find(x => x.id === pctId);
                if (m) {
                    m.porcentaje = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                    // Actualizar solo la pill del simulador de esta fila sin perder foco del input
                    const row = e.target.closest('.mp-rule-row');
                    const pill = row?.querySelector('.mp-sim-pill');
                    if (pill) {
                        const baseSim = 10000;
                        const pasoRed = Number(draftConfig.reglasGlobales.redondeo) || 0;
                        const signo = m.modo === 'descuento' ? -1 : (m.modo === 'recargo' ? 1 : 0);
                        const finalSim = signo === 0 ? baseSim : redondearMonto(baseSim + baseSim * (m.porcentaje / 100) * signo, pasoRed);
                        const diffSim = finalSim - baseSim;
                        pill.className = 'mp-sim-pill' + (diffSim < 0 ? ' is-desc' : (diffSim > 0 ? ' is-rec' : ''));
                        pill.textContent = diffSim === 0
                            ? '$10.000 → Sin cambio'
                            : `$10.000 → ${formatearArs(finalSim)} (${diffSim > 0 ? '+' : ''}${formatearArs(diffSim)})`;
                    }
                }
                return;
            }

            if (e.target.id === 'mp-inp-alias') draftConfig.datosBancarios.alias = e.target.value.trim();
            if (e.target.id === 'mp-inp-banco') draftConfig.datosBancarios.banco = e.target.value.trim();
            if (e.target.id === 'mp-inp-cbu') draftConfig.datosBancarios.cbu = e.target.value.trim();
            if (e.target.id === 'mp-inp-titular') draftConfig.datosBancarios.titular = e.target.value.trim();
        });
    }

    function abrirModal() {
        draftConfig = obtenerConfig();
        const modal = asegurarModalEnDom();
        renderizarModal();
        modal.style.display = 'flex';
        modal.classList.add('active');
    }

    function cerrarModal() {
        const modal = document.getElementById('modal-medios-pago-global');
        if (!modal) return;
        modal.classList.remove('active');
        modal.style.display = 'none';
    }

    // Delegación global: cualquier botón con [data-abrir-medios-pago] abre el modal en cualquier vista SPA
    document.addEventListener('click', (e) => {
        if (e.target.closest('[data-abrir-medios-pago]')) {
            e.preventDefault();
            abrirModal();
        }
    });

    // API pública para POS, Finanzas, Cat-Web y Ajustes
    window.MediosPagoEngine = {
        STORAGE_KEY: STORAGE_KEY_MP,
        obtenerConfig,
        guardarConfig,
        obtenerMediosHabilitados,
        buscarMedio,
        redondearMonto,
        calcularAjusteMedio,
        calcularAjustesPagosMixtos,
        obtenerTextoTransferenciaWhatsApp,
        abrirModal,
        cerrarModal
    };
})();

