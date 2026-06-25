export default function Badge({ variant = 'accent', children, dot = false, className = '' }) {
  return (
    <span className={`badge badge-${variant} ${className}`}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}
