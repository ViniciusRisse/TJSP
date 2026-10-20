// Registro de questões (7 classificações), detalhamento de erros e baralho de flashcards.
import { useMemo, useState } from 'react';
import type { Difficulty, Flashcard, QuestionAttempt, ResultClass } from '../types';
import { addError, answerCard, getToday, logAttempts, useAppState, useDerived } from '../state/store';
import { RESULT_META, RESULT_ORDER } from '../engine/mastery';
import { dueFlashcards, type FlashAnswer } from '../engine/review';
import { topicName, useToast } from './common';

const SOURCES = ['QConcursos', 'Prova TJSP 2025', 'Prova TJSP 2021', 'Prova TJSP 2018', 'Apostila', 'Outra'];

export function LogQuestions({ topicId, expected, origin = 'missao', onDone, compact }: { topicId: string; expected?: number; origin?: QuestionAttempt['origin']; onDone?: (ids: string[]) => void; compact?: boolean }) {
  const [items, setItems] = useState<ResultClass[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [source, setSource] = useState('QConcursos');
  const [minutes, setMinutes] = useState('');
  const [codes, setCodes] = useState('');
  const toast = useToast();
  const counts = useMemo(() => {
    const c: Partial<Record<ResultClass, number>> = {};
    for (const r of items) c[r] = (c[r] || 0) + 1;
    return c;
  }, [items]);
  const save = () => {
    const codeList = codes.split(/[\s,;]+/).filter(Boolean);
    const sec = Number(minutes) > 0 && items.length ? Math.round((Number(minutes) * 60) / items.length) : undefined;
    const yearMatch = source.match(/(20\d\d)/);
    const ids = logAttempts(topicId, items.map((r, i) => ({ result: r, difficulty: difficulty || undefined, timeSec: sec, externalId: codeList[i] })), {
      origin, source, banca: 'VUNESP', year: yearMatch ? Number(yearMatch[1]) : undefined, minutes: Number(minutes) || undefined,
    });
    const ok = items.filter((r) => RESULT_META[r].correct).length;
    toast(`${items.length} questões registradas · ${ok} acertos (${items.filter((r) => r === 'chute').length} chutes).`);
    setItems([]);
    onDone?.(ids);
  };
  return (
    <div className="stack">
      <div className="stack sm">
        <div className="row between">
          <span className="eyebrow">Toque na classificação de cada questão, na ordem</span>
          <span className="mono small">{items.length}{expected ? ` / ${expected}` : ''}</span>
        </div>
        <div className="resgrid">
          {RESULT_ORDER.map((r) => (
            <button key={r} className="resbtn" onClick={() => setItems((x) => [...x, r])} aria-label={`Adicionar: ${RESULT_META[r].label}`}>
              <span>{RESULT_META[r].emoji} {RESULT_META[r].label.replace(/^(Acertei|Errei) /, (m) => m)}</span>
              <span className="c">{counts[r] || 0}</span>
            </button>
          ))}
        </div>
      </div>
      {items.length > 0 && (
        <div className="stack sm">
          <span className="tiny muted">Toque numa questão para removê-la.</span>
          <div className="qcells">
            {items.map((r, i) => (
              <button key={i} className="qcell" title={`Questão ${i + 1}: ${RESULT_META[r].label} (remover)`} onClick={() => setItems((x) => x.filter((_, k) => k !== i))}>
                <span>{i + 1}</span>{RESULT_META[r].emoji}
              </button>
            ))}
          </div>
        </div>
      )}
      {!compact && (
        <details>
          <summary className="small">Detalhes opcionais (fonte, dificuldade, tempo, códigos)</summary>
          <div className="grid2" style={{ marginTop: 10 }}>
            <label className="field">Fonte
              <select id="lq-source" value={source} onChange={(e) => setSource(e.target.value)}>{SOURCES.map((x) => <option key={x}>{x}</option>)}</select>
            </label>
            <label className="field">Dificuldade percebida
              <select id="lq-diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                <option value="">—</option><option value="facil">Fácil</option><option value="media">Média</option><option value="dificil">Difícil</option>
              </select>
            </label>
            <label className="field">Tempo total (min)
              <input id="lq-min" type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </label>
            <label className="field">Códigos das questões (QConcursos ou Q31…)
              <input id="lq-codes" type="text" placeholder="Q123456, Q123457…" value={codes} onChange={(e) => setCodes(e.target.value)} />
            </label>
          </div>
        </details>
      )}
      <button className="btn primary" disabled={!items.length} onClick={save}>Registrar {items.length || ''} questões</button>
    </div>
  );
}

export function ErrorForm({ topicId, reason, onSaved, attemptId }: { topicId: string; reason: ResultClass; onSaved?: () => void; attemptId?: string }) {
  const s = useAppState();
  const [f, setF] = useState({ question: '', myAnswer: '', correctAnswer: '', concept: '', rule: '', trap: '', explanation: '', reason });
  const similar = s.errors.filter((e) => e.topicId === topicId && e.concept).map((e) => e.concept!) ;
  const uniq = [...new Set(similar)].slice(0, 6);
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });
  const id = (k: string) => `ef-${attemptId ?? 'x'}-${k}`;
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); addError({ topicId, attemptId, question: f.question || '(sem referência)', myAnswer: f.myAnswer, correctAnswer: f.correctAnswer, reason: f.reason as ResultClass, concept: f.concept, rule: f.rule, trap: f.trap, explanation: f.explanation }); onSaved?.(); }}>
      <div className="grid2">
        <label className="field">Questão (código ou resumo)<input id={id('q')} type="text" value={f.question} onChange={set('question')} placeholder="Ex.: Q2025-23 · edital de citação" /></label>
        <label className="field">Motivo
          <select id={id('r')} value={f.reason} onChange={set('reason')}>
            {RESULT_ORDER.filter((r) => !RESULT_META[r].correct || r === 'chute' || r === 'duvida').map((r) => <option key={r} value={r}>{RESULT_META[r].emoji} {RESULT_META[r].label}</option>)}
          </select>
        </label>
        <label className="field">Minha resposta<input id={id('m')} type="text" value={f.myAnswer} onChange={set('myAnswer')} /></label>
        <label className="field">Resposta correta<input id={id('c')} type="text" value={f.correctAnswer} onChange={set('correctAnswer')} /></label>
      </div>
      <label className="field">Conceito (agrupa erros repetidos — ex.: "impedimento × suspeição")
        <input id={id('k')} type="text" list={id('kl')} value={f.concept} onChange={set('concept')} />
        <datalist id={id('kl')}>{uniq.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <label className="field">Regra correta (uma informação objetiva)<textarea id={id('rule')} value={f.rule} onChange={set('rule')} rows={2} /></label>
      <label className="field">Pegadinha (o que a banca trocou)<input id={id('t')} type="text" value={f.trap} onChange={set('trap')} placeholder="Ex.: trocou 15 dias por 120" /></label>
      <details><summary className="small">Explicação (opcional)</summary><textarea id={id('e')} value={f.explanation} onChange={set('explanation')} rows={3} style={{ marginTop: 8 }} /></details>
      <div className="row"><button className="btn primary" type="submit">Salvar no caderno de erros</button><span className="tiny muted">Com regra ou pegadinha preenchida, vira flashcard.</span></div>
      <span className="tiny muted">Tópico: {topicName(s, topicId)}</span>
    </form>
  );
}

export function FlashDeck({ limit, topicId, onFinish }: { limit?: number; topicId?: string; onFinish?: (n: number) => void }) {
  const s = useAppState();
  const d = useDerived();
  const today = getToday();
  const [queue] = useState<Flashcard[]>(() => {
    let q = dueFlashcards(s, today, d.prio);
    if (topicId) q = q.filter((c) => c.topicId === topicId);
    return limit ? q.slice(0, limit) : q;
  });
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  if (!queue.length) return <p className="small muted">Nenhum flashcard para hoje. Eles aparecem conforme você estuda os tópicos e registra erros.</p>;
  if (i >= queue.length) return (
    <div className="stack sm"><b>{queue.length} cartões revisados.</b><button className="btn primary" onClick={() => onFinish?.(queue.length)}>Concluir</button></div>
  );
  const c = queue[i];
  const answer = (a: FlashAnswer) => { answerCard(c.id, a); setFlip(false); setI(i + 1); if (i + 1 >= queue.length) onFinish?.(queue.length); };
  return (
    <div className="stack">
      <div className="row between"><span className="eyebrow">{topicName(s, c.topicId)}</span><span className="mono small">{i + 1}/{queue.length}</span></div>
      <button className="card flash" onClick={() => setFlip(!flip)} aria-label={flip ? 'Mostrar frente' : 'Mostrar verso'}>
        <span>{flip ? c.back : c.front}</span>
        <span className="tiny muted">{flip ? c.ref ?? '' : 'toque para ver a resposta'}</span>
      </button>
      {flip ? (
        <div className="grid2" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
          <button className="btn small" onClick={() => answer('errei')}>Errei</button>
          <button className="btn small" onClick={() => answer('dificil')}>Difícil</button>
          <button className="btn small" onClick={() => answer('acertei')}>Acertei</button>
          <button className="btn small" onClick={() => answer('facil')}>Fácil</button>
        </div>
      ) : <button className="btn" onClick={() => setFlip(true)}>Ver resposta</button>}
    </div>
  );
}
