exports.handler = async (event, context) => {
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
        const shop = 'ferroman-6810.myshopify.com';
        const clientId = '6727999b827a6321a8bf0c5814c841c8';
        const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || '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';

        const datos = JSON.parse(event.body);
        console.log('Datos recibidos:', datos);

        // 1. Obtener token usando client credentials
        console.log('Obteniendo token...');
        const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'client_credentials'
            })
        });

        console.log('Token response status:', tokenResponse.status);
        const tokenText = await tokenResponse.text();
        console.log('Token response:', tokenText);

        if (!tokenResponse.ok) {
            throw new Error(`Error obteniendo token: ${tokenResponse.status} - ${tokenText}`);
        }

        let tokenData;
        try {
            tokenData = JSON.parse(tokenText);
        } catch (e) {
            throw new Error(`Respuesta no es JSON válido: ${tokenText}`);
        }

        const access_token = tokenData.access_token;
        if (!access_token) {
            throw new Error(`No se recibió access_token: ${JSON.stringify(tokenData)}`);
        }

        console.log('Token obtenido exitosamente');

        // 2. Preparar productos
        const productos = datos.productos || datos.items || [];
        const lineItems = productos.map(p => ({
            title: p.title || 'Producto',
            quantity: parseInt(p.quantity) || 1,
            originalUnitPrice: parseFloat((p.price || '0').toString().replace(/[^\d.-]/g, '')) || 0
        }));

        // 3. Crear orden con GraphQL
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

        const variables = {
            input: {
                lineItems: lineItems,
                email: datos.cliente?.email || '',
                note: `Orden desde ${datos.tienda || 'web'} - Total: ${datos.total || 'N/A'}`
            }
        };

        console.log('Creando orden en Shopify...');
        const shopifyResponse = await fetch(`https://${shop}/admin/api/2026-01/graphql.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': access_token
            },
            body: JSON.stringify({ query: mutation, variables })
        });

        if (!shopifyResponse.ok) {
            const errorText = await shopifyResponse.text();
            throw new Error(`Error en Shopify: ${shopifyResponse.status} - ${errorText}`);
        }

        const result = await shopifyResponse.json();
        console.log('Respuesta de Shopify:', result);

        if (result.errors) {
            throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
        }

        if (result.data.draftOrderCreate.userErrors.length > 0) {
            throw new Error(`Errores: ${JSON.stringify(result.data.draftOrderCreate.userErrors)}`);
        }

        const draftOrder = result.data.draftOrderCreate.draftOrder;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                numeroOrden: draftOrder.name,
                orderId: draftOrder.id,
                total: draftOrder.totalPrice
            })
        };

    } catch (error) {
        console.error('Error completo:', error);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message,
                numeroOrden: `LM-${Date.now().toString().slice(-8)}`
            })
        };
    }
};