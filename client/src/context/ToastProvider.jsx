import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext();
const ICONS = { success: CheckCircle2, warning: AlertTriangle, error: AlertCircle, info: Info };
const TITLES = { success: 'Berhasil', warning: 'Perhatian', error: 'Terjadi kendala', info: 'Info' };

let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (message, { type = 'success', title } = {}) => {
      const id = ++counter;
      setToasts((t) => [...t, { id, message, type, title }]);
      setTimeout(() => remove(id), 4500);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div key={t.id} className={`toast toast-${t.type}`} role="status">
              <span className="toast-ic"><Icon size={18} /></span>
              <div className="min-w-0">
                <p className="toast-title">{t.title || TITLES[t.type]}</p>
                <p className="toast-msg">{t.message}</p>
              </div>
              <button className="toast-x" onClick={() => remove(t.id)} aria-label="Tutup">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
