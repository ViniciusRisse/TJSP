// Ritmo real da estudante: compara o tempo previsto de cada tarefa com o tempo que ela realmente levou.
// O sistema ajusta as próximas missões a esse ritmo, em vez de exigir que ela se ajuste ao sistema.

import type { AppState, Subtopic, Topic } from '../types';
import { addDays } from './dates';

export interface PaceCalibration {
  learn: number;       // teoria / lei seca: real ÷ previsto
  questions: number;   // questões
  correction: number;  // correção ativa
  samples: { learn: number; questions: number; correction: number };
}

const MIN_SAMPLES = 2;
const clamp = (x: number) => Math.max(0.75, Math.min(2.5, x));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function paceCalibration(state: AppState, today: string): PaceCalibration {
  const from = addDays(today, -28);
  const buckets: Record<'learn' | 'questions' | 'correction', number[]> = { learn: [], questions: [], correction: [] };
  const dates = Object.keys(state.missions).filter((d) => d >= from && d <= today).sort();
  for (const d of dates) {
    for (const t of state.missions[d].tasks) {
      if (t.status !== 'feita' || t.partial || !t.startedAt || !t.doneAt || t.minutes <= 0) continue;
      const actual = (t.doneAt - t.startedAt) / 60000;
      if (actual < 2) continue; // concluída sem ter feito (clique direto)
      const ratio = Math.min(3, actual / t.minutes);
      if (t.kind === 'aprendizado' || t.kind === 'leiseca') buckets.learn.push(ratio);
      else if (t.kind === 'questoes' || t.kind === 'diagnostico') buckets.questions.push(ratio);
      else if (t.kind === 'correcao') buckets.correction.push(ratio);
    }
  }
  const pick = (xs: number[]) => (xs.length >= MIN_SAMPLES ? clamp(median(xs.slice(-10))) : 1);
  return {
    learn: pick(buckets.learn),
    questions: pick(buckets.questions),
    correction: pick(buckets.correction),
    samples: { learn: buckets.learn.length, questions: buckets.questions.length, correction: buckets.correction.length },
  };
}

/** Próximo pedaço (subtema) da teoria ainda não estudado. */
export function nextSubtopic(state: AppState, t: Topic): { sub: Subtopic; index: number } | null {
  const done = new Set(state.subtopicProgress?.[t.id] || []);
  const i = t.subtopics.findIndex((s) => !done.has(s.id));
  return i >= 0 ? { sub: t.subtopics[i], index: i } : null;
}
