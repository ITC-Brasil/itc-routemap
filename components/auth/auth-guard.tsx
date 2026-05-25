"use client"

import { useEffect, ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"

/**
 * AuthGuard — protege páginas que exigem usuário autenticado.
 *
 * Comportamento:
 * - Enquanto verifica o estado de autenticação → mostra loading discreto
 * - Se NÃO houver usuário logado → redireciona para /login
 * - Se houver usuário logado → renderiza o conteúdo (children)
 *
 * Uso:
 *   <AuthGuard>
 *     <ConteudoPrivado />
 *   </AuthGuard>
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // Só redireciona depois que terminou de verificar (loading=false)
    // e confirmou que não tem usuário
    if (!loading && !user) {
      router.replace("/login")
    }
  }, [user, loading, router])

  // Enquanto verifica, mostra loading
 if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Verificando acesso
          </p>
        </div>
      </div>
    )
  }

  // Se já chegou aqui sem user, o useEffect acima vai redirecionar.
  // Retornamos null pra evitar piscar conteúdo privado pra usuário não autenticado
  if (!user) {
    return null
  }

  // Tem usuário logado → libera o conteúdo
  return <>{children}</>
}