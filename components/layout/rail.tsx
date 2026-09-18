"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { signOut } from "@/lib/auth-client"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ThemeToggle } from "@/components/theme-toggle"
import { SimboloRouteMap } from "@/components/layout/logo-routemap"
import {
  IconeAdmin,
  NAV,
  NAV_ADMIN,
  rotaAtiva,
} from "@/components/layout/nav-itens"

/**
 * Rail de navegação — 92px à esquerda, do protótipo v2 (design/handoff).
 *
 * Substituiu a topbar horizontal: o topo da tela passa a ser inteiro do contexto
 * da operação, e a navegação vira ícone + rótulo curto numa coluna fixa. Mesmas
 * rotas de antes; o submenu Administração continua, agora em popover à direita.
 *
 * A partir de `md` ele é a navegação inteira. Abaixo disso sai da tela: 92px
 * fixos em 375px comem um quarto da largura e ainda empurram a primeira coluna
 * das tabelas para fora. Lá quem navega é a gaveta do <MenuMobile />, que lê
 * os mesmos destinos de nav-itens.ts.
 */

export function Rail() {
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

  const ativo = (href: string) => rotaAtiva(pathname, href)

  const adminAtivo = NAV_ADMIN.some((m) => pathname.startsWith(m.href))

  // Um item do rail: ícone em cima, rótulo curto embaixo, 76px de largura.
  const classesItem = (estaAtivo: boolean) =>
    [
      "flex w-[76px] flex-col items-center gap-1.5 rounded-[10px] px-1 pb-2 pt-3",
      "text-[10px] font-semibold leading-tight tracking-[0.01em] transition-colors",
      estaAtivo
        ? "bg-primary text-primary-foreground"
        : "text-rail-fg hover:bg-rail-hover hover:text-rail-fg-strong",
    ].join(" ")

  return (
    <aside className="sticky top-0 hidden h-screen w-rail shrink-0 flex-col items-center gap-[22px] border-r border-rail-border bg-rail pb-4 pt-[18px] md:flex">
      <Link
        href="/"
        title="ITC RouteMap"
        aria-label="ITC RouteMap — Início"
        className="flex size-[46px] shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground"
      >
        <SimboloRouteMap className="size-7" />
      </Link>

      <nav
        aria-label="Navegação principal"
        className="flex w-full flex-1 flex-col items-center gap-1.5"
      >
        {NAV.map(({ href, label, short, Icone }) => (
          <Link
            key={href}
            href={href}
            title={label}
            aria-current={ativo(href) ? "page" : undefined}
            className={classesItem(ativo(href))}
          >
            <Icone className="size-5" aria-hidden="true" />
            <span>{short}</span>
          </Link>
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger
            title="Administração"
            className={classesItem(adminAtivo)}
          >
            <IconeAdmin className="size-5" aria-hidden="true" />
            <span>Admin</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-48">
            <DropdownMenuLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Cadastros
            </DropdownMenuLabel>
            {NAV_ADMIN.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href}>{item.label}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      <div className="flex flex-col items-center gap-3">
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger
            title={user?.name ?? "Conta"}
            aria-label="Conta"
            className="flex size-[38px] items-center justify-center rounded-full bg-bordo text-xs font-semibold text-white"
          >
            {iniciais}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {user?.name ?? "Administrador"}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {user?.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 size-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}
