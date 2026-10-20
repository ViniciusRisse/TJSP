// Adaptação após ausência. Regra central: NÃO existe atraso acumulado.
// Nada aqui calcula "dias perdidos" para exibir; o intervalo só decide o tipo de retomada.

import type { AppState } from '../types';
import { diffDays } from './dates';

export type ReturnKind = 'primeira' | 'continuo' | 'curto' | 'longo';

export interface ReturnInfo {
  kind: ReturnKind;
  message: string | null;
  protocolStep: number | null; // 1..3 durante o protocolo de retomada
}

export const RETURN_MESSAGE = 'Bem-vinda de volta. Vamos retomar de onde você parou.';

export function detectReturn(state: AppState, todayIso: string): ReturnInfo {
  const last = state.user.lastActiveDate;
  const proto = state.returnProtocol;
  if (proto && proto.step <= 3) {
    return { kind: 'longo', message: proto.step === 1 ? RETURN_MESSAGE : 'O projeto continua. Seguimos com a retomada gradual.', protocolStep: proto.step };
  }
  if (!last) return { kind: 'primeira', message: null, protocolStep: null };
  const gap = diffDays(todayIso, last);
  if (gap <= 1) return { kind: 'continuo', message: null, protocolStep: null };
  if (gap < 7) return { kind: 'curto', message: RETURN_MESSAGE, protocolStep: null };
  return { kind: 'longo', message: RETURN_MESSAGE, protocolStep: 1 };
}

/** Deve iniciar o protocolo de retomada (3 missões graduais)? */
export function shouldStartProtocol(state: AppState, todayIso: string): boolean {
  if (state.returnProtocol) return false;
  const last = state.user.lastActiveDate;
  return !!last && diffDays(todayIso, last) >= 7;
}

/** Último tópico com estudo ou questões — ponto de retomada. */
export function lastStudiedTopics(state: AppState, k = 2): string[] {
  const events: { topicId: string; key: string }[] = [];
  for (const a of state.attempts) events.push({ topicId: a.topicId, key: a.date + String(a.ts).padStart(14, '0') });
  for (const s of state.sessions) if (s.topicId) events.push({ topicId: s.topicId, key: s.date + '0'.repeat(14) });
  events.sort((a, b) => (a.key < b.key ? 1 : -1));
  const out: string[] = [];
  for (const e of events) {
    if (!out.includes(e.topicId)) out.push(e.topicId);
    if (out.length >= k) break;
  }
  return out;
}
