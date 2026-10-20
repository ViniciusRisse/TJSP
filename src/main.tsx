import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './ui/App';
import { init } from './state/store';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
void init();
