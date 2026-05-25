"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { onAuthStateChanged, User } from "firebase/auth"
import { auth } from "@/lib/firebase"

type AuthContextType = {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
})

/**
 * Provider que observa o estado de autenticação do Firebase
 * e disponibiliza para toda a aplicação.
 *
 * Deve envolver a aplicação no layout raiz.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // onAuthStateChanged: observador do Firebase que dispara sempre que
    // o usuário loga, desloga, ou quando o app carrega
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
    })

    // Limpa o observador ao desmontar o componente
    return () => unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading }}>
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