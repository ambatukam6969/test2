const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeInMemoryStore
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const qrcode = require('qrcode-terminal');
const fs = require('fs/promises');
const path = require('path');
const config = require('./config.json');

const activeClones = new Map();
const JADIBOT_SESSION_DIR = './jadibot_session/';

// Pastikan direktori sesi jadibot ada
async function ensureJadibotDir() {
    try {
        await fs.access(JADIBOT_SESSION_DIR);
    } catch (e) {
        await fs.mkdir(JADIBOT_SESSION_DIR);
    }
}
ensureJadibotDir();

// Fungsi untuk memulai clone baru
async function startClone(requesterJid, mainSock) {
    if (activeClones.has(requesterJid)) {
        await mainSock.sendMessage(requesterJid, { text: 'Anda sudah memiliki sesi sub-bot yang aktif.' });
        return;
    }

    const cloneId = requesterJid.split('@')[0];
    const sessionPath = path.join(JADIBOT_SESSION_DIR, cloneId);
    console.log(`Membuat sub-bot baru untuk ${cloneId}...`);
    
    await mainSock.sendMessage(requesterJid, { text: '⏳ Sedang menyiapkan sesi sub-bot Anda...' });
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const cloneSock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: false, // Kita handle manual
        auth: state,
        browser: [`Daffa-SubBot-${cloneId}`, 'Safari', '1.0.0']
    });

    cloneSock.ev.on('creds.update', saveCreds);

    cloneSock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (connection === 'open') {
            console.log(`✅ Sub-bot untuk ${cloneId} berhasil terhubung.`);
            await mainSock.sendMessage(requesterJid, { text: '✅ Sub-bot Anda berhasil terhubung!' });
            activeClones.set(requesterJid, cloneSock);
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`Koneksi sub-bot ${cloneId} terputus. Status reconnect: ${shouldReconnect}`);
            activeClones.delete(requesterJid);
            if (!shouldReconnect) {
                try {
                    await fs.rm(sessionPath, { recursive: true, force: true });
                    console.log(`Sesi untuk ${cloneId} dihapus karena logout.`);
                } catch (err) {
                    console.error(`Gagal menghapus sesi ${cloneId}:`, err);
                }
            }
        }
        
        // Logika mengirim QR atau Pairing Code
        if (qr && !config.pairing_code_clone) {
            console.log(`Mengirim QR Code ke ${cloneId}`);
            qrcode.generate(qr, { small: true }, async (qrString) => {
                await mainSock.sendMessage(requesterJid, { text: `Silakan pindai QR code ini untuk menjadi bot:\n\n${qrString}` });
            });
        }
    });
    
    if (config.pairing_code_clone && !cloneSock.authState.creds.registered) {
        try {
            await mainSock.sendMessage(requesterJid, { text: `Silakan masukkan nomor WhatsApp Anda di chat pribadi bot ini untuk mendapatkan kode pairing.` });
            // Menambahkan listener sementara untuk nomor telepon dari requester
            const messageListener = async (msg) => {
                const collectedMsg = msg.messages[0];
                const collectedMsgText = (collectedMsg.message?.conversation || collectedMsg.message?.extendedTextMessage?.text || '').trim();
                const jid = collectedMsg.key.remoteJid;

                // Pastikan pesan berasal dari requester dan merupakan nomor telepon
                if (jid === requesterJid && /^\d+$/.test(collectedMsgText)) {
                     await mainSock.sendMessage(requesterJid, { text: `⏳ Meminta kode pairing untuk nomor ${collectedMsgText}...` });
                     try {
                        const code = await cloneSock.requestPairingCode(collectedMsgText);
                        await mainSock.sendMessage(requesterJid, { text: `📲 Kode pairing Anda adalah: *${code}*\n\nBuka WhatsApp di ponsel Anda > Perangkat Tertaut > Tautkan dengan nomor telepon.` });
                     } catch (e) {
                         await mainSock.sendMessage(requesterJid, { text: `Gagal meminta kode pairing. Pastikan nomor benar.` });
                         console.error(e);
                     }
                    // Hapus listener setelah digunakan
                    mainSock.ev.off('messages.upsert', messageListener);
                }
            };
            mainSock.ev.on('messages.upsert', messageListener);
        } catch (e) {
            console.error("Gagal memulai proses pairing code untuk sub-bot:", e);
        }
    }


    // Listener pesan untuk sub-bot
    cloneSock.ev.on('messages.upsert', async (mek) => {
        const m = mek.messages[0];
        if (!m.message || m.key.fromMe) return;
        
        // Menyimpan log "command, pesan dan nomer bot"
        const from = m.key.remoteJid;
        const body = (m.message.conversation || m.message.extendedTextMessage?.text || '');
        console.log(`[LOG SUB-BOT ${cloneId}] Pesan dari ${from}: "${body}"`);

        // Contoh auto-reply sederhana untuk sub-bot
        await cloneSock.sendMessage(from, { text: `Halo, Anda terhubung dengan sub-bot milik ${cloneId}.` }, { quoted: m });
    });
}

// Fungsi untuk menghentikan clone
async function stopClone(requesterJid, mainSock) {
    if (!activeClones.has(requesterJid)) {
        await mainSock.sendMessage(requesterJid, { text: 'Anda tidak memiliki sesi sub-bot yang aktif.' });
        return;
    }
    const cloneId = requesterJid.split('@')[0];
    const cloneSock = activeClones.get(requesterJid);

    await mainSock.sendMessage(requesterJid, { text: '⏳ Menghentikan sesi sub-bot Anda...' });
    
    // Logout untuk memicu 'connection.close' dengan DisconnectReason.loggedOut
    await cloneSock.logout(); 
    
    activeClones.delete(requesterJid);
    
    await mainSock.sendMessage(requesterJid, { text: '✅ Sesi sub-bot Anda telah berhasil dihentikan dan dihapus.' });
    console.log(`Sesi sub-bot untuk ${cloneId} telah dihentikan.`);
}

// Fungsi untuk mendapatkan daftar clone
function getClonesList() {
    if (activeClones.size === 0) {
        return 'Tidak ada sub-bot yang aktif.';
    }
    let listText = '┌─「 *List Sub-Bot Aktif* 」\n';
    let count = 1;
    for (const jid of activeClones.keys()) {
        listText += `│ ${count}. @${jid.split('@')[0]}\n`;
        count++;
    }
    listText += '└─「 Total: ' + activeClones.size + ' 」';
    return { text: listText, mentions: [...activeClones.keys()] };
}

module.exports = { startClone, stopClone, getClonesList };