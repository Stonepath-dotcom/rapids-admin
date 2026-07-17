const db = require("../database/db");
const waMessage = require("../whatsapp/message");


// Generate main menu
function mainMenu(){
    return `👋 *Selamat Datang di FTSG Tournament Bot*

📋 *Menu Tersedia:*

📊 *Lihat Data:*
• /data - Lihat semua peserta
• /pending - Peserta menunggu
• /stats - Statistik sesi

⚙️ *Admin Tools:*
• /admin - Tools admin

📝 *Bantuan:*
• /help - Bantuan

━━━━━━━━━━━━━━━
Pilih menu dari tombol di bawah 👇`;
}


// Generate help menu
function helpMenu(){
    return `🤖 *BANTUAN BOT*

📌 *Perintah Tersedia:*

/start - Menu utama
/menu - Tampilkan menu
/data - Lihat data peserta
/pending - Peserta pending
/stats - Statistik sesi
/admin - Admin tools
/help - Bantuan ini

📱 *WhatsApp Bot:*
User bisa daftar via WA dengan format:
1. Nama Team
2. Nickname  
3. Nomor Sesi

💰 *Pembayaran:*
- QRIS: Rp 3.100 (auto-confirm)
- DANA/SeaBank: Rp 3.000`;
}


// Generate admin tools menu
function adminToolsMenu(){
    return `🔧 *ADMIN TOOLS*

⚠️ *Hati-hati! Action ini tidak bisa dibatalkan!*

🗑️ *Hapus Data:*
• Hapus 1 peserta
• Hapus SEMUA peserta

🔄 *Reset Status:*
• Reset status peserta ke Pending

━━━━━━━━━━━━━━━
Pilih action dari tombol di bawah 👇`;
}


// Generate inline keyboard for main menu
function mainKeyboard(){
    return {
        inline_keyboard: [
            [{ text: "📊 Data Peserta", callback_data: "data" }],
            [{ text: "⏳ Pending", callback_data: "pending" }, { text: "📈 Stats", callback_data: "stats" }],
            [{ text: "🔧 Admin Tools", callback_data: "admin" }]
        ]
    };
}


// Generate inline keyboard for admin tools
function adminToolsKeyboard(){
    return {
        inline_keyboard: [
            [{ text: "🗑️ Hapus Peserta", callback_data: "admin_delete" }],
            [{ text: "🗑️ Hapus Semua", callback_data: "admin_delete_all" }],
            [{ text: "🔄 Reset Status", callback_data: "admin_reset" }],
            [{ text: "◀️ Kembali", callback_data: "back_to_main" }]
        ]
    };
}


module.exports = {
    mainMenu,
    helpMenu,
    adminToolsMenu,
    mainKeyboard,
    adminToolsKeyboard
};
