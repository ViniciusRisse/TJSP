import { useState } from 'react';
import type { FlashSource } from '../types';
import { addFlashcard, completeReview, getToday, useAppState, useDerived } from '../state/store';
import { dueFlashcards, dueReviews } from '../engine/review';
import { addDays, formatBR } from '../engine/dates';
import { RESULT_META } from '../engine/mastery';
import { FlashDeck } from './Logging';
import { TopicSelect, topicName, useToast } from './common';
import type { View } from './App';

export default function Review({ go }: { go: (v: View) => void }) {
  const s = useAppState();
  const d = useDerived();
  const today = getToday();
  const due = dueReviews(s, today, d.prio);
  const cards = dueFlashcards(s, today, d.prio);
  const upcoming = Object.values(s.reviews).filter((r) => r.nextDate > today && r.nextDate <= addDays(today, 7)).sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
  const [open, setOpen] = useState<string | null>(null);
  const [deck, setDeck] = useState(false);
  const toast = useToast();

  return (
    <div className="page narrow">
      <header className="stack sm">
        <h1>Revisar</h1>
        <p className="small ink2">Revisões vencidas formam uma fila por prioridade, nunca uma dívida. A missão do dia já puxa as mais importantes; aqui você pode adiantar.</p>
      </header>

      <section className="stack">
        <div className="row between"><h2>Revisões de tópicos</h2><span className="pill">{due.length} na fila</span></div>
        {due.length === 0 && <p className="small muted">Nada na fila hoje.</p>}
        {due.slice(0, 12).map((r) => {
          const errs = s.errors.filter((e) => e.topicId === r.topicId).slice(-5).reverse();
          return (
            <div key={r.topicId} className="card tight stack sm">
              <div className="row between">
                <b>{topicName(s, r.topicId)}</b>
                <span className="row" style={{ gap: 6 }}>
                  {r.quickCheck && <span className="pill warn">checagem rápida</span>}
                  <button className="btn small" onClick={() => setOpen(open === r.topicId ? null : r.topicId)}>{open === r.topicId ? 'Fechar' : 'Revisar agora'}</button>
                </span>
              </div>
              {open === r.topicId && (
                <div className="stack sm">
                  <p className="small ink2">Releia seus erros abaixo e a lei/resumo; depois faça 5 questões rápidas e diga quanto acertou.</p>
                  {errs.length ? <ul className="clean small">{errs.map((e) => <li key={e.id}>{RESULT_META[e.reason].emoji} {e.rule || e.question}{e.trap ? ` — pegadinha: ${e.trap}` : ''}</li>)}</ul> : <span className="tiny muted">Sem erros detalhados neste tópico.</span>}
                  <div className="chips">
                    {[0.3, 0.5, 0.7, 0.85, 1].map((v) => (
                      <button key={v} className="chip sm" onClick={() => { completeReview(r.topicId, v); setOpen(null); toast(v >= 0.85 ? 'Revisão concluída. Intervalo aumentado.' : v < 0.6 ? 'Revisão concluída. Esse tópico volta em breve para reforço.' : 'Revisão concluída.'); }}>
                        {v === 0.3 ? 'quase nada' : `${Math.round(v * 100)}%`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {upcoming.length > 0 && (
          <details className="card tight"><summary className="small">Próximos 7 dias ({upcoming.length})</summary>
            <ul className="clean small" style={{ marginTop: 8 }}>{upcoming.map((r) => <li key={r.topicId}>{formatBR(r.nextDate)} — {topicName(s, r.topicId)}</li>)}</ul>
          </details>
        )}
      </section>

      <section className="stack">
        <div className="row between"><h2>Flashcards</h2><span className="pill">{cards.length} para hoje · {s.flashcards.length} no total</span></div>
        {deck ? <div className="card"><FlashDeck onFinish={() => setDeck(false)} /></div>
          : <button className="btn primary" disabled={!cards.length} onClick={() => setDeck(true)}>Revisar {cards.length} flashcards</button>}
        <NewFlashcard />
        <button className="btn ghost small" onClick={() => go('erros')}>Ir para Meus Erros</button>
      </section>
    </div>
  );
}

function NewFlashcard() {
  const s = useAppState();
  const [topicId, setTopic] = useState('');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [source, setSource] = useState<FlashSource>('lei');
  const toast = useToast();
  return (
    <details className="card tight">
      <summary className="small">Criar flashcard</summary>
      <form className="stack sm" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); if (!topicId || !front || !back) return; addFlashcard({ topicId, front, back, source }); setFront(''); setBack(''); toast('Flashcard criado.'); }}>
        <label className="field">Tópico<TopicSelect id="nf-topic" state={s} value={topicId} onChange={setTopic} /></label>
        <label className="field">Tipo
          <select id="nf-src" value={source} onChange={(e) => setSource(e.target.value as FlashSource)}>
            <option value="lei">Legislação</option><option value="prazo">Prazo / número</option><option value="excecao">Exceção</option><option value="confusao">Conceitos confundidos</option><option value="palavra-chave">Palavra-chave</option>
          </select>
        </label>
        <label className="field">Frente (uma pergunta objetiva)<input id="nf-front" type="text" value={front} onChange={(e) => setFront(e.target.value)} placeholder="Qual é a diferença entre X e Y?" /></label>
        <label className="field">Verso (uma informação)<textarea id="nf-back" value={back} onChange={(e) => setBack(e.target.value)} rows={2} placeholder={'X = …\nY = …'} /></label>
        <span className="tiny muted">Cartão curto: uma informação por cartão.</span>
        <button className="btn" type="submit" disabled={!topicId || !front || !back}>Salvar</button>
      </form>
    </details>
  );
}
