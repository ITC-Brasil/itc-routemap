"use client"

import { AuthGuard } from "@/components/auth/auth-guard"
import { MenuMobile } from "@/components/layout/menu-mobile"
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
          O conteúdo tem largura máxima de 1400px.

          O respiro lateral era 44px fixos (px-11) em qualquer largura. Numa
          janela de 375px isso consome 88px — quase um quarto da tela — e o
          conteúdo espremia antes de qualquer tabela estourar. Agora escala:
          16px no celular, 24px a partir de sm, os 44px originais em lg. */}
      <div className="flex min-h-screen">
        <Rail />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Abaixo de md o rail some e a navegação vira gaveta, acionada
              daqui. Acima, este cabeçalho não existe. */}
          <MenuMobile />
          <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-14 pt-6 sm:px-6 sm:pt-10 lg:px-11">
            <PageTransition>{children}</PageTransition>
          </main>
          <footer className="border-t">
            {/* Os três blocos empilham centralizados abaixo de sm: lado a lado
                em 375px eles se tocam e o do meio fica ilegível. */}
            <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center gap-1 px-4 py-4 text-center sm:flex-row sm:justify-between sm:gap-3 sm:px-6 sm:text-left lg:px-11">
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
