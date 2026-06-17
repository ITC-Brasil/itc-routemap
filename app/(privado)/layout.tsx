"use client"

import { AuthGuard } from "@/components/auth/auth-guard"
import { Navbar } from "@/components/layout/navbar"

/**
 * Layout aplicado a todas as páginas privadas do sistema.
 *
 * Garante automaticamente:
 * 1. AuthGuard → só usuários autenticados acessam (redireciona pra /login)
 * 2. Navbar → barra de navegação fixa no topo
 * 3. Container global com padding lateral → conteúdo nunca cola nas bordas
 *
 * O `relative z-10` mantém o conteúdo acima do <BackgroundGrid /> (z-0)
 * do layout raiz.
 */
export default function PrivadoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      <div className="relative z-10 min-h-screen">
        <Navbar />
        <main className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}