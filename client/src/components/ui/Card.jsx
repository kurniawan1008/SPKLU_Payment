export default function Card({ children, className = '', accent = false, style }) {
  return (
    <div className={`card ${className}`} style={style}>
      {accent && <div className="card-accent" />}
      {children}
    </div>
  );
}
