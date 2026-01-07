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
        // Obtener el token desde variable de entorno (obtenido vía OAuth)
        const accessToken = config.shopify.accessToken;

        if (!accessToken) {
            throw new Error('SHOPIFY_ACCESS_TOKEN no configurado. Instala la app primero visitando: /.netlify/functions/auth/install?shop=ferroman-6810.myshopify.com');
        }

        // Obtener datos del pedido
        const { productos, total, tienda, cliente, direccionEnvio, direccionFacturacion, transaccion } = JSON.parse(event.body);

        // Preparar orden real para Shopify (como el checkout nativo)
        const orden = {
            order: {
                line_items: productos.map(producto => {
                    // Si tiene variant_id, usarlo; si no, crear custom line item
                    if (producto.variant_id) {
                        return {
                            variant_id: producto.variant_id,
                            quantity: producto.quantity
                        };
                    } else {
                        // Custom line item para productos sin variant_id
                        return {
                            title: producto.title,
                            quantity: producto.quantity,
                            price: extraerPrecio(producto.price),
                            requires_shipping: producto.requires_shipping !== false,
                            taxable: producto.taxable !== false
                        };
                    }
                }),
                customer: cliente ? {
                    first_name: cliente.first_name || "Cliente",
                    last_name: cliente.last_name || "WhatsApp",
                    email: cliente.email || `cliente.${Date.now()}@checkout-personalizado.com`,
                    phone: cliente.phone || null
                } : {
                    first_name: "Cliente",
                    last_name: "WhatsApp",
                    email: `cliente.${Date.now()}@checkout-personalizado.com`
                },
                email: cliente?.email || `cliente.${Date.now()}@checkout-personalizado.com`,
                billing_address: direccionFacturacion || direccionEnvio || {
                    first_name: cliente?.first_name || "Cliente",
                    last_name: cliente?.last_name || "WhatsApp",
                    address1: direccionEnvio?.address1 || "",
                    city: direccionEnvio?.city || "",
                    province: direccionEnvio?.province || "",
                    country: direccionEnvio?.country || "Bolivia",
                    zip: direccionEnvio?.zip || ""
                },
                shipping_address: direccionEnvio || {
                    first_name: cliente?.first_name || "Cliente",
                    last_name: cliente?.last_name || "WhatsApp",
                    address1: direccionEnvio?.address1 || "",
                    city: direccionEnvio?.city || "",
                    province: direccionEnvio?.province || "",
                    country: direccionEnvio?.country || "Bolivia",
                    zip: direccionEnvio?.zip || ""
                },
                note: `Pedido desde checkout personalizado - ${new Date().toLocaleString('es-ES')}`,
                tags: "checkout-personalizado,whatsapp",
                financial_status: transaccion?.status === "success" ? "paid" : "pending",
                fulfillment_status: "unfulfilled",
                transactions: transaccion ? [{
                    kind: transaccion.kind || "sale",
                    status: transaccion.status || "success",
                    amount: extraerPrecio(total || transaccion.amount)
                }] : []
            }
        };

        // Crear orden real en Shopify (como el checkout nativo)
        const shopifyUrl = `https://${config.shopify.shop}/admin/api/${config.shopify.apiVersion}/orders.json`;

        const response = await fetch(shopifyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken
            },
            body: JSON.stringify(orden)
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
                numeroOrden: resultado.order.name || `#${resultado.order.order_number}`,
                orderId: resultado.order.id,
                orderNumber: resultado.order.order_number,
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