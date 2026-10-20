// Revisão espaçada adaptativa (tópicos) e caixas de Leitner (flashcards).
// Revisões vencidas formam uma FILA priorizada — nunca uma dívida.

import type { AppState, Flashcard, Review } from '../types';
import { addDays, diffDays } from './dates';
import type { PriorityResult } from './priority';

export function nextReview(
  prev: Review | undefined,
  topicId: string,
  todayIso: string,
  intervals: number[],
  score: number | null,   // 0..1 desempenho no contato; null = só teoria
  hadGuesses = false,
): Review {
  const base = intervals.length ? intervals : [1, 7, 21, 45, 90];
  const r: Review = prev
    ? { ...prev, history: [...prev.history] }
    : { topicId, stage: 0, ease: 2.0, intervalDays: base[0], nextDate: addDays(todayIso, base[0]), history: [] };

  if (score == null) {
    if (r.stage === 0) r.stage = 1;
    r.intervalDays = Math.max(1, Math.round(base[Math.min(r.stage - 1, base.length - 1)]));
  } else {
    r.history.push({ date: todayIso, score: Math.round(score * 100) });
    if (score >= 0.85 && !hadGuesses) {
      r.stage = Math.min(base.length, r.stage + 1);
      r.ease = Math.min(2.5, r.ease + 0.1);
    } else if (score >= 0.6) {
      r.stage = Math.max(1, r.stage);
    } else {
      r.stage = 1;
      r.ease = Math.max(1.3, r.ease - 0.2);
    }
    const baseInterval = base[Math.min(r.stage - 1, base.length - 1)];
    // facilidade 2.0 = intervalo base; acima alonga, abaixo encurta
    let interval = baseInterval * (r.ease / 2);
    if (score < 0.6) interval = Math.min(3, Math.max(1, interval));
    r.intervalDays = Math.max(1, Math.round(interval));
  }
  r.lastDate = todayIso;
  r.nextDate = addDays(todayIso, r.intervalDays);
  return r;
}

export interface DueReview {
  topicId: string;
  overdueRatio: number;   // >1 = vencida há mais de 1 intervalo
  quickCheck: boolean;    // muito vencida → checagem rápida, não revisão completa
  rank: number;
}

export function dueReviews(state: AppState, todayIso: string, prio: Record<string, PriorityResult>): DueReview[] {
  const out: DueReview[] = [];
  for (const r of Object.values(state.reviews)) {
    if (todayIso < r.nextDate) continue;
    const late = diffDays(todayIso, r.nextDate);
    const ratio = 1 + late / Math.max(1, r.intervalDays);
    const p = prio[r.topicId]?.score ?? 0;
    out.push({ topicId: r.topicId, overdueRatio: ratio, quickCheck: ratio > 2, rank: p * (1 + Math.min(1, late / 7) * 0.3) });
  }
  return out.sort((a, b) => b.rank - a.rank);
}

export const FLASH_BOXES = [1, 3, 7, 15, 30, 60];
export type FlashAnswer = 'errei' | 'dificil' | 'acertei' | 'facil';

export function answerFlashcard(c: Flashcard, ans: FlashAnswer, todayIso: string): Flashcard {
  const card = { ...c };
  if (ans === 'errei') { card.box = 0; card.lapses += 1; card.nextDate = addDays(todayIso, 1); return card; }
  if (ans === 'dificil') { card.nextDate = addDays(todayIso, Math.max(1, Math.round(FLASH_BOXES[card.box] / 2))); return card; }
  card.box = Math.min(FLASH_BOXES.length - 1, card.box + (ans === 'facil' ? 2 : 1));
  card.nextDate = addDays(todayIso, FLASH_BOXES[card.box]);
  return card;
}

export function dueFlashcards(state: AppState, todayIso: string, prio: Record<string, PriorityResult>): Flashcard[] {
  return state.flashcards
    .filter((c) => c.nextDate <= todayIso)
    .sort((a, b) => (b.lapses - a.lapses) || ((prio[b.topicId]?.score ?? 0) - (prio[a.topicId]?.score ?? 0)));
}
