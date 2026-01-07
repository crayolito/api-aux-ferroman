// netlify/functions/auth-install.js
const crypto = require('crypto');
const config = require('./config');

exports.handler = async (event) => {
    const { shop, hmac, timestamp } = event.queryStringParameters || {};

    // Si hay HMAC, verificar (viene de Shopify)
    if (hmac) {
        if (!verificarHMAC(event.queryStringParameters)) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: 'HMAC inválido' })
            };
        }
    }

    // Validar que shop termine en .myshopify.com
    if (!shop || !shop.endsWith('.myshopify.com')) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Shop inválido. Ejemplo: ferroman-6810.myshopify.com' })
        };
    }

    // Generar un nonce (estado aleatorio) para seguridad
    const nonce = crypto.randomBytes(16).toString('hex');

    // Construir URL de autorización
    const scopes = 'write_orders,read_orders';
    const redirectUri = `${process.env.URL || 'https://api-aux-ferroman.netlify.app'}/.netlify/functions/auth-callback`;

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

    const sorted = Object.keys(rest)
        .sort()
        .map(key => `${key}=${rest[key]}`)
        .join('&');

    const calculated = crypto
        .createHmac('sha256', config.shopify.secret)
        .update(sorted)
        .digest('hex');

    return crypto.timingSafeEqual(
        Buffer.from(calculated),
        Buffer.from(hmac)
    );
}