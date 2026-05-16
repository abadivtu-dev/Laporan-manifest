import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { writeFileSync } from 'fs';
import { exec } from 'child_process';
import qrcode from 'qrcode';

console.log('🔌 Menghubungkan ke WhatsApp...\n');

const { state, saveCreds } = await useMultiFileAuthState('auth_info');

let sock = null;
let qrShown = false;
let connected = false;
let exitTimer = null;

function resetTimer(sec) {
  if (exitTimer) clearTimeout(exitTimer);
  exitTimer = setTimeout(() => {
    if (!connected) {
      console.log('\n⏰ Waktu habis (10 menit). Jalankan ulang: node setup-wa.mjs');
      process.exit(1);
    }
  }, sec * 1000);
}

resetTimer(600);

function bindSocket() {
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', onConnectionUpdate);
}

function onConnectionUpdate({ connection, lastDisconnect, qr }) {
  if (qr && !qrShown && !connected) {
    qrShown = true;
    console.log('═══════════════════════════════════════════');
    console.log('  📱 SCAN QR INI DARI HP KAMU !!!');
    console.log('  Buka WA > Linked Devices > Link a Device');
    console.log('═══════════════════════════════════════════\n');

    qrcode.toFile('qr-code.png', qr, { scale: 8, margin: 2 })
      .then(() => exec('start "" "qr-code.png"'))
      .catch(() => console.log('  QR string:', qr.substring(0, 120)));

    console.log('  📷 Gambar QR terbuka otomatis! Scan sekarang.\n');
    console.log('  ⚡ QR hanya berlaku ~2 menit. Cepat scan!\n');
  }

  if (connection === 'open') {
    connected = true;
    if (exitTimer) clearTimeout(exitTimer);
    console.log('\n✅ WHATSAPP TERHUBUNG!');
    console.log('🔍 Mencari grup WA...\n');

    setTimeout(async () => {
      try {
        const chats = await sock.groupFetchAllParticipating();
        const groups = Object.values(chats);

        if (groups.length === 0) {
          console.log('⚠️ Tidak ada grup ditemukan.');
          process.exit(1);
        }

        console.log(`📋 DITEMUKAN ${groups.length} GRUP:`);
        console.log('═'.repeat(60));

        for (const g of groups) {
          console.log(`  📝 ${g.subject}`);
          console.log(`  └─ JID: ${g.id}\n`);
        }

        const list = groups.map(g => `${g.subject}|${g.id}`).join('\n');
        writeFileSync('group-list.txt', list);
        console.log('═'.repeat(60));
        console.log('\n💾 Daftar grup disimpan ke: group-list.txt\n');
        console.log('👉 Masukkan JID grup target ke .env:');
        console.log('   WA_GROUP_JID=628xxxxxxxxxx-xxxxxx@g.us\n');
        console.log('Setelah JID diisi, jalankan: npm start -- --run-now\n');
        process.exit(0);
      } catch (err) {
        console.log('❌ Gagal fetch grup:', err.message);
        process.exit(1);
      }
    }, 3000);
  }

  if (connection === 'close') {
    const code = lastDisconnect?.error?.output?.statusCode;

    if (code === DisconnectReason.loggedOut) {
      console.log('❌ Session expired. Hapus folder auth_info/ lalu ulangi.');
      process.exit(1);
    }

    // 515/428 = restart required (normal setelah pairing pertama)
    if ((code === 515 || code === 428) && !connected) {
      console.log('🔄 Restart koneksi setelah pairing...');
      // Bikin socket baru — state sudah terupdate dari saveCreds
      sock.ev.removeAllListeners();
      sock = makeWASocket({
        auth: state,
        syncFullHistory: false,
        markOnlineOnConnect: false,
      });
      bindSocket();
      console.log('   Socket baru dibuat, menunggu koneksi...\n');
      resetTimer(300);
      return;
    }

    console.log('🔁 Koneksi tertutup, reconnect...');
  }
}

// Start
sock = makeWASocket({
  auth: state,
  syncFullHistory: false,
  markOnlineOnConnect: false,
});
bindSocket();
