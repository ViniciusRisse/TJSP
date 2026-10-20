// Adaptação semanal: analisa a semana anterior e explica como as prioridades mudaram.

import type { AppState, PerformanceMetric, WeeklyReport } from '../types';
import { addDays, weekStart } from './dates';
import { computeDisciplineStats, computeTopicStats, RESULT_META } from './mastery';
import { computePriorities, currentPhase, projectScore, sortedPriorities } from './priority';
import { evidenceStatements } from './metrics';

export function snapshotMetric(state: AppState, today: string): PerformanceMetric {
  const stats = computeTopicStats(state, today);
  const ds = computeDisciplineStats(state, stats);
  const proj = projectScore(state, stats);
  const ws = weekStart(today);
  const wk = state.attempts.filter((a) => a.date >= ws);
  return {
    week: ws, date: today,
    mastery: Object.fromEntries(Object.values(stats).filter((s) => s.started).map((s) => [s.topicId, s.mastery])),
    discMastery: Object.fromEntries(Object.values(ds).map((d) => [d.disciplineId, d.mastery])),
    accuracy: wk.length ? wk.filter((a) => RESULT_META[a.result].correct).length / wk.length : null,
    attempts: wk.length,
    minutes: state.sessions.filter((s) => s.date >= ws).reduce((a, s) => a + s.minutes, 0),
    projected: { I: proj.byBlock.I.percent, II: proj.byBlock.II.percent, III: proj.byBlock.III.percent },
    projectedQuestions: proj.totalExpected,
  };
}

/** Gera o relatório da semana que terminou (segunda a domingo anteriores a `today`). */
export function buildWeeklyReport(state: AppState, today: string): WeeklyReport {
  const thisWeek = weekStart(today);
  const prevWeek = addDays(thisWeek, -7);
  const inWeek = <T extends { date: string }>(x: T) => x.date >= prevWeek && x.date < thisWeek;
  const sessions = state.sessions.filter(inWeek);
  const attempts = state.attempts.filter(inWeek);
  const minutesByDiscipline: Record<string, number> = {};
  for (const s of sessions) if (s.disciplineId) minutesByDiscipline[s.disciplineId] = (minutesByDiscipline[s.disciplineId] || 0) + s.minutes;
  const stats = computeTopicStats(state, today);
  const phase = currentPhase(state, stats, today);
  const prio = computePriorities(state, stats, today, phase);
  const top = sortedPriorities(prio).slice(0, 5);
  const statsBefore = computeTopicStats({ ...state, attempts: state.attempts.filter((a) => a.date < prevWeek), sessions: state.sessions.filter((s) => s.date < prevWeek) }, prevWeek);
  const prioBefore = computePriorities(state, statsBefore, prevWeek, currentPhase(state, statsBefore, prevWeek));
  const adjustments: string[] = [];
  for (const p of top) {
    const t = state.topics.find((x) => x.id === p.topicId)!;
    const before = prioBefore[p.topicId]?.score ?? 0;
    if (p.score - before >= 8) adjustments.push(`${t.name} subiu na prioridade (${Math.round(before)} → ${Math.round(p.score)}): ${p.reasons[0] ?? ''}.`);
  }
  for (const t of state.topics) {
    const a = stats[t.id], b = statsBefore[t.id];
    if (a.n >= 10 && b.n >= 5 && a.mastery - b.mastery >= 10) adjustments.push(`${t.name}: domínio ${b.mastery}% → ${a.mastery}%. Menos tempo novo, mais revisão espaçada.`);
  }
  const recurring = state.topics.filter((t) => stats[t.id].recurring).map((t) => t.id);
  for (const id of recurring.slice(0, 3)) adjustments.push(`Erro recorrente em ${state.topics.find((t) => t.id === id)!.name}: prioridade elevada automaticamente.`);
  const totalMin = Object.values(minutesByDiscipline).reduce((a, b) => a + b, 0);
  if (!sessions.length) adjustments.push('Semana sem registros: a próxima missão retoma do ponto onde você parou, sem compensação.');
  else if (totalMin) {
    const ds = Object.entries(minutesByDiscipline).sort((a, b) => b[1] - a[1])[0];
    const d = state.disciplines.find((x) => x.id === ds[0]);
    if (d && ds[1] / totalMin > 0.5 && totalMin >= 180) adjustments.push(`${d.short} ocupou mais da metade do tempo. A próxima semana intercala mais com outros blocos.`);
  }
  if (!adjustments.length) adjustments.push('Prioridades estáveis. O ciclo segue pelos tópicos de maior retorno.');
  return {
    week: prevWeek, createdAt: Date.now(), minutesByDiscipline,
    attempts: attempts.length,
    accuracy: attempts.length ? attempts.filter((a) => RESULT_META[a.result].correct).length / attempts.length : null,
    newErrors: state.errors.filter(inWeek).length,
    recurring,
    reviewsDone: Object.values(state.reviews).reduce((acc, r) => acc + r.history.filter(inWeek).length, 0),
    simulations: state.simulationResults.filter(inWeek).length,
    topPriorities: top.map((p) => ({ topicId: p.topicId, score: p.score })),
    adjustments,
    evidence: evidenceStatements(state, today),
  };
}

export function needsWeeklyReport(state: AppState, today: string): boolean {
  const prevWeek = addDays(weekStart(today), -7);
  if (state.weeklyReports.some((r) => r.week === prevWeek)) return false;
  // só faz sentido se o projeto já existia na semana anterior
  return state.user.createdAt < new Date(weekStart(today) + 'T00:00:00').getTime();
}
