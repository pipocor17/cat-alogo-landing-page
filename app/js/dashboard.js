document.addEventListener('DOMContentLoaded', () => {
    const viewport = document.getElementById('app-viewport');
    const pageTitle = document.getElementById('main-title');
    const navLinks = document.querySelectorAll('.nav-link[data-vista]');
    let chartInstance = null;
    let vistaActualCargada = false;
    let vistaPendiente = { vista: 'inicio', titulo: 'Panel de Control Operativo' };

    /* ==========================================
       BLINDAJE DE ACCESO (ANTI-BYPASS OFFLINE)
       ========================================== */
    function tieneAccesoAutorizado() {
        const authApi = window.CatAlogoAuth;
        if (!authApi || typeof authApi.getState !== 'function') return false;
        const st = authApi.getState();
        if (st.modoLocalSinFirebase) return true;
        if (window.CAT_ALOGO_CLOUD_CONFIG?.exigirLoginConFirebase === false && !st.user) return true;
        if (!st.uid || !st.user || !st.user.emailVerified) return false;
        return Boolean(st.subscripcion?.activa) && !st.bloqueado;
    }

    function vaciarPanelBloqueado() {
        if (chartInstance) {
            try { chartInstance.destroy(); } catch { /* ignore */ }
            chartInstance = null;
        }
        if (viewport) viewport.innerHTML = '';
        vistaActualCargada = false;
    }

    function mostrarAvisoGuardiaFaltante() {
        if (document.getElementById('cat-security-missing-screen')) return;
        const div = document.createElement('div');
        div.id = 'cat-security-missing-screen';
        div.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:Inter,sans-serif;';
        div.innerHTML = `
            <div style="max-width:420px;background:#1e293b;border:1px solid #334155;border-radius:16px;padding:28px;">
                <div style="font-size:2.2rem;margin-bottom:10px;">🛡️</div>
                <h2 style="margin:0 0 8px;font-size:1.15rem;">No se pudo verificar la seguridad</h2>
                <p style="margin:0 0 18px;font-size:0.86rem;color:#cbd5e1;line-height:1.45;">
                    El módulo de autenticación no se cargó correctamente. Recargá la página para continuar.
                </p>
                <button type="button" onclick="window.location.reload()" style="background:#047857;color:#fff;border:none;border-radius:10px;padding:10px 18px;font-weight:700;cursor:pointer;">
                    🔄 Recargar Cat-Alogo
                </button>
            </div>
        `;
        document.body.appendChild(div);
    }

    /* ==========================================
       MOTOR DE CARGA DE VISTAS (SPA con Fetch)
       ========================================== */
    async function cargarVista(nombreVista, titulo) {
        if (!tieneAccesoAutorizado()) {
            vaciarPanelBloqueado();
            return;
        }

        vistaPendiente = { vista: nombreVista, titulo: titulo || vistaPendiente.titulo };

        try {
            if (titulo && pageTitle) pageTitle.textContent = titulo;

            const respuesta = await fetch(`vistas/${nombreVista}.html`);

            if (!respuesta.ok) {
                throw new Error('Vista aún no creada');
            }

            const html = await respuesta.text();

            // Re-verificar por si la sesión caducó durante el fetch
            if (!tieneAccesoAutorizado()) {
                vaciarPanelBloqueado();
                return;
            }

            viewport.innerHTML = html;
            vistaActualCargada = true;

            if (nombreVista === 'inicio' || nombreVista === 'dashboard') {
                if (typeof inicializarInicio === 'function') {
                    inicializarInicio();
                } else {
                    inicializarGraficoIngresos();
                }
            } else if (nombreVista === 'inventario' && typeof inicializarInventario === 'function') {
                inicializarInventario();
            } else if (nombreVista === 'diseno-pdf' && typeof inicializarDisenoPdf === 'function') {
                inicializarDisenoPdf();
            } else if (nombreVista === 'control-stock' && typeof inicializarControlStock === 'function') {
                inicializarControlStock();
            } else if (nombreVista === 'clientes' && typeof inicializarClientes === 'function') {
                inicializarClientes();
            } else if (nombreVista === 'pos' && typeof inicializarPos === 'function') {
                inicializarPos();
            } else if (nombreVista === 'finanzas' && typeof inicializarFinanzas === 'function') {
                inicializarFinanzas();
            } else if (nombreVista === 'cat-web' && typeof inicializarCatWeb === 'function') {
                inicializarCatWeb();
            } else if ((nombreVista === 'configuracion' || nombreVista === 'ajustes') && typeof inicializarConfiguracion === 'function') {
                inicializarConfiguracion();
            }

        } catch (error) {
            console.error(`Error cargando la vista "${nombreVista}":`, error);
            viewport.innerHTML = `
                <div class="card" style="text-align: center; padding: 4rem 2rem;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">🚧</div>
                    <h2 style="margin-bottom: 0.5rem;">Módulo "${nombreVista}" en construcción</h2>
                    <p style="color: var(--text-muted);">
                        Crea el archivo <strong>app/vistas/${nombreVista}.html</strong> para activar esta pantalla.
                    </p>
                </div>
            `;
        }
    }

    /* ==========================================
       EVENTOS DEL MENÚ LATERAL (SIDEBAR)
       ========================================== */
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            if (!tieneAccesoAutorizado()) return;

            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            link.parentElement.classList.add('active');

            const vista = link.getAttribute('data-vista');
            const titulo = link.getAttribute('data-titulo');

            cargarVista(vista, titulo);
        });
    });

    /* ==========================================
       GRÁFICO DE INGRESOS (Solo en vista 'inicio')
       ========================================== */
    function inicializarGraficoIngresos() {
        const canvas = document.getElementById('revenueChart');
        if (!canvas) return;

        if (chartInstance) {
            chartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        const gradientFill = ctx.createLinearGradient(0, 0, 0, 300);
        gradientFill.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
        gradientFill.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'],
                datasets: [{
                    label: 'Ingresos',
                    data: [1200, 3000, 2400, 4200, 5500, 6100, 8500],
                    borderColor: '#6366f1',
                    borderWidth: 3,
                    backgroundColor: gradientFill,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#6366f1',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: (context) => '$' + context.parsed.y.toLocaleString()
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        border: { display: false },
                        grid: { color: 'rgba(226, 232, 240, 0.5)' },
                        ticks: { callback: (value) => '$' + value.toLocaleString() }
                    }
                }
            }
        });
    }

    /* ==========================================
       CERRAR SESIÓN
       ========================================== */
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.CatAlogoAuth?.cerrarSesion) {
                window.CatAlogoAuth.cerrarSesion();
            } else {
                window.location.href = '../index.html';
            }
        });
    }

    /* ==========================================
       REACCIÓN EN VIVO A AUTH Y SUSCRIPCIÓN
       ========================================== */
    function sincronizarPanelConLicencia() {
        if (!window.CatAlogoAuth) {
            vaciarPanelBloqueado();
            mostrarAvisoGuardiaFaltante();
            return;
        }
        if (tieneAccesoAutorizado()) {
            if (!vistaActualCargada) {
                cargarVista(vistaPendiente.vista, vistaPendiente.titulo);
            }
        } else {
            vaciarPanelBloqueado();
        }
    }

    window.addEventListener('cat-alogo:suscripcion-actualizada', sincronizarPanelConLicencia);
    window.addEventListener('cat-alogo:auth-cambiado', sincronizarPanelConLicencia);

    // Arranque seguro: si bloquearon auth-guard.js en DevTools, frena la app
    if (!window.CatAlogoAuth) {
        mostrarAvisoGuardiaFaltante();
    } else if (tieneAccesoAutorizado()) {
        cargarVista('inicio', 'Panel de Control Operativo');
    }
});
