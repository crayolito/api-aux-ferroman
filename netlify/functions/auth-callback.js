const crypto = require('crypto');
const config = require('./config');

exports.handler = async (event) => {
    const { code, shop, hmac, state, timestamp } = event.queryStringParameters;

    // 1. Verificar HMAC
    if (!verificarHMAC(event.queryStringParameters)) {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: 'HMAC inválido' })
        };
    }

    // 2. Validar shop
    if (!shop || !shop.match(/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/)) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Shop inválido' })
        };
    }

    // 3. Verificar nonce (state) - deberías compararlo con la cookie
    // Por ahora lo validamos que exista
    if (!state) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'State inválido' })
        };
    }

    // 4. Verificar timestamp (no muy viejo, ej: máximo 5 minutos)
    const requestTime = parseInt(timestamp);
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - requestTime) > 300) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Request expirado' })
        };
    }

    if (!code) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Código de autorización faltante' })
        };
    }

    try {
        // 5. Intercambiar code por access_token
        const tokenUrl = `https://${shop}/admin/oauth/access_token`;

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: config.shopify.clientId,
                client_secret: config.shopify.secret,
                code: code
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Error obteniendo token: ${response.status} - ${error}`);
        }

        const data = await response.json();
        const accessToken = data.access_token;
        const scopes = data.scope;

        // 6. Verificar que los scopes solicitados fueron otorgados
        const requiredScopes = ['write_orders'];
        const grantedScopes = scopes.split(',');
        const hasRequiredScopes = requiredScopes.every(scope =>
            grantedScopes.includes(scope)
        );

        if (!hasRequiredScopes) {
            return {
                statusCode: 403,
                body: JSON.stringify({
                    error: 'Scopes insuficientes. Se requiere: write_orders'
                })
            };
        }

        // 7. Guardar el access_token
        // ⚠️ IMPORTANTE: Para producción, guarda esto en una base de datos
        // Por ahora, mostramos el token para que lo copies manualmente

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/html'
            },
            body: `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>App Instalada Exitosamente</title>
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
                        .token {
                            background: #f8f8f8;
                            padding: 15px;
                            border-radius: 4px;
                            word-break: break-all;
                            font-family: monospace;
                            margin: 20px 0;
                            border: 2px solid #96bf48;
                        }
                        .warning {
                            background: #fff3cd;
                            border-left: 4px solid #ffc107;
                            padding: 15px;
                            margin: 20px 0;
                        }
                        .button {
                            background: #96bf48;
                            color: white;
                            padding: 10px 20px;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 16px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>✅ ¡App instalada exitosamente!</h1>
                        <p><strong>Tienda:</strong> ${shop}</p>
                        <p><strong>Scopes otorgados:</strong> ${scopes}</p>
                        
                        <div class="warning">
                            <strong>⚠️ IMPORTANTE:</strong> Copia el token de acceso y guárdalo como variable de entorno en Netlify:
                            <br><code>SHOPIFY_ACCESS_TOKEN</code>
                        </div>
                        
                        <div class="token" id="token">${accessToken}</div>
                        
                        <button class="button" onclick="copiarToken()">Copiar Token</button>
                        
                        <script>
                            function copiarToken() {
                                const token = document.getElementById('token').textContent;
                                navigator.clipboard.writeText(token).then(() => {
                                    alert('Token copiado al portapapeles');
                                });
                            }
                        </script>
                    </div>
                </body>
                </html>
            `
        };

    } catch (error) {
        console.error('Error en callback:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Error procesando autorización',
                detalles: error.message
            })
        };
    }
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