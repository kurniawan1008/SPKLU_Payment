import { Loader2 } from 'lucide-react';

export default function Button({ variant = 'primary', loading = false, children, className = '', disabled, ...props }) {
  return (
    <button className={`btn btn-${variant} ${className}`} disabled={loading || disabled} {...props}>
      {loading && <Loader2 size={16} className="spin" />}
      {children}
    </button>
  );
}
