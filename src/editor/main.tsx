import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { hands } from '../hands/controller';
import { useEditor } from './store';
import '../styles/editor.css';

const el = document.getElementById('root');
if (!el) throw new Error('elemento #root não encontrado');
createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Gancho de depuração (só em dev): permite testar a pinça sem câmera e ler o
// documento atual por automação. Não vai para o build de produção.
if (import.meta.env.DEV) {
  (window as unknown as { __ed?: unknown }).__ed = { hands, store: useEditor };
}
