// Sincronização opcional entre aparelhos (PC ↔ celular) quando o sistema roda como Artifact no claude.ai.
// Grava o estado na área privada da usuária: data/users/<id>/ (ninguém mais lê, nem o dono do artifact).
// Desligada por padrão. Fora do claude.ai, `window.claude` não existe e a sincronização fica indisponível.

const CHUNK = 180_000; // caracteres por documento (limite do documento: 256 KiB)

type Db = any;
interface Ctx { db: Db; uid: string }
let ctxPromise: Promise<Ctx | null> | null = null;

export function syncAvailable(): boolean {
  return typeof window !== 'undefined' && !!(window as any).claude?.use;
}

async function getCtx(): Promise<Ctx | null> {
  if (!syncAvailable()) return null;
  if (!ctxPromise) {
    ctxPromise = (async () => {
      try {
        const claude = (window as any).claude;
        const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
        if (!db || !user) return null;
        const uid = await user.id();
        if (!uid) return null;
        return { db, uid };
      } catch {
        return null;
      }
    })();
  }
  return ctxPromise;
}

function col(c: Ctx) {
  return c.db.collection('data/users/' + c.uid);
}

export interface RemoteInfo { updatedAt: number; chunks: number; size: number; device?: string; amount?: number }

export async function remoteInfo(): Promise<RemoteInfo | null> {
  const c = await getCtx();
  if (!c) return null;
  try {
    const snap = await col(c).doc('manifest').get();
    return snap.exists ? (snap.data() as RemoteInfo) : null;
  } catch {
    return null;
  }
}

export async function pull(): Promise<any | null> {
  const c = await getCtx();
  if (!c) return null;
  try {
    const m = await col(c).doc('manifest').get();
    if (!m.exists) return null;
    const info = m.data() as RemoteInfo;
    const parts: string[] = [];
    for (let i = 0; i < info.chunks; i++) {
      const d = await col(c).doc('c' + i).get();
      if (!d.exists) return null;
      parts.push(String((d.data() as any).s || ''));
    }
    return JSON.parse(parts.join(''));
  } catch {
    return null;
  }
}

let pushing = false;
let pending: any = null;

export async function push(state: { updatedAt: number }, amount?: number): Promise<'ok' | 'indisponivel' | 'erro'> {
  const c = await getCtx();
  if (!c) return 'indisponivel';
  if (pushing) { pending = state; return 'ok'; }
  pushing = true;
  try {
    const json = JSON.stringify(state);
    const n = Math.ceil(json.length / CHUNK);
    const prev = await remoteInfo();
    for (let i = 0; i < n; i++) await col(c).doc('c' + i).set({ s: json.slice(i * CHUNK, (i + 1) * CHUNK) });
    await col(c).doc('manifest').set({ updatedAt: state.updatedAt, chunks: n, size: json.length, device: navigator.userAgent.slice(0, 80), amount: amount ?? null });
    if (prev && prev.chunks > n) for (let i = n; i < prev.chunks; i++) await col(c).doc('c' + i).delete();
    return 'ok';
  } catch {
    return 'erro';
  } finally {
    pushing = false;
    if (pending) { const p = pending; pending = null; void push(p, amount); }
  }
}

/** Salvar arquivo: usa a capacidade `downloads` do claude.ai; fora dele, link de download comum. */
export async function saveFile(filename: string, data: string): Promise<'saved' | 'cancelado' | 'fallback' | 'erro'> {
  try {
    if (syncAvailable()) {
      const dl = await (window as any).claude.use('downloads');
      if (dl) {
        try {
          await dl.save({ filename, data });
          return 'saved';
        } catch (e: any) {
          return e?.code === 'cancelled' || e?.code === 'declined' ? 'cancelado' : 'erro';
        }
      }
    }
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return 'fallback';
  } catch {
    return 'erro';
  }
}
