-- ============================================================================
-- MIGRASI: kaitkan kanal pengisian → stasiun SPKLU.
-- Menambah kolom `channels.station_id` + FK ke `stations`, lalu menyebar
-- kanal yang belum bertuan ke stasiun yang ada (round-robin) agar Monitor
-- kanal & Analitik bisa difilter / dikelompokkan per titik SPKLU.
--
-- Jalankan SEKALI pada database `spklu_db` yang sudah ada:
--   mysql -u root -p spklu_db < db/migration_channel_station.sql
-- (phpMyAdmin → pilih spklu_db → tab SQL → tempel → Go).
-- Aman dijalankan ulang: kolom/constraint dicek dulu via information_schema.
-- ============================================================================
USE spklu_db;

-- 1) Tambah kolom station_id (hanya bila belum ada).
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'channels' AND COLUMN_NAME = 'station_id'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE channels ADD COLUMN station_id INT NULL AFTER id, ADD KEY idx_channels_station (station_id)',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) Tambah foreign key ke stations (hanya bila belum ada).
SET @has_fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'channels' AND CONSTRAINT_NAME = 'fk_channel_station'
);
SET @sql := IF(@has_fk = 0,
  'ALTER TABLE channels ADD CONSTRAINT fk_channel_station FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE SET NULL',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) Sebar kanal yang belum punya stasiun secara round-robin ke stasiun yang ada.
--    (Window function: didukung MySQL 8 / MariaDB 10.4+.)
UPDATE channels c
JOIN (
  SELECT ch.id AS channel_id, st.id AS station_id
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id) - 1 AS rn FROM channels WHERE station_id IS NULL
  ) ch
  JOIN (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id) - 1 AS rn,
           (SELECT COUNT(*) FROM stations) AS total
    FROM stations
  ) st ON st.rn = ch.rn % st.total
) map ON map.channel_id = c.id
SET c.station_id = map.station_id
WHERE c.station_id IS NULL;
