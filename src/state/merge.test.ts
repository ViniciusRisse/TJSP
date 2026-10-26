import { describe, expect, it } from 'vitest';
import { createInitialState } from './seed';
import { mergeStates } from './merge';

function dev(prefix: string, n: number, date: string) {
  const s = createInitialState();
  s.attempts = Array.from({ length: n }, (_, i) => ({ id: prefix + i, topicId: 'pt-conc', disciplineId: 'port', date, ts: i, result: 'seguro' as const, origin: 'missao' as const }));
  s.sessions = [{ id: prefix + 's', date, topicId: 'pt-conc', disciplineId: 'port', kind: 'teoria' as const, minutes: 40, fromMission: true }];
  s.reviews['pt-conc'] = { topicId: 'pt-conc', stage: 1, ease: 2, intervalDays: 1, nextDate: date, lastDate: date, history: [] };
  s.subtopicProgress = { 'pt-conc': [prefix + '-sub'] };
  s.user.lastActiveDate = date;
  return s;
}

describe('juntar dois aparelhos', () => {
  it('soma o estudo do computador (histórico) com o do tablet (hoje), sem perder nada', () => {
    const desktop = dev('d', 40, '2026-10-24');
    const tablet = dev('t', 6, '2026-10-26');
    const m = mergeStates(desktop, tablet);
    expect(m.attempts.length).toBe(46);
    expect(m.sessions.length).toBe(2);
    expect(m.reviews['pt-conc'].lastDate).toBe('2026-10-26');
    expect(m.subtopicProgress!['pt-conc'].sort()).toEqual(['d-sub', 't-sub']);
    expect(m.user.lastActiveDate).toBe('2026-10-26');
  });
  it('juntar duas vezes o mesmo backup não duplica', () => {
    const desktop = dev('d', 10, '2026-10-24');
    const once = mergeStates(desktop, dev('t', 3, '2026-10-26'));
    const twice = mergeStates(once, desktop);
    expect(twice.attempts.length).toBe(13);
  });
});
