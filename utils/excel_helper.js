const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");


// Generate Excel file and return filepath
function generateExcelFile(){
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, "generate_excel.py");
        
        exec("python3 " + scriptPath, { cwd: path.join(__dirname, "..") }, (error, stdout, stderr) => {
            if(error){
                console.error("[Excel] Error generating:", error.message);
                return reject(error);
            }
            
            // Parse output to get file path
            const match = stdout.match(/Excel generated: (.+)/);
            if(match && match[1]){
                const filePath = match[1].trim();
                console.log("[Excel] Generated:", filePath);
                resolve(filePath);
            } else {
                reject(new Error("Failed to parse Excel output"));
            }
        });
    });
}


// Send Excel file to Telegram
async function sendExcelToTelegram(bot, chatId, filePath){
    try{
        if(!fs.existsSync(filePath)){
            throw new Error("Excel file not found: " + filePath);
        }
        
        // Get today's date for caption
        const today = new Date().toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric"
        });
        
        await bot.telegram.sendDocument(chatId, filePath, {
            caption: "📊 *Data Peserta Turnamen*\n\nTanggal: *" + today + "*\n\nFile Excel berisi data peserta yang sudah mendaftar.",
            parse_mode: "Markdown"
        });
        
        console.log("[Excel] Sent to Telegram successfully");
        return true;
    } catch(error){
        console.error("[Excel] Error sending to Telegram:", error.message);
        return false;
    }
}


// Main function: Generate and send Excel
async function generateAndSendExcel(bot, chatId){
    try{
        const filePath = await generateExcelFile();
        const sent = await sendExcelToTelegram(bot, chatId, filePath);
        return { success: sent, filePath };
    } catch(error){
        console.error("[Excel] Error in generateAndSendExcel:", error);
        return { success: false, error: error.message };
    }
}


module.exports = {
    generateExcelFile,
    sendExcelToTelegram,
    generateAndSendExcel
};
