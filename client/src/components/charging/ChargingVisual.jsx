import { Zap, Gauge, Power, Plug } from 'lucide-react';
import { metric } from '../../lib/format';

/* ============================================================================
   ChargingVisual — visualisasi pengisian interaktif & beranimasi.
   Menggantikan EnergyGauge statis di kartu telemetri. Mengonsumsi properti
   telemetri langsung (voltage, current, power, consumedKwh, cost, progress,
   target, active) dan menampilkannya sebagai:
     - Siluet baterai yang terisi proporsional dengan --grad-accent + glow.
     - Cincin progres melingkar (pendekatan SVG yang sama seperti sebelumnya).
     - Partikel "aliran energi" dari colokan menuju baterai saat mengisi.
     - Readout besar: kWh tersalur, persentase, dan tiga tile (Tegangan/Arus/Daya).
   Semua animasi berbasis CSS (lihat dashboard.css) dan menghormati
   prefers-reduced-motion. Saat idle, tampilan tenang tanpa animasi berat.
   ========================================================================== */

/* Tile telemetri kecil — mempertahankan tampilan Tile yang sudah ada. */
function Tile({ icon: Icon, label, value, unit, hot }) {
  return (
    <div className={`telem-tile ${hot ? 'hot' : ''}`}>
      <span className="telem-tile-l"><Icon size={15} /> {label}</span>
      <span className="telem-tile-v">{value}<small>{unit}</small></span>
    </div>
  );
}

export default function ChargingVisual({
  voltage = 0,
  current = 0,
  power = 0,
  consumedKwh = 0,
  progress = 0,
  active = false,
}) {
  // Persentase dibatasi 0..100 untuk cincin & isi baterai.
  const pct = Math.min(100, Math.max(0, progress));

  // Geometri cincin progres (sama seperti EnergyGauge lama).
  const size = 230;
  const stroke = 13;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - pct / 100);

  return (
    <div className="cv-grid">
      {/* Panggung: cincin progres + baterai + aliran energi. */}
      <div className={`cv-stage ${active ? 'is-active' : ''}`}>
        <div className="cv-glow" aria-hidden="true" />

        {/* Cincin progres melingkar. */}
        <svg className="cv-ring" viewBox={`0 0 ${size} ${size}`} role="img"
          aria-label={`Progres pengisian ${Math.round(pct)} persen`}>
          <defs>
            {/* Gradien aksen — satu-satunya tempat hex diperbolehkan (stop gradien). */}
            <linearGradient id="cv-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2ee6c5" />
              <stop offset="100%" stopColor="#38d9f0" />
            </linearGradient>
          </defs>
          <circle className="cv-ring-track" cx={size / 2} cy={size / 2} r={r}
            fill="none" strokeWidth={stroke} />
          <circle className="cv-ring-fill" cx={size / 2} cy={size / 2} r={r}
            fill="none" strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={off} />
        </svg>

        {/* Isi tengah cincin: baterai + readout. */}
        <div className="cv-center">
          <div className={`cv-battery ${active ? 'is-active' : 'is-idle'}`}>
            {/* Isi proporsional terhadap progres. */}
            <div className="cv-battery-fill" style={{ '--cv-fill': `${pct}%` }} />
            <span className="cv-bolt" aria-hidden="true"><Zap size={22} /></span>
          </div>

          <div>
            <div className="cv-readout-pct">{Math.round(pct)}<small>%</small></div>
            <div className="cv-readout-kwh">{metric(consumedKwh, 3)} kWh tersalur</div>
          </div>
        </div>

        {/* Aliran energi: colokan -> baterai (dash berjalan saat aktif). */}
        <svg className={`cv-flow ${active ? 'is-active' : ''}`} viewBox="0 0 230 24"
          preserveAspectRatio="none" aria-hidden="true">
          <line className="cv-flow-line" x1="22" y1="12" x2="208" y2="12" />
          <line className="cv-flow-dash" x1="22" y1="12" x2="208" y2="12" />
        </svg>
        <span className="cv-flow-plug" style={{ marginTop: 2 }} aria-hidden="true">
          <Plug size={14} />
        </span>
      </div>

      {/* Tile telemetri besar di sisi kanan. */}
      <div className="telem-tiles">
        <Tile icon={Gauge} label="Tegangan" value={metric(voltage, 1)} unit="V" />
        <Tile icon={Zap} label="Arus" value={metric(current, 1)} unit="A" />
        <Tile icon={Power} label="Daya" value={metric(power, 1)} unit="kW" hot />
      </div>
    </div>
  );
}
