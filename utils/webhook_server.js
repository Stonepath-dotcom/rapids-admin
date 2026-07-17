const http = require("http");
const cashiHelper = require("./cashi_helper");

let server = null;
let waSocket = null;


// Set WA socket for notifications
function setWASocket(sock){
    waSocket = sock;
}


// Start webhook server
function startWebhookServer(port = 3000){
    server = http.createServer(async (req, res) => {
        // Only accept POST to /webhook
        if(req.method !== "POST" || req.url !== "/webhook"){
            res.writeHead(404);
            res.end("Not Found");
            return;
        }
        
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try{
                const payload = JSON.parse(body);
                const signature = req.headers["x-cashi-signature"] || "";
                
                console.log(`[Webhook] Received:`, payload);
                
                // Verify signature (optional but recommended)
                if(!cashiHelper.verifyWebhookSignature(payload, signature)){
                    console.warn("[Webhook] Invalid signature!");
                    res.writeHead(401);
                    res.end("Invalid signature");
                    return;
                }
                
                // Handle payment event
                if(payload.event === "PAYMENT_SETTLED" || payload.status === "paid"){
                    await handlePaymentSuccess(payload);
                }
                
                res.writeHead(200);
                res.end("OK");
                
            } catch(error){
                console.error("[Webhook] Error:", error.message);
                res.writeHead(400);
                res.end("Error processing webhook");
            }
        });
    });
    
    server.listen(port, () => {
        console.log(`[Webhook] Server running on port ${port}`);
        console.log(`[Webhook] Endpoint: POST http://localhost:${port}/webhook`);
    });
    
    return server;
}


// Handle successful payment from webhook
async function handlePaymentSuccess(payload){
    try{
        const db = require("../database/db");
        const orderId = payload.order_id || payload.reference;
        
        // Find participant by order ID
        const allPeserta = db.getAllPeserta();
        const peserta = allPeserta.all.find(p => p.cashi_order_id === orderId);
        
        if(!peserta){
            console.warn(`[Webhook] Participant not found for order: ${orderId}`);
            return;
        }
        
        // Update status if still pending/waiting
        if(peserta.status === "Pending" || peserta.status === "Waiting_Payment"){
            const result = db.updateStatus(peserta.id, "Paid");
            
            if(result.success && waSocket){
                console.log(`[Webhook] ✅ Payment confirmed via webhook: ${peserta.id}`);
                
                // Send notification
                try{
                    await waSocket.sendMessage(
                        `${peserta.phone}@s.whatsapp.net`,
                        {
                            text: `💰 *PEMBAYARAN KONFIRMASI!*\n\nTerima kasih! Pembayaran Anda telah diterima ✅\n\n🆔 Kode: ${peserta.id}\n👥 Team: ${peserta.team}\n\nSelamat bertanding! 🎮`
                        }
                    );
                } catch(sendError){
                    console.error("[Webhook] Failed send notification:", sendError.message);
                }
            }
        }
        
    } catch(error){
        console.error("[Webhook] Error handling payment:", error.message);
    }
}


// Find participant by order ID (for polling integration)
function findPesertaByOrderId(orderId){
    try{
        const db = require("../database/db");
        const allPeserta = db.getAllPeserta();
        return allPeserta.all.find(p => p.cashi_order_id === orderId) || null;
    } catch(error){
        return null;
    }
}


module.exports = {
    startWebhookServer,
    setWASocket,
    findPesertaByOrderId
};
