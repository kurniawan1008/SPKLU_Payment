import { Zap } from 'lucide-react';

export default function Logo({ sub = 'Pengisian Cepat', size = 'sm' }) {
  return (
    <div className="brand">
      <div className="brand-mark" style={size === 'lg' ? { width: '3rem', height: '3rem', borderRadius: '0.95rem' } : undefined}>
        <Zap size={size === 'lg' ? 22 : 18} />
      </div>
      <div className="min-w-0">
        <p className="brand-kicker">CMW Universal Fast<br />Charging</p>
        <p className="brand-name">{sub}</p>
      </div>
    </div>
  );
}
