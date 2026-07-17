const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "db.json");


// Load database
function loadDB(){
    try{
        const data = fs.readFileSync(DB_PATH, "utf-8");
        return JSON.parse(data);
    } catch(error){
        // Return default structure if file doesn't exist
        return {
            config: {
                max_slot_per_session: 12,
                prefix_kode: "FTSG",
                sesi_pagi: { start: "08:00", end: "15:00", interval_minutes: 30 },
                sesi_malam: { start: "20:00", end: "24:00", interval_minutes: 30 }
            },
            peserta: [],
            sessions: {},
            last_reset: null,
            counter_id: 0
        };
    }
}


// Save database
function saveDB(db){
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}


// Get today's date string (YYYY-MM-DD)
function getTodayString(){
    const now = new Date();
    return now.toISOString().split("T")[0];
}


// Check and reset daily slots if needed
function checkDailyReset(){
    const db = loadDB();
    const today = getTodayString();
    
    if(db.last_reset !== today){
        // Reset sessions for new day
        db.sessions = {};
        db.last_reset = today;
        saveDB(db);
        console.log(`[DB] Daily reset executed for ${today}`);
        return true;
    }
    return false;
}


// Generate session list based on current time
// Shows pagi sessions (06:00-17:59) or malam sessions (18:00-05:59)
// Does NOT show "Sesi Pagi" or "Sesi Malam" labels
function generateSessions(){
    const db = loadDB();
    const config = db.config;
    const now = new Date();
    const currentHour = now.getHours();
    
    let sessions = [];
    
    // Determine which sessions to show based on current time
    const isPagiTime = currentHour >= 6 && currentHour < 18;
    
    if(isPagiTime){
        // Generate pagi sessions (08:00 - 14:30)
        const [startHour, startMin] = config.sesi_pagi.start.split(":").map(Number);
        const [endHour, endMin] = config.sesi_pagi.end.split(":").map(Number);
        
        let startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;
        const interval = config.sesi_pagi.interval_minutes;
        
        let index = 1;
        while(startTime <= endTime){
            const hours = Math.floor(startTime / 60);
            const minutes = startTime % 60;
            const timeStr = `${hours.toString().padStart(2, "0")}.${minutes.toString().padStart(2, "0")}`;
            
            // Get current slot count for this session
            const slotCount = getSlotCount(timeStr);
            const isFull = slotCount >= config.max_slot_per_session;
            
            sessions.push({
                index: index++,
                jam: timeStr,
                waktu: `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`,
                slot: slotCount,
                max_slot: config.max_slot_per_session,
                full: isFull,
                type: "pagi"
            });
            
            startTime += interval;
        }
    } else {
        // Generate malam sessions (19:00 - 22:00)
        const [startHour, startMin] = config.sesi_malam.start.split(":").map(Number);
        const [endHour, endMin] = config.sesi_malam.end.split(":").map(Number);
        
        let startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;
        const interval = config.sesi_malam.interval_minutes;
        
        let index = 1;
        while(startTime <= endTime){
            let hours = Math.floor(startTime / 60);
            const minutes = startTime % 60;
            
            // Convert 24:00 to 00:00 for display
            if(hours === 24) hours = 0;
            
            const timeStr = `${hours.toString().padStart(2, "0")}.${minutes.toString().padStart(2, "0")}`;
            
            // Get current slot count for this session
            const slotCount = getSlotCount(timeStr);
            const isFull = slotCount >= config.max_slot_per_session;
            
            sessions.push({
                index: index++,
                jam: timeStr,
                waktu: `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`,
                slot: slotCount,
                max_slot: config.max_slot_per_session,
                full: isFull,
                type: "malam"
            });
            
            startTime += interval;
        }
    }
    
    return sessions;
}


// Get slot count for specific session time
function getSlotCount(jam){
    const db = loadDB();
    const today = getTodayString();
    
    if(!db.sessions[today]) return 0;
    
    return db.sessions[today].filter(p => 
        p.jam === jam && 
        (p.status === "Pending" || p.status === "Approved" || p.status === "Paid")
    ).length;
}


// Generate unique participant code (FTSG-001, FTSG-002, etc.)
function generateKode(){
    const db = loadDB();
    db.counter_id = (db.counter_id || 0) + 1;
    const kode = `${db.config.prefix_kode}-${db.counter_id.toString().padStart(3, "0")}`;
    saveDB(db);
    return kode;
}


// Check if phone number already registered today
function isAlreadyRegistered(phone){
    const db = loadDB();
    const today = getTodayString();
    
    return db.peserta.some(p => p.phone === phone && p.date === today);
}

// Get registration count for specific phone today
function getRegistrationCount(phone){
    const db = loadDB();
    const today = getTodayString();
    
    return db.peserta.filter(p => p.phone === phone && p.date === today).length;
}

// Get remaining registrations (max 10 per day per phone)
function getRemainingRegistrations(phone){
    const MAX_REGISTRATION_PER_DAY = 10;
    const count = getRegistrationCount(phone);
    return Math.max(0, MAX_REGISTRATION_PER_DAY - count);
}


// Register new participant
function registerPeserta(data){
    checkDailyReset();
    
    const db = loadDB();
    const today = getTodayString();
    const MAX_REGISTRATION_PER_DAY = 10;
    
    // Check registration limit (max 10 per day per phone)
    const regCount = getRegistrationCount(data.phone);
    if(regCount >= MAX_REGISTRATION_PER_DAY){
        return { success: false, message: `Nomor ini sudah mencapai batas ${MAX_REGISTRATION_PER_DAY}x registrasi hari ini!` };
    }
    
    // Check if session is full
    const slotCount = getSlotCount(data.jam);
    if(slotCount >= db.config.max_slot_per_session){
        return { success: false, message: "Sesi sudah penuh!" };
    }
    
    const kode = generateKode();
    
    const peserta = {
        id: kode,
        team: data.team,
        kapten: data.kapten,
        phone: data.phone,
        session: data.session,
        jam: data.jam,
        status: "Pending",
        date: today,
        registered_at: new Date().toISOString(),
        payment_proof: null
    };
    
    db.peserta.push(peserta);
    
    // Add to today's sessions
    if(!db.sessions[today]){
        db.sessions[today] = [];
    }
    db.sessions[today].push(peserta);
    
    saveDB(db);
    
    return { success: true, data: peserta };
}


// Get participant by ID
function getPesertaById(id){
    const db = loadDB();
    return db.peserta.find(p => p.id === id);
}


// Get all participants
function getAllPeserta(){
    const db = loadDB();
    const today = getTodayString();
    
    return {
        all: db.peserta,
        today: db.sessions[today] || [],
        total_today: (db.sessions[today] || []).length
    };
}


// Update participant status
function updateStatus(id, status, adminNote = null){
    const db = loadDB();
    const index = db.peserta.findIndex(p => p.id === id);
    
    if(index === -1){
        return { success: false, message: "Peserta tidak ditemukan" };
    }
    
    db.peserta[index].status = status;
    if(adminNote){
        db.peserta[index].admin_note = adminNote;
    }
    db.peserta[index].updated_at = new Date().toISOString();
    
    // Also update in sessions
    const today = getTodayString();
    if(db.sessions[today]){
        const sessionIndex = db.sessions[today].findIndex(p => p.id === id);
        if(sessionIndex !== -1){
            db.sessions[today][sessionIndex].status = status;
            if(adminNote){
                db.sessions[today][sessionIndex].admin_note = adminNote;
            }
        }
    }
    
    saveDB(db);
    return { success: true, data: db.peserta[index] };
}


// Save payment proof
function savePaymentProof(id, proofData){
    const db = loadDB();
    const index = db.peserta.findIndex(p => p.id === id);
    
    if(index === -1){
        return { success: false, message: "Peserta tidak ditemukan" };
    }
    
    db.peserta[index].payment_proof = proofData;
    db.peserta[index].status = "Waiting_Payment";
    db.peserta[index].updated_at = new Date().toISOString();
    
    // Update in sessions
    const today = getTodayString();
    if(db.sessions[today]){
        const sessionIndex = db.sessions[today].findIndex(p => p.id === id);
        if(sessionIndex !== -1){
            db.sessions[today][sessionIndex].payment_proof = proofData;
            db.sessions[today][sessionIndex].status = "Waiting_Payment";
        }
    }
    
    saveDB(db);
    return { success: true, data: db.peserta[index] };
}


// Store cashi.id order ID for webhook matching
function updateCashiOrder(id, cashiOrderId){
    const db = loadDB();
    const index = db.peserta.findIndex(p => p.id === id);
    
    if(index === -1){
        return { success: false, message: "Peserta tidak ditemukan" };
    }
    
    db.peserta[index].cashi_order_id = cashiOrderId;
    db.peserta[index].updated_at = new Date().toISOString();
    
    // Update in sessions
    const today = getTodayString();
    if(db.sessions[today]){
        const sessionIndex = db.sessions[today].findIndex(p => p.id === id);
        if(sessionIndex !== -1){
            db.sessions[today][sessionIndex].cashi_order_id = cashiOrderId;
        }
    }
    
    saveDB(db);
    return { success: true, data: db.peserta[index] };
}


// Get pending registrations for admin
function getPendingRegistrations(){
    const db = loadDB();
    const today = getTodayString();
    
    const pending = (db.sessions[today] || []).filter(p => 
        p.status === "Pending" || p.status === "Waiting_Payment"
    );
    
    return pending;
}


// Get session statistics
function getSessionStats(){
    const db = loadDB();
    const today = getTodayString();
    const sessions = generateSessions();
    
    return sessions.map(s => ({
        ...s,
        peserta: (db.sessions[today] || []).filter(p => p.jam === s.jam)
    }));
}


// Delete single participant by ID
function deletePeserta(id){
    const db = loadDB();
    
    // Find participant index
    const index = db.peserta.findIndex(p => p.id === id);
    if(index === -1){
        return { success: false, message: "Peserta tidak ditemukan" };
    }
    
    // Remove from main array
    const deleted = db.peserta.splice(index, 1)[0];
    
    // Also remove from sessions
    const today = getTodayString();
    if(db.sessions[today]){
        const sessionIndex = db.sessions[today].findIndex(p => p.id === id);
        if(sessionIndex !== -1){
            db.sessions[today].splice(sessionIndex, 1);
        }
    }
    
    saveDB(db);
    return { success: true, data: deleted };
}


// Delete ALL participants
function deleteAllPeserta(){
    const db = loadDB();
    const today = getTodayString();
    
    // Clear all data
    db.peserta = [];
    db.sessions[today] = [];
    
    saveDB(db);
    return { success: true, message: "Semua peserta berhasil dihapus" };
}


// Reset participant status back to Pending (for re-registration)
function resetPesertaStatus(id){
    const db = loadDB();
    
    // Find participant
    const index = db.peserta.findIndex(p => p.id === id);
    if(index === -1){
        return { success: false, message: "Peserta tidak ditemukan" };
    }
    
    // Reset status to Pending
    db.peserta[index].status = "Pending";
    db.peserta[index].payment_proof = null;
    db.peserta[index].cashi_order_id = null;
    db.peserta[index].updated_at = new Date().toISOString();
    
    // Also update in sessions
    const today = getTodayString();
    if(db.sessions[today]){
        const sessionIndex = db.sessions[today].findIndex(p => p.id === id);
        if(sessionIndex !== -1){
            db.sessions[today][sessionIndex].status = "Pending";
            db.sessions[today][sessionIndex].payment_proof = null;
            db.sessions[today][sessionIndex].cashi_order_id = null;
        }
    }
    
    saveDB(db);
    return { success: true, data: db.peserta[index] };
}


module.exports = {
    loadDB,
    saveDB,
    checkDailyReset,
    getTodayString,
    generateSessions,
    getSlotCount,
    generateKode,
    isAlreadyRegistered,
    getRegistrationCount,
    getRemainingRegistrations,
    registerPeserta,
    getPesertaById,
    getAllPeserta,
    updateStatus,
    savePaymentProof,
    updateCashiOrder,
    getPendingRegistrations,
    getSessionStats,
    deletePeserta,
    deleteAllPeserta,
    resetPesertaStatus
};
