import "server-only"

import { headers } from "next/headers"
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
