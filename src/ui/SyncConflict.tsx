import { useState } from 'react';
import { getSyncConflict, resolveSyncConflict, useAppState } from '../state/store';
import { formatBR, toISO } from '../engine/dates';

/** Aparece quando este aparelho e a nuvem têm estudos diferentes: a estudante escolhe qual cópia vale. */
export default function SyncConflictCard() {
  useAppState();
  const c = getSyncConflict();
  const [busy, setBusy] = useState(false);
  if (!c) return null;
  const when = formatBR(toISO(new Date(c.remoteUpdatedAt)));
  return (
    <div className="card stack sm" style={{ borderColor: 'var(--warn)', borderWidth: 2 }} role="alert">
      <b>Este aparelho e a nuvem têm estudos diferentes.</b>
      <p className="small">Escolha qual cópia usar. A outra não será apagada até você escolher.</p>
      <div className="grid2">
        <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); await resolveSyncConflict('nuvem'); }}>
          Usar a da nuvem ({c.remoteAttempts} questões · salva em {when})
        </button>
        <button className="btn" disabled={busy} onClick={async () => { setBusy(true); await resolveSyncConflict('aparelho'); }}>
          Usar a deste aparelho ({c.localAttempts} questões)
        </button>
      </div>
      <span className="tiny muted">Na dúvida, use a que tem mais questões.</span>
    </div>
  );
}
