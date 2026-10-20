// Fases do projeto, projeção de nota e prioridade dinâmica por tópico.

import type { AppState, BlockId, PhaseId, Topic } from '../types';
import { diffDays } from './dates';
import type { TopicStats } from './mastery';

export const PHASES: Record<PhaseId, { name: string; goal: string }> = {
  1: { name: 'Construção da base', goal: 'Conhecer todo o edital e construir fundamentos.' },
  2: { name: 'Consolidação', goal: 'Aumentar questões e reduzir erros.' },
  3: { name: 'Aprofundamento', goal: 'Casos práticos, pegadinhas e assuntos recorrentes.' },
  4: { name: 'Performance', goal: 'Simulados, tempo e estabilidade.' },
  5: { name: 'Reta final', goal: 'Revisão estratégica e maximização de pontos.' },
};

export function daysLeft(state: AppState, todayIso: string): number {
  return Math.max(0, diffDays(state.settings.examDate, todayIso));
}

/** Questões esperadas do tópico na prova. */
export function expectedQuestions(state: AppState, t: Topic): number {
  const d = state.disciplines.find((x) => x.id === t.disciplineId);
  if (!d || !d.active) return 0;
  const total = state.topics.filter((x) => x.disciplineId === t.disciplineId).reduce((a, x) => a + x.share, 0) || 1;
  return (d.questions * t.share) / total;
}

export function histCount(t: Topic): number {
  return [t.history.y2018, t.history.y2021, t.history.y2025].filter((x) => x && x.length > 0).length;
}

export function blockOf(state: AppState, t: Topic): BlockId {
  return state.disciplines.find((d) => d.id === t.disciplineId)?.block || 'III';
}

export interface Projection {
  byBlock: Record<BlockId, { expected: number; total: number; percent: number }>;
  totalExpected: number;
  score: number;        // 0–10
  coverage: number;     // fração ponderada iniciada
  avgStartedMastery: number;
}

/** Projeção: questões esperadas × probabilidade de acerto (sem evidência = chute de 5 alternativas). */
export function projectScore(state: AppState, stats: Record<string, TopicStats>): Projection {
  const byBlock: Projection['byBlock'] = { I: { expected: 0, total: 0, percent: 0 }, II: { expected: 0, total: 0, percent: 0 }, III: { expected: 0, total: 0, percent: 0 } };
  const guess = 1 / (state.exam.alternatives || 5);
  let covW = 0, covTot = 0, mSum = 0, mW = 0;
  for (const t of state.topics) {
    const q = expectedQuestions(state, t);
    if (q <= 0) continue;
    const s = stats[t.id];
    const p = s && s.n > 0 ? Math.max(guess, s.mastery / 100) : guess;
    const b = blockOf(state, t);
    byBlock[b].expected += q * p;
    byBlock[b].total += q;
    covTot += q;
    if (s?.started) { covW += q; mSum += q * s.mastery; mW += q; }
  }
  let totalExpected = 0, total = 0;
  for (const b of ['I', 'II', 'III'] as BlockId[]) {
    byBlock[b].percent = byBlock[b].total ? byBlock[b].expected / byBlock[b].total : 0;
    totalExpected += byBlock[b].expected;
    total += byBlock[b].total;
  }
  return {
    byBlock, totalExpected,
    score: total ? (10 * totalExpected) / total : 0,
    coverage: covTot ? covW / covTot : 0,
    avgStartedMastery: mW ? mSum / mW : 0,
  };
}

export function phaseByTime(state: AppState, todayIso: string): PhaseId {
  const d = daysLeft(state, todayIso);
  if (d <= state.settings.retaFinalDays) return 5;
  if (d <= state.settings.performanceDays) return 4;
  if (d <= 70) return 3;
  if (d <= 105) return 2;
  return 1;
}

export function currentPhase(state: AppState, stats: Record<string, TopicStats>, todayIso: string): PhaseId {
  const byTime = phaseByTime(state, todayIso);
  const proj = projectScore(state, stats);
  let byPerf: PhaseId = 1;
  if (proj.coverage >= 0.85) byPerf = 2;
  if (proj.coverage >= 0.9 && proj.avgStartedMastery >= 70) byPerf = 3;
  return Math.max(byTime, byPerf) as PhaseId;
}

export interface PriorityResult {
  topicId: string;
  score: number;            // 0–100
  expectedQ: number;
  gain: number;             // questões que podem ser ganhas (expectedQ × espaço de melhora)
  factors: Record<string, number>;
  reasons: string[];
}

const LATE_RAMP: Record<PhaseId, number> = { 1: 0.25, 2: 0.45, 3: 0.7, 4: 1, 5: 1.3 };
const NEW_CONTENT_MOD: Record<PhaseId, number> = { 1: 1, 2: 1, 3: 0.85, 4: 0.6, 5: 0.35 };

export function computePriorities(
  state: AppState,
  stats: Record<string, TopicStats>,
  todayIso: string,
  phase: PhaseId,
): Record<string, PriorityResult> {
  const w = state.settings.weights;
  const proj = projectScore(state, stats);
  const out: Record<string, PriorityResult> = {};
  for (const t of state.topics) {
    const d = state.disciplines.find((x) => x.id === t.disciplineId);
    const s = stats[t.id];
    const q = expectedQuestions(state, t);
    if (!d || !d.active || q <= 0) {
      out[t.id] = { topicId: t.id, score: 0, expectedQ: 0, gain: 0, factors: {}, reasons: ['Disciplina desativada'] };
      continue;
    }
    const hc = histCount(t);
    const fHist = hc > 0 ? hc / 3 : 0.15; // está no edital e nunca caiu → mínimo
    const fExam = Math.min(1, q / 2);
    const fWeak = s.started && s.n > 0 ? 1 - s.mastery / 100 : 0.85;
    const fErr = Math.min(1, s.errors14 / 5 + (s.recurring ? 0.3 : 0));
    let fDue = 0;
    const rv = state.reviews[t.id];
    if (rv && s.started) {
      if (todayIso >= rv.nextDate) fDue = 1;
      else if (rv.lastDate) fDue = Math.min(1, diffDays(todayIso, rv.lastDate) / Math.max(1, rv.intervalDays));
    }
    const block = d.block;
    const blk = state.exam.blocks.find((b) => b.id === block);
    let fElim = 0;
    if (blk?.eliminatory) {
      const margin = proj.byBlock[block].percent - blk.minPercent;
      fElim = 0.5 + 0.5 * Math.max(0, Math.min(1, (0.15 - margin) / 0.3));
    }
    const fCharge = t.traps.length ? (s.levelB != null ? 1 - s.levelB / 100 : 0.5) : 0;

    const f = { hist: fHist, exam: fExam, weak: fWeak, errors: fErr, due: fDue, elim: fElim, charge: fCharge };
    let raw = 0, wsum = 0;
    for (const k of Object.keys(f) as (keyof typeof f)[]) { raw += w[k] * f[k]; wsum += w[k]; }
    let score = wsum ? (100 * raw) / wsum : 0;
    let mod = 1;
    if (t.late) mod *= LATE_RAMP[phase];
    if (!s.started) mod *= NEW_CONTENT_MOD[phase] * (phase >= 4 ? 0.5 + 0.5 * fHist : 1);
    // tópico dominado e longe da revisão cai bastante, mas não some
    if (s.status === 'dominado' && fDue < 0.8) mod *= 0.6;
    score = Math.round(score * mod * 10) / 10;

    const gain = q * (s.n > 0 ? Math.max(0, 0.9 - s.mastery / 100) : 0.7);

    const contrib = (Object.keys(f) as (keyof typeof f)[])
      .map((k) => ({ k, v: w[k] * f[k] }))
      .sort((a, b) => b.v - a.v);
    const reasons: string[] = [];
    for (const { k } of contrib.slice(0, 3)) {
      if (k === 'hist') reasons.push(hc > 0 ? `Caiu em ${hc} das 3 provas analisadas` : 'Está no edital (sem incidência nas 3 provas analisadas)');
      if (k === 'exam') reasons.push(`≈ ${q.toFixed(1).replace('.', ',')} questão(ões) esperada(s) na prova`);
      if (k === 'weak') reasons.push(s.n > 0 ? `Domínio atual ${s.mastery}% — precisa de reforço` : 'Ainda não iniciado');
      if (k === 'errors' && fErr > 0) reasons.push(s.recurring ? 'Erro recorrente neste assunto' : `${s.errors14} erro(s) nos últimos 14 dias`);
      if (k === 'due' && fDue > 0) reasons.push(fDue >= 1 ? 'Revisão programada' : 'Perto do momento de revisar');
      if (k === 'elim' && fElim > 0) reasons.push(`Bloco ${block} é eliminatório (mínimo ${Math.round((blk?.minPercent || 0.5) * 100)}%)`);
      if (k === 'charge' && fCharge > 0) reasons.push('A VUNESP cobra com pegadinha aqui — treinar reconhecimento');
    }
    out[t.id] = { topicId: t.id, score, expectedQ: q, gain, factors: f, reasons };
  }
  return out;
}

export function sortedPriorities(p: Record<string, PriorityResult>): PriorityResult[] {
  return Object.values(p).sort((a, b) => b.score - a.score);
}
