const config = require('./config');

exports.handler = async (event, context) => {
    // Permitir CORS
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    };

    // Manejar preflight OPTIONS
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "" };
    }

    try {
        // Obtener datos del pedido
        const { productos, total, tienda } = JSON.parse(event.body);

        // Preparar orden borrador para Shopify
        const ordenBorrador = {
            draft_order: {
                line_items: productos.map(producto => ({
                    title: producto.title,
                    quantity: producto.quantity,
                    price: extraerPrecio(producto.price),
                    custom: true,
                    variant_title: producto.variant || 'Default'
                })),
                customer: {
                    first_name: "Cliente",
                    last_name: "WhatsApp",
                    email: `cliente.${Date.now()}@checkout-personalizado.com`
                },
                note: `Pedido desde checkout personalizado - ${new Date().toLocaleString('es-ES')}`,
                tags: ["checkout-personalizado", "whatsapp"],
                financial_status: "pending"
            }
        };

        // Usar Client ID y Secret para autenticación básica
        const shopifyUrl = `https://${config.shopify.shop}/admin/api/${config.shopify.apiVersion}/draft_orders.json`;

        // Autenticación usando Client ID y Secret (Basic Auth)
        const authString = Buffer.from(`${config.shopify.clientId}:${config.shopify.secret}`).toString('base64');

        const response = await fetch(shopifyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${authString}`
            },
            body: JSON.stringify(ordenBorrador)
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('Error de Shopify API:', response.status, errorData);
            throw new Error(`Shopify API Error: ${response.status} - ${errorData}`);
        }

        const resultado = await response.json();

        // Retornar resultado exitoso
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                numeroOrden: resultado.draft_order.name || `#${resultado.draft_order.id}`,
                orderId: resultado.draft_order.id,
                mensaje: 'Orden creada exitosamente'
            })
        };

    } catch (error) {
        console.error('Error completo:', error);

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message,
                mensaje: 'Error creando la orden'
            })
        };
    }
};

// Función auxiliar para extraer precio
function extraerPrecio(precioTexto) {
    if (!precioTexto || precioTexto === 'Precio no disponible') {
        return '0.00';
    }

    const numeroLimpio = precioTexto.toString().replace(/[^\d.,]/g, '');
    const numeroConPunto = numeroLimpio.replace(',', '.');
    const precio = parseFloat(numeroConPunto) || 0;

    return precio.toFixed(2);
}