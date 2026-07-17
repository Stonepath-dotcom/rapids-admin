const { makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require("@whiskeysockets/baileys");
const pino = require("pino");

let sock = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;


// Create WhatsApp connection
async function createConnection(){
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys_folder");
    
    sock = makeWASocket({
        logger: pino({ level: "silent" }),
        auth: state,
        printQRInTerminal: true,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        syncFullHistory: false
    });
    
    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if(qr){
            console.log("[WA] QR Code received! Scan with your phone.");
            console.log("[WA] QR:", qr);
        }
        
        if(connection === "close"){
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`[WA] Connection closed due to: ${lastDisconnect?.error?.output?.payload?.message}`);
            
            if(shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS){
                reconnectAttempts++;
                console.log(`[WA] Reconnecting... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                await delay(5000);
                createConnection();
            } else if(reconnectAttempts >= MAX_RECONNECT_ATTEMPTS){
                console.log("[WA] Max reconnection attempts reached. Please restart the bot.");
            }
        }
        
        if(connection === "open"){
            console.log("[WA] ✅ Connected to WhatsApp!");
            reconnectAttempts = 0;
            
            // Notify admin once on connect
            if(global.onWAConnected){
                global.onWAConnected();
            }
        }
    });
    
    sock.ev.on("creds.update", saveCreds);
    
    return sock;
}


// Get current socket instance
function getSocket(){
    return sock;
}


module.exports = {
    createConnection,
    getSocket
};
