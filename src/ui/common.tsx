import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppState, Topic } from '../types';
import { STATUS_META, type TopicStatus } from '../engine/mastery';
import { RISK_META, type RiskLevel } from '../engine/metrics';

export const pct = (x: number | null | undefined, d = 0) => (x == null ? '—' : `${(x * 100).toFixed(d).replace('.', ',')}%`);
export const fmt1 = (x: number) => x.toFixed(1).replace('.', ',');
export const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(Math.round(m % 60)).padStart(2, '0') : ''}` : `${Math.round(m)} min`);

export function Meter({ value, color, label }: { value: number; color?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="meter" role="meter" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <i style={{ width: `${v}%`, background: color }} />
    </div>
  );
}

export function StatusPill({ status }: { status: TopicStatus }) {
  const m = STATUS_META[status];
  const cls = status === 'dominado' ? 'good' : status === 'reforco' ? 'crit' : status === 'consolidacao' ? 'warn' : '';
  return <span className={`pill ${cls}`}>{m.emoji} {m.label}</span>;
}

export function RiskPill({ level }: { level: RiskLevel }) {
  const m = RISK_META[level];
  const cls = level === 'controlado' ? 'good' : level === 'atencao' ? 'warn' : level === 'alto' ? 'serious' : 'crit';
  return <span className={`pill ${cls}`}>{m.emoji} {m.label}</span>;
}

export function Modal({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet" onClick={onClose}>
      <div className="panel" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3200);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <ToastCtx.Provider value={setMsg}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function topicName(s: AppState, id?: string) {
  return s.topics.find((t) => t.id === id)?.name ?? '';
}
export function discOf(s: AppState, t?: Topic) {
  return s.disciplines.find((d) => d.id === t?.disciplineId);
}

export function TopicSelect({ state, value, onChange, id }: { state: AppState; value: string; onChange: (v: string) => void; id: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Escolha o tópico…</option>
      {[...state.disciplines].sort((a, b) => a.order - b.order).map((d) => (
        <optgroup key={d.id} label={`${d.block} · ${d.short}`}>
          {state.topics.filter((t) => t.disciplineId === d.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

/** Gráfico de linha simples (uma série), com marcador por ponto e tooltip ao passar o mouse. */
export function LineChart({ points, height = 160, yLabel, refLine }: { points: { label: string; value: number | null; n?: number }[]; height?: number; yLabel: string; refLine?: { value: number; label: string } }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, L = 36, R = 12, T = 12, B = 26;
  const xs = (i: number) => L + (points.length <= 1 ? 0 : (i * (W - L - R)) / (points.length - 1));
  const ys = (v: number) => T + (1 - v) * (H - T - B);
  const valid = points.map((p, i) => ({ ...p, i })).filter((p) => p.value != null) as { label: string; value: number; n?: number; i: number }[];
  const path = valid.map((p, k) => `${k ? 'L' : 'M'}${xs(p.i).toFixed(1)},${ys(p.value).toFixed(1)}`).join(' ');
  const area = valid.length > 1 ? `${path} L${xs(valid[valid.length - 1].i)},${ys(0)} L${xs(valid[0].i)},${ys(0)} Z` : '';
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={yLabel} style={{ display: 'block', overflow: 'visible' }}>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={ys(g)} y2={ys(g)} stroke="var(--line)" strokeWidth={1} />
            <text x={L - 6} y={ys(g) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{Math.round(g * 100)}%</text>
          </g>
        ))}
        {refLine && (
          <g>
            <line x1={L} x2={W - R} y1={ys(refLine.value)} y2={ys(refLine.value)} stroke="var(--stamp)" strokeDasharray="4 4" strokeWidth={1.5} />
            <text x={W - R} y={ys(refLine.value) - 5} textAnchor="end" fontSize={11} fill="var(--stamp)">{refLine.label}</text>
          </g>
        )}
        {area && <path d={area} fill="var(--accent)" opacity={0.1} />}
        {path && <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />}
        {valid.map((p) => (
          <circle key={p.i} cx={xs(p.i)} cy={ys(p.value)} r={hover === p.i ? 6 : 4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        ))}
        {points.map((p, i) => (
          <g key={i}>
            {(i % Math.ceil(points.length / 8) === 0 || i === points.length - 1) && <text x={xs(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">{p.label}</text>}
            <rect x={xs(i) - (W - L - R) / Math.max(1, points.length - 1) / 2} y={T} width={(W - L - R) / Math.max(1, points.length - 1)} height={H - T - B} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          </g>
        ))}
        {hover != null && <line x1={xs(hover)} x2={xs(hover)} y1={T} y2={H - B} stroke="var(--muted)" strokeWidth={1} pointerEvents="none" />}
      </svg>
      {hover != null && (
        <div className="pill" style={{ position: 'absolute', top: 0, left: `${(xs(hover) / W) * 100}%`, transform: 'translateX(-50%)', background: 'var(--ink)', color: 'var(--bg)', pointerEvents: 'none' }}>
          {points[hover].label}: {points[hover].value == null ? 'sem questões' : `${Math.round(points[hover].value! * 100)}%`}{points[hover].n != null ? ` · ${points[hover].n} q` : ''}
        </div>
      )}
    </div>
  );
}

/** Barra com marca de mínimo (bullet). */
export function BulletBar({ value, min, target, label }: { value: number; min?: number; target?: number; label: string }) {
  return (
    <div style={{ position: 'relative' }} title={`${label}: ${Math.round(value * 100)}%`}>
      <div className="meter" style={{ height: 12 }}><i style={{ width: `${Math.min(100, value * 100)}%` }} /></div>
      {min != null && <div style={{ position: 'absolute', top: -3, bottom: -3, left: `${min * 100}%`, width: 2, background: 'var(--stamp)' }} aria-hidden />}
      {target != null && <div style={{ position: 'absolute', top: -3, bottom: -3, left: `${target * 100}%`, width: 2, background: 'var(--ink-2)', opacity: 0.6 }} aria-hidden />}
    </div>
  );
}
