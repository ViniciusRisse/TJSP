import { useState } from 'react';
import { deleteEssay, getToday, saveEssay, useAppState, useDerived } from '../state/store';
import { essayPhaseFor, essayDueThisWeek } from '../engine/mission';
import { ESSAY_PHASES, ESSAY_RULES, ESSAY_TRAINING_THEMES } from '../data/vunesp';
import { formatBR } from '../engine/dates';
import { useToast } from './common';

const CRITERIA = [
  { id: 'tema', label: 'a) Tema', help: 'Atende ao tema proposto? Fuga total = nota 0.' },
  { id: 'estrutura', label: 'b) Estrutura (gênero/tipo e coerência)', help: 'Tese clara, macroestrutura, argumentos desenvolvidos, autonomia do texto.' },
  { id: 'lingua', label: 'c) Língua (modalidade e registro)', help: 'Norma-padrão: concordância, regência, ortografia, acentuação, pontuação, precisão vocabular.' },
  { id: 'coesao', label: 'd) Coesão', help: 'Conectivos, retomadas, paragrafação equilibrada.' },
] as const;

export default function Redacao() {
  const s = useAppState();
  const d = useDerived();
  const toast = useToast();
  const ep = essayPhaseFor(s, d.phase);
  const phase = ESSAY_PHASES[ep - 1];
  const usedThemes = new Set(s.essays.map((e) => e.theme));
  const suggested = ESSAY_TRAINING_THEMES.find((t) => !usedThemes.has(t.theme)) ?? ESSAY_TRAINING_THEMES[0];
  const [theme, setTheme] = useState(suggested.theme);
  const [lines, setLines] = useState('');
  const [minutes, setMinutes] = useState(String(phase.minutes));
  const [scores, setScores] = useState({ tema: 7, estrutura: 6, lingua: 6, coesao: 6 });
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');
  const full = ep >= 4;
  const total = scores.tema + scores.estrutura + scores.lingua + scores.coesao;
  const zeroRisk = full && (!checks.tema || !checks.genero || !checks.linhas || !checks.ident);

  const save = () => {
    saveEssay({ date: getToday(), phase: ep, theme, lines: Number(lines) || undefined, scores: full ? scores : undefined, checks, notes, minutes: Number(minutes) || undefined });
    setChecks({}); setNotes(''); setLines('');
    toast('Exercício de redação registrado.');
  };

  return (
    <div className="page narrow">
      <header className="stack sm">
        <h1>Redação</h1>
        <p className="small ink2">Eliminatória: escala 0–40, mínimo 24 (19,2 para inscritos nas vagas reservadas). Texto dissertativo-argumentativo em prosa a partir de uma coletânea. Não é necessário proposta de intervenção.</p>
      </header>

      <section className="card stack">
        <div className="row between"><span className="eyebrow">Etapa atual</span><span className="pill">{essayDueThisWeek(s, getToday()) ? 'exercício da semana pendente' : 'exercício da semana feito'}</span></div>
        <h2>Etapa {ep} — {phase.name}</h2>
        <p className="small">{phase.task} <span className="muted">({phase.minutes} min)</span></p>
        <ol className="small ink2" style={{ margin: 0, paddingLeft: 18 }}>
          {ESSAY_PHASES.map((p) => <li key={p.phase} style={{ fontWeight: p.phase === ep ? 700 : 400 }}>{p.name}</li>)}
        </ol>
        <span className="tiny muted">A etapa avança com a fase do projeto e com o número de exercícios feitos. 1 exercício por semana, sem tirar espaço da objetiva nas fases iniciais.</span>
      </section>

      <section className="card stack">
        <h2>Registrar exercício</h2>
        <label className="field">Tema
          <select id="rd-theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
            {ESSAY_TRAINING_THEMES.map((t) => <option key={t.theme} value={t.theme}>{t.real ? '★ ' : ''}{t.theme}</option>)}
          </select>
        </label>
        <span className="tiny muted">{ESSAY_TRAINING_THEMES.find((t) => t.theme === theme)?.source}. Para coletâneas, use propostas VUNESP de outros concursos de nível médio.</span>
        <div className="grid2">
          <label className="field">Linhas escritas{full ? ' (folha de 33)' : ''}<input id="rd-lines" type="number" min={0} max={40} value={lines} onChange={(e) => setLines(e.target.value)} /></label>
          <label className="field">Tempo (min)<input id="rd-min" type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
        </div>
        {full && Number(lines) > 0 && Number(lines) <= 20 && <p className="small" style={{ color: 'var(--serious)' }}>Com {lines} linhas: {Number(lines) <= 7 ? 'nota 0 (7 linhas ou menos).' : Number(lines) <= 15 ? 'perde 1 ponto nos critérios c e d e não alcança a nota máxima.' : 'não alcança a nota máxima nos critérios c e d.'} Meta: 25 a 30 linhas.</p>}

        <div className="stack sm">
          <div className="eyebrow">Checklist do edital</div>
          {ESSAY_RULES.map((r) => (
            <label key={r.id} className="check"><input id={`rd-${r.id}`} type="checkbox" checked={!!checks[r.id]} onChange={(e) => setChecks({ ...checks, [r.id]: e.target.checked })} />{r.label}</label>
          ))}
        </div>

        {full && (
          <div className="stack sm">
            <div className="eyebrow">Autoavaliação (estimativa: 10 pontos por critério)</div>
            {CRITERIA.map((c) => (
              <label key={c.id} className="field">{c.label}: <b className="num">{scores[c.id]}</b>
                <input id={`rd-s-${c.id}`} type="range" min={0} max={10} value={scores[c.id]} onChange={(e) => setScores({ ...scores, [c.id]: Number(e.target.value) })} />
                <span className="tiny muted" style={{ fontWeight: 400 }}>{c.help}</span>
              </label>
            ))}
            <p className="small"><b>Total estimado: {zeroRisk ? 0 : total}/40</b> {zeroRisk ? '— algum item que zera a redação não foi marcado.' : total >= 24 ? '— acima do mínimo.' : '— abaixo do mínimo de 24.'}</p>
            <span className="tiny muted">O edital fixa a escala (0–40) e os 4 critérios; a divisão em 10 por critério é estimativa para treino.</span>
          </div>
        )}
        <label className="field">O que melhorar no próximo<textarea id="rd-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></label>
        <button className="btn primary" onClick={save}>Salvar exercício</button>
      </section>

      <section className="stack sm">
        <h2>Histórico</h2>
        {s.essays.length === 0 && <p className="small muted">Nenhum exercício registrado.</p>}
        {[...s.essays].reverse().map((e) => (
          <div key={e.id} className="card tight row between">
            <span className="small"><b>{formatBR(e.date)}</b> · etapa {e.phase} · {e.theme}{e.lines ? ` · ${e.lines} linhas` : ''}{e.scores ? ` · ${e.scores.tema + e.scores.estrutura + e.scores.lingua + e.scores.coesao}/40` : ''}</span>
            <button className="btn ghost small danger" onClick={() => deleteEssay(e.id)}>Excluir</button>
          </div>
        ))}
      </section>
    </div>
  );
}
