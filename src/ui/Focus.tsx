import { useEffect, useState } from 'react';
import { completeReview, completeTask, getToday, skipTask, startTask, useAppState } from '../state/store';
import { RESULT_META } from '../engine/mastery';
import { ErrorForm, FlashDeck, LogQuestions } from './Logging';
import { fmtMin, topicName } from './common';
import type { View } from './App';

export default function Focus({ go }: { go: (v: View) => void }) {
  const s = useAppState();
  const today = getToday();
  const m = s.missions[today];
  const task = m?.tasks.find((t) => t.status === 'pendente');
  const idx = m ? m.tasks.findIndex((t) => t.id === task?.id) : -1;
  const [now, setNow] = useState(Date.now());
  const [stage, setStage] = useState<'fazer' | 'registrar'>('fazer');
  const [loggedIds, setLoggedIds] = useState<string[]>([]);
  const [openErr, setOpenErr] = useState<string | null>(null);
  const [reviewScore, setReviewScore] = useState<number | null>(null);

  useEffect(() => { if (task && !task.startedAt) startTask(task.id); setStage('fazer'); setReviewScore(null); setOpenErr(null); }, [task?.id]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  if (!m) return <div className="page narrow"><p>Missão ainda não gerada.</p><button className="btn" onClick={() => go('hoje')}>Voltar</button></div>;

  if (!task) {
    const todays = s.attempts.filter((a) => a.date === today);
    const ok = todays.filter((a) => RESULT_META[a.result].correct && a.result !== 'chute').length;
    const mins = s.sessions.filter((x) => x.date === today && x.fromMission).reduce((a, x) => a + x.minutes, 0);
    return (
      <div className="page narrow focus-wrap">
        <div className="card hero stack lg">
          <h1>MISSÃO CONCLUÍDA</h1>
          <ul className="clean">
            <li>⏱ {fmtMin(mins)} registrados hoje</li>
            {todays.length > 0 && <li>✔ {todays.length} questões · {ok} acertos sem chute ({Math.round((ok / todays.length) * 100)}%)</li>}
            <li>↻ Próximas revisões já foram programadas pelo sistema.</li>
          </ul>
          <p className="small">O projeto continua. Amanhã a missão estará pronta, sem nada acumulado.</p>
          <button className="btn big" onClick={() => go('hoje')}>Voltar ao início</button>
        </div>
      </div>
    );
  }

  const elapsed = Math.max(0, Math.floor((now - (task.startedAt ?? now)) / 1000));
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const over = elapsed / 60 > task.minutes;
  const spent = Math.max(1, Math.round(elapsed / 60));
  const needsLog = (task.kind === 'questoes' || task.kind === 'diagnostico') && task.topicId;
  const wrongToday = s.attempts.filter((a) => a.date === today && a.topicId === task.topicId && !RESULT_META[a.result].correct && !s.errors.some((e) => e.attemptId === a.id));

  const finish = () => completeTask(task.id, spent);

  return (
    <div className="page narrow focus-wrap">
      <div className="row between">
        <button className="btn ghost small" onClick={() => go('hoje')}>← Missão</button>
        <span className="mono small muted">tarefa {idx + 1} de {m.tasks.length}</span>
      </div>
      {idx === 0 && elapsed < 90 && <p className="tiny muted">Celular longe, notificações em silêncio. Só esta tarefa existe agora.</p>}

      <section className="card stack lg">
        <div className="stack sm">
          <div className="eyebrow">{task.kind === 'correcao' ? 'Correção ativa' : task.kind}</div>
          <h1 style={{ fontSize: '1.5rem' }}>{task.title}</h1>
        </div>
        <div className="row between">
          <span className={`timer ${over ? '' : ''}`} aria-live="off">{mm}:{ss}</span>
          <span className="mono ink2">meta {task.minutes} min{task.questions && task.kind !== 'correcao' ? ` · ${task.questions} questões` : ''}</span>
        </div>
        {over && <p className="small muted">Passou do tempo previsto — tudo bem. Conclua quando terminar.</p>}

        <ol className="stack sm" style={{ margin: 0, paddingLeft: 20 }}>
          {task.instructions.map((x, i) => <li key={i}>{x}</li>)}
        </ol>
        {task.where.length > 0 && (
          <div className="stack sm">
            <div className="eyebrow">Onde</div>
            <ul className="clean small">
              {task.where.map((w, i) => <li key={i}>{w.url ? <a href={w.url} target="_blank" rel="noreferrer">{w.label} ↗</a> : w.label}</li>)}
            </ul>
          </div>
        )}
        {task.why && <p className="tiny muted">Por quê: {task.why}</p>}
      </section>

      {/* Ações por tipo de tarefa */}
      {needsLog && stage === 'fazer' && <button className="btn primary big" onClick={() => setStage('registrar')}>Terminei — registrar questões</button>}
      {needsLog && stage === 'registrar' && (
        <section className="card stack">
          <h2>Registrar resultado</h2>
          <LogQuestions topicId={task.topicId!} expected={task.questions} onDone={(ids) => { setLoggedIds(ids); finish(); }} />
        </section>
      )}

      {task.kind === 'correcao' && (
        <section className="card stack">
          <h2>Erros para corrigir</h2>
          {wrongToday.length === 0 ? <p className="small muted">Nenhum erro pendente de detalhe neste tópico hoje. Se houve dúvidas, releia o comentário delas.</p> : (
            <ul className="clean">
              {wrongToday.map((a, i) => (
                <li key={a.id} className="stack sm">
                  <button className="btn small" style={{ justifyContent: 'flex-start' }} onClick={() => setOpenErr(openErr === a.id ? null : a.id)}>
                    {RESULT_META[a.result].emoji} Erro {i + 1} — {RESULT_META[a.result].short} {openErr === a.id ? '▴' : '▾'}
                  </button>
                  {openErr === a.id && <div className="card tight"><ErrorForm topicId={a.topicId} reason={a.result} attemptId={a.id} onSaved={() => setOpenErr(null)} /></div>}
                </li>
              ))}
            </ul>
          )}
          <button className="btn primary big" onClick={finish}>Concluir correção</button>
        </section>
      )}

      {task.kind === 'revisao' && (
        <section className="card stack">
          <h2>Como foi a revisão?</h2>
          <p className="small ink2">Quanto você acertou na checagem rápida de {task.reviewTopicIds?.map((id) => topicName(s, id)).join(', ')}?</p>
          <div className="chips">
            {[0.3, 0.5, 0.7, 0.85, 1].map((v) => <button key={v} className="chip" aria-pressed={reviewScore === v} onClick={() => setReviewScore(v)}>{v === 0.3 ? 'quase nada' : `${Math.round(v * 100)}%`}</button>)}
          </div>
          <button className="btn primary big" disabled={reviewScore == null} onClick={() => { for (const id of task.reviewTopicIds || []) completeReview(id, reviewScore!, Math.round(spent / Math.max(1, task.reviewTopicIds?.length || 1))); completeTask(task.id, 0.01); }}>Concluir revisão</button>
        </section>
      )}

      {task.kind === 'flashcards' && (
        <section className="card stack"><FlashDeck limit={task.flashcardCount} onFinish={() => finish()} /></section>
      )}

      {task.kind === 'redacao' && (
        <section className="card stack">
          <p className="small">Faça o exercício no papel. Depois registre na aba Redação (autoavaliação e checklist do edital).</p>
          <div className="row"><button className="btn primary" onClick={() => go('redacao')}>Abrir Redação</button><button className="btn" onClick={finish}>Concluir sem registrar</button></div>
        </section>
      )}

      {task.kind === 'simulado' && (
        <section className="card stack">
          <p className="small">Ao terminar, registre os acertos por disciplina para gerar o relatório.</p>
          <button className="btn primary" onClick={() => go('simulados')}>Registrar resultado do simulado</button>
        </section>
      )}

      {(task.kind === 'aprendizado' || task.kind === 'leiseca') && <button className="btn primary big" onClick={finish}>Concluir tarefa</button>}

      <button className="btn ghost small" onClick={() => skipTask(task.id)}>Pular esta tarefa hoje</button>
      {loggedIds.length > 0 && <span className="tiny muted">Último registro: {loggedIds.length} questões.</span>}
    </div>
  );
}
