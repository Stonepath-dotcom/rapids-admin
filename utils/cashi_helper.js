const CASHI_CONFIG = {
    base_url: "https://cashi.id/api",
    api_key: "ed27ebff3912ea6bb5b27743626ecd13933079eb863f1cdbaa4e74cad2b575c5",
    secret_key: "sk_b287a77778384e77b2f59d1e76d92b45"
};


// Create QRIS payment via cashi.id
async function createQRISPayment(amount, orderId){
    try{
        const response = await fetch(`${CASHI_CONFIG.base_url}/create-transaction`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${CASHI_CONFIG.api_key}`
            },
            body: JSON.stringify({
                amount: amount,
                order_id: orderId,
                type: "qris",
                callback_url: null // Using polling instead
            })
        });
        
        if(!response.ok){
            const errorText = await response.text();
            console.error(`[Cashi] API Error ${response.status}:`, errorText);
            return { success: false, message: `API Error: ${response.status}` };
        }
        
        const data = await response.json();
        
        console.log(`[Cashi] Transaction created:`, data);
        
        return {
            success: true,
            data: {
                orderId: data.order_id || orderId,
                qrisUrl: data.qris_url || data.qr_string || null,
                expiresAt: data.expires_at || "24 jam"
            }
        };
        
    } catch(error){
        console.error("[Cashi] Error creating QRIS:", error.message);
        return { success: false, message: error.message };
    }
}


// Check payment status by order ID
async function getPaymentStatus(orderId){
    try{
        const response = await fetch(`${CASHI_CONFIG.base_url}/transaction/${orderId}`, {
            headers: {
                "Authorization": `Bearer ${CASHI_CONFIG.api_key}`
            }
        });
        
        if(!response.ok){
            return { success: false, status: "unknown" };
        }
        
        const data = await response.json();
        
        return {
            success: true,
            status: data.status || "unknown", // pending, paid, expired
            amount: data.amount
        };
        
    } catch(error){
        console.error("[Cashi] Error checking status:", error.message);
        return { success: false, status: "error" };
    }
}


// Verify webhook signature (for future use if webhook is enabled)
function verifyWebhookSignature(payload, signature){
    const crypto = require("crypto");
    
    const expectedSignature = crypto
        .createHmac("sha256", CASHI_CONFIG.secret_key)
        .update(JSON.stringify(payload))
        .digest("hex");
    
    return signature === expectedSignature;
}


module.exports = {
    createQRISPayment,
    getPaymentStatus,
    verifyWebhookSignature
};
