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
        // Verificar que el token esté configurado
        if (!config.shopify.accessToken || config.shopify.accessToken === 'TU_TOKEN_DE_ACCESO_AQUI') {
            throw new Error('Token de acceso de Shopify no configurado. Actualiza config.js con el token real.');
        }

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

        // Crear orden en Shopify usando configuración
        const shopifyUrl = `https://${config.shopify.shop}/admin/api/${config.shopify.apiVersion}/draft_orders.json`;

        const response = await fetch(shopifyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': config.shopify.accessToken
            },
            body: JSON.stringify(ordenBorrador)
        });

        if (!response.ok) {
            const errorData = await response.text();
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
        console.error('Error:', error);

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