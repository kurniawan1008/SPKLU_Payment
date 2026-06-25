-- ============================================================================
-- MIGRASI: tabel master lokasi SPKLU (CRUD via Dashboard Admin).
-- Memindahkan data stasiun dari file statis ke database agar admin bisa
-- menambah / mengubah / menghapus titik SPKLU langsung dari dashboard.
--
-- Jalankan SEKALI pada database `spklu_db` yang sudah ada:
--   mysql -u root -p spklu_db < db/migration_stations.sql
-- (phpMyAdmin → pilih spklu_db → tab SQL → tempel → Go).
-- Aman dijalankan ulang: tabel dibuat IF NOT EXISTS & seed hanya mengisi
-- bila tabel masih kosong.
-- ============================================================================
USE spklu_db;

CREATE TABLE IF NOT EXISTS stations (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150)  NOT NULL,
  address     VARCHAR(255)  NOT NULL,
  city        VARCHAR(100)  NOT NULL,
  lat         DECIMAL(10,7) NOT NULL,                 -- -90..90
  lng         DECIMAL(10,7) NOT NULL,                 -- -180..180
  status      ENUM('ONLINE','BUSY','OFFLINE') NOT NULL DEFAULT 'ONLINE',
  connectors  INT NOT NULL DEFAULT 2,                 -- total konektor
  available   INT NOT NULL DEFAULT 0,                 -- konektor tersedia (<= connectors)
  power_kw    INT NOT NULL DEFAULT 60,                -- daya (kW)
  type        ENUM('DC','AC','DC/AC') NOT NULL DEFAULT 'DC',
  hours       VARCHAR(60) NOT NULL DEFAULT '24 Jam',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_stations_city   (city),
  KEY idx_stations_status (status)
) ENGINE=InnoDB;

-- Seed 8 stasiun awal — hanya bila tabel masih kosong (idempotent).
INSERT INTO stations (name, address, city, lat, lng, status, connectors, available, power_kw, type, hours)
SELECT * FROM (
            SELECT 'CMW SPKLU Sudirman Hub'          AS name, 'Jl. Jenderal Sudirman Kav. 52-53, Senayan'      AS address, 'Jakarta Selatan'    AS city, -6.2249350 AS lat, 106.8092040 AS lng, 'ONLINE'  AS status, 6 AS connectors, 4 AS available, 200 AS power_kw, 'DC/AC' AS type, '24 Jam'        AS hours
  UNION ALL SELECT 'CMW SPKLU Kelapa Gading',              'Jl. Boulevard Raya Blok M, Kelapa Gading Barat',          'Jakarta Utara',           -6.1578350,  106.9072040, 'BUSY',    4, 0, 150, 'DC',    '24 Jam'
  UNION ALL SELECT 'CMW SPKLU BSD Green Office Park',      'Jl. BSD Grand Boulevard, BSD City, Sampora',              'Tangerang Selatan',       -6.3015200,  106.6501690, 'ONLINE',  5, 3, 120, 'DC/AC', '06.00 - 23.00'
  UNION ALL SELECT 'CMW SPKLU Bekasi Summarecon',         'Jl. Bulevar Selatan, Marga Mulya, Bekasi Utara',          'Bekasi',                  -6.2215400,  107.0016200, 'OFFLINE', 2, 0,  60, 'AC',    '06.00 - 22.00'
  UNION ALL SELECT 'CMW SPKLU Bogor Pajajaran',           'Jl. Raya Pajajaran No. 88, Baranangsiang',                'Bogor',                   -6.6013890,  106.8064580, 'ONLINE',  3, 2, 120, 'DC',    '24 Jam'
  UNION ALL SELECT 'CMW SPKLU Bandung Dago',              'Jl. Ir. H. Djuanda No. 165, Dago, Coblong',               'Bandung',                 -6.8847870,  107.6131440, 'BUSY',    4, 1, 150, 'DC/AC', '24 Jam'
  UNION ALL SELECT 'CMW SPKLU Bandung Pasteur',           'Jl. Dr. Djunjunan No. 143-149, Sukabungah',               'Bandung',                 -6.8937030,  107.5780180, 'ONLINE',  2, 2,  60, 'AC',    '07.00 - 21.00'
  UNION ALL SELECT 'CMW SPKLU Surabaya Pakuwon',          'Jl. Mayjen Jonosewojo, Babatan, Wiyung',                  'Surabaya',                -7.3011400,  112.6744690, 'ONLINE',  6, 5, 200, 'DC/AC', '24 Jam'
) AS seed
WHERE (SELECT COUNT(*) FROM stations) = 0;
