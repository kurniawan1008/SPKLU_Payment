export default function StatCard({ icon: Icon, label, value, accent = 'accent', sub }) {
  return (
    <div className="card stat">
      <div className={`stat-ic stat-ic-${accent}`}>{Icon && <Icon size={18} />}</div>
      <div className="min-w-0">
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
        {sub && <p className="stat-sub">{sub}</p>}
      </div>
    </div>
  );
}
