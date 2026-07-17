const XLSX = require("xlsx");


// Generate Excel file from participant data
function generateExcel(data){
    try{
        // Prepare data for Excel
        const excelData = data.map((p, i) => ({
            "No": i + 1,
            "Kode": p.id,
            "Team": p.team,
            "Kapten": p.kapten,
            "Phone": p.phone,
            "Sesi": p.session,
            "Jam": p.jam,
            "Status": p.status,
            "Tanggal": p.date,
            "Daftar Pukul": new Date(p.registered_at).toLocaleString("id-ID")
        }));
        
        // Create workbook
        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Peserta");
        
        // Set column widths
        ws["!cols"] = [
            { wch: 5 },   // No
            { wch: 12 },  // Kode
            { wch: 20 },  // Team
            { wch: 15 },  // Kapten
            { wch: 15 },  // Phone
            { wch: 10 },  // Sesi
            { wch: 8 },   // Jam
            { wch: 15 },  // Status
            { wch: 12 },  // Tanggal
            { wch: 20 }   // Daftar Pukul
        ];
        
        // Generate buffer
        const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        
        return {
            success: true,
            data: buffer,
            filename: `data_peserta_${new Date().toISOString().split("T")[0]}.xlsx`
        };
        
    } catch(error){
        console.error("[Excel] Error generating:", error.message);
        return { success: false, message: error.message };
    }
}


// Generate and send Excel to Telegram
async function generateAndSendExcel(bot, chatId){
    try{
        const db = require("../database/db");
        const data = db.getAllPeserta();
        
        if(data.all.length === 0){
            await bot.telegram.sendMessage(chatId, "📭 Belum ada data peserta");
            return { success: true, message: "No data" };
        }
        
        const result = generateExcel(data.all);
        
        if(!result.success){
            throw new Error(result.message);
        }
        
        // Send file to Telegram
        await bot.telegram.sendDocument(chatId, {
            source: result.data,
            filename: result.filename
        }, {
            caption: `📊 *Data Peserta Turnamen*\n\nTotal: ${data.all.length} peserta\nTanggal: ${new Date().toLocaleDateString("id-ID")}`,
            parse_mode: "Markdown"
        });
        
        console.log(`[Excel] ✓ Sent to Telegram (${data.all.length} rows)`);
        return { success: true };
        
    } catch(error){
        console.error("[Excel] Error sending:", error.message);
        
        try{
            await bot.telegram.sendMessage(chatId, `❌ Gagal generate Excel: ${error.message}`);
        } catch(e){}
        
        return { success: false, message: error.message };
    }
}


module.exports = {
    generateExcel,
    generateAndSendExcel
};
