const { Telegraf } = require("telegraf");
const menu = require("./menu");
const callback = require("./callback");
const waConnect = require("../whatsapp/connect");

let bot = null;


// Initialize Telegram bot
function initBot(token){
    bot = new Telegraf(token);
    
    // Register handlers
    registerHandlers();
    
    return bot;
}


// Register all command and callback handlers
function registerHandlers(){
    
    // Start command
    bot.start((ctx) => {
        ctx.reply(menu.mainMenu(), { parse_mode: "Markdown" });
    });
    
    // Help command
    bot.help((ctx) => {
        ctx.reply(menu.helpMenu(), { parse_mode: "Markdown" });
    });
    
    // Main menu command
    bot.command("menu", (ctx) => {
        ctx.reply(menu.mainMenu(), { parse_mode: "Markdown" });
    });
    
    // Pair WhatsApp command - ADMIN ONLY
    bot.command("pair", (ctx) => {
        const ownerId = process.env.OWNER_ID;
        
        // Check if owner
        if(ownerId && ctx.from.id.toString() !== ownerId){
            return ctx.reply("❌ Command ini hanya untuk Admin!");
        }
        
        const phoneNumber = process.env.PHONE_NUMBER;
        
        if(!phoneNumber){
            ctx.reply(
                "⚠️ *PHONE_NUMBER belum di-set!*\n\n" +
                "Tambahkan di file .env:\n" +
                "`PHONE_NUMBER=628123456789`\n\n" +
                "Format: kode negara + nomor (tanpa + atau spasi)",
                { parse_mode: "Markdown" }
            );
            return;
        }
        
        ctx.reply(
            "🔄 *Mengirim pairing code...*\n\n" +
            "Tunggu sebentar, kode akan dikirim ke chat ini!",
            { parse_mode: "Markdown" }
        ).then(() => {
            // Request new pairing code
            waConnect.requestNewPairingCode(phoneNumber);
        });
    });
    
    // Handle callback queries (button clicks)
    bot.on("callback_query", async (ctx) => {
        try{
            await callback.handleCallback(ctx, bot);
            await ctx.answerCbQuery();
        } catch(error){
            console.error("[TG] Callback error:", error);
            try{
                await ctx.answerCbQuery("Terjadi kesalahan", true);
            } catch(e){}
        }
    });
    
    // Launch bot
    bot.launch().then(() => {
        console.log("[TG] ✅ Telegram bot launched successfully");
    }).catch((err) => {
        console.error("[TG] Failed to launch bot:", err.message);
    });
    
    // Graceful stop
    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
}


// Get bot instance
function getBot(){
    return bot;
}


module.exports = {
    initBot,
    getBot
};
