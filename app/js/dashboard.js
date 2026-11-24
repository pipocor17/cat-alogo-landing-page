document.addEventListener('DOMContentLoaded', () => {
    const viewport = document.getElementById('app-viewport');
    const pageTitle = document.getElementById('main-title');
    const navLinks = document.querySelectorAll('.nav-link[data-vista]');
    let chartInstance = null;

    /* ==========================================
       MOTOR DE CARGA DE VISTAS (SPA con Fetch)
       ========================================== */
    async function cargarVista(nombreVista, titulo) {
        try {
            // Actualiza el título en la barra superior
            if (titulo) pageTitle.textContent = titulo;

            // Busca el archivo HTML dentro de app/vistas/
            const respuesta = await fetch(`vistas/${nombreVista}.html`);

            if (!respuesta.ok) {
                throw new Error('Vista aún no creada');
            }

            const html = await respuesta.text();
            viewport.innerHTML = html;

            // Inicializa la lógica específica según la vista cargada
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
            // Pantalla elegante si el módulo todavía no tiene su archivo HTML
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

            // Cambia el botón iluminado en el menú
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            link.parentElement.classList.add('active');

            // Lee el nombre de la vista y el título desde el HTML
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

        // Si ya existía un gráfico previo, lo destruye antes de dibujar el nuevo
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
            window.location.href = '../index.html';
        });
    }

    // Carga la vista inicial por defecto al abrir el panel
    cargarVista('inicio', 'Panel de Control Operativo');
});

