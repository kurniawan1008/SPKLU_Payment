# SPKLU Gateway

Jembatan **Serial ↔ Server** untuk menghubungkan mesin SPKLU (ESP32 XY12550S,
firmware Rev8.2) ke website payment.

```
[ESP32 mesin] --USB serial 115200--> [Gateway ini (PC/RasPi)] --Socket.IO--> [Server SPKLU]
```

Gateway hanya me-relay protokol dua arah (baris `#...` naik, `$...` turun).
Semua logika (otorisasi, billing, settle) ada di server — gateway tidak perlu
di-update saat logika berubah.

## Prasyarat
- Node.js 18+ di PC yang tersambung USB ke ESP32.
- Driver USB-UART ESP32 terpasang (CP210x / CH340).
- Mesin sudah terdaftar di tabel `devices` (punya `device_key`).

## Cara pakai

```bash
cd gateway
npm install
cp .env.example .env      # Windows: copy .env.example .env

# 1) Cari port serial ESP32
npm run list
#   contoh keluaran: COM5  Silicon Labs CP210x ...

# 2) Edit .env:
#    SERVER_URL  = http://202.74.75.231   (atau http://localhost:3000 untuk uji lokal)
#    DEVICE_KEY  = (samakan dengan devices.device_key di DB)
#    SERIAL_PORT = COM5   (atau /dev/ttyUSB0 di Linux)

# 3) Jalankan
npm start
```

Bila sukses, log menampilkan `✓ Serial terbuka` dan `✓ Terhubung ke server`.
Telemetri `#STATE` akan mengalir tiap 2 detik; status mesin di dashboard admin
berubah menjadi **online**.

## Uji cepat tanpa hardware
Buka port serial (mis. dengan Arduino Serial Monitor / `pio device monitor`)
lalu ketik manual baris berikut untuk meniru ESP32:
```
#STATE {"t":1,"ch":[{"ch":1,"en":1,"st":2,"on":1,"pr":0,"m":3,"v":399.8,"i":360.0,"p":143.9,"vset":400,"iset":360,"kwh":0.50,"rp":1220,"sec":45,"tin":31.0,"auth":1,"sid":"SESS-1","lt":1}]}
#EVT {"ev":"session_complete","ch":1,"sid":"SESS-1","kwh":2.500,"rp":6100,"sec":300,"st":3}
```

## Setup di Raspberry Pi Zero 2 W (ARM, Raspberry Pi OS Lite)

Gateway ini ringan — cocok untuk Pi Zero 2 W. Langkah dari OS bersih:

```bash
# 1) Update + tool build (serialport butuh kompilasi native di ARM)
sudo apt update && sudo apt install -y git build-essential python3

# 2) Node.js 20 LTS untuk ARM
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v        # pastikan v20.x

# 3) Ambil kode & install dependency gateway saja
git clone https://github.com/kurniawan1008/SPKLU_Payment.git ~/spklu
cd ~/spklu/gateway
npm install    # kompilasi serialport ~beberapa menit di Pi Zero

# 4) Izin akses port serial (USB-UART) tanpa sudo
sudo usermod -aG dialout $USER
#   logout-login (atau reboot) agar grup aktif

# 5) Cari port ESP32 (colok USB dulu)
npm run list
#   biasanya /dev/ttyUSB0 (CP210x) atau /dev/ttyACM0 (CH340/native USB)

# 6) Konfigurasi
cp .env.example .env
nano .env
```

Isi `.env` (ganti `DEVICE_KEY` dengan token rahasia dari tabel `devices` di server —
JANGAN commit token asli ke repo):
```ini
SERVER_URL=http://202.74.75.231
DEVICE_KEY=ganti_dengan_device_key_rahasia
SERIAL_PORT=/dev/ttyUSB0
BAUD=115200
```

```bash
# 7) Uji jalan
npm start
#   harap muncul: ✓ Serial terbuka  &  ✓ Terhubung ke server
```

> **Tips Pi Zero 2 W:** pakai Raspberry Pi OS **Lite** (tanpa desktop) agar RAM
> 512 MB lega. Bila `npm install` gagal saat build serialport, pastikan
> `build-essential` & `python3` terpasang, lalu ulangi `npm install`.

## Jalankan permanen (Linux, systemd)
```ini
# /etc/systemd/system/spklu-gateway.service
[Unit]
Description=SPKLU Serial Gateway
After=network-online.target

[Service]
WorkingDirectory=/home/pi/spklu/gateway
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
User=pi

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now spklu-gateway
journalctl -u spklu-gateway -f
```

## Windows (jalan otomatis saat start)
Gunakan **NSSM** (`nssm install SPKLU-Gateway "C:\Program Files\nodejs\node.exe" "D:\...\gateway\index.js"`)
atau Task Scheduler (trigger: At log on → Program: `node`, argumen: `index.js`,
Start in: folder gateway).
