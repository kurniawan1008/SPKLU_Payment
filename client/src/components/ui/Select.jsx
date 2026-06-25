import { ChevronDown } from 'lucide-react';

export default function Select({ label, id, children, className = '', ...props }) {
  return (
    <div className="field-group">
      {label && <label htmlFor={id} className="field-label">{label}</label>}
      <div className="field-wrap">
        <select id={id} className={`field select ${className}`} {...props}>
          {children}
        </select>
        <span className="field-append pointer-none"><ChevronDown size={15} /></span>
      </div>
    </div>
  );
}
