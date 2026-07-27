import "server-only"

import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/lib/better-auth"

/**
 * Garante que há uma sessão Better Auth válida antes de executar uma ação.
 *
 * Server actions são endpoints públicos por natureza (qualquer cliente pode
 * invocá-las), então cada ação que toca o banco precisa validar a sessão.
 * Lança se não houver sessão; retorna a sessão para uso opcional do chamador.
 */
export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    throw new Error("Sessão expirada ou ausente. Faça login novamente.")
  }
  return session
}

/**
 * Versão para route handlers (`app/api/**`): em vez de lançar, devolve uma
 * resposta 401 pronta, no mesmo formato de erro que as rotas já usam
 * (`{ sucesso: false, erro }`).
 *
 * Rotas de API são endpoints públicos como as server actions, mas quem chama
 * espera JSON — por isso 401 em vez do redirect que o proxy faz nas páginas.
 *
 * Uso, como PRIMEIRA coisa do handler (antes de qualquer escrita no banco ou
 * chamada paga a API externa):
 *
 *   const { erro } = await exigirSessaoApi()
 *   if (erro) return erro
 */
export async function exigirSessaoApi(): Promise<
  | { session: Awaited<ReturnType<typeof requireSession>>; erro?: undefined }
  | { session?: undefined; erro: NextResponse }
> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return {
      erro: NextResponse.json(
        { sucesso: false, erro: "Nao autenticado." },
        { status: 401 },
      ),
    }
  }
  return { session }
}
