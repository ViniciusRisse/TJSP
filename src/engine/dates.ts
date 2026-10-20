// Datas locais no formato YYYY-MM-DD (sem fuso: o dia da estudante é o dia do aparelho).

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function today(now: Date = new Date()): string {
  return toISO(now);
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function diffDays(a: string, b: string): number {
  // a - b em dias
  return Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 86400000);
}

export function weekday(iso: string): number {
  return fromISO(iso).getDay();
}

/** Segunda-feira da semana do dia. */
export function weekStart(iso: string): string {
  const wd = weekday(iso);
  const delta = wd === 0 ? -6 : 1 - wd;
  return addDays(iso, delta);
}

export function formatBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const WD = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export function weekdayName(iso: string): string {
  return WD[weekday(iso)];
}

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}
