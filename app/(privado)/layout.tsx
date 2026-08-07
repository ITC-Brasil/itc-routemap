"use client"

import { AuthGuard } from "@/components/auth/auth-guard"
import { Rail } from "@/components/layout/rail"
import { PageTransition } from "@/components/page-transition"
import packageJson from "@/package.json"

export default function PrivadoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      {/* Rail fixo à esquerda + coluna de conteúdo, como no protótipo v2.
          O conteúdo tem largura máxima de 1400px e respiro de 44px — antes era
          o `container` do Tailwind, centralizado sob a topbar. */}
      <div className="flex min-h-screen">
        <Rail />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="w-full max-w-[1400px] flex-1 px-11 pb-14 pt-10">
            <PageTransition>{children}</PageTransition>
          </main>
          <footer className="border-t">
            <div className="flex max-w-[1400px] items-center justify-between px-11 py-4">
              <span className="font-mono text-xs text-muted-foreground">
                ITC RouteMap · Grupo ITC Brasil
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                v{packageJson.version}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                © 2026 Grupo ITC Brasil
              </span>
            </div>
          </footer>
        </div>
      </div>
    </AuthGuard>
  )
}
