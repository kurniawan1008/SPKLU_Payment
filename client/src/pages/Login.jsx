import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Lock, ArrowRight, Zap, Activity, Shield } from 'lucide-react';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import ThemeToggle from '../components/ui/ThemeToggle';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthProvider';
import { useToast } from '../context/ToastProvider';

// Kredensial demo — buat akun ini lalu (untuk admin) jadikan ADMIN di DB.
const DEMO = {
  user: { email: 'demo@cmwcharging.com', password: 'demo1234' },
  admin: { email: 'admin@cmwcharging.com', password: 'admin1234' },
};

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const doLogin = async (creds) => {
    setError('');
    if (!creds.email || !creds.password) return setError('Masukkan email dan kata sandi Anda.');
    setLoading(true);
    try {
      const data = await api.post('/auth/login', creds);
      login(data.token);
      navigate(data.role === 'ADMIN' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.message);
      toast(err.message, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const submit = (e) => { e.preventDefault(); doLogin(form); };
  const quick = (creds) => { setForm(creds); doLogin(creds); };

  return (
    <div className="auth">
      {/* ===== Brand panel ===== */}
      <aside className="auth-brand">
        <div className="grid-bg" />
        <div className="brand-glow" />
        <div className="glow-rail" />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="brand">
            <div className="brand-mark" style={{ width: '3rem', height: '3rem', borderRadius: '0.95rem' }}><Zap size={22} /></div>
            <div>
              <p className="brand-kicker">CMW · Universal Fast Charging</p>
              <p className="brand-name">Jaringan Pengisian Cepat</p>
            </div>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: '28rem' }}>
          <div className="badge badge-pos" style={{ marginBottom: '1.5rem' }}>
            <span className="badge-dot dot-live" /> 42 stasiun · online
          </div>
          <h1 className="grotesk" style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.08, letterSpacing: '-0.03em', margin: 0 }}>
            Dashboard energi untuk armada{' '}
            <span className="text-grad">kendaraan listrik.</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.65, marginTop: '1.25rem', maxWidth: '24rem' }}>
            Pantau setiap konektor secara langsung, kelola saldo &amp; transaksi, dan kendalikan seluruh infrastruktur pengisian dari satu layar.
          </p>

          <div className="login-stats" style={{ marginTop: '2.5rem' }}>
            <div>
              <p className="login-stat-v">99.9<small>%</small></p>
              <p className="login-stat-l">Uptime konektor</p>
            </div>
            <div>
              <p className="login-stat-v">2.440<small>/kWh</small></p>
              <p className="login-stat-l">Tarif berlaku</p>
            </div>
            <div>
              <p className="login-stat-v">&lt;1<small>dtk</small></p>
              <p className="login-stat-l">Latensi telemetri</p>
            </div>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--text-faint)', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
          <span>© 2026 PT Cipta Mandiri Wirasakti</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Activity size={12} /> v5.0 · masprod</span>
        </div>
      </aside>

      {/* ===== Form panel ===== */}
      <main className="auth-main">
        <div style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <ThemeToggle />
        </div>
        <div className="auth-box">
          <div>
            <h2 className="grotesk" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Selamat datang kembali</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 8 }}>Masuk untuk membuka dashboard pengisian Anda.</p>
          </div>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} noValidate>
            <Input id="email" name="email" type="email" label="Alamat email" icon={User}
              placeholder="nama@cmwcharging.com" autoComplete="email" value={form.email} onChange={onChange} />
            <Input id="password" name="password" type="password" label="Kata sandi" icon={Lock}
              placeholder="••••••••" autoComplete="current-password" value={form.password} onChange={onChange}
              error={error || undefined} />
            <Button type="submit" loading={loading} className="btn-block" style={{ minHeight: 52 }}>
              Masuk ke dashboard <ArrowRight size={16} />
            </Button>
          </form>

          <div className="divider-mono">Masuk cepat (demo)</div>
          <div className="demo-grid">
            <Button variant="ghost" disabled={loading} onClick={() => quick(DEMO.user)} style={{ minHeight: 48 }}>
              <User size={15} /> Pengguna
            </Button>
            <Button variant="ghost" disabled={loading} onClick={() => quick(DEMO.admin)} style={{ minHeight: 48 }}>
              <Shield size={15} /> Admin
            </Button>
          </div>

          <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center' }}>
            Belum punya akun? <Link to="/register">Ajukan akses baru</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
