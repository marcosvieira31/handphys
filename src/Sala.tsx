import { ThemeToggle } from './editor/ThemeToggle';
import './styles/sala.css';

/**
 * A SALA (rota `#/ajuda`) — o que era a landing de links virou a tela de
 * "o que é isso e como usar" DENTRO do app. O app abre na bancada; esta
 * tela explica o percurso da aula (montar → projetar → cardboard) e aponta
 * a estante de spikes para quem desenvolve.
 *
 * Estilos próprios, escopados em `.sala`: nada de CSS global aqui, para não
 * brigar com a bancada quando as telas trocam no mesmo documento.
 */
export function Sala() {
  return (
    <main className="sala">
      <div className="sala-top">
        <h1>handphys</h1>
        <ThemeToggle />
      </div>
      <p className="sub">
        Laboratório virtual de física por realidade mista: a turma monta o circuito na
        bancada, a sala inteira acompanha no projetor e o celular vira bancada 3D dentro
        do cardboard.
      </p>

      <ol className="passos">
        <li>
          <strong>1 · Monte na bancada</strong>
          <span>
            Arraste Fonte, Resistor, Lâmpada… conecte os fios e acompanhe V/I/R ao vivo.
            Com mouse, toque ou a pinça da webcam — quem monta conduz.
          </span>
          <a href="#/" data-hand="sala:bancada">
            Ir para a bancada →
          </a>
        </li>
        <li>
          <strong>2 · Projete na sala</strong>
          <span>
            O botão <em>Espelhar</em> na bancada publica esta mesma tela ao vivo no
            projetor — na mesma máquina (funciona sem internet) ou pela rede da escola,
            com QR.
          </span>
          <a href="#/espelho" data-hand="sala:espelho">
            Abrir o espelho →
          </a>
        </li>
        <li>
          <strong>3 · Ponha no cardboard</strong>
          <span>
            O QR do <em>Compartilhar</em> abre o mesmo circuito no celular, em estéreo
            para o visor: gire o aparelho, mire e toque para ver V/I de cada peça.
          </span>
          <a href="cardboard.html" data-hand="sala:cardboard">
            Abrir o cardboard →
          </a>
        </li>
      </ol>

      <p className="doc">
        Desafios com verificação automática, Kirchhoff por nós e malhas, questão da aula
        na projeção e relatórios CSV/JSON. Quem desenvolve: a estante de spikes fica em{' '}
        <a href="spikes/">spikes/</a> e o plano completo em <code>docs/PLANO.md</code>.
      </p>

      <p className="voltar">
        <a href="#/" data-hand="sala:voltar">
          ← voltar para a bancada
        </a>
      </p>
    </main>
  );
}
