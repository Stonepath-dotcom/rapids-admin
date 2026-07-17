const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const { Boom } = require("@hapi/boom");
const fs = require("fs");


let sock;
let connectionStatus = "disconnected";
let tgBot = null; // Telegram bot reference for notifications
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// Flags to prevent spam notifications
let hasNotifiedConnecting = false;
let hasNotifiedConnected = false;


// Ensure session folder exists
if (!fs.existsSync("./session")) {
    fs.mkdirSync("./session", { recursive: true });
}


// Set Telegram bot reference (for sending notifications)
function setTelegramBot(bot){
    tgBot = bot;
    console.log("[WA] Telegram bot reference set for notifications");
}


async function connectToWhatsApp(phoneNumber = null, sendCode = null){

    const { state, saveCreds } = await useMultiFileAuthState("./session");

    sock = makeWASocket({

        auth: state,

        logger: pino({
            level:"silent"
        }),

        browser: Browsers.ubuntu("Chrome")

    });



    sock.ev.on(
        "creds.update",
        saveCreds
    );



    sock.ev.on(
        "connection.update",
        async(update)=>{

            const {
                connection,
                lastDisconnect
            } = update;

            const statusCode = new Boom(update.lastDisconnect?.error)
                ?.output?.statusCode;




            if(connection === "connecting"){

                console.log("⏳ WhatsApp Connecting...");

                // Notify Telegram ONLY ONCE (prevent spam on reconnect)
                if(!hasNotifiedConnecting){
                    await notifyTelegram(
                        "⏳ *WhatsApp Menyambungkan...*\n\nMencoba koneksi ke WhatsApp Server..."
                    );
                    hasNotifiedConnecting = true;
                }

                // FIX: Better timing for pairing code request
                // Wait longer and check if socket is ready
                if(
                    phoneNumber &&
                    !state.creds?.registered
                ){

                    try{
                        // FIX: Increased delay + retry logic
                        console.log("⏳ Waiting for socket ready...");
                        
                        // Wait 5 seconds instead of 3
                        await new Promise(r => setTimeout(r, 5000));
                        
                        // Additional check - wait a bit more if needed
                        await new Promise(r => setTimeout(r, 1000));


                        const code =
                        await sock.requestPairingCode(
                            phoneNumber
                        );


                        console.log(
                            "✅ PAIRING CODE:",
                            code
                        );


                        if(sendCode){
                            sendCode(code);
                        }
                        
                        // Notify Telegram with pairing code
                        await notifyTelegram(
                            "🔐 *PAIRING CODE WhatsApp*\n\n`" + code + "`\n\nMasukkan kode ini di WhatsApp:\n*Perangkat Tertaut → Tautkan dengan nomor telepon*"
                        );


                    }catch(err){

                        console.log(
                            "❌ Pairing gagal:",
                            err.message
                        );
                        
                        // Send error callback if available
                        if(sendCode){
                            sendCode(null);
                        }
                        
                        // Notify Telegram about error
                        await notifyTelegram(
                            "❌ *Pairing Gagal!*\n\nError: " + err.message + "\n\nPastikan nomor benar dan coba lagi."
                        );


                    }


                }


            }



            if(connection === "open"){

                console.log(
                    "✅ WhatsApp Connected"
                );
                
                connectionStatus = "connected";
                reconnectAttempts = 0; // Reset on successful connection
                
                // Notify Telegram - SUCCESS! (ONLY ONCE)
                if(!hasNotifiedConnected){
                    await notifyTelegram(
                        "✅ *WhatsApp Connected!*\n\nBot WhatsApp sudah online dan siap menerima pesan.\n\n📱 Status: *Online*\n🔄 Auto-reconnect: *Aktif*"
                    );
                    hasNotifiedConnected = true;
                }
                
                // Resolve any pending connection promises
                if(global.waResolve){
                    global.waResolve(sock);
                    global.waResolve = null;
                }


            }



            if(connection === "close"){

                const reconnect =
                statusCode
                !== DisconnectReason.loggedOut;

                console.log(
                    "❌ WhatsApp Closed (Code: " + statusCode + ")"
                );
                
                // Notify Telegram about disconnect (ONLY for important events)
                if(statusCode === DisconnectReason.loggedOut){
                    // Reset flags so next connection will notify again
                    hasNotifiedConnecting = false;
                    hasNotifiedConnected = false;
                    
                    await notifyTelegram(
                        "📴 *WhatsApp Disconnected!*\n\nSession sudah logout atau expired.\n\nSilakan lakukan pairing ulang dengan klik tombol *Pairing Code*."
                    );
                } else if(reconnectAttempts >= MAX_RECONNECT_ATTEMPTS){
                    // Only notify when max attempts reached
                    await notifyTelegram(
                        "❌ *Gagal Reconnect!*\n\nSudah mencoba " + MAX_RECONNECT_ATTEMPTS + " kali tapi gagal.\n\nSilakan restart bot manual:\n`node index.js`"
                    );
                }
                // NOTE: Don't notify for normal disconnects/reconnects to avoid spam


                if(reconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS){
                    
                    reconnectAttempts++;
                    var delay = Math.min(5000 * reconnectAttempts, 30000); // Max 30 seconds
                    
                    console.log("🔄 Reconnecting in " + (delay/1000) + " seconds... (attempt " + reconnectAttempts + ")");
                    
                    setTimeout(async ()=>{
                        await connectToWhatsApp(
                            phoneNumber,
                            sendCode
                        );
                    }, delay);

                } else if(reconnectAttempts >= MAX_RECONNECT_ATTEMPTS){
                    
                    console.log("❌ Max reconnect attempts reached");
                    // Notification already sent above
                    
                } else {
                    
                    console.log("📱 Session expired, please re-pair");
                    connectionStatus = "disconnected";
                    
                    // Reject pending connection if any
                    if(global.waReject){
                        global.waReject(new Error("Logged out"));
                        global.waReject = null;
                    }

                }


            }


        }
    );


    return sock;


}


// Helper function to send notification to Telegram
async function notifyTelegram(message){
    if(!tgBot || !process.env.OWNER_ID){
        return; // Skip if no bot or owner ID configured
    }
    
    try{
        await tgBot.telegram.sendMessage(process.env.OWNER_ID, message, {
            parse_mode: "Markdown"
        });
        console.log("[WA] Telegram notification sent");
    } catch(error){
        console.error("[WA] Failed to send Telegram notification:", error.message);
    }
}


// Get current socket instance
function getSocket(){
    return sock;
}

// Get connection status
function getStatus(){
    return connectionStatus;
}

// Check if connected
function isConnected(){
    return connectionStatus === "connected" && sock !== null;
}

// Wait for connection (useful for other modules)
function waitForConnection(timeout = 30000){
    return new Promise((resolve, reject) => {
        if(isConnected()){
            resolve(sock);
            return;
        }
        
        global.waResolve = resolve;
        global.waReject = reject;
        
        setTimeout(() => {
            if(global.waReject === reject){
                global.waReject = null;
                global.waResolve = null;
                reject(new Error("Connection timeout"));
            }
        }, timeout);
    });
}


module.exports={
    connectToWhatsApp,
    getSocket,
    getStatus,
    isConnected,
    waitForConnection,
    setTelegramBot
};
