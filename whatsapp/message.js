const db = require("../database/db");
const cashiHelper = require("../utils/cashi_helper");

// Store temporary registration data per user
const tempRegistration = new Map();


// Format phone number from JID
function formatPhone(remoteJid){
    return remoteJid.replace("@s.whatsapp.net", "").replace("@g.us", "");
}


// Send message helper
async function sendMessage(sock, jid, text){
    try{
        await sock.sendMessage(jid, { text: text });
    } catch(error){
        console.error("[WA] Error sending message:", error.message);
    }
}


// Generate session list for display
function getSessionList(){
    const sessions = db.generateSessions();
    
    let sessionList = "";
    sessions.forEach(s => {
        const status = s.full ? "❌ FULL" : `✅ ${s.slot}/${s.max_slot}`;
        sessionList += `${s.index}. ⏰ ${s.jam} - ${status}\n`;
    });

    return sessionList;
}


// Parse registration data from simple format
// Format: Nama Team (baris 1), Nickname (baris 2), Nomor Sesi (baris 3)
function parseRegistrationData(message){
    const lines = message.trim().split("\n").map(l => l.trim()).filter(l => l);
    
    if(lines.length < 3) return null;
    
    const team = lines[0];
    const nick = lines[1];
    const sessionNum = parseInt(lines[2]);
    
    if(isNaN(sessionNum) || sessionNum < 1) return null;
    
    return { team, nick, sessionNum };
}


// Main message handler
async function handleMessage(sock){

    sock.ev.on("messages.upsert", async ({ messages }) => {

        try {
            const msg = messages[0];

            if(!msg.message) return;

            // Skip messages from self (bot's own messages)
            if(msg.key.fromMe) return;

            const from = msg.key.remoteJid;

            // Handle both text and caption
            const text =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption ||
                "";

            if(!text) return;

            const message = text.trim();
            const phone = formatPhone(from);

            console.log(`[WA] 💬 Message from ${phone}: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);

        // Command: HALO / HELLO / MENU
        if(["halo", "hello", "hi", "menu", "start"].includes(message.toLowerCase())){

            await sendMessage(sock, from,
`👋 *Halo! Selamat Datang di FTSG Tournament*

📝 *Cara Daftar:*
Ketik *DAFTAR* untuk lihat format pendaftaran

📋 *Perintah Lain:*
• STATUS - Cek status pendaftaran
• SESI - Lihat sesi tersedia
• HELP - Bantuan`
            );
            return;
        }


        // Command: DAFTAR - Show registration format
        if(message.toLowerCase() === "daftar"){

            // Check registration limit (max 10 per day)
            const regCount = db.getRegistrationCount(phone);
            const remaining = db.getRemainingRegistrations(phone);
            const MAX_REG = 10;
            
            if(remaining <= 0){
                await sendMessage(sock, from,
`❌ *Anda sudah mencapai batas ${MAX_REG}x registrasi hari ini!*

Total registrasi hari ini: ${regCount}/${MAX_REG}
Hubungi admin jika ingin menambah data.`
                );
                return;
            }

            const sessionList = getSessionList();

            await sendMessage(sock, from,
`🎮 *FORMAT PENDAFTARAN*

Kirim pesan dengan format:

*👥 Nama Team*
*👤 Nickname*
*🔢 Nomor Sesi*

━━━━━━━━━━━━━━━
📊 *Sisa Registrasi:* ${remaining} dari ${MAX_REG}
⏱️ *Sesi Tersedia:*
${sessionList}━━━━━━━━━━━━━━━

*Contoh:*
RRQ Alpha
Budi Gaming
1

━━━━━━━━━━━━━━━
Tinggal kirim langsung, 3 baris saja!`
            );
            
            // Mark that user has seen the form
            tempRegistration.set(phone, {
                step: "ready_to_register",
                timestamp: Date.now()
            });
            return;
        }


        // Try to parse as registration data (3 lines: team, nick, session)
        const regData = parseRegistrationData(message);
        
        if(regData){
            
            // Validate session
            const sessions = db.generateSessions();
            const selectedSession = sessions.find(s => s.index === regData.sessionNum);
            
            if(!selectedSession){
                await sendMessage(sock, from,
`❌ *Sesi ${regData.sessionNum} tidak ditemukan!*

Ketik *SESI* untuk lihat sesi yang tersedia.`
                );
                return;
            }
            
            if(selectedSession.full){
                await sendMessage(sock, from,
`❌ *Sesi ${regData.sessionNum} sudah PENUH!*

Pilih sesi lain yang masih tersedia.
Ketik *DAFTAR* untuk lihat daftar sesi.`
                );
                return;
            }
            
            // Check registration limit (max 10 per day)
            const currentCount = db.getRegistrationCount(phone);
            const remainingReg = db.getRemainingRegistrations(phone);
            
            if(remainingReg <= 0){
                await sendMessage(sock, from,
`❌ *Batas registrasi hari ini tercapai!*

Anda sudah mendaftar ${currentCount}/10 kali hari ini.`
                );
                return;
            }

            // Register to database
            const result = db.registerPeserta({
                team: regData.team,
                kapten: regData.nick,
                phone: phone,
                session: `Sesi ${regData.sessionNum}`,
                jam: selectedSession.jam
            });

            if(!result.success){
                await sendMessage(sock, from, `❌ ${result.message}`);
                return;
            }

            // Clear temp data
            tempRegistration.delete(phone);

            const peserta = result.data;

            // Send short confirmation
            await sendMessage(sock, from,
`✅ *PENDAFTARAN BERHASIL!*

📋 *Data Anda:*
━━━━━━━━━━━━━━━
🆔 Kode: ${peserta.id}
👥 Team: ${peserta.team}
👤 Nick: ${peserta.kapten}
⏰ Sesi: ${peserta.session} (${peserta.jam})
━━━━━━━━━━━━━━━

💰 *PEMBAYARAN*

Silakan lakukan pembayaran untuk konfirmasi pendaftaran.

💳 *Nominal QRIS: Rp 3.100*
💳 *Nominal DANA/SeaBank: Rp 3.000*

⏳ *Langkah Selanjutnya:*
1. Scan QRIS di bawah ini (generate otomatis)
2. Transfer sesuai nominal
3. Pembayaran akan dikonfirmasi OTOMATIS ✅

Menunggu pembayaran Anda... 🙏`);

            // Generate QRIS dynamically via cashi.id
            try {
                const orderId = `${peserta.id}-${Date.now()}`;
                const qrisNominal = 3100; // QRIS nominal
                
                console.log(`[WA] Generating QRIS for ${peserta.id} via cashi.id...`);
                
                const qrisResult = await cashiHelper.createQRISPayment(qrisNominal, orderId);
                
                if(qrisResult.success){
                    const qrisData = qrisResult.data;
                    
                    console.log(`[WA] QRIS generated! Order: ${qrisData.orderId}`);
                    
                    // Store order_id in participant data for webhook matching
                    db.updateCashiOrder(peserta.id, qrisData.orderId);
                    
                    // Send QRIS image (base64) to WhatsApp
                    if(qrisData.qrisUrl && qrisData.qrisUrl.startsWith("data:image")){
                        const base64Data = qrisData.qrisUrl.split(",")[1] || qrisData.qrisUrl;
                        
                        await sock.sendMessage(from, {
                            image: { buffer: Buffer.from(base64Data, "base64") },
                            caption: `📱 *Scan QRIS di atas*

💳 Nominal: *Rp ${qrisNominal.toLocaleString("id-ID")}* ⚡
🆔 Order ID: ${qrisData.orderId}
⏰ Expired: ${qrisData.expiresAt || "24 jam"}

✅ Pembayaran akan dikonfirmasi OTOMATIS setelah Anda transfer!

Atau pakai opsi manual:
💼 DANA: *081234567890* (Rp 3.000)
🏦 SeaBank: *081234567891* (Rp 3.000)`
                        });
                        
                        console.log(`[WA] Dynamic QRIS sent to ${phone}`);
                    } else {
                        await sendMessage(sock, from,
`💳 *QRIS Payment*

🆔 Order ID: ${qrisData.orderId}
💳 Nominal: *Rp ${qrisNominal.toLocaleString("id-ID")}*
⏰ Expired: ${qrisData.expiresAt || "24 jam"}

QRIS sedang diproses...
Jika tidak menerima gambar QRIS dalam 1 menit, hubungi admin.

Atau transfer manual:
💼 DANA: *081234567890*
🏦 SeaBank: *081234567891*`
                        );
                    }
                } else {
                    console.error(`[WA] Failed to generate QRIS: ${qrisResult.message}`);
                    
                    // Fallback to static QRIS or manual payment
                    const fs = require("fs");
                    const path = require("path");
                    const qrisPath = path.join(__dirname, "../download/qris.jpg");
                    
                    if(fs.existsSync(qrisPath)){
                        await sock.sendMessage(from, {
                            image: { url: qrisPath },
                            caption: `📱 Scan QRIS di atas\n\nNominal: *Rp 3.100*\n\nSetelah transfer, kirim bukti transfer ya! 📸`
                        });
                    } else {
                        await sendMessage(sock, from,
`💳 *Pembayaran Manual*

Maaf, QRIS dinamis sedang gangguan.

Silakan transfer manual:
💼 DANA: *081234567890* (Rp 3.000)
🏦 SeaBank: *081234567891* (Rp 3.000)

Kirim bukti transfer ke admin!`
                        );
                    }
                }
            } catch(qrisError){
                console.error("[WA] Error generating/sending QRIS:", qrisError.message);
                
                await sendMessage(sock, from,
`❌ Terjadi kesalahan saat generate QRIS.

Silakan coba lagi atau hubungi admin untuk pembayaran manual.

💼 DANA: *081234567890*
🏦 SeaBank: *081234567891*`
                );
            }

            console.log(`[WA] ✓ New registration: ${peserta.id} (${peserta.team}) - Payment pending`);

            // Generate Excel and notify admin (async, don't wait)
            if(global.botInstance){
                try {
                    const excelHelper = require("../utils/excel_helper");
                    excelHelper.generateAndSendExcel(global.botInstance, process.env.OWNER_ID)
                        .then(result => {
                            if(result.success){
                                console.log("[WA] ✓ Excel sent to Telegram");
                            }
                        })
                        .catch(err => {
                            console.error("[WA] Error sending Excel:", err.message);
                        });
                } catch(excelErr) {
                    console.error("[WA] Excel module error:", excelErr.message);
                }
            }
        }


        // Command: STATUS - Check registration status
        if(message.toUpperCase() === "STATUS"){

            const allPeserta = db.getAllPeserta();
            const myRegistration = allPeserta.all.find(p => p.phone === phone);

            if(!myRegistration){
                await sendMessage(sock, from,
`📋 *Anda belum terdaftar!*

Ketik *DAFTAR* untuk mendaftar turnamen.`
                );
                return;
            }

            const statusEmoji = {
                "Pending": "⏳",
                "Approved": "✅",
                "Paid": "💰",
                "Waiting_Payment": "📸",
                "Rejected": "❌"
            };

            const statusMsg =
`📋 *STATUS PENDAFTARAN ANDA*

━━━━━━━━━━━━━━━
🆔 Kode: ${myRegistration.id}
👥 Team: ${myRegistration.team}
👤 Kapten: ${myRegistration.kapten}
⏰ Sesi: ${myRegistration.session} (${myRegistration.jam})
📊 Status: ${statusEmoji[myRegistration.status] || "📋"} ${myRegistration.status}
━━━━━━━━━━━━━━━`;

            await sendMessage(sock, from, statusMsg);
            return;
        }


        // Command: SESI - View available sessions
        if(message.toUpperCase() === "SESI"){

            const sessions = db.generateSessions();
            const sessionList = getSessionList();

            let availableCount = 0;
            sessions.forEach(s => {
                if(!s.full) availableCount++;
            });

            const sessionMsg =
`⏱️ *SESI TERSEDIA HARI INI*

${sessionList}━━━━━━━━━━━━━━━
Total Sesi Tersedia: ${availableCount}/${sessions.length}

Ketik *DAFTAR* untuk mendaftar`;

            await sendMessage(sock, from, sessionMsg);
            return;
        }


        // Command: HELP/BANTUAN
        if(message.toUpperCase() === "HELP" || message.toUpperCase() === "BANTUAN"){

            const helpMsg =
`🤖 *BOT TURNAMEN FF - BANTUAN*

━━━━━━━━━━━━━━━
📝 *Perintah Tersedia:*

• *DAFTAR* - Lihat format & daftar turnamen
• *STATUS* - Cek status pendaftaran
• *SESI* - Lihat sesi tersedia
• *HALO/HELLO* - Menu utama
• *HELP/BANTUAN* - Pesan ini

━━━━━━━━━━━━━━━
📮 *Format Pendaftaran:*
Kirim 3 baris:
1. Nama Team
2. Nickname
3. Nomor Sesi

Contoh:
RRQ Alpha
Budi Gaming
1`;

            await sendMessage(sock, from, helpMsg);
            return;
        }


        // Handle image messages (payment proof)
        if(msg.message?.imageMessage){

            const myRegistration = db.getAllPeserta().all.find(p => p.phone === phone);

            if(!myRegistration){
                await sendMessage(sock, from,
`❌ *Anda belum terdaftar!*

Ketik *DAFTAR* untuk mendaftar terlebih dahulu.`
                );
                return;
            }

            if(myRegistration.status === "Rejected"){
                await sendMessage(sock, from,
`❌ *Pendaftaran ditolak admin.*

Hubungi admin untuk info lebih lanjut.`
                );
                return;
            }

            if(myRegistration.status === "Paid"){
                await sendMessage(sock, from,
`✅ *Pembayaran sudah dikonfirmasi!*

Tidak perlu mengirim bukti lagi.`
                );
                return;
            }

            // Download and save image
            try{
                const buffer = await sock.downloadMediaMessage(msg);

                // Save payment proof data
                const proofData = {
                    mimetype: msg.message.imageMessage.mimetype,
                    timestamp: new Date().toISOString(),
                    size: buffer.length
                };

                db.savePaymentProof(myRegistration.id, JSON.stringify(proofData));

                // Notify admin about new payment proof
                if(global.onPaymentProof){
                    global.onPaymentProof(myRegistration.id, buffer, proofData);
                }

                await sendMessage(sock, from,
`📸 *Bukti pembayaran diterima!*

🆔 Kode: ${myRegistration.id}
Status: Menunggu verifikasi admin

Admin akan memverifikasi pembayaran Anda segera.`);

            } catch(error){
                console.error("[WA] Error processing image:", error);
                await sendMessage(sock, from,
`❌ *Gagal memproses gambar.*

Coba kembali atau hubungi admin.`
                );
            }

            return;
        }


        // Default response for unrecognized messages
        await sendMessage(sock, from,
`🤖 *BOT TURNAMEN FF*

Maaf, saya tidak mengenali perintah tersebut.

📝 *Perintah Tersedia:*
• HALO - Menu utama
• DAFTAR - Daftar turnamen
• STATUS - Cek status
• SESI - Lihat sesi
• HELP - Bantuan

Ketik *DAFTAR* untuk mulai mendaftar!`
        );

        } catch(error){
            console.error("[WA] Error handling message:", error);
            // Try to send error notification to user
            try {
                if(from && msg){
                    await sendMessage(sock, from,
`❌ Terjadi kesalahan.

Silakan coba lagi atau hubungi admin.`
                    );
                }
            } catch(sendError){
                console.error("[WA] Failed to send error message:", sendError.message);
            }
        }

    });


}


// Clean up old temporary registrations (run every 10 minutes)
function cleanupTempRegistrations(){
    const now = Date.now();
    const TIMEOUT = 30 * 60 * 1000; // 30 minutes

    for(const [phone, data] of tempRegistration.entries()){
        if(now - data.timestamp > TIMEOUT){
            tempRegistration.delete(phone);
            console.log(`[WA] Cleaned up expired temp registration for ${phone}`);
        }
    }
}

// Run cleanup every 10 minutes
setInterval(cleanupTempRegistrations, 10 * 60 * 1000);


module.exports = {
    handleMessage,
    sendMessage,
    formatPhone
};
