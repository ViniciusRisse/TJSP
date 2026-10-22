// Algoritmo da MISSÃO DE HOJE.
// Pergunta central: qual atividade mais aumenta a chance de aprovação com o tempo disponível hoje?
// Sem compensação: a missão nunca soma conteúdo de dias anteriores.

import type { AppState, DailyMission, Discipline, MissionTask, Mood, PhaseId, Topic } from '../types';
import { addDays, diffDays, uid, weekStart } from './dates';
import type { TopicStats } from './mastery';
import { PHASES, type PriorityResult } from './priority';
import { dueFlashcards, dueReviews } from './review';
import { detectReturn, lastStudiedTopics, RETURN_MESSAGE } from './absence';
import { nextSimulationSpec, simulationDue } from './simulations';
import { ESSAY_PHASES } from '../data/vunesp';
import { LINKS } from '../data/edital';
import { nextSubtopic, paceCalibration, type PaceCalibration } from './pace';

const paceCache = new WeakMap<AppState, PaceCalibration>();
function paceOf(ctx: MissionContext): PaceCalibration {
  let p = paceCache.get(ctx.state);
  if (!p) { p = paceCalibration(ctx.state, ctx.today); paceCache.set(ctx.state, p); }
  return p;
}

export const TIME_OPTIONS = [20, 40, 60, 90, 120, 180];

/** Proporção do tempo por fase: conteúdo novo / questões+correção / revisão+flashcards / redação. */
export const PHASE_MIX: Record<PhaseId, { novo: number; questoes: number; revisao: number; redacao: number }> = {
  1: { novo: 0.35, questoes: 0.4, revisao: 0.15, redacao: 0.1 },
  2: { novo: 0.25, questoes: 0.45, revisao: 0.2, redacao: 0.1 },
  3: { novo: 0.15, questoes: 0.5, revisao: 0.2, redacao: 0.15 },
  4: { novo: 0.05, questoes: 0.5, revisao: 0.25, redacao: 0.2 },
  5: { novo: 0, questoes: 0.45, revisao: 0.4, redacao: 0.15 },
};

const CORR_PER_Q = 0.5;
const r5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);

export interface MissionContext {
  state: AppState;
  stats: Record<string, TopicStats>;
  prio: Record<string, PriorityResult>;
  phase: PhaseId;
  today: string;
}

export function essayPhaseFor(state: AppState, phase: PhaseId): 1 | 2 | 3 | 4 | 5 {
  const done = state.essays.length;
  if (phase === 1) return done < 2 ? 1 : 2;
  if (phase === 2) return done < 4 ? 2 : 3;
  if (phase === 3) return 4;
  return 5;
}

export function essayDueThisWeek(state: AppState, today: string): boolean {
  const ws = weekStart(today);
  const done = state.essays.filter((e) => e.date >= ws).length;
  return done < state.settings.essayPerWeek;
}

function disc(state: AppState, id?: string): Discipline | undefined {
  return state.disciplines.find((d) => d.id === id);
}

function isDireito(d?: Discipline) {
  return d?.block === 'II';
}

/** Em disciplinas com progressão (RLM, Matemática), só o próximo tópico não iniciado é elegível como novo. */
function progressionAllowed(state: AppState, stats: Record<string, TopicStats>, t: Topic): boolean {
  if (t.progression == null || stats[t.id]?.started) return true;
  const siblings = state.topics.filter((x) => x.disciplineId === t.disciplineId && x.progression != null && !stats[x.id]?.started);
  const minP = Math.min(...siblings.map((x) => x.progression!));
  return t.progression === minP;
}

function minutesByDiscipline7d(state: AppState, today: string): Record<string, number> {
  const from = addDays(today, -7);
  const out: Record<string, number> = {};
  for (const s of state.sessions) {
    if (s.date < from || s.date >= today || !s.disciplineId) continue;
    out[s.disciplineId] = (out[s.disciplineId] || 0) + s.minutes;
  }
  return out;
}

function yesterdayMainDiscipline(state: AppState, today: string): string | undefined {
  const y = state.missions[addDays(today, -1)];
  const main = y?.tasks.find((t) => t.disciplineId && (t.kind === 'aprendizado' || t.kind === 'questoes'));
  return main?.disciplineId;
}

function difficultyHint(s: TopicStats | undefined): string {
  if (!s || s.n < 5 || s.mastery < 40) return 'Dificuldade: fácil e médio';
  if (s.mastery < 70) return 'Dificuldade: médio';
  return 'Dificuldade: médio e difícil';
}

function pastRefs(t: Topic): string | null {
  const refs: string[] = [];
  const add = (y: string, l?: string[]) => l?.forEach((q) => /^Q\d+$/.test(q) && refs.push(`${y} ${q}`));
  add('2025', t.history.y2025); add('2021', t.history.y2021); add('2018', t.history.y2018);
  return refs.length ? `Refaça no PDF da prova: ${refs.join(', ')}` : null;
}

function learnTask(ctx: MissionContext, t: Topic, minutes: number, why: string, short = false): MissionTask {
  const d = disc(ctx.state, t.disciplineId);
  const ins: string[] = [];
  // um pedaço por vez: o próximo subtema ainda não estudado
  const next = t.subtopics.length > 1 ? nextSubtopic(ctx.state, t) : null;
  const part = next ? ` (parte ${next.index + 1} de ${t.subtopics.length})` : '';
  const articles = next?.sub.articles || t.articles;
  if (next) ins.push(`Só esta parte: ${next.sub.name}${next.sub.articles ? ` — ${next.sub.articles}` : ''}. O restante do tópico vem nas próximas missões.`);
  if (isDireito(d)) {
    ins.push(`Leia a lei seca${articles ? ` (${articles})` : ''}, com todos os parágrafos.`);
    ins.push('Marque prazos, números e as palavras "salvo", "exceto", "inclusive", "desde que", "somente".');
    if (t.traps.includes('instituto-vizinho')) ins.push('Monte um quadro comparativo com o instituto vizinho (ex.: impedimento × suspeição).');
    ins.push('Anotações curtas: só o que a banca pode trocar (prazo, número, exceção, condição). Copiar a lei inteira gasta tempo e rende pouco.');
    ins.push('Termine criando 2–3 flashcards curtos (um número, uma exceção, uma diferença).');
  } else if (d?.id === 'rlm' || d?.id === 'mat') {
    ins.push('Estude o resumo do tópico com 2 exemplos resolvidos, do básico ao intermediário.');
    ins.push('Refaça os exemplos sem olhar a resolução.');
  } else if (d?.id === 'info') {
    ins.push('Estude o resumo e reproduza cada comando no computador (Word/Excel no navegador são gratuitos).');
  } else {
    ins.push('Estude o resumo/apostila do tópico (sem se estender além do tempo).');
    ins.push('Anote 3 exemplos tirados de textos reais.');
  }
  if (short) ins.unshift('Primeiro contato: só o essencial, sem tentar esgotar o assunto.');
  const where: MissionTask['where'] = [];
  if (t.where) where.push({ label: t.where });
  for (const l of t.links || []) where.push({ label: l.label, url: l.url });
  if (ctx.state.settings.materials.videos && !isDireito(d)) where.push({ label: 'Opcional: 1 vídeo curto (até 15 min) sobre o tema — só conta como estudo dentro desta tarefa' });
  return { id: uid('t-'), kind: 'aprendizado', title: `Aprendizado — ${t.name}${next ? `: ${next.sub.name}` : ''}${part}`, topicId: t.id, disciplineId: t.disciplineId, subtopicId: next?.sub.id, minutes, instructions: ins, where, why, status: 'pendente' };
}

function questionsTask(ctx: MissionContext, t: Topic, slotMin: number, why: string, withCorrection: boolean): MissionTask[] {
  const d = disc(ctx.state, t.disciplineId);
  const cal = paceOf(ctx);
  const pace = ((d?.pacePerQuestionMin ?? 2) * cal.questions) / Math.max(0.5, ctx.state.settings.questionPaceFactor);
  let q = Math.max(5, Math.floor(slotMin / (pace + CORR_PER_Q * cal.correction)));
  if (q >= 10) q = Math.floor(q / 5) * 5;
  const qMin = Math.max(5, Math.round(q * pace));
  const corr = Math.max(5, slotMin - qMin);
  const s = ctx.stats[t.id];
  const ins = [
    `Faça ${q} questões${d ? ` de ${d.short}` : ''} sobre o tópico, sem consultar material.`,
    'Para cada questão, marque mentalmente: certeza, dúvida ou chute. Chute não conta como domínio.',
    difficultyHint(s) + (s && s.n < 5 && (d?.id === 'rlm' || d?.id === 'mat') ? ' — comece pelo básico' : ''),
  ];
  if (isDireito(d)) ins.push('Nas alternativas erradas, identifique o elemento trocado: prazo, número, condição, instituto ou exceção.');
  const where: MissionTask['where'] = [];
  if (t.qcFilter) where.push({ label: t.qcFilter, url: LINKS.QC });
  const refs = pastRefs(t);
  if (refs) where.push({ label: refs });
  if (t.id.startsWith('ia-')) where.push({ label: 'Atenção: use só questões de 2022 em diante (reforma da Lei de Improbidade).' });
  const tasks: MissionTask[] = [{
    id: uid('t-'), kind: 'questoes', title: `Questões — ${t.name}`, topicId: t.id, disciplineId: t.disciplineId,
    minutes: withCorrection ? qMin : slotMin - corr + (withCorrection ? 0 : 0), questions: q, instructions: ins, where, why, status: 'pendente',
  }];
  tasks[0].minutes = qMin;
  const corrTask: MissionTask = {
    id: uid('t-'), kind: 'correcao', title: `Correção ativa — ${t.name}`, topicId: t.disciplineId ? t.id : undefined, disciplineId: t.disciplineId,
    minutes: corr, questions: q,
    instructions: [
      'Registre cada questão com a classificação: 🟢 seguro · 🟠 dúvida · 🟡 chute · 🔴 não sabia · 🔵 atenção · 🟣 interpretação · ⚫ confusão.',
      'Para cada erro, leia o comentário/lei e anote no seu CADERNO DE ERROS (físico): tópico, questão, tipo do erro, regra correta e pegadinha — uma linha cada.',
      'Se a regra for um número, prazo ou exceção, crie também um flashcard (aba Revisar).',
    ],
    where: [{ label: 'Seu caderno de erros (modelo em PDF na aba Caderno de erros)' }], why: 'Correção é onde o erro vira aprendizado.', status: 'pendente',
  };
  if (withCorrection) return [...tasks, corrTask];
  // tarefa combinada (tópicos secundários): questões + correção no mesmo bloco
  tasks[0].title = `Questões + correção — ${t.name}`;
  tasks[0].minutes = slotMin;
  tasks[0].instructions.push('Ao terminar, registre os resultados e corrija os erros (incluído no tempo).');
  return tasks;
}

function reviewTasks(ctx: MissionContext, minutes: number, includeFlash = true): MissionTask[] {
  const out: MissionTask[] = [];
  if (minutes <= 0) return out;
  const due = dueReviews(ctx.state, ctx.today, ctx.prio).slice(0, ctx.state.settings.dailyReviewCap);
  const cards = includeFlash ? dueFlashcards(ctx.state, ctx.today, ctx.prio) : [];
  let revMin = due.length ? minutes : 0;
  let flashMin = 0;
  if (cards.length && due.length) { flashMin = Math.min(Math.max(5, Math.ceil(cards.length / 5) * 3), Math.round(minutes / 2)); revMin = minutes - flashMin; }
  else if (cards.length) flashMin = minutes;
  if (revMin > 0) {
    const perTopic = Math.max(5, Math.floor(revMin / Math.max(1, Math.min(due.length, 3))));
    const chosen = due.slice(0, Math.max(1, Math.floor(revMin / perTopic)));
    const names = chosen.map((d) => ctx.state.topics.find((t) => t.id === d.topicId)?.name).filter(Boolean) as string[];
    out.push({
      id: uid('t-'), kind: 'revisao', title: `Revisão — ${names.join(' · ')}`,
      topicId: chosen[0]?.topicId, disciplineId: ctx.state.topics.find((t) => t.id === chosen[0]?.topicId)?.disciplineId,
      minutes: revMin, reviewTopicIds: chosen.map((d) => d.topicId),
      instructions: [
        'Releia no seu caderno de erros as linhas desse tópico e a lei seca/resumo nos pontos marcados.',
        chosen.some((d) => d.quickCheck) ? 'Faça uma checagem rápida de 5 questões para recalibrar.' : 'Faça 5 questões rápidas para confirmar que a regra está firme.',
        'Ao concluir, informe quanto acertou — o sistema ajusta o próximo intervalo.',
      ],
      where: [{ label: 'Seu caderno de erros (linhas deste tópico)' }, { label: 'QConcursos — mesmo filtro do tópico', url: LINKS.QC }],
      why: 'Revisão no momento certo segura o que você já aprendeu.', status: 'pendente',
    });
  }
  if (flashMin > 0) {
    const n = Math.min(cards.length, Math.max(5, Math.round(flashMin * 2)));
    out.push({
      id: uid('t-'), kind: 'flashcards', title: `Flashcards — ${n} cartões`, minutes: flashMin, flashcardCount: n,
      instructions: ['Responda em voz alta antes de virar o cartão.', 'Seja honesta na avaliação: errei / difícil / acertei / fácil.'],
      where: [{ label: 'Aba Revisar → Flashcards' }], why: 'Cartões curtos fixam prazos, números e exceções.', status: 'pendente',
    });
  }
  return out;
}

function essayTask(ctx: MissionContext, minutes: number): MissionTask {
  const ep = essayPhaseFor(ctx.state, ctx.phase);
  const p = ESSAY_PHASES[ep - 1];
  return {
    id: uid('t-'), kind: 'redacao', title: `Redação — etapa ${ep}: ${p.name}`, minutes,
    instructions: [p.task, 'Use um tema da aba Redação (inclui a proposta real de 2025).', 'Ao terminar, registre a autoavaliação pelos critérios do edital.'],
    where: [{ label: 'Aba Redação → tema sugerido e checklist do edital' }],
    why: 'A redação é eliminatória (mínimo 24/40): treino semanal desde o início.', status: 'pendente',
  };
}

interface Pick { topic: Topic; pr: PriorityResult; adjusted: number }

export const CYCLE_WINDOW_DAYS = 3;

/**
 * Ciclo aberto: numa missão dos últimos 3 dias, a teoria de um tópico foi feita (mesmo que em parte),
 * mas as questões desse tópico ficaram pendentes e nada foi registrado nele depois.
 * Não é compensação: as questões entram NO LUGAR do tema principal de hoje, dentro do tempo de hoje.
 */
export function findOpenCycle(state: AppState, today: string): { topicId: string; date: string } | null {
  const dismissed = new Set(state.dismissedCycles || []);
  for (let back = 1; back <= CYCLE_WINDOW_DAYS; back++) {
    const date = addDays(today, -back);
    const m = state.missions[date];
    if (!m) continue;
    // teoria concluída, ou aberta e não concluída (a estudante estudou mas não marcou)
    const learned = m.tasks.filter((t) => (t.kind === 'aprendizado' || t.kind === 'leiseca') && t.topicId && (t.status === 'feita' || (t.status === 'pendente' && !!t.startedAt)));
    for (const lt of learned) {
      const qPending = m.tasks.some((t) => t.topicId === lt.topicId && (t.kind === 'questoes' || t.kind === 'diagnostico') && t.status !== 'feita');
      if (!qPending) continue;
      const practicedSince = state.attempts.some((a) => a.topicId === lt.topicId && a.date >= date);
      if (practicedSince || dismissed.has(`${date}|${lt.topicId}`)) continue;
      return { topicId: lt.topicId!, date };
    }
    // a missão mais recente que existe decide: não volta além dela
    if (m.tasks.some((t) => t.status === 'feita')) break;
  }
  return null;
}

function pickTopics(ctx: MissionContext, opts: { onlyStarted?: boolean; exclude?: string[]; avoidDiscipline?: string; preferOtherBlockThan?: string }): Pick[] {
  const { state, stats, prio, today } = ctx;
  const mins = minutesByDiscipline7d(state, today);
  const total7 = Object.values(mins).reduce((a, b) => a + b, 0);
  const totalQ = state.disciplines.filter((d) => d.active).reduce((a, d) => a + d.questions, 0) || 70;
  const yMain = yesterdayMainDiscipline(state, today);
  const out: Pick[] = [];
  for (const t of state.topics) {
    const pr = prio[t.id];
    if (!pr || pr.score <= 0) continue;
    if (opts.exclude?.includes(t.id)) continue;
    const s = stats[t.id];
    if (opts.onlyStarted && !s.started) continue;
    if (!progressionAllowed(state, stats, t)) continue;
    const d = disc(state, t.disciplineId)!;
    let f = 1;
    const target = d.questions / totalQ;
    const share = total7 ? (mins[d.id] || 0) / total7 : 0;
    if (total7 >= 120 && share > 1.6 * target) f *= 0.8;
    if (total7 >= 120 && share < 0.4 * target) f *= 1.1;
    if (yMain && d.id === yMain) f *= 0.8;
    if (opts.avoidDiscipline && d.id === opts.avoidDiscipline) continue;
    if (opts.preferOtherBlockThan && d.block !== opts.preferOtherBlockThan) f *= 1.15;
    out.push({ topic: t, pr, adjusted: pr.score * f });
  }
  return out.sort((a, b) => b.adjusted - a.adjusted);
}

export interface MissionInput { minutes: number; mood: Mood }

export function buildMission(ctx: MissionContext, input: MissionInput): DailyMission {
  const { state, stats, phase, today } = ctx;
  const ret = detectReturn(state, today);
  const reasons: string[] = [];
  let T = Math.max(15, Math.round(input.minutes));
  let mode: DailyMission['mode'] = 'normal';
  let message = '';

  if (input.mood === 'mal' || T <= 20) {
    mode = 'minima';
    T = Math.min(T, state.settings.badDayMinutes);
    message = 'Hoje não precisamos avançar muito. Precisamos apenas manter o projeto vivo.';
  } else if (ret.protocolStep === 1) {
    mode = 'retomada';
    T = Math.max(20, Math.round(T * 0.75));
    message = RETURN_MESSAGE;
  } else if (input.mood === 'cansada') {
    mode = 'cansada';
    T = Math.max(20, Math.round(T * 0.75));
    message = 'Hoje vamos fazer uma missão menor, só com o que você já estudou.';
  } else if (T >= 180 && phase >= 2 && simulationDue(state, phase, today)) {
    mode = 'simulado';
    message = 'Hoje é dia de simulado. Ele mostra objetivamente onde agir nas próximas semanas.';
  } else {
    message = ret.message || '';
  }

  const tasks: MissionTask[] = [];
  const started = state.topics.some((t) => stats[t.id]?.started);

  // ───── SIMULADO ─────
  if (mode === 'simulado') {
    const sim = nextSimulationSpec(state, phase, ctx.prio);
    tasks.push({
      id: uid('t-'), kind: 'simulado', title: sim.title, minutes: Math.min(T, sim.durationMin),
      instructions: [`Ordem: ${sim.order.join(' → ')}.`, `Tempo total: ${Math.floor(sim.durationMin / 60)}h${String(sim.durationMin % 60).padStart(2, '0')}.`, 'Sem consulta, celular longe, cronômetro ligado.', 'Ao final, registre os acertos por disciplina na aba Simulados para gerar o relatório.'],
      where: [{ label: sim.source }], why: 'Simulado mede o desempenho real nos blocos eliminatórios.', status: 'pendente', simulationId: sim.id,
    });
    return finalize(ctx, input, mode, T, message, tasks, [`Simulado previsto para a fase ${phase} (${PHASES[phase].name}).`]);
  }

  // ───── MISSÃO MÍNIMA ─────
  if (mode === 'minima') {
    const last = lastStudiedTopics(state, 1)[0];
    const lastTopic = state.topics.find((t) => t.id === last);
    const main = lastTopic && stats[lastTopic.id]?.started ? { topic: lastTopic, pr: ctx.prio[lastTopic.id] } : pickTopics(ctx, { onlyStarted: started })[0];
    const rev = T >= 30 ? 10 : 5;
    tasks.push(...reviewTasks(ctx, rev));
    if (!tasks.length && main && stats[main.topic.id]?.started) {
      tasks.push({ id: uid('t-'), kind: 'revisao', title: `Revisão curta — ${main.topic.name}`, topicId: main.topic.id, disciplineId: main.topic.disciplineId, minutes: rev, reviewTopicIds: [main.topic.id], instructions: ['Releia seus resumos/erros desse tópico.', 'Só isso já mantém o assunto ativo.'], where: [{ label: main.topic.where || 'Resumo do tópico' }], why: 'Manter contato com o último assunto estudado.', status: 'pendente' });
    }
    if (main) {
      if (!stats[main.topic.id].started) {
        const free = T - tasks.reduce((a, t) => a + t.minutes, 0);
        const lt = learnTask(ctx, main.topic, Math.max(10, free - 10), 'Primeiro contato com o tópico de maior prioridade.', true);
        tasks.push(lt);
        tasks.push(...questionsTask(ctx, main.topic, free - lt.minutes, 'Primeiras questões fáceis, só para conhecer o estilo da banca.', false));
      }
      else {
        const d = disc(state, main.topic.disciplineId);
        const q = T >= 30 ? 10 : 8;
        const qMin = Math.round(q * (d?.pacePerQuestionMin ?? 2));
        const qs = questionsTask(ctx, main.topic, qMin + Math.max(5, T - rev - qMin), 'Continuidade no último tópico estudado.', true);
        qs[1].title = `Correção dos erros principais — ${main.topic.name}`;
        qs[1].instructions = ['Registre as questões.', 'Corrija só os erros principais — uma linha por erro.'];
        tasks.push(...qs);
      }
      reasons.push(`Tópico: ${main.topic.name} (continuidade)`);
    }
    return finalize(ctx, input, mode, T, message, tasks, reasons);
  }

  // ───── RETOMADA (após ausência longa, 1ª missão) ─────
  if (mode === 'retomada') {
    const lastIds = lastStudiedTopics(state, 2);
    const lastTopics = lastIds.map((id) => state.topics.find((t) => t.id === id)!).filter(Boolean);
    const rev = r5(T * 0.3);
    tasks.push(...reviewTasks(ctx, rev, true));
    const remaining = T - tasks.reduce((a, t) => a + t.minutes, 0);
    const targets = lastTopics.length ? lastTopics : pickTopics(ctx, {}).slice(0, 1).map((p) => p.topic);
    targets.forEach((t, i) => {
      const slot = i === 0 && targets.length > 1 ? Math.round(remaining * 0.6) : targets.length > 1 ? remaining - Math.round(remaining * 0.6) : remaining;
      if (!stats[t.id]?.started) { tasks.push(learnTask(ctx, t, slot, 'Retomada pelo tópico de maior prioridade.', true)); return; }
      const qs = questionsTask(ctx, t, slot, 'Diagnóstico: medir o que ficou desse tópico.', i === 0);
      qs[0].kind = 'diagnostico';
      qs[0].title = `Diagnóstico — ${t.name}`;
      tasks.push(...qs);
    });
    reasons.push('Retomada gradual: sem conteúdo novo pesado hoje, só recalibrar.');
    return finalize(ctx, input, mode, T, message, tasks, reasons);
  }

  // ───── NORMAL / CANSADA ─────
  const mix = { ...PHASE_MIX[phase] };
  if (mode === 'cansada' || ret.protocolStep === 2) mix.novo = mode === 'cansada' ? 0 : mix.novo / 2;

  // Redação: 1 exercício por semana, em dia com tempo
  let essayMin = 0;
  const ep = essayPhaseFor(state, phase);
  const essayNeed = ESSAY_PHASES[ep - 1].minutes;
  if (mode === 'normal' && essayDueThisWeek(state, today) && T >= Math.max(60, essayNeed + 45) && started) {
    essayMin = essayNeed;
    reasons.push('Redação da semana ainda não feita e hoje há tempo suficiente.');
  }

  const dueR = dueReviews(state, today, ctx.prio);
  const dueC = dueFlashcards(state, today, ctx.prio);
  let reviewMin = 0;
  if (dueR.length || dueC.length) reviewMin = T >= 40 ? r5(T * mix.revisao) : 5;
  if (phase === 5) reviewMin = Math.max(reviewMin, r5(T * mix.revisao));

  // Ciclo aberto (teoria feita, questões pendentes): fechar esse ciclo é a melhor utilização do tempo
  const cycle = mode === 'normal' || mode === 'cansada' ? findOpenCycle(state, today) : null;
  const cycleTopic = cycle ? state.topics.find((t) => t.id === cycle.topicId) : undefined;
  const main = cycleTopic && ctx.prio[cycleTopic.id]
    ? { topic: cycleTopic, pr: ctx.prio[cycleTopic.id], adjusted: ctx.prio[cycleTopic.id].score }
    : pickTopics(ctx, { onlyStarted: mode === 'cansada' && started })[0];
  if (cycleTopic) {
    message = `Você estudou a teoria de ${cycleTopic.name}. Vamos fechar esse ciclo com as questões.`;
    reasons.push(`Ciclo aberto: teoria de ${cycleTopic.name} feita, questões pendentes. Questões logo depois da teoria fixam o conteúdo.`);
  }
  let learnMin = 0;
  const mainStats = main ? stats[main.topic.id] : undefined;
  const mainNextSub = main && main.topic.subtopics.length > 1 ? nextSubtopic(state, main.topic) : null;
  const needsLearning = main && !cycleTopic && (mode !== 'cansada' || !started) && (
    !mainStats!.started || (mainStats!.n < 10 && mainStats!.mastery < 50) || (!!mainNextSub && mainStats!.mastery < 75 && phase <= 3));
  const cal = paceOf(ctx);
  const needsTrapTraining = main && !cycleTopic && mainStats && isDireito(disc(state, main.topic.disciplineId)) && mainStats.n >= 10 && (mainStats.levelB ?? 100) < 60;
  if (needsLearning) {
    const nominal = Math.min(T >= 150 ? 40 : 30, Math.max(10, r5(T * Math.max(mix.novo, phase >= 4 ? 0.15 : 0))));
    // tempo realista: o pedaço de teoria leva o que ele costuma levar para você
    learnMin = Math.min(Math.max(10, r5(T * 0.6)), Math.max(10, r5(nominal * cal.learn)));
    if (cal.learn >= 1.2) reasons.push(`Tempo de teoria ajustado ao seu ritmo real (≈ ${cal.learn.toFixed(1).replace('.', ',')}× o previsto inicialmente).`);
  }
  else if (needsTrapTraining) learnMin = Math.min(20, r5(T * 0.15));

  let practice = T - essayMin - reviewMin - learnMin;
  if (practice < 10) { reviewMin = Math.max(0, reviewMin - (10 - practice)); practice = T - essayMin - reviewMin - learnMin; }

  if (main) {
    const why = main.pr.reasons.join(' · ');
    if (needsLearning) tasks.push(learnTask(ctx, main.topic, learnMin, why, !mainStats!.started && T < 60));
    else if (needsTrapTraining) {
      tasks.push({
        id: uid('t-'), kind: 'leiseca', title: `Treino de pegadinhas — ${main.topic.name}`, topicId: main.topic.id, disciplineId: main.topic.disciplineId, minutes: learnMin,
        instructions: ['Nível B (reconhecimento): releia a lei seca procurando o que a VUNESP costuma trocar.', 'Para cada artigo, escreva uma versão "errada" como a banca faria (prazo, condição, instituto).', 'Revise seus erros de confusão/atenção neste tópico.'],
        where: [{ label: main.topic.where || 'Lei seca' }, ...(main.topic.links || []).map((l) => ({ label: l.label, url: l.url }))],
        why: `Você conhece a regra, mas a pegadinha ainda engana (nível B ${mainStats!.levelB}%).`, status: 'pendente',
      });
    }
    // tópico principal recebe a maior parte, com teto (evita 60 min no mesmo assunto); o resto intercala
    const extra: number[] = [];
    let mainSlot = practice;
    if (T >= 60 && practice >= 30) {
      const cap = T >= 150 ? 45 : T >= 100 ? 40 : 30;
      mainSlot = Math.min(practice, Math.max(Math.round(practice * 0.6), Math.min(cap, practice - 20)));
      if (mainSlot > cap) mainSlot = cap;
      let rest = practice - mainSlot;
      while (rest >= 15 && extra.length < 3) {
        const slot = rest >= 50 && extra.length < 2 ? r5(rest * 0.55) : rest;
        extra.push(slot);
        rest -= slot;
      }
      if (rest > 0) { if (extra.length) extra[extra.length - 1] += rest; else mainSlot += rest; }
    }
    const qs = questionsTask(ctx, main.topic, mainSlot, cycleTopic ? 'Fechar o ciclo: a teoria já foi feita.' : why, true);
    if (cycleTopic) {
      qs[0].title = `Questões — ${main.topic.name} (fechando o ciclo)`;
      qs[0].instructions.unshift('A teoria já foi feita. Comece direto pelas questões, sem reler antes: o esforço de lembrar é o que fixa o conteúdo.');
    }
    tasks.push(...qs);
    reasons.push(`${disc(state, main.topic.disciplineId)?.short} — ${main.topic.name}: ${main.pr.reasons.join('; ')}`);

    const usedDisc = [main.topic.disciplineId];
    const blockMain = disc(state, main.topic.disciplineId)?.block;
    for (const slot of extra) {
      const next = pickTopics(ctx, { onlyStarted: mode === 'cansada' && started, exclude: tasks.map((t) => t.topicId!).filter(Boolean), preferOtherBlockThan: blockMain })
        .find((p) => !usedDisc.includes(p.topic.disciplineId));
      if (!next) break;
      usedDisc.push(next.topic.disciplineId);
      const ns = stats[next.topic.id];
      if (!ns.started && mode !== 'cansada') {
        if (slot < 30) tasks.push(learnTask(ctx, next.topic, slot, next.pr.reasons.join(' · '), true));
        else {
          const lt = learnTask(ctx, next.topic, r5(slot * 0.5), next.pr.reasons.join(' · '), true);
          tasks.push(lt);
          tasks.push(...questionsTask(ctx, next.topic, slot - lt.minutes, 'Primeiras questões fáceis do tópico.', false));
        }
      } else {
        tasks.push(...questionsTask(ctx, next.topic, slot, next.pr.reasons.join(' · '), false));
      }
      reasons.push(`${disc(state, next.topic.disciplineId)?.short} — ${next.topic.name}: intercalar com outro bloco`);
    }
  }
  tasks.push(...reviewTasks(ctx, reviewMin));
  if (essayMin) tasks.push(essayTask(ctx, essayMin));
  if (!message && main) message = `Hoje ${disc(state, main.topic.disciplineId)?.short} é a melhor utilização do seu tempo.`;
  const m = finalize(ctx, input, mode, T, message, tasks, reasons);
  if (cycle && cycleTopic) m.resumedFrom = cycle;
  return m;
}

function finalize(ctx: MissionContext, input: MissionInput, mode: DailyMission['mode'], T: number, message: string, tasks: MissionTask[], reasons: string[]): DailyMission {
  const main = tasks.find((t) => t.topicId && t.kind !== 'revisao');
  const topic = main ? ctx.state.topics.find((t) => t.id === main.topicId) : undefined;
  const d = topic ? disc(ctx.state, topic.disciplineId) : undefined;
  const objective = mode === 'simulado' ? tasks[0]?.title ?? 'Simulado' : topic ? `${d?.short} — ${topic.name}` : tasks[0]?.title ?? 'Revisão';
  return {
    date: ctx.today, availableMin: input.minutes, mood: input.mood, phase: ctx.phase, mode,
    headline: 'MISSÃO DE HOJE', message, objective,
    tasks: tasks.filter((t) => t.minutes > 0),
    reasons, createdAt: Date.now(),
  };
}

export function missionMinutes(m: DailyMission): number {
  return m.tasks.reduce((a, t) => a + t.minutes, 0);
}

/** Tempo padrão do dia: o último tempo escolhido nesse dia da semana, senão a configuração. */
export function defaultMinutesFor(state: AppState, today: string): number {
  const wd = new Date(today + 'T12:00:00').getDay();
  const past = Object.values(state.missions)
    .filter((m) => m.date < today && new Date(m.date + 'T12:00:00').getDay() === wd && m.mood === 'normal' && diffDays(today, m.date) <= 28)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return past?.availableMin ?? state.settings.defaultMinutesByWeekday[wd] ?? 60;
}
