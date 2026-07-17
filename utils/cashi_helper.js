const CASHI_CONFIG = {
    base_url: "https://cashi.id/api",
    api_key: "ed27ebff3912ea6bb5b27743626ecd13933079eb863f1cdbaa4e74cad2b575c5",
    secret_key: "sk_b287a77778384e77b2f59d1e76d92b45"
};


// Create QRIS payment via cashi.id
async function createQRISPayment(amount, orderId){
    try{
        console.log(`[Cashi] Creating payment: ${amount} for order ${orderId}`);
        
        const response = await fetch(`${CASHI_CONFIG.base_url}/create-transaction`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${CASHI_CONFIG.api_key}`
            },
            body: JSON.stringify({
                amount: amount,
                order_id: orderId,
                type: "qris"
            })
        });
        
        const responseText = await response.text();
        console.log(`[Cashi] Response status: ${response.status}`);
        console.log(`[Cashi] Response body:`, responseText.substring(0, 500));
        
        if(!response.ok){
            console.error(`[Cashi] API Error ${response.status}:`, responseText);
            return { success: false, message: `API Error: ${response.status}` };
        }
        
        let data;
        try{
            data = JSON.parse(responseText);
        } catch(parseError){
            console.error("[Cashi] Failed to parse response:", parseError.message);
            return { success: false, message: "Invalid API response" };
        }
        
        // Extract QRIS data from various possible response formats
        const qrisData = extractQRISData(data, orderId);
        
        console.log(`[Cashi] ✅ Transaction created successfully`);
        console.log(`[Cashi] Order ID: ${qrisData.orderId}`);
        console.log(`[Cashi] Has QRIS Image:`, qrisData.qrisUrl ? "YES" : "NO");
        
        return {
            success: true,
            data: qrisData
        };
        
    } catch(error){
        console.error("[Cashi] Error creating QRIS:", error.message);
        return { success: false, message: error.message };
    }
}


// Extract QRIS data from various response formats
function extractQRISData(data, fallbackOrderId){
    // Try multiple field names for order ID
    const orderId = data.order_id || data.orderId || data.reference_id || data.transaction_id || fallbackOrderId;
    
    // Try multiple field names for QRIS image/URL
    // Could be: qris_url, qr_string, qr_image, qris_image, qr_code, content, etc.
    let qrisUrl = null;
    
    if(data.qris_url) qrisUrl = data.qris_url;
    else if(data.qr_string) qrisUrl = data.qr_string;
    else if(data.qr_image) qrisUrl = data.qr_image;
    else if(data.qris_image) qrisUrl = data.qris_image;
    else if(data.qr_code) qrisUrl = data.qr_code;
    else if(data.content) qrisUrl = data.content;
    else if(data.data?.qris_url) qrisUrl = data.data.qris_url;
    else if(data.data?.qr_string) qrisUrl = data.data.qr_string;
    else if(data.data?.content) qrisUrl = data.data.content;
    
    // If it's a raw QRIS string (not a URL), convert to data URI for display
    if(qrisUrl && !qrisUrl.startsWith("http") && !qrisUrl.startsWith("data:image")){
        // It's likely a raw QRIS string - we'll need to generate QR code from it
        // For now, mark it as raw string
        console.log("[Cashi] Raw QRIS string received (need QR generator)");
    }
    
    // Expiry time
    const expiresAt = data.expires_at || data.expiry || data.expired_at || 
                       data.expiry_time || "24 jam";
    
    return {
        orderId,
        qrisUrl,
        expiresAt,
        rawData: data // Keep raw data for debugging
    };
}


// Check payment status by order ID
async function getPaymentStatus(orderId){
    try{
        console.log(`[Cashi] Checking status for: ${orderId}`);
        
        const response = await fetch(`${CASHI_CONFIG.base_url}/transaction/${orderId}`, {
            headers: {
                "Authorization": `Bearer ${CASHI_CONFIG.api_key}`
            }
        });
        
        if(!response.ok){
            console.log(`[Cashi] Status check failed: ${response.status}`);
            return { success: false, status: "unknown" };
        }
        
        const data = await response.json();
        console.log(`[Cashi] Status for ${orderId}:`, data.status || "unknown");
        
        return {
            success: true,
            status: data.status || data.payment_status || "unknown",
            amount: data.amount || data.nominal
        };
        
    } catch(error){
        console.error("[Cashi] Error checking status:", error.message);
        return { success: false, status: "error" };
    }
}


// Verify webhook signature (for future use if webhook is enabled)
function verifyWebhookSignature(payload, signature){
    try{
        const crypto = require("crypto");
        
        const expectedSignature = crypto
            .createHmac("sha256", CASHI_CONFIG.secret_key)
            .update(JSON.stringify(payload))
            .digest("hex");
        
        return signature === expectedSignature;
    } catch(error){
        console.error("[Cashi] Signature verification error:", error.message);
        return false;
    }
}


// Test API connection
async function testConnection(){
    try{
        console.log("[Cashi] Testing API connection...");
        
        const response = await fetch(`${CASHI_CONFIG.base_url}/balance`, {
            headers: {
                "Authorization": `Bearer ${CASHI_CONFIG.api_key}`
            }
        });
        
        if(response.ok){
            const data = await response.json();
            console.log("[Cashi] ✅ API connection successful");
            return { success: true, data };
        } else{
            console.log(`[Cashi] ❌ API returned: ${response.status}`);
            return { success: false, status: response.status };
        }
        
    } catch(error){
        console.error("[Cashi] Connection test failed:", error.message);
        return { success: false, message: error.message };
    }
}


module.exports = {
    createQRISPayment,
    getPaymentStatus,
    verifyWebhookSignature,
    testConnection
};
