/* ==========================================================================
   CONFIGURACIÓN MAESTRA DE FIREBASE Y SUSCRIPCIÓN (APP MÓVIL ↔ WEB PC)
   ========================================================================== */
window.CAT_ALOGO_CLOUD_CONFIG = {
    // 1. Credenciales del MISMO proyecto Firebase de tu App Android
    firebaseConfig: {
        apiKey: "AIzaSyCiRHJ2btAkndSUPhPgpGNknS9QHGdFYoE",
        authDomain: "cat-alogo.firebaseapp.com",
        projectId: "cat-alogo",
        storageBucket: "cat-alogo.firebasestorage.app",
        messagingSenderId: "819084532150",
        appId: "1:819084532150:web:eab95ebaf836f73d5dc917"
    },

    // 2. Enlace de tu App en Google Play Store (se usa en el cartel de bloqueo y QR)
    googlePlayAppUrl: "https://play.google.com/store/apps/details?id=com.catalogstudio.app",

    // 3. Ruta en Firestore donde la App/Backend guarda el estado del plan (14 / 30 / 365 días)
    billingSubcollection: "billing",
    billingDocId: "subscription",

    // 4. Modo estricto:
    // true  = exige login + email verificado + plan vigente apenas haya credenciales Firebase válidas
    // false = permite trabajar sin login mientras pruebas en local
    exigirLoginConFirebase: true,

    // 5. Endpoints de Cloud Functions v2 (southamerica-east1)
    endpointActivarPrueba: "https://activarpruebagratis-llt2fk2sua-rj.a.run.app",

    // 6. Planes y Pasarelas de Pago Web (Paddle Global en USD + Mercado Pago Argentina en ARS)
    billingWeb: {
        precioMensualUsd: 9.99,
        precioAnualUsd: 89,
        precioAnualPorMesUsd: 7.41,
        ahorroAnualTexto: "Ahorrás 26%",
        // Si lo dejás en 0, toma automáticamente config_global/billing.cotizacionArs desde Firestore (si existe)
        cotizacionArsReferencia: 0,
        endpointMercadoPago: "https://crearcheckoutmercadopago-llt2fk2sua-rj.a.run.app",

        // Paddle Billing v2 (abre checkout directo desde el cliente con Paddle.Checkout.open; endpointPaddle queda vacío)
        // AL PASAR A PRODUCCIÓN: cambiar las 4 líneas de abajo por "production", "live_..." y los Price IDs de Paddle Live
        endpointPaddle: "",
        paddleEnvironment: "sandbox",
        paddleClientToken: "test_d90426b03ea7556c308b42c8343",
        paddlePriceIds: {
            mensual: "pri_01m87xq0wssdp8p242etctn8y2",
            anual: "pri_01m87xvsarpt3h7x4257kwrata"
        }
    }
};
