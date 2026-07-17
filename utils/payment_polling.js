let waSocket = null;
let pollingInterval = null;
let pollingStats = {
    totalChecks: 0,
    confirmedPayments: 0,
    lastCheck: null,
    errors: 0
};


// Set WA socket instance for sending notifications
function setWASocket(sock){
    waSocket = sock;
    
    // Also set globally for callback access
    global.waSocket = sock;
    global.waSendMessage = async function(jid, text){
        try{
            await sock.sendMessage(jid, { text: text });
        } catch(error){
            console.error("[Polling] WA send error:", error.message);
        }
    };
}


// Start polling for payment confirmation
function startPolling(intervalMinutes = 2){
    if(pollingInterval){
        clearInterval(pollingInterval);
    }
    
    const intervalMs = intervalMinutes * 60 * 1000;
    
    console.log(`[Polling] Starting payment check every ${intervalMinutes} minutes...`);
    
    // Run immediately on start
    checkAllPendingPayments();
    
    // Then run on interval
    pollingInterval = setInterval(checkAllPendingPayments, intervalMs);
}


// Force check specific participant
async function forceCheck(pesertaId){
    try{
        const db = require("../database/db");
        const cashiHelper = require("./cashi_helper");
        
        const peserta = db.getPesertaById(pesertaId);
        if(!peserta || !peserta.cashi_order_id){
            return { success: false, message: "Peserta tidak ada atau tidak ada order ID" };
        }
        
        const status = await cashiHelper.getPaymentStatus(peserta.cashi_order_id);
        
        if(status.success && status.status === "paid"){
            // Update to Paid
            await confirmPayment(db, peserta);
            return { success: true, message: "Pembayaran dikonfirmasi!" };
        }
        
        return { success: true, message: `Status: ${status.status}` };
        
    } catch(error){
        return { success: false, message: error.message };
    }
}


// Check all pending payments
async function checkAllPendingPayments(){
    try{
        const db = require("../database/db");
        const cashiHelper = require("./cashi_helper");
        
        const pending = db.getPendingRegistrations();
        const pendingWithOrder = pending.filter(p => p.cashi_order_id);
        
        if(pendingWithOrder.length === 0){
            console.log(`[Polling] No pending payments with order ID to check`);
            return;
        }
        
        console.log(`[Polling] Checking ${pendingWithOrder.length} pending payments...`);
        pollingStats.totalChecks++;
        pollingStats.lastCheck = new Date().toISOString();
        
        for(const peserta of pendingWithOrder){
            try{
                const status = await cashiHelper.getPaymentStatus(peserta.cashi_order_id);
                
                if(status.success && status.status === "paid"){
                    await confirmPayment(db, peserta);
                    pollingStats.confirmedPayments++;
                }
                
                // Small delay between checks to avoid rate limit
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch(error){
                console.error(`[Polling] Error checking ${peserta.id}:`, error.message);
                pollingStats.errors++;
            }
        }
        
    } catch(error){
        console.error("[Polling] Error in checkAllPendingPayments:", error.message);
        pollingStats.errors++;
    }
}


// Confirm payment and update status
async function confirmPayment(db, peserta){
    try{
        const result = db.updateStatus(peserta.id, "Paid");
        
        if(result.success){
            console.log(`[Polling] ✅ Payment confirmed: ${peserta.id}`);
            
            // Send WA notification
            if(waSocket && peserta.phone){
                const message =
`💰 *PEMBAYARAN KONFIRMASI OTOMATIS!*

Terima kasih! Pembayaran Anda telah **DITERIMA** ✅

📋 Detail:
🆔 Kode: ${peserta.id}
👥 Team: ${peserta.team}
⏰ Sesi: ${peserta.session} (${peserta.jam})
💳 Nominal: Rp 3.100

Selamat bertanding di turnamen FTSG! 🎮`;

                try{
                    await waSocket.sendMessage(
                        `${peserta.phone}@s.whatsapp.net`,
                        { text: message }
                    );
                    console.log(`[Polling] ✓ Notified ${peserta.phone}`);
                } catch(sendError){
                    console.error(`[Polling] Failed notify ${peserta.phone}:`, sendError.message);
                }
            }
            
            // Send TG notification to admin
            if(global.botInstance && process.env.OWNER_ID){
                try{
                    await global.botInstance.telegram.sendMessage(
                        process.env.OWNER_ID,
`💰 *PEMBAYARAN OTOMATIS TERKONFIRMASI*

🆔 Peserta: ${peserta.id}
👥 Team: ${peserta.team}
💳 Via: QRIS (cashi.id)
⏰ Waktu: ${new Date().toLocaleString("id-ID")}`,
                        { parse_mode: "Markdown" }
                    );
                } catch(tgError){
                    console.error("[Polling] Failed TG notify:", tgError.message);
                }
            }
            
            // Generate updated Excel
            try{
                const excelHelper = require("./excel_helper");
                excelHelper.generateAndSendExcel(global.botInstance, process.env.OWNER_ID)
                    .catch(err => console.error("[Polling] Excel error:", err.message));
            } catch(excelErr){
                // Ignore excel errors
            }
        }
        
    } catch(error){
        console.error(`[Polling] Error confirming payment for ${peserta.id}:`, error.message);
    }
}


// Get polling statistics
function getPollingStats(){
    return { ...pollingStats };
}


// Stop polling
function stopPolling(){
    if(pollingInterval){
        clearInterval(pollingInterval);
        pollingInterval = null;
        console.log("[Polling] Stopped");
    }
}


module.exports = {
    startPolling,
    stopPolling,
    setWASocket,
    forceCheck,
    getPollingStats
};
