import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function Input({ label, icon: Icon, error, hint, type = 'text', id, className = '', ...props }) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const realType = isPassword ? (show ? 'text' : 'password') : type;

  return (
    <div className="field-group">
      {label && <label htmlFor={id} className="field-label">{label}</label>}
      <div className="field-wrap">
        {Icon && <span className="field-icon"><Icon size={15} /></span>}
        <input
          id={id}
          type={realType}
          className={`field ${Icon ? 'has-icon' : ''} ${isPassword ? 'has-append' : ''} ${error ? 'field-error' : ''} ${className}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            className="field-append"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
      {error && <p className="field-msg-err">{error}</p>}
      {hint && !error && <p className="field-msg-hint">{hint}</p>}
    </div>
  );
}
