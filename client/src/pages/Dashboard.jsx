import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Zap, History, User, Wallet, PlusCircle, Plug, Target, Square,
  Radio, ReceiptText, Save, CheckCircle2, BatteryCharging, MapPin,
} from 'lucide-react';
import AppLayout from '../components/layout/AppLayout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Skeleton from '../components/ui/Skeleton';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';
import ChargingVisual from '../components/charging/ChargingVisual';
import StationsPanel from '../components/stations/StationsPanel';
import { api } from '../lib/api';
import { rupiah, metric, datetime } from '../lib/format';
import { getSocket } from '../lib/socket';
import { useAuth } from '../context/AuthProvider';
import { useToast } from '../context/ToastProvider';
import '../styles/dashboard.css';

const PRICE = 2440;
const NAV = [
  { id: 'charging', label: 'Panel pengisian', icon: Zap },
  { id: 'stations', label: 'Lokasi SPKLU', icon: MapPin },
  { id: 'history', label: 'Riwayat transaksi', icon: History },
  { id: 'profile', label: 'Profil pengguna', icon: User },
];
const SUBTITLES = {
  charging: 'Sistem siap menyalurkan daya',
  stations: 'Temukan stasiun pengisian cepat terdekat',
  history: 'Catatan saldo & pemakaian',
  profile: 'Detail dan status akun Anda',
};

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('charging');
  const [profile, setProfile] = useState(null);
  const [channels, setChannels] = useState([]);
  const [topupOpen, setTopupOpen] = useState(false);

  const activeSession = profile?.activeSession || null;
  const balance = profile?.user?.balance ?? 0;

  const loadProfile = useCallback(async () => {
    try {
      const data = await api.get('/user/profile');
      setProfile(data);
      if (data.activeSession) getSocket().emit('join_session', data.user.id);
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }, [toast]);

  const loadChannels = useCallback(async () => {
    try {
      setChannels(await api.get('/channels'));
    } catch { /* abaikan */ }
  }, []);

  useEffect(() => {
    loadProfile();
    loadChannels();
  }, [loadProfile, loadChannels]);

  useEffect(() => {
    if (user?.id) getSocket().emit('join_session', user.id);
  }, [user]);

  // Listener selesai-pengisian & saldo (telemetry ditangani komponen anak).
  useEffect(() => {
    const socket = getSocket();
    const onFinished = (data) => {
      toast(data.message || 'Pengisian selesai.', { type: 'success', title: 'Pengisian selesai' });
      loadProfile();
      loadChannels();
    };
    const onBalance = () => {
      toast('Saldo Anda telah diperbarui.', { type: 'success', title: 'Isi saldo disetujui' });
      loadProfile();
    };
    socket.on('charging_finished', onFinished);
    socket.on('balance_update', onBalance);
    return () => {
      socket.off('charging_finished', onFinished);
      socket.off('balance_update', onBalance);
    };
  }, [toast, loadProfile, loadChannels]);

  const balanceCard = (
    <div className="balance-card">
      <div className="balance-row">
        <div className="balance-ic"><Wallet size={16} /></div>
        <p className="stat-label">Saldo tersedia</p>
      </div>
      <p className="balance-amt">{profile ? rupiah(balance) : '—'}</p>
      <Button variant="ghost" onClick={() => setTopupOpen(true)} className="btn-block" style={{ minHeight: 42 }}>
        <PlusCircle size={15} /> Isi saldo
      </Button>
    </div>
  );

  return (
    <>
      <AppLayout
        brandSub="Pengisian Cepat"
        navItems={NAV}
        activeTab={tab}
        onTab={setTab}
        sidebarTop={balanceCard}
        title={NAV.find((n) => n.id === tab)?.label}
        subtitle={SUBTITLES[tab]}
        userSub={profile?.user?.npk ? `NPK ${profile.user.npk}` : 'Pengguna'}
        logoutDisabled={!!activeSession}
      >
        {tab === 'charging' && (
          <ChargingPanel
            channels={channels}
            activeSession={activeSession}
            onStarted={() => { loadProfile(); loadChannels(); }}
            onStopped={() => { loadProfile(); loadChannels(); }}
          />
        )}
        {tab === 'stations' && <StationsPanel />}
        {tab === 'history' && <HistoryPanel />}
        {tab === 'profile' && <ProfilePanel onSaved={loadProfile} />}
      </AppLayout>

      <TopupModal open={topupOpen} onClose={() => setTopupOpen(false)} onDone={loadProfile} />
    </>
  );
}

/* ============================ SPARKLINE ============================ */
function Sparkline({ data }) {
  const w = 600, h = 64;
  if (!data || data.length < 2) {
    return <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" />;
  }
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 12) - 6;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ============================ CHARGING ============================ */
function ChargingPanel({ channels, activeSession, onStarted, onStopped }) {
  const toast = useToast();
  const [selected, setSelected] = useState(null);
  const [selectedStation, setSelectedStation] = useState('');
  const [mode, setMode] = useState('RUPIAH');
  const [amount, setAmount] = useState(50000);

  // Daftar SPKLU yang punya channel (turunan dari data channel — tak perlu fetch lain).
  const stationList = useMemo(() => {
    const map = new Map();
    for (const c of channels) {
      const key = c.station_id == null ? 'none' : String(c.station_id);
      if (!map.has(key)) {
        map.set(key, { key, name: c.station_name || 'Tanpa stasiun', city: c.station_city || '' });
      }
    }
    return Array.from(map.values());
  }, [channels]);

  // Default pilih SPKLU pertama (yang punya channel siap diutamakan).
  useEffect(() => {
    if (selectedStation || stationList.length === 0) return;
    const withReady = stationList.find((s) =>
      channels.some((c) => String(c.station_id ?? 'none') === s.key && c.status === 'READY')
    );
    setSelectedStation((withReady || stationList[0]).key);
  }, [stationList, channels, selectedStation]);

  // Channel milik SPKLU terpilih (maks ~3), diberi label per-stasiun CH-01..CH-0N.
  const stationChannels = useMemo(
    () => channels.filter((c) => String(c.station_id ?? 'none') === String(selectedStation)),
    [channels, selectedStation]
  );

  const onPickStation = (key) => {
    setSelectedStation(key);
    setSelected(null); // reset pilihan channel saat ganti SPKLU
  };
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [live, setLive] = useState({ voltage: 0, current: 0, power: 0, consumedKwh: 0, cost: 0, progress: 0 });
  const [spark, setSpark] = useState([]);
  const sparkRef = useRef([]);

  const target = activeSession ? Number(activeSession.target_kwh) : 0;

  useEffect(() => {
    if (activeSession) {
      const consumed = Number(activeSession.consumed_kwh);
      setLive({
        voltage: 400, current: 0, power: 0, consumedKwh: consumed,
        cost: consumed * PRICE,
        progress: target > 0 ? Math.min(100, (consumed / target) * 100) : 0,
      });
      sparkRef.current = [];
      setSpark([]);
    } else {
      setLive({ voltage: 0, current: 0, power: 0, consumedKwh: 0, cost: 0, progress: 0 });
    }
  }, [activeSession, target]);

  useEffect(() => {
    if (!activeSession) return;
    const socket = getSocket();
    const onTick = (data) => {
      if (data.sessionId !== activeSession.id) return;
      const current = data.current ?? 0;
      const voltage = data.voltage ?? 400;
      setLive({
        voltage, current,
        power: data.power ?? (voltage * current) / 1000,
        consumedKwh: data.consumedKwh,
        cost: data.costSoFar,
        progress: data.progress ?? 0,
      });
      const next = [...sparkRef.current, current].slice(-50);
      sparkRef.current = next;
      setSpark(next);
    };
    socket.on('telemetry_update', onTick);
    return () => socket.off('telemetry_update', onTick);
  }, [activeSession]);

  const start = async () => {
    if (!selected) return toast('Pilih channel yang berstatus "Siap" terlebih dahulu.', { type: 'warning' });
    if (!amount || Number(amount) <= 0) return toast('Masukkan target pengisian yang valid.', { type: 'warning' });
    setStarting(true);
    try {
      await api.post('/charging/start', { channelId: Number(selected), mode, amount: Number(amount) });
      toast('Sesi pengisian dimulai. Konektor aktif.', { type: 'success' });
      setSelected(null);
      onStarted();
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setStarting(false);
    }
  };

  const stop = async () => {
    if (!activeSession) return;
    setStopping(true);
    try {
      await api.post('/charging/stop', { sessionId: activeSession.id });
      toast('Pengisian dihentikan.', { type: 'success' });
      onStopped();
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="charge-grid">
      {/* Konfigurasi */}
      <Card style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', opacity: activeSession ? 0.55 : 1, pointerEvents: activeSession ? 'none' : 'auto' }}>
        <h2 className="panel-head"><Plug size={16} /> Konfigurasi pengisian</h2>

        <div className="field-group">
          <Select
            label="Pilih SPKLU"
            value={selectedStation}
            onChange={(e) => onPickStation(e.target.value)}
          >
            {stationList.length === 0 && <option value="">Memuat…</option>}
            {stationList.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}{s.city ? ` · ${s.city}` : ''}
              </option>
            ))}
          </Select>
        </div>

        <div className="field-group">
          <span className="field-label">Pilih channel pengisian</span>
          <div className="channel-grid">
            {channels.length === 0 && <Skeleton height={96} style={{ gridColumn: '1 / -1' }} />}
            {channels.length > 0 && stationChannels.length === 0 && (
              <p className="mono" style={{ gridColumn: '1 / -1', fontSize: 12.5, color: 'var(--text-faint)' }}>
                SPKLU ini belum punya channel.
              </p>
            )}
            {stationChannels.map((c, i) => {
              const ready = c.status === 'READY';
              const isSel = String(selected) === String(c.id);
              const label = `CH-${String(c.device_ch ?? i + 1).padStart(2, '0')}`;
              const stat = c.status === 'CHARGING'
                ? { v: 'busy', t: 'Dipakai' }
                : c.status === 'OFFLINE'
                  ? { v: 'muted', t: 'Offline' }
                  : { v: 'ready', t: 'Siap' };
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={!ready}
                  onClick={() => ready && setSelected(c.id)}
                  className={`ch-card ${isSel ? 'sel' : ''} ${!ready ? 'disabled' : ''}`}
                >
                  <Plug size={20} className="ch-ic" />
                  <span className="ch-name">{label}</span>
                  <Badge variant={stat.v}>{stat.t}</Badge>
                </button>
              );
            })}
          </div>
        </div>

        <div className="field-group">
          <span className="field-label">Batasi berdasarkan</span>
          <div className="segmented">
            <button type="button" className={mode === 'RUPIAH' ? 'on' : ''} onClick={() => setMode('RUPIAH')}>Nominal (Rp)</button>
            <button type="button" className={mode === 'KWH' ? 'on' : ''} onClick={() => setMode('KWH')}>Energi (kWh)</button>
          </div>
        </div>

        <div className="field-group">
          <span className="field-label">Target pengisian</span>
          <div className="field-wrap">
            {mode === 'RUPIAH' && <span className="field-prefix">Rp</span>}
            <input
              type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
              className={`field ${mode === 'RUPIAH' ? 'has-prefix' : 'has-append'}`}
              style={{ fontSize: 18, fontWeight: 700 }}
            />
            {mode === 'KWH' && <span className="field-append pointer-none mono" style={{ fontWeight: 700 }}>kWh</span>}
          </div>
          <p className="field-msg-hint">
            {mode === 'KWH' ? 'Daya berhenti otomatis saat energi (kWh) tercapai.' : 'Daya berhenti otomatis saat nilai rupiah tercapai.'}
          </p>
        </div>

        <Button loading={starting} onClick={start} className="btn-block" style={{ minHeight: 52 }}>
          <Zap size={16} /> Mulai pengisian
        </Button>
      </Card>

      {/* Telemetri */}
      <Card style={{ padding: '1.5rem', position: 'relative', minHeight: 420, overflow: 'hidden' }}>
        <div className="telem-head">
          <span className="section-label">
            <span className="badge-dot dot-live" style={{ background: 'var(--accent-hi)', width: 8, height: 8 }} /> Telemetri langsung
          </span>
          <Badge variant={activeSession ? 'ready' : 'muted'} dot={!!activeSession}>{activeSession ? 'Terhubung' : 'Idle'}</Badge>
        </div>

        {activeSession ? (
          <>
            <ChargingVisual
              voltage={live.voltage}
              current={live.current}
              power={live.power}
              consumedKwh={live.consumedKwh}
              cost={live.cost}
              progress={live.progress}
              target={target}
              active
            />

            <div className="spark-card">
              <div className="spark-head">
                <span>Arus konektor · realtime</span>
                <span style={{ color: 'var(--accent-hi)' }}>{metric(live.current, 1)} A</span>
              </div>
              <Sparkline data={spark} />
            </div>

            <div className="telem-foot">
              <span className="mono" style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Target size={14} color="var(--text-faint)" /> Target <b className="chip-mono">{metric(target, 2)} kWh</b>
                <span style={{ color: 'var(--text-faint)' }}>·</span>
                Biaya <b className="chip-mono" style={{ color: 'var(--accent-hi)' }}>{rupiah(live.cost)}</b>
              </span>
              <Button variant="danger" loading={stopping} onClick={stop} style={{ minHeight: 44 }}>
                <Square size={14} /> Hentikan
              </Button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.1rem', minHeight: 320, textAlign: 'center' }}>
            <div className="standby-tile"><Radio size={30} /></div>
            <div>
              <p className="grotesk" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontSize: 14 }}>Siaga — menunggu perintah</p>
              <p className="mono" style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 6 }}>Pilih channel lalu tekan Mulai pengisian</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============================ HISTORY ============================ */
function HistoryPanel() {
  const [logs, setLogs] = useState(null);
  const toast = useToast();

  useEffect(() => {
    api.get('/transactions').then(setLogs).catch((err) => { toast(err.message, { type: 'error' }); setLogs([]); });
  }, [toast]);

  const totalTopup = (logs || []).filter((l) => l.type === 'TOPUP').reduce((s, l) => s + Number(l.amount), 0);
  const totalCharge = (logs || []).filter((l) => l.type === 'CHARGING_FEE').reduce((s, l) => s + Number(l.amount), 0);
  const energy = totalCharge / PRICE;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <StatCard icon={Wallet} accent="pos" label="Total isi saldo" value={rupiah(totalTopup)} />
        <StatCard icon={Zap} accent="accent" label="Total pengisian" value={rupiah(totalCharge)} />
        <StatCard icon={BatteryCharging} accent="cyan" label="Energi total" value={`${metric(energy, 1)} kWh`} />
      </div>

      <Card style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr><th>Waktu</th><th>Jenis</th><th>Nominal</th><th>Keterangan</th></tr>
            </thead>
            <tbody>
              {logs === null &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={4}><Skeleton height={20} /></td></tr>
                ))}
              {logs?.map((log) => {
                const isTop = log.type === 'TOPUP';
                return (
                  <tr key={log.id}>
                    <td className="mono" style={{ fontSize: 12.5 }}>{datetime(log.created_at)}</td>
                    <td>
                      <Badge variant={isTop ? 'pos' : 'accent'}>
                        {isTop ? <><Wallet size={11} /> Isi saldo</> : <><Zap size={11} /> Pengisian</>}
                      </Badge>
                    </td>
                    <td className="mono" style={{ fontWeight: 700, color: isTop ? 'var(--positive)' : 'var(--danger)' }}>
                      {isTop ? '+ ' : '− '}{rupiah(log.amount)}
                    </td>
                    <td className="mono" style={{ fontSize: 12.5 }}>{log.description || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {logs?.length === 0 && (
          <EmptyState icon={ReceiptText} title="Belum ada transaksi" description="Mulai pengisian pertama Anda untuk melihat riwayat di sini." />
        )}
      </Card>
    </div>
  );
}

/* ============================ PROFILE ============================ */
function ProfilePanel({ onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/user/profile').then((d) => setForm(d.user)).catch((err) => toast(err.message, { type: 'error' }));
  }, [toast]);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { full_name, username, npk, phone, email } = form;
      await api.put('/user/profile', { full_name, username, npk, phone, email });
      toast('Profil berhasil diperbarui.', { type: 'success' });
      onSaved?.();
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <Card style={{ padding: '1.5rem', maxWidth: '48rem' }}><Skeleton height={300} /></Card>;

  return (
    <Card style={{ padding: '1.5rem', maxWidth: '48rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.25rem' }}>
        <div className="stat-ic stat-ic-accent" style={{ width: '3rem', height: '3rem' }}><User size={22} /></div>
        <div className="min-w-0">
          <h2 className="grotesk" style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{form.email}</h2>
          <p className="mono" style={{ fontSize: 12, color: 'var(--positive)', display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <CheckCircle2 size={13} /> Akun terverifikasi · {form.status}
          </p>
        </div>
      </div>

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p className="section-label">Perbarui data akun</p>
        <div className="reg-grid">
          <Input label="Nama lengkap" name="full_name" value={form.full_name || ''} onChange={onChange} />
          <Input label="Nama pengguna" name="username" value={form.username || ''} onChange={onChange} />
          <Input label="Nomor NPK (terkunci)" name="npk" value={form.npk || ''} readOnly style={{ cursor: 'not-allowed', color: 'var(--text-faint)', background: 'var(--surface-3)' }} />
          <Input label="Nomor telepon" name="phone" type="tel" value={form.phone || ''} onChange={onChange} />
        </div>
        <Input label="Alamat email" name="email" type="email" value={form.email || ''} onChange={onChange} />
        <Button type="submit" loading={saving} style={{ minHeight: 46, alignSelf: 'flex-start', paddingInline: '1.5rem' }}>
          <Save size={15} /> Simpan perubahan
        </Button>
      </form>
    </Card>
  );
}

/* ============================ TOPUP MODAL ============================ */
function TopupModal({ open, onClose, onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const val = Number(amount);
    if (!val || val <= 0) return toast('Masukkan nominal yang valid.', { type: 'warning' });
    setLoading(true);
    try {
      await api.post('/user/topup', { amount: val });
      toast('Permintaan isi saldo terkirim. Menunggu persetujuan admin.', { type: 'success', title: 'Permintaan terkirim' });
      setAmount('');
      onClose();
      onDone();
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajukan Isi Saldo"
      icon={Wallet}
      footer={<Button className="btn-block" loading={loading} onClick={submit} style={{ minHeight: 48 }}><CheckCircle2 size={16} /> Kirim permintaan</Button>}
    >
      <p className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Permintaan akan ditinjau admin sebelum saldo ditambahkan.
      </p>
      <Input label="Nominal (Rp)" type="number" min="1" placeholder="cth. 50000" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ fontSize: 18, fontWeight: 700 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {[20000, 50000, 100000].map((v) => (
          <Button key={v} variant="ghost" onClick={() => setAmount(String(v))} style={{ minHeight: 40, fontSize: 12.5 }}>
            {rupiah(v).replace('Rp ', 'Rp')}
          </Button>
        ))}
      </div>
    </Modal>
  );
}
