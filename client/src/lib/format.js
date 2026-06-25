export const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

export const number = (n, decimals = 0) =>
  Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const datetime = (s) =>
  s ? new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const dateShort = (s) =>
  s ? new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '—';

// Angka telemetri presisi (pakai titik desimal gaya teknis: 398.7, 355.1, 3.792).
export const metric = (n, decimals = 1) => Number(n || 0).toFixed(decimals);

// Waktu relatif singkat untuk antrean/aktivitas terbaru.
export const timeAgo = (s) => {
  if (!s) return '—';
  const diff = (Date.now() - new Date(s).getTime()) / 1000;
  if (diff < 60) return 'Baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
  return new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
