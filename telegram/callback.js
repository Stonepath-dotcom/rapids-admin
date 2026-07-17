const db = require("../database/db");
const menu = require("./menu");
const waMessage = require("../whatsapp/message");


// Handle all callback queries
async function handleCallback(ctx, bot){
    const data = ctx.callbackQuery.data;
    const chatId = ctx.callbackQuery.message.chat.id;
    
    console.log(`[TG] Callback: ${data} from ${chatId}`);
    
    switch(data){
        
        // Main menu buttons
        case "data":
            await showData(ctx, bot);
            break;
            
        case "pending":
            await showPending(ctx, bot);
            break;
            
        case "stats":
            await showStats(ctx);
            break;
            
        case "admin":
            await showAdminTools(ctx);
            break;
            
        // Admin tools
        case "admin_delete":
            await promptDeleteSingle(ctx);
            break;
            
        case "admin_delete_all":
            await confirmDeleteAll(ctx);
            break;
            
        case "admin_reset":
            await promptResetStatus(ctx);
            break;
            
        case "back_to_main":
            await backToMain(ctx);
            break;
            
        // Data navigation
        case "data_next":
            // Handle pagination if needed
            break;
            
        default:
            // Check if it's a participant action (delete/reset specific)
            if(data.startsWith("del_")){
                await deleteParticipant(ctx, data.replace("del_", ""));
            } else if(data.startsWith("reset_")){
                await resetParticipant(ctx, data.replace("reset_", ""));
            } else if(data.startsWith("detail_")){
                await showDetail(ctx, data.replace("detail_", ""));
            } else if(data.startsWith("approve_")){
                await approvePayment(ctx, data.replace("approve_", ""));
            } else if(data.startsWith("reject_")){
                await rejectPayment(ctx, data.replace("reject_", ""));
            }
    }
}


// Show all participants
async function showData(ctx, bot){
    try{
        const data = db.getAllPeserta();
        
        if(data.all.length === 0){
            await ctx.editMessageText("📭 *Belum ada peserta terdaftar*", {
                parse_mode: "Markdown",
                reply_markup: menu.mainKeyboard()
            });
            return;
        }
        
        let message = `📊 *DATA SEMUA PESERTA*\n\n`;
        message += `Total: ${data.all.length} peserta\n`;
        message += `Hari ini: ${data.total_today} peserta\n\n`;
        
        message += `━━━━━━━━━━━━━━━\n`;
        
        // Show last 10 participants (to avoid message too long)
        const display = data.all.slice(-10).reverse();
        display.forEach((p, i) => {
            const statusEmoji = getStatusEmoji(p.status);
            message += `${i+1}. ${p.id}\n   👥 ${p.team} | 👤 ${p.kapten}\n   ⏰ ${p.jam} | ${statusEmoji} ${p.status}\n\n`;
        });
        
        if(data.all.length > 10){
            message += `... dan ${data.all.length - 10} peserta lainnya`;
        }
        
        await ctx.editMessageText(message, {
            parse_mode: "Markdown",
            reply_markup: menu.mainKeyboard()
        });
        
    } catch(error){
        console.error("[TG] Error showing data:", error);
        await ctx.answerCbQuery("Gagal memuat data", true);
    }
}


// Show pending registrations
async function showPending(ctx, bot){
    try{
        const pending = db.getPendingRegistrations();
        
        if(pending.length === 0){
            await ctx.editMessageText("✅ *Tidak ada peserta menunggu*\n\nSemua peserta sudah diproses!", {
                parse_mode: "Markdown",
                reply_markup: menu.mainKeyboard()
            });
            return;
        }
        
        let message = `⏳ *PESAERTA MENUNGGU*\n\n`;
        message += `Total: ${pending.length} peserta\n\n`;
        
        message += `━━━━━━━━━━━━━━━\n`;
        
        pending.forEach((p, i) => {
            message += `${i+1}. *${p.id}*\n`;
            message += `   👥 ${p.team} | 👤 ${p.kapten}\n`;
            message += `   ⏰ Sesi ${p.jam} | 📱 ${p.phone}\n`;
            message += `   Status: ${getStatusEmoji(p.status)} ${p.status}\n\n`;
        });
        
        // Create inline keyboard with actions
        const keyboard = [];
        pending.slice(0, 5).forEach((p) => {
            keyboard.push([
                { text: `📋 ${p.id}`, callback_data: `detail_${p.id}` },
                { text: `✅ Approve`, callback_data: `approve_${p.id}` },
                { text: `❌ Reject`, callback_data: `reject_${p.id}` }
            ]);
        });
        keyboard.push([{ text: "◀️ Kembali", callback_data: "back_to_main" }]);
        
        await ctx.editMessageText(message, {
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: keyboard }
        });
        
    } catch(error){
        console.error("[TG] Error showing pending:", error);
        await ctx.answerCbQuery("Gagal memuat data", true);
    }
}


// Show session statistics
async function showStats(ctx){
    try{
        const stats = db.getSessionStats();
        const allData = db.getAllPeserta();
        
        let message = `📈 *STATISTIK SESI HARI INI*\n\n`;
        
        let totalFilled = 0;
        let totalCapacity = 0;
        
        stats.forEach(s => {
            const status = s.full ? "❌" : "✅";
            message += `${status} *Sesi ${s.index}* (${s.jam})\n`;
            message += `   Slot: ${s.slot}/${s.max_slot}\n\n`;
            
            totalFilled += s.slot;
            totalCapacity += s.max_slot;
        });
        
        message += `━━━━━━━━━━━━━━━\n`;
        message += `📊 Total Terisi: ${totalFilled}/${totalCapacity}`;
        message += `\n👥 Total Peserta Hari Ini: ${allData.total_today}`;
        
        await ctx.editMessageText(message, {
            parse_mode: "Markdown",
            reply_markup: menu.mainKeyboard()
        });
        
    } catch(error){
        console.error("[TG] Error showing stats:", error);
        await ctx.answerCbQuery("Gagal memuat statistik", true);
    }
}


// Show admin tools
async function showAdminTools(ctx){
    await ctx.editMessageText(menu.adminToolsMenu(), {
        parse_mode: "Markdown",
        reply_markup: menu.adminToolsKeyboard()
    });
}


// Prompt to delete single participant
async function promptDeleteSingle(ctx){
    const data = db.getAllPeserta();
    
    if(data.all.length === 0){
        await ctx.answerCbQuery("Tidak ada peserta", true);
        return;
    }
    
    let message = `🗑️ *HAPUS PESERTA*\n\n`;
    message += `Pilih peserta yang ingin dihapus:\n\n`;
    
    const keyboard = [];
    data.all.slice(-10).reverse().forEach(p => {
        keyboard.push([{
            text: `🗑️ ${p.id} - ${p.team}`,
            callback_data: `del_${p.id}`
        }]);
    });
    keyboard.push([{ text: "◀️ Kembali", callback_data: "admin" }]);
    
    await ctx.editMessageText(message, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard }
    });
}


// Confirm delete all participants
async function confirmDeleteAll(ctx){
    const keyboard = [
        [
            { text: "✅ YA, HAPUS SEMUA!", callback_data: "confirm_delete_all" },
            { text: "❌ BATAL", callback_data: "admin" }
        ]
    ];
    
    await ctx.editMessageText(
`⚠️ *KONFIRMASI HAPUS SEMUA*

Anda akan menghapus **SEMUA** peserta!

• Total peserta: ${db.getAllPeserta().all.length}
• Action ini **TIDAK BISA dibatalkan**!

Yakin ingin melanjutkan?`,
        {
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: keyboard }
        }
    );
}


// Prompt to reset status
async function promptResetStatus(ctx){
    const data = db.getAllPeserta();
    
    if(data.all.length === 0){
        await ctx.answerCbQuery("Tidak ada peserta", true);
        return;
    }
    
    let message = `🔄 *RESET STATUS PESERTA*\n\n`;
    message += `Pilih peserta yang ingin di-reset ke Pending:\n\n`;
    
    const keyboard = [];
    data.all.filter(p => p.status !== "Pending").forEach(p => {
        keyboard.push([{
            text: `🔄 ${p.id} - ${p.team} (${p.status})`,
            callback_data: `reset_${p.id}`
        }]);
    });
    keyboard.push([{ text: "◀️ Kembali", callback_data: "admin" }]);
    
    await ctx.editMessageText(message, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard }
    });
}


// Delete single participant
async function deleteParticipant(ctx, id){
    try{
        const result = db.deletePeserta(id);
        
        if(result.success){
            console.log(`[TG] Admin deleted participant: ${id}`);
            
            // Notify via WA if possible
            notifyWA(result.data.phone, 
`🗑️ *Pendaftaran Dihapus Admin*

Maaf, pendaftaran Anda dengan kode *${id}* telah dihapus oleh admin.

Hubungi admin jika ini kesalahan.`
            );
            
            await ctx.answerCbQuery(`✅ ${id} berhasil dihapus!`);
            await promptDeleteSingle(ctx); // Refresh list
        } else{
            await ctx.answerCbQuery(`❌ Gagal: ${result.message}`, true);
        }
    } catch(error){
        console.error("[TG] Error deleting:", error);
        await ctx.answerCbQuery("Gagal menghapus", true);
    }
}


// Reset participant status
async function resetParticipant(ctx, id){
    try{
        const result = db.resetPesertaStatus(id);
        
        if(result.success){
            console.log(`[TG] Admin reset participant: ${id}`);
            
            // Notify via WA if possible
            notifyWA(result.data.phone,
`🔄 *Status Direset Admin*

Pendaftaran Anda dengan kode *${id}* telah di-reset ke status *Pending*.

Silakan lakukan pembayaran kembali.`
            );
            
            await ctx.answerCbQuery(`✅ ${id} berhasil di-reset!`);
            await promptResetStatus(ctx); // Refresh list
        } else{
            await ctx.answerCbQuery(`❌ Gagal: ${result.message}`, true);
        }
    } catch(error){
        console.error("[TG] Error resetting:", error);
        await ctx.answerCbQuery("Gagal mereset", true);
    }
}


// Show participant detail
async function showDetail(ctx, id){
    const peserta = db.getPesertaById(id);
    
    if(!peserta){
        await ctx.answerCbQuery("Peserta tidak ditemukan", true);
        return;
    }
    
    const message =
`📋 *DETAIL PESERTA*

━━━━━━━━━━━━━━━
🆔 Kode: ${peserta.id}
👥 Team: ${peserta.team}
👤 Kapten: ${peserta.kapten}
📱 Phone: ${peserta.phone}
⏰ Sesi: ${peserta.session} (${peserta.jam})
📊 Status: ${getStatusEmoji(peserta.status)} ${peserta.status}
📅 Tanggal: ${peserta.date}
⏰ Daftar: ${peserta.registered_at}
━━━━━━━━━━━━━━━`;

    const keyboard = [
        [
            { text: "✅ Approve", callback_data: `approve_${id}` },
            { text: "💰 Lunas", callback_data: `lunas_${id}` },
            { text: "❌ Reject", callback_data: `reject_${id}` }
        ],
        [
            { text: "🗑️ Hapus", callback_data: `del_${id}` },
            { text: "🔄 Reset", callback_data: `reset_${id}` }
        ],
        [{ text: "◀️ Kembali", callback_data: "pending" }]
    ];
    
    await ctx.editMessageText(message, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard }
    });
}


// Approve payment
async function approvePayment(ctx, id){
    try{
        const result = db.updateStatus(id, "Approved");
        
        if(result.success){
            console.log(`[TG] Admin approved: ${id}`);
            
            notifyWA(result.data.phone,
`✅ *Pendaftaran Disetujui*

Pendaftaran Anda dengan kode *${id}* telah **DISETUJUI**.

Silakan lakukan pembayaran untuk mengkonfirmasi.

💰 Nominal:
• QRIS: Rp 3.100
• DANA/SeaBank: Rp 3.000`
            );
            
            await ctx.answerCbQuery(`✅ ${id} disetujui!`);
            await showDetail(ctx, id); // Refresh detail
        } else{
            await ctx.answerCbQuery(`❌ Gagal: ${result.message}`, true);
        }
    } catch(error){
        console.error("[TG] Error approving:", error);
        await ctx.answerCbQuery("Gagal menyetujui", true);
    }
}


// Mark as paid (Lunas)
async function markAsPaid(ctx, id){
    try{
        const result = db.updateStatus(id, "Paid");
        
        if(result.success){
            console.log(`[TG] Admin marked as paid: ${id}`);
            
            notifyWA(result.data.phone,
`💰 *PEMBAYARAN KONFIRMASI!*

Terima kasih! Pembayaran Anda dengan kode *${id}* telah **KONFIRMASI LUNAS** ✅

Selamat bertanding di turnamen FTSG! 🎮`
            );
            
            await ctx.answerCbQuery(`💰 ${id} lunas!`);
            await showDetail(ctx, id); // Refresh detail
        } else{
            await ctx.answerCbQuery(`❌ Gagal: ${result.message}`, true);
        }
    } catch(error){
        console.error("[TG] Error marking paid:", error);
        await ctx.answerCbError("Gagal update status", true);
    }
}


// Reject payment/registration
async function rejectPayment(ctx, id){
    try{
        const result = db.updateStatus(id, "Rejected");
        
        if(result.success){
            console.log(`[TG] Admin rejected: ${id}`);
            
            notifyWA(result.data.phone,
`❌ *Pendaftaran Ditolak*

Maaf, pendaftaran Anda dengan kode *${id}* telah **DITOLAK** admin.

Alasan: Tidak memenuhi syarat / bukti tidak valid

Hubungi admin jika ada pertanyaan.`
            );
            
            await ctx.answerCbQuery(`❌ ${id} ditolak!`);
            await showDetail(ctx, id); // Refresh detail
        } else{
            await ctx.answerCbQuery(`❌ Gagal: ${result.message}`, true);
        }
    } catch(error){
        console.error("[TG] Error rejecting:", error);
        await ctx.answerCbQuery("Gagal menolak", true);
    }
}


// Back to main menu
async function backToMain(ctx){
    await ctx.editMessageText(menu.mainMenu(), {
        parse_mode: "Markdown",
        reply_markup: menu.mainKeyboard()
    });
}


// Helper: Get status emoji
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


// Helper: Send notification to WhatsApp user
function notifyWA(phone, message){
    if(global.waSocket && global.waSendMessage){
        global.waSendMessage(`${phone}@s.whatsapp.net`, message)
            .then(() => console.log(`[TG] ✓ WA notification sent to ${phone}`))
            .catch(err => console.error(`[TG] Failed send WA notification:`, err.message));
    }
}


module.exports = {
    handleCallback
};
