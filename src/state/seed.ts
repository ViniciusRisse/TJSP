import type { AppState, Flashcard, Settings } from '../types';
import { DEFAULT_DISCIPLINES, DEFAULT_EXAM, DEFAULT_TOPICS } from '../data/edital';
import { DEFAULT_MATERIALS, DEFAULT_PATTERNS, REPEATED_RULES } from '../data/vunesp';

export const SCHEMA_VERSION = 1;
export const LOCKED_DATE = '9999-12-31'; // flashcard aguardando o 1º contato com o tópico

export const DEFAULT_SETTINGS: Settings = {
  examDate: DEFAULT_EXAM.date,
  region: 'Jundiaí',
  studyDays: [1, 2, 3, 4, 5, 6],
  sundayOptional: true,
  // índice = dia da semana (0 = domingo)
  defaultMinutesByWeekday: [60, 60, 60, 60, 120, 120, 120],
  badDayMinutes: 40,
  greatDayMinutes: 180,
  weights: { hist: 22, exam: 18, weak: 22, errors: 10, due: 10, elim: 10, charge: 8 },
  questionPaceFactor: 1,
  reviewIntervals: [1, 7, 21, 45, 90],
  retaFinalDays: 21,
  performanceDays: 45,
  dailyReviewCap: 4,
  idleNudgeSeconds: 120,
  distractionGoalMin: 20,
  syncEnabled: false,
  materials: { qconcursos: true, apostila: true, videos: true },
  essayPerWeek: 1,
  showReasons: true,
};

export function seedFlashcards(now: number): Flashcard[] {
  return REPEATED_RULES.map((r, i) => ({
    id: `fc-seed-${i}`, topicId: r.topicId, front: r.front, back: r.back, source: 'lei',
    box: 0, nextDate: LOCKED_DATE, createdAt: now, lapses: 0, ref: `Raio-X VUNESP: ${r.ref}`,
  }));
}

export function createInitialState(now = Date.now()): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    user: { name: '', region: 'Jundiaí', circunscricao: '5ª Circunscrição Judiciária — Jundiaí (4ª RAJ, sede Campinas)', createdAt: now, lastActiveDate: null, lastOpenDate: null, onboarded: false },
    exam: structuredClone(DEFAULT_EXAM),
    settings: structuredClone(DEFAULT_SETTINGS),
    disciplines: structuredClone(DEFAULT_DISCIPLINES),
    topics: structuredClone(DEFAULT_TOPICS),
    questions: [], attempts: [], errors: [], reviews: {}, sessions: [], missions: {},
    simulations: [], simulationResults: [],
    flashcards: seedFlashcards(now),
    materials: structuredClone(DEFAULT_MATERIALS),
    patterns: structuredClone(DEFAULT_PATTERNS),
    metrics: [], weeklyReports: [], essays: [], distraction: [],
    returnProtocol: null,
    dismissedCycles: [],
    updatedAt: now,
  };
}

/** Atualiza o conteúdo do edital vindo do código sem perder dados da usuária. */
export function migrate(raw: any): AppState {
  const base = createInitialState(raw?.user?.createdAt ?? Date.now());
  if (!raw || typeof raw !== 'object') return base;
  const s: AppState = { ...base, ...raw };
  s.settings = { ...base.settings, ...(raw.settings || {}), weights: { ...base.settings.weights, ...(raw.settings?.weights || {}) }, materials: { ...base.settings.materials, ...(raw.settings?.materials || {}) } };
  s.exam = { ...base.exam, ...(raw.exam || {}), essay: { ...base.exam.essay, ...(raw.exam?.essay || {}) } };
  s.exam.date = s.settings.examDate;
  s.user = { ...base.user, ...(raw.user || {}) };
  // disciplinas: preserva o que a usuária editou (questões, ritmo, ativo)
  const userDisc = new Map((raw.disciplines || []).map((d: any) => [d.id, d]));
  s.disciplines = base.disciplines.map((d) => {
    const u: any = userDisc.get(d.id);
    return u ? { ...d, questions: u.questions ?? d.questions, pacePerQuestionMin: u.pacePerQuestionMin ?? d.pacePerQuestionMin, active: u.active ?? d.active } : d;
  });
  // tópicos: conteúdo do edital sempre do código; tópicos personalizados preservados
  const custom = (raw.topics || []).filter((t: any) => String(t.id).startsWith('custom-'));
  s.topics = [...base.topics, ...custom];
  // flashcards iniciais novos
  const have = new Set((raw.flashcards || []).map((c: any) => c.id));
  s.flashcards = [...(raw.flashcards || []), ...base.flashcards.filter((c) => !have.has(c.id))];
  s.patterns = base.patterns;
  for (const k of ['questions', 'attempts', 'errors', 'sessions', 'simulations', 'simulationResults', 'metrics', 'weeklyReports', 'essays', 'distraction'] as const) {
    if (!Array.isArray((s as any)[k])) (s as any)[k] = [];
  }
  if (!s.reviews || typeof s.reviews !== 'object') s.reviews = {};
  if (!Array.isArray(s.dismissedCycles)) s.dismissedCycles = [];
  if (!s.missions || typeof s.missions !== 'object') s.missions = {};
  s.schemaVersion = SCHEMA_VERSION;
  return s;
}
