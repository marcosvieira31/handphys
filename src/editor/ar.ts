import { useSyncExternalStore } from 'react';

/**
 * AR DE BOLSO LIGADO/DESLIGADO — a chave da vista, guardada no aparelho.
 *
 * Não é propriedade do DOCUMENTO (como o tema): é do APARELHO, que pode ou não
 * ter câmera. Por isso NÃO entra no store do editor, não viaja no link
 * compartilhado nem no fio do espelho — dois aparelhos podem olhar o MESMO
 * circuito, um com a mesa de verdade atrás e outro no projetor da sala.
 *
 * Também NÃO persiste entre recargas: a câmera é do aluno, e ela só abre com um
 * clique explícito. Ninguém leva um pedido de permissão na cara ao abrir a tela.
 *
 * Vale só com a bancada 3D montada (é ela que tem canvas para ficar
 * transparente); quem decide isso é a vista, não este módulo — a chave pode
 * ficar ligada em 2D sem abrir câmera nenhuma, porque quem abre é a camada do
 * AR, que só existe dentro da vista 3D.
 */

let ligado = false;
const ouvintes = new Set<() => void>();

function avisar(): void {
  for (const ouvir of ouvintes) ouvir();
}

/** Liga/desliga o AR. Só avisa quem ouve quando o valor muda de verdade. */
export function definirAr(v: boolean): boolean {
  if (v === ligado) return ligado;
  ligado = v;
  avisar();
  return ligado;
}

/** A chave do trilho: um toque inverte. */
export function trocarAr(): boolean {
  return definirAr(!ligado);
}

export function arAtual(): boolean {
  return ligado;
}

export function assinarAr(ouvir: () => void): () => void {
  ouvintes.add(ouvir);
  return () => ouvintes.delete(ouvir);
}

/** O AR atual, como estado do React (o trilho e a camada do fundo re-renderizam). */
export function useAr(): boolean {
  return useSyncExternalStore(assinarAr, arAtual, () => false);
}

/** Só para os testes: volta o singleton ao estado de "ainda não ligou". */
export function reiniciarAr(): void {
  ligado = false;
  ouvintes.clear();
}
