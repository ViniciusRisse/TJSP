// Cálculo de domínio por tópico. Domínio vem só de evidência (questões), nunca de horas.

import type { AppState, QuestionAttempt, ResultClass } from '../types';
import { diffDays } from './dates';

export const RESULT_VALUE: Record<ResultClass, number> = {
  seguro: 1,
  duvida: 0.6,
  chute: 0.25,      // chute NÃO é domínio
  conhecimento: 0,
  atencao: 0,
  interpretacao: 0,
  confusao: 0,
};

export const RESULT_META: Record<ResultClass, { emoji: string; label: string; short: string; correct: boolean; color: string }> = {
  seguro: { emoji: '🟢', label: 'Acertei com segurança', short: 'Seguro', correct: true, color: '#2e8b57' },
  chute: { emoji: '🟡', label: 'Acertei chutando', short: 'Chute', correct: true, color: '#d4a017' },
  duvida: { emoji: '🟠', label: 'Acertei com dúvida', short: 'Dúvida', correct: true, color: '#e07b24' },
  conhecimento: { emoji: '🔴', label: 'Errei por falta de conhecimento', short: 'Não sabia', correct: false, color: '#c0392b' },
  atencao: { emoji: '🔵', label: 'Errei por atenção', short: 'Atenção', correct: false, color: '#2f6fb3' },
  interpretacao: { emoji: '🟣', label: 'Errei por interpretação', short: 'Interpretação', correct: false, color: '#7d4bb3' },
  confusao: { emoji: '⚫', label: 'Errei por confusão entre institutos', short: 'Confusão', correct: false, color: '#333333' },
};

export const RESULT_ORDER: ResultClass[] = ['seguro', 'duvida', 'chute', 'conhecimento', 'atencao', 'interpretacao', 'confusao'];

export const PRIOR = 0.3;       // domínio presumido sem evidência
export const PRIOR_WEIGHT = 5;  // equivale a 5 questões fictícias — evita falsa sensação de domínio
export const HALF_LIFE_DAYS = 30;

export type TopicStatus = 'nao-iniciado' | 'em-estudo' | 'consolidacao' | 'dominado' | 'reforco';

export const STATUS_META: Record<TopicStatus, { emoji: string; label: string }> = {
  'nao-iniciado': { emoji: '⚪', label: 'Não iniciado' },
  'em-estudo': { emoji: '🔵', label: 'Em estudo' },
  consolidacao: { emoji: '🟡', label: 'Em consolidação' },
  dominado: { emoji: '🟢', label: 'Dominado' },
  reforco: { emoji: '🔴', label: 'Precisa de reforço' },
};

export interface TopicStats {
  topicId: string;
  n: number;              // tentativas registradas
  nEff: number;           // peso efetivo (recência)
  mastery: number;        // 0–100
  started: boolean;
  correctStrict: number;  // 🟢 + 🟠
  correctAny: number;     // inclui 🟡
  wrong: number;
  guesses: number;
  accuracy: number | null;// acerto bruto (inclui chute) — para exibir
  lastDate: string | null;
  errors14: number;
  recurring: boolean;
  recurringTypes: ResultClass[];
  levelA: number | null;  // conhecimento
  levelB: number | null;  // reconhecimento de pegadinha
  status: TopicStatus;
  minutes: number;
}

export function masteryLabel(m: number): string {
  if (m <= 20) return 'desconhecido';
  if (m <= 40) return 'muito fraco';
  if (m <= 60) return 'fraco';
  if (m <= 70) return 'em desenvolvimento';
  if (m <= 80) return 'bom';
  if (m <= 90) return 'forte';
  return 'muito forte';
}

const DIFF_FACTOR = { facil: 0.8, media: 1, dificil: 1.2 } as const;

export function attemptWeight(a: QuestionAttempt, todayIso: string): number {
  const age = Math.max(0, diffDays(todayIso, a.date));
  const rec = Math.pow(0.5, age / HALF_LIFE_DAYS);
  return rec * (a.difficulty ? DIFF_FACTOR[a.difficulty] : 1);
}

/** Domínio de um conjunto de tentativas. */
export function masteryOf(attempts: QuestionAttempt[], todayIso: string, extraPenalty = 0): { mastery: number; nEff: number } {
  let sw = 0, sv = 0;
  for (const a of attempts) {
    const w = attemptWeight(a, todayIso);
    sw += w;
    sv += w * RESULT_VALUE[a.result];
  }
  const p = (sv + PRIOR * PRIOR_WEIGHT) / (sw + PRIOR_WEIGHT);
  const m = Math.round(100 * p) - extraPenalty;
  return { mastery: Math.max(0, Math.min(100, m)), nEff: sw };
}

export function computeTopicStats(state: AppState, todayIso: string): Record<string, TopicStats> {
  const byTopic: Record<string, QuestionAttempt[]> = {};
  for (const a of state.attempts) (byTopic[a.topicId] ||= []).push(a);
  const minutesByTopic: Record<string, number> = {};
  const touched = new Set<string>();
  for (const s of state.sessions) {
    if (!s.topicId) continue;
    minutesByTopic[s.topicId] = (minutesByTopic[s.topicId] || 0) + s.minutes;
    touched.add(s.topicId);
  }
  const conceptCount: Record<string, Record<string, number>> = {};
  for (const e of state.errors) {
    if (!e.concept || e.resolved) continue;
    const k = e.concept.trim().toLowerCase();
    (conceptCount[e.topicId] ||= {})[k] = ((conceptCount[e.topicId] || {})[k] || 0) + 1;
  }

  const out: Record<string, TopicStats> = {};
  for (const t of state.topics) {
    const list = byTopic[t.id] || [];
    let correctStrict = 0, correctAny = 0, wrong = 0, guesses = 0, errors14 = 0;
    let lastDate: string | null = null;
    const recent30: Record<string, number> = {};
    let wA = 0, wAerr = 0, wBerr = 0;
    for (const a of list) {
      const meta = RESULT_META[a.result];
      if (meta.correct) correctAny++;
      if (a.result === 'seguro' || a.result === 'duvida') correctStrict++;
      if (a.result === 'chute') guesses++;
      if (!meta.correct) wrong++;
      const age = diffDays(todayIso, a.date);
      if (!meta.correct && age <= 14) errors14++;
      if (!meta.correct && age <= 30) recent30[a.result] = (recent30[a.result] || 0) + 1;
      if (!lastDate || a.date > lastDate) lastDate = a.date;
      const w = attemptWeight(a, todayIso);
      wA += w;
      if (a.result === 'conhecimento') wAerr += w;
      if (a.result === 'confusao' || a.result === 'atencao' || a.result === 'interpretacao') wBerr += w;
      if (a.result === 'duvida' || a.result === 'chute') wBerr += 0.5 * w;
    }
    const recurringTypes = (Object.keys(recent30) as ResultClass[]).filter((k) => recent30[k] >= 3);
    const repeatedConcepts = Object.values(conceptCount[t.id] || {}).filter((c) => c >= 2).length;
    const recurring = recurringTypes.length > 0 || repeatedConcepts > 0;
    const penalty = recurringTypes.reduce((acc, k) => acc + 4 * (recent30[k] - 2), 0) + repeatedConcepts * 3;
    const { mastery, nEff } = masteryOf(list, todayIso, Math.min(15, penalty));
    const started = list.length > 0 || touched.has(t.id);
    const n = list.length;
    let status: TopicStatus;
    if (!started) status = 'nao-iniciado';
    else if (recurring || (n >= 8 && mastery < 45)) status = 'reforco';
    else if (mastery >= 81 && n >= 20) status = 'dominado';
    else if (mastery >= 61 && n >= 8) status = 'consolidacao';
    else status = 'em-estudo';
    out[t.id] = {
      topicId: t.id, n, nEff, mastery, started,
      correctStrict, correctAny, wrong, guesses,
      accuracy: n ? correctAny / n : null,
      lastDate: lastDate || null,
      errors14, recurring, recurringTypes,
      levelA: wA > 0 ? Math.round(100 * (1 - wAerr / wA)) : null,
      levelB: wA > 0 ? Math.round(100 * Math.max(0, 1 - wBerr / wA)) : null,
      status,
      minutes: minutesByTopic[t.id] || 0,
    };
  }
  return out;
}

export interface DisciplineStats {
  disciplineId: string;
  mastery: number;         // média ponderada pelo peso do tópico
  coverage: number;        // fração (ponderada) de tópicos iniciados
  n: number;
  accuracy: number | null;
  strictAccuracy: number | null;
  critical: number;
  dominated: number;
}

export function computeDisciplineStats(state: AppState, stats: Record<string, TopicStats>): Record<string, DisciplineStats> {
  const out: Record<string, DisciplineStats> = {};
  for (const d of state.disciplines) {
    const ts = state.topics.filter((t) => t.disciplineId === d.id);
    const totalShare = ts.reduce((a, t) => a + t.share, 0) || 1;
    let m = 0, cov = 0, n = 0, ca = 0, cs = 0, critical = 0, dominated = 0;
    for (const t of ts) {
      const s = stats[t.id];
      const w = t.share / totalShare;
      m += w * (s.started ? s.mastery : Math.min(s.mastery, 20));
      if (s.started) cov += w;
      n += s.n; ca += s.correctAny; cs += s.correctStrict;
      if (s.status === 'reforco') critical++;
      if (s.status === 'dominado') dominated++;
    }
    out[d.id] = { disciplineId: d.id, mastery: Math.round(m), coverage: cov, n, accuracy: n ? ca / n : null, strictAccuracy: n ? cs / n : null, critical, dominated };
  }
  return out;
}
