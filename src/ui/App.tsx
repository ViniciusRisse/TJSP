import { useEffect, useRef, useState } from 'react';
import { getToday, isLoaded, startMission, useAppState, useDerived, subscribe } from '../state/store';
import { daysLeft } from '../engine/priority';
import { ToastProvider } from './common';
import Home from './Home';
import Focus from './Focus';
import MapView from './MapView';
import Review from './Review';
import Errors from './Errors';
import Simulados from './Simulados';
import Evolucao from './Evolucao';
import Vunesp from './Vunesp';
import Redacao from './Redacao';
import Ajustes from './Ajustes';
import { useSyncExternalStore } from 'react';

export type View = 'hoje' | 'foco' | 'mapa' | 'revisar' | 'erros' | 'simulados' | 'evolucao' | 'vunesp' | 'redacao' | 'ajustes' | 'mais';

const NAV: { id: View; label: string; ico: string }[] = [
  { id: 'hoje', label: 'Hoje', ico: '▶' },
  { id: 'mapa', label: 'Mapa de Guerra', ico: '▦' },
  { id: 'revisar', label: 'Revisar', ico: '↻' },
  { id: 'erros', label: 'Meus Erros', ico: '✕' },
  { id: 'simulados', label: 'Simulados', ico: '◷' },
  { id: 'evolucao', label: 'Evolução', ico: '↗' },
  { id: 'vunesp', label: 'DNA VUNESP', ico: '§' },
  { id: 'redacao', label: 'Redação', ico: '✎' },
  { id: 'ajustes', label: 'Ajustes', ico: '⚙' },
];
const BOTTOM: View[] = ['hoje', 'mapa', 'revisar', 'evolucao', 'mais'];
const VALID = new Set<string>(NAV.map((n) => n.id).concat(['foco', 'mais']));

function readHash(): View {
  try {
    const h = location.hash.replace('#', '');
    return (VALID.has(h) ? h : 'hoje') as View;
  } catch { return 'hoje'; }
}

export default function App() {
  const loaded = useSyncExternalStore(subscribe, isLoaded, isLoaded);
  const [view, setViewRaw] = useState<View>(readHash);
  const setView = (v: View) => {
    setViewRaw(v);
    try { history.replaceState(null, '', v === 'hoje' ? location.pathname + location.search : '#' + v); } catch { /* ignora */ }
    window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    const h = () => setViewRaw(readHash());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  if (!loaded) return <div className="main"><div className="page"><p className="muted">Carregando o Projeto TJSP…</p></div></div>;
  return (
    <ToastProvider>
      <Shell view={view} setView={setView} />
    </ToastProvider>
  );
}

function Shell({ view, setView }: { view: View; setView: (v: View) => void }) {
  const s = useAppState();
  const d = useDerived();
  const left = daysLeft(s, getToday());
  const go = (v: View) => setView(v);

  let content;
  switch (view) {
    case 'foco': content = <Focus go={go} />; break;
    case 'mapa': content = <MapView go={go} />; break;
    case 'revisar': content = <Review go={go} />; break;
    case 'erros': content = <Errors />; break;
    case 'simulados': content = <Simulados />; break;
    case 'evolucao': content = <Evolucao go={go} />; break;
    case 'vunesp': content = <Vunesp />; break;
    case 'redacao': content = <Redacao />; break;
    case 'ajustes': content = <Ajustes />; break;
    case 'mais': content = <More go={go} />; break;
    default: content = <Home go={go} />;
  }
  return (
    <div className="shell">
      <nav className="side" aria-label="Navegação">
        <div className="brand">PROJETO TJSP<small>{left} dias · fase {d.phase}</small></div>
        {NAV.map((n) => (
          <button key={n.id} className="navbtn" aria-current={view === n.id || (view === 'foco' && n.id === 'hoje') ? 'page' : undefined} onClick={() => go(n.id)}>
            <span className="ico" aria-hidden>{n.ico}</span>{n.label}
          </button>
        ))}
      </nav>
      <main className="main">{content}</main>
      <nav className="bottomnav" aria-label="Navegação">
        {BOTTOM.map((id) => {
          const n = NAV.find((x) => x.id === id) || { id: 'mais' as View, label: 'Mais', ico: '⋯' };
          const current = view === id || (id === 'hoje' && view === 'foco') || (id === 'mais' && ['erros', 'simulados', 'vunesp', 'redacao', 'ajustes', 'mais'].includes(view));
          return (
            <button key={id} aria-current={current ? 'page' : undefined} onClick={() => go(id)}>
              <span className="ico" aria-hidden>{n.ico}</span>{id === 'mapa' ? 'Mapa' : n.label}
            </button>
          );
        })}
      </nav>
      {view !== 'foco' && <IdleNudge onStart={() => { startMission(); go('foco'); }} />}
    </div>
  );
}

function More({ go }: { go: (v: View) => void }) {
  return (
    <div className="page narrow">
      <h1>Mais</h1>
      <div className="stack sm">
        {NAV.filter((n) => !BOTTOM.includes(n.id)).map((n) => (
          <button key={n.id} className="navbtn card tight" onClick={() => go(n.id)} style={{ padding: 14 }}>
            <span className="ico" aria-hidden>{n.ico}</span>{n.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Anti-procrastinação: navegar muito tempo sem iniciar a missão → lembrete com um único botão. */
function IdleNudge({ onStart }: { onStart: () => void }) {
  const s = useAppState();
  const mission = s.missions[getToday()];
  const [show, setShow] = useState(false);
  const dismissed = useRef(false);
  const started = !!mission?.startedAt || !!mission?.completedAt;
  useEffect(() => {
    if (started || dismissed.current || !mission?.tasks.length) return;
    const t = setTimeout(() => setShow(true), Math.max(30, s.settings.idleNudgeSeconds) * 1000);
    return () => clearTimeout(t);
  }, [started, s.settings.idleNudgeSeconds, mission?.tasks.length]);
  if (!show || started) return null;
  return (
    <div className="overlay">
      <div className="modal stack lg" role="dialog" aria-modal="true" aria-label="Sua missão já está pronta">
        <h2>Você não precisa decidir nada agora.</h2>
        <p className="ink2">Sua missão já está pronta.</p>
        <button className="btn primary big" onClick={() => { setShow(false); onStart(); }} autoFocus>Começar agora</button>
        <button className="btn ghost small" onClick={() => { dismissed.current = true; setShow(false); }}>Fechar</button>
      </div>
    </div>
  );
}
