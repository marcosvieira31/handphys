import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { bootFromLink } from '../editor/share';
import { useEditor } from '../editor/store';
import { Espelho } from './Espelho';
import '../styles/editor.css';
import './espelho.css';

// Circuito no link (?c=): entra no estado ANTES do React montar — o espelho já
// abre mostrando alguma coisa mesmo antes de a tela que monta transmitir.
bootFromLink();

const el = document.getElementById('root');
if (!el) throw new Error('elemento #root não encontrado');
createRoot(el).render(
  <StrictMode>
    <Espelho />
  </StrictMode>,
);

// Gancho de depuração (só em dev): a automação lê o estado do espelho. O mesmo
// do editor; não vai para o build de produção.
if (import.meta.env.DEV) {
  (window as unknown as { __ed?: unknown }).__ed = { store: useEditor };
}
