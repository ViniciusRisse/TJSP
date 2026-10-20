import { useState } from 'react';
import { getToday, useAppState, useDerived } from '../state/store';
import { evidenceStatements, monthlySeries, returnRate, RISK_META, weeklySeries } from '../engine/metrics';
import { RESULT_META } from '../engine/mastery';
import { simulationReport } from '../engine/simulations';
import { formatBR } from '../engine/dates';
import { BulletBar, fmt1, fmtMin, LineChart, pct, RiskPill, topicName } from './common';
import type { View } from './App';

export default function Evolucao({ go }: { go: (v: View) => void }) {
  const s = useAppState();
  const d = useDerived();
  const today = getToday();
  const [range, setRange] = useState<'semana' | 'mes'>('semana');
  const [win, setWin] = useState(30);
  const rr = returnRate(s, today, win);
  const series = range === 'semana' ? weeklySeries(s.attempts, today, 12) : monthlySeries(s.attempts, today, 6);
  const evidence = evidenceStatements(s, today);
  const n = s.attempts.length;
  const correct = s.attempts.filter((a) => RESULT_META[a.result].correct).length;
  const strict = s.attempts.filter((a) => a.result === 'seguro' || a.result === 'duvida').length;
  const dominated = Object.values(d.stats).filter((x) => x.status === 'dominado').length;
  const critical = Object.values(d.stats).filter((x) => x.status === 'reforco');
  const studied = Object.values(d.stats).filter((x) => x.n >= 5).sort((a, b) => a.mastery - b.mastery);
  const minutes = s.sessions.reduce((a, x) => a + x.minutes, 0);
  const sims = [...s.simulationResults].sort((a, b) => (a.date < b.date ? -1 : 1));

  return (
    <div className="page">
      <header className="stack sm">
        <h1>Evolução</h1>
        <p className="small ink2">Só indicadores que respondem "estou melhorando?". Comparações aparecem apenas quando há amostra suficiente.</p>
      </header>

      {/* RISCO */}
      <section className="card stack" aria-labelledby="risco">
        <div className="row between"><h2 id="risco">Risco para a prova</h2>{d.risk.lowEvidence ? <span className="pill">Base em construção</span> : <RiskPill level={d.risk.level} />}</div>
        <p className="small">{d.risk.summary}</p>
        <div className="stack">
          {d.risk.blocks.map((b) => (
            <div key={b.block} className="stack sm">
              <div className="row between small">
                <span><b>Bloco {b.block}</b> — {b.name}{b.eliminatory ? ' · eliminatório' : ''}</span>
                <span className="row" style={{ gap: 6 }}><span className="num">{pct(b.percent)}</span>{!d.risk.lowEvidence && <RiskPill level={b.level} />}</span>
              </div>
              <BulletBar value={b.percent} min={b.eliminatory ? b.min : undefined} target={s.exam.targetPercent} label={`Bloco ${b.block}`} />
              <span className="tiny muted">{b.source}{b.actions.length ? ` · onde agir: ${b.actions.join(' · ')}` : ''}</span>
            </div>
          ))}
          <span className="tiny muted">Linha vermelha: mínimo eliminatório (50%). Linha escura: sua meta ({pct(s.exam.targetPercent)}). Tópicos sem questões contam como chute (20%).</span>
        </div>
        <div className="kpis">
          <div className="kpi"><span className="eyebrow">Nota projetada</span><b>{fmt1(d.risk.overall.score)}</b><span className="tiny muted">meta {fmt1(d.risk.overall.target)} · mínimo {s.exam.minFinalScore}</span></div>
          <div className="kpi"><span className="eyebrow">Ainda não iniciado</span><b>{d.risk.notStarted.topics}</b><span className="tiny muted">tópicos · ≈ {Math.round(d.risk.notStarted.questions)} questões</span></div>
          <div className="kpi"><span className="eyebrow">Edital iniciado</span><b>{pct(d.risk.projection.coverage)}</b><span className="tiny muted">ponderado pelo peso</span></div>
          <div className="kpi"><span className="eyebrow">Fase</span><b>{d.phase}</b><span className="tiny muted">{RISK_META[d.risk.overall.level].label} na nota geral</span></div>
        </div>
      </section>

      {/* TAXA DE RETORNO */}
      <section className="card stack" aria-labelledby="retorno">
        <div className="row between">
          <h2 id="retorno">Taxa de retorno</h2>
          <div className="chips">{[14, 30, 60].map((w) => <button key={w} className="chip sm" aria-pressed={win === w} onClick={() => setWin(w)}>{w} dias</button>)}</div>
        </div>
        <p>{rr.sentence}</p>
        {rr.enoughData && (
          <>
            <div className="kpis">
              <div className="kpi"><span className="eyebrow">Tempo estudado</span><b>{fmtMin(rr.minutes)}</b></div>
              <div className="kpi"><span className="eyebrow">Questões</span><b>{rr.attempts}</b></div>
              <div className="kpi"><span className="eyebrow">Projeção</span><b>{rr.deltaQuestions >= 0 ? '+' : ''}{fmt1(rr.deltaQuestions)}</b><span className="tiny muted">questões na prova</span></div>
              <div className="kpi"><span className="eyebrow">Retorno</span><b>{rr.per10h != null ? `${rr.per10h >= 0 ? '+' : ''}${fmt1(rr.per10h)}` : '—'}</b><span className="tiny muted">questões a cada 10h</span></div>
            </div>
            {rr.topicGains.length > 0 && (
              <div className="tablewrap"><table className="t">
                <thead><tr><th>Tópico estudado no período</th><th className="r">Antes</th><th className="r">Agora</th></tr></thead>
                <tbody>{rr.topicGains.slice(0, 8).map((g) => <tr key={g.topicId}><td>{topicName(s, g.topicId)}</td><td className="r">{g.before ? `${g.before}%` : 'novo'}</td><td className="r">{g.after}%</td></tr>)}</tbody>
              </table></div>
            )}
          </>
        )}
      </section>

      {/* EVIDÊNCIAS */}
      {evidence.length > 0 && (
        <section className="card stack sm"><h2>Evidências de progresso</h2><ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{evidence.map((e, i) => <li key={i}>{e}</li>)}</ul></section>
      )}

      {/* NÚMEROS GERAIS */}
      <section className="kpis">
        <div className="card tight kpi"><span className="eyebrow">Acerto geral</span><b>{pct(n ? correct / n : null)}</b><span className="tiny muted">sem chutes: {pct(n ? strict / n : null)}</span></div>
        <div className="card tight kpi"><span className="eyebrow">Questões</span><b>{n}</b><span className="tiny muted">{fmtMin(minutes)} de estudo registrado</span></div>
        <div className="card tight kpi"><span className="eyebrow">Dominados</span><b>{dominated}</b><span className="tiny muted">de {s.topics.length} tópicos</span></div>
        <div className="card tight kpi"><span className="eyebrow">Críticos</span><b>{critical.length}</b><span className="tiny muted">precisam de reforço</span></div>
      </section>

      <section className="card stack">
        <div className="row between">
          <h2>Acerto ao longo do tempo</h2>
          <div className="chips"><button className="chip sm" aria-pressed={range === 'semana'} onClick={() => setRange('semana')}>Semanal</button><button className="chip sm" aria-pressed={range === 'mes'} onClick={() => setRange('mes')}>Mensal</button></div>
        </div>
        {n === 0 ? <p className="small muted">O gráfico aparece quando houver questões registradas.</p>
          : <LineChart points={series.map((p) => ({ label: p.label, value: p.strict, n: p.n }))} yLabel="Acerto sem chutes por período" refLine={{ value: s.exam.targetPercent, label: 'meta' }} />}
        <span className="tiny muted">Acerto sem chutes (🟢 + 🟠) por {range === 'semana' ? 'semana' : 'mês'}.</span>
      </section>

      <section className="card stack">
        <h2>Por disciplina</h2>
        <div className="tablewrap"><table className="t">
          <thead><tr><th>Disciplina</th><th className="r">Questões</th><th className="r">Acerto</th><th className="r">Sem chute</th><th>Domínio</th><th className="r">Iniciado</th></tr></thead>
          <tbody>{[...s.disciplines].sort((a, b) => a.order - b.order).map((disc) => {
            const ds = d.discStats[disc.id];
            return (
              <tr key={disc.id}>
                <td><span className="dot" style={{ background: disc.color, marginRight: 6 }} />{disc.short} <span className="tiny muted">({disc.block})</span></td>
                <td className="r">{ds.n}</td><td className="r">{pct(ds.accuracy)}</td><td className="r">{pct(ds.strictAccuracy)}</td>
                <td style={{ minWidth: 120 }}><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><div style={{ flex: 1 }}><div className="meter"><i style={{ width: `${ds.mastery}%` }} /></div></div><span className="num tiny">{ds.mastery}%</span></div></td>
                <td className="r">{pct(ds.coverage)}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </section>

      <section className="card stack">
        <h2>Por tópico (com 5+ questões)</h2>
        {studied.length === 0 ? <p className="small muted">Aparece quando algum tópico tiver pelo menos 5 questões.</p> : (
          <div className="tablewrap"><table className="t">
            <thead><tr><th>Tópico</th><th className="r">Questões</th><th className="r">Acerto</th><th className="r">Domínio</th></tr></thead>
            <tbody>{studied.map((x) => <tr key={x.topicId} style={{ cursor: 'pointer' }} onClick={() => go('mapa')}><td>{x.status === 'reforco' ? '🔴 ' : x.status === 'dominado' ? '🟢 ' : ''}{topicName(s, x.topicId)}</td><td className="r">{x.n}</td><td className="r">{pct(x.accuracy)}</td><td className="r">{x.mastery}%</td></tr>)}</tbody>
          </table></div>
        )}
      </section>

      <section className="card stack">
        <h2>Simulados</h2>
        {sims.length === 0 ? <p className="small muted">Nenhum simulado registrado.</p> : (
          <div className="tablewrap"><table className="t">
            <thead><tr><th>Data</th><th>Simulado</th><th className="r">Acerto</th><th className="r">Bloco I</th><th className="r">Bloco II</th><th className="r">Nota</th></tr></thead>
            <tbody>{sims.map((r) => {
              const sm = s.simulations.find((x) => x.id === r.simulationId);
              if (!sm) return null;
              const rep = simulationReport(s, sm, r);
              return <tr key={r.id}><td>{formatBR(r.date)}</td><td>{sm.title}</td><td className="r">{pct(rep.percent)}</td><td className="r">{rep.byBlock.I.total ? pct(rep.byBlock.I.percent) : '—'}</td><td className="r">{rep.byBlock.II.total ? pct(rep.byBlock.II.percent) : '—'}</td><td className="r">{sm.kind === 'completo' ? fmt1(rep.score10) : '—'}</td></tr>;
            })}</tbody>
          </table></div>
        )}
      </section>

      <section className="stack">
        <h2>Relatórios semanais</h2>
        {s.weeklyReports.length === 0 && <p className="small muted">O primeiro relatório sai na primeira abertura da próxima semana.</p>}
        {[...s.weeklyReports].reverse().slice(0, 8).map((w) => (
          <details key={w.week} className="card tight">
            <summary className="small">Semana de {formatBR(w.week)} · {w.attempts} questões · acerto {pct(w.accuracy)}</summary>
            <div className="stack sm" style={{ marginTop: 10 }}>
              <div className="small">Tempo por disciplina: {Object.entries(w.minutesByDiscipline).map(([k, v]) => `${s.disciplines.find((x) => x.id === k)?.short} ${fmtMin(v)}`).join(' · ') || '—'}</div>
              <div className="small">Novos erros detalhados: {w.newErrors} · revisões: {w.reviewsDone} · simulados: {w.simulations}</div>
              <div className="eyebrow">Ajustes aplicados</div>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{w.adjustments.map((a, i) => <li key={i}>{a}</li>)}</ul>
              <div className="eyebrow">Prioridades da semana</div>
              <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>{w.topPriorities.map((p) => <li key={p.topicId}>{topicName(s, p.topicId)}</li>)}</ol>
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}
