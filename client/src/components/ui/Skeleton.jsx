export default function Skeleton({ className = '', style, width, height }) {
  return <div className={`skeleton ${className}`} style={{ width, height, ...style }} />;
}
