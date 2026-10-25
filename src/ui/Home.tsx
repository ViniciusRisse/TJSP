import { useState } from 'react';
import type { Mood } from '../types';
import { dismissCycle, getToday, markRestDay, setMissionParams, startMission, updateUser, useAppState, useDerived } from '../state/store';
import { daysLeft, PHASES } from '../engine/priority';
import { evidenceStatements } from '../engine/metrics';
import { detectReturn } from '../engine/absence';
import { missionMinutes, TIME_OPTIONS } from '../engine/mission';
import { nextSimulationSpec, simulationDue, lastSimulationDate } from '../engine/simulations';
import { formatBR, weekday } from '../engine/dates';
import { fmtMin, Meter, pct, RiskPill, topicName } from './common';
import { lsGet, lsSet } from '../state/persist';
import type { View } from './App';

const MOODS: { id: Mood; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'cansada', label: 'Estou cansada' },
  { id: 'mal', label: 'Estou muito mal' },
];

const KIND_LABEL: Record<string, string> = {
  aprendizado: 'Aprendizado', questoes: 'Questões', correcao: 'Correção ativa', revisao: 'Revisão', flashcards: 'Flashcards',
  redacao: 'Redação', simulado: 'Simulado', leiseca: 'Lei seca', diagnostico: 'Diagnóstico',
};

export default function Home({ go, openTask }: { go: (v: View) => void; openTask: (id?: string) => void }) {
  const s = useAppState();
  const d = useDerived();
  const today = getToday();
  const m = s.missions[today];
  const left = daysLeft(s, today);
  const ret = detectReturn(s, today);
  const [custom, setCustom] = useState('');
  const isSunday = weekday(today) === 0 && s.settings.sundayOptional;
  const done = m?.tasks.filter((t) => t.status === 'feita').length ?? 0;
  const total = m?.tasks.length ?? 0;
  const completed = !!m?.completedAt;
  const nextTask = m?.tasks.find((t) => t.status === 'pendente');

  const choose = (min: number, mood: Mood = m?.mood ?? 'normal') => setMissionParams(min, mood);

  const critical = Object.values(d.stats).filter((x) => x.status === 'reforco').sort((a, b) => (d.prio[b.topicId]?.score ?? 0) - (d.prio[a.topicId]?.score ?? 0)).slice(0, 3);
  const evidence = evidenceStatements(s, today);
  const sim = simulationDue(s, d.phase, today) ? nextSimulationSpec(s, d.phase, d.prio) : null;
  const lastSim = lastSimulationDate(s);
  const report = s.weeklyReports[s.weeklyReports.length - 1];
  const reportSeen = report && lsGet('seenReport') === report.week;

  return (
    <div className="page narrow">
      <header className="stack sm">
        <div className="eyebrow">Projeto TJSP · Escrevente · {s.settings.region}</div>
        <div className="countdown"><span>Faltam</span><b className="num">{left}</b><span>dias para a prova ({formatBR(s.settings.examDate)}).</span></div>
      </header>

      {!s.user.onboarded && <Onboarding />}

      {ret.message && !completed && <div className="card tight" role="status"><b>{ret.message}</b></div>}

      {m && (
        <section className="card hero stack" aria-labelledby="missao">
          <div className="row between">
            <h1 id="missao" style={{ fontSize: '1.45rem', letterSpacing: '.03em' }}>{completed ? 'MISSÃO CONCLUÍDA' : 'MISSÃO DE HOJE'}</h1>
            <span className="mono small">⏱ ≈ {fmtMin(missionMinutes(m))}</span>
          </div>
          <div className="stack sm">
            <div className="eyebrow">🎯 Objetivo</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{m.objective}</div>
            {m.message && <p className="small" style={{ opacity: .9 }}>{m.message}</p>}
            {m.resumedFrom && done === 0 && !completed && (
              <button className="btn small" style={{ alignSelf: 'flex-start', background: 'transparent', color: 'inherit', borderColor: 'color-mix(in srgb, currentColor 45%, transparent)' }} onClick={dismissCycle}>
                Seguir com a missão nova
              </button>
            )}
          </div>
          <div>
            {m.tasks.map((t, i) => {
              const pend = t.status === 'pendente';
              return (
                <div key={t.id} className={`task ${!pend ? 'done' : ''}`} role={pend ? 'button' : undefined} tabIndex={pend ? 0 : undefined}
                  style={{ cursor: pend ? 'pointer' : 'default' }} onClick={() => pend && openTask(t.id)} onKeyDown={(e) => pend && e.key === 'Enter' && openTask(t.id)}
                  aria-label={pend ? `Começar por: ${t.title}` : undefined}>
                  <div className="n">{t.status === 'feita' ? '✓' : i + 1}</div>
                  <div className="stack sm" style={{ gap: 2, minWidth: 0 }}>
                    <div className="tiny" style={{ opacity: .8, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '.06em' }}>{KIND_LABEL[t.kind]}</div>
                    <div className="ttl" style={{ fontWeight: 600 }}>{t.kind === 'flashcards' || t.kind === 'redacao' ? t.title : t.title.replace(/^[^—]+— /, '')}{t.questions && (t.kind === 'questoes' || t.kind === 'diagnostico') ? ` · ${t.questions} questões` : ''}</div>
                  </div>
                  <div className="min">≈ {t.minutes} min</div>
                </div>
              );
            })}
          </div>
          {!completed && m.availableMin - missionMinutes(m) >= 10 && <p className="small" style={{ fontWeight: 600 }}>+ ≈ {fmtMin(m.availableMin - missionMinutes(m))} de folga para o que levar mais tempo.</p>}
          {!completed && <p className="tiny" style={{ opacity: .85 }}>A ordem é sua: toque em qualquer tarefa para começar por ela. Os tempos são estimativas — se algo levar mais, tudo bem; o que ficar pendente volta amanhã.</p>}
          {!completed ? (
            <button className="btn big" onClick={() => openTask()}>
              {done > 0 ? `Continuar (${done}/${total})` : 'Começar missão'}
            </button>
          ) : (
            <p className="small">Registro salvo. Amanhã a missão já estará pronta — sem nada acumulado.</p>
          )}
          {nextTask && done > 0 && <p className="tiny" style={{ opacity: .85 }}>Próxima: {nextTask.title}</p>}
        </section>
      )}

      <section className="stack" aria-label="Tempo e estado de hoje">
        <div className="stack sm">
          <div className="eyebrow">Tempo disponível</div>
          <div className="chips">
            {TIME_OPTIONS.map((t) => (
              <button key={t} className="chip" aria-pressed={m?.availableMin === t} onClick={() => choose(t)}>{t === 180 ? '3h+' : fmtMin(t).replace(' min', 'm')}</button>
            ))}
            <span className="row" style={{ gap: 6 }}>
              <input id="custom-min" type="number" min={10} max={480} placeholder="outro (min)" value={custom} onChange={(e) => setCustom(e.target.value)} style={{ width: 120 }} aria-label="Outro tempo em minutos" />
              <button className="chip" onClick={() => { const v = Number(custom); if (v >= 10) { choose(v); setCustom(''); } }}>OK</button>
            </span>
          </div>
        </div>
        <div className="stack sm">
          <div className="eyebrow">Como você está hoje?</div>
          <div className="chips">
            {MOODS.map((x) => (
              <button key={x.id} className="chip" aria-pressed={m?.mood === x.id} onClick={() => choose(m?.availableMin ?? 60, x.id)}>{x.label}</button>
            ))}
          </div>
          {m?.mood === 'mal' && <p className="small ink2">Hoje não precisamos avançar muito. Precisamos apenas manter o projeto vivo.</p>}
        </div>
        {isSunday && !completed && (
          <div className="card tight row between">
            <span className="small">Domingo: estudar ou descansar? Descanso também faz parte do projeto.</span>
            <button className="btn small" onClick={markRestDay}>Hoje vou descansar</button>
          </div>
        )}
      </section>

      <section className="stack" aria-labelledby="momento">
        <h2 id="momento">Meu momento</h2>
        <div className="grid2">
          <div className="card tight stack sm">
            <div className="eyebrow">Projeção de nota</div>
            {d.risk.lowEvidence ? (
              <div className="row between"><b style={{ fontSize: '1.1rem', fontFamily: 'var(--f-display)' }}>Base em construção</b><span className="pill">sem evidência suficiente</span></div>
            ) : (
              <div className="row between"><b className="num" style={{ fontSize: '1.6rem', fontFamily: 'var(--f-display)' }}>{d.risk.projection.score.toFixed(1).replace('.', ',')}<span className="muted small"> / 10</span></b><RiskPill level={d.risk.level} /></div>
            )}
            <Meter value={d.risk.projection.coverage * 100} label="Edital iniciado" />
            <span className="tiny muted">{pct(d.risk.projection.coverage)} do peso do edital já iniciado · fase {d.phase}: {PHASES[d.phase].name}</span>
          </div>
          <div className="card tight stack sm">
            <div className="eyebrow">Pontos críticos</div>
            {critical.length ? (
              <ul className="clean small">{critical.map((c) => <li key={c.topicId}>🔴 {topicName(s, c.topicId)} <span className="muted">· {c.mastery}%</span></li>)}</ul>
            ) : <span className="small muted">Nenhum tópico com erro recorrente ou domínio muito baixo até agora.</span>}
          </div>
          <div className="card tight stack sm">
            <div className="eyebrow">Evolução recente</div>
            {evidence.length ? <p className="small">{evidence[0]}</p> : <span className="small muted">Ainda sem amostra suficiente para comparar períodos. A comparação aparece quando houver pelo menos 15 questões em cada período.</span>}
          </div>
          <div className="card tight stack sm">
            <div className="eyebrow">Próximo simulado</div>
            {sim ? <span className="small">{sim.title} — {fmtMin(sim.durationMin)}. Entra na missão em um dia com tempo suficiente.</span>
              : <span className="small muted">{lastSim ? `Último em ${formatBR(lastSim)}. O próximo entra quando a fase pedir.` : 'O primeiro entra quando houver questões suficientes registradas (fase 1: mini-simulados).'}</span>}
            <button className="btn small" onClick={() => go('simulados')}>Ver simulados</button>
          </div>
        </div>
        {report && !reportSeen && (
          <div className="card stack sm">
            <div className="row between"><div className="eyebrow">Ajustes da semana</div><button className="btn ghost small" onClick={() => { lsSet('seenReport', report.week); updateUser({}); }}>Entendi</button></div>
            <ul className="small reasons" style={{ margin: 0, paddingLeft: 18 }}>{report.adjustments.slice(0, 4).map((a, i) => <li key={i}>{a}</li>)}</ul>
            <button className="btn small" onClick={() => go('evolucao')}>Ver relatório</button>
          </div>
        )}
        {m && s.settings.showReasons && m.reasons.length > 0 && (
          <details className="card tight">
            <summary className="small">Por que esta missão?</summary>
            <ul className="small ink2" style={{ margin: '8px 0 0', paddingLeft: 18 }}>{m.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </details>
        )}
      </section>
    </div>
  );
}

function Onboarding() {
  const s = useAppState();
  const [name, setName] = useState(s.user.name);
  return (
    <div className="card stack">
      <h2>Bem-vinda ao Projeto TJSP</h2>
      <p className="small ink2">O sistema decide o que estudar todos os dias. Sua parte: abrir, começar, estudar e registrar o resultado. Se um dia não der, nada se acumula: a missão seguinte se reorganiza sozinha.</p>
      <ul className="small ink2" style={{ margin: 0, paddingLeft: 18 }}>
        <li>Prova: 14/03/2027 · Circunscrição de Jundiaí (5ª CJ). A opção de comarca não vincula a nomeação.</li>
        <li>Tempo padrão: 1h (seg–qua), 2h (qui–sáb); domingo opcional. Ajuste em Ajustes.</li>
        <li>Seus dados ficam neste aparelho. Faça backup em Ajustes de vez em quando.</li>
      </ul>
      <label className="field">Como prefere ser chamada? (opcional)
        <input id="onb-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button className="btn primary" onClick={() => updateUser({ name: name.trim(), onboarded: true })}>Pronto, mostrar minha missão</button>
    </div>
  );
}
