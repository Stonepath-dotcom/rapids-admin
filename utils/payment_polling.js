const cashiHelper = require("./cashi_helper");
const db = require("../database/db");

// Store WA socket reference
let waSock = null;

function setWASocket(sock){
    waSock = sock;
}

// Track checked orders to avoid re-checking
const checkedOrders = new Set();
const MAX_CHECK_ATTEMPTS = 60; // Max 2 hours (60 checks x 2 min)

// Start polling for payment status
function startPolling(intervalMinutes = 2){
    
    console.log(`[POLLING] Payment status checker started (every ${intervalMinutes} min)`);
    
    // Run immediately on start
    checkPendingPayments();
    
    // Then run every interval
    setInterval(checkPendingPayments, intervalMinutes * 60 * 1000);
}


// Check all pending/waiting payments
async function checkPendingPayments(){
    try{
        console.log("[POLLING] Checking pending payments...");
        
        const allPeserta = db.getAllPeserta();
        
        // Find participants with cashi order_id and not yet paid
        const pendingPayments = allPeserta.all.filter(p => 
            p.cashi_order_id && 
            p.status !== "Paid" && 
            p.status !== "Rejected"
        );
        
        if(pendingPayments.length === 0){
            console.log("[POLLING] No pending payments to check");
            return;
        }
        
        console.log(`[POLLING] Found ${pendingPayments.length} pending payments`);
        
        for(const peserta of pendingPayments){
            await checkSinglePayment(peserta);
        }
        
    } catch(error){
        console.error("[POLLING] Error checking payments:", error.message);
    }
}


// Check single payment status
async function checkSinglePayment(peserta){
    try{
        const orderId = peserta.cashi_order_id;
        
        // Skip if already checked too many times (order might be expired)
        const checkKey = `${orderId}_${peserta.id}`;
        if(checkedOrders.has(checkKey) && checkedOrders.get(checkKey) >= MAX_CHECK_ATTEMPTS){
            console.log(`[POLLING] Skipping ${orderId} - max attempts reached`);
            return;
        }
        
        // Increment check count
        const currentCount = checkedOrders.get(checkKey) || 0;
        checkedOrders.set(checkKey, currentCount + 1);
        
        // Query cashi.id API for status
        const result = await cashiHelper.getPaymentStatus(orderId);
        
        if(!result.success){
            console.log(`[POLLING] Failed to check ${orderId}: ${result.message}`);
            return;
        }
        
        const paymentData = result.data;
        console.log(`[POLLING] Order ${orderId} status: ${paymentData.status}`);
        
        // Check if payment is settled/confirmed
        if(paymentData.status === "SETTLED" || paymentData.status === "PAID" || paymentData.status === "SUCCESS"){
            
            console.log(`[POLLING] ✅ Payment confirmed! Updating ${peserta.id}`);
            
            // Update participant status to Paid
            const updateResult = db.updateStatus(
                peserta.id, 
                "Paid", 
                `Auto-paid via polling (${orderId})`
            );
            
            if(updateResult.success){
                // Remove from checked orders
                checkedOrders.delete(checkKey);
                
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
                    } catch(waError){
                        console.error(`[WA] Failed to send notification:`, waError.message);
                    }
                }
                
                // Notify admin via Telegram
                if(global.botInstance && global.OWNER_ID){
                    try{
                        await global.botInstance.telegram.sendMessage(
                            global.OWNER_ID,
                            `✅ PEMBAYARAN OTOMATIS MASUK!

🆔 Peserta: ${peserta.id}
👥 Team: ${peserta.team}
💰 Amount: ${paymentData.amount || "N/A"}
📝 Order ID: ${orderId}
🔄 Via: Polling System

Status sudah otomatis LUNAS ✅`
                        );
                    } catch(tgError){
                        console.error("[TG] Failed to notify admin:", tgError.message);
                    }
                }
                
                console.log(`[POLLING] Successfully updated ${peserta.id} to PAID`);
            }
        } else if(paymentData.status === "EXPIRED" || paymentData.status === "FAILED" || paymentData.status === "CANCELLED"){
            
            console.log(`[POLLING] Order ${orderId} expired/failed. Keeping participant as Pending.`);
            
            // Remove from checking - order is dead
            checkedOrders.delete(checkKey);
            
            // Optionally notify admin about failed payment
            if(global.botInstance && global.OWNER_ID){
                try{
                    await global.botInstance.telegram.sendMessage(
                        global.OWNER_ID,
                        `⚠️ Pembayaran EXPIRED/FAILED

🆔 Peserta: ${peserta.id}
👥 Team: ${peserta.team}
📝 Order ID: ${orderId}
❌ Status: ${paymentData.status}

Peserta perlu daftar ulang atau bayar manual.`
                    );
                } catch(e){
                    // Ignore error
                }
            }
        } else {
            // Still pending
            console.log(`[POLLING] Order ${orderId} still pending (${currentCount + 1}/${MAX_CHECK_ATTEMPTS})`);
        }
        
    } catch(error){
        console.error(`[POLLING] Error checking ${peserta.cashi_order_id}:`, error.message);
    }
}


// Manual trigger for testing
async function forceCheck(pesertaId){
    const peserta = db.getPesertaById(pesertaId);
    
    if(!peserta || !peserta.cashi_order_id){
        return { success: false, message: "Peserta tidak punya cashi order ID" };
    }
    
    // Reset check count
    const checkKey = `${peserta.cashi_order_id}_${peserta.id}`;
    checkedOrders.delete(checkKey);
    
    await checkSinglePayment(peserta);
    
    return { success: true };
}


// Get polling stats
function getPollingStats(){
    return {
        trackedOrders: checkedOrders.size,
        activeOrders: Array.from(checkedOrders.entries()).map(([key, count]) => ({
            key,
            checksRemaining: MAX_CHECK_ATTEMPTS - count
        }))
    };
}


module.exports = {
    startPolling,
    setWASocket,
    forceCheck,
    getPollingStats
};
