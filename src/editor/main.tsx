import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '../styles/editor.css';

const el = document.getElementById('root');
if (!el) throw new Error('elemento #root não encontrado');
createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
