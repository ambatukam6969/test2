const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const readline = require("readline");

// Fungsi untuk pairing code bot utama
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function connectToWhatsApp() {
    console.log("Menghubungkan bot utama...");
    const { state, saveCreds } = await useMultiFileAuthState('npm_session');

    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: state,
        browser: ['Daffa-Bot-Main', 'Safari', '1.0.0']
    });

    // Logic untuk pairing code bot utama
    if (!sock.authState.creds.registered) {
        const phoneNumber = await question(
            'Untuk BOT UTAMA, silakan masukkan nomor WhatsApp Anda (cth: 6281234567890): '
        );
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`Kode Pairing BOT UTAMA Anda: ${code}`);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi bot utama terputus, mencoba menghubungkan kembali...', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ Bot utama berhasil tersambung!');
        }
    });

    return sock;
}

module.exports = { connectToWhatsApp };