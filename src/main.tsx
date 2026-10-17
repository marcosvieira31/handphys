import { StrictMode, Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { bootFromLink } from './editor/share';
import { useEditor } from './editor/store';
import { iniciarTema } from './editor/theme';
import { TITULOS, viewDaHash, type Vista } from './rotas';
import './styles/editor.css';

/**
 * O app inteiro numa porta só — o handphys É um app com telas:
 *
 *   #/          a BANCADA (montar o circuito; é a casa, abre por padrão)
 *   #/espelho   o ESPELHO (projeção da sala; mesma tela em outro aparelho)
 *   #/ajuda     a SALA (o que é, como usar e as outras telas)
 *
 * As páginas antigas (editor.html, mirror.html) redirecionam pra cá
 * preservando o `?c=` dos QRs que já estão na sala. O cardboard mantém
 * página própria de propósito: vanilla (sem React no celular) e com o
 * alarme de rede lenta embutido no HTML — ver PLANO.
 *
 * Cada tela entra por import preguiçoso: quem abre o espelho no projetor
 * não baixa a cena 3D, e o código da bancada só carrega na bancada.
 */
const Bancada = lazy(async () => ({ default: (await import('./editor/App')).App }));
const Espelho = lazy(async () => ({ default: (await import('./mirror/Espelho')).Espelho }));
const Sala = lazy(async () => ({ default: (await import('./Sala')).Sala }));

// Circuito no link (?c=): entra no estado ANTES do React montar — sem isso a
// tela pisca vazia e quem abre o QR vê o quadro em branco por um frame.
const shared = bootFromLink();

// Tema claro/escuro: também ANTES do React (é atributo do <html>, não do app).
// Sem isso, quem escolheu o claro levaria um piscar escuro a cada recarga.
iniciarTema(document.documentElement);

function Telas() {
  const [vista, setVista] = useState<Vista>(() => viewDaHash(location.hash));

  useEffect(() => {
    const onHash = () => setVista(viewDaHash(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.title = TITULOS[vista];
  }, [vista]);

  return (
    <Suspense fallback={<p className="carregando">carregando…</p>}>
      {vista === 'espelho' ? (
        <Espelho />
      ) : vista === 'ajuda' ? (
        <Sala />
      ) : (
        <Bancada shared={shared} />
      )}
    </Suspense>
  );
}

const el = document.getElementById('root');
if (!el) throw new Error('elemento #root não encontrado');

createRoot(el).render(
  <StrictMode>
    <Telas />
  </StrictMode>,
);

// Gancho de depuração (só em dev): permite testar a pinça sem câmera e ler o
// estado por automação. O hands entra DINÂMICO e o bloco inteiro é cortado
// em produção — nada do tracking vira o peso das outras telas.
if (import.meta.env.DEV) {
  void import('./hands/controller').then(({ hands }) => {
    const w = window as unknown as { __ed?: Record<string, unknown> };
    w.__ed = { ...(w.__ed ?? {}), hands, store: useEditor };
  });
}
