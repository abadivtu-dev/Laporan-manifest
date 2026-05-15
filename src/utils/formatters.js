export function formatCurrency(value) {
  if (value == null || value === '') return '-';
  const num = typeof value === 'string' ? parseInt(value.replace(/[^0-9]/g, ''), 10) || 0 : value;
  return `Rp ${num.toLocaleString('id-ID')}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(date) {
  return date.toLocaleString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function parseSheetDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  const parts = val.toString().split(/[/-]/);
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return new Date(`${y.length === 2 ? '20' + y : y}-${m}-${d}`);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}
