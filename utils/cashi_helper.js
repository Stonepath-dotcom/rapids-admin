const https = require("https");
const http = require("http");
const crypto = require("crypto");

// Cashi.id Configuration
const CASHI_CONFIG = {
    base_url: "https://cashi.id/api",
    api_key: "ed27ebff3912ea6bb5b27743626ecd13933079eb863f1cdbaa4e74cad2b575c5",
    secret_key: "sk_b287a77778384e77b2f59d1e76d92b45"
};


// Make HTTP request (supports https)
function makeRequest(url, options, postData){
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: options.method || "GET",
            headers: options.headers || {}
        };

        const client = urlObj.protocol === "https:" ? https : http;
        
        const req = client.request(reqOptions, (res) => {
            let data = "";
            
            res.on("data", (chunk) => data += chunk);
            
            res.on("end", () => {
                try{
                    resolve({
                        status: res.statusCode,
                        data: JSON.parse(data)
                    });
                } catch(e){
                    resolve({
                        status: res.statusCode,
                        data: data
                    });
                }
            });
        });

        req.on("error", (error) => reject(error));
        
        if(postData){
            req.write(postData);
        }
        
        req.end();
    });
}


// Create QRIS Payment
async function createQRISPayment(amount, orderId){
    try{
        const postData = JSON.stringify({
            amount: amount,
            order_id: orderId,
            QRIS_CUSTOM: true
        });

        const response = await makeRequest(`${CASHI_CONFIG.base_url}/qris/create`, {
            method: "POST",
            headers: {
                "x-api-key": CASHI_CONFIG.api_key,
                "Content-Type": "application/json"
            }
        }, postData);

        console.log(`[CASHI] Create QRIS Response:`, response.status, response.data);

        if(response.status === 200 && response.data.success){
            return {
                success: true,
                data: {
                    orderId: response.data.orderId,
                    amount: response.data.amount,
                    expectedNet: response.data.expected_net,
                    qrisUrl: response.data.qrisUrl,
                    expiresAt: response.data.expires_at,
                    isQrisCustom: response.data.is_qris_custom
                }
            };
        }

        return {
            success: false,
            message: response.data.message || "Failed to create QRIS payment"
        };
    } catch(error){
        console.error("[CASHI] Error creating QRIS:", error);
        return {
            success: false,
            message: error.message
        };
    }
}


// Verify webhook signature
function verifyWebhookSignature(payload, signature){
    if(!signature){
        return false;
    }

    const expectedSignature = crypto
        .createHmac("sha256", CASHI_CONFIG.secret_key)
        .update(payload)
        .digest("hex");

    return signature === expectedSignature;
}


// Handle webhook from cashi.id
function handleWebhook(reqBody, signature){
    // Verify signature first
    const payload = JSON.stringify(reqBody);
    
    if(!verifyWebhookSignature(payload, signature)){
        console.error("[CASHI] Invalid webhook signature");
        return {
            valid: false,
            error: "Invalid signature"
        };
    }

    const { event, data } = reqBody;

    console.log(`[CASHI] Webhook received: ${event}`, data);

    // Handle payment settled event
    if(event === "PAYMENT_SETTLED"){
        // Check if test order
        if(data.order_id?.startsWith("TEST-")){
            return {
                valid: true,
                isTest: true,
                event: event,
                data: data
            };
        }

        // Check if payment is settled
        if(data.status === "SETTLED"){
            return {
                valid: true,
                isSettled: true,
                event: event,
                data: data
            };
        }
    }

    // Other events - acknowledge but ignore
    return {
        valid: true,
        ignored: true,
        event: event,
        data: data
    };
}


// Get payment status from order ID
async function getPaymentStatus(orderId){
    try{
        const response = await makeRequest(`${CASHI_CONFIG.base_url}/payment/${orderId}`, {
            method: "GET",
            headers: {
                "x-api-key": CASHI_CONFIG.api_key,
                "Content-Type": "application/json"
            }
        });

        if(response.status === 200 && response.data.success){
            return {
                success: true,
                data: response.data
            };
        }

        return {
            success: false,
            message: response.data.message || "Failed to get payment status"
        };
    } catch(error){
        console.error("[CASHI] Error getting status:", error);
        return {
            success: false,
            message: error.message
        };
    }
}


module.exports = {
    createQRISPayment,
    verifyWebhookSignature,
    handleWebhook,
    getPaymentStatus,
    CASHI_CONFIG
};
