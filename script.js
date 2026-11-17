document.addEventListener("DOMContentLoaded", () => {
    
    /* ==========================================
       LÓGICA DEL MENÚ HAMBURGUESA (MÓVIL)
       ========================================== */
    const hamburgerBtn = document.getElementById("hamburger-btn");
    const navMenu = document.getElementById("nav-menu");
    
    hamburgerBtn.addEventListener("click", () => {
        hamburgerBtn.classList.toggle("active");
        navMenu.classList.toggle("active");
    });
    
    const navLinks = document.querySelectorAll(".nav-links a");
    navLinks.forEach(link => {
        link.addEventListener("click", () => {
            hamburgerBtn.classList.remove("active");
            navMenu.classList.remove("active");
        });
    });

    /* ==========================================
       EFECTO ZOOM PARA IMÁGENES (LIGHTBOX)
       ========================================== */
    const imagenesZoom = document.querySelectorAll('.zoom-image');
    
    const lightbox = document.createElement('div');
    lightbox.classList.add('lightbox-pantalla');
    
    const imgEnGrande = document.createElement('img');
    imgEnGrande.classList.add('lightbox-image');
    
    lightbox.appendChild(imgEnGrande);
    document.body.appendChild(lightbox);

    imagenesZoom.forEach(imagen => {
        imagen.addEventListener('click', function() {
            imgEnGrande.src = this.src;
            imgEnGrande.alt = this.alt;
            
            lightbox.classList.add('activo');
            document.body.style.overflow = 'hidden'; 
        });
    });

    lightbox.addEventListener('click', function() {
        lightbox.classList.remove('activo'); 
        document.body.style.overflow = 'auto';
    });
});

/* ==========================================
   LÓGICA DEL ACORDEÓN DE CARACTERÍSTICAS
   ========================================== */
function toggleFeature(button) {
    const panel = button.nextElementSibling;
    button.classList.toggle('active');
    
    if (panel.style.maxHeight) {
        panel.style.maxHeight = null;
        panel.classList.remove('show');
    } else {
        panel.classList.add('show');
        panel.style.maxHeight = panel.scrollHeight + "px";
    }
}

/* ==========================================
   LÓGICA DEL MODAL DE INICIO DE SESIÓN
   ========================================== */

let isRegisterMode = false; // Variable para saber en qué pestaña estamos

// Función para abrir el modal
function openLoginModal() {
    const modal = document.getElementById('auth-modal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Bloquea el scroll del fondo
    
    // Si abrimos desde el menú móvil, cerramos el menú
    const navMenu = document.getElementById("nav-menu");
    const hamburgerBtn = document.getElementById("hamburger-btn");
    if(navMenu.classList.contains('active')){
        navMenu.classList.remove('active');
        hamburgerBtn.classList.remove('active');
    }
}

// Función para cerrar el modal
function closeLoginModal() {
    const modal = document.getElementById('auth-modal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto'; // Devuelve el scroll
}

// Cerrar modal al hacer clic afuera (en el fondo oscuro)
window.onclick = function(event) {
    const modal = document.getElementById('auth-modal');
    const lightbox = document.querySelector('.lightbox-pantalla');
    
    if (event.target === modal) {
        closeLoginModal();
    }
    
    if (event.target === lightbox) {
        lightbox.classList.remove('activo');
        document.body.style.overflow = 'auto';
    }
}

// Alternar entre "Ingresar" y "Crear Cuenta"
function switchAuthTab(tabName) {
    const tabs = document.querySelectorAll('.auth-tab');
    const submitBtn = document.getElementById('auth-submit-btn');
    const forgotLink = document.getElementById('forgot-password-link');
    const confirmPasswordGroup = document.getElementById('confirm-password-group');
    const confirmPasswordInput = document.getElementById('confirm-password');
    
    // Limpia alertas de error anteriores al cambiar de tab
    document.getElementById('password-error').style.display = 'none';
    document.getElementById('password').classList.remove('input-error');
    confirmPasswordInput.classList.remove('input-error');

    // Cambia el estilo activo de los botones (tabs)
    tabs.forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');

    if (tabName === 'login') {
        isRegisterMode = false;
        submitBtn.textContent = 'Acceder a mi Panel';
        forgotLink.style.display = 'block';
        confirmPasswordGroup.style.display = 'none'; // Oculta el campo
        confirmPasswordInput.required = false; // Ya no es obligatorio
    } else if (tabName === 'register') {
        isRegisterMode = true;
        submitBtn.textContent = 'Crear mi Tienda Gratis';
        forgotLink.style.display = 'none';
        confirmPasswordGroup.style.display = 'flex'; // Muestra el campo
        confirmPasswordInput.required = true; // Lo hace obligatorio para el formulario
    }
}

// Validación y envío del formulario
document.getElementById('auth-form').addEventListener('submit', function(e) {
    e.preventDefault(); // Evita que la página se recargue por defecto
    
    const password = document.getElementById('password');
    const confirmPassword = document.getElementById('confirm-password');
    const errorText = document.getElementById('password-error');

    // Validamos: Si estamos creando cuenta, verificamos que las contraseñas coincidan
    if (isRegisterMode) {
        if (password.value !== confirmPassword.value) {
            // Error: No coinciden. (Validación Frontend)
            errorText.style.display = 'block';
            password.classList.add('input-error');
            confirmPassword.classList.add('input-error');
            return; // Detenemos la ejecución aquí, no se envía el formulario.
        } else {
            // Éxito: Coinciden. Limpiamos errores.
            errorText.style.display = 'none';
            password.classList.remove('input-error');
            confirmPassword.classList.remove('input-error');
            alert("¡Las contraseñas coinciden! Registro exitoso (Simulado).");
            closeLoginModal();
        }
    } else {
        // Modo Login Normal
        alert("Iniciando sesión... (Simulado)");
        closeLoginModal();
    }
});


