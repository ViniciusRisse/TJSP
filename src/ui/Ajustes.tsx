import { useRef, useState } from 'react';
import type { PriorityWeights } from '../types';
import {
  addDistraction, exportJSON, getSaveStatus, getSyncStatus, getToday, importAttemptsCSV, importJSON, regenerateMission,
  resetAll, setSync, updateDiscipline, updateExam, updateSettings, useAppState,
} from '../state/store';
import { saveFile, syncAvailable } from '../state/sync';
import { useToast } from './common';
import SyncConflictCard from './SyncConflict';
import { paceCalibration } from '../engine/pace';

const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEIGHT_LABEL: Record<keyof PriorityWeights, string> = {
  hist: 'Frequência histórica VUNESP', exam: 'Questões na prova', weak: 'Minha fraqueza (domínio baixo)', errors: 'Erros recentes / recorrentes',
  due: 'Tempo desde a última revisão', elim: 'Risco eliminatório (Blocos I e II)', charge: 'Tipo de cobrança (pegadinhas)',
};

export default function Ajustes() {
  const s = useAppState();
  const st = s.settings;
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const today = getToday();
  const distr = s.distraction.find((x) => x.date === today)?.minutes ?? 0;
  const save = getSaveStatus();

  const doExport = async () => {
    const r = await saveFile(`projeto-tjsp-backup-${today}.json`, exportJSON());
    toast(r === 'saved' || r === 'fallback' ? 'Backup gerado.' : r === 'cancelado' ? 'Backup cancelado.' : 'Não foi possível salvar o arquivo. Use "Copiar backup".');
  };
  const copyExport = async () => {
    try { await navigator.clipboard.writeText(exportJSON()); toast('Backup copiado. Cole num arquivo de texto ou e-mail para você.'); }
    catch { setPaste(exportJSON()); toast('Selecione o texto abaixo e copie.'); }
  };
  const readFile = (f: File, fn: (t: string) => void) => { const r = new FileReader(); r.onload = () => fn(String(r.result)); r.readAsText(f); };

  return (
    <div className="page narrow">
      <h1>Ajustes</h1>

      <section className="card stack">
        <h2>Prova e região</h2>
        <div className="grid2">
          <label className="field">Data da prova<input id="aj-date" type="date" value={st.examDate} onChange={(e) => e.target.value && updateSettings({ examDate: e.target.value })} /></label>
          <label className="field">Região / circunscrição<input id="aj-region" type="text" value={st.region} onChange={(e) => updateSettings({ region: e.target.value })} /></label>
          <label className="field">Minha meta de acerto geral (%)<input id="aj-target" type="number" min={50} max={100} value={Math.round(s.exam.targetPercent * 100)} onChange={(e) => updateExam({ targetPercent: Math.min(1, Math.max(0.5, Number(e.target.value) / 100)) })} /></label>
        </div>
        <span className="tiny muted">A nota de corte de cada lista é desconhecida antes da prova; a meta serve para o painel de risco. Jundiaí: redações corrigidas dos 100 melhores da Lista Geral (Edital, cap. XI).</span>
      </section>

      <section className="card stack">
        <h2>Tempo e dias</h2>
        <div className="stack sm">
          <div className="eyebrow">Tempo padrão por dia (minutos)</div>
          <div className="grid3" style={{ gridTemplateColumns: 'repeat(7, minmax(0,1fr))' }}>
            {WD.map((w, i) => (
              <label key={w} className="field" style={{ alignItems: 'center' }}>{w}
                <input id={`aj-wd-${i}`} type="number" min={0} step={10} value={st.defaultMinutesByWeekday[i]} onChange={(e) => { const arr = [...st.defaultMinutesByWeekday]; arr[i] = Number(e.target.value); updateSettings({ defaultMinutesByWeekday: arr }); }} style={{ textAlign: 'center', padding: '8px 4px' }} />
              </label>
            ))}
          </div>
          <span className="tiny muted">É só o tempo sugerido ao abrir. Você sempre escolhe o tempo real do dia na tela inicial.</span>
        </div>
        <div className="grid2">
          <label className="field">Dia ruim — mínimo (min)<input id="aj-bad" type="number" value={st.badDayMinutes} onChange={(e) => updateSettings({ badDayMinutes: Number(e.target.value) })} /></label>
          <label className="field">Dia excelente (min)<input id="aj-great" type="number" value={st.greatDayMinutes} onChange={(e) => updateSettings({ greatDayMinutes: Number(e.target.value) })} /></label>
        </div>
        <label className="check"><input id="aj-sun" type="checkbox" checked={st.sundayOptional} onChange={(e) => updateSettings({ sundayOptional: e.target.checked })} />Domingo opcional (oferece "Hoje vou descansar")</label>
        <div className="chips">
          {WD.map((w, i) => (
            <button key={w} className="chip sm" aria-pressed={st.studyDays.includes(i)} onClick={() => updateSettings({ studyDays: st.studyDays.includes(i) ? st.studyDays.filter((x) => x !== i) : [...st.studyDays, i].sort() })}>{w}</button>
          ))}
        </div>
        <span className="tiny muted">Dias de estudo planejados. Dia sem estudo não gera atraso: a missão seguinte se reorganiza.</span>
      </section>

      <PaceCard />

      <section className="card stack">
        <h2>Peso da prioridade</h2>
        {(Object.keys(WEIGHT_LABEL) as (keyof PriorityWeights)[]).map((k) => (
          <label key={k} className="field">{WEIGHT_LABEL[k]}: <b className="num">{st.weights[k]}</b>
            <input id={`aj-w-${k}`} type="range" min={0} max={40} value={st.weights[k]} onChange={(e) => updateSettings({ weights: { ...st.weights, [k]: Number(e.target.value) } })} />
          </label>
        ))}
        <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => { regenerateMission(); toast('Missão de hoje recalculada.'); }}>Recalcular missão de hoje</button>
      </section>

      <section className="card stack">
        <h2>Ritmo, revisões e fases</h2>
        <div className="grid2">
          <label className="field">Ritmo de questões (1 = padrão; 1,2 = 20% mais questões)<input id="aj-pace" type="number" step={0.1} min={0.5} max={2} value={st.questionPaceFactor} onChange={(e) => updateSettings({ questionPaceFactor: Number(e.target.value) || 1 })} /></label>
          <label className="field">Intervalos de revisão (dias)<input id="aj-int" type="text" value={st.reviewIntervals.join(', ')} onChange={(e) => { const v = e.target.value.split(/[,;\s]+/).map(Number).filter((x) => x > 0); if (v.length) updateSettings({ reviewIntervals: v }); }} /></label>
          <label className="field">Revisões por dia (máx.)<input id="aj-cap" type="number" min={1} value={st.dailyReviewCap} onChange={(e) => updateSettings({ dailyReviewCap: Number(e.target.value) || 4 })} /></label>
          <label className="field">Redações por semana<input id="aj-essay" type="number" min={0} max={7} value={st.essayPerWeek} onChange={(e) => updateSettings({ essayPerWeek: Number(e.target.value) })} /></label>
          <label className="field">Fase Performance a partir de (dias antes)<input id="aj-perf" type="number" value={st.performanceDays} onChange={(e) => updateSettings({ performanceDays: Number(e.target.value) })} /></label>
          <label className="field">Reta final a partir de (dias antes)<input id="aj-reta" type="number" value={st.retaFinalDays} onChange={(e) => updateSettings({ retaFinalDays: Number(e.target.value) })} /></label>
          <label className="field">Lembrete "sua missão já está pronta" após (segundos)<input id="aj-idle" type="number" min={30} value={st.idleNudgeSeconds} onChange={(e) => updateSettings({ idleNudgeSeconds: Number(e.target.value) })} /></label>
        </div>
        <label className="check"><input id="aj-onetopic" type="checkbox" checked={st.oneTopicPerDay} onChange={(e) => updateSettings({ oneTopicPerDay: e.target.checked })} />Um tema por dia (sem tema secundário na missão)</label>
        <label className="field">Dia da redação
          <select id="aj-essayday" value={st.essayWeekday} onChange={(e) => updateSettings({ essayWeekday: Number(e.target.value) })}>
            {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((w, i) => <option key={w} value={i}>{w}</option>)}
          </select>
        </label>
        <label className="check"><input id="aj-reasons" type="checkbox" checked={st.showReasons} onChange={(e) => updateSettings({ showReasons: e.target.checked })} />Mostrar "Por que esta missão?"</label>
      </section>

      <section className="card stack">
        <h2>Disciplinas</h2>
        <div className="tablewrap"><table className="t">
          <thead><tr><th>Disciplina</th><th className="r">Questões</th><th className="r">Min/questão</th><th>Ativa</th></tr></thead>
          <tbody>{[...s.disciplines].sort((a, b) => a.order - b.order).map((d) => (
            <tr key={d.id}>
              <td>{d.short} <span className="tiny muted">({d.block})</span></td>
              <td className="r"><input id={`aj-dq-${d.id}`} type="number" min={0} style={{ width: 64 }} value={d.questions} onChange={(e) => updateDiscipline(d.id, { questions: Number(e.target.value) })} aria-label={`Questões de ${d.short}`} /></td>
              <td className="r"><input id={`aj-dp-${d.id}`} type="number" step={0.5} min={0.5} style={{ width: 64 }} value={d.pacePerQuestionMin} onChange={(e) => updateDiscipline(d.id, { pacePerQuestionMin: Number(e.target.value) || 2 })} aria-label={`Ritmo de ${d.short}`} /></td>
              <td><input id={`aj-da-${d.id}`} type="checkbox" checked={d.active} onChange={(e) => updateDiscipline(d.id, { active: e.target.checked })} aria-label={`${d.short} ativa`} /></td>
            </tr>
          ))}</tbody>
        </table></div>
        <span className="tiny muted">Blocos pelo edital: I = 16, II = 30, III = 24 (Atualidades 4, Matemática 4, Informática 9, RLM 7). A divisão interna do Bloco II segue a prova de 2025 como estimativa.</span>
      </section>

      <section className="card stack">
        <h2>App de flashcards</h2>
        <label className="check"><input id="aj-ef-on" type="checkbox" checked={st.externalFlash.enabled} onChange={(e) => updateSettings({ externalFlash: { ...st.externalFlash, enabled: e.target.checked } })} />Uso outro app de flashcards (entra como aquecimento em toda missão)</label>
        {st.externalFlash.enabled && (
          <div className="grid3">
            <label className="field">Nome do app<input id="aj-ef-name" type="text" value={st.externalFlash.name} onChange={(e) => updateSettings({ externalFlash: { ...st.externalFlash, name: e.target.value || 'seu app de flashcards' } })} placeholder="ex.: Anki" /></label>
            <label className="field">Minutos por dia<input id="aj-ef-min" type="number" min={3} max={45} value={st.externalFlash.minutes} onChange={(e) => updateSettings({ externalFlash: { ...st.externalFlash, minutes: Number(e.target.value) || 10 } })} /></label>
            <label className="field">Cartões novos por dia<input id="aj-ef-new" type="number" min={0} max={50} value={st.externalFlash.newPerDay} onChange={(e) => updateSettings({ externalFlash: { ...st.externalFlash, newPerDay: Number(e.target.value) } })} /></label>
          </div>
        )}
        <span className="tiny muted">O tempo dos flashcards sai de dentro da missão, nunca soma por cima. Com o app ligado, os flashcards do site deixam de entrar nas missões (continuam na aba Revisar).</span>
        <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => { regenerateMission(); toast('Missão de hoje recalculada.'); }}>Aplicar na missão de hoje</button>
      </section>

      <section className="card stack">
        <h2>Materiais</h2>
        <label className="check"><input id="aj-m-qc" type="checkbox" checked={st.materials.qconcursos} onChange={(e) => updateSettings({ materials: { ...st.materials, qconcursos: e.target.checked } })} />QConcursos (filtros indicados em cada tarefa)</label>
        <label className="check"><input id="aj-m-ap" type="checkbox" checked={st.materials.apostila} onChange={(e) => updateSettings({ materials: { ...st.materials, apostila: e.target.checked } })} />Apostila Nova Concursos — TJSP Escrevente</label>
        <label className="check"><input id="aj-m-vd" type="checkbox" checked={st.materials.videos} onChange={(e) => updateSettings({ materials: { ...st.materials, videos: e.target.checked } })} />Vídeos curtos gratuitos (só dentro da tarefa)</label>
        <span className="tiny muted">Lei seca sempre gratuita (Planalto, ALESP, TJSP). O sistema não exige outras assinaturas.</span>
      </section>

      <section className="card stack">
        <h2>Tempo de distração (simbólico)</h2>
        <p className="small">Hoje: <b className="num">{distr} min</b> de Instagram/TikTok · meta até {st.distractionGoalMin} min</p>
        <div className="meter"><i style={{ width: `${Math.min(100, (distr / Math.max(1, st.distractionGoalMin)) * 100)}%`, background: distr > st.distractionGoalMin ? 'var(--warn)' : undefined }} /></div>
        <div className="row">
          {[5, 10, 15].map((m) => <button key={m} className="btn small" onClick={() => addDistraction(m)}>+{m} min</button>)}
          <button className="btn ghost small" onClick={() => addDistraction(-5)}>−5</button>
        </div>
        <ul className="small ink2" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Celular em outro cômodo durante a missão; use o bloqueio do próprio celular para limites reais.</li>
          <li>Salve o endereço do sistema na tela inicial do celular: ele abre direto na missão.</li>
          <li>Conteúdo sobre "como estudar para concursos" não conta como estudo. Só conta o que estiver ligado à tarefa do dia.</li>
        </ul>
      </section>

      <SyncConflictCard />
      <section className="card stack">
        <h2>Levar meus dados para outro aparelho</h2>
        <p className="small ink2">Cada aparelho guarda os próprios dados. Para continuar em outro aparelho sem perder nada:</p>
        <div className="stack sm">
          <b className="small">Opção 1 — sincronizar (versão do claude.ai)</b>
          <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
            <li>No aparelho <b>que tem os dados</b>, ligue "Sincronizar entre aparelhos" (aqui embaixo) e espere alguns segundos.</li>
            <li>No aparelho novo, abra o mesmo link, entre na mesma conta do claude.ai e ligue a mesma opção.</li>
            <li>Os dados aparecem sozinhos. Se os dois tiverem estudos diferentes, o sistema pergunta qual cópia usar.</li>
          </ol>
          <b className="small">Opção 2 — backup (funciona em qualquer versão)</b>
          <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
            <li>No aparelho <b>que tem os dados</b>: "Copiar backup" e cole numa mensagem para você mesma (e-mail ou WhatsApp).</li>
            <li>No aparelho novo: copie o texto da mensagem, abra "Colar backup" aqui embaixo, cole e toque em "Juntar com os dados deste aparelho". Nada do que você já fez aqui se perde.</li>
          </ol>
        </div>
      </section>

      <section className="card stack">
        <h2>Dados, backup e privacidade</h2>
        <p className="small">Seus dados ficam neste navegador (IndexedDB{save.ls ? ' + cópia local' : ''}). Nada é enviado a serviços externos. {s.attempts.length} questões, {s.errors.length} erros, {s.flashcards.length} flashcards.</p>
        <div className="row">
          <button className="btn primary" onClick={doExport}>Exportar backup (JSON)</button>
          <button className="btn" onClick={copyExport}>Copiar backup</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Importar backup</button>
          <input ref={fileRef} id="aj-import" type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, (t) => toast(importJSON(t, 'juntar').message)); e.target.value = ''; }} />
        </div>
        <details>
          <summary className="small">Colar backup ou importar questões em CSV</summary>
          <div className="stack sm" style={{ marginTop: 8 }}>
            <textarea id="aj-paste" rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Cole aqui o JSON do backup" />
            <div className="row">
              <button className="btn primary small" disabled={!paste.trim()} onClick={() => { toast(importJSON(paste, 'juntar').message); setPaste(''); }}>Juntar com os dados deste aparelho</button>
              <button className="btn small" disabled={!paste.trim()} onClick={() => { toast(importJSON(paste, 'substituir').message); setPaste(''); }}>Substituir tudo</button>
            </div>
            <span className="tiny muted">"Juntar" soma o backup com o que já existe aqui, sem perder nada (recomendado).</span>
            <p className="tiny muted">CSV de questões (preparado para planilhas/QConcursos): colunas <span className="mono">topico;resultado;data;ano;codigo</span>. "topico" = id ou nome do tópico; "resultado" = seguro, duvida, chute, conhecimento, atencao, interpretacao ou confusao.</p>
            <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => csvRef.current?.click()}>Importar CSV de questões</button>
            <input ref={csvRef} id="aj-csv" type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, (t) => { const r = importAttemptsCSV(t); toast(`${r.ok} questões importadas, ${r.skipped} linhas ignoradas.`); }); e.target.value = ''; }} />
          </div>
        </details>
        <div className="divider" />
        <div className="stack sm">
          <label className="check"><input id="aj-sync" type="checkbox" checked={st.syncEnabled} disabled={!syncAvailable()} onChange={async (e) => { await setSync(e.target.checked); toast(e.target.checked ? 'Sincronização ligada.' : 'Sincronização desligada.'); }} />Sincronizar entre aparelhos (PC, tablet, celular)</label>
          <span className="tiny muted">{syncAvailable() ? `Guarda uma cópia na sua área privada do claude.ai (só você acessa). Status: ${getSyncStatus()}.` : 'Disponível quando o sistema é aberto pelo claude.ai. Sem isso, use Exportar/Importar backup para levar os dados a outro aparelho.'}</span>
        </div>
        <div className="divider" />
        {!confirmReset ? <button className="btn ghost small danger" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmReset(true)}>Apagar todos os dados…</button> : (
          <div className="card tight stack sm" style={{ borderColor: 'var(--crit)' }}>
            <p className="small">Isso apaga questões, erros, flashcards e histórico deste aparelho. Exporte um backup antes.</p>
            <div className="row"><button className="btn danger small" onClick={() => { resetAll(); setConfirmReset(false); toast('Dados apagados.'); }}>Apagar definitivamente</button><button className="btn small" onClick={() => setConfirmReset(false)}>Cancelar</button></div>
          </div>
        )}
      </section>

      <section className="card stack sm">
        <h2>Sobre o sistema</h2>
        <p className="small">Base: Edital de Abertura nº 02/2026 (Anexo VIII), estudo "Raio-X VUNESP" e cadernos TJSP 2018, 2021 e 2025. Histórico de cobrança aumenta prioridade, não garante cobrança. Pontos em dúvida ficam marcados como "conferir" nos tópicos do Mapa de Guerra.</p>
        <p className="small ink2">Princípios: consistência &gt; intensidade · adaptação &gt; cronograma rígido · evidência &gt; sensação · questões + correção &gt; horas · prioridade &gt; completude · continuidade &gt; compensação.</p>
      </section>
    </div>
  );
}

function PaceCard() {
  const s = useAppState();
  const p = paceCalibration(s, getToday());
  const row = (label: string, r: number, n: number) => (
    <li>{label}: {n >= 2 ? <b>{r.toFixed(1).replace('.', ',')}× o previsto</b> : <span className="muted">aprendendo ({n} de 2 tarefas medidas)</span>}</li>
  );
  return (
    <section className="card stack sm">
      <h2>Seu ritmo real</h2>
      <p className="small ink2">O sistema mede quanto cada tarefa realmente levou e ajusta as próximas missões a esse ritmo. Não existe ritmo certo: existe o seu.</p>
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        {row('Teoria / lei seca', p.learn, p.samples.learn)}
        {row('Questões', p.questions, p.samples.questions)}
        {row('Correção', p.correction, p.samples.correction)}
      </ul>
      <span className="tiny muted">Baseado nas tarefas concluídas nos últimos 28 dias (tarefas marcadas como "parei no meio" não entram).</span>
    </section>
  );
}
