import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, X, LogOut } from 'lucide-react';
import Logo from './Logo';
import ThemeToggle from '../ui/ThemeToggle';
import { useAuth } from '../../context/AuthProvider';

export default function AppLayout({
  brandSub,
  navItems,
  activeTab,
  onTab,
  sidebarTop,
  title,
  subtitle,
  headerRight,
  userSub,
  logoutDisabled = false,
  children,
}) {
  const [drawer, setDrawer] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const doLogout = () => {
    logout();
    navigate('/login');
  };

  const initial = (user?.full_name || user?.email || '?').trim().charAt(0).toUpperCase();

  const Nav = ({ onPick }) => (
    <nav className="nav" aria-label="Menu utama">
      <p className="nav-section">{brandSub === 'Dashboard Admin' ? 'Administrasi' : 'Menu utama'}</p>
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = activeTab === item.id;
        return (
          <button
            key={item.id}
            className={`navlink ${active ? 'active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => { onTab(item.id); onPick?.(); }}
          >
            <Icon size={16} />
            <span className="nav-label">{item.label}</span>
            <span className="nav-dot" />
          </button>
        );
      })}
    </nav>
  );

  const Footer = ({ onAfterLogout }) => (
    <div className="sidebar-foot">
      <button
        className="btn btn-ghost btn-block"
        onClick={() => { onAfterLogout?.(); doLogout(); }}
        disabled={logoutDisabled}
        title={logoutDisabled ? 'Hentikan sesi pengisian aktif sebelum keluar' : undefined}
      >
        <LogOut size={15} /> Keluar
      </button>
      <div className="sidebar-status">
        <span className="ok"><span className="badge-dot" aria-hidden="true" style={{ background: 'var(--positive)', boxShadow: '0 0 8px var(--positive)' }} /> Sistem operasional</span>
        <span>v5.0</span>
      </div>
    </div>
  );

  return (
    <div className="layout">
      {/* ===== Sidebar (desktop) ===== */}
      <aside className="sidebar">
        <div className="glow-rail" />
        <div className="sidebar-inner">
          <Logo sub={brandSub} size="lg" />
          {sidebarTop}
          <Nav />
        </div>
        <Footer />
      </aside>

      {/* ===== Main ===== */}
      <div className="main">
        <div className="grid-bg" />
        <div className="topstripe" />
        <header className="topbar">
          <div className="topbar-l">
            <button className="btn btn-ghost icon-btn mobile-only" onClick={() => setDrawer(true)} aria-label="Buka menu">
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="topbar-title">{title}</h1>
              <p className="topbar-sub">{subtitle}</p>
            </div>
          </div>
          <div className="topbar-r">
            <ThemeToggle />
            {headerRight}
            <div className="userchip">
              <span className="userchip-av">{initial}</span>
              <span className="userchip-meta">
                <span className="userchip-name">{user?.full_name || user?.email}</span>
                <span className="userchip-sub">{userSub || (user?.role === 'ADMIN' ? 'Admin · dashboard' : 'Pengguna')}</span>
              </span>
            </div>
          </div>
        </header>
        <div className="content fade-in">{children}</div>
      </div>

      {/* ===== Drawer (mobile) ===== */}
      {drawer && (
        <div className="drawer">
          <div className="drawer-scrim" onClick={() => setDrawer(false)} />
          <div className="drawer-panel">
            <div className="drawer-head">
              <Logo sub={brandSub} size="lg" />
              <button className="btn btn-ghost icon-btn" onClick={() => setDrawer(false)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>
            {sidebarTop}
            <Nav onPick={() => setDrawer(false)} />
            <Footer onAfterLogout={() => setDrawer(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
