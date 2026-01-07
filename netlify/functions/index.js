// netlify/functions/index.js
const crypto = require('crypto');
const config = require('./config');

exports.handler = async (event) => {
    const queryParams = event.queryStringParameters || {};
    const { shop, hmac, timestamp } = queryParams;

    // Si hay parámetros de Shopify (instalación), manejar directamente
    if (shop) {
        // Si hay HMAC y tiene valor, verificar (viene de Shopify)
        if (hmac && hmac.trim() !== '') {
            if (!verificarHMAC(queryParams)) {
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
                body: JSON.stringify({
                    error: 'Shop inválido. Ejemplo: ferroman-6810.myshopify.com',
                    recibido: shop || 'no proporcionado'
                })
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
    }

    // Si no hay parámetros, mostrar página de bienvenida
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/html'
        },
        body: `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Checkout Personalizado - Ferroman</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        max-width: 800px; 
                        margin: 50px auto; 
                        padding: 20px;
                        background: #f5f5f5;
                    }
                    .container {
                        background: white;
                        padding: 30px;
                        border-radius: 8px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    h1 { color: #96bf48; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Checkout Personalizado</h1>
                    <p>App de Shopify para Ferroman - Liquid Moly</p>
                    <p>Para instalar la app, accede desde el panel de administración de Shopify.</p>
                </div>
            </body>
            </html>
        `
    };
};

function verificarHMAC(params) {
    const { hmac, ...rest } = params;

    // Si no hay HMAC, no hay nada que verificar
    if (!hmac || hmac.trim() === '') {
        return false;
    }

    // Filtrar parámetros vacíos o undefined
    const filteredParams = Object.keys(rest)
        .filter(key => rest[key] !== undefined && rest[key] !== null && rest[key] !== '')
        .reduce((obj, key) => {
            obj[key] = rest[key];
            return obj;
        }, {});

    // Ordenar parámetros alfabéticamente
    const sorted = Object.keys(filteredParams)
        .sort()
        .map(key => `${key}=${filteredParams[key]}`)
        .join('&');

    // Calcular HMAC
    const calculated = crypto
        .createHmac('sha256', config.shopify.secret)
        .update(sorted)
        .digest('hex');

    // Comparación segura
    try {
        return crypto.timingSafeEqual(
            Buffer.from(calculated, 'hex'),
            Buffer.from(hmac, 'hex')
        );
    } catch (error) {
        console.error('Error comparando HMAC:', error);
        return false;
    }
}