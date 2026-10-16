/**
 * O projeto é de browser: o tsconfig NÃO leva @types/node de propósito (vá
 * ver o comentário do vite.config). Só o teste style.test.ts roda no node e
 * lê o CSS por fs — declaro aqui a superfície usada, sem abrir a porta para
 * globals de node vazarem para src/.
 */
declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
}
