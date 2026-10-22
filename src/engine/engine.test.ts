import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state/seed';
import type { AppState, QuestionAttempt, ResultClass } from '../types';
import { computeTopicStats, masteryOf } from './mastery';
import { computePriorities, currentPhase, expectedQuestions, projectScore } from './priority';
import { buildMission, missionMinutes } from './mission';
import { nextReview } from './review';
import { detectReturn } from './absence';
import { addDays } from './dates';
import { computeRisk, returnRate } from './metrics';
import { buildWeeklyReport } from './weekly';

const TODAY = '2026-10-21';

function attempts(topicId: string, disciplineId: string, results: ResultClass[], date = TODAY): QuestionAttempt[] {
  return results.map((r, i) => ({ id: `${topicId}-${date}-${i}`, topicId, disciplineId, date, ts: i, result: r, origin: 'avulsa' as const }));
}
function rep(r: ResultClass, n: number): ResultClass[] { return Array(n).fill(r); }

function ctx(s: AppState, today = TODAY) {
  const stats = computeTopicStats(s, today);
  const phase = currentPhase(s, stats, today);
  const prio = computePriorities(s, stats, today, phase);
  return { state: s, stats, prio, phase, today };
}

describe('edital', () => {
  it('distribuição soma 70 questões e 16/30/24 por bloco', () => {
    const s = createInitialState();
    const byBlock: Record<string, number> = {};
    for (const d of s.disciplines) byBlock[d.block] = (byBlock[d.block] || 0) + d.questions;
    expect(byBlock).toEqual({ I: 16, II: 30, III: 24 });
    const total = s.topics.reduce((a, t) => a + expectedQuestions(s, t), 0);
    expect(Math.round(total)).toBe(70);
  });
  it('todo tópico pertence a uma disciplina existente e ids são únicos', () => {
    const s = createInitialState();
    const ids = new Set<string>();
    for (const t of s.topics) {
      expect(s.disciplines.some((d) => d.id === t.disciplineId)).toBe(true);
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
    }
  });
});

describe('domínio', () => {
  it('poucas questões não geram falsa sensação de domínio', () => {
    const { mastery } = masteryOf(attempts('x', 'y', rep('seguro', 3)), TODAY);
    expect(mastery).toBeLessThan(60);
  });
  it('chute não é domínio', () => {
    const a = masteryOf(attempts('x', 'y', rep('seguro', 20)), TODAY).mastery;
    const b = masteryOf(attempts('x', 'y', rep('chute', 20)), TODAY).mastery;
    expect(a).toBeGreaterThan(85);
    expect(b).toBeLessThan(35);
  });
  it('tentativas antigas pesam menos (esquecimento)', () => {
    const recent = masteryOf(attempts('x', 'y', rep('seguro', 20)), TODAY).mastery;
    const old = masteryOf(attempts('x', 'y', rep('seguro', 20), addDays(TODAY, -120)), TODAY).mastery;
    expect(old).toBeLessThan(recent);
  });
  it('erro recorrente vira status de reforço', () => {
    const s = createInitialState();
    s.attempts = attempts('pp-cit', 'ppenal', [...rep('seguro', 6), ...rep('confusao', 4)]);
    const st = computeTopicStats(s, TODAY)['pp-cit'];
    expect(st.recurring).toBe(true);
    expect(st.status).toBe('reforco');
  });
});

describe('prioridade dinâmica', () => {
  it('muito cobrado + 40% > muito cobrado + 90% > pouco cobrado + 95%', () => {
    const s = createInitialState();
    s.attempts = [
      ...attempts('pp-cit', 'ppenal', [...rep('seguro', 8), ...rep('conhecimento', 12)]),   // 40%, 3/3 provas
      ...attempts('pc-jefp', 'pcivil', [...rep('seguro', 18), ...rep('conhecimento', 2)]), // 90%, 3/3 provas
      ...attempts('pp-rest', 'ppenal', [...rep('seguro', 19), ...rep('conhecimento', 1)]), // 95%, nunca caiu
    ];
    const { prio } = ctx(s);
    expect(prio['pp-cit'].score).toBeGreaterThan(prio['pc-jefp'].score);
    expect(prio['pc-jefp'].score).toBeGreaterThan(prio['pp-rest'].score);
  });
  it('atualidades ganha peso perto da prova', () => {
    const s = createInitialState();
    const early = ctx(s, '2026-10-21').prio['at-fatos'].score;
    const late = ctx(s, '2027-03-01').prio['at-fatos'].score;
    expect(late).toBeGreaterThan(early);
  });
});

describe('fases', () => {
  it('fase pelo tempo restante', () => {
    const s = createInitialState();
    expect(ctx(s, '2026-10-21').phase).toBe(1);
    expect(ctx(s, '2027-03-01').phase).toBe(5);
    expect(ctx(s, '2027-01-20').phase).toBe(3);
    expect(ctx(s, '2027-02-01').phase).toBe(4);
  });
});

describe('missão diária', () => {
  it('cabe no tempo disponível e prioriza a disciplina fraca (exemplo da seção 38)', () => {
    const s = createInitialState();
    s.user.lastActiveDate = addDays(TODAY, -1);
    s.attempts = [
      ...attempts('pp-cit', 'ppenal', [...rep('seguro', 9), ...rep('conhecimento', 11)], addDays(TODAY, -2)),
      ...attempts('pt-conc', 'port', [...rep('seguro', 16), ...rep('atencao', 4)], addDays(TODAY, -2)),
      ...attempts('in-excel', 'info', [...rep('seguro', 17), ...rep('atencao', 3)], addDays(TODAY, -2)),
      ...attempts('rl-prop', 'rlm', [...rep('seguro', 10), ...rep('conhecimento', 10)], addDays(TODAY, -2)),
      ...attempts('dc-art5', 'const', [...rep('seguro', 14), ...rep('conhecimento', 6)], addDays(TODAY, -2)),
    ];
    const m = buildMission(ctx(s), { minutes: 60, mood: 'normal' });
    expect(missionMinutes(m)).toBeLessThanOrEqual(65);
    expect(missionMinutes(m)).toBeGreaterThanOrEqual(50);
    const disciplines = new Set(m.tasks.map((t) => t.disciplineId).filter(Boolean));
    expect(disciplines.size).toBeLessThanOrEqual(3); // não distribui 15 min para cada matéria
    expect(m.tasks.some((t) => t.kind === 'questoes' && (t.questions ?? 0) >= 5)).toBe(true);
  });
  it('modo "muito mal" gera missão mínima, sem linguagem de fracasso', () => {
    const s = createInitialState();
    const m = buildMission(ctx(s), { minutes: 120, mood: 'mal' });
    expect(m.mode).toBe('minima');
    expect(missionMinutes(m)).toBeLessThanOrEqual(45);
    expect(m.message).toContain('manter o projeto vivo');
  });
  it('após uma semana sem estudar: sem dívida, mensagem de boas-vindas, carga menor', () => {
    const s = createInitialState();
    s.attempts = attempts('pp-cit', 'ppenal', rep('seguro', 10), addDays(TODAY, -9));
    s.user.lastActiveDate = addDays(TODAY, -9);
    const info = detectReturn(s, TODAY);
    expect(info.kind).toBe('longo');
    s.returnProtocol = { startedOn: TODAY, step: 1 };
    const m = buildMission(ctx(s), { minutes: 60, mood: 'normal' });
    expect(m.mode).toBe('retomada');
    expect(m.message).toBe('Bem-vinda de volta. Vamos retomar de onde você parou.');
    expect(missionMinutes(m)).toBeLessThanOrEqual(50);
    const text = JSON.stringify(m).toLowerCase();
    for (const banned of ['atrasad', 'perdeu', 'deveria', 'não cumpriu', 'ruim']) expect(text).not.toContain(banned);
  });
  it('missão de 3h com simulado previsto vira dia de simulado na fase de performance', () => {
    const s = createInitialState();
    const m = buildMission(ctx(s, '2027-02-01'), { minutes: 300, mood: 'normal' });
    expect(m.mode).toBe('simulado');
  });
});

describe('revisão espaçada', () => {
  it('acerto alto aumenta o intervalo; erro alto antecipa', () => {
    let r = nextReview(undefined, 't', TODAY, [1, 7, 21, 45, 90], null);
    expect(r.intervalDays).toBe(1);
    r = nextReview(r, 't', TODAY, [1, 7, 21, 45, 90], 0.95);
    expect(r.intervalDays).toBeGreaterThanOrEqual(7);
    const bad = nextReview(r, 't', TODAY, [1, 7, 21, 45, 90], 0.3);
    expect(bad.intervalDays).toBeLessThanOrEqual(3);
  });
});

describe('risco, retorno e semana', () => {
  it('calcula sem quebrar com dados vazios e com dados', () => {
    const s = createInitialState();
    const c = ctx(s);
    const risk = computeRisk(s, c.stats, c.prio, TODAY);
    expect(risk.lowEvidence).toBe(true);
    s.attempts = attempts('pt-conc', 'port', rep('seguro', 30), addDays(TODAY, -3));
    s.sessions = [{ id: 's', date: addDays(TODAY, -3), topicId: 'pt-conc', disciplineId: 'port', kind: 'questoes', minutes: 90, fromMission: true }];
    const rr = returnRate(s, TODAY);
    expect(rr.enoughData).toBe(true);
    expect(rr.deltaQuestions).toBeGreaterThan(0);
    const proj = projectScore(s, computeTopicStats(s, TODAY));
    expect(proj.byBlock.I.percent).toBeGreaterThan(0.2);
    const wr = buildWeeklyReport(s, addDays(TODAY, 7));
    expect(wr.adjustments.length).toBeGreaterThan(0);
  });
});

describe('ciclo aberto (teoria feita, questões pendentes)', () => {
  function withYesterday(s: AppState, daysBack: number, learnStatus: 'feita' | 'pendente', startedAt?: number) {
    const date = addDays(TODAY, -daysBack);
    s.missions[date] = {
      date, availableMin: 60, mood: 'normal', phase: 1, mode: 'normal', headline: '', message: '', objective: '', reasons: [], createdAt: 0,
      tasks: [
        { id: 'a', kind: 'aprendizado', title: '', topicId: 'pp-cit', disciplineId: 'ppenal', minutes: 20, instructions: [], where: [], status: learnStatus, startedAt },
        { id: 'q', kind: 'questoes', title: '', topicId: 'pp-cit', disciplineId: 'ppenal', minutes: 20, questions: 10, instructions: [], where: [], status: 'pendente' },
      ],
    };
    s.sessions = learnStatus === 'feita' ? [{ id: 's', date, topicId: 'pp-cit', disciplineId: 'ppenal', kind: 'teoria', minutes: 40, fromMission: true }] : [];
    s.user.lastActiveDate = date;
    return date;
  }
  it('retoma as questões no lugar do tema principal, sem repetir a teoria e sem somar tempo', () => {
    const s = createInitialState();
    withYesterday(s, 1, 'feita');
    const m = buildMission(ctx(s), { minutes: 60, mood: 'normal' });
    expect(m.resumedFrom?.topicId).toBe('pp-cit');
    expect(m.message).toContain('fechar esse ciclo');
    expect(m.tasks[0].topicId).toBe('pp-cit');
    expect(m.tasks.some((t) => t.topicId === 'pp-cit' && t.kind === 'questoes')).toBe(true);
    expect(m.tasks.some((t) => t.topicId === 'pp-cit' && t.kind === 'aprendizado')).toBe(false);
    expect(missionMinutes(m)).toBeLessThanOrEqual(65);
  });
  it('também retoma quando a teoria foi aberta e não marcada como concluída', () => {
    const s = createInitialState();
    withYesterday(s, 1, 'pendente', Date.now());
    expect(buildMission(ctx(s), { minutes: 60, mood: 'normal' }).resumedFrom?.topicId).toBe('pp-cit');
  });
  it('não retoma depois de 3 dias, nem se já houve questões, nem se foi dispensado', () => {
    const a = createInitialState(); withYesterday(a, 4, 'feita');
    expect(buildMission(ctx(a), { minutes: 60, mood: 'normal' }).resumedFrom).toBeUndefined();
    const b = createInitialState(); const d = withYesterday(b, 1, 'feita');
    b.attempts = attempts('pp-cit', 'ppenal', ['seguro'], d);
    expect(buildMission(ctx(b), { minutes: 60, mood: 'normal' }).resumedFrom).toBeUndefined();
    const c = createInitialState(); const d2 = withYesterday(c, 1, 'feita');
    c.dismissedCycles = [`${d2}|pp-cit`];
    expect(buildMission(ctx(c), { minutes: 60, mood: 'normal' }).resumedFrom).toBeUndefined();
  });
});
