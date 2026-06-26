-- ============================================================================
-- MIGRASI: integrasi mesin SPKLU fisik (ESP32 XY12550S) → backend/website.
-- Menambah tabel `devices` (satu baris = satu mesin/gateway) dan memetakan
-- kanal pengisian ke konektor fisik mesin lewat kolom `channels.device_id` +
-- `channels.device_ch` (1..3). Dengan ini telemetri & penyelesaian sesi bisa
-- berasal dari hardware nyata, bukan simulasi.
--
-- Jalankan SEKALI pada database `spklu_db` yang sudah ada:
--   mysql -u spklu -p spklu_db < db/migration_devices.sql
-- Aman dijalankan ulang (idempoten): kolom/constraint dicek dulu.
--
-- PENTING: ganti device_key 'CHANGE_ME_DEVICE_KEY' dengan token acak rahasia
-- (lihat DEPLOY/INTEGRATION). Token ini dipakai gateway untuk autentikasi.
-- ============================================================================
USE spklu_db;

-- 1) Tabel devices — mesin SPKLU fisik / gateway.
CREATE TABLE IF NOT EXISTS devices (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  device_key   VARCHAR(80)  NOT NULL UNIQUE,            -- rahasia bersama autentikasi gateway
  name         VARCHAR(120) NOT NULL,
  station_id   INT NULL,                                -- SPKLU yang diwakili mesin ini
  mode         ENUM('ONLINE','OFFLINE') NOT NULL DEFAULT 'OFFLINE',
  online       TINYINT(1)   NOT NULL DEFAULT 0,         -- gateway sedang terhubung?
  last_seen_at TIMESTAMP NULL,
  fw_info      VARCHAR(120) NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_devices_station (station_id),
  CONSTRAINT fk_device_station FOREIGN KEY (station_id)
    REFERENCES stations(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 2) Kolom pemetaan di channels: device_id + device_ch (1..3).
SET @has_dev := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'channels' AND COLUMN_NAME = 'device_id'
);
SET @sql := IF(@has_dev = 0,
  'ALTER TABLE channels ADD COLUMN device_id INT NULL AFTER station_id, ADD COLUMN device_ch TINYINT NULL AFTER device_id, ADD KEY idx_channels_device (device_id)',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3) Foreign key channels.device_id → devices(id).
SET @has_fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'channels' AND CONSTRAINT_NAME = 'fk_channel_device'
);
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE channels ADD CONSTRAINT fk_channel_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 4) Unik (device_id, device_ch) — satu konektor fisik = satu kanal.
SET @has_uq := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'channels' AND INDEX_NAME = 'uq_channel_device_ch'
);
SET @sql := IF(@has_uq = 0,
  'ALTER TABLE channels ADD UNIQUE KEY uq_channel_device_ch (device_id, device_ch)',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 5) Daftarkan satu mesin demo (bila belum ada) di stasiun pertama.
INSERT INTO devices (device_key, name, station_id, mode)
SELECT 'CHANGE_ME_DEVICE_KEY', 'CMW Charger #01 (XY12550S)',
       (SELECT id FROM stations ORDER BY id LIMIT 1), 'OFFLINE'
WHERE NOT EXISTS (SELECT 1 FROM devices WHERE name = 'CMW Charger #01 (XY12550S)');

-- 6) Ikat 3 kanal pertama ke konektor mesin (device_ch 1..3) + satukan stasiun.
UPDATE channels c
JOIN devices d ON d.name = 'CMW Charger #01 (XY12550S)'
JOIN (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM channels
) r ON r.id = c.id
SET c.device_id  = d.id,
    c.device_ch  = r.rn,
    c.station_id = d.station_id
WHERE r.rn <= 3 AND c.device_id IS NULL;
