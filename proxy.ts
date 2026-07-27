import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

/**
 * Proxy (Next.js 16 — antigo `middleware.ts`).
 *
 * Redireciona para /login quem tenta abrir uma página privada sem cookie de
 * sessão. Isso evita o "flash" da tela de verificação do AuthGuard e o custo de
 * renderizar a árvore privada para quem não está logado.
 *
 * LIMITAÇÃO DECLARADA — isto é um *optimistic check*, NÃO uma fronteira de
 * segurança:
 * - `getSessionCookie` apenas LÊ o cookie: não verifica a assinatura HMAC nem
 *   consulta o banco. Um cookie presente mas expirado/forjado passa por aqui.
 * - Quem barra de fato é a camada de baixo, sempre validando a sessão de
 *   verdade contra o banco: `requireSession()` nas server actions
 *   (`lib/actions/*`) e `exigirSessaoApi()` nos route handlers (`app/api/**`).
 * - A própria documentação do Next diz que Proxy "should not be used as a full
 *   session management or authorization solution".
 * Validação forte aqui (`auth.api.getSession`) foi avaliada e recusada: custaria
 * uma query ao Postgres em cada request de página.
 *
 * O matcher NÃO inclui `/api`: rotas de API devem responder 401 JSON (via
 * `exigirSessaoApi`), não um redirect 307 para HTML.
 *
 * Runtime: no Next 16 o Proxy roda em Node.js por padrão e a config `runtime`
 * não é permitida (setá-la lança erro).
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) {
    return NextResponse.next()
  }
  return NextResponse.redirect(new URL("/login", request.url))
}

export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/calcular-rotas",
    "/estatisticas",
    "/historico/:path*",
  ],
}
