import { BarChart3, History, Home, Route, Settings } from "lucide-react"

/**
 * Destinos da navegação, em um lugar só.
 *
 * O rail (desktop) e a gaveta (celular) mostram os mesmos cinco destinos com
 * apresentações diferentes: lá cabe só o rótulo curto sob o ícone, aqui cabe o
 * nome inteiro. Duas listas divergiriam no primeiro cadastro novo — foi o que
 * aconteceu com a Navbar, que ficou sem "Dias não úteis" até ser apagada.
 */

export const NAV = [
  { href: "/", label: "Início", short: "Início", Icone: Home },
  { href: "/historico", label: "Histórico", short: "Histórico", Icone: History },
  {
    href: "/estatisticas",
    label: "Estatísticas",
    short: "Estatísticas",
    Icone: BarChart3,
  },
  {
    href: "/calcular-rotas",
    label: "Calcular Rotas",
    short: "Calcular",
    Icone: Route,
  },
] as const

export const NAV_ADMIN = [
  { href: "/admin/projetos", label: "Projetos" },
  { href: "/admin/ums", label: "UMs" },
  { href: "/admin/localidades", label: "Localidades" },
  { href: "/admin/tecnicos", label: "Técnicos" },
  { href: "/admin/dias-nao-uteis", label: "Dias não úteis" },
] as const

/** Ícone do grupo Administração, que não é um destino próprio. */
export const IconeAdmin = Settings

/** Início casa exato; o resto casa por prefixo, para cobrir as subrotas. */
export function rotaAtiva(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}
