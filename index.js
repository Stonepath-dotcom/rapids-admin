require("dotenv").config();

const bot = require("./telegram/bot");
const { callback, setWASocket } = require("./telegram/callback");
const waConnect = require("./whatsapp/connect");
const waMessage = require("./whatsapp/message");
const excelHelper = require("./utils/excel_helper");
const { startWebhookServer, setWASocket: setWebhookWASocket } = require("./utils/webhook_server");
const { startPolling, setWASocket: setPollingWASocket } = require("./utils/payment_polling");


// aktifkan tombol telegram
callback(bot);


// jalankan bot telegram
bot.launch()
.then(() => {

    console.log("✅ Telegram Bot Online");
    
    // Set global bot instance for Excel generation
    global.botInstance = bot;

    // Start webhook server for cashi.id auto-payment (optional)
    const WEBHOOK_PORT = process.env.WEBHOOK_PORT || 3000;
    startWebhookServer(WEBHOOK_PORT);
    console.log(`✅ Webhook Server started on port ${WEBHOOK_PORT}`);

    // Start polling system for auto-payment check (every 2 minutes)
    const POLLING_INTERVAL = parseInt(process.env.POLLING_INTERVAL) || 2;
    startPolling(POLLING_INTERVAL);
    console.log(`✅ Payment Polling started (every ${POLLING_INTERVAL} min)`);

})
.catch((err)=>{

    console.log("❌ Telegram Error:", err);

});


// Inisialisasi WhatsApp
async function initWhatsApp(){
    
    try{
        console.log("⏳ Memulai koneksi WhatsApp...");
        
        // Set Telegram bot reference for WA notifications
        waConnect.setTelegramBot(bot);
        
        const sock = await waConnect.connectToWhatsApp();
        
        // Setup message handler setelah socket siap
        waMessage.handleMessage(sock);
        
        console.log("✅ WhatsApp Message Handler Aktif");
        
        // Set socket ke callback untuk notifikasi admin
        setWASocket(sock);
        
        // Set socket ke webhook server untuk auto-payment notification
        setWebhookWASocket(sock);
        
        // Set socket ke polling system untuk auto-payment notification
        setPollingWASocket(sock);
        
        // Setup global handlers for notifications to admin
        setupGlobalNotifications(sock);
        
    } catch(error){
        console.log("❌ WhatsApp Error:", error.message);
    }

}


// Setup global notification handlers
function setupGlobalNotifications(sock){
    
    // NOTE: Registration data langsung masuk ke database
    // Tidak ada notifikasi ke Telegram saat daftar (biar gak spam)
    // Admin bisa lihat data di menu PESERTA / SESI
    
    // Handler: Payment proof received - notify Telegram admin with photo
    global.onPaymentProof = async (pesertaId, buffer, proofData) => {
        console.log(`[SYSTEM] Payment proof for ${pesertaId}`);
        
        const peserta = db.getPesertaById(pesertaId);
        if(!peserta) return;
        
        try{
            // Try sending photo first
            await bot.telegram.sendPhoto(process.env.OWNER_ID, Buffer.from(buffer), {
                caption:
`📸 *BUKTI PEMBAYARAN*

━━━━━━━━━━━━━━━
🆔 Kode: ${peserta.id}
👥 Team: ${peserta.team}
👤 Nick: ${peserta.kapten}
⏰ Sesi: ${peserta.session} (${peserta.jam})
💰 Nominal: Rp 3.100
━━━━━━━━━━━━━━━`,
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback("✅ Approve", `approve_${pesertaId}`),
                        Markup.button.callback("❌ Tolak", `reject_${pesertaId}`)
                    ],
                    [
                        Markup.button.callback("💰 Konfirmasi Lunas", `confirm_payment_${pesertaId}`)
                    ]
                ])
            });
            
            console.log(`[TG] Payment proof sent for ${peserta.id}`);
            
        } catch(photoError){
            console.error("[TG] Failed to send photo, fallback to text:", photoError.message);
            
            // Fallback: send text only
            try{
                await bot.telegram.sendMessage(process.env.OWNER_ID,
`📸 *BUKTI PEMBAYARAN BARU*

━━━━━━━━━━━━━━━
🆔 Kode: ${peserta.id}
👥 Team: ${peserta.team}
👤 Nick: ${peserta.kapten}

(Bukti foto tidak dapat ditampilkan)`,
                    {
                        parse_mode: "Markdown",
                        ...Markup.inlineKeyboard([
                            [
                                Markup.button.callback("✅ Approve", `approve_${pesertaId}`),
                                Markup.button.callback("❌ Tolak", `reject_${pesertaId}`)
                            ],
                            [
                                Markup.button.callback("💰 Konfirmasi Lunas", `confirm_payment_${pesertaId}`)
                            ]
                        ])
                    }
                );
                
            } catch(textError){
                console.error("[TG] Failed to send text notification:", textError.message);
            }
        }
        
        // Also send updated Excel file after payment proof
        try {
            await excelHelper.generateAndSendExcel(bot, process.env.OWNER_ID);
            console.log("[TG] ✓ Updated Excel sent after payment proof");
        } catch(excelErr) {
            console.error("[TG] Error sending Excel:", excelErr.message);
        }
    };
    
    console.log("[SYSTEM] Global notification handlers ready");
}

// Need db for payment proof handler
const db = require("./database/db");

// Import Markup from telegraf for inline keyboards
const { Markup } = require("telegraf");


// Jalankan WhatsApp
initWhatsApp();


// stop aman
process.once("SIGINT", () => {
    
    console.log("\n🛑 Shutting down gracefully...");
    bot.stop("SIGINT");
    
});

process.once("SIGTERM", () => {

    console.log("\n🛑 Shutting down gracefully...");
    bot.stop("SIGTERM");

});
