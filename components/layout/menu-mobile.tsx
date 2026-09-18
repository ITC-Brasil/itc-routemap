"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LogOut, Menu } from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { signOut } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/theme-toggle"
import { SimboloRouteMap } from "@/components/layout/logo-routemap"
import {
  IconeAdmin,
  NAV,
  NAV_ADMIN,
  rotaAtiva,
} from "@/components/layout/nav-itens"

/**
 * Cabeçalho e gaveta de navegação abaixo de `md`.
 *
 * O rail sai da tela nessa faixa (92px fixos em 375px comem um quarto da
 * largura), então tudo o que ele carrega — destinos, tema e conta — precisa
 * caber aqui. A gaveta sobrepõe o conteúdo em vez de dividir a largura com
 * ele: é navegação momentânea, não moldura permanente.
 *
 * O `Sheet` é o Dialog do Radix, e é dele que vêm de graça o fecho por
 * `Escape`, o clique fora, a armadilha de foco e a devolução do foco ao botão.
 * Escrever isso à mão só acrescentaria formas novas de errar.
 *
 * Cada destino é um `SheetClose asChild`: navegar fecha a gaveta sem estado
 * controlado do lado de cá. Uma gaveta que sobrevive à navegação tapa
 * justamente a tela que o usuário pediu.
 *
 * Os cinco destinos do rail aparecem aqui, mas Administração vira lista aberta
 * em vez de submenu: um popover dentro de uma gaveta, no toque, é um alvo
 * dentro de outro. O espaço existe — use-o.
 */
export function MenuMobile() {
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const handleLogout = async () => {
    await signOut()
    router.replace("/login")
  }

  const iniciais =
    user?.name
      ?.split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase() ?? "U"

  const classesItem = (estaAtivo: boolean) =>
    [
      "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium",
      "transition-colors",
      estaAtivo
        ? "bg-primary text-primary-foreground"
        : "text-rail-fg hover:bg-rail-hover hover:text-rail-fg-strong",
    ].join(" ")

  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-rail-border bg-rail px-4 py-2 md:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Abrir menu">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>

        <SheetContent
          side="left"
          className="w-[280px] gap-0 bg-rail p-0 sm:max-w-[280px]"
          overlayClassName="bg-black/50"
        >
          <SheetHeader className="border-b border-rail-border px-4 py-3">
            <SheetTitle className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <SimboloRouteMap className="size-5" />
              </span>
              ITC RouteMap
            </SheetTitle>
          </SheetHeader>

          <nav
            aria-label="Navegação principal"
            className="flex flex-1 flex-col gap-1 overflow-y-auto p-3"
          >
            {NAV.map(({ href, label, Icone }) => (
              <SheetClose asChild key={href}>
                <Link
                  href={href}
                  aria-current={rotaAtiva(pathname, href) ? "page" : undefined}
                  className={classesItem(rotaAtiva(pathname, href))}
                >
                  <Icone className="size-5 shrink-0" aria-hidden="true" />
                  {label}
                </Link>
              </SheetClose>
            ))}

            <p className="mt-3 flex items-center gap-2 px-3 pb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <IconeAdmin className="size-3.5" aria-hidden="true" />
              Cadastros
            </p>
            {NAV_ADMIN.map(({ href, label }) => (
              <SheetClose asChild key={href}>
                <Link
                  href={href}
                  aria-current={rotaAtiva(pathname, href) ? "page" : undefined}
                  className={classesItem(rotaAtiva(pathname, href))}
                >
                  <span className="size-5 shrink-0" aria-hidden="true" />
                  {label}
                </Link>
              </SheetClose>
            ))}
          </nav>

          <div className="mt-auto flex items-center gap-3 border-t border-rail-border p-3">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bordo text-xs font-semibold text-white"
            >
              {iniciais}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {user?.name ?? "Administrador"}
              </span>
              <span className="truncate font-mono text-xs text-muted-foreground">
                {user?.email}
              </span>
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1">
              <ThemeToggle />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sair"
                onClick={() => void handleLogout()}
              >
                <LogOut className="size-4" />
              </Button>
            </span>
          </div>
        </SheetContent>
      </Sheet>

      <Link href="/" className="flex items-center gap-2 font-heading text-base">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <SimboloRouteMap className="size-4" />
        </span>
        ITC RouteMap
      </Link>
    </header>
  )
}
