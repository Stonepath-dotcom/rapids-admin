// Load environment variables
require("dotenv").config();

const waConnect = require("./whatsapp/connect");
const waMessage = require("./whatsapp/message");
const tgBot = require("./telegram/bot");
const paymentPolling = require("./utils/payment_polling");

console.log(`
╔═══════════════════════════════════════╗
║   🎮 FF TOURNAMENT BOT - RAPIDS      ║
║   WhatsApp + Telegram + cashi.id QRIS ║
╚═══════════════════════════════════════╝
`);


// Validate environment
if(!process.env.BOT_TOKEN){
    console.error("❌ ERROR: BOT_TOKEN not set in .env!");
    console.error("Please create .env file with your bot token.");
    process.exit(1);
}

if(!process.env.OWNER_ID){
    console.error("❌ ERROR: OWNER_ID not set in .env!");
    console.error("Please create .env file with your owner ID.");
    process.exit(1);
}


// Initialize WhatsApp
async function initWhatsApp(){
    try{
        // Get phone number for pairing code mode
        const phoneNumber = process.env.PHONE_NUMBER || null;
        
        if(phoneNumber){
            console.log(`[Init] Starting WhatsApp (Pairing Code Mode)...`);
            console.log(`[Init] 📱 Phone: ${phoneNumber}`);
        } else {
            console.log(`[Init] Starting WhatsApp (QR Mode - no PHONE_NUMBER in .env)`);
            console.log(`[Init] 💡 Add "PHONE_NUMBER=628xxx" to .env for pairing code via Telegram!`);
        }
        
        const sock = await waConnect.createConnection({ phoneNumber });
        
        // Set up message handler
        await waMessage.handleMessage(sock);
        
        // Set socket for polling notifications
        paymentPolling.setWASocket(sock);
        
        // Set global for callback access
        global.waSocket = sock;
        global.waSendMessage = async function(jid, text){
            await waMessage.sendMessage(sock, jid, text);
        };
        
        console.log("[Init] ✅ WhatsApp ready");
        
        return sock;
        
    } catch(error){
        console.error("[Init] ❌ WhatsApp failed:", error.message);
        return null;
    }
}


// Initialize Telegram
function initTelegram(){
    try{
        console.log("[Init] Starting Telegram bot...");
        const bot = tgBot.initBot(process.env.BOT_TOKEN);
        
        // Set global for other modules
        global.botInstance = bot;
        
        // WA connected notification handler
        global.onWAConnected = function(){
            if(bot && process.env.OWNER_ID){
                bot.telegram.sendMessage(process.env.OWNER_ID, 
                    "✅ *WhatsApp Bot Connected!*\n\nBot siap menerima pesan.",
                    { parse_mode: "Markdown" }
                ).catch(err => console.error("[TG] Notify error:", err.message));
            }
        };
        
        // Payment proof handler (from WA)
        global.onPaymentProof = function(pesertaId, buffer, proofData){
            if(bot && process.env.OWNER_ID){
                bot.telegram.sendPhoto(
                    process.env.OWNER_ID,
                    { source: buffer },
                    {
                        caption: `📸 *BUKTI PEMBAYARAN BARU*\n\n🆔 Kode: ${pesertaId}\n⏰ Waktu: ${new Date().toLocaleString("id-ID")}\n\nPilih action:`,
                        parse_mode: "Markdown"
                    }
                ).catch(err => console.error("[TG] Send photo error:", err.message));
            }
        };
        
        console.log("[Init] ✅ Telegram ready");
        
        return bot;
        
    } catch(error){
        console.error("[Init] ❌ Telegram failed:", error.message);
        return null;
    }
}


// Start polling system
function startPolling(){
    try{
        console.log("[Init] Starting payment polling...");
        paymentPolling.startPolling(2); // Check every 2 minutes
        console.log("[Init] ✅ Polling started (every 2 min)");
    } catch(error){
        console.error("[Init] ⚠️ Polling error:", error.message);
    }
}


// Main startup
async function main(){
    console.log("\n[Init] 🚀 Starting all services...\n");
    
    // Start Telegram first (simpler, no auth needed)
    const tg = initTelegram();
    
    // Start WhatsApp (requires pairing/QR scan)
    const wa = await initWhatsApp();
    
    // Start payment polling
    startPolling();
    
    console.log("\n" + "=".repeat(45));
    console.log("✅ All systems initialized!");
    console.log("=".repeat(45));
    
    if(process.env.PHONE_NUMBER){
        console.log("\n📱 WhatsApp: Pairing Code Mode - check Telegram for code!");
        console.log(`📱 Phone: ${process.env.PHONE_NUMBER}`);
    } else {
        console.log("\n📱 WhatsApp: QR Mode (add PHONE_NUMBER to .env for pairing)");
    }
    
    console.log("🤖 Telegram: Bot is running");
    console.log("💰 Payment Polling: Active (every 2 min)");
    console.log("\nPress Ctrl+C to stop\n");
}


// Handle graceful shutdown
process.on("SIGINT", () => {
    console.log("\n[Shutdown] Shutting down gracefully...");
    paymentPolling.stopPolling();
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\n[Shutdown] Received SIGTERM");
    paymentPolling.stopPolling();
    process.exit(0);
});


// Handle uncaught errors
process.on("uncaughtException", (error) => {
    console.error("[Error] Uncaught exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("[Error] Unhandled rejection:", reason);
});


// Start the application
main().catch(error => {
    console.error("[Fatal] Startup failed:", error);
    process.exit(1);
});
