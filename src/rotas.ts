/**
 * Rotas do app — handphys é UM app com telas, escolhidas pelo hash da URL.
 *
 * Hash (não History API) porque o deploy é estático em subdiretório (GitHub
 * Pages): precisa funcionar sem rewrites de servidor, e o link `?c=…#/espelho`
 * sobrevive aos QRs antigos (`mirror.html?c=…` redireciona pra cá).
 */
export type Vista = 'bancada' | 'espelho' | 'ajuda';

/** Hash => vista. Nada ou desconhecido => bancada (a casa do app). */
export function viewDaHash(hash: string): Vista {
  const rota = hash.replace(/^#\/?/, '').split(/[?#]/)[0].toLowerCase();
  if (rota === 'espelho') return 'espelho';
  if (rota === 'ajuda' || rota === 'sala' || rota === 'inicio') return 'ajuda';
  return 'bancada';
}

/** Título do documento por vista (o navegador mostra qual tela está aberta). */
export const TITULOS: Record<Vista, string> = {
  bancada: 'handphys — bancada',
  espelho: 'handphys — espelho da sala',
  ajuda: 'handphys — a sala',
};
