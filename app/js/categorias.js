/* ==========================================================================
   MÓDULO: GESTOR DE CATEGORÍAS PERSONALIZADAS (SINCRONIZADO CON INVENTARIO)
   ========================================================================== */

const STORAGE_KEY_CATEGORIAS = 'cat_alogo_categorias_v1';
const CATEGORIAS_INICIALES = ['General', 'Textil & Indumentaria', 'Almacén & Gourmet', 'Hogar & Velas'];

let modalCategoriasCargado = false;

function cargarBovedaCategorias() {
    let guardadas = [];
    try {
        guardadas = JSON.parse(localStorage.getItem(STORAGE_KEY_CATEGORIAS) || '[]');
    } catch (e) {
        guardadas = [];
    }

    if (!Array.isArray(guardadas) || guardadas.length === 0) {
        guardadas = [...CATEGORIAS_INICIALES];
    }

    if (!guardadas.some(c => c.toLowerCase() === 'general')) {
        guardadas.unshift('General');
    }

    if (Array.isArray(window.bovedaProductos)) {
        window.bovedaProductos.forEach(p => {
            const cat = (p.categoria || '').trim();
            if (cat && !guardadas.some(c => c.toLowerCase() === cat.toLowerCase())) {
                guardadas.push(cat);
            }
        });
    }

    window.bovedaCategorias = ordenarCategorias(guardadas);
    guardarBovedaCategorias();
}

function ordenarCategorias(lista) {
    const sinDuplicados = [];
    lista.forEach(item => {
        const limpio = String(item || '').trim();
        if (limpio && !sinDuplicados.some(x => x.toLowerCase() === limpio.toLowerCase())) {
            sinDuplicados.push(limpio);
        }
    });

    return sinDuplicados.sort((a, b) => {
        if (a.toLowerCase() === 'general') return -1;
        if (b.toLowerCase() === 'general') return 1;
        return a.localeCompare(b, 'es', { sensitivity: 'base' });
    });
}

function guardarBovedaCategorias() {
    localStorage.setItem(STORAGE_KEY_CATEGORIAS, JSON.stringify(window.bovedaCategorias));
}

function registrarCategoriaSiNoExiste(nombre) {
    const limpio = String(nombre || '').trim();
    if (!limpio) return 'General';

    if (!Array.isArray(window.bovedaCategorias)) cargarBovedaCategorias();

    const existente = window.bovedaCategorias.find(c => c.toLowerCase() === limpio.toLowerCase());
    if (existente) return existente;

    window.bovedaCategorias.push(limpio);
    window.bovedaCategorias = ordenarCategorias(window.bovedaCategorias);
    guardarBovedaCategorias();
    sincronizarUIconCategorias();
    return limpio;
}

function contarProductosPorCategoria(nombreCat) {
    if (!Array.isArray(window.bovedaProductos)) return 0;
    return window.bovedaProductos.filter(
        p => (p.categoria || 'General').toLowerCase() === nombreCat.toLowerCase()
    ).length;
}

function sincronizarUIconCategorias(categoriaASeleccionar = null) {
    if (!Array.isArray(window.bovedaCategorias)) cargarBovedaCategorias();

    const selectCat = document.getElementById('prod-categoria');
    if (selectCat && selectCat.tagName === 'SELECT') {
        const valorPrevio = categoriaASeleccionar || selectCat.value || 'General';

        const opcionesHtml = window.bovedaCategorias
            .map(cat => `<option value="${escaparHtmlCat(cat)}">${escaparHtmlCat(cat)}</option>`)
            .join('');

        selectCat.innerHTML = opcionesHtml + `<option value="__nueva__">➕ Crear nueva categoría...</option>`;

        const existe = window.bovedaCategorias.some(c => c === valorPrevio);
        selectCat.value = existe ? valorPrevio : 'General';
    }

    renderizarChipsFiltroInventario();

    const listaModal = document.getElementById('lista-gestor-categorias');
    if (listaModal) {
        const filtro = document.getElementById('input-buscar-categoria')?.value || '';
        renderizarListaGestorCategorias(filtro);
    }
}

function renderizarChipsFiltroInventario() {
    const filtersRow = document.getElementById('inv-filters');
    if (!filtersRow) return;

    const productos = Array.isArray(window.bovedaProductos) ? window.bovedaProductos : [];
    const total = productos.length;
    const sinStock = productos.filter(p => Number(p.stock) <= 0).length;
    const enOferta = productos.filter(p => p.precioOferta > 0 && p.precioOferta < p.precioNormal).length;
    const ocultos = productos.filter(p => !(p.publicarWeb !== undefined ? !!p.publicarWeb : p.visible !== false)).length;

    let chipActivoActual = filtersRow.querySelector('.filter-chip.active')?.getAttribute('data-filter') || 'todos';

    const categoriasVisibles = window.bovedaCategorias.filter(cat => {
        const esGeneral = cat.toLowerCase() === 'general';
        return esGeneral || contarProductosPorCategoria(cat) > 0;
    });

    const filtrosDisponibles = [
        'todos',
        'sinstock',
        'oferta',
        ...categoriasVisibles.map(c => `cat:${c.toLowerCase()}`)
    ];
    if (ocultos > 0) filtrosDisponibles.push('ocultos');

    if (!filtrosDisponibles.includes(chipActivoActual)) {
        chipActivoActual = 'todos';
    }

    let html = `<button type="button" class="filter-chip ${chipActivoActual === 'todos' ? 'active' : ''}" data-filter="todos">Todos (${total})</button>`;

    categoriasVisibles.forEach(cat => {
        const cant = contarProductosPorCategoria(cat);
        const key = `cat:${cat.toLowerCase()}`;
        const activeClass = chipActivoActual === key ? 'active' : '';
        html += `<button type="button" class="filter-chip ${activeClass}" data-filter="${escaparHtmlCat(key)}">${escaparHtmlCat(cat)} (${cant})</button>`;
    });

    html += `
        <button type="button" class="filter-chip chip-danger ${chipActivoActual === 'sinstock' ? 'active' : ''}" data-filter="sinstock">⚠️ Sin Stock (${sinStock})</button>
        <button type="button" class="filter-chip chip-amber ${chipActivoActual === 'oferta' ? 'active' : ''}" data-filter="oferta">🏷️ En Oferta (${enOferta})</button>
    `;

    if (ocultos > 0) {
        html += `<button type="button" class="filter-chip ${chipActivoActual === 'ocultos' ? 'active' : ''}" data-filter="ocultos">👁️‍🗨️ Ocultos (${ocultos})</button>`;
    }

    filtersRow.innerHTML = html;

    filtersRow.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const dest = chip.getAttribute('data-filter');
            filtersRow.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            window.paginaActualInventario = 1;

            // Al tocar "Todos", limpia filtros secundarios y búsqueda para evitar bloqueos visuales
            if (dest === 'todos' && window.invProState) {
                window.invProState.canalFiltro = '';
                window.invProState.healthFiltro = 'todos';
                const sInp = document.getElementById('inv-search-input');
                if (sInp) sInp.value = '';
            }
            aplicarFiltroInventario(dest);
        });
    });

    aplicarFiltroInventario(chipActivoActual);
}

function aplicarFiltroInventario(filter) {
    if (typeof aplicarFiltrosYPaginacionInventario === 'function') {
        aplicarFiltrosYPaginacionInventario(false);
        return;
    }

    document.querySelectorAll('.inv-product-card').forEach(card => {
        if (filter === 'todos') {
            card.style.display = '';
        } else if (filter.startsWith('cat:')) {
            const catBuscada = filter.slice(4);
            const cardCat = (card.getAttribute('data-prod-cat') || card.getAttribute('data-category') || '').toLowerCase();
            card.style.display = (cardCat === catBuscada || cardCat.includes(catBuscada)) ? '' : 'none';
        } else {
            const cats = (card.getAttribute('data-category') || '').toLowerCase();
            card.style.display = cats.includes(filter) ? '' : 'none';
        }
    });
}

/* ==========================================================================
   MODAL: GESTOR DE CATEGORÍAS (ABRIR, CREAR, EDITAR, ELIMINAR)
   ========================================================================== */
async function abrirModalGestorCategorias() {
    if (!modalCategoriasCargado) {
        try {
            const resp = await fetch('modales/modal-categorias.html');
            if (!resp.ok) throw new Error('No se encontró app/modales/modal-categorias.html');
            const html = await resp.text();

            const container = document.getElementById('modals-container') || document.body;
            container.insertAdjacentHTML('beforeend', html);

            inicializarEventosModalCategorias();
            modalCategoriasCargado = true;
        } catch (err) {
            console.error(err);
            alert('Error cargando el Gestor de Categorías. Verifica que exista app/modales/modal-categorias.html.');
            return;
        }
    }

    cargarBovedaCategorias();
    renderizarListaGestorCategorias('');

    const buscador = document.getElementById('input-buscar-categoria');
    if (buscador) buscador.value = '';

    const overlay = document.getElementById('modal-gestor-categorias');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function cerrarModalGestorCategorias() {
    const overlay = document.getElementById('modal-gestor-categorias');
    if (overlay) overlay.classList.remove('active');

    const otroAbierto = document.querySelector('.prod-modal-overlay.active');
    if (!otroAbierto) document.body.style.overflow = '';
}

function inicializarEventosModalCategorias() {
    const overlay = document.getElementById('modal-gestor-categorias');
    const btnCerrar = document.getElementById('btn-cerrar-modal-cat');
    const btnListo = document.getElementById('btn-listo-modal-cat');
    const formNueva = document.getElementById('form-nueva-categoria');
    const inputBuscar = document.getElementById('input-buscar-categoria');
    const lista = document.getElementById('lista-gestor-categorias');

    btnCerrar.addEventListener('click', cerrarModalGestorCategorias);
    btnListo.addEventListener('click', cerrarModalGestorCategorias);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cerrarModalGestorCategorias();
    });

    formNueva.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('input-nueva-categoria');
        const nombre = input.value.trim();
        if (!nombre) return;

        if (window.bovedaCategorias.some(c => c.toLowerCase() === nombre.toLowerCase())) {
            alert(`La categoría "${nombre}" ya existe.`);
            return;
        }

        registrarCategoriaSiNoExiste(nombre);
        input.value = '';
        input.focus();
    });

    inputBuscar.addEventListener('input', (e) => {
        renderizarListaGestorCategorias(e.target.value);
    });

    lista.addEventListener('click', (e) => {
        const btnEdit = e.target.closest('.btn-cat-edit');
        if (btnEdit) {
            editarCategoriaExistente(btnEdit.getAttribute('data-cat'));
            return;
        }

        const btnDel = e.target.closest('.btn-cat-delete');
        if (btnDel) {
            eliminarCategoriaExistente(btnDel.getAttribute('data-cat'));
        }
    });
}

function renderizarListaGestorCategorias(filtroTexto = '') {
    const lista = document.getElementById('lista-gestor-categorias');
    const counter = document.getElementById('cat-total-count');
    if (!lista) return;

    const term = filtroTexto.trim().toLowerCase();
    const filtradas = window.bovedaCategorias.filter(c => c.toLowerCase().includes(term));

    if (counter) {
        counter.textContent = `${window.bovedaCategorias.length} ${window.bovedaCategorias.length === 1 ? 'categoría' : 'categorías'}`;
    }

    if (filtradas.length === 0) {
        lista.innerHTML = `<div class="cat-empty-state">No se encontraron categorías con "${escaparHtmlCat(filtroTexto)}".</div>`;
        return;
    }

    lista.innerHTML = filtradas.map(cat => {
        const cant = contarProductosPorCategoria(cat);
        const textoCant = `${cant} ${cant === 1 ? 'producto' : 'productos'}`;
        const esGeneral = cat.toLowerCase() === 'general';

        return `
            <div class="cat-item-card">
                <div class="cat-item-info">
                    <div class="cat-item-name">
                        ${escaparHtmlCat(cat)}
                        ${esGeneral ? '<span class="cat-default-pill">Por defecto</span>' : ''}
                    </div>
                    <div class="cat-item-count">${textoCant}</div>
                </div>
                <div class="cat-item-actions">
                    ${!esGeneral ? `
                        <button type="button" class="cat-action-btn edit btn-cat-edit" data-cat="${escaparHtmlCat(cat)}" title="Renombrar categoría">✏️</button>
                        <button type="button" class="cat-action-btn delete btn-cat-delete" data-cat="${escaparHtmlCat(cat)}" title="Eliminar categoría">🗑️</button>
                    ` : '<span class="cat-lock-hint" title="Categoría base del sistema">🔒</span>'}
                </div>
            </div>
        `;
    }).join('');
}

function editarCategoriaExistente(nombreViejo) {
    const nuevoNombre = prompt(`Renombrar categoría "${nombreViejo}":`, nombreViejo);
    if (!nuevoNombre || !nuevoNombre.trim()) return;

    const limpio = nuevoNombre.trim();
    if (limpio.toLowerCase() === nombreViejo.toLowerCase()) return;

    if (window.bovedaCategorias.some(c => c.toLowerCase() === limpio.toLowerCase())) {
        alert(`Ya existe una categoría llamada "${limpio}".`);
        return;
    }

    window.bovedaCategorias = ordenarCategorias(
        window.bovedaCategorias.map(c => c.toLowerCase() === nombreViejo.toLowerCase() ? limpio : c)
    );
    guardarBovedaCategorias();

    if (Array.isArray(window.bovedaProductos)) {
        let actualizados = 0;
        window.bovedaProductos.forEach(p => {
            if ((p.categoria || '').toLowerCase() === nombreViejo.toLowerCase()) {
                p.categoria = limpio;
                actualizados++;
            }
        });
        if (actualizados > 0 && typeof guardarBovedaLocal === 'function') {
            guardarBovedaLocal();
        }
    }

    if (typeof renderizarProductosCreados === 'function') renderizarProductosCreados();
    sincronizarUIconCategorias();
}

function eliminarCategoriaExistente(nombreCat) {
    const cant = contarProductosPorCategoria(nombreCat);
    const aviso = cant > 0
        ? `¿Eliminar la categoría "${nombreCat}"?\n\nLos ${cant} producto(s) asociados pasarán automáticamente a la categoría "General".`
        : `¿Eliminar la categoría "${nombreCat}"?`;

    if (!confirm(aviso)) return;

    window.bovedaCategorias = window.bovedaCategorias.filter(
        c => c.toLowerCase() !== nombreCat.toLowerCase()
    );
    guardarBovedaCategorias();

    if (Array.isArray(window.bovedaProductos)) {
        let reasignados = 0;
        window.bovedaProductos.forEach(p => {
            if ((p.categoria || '').toLowerCase() === nombreCat.toLowerCase()) {
                p.categoria = 'General';
                reasignados++;
            }
        });
        if (reasignados > 0 && typeof guardarBovedaLocal === 'function') {
            guardarBovedaLocal();
        }
    }

    if (typeof renderizarProductosCreados === 'function') renderizarProductosCreados();
    sincronizarUIconCategorias();
}

function escaparHtmlCat(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

cargarBovedaCategorias();
