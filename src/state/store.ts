// Store único com ações. A UI só chama ações; toda regra mora no motor (src/engine).

import { useMemo, useSyncExternalStore } from 'react';
import type {
  AppState, Difficulty, ErrorEntry, Essay, Flashcard, Mood, QuestionAttempt, ResultClass,
  SessionKind, Settings, Simulation, SimulationResult, TaskKind,
} from '../types';
import { createInitialState, LOCKED_DATE, migrate } from './seed';
import { loadRaw, saveRaw } from './persist';
import * as sync from './sync';
import { addDays, diffDays, today as todayFn, uid } from '../engine/dates';
import { computeDisciplineStats, computeTopicStats, RESULT_META } from '../engine/mastery';
import { computePriorities, currentPhase } from '../engine/priority';
import { buildMission, defaultMinutesFor, findOpenCycle, type MissionContext } from '../engine/mission';
import { answerFlashcard, nextReview, type FlashAnswer } from '../engine/review';
import { shouldStartProtocol } from '../engine/absence';
import { buildWeeklyReport, needsWeeklyReport, snapshotMetric } from '../engine/weekly';
import { computeRisk } from '../engine/metrics';

let state: AppState = createInitialState();
let loaded = false;
let saveStatus: { idb: boolean; ls: boolean } = { idb: false, ls: false };
let syncStatus: 'desligada' | 'ok' | 'indisponivel' | 'erro' | 'enviando' = 'desligada';
const listeners = new Set<() => void>();
let saveTimer: any = null;
let syncTimer: any = null;
let todayOverride: string | null = null;

export function getToday(): string {
  return todayOverride ?? todayFn();
}
/** Só para testes. */
export function __setToday(d: string | null) { todayOverride = d; }

function emit() { listeners.forEach((l) => l()); }

export function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }
export function getState() { return state; }
export function isLoaded() { return loaded; }
export function getSaveStatus() { return saveStatus; }
export function getSyncStatus() { return syncStatus; }

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveStatus = await saveRaw(state);
    emit();
  }, 300);
  if (state.settings.syncEnabled) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      syncStatus = 'enviando'; emit();
      syncStatus = await sync.push(state);
      emit();
    }, 4000);
  }
}

export function setState(fn: (s: AppState) => AppState | void, opts: { save?: boolean } = {}) {
  const draft = structuredClone(state);
  const res = fn(draft) || draft;
  res.updatedAt = Date.now();
  state = res;
  if (opts.save !== false) scheduleSave();
  emit();
}

// ───────────────────────── INICIALIZAÇÃO ─────────────────────────

export async function init(): Promise<void> {
  const { data } = await loadRaw();
  state = data ? migrate(data) : createInitialState();
  loaded = true;
  emit();
  onOpen();
  if (state.settings.syncEnabled) void pullRemote();
}

export async function pullRemote(): Promise<'atualizado' | 'local-mais-novo' | 'vazio' | 'indisponivel'> {
  if (!sync.syncAvailable()) { syncStatus = 'indisponivel'; emit(); return 'indisponivel'; }
  const info = await sync.remoteInfo();
  if (!info) { syncStatus = 'ok'; emit(); scheduleSave(); return 'vazio'; }
  if (info.updatedAt > state.updatedAt) {
    const remote = await sync.pull();
    if (remote) {
      state = migrate(remote);
      saveStatus = await saveRaw(state);
      syncStatus = 'ok';
      emit();
      return 'atualizado';
    }
  }
  syncStatus = 'ok';
  scheduleSave();
  emit();
  return 'local-mais-novo';
}

/** Executa ao abrir: retorno após ausência, relatório semanal, missão do dia. */
export function onOpen() {
  const today = getToday();
  setState((s) => {
    if (shouldStartProtocol(s, today)) s.returnProtocol = { startedOn: today, step: 1 };
    if (needsWeeklyReport(s, today) && s.attempts.length + s.sessions.length > 0) {
      s.weeklyReports.push(buildWeeklyReport(s, today));
      s.metrics.push(snapshotMetric(s, addDays(today, -1)));
    }
    s.user.lastOpenDate = today;
    const cur = s.missions[today];
    if (!cur) s.missions[today] = generateMission(s, today, defaultMinutesFor(s, today), 'normal');
    else if (!cur.startedAt && !cur.resumedFrom && cur.tasks.every((t) => t.status === 'pendente') && findOpenCycle(s, today)) {
      // missão de hoje foi gerada antes de existir a regra do ciclo aberto: refaz com os mesmos parâmetros
      s.missions[today] = generateMission(s, today, cur.availableMin, cur.mood);
    }
  });
}

// ───────────────────────── DERIVADOS ─────────────────────────

export function derive(s: AppState, today: string) {
  const stats = computeTopicStats(s, today);
  const discStats = computeDisciplineStats(s, stats);
  const phase = currentPhase(s, stats, today);
  const prio = computePriorities(s, stats, today, phase);
  const risk = computeRisk(s, stats, prio, today);
  return { stats, discStats, phase, prio, risk, today };
}
export type Derived = ReturnType<typeof derive>;

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function useDerived(): Derived {
  const s = useAppState();
  const today = getToday();
  return useMemo(() => derive(s, today), [s, today]);
}

function ctxFor(s: AppState, today: string): MissionContext {
  const stats = computeTopicStats(s, today);
  const phase = currentPhase(s, stats, today);
  const prio = computePriorities(s, stats, today, phase);
  return { state: s, stats, prio, phase, today };
}

function generateMission(s: AppState, today: string, minutes: number, mood: Mood) {
  return buildMission(ctxFor(s, today), { minutes, mood });
}

// ───────────────────────── MISSÃO ─────────────────────────

export function setMissionParams(minutes: number, mood: Mood) {
  const today = getToday();
  setState((s) => {
    const prev = s.missions[today];
    const done = prev ? prev.tasks.filter((t) => t.status !== 'pendente') : [];
    const doneMin = done.reduce((a, t) => a + t.minutes, 0);
    const m = generateMission(s, today, Math.max(15, minutes - doneMin), mood);
    m.availableMin = minutes;
    m.tasks = [...done, ...m.tasks];
    if (prev?.startedAt) m.startedAt = prev.startedAt;
    s.missions[today] = m;
  });
}

export function regenerateMission() {
  const today = getToday();
  const m = state.missions[today];
  setMissionParams(m?.availableMin ?? defaultMinutesFor(state, today), m?.mood ?? 'normal');
}

export function startMission() {
  const today = getToday();
  setState((s) => {
    const m = s.missions[today];
    if (m && !m.startedAt) m.startedAt = Date.now();
  });
}

const KIND_TO_SESSION: Record<TaskKind, SessionKind> = {
  aprendizado: 'teoria', questoes: 'questoes', correcao: 'correcao', revisao: 'revisao', flashcards: 'flashcards',
  redacao: 'redacao', simulado: 'simulado', leiseca: 'leiseca', diagnostico: 'questoes',
};

function markActive(s: AppState, today: string) {
  s.user.lastActiveDate = today;
}

function unlockFlashcards(s: AppState, topicId: string, today: string) {
  for (const c of s.flashcards) if (c.topicId === topicId && c.nextDate === LOCKED_DATE) c.nextDate = addDays(today, 1);
}

/** Dispensa a retomada do ciclo aberto e refaz a missão de hoje sem ele. */
export function dismissCycle() {
  const today = getToday();
  const m = state.missions[today];
  if (!m?.resumedFrom) return;
  const key = `${m.resumedFrom.date}|${m.resumedFrom.topicId}`;
  setState((s) => { s.dismissedCycles = [...(s.dismissedCycles || []), key]; });
  setMissionParams(m.availableMin, m.mood);
}

/** Parei no meio: registra o tempo real e marca a tarefa como feita em parte. */
export function completeTaskPartial(taskId: string, minutesSpent: number) {
  completeTask(taskId, minutesSpent);
  const today = getToday();
  setState((s) => { const t = s.missions[today]?.tasks.find((x) => x.id === taskId); if (t) t.partial = true; });
}

export function completeTask(taskId: string, minutesSpent?: number) {
  const today = getToday();
  setState((s) => {
    const m = s.missions[today];
    const t = m?.tasks.find((x) => x.id === taskId);
    if (!m || !t || t.status === 'feita') return;
    t.status = 'feita';
    t.doneAt = Date.now();
    const minutes = Math.max(1, Math.round(minutesSpent ?? t.minutes));
    s.sessions.push({ id: uid('s-'), date: today, topicId: t.topicId, disciplineId: t.disciplineId, kind: KIND_TO_SESSION[t.kind], minutes, fromMission: true });
    if (t.topicId) unlockFlashcards(s, t.topicId, today);
    // teoria sem questões: agenda a 1ª revisão
    if ((t.kind === 'aprendizado' || t.kind === 'leiseca') && t.topicId && !s.reviews[t.topicId]) {
      s.reviews[t.topicId] = nextReview(undefined, t.topicId, today, s.settings.reviewIntervals, null);
    }
    markActive(s, today);
    if (m.tasks.every((x) => x.status !== 'pendente') && !m.completedAt) {
      m.completedAt = Date.now();
      if (s.returnProtocol) {
        s.returnProtocol.step += 1;
        if (s.returnProtocol.step > 3) s.returnProtocol = null;
      }
    }
  });
}

export function skipTask(taskId: string) {
  const today = getToday();
  setState((s) => {
    const m = s.missions[today];
    const t = m?.tasks.find((x) => x.id === taskId);
    if (!t) return;
    t.status = 'pulada';
    if (m.tasks.every((x) => x.status !== 'pendente') && !m.completedAt) m.completedAt = Date.now();
  });
}

export function startTask(taskId: string) {
  const today = getToday();
  setState((s) => {
    const t = s.missions[today]?.tasks.find((x) => x.id === taskId);
    if (t && !t.startedAt) t.startedAt = Date.now();
    const m = s.missions[today];
    if (m && !m.startedAt) m.startedAt = Date.now();
  }, { save: true });
}

// ───────────────────────── QUESTÕES ─────────────────────────

export interface AttemptInput {
  result: ResultClass;
  timeSec?: number;
  difficulty?: Difficulty;
  externalId?: string;
}

export function logAttempts(topicId: string, items: AttemptInput[], meta: { origin: QuestionAttempt['origin']; banca?: string; year?: number; source?: string; minutes?: number }) {
  if (!items.length) return [] as string[];
  const today = getToday();
  const ids: string[] = [];
  setState((s) => {
    const topic = s.topics.find((t) => t.id === topicId);
    if (!topic) return;
    const ts = Date.now();
    items.forEach((it, i) => {
      let questionId: string | undefined;
      if (it.externalId) {
        questionId = uid('q-');
        s.questions.push({ id: questionId, source: meta.source || 'QConcursos', externalId: it.externalId, banca: meta.banca || 'VUNESP', year: meta.year, disciplineId: topic.disciplineId, topicId });
      }
      const id = uid('a-');
      ids.push(id);
      s.attempts.push({ id, questionId, topicId, disciplineId: topic.disciplineId, date: today, ts: ts + i, result: it.result, timeSec: it.timeSec, difficulty: it.difficulty, banca: meta.banca || 'VUNESP', year: meta.year, origin: meta.origin, missionDate: meta.origin === 'missao' ? today : undefined });
    });
    // revisão adaptativa a partir do desempenho deste contato
    const n = items.length;
    const score = items.reduce((a, it) => a + (it.result === 'seguro' ? 1 : it.result === 'duvida' ? 0.7 : 0), 0) / n;
    const guesses = items.some((it) => it.result === 'chute');
    s.reviews[topicId] = nextReview(s.reviews[topicId], topicId, today, s.settings.reviewIntervals, score, guesses);
    unlockFlashcards(s, topicId, today);
    if (meta.origin !== 'missao' && meta.minutes) s.sessions.push({ id: uid('s-'), date: today, topicId, disciplineId: topic.disciplineId, kind: 'questoes', minutes: meta.minutes, fromMission: false });
    markActive(s, today);
  });
  return ids;
}

export function deleteAttempt(id: string) {
  setState((s) => { s.attempts = s.attempts.filter((a) => a.id !== id); });
}

// ───────────────────────── ERROS E FLASHCARDS ─────────────────────────

function flashFromError(e: ErrorEntry, topicName: string, today: string): Flashcard | null {
  if (!e.rule && !e.trap) return null;
  const concept = (e.concept || '').trim();
  let front: string;
  if (concept && /\s(×|x|vs\.?)\s/i.test(concept)) front = `Qual é a diferença entre ${concept.replace(/\s(x|vs\.?)\s/i, ' e ').replace(' × ', ' e ')}?`;
  else if (concept) front = `${concept}: qual é a regra?`;
  else front = `${topicName}: ${e.question.slice(0, 140)}`;
  const back = [e.rule, e.trap ? `Pegadinha: ${e.trap}` : ''].filter(Boolean).join('\n');
  return {
    id: uid('fc-'), topicId: e.topicId, front, back,
    source: e.reason === 'confusao' ? 'confusao' : 'erro', box: 0, nextDate: addDays(today, 1), createdAt: Date.now(), lapses: 0,
    ref: `Erro de ${e.date}`,
  };
}

export function addError(input: Omit<ErrorEntry, 'id' | 'date' | 'disciplineId'> & { date?: string }, makeFlashcard = true) {
  const today = getToday();
  setState((s) => {
    const topic = s.topics.find((t) => t.id === input.topicId);
    if (!topic) return;
    const e: ErrorEntry = { ...input, id: uid('e-'), date: input.date || today, disciplineId: topic.disciplineId };
    s.errors.push(e);
    if (makeFlashcard) {
      const fc = flashFromError(e, topic.name, today);
      if (fc) s.flashcards.push(fc);
    }
  });
}

export function updateError(id: string, patch: Partial<ErrorEntry>) {
  setState((s) => { const e = s.errors.find((x) => x.id === id); if (e) Object.assign(e, patch); });
}
export function deleteError(id: string) {
  setState((s) => { s.errors = s.errors.filter((x) => x.id !== id); });
}

export function addFlashcard(c: Pick<Flashcard, 'topicId' | 'front' | 'back' | 'source'>) {
  const today = getToday();
  setState((s) => { s.flashcards.push({ ...c, id: uid('fc-'), box: 0, nextDate: today, createdAt: Date.now(), lapses: 0 }); });
}
export function deleteFlashcard(id: string) {
  setState((s) => { s.flashcards = s.flashcards.filter((x) => x.id !== id); });
}
export function answerCard(id: string, ans: FlashAnswer) {
  const today = getToday();
  setState((s) => {
    const i = s.flashcards.findIndex((x) => x.id === id);
    if (i >= 0) s.flashcards[i] = answerFlashcard(s.flashcards[i], ans, today);
    markActive(s, today);
  });
}

export function completeReview(topicId: string, score: number, minutes = 5) {
  const today = getToday();
  setState((s) => {
    s.reviews[topicId] = nextReview(s.reviews[topicId], topicId, today, s.settings.reviewIntervals, score);
    const topic = s.topics.find((t) => t.id === topicId);
    s.sessions.push({ id: uid('s-'), date: today, topicId, disciplineId: topic?.disciplineId, kind: 'revisao', minutes, fromMission: false });
    markActive(s, today);
  });
}

export function logStudy(topicId: string, kind: SessionKind, minutes: number) {
  const today = getToday();
  setState((s) => {
    const topic = s.topics.find((t) => t.id === topicId);
    s.sessions.push({ id: uid('s-'), date: today, topicId, disciplineId: topic?.disciplineId, kind, minutes, fromMission: false });
    if (!s.reviews[topicId] && (kind === 'teoria' || kind === 'leiseca')) s.reviews[topicId] = nextReview(undefined, topicId, today, s.settings.reviewIntervals, null);
    unlockFlashcards(s, topicId, today);
    markActive(s, today);
  });
}

// ───────────────────────── SIMULADOS E REDAÇÃO ─────────────────────────

export function saveSimulation(sim: Simulation) {
  setState((s) => { if (!s.simulations.some((x) => x.id === sim.id)) s.simulations.push(sim); });
}

export function saveSimulationResult(sim: Simulation, res: Omit<SimulationResult, 'id' | 'simulationId'>) {
  const today = getToday();
  const id = uid('sr-');
  setState((s) => {
    if (!s.simulations.some((x) => x.id === sim.id)) s.simulations.push(sim);
    s.simulationResults.push({ ...res, id, simulationId: sim.id });
    if (res.minutesUsed) s.sessions.push({ id: uid('s-'), date: res.date, kind: 'simulado', minutes: res.minutesUsed, fromMission: false });
    // completa a tarefa de simulado do dia, se houver
    const m = s.missions[today];
    const t = m?.tasks.find((x) => x.kind === 'simulado' && x.status === 'pendente');
    if (t) { t.status = 'feita'; t.doneAt = Date.now(); if (m.tasks.every((x) => x.status !== 'pendente')) m.completedAt = Date.now(); }
    markActive(s, today);
  });
  return id;
}

export function deleteSimulationResult(id: string) {
  setState((s) => { s.simulationResults = s.simulationResults.filter((r) => r.id !== id); });
}

export function saveEssay(e: Omit<Essay, 'id'>) {
  const today = getToday();
  setState((s) => {
    s.essays.push({ ...e, id: uid('es-') });
    if (e.minutes) s.sessions.push({ id: uid('s-'), date: e.date, kind: 'redacao', minutes: e.minutes, fromMission: false });
    const m = s.missions[today];
    const t = m?.tasks.find((x) => x.kind === 'redacao' && x.status === 'pendente');
    if (t) { t.status = 'feita'; t.doneAt = Date.now(); if (m.tasks.every((x) => x.status !== 'pendente')) m.completedAt = Date.now(); }
    markActive(s, today);
  });
}

export function deleteEssay(id: string) {
  setState((s) => { s.essays = s.essays.filter((e) => e.id !== id); });
}

// ───────────────────────── CONFIGURAÇÃO ─────────────────────────

export function updateSettings(patch: Partial<Settings>) {
  setState((s) => {
    s.settings = { ...s.settings, ...patch, weights: { ...s.settings.weights, ...(patch.weights || {}) }, materials: { ...s.settings.materials, ...(patch.materials || {}) } };
    s.exam.date = s.settings.examDate;
    s.user.region = s.settings.region;
  });
}

export function updateExam(patch: Partial<AppState['exam']>) {
  setState((s) => { s.exam = { ...s.exam, ...patch }; });
}

export function updateDiscipline(id: string, patch: Partial<AppState['disciplines'][number]>) {
  setState((s) => { const d = s.disciplines.find((x) => x.id === id); if (d) Object.assign(d, patch); });
}

export function updateUser(patch: Partial<AppState['user']>) {
  setState((s) => { s.user = { ...s.user, ...patch }; });
}

export function addDistraction(minutes: number) {
  const today = getToday();
  setState((s) => {
    const d = s.distraction.find((x) => x.date === today);
    if (d) d.minutes = Math.max(0, d.minutes + minutes);
    else s.distraction.push({ date: today, minutes: Math.max(0, minutes) });
  });
}

export function markRestDay() {
  const today = getToday();
  setState((s) => {
    const m = s.missions[today];
    if (m) { m.mode = 'normal'; m.message = 'Descanso também faz parte do projeto. Amanhã a missão já estará pronta.'; m.tasks = m.tasks.map((t) => ({ ...t, status: t.status === 'pendente' ? 'pulada' : t.status })); m.completedAt = Date.now(); }
  });
}

// ───────────────────────── BACKUP ─────────────────────────

export function exportJSON(): string {
  return JSON.stringify({ app: 'projeto-tjsp', exportedAt: new Date().toISOString(), state }, null, 1);
}

export function importJSON(text: string): { ok: boolean; message: string } {
  try {
    const parsed = JSON.parse(text);
    const raw = parsed?.state ?? parsed;
    if (!raw || !raw.topics || !raw.user) return { ok: false, message: 'Arquivo não reconhecido. Use um backup exportado pelo Projeto TJSP.' };
    state = migrate(raw);
    state.updatedAt = Date.now();
    scheduleSave();
    emit();
    onOpen();
    return { ok: true, message: `Backup importado: ${state.attempts.length} questões, ${state.errors.length} erros, ${state.flashcards.length} flashcards.` };
  } catch {
    return { ok: false, message: 'Não foi possível ler o arquivo. Confira se é o JSON completo do backup.' };
  }
}

/** Importa tentativas de um CSV (ex.: exportado do QConcursos ou planilha própria). */
export function importAttemptsCSV(text: string): { ok: number; skipped: number } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { ok: 0, skipped: 0 };
  const sep = lines[0].includes(';') ? ';' : ',';
  const header = lines[0].toLowerCase().split(sep).map((h) => h.trim());
  const idx = (k: string) => header.indexOf(k);
  const iT = idx('topico'), iR = idx('resultado'), iD = idx('data'), iA = idx('ano'), iQ = idx('codigo');
  const VALID = Object.keys(RESULT_META) as ResultClass[];
  let ok = 0, skipped = 0;
  const today = getToday();
  setState((s) => {
    for (const line of lines.slice(1)) {
      const c = line.split(sep).map((x) => x.trim());
      const topic = s.topics.find((t) => t.id === c[iT] || t.name.toLowerCase() === (c[iT] || '').toLowerCase());
      const res = (c[iR] || '').toLowerCase() as ResultClass;
      if (!topic || !VALID.includes(res)) { skipped++; continue; }
      const date = /^\d{4}-\d{2}-\d{2}$/.test(c[iD] || '') ? c[iD] : today;
      s.attempts.push({ id: uid('a-'), topicId: topic.id, disciplineId: topic.disciplineId, date, ts: Date.now() + ok, result: res, origin: 'importado', banca: 'VUNESP', year: Number(c[iA]) || undefined, questionId: c[iQ] || undefined });
      ok++;
    }
  });
  return { ok, skipped };
}

export async function setSync(enabled: boolean) {
  updateSettings({ syncEnabled: enabled });
  if (enabled) await pullRemote();
  else { syncStatus = 'desligada'; emit(); }
}

export function resetAll() {
  state = createInitialState();
  scheduleSave();
  emit();
  onOpen();
}

export function daysSince(iso: string | null): number | null {
  return iso ? diffDays(getToday(), iso) : null;
}

export function strictScoreOf(items: { result: ResultClass }[]): number {
  if (!items.length) return 0;
  return items.reduce((a, it) => a + (it.result === 'seguro' ? 1 : it.result === 'duvida' ? 0.7 : 0), 0) / items.length;
}

export { RESULT_META, computeRisk };
