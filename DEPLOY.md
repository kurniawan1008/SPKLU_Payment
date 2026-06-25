# Panduan Deploy SPKLU ke VPS (Ubuntu)

Panduan ini menjalankan SPKLU di VPS Linux dengan **Node + MySQL + PM2 + Nginx + HTTPS**.
Diuji untuk **Ubuntu 22.04/24.04**. Perintah dijalankan via SSH sebagai user dengan `sudo`.

Arsitektur di server:

```
Internet ──► Nginx (:80/:443, HTTPS) ──► Node/Express + Socket.IO (:3000) ──► MySQL (:3306)
                                              └── menyajikan React build (client/dist)
```

> Catatan penting: aplikasi memakai **mesin telemetri tiap 1 detik + WebSocket**, jadi harus
> berjalan sebagai **satu proses** (PM2 `fork`, `instances: 1`). Jangan mode cluster.

---

## 0. Prasyarat
- VPS Ubuntu dengan akses SSH (`ssh user@IP_VPS`).
- Domain yang sudah diarahkan ke IP VPS (A record), mis. `spklu.contoh.com`.
  (Bisa juga pakai IP dulu tanpa HTTPS, tapi domain disarankan.)

---

## 1. Update sistem & tooling dasar

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git ufw
```

---

## 2. Install Node.js 20 (LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v        # pastikan node >= 18
```

---

## 3. Install & siapkan MySQL

```bash
sudo apt install -y mysql-server
sudo systemctl enable --now mysql
sudo mysql_secure_installation     # set password root, hapus akun anonim, dll.
```

Buat database, user khusus, dan import skema:

```bash
sudo mysql
```

Di dalam prompt MySQL:

```sql
CREATE USER 'spklu'@'localhost' IDENTIFIED BY 'PASSWORD_KUAT_ANDA';
CREATE DATABASE spklu_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON spklu_db.* TO 'spklu'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> Skema tabel di-import pada **langkah 5** setelah kode ada di server.

---

## 4. Ambil kode ke server

**Opsi A — via Git** (disarankan; mudah update nanti):

```bash
cd /var/www         # atau folder pilihan Anda; buat dengan: sudo mkdir -p /var/www && sudo chown $USER /var/www
git clone <URL_REPO_ANDA> spklu
cd spklu
```

**Opsi B — upload manual** dari komputer Windows (jika belum pakai Git).
Jalankan di PowerShell/cmd **lokal** (jangan ikutkan `node_modules` & `client/dist`):

```bash
scp -r "D:\claude\spklu" user@IP_VPS:/var/www/spklu
```

> Setelah upload, di server tetap jalankan `npm install` & `npm run build` (langkah 6).

---

## 5. Import skema database

Dari dalam folder proyek di server:

```bash
mysql -u spklu -p spklu_db < db/schema.sql
```

(Skema sudah membuat 8 stasiun dan 3 kanal awal. Membuat admin: lihat **langkah 10**.)

> **Database yang sudah ada?** Jangan jalankan `schema.sql` (akan gagal karena tabel sudah ada).
> Jalankan migrasi incremental ini secara berurutan — aman diulang (idempoten):
> ```bash
> mysql -u spklu -p spklu_db < db/migration_stations.sql
> mysql -u spklu -p spklu_db < db/migration_topup_requests.sql
> mysql -u spklu -p spklu_db < db/migration_channel_station.sql
> ```

---

## 6. Install dependency & build frontend

```bash
cd /var/www/spklu
npm install            # dependency backend
npm run build          # install + build frontend → client/dist
```

---

## 7. Konfigurasi environment

```bash
cp .env.example .env
nano .env
```

Isi minimal yang **wajib** disesuaikan:
- `DB_USER=spklu`, `DB_PASSWORD=` (password dari langkah 3), `DB_NAME=spklu_db`
- `JWT_SECRET=` — buat acak:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- `ALLOWED_ORIGINS=https://spklu.contoh.com` (domain Anda)
- `NODE_ENV=production`

Uji cepat bahwa server bisa hidup:

```bash
node server.js        # harus muncul "Database terhubung" & "SPKLU server aktif". Ctrl+C untuk stop.
```

---

## 8. Jalankan dengan PM2

```bash
sudo npm install -g pm2
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save                      # simpan daftar proses
pm2 startup                   # ikuti perintah yang ditampilkan (agar auto-start saat reboot)
pm2 status                    # cek "online"
pm2 logs spklu                # lihat log realtime
```

---

## 9. Nginx (reverse proxy)

```bash
sudo apt install -y nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/spklu
sudo nano /etc/nginx/sites-available/spklu     # ganti server_name → domain Anda
sudo ln -s /etc/nginx/sites-available/spklu /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default     # nonaktifkan situs default (opsional)
sudo nginx -t                                   # tes konfigurasi
sudo systemctl reload nginx
```

Buka firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Saat ini situs sudah bisa diakses via `http://spklu.contoh.com`.

---

## 10. HTTPS (Let's Encrypt / certbot)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d spklu.contoh.com
```

Certbot otomatis menambah blok HTTPS + redirect 80→443, dan memperpanjang sertifikat sendiri.
Setelah ini, akses lewat `https://spklu.contoh.com`.

---

## 11. Membuat akun admin

1. Buka situs → **/register**, daftar satu akun.
2. Naikkan perannya jadi admin:

```bash
mysql -u spklu -p spklu_db -e "UPDATE users SET role='ADMIN' WHERE email='email-anda@contoh.com';"
```

3. Login ulang → otomatis diarahkan ke `/admin`.

---

## 12. Update / redeploy (saat ada perubahan kode)

```bash
cd /var/www/spklu
git pull                 # atau upload ulang via scp
npm install              # jika ada dependency baru
npm run build            # rebuild frontend
pm2 restart spklu
```

---

## Troubleshooting

| Gejala | Periksa |
|---|---|
| Situs tak bisa diakses | `pm2 status` (online?), `sudo nginx -t`, `sudo systemctl status nginx` |
| 502 Bad Gateway | App mati / port salah → `pm2 logs spklu`, pastikan `PORT=3000` |
| "Database terhubung" gagal | Kredensial `.env` salah, atau user MySQL belum punya grant |
| WebSocket/telemetri tak update | Pastikan blok `Upgrade`/`Connection` ada di Nginx (sudah di `nginx.conf`) |
| Login admin tetap ke /dashboard | Role belum `ADMIN` di DB (langkah 11), lalu **login ulang** |
| Frontend menampilkan pesan "belum di-build" | Jalankan `npm run build` lagi, cek folder `client/dist` ada |
| Rate-limit error / IP klien salah | Pastikan `NODE_ENV=production` (mengaktifkan `trust proxy`) |

---

## Ringkasan perintah cek cepat

```bash
pm2 status                      # status aplikasi
pm2 logs spklu --lines 50       # log terbaru
curl -s localhost:3000/api/health   # health check langsung ke Node
sudo systemctl status nginx     # status Nginx
```
