import { IcoLua, IcoSol } from './icons';
import { trocarTema, useTema } from './theme';

/**
 * O BOTÃO DO TEMA — claro/escuro, na barra de cima e na sala.
 *
 * Mostra o tema em que a tela está (sol = claro, lua = escuro) e o `title` diz
 * o que o clique faz: em prova, ninguém descobre "no escuro". `aria-pressed`
 * deixa o leitor de tela anunciar o estado, não só o nome.
 */
export function ThemeToggle() {
  const tema = useTema();
  const claro = tema === 'claro';
  return (
    <button
      type="button"
      className={claro ? 'ghost theme-toggle active' : 'ghost theme-toggle'}
      data-hand="tema"
      aria-pressed={claro}
      title={
        claro
          ? 'Tema claro ligado — clique para o escuro (melhor no projetor)'
          : 'Tema escuro ligado — clique para o claro (melhor com a luz acesa)'
      }
      onClick={() => trocarTema()}
    >
      {claro ? <IcoSol /> : <IcoLua />}
      <span>{claro ? 'Claro' : 'Escuro'}</span>
    </button>
  );
}
