"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ChevronDown, LogOut, Menu, Settings, User } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { logout } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { ThemeToggle } from "@/components/theme-toggle"

/**
 * Itens de menu principais (visíveis na barra)
 */
const menusPrincipais = [
  { href: "/", label: "Início" },
  { href: "/historico", label: "Histórico" },
  { href: "/estatisticas", label: "Estatísticas" },
  { href: "/calcular-rotas", label: "Calcular Rotas" },
]

/**
 * Itens do dropdown "Administração"
 */
const menusAdmin = [
  { href: "/admin/projetos", label: "Projetos" },
  { href: "/admin/ums", label: "UMs" },
  { href: "/admin/localidades", label: "Localidades" },
  { href: "/admin/tecnicos", label: "Técnicos" },
]

export function Navbar() {
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const handleLogout = async () => {
    await logout()
    router.replace("/login")
  }

  // Iniciais do nome do usuário para o avatar fallback (ex: "Dev ITCBrasil" → "DI")
  const userInitials =
    user?.displayName
      ?.split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase() ?? "U"

  // Função auxiliar: a rota atual bate com o link?
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href)

  const isAdminActive = menusAdmin.some((m) => pathname.startsWith(m.href))

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* === LADO ESQUERDO: Logo + Menus desktop === */}
        <div className="flex items-center gap-8">
          {/* Logo (placeholder ITC) */}
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <span className="font-heading text-sm text-primary-foreground">
                ITC
              </span>
            </div>
            <span className="hidden font-heading text-lg text-foreground sm:inline">
              RouteMap
            </span>
          </Link>

          {/* Menus desktop (escondidos no mobile) */}
          <nav className="hidden items-center gap-1 md:flex">
            {menusPrincipais.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}

            {/* Dropdown Administração */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`gap-1 ${
                    isAdminActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  Administração
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  Cadastros
                </DropdownMenuLabel>
                {menusAdmin.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link href={item.href}>{item.label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>

        {/* === LADO DIREITO: Tema + Usuário + Mobile === */}
        <div className="flex items-center gap-2">
          {/* Toggle de tema */}
          <ThemeToggle />

          {/* Menu do usuário (desktop) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative hidden h-9 items-center gap-2 md:flex"
              >
                <Avatar className="h-7 w-7">
                  <AvatarImage
                    src={user?.photoURL ?? undefined}
                    alt={user?.displayName ?? ""}
                  />
                  <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">
                  {user?.displayName?.split(" ")[0] ?? "Admin"}
                </span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {user?.displayName ?? "Administrador"}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {user?.email}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Menu hambúrguer (mobile) */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Abrir menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="font-heading text-2xl">
                  ITC RouteMap
                </SheetTitle>
              </SheetHeader>

              {/* Info do usuário no mobile */}
              <div className="flex items-center gap-3 px-4 py-4">
                <Avatar className="h-10 w-10">
                  <AvatarImage
                    src={user?.photoURL ?? undefined}
                    alt={user?.displayName ?? ""}
                  />
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {user?.displayName ?? "Administrador"}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {user?.email}
                  </span>
                </div>
              </div>

              <Separator />

              {/* Menus principais */}
              <nav className="flex flex-col gap-1 px-2 py-4">
                {menusPrincipais.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive(item.href)
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <Separator />

              {/* Menus admin */}
              <div className="flex flex-col gap-1 px-2 py-4">
                <p className="px-3 pb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  <Settings className="mr-2 inline h-3 w-3" />
                  Administração
                </p>
                {menusAdmin.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      pathname.startsWith(item.href)
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>

              <Separator />

              {/* Botão Sair no mobile */}
              <div className="px-2 py-4">
                <Button
                  onClick={handleLogout}
                  variant="ghost"
                  className="w-full justify-start gap-2 text-muted-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}