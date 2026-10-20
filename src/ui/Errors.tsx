import { useMemo, useState } from 'react';
import type { ResultClass } from '../types';
import { deleteError, updateError, useAppState, useDerived } from '../state/store';
import { RESULT_META, RESULT_ORDER } from '../engine/mastery';
import { formatBR } from '../engine/dates';
import { ErrorForm } from './Logging';
import { TopicSelect, topicName } from './common';

export default function Errors() {
  const s = useAppState();
  const d = useDerived();
  const [topic, setTopic] = useState('');
  const [reason, setReason] = useState<ResultClass | ''>('');
  const [onlyRecurring, setOnlyRecurring] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTopic, setNewTopic] = useState('');

  const conceptCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of s.errors) if (e.concept) { const k = e.topicId + '|' + e.concept.toLowerCase().trim(); m[k] = (m[k] || 0) + 1; }
    return m;
  }, [s.errors]);

  const list = s.errors
    .filter((e) => (!topic || e.topicId === topic) && (!reason || e.reason === reason))
    .filter((e) => !onlyRecurring || d.stats[e.topicId]?.recurring || (e.concept && conceptCount[e.topicId + '|' + e.concept.toLowerCase().trim()] >= 2))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const undetailed = s.attempts.filter((a) => !RESULT_META[a.result].correct && !s.errors.some((e) => e.attemptId === a.id)).slice(-20).reverse();
  const recurringTopics = s.topics.filter((t) => d.stats[t.id].recurring);

  return (
    <div className="page">
      <header className="stack sm">
        <h1>Meus Erros</h1>
        <p className="small ink2">Cada erro guarda a regra correta e a pegadinha. Quando o mesmo tipo de erro se repete, o tópico vira ERRO RECORRENTE e sobe de prioridade automaticamente.</p>
      </header>

      {recurringTopics.length > 0 && (
        <section className="card stack sm" style={{ borderColor: 'var(--crit)' }}>
          <div className="eyebrow">Erro recorrente</div>
          <ul className="clean small">
            {recurringTopics.map((t) => (
              <li key={t.id}>🔴 <b>{t.name}</b> — {d.stats[t.id].recurringTypes.map((r) => `${RESULT_META[r].emoji} ${RESULT_META[r].short}`).join(', ') || 'conceito repetido'} · prioridade {Math.round(d.prio[t.id].score)}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid3">
        <label className="field">Tópico<TopicSelect id="er-topic" state={s} value={topic} onChange={setTopic} /></label>
        <label className="field">Motivo
          <select id="er-reason" value={reason} onChange={(e) => setReason(e.target.value as ResultClass)}>
            <option value="">Todos</option>
            {RESULT_ORDER.map((r) => <option key={r} value={r}>{RESULT_META[r].emoji} {RESULT_META[r].label}</option>)}
          </select>
        </label>
        <label className="check" style={{ alignSelf: 'end', paddingBottom: 10 }}><input id="er-rec" type="checkbox" checked={onlyRecurring} onChange={(e) => setOnlyRecurring(e.target.checked)} /> Só recorrentes</label>
      </div>

      <div className="row"><button className="btn" onClick={() => setAdding(!adding)}>{adding ? 'Fechar' : '+ Registrar erro manualmente'}</button></div>
      {adding && (
        <div className="card stack">
          <label className="field">Tópico<TopicSelect id="er-new-topic" state={s} value={newTopic} onChange={setNewTopic} /></label>
          {newTopic && <ErrorForm topicId={newTopic} reason="conhecimento" onSaved={() => setAdding(false)} />}
        </div>
      )}

      {undetailed.length > 0 && (
        <details className="card tight">
          <summary className="small">Erros registrados sem detalhe ({undetailed.length})</summary>
          <ul className="clean" style={{ marginTop: 10 }}>
            {undetailed.map((a) => (
              <li key={a.id} className="stack sm">
                <button className="btn small" style={{ justifyContent: 'flex-start' }} onClick={() => setDetail(detail === a.id ? null : a.id)}>{RESULT_META[a.result].emoji} {formatBR(a.date)} · {topicName(s, a.topicId)}</button>
                {detail === a.id && <div className="card tight"><ErrorForm topicId={a.topicId} reason={a.result} attemptId={a.id} onSaved={() => setDetail(null)} /></div>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <section className="stack sm">
        <span className="small muted">{list.length} erro(s)</span>
        {list.length === 0 && <p className="small muted">Nenhum erro detalhado ainda. Na correção ativa de cada missão, os erros podem ser detalhados em uma linha.</p>}
        {list.map((e) => {
          const times = e.concept ? conceptCount[e.topicId + '|' + e.concept.toLowerCase().trim()] : 1;
          return (
            <article key={e.id} className="card tight stack sm" style={{ opacity: e.resolved ? 0.6 : 1 }}>
              <div className="row between">
                <span className="small"><b>{RESULT_META[e.reason].emoji} {topicName(s, e.topicId)}</b> <span className="muted">· {formatBR(e.date)}</span></span>
                {times >= 2 && <span className="pill crit">errei este conceito {times}×</span>}
              </div>
              <div className="small">{e.question}</div>
              {(e.myAnswer || e.correctAnswer) && <div className="tiny ink2">Minha: {e.myAnswer || '—'} · Correta: {e.correctAnswer || '—'}</div>}
              {e.concept && <div className="tiny"><span className="stampchip">{e.concept}</span></div>}
              {e.rule && <div className="small"><b>Regra:</b> {e.rule}</div>}
              {e.trap && <div className="small"><b>Pegadinha:</b> {e.trap}</div>}
              {e.explanation && <div className="small ink2">{e.explanation}</div>}
              <div className="row">
                <button className="btn ghost small" onClick={() => updateError(e.id, { resolved: !e.resolved })}>{e.resolved ? 'Reabrir' : 'Marcar como superado'}</button>
                <button className="btn ghost small danger" onClick={() => deleteError(e.id)}>Excluir</button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
