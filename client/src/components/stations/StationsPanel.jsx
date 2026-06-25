import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MapPin, MapPinOff, Search, Navigation, Zap, Plug, Clock,
  Building2, ExternalLink, Crosshair,
} from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Badge from '../ui/Badge';
import Skeleton from '../ui/Skeleton';
import StatCard from '../ui/StatCard';
import EmptyState from '../ui/EmptyState';
import { api } from '../../lib/api';
import { number } from '../../lib/format';
import { useToast } from '../../context/ToastProvider';

/* ============================================================================
   StationsPanel — daftar Lokasi SPKLU (CMW Universal Fast Charging).
   - Ambil data publik dari GET /api/stations (tanpa auth).
   - Ringkasan: total stasiun, jumlah ONLINE, total konektor tersedia.
   - Pencarian (nama/kota) + filter kota.
   - Kartu stasiun responsif; jika izin geolokasi diberikan, hitung jarak
     (haversine) dan urutkan terdekat lebih dulu.
   - Memilih kartu membuka detail dengan peta Google (iframe embed) + tombol
     "Buka di Google Maps" dan "Rute".
   ========================================================================== */

// Badge status stasiun -> varian Badge yang sesuai.
const STATUS_VARIANT = { ONLINE: 'ready', BUSY: 'busy', OFFLINE: 'muted' };
const STATUS_LABEL = { ONLINE: 'Online', BUSY: 'Sibuk', OFFLINE: 'Offline' };

// Jarak haversine (km) antara dua titik koordinat.
function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371; // radius bumi (km)
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Format jarak yang manusiawi (m bila < 1 km).
const fmtDist = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

export default function StationsPanel() {
  const toast = useToast();
  const [stations, setStations] = useState(null); // null = sedang memuat
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [coords, setCoords] = useState(null); // posisi pengguna { lat, lng }
  const [locating, setLocating] = useState(false);

  // Muat daftar stasiun (endpoint publik).
  useEffect(() => {
    let alive = true;
    api.get('/stations')
      .then((data) => { if (alive) setStations(Array.isArray(data) ? data : []); })
      .catch((err) => { if (alive) { toast(err.message, { type: 'error' }); setStations([]); } });
    return () => { alive = false; };
  }, [toast]);

  // Minta lokasi pengguna untuk "Stasiun terdekat".
  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      toast('Browser tidak mendukung geolokasi.', { type: 'warning' });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast('Lokasi terdeteksi. Stasiun diurutkan dari yang terdekat.', { type: 'success' });
      },
      () => {
        setLocating(false);
        toast('Tidak dapat mengakses lokasi. Periksa izin browser.', { type: 'warning' });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [toast]);

  // Daftar kota unik untuk filter (Select).
  const cities = useMemo(() => {
    const set = new Set((stations || []).map((s) => s.city).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [stations]);

  // Hasil setelah filter + (opsional) jarak + pengurutan.
  const results = useMemo(() => {
    let list = (stations || []).map((s) => ({
      ...s,
      distance: coords ? haversineKm(coords.lat, coords.lng, s.lat, s.lng) : null,
    }));

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.city || '').toLowerCase().includes(q) ||
          (s.address || '').toLowerCase().includes(q),
      );
    }
    if (city) list = list.filter((s) => s.city === city);

    // Terdekat dulu bila lokasi tersedia; jika tidak, urut nama.
    if (coords) list.sort((a, b) => a.distance - b.distance);
    else list.sort((a, b) => a.name.localeCompare(b.name, 'id'));

    return list;
  }, [stations, query, city, coords]);

  // Stasiun yang sedang dipilih untuk panel detail.
  const selected = useMemo(
    () => results.find((s) => s.id === selectedId) || null,
    [results, selectedId],
  );

  // Ringkasan statistik.
  const totalStations = (stations || []).length;
  const onlineCount = (stations || []).filter((s) => s.status === 'ONLINE').length;
  const availableConnectors = (stations || []).reduce((sum, s) => sum + (s.available || 0), 0);

  // Buka tautan peta di tab baru dengan aman.
  const openExt = (url) => window.open(url, '_blank', 'noopener');

  /* ----------------------------- LOADING ----------------------------- */
  if (stations === null) {
    return (
      <div className="sp-wrap">
        <div className="sp-stats">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={84} />)}
        </div>
        <Skeleton height={56} />
        <div className="sp-main">
          <div className="sp-list">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={120} />)}
          </div>
          <Skeleton height={420} />
        </div>
      </div>
    );
  }

  return (
    <div className="sp-wrap">
      {/* Ringkasan */}
      <div className="sp-stats">
        <StatCard icon={MapPin} accent="accent" label="Total stasiun" value={number(totalStations)} />
        <StatCard icon={Zap} accent="pos" label="Stasiun online" value={number(onlineCount)} sub={`dari ${number(totalStations)} stasiun`} />
        <StatCard icon={Plug} accent="cyan" label="Konektor tersedia" value={number(availableConnectors)} />
      </div>

      {/* Toolbar: cari + filter kota + stasiun terdekat */}
      <div className="sp-toolbar">
        <Input
          label="Cari stasiun"
          icon={Search}
          placeholder="Nama, kota, atau alamat…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select label="Filter kota" id="sp-city" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">Semua kota</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Button variant="ghost" onClick={requestLocation} loading={locating} style={{ minHeight: 44 }}>
          <Crosshair size={15} /> Stasiun terdekat
        </Button>
      </div>

      {/* Daftar + detail */}
      {results.length === 0 ? (
        <Card>
          <EmptyState
            icon={MapPinOff}
            title="Tidak ada stasiun ditemukan"
            description="Coba ubah kata kunci pencarian atau filter kota Anda."
          />
        </Card>
      ) : (
        <div className="sp-main">
          {/* Kolom kiri: kartu stasiun */}
          <div className="sp-list">
            {results.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`sp-card ${selectedId === s.id ? 'sel' : ''}`}
                onClick={() => setSelectedId(s.id)}
                aria-pressed={selectedId === s.id}
              >
                <div className="sp-card-top">
                  <div className="min-w-0">
                    <div className="sp-card-name grotesk">{s.name}</div>
                  </div>
                  <Badge variant={STATUS_VARIANT[s.status] || 'muted'} dot={s.status === 'ONLINE'}>
                    {STATUS_LABEL[s.status] || s.status}
                  </Badge>
                </div>

                <div className="sp-card-addr mono">
                  <MapPin size={13} />
                  <span>{s.address}{s.city ? `, ${s.city}` : ''}</span>
                </div>

                <div className="sp-card-meta">
                  <span className="sp-chip"><Plug size={12} /> {number(s.available)}/{number(s.connectors)} konektor</span>
                  <span className="sp-chip"><Zap size={12} /> {number(s.powerKw)} kW · {s.type}</span>
                  {s.distance != null && (
                    <span className="sp-chip dist"><Navigation size={12} /> {fmtDist(s.distance)}</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Kolom kanan: detail stasiun terpilih */}
          <div className="sp-detail">
            <Card>
              {selected ? (
                <div className="sp-detail-pad">
                  <div className="sp-detail-head">
                    <div className="min-w-0">
                      <div className="sp-card-name grotesk" style={{ fontSize: 17 }}>{selected.name}</div>
                      <div className="sp-card-addr mono" style={{ marginTop: 6 }}>
                        <MapPin size={13} />
                        <span>{selected.address}{selected.city ? `, ${selected.city}` : ''}</span>
                      </div>
                    </div>
                    <Badge variant={STATUS_VARIANT[selected.status] || 'muted'} dot={selected.status === 'ONLINE'}>
                      {STATUS_LABEL[selected.status] || selected.status}
                    </Badge>
                  </div>

                  {/* Peta tertanam (tanpa API key). */}
                  <div className="sp-map-frame">
                    <iframe
                      title={`Peta lokasi ${selected.name}`}
                      loading="lazy"
                      src={`https://www.google.com/maps?q=${selected.lat},${selected.lng}&z=15&output=embed`}
                      referrerPolicy="no-referrer-when-downgrade"
                      allowFullScreen
                    />
                  </div>

                  {/* Aksi peta */}
                  <div className="sp-detail-actions">
                    <Button
                      variant="ghost"
                      onClick={() => openExt(`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`)}
                    >
                      <ExternalLink size={15} /> Buka di Google Maps
                    </Button>
                    <Button
                      onClick={() => openExt(`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`)}
                    >
                      <Navigation size={15} /> Rute
                    </Button>
                  </div>

                  {/* Info ringkas */}
                  <div>
                    <div className="sp-info-row">
                      <span className="k"><Plug size={13} /> Konektor tersedia</span>
                      <span className="v">{number(selected.available)} / {number(selected.connectors)}</span>
                    </div>
                    <div className="sp-info-row">
                      <span className="k"><Zap size={13} /> Daya & tipe</span>
                      <span className="v">{number(selected.powerKw)} kW · {selected.type}</span>
                    </div>
                    <div className="sp-info-row">
                      <span className="k"><Clock size={13} /> Jam operasional</span>
                      <span className="v">{selected.hours || '24 jam'}</span>
                    </div>
                    {selected.distance != null && (
                      <div className="sp-info-row">
                        <span className="k"><Navigation size={13} /> Jarak dari Anda</span>
                        <span className="v">{fmtDist(selected.distance)}</span>
                      </div>
                    )}
                    <div className="sp-info-row">
                      <span className="k"><Building2 size={13} /> Kota</span>
                      <span className="v">{selected.city || '—'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={MapPin}
                  title="Pilih stasiun"
                  description="Klik salah satu stasiun untuk melihat peta dan petunjuk arah."
                />
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
