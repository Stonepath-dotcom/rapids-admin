const { Telegraf } = require("telegraf");
const menu = require("./menu");
const callback = require("./callback");

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
