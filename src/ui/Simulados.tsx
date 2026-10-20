import { useMemo, useState } from 'react';
import type { Simulation } from '../types';
import { deleteSimulationResult, getToday, saveSimulationResult, useAppState, useDerived } from '../state/store';
import { nextSimulationSpec, simulationDue, simulationReport, PAST_EXAM_RANGES } from '../engine/simulations';
import { formatBR } from '../engine/dates';
import { EXAM_TIME_PLAN, PAST_EXAMS } from '../data/vunesp';
import { fmtMin, pct, useToast } from './common';

export default function Simulados() {
  const s = useAppState();
  const d = useDerived();
  const today = getToday();
  const spec = useMemo(() => nextSimulationSpec(s, d.phase, d.prio), [s.simulationResults.length, d.phase]);
  const [kind, setKind] = useState<'sugerido' | 'completo'>('sugerido');
  const full: Simulation = useMemo(() => ({ ...nextSimulationSpec({ ...s }, 4, d.prio), title: 'Simulado completo — formato da prova' }), [s.simulationResults.length]);
  const sim = kind === 'completo' ? full : spec;
  const due = simulationDue(s, d.phase, today);
  const results = [...s.simulationResults].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="page">
      <header className="stack sm">
        <h1>Simulados</h1>
        <p className="small ink2">Progressão: mini-blocos (fase 1) → parciais por bloco (fase 2–3) → completos no formato da prova (fase 4–5). Cada resultado gera relatório e alimenta o painel de risco.</p>
      </header>

      <section className="card stack">
        <div className="row between">
          <div className="stack sm"><span className="eyebrow">{due ? 'Recomendado agora' : 'Próximo simulado'}</span><h2>{sim.title}</h2></div>
          <div className="chips">
            <button className="chip sm" aria-pressed={kind === 'sugerido'} onClick={() => setKind('sugerido')}>Sugerido pela fase</button>
            <button className="chip sm" aria-pressed={kind === 'completo'} onClick={() => setKind('completo')}>Completo</button>
          </div>
        </div>
        <div className="grid3 small">
          <div><span className="eyebrow">Tempo</span><div className="num">{fmtMin(sim.durationMin)}</div></div>
          <div><span className="eyebrow">Questões</span><div className="num">{sim.distribution.reduce((a, x) => a + x.questions, 0)}{sim.withEssay ? ' + redação' : ''}</div></div>
          <div><span className="eyebrow">Ordem</span><div>{sim.order.join(' → ')}</div></div>
        </div>
        <div className="tablewrap">
          <table className="t"><thead><tr><th>Disciplina</th><th className="r">Questões</th></tr></thead>
            <tbody>{sim.distribution.map((x) => <tr key={x.disciplineId}><td>{s.disciplines.find((dd) => dd.id === x.disciplineId)?.name}</td><td className="r">{x.questions}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="small"><b>Onde fazer:</b> {sim.source}</p>
        {sim.kind === 'completo' && <p className="small ink2">{EXAM_TIME_PLAN} Critérios: Blocos I e II eliminatórios (mínimo 50% de cada); nota final ≥ 5 nos 3 blocos; redação ≥ 24/40.</p>}
        <ResultForm sim={sim} />
      </section>

      <section className="stack">
        <h2>Resultados</h2>
        {results.length === 0 && <p className="small muted">Nenhum simulado registrado ainda.</p>}
        {results.map((r) => {
          const sm = s.simulations.find((x) => x.id === r.simulationId);
          if (!sm) return null;
          const rep = simulationReport(s, sm, r);
          return (
            <article key={r.id} className="card stack sm">
              <div className="row between">
                <b>{sm.title}</b>
                <span className="small muted">{formatBR(r.date)}</span>
              </div>
              <div className="row">
                <span className="pill">{pct(rep.percent)} de acerto</span>
                {sm.kind === 'completo' && <span className="pill">nota {rep.score10.toFixed(2).replace('.', ',')} / 10</span>}
                {(['I', 'II'] as const).filter((b) => rep.byBlock[b].total > 0).map((b) => (
                  <span key={b} className={`pill ${rep.byBlock[b].pass ? 'good' : 'crit'}`}>Bloco {b}: {pct(rep.byBlock[b].percent)} {rep.byBlock[b].pass ? '✓' : '— abaixo de 50%'}</span>
                ))}
                {rep.essay && <span className={`pill ${rep.essay.pass ? 'good' : 'crit'}`}>Redação {rep.essay.score}/40</span>}
              </div>
              {rep.approvedObjective != null && <p className="small">{rep.approvedObjective ? 'Nos critérios do edital, este resultado habilita na objetiva.' : 'Nos critérios do edital, este resultado ainda não habilita na objetiva. As prioridades já foram ajustadas.'}</p>}
              {rep.comparison && <p className="small ink2">{rep.comparison}</p>}
              <div className="tablewrap"><table className="t"><tbody>{rep.byDiscipline.map((x) => <tr key={x.disciplineId}><td>{s.disciplines.find((dd) => dd.id === x.disciplineId)?.short}</td><td className="r">{x.correct}/{x.total}</td><td className="r">{pct(x.percent)}</td></tr>)}</tbody></table></div>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{rep.actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
              <button className="btn ghost small danger" style={{ alignSelf: 'flex-start' }} onClick={() => deleteSimulationResult(r.id)}>Excluir resultado</button>
            </article>
          );
        })}
      </section>

      <section className="stack sm">
        <h2>Provas anteriores (seus PDFs)</h2>
        <div className="tablewrap"><table className="t">
          <thead><tr><th>Ano</th><th>Caderno</th><th>Formato</th><th>Faixas de questões</th><th>Uso</th></tr></thead>
          <tbody>{PAST_EXAMS.map((p) => {
            const rg = PAST_EXAM_RANGES[String(p.year)];
            return <tr key={p.year}><td>{p.year}</td><td className="mono">{p.code}</td><td>{p.format}</td><td className="small">Port. {rg.port} · Direito {rg.direito} · Atual. {rg.atual} · Mat. {rg.mat} · Info. {rg.info} · RLM {rg.rlm}</td><td className="small">{p.note}</td></tr>;
          })}</tbody>
        </table></div>
        <span className="tiny muted">Faixas de 2018/2021 deduzidas da numeração citada no estudo Raio-X; confira no caderno.</span>
      </section>
    </div>
  );
}

function ResultForm({ sim }: { sim: Simulation }) {
  const s = useAppState();
  const toast = useToast();
  const [correct, setCorrect] = useState<Record<string, string>>({});
  const [total, setTotal] = useState<Record<string, string>>({});
  const [minutes, setMinutes] = useState('');
  const [essay, setEssay] = useState('');
  const [date, setDate] = useState(getToday());
  const save = () => {
    const c: Record<string, number> = {}, t: Record<string, number> = {};
    for (const x of sim.distribution) { c[x.disciplineId] = Math.max(0, Number(correct[x.disciplineId] || 0)); t[x.disciplineId] = Math.max(1, Number(total[x.disciplineId] || x.questions)); c[x.disciplineId] = Math.min(c[x.disciplineId], t[x.disciplineId]); }
    saveSimulationResult(sim, { date, correct: c, total: t, minutesUsed: Number(minutes) || undefined, essayScore: essay ? Math.max(0, Math.min(40, Number(essay))) : undefined });
    setCorrect({}); setMinutes(''); setEssay('');
    toast('Simulado registrado. Relatório gerado abaixo.');
  };
  return (
    <details className="card tight">
      <summary className="small">Registrar resultado deste simulado</summary>
      <div className="stack" style={{ marginTop: 10 }}>
        <div className="tablewrap"><table className="t">
          <thead><tr><th>Disciplina</th><th className="r">Acertos</th><th className="r">De</th></tr></thead>
          <tbody>{sim.distribution.map((x) => (
            <tr key={x.disciplineId}>
              <td>{s.disciplines.find((d) => d.id === x.disciplineId)?.short}</td>
              <td className="r"><input id={`sr-c-${x.disciplineId}`} type="number" min={0} style={{ width: 70 }} value={correct[x.disciplineId] ?? ''} onChange={(e) => setCorrect({ ...correct, [x.disciplineId]: e.target.value })} aria-label="Acertos" /></td>
              <td className="r"><input id={`sr-t-${x.disciplineId}`} type="number" min={1} style={{ width: 70 }} placeholder={String(x.questions)} value={total[x.disciplineId] ?? ''} onChange={(e) => setTotal({ ...total, [x.disciplineId]: e.target.value })} aria-label="Total" /></td>
            </tr>
          ))}</tbody>
        </table></div>
        <div className="grid3">
          <label className="field">Data<input id="sr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field">Tempo usado (min)<input id="sr-min" type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
          {sim.withEssay && <label className="field">Redação (autoavaliação 0–40)<input id="sr-essay" type="number" min={0} max={40} value={essay} onChange={(e) => setEssay(e.target.value)} /></label>}
        </div>
        <button className="btn primary" onClick={save}>Salvar e gerar relatório</button>
      </div>
    </details>
  );
}
