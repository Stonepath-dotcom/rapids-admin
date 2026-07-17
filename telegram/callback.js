const { Markup } = require("telegraf");
const { mainMenu, whatsappMenu } = require("./menu");
const { pairing } = require("../whatsapp/pairing");
const db = require("../database/db");

// Store WA socket reference
let waSock = null;

// Set WA socket (called from index.js after connection)
function setWASocket(sock){
    waSock = sock;
    console.log("[TG] WhatsApp socket connected to Telegram callback");
}


function callback(bot){

    // ==================== MAIN MENU BUTTONS ====================

    bot.action("whatsapp", async (ctx)=>{

        await ctx.editMessageText(
`🤖 WhatsApp Manager

Pilih menu:`,
        whatsappMenu()
        );

    });


    // Peserta Menu
    bot.action("peserta", async (ctx)=>{

        const stats = db.getAllPeserta();
        
        let message = `👥 DAFTAR PESERTA\n\n`;
        
        if(stats.total_today === 0){
            message += `📭 Belum ada peserta hari ini`;
        } else {
            message += `Total hari ini: ${stats.total_today} peserta\n\n`;
            
            stats.today.forEach((p, i) => {
                const statusEmoji = getStatusEmoji(p.status);
                message += `${i+1}. ${statusEmoji} ${p.id}\n   👥 ${p.team} | ⏰ ${p.jam}\n\n`;
            });
        }

        await ctx.editMessageText(message,
            Markup.inlineKeyboard([
                [Markup.button.callback("◀️ Kembali", "back")]
            ])
        );

    });


    // Pembayaran Menu
    bot.action("payment", async (ctx)=>{

        const pending = db.getPendingRegistrations();
        
        let message = `💳 PEMBAYARAN\n\n`;
        
        if(pending.length === 0){
            message += `✅ Tidak ada pembayaran pending`;
        } else {
            message += `Menunggu verifikasi: ${pending.length}\n\n`;
            
            pending.forEach((p, i) => {
                message += `${i+1}. ${p.id}\n   👥 ${p.team}\n   📊 ${p.status}\n\n`;
            });
        }

        await ctx.editMessageText(message,
            Markup.inlineKeyboard([
                [Markup.button.callback("◀️ Kembali", "back")]
            ])
        );

    });


    // Session Menu
    bot.action("session", async (ctx)=>{

        const sessions = db.getSessionStats();
        
        let message = `🏆 SESI HARI INI\n\n`;
        
        sessions.forEach(s => {
            const status = s.full ? "❌ FULL" : `✅ ${s.slot}/${s.max_slot}`;
            message += `Sesi ${s.index} - ⏰ ${s.jam}\n   👥 Slot: ${status}\n\n`;
        });

        await ctx.editMessageText(message,
            Markup.inlineKeyboard([
                [Markup.button.callback("◀️ Kembali", "back")]
            ])
        );

    });


    // Broadcast Menu (placeholder)
    bot.action("broadcast", async (ctx)=>{

        await ctx.editMessageText(
`📢 BROADCAST

Fitur ini dalam pengembangan.

Akan bisa mengirim pesan ke semua peserta terdaftar.`,
            Markup.inlineKeyboard([
                [Markup.button.callback("◀️ Kembali", "back")]
            ])
        );

    });


    // ==================== WHATSAPP SUBMENU ====================

    bot.action("pairing", async (ctx)=>{

        await ctx.answerCbQuery();

        await ctx.reply(
`📱 Masukkan nomor WhatsApp.

Contoh:
628123456789

Kirim nomor tanpa +`
        );

        global.waitingPairing = ctx.from.id;

    });


    // Restart WhatsApp (placeholder)
    bot.action("restart", async (ctx)=>{

        await ctx.answerCbQuery();

        await ctx.reply(
`🔄 RESTART

Fitur restart akan segera hadir.

Untuk sekarang, restart manual dengan:
1. Stop bot (Ctrl+C)
2. Jalankan kembali: node index.js`,
            Markup.inlineKeyboard([
                [Markup.button.callback("◀️ Kembali", "whatsapp")]
            ])
        );

    });


    bot.action("back",(ctx)=>{

        ctx.editMessageText(
"🎮 FTSG ADMIN PANEL",
        mainMenu()
        );

    });


    // ==================== PARTICIPANT ACTIONS ====================
    
    // These will be used when admin clicks on specific participant buttons
    
    // Approve participant
    bot.action(/^approve_(.+)$/, async (ctx)=>{
        const pesertaId = ctx.match[1];
        
        await ctx.answerCbQuery();
        
        const result = db.updateStatus(pesertaId, "Approved");
        
        if(!result.success){
            await ctx.reply(`❌ ${result.message}`);
            return;
        }
        
        const peserta = result.data;
        
        // Send WhatsApp notification
        if(waSock){
            try{
                await waSock.sendMessage(`${peserta.phone}@s.whatsapp.net`, {
                    text: `✅ PENDAFTARAN DISETUJUI!

━━━━━━━━━━━━━━━
🆔 Kode: ${peserta.id}
👥 Team: ${peserta.team}
⏰ Sesi: ${peserta.session} (${peserta.jam})
━━━━━━━━━━━━━━━

🎉 Selamat! Pendaftarannya telah disetujui.

💰 Langkah Selanjutnya:
1. Lakukan pembayaran ke rekening berikut:
   [Nomor Rekening]
   a/n [Nama Rekening]
2. Kirim bukti transfer via WhatsApp
3. Ketik BAYAR lalu kirim foto bukti`
                });
                console.log(`[WA] Approval notification sent to ${peserta.phone}`);
            } catch(error){
                console.error(`[WA] Failed to send approval:`, error.message);
            }
        }
        
        await ctx.reply(
`✅ Peserta ${peserta.id} disetujui!

Team: ${peserta.team}
Kapten: ${peserta.kapten}

Notifikasi telah dikirim ke WhatsApp peserta.`,
            Markup.inlineKeyboard([
                [Markup.button.callback("◀️ Kembali", "peserta")]
            ])
        );
    });
    
    
    // Reject participant
    bot.action(/^reject_(.+)$/, async (ctx)=>{
        const pesertaId = ctx.match[1];
        
        await ctx.answerCbQuery();
        
        const result = db.updateStatus(pesertaId, "Rejected", "Ditolak oleh admin");
        
        if(!result.success){
            await ctx.reply(`❌ ${result.message}`);
            return;
        }
        
        const peserta = result.data;
        
        // Send WhatsApp notification
        if(waSock){
            try{
                await waSock.sendMessage(`${peserta.phone}@s.whatsapp.net`, {
                    text: `❌ PENDAFTARAN DITOLAK

━━━━━━━━━━━━━━━
🆔 Kode: ${peserta.id}
👥 Team: ${peserta.team}
━━━━━━━━━━━━━━━

Maaf, pendaftaran Anda ditolak oleh admin.

Hubungi admin jika ada pertanyaan.`
                });
                console.log(`[WA] Rejection notification sent to ${peserta.phone}`);
            } catch(error){
                console.error(`[WA] Failed to send rejection:`, error.message);
            }
        }
        
        await ctx.reply(
`❌ Peserta ${peserta.id} ditolak!

Team: ${peserta.team}`,
            Markup.inlineKeyboard([
                [Markup.button.callback("◀️ Kembali", "peserta")]
            ])
        );
    });
    
    
    // View participant detail
    bot.action(/^detail_(.+)$/, async (ctx)=>{
        const pesertaId = ctx.match[1];
        
        await ctx.answerCbQuery();
        
        const peserta = db.getPesertaById(pesertaId);
        
        if(!peserta){
            await ctx.reply(`❌ Peserta tidak ditemukan`);
            return;
        }
        
        const message =
`👁 DETAIL PESERTA

━━━━━━━━━━━━━━━
🆔 Kode: ${peserta.id}
👥 Nama Team: ${peserta.team}
👤 Nama Kapten: ${peserta.kapten}
📱 No. HP: ${peserta.phone}
⏰ Sesi: ${peserta.session} (${peserta.jam})
📊 Status: ${peserta.status}
📅 Tanggal: ${peserta.date}
⏰ Waktu: ${new Date(peserta.registered_at).toLocaleString("id-ID")}
━━━━━━━━━━━━━━━`;

        await ctx.reply(message,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback("✅ Approve", `approve_${pesertaId}`),
                    Markup.button.callback("❌ Tolak", `reject_${pesertaId}`)
                ],
                [
                    Markup.button.callback("💰 Konfirmasi Bayar", `confirm_payment_${pesertaId}`)
                ],
                [Markup.button.callback("◀️ Kembali", "peserta")]
            ])
        );
    });
    
    
    // Confirm payment
    bot.action(/^confirm_payment_(.+)$/, async (ctx)=>{
        const pesertaId = ctx.match[1];
        
        await ctx.answerCbQuery();
        
        const result = db.updateStatus(pesertaId, "Paid", "Pembayaran dikonfirmasi");
        
        if(!result.success){
            await ctx.reply(`❌ ${result.message}`);
            return;
        }
        
        const peserta = result.data;
        
        // Send WhatsApp confirmation
        if(waSock){
            try{
                await waSock.sendMessage(`${peserta.phone}@s.whatsapp.net`, {
                    text: `💰 PEMBAYARAN TERVERIFIKASI!

━━━━━━━━━━━━━━━
🆔 Kode: ${peserta.id}
👥 Team: ${peserta.team}
⏰ Sesi: ${peserta.session} (${peserta.jam})
📊 Status: Lunas
━━━━━━━━━━━━━━━

🎉 Terima kasih! Pembayaran Anda telah dikonfirmasi.

📌 Info Turnamen:
• Datang 30 menit sebelum sesi dimulai
• Bawa kartu identitas
• Pastikan nickname FF sudah benar

Selamat bertanding! 🏆`
                });
                console.log(`[WA] Payment confirmation sent to ${peserta.phone}`);
            } catch(error){
                console.error(`[WA] Failed to send payment confirmation:`, error.message);
            }
        }
        
        await ctx.reply(
`✅ Pembayaran ${peserta.id} dikonfirmasi!

Team: ${peserta.team}

Peserta sudah LUNAS.`,
            Markup.inlineKeyboard([
                [Markup.button.callback("◀️ Kembali", "payment")]
            ])
        );
    });



    // ==================== HANDLE PHONE NUMBER FOR PAIRING ====================

    bot.on("text", async (ctx)=>{

        // Only process if waiting for pairing number
        if(global.waitingPairing !== ctx.from.id) return;

        // Clear the flag immediately to prevent double processing
        global.waitingPairing = null;

        const number = ctx.message.text.trim();

        // Validate phone number format (digits only, 10-15 chars)
        if(!/^\d{10,15}$/.test(number)){
            await ctx.reply(
`❌ Format nomor tidak valid!

Contoh yang benar:
628123456789

Kirim nomor tanpa + atau spasi.`
            );
            return;
        }

        await ctx.reply(
`⏳ Membuat pairing code untuk:
${number}

Tunggu sebentar...`
        );


        try {
            await pairing(number, async (code)=>{

                if(code){

                    await ctx.reply(
`🔐 PAIRING CODE

${code}

Masukkan kode ini di WhatsApp:
Perangkat Tertaut → Tautkan dengan nomor telepon`
                    );

                } else {

                    await ctx.reply(
`❌ Gagal membuat pairing code.

Pastikan nomor benar dan coba lagi.`
                    );

                }

            });
        } catch(error){
            console.error("[TG] Pairing error:", error);
            await ctx.reply(
`❌ Error: ${error.message}

Coba lagi atau restart bot.`
            );
        }

    });



}


// Helper function to get status emoji
function getStatusEmoji(status){
    const emojis = {
        "Pending": "⏳",
        "Approved": "✅",
        "Paid": "💰",
        "Waiting_Payment": "📸",
        "Rejected": "❌"
    };
    return emojis[status] || "📋";
}


module.exports = {
    callback,
    setWASocket
};
