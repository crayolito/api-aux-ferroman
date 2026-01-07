// PONER ESTE ARCHIVO EN: netlify/functions/crear-orden.js

export const handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ success: false, error: 'Solo POST permitido' })
        };
    }

    try {
        // Tu configuración
        const shop = 'ferroman-6810.myshopify.com';
        const clientId = '6727999b827a6321a8bf0c5814c841c8';
        const clientSecret = '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';

        // Parsear datos
        const datos = JSON.parse(event.body);

        // 1. Obtener token
        const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'client_credentials'
            })
        });

        const { access_token } = await tokenResponse.json();

        // 2. Crear orden con GraphQL
        const mutation = `
        mutation draftOrderCreate($input: DraftOrderInput!) {
          draftOrderCreate(input: $input) {
            draftOrder {
              id
              name
              totalPrice
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

        const lineItems = datos.productos.map(p => ({
            title: p.title,
            quantity: parseInt(p.quantity),
            originalUnitPrice: parseFloat(p.price.replace(/[^\d.-]/g, ''))
        }));

        const variables = {
            input: {
                lineItems: lineItems,
                email: datos.cliente?.email || '',
                note: `Orden desde ${datos.tienda} - Total: ${datos.total}`
            }
        };

        const shopifyResponse = await fetch(`https://${shop}/admin/api/2026-01/graphql.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': access_token
            },
            body: JSON.stringify({ query: mutation, variables })
        });

        const result = await shopifyResponse.json();

        if (result.errors || result.data.draftOrderCreate.userErrors.length > 0) {
            throw new Error('Error en Shopify');
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                numeroOrden: result.data.draftOrderCreate.draftOrder.name,
                orderId: result.data.draftOrderCreate.draftOrder.id
            })
        };

    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message,
                numeroOrden: `LM-${Date.now().toString().slice(-8)}`
            })
        };
    }
};