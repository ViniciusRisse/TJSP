import { useState } from 'react';
import type { BlockId, Topic } from '../types';
import { getToday, logStudy, useAppState, useDerived } from '../state/store';
import { masteryLabel, RESULT_META, STATUS_META, type TopicStatus } from '../engine/mastery';
import { expectedQuestions, histCount } from '../engine/priority';
import { formatBR } from '../engine/dates';
import { fmt1, Meter, pct, Sheet, StatusPill, useToast } from './common';
import { FlashDeck, LogQuestions } from './Logging';
import type { View } from './App';

const BLOCKS: { id: BlockId; name: string }[] = [
  { id: 'I', name: 'Bloco I — Língua Portuguesa' },
  { id: 'II', name: 'Bloco II — Conhecimentos em Direito' },
  { id: 'III', name: 'Bloco III — Conhecimentos Gerais' },
];

export default function MapView({ go }: { go: (v: View) => void }) {
  const s = useAppState();
  const d = useDerived();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<TopicStatus | 'todos'>('todos');
  const [sort, setSort] = useState<'edital' | 'prioridade'>('edital');
  const topic = s.topics.find((t) => t.id === open);

  return (
    <div className="page">
      <header className="stack sm">
        <h1>Mapa de Guerra</h1>
        <p className="ink2 small">O edital inteiro (Anexo VIII), com prioridade, status, domínio e próxima revisão de cada tópico. Prioridade é dinâmica: muda com seu desempenho e com a proximidade da prova.</p>
      </header>
      <div className="row between">
        <div className="chips">
          <button className="chip sm" aria-pressed={filter === 'todos'} onClick={() => setFilter('todos')}>Todos</button>
          {(Object.keys(STATUS_META) as TopicStatus[]).map((k) => (
            <button key={k} className="chip sm" aria-pressed={filter === k} onClick={() => setFilter(k)}>{STATUS_META[k].emoji} {STATUS_META[k].label}</button>
          ))}
        </div>
        <div className="chips">
          <button className="chip sm" aria-pressed={sort === 'edital'} onClick={() => setSort('edital')}>Ordem do edital</button>
          <button className="chip sm" aria-pressed={sort === 'prioridade'} onClick={() => setSort('prioridade')}>Prioridade</button>
        </div>
      </div>

      {BLOCKS.map((b) => (
        <section key={b.id} className="stack">
          <div className="row between">
            <h2>{b.name}</h2>
            <span className="small ink2 num">{s.exam.blocks.find((x) => x.id === b.id)?.questions} questões{s.exam.blocks.find((x) => x.id === b.id)?.eliminatory ? ' · eliminatório (mín. 50%)' : ' · classificatório'}</span>
          </div>
          {s.disciplines.filter((x) => x.block === b.id && x.active).sort((a, c) => a.order - c.order).map((disc) => {
            const ds = d.discStats[disc.id];
            let topics = s.topics.filter((t) => t.disciplineId === disc.id && (filter === 'todos' || d.stats[t.id].status === filter));
            if (sort === 'prioridade') topics = [...topics].sort((a, c) => d.prio[c.id].score - d.prio[a.id].score);
            if (!topics.length) return null;
            return (
              <details key={disc.id} className="card" open={filter !== 'todos' || sort === 'prioridade'}>
                <summary>
                  <span className="row between" style={{ display: 'inline-flex', width: 'calc(100% - 20px)' }}>
                    <span><span className="dot" style={{ background: disc.color, marginRight: 8 }} />{disc.name}</span>
                    <span className="small ink2 num">{disc.questions} q · domínio {ds.mastery}% · {pct(ds.coverage)} iniciado</span>
                  </span>
                </summary>
                <div style={{ marginTop: 10 }}>
                  <div className="topic-row" style={{ cursor: 'default' }} aria-hidden>
                    <span className="tiny muted">TÓPICO</span><span className="tiny muted">PRIORIDADE</span><span className="tiny muted hide-sm">DOMÍNIO</span>
                  </div>
                  {topics.map((t) => {
                    const st = d.stats[t.id];
                    const pr = d.prio[t.id];
                    const rv = s.reviews[t.id];
                    return (
                      <div key={t.id} className="topic-row" role="button" tabIndex={0} onClick={() => setOpen(t.id)} onKeyDown={(e) => e.key === 'Enter' && setOpen(t.id)}>
                        <div className="stack sm" style={{ gap: 3, minWidth: 0 }}>
                          <span style={{ fontWeight: 600 }}>{STATUS_META[st.status].emoji} {t.name}</span>
                          <span className="tiny muted">
                            {t.articles && <span className="stampchip" style={{ marginRight: 6 }}>{t.articles}</span>}
                            {st.n} q · {st.correctAny} acertos · {st.wrong} erros{rv ? ` · revisão ${formatBR(rv.nextDate)}` : ''}{histCount(t) ? ` · caiu ${histCount(t)}/3` : ''}
                          </span>
                        </div>
                        <div className="stack sm" style={{ gap: 3 }}>
                          <b className="num">{Math.round(pr.score)}</b>
                          <Meter value={pr.score} label="Prioridade" />
                        </div>
                        <div className="hide-sm num small">{st.n ? `${st.mastery}%` : '—'}</div>
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </section>
      ))}
      <Sheet open={!!topic} onClose={() => setOpen(null)} label={topic?.name ?? 'Tópico'}>
        {topic && <TopicDetail topic={topic} onClose={() => setOpen(null)} go={go} />}
      </Sheet>
    </div>
  );
}

function TopicDetail({ topic, onClose, go }: { topic: Topic; onClose: () => void; go: (v: View) => void }) {
  const s = useAppState();
  const d = useDerived();
  const toast = useToast();
  const st = d.stats[topic.id];
  const pr = d.prio[topic.id];
  const rv = s.reviews[topic.id];
  const disc = s.disciplines.find((x) => x.id === topic.disciplineId)!;
  const errors = s.errors.filter((e) => e.topicId === topic.id).slice(-8).reverse();
  const cards = s.flashcards.filter((c) => c.topicId === topic.id);
  const [mode, setMode] = useState<'info' | 'log' | 'cards'>('info');
  const [studyMin, setStudyMin] = useState('20');
  const hist = topic.history;
  const patterns = s.patterns.filter((p) => topic.traps.includes(p.id));
  const resultsCount = Object.entries(s.attempts.filter((a) => a.topicId === topic.id).reduce((acc: Record<string, number>, a) => { acc[a.result] = (acc[a.result] || 0) + 1; return acc; }, {}));

  return (
    <div className="stack lg">
      <div className="row between top">
        <div className="stack sm" style={{ minWidth: 0 }}>
          <span className="eyebrow">{disc.name}</span>
          <h2>{topic.name}</h2>
          {topic.articles && <span className="stampchip">{topic.articles}</span>}
        </div>
        <button className="btn ghost small" onClick={onClose} aria-label="Fechar">✕</button>
      </div>
      <div className="row"><StatusPill status={st.status} /><span className="pill">Prioridade {Math.round(pr.score)}</span><span className="pill">≈ {fmt1(pr.expectedQ)} q na prova</span></div>

      <div className="chips">
        <button className="chip sm" aria-pressed={mode === 'info'} onClick={() => setMode('info')}>Ficha</button>
        <button className="chip sm" aria-pressed={mode === 'log'} onClick={() => setMode('log')}>Registrar questões</button>
        <button className="chip sm" aria-pressed={mode === 'cards'} onClick={() => setMode('cards')}>Flashcards ({cards.length})</button>
      </div>

      {mode === 'log' && <div className="card"><LogQuestions topicId={topic.id} origin="avulsa" onDone={() => setMode('info')} /></div>}
      {mode === 'cards' && (
        <div className="stack">
          <div className="card"><FlashDeck topicId={topic.id} /></div>
          <ul className="clean small">{cards.map((c) => <li key={c.id} className="card tight"><b>{c.front}</b><br /><span className="ink2" style={{ whiteSpace: 'pre-line' }}>{c.back}</span></li>)}</ul>
        </div>
      )}

      {mode === 'info' && (
        <>
          <div className="kpis">
            <div className="kpi"><span className="eyebrow">Domínio</span><b>{st.n ? `${st.mastery}%` : '—'}</b><span className="tiny muted">{st.n ? masteryLabel(st.mastery) : 'sem questões'}</span></div>
            <div className="kpi"><span className="eyebrow">Questões</span><b>{st.n}</b><span className="tiny muted">{st.correctAny} acertos · {st.guesses} chutes</span></div>
            <div className="kpi"><span className="eyebrow">Nível A</span><b>{st.levelA ?? '—'}{st.levelA != null ? '%' : ''}</b><span className="tiny muted">{disc.block === 'II' ? 'sei o que a lei diz?' : 'conheço a regra?'}</span></div>
            <div className="kpi"><span className="eyebrow">Nível B</span><b>{st.levelB ?? '—'}{st.levelB != null ? '%' : ''}</b><span className="tiny muted">{disc.block === 'II' ? 'reconheço a pegadinha?' : 'evito a armadilha?'}</span></div>
          </div>
          {resultsCount.length > 0 && <div className="row small">{resultsCount.map(([k, v]) => <span key={k} className="pill">{RESULT_META[k as keyof typeof RESULT_META].emoji} {v}</span>)}</div>}
          <div className="card tight stack sm">
            <div className="eyebrow">Por que esta prioridade</div>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{pr.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            <span className="tiny muted">Próxima revisão: {rv ? formatBR(rv.nextDate) : 'agendada após o primeiro estudo'}{rv ? ` · estágio ${rv.stage}, intervalo ${rv.intervalDays} dia(s)` : ''}</span>
          </div>

          <div className="stack sm">
            <div className="eyebrow">Edital</div>
            <p className="small">{topic.editalRef}</p>
          </div>
          <div className="stack sm">
            <div className="eyebrow">Subtemas — teoria estudada {(s.subtopicProgress?.[topic.id] || []).length} de {topic.subtopics.length}</div>
            <ul className="clean small">
              {topic.subtopics.map((x) => (
                <li key={x.id}>{(s.subtopicProgress?.[topic.id] || []).includes(x.id) ? '✓' : '•'} {x.name}{x.articles && <> <span className="stampchip">{x.articles}</span></>}{x.note && <span className="muted"> — {x.note}</span>}</li>
              ))}
            </ul>
          </div>
          <div className="stack sm">
            <div className="eyebrow">Histórico VUNESP (evidência, não previsão)</div>
            <div className="tablewrap">
              <table className="t"><thead><tr><th>2018</th><th>2021</th><th>2025</th></tr></thead>
                <tbody><tr><td>{hist.y2018?.join(', ') || '—'}</td><td>{hist.y2021?.join(', ') || '—'}</td><td>{hist.y2025?.join(', ') || '—'}</td></tr></tbody>
              </table>
            </div>
            <p className="small"><b>Como cai:</b> {topic.chargeType}</p>
            {patterns.length > 0 && <ul className="clean small">{patterns.map((p) => <li key={p.id}>§ <b>{p.name}</b> — {p.defense}</li>)}</ul>}
          </div>
          {topic.notes && topic.notes.length > 0 && (
            <div className="card tight stack sm" style={{ borderColor: 'var(--warn)' }}>
              <div className="eyebrow">Atenção / dúvidas registradas</div>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{topic.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
          )}
          <div className="stack sm">
            <div className="eyebrow">Onde estudar</div>
            <ul className="clean small">
              {topic.where && <li>{topic.where}</li>}
              {topic.links?.map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a></li>)}
              {topic.qcFilter && <li>{topic.qcFilter}</li>}
            </ul>
          </div>
          {errors.length > 0 && (
            <div className="stack sm">
              <div className="row between"><div className="eyebrow">Erros recentes</div><button className="btn ghost small" onClick={() => { onClose(); go('erros'); }}>Ver todos</button></div>
              <ul className="clean small">{errors.map((e) => <li key={e.id} className="card tight">{RESULT_META[e.reason].emoji} {e.question}{e.rule && <><br /><span className="ink2">Regra: {e.rule}</span></>}{e.trap && <><br /><span className="ink2">Pegadinha: {e.trap}</span></>}</li>)}</ul>
            </div>
          )}
          <div className="card tight stack sm">
            <div className="eyebrow">Registrar estudo fora da missão</div>
            <div className="row">
              <input id="study-min" type="number" min={5} value={studyMin} onChange={(e) => setStudyMin(e.target.value)} style={{ width: 90 }} aria-label="Minutos" />
              <span className="small">min de teoria/lei seca</span>
              <button className="btn small" onClick={() => { logStudy(topic.id, 'teoria', Number(studyMin) || 20); toast('Estudo registrado. Primeira revisão programada.'); }}>Registrar</button>
            </div>
            <span className="tiny muted">Só conta como estudo o que for deste tópico. Hoje: {getToday() && formatBR(getToday())}.</span>
          </div>
        </>
      )}
    </div>
  );
}
