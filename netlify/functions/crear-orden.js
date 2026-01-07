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

        // Validar que tenga query GraphQL
        if (!datos.query) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: 'Falta el query GraphQL' })
            };
        }

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

        // 2. Ejecutar el GraphQL que le envíes
        const response = await fetch(`https://${shop}/admin/api/2026-01/graphql.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': access_token
            },
            body: JSON.stringify({
                query: datos.query,
                variables: datos.variables || {}
            })
        });

        const result = await response.json();

        // 3. Devolver la respuesta tal como viene de Shopify
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: !result.errors,
                data: result.data,
                errors: result.errors || null
            })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};