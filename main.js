const { connectToWhatsApp } = require('./connect.js');
const { handleMessage } = require('./features.js');

async function main() {
    try {
        const sock = await connectToWhatsApp();

        sock.ev.on('messages.upsert', async (mek) => {
            const m = mek.messages[0];
            // Kondisi diperbarui untuk mengabaikan pesan dari bot lain
            if (!m.message || m.key.fromMe || m.key.isBaileys) return;

            await handleMessage(sock, m);
        });

    } catch (error) {
        console.error("Gagal menjalankan bot utama:", error);
    }
}

main();