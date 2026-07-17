const http = require("http");
const { handleWebhook } = require("./cashi_helper");
const db = require("../database/db");

// Store WA socket reference for sending notifications
let waSock = null;

function setWASocket(sock){
    waSock = sock;
}

// Create webhook HTTP server
function startWebhookServer(port = 3000){
    
    const server = http.createServer(async (req, res) => {
        // Only handle POST /webhook
        if(req.method === "POST" && req.url === "/webhook"){
            
            let body = "";
            
            req.on("data", chunk => body += chunk);
            
            req.on("end", async () => {
                try{
                    const signature = req.headers["x-gateway-signature"] || "";
                    const reqBody = JSON.parse(body);
                    
                    // Handle webhook
                    const result = handleWebhook(reqBody, signature);
                    
                    if(!result.valid){
                        res.writeHead(401, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: "Invalid signature" }));
                        return;
                    }
                    
                    if(result.isTest){
                        console.log("[WEBHOOK] Test payment received:", result.data.order_id);
                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ message: "Test OK" }));
                        return;
                    }
                    
                    if(result.isSettled){
                        console.log("[WEBHOOK] Payment settled! Order:", result.data.order_id);
                        
                        // Extract participant ID from order_id
                        // Format: FTSG-XXX or custom
                        const orderId = result.data.order_id;
                        
                        // Find participant by order_id (we need to store this)
                        // For now, update based on order_id matching
                        const peserta = findPesertaByOrderId(orderId);
                        
                        if(peserta && peserta.status !== "Paid"){
                            // Update status to Paid
                            const updateResult = db.updateStatus(peserta.id, "Paid", `Auto-paid via cashi.id (${orderId})`);
                            
                            if(updateResult.success){
                                console.log(`[WEBHOOK] Updated ${peserta.id} to PAID`);
                                
                                // Send WhatsApp notification
                                if(waSock){
                                    try{
                                        await waSock.sendMessage(`${peserta.phone}@s.whatsapp.net`, {
                                            text: `💰 PEMBAYARAN TERVERIFIKASI OTOMATIS!

━━━━━━━━━━━━━━━
🆔 Kode: ${peserta.id}
👥 Team: ${peserta.team}
⏰ Sesi: ${peserta.session} (${peserta.jam})
📊 Status: LUNAS ✅
💳 Via: QRIS cashi.id
📝 Order ID: ${orderId}
━━━━━━━━━━━━━━━

🎉 Terima kasih! Pembayaran Anda telah dikonfirmasi otomatis.

📌 Info Turnamen:
• Datang 30 menit sebelum sesi dimulai
• Bawa kartu identitas
• Pastikan nickname FF sudah benar

Selamat bertanding! 🏆`
                                        });
                                        console.log(`[WA] Auto-payment notification sent to ${peserta.phone}`);
                                    } catch(error){
                                        console.error(`[WA] Failed to send auto-notification:`, error.message);
                                    }
                                }
                                
                                // Notify admin via Telegram (if available)
                                if(global.botInstance && global.OWNER_ID){
                                    try{
                                        await global.botInstance.telegram.sendMessage(
                                            global.OWNER_ID,
                                            `✅ PEMBAYARAN OTOMatis MASUK!

🆔 Peserta: ${peserta.id}
👥 Team: ${peserta.team}
💰 Amount: ${result.data.amount || "N/A"}
📝 Order ID: ${orderId}

Status sudah otomatis LUNAS ✅`
                                        );
                                    } catch(e){
                                        console.error("[TG] Failed to notify admin:", e.message);
                                    }
                                }
                            }
                        } else if(!peserta){
                            console.warn(`[WEBHOOK] Participant not found for order: ${orderId}`);
                        } else {
                            console.log(`[WEBHOOK] Participant ${peserta.id} already paid`);
                        }
                        
                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ message: "OK" }));
                        return;
                    }
                    
                    if(result.ignored){
                        console.log(`[WEBHOOK] Event ignored: ${result.event}`);
                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ message: "Event ignored" }));
                        return;
                    }
                    
                    // Default response
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ message: "OK" }));
                    
                } catch(error){
                    console.error("[WEBHOOK] Error processing:", error);
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Internal server error" }));
                }
            });
            
            return;
        }
        
        // Health check endpoint
        if(req.method === "GET" && req.url === "/health"){
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
            return;
        }
        
        // 404 for other routes
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
    });

    server.listen(port, () => {
        console.log(`[WEBHOOK] Server running on port ${port}`);
        console.log(`[WEBHOOK] Endpoint: POST http://localhost:${port}/webhook`);
        console.log(`[WEBHOOK] Health: GET http://localhost:${port}/health`);
    });

    return server;
}


// Helper to find participant by order_id
// We need to store order_id when creating payment
function findPesertaByOrderId(orderId){
    const allPeserta = db.getAllPeserta();
    
    // Try exact match first
    let peserta = allPeserta.all.find(p => p.order_id === orderId);
    
    if(peserta) return peserta;
    
    // Try matching with prefix (FTSG-XXX format)
    // The order_id from cashi might be different from our internal ID
    // So we need to check our stored mapping
    
    // For now, search by any field that might contain the order id
    peserta = allPeserta.all.find(p => 
        p.cashi_order_id === orderId || 
        p.payment_reference === orderId
    );
    
    return peserta || null;
}


module.exports = {
    startWebhookServer,
    setWASocket,
    findPesertaByOrderId
};
