// netlify/functions/auth/install.js
const crypto = require('crypto');
const config = require('../config');

exports.handler = async (event) => {
    const { shop, hmac, timestamp } = event.queryStringParameters;

    // Verificar HMAC
    if (!verificarHMAC(event.queryStringParameters)) {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: 'HMAC inválido' })
        };
    }

    // Validar que shop termine en .myshopify.com
    if (!shop || !shop.endsWith('.myshopify.com')) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Shop inválido' })
        };
    }

    // Generar un nonce (estado aleatorio) para seguridad
    const nonce = crypto.randomBytes(16).toString('hex');

    // Guardar el nonce en una cookie firmada (por ahora, lo devolvemos en el redirect)
    // En producción, deberías usar cookies HTTP-only firmadas

    // Construir URL de autorización
    const scopes = 'write_orders,read_orders'; // Los scopes que necesitas
    const redirectUri = `${process.env.URL || 'https://tu-app.netlify.app'}/.netlify/functions/auth/callback`;

    const authUrl = `https://${shop}/admin/oauth/authorize?` +
        `client_id=${config.shopify.clientId}&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `state=${nonce}`;

    // Redirigir a Shopify para autorización
    return {
        statusCode: 302,
        headers: {
            'Location': authUrl,
            'Set-Cookie': `oauth_nonce=${nonce}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=600`
        },
        body: ''
    };
};

function verificarHMAC(params) {
    const { hmac, ...rest } = params;
    if (!hmac) return false;

    // Ordenar parámetros alfabéticamente
    const sorted = Object.keys(rest)
        .sort()
        .map(key => `${key}=${rest[key]}`)
        .join('&');

    // Calcular HMAC
    const calculated = crypto
        .createHmac('sha256', config.shopify.secret)
        .update(sorted)
        .digest('hex');

    // Comparación segura
    return crypto.timingSafeEqual(
        Buffer.from(calculated),
        Buffer.from(hmac)
    );
}