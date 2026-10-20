// Simulados progressivos e relatório automático.

import type { AppState, BlockId, PhaseId, Simulation, SimulationResult } from '../types';
import { diffDays, uid } from './dates';
import type { PriorityResult } from './priority';

/** Faixas de questões nos cadernos anteriores (para indicar onde fazer o simulado). */
export const PAST_EXAM_RANGES: Record<string, Record<string, string>> = {
  '2025': { port: 'Q1–Q16', direito: 'Q17–Q46', atual: 'Q47–Q50', mat: 'Q51–Q54', info: 'Q55–Q63', rlm: 'Q64–Q70' },
  '2021': { port: 'Q1–Q24', direito: 'Q25–Q64', atual: 'Q65–Q70', mat: 'Q71–Q76', info: 'Q77–Q90', rlm: 'Q91–Q100' },
  '2018': { port: 'Q1–Q24', direito: 'Q25–Q64', atual: 'Q65–Q70', mat: 'Q71–Q76', info: 'Q77–Q90', rlm: 'Q91–Q100' },
};

const INTERVAL: Record<PhaseId, number> = { 1: 14, 2: 14, 3: 10, 4: 10, 5: 7 };

export function lastSimulationDate(state: AppState): string | null {
  const ds = state.simulationResults.map((r) => r.date).sort();
  return ds.length ? ds[ds.length - 1] : null;
}

export function simulationDue(state: AppState, phase: PhaseId, todayIso: string): boolean {
  const last = lastSimulationDate(state);
  if (!last) return phase >= 2 || state.attempts.length >= 60;
  return diffDays(todayIso, last) >= INTERVAL[phase];
}

function dist(state: AppState, blocks: BlockId[]) {
  return state.disciplines
    .filter((d) => d.active && blocks.includes(d.block))
    .sort((a, b) => a.order - b.order)
    .map((d) => ({ disciplineId: d.id, questions: d.questions }));
}

export function nextSimulationSpec(state: AppState, phase: PhaseId, prio: Record<string, PriorityResult>): Simulation {
  const done = state.simulationResults.length;
  const usedFull2025 = state.simulationResults.some((r) => state.simulations.find((s) => s.id === r.simulationId)?.source.includes('2025'));
  const base = { id: uid('sim-'), createdAt: Date.now() };
  if (phase >= 4) {
    const src = !usedFull2025
      ? 'Caderno TJSP 2025 (TJSP2503) completo — prova real no modelo atual. Gabarito: VUNESP ou QConcursos.'
      : 'QConcursos → Simulado VUNESP TJ-SP Escrevente (70 questões na distribuição do edital) ou caderno 2021/2018 recortado na mesma distribuição.';
    return {
      ...base, kind: 'completo', title: 'Simulado completo — formato da prova',
      durationMin: state.exam.durationMin, distribution: dist(state, ['I', 'II', 'III']), withEssay: true, source: src,
      order: ['Bloco I — Português', 'Bloco II — Direito', 'Bloco III — Conhecimentos Gerais', 'Redação (1h15)', 'Folha de respostas (15 min)'],
    };
  }
  if (phase === 3) {
    return {
      ...base, kind: 'parcial', title: 'Simulado parcial — blocos eliminatórios (I + II)',
      durationMin: 140, distribution: dist(state, ['I', 'II']), withEssay: false,
      source: `Caderno TJSP ${done % 2 === 0 ? '2021' : '2018'}: Português ${PAST_EXAM_RANGES['2021'].port} (use 16) e Direito ${PAST_EXAM_RANGES['2021'].direito} (use 30, sem improbidade antiga) — ou QConcursos na mesma distribuição.`,
      order: ['Bloco I — Português', 'Bloco II — Direito'],
    };
  }
  if (phase === 2) {
    const blockI = done % 2 === 0;
    return {
      ...base, kind: 'parcial', title: blockI ? 'Simulado parcial — Bloco I (Português)' : 'Simulado parcial — Bloco II (Direito)',
      durationMin: blockI ? 50 : 80, distribution: dist(state, [blockI ? 'I' : 'II']), withEssay: false,
      source: blockI ? `Caderno TJSP 2025: Português ${PAST_EXAM_RANGES['2025'].port}` : `Caderno TJSP 2021: Direito ${PAST_EXAM_RANGES['2021'].direito} (30 questões, pule improbidade Q57 e Q59)`,
      order: [blockI ? 'Bloco I — Português' : 'Bloco II — Direito'],
    };
  }
  // Fase 1: mini-bloco da disciplina mais prioritária
  const top = Object.values(prio).sort((a, b) => b.score - a.score)[0];
  const t = top && state.topics.find((x) => x.id === top.topicId);
  const disc = t ? state.disciplines.find((d) => d.id === t.disciplineId) : state.disciplines[0];
  const n = 15;
  return {
    ...base, kind: 'mini', title: `Mini-simulado — ${disc?.short ?? 'Disciplina'} (${n} questões)`,
    durationMin: Math.round(n * (disc?.pacePerQuestionMin ?? 2) + 5), distribution: [{ disciplineId: disc?.id ?? 'port', questions: n }], withEssay: false,
    source: 'QConcursos → VUNESP · TJ-SP · Escrevente, disciplina indicada, sem filtro de assunto (mistura temas já estudados e novos)',
    order: [disc?.name ?? ''],
  };
}

export interface SimulationReport {
  score10: number;
  percent: number;
  byBlock: Record<BlockId, { correct: number; total: number; percent: number; pass: boolean; eliminatory: boolean }>;
  eliminatedBy: BlockId[];
  approvedObjective: boolean | null;
  byDiscipline: { disciplineId: string; correct: number; total: number; percent: number }[];
  weakest: string[];
  essay: { score: number; pass: boolean } | null;
  comparison: string | null;
  actions: string[];
}

export function simulationReport(state: AppState, sim: Simulation, res: SimulationResult): SimulationReport {
  const byBlock: SimulationReport['byBlock'] = {
    I: { correct: 0, total: 0, percent: 0, pass: true, eliminatory: true },
    II: { correct: 0, total: 0, percent: 0, pass: true, eliminatory: true },
    III: { correct: 0, total: 0, percent: 0, pass: true, eliminatory: false },
  };
  const byDiscipline: SimulationReport['byDiscipline'] = [];
  let c = 0, t = 0;
  for (const d of sim.distribution) {
    const disc = state.disciplines.find((x) => x.id === d.disciplineId);
    if (!disc) continue;
    const cor = res.correct[d.disciplineId] ?? 0;
    const tot = res.total[d.disciplineId] ?? d.questions;
    byBlock[disc.block].correct += cor;
    byBlock[disc.block].total += tot;
    byDiscipline.push({ disciplineId: d.disciplineId, correct: cor, total: tot, percent: tot ? cor / tot : 0 });
    c += cor; t += tot;
  }
  const eliminatedBy: BlockId[] = [];
  for (const b of ['I', 'II', 'III'] as BlockId[]) {
    const blk = state.exam.blocks.find((x) => x.id === b);
    const bb = byBlock[b];
    bb.percent = bb.total ? bb.correct / bb.total : 0;
    bb.eliminatory = !!blk?.eliminatory;
    bb.pass = !blk?.eliminatory || bb.total === 0 || bb.percent >= blk.minPercent;
    if (!bb.pass) eliminatedBy.push(b);
  }
  const percent = t ? c / t : 0;
  const score10 = 10 * percent;
  const full = sim.kind === 'completo';
  const approvedObjective = full ? eliminatedBy.length === 0 && score10 >= state.exam.minFinalScore : null;
  const weakest = [...byDiscipline].filter((d) => d.total >= 3).sort((a, b) => a.percent - b.percent).slice(0, 3).map((d) => d.disciplineId);
  const essay = res.essayScore != null ? { score: res.essayScore, pass: res.essayScore >= state.exam.essay.minScore } : null;

  // comparação com o simulado anterior do mesmo tipo
  let comparison: string | null = null;
  const prev = state.simulationResults
    .filter((r) => r.id !== res.id && r.date <= res.date && state.simulations.find((s) => s.id === r.simulationId)?.kind === sim.kind)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (prev) {
    const pc = Object.values(prev.correct).reduce((a, b) => a + b, 0);
    const pt = Object.values(prev.total).reduce((a, b) => a + b, 0);
    if (pt) {
      const diff = Math.round(100 * (percent - pc / pt));
      comparison = diff > 0 ? `${diff} pontos percentuais acima do simulado anterior do mesmo tipo.` : diff < 0 ? `${-diff} pontos percentuais abaixo do anterior. Vamos ajustar as prioridades com base nisso.` : 'Mesmo resultado do simulado anterior do mesmo tipo.';
    }
  }
  const actions: string[] = [];
  for (const b of eliminatedBy) actions.push(`Bloco ${b} ficou abaixo do mínimo de 50%: ele recebe prioridade extra nas próximas missões.`);
  for (const id of weakest) {
    const d = state.disciplines.find((x) => x.id === id);
    const r = byDiscipline.find((x) => x.disciplineId === id)!;
    if (d && r.percent < 0.7) actions.push(`${d.short}: ${Math.round(r.percent * 100)}% — esse ponto precisa de reforço.`);
  }
  if (essay && !essay.pass) actions.push(`Redação estimada em ${essay.score}/40 (mínimo 24): reforçar a etapa atual da redação.`);
  if (!actions.length) actions.push('Resultado estável. As próximas missões mantêm o foco nos tópicos de maior retorno.');
  return { score10, percent, byBlock, eliminatedBy, approvedObjective, byDiscipline, weakest, essay, comparison, actions };
}
