import { beforeEach, describe, expect, it, vi } from 'vitest';

// nuvem simulada em memória
const cloud: { state: any; info: any } = { state: null, info: null };
vi.mock('./sync', () => ({
  syncAvailable: () => true,
  remoteInfo: async () => cloud.info,
  pull: async () => (cloud.state ? JSON.parse(JSON.stringify(cloud.state)) : null),
  push: async (s: any, amount?: number) => { cloud.state = JSON.parse(JSON.stringify(s)); cloud.info = { updatedAt: s.updatedAt, chunks: 1, size: 1, amount }; return 'ok'; },
  saveFile: async () => 'saved',
}));

import * as store from './store';
import { createInitialState } from './seed';

function withStudy(n: number, updatedAt: number) {
  const s = createInitialState();
  s.attempts = Array.from({ length: n }, (_, i) => ({ id: 'a' + i, topicId: 'pt-conc', disciplineId: 'port', date: '2026-10-20', ts: i, result: 'seguro' as const, origin: 'avulsa' as const }));
  s.updatedAt = updatedAt;
  return s;
}

describe('sincronização segura', () => {
  beforeEach(() => { cloud.state = null; cloud.info = null; });

  it('aparelho novo (vazio) nunca sobrescreve a nuvem: ele recebe os dados', async () => {
    const desktop = withStudy(40, 1000);
    cloud.state = desktop; cloud.info = { updatedAt: 1000, chunks: 1, size: 1, amount: 40 };
    const tablet = withStudy(0, Date.now()); // vazio, mas "mais recente"
    store.setState(() => tablet, { save: false });
    await store.setSync(true);
    expect(store.getState().attempts.length).toBe(40);
    expect(cloud.state.attempts.length).toBe(40);
  });

  it('os dois com estudos diferentes: pergunta, e nada é enviado até escolher', async () => {
    cloud.state = withStudy(30, 1000); cloud.info = { updatedAt: 1000, chunks: 1, size: 1, amount: 30 };
    store.setState(() => withStudy(10, Date.now()), { save: false });
    const r = await store.setSync(true);
    expect(store.getSyncConflict()).not.toBeNull();
    expect(cloud.state.attempts.length).toBe(30);
    await store.resolveSyncConflict('nuvem');
    expect(store.getState().attempts.length).toBe(30);
    expect(store.getSyncConflict()).toBeNull();
  });

  it('nuvem vazia: o aparelho com dados é enviado', async () => {
    store.setState(() => withStudy(5, 1000), { save: false });
    const r = await store.pullRemote();
    expect(r).toBe('vazio');
  });
});
