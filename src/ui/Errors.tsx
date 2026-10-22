import { useMemo } from 'react';
import type { ResultClass } from '../types';
import { deleteError, getToday, useAppState, useDerived } from '../state/store';
import { RESULT_META } from '../engine/mastery';
import { addDays, formatBR } from '../engine/dates';
import { pct, topicName } from './common';

export const CADERNO_PDF = 'https://viniciusrisse.github.io/TJSP/caderno-de-erros.pdf';

const WRONG: ResultClass[] = ['conhecimento', 'atencao', 'interpretacao', 'confusao'];

const TIP: Record<string, string> = {
  conhecimento: 'Volte à lei seca/resumo só do ponto errado e transforme a regra em flashcard.',
  atencao: 'Leia o comando até o fim e circule "exceto", "incorreta", "somente", "desde que" antes de olhar as alternativas.',
  interpretacao: 'Volte ao trecho do texto e compare a alternativa palavra por palavra. Desconfie de "todos", "sempre" e palavras a mais.',
  confusao: 'Monte um quadro comparativo dos dois institutos (ex.: impedimento × suspeição) e revise o quadro, não a lei inteira.',
};

export default function Errors() {
  const s = useAppState();
  const d = useDerived();
  const today = getToday();
  const from = addDays(today, -30);

  const recent = useMemo(() => s.attempts.filter((a) => a.date >= from && WRONG.includes(a.result)), [s.attempts, from]);
  const byType = WRONG.map((r) => ({ r, n: recent.filter((a) => a.result === r).length })).sort((a, b) => b.n - a.n);
  const top = byType[0];
  const byTopic = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const a of recent) { const t = (m[a.topicId] ||= {}); t[a.result] = (t[a.result] || 0) + 1; }
    return Object.entries(m).map(([topicId, c]) => ({ topicId, c, total: Object.values(c).reduce((x, y) => x + y, 0) })).sort((a, b) => b.total - a.total);
  }, [recent]);

  return (
    <div className="page narrow">
      <header className="stack sm">
        <h1>Caderno de erros</h1>
        <p className="small ink2">O caderno é físico (ou em PDF). No site, você só classifica cada questão com as 7 opções. Isso já basta para o sistema identificar erros recorrentes e ajustar as prioridades.</p>
      </header>

      <section className="card stack">
        <h2>Como usar</h2>
        <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
          <li>Na <b>correção ativa</b> de cada missão, anote cada erro em uma linha: data, tópico, questão, tipo do erro, regra correta e pegadinha.</li>
          <li>Nas <b>revisões</b>, releia só as linhas daquele tópico e marque a coluna de revisão (1 dia, 7 dias, 21 dias).</li>
          <li><b>Uma vez por semana</b> (ex.: domingo), fotografe ou digitalize as páginas da semana em um PDF e me envie numa conversa com: <i>"Analise meu caderno de erros da semana"</i>. Eu aponto os padrões, as pegadinhas que se repetem e monto flashcards e quadros comparativos a partir deles.</li>
        </ol>
        <a className="btn primary" href={CADERNO_PDF} target="_blank" rel="noreferrer">Abrir modelo do caderno (PDF para imprimir)</a>
        <span className="tiny muted">Também serve em caderno comum: basta copiar as colunas do modelo.</span>
      </section>

      <section className="card stack">
        <h2>O que o sistema já percebeu (últimos 30 dias)</h2>
        {recent.length === 0 ? <p className="small muted">Ainda sem erros classificados neste período. Eles aparecem aqui conforme você registra as questões das missões.</p> : (
          <>
            <div className="row">{byType.map(({ r, n }) => <span key={r} className="pill">{RESULT_META[r].emoji} {RESULT_META[r].short}: {n} ({pct(n / recent.length)})</span>)}</div>
            {top && top.n > 0 && (
              <div className="card tight stack sm">
                <div className="eyebrow">Seu tipo de erro mais comum: {RESULT_META[top.r].emoji} {RESULT_META[top.r].short}</div>
                <p className="small">{TIP[top.r]}</p>
              </div>
            )}
            <div className="tablewrap"><table className="t">
              <thead><tr><th>Tópico</th><th className="r">🔴</th><th className="r">🔵</th><th className="r">🟣</th><th className="r">⚫</th><th className="r">Total</th></tr></thead>
              <tbody>{byTopic.slice(0, 15).map((x) => (
                <tr key={x.topicId}>
                  <td>{d.stats[x.topicId]?.recurring && <span className="pill crit" style={{ marginRight: 6 }}>recorrente</span>}{topicName(s, x.topicId)}</td>
                  {WRONG.map((r) => <td key={r} className="r">{x.c[r] || ''}</td>)}
                  <td className="r"><b>{x.total}</b></td>
                </tr>
              ))}</tbody>
            </table></div>
            <span className="tiny muted">"Recorrente" = o mesmo tipo de erro 3 vezes ou mais no tópico em 30 dias. Esses tópicos já sobem de prioridade nas missões.</span>
          </>
        )}
      </section>

      {s.errors.length > 0 && (
        <details className="card tight">
          <summary className="small">Registros antigos feitos no site ({s.errors.length})</summary>
          <ul className="clean" style={{ marginTop: 10 }}>
            {[...s.errors].sort((a, b) => (a.date < b.date ? 1 : -1)).map((e) => (
              <li key={e.id} className="card tight stack sm">
                <span className="small"><b>{RESULT_META[e.reason].emoji} {topicName(s, e.topicId)}</b> <span className="muted">· {formatBR(e.date)}</span></span>
                {e.question && <span className="small">{e.question}</span>}
                {e.rule && <span className="small"><b>Regra:</b> {e.rule}</span>}
                {e.trap && <span className="small"><b>Pegadinha:</b> {e.trap}</span>}
                <button className="btn ghost small danger" style={{ alignSelf: 'flex-start' }} onClick={() => deleteError(e.id)}>Excluir</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
