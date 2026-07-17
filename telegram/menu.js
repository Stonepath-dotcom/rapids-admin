const { Markup } = require("telegraf");

function mainMenu(){

    return Markup.inlineKeyboard([
        [
            Markup.button.callback("🤖 WhatsApp", "whatsapp")
        ],
        [
            Markup.button.callback("👥 Peserta", "peserta"),
            Markup.button.callback("💳 Pembayaran", "payment")
        ],
        [
            Markup.button.callback("🏆 Session", "session"),
            Markup.button.callback("📢 Broadcast", "broadcast")
        ]
    ]);

}

function whatsappMenu(){

    return Markup.inlineKeyboard([
        [
            Markup.button.callback("🔗 Pairing Code", "pairing")
        ],
        [
            Markup.button.callback("🔄 Restart", "restart")
        ],
        [
            Markup.button.callback("🔙 Kembali", "back")
        ]
    ]);

}


module.exports = {
    mainMenu,
    whatsappMenu
};
