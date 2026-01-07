// netlify/functions/index.js
const crypto = require('crypto');
const config = require('./config');

exports.handler = async (event) => {
    const queryParams = event.queryStringParameters || {};
    const { shop, hmac, timestamp } = queryParams;

    // Si hay parámetros de Shopify (instalación), redirigir a auth-install
    if (shop) {
        const installUrl = `/.netlify/functions/auth-install?${new URLSearchParams(queryParams).toString()}`;
        return {
            statusCode: 302,
            headers: {
                'Location': installUrl
            },
            body: ''
        };
    }

    // Si no hay parámetros, mostrar página de bienvenida o redirigir
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