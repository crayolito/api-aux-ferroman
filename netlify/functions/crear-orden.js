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

        // 1. Obtener token
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

        const tokenData = await tokenResponse.json();
        const access_token = tokenData.access_token;

        // 2. Preparar productos
        const productos = datos.productos || datos.items || [];
        const lineItems = productos.map(p => ({
            title: p.title || 'Producto',
            quantity: parseInt(p.quantity) || 1,
            originalUnitPrice: parseFloat((p.price || '0').toString().replace(/[^\d.-]/g, '')) || 0
        }));

        // 3. Crear Draft Order
        const createMutation = `
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

        const createVariables = {
            input: {
                lineItems: lineItems,
                email: datos.cliente?.email || '',
                note: `Orden desde ${datos.tienda || 'web'} - Total: ${datos.total || 'N/A'}`
            }
        };

        const createResponse = await fetch(`https://${shop}/admin/api/2026-01/graphql.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': access_token
            },
            body: JSON.stringify({ query: createMutation, variables: createVariables })
        });

        const createResult = await createResponse.json();

        if (createResult.errors || createResult.data.draftOrderCreate.userErrors.length > 0) {
            throw new Error('Error creando draft order');
        }

        const draftOrderId = createResult.data.draftOrderCreate.draftOrder.id;

        // 4. COMPLETAR el Draft Order para convertirlo en Order real
        const completeMutation = `
        mutation draftOrderComplete($id: ID!) {
          draftOrderComplete(id: $id) {
            draftOrder {
              order {
                id
                name
                totalPrice
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

        const completeResponse = await fetch(`https://${shop}/admin/api/2026-01/graphql.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': access_token
            },
            body: JSON.stringify({
                query: completeMutation,
                variables: { id: draftOrderId }
            })
        });

        const completeResult = await completeResponse.json();
        console.log('Complete result:', completeResult);

        if (completeResult.errors || completeResult.data.draftOrderComplete.userErrors.length > 0) {
            // Si no se puede completar, devolver el draft order
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    numeroOrden: createResult.data.draftOrderCreate.draftOrder.name,
                    orderId: draftOrderId,
                    total: createResult.data.draftOrderCreate.draftOrder.totalPrice,
                    tipo: 'draft' // Indicar que quedó como draft
                })
            };
        }

        // Orden real creada exitosamente
        const order = completeResult.data.draftOrderComplete.draftOrder.order;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                numeroOrden: order.name,
                orderId: order.id,
                total: order.totalPrice,
                tipo: 'order' // Orden real
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