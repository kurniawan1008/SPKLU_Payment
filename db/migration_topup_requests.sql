-- ============================================================================
-- MIGRASI: tabel antrean permintaan isi saldo (fitur approval admin).
-- Jalankan SEKALI pada database `spklu_db` yang sudah ada
-- (phpMyAdmin → pilih spklu_db → tab SQL → tempel → Go).
-- ============================================================================
USE spklu_db;

CREATE TABLE IF NOT EXISTS topup_requests (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  amount      DECIMAL(14,2) NOT NULL,
  status      ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at  TIMESTAMP NULL,
  KEY idx_topupreq_status (status),
  CONSTRAINT fk_topupreq_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
