"use client"

import { createContext, useContext, ReactNode } from "react"
import { useSession } from "@/lib/auth-client"

/**
 * Usuário da sessão Better Auth.
 * Mantém o contrato { user, loading } que o app inteiro já consome
 * (auth-guard, navbar, login) — só a origem mudou: Firebase
 * onAuthStateChanged → useSession do Better Auth.
 */
export type SessionUser = {
  id: string
  name: string
  email: string
  image?: string | null
}

type AuthContextType = {
  user: SessionUser | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
})

/**
 * Provider que observa a sessão do Better Auth
 * e disponibiliza para toda a aplicação.
 *
 * Deve envolver a aplicação no layout raiz.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession()

  return (
    <AuthContext.Provider
      value={{ user: session?.user ?? null, loading: isPending }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Hook para acessar o estado de autenticação em qualquer componente.
 * Uso: const { user, loading } = useAuth()
 */
export function useAuth() {
  return useContext(AuthContext)
}
