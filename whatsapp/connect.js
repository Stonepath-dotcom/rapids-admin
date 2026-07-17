const { makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require("@whiskeysockets/baileys");
const pino = require("pino");

let sock = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;


// Create WhatsApp connection with Telegram pairing code support
async function createConnection(options = {}){
    const { phoneNumber, onPairingCode } = options;
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys_folder");
    
    const socketConfig = {
        logger: pino({ level: "silent" }),
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        syncFullHistory: false
    };
    
    // If phone number provided, use pairing code mode (NO QR SCAN!)
    if(phoneNumber){
        socketConfig.requestPairingCode = true;
        console.log(`[WA] 📱 Pairing mode activated for: ${phoneNumber}`);
    } else {
        // Fallback to QR if no phone number
        socketConfig.printQRInTerminal = true;
        console.log("[WA] ⚠️ No phone number set, using QR mode");
        console.log("[WA] Add PHONE_NUMBER to .env for pairing code via Telegram!");
    }
    
    sock = makeWASocket(socketConfig);
    
    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Handle QR (fallback only)
        if(qr && !phoneNumber){
            console.log("[WA] QR Code received! Scan with your phone.");
            // Also try to send QR info via Telegram
            sendToTelegram(`📷 *QR Code Received!*\n\nScan QR di terminal untuk connect.\n\nAtau tambah \`PHONE_NUMBER\` di .env biar dapet pairing code via Telegram!`);
        }
        
        // Handle Pairing Code - SEND TO TELEGRAM!
        if(update.pairingCode && phoneNumber){
            const code = update.pairingCode;
            console.log(`\n[WA] 🔐 PAIRING CODE: ${code}`);
            console.log(`[WA] Masukkan kode ini di WhatsApp: ${code}\n`);
            
            // Send to Telegram!
            sendToTelegram(
                `🔐 *PAIRING CODE WHATSAPP*\n\n` +
                `┌─────────────────────┐\n` +
                `│   *${code}*   │\n` +
                `└─────────────────────┘\n\n` +
                `📱 Nomor: ${phoneNumber}\n\n` +
                `Cara pair:\n` +
                `1. Buka WhatsApp → Settings → Linked Devices\n` +
                `2. Tap "Link a Device"\n` +
                `3. Masukkan kode: *${code}*\n\n` +
                `⏰ Kode berlaku 2 menit!`,
                { parse_mode: "Markdown" }
            );
            
            // Also call callback if provided
            if(onPairingCode){
                onPairingCode(code);
            }
        }
        
        if(connection === "close"){
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`[WA] Connection closed due to: ${lastDisconnect?.error?.output?.payload?.message}`);
            
            // Notify via Telegram
            sendToTelegram(`❌ *WhatsApp Disconnected*\n\nReason: ${lastDisconnect?.error?.output?.payload?.message || "Unknown"}`);
            
            if(shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS){
                reconnectAttempts++;
                console.log(`[WA] Reconnecting... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                await delay(5000);
                createConnection(options);
            } else if(reconnectAttempts >= MAX_RECONNECT_ATTEMPTS){
                console.log("[WA] Max reconnection attempts reached. Please restart the bot.");
                sendToTelegram("🚫 *WhatsApp Error*\n\nMax reconnect reached. Restart bot!");
            } else {
                // Logged out - need to delete auth folder and re-pair
                console.log("[WA] Logged out! Delete auth_info_baileys_folder and restart.");
                sendToTelegram("🚫 *WhatsApp Logged Out!*\n\nHapus folder \`auth_info_baileys_folder\` lalu restart bot.");
            }
        }
        
        if(connection === "open"){
            console.log("[WA] ✅ Connected to WhatsApp!");
            reconnectAttempts = 0;
            
            // Notify admin once on connect
            sendToTelegram("✅ *WhatsApp Bot Connected!*\n\nBot siap menerima pesan.");
            
            if(global.onWAConnected){
                global.onWAConnected();
            }
        }
    });
    
    sock.ev.on("creds.update", saveCreds);
    
    return sock;
}


// Helper: Send message via Telegram (global bot instance)
function sendToTelegram(text, extraOptions = {}){
    if(global.botInstance && process.env.OWNER_ID){
        global.botInstance.telegram.sendMessage(process.env.OWNER_ID, text, extraOptions)
            .catch(err => console.error("[TG] Send error:", err.message));
    }
}


// Get current socket instance
function getSocket(){
    return sock;
}


// Request new pairing code (call this from Telegram command)
async function requestNewPairingCode(phoneNumber){
    // Delete old auth first
    const fs = require("fs");
    const path = require("path");
    const authDir = path.join(process.cwd(), "auth_info_baileys_folder");
    
    if(fs.existsSync(authDir)){
        fs.rmSync(authDir, { recursive: true, force: true });
        console.log("[WA] Old auth deleted for re-pairing");
    }
    
    // Create new connection with pairing code
    return createConnection({ phoneNumber });
}


module.exports = {
    createConnection,
    getSocket,
    requestNewPairingCode
};
