import { Construction } from "lucide-react"

type PlaceholderPageProps = {
  /** Título principal da página (ex: "Histórico") */
  titulo: string
  /** Subtítulo descritivo curto (ex: "Registro de todas as alocações realizadas") */
  descricao: string
  /** Em qual fase do roadmap PRD esta página será desenvolvida (ex: "Fase 5 — Visualização") */
  fase: string
}

/**
 * Componente placeholder para páginas que ainda não foram desenvolvidas.
 * Usado durante a Fase 1 (Fundação) para evitar páginas 404 na navegação.
 *
 * Cada página placeholder mostra:
 * - Ícone de construção
 * - Título e descrição da página
 * - Referência à fase do roadmap em que será implementada
 */
export function PlaceholderPage({ titulo, descricao, fase }: PlaceholderPageProps) {
  return (
    <main className="container mx-auto flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-8 px-4 py-16">
      {/* Ícone */}
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted">
        <Construction className="h-10 w-10 text-muted-foreground" />
      </div>

      {/* Eyebrow + Título + Descrição */}
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Em desenvolvimento
        </span>
        <h1 className="font-heading text-5xl text-foreground">{titulo}</h1>
        <p className="max-w-md text-base text-muted-foreground">{descricao}</p>
      </div>

      {/* Card com referência à fase */}
      <div className="rounded-lg border bg-card px-6 py-4 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Roadmap
        </p>
        <p className="mt-1 font-medium text-foreground">{fase}</p>
      </div>
    </main>
  )
}