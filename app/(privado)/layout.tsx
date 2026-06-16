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
 * Qualquer página criada dentro de app/(privado)/ herda essas garantias
 * sem precisar repetir o código.
 *
 * Nota: o `bg-background` foi removido daqui (já é herdado do <body>) pra
 * deixar o <BackgroundGrid /> do layout raiz aparecer. O `relative z-10`
 * mantém o conteúdo acima da camada de fundo.
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
        {children}
      </div>
    </AuthGuard>
  )
}