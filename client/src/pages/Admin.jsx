import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LayoutDashboard, Users, ScrollText, Wallet, Zap, TrendingUp, UserCheck,
  Plug, Power, Ban, CheckCircle2, Search, PlusCircle, ReceiptText, X, Check,
  BarChart3, Clock, Leaf, Trophy, Gauge, Download, ListFilter, Activity,
  MapPin, Pencil, Trash2, ExternalLink,
  Cpu, Wifi, WifiOff, Thermometer, AlertTriangle, RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  ComposedChart, Bar, Line, BarChart, Cell,
} from 'recharts';
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
import { api } from '../lib/api';
import { rupiah, number, datetime, dateShort, timeAgo } from '../lib/format';
import { getSocket } from '../lib/socket';
import { useToast } from '../context/ToastProvider';
import '../styles/admin.css';

// Rating daya per kanal (tampilan) — DB tidak menyimpan kolom ini.
const CH_POWER = [150, 150, 60];

// Animasi recharts dimatikan bila pengguna meminta reduced motion (aksesibilitas).
const REDUCE_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ANIM = !REDUCE_MOTION;

// Warna seri grafik — selalu lewat CSS var agar konsisten tema gelap/terang.
const C_ACCENT = 'var(--accent)';
const C_CYAN = 'var(--cyan)';
const C_POS = 'var(--positive)';
const C_WARN = 'var(--warning)';

const NAV = [
  { id: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analitik', icon: BarChart3 },
  { id: 'devices', label: 'Mesin SPKLU', icon: Cpu },
  { id: 'stations', label: 'Lokasi SPKLU', icon: MapPin },
  { id: 'users', label: 'Manajemen user', icon: Users },
  { id: 'logs', label: 'Log aktivitas', icon: ScrollText },
];
const SUBTITLES = {
  overview: 'Metrik & status kanal realtime',
  analytics: 'Analisis energi, pendapatan & utilisasi',
  devices: 'Monitor & kontrol mesin pengisian fisik',
  stations: 'Kelola titik & detail lokasi SPKLU',
  users: 'Kelola akun & deposit pelanggan',
  logs: 'Audit transaksi sistem',
};

export default function Admin() {
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    getSocket().emit('join_admin');
  }, []);

  return (
    <AppLayout
      brandSub="Dashboard Admin"
      navItems={NAV}
      activeTab={tab}
      onTab={setTab}
      title={NAV.find((n) => n.id === tab)?.label}
      subtitle={SUBTITLES[tab]}
      userSub="Admin · dashboard"
    >
      {tab === 'overview' && <Overview />}
      {tab === 'analytics' && <AnalyticsPanel />}
      {tab === 'devices' && <DevicesPanel />}
      {tab === 'stations' && <StationsAdminPanel />}
      {tab === 'users' && <UsersPanel />}
      {tab === 'logs' && <LogsPanel />}
    </AppLayout>
  );
}

/* ====================== TOOLTIP RECHARTS BERSAMA ======================
   Tooltip kustom bergaya kartu Aurora; dipakai semua grafik analitik.   */
function ChartTip({ active, payload, label, fmt }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="admin-tip">
      {label != null && <div className="admin-tip-label">{label}</div>}
      {payload.map((p) => (
        <div className="admin-tip-row" key={p.dataKey}>
          <span className="admin-tip-dot" style={{ background: p.color || p.fill || p.stroke }} />
          <span>{p.name}</span>
          <span className="admin-tip-val">{fmt ? fmt(p.value, p.dataKey) : number(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ============================ OVERVIEW ============================ */
function Overview() {
  const toast = useToast();
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    api.get('/admin/dashboard').then(setData).catch((err) => toast(err.message, { type: 'error' }));
  }, [toast]);

  useEffect(() => {
    load();
    const socket = getSocket();
    const onUpdate = () => load();
    socket.on('admin_metrics_update', onUpdate);
    const poll = setInterval(load, 5000);
    return () => { socket.off('admin_metrics_update', onUpdate); clearInterval(poll); };
  }, [load]);

  const overrideStop = async (sessionId) => {
    try {
      await api.post('/admin/channel/override-stop', { sessionId });
      toast('Intervensi berhasil — konektor diputus paksa.', { type: 'success' });
      load();
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  };

  const decide = async (id, action) => {
    try {
      await api.post(`/admin/topup-requests/${id}/${action}`);
      toast(action === 'approve' ? 'Permintaan disetujui — saldo ditambahkan.' : 'Permintaan ditolak.', { type: 'success' });
      load();
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  };

  if (!data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="stat-row">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={96} />)}</div>
        <Skeleton height={280} />
      </div>
    );
  }

  const chart = (data.trend || []).map((t) => ({ day: dateShort(t.day), total: Number(t.total) }));
  const chartTotal = (data.trend || []).reduce((s, t) => s + Number(t.total), 0);
  const requests = data.topupRequests || [];
  const channels = data.channels || [];
  const activeCh = channels.filter((c) => c.status === 'CHARGING').length;
  // Utilisasi kanal saat ini (monitoring cepat): persen kanal yang sedang mengisi.
  const utilPct = channels.length ? Math.round((activeCh / channels.length) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="stat-row">
        <StatCard icon={Wallet} accent="pos" label="Total pendapatan" value={rupiah(data.totalRevenue)} sub="dari biaya pengisian" />
        <StatCard icon={TrendingUp} accent="cyan" label="Total top up" value={rupiah(data.totalTopup)} sub="deposit masuk" />
        <StatCard icon={UserCheck} accent="accent" label="Total pengguna" value={number(data.totalUsers)} sub="akun pelanggan" />
        <StatCard icon={Zap} accent="warn" label="Sesi aktif" value={number(data.activeSessions)} sub={`utilisasi ${utilPct}%`} />
      </div>

      {/* Antrean permintaan isi saldo */}
      {requests.length > 0 && (
        <Card style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <h2 className="panel-head"><Wallet size={16} /> Permintaan isi saldo</h2>
            <Badge variant="warn">{requests.length} menunggu</Badge>
          </div>
          <div className="req-list">
            {requests.map((r) => (
              <div className="req-row" key={r.id}>
                <span className="req-av">{(r.full_name || r.username || '?').charAt(0).toUpperCase()}</span>
                <div className="min-w-0">
                  <p className="grotesk" style={{ fontWeight: 600, color: 'var(--text)' }}>{r.full_name}</p>
                  <p className="mono" style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>@{r.username} · {timeAgo(r.created_at)}</p>
                </div>
                <span className="req-amt">{rupiah(r.amount)}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button variant="ghost" onClick={() => decide(r.id, 'reject')} style={{ minHeight: 36, fontSize: 12, padding: '0 0.8rem' }}><X size={13} /> Tolak</Button>
                  <Button onClick={() => decide(r.id, 'approve')} style={{ minHeight: 36, fontSize: 12, padding: '0 0.9rem' }}><Check size={13} /> Terima</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tren pendapatan */}
      <Card style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 className="panel-head"><TrendingUp size={16} /> Tren pendapatan · 7 hari</h2>
          {chartTotal > 0 && <Badge variant="pos">{rupiah(chartTotal)}</Badge>}
        </div>
        {chart.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Belum ada data pendapatan" description="Grafik akan muncul setelah ada transaksi pengisian." />
        ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <AreaChart data={chart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2ee6c5" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#2ee6c5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: 'var(--text-faint)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-faint)', fontSize: 11 }} axisLine={false} tickLine={false} width={64}
                  tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-mid)', borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: 'var(--text)' }}
                  formatter={(v) => [rupiah(v), 'Pendapatan']}
                />
                <Area type="monotone" dataKey="total" stroke="#2ee6c5" strokeWidth={2} fill="url(#rev)" isAnimationActive={ANIM} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Monitor kanal — terintegrasi pemilihan titik SPKLU */}
      <MonitorPanel channels={channels} stations={data.stations || []} onOverrideStop={overrideStop} />
    </div>
  );
}

/* ============== MONITOR KANAL PER-SPKLU ==============
   Pemilih titik SPKLU → kartu kanal disusun dari kombinasi:
   - kanal NYATA milik stasiun (sesi live + intervensi putus paksa), dan
   - konektor TURUNAN dari metadata stasiun (jumlah/ketersediaan, daya, tipe).
   Pilihan "Semua SPKLU" menampilkan seluruh kanal nyata (monitor global).   */
function MonitorPanel({ channels, stations, onOverrideStop }) {
  const [selectedId, setSelectedId] = useState('ALL');

  const stationList = stations || [];
  const selectedStation =
    selectedId === 'ALL' ? null : stationList.find((s) => String(s.id) === String(selectedId)) || null;

  let slots;
  if (!selectedStation) {
    // Semua SPKLU → seluruh kanal nyata (perilaku monitor global lama).
    slots = channels.map((c, i) => ({
      kind: 'real',
      channel: c,
      label: `CH-${String(i + 1).padStart(2, '0')}`,
      powerKw: Number(c.station_power_kw) || CH_POWER[i] || 150,
    }));
  } else {
    // Per-stasiun → kanal nyata stasiun + konektor turunan dari metadata.
    const real = channels.filter((c) => String(c.station_id) === String(selectedStation.id));
    const connectors = Number(selectedStation.connectors) || real.length;
    const available = Math.max(0, Math.min(Number(selectedStation.available), connectors));
    const realBusy = real.filter((c) => c.status === 'CHARGING').length;
    const derivedCount = Math.max(0, connectors - real.length);
    const metaBusy = Math.max(0, connectors - available);
    const derivedBusy = Math.min(Math.max(0, metaBusy - realBusy), derivedCount);

    slots = [
      ...real.map((c) => ({
        kind: 'real',
        channel: c,
        label: `CH-${String(c.id).padStart(2, '0')}`,
        powerKw: Number(c.station_power_kw) || Number(selectedStation.powerKw) || 150,
      })),
      ...Array.from({ length: derivedCount }, (_, i) => ({
        kind: 'derived',
        busy: i < derivedBusy,
        label: `K-${String(i + 1).padStart(2, '0')}`,
        powerKw: Number(selectedStation.powerKw) || 150,
        type: selectedStation.type,
      })),
    ];
  }

  const total = slots.length;
  const activeCount = slots.filter((s) =>
    s.kind === 'real' ? s.channel.status === 'CHARGING' : s.busy
  ).length;

  return (
    <div>
      <div className="spklu-monitor-head">
        <h2 className="panel-head"><Plug size={16} /> Monitor kanal pengisian</h2>
        <Badge variant="muted">{activeCount} dari {total} aktif</Badge>
        <div className="spklu-picker">
          <Select id="spklu-monitor" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="ALL">Semua SPKLU</option>
            {stationList.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>
      </div>

      {selectedStation && (
        <div className="spklu-meta">
          <span><MapPin size={13} /> {selectedStation.city}</span>
          <span><Zap size={13} /> {number(selectedStation.powerKw)} kW</span>
          <span><Plug size={13} /> {selectedStation.type}</span>
          <span><Gauge size={13} /> Kapasitas {number(Number(selectedStation.powerKw) * Number(selectedStation.connectors))} kW</span>
          <Badge variant={ST_STATUS_VARIANT[selectedStation.status] || 'muted'} dot={selectedStation.status === 'ONLINE'}>
            {ST_STATUS_LABEL[selectedStation.status] || selectedStation.status}
          </Badge>
        </div>
      )}

      {total === 0 ? (
        <EmptyState icon={Plug} title="Belum ada kanal" description="SPKLU ini belum memiliki konektor terdaftar." />
      ) : (
        <div className="channel-monitor">
          {slots.map((slot, i) => {
            if (slot.kind === 'real') {
              const c = slot.channel;
              const charging = c.status === 'CHARGING';
              const pct = charging && c.target_kwh
                ? Math.min(100, (Number(c.consumed_kwh) / Number(c.target_kwh)) * 100) : 0;
              return (
                <Card key={`real-${c.id}`} style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Plug size={16} color={charging ? 'var(--accent-hi)' : 'var(--text-faint)'} />
                      <b className="grotesk" style={{ color: 'var(--text)' }}>{slot.label}</b>
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{slot.powerKw}kW</span>
                    </span>
                    <Badge variant={charging ? 'busy' : 'ready'} dot>{charging ? 'Mengisi' : 'Siap'}</Badge>
                  </div>
                  {charging ? (
                    <>
                      <p className="mono" style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.current_user_name || c.current_user_email || 'Pengguna'}
                      </p>
                      <div className="progress-track" style={{ height: 6 }}>
                        <div className="progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--text-faint)' }}>
                        <span>{number(c.consumed_kwh, 1)} / {number(c.target_kwh, 1)} kWh</span>
                        <span style={{ color: 'var(--accent-hi)' }}>{Math.round(pct)}%</span>
                      </div>
                      <Button variant="danger" onClick={() => onOverrideStop(c.current_session_id)} style={{ minHeight: 38, fontSize: 12 }}>
                        <Power size={13} /> Putus paksa konektor
                      </Button>
                    </>
                  ) : (
                    <p className="mono" style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Kanal idle — siap digunakan.</p>
                  )}
                </Card>
              );
            }
            // Kartu turunan dari metadata konektor stasiun (tanpa sesi live).
            return (
              <Card key={`derived-${i}`} style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Plug size={16} color={slot.busy ? 'var(--warning)' : 'var(--text-faint)'} />
                    <b className="grotesk" style={{ color: 'var(--text)' }}>{slot.label}</b>
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{slot.powerKw}kW · {slot.type}</span>
                  </span>
                  <Badge variant={slot.busy ? 'busy' : 'ready'} dot>{slot.busy ? 'Terpakai' : 'Siap'}</Badge>
                </div>
                <p className="mono" style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                  {slot.busy ? 'Konektor terpakai — status dari data SPKLU.' : 'Konektor idle — siap digunakan.'}
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================ ANALITIK ============================ */
const RANGE_OPTIONS = [7, 14, 30];

function AnalyticsPanel() {
  const toast = useToast();
  const [range, setRange] = useState(14);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((days) => {
    setLoading(true);
    api.get(`/admin/analytics?days=${days}`)
      .then(setData)
      .catch((err) => { toast(err.message, { type: 'error' }); setData(null); })
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => { load(range); }, [load, range]);

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="admin-kpi-row">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={96} />)}</div>
        <Skeleton height={300} />
        <div className="admin-grid-2"><Skeleton height={280} /><Skeleton height={280} /></div>
      </div>
    );
  }

  const t = data?.totals || {};
  const energyByDay = (data?.energyByDay || []).map((d) => ({
    day: dateShort(d.day), kwh: Number(d.kwh), sessions: Number(d.sessions),
  }));
  // Gabungkan pendapatan & top-up per hari berdasarkan tanggal untuk chart komparasi.
  const revMap = new Map((data?.revenueByDay || []).map((d) => [d.day, Number(d.total)]));
  const topMap = new Map((data?.topupByDay || []).map((d) => [d.day, Number(d.total)]));
  const allDays = Array.from(new Set([...revMap.keys(), ...topMap.keys()])).sort();
  const revVsTop = allDays.map((day) => ({
    day: dateShort(day),
    revenue: revMap.get(day) || 0,
    topup: topMap.get(day) || 0,
  }));
  const byHour = (data?.byHour || []).map((h) => ({
    hour: Number(h.hour), kwh: Number(h.kwh), sessions: Number(h.sessions),
    label: `${String(h.hour).padStart(2, '0')}:00`,
  }));
  const peakKwh = byHour.reduce((m, h) => Math.max(m, h.kwh), 0);
  const channelUtil = (data?.channelUtil || []).map((c) => ({
    label: c.label, sessions: Number(c.sessions), kwh: Number(c.kwh),
  }));
  const topUsers = data?.topUsers || [];
  // Performa per SPKLU: label pendek (buang prefix "CMW SPKLU") untuk sumbu chart.
  const stationPerf = (data?.stationPerf || []).map((s) => ({
    ...s, short: (s.name || '').replace(/^CMW SPKLU\s*/i, ''),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Pemilih rentang + judul */}
      <div className="admin-chart-head" style={{ marginBottom: 0 }}>
        <h2 className="panel-head"><BarChart3 size={16} /> Analitik {range} hari terakhir</h2>
        <div className="admin-range" role="group" aria-label="Rentang hari">
          {RANGE_OPTIONS.map((d) => (
            <button key={d} type="button" className={d === range ? 'on' : ''} onClick={() => setRange(d)} aria-pressed={d === range}>
              {d} hari
            </button>
          ))}
        </div>
      </div>

      {/* KPI utama */}
      <div className="admin-kpi-row">
        <StatCard icon={Zap} accent="accent" label="Energi tersalur" value={`${number(t.energyKwh, 1)} kWh`} sub={`${range} hari`} />
        <StatCard icon={Activity} accent="cyan" label="Total sesi" value={number(t.sessions)} sub="pengisian selesai" />
        <StatCard icon={Wallet} accent="pos" label="Pendapatan" value={rupiah(t.revenue)} sub="biaya pengisian" />
        <StatCard icon={Gauge} accent="warn" label="Rata-rata / sesi" value={`${number(t.avgSessionKwh, 1)} kWh`} sub="energi per sesi" />
        <StatCard icon={Leaf} accent="pos" label="CO2 dihemat" value={`${number(t.co2SavedKg, 1)} kg`} sub="estimasi" />
      </div>

      {/* Energi tersalur per hari + sesi sekunder */}
      <Card style={{ padding: '1.5rem' }}>
        <div className="admin-chart-head">
          <h2 className="panel-head"><Zap size={16} /> Energi tersalur per hari</h2>
          <div className="admin-legend">
            <span><i style={{ background: 'var(--accent)' }} /> kWh</span>
            <span><i style={{ background: 'var(--cyan)' }} /> Sesi</span>
          </div>
        </div>
        {energyByDay.length === 0 ? (
          <EmptyState icon={Zap} title="Belum ada data energi" description="Grafik akan muncul setelah ada sesi pengisian." />
        ) : (
          <div className="admin-chart">
            <ResponsiveContainer>
              <ComposedChart data={energyByDay} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="energy" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2ee6c5" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#2ee6c5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: 'var(--text-faint)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="l" tick={{ fill: 'var(--text-faint)', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                <YAxis yAxisId="r" orientation="right" tick={{ fill: 'var(--text-faint)', fontSize: 11 }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                <Tooltip content={<ChartTip fmt={(v, k) => (k === 'kwh' ? `${number(v, 1)} kWh` : `${number(v)} sesi`)} />} />
                <Area yAxisId="l" type="monotone" dataKey="kwh" name="kWh" stroke={C_ACCENT} strokeWidth={2} fill="url(#energy)" isAnimationActive={ANIM} />
                <Line yAxisId="r" type="monotone" dataKey="sessions" name="Sesi" stroke={C_CYAN} strokeWidth={2} dot={false} isAnimationActive={ANIM} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="admin-grid-2">
        {/* Pendapatan vs Top-up */}
        <Card style={{ padding: '1.5rem' }}>
          <div className="admin-chart-head">
            <h2 className="panel-head"><TrendingUp size={16} /> Pendapatan vs Top-up</h2>
            <div className="admin-legend">
              <span><i style={{ background: 'var(--positive)' }} /> Pendapatan</span>
              <span><i style={{ background: 'var(--cyan)' }} /> Top-up</span>
            </div>
          </div>
          {revVsTop.length === 0 ? (
            <EmptyState icon={Wallet} title="Belum ada transaksi" description="Perbandingan akan muncul setelah ada arus kas." />
          ) : (
            <div className="admin-chart-sm">
              <ResponsiveContainer>
                <ComposedChart data={revVsTop} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'var(--text-faint)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-faint)', fontSize: 11 }} axisLine={false} tickLine={false} width={52}
                    tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                  <Tooltip content={<ChartTip fmt={(v) => rupiah(v)} />} />
                  <Bar dataKey="topup" name="Top-up" fill={C_CYAN} radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={ANIM} />
                  <Line type="monotone" dataKey="revenue" name="Pendapatan" stroke={C_POS} strokeWidth={2.5} dot={false} isAnimationActive={ANIM} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Jam sibuk */}
        <Card style={{ padding: '1.5rem' }}>
          <div className="admin-chart-head">
            <h2 className="panel-head"><Clock size={16} /> Jam sibuk (kWh)</h2>
            <Badge variant="muted">puncak {peakKwh > 0 ? `${number(peakKwh, 1)} kWh` : '—'}</Badge>
          </div>
          {byHour.length === 0 ? (
            <EmptyState icon={Clock} title="Belum ada data jam" description="Distribusi jam akan muncul setelah ada sesi." />
          ) : (
            <div className="admin-chart-sm">
              <ResponsiveContainer>
                <BarChart data={byHour} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fill: 'var(--text-faint)', fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
                  <YAxis tick={{ fill: 'var(--text-faint)', fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-2)' }}
                    content={<ChartTip fmt={(v, k) => (k === 'kwh' ? `${number(v, 1)} kWh` : `${number(v)} sesi`)} />}
                    labelFormatter={(h) => `${String(h).padStart(2, '0')}:00`}
                  />
                  <Bar dataKey="kwh" name="kWh" radius={[4, 4, 0, 0]} isAnimationActive={ANIM}>
                    {byHour.map((h) => (
                      // Sorot bar jam paling sibuk dengan warna aksen.
                      <Cell key={h.hour} fill={peakKwh > 0 && h.kwh === peakKwh ? C_ACCENT : 'var(--accent-lo)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="admin-grid-2">
        {/* Utilisasi kanal */}
        <Card style={{ padding: '1.5rem' }}>
          <div className="admin-chart-head">
            <h2 className="panel-head"><Plug size={16} /> Utilisasi kanal</h2>
            <div className="admin-legend">
              <span><i style={{ background: 'var(--accent)' }} /> Sesi</span>
              <span><i style={{ background: 'var(--cyan)' }} /> kWh</span>
            </div>
          </div>
          {channelUtil.length === 0 ? (
            <EmptyState icon={Plug} title="Belum ada utilisasi" description="Data akan muncul setelah kanal terpakai." />
          ) : (
            <div className="admin-chart-sm">
              <ResponsiveContainer>
                <BarChart data={channelUtil} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: 'var(--text-faint)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-2)' }}
                    content={<ChartTip fmt={(v, k) => (k === 'kwh' ? `${number(v, 1)} kWh` : `${number(v)} sesi`)} />}
                  />
                  <Bar dataKey="sessions" name="Sesi" fill={C_ACCENT} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={ANIM} />
                  <Bar dataKey="kwh" name="kWh" fill={C_CYAN} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={ANIM} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Pengguna teratas */}
        <Card style={{ overflow: 'hidden' }}>
          <div style={{ padding: '1.5rem 1.5rem 0' }}>
            <h2 className="panel-head"><Trophy size={16} /> Pengguna teratas</h2>
          </div>
          {topUsers.length === 0 ? (
            <EmptyState icon={Trophy} title="Belum ada pengguna aktif" description="Peringkat akan muncul setelah ada pengisian." />
          ) : (
            <div style={{ overflowX: 'auto', marginTop: '0.85rem' }}>
              <table className="table">
                <thead>
                  <tr><th>Pengguna</th><th style={{ textAlign: 'right' }}>Sesi</th><th style={{ textAlign: 'right' }}>kWh</th><th style={{ textAlign: 'right' }}>Belanja</th></tr>
                </thead>
                <tbody>
                  {topUsers.map((u, i) => (
                    <tr key={u.username || i}>
                      <td>
                        <p className="grotesk" style={{ fontWeight: 600, color: 'var(--text)' }}>{u.full_name || u.username}</p>
                        <p className="mono" style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>@{u.username}</p>
                      </td>
                      <td className="mono" style={{ textAlign: 'right' }}>{number(u.sessions)}</td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--accent-hi)' }}>{number(u.kwh, 1)}</td>
                      <td className="mono admin-rank-spent" style={{ textAlign: 'right' }}>{rupiah(u.spent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ===== Performa per titik SPKLU ===== */}
      <div className="admin-grid-2">
        {/* Energi tersalur per SPKLU (data sesi nyata) */}
        <Card style={{ padding: '1.5rem' }}>
          <div className="admin-chart-head">
            <h2 className="panel-head"><Zap size={16} /> Energi per SPKLU</h2>
            <Badge variant="muted">{stationPerf.length} titik</Badge>
          </div>
          {stationPerf.length === 0 ? (
            <EmptyState icon={MapPin} title="Belum ada stasiun" description="Tambahkan titik SPKLU di tab Lokasi SPKLU." />
          ) : (
            <div className="admin-chart-sm" style={{ height: Math.max(220, stationPerf.length * 34) }}>
              <ResponsiveContainer>
                <BarChart data={stationPerf} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: 'var(--text-faint)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="short" tick={{ fill: 'var(--text-muted)', fontSize: 10.5 }} axisLine={false} tickLine={false} width={108} />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-2)' }}
                    content={<ChartTip fmt={(v, k) => (k === 'kwh' ? `${number(v, 1)} kWh` : `${number(v)} sesi`)} />}
                  />
                  <Bar dataKey="kwh" name="kWh" fill={C_ACCENT} radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={ANIM} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Utilisasi konektor per SPKLU (kondisi terkini dari data stasiun) */}
        <Card style={{ padding: '1.5rem' }}>
          <div className="admin-chart-head">
            <h2 className="panel-head"><Gauge size={16} /> Utilisasi konektor per SPKLU</h2>
            <Badge variant="muted">terkini</Badge>
          </div>
          {stationPerf.length === 0 ? (
            <EmptyState icon={Gauge} title="Belum ada stasiun" description="Data utilisasi akan tampil di sini." />
          ) : (
            <div className="admin-chart-sm" style={{ height: Math.max(220, stationPerf.length * 34) }}>
              <ResponsiveContainer>
                <BarChart data={stationPerf} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: 'var(--text-faint)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="short" tick={{ fill: 'var(--text-muted)', fontSize: 10.5 }} axisLine={false} tickLine={false} width={108} />
                  <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTip fmt={(v) => `${number(v)}%`} />} />
                  <Bar dataKey="utilizationPct" name="Utilisasi" radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={ANIM}>
                    {stationPerf.map((s) => (
                      <Cell
                        key={s.stationId}
                        fill={s.status === 'OFFLINE' ? 'var(--text-faint)' : s.utilizationPct >= 80 ? C_WARN : C_ACCENT}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Rincian performa per SPKLU */}
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem 1.5rem 0' }}>
          <h2 className="panel-head"><MapPin size={16} /> Rincian performa per titik SPKLU</h2>
        </div>
        {stationPerf.length === 0 ? (
          <EmptyState icon={MapPin} title="Belum ada titik SPKLU" description="Tambahkan stasiun di tab Lokasi SPKLU untuk melihat performanya." />
        ) : (
          <div style={{ overflowX: 'auto', marginTop: '0.85rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Stasiun</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Konektor</th>
                  <th style={{ textAlign: 'right' }}>Daya</th>
                  <th style={{ textAlign: 'right' }}>Sesi</th>
                  <th style={{ textAlign: 'right' }}>Energi</th>
                  <th style={{ textAlign: 'right' }}>Pendapatan</th>
                  <th style={{ textAlign: 'right' }}>Utilisasi</th>
                </tr>
              </thead>
              <tbody>
                {stationPerf.map((s) => (
                  <tr key={s.stationId}>
                    <td>
                      <p className="grotesk" style={{ fontWeight: 600, color: 'var(--text)' }}>{s.short}</p>
                      <p className="mono" style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{s.city} · {s.type}</p>
                    </td>
                    <td><Badge variant={ST_STATUS_VARIANT[s.status] || 'muted'} dot={s.status === 'ONLINE'}>{ST_STATUS_LABEL[s.status] || s.status}</Badge></td>
                    <td className="mono" style={{ textAlign: 'right' }}>{number(s.busy)}/{number(s.connectors)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{number(s.powerKw)} kW</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{number(s.sessions)}</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--accent-hi)' }}>{number(s.kwh, 1)} kWh</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{rupiah(s.revenue)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{number(s.utilizationPct)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============================ MESIN SPKLU (GATEWAY ESP32) ============================
   Monitor & kontrol mesin pengisian fisik. Daftar mesin dari /admin/dashboard
   (devices), telemetri langsung per-konektor dari event socket 'device_state',
   umpan kejadian dari 'device_event'. Admin bisa: ganti mode (FREE/PAYMENT) dan
   clear fault per konektor. Lihat SPKLU_esp32/INTEGRATION.md untuk protokolnya. */

// state konektor (st): 0=IDLE 1=SELECT 2=CHARGING 3=DONE 4=FAULT 5=PAUSED
const DEV_ST = {
  0: { label: 'Idle', variant: 'muted' },
  1: { label: 'Pilih profil', variant: 'muted' },
  2: { label: 'Mengisi', variant: 'busy' },
  3: { label: 'Selesai', variant: 'ready' },
  4: { label: 'Gangguan', variant: 'neg' },
  5: { label: 'Jeda', variant: 'warn' },
};
// kode proteksi (pr): 0=OK selain itu = gangguan/keterangan
const DEV_PROT = {
  0: 'OK', 2: 'Arus lebih (OCP)', 4: 'Tegangan rendah (LVP)',
  7: 'Suhu lebih (OTP)', 13: 'Pengisian selesai',
};
const EVT_LABEL = {
  session_start: 'Sesi dimulai',
  session_stop: 'Sesi dihentikan',
  session_complete: 'Sesi selesai',
  cable_unplug: 'Kabel dicabut',
  fault: 'Gangguan',
  ocp_fault: 'Gangguan arus lebih',
  cleared: 'Fault dibersihkan',
  comm_recovered: 'Komunikasi pulih',
};
const EVT_VARIANT = {
  session_start: 'busy', session_complete: 'pos', session_stop: 'muted',
  cable_unplug: 'warn', fault: 'neg', ocp_fault: 'neg', cleared: 'ready', comm_recovered: 'ready',
};

function DevicesPanel() {
  const toast = useToast();
  const [devices, setDevices] = useState(null);
  const [stations, setStations] = useState([]); // untuk dropdown stasiun di form
  const [live, setLive] = useState({});   // { [deviceId]: { t, ch:[...] } } — telemetri terakhir
  const [events, setEvents] = useState([]); // umpan kejadian terbaru (maks 30)
  const [busy, setBusy] = useState(null);  // `${id}` saat ganti mode / `${id}:${ch}` saat clear
  const [editing, setEditing] = useState(null);  // null=tutup · {}=baru · device=ubah
  const [deleting, setDeleting] = useState(null); // mesin yang akan dihapus
  const [keyModal, setKeyModal] = useState(null); // { name, deviceKey, title, isNew }

  const load = useCallback(() => {
    api.get('/admin/dashboard')
      .then((d) => {
        setDevices(Array.isArray(d.devices) ? d.devices : []);
        setStations(Array.isArray(d.stations) ? d.stations : []);
      })
      .catch((err) => { toast(err.message, { type: 'error' }); setDevices([]); });
  }, [toast]);

  useEffect(() => {
    load();
    const socket = getSocket();
    socket.emit('join_admin');

    const onState = (p) => p && p.deviceId != null &&
      setLive((m) => ({ ...m, [p.deviceId]: { t: p.t, ch: Array.isArray(p.ch) ? p.ch : [] } }));
    const onEvent = (p) => {
      if (!p || !p.ev) return;
      setEvents((list) => [{ ...p, _at: Date.now() }, ...list].slice(0, 30));
    };
    const onMetrics = (p) => {
      const ev = p && p.event;
      if (['DEVICE_ONLINE', 'DEVICE_OFFLINE', 'DEVICE_MODE', 'DEVICE_ADDED', 'DEVICE_UPDATED', 'DEVICE_DELETED'].includes(ev)) load();
    };
    socket.on('device_state', onState);
    socket.on('device_event', onEvent);
    socket.on('admin_metrics_update', onMetrics);
    const poll = setInterval(load, 8000);
    return () => {
      socket.off('device_state', onState);
      socket.off('device_event', onEvent);
      socket.off('admin_metrics_update', onMetrics);
      clearInterval(poll);
    };
  }, [load]);

  const setMode = async (id, mode) => {
    setBusy(String(id));
    try {
      await api.post(`/admin/devices/${id}/mode`, { mode });
      toast(`Mode mesin diatur ke ${mode === 'ONLINE' ? 'PAYMENT' : 'FREE'}.`, { type: 'success' });
      load();
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const clearFault = async (id, ch) => {
    setBusy(`${id}:${ch}`);
    try {
      await api.post(`/admin/devices/${id}/clear`, { channel: ch });
      toast(`Perintah clear dikirim ke konektor ${ch}.`, { type: 'success' });
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const revealKey = async (d) => {
    try {
      const { deviceKey } = await api.get(`/admin/devices/${d.id}/key`);
      setKeyModal({ name: d.name, deviceKey, title: 'device_key mesin' });
    } catch (err) { toast(err.message, { type: 'error' }); }
  };

  const regenKey = async (d) => {
    try {
      const { deviceKey } = await api.post(`/admin/devices/${d.id}/regenerate-key`);
      setKeyModal({ name: d.name, deviceKey, title: 'device_key BARU', warn: true });
    } catch (err) { toast(err.message, { type: 'error' }); }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy('del');
    try {
      await api.del(`/admin/devices/${deleting.id}`);
      toast(`Mesin "${deleting.name}" dihapus.`, { type: 'success' });
      setDeleting(null);
      load();
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  if (!devices) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="stat-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={96} />)}
        </div>
        <Skeleton height={240} />
      </div>
    );
  }

  const onlineCount = devices.filter((d) => d.online).length;
  const paymentCount = devices.filter((d) => d.mode === 'ONLINE').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <StatCard icon={Cpu} accent="accent" label="Total mesin" value={number(devices.length)} sub="terdaftar" />
        <StatCard icon={Wifi} accent="pos" label="Mesin online" value={number(onlineCount)} sub="gateway terhubung" />
        <StatCard icon={Power} accent="cyan" label="Mode PAYMENT" value={number(paymentCount)} sub="butuh otorisasi bayar" />
      </div>

      <div className="dev-toolbar">
        <h2 className="panel-head"><Cpu size={16} /> Daftar mesin SPKLU</h2>
        <Button onClick={() => setEditing({})} style={{ minHeight: 42, fontSize: 12.5 }}>
          <PlusCircle size={14} /> Daftarkan mesin
        </Button>
      </div>

      {devices.length === 0 ? (
        <Card style={{ padding: '1.5rem' }}>
          <EmptyState
            icon={Cpu}
            title="Belum ada mesin terdaftar"
            description="Klik “Daftarkan mesin” untuk menambahkan mesin SPKLU fisik, pilih stasiun & jumlah konektornya. Anda akan mendapat device_key untuk dipasang di gateway (RasPi)."
          />
        </Card>
      ) : (
        devices.map((d) => (
          <DeviceCard
            key={d.id}
            device={d}
            live={live[d.id]}
            busy={busy}
            onSetMode={setMode}
            onClearFault={clearFault}
            onEdit={() => setEditing(d)}
            onDelete={() => setDeleting(d)}
            onRevealKey={() => revealKey(d)}
            onRegenKey={() => regenKey(d)}
          />
        ))
      )}

      {/* Umpan kejadian mesin (realtime) */}
      <Card style={{ padding: '1.25rem 1.5rem' }}>
        <h2 className="panel-head" style={{ marginBottom: '0.9rem' }}><Activity size={16} /> Kejadian mesin terbaru</h2>
        {events.length === 0 ? (
          <p className="mono" style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
            Belum ada kejadian sejak halaman dibuka. Event akan muncul saat sesi dimulai/selesai atau terjadi gangguan.
          </p>
        ) : (
          <div className="dev-evt-list">
            {events.map((e, i) => (
              <div className="dev-evt-row" key={`${e._at}-${i}`}>
                <Badge variant={EVT_VARIANT[e.ev] || 'muted'} dot>{EVT_LABEL[e.ev] || e.ev}</Badge>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Mesin #{e.deviceId}{e.ch != null ? ` · konektor ${e.ch}` : ''}
                  {e.kwh != null ? ` · ${number(e.kwh, 3)} kWh` : ''}
                  {e.sid ? ` · ${e.sid}` : ''}
                </span>
                <span className="mono dev-evt-time">{timeAgo(new Date(e._at).toISOString())}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Form daftar / ubah mesin */}
      <DeviceFormModal
        device={editing}
        stations={stations}
        onClose={() => setEditing(null)}
        onSaved={(created) => {
          setEditing(null);
          load();
          if (created && created.deviceKey) {
            setKeyModal({ name: created.name, deviceKey: created.deviceKey, title: 'Mesin terdaftar — device_key', isNew: true });
          }
        }}
      />

      {/* Konfirmasi hapus mesin */}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Hapus mesin"
        icon={Trash2}
        footer={
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            <Button variant="ghost" className="btn-block" onClick={() => setDeleting(null)} style={{ minHeight: 48 }}>Batal</Button>
            <Button variant="danger" className="btn-block" loading={busy === 'del'} onClick={confirmDelete} style={{ minHeight: 48 }}><Trash2 size={16} /> Hapus</Button>
          </div>
        }
      >
        {deleting && (
          <p className="mono" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Hapus mesin <b style={{ color: 'var(--text)' }}>{deleting.name}</b>? Kanal tanpa riwayat sesi
            ikut dihapus; yang punya riwayat dilepas-petakan (audit tetap aman). Gateway harus offline.
          </p>
        )}
      </Modal>

      {/* Tampilan device_key (sekali lihat / salin) */}
      <Modal
        open={!!keyModal}
        onClose={() => setKeyModal(null)}
        title={keyModal?.title || 'device_key'}
        icon={Cpu}
        footer={<Button className="btn-block" onClick={() => setKeyModal(null)} style={{ minHeight: 48 }}>Selesai</Button>}
      >
        {keyModal && <DeviceKeyView name={keyModal.name} deviceKey={keyModal.deviceKey} isNew={keyModal.isNew} warn={keyModal.warn} />}
      </Modal>
    </div>
  );
}

// Tampilkan device_key dengan tombol salin. device_key = rahasia bersama gateway.
function DeviceKeyView({ name, deviceKey, isNew, warn }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(deviceKey);
      toast('device_key disalin ke clipboard.', { type: 'success' });
    } catch {
      toast('Gagal menyalin — salin manual.', { type: 'error' });
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      <p className="mono" style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
        Untuk mesin <b style={{ color: 'var(--text)' }}>{name}</b>. Pasang di file <code>gateway/.env</code>
        sebagai <code>DEVICE_KEY</code> pada perangkat (Raspberry Pi) yang tersambung ke ESP32.
      </p>
      <div className="dev-key-box">
        <code>{deviceKey}</code>
        <Button variant="ghost" onClick={copy} style={{ minHeight: 36, fontSize: 12, padding: '0 0.7rem' }}>Salin</Button>
      </div>
      {(isNew || warn) && (
        <p className="mono" style={{ fontSize: 11.5, color: 'var(--warning)' }}>
          ⚠ Simpan sekarang — demi keamanan, kunci hanya ditampilkan saat diminta. {warn ? 'Kunci lama langsung tidak berlaku; perbarui gateway.' : ''}
        </p>
      )}
    </div>
  );
}

function DeviceFormModal({ device, stations, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!(device && device.id != null);
  const [form, setForm] = useState({ name: '', stationId: '', connectors: 3 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!device) return;
    if (device.id != null) {
      setForm({ name: device.name || '', stationId: device.stationId ?? '', connectors: device.channels || 3 });
    } else {
      setForm({ name: '', stationId: stations[0]?.id ?? '', connectors: 3 });
    }
  }, [device, stations]);

  if (!device) return null;

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (!form.name.trim()) { toast('Nama mesin wajib diisi.', { type: 'error' }); return; }
    setBusy(true);
    try {
      const base = { name: form.name.trim(), stationId: form.stationId ? Number(form.stationId) : undefined };
      if (isEdit) {
        await api.put(`/admin/devices/${device.id}`, base);
        toast('Mesin diperbarui.', { type: 'success' });
        onSaved(null);
      } else {
        const res = await api.post('/admin/devices', { ...base, connectors: Number(form.connectors) });
        onSaved(res.device); // memicu modal device_key
      }
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!device}
      onClose={onClose}
      title={isEdit ? 'Ubah mesin' : 'Daftarkan mesin SPKLU'}
      icon={Cpu}
      footer={
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <Button variant="ghost" className="btn-block" onClick={onClose} style={{ minHeight: 48 }}>Batal</Button>
          <Button className="btn-block" loading={busy} onClick={submit} style={{ minHeight: 48 }}>
            {isEdit ? 'Simpan' : 'Daftarkan'}
          </Button>
        </div>
      }
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <Input
          label="Nama mesin"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="mis. CMW Charger #02 (XY12550S)"
        />
        <Select label="Stasiun SPKLU" value={form.stationId} onChange={(e) => setForm({ ...form, stationId: e.target.value })}>
          <option value="">— Tanpa stasiun —</option>
          {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        {!isEdit && (
          <div>
            <Select label="Jumlah konektor" value={form.connectors} onChange={(e) => setForm({ ...form, connectors: e.target.value })}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n} konektor</option>)}
            </Select>
            <p className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
              Membuat {form.connectors} kanal terpetakan ke konektor 1..{form.connectors} mesin. Tidak dapat diubah setelah dibuat.
            </p>
          </div>
        )}
      </form>
    </Modal>
  );
}

function DeviceCard({ device, live, busy, onSetMode, onClearFault, onEdit, onDelete, onRevealKey, onRegenKey }) {
  const d = device;
  // Konektor: pakai telemetri langsung bila ada; jika tidak, fallback ke jumlah kanal terdaftar.
  const liveCh = (live && Array.isArray(live.ch)) ? live.ch : [];
  const connectors = liveCh.length
    ? liveCh
    : Array.from({ length: Math.max(0, Number(d.channels) || 0) }, (_, i) => ({ ch: i + 1, st: null }));
  const modeBusy = busy === String(d.id);

  return (
    <Card style={{ padding: '1.4rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      {/* Header mesin */}
      <div className="dev-head">
        <span className="dev-head-id">
          <Cpu size={18} color={d.online ? 'var(--accent-hi)' : 'var(--text-faint)'} />
          <span>
            <b className="grotesk" style={{ color: 'var(--text)' }}>{d.name}</b>
            <span className="mono dev-head-meta">
              {d.stationName ? `${d.stationName}${d.stationCity ? ` · ${d.stationCity}` : ''}` : 'Belum terkait stasiun'}
              {d.fwInfo ? ` · ${d.fwInfo}` : ''}
            </span>
          </span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
            {d.lastSeenAt ? `terlihat ${timeAgo(d.lastSeenAt)}` : 'belum pernah online'}
          </span>
          <Badge variant={d.online ? 'pos' : 'muted'} dot={d.online}>
            {d.online ? 'Online' : 'Offline'}
          </Badge>
        </span>
      </div>

      {/* Aksi mesin: kunci gateway + ubah/hapus */}
      <div className="dev-actions">
        <Button variant="ghost" onClick={onRevealKey} style={{ minHeight: 34, fontSize: 12, padding: '0 0.7rem' }}>
          <Cpu size={13} /> Lihat / salin device_key
        </Button>
        <Button variant="ghost" onClick={onRegenKey} style={{ minHeight: 34, fontSize: 12, padding: '0 0.7rem' }}>
          <RefreshCw size={13} /> Buat ulang kunci
        </Button>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
          <Button variant="ghost" onClick={onEdit} style={{ minHeight: 34, fontSize: 12, padding: '0 0.7rem' }}><Pencil size={13} /> Ubah</Button>
          <Button variant="danger" onClick={onDelete} style={{ minHeight: 34, fontSize: 12, padding: '0 0.7rem' }}><Trash2 size={13} /> Hapus</Button>
        </span>
      </div>

      {/* Kontrol mode operasi */}
      <div className="dev-mode">
        <span className="dev-mode-label">Mode operasi</span>
        <div className="dev-mode-seg">
          <button
            className={d.mode === 'OFFLINE' ? 'on' : ''}
            disabled={modeBusy}
            onClick={() => d.mode !== 'OFFLINE' && onSetMode(d.id, 'OFFLINE')}
          >
            FREE
          </button>
          <button
            className={d.mode === 'ONLINE' ? 'on' : ''}
            disabled={modeBusy}
            onClick={() => d.mode !== 'ONLINE' && onSetMode(d.id, 'ONLINE')}
          >
            PAYMENT
          </button>
        </div>
        <span className="mono dev-mode-hint">
          {d.mode === 'ONLINE'
            ? 'START butuh otorisasi pembayaran dari website.'
            : 'START bebas di mesin tanpa pembayaran (uji/maintenance).'}
        </span>
        {!d.online && (
          <span className="mono dev-mode-warn"><WifiOff size={12} /> mesin offline — perintah dikirim saat tersambung</span>
        )}
      </div>

      {/* Konektor */}
      {connectors.length === 0 ? (
        <p className="mono" style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
          Belum ada konektor terpetakan ke mesin ini.
        </p>
      ) : (
        <div className="dev-conn-grid">
          {connectors.map((c) => {
            const st = c.st == null ? null : DEV_ST[Number(c.st)] || { label: `st${c.st}`, variant: 'muted' };
            const prot = Number(c.pr) || 0;
            const isFault = Number(c.st) === 4 || (prot !== 0 && prot !== 13);
            const cellBusy = busy === `${d.id}:${c.ch}`;
            const hasTele = d.online && c.st != null;
            return (
              <div className={`dev-conn ${isFault ? 'is-fault' : ''}`} key={c.ch}>
                <div className="dev-conn-top">
                  <span className="dev-conn-name"><Plug size={14} /> Konektor {c.ch}</span>
                  {st
                    ? <Badge variant={st.variant} dot={Number(c.st) === 2}>{st.label}</Badge>
                    : <Badge variant="muted">{d.online ? 'Menunggu' : 'Offline'}</Badge>}
                </div>

                {hasTele ? (
                  <>
                    <div className="dev-metrics">
                      <span><b>{number(c.v, 1)}</b> V</span>
                      <span><b>{number(c.i, 1)}</b> A</span>
                      <span><b>{number(c.p, 2)}</b> kW</span>
                    </div>
                    <div className="dev-metrics dev-metrics-sub">
                      <span><b>{number(c.kwh, 3)}</b> kWh</span>
                      <span><b>{rupiah(c.rp)}</b></span>
                      <span><b>{Math.floor((Number(c.sec) || 0) / 60)}m {(Number(c.sec) || 0) % 60}s</b></span>
                    </div>
                    <div className="dev-conn-foot">
                      <span className="mono dev-temp">
                        <Thermometer size={12} /> {number(c.tin, 1)}°C
                      </span>
                      {prot !== 0 && (
                        <span className={`mono dev-prot ${isFault ? 'bad' : ''}`}>
                          {isFault && <AlertTriangle size={12} />} {DEV_PROT[prot] || `kode ${prot}`}
                        </span>
                      )}
                      {c.auth ? <span className="mono dev-auth">terotorisasi{c.sid ? ` · ${c.sid}` : ''}</span> : null}
                    </div>
                  </>
                ) : (
                  <p className="mono dev-conn-idle">
                    {d.online ? 'Menunggu telemetri…' : 'Mesin offline.'}
                  </p>
                )}

                {isFault && (
                  <Button
                    variant="ghost"
                    loading={cellBusy}
                    disabled={!d.online}
                    onClick={() => onClearFault(d.id, c.ch)}
                    style={{ minHeight: 34, fontSize: 12, padding: '0 0.7rem', marginTop: 4 }}
                  >
                    <RefreshCw size={13} /> Clear fault
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ============================ LOKASI SPKLU ============================ */
const ST_STATUS = [
  { v: 'ONLINE', label: 'Online' },
  { v: 'BUSY', label: 'Sibuk' },
  { v: 'OFFLINE', label: 'Offline' },
];
const ST_TYPES = ['DC', 'AC', 'DC/AC'];
const ST_STATUS_VARIANT = { ONLINE: 'ready', BUSY: 'busy', OFFLINE: 'muted' };
const ST_STATUS_LABEL = { ONLINE: 'Online', BUSY: 'Sibuk', OFFLINE: 'Offline' };

// Nilai awal form untuk stasiun baru (semua string agar cocok input terkontrol).
const EMPTY_STATION = {
  name: '', address: '', city: '', lat: '', lng: '',
  status: 'ONLINE', connectors: '2', available: '0',
  powerKw: '60', type: 'DC', hours: '24 Jam',
};

function StationsAdminPanel() {
  const toast = useToast();
  const [stations, setStations] = useState(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);   // null=tutup · EMPTY_STATION=baru · {id,...}=ubah
  const [deleting, setDeleting] = useState(null);  // stasiun yang akan dihapus
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get('/stations')
      .then((d) => setStations(Array.isArray(d) ? d : []))
      .catch((err) => { toast(err.message, { type: 'error' }); setStations([]); });
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = (stations || []).filter(
    (s) => !q || `${s.name} ${s.city} ${s.address}`.toLowerCase().includes(q.toLowerCase())
  );

  const online = (stations || []).filter((s) => s.status === 'ONLINE').length;
  const totalConnectors = (stations || []).reduce((sum, s) => sum + (Number(s.connectors) || 0), 0);

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/admin/stations/${deleting.id}`);
      toast(`Stasiun "${deleting.name}" dihapus.`, { type: 'success' });
      setDeleting(null);
      load();
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Ringkasan */}
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <StatCard icon={MapPin} accent="accent" label="Total stasiun" value={number((stations || []).length)} sub="titik SPKLU" />
        <StatCard icon={Zap} accent="pos" label="Stasiun online" value={number(online)} sub="siap melayani" />
        <StatCard icon={Plug} accent="cyan" label="Total konektor" value={number(totalConnectors)} sub="seluruh stasiun" />
      </div>

      <Card style={{ overflow: 'hidden' }}>
        {/* Toolbar: cari + tambah */}
        <div style={{ padding: '1.1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h2 className="panel-head"><MapPin size={16} /> Lokasi SPKLU</h2>
          <div className="admin-toolbar">
            <div className="admin-search">
              <Input icon={Search} placeholder="Cari nama, kota, atau alamat…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Button onClick={() => setEditing(EMPTY_STATION)} style={{ minHeight: 42, fontSize: 12.5 }}>
              <PlusCircle size={14} /> Tambah stasiun
            </Button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Stasiun</th><th>Status</th><th>Konektor</th>
                <th>Daya / tipe</th><th>Jam</th><th style={{ textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {stations === null &&
                Array.from({ length: 5 }).map((_, i) => <tr key={i}><td colSpan={6}><Skeleton height={20} /></td></tr>)}
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td>
                    <p className="grotesk" style={{ fontWeight: 600, color: 'var(--text)' }}>{s.name}</p>
                    <p className="mono" style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{s.address}, {s.city}</p>
                  </td>
                  <td><Badge variant={ST_STATUS_VARIANT[s.status] || 'muted'} dot={s.status === 'ONLINE'}>{ST_STATUS_LABEL[s.status] || s.status}</Badge></td>
                  <td className="mono">{number(s.available)}/{number(s.connectors)}</td>
                  <td className="mono">{number(s.powerKw)} kW · {s.type}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{s.hours}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <Button variant="ghost" onClick={() => setEditing(s)} style={{ minHeight: 34, fontSize: 12, padding: '0 0.7rem' }}><Pencil size={13} /> Ubah</Button>
                      <Button variant="danger" onClick={() => setDeleting(s)} style={{ minHeight: 34, fontSize: 12, padding: '0 0.7rem' }}><Trash2 size={13} /> Hapus</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {stations && filtered.length === 0 && (
          <EmptyState icon={MapPin} title="Belum ada stasiun" description={q ? 'Tidak ada hasil untuk pencarian ini.' : 'Tambahkan titik SPKLU pertama Anda.'} />
        )}
      </Card>

      <StationFormModal
        station={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />

      {/* Konfirmasi hapus */}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Hapus stasiun"
        icon={Trash2}
        footer={
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            <Button variant="ghost" className="btn-block" onClick={() => setDeleting(null)} style={{ minHeight: 48 }}>Batal</Button>
            <Button variant="danger" className="btn-block" loading={busy} onClick={confirmDelete} style={{ minHeight: 48 }}><Trash2 size={16} /> Hapus</Button>
          </div>
        }
      >
        {deleting && (
          <p className="mono" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Yakin menghapus <b style={{ color: 'var(--text)' }}>{deleting.name}</b> ({deleting.city})? Tindakan ini tidak dapat dibatalkan.
          </p>
        )}
      </Modal>
    </div>
  );
}

function StationFormModal({ station, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_STATION);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  // Sinkronkan form tiap kali stasiun yang dibuka berubah (nilai jadi string).
  useEffect(() => {
    if (!station) return;
    setErrors({});
    setForm({
      name: station.name ?? '',
      address: station.address ?? '',
      city: station.city ?? '',
      lat: station.lat ?? '',
      lng: station.lng ?? '',
      status: station.status ?? 'ONLINE',
      connectors: String(station.connectors ?? '2'),
      available: String(station.available ?? '0'),
      powerKw: String(station.powerKw ?? '60'),
      type: station.type ?? 'DC',
      hours: station.hours ?? '24 Jam',
    });
  }, [station]);

  const isEdit = !!(station && station.id);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Pratinjau peta hanya bila koordinat valid.
  const latN = Number(form.lat);
  const lngN = Number(form.lng);
  const coordOk =
    form.lat !== '' && form.lng !== '' && !Number.isNaN(latN) && !Number.isNaN(lngN) &&
    latN >= -90 && latN <= 90 && lngN >= -180 && lngN <= 180;

  const submit = async () => {
    setLoading(true);
    setErrors({});
    const payload = {
      ...form,
      lat: Number(form.lat),
      lng: Number(form.lng),
      connectors: Number(form.connectors),
      available: Number(form.available),
      powerKw: Number(form.powerKw),
    };
    try {
      if (isEdit) {
        await api.put(`/admin/stations/${station.id}`, payload);
        toast(`Stasiun "${payload.name}" diperbarui.`, { type: 'success' });
      } else {
        await api.post('/admin/stations', payload);
        toast(`Stasiun "${payload.name}" ditambahkan.`, { type: 'success' });
      }
      onSaved();
    } catch (err) {
      if (err.errors) setErrors(err.errors);
      toast(err.message, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={!!station}
      onClose={onClose}
      wide
      title={isEdit ? 'Ubah stasiun' : 'Tambah stasiun'}
      icon={MapPin}
      footer={
        <Button className="btn-block" loading={loading} onClick={submit} style={{ minHeight: 48 }}>
          <CheckCircle2 size={16} /> {isEdit ? 'Simpan perubahan' : 'Tambah stasiun'}
        </Button>
      }
    >
      <div className="admin-form-grid">
        <div className="full">
          <Input label="Nama stasiun" value={form.name} onChange={set('name')} error={errors.name} placeholder="cth. CMW SPKLU Sudirman Hub" />
        </div>
        <div className="full">
          <Input label="Alamat" value={form.address} onChange={set('address')} error={errors.address} placeholder="Nama jalan, area" />
        </div>

        <Input label="Kota" value={form.city} onChange={set('city')} error={errors.city} placeholder="cth. Jakarta Selatan" />
        <Select label="Status" id="st-status" value={form.status} onChange={set('status')}>
          {ST_STATUS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </Select>

        <Select label="Tipe konektor" id="st-type" value={form.type} onChange={set('type')}>
          {ST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Input label="Daya (kW)" type="number" min="1" value={form.powerKw} onChange={set('powerKw')} error={errors.powerKw} placeholder="cth. 150" />

        <Input label="Lintang / lat" type="number" step="any" value={form.lat} onChange={set('lat')} error={errors.lat} placeholder="-6.224935" />
        <Input label="Bujur / lng" type="number" step="any" value={form.lng} onChange={set('lng')} error={errors.lng} placeholder="106.809204" />

        <div className="full">
          {coordOk ? (
            <>
              <div className="admin-map-preview">
                <iframe
                  title="Pratinjau lokasi stasiun"
                  loading="lazy"
                  src={`https://www.google.com/maps?q=${latN},${lngN}&z=15&output=embed`}
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: 8, minHeight: 38, fontSize: 12.5 }}
                onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${latN},${lngN}`, '_blank', 'noopener')}
              >
                <ExternalLink size={14} /> Buka di Google Maps
              </button>
            </>
          ) : (
            <p className="mono" style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              Masukkan koordinat lat & lng yang valid untuk melihat pratinjau peta.
            </p>
          )}
        </div>

        <Input label="Total konektor" type="number" min="1" value={form.connectors} onChange={set('connectors')} error={errors.connectors} placeholder="cth. 4" />
        <Input label="Konektor tersedia" type="number" min="0" value={form.available} onChange={set('available')} error={errors.available} hint="Otomatis dibatasi ≤ total konektor." placeholder="cth. 2" />

        <div className="full">
          <Input label="Jam operasional" value={form.hours} onChange={set('hours')} error={errors.hours} placeholder="cth. 24 Jam atau 06.00 - 22.00" />
        </div>
      </div>
    </Modal>
  );
}

/* ============================ USERS ============================ */
function UsersPanel() {
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState('');
  const [topupUser, setTopupUser] = useState(null);

  const load = useCallback(() => {
    api.get('/admin/users').then(setUsers).catch((err) => { toast(err.message, { type: 'error' }); setUsers([]); });
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (u) => {
    try {
      const res = await api.post(`/admin/users/${u.id}/toggle-status`);
      toast(res.message, { type: 'success' });
      load();
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  };

  const filtered = (users || []).filter(
    (u) => !q || `${u.full_name} ${u.username} ${u.email}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ padding: '1.1rem', borderBottom: '1px solid var(--border)' }}>
          <Input icon={Search} placeholder="Cari nama, username, atau email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr><th>Pengguna</th><th>Kontak</th><th>Saldo</th><th>Status</th><th style={{ textAlign: 'right' }}>Aksi</th></tr>
            </thead>
            <tbody>
              {users === null &&
                Array.from({ length: 4 }).map((_, i) => <tr key={i}><td colSpan={5}><Skeleton height={20} /></td></tr>)}
              {filtered.map((u) => {
                const active = u.status === 'ACTIVE';
                return (
                  <tr key={u.id}>
                    <td>
                      <p className="grotesk" style={{ fontWeight: 600, color: 'var(--text)' }}>{u.full_name}</p>
                      <p className="mono" style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>@{u.username} · {u.npk}</p>
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      <p>{u.email}</p>
                      <p style={{ color: 'var(--text-faint)' }}>{u.phone}</p>
                    </td>
                    <td className="mono" style={{ fontWeight: 700, color: 'var(--text)' }}>{rupiah(u.balance)}</td>
                    <td><Badge variant={active ? 'pos' : 'neg'} dot>{active ? 'Aktif' : 'Ditangguhkan'}</Badge></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Button variant="ghost" onClick={() => setTopupUser(u)} style={{ minHeight: 34, fontSize: 12, padding: '0 0.7rem' }}>
                          <PlusCircle size={13} /> Top up
                        </Button>
                        <Button variant={active ? 'danger' : 'primary'} onClick={() => toggle(u)} style={{ minHeight: 34, fontSize: 12, padding: '0 0.7rem' }}>
                          {active ? <><Ban size={13} /> Suspend</> : <><CheckCircle2 size={13} /> Aktifkan</>}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {users && filtered.length === 0 && (
          <EmptyState icon={Users} title="Tidak ada pengguna" description={q ? 'Tidak ada hasil untuk pencarian ini.' : 'Belum ada pelanggan terdaftar.'} />
        )}
      </Card>

      <AdminTopupModal user={topupUser} onClose={() => setTopupUser(null)} onDone={load} />
    </>
  );
}

function AdminTopupModal({ user, onClose, onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { setAmount(''); }, [user]);

  const submit = async () => {
    const val = Number(amount);
    if (!val || val <= 0) return toast('Masukkan nominal yang valid.', { type: 'warning' });
    setLoading(true);
    try {
      await api.post('/admin/topup', { username: user.username, amount: val });
      toast(`Saldo ${user.username} bertambah ${rupiah(val)}.`, { type: 'success' });
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
      open={!!user}
      onClose={onClose}
      title="Top Up Manual"
      icon={Wallet}
      footer={<Button className="btn-block" loading={loading} onClick={submit} style={{ minHeight: 48 }}><CheckCircle2 size={16} /> Tambahkan saldo</Button>}
    >
      {user && (
        <p className="mono" style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Penerima: <b style={{ color: 'var(--text)' }}>{user.full_name}</b> (@{user.username}) — saldo ditambahkan langsung.
        </p>
      )}
      <Input label="Nominal (Rp)" type="number" min="1" placeholder="cth. 100000" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ fontSize: 18, fontWeight: 700 }} />
    </Modal>
  );
}

/* ============================ LOGS ============================ */
const LOG_FILTERS = [
  { id: 'ALL', label: 'Semua' },
  { id: 'TOPUP', label: 'Top up' },
  { id: 'CHARGE', label: 'Pengisian' },
];

function LogsPanel() {
  const toast = useToast();
  const [logs, setLogs] = useState(null);
  const [type, setType] = useState('ALL');
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get('/admin/logs').then(setLogs).catch((err) => { toast(err.message, { type: 'error' }); setLogs([]); });
  }, [toast]);

  // Baris terfilter berdasarkan kategori + pencarian teks (username/deskripsi).
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (logs || []).filter((l) => {
      const isTop = l.kategori === 'TOPUP';
      if (type === 'TOPUP' && !isTop) return false;
      if (type === 'CHARGE' && isTop) return false;
      if (!term) return true;
      return `${l.username || ''} ${l.deskripsi || ''}`.toLowerCase().includes(term);
    });
  }, [logs, type, q]);

  // Ringkasan dihitung dari baris yang sedang ditampilkan (mengikuti filter).
  const summary = useMemo(() => {
    let topup = 0, charge = 0;
    for (const l of filtered) {
      if (l.kategori === 'TOPUP') topup += Number(l.nilai || 0);
      else charge += Number(l.nilai || 0);
    }
    return { topup, charge, net: topup - charge };
  }, [filtered]);

  // Ekspor CSV sisi-klien dari baris terfilter (Blob + anchor sementara).
  const exportCsv = () => {
    if (!filtered.length) return toast('Tidak ada baris untuk diekspor.', { type: 'warning' });
    const head = ['Waktu', 'Username', 'Kategori', 'Nilai', 'Deskripsi'];
    // Bungkus tiap sel & escape tanda kutip agar CSV valid.
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = filtered.map((l) => [
      datetime(l.waktu),
      `@${l.username || ''}`,
      l.kategori === 'TOPUP' ? 'Top up' : 'Pengisian',
      Number(l.nilai || 0),
      l.deskripsi || '',
    ].map(esc).join(','));
    // BOM agar Excel membaca UTF-8 dengan benar.
    const csv = '﻿' + [head.map(esc).join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `log-aktivitas-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(`${filtered.length} baris diekspor.`, { type: 'success' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Ringkasan transaksi (mengikuti filter aktif) */}
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <StatCard icon={TrendingUp} accent="cyan" label="Total top up" value={rupiah(summary.topup)} sub="deposit masuk" />
        <StatCard icon={Zap} accent="accent" label="Total pengisian" value={rupiah(summary.charge)} sub="biaya pengisian" />
        <StatCard icon={Wallet} accent={summary.net >= 0 ? 'pos' : 'warn'} label="Net (top up − isi)" value={rupiah(summary.net)} sub="selisih arus kas" />
      </div>

      <Card style={{ overflow: 'hidden' }}>
        {/* Toolbar: filter kategori + pencarian + ekspor */}
        <div style={{ padding: '1.1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h2 className="panel-head"><ScrollText size={16} /> Log aktivitas sistem</h2>
          <div className="admin-toolbar">
            <div className="admin-range" role="group" aria-label="Filter kategori">
              {LOG_FILTERS.map((f) => (
                <button key={f.id} type="button" className={type === f.id ? 'on' : ''} onClick={() => setType(f.id)} aria-pressed={type === f.id}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="admin-search">
              <Input icon={ListFilter} placeholder="Cari @username atau deskripsi…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Button variant="ghost" onClick={exportCsv} style={{ minHeight: 42, fontSize: 12.5 }}>
              <Download size={14} /> Ekspor CSV
            </Button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr><th>Waktu</th><th>Pengguna</th><th>Kategori</th><th>Nilai</th><th>Deskripsi</th></tr>
            </thead>
            <tbody>
              {logs === null &&
                Array.from({ length: 6 }).map((_, i) => <tr key={i}><td colSpan={5}><Skeleton height={20} /></td></tr>)}
              {filtered.map((l) => {
                const isTop = l.kategori === 'TOPUP';
                return (
                  <tr key={l.id}>
                    <td className="mono" style={{ fontSize: 12.5 }}>{datetime(l.waktu)}</td>
                    <td className="mono" style={{ fontSize: 12.5, color: 'var(--text)' }}>@{l.username}</td>
                    <td><Badge variant={isTop ? 'pos' : 'accent'}>{isTop ? 'Top up' : 'Pengisian'}</Badge></td>
                    <td className="mono" style={{ fontWeight: 700, color: 'var(--text)' }}>{rupiah(l.nilai)}</td>
                    <td className="mono" style={{ fontSize: 12.5 }}>{l.deskripsi || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {logs && filtered.length === 0 && (
          <EmptyState
            icon={ReceiptText}
            title="Belum ada aktivitas"
            description={q || type !== 'ALL' ? 'Tidak ada hasil untuk filter ini.' : 'Log transaksi sistem akan tampil di sini.'}
          />
        )}
      </Card>
    </div>
  );
}
