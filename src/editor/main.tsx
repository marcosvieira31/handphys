import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { hands } from '../hands/controller';
import { bootFromLink } from './share';
import { useEditor } from './store';
import '../styles/editor.css';

const el = document.getElementById('root');
if (!el) throw new Error('elemento #root não encontrado');

// Circuito no link (?c=): entra no estado ANTES do React montar — senão a tela
// pisca vazia e o professor vê o quadro em branco por um frame.
const shared = bootFromLink();

createRoot(el).render(
  <StrictMode>
    <App shared={shared} />
  </StrictMode>,
);

// Gancho de depuração (só em dev): permite testar a pinça sem câmera e ler o
// documento atual por automação. Não vai para o build de produção.
if (import.meta.env.DEV) {
  (window as unknown as { __ed?: unknown }).__ed = { hands, store: useEditor };
}
