// Persistência local: IndexedDB (principal) + localStorage (espelho). Tudo em try/catch:
// o armazenamento do navegador pode estar bloqueado (aba privada, pré-visualização).

const DB_NAME = 'projeto-tjsp';
const STORE = 'kv';
const KEY = 'state';
const LS_KEY = 'projeto-tjsp:state';

function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function loadRaw(): Promise<{ data: any; from: 'idb' | 'ls' | null }> {
  let idbData: any = null;
  try {
    const db = await openDB();
    if (db) {
      idbData = await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE, 'readonly');
          const r = tx.objectStore(STORE).get(KEY);
          r.onsuccess = () => resolve(r.result ?? null);
          r.onerror = () => resolve(null);
        } catch { resolve(null); }
      });
    }
  } catch { /* ignora */ }
  let lsData: any = null;
  try {
    const s = localStorage.getItem(LS_KEY);
    if (s) lsData = JSON.parse(s);
  } catch { /* ignora */ }
  // usa a cópia mais recente
  if (idbData && lsData) return (lsData.updatedAt || 0) > (idbData.updatedAt || 0) ? { data: lsData, from: 'ls' } : { data: idbData, from: 'idb' };
  if (idbData) return { data: idbData, from: 'idb' };
  if (lsData) return { data: lsData, from: 'ls' };
  return { data: null, from: null };
}

export async function saveRaw(state: unknown): Promise<{ idb: boolean; ls: boolean }> {
  let idb = false, ls = false;
  try {
    const db = await openDB();
    if (db) {
      idb = await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(state, KEY);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch { resolve(false); }
      });
    }
  } catch { /* ignora */ }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    ls = true;
  } catch { /* cota cheia ou bloqueado */ }
  return { idb, ls };
}

export function lsGet(key: string): string | null {
  try { return localStorage.getItem('projeto-tjsp:' + key); } catch { return null; }
}
export function lsSet(key: string, v: string) {
  try { localStorage.setItem('projeto-tjsp:' + key, v); } catch { /* ignora */ }
}
