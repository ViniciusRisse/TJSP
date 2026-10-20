// Métricas que respondem "estou melhorando?" — só com evidência.

import type { AppState, BlockId, QuestionAttempt } from '../types';
import { addDays, diffDays, weekStart } from './dates';
import { computeTopicStats, RESULT_META, type TopicStats } from './mastery';
import { daysLeft, expectedQuestions, projectScore, type PriorityResult, type Projection } from './priority';
import { lastSimulationDate, simulationReport } from './simulations';

const strictCorrect = (a: QuestionAttempt) => a.result === 'seguro' || a.result === 'duvida';
const anyCorrect = (a: QuestionAttempt) => RESULT_META[a.result].correct;

export interface SeriesPoint { label: string; start: string; n: number; accuracy: number | null; strict: number | null }

export function weeklySeries(attempts: QuestionAttempt[], today: string, weeks = 12): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  const ws = weekStart(today);
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(ws, -7 * i);
    const end = addDays(start, 7);
    const list = attempts.filter((a) => a.date >= start && a.date < end);
    out.push({
      label: start.slice(8, 10) + '/' + start.slice(5, 7), start, n: list.length,
      accuracy: list.length ? list.filter(anyCorrect).length / list.length : null,
      strict: list.length ? list.filter(strictCorrect).length / list.length : null,
    });
  }
  return out;
}

export function monthlySeries(attempts: QuestionAttempt[], today: string, months = 6): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  const [y, m] = today.split('-').map(Number);
  const MN = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const list = attempts.filter((a) => a.date.startsWith(key));
    out.push({ label: MN[d.getMonth()], start: key + '-01', n: list.length, accuracy: list.length ? list.filter(anyCorrect).length / list.length : null, strict: list.length ? list.filter(strictCorrect).length / list.length : null });
  }
  return out;
}

/** Frases de evidência: só aparecem quando há amostra suficiente e mudança real. */
export function evidenceStatements(state: AppState, today: string, minSample = 15): string[] {
  const out: string[] = [];
  const cutoff = addDays(today, -30);
  for (const d of state.disciplines) {
    const list = state.attempts.filter((a) => a.disciplineId === d.id).sort((a, b) => a.ts - b.ts);
    const old = list.filter((a) => a.date < cutoff).slice(-50);
    const recent = list.slice(-50).filter((a) => a.date >= cutoff);
    if (old.length < minSample || recent.length < minSample) continue;
    const po = old.filter(strictCorrect).length / old.length;
    const pr = recent.filter(strictCorrect).length / recent.length;
    if (pr - po >= 0.05) out.push(`Há 30 dias você acertava ${Math.round(po * 100)}% em ${d.short}. Nas últimas ${recent.length} questões, sua média foi ${Math.round(pr * 100)}% (sem contar chutes).`);
  }
  // queda de erros recorrentes
  const recentErr = state.attempts.filter((a) => a.date >= addDays(today, -14) && !RESULT_META[a.result].correct).length;
  const prevErr = state.attempts.filter((a) => a.date >= addDays(today, -28) && a.date < addDays(today, -14) && !RESULT_META[a.result].correct).length;
  const recentN = state.attempts.filter((a) => a.date >= addDays(today, -14)).length;
  const prevN = state.attempts.filter((a) => a.date >= addDays(today, -28) && a.date < addDays(today, -14)).length;
  if (recentN >= 30 && prevN >= 30) {
    const rr = recentErr / recentN, pr = prevErr / prevN;
    if (pr - rr >= 0.05) out.push(`Sua taxa de erro caiu de ${Math.round(pr * 100)}% para ${Math.round(rr * 100)}% nas últimas duas semanas (${recentN} questões).`);
  }
  return out;
}

export interface ReturnRate {
  windowDays: number;
  minutes: number;
  attempts: number;
  deltaQuestions: number;   // variação de questões esperadas na prova
  deltaScore: number;       // variação na nota 0–10
  per10h: number | null;
  topicGains: { topicId: string; before: number; after: number }[];
  enoughData: boolean;
  sentence: string;
}

/** TAXA DE RETORNO: quanto o estudo do período moveu a projeção de nota. */
export function returnRate(state: AppState, today: string, windowDays = 30): ReturnRate {
  const start = addDays(today, -windowDays);
  const past: AppState = { ...state, attempts: state.attempts.filter((a) => a.date < start), sessions: state.sessions.filter((s) => s.date < start) };
  const statsPast = computeTopicStats(past, start);
  const statsNow = computeTopicStats(state, today);
  const pPast = projectScore(state, statsPast);
  const pNow = projectScore(state, statsNow);
  const minutes = state.sessions.filter((s) => s.date >= start).reduce((a, s) => a + s.minutes, 0);
  const attempts = state.attempts.filter((a) => a.date >= start).length;
  const studied = new Set(state.attempts.filter((a) => a.date >= start).map((a) => a.topicId));
  const topicGains = [...studied].map((id) => ({ topicId: id, before: statsPast[id]?.n ? statsPast[id].mastery : 0, after: statsNow[id]?.mastery ?? 0 }))
    .sort((a, b) => (b.after - b.before) - (a.after - a.before));
  const deltaQuestions = pNow.totalExpected - pPast.totalExpected;
  const deltaScore = pNow.score - pPast.score;
  const enoughData = attempts >= 20 && minutes >= 60;
  const h = minutes / 60;
  const fmt = (x: number, d = 1) => x.toFixed(d).replace('.', ',');
  const sentence = enoughData
    ? `Nos últimos ${windowDays} dias você estudou ${fmt(h)}h e fez ${attempts} questões. Sua projeção ${deltaQuestions >= 0 ? 'subiu' : 'variou'} ${deltaQuestions >= 0 ? '+' : ''}${fmt(deltaQuestions)} questão(ões) na prova (${deltaScore >= 0 ? '+' : ''}${fmt(deltaScore, 2)} na nota de 0 a 10).`
    : `Ainda não há dados suficientes neste período: são necessárias pelo menos 20 questões registradas e 1h de estudo (agora: ${attempts} questões, ${Math.round(minutes)} min).`;
  return { windowDays, minutes, attempts, deltaQuestions, deltaScore, per10h: h > 0 ? (deltaQuestions / h) * 10 : null, topicGains, enoughData, sentence };
}

// ───────────────────────── RISCO PARA A PROVA ─────────────────────────

export type RiskLevel = 'controlado' | 'atencao' | 'alto' | 'critico';
export const RISK_META: Record<RiskLevel, { emoji: string; label: string; rank: number }> = {
  controlado: { emoji: '🟢', label: 'Controlado', rank: 0 },
  atencao: { emoji: '🟡', label: 'Atenção', rank: 1 },
  alto: { emoji: '🟠', label: 'Alto', rank: 2 },
  critico: { emoji: '🔴', label: 'Crítico', rank: 3 },
};

export interface BlockRisk { block: BlockId; name: string; percent: number; source: string; level: RiskLevel; eliminatory: boolean; min: number; actions: string[] }
export interface Risk {
  level: RiskLevel;
  blocks: BlockRisk[];
  overall: { score: number; target: number; level: RiskLevel };
  notStarted: { topics: number; questions: number };
  lowEvidence: boolean;
  summary: string;
  projection: Projection;
}

export function computeRisk(state: AppState, stats: Record<string, TopicStats>, prio: Record<string, PriorityResult>, today: string): Risk {
  const proj = projectScore(state, stats);
  const dl = daysLeft(state, today);
  // simulado recente (até 21 dias) entra com 50% do peso
  const lastSimDate = lastSimulationDate(state);
  let simBlock: Partial<Record<BlockId, number>> = {};
  if (lastSimDate && diffDays(today, lastSimDate) <= 21) {
    const res = state.simulationResults.find((r) => r.date === lastSimDate)!;
    const sim = state.simulations.find((s) => s.id === res.simulationId);
    if (sim) {
      const rep = simulationReport(state, sim, res);
      for (const b of ['I', 'II', 'III'] as BlockId[]) if (rep.byBlock[b].total > 0) simBlock[b] = rep.byBlock[b].percent;
    }
  }
  const lowEvidence = proj.coverage < 0.3 || state.attempts.length < 50;
  const tighten = (lvl: RiskLevel): RiskLevel => {
    // com muito tempo pela frente, um nível a menos
    if (dl > 90 && lvl !== 'controlado') return (['controlado', 'atencao', 'alto', 'critico'] as RiskLevel[])[RISK_META[lvl].rank - 1];
    return lvl;
  };
  const blocks: BlockRisk[] = state.exam.blocks.map((b) => {
    const pp = proj.byBlock[b.id].percent;
    const sp = simBlock[b.id];
    const percent = sp != null ? (pp + sp) / 2 : pp;
    let level: RiskLevel;
    const ref = b.eliminatory ? b.minPercent : 0.5;
    const margin = percent - ref;
    if (margin < 0) level = dl < 60 ? 'critico' : 'alto';
    else if (margin < 0.1) level = 'alto';
    else if (margin < 0.2) level = 'atencao';
    else level = 'controlado';
    if (!b.eliminatory && level !== 'controlado') level = 'atencao';
    level = tighten(level);
    const tops = Object.values(prio)
      .filter((p) => state.disciplines.find((d) => d.id === state.topics.find((t) => t.id === p.topicId)?.disciplineId)?.block === b.id)
      .sort((a, c) => c.gain * c.score - a.gain * a.score)
      .slice(0, 3)
      .map((p) => state.topics.find((t) => t.id === p.topicId)!.name);
    return { block: b.id, name: b.name, percent, source: sp != null ? 'projeção + último simulado' : 'projeção pelo domínio', level, eliminatory: b.eliminatory, min: b.minPercent, actions: tops };
  });
  const target = state.exam.targetPercent * 10;
  const score = blocks.reduce((a, b) => a + b.percent * (state.exam.blocks.find((x) => x.id === b.block)!.questions), 0) / state.exam.totalQuestions * 10;
  let ol: RiskLevel = score >= target ? 'controlado' : score >= target - 1 ? 'atencao' : score >= state.exam.minFinalScore ? 'alto' : 'critico';
  ol = tighten(ol);
  let notStartedTopics = 0, nsQ = 0;
  for (const t of state.topics) if (!stats[t.id]?.started) { notStartedTopics++; nsQ += expectedQuestions(state, t); }
  const worst = [...blocks.filter((b) => b.eliminatory).map((b) => b.level), ol].sort((a, b) => RISK_META[b].rank - RISK_META[a].rank)[0];
  const elimWorst = blocks.filter((b) => b.eliminatory).sort((a, b) => RISK_META[b.level].rank - RISK_META[a.level].rank)[0];
  const summary = lowEvidence
    ? `Base em construção: ${Math.round(proj.coverage * 100)}% do peso do edital já iniciado. O risco fica mais preciso conforme você registra questões.`
    : worst === 'controlado'
      ? 'Risco controlado. Mantenha o ciclo e os simulados.'
      : `Onde agir primeiro: ${elimWorst && RISK_META[elimWorst.level].rank >= 1 ? `Bloco ${elimWorst.block} (${elimWorst.name})` : 'nota geral'} — ${elimWorst?.actions[0] ?? ''}.`;
  return { level: worst, blocks, overall: { score, target, level: ol }, notStarted: { topics: notStartedTopics, questions: nsQ }, lowEvidence, summary, projection: proj };
}
