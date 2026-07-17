const { Telegraf } = require("telegraf");
const { mainMenu } = require("./menu");
require("dotenv").config();

const bot = new Telegraf(process.env.BOT_TOKEN);


bot.start((ctx)=>{

    if (ctx.from.id.toString() !== process.env.OWNER_ID){
        return ctx.reply("⛔ Kamu bukan admin.");
    }


    ctx.reply(
`🎮 FTSG ADMIN PANEL

🟢 Telegram aktif

Pilih menu:`,
    mainMenu()
    );

});


bot.command("panel",(ctx)=>{

    if (ctx.from.id.toString() !== process.env.OWNER_ID){
        return;
    }

    ctx.reply(
"🎮 FTSG ADMIN PANEL",
mainMenu()
    );

});


module.exports = bot;
