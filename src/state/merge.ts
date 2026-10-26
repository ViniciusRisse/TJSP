// Junta os dados de dois aparelhos sem perder nada de nenhum deles.
import type { AppState, DailyMission } from '../types';
import { migrate } from './seed';

function unionById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const m = new Map<string, T>();
  for (const x of a) m.set(x.id, x);
  for (const x of b) if (!m.has(x.id)) m.set(x.id, x);
  return [...m.values()];
}

const doneCount = (m?: DailyMission) => (m ? m.tasks.filter((t) => t.status === 'feita').length : -1);

/**
 * `base` = cópia com mais estudo (dela vêm configurações e perfil); `other` = a outra cópia.
 * Questões, sessões, erros, flashcards, redações e simulados: união (sem duplicar).
 * Missões do mesmo dia: fica a que tem mais tarefas feitas; tarefas feitas na outra também contam.
 * Revisões: fica a mais recente de cada tópico. Partes de teoria estudadas: união.
 */
export function mergeStates(baseRaw: any, otherRaw: any): AppState {
  const base = migrate(baseRaw);
  const other = migrate(otherRaw);
  const out: AppState = structuredClone(base);
  out.attempts = unionById(base.attempts, other.attempts).sort((x, y) => x.ts - y.ts);
  out.sessions = unionById(base.sessions, other.sessions);
  out.errors = unionById(base.errors, other.errors);
  out.questions = unionById(base.questions, other.questions);
  out.essays = unionById(base.essays, other.essays);
  out.simulations = unionById(base.simulations, other.simulations);
  out.simulationResults = unionById(base.simulationResults, other.simulationResults);
  // flashcards: mesmo id → fica o que foi mais revisado (caixa maior / mais lapsos registrados)
  const fc = new Map(base.flashcards.map((c) => [c.id, c]));
  for (const c of other.flashcards) {
    const cur = fc.get(c.id);
    if (!cur || c.box + c.lapses > cur.box + cur.lapses) fc.set(c.id, c);
  }
  out.flashcards = [...fc.values()];
  // missões
  for (const [date, m] of Object.entries(other.missions)) {
    const cur = out.missions[date];
    if (!cur || doneCount(m) > doneCount(cur)) out.missions[date] = m;
  }
  // revisões: a mais recente por tópico
  for (const [tid, r] of Object.entries(other.reviews)) {
    const cur = out.reviews[tid];
    if (!cur || (r.lastDate || '') > (cur.lastDate || '')) out.reviews[tid] = r;
  }
  // partes da teoria
  const sp: Record<string, string[]> = { ...(base.subtopicProgress || {}) };
  for (const [tid, list] of Object.entries(other.subtopicProgress || {})) sp[tid] = [...new Set([...(sp[tid] || []), ...list])];
  out.subtopicProgress = sp;
  out.dismissedCycles = [...new Set([...(base.dismissedCycles || []), ...(other.dismissedCycles || [])])];
  out.weeklyReports = unionBy(base.weeklyReports, other.weeklyReports, (w) => w.week);
  out.metrics = unionBy(base.metrics, other.metrics, (m) => m.week);
  out.distraction = unionBy(base.distraction, other.distraction, (d) => d.date);
  const la = [base.user.lastActiveDate, other.user.lastActiveDate].filter(Boolean).sort();
  out.user = { ...base.user, onboarded: true, lastActiveDate: la.length ? la[la.length - 1]! : null, createdAt: Math.min(base.user.createdAt, other.user.createdAt) };
  out.updatedAt = Date.now();
  return out;
}

function unionBy<T>(a: T[], b: T[], key: (x: T) => string): T[] {
  const m = new Map<string, T>();
  for (const x of a) m.set(key(x), x);
  for (const x of b) if (!m.has(key(x))) m.set(key(x), x);
  return [...m.values()];
}
