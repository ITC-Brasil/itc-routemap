"use client"

import { AuthGuard } from "@/components/auth/auth-guard"
import { Navbar } from "@/components/layout/navbar"

/**
 * Layout aplicado a todas as páginas privadas do sistema.
 *
 * Garante automaticamente:
 * 1. AuthGuard → só usuários autenticados acessam (redireciona pra /login)
 * 2. Navbar → barra de navegação fixa no topo
 *
 * Qualquer página criada dentro de src/app/(privado)/ herda essas garantias
 * sem precisar repetir o código.
 */
export default function PrivadoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        <Navbar />
        {children}
      </div>
    </AuthGuard>
  )
}