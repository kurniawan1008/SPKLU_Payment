import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, AtSign, Phone, IdCard, Mail, Lock, ShieldCheck, UserPlus, FileText, Check, Zap } from 'lucide-react';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import ThemeToggle from '../components/ui/ThemeToggle';
import { api } from '../lib/api';
import { useToast } from '../context/ToastProvider';

const EMPTY = { full_name: '', username: '', phone: '', npk: '', email: '', password: '', confirm: '' };

export default function Register() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [agreement, setAgreement] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const openAgreement = (e) => {
    e.preventDefault();
    const errs = {};
    Object.entries({
      full_name: 'Nama lengkap', username: 'Nama pengguna', phone: 'Nomor HP',
      npk: 'NPK', email: 'Email', password: 'Kata sandi',
    }).forEach(([k, label]) => {
      if (!form[k]?.trim()) errs[k] = `${label} wajib diisi`;
    });
    if (form.password && form.password.length < 6) errs.password = 'Kata sandi minimal 6 karakter';
    if (form.password !== form.confirm) errs.confirm = 'Kata sandi tidak cocok';
    setErrors(errs);
    if (Object.keys(errs).length) return toast('Periksa kembali isian formulir.', { type: 'warning' });
    setAgreement(true);
  };

  const submit = async () => {
    setAgreement(false);
    setLoading(true);
    try {
      const { confirm, ...payload } = form;
      const data = await api.post('/auth/register', payload);
      toast(data.message || 'Registrasi berhasil.', { type: 'success' });
      setTimeout(() => navigate('/login'), 1400);
    } catch (err) {
      if (err.errors) setErrors(err.errors);
      toast(err.message, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', position: 'relative' }}>
      <div className="grid-bg" />
      <div style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', zIndex: 5 }}><ThemeToggle /></div>

      <div className="card" style={{ width: '100%', maxWidth: '34rem', position: 'relative', zIndex: 1, overflow: 'hidden' }}>
        <div className="card-accent" />
        <div style={{ padding: '1.75rem' }}>
          <div className="brand" style={{ marginBottom: '0.5rem' }}>
            <div className="brand-mark"><Zap size={16} /></div>
            <div>
              <p className="brand-kicker">Pendaftaran akun</p>
              <p className="brand-name">SPKLU CMW Universal Fast Charging</p>
            </div>
          </div>
          <p className="mono" style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            PT Cipta Mandiri Wirasakti — isi semua kolom sesuai data resmi Anda.
          </p>

          <form onSubmit={openAgreement} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} noValidate>
            <div className="reg-grid">
              <Input id="full_name" name="full_name" label="Nama lengkap" icon={User} placeholder="Sesuai KTP"
                value={form.full_name} onChange={onChange} error={errors.full_name} />
              <Input id="username" name="username" label="Nama pengguna" icon={AtSign} placeholder="cth. budi22"
                value={form.username} onChange={onChange} error={errors.username} />
            </div>
            <div className="reg-grid">
              <Input id="phone" name="phone" type="tel" label="Nomor handphone" icon={Phone} placeholder="0812xxxxxxxx"
                value={form.phone} onChange={onChange} error={errors.phone} />
              <Input id="npk" name="npk" label="Nomor NPK" icon={IdCard} placeholder="ID perusahaan"
                value={form.npk} onChange={onChange} error={errors.npk} />
            </div>
            <Input id="email" name="email" type="email" label="Alamat email aktif" icon={Mail} placeholder="budi@domain.com"
              value={form.email} onChange={onChange} error={errors.email} />
            <div className="reg-grid">
              <Input id="password" name="password" type="password" label="Kata sandi" icon={Lock} placeholder="Min. 6 karakter"
                value={form.password} onChange={onChange} error={errors.password} />
              <Input id="confirm" name="confirm" type="password" label="Konfirmasi" icon={ShieldCheck} placeholder="Ulangi kata sandi"
                value={form.confirm} onChange={onChange} error={errors.confirm} />
            </div>
            <Button type="submit" loading={loading} className="btn-block" style={{ minHeight: 50, marginTop: 4 }}>
              <UserPlus size={16} /> Lanjutkan Pendaftaran
            </Button>
          </form>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '1.25rem', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Sudah punya akun? <Link to="/login">Masuk sekarang</Link>
            </p>
          </div>
        </div>
      </div>

      <Modal
        open={agreement}
        onClose={() => setAgreement(false)}
        title="Syarat & Ketentuan"
        icon={FileText}
        footer={
          <>
            <Button variant="ghost" className="btn-block" onClick={() => setAgreement(false)}>Batalkan</Button>
            <Button className="btn-block" onClick={submit}><Check size={15} /> Saya Setuju & Daftar</Button>
          </>
        }
      >
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-muted)', maxHeight: '14rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <p><b style={{ color: 'var(--text)' }}>1. Kepemilikan akun.</b> Akun bersifat pribadi dan rahasia, hanya untuk pendaftar sah dengan NPK resmi perusahaan.</p>
          <p><b style={{ color: 'var(--text)' }}>2. Keamanan data.</b> Anda bertanggung jawab menjaga kerahasiaan kata sandi.</p>
          <p><b style={{ color: 'var(--text)' }}>3. Prosedur pengisian.</b> Patuhi seluruh instruksi keselamatan pengisian daya cepat pada unit charger.</p>
          <p><b style={{ color: 'var(--text)' }}>4. Sanksi.</b> CMW berhak membekukan akun bila mendeteksi manipulasi data atau penyalahgunaan.</p>
        </div>
      </Modal>
    </div>
  );
}
