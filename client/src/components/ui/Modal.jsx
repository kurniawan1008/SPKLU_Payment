import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, icon: Icon, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal-card ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="card-accent" />
        <div className="modal-head">
          <h2 className="modal-title">{Icon && <Icon size={18} className="ic-accent" />}{title}</h2>
          <button className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Tutup"><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
