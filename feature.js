const fs = require('fs');
const { startClone, stopClone, getClonesList } = require('./jadibot_clone.js');
const config = require('./config.json');

async function handleMessage(sock, m) {
    const from = m.key.remoteJid;
    const body = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim();

    // Cek jika pengirim adalah sub-bot yang aktif, abaikan
    if (getClonesList().mentions?.includes(from)) {
        return;
    }

    const prefix = /^[./]/.test(body) ? body.match(/^[./]/)[0] : null;
    if (!prefix) return;

    const command = body.slice(prefix.length).trim().split(/ +/).shift().toLowerCase();

    switch (command) {
        case 'menu': {
            const menuText = `
┌─「 *Daffa Bot Menu* 」
│
│ • ${prefix}owner
│ • ${prefix}menu
│ • ${prefix}jadibot
│ • ${prefix}listjadibot
│ • ${prefix}stopjadibot
│
└─「 by Gemini AI 」
            `;
            await sock.sendMessage(from, { text: menuText }, { quoted: m });
            break;
        }

        case 'owner': {
            try {
                const ownerJid = `${config.ownerNumber}@s.whatsapp.net`;
                let ppUrl;
                try {
                    ppUrl = await sock.profilePictureUrl(ownerJid, 'image');
                } catch {
                    ppUrl = 'https://i.ibb.co/6X7dDnt/no-profile-picture-icon-23.png';
                }
                const ownerInfo = `*Nama Owner:* ${config.ownerName}\n*Nomor Owner:* wa.me/${config.ownerNumber}`;
                await sock.sendMessage(from, { image: { url: ppUrl }, caption: ownerInfo }, { quoted: m });
            } catch (err) {
                console.error("Error di fitur owner:", err);
                await sock.sendMessage(from, { text: "Maaf, terjadi kesalahan." }, { quoted: m });
            }
            break;
        }

        case 'jadibot': {
            await startClone(from, sock);
            break;
        }

        case 'stopjadibot': {
            await stopClone(from, sock);
            break;
        }

        case 'listjadibot': {
            const { text, mentions } = getClonesList();
            await sock.sendMessage(from, { text, mentions }, { quoted: m });
            break;
        }
    }
}

module.exports = { handleMessage };