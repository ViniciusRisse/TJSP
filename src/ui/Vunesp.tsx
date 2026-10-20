import { useState } from 'react';
import { useAppState } from '../state/store';
import { histCount } from '../engine/priority';
import { PAST_EXAMS } from '../data/vunesp';

export default function Vunesp() {
  const s = useAppState();
  const [disc, setDisc] = useState('todas');
  const discs = [...s.disciplines].sort((a, b) => a.order - b.order);
  const topics = s.topics.filter((t) => disc === 'todas' || t.disciplineId === disc).sort((a, b) => histCount(b) - histCount(a));
  const patterns = s.patterns.filter((p) => disc === 'todas' || p.disciplines.includes(disc));

  return (
    <div className="page">
      <header className="stack sm">
        <h1>DNA VUNESP</h1>
        <p className="small ink2">Como a banca costuma cobrar cada assunto, a partir das provas TJSP 2018, 2021 e 2025. Histórico aumenta a prioridade; não garante que o assunto cairá.</p>
      </header>
      <div className="chips">
        <button className="chip sm" aria-pressed={disc === 'todas'} onClick={() => setDisc('todas')}>Todas</button>
        {discs.map((d) => <button key={d.id} className="chip sm" aria-pressed={disc === d.id} onClick={() => setDisc(d.id)}>{d.short}</button>)}
      </div>

      <section className="stack">
        <h2>Pegadinhas que se repetem</h2>
        <p className="small ink2">Em Direito, quase toda alternativa errada é o texto da lei com um único elemento trocado. Por isso o sistema mede dois níveis: <b>A — sei o que a lei diz?</b> e <b>B — reconheço quando a banca altera prazo, condição, exceção ou consequência?</b></p>
        <div className="grid2">
          {patterns.map((p) => (
            <article key={p.id} className="card tight stack sm">
              <h3>{p.name}</h3>
              <p className="small">{p.how}</p>
              <ul className="small ink2" style={{ margin: 0, paddingLeft: 18 }}>{p.examples.map((e, i) => <li key={i}>{e}</li>)}</ul>
              <p className="small"><b>Defesa:</b> {p.defense}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="stack">
        <h2>Assuntos por incidência</h2>
        <div className="tablewrap"><table className="t">
          <thead><tr><th>Assunto</th><th>2018</th><th>2021</th><th>2025</th><th className="r">Provas</th><th>Como cai</th></tr></thead>
          <tbody>{topics.map((t) => (
            <tr key={t.id}>
              <td><b>{t.name}</b>{t.articles && <><br /><span className="stampchip">{t.articles}</span></>}<br /><span className="tiny muted">{s.disciplines.find((d) => d.id === t.disciplineId)?.short} · nível {t.baseLevel === 1 ? 'básico' : t.baseLevel === 2 ? 'intermediário' : 'avançado'}</span></td>
              <td className="small">{t.history.y2018?.join(', ') || '—'}</td>
              <td className="small">{t.history.y2021?.join(', ') || '—'}</td>
              <td className="small">{t.history.y2025?.join(', ') || '—'}</td>
              <td className="r">{histCount(t)}/3</td>
              <td className="small" style={{ minWidth: 220 }}>{t.chargeType}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>

      <section className="card stack sm">
        <h2>Tendências</h2>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Casos hipotéticos em Direito: cerca de 1 em 40 (2018), 11 em 40 (2021) e 19 em 30 (2025). Leia primeiro a pergunta, ache o artigo e só depois a história.</li>
          <li>Português 2025: interpretação caiu para 3 de 16; quase toda a gramática veio por reescrita de trechos do texto.</li>
          <li>Normas da Corregedoria caíram de 5 questões para 1; a Legislação Interna passou a ter cerca de 1 questão por norma.</li>
          <li>Matemática 2025: resposta como "algarismo das unidades" — a conta precisa fechar.</li>
          <li>Informática migrou de Office 2016/Windows 10 para Microsoft 365/Windows 11.</li>
          <li>Atualidades: trecho de notícia + detalhe, sobre fatos de até cerca de 3 meses antes da prova.</li>
          <li>Art. 92 da CF está no edital e não caiu em nenhuma das três provas.</li>
        </ul>
      </section>

      <section className="stack sm">
        <h2>Fontes</h2>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {PAST_EXAMS.map((p) => <li key={p.year}>TJSP {p.year} — caderno {p.code} ({p.format}; {p.region}). {p.note}</li>)}
          <li>Estudo "Raio-X VUNESP – Escrevente TJSP" (20/10/2026). Os cadernos vieram sem gabarito: confira com o gabarito definitivo da VUNESP.</li>
        </ul>
      </section>
    </div>
  );
}
