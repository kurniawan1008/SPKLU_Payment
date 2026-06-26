// ============================================================================
// SPKLU Gateway — jembatan Serial (ESP32 XY12550S) <-> server payment.
//
// Alur: ESP32 --USB serial 115200--> [gateway ini] --Socket.IO /device--> server
//   - Baris "#..." dari ESP32  → diteruskan ke server (event 'line')
//   - Perintah "$..." dari server (event 'send') → ditulis ke serial ESP32
//
// Gateway sengaja "bodoh": tidak ada logika bisnis di sini. Semua keputusan
// (otorisasi, billing, settle) ada di server. Jadi gateway tak perlu di-update
// saat logika berubah. Ia hanya: relay 2 arah + reconnect yang andal.
//
// Jalankan:
//   1) salin .env.example -> .env, isi SERVER_URL, DEVICE_KEY, SERIAL_PORT
//   2) npm install
//   3) npm start              (atau: node index.js --list  untuk lihat port)
// ============================================================================
require('dotenv').config();
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { io } = require('socket.io-client');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const DEVICE_KEY = process.env.DEVICE_KEY || '';
const SERIAL_PORT = process.env.SERIAL_PORT || '';
const BAUD = parseInt(process.env.BAUD || '115200', 10);

const ts = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(`[${ts()}]`, ...a);

// --- Mode daftar port: `node index.js --list` ---
async function listPorts() {
  const ports = await SerialPort.list();
  if (!ports.length) return console.log('Tidak ada port serial terdeteksi.');
  console.log('Port serial terdeteksi:');
  for (const p of ports) {
    console.log(`  ${p.path}  ${p.manufacturer || ''} ${p.friendlyName || ''}`.trimEnd());
  }
  console.log('\nSetel SERIAL_PORT di .env ke salah satu path di atas (mis. COM5 / /dev/ttyUSB0).');
}

if (process.argv.includes('--list')) {
  listPorts().then(() => process.exit(0));
  return;
}

if (!DEVICE_KEY) {
  console.error('FATAL: DEVICE_KEY belum diisi di .env');
  process.exit(1);
}
if (!SERIAL_PORT) {
  console.error('FATAL: SERIAL_PORT belum diisi. Jalankan "npm run list" untuk melihat port.');
  process.exit(1);
}

// ---- Socket.IO ke server (namespace /device) ----
const socket = io(`${SERVER_URL.replace(/\/+$/, '')}/device`, {
  auth: { deviceKey: DEVICE_KEY },
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000,
});

socket.on('connect', () => log(`✓ Terhubung ke server ${SERVER_URL} (id=${socket.id})`));
socket.on('disconnect', (r) => log(`✗ Terputus dari server: ${r}`));
socket.on('connect_error', (e) => log(`! Gagal konek server: ${e.message}`));

// ---- Serial port (dengan auto-reopen) ----
let port = null;
let parser = null;

function openSerial() {
  port = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD, autoOpen: false });
  parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

  port.open((err) => {
    if (err) {
      log(`! Gagal buka serial ${SERIAL_PORT}: ${err.message} — coba lagi 3 dtk...`);
      setTimeout(openSerial, 3000);
      return;
    }
    log(`✓ Serial terbuka: ${SERIAL_PORT} @ ${BAUD}`);
  });

  // Baris dari ESP32 ("#...") → server.
  parser.on('data', (raw) => {
    const line = String(raw).replace(/\r$/, '').trim();
    if (!line) return;
    if (process.env.VERBOSE === '1') log('ESP→SRV', line);
    if (socket.connected) socket.emit('line', line);
  });

  port.on('close', () => {
    log('! Serial tertutup — mencoba buka ulang 3 dtk...');
    setTimeout(openSerial, 3000);
  });
  port.on('error', (e) => log(`! Serial error: ${e.message}`));
}

// Perintah dari server ("$...") → ESP32.
socket.on('send', (line) => {
  const cmd = String(line).trim();
  if (!cmd) return;
  if (process.env.VERBOSE === '1') log('SRV→ESP', cmd);
  if (port && port.isOpen) {
    port.write(cmd + '\n', (err) => {
      if (err) log(`! Gagal tulis serial: ${err.message}`);
    });
  } else {
    log(`! Serial belum siap, perintah diabaikan: ${cmd}`);
  }
});

openSerial();
log(`SPKLU gateway start. Server=${SERVER_URL} Port=${SERIAL_PORT} Baud=${BAUD}`);

process.on('SIGINT', () => {
  log('Shutting down...');
  try { if (port && port.isOpen) port.close(); } catch {}
  socket.close();
  process.exit(0);
});
