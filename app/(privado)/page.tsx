"use client"

import { useAuth } from "@/contexts/auth-context"
import { auth, db } from "@/lib/firebase"

export default function HomePage() {
  const { user } = useAuth()

  const firebaseStatus =
    auth && db ? "✅ Firebase conectado" : "❌ Erro na conexão"

  return (
    <main className="container mx-auto flex flex-col items-center justify-center gap-8 px-4 py-16">
      <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Grupo ITC Brasil
      </span>

      <h1 className="font-heading text-6xl text-foreground">ITC RouteMap</h1>

      <p className="max-w-md text-center text-lg text-muted-foreground">
        Sistema de Alocação Inteligente de Técnicos para Unidades Móveis
      </p>

      {/* Card de boas-vindas */}
      <div className="rounded-lg border bg-card px-6 py-4 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Bem-vindo
        </p>
        <p className="mt-1 font-semibold text-foreground">
          {user?.displayName ?? "Administrador"}
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {user?.email}
        </p>
      </div>

      {/* Status da conexão Firebase */}
      <div className="mt-8 rounded-lg border bg-muted px-6 py-3">
        <p className="font-mono text-sm text-foreground">{firebaseStatus}</p>
        <p className="font-mono text-xs text-muted-foreground">
          Projeto: {process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}
        </p>
      </div>
    </main>
  )
}