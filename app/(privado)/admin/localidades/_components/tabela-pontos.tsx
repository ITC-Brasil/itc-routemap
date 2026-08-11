"use client"

import { useMemo, useState } from "react"
import { MapPin, Pencil, SearchX } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import type { Ponto } from "@/lib/db/pontos"
import type { Projeto } from "@/lib/db/projetos"

const ITENS_POR_PAGINA = 20

interface TabelaPontosProps {
  pontos: Ponto[]
  projetosMap: Map<string, Projeto>
  onEditar: (ponto: Ponto) => void
}

export function TabelaPontos({
  pontos,
  projetosMap,
  onEditar,
}: TabelaPontosProps) {
  const [paginaAtual, setPaginaAtual] = useState(1)

  const totalPaginas = Math.max(1, Math.ceil(pontos.length / ITENS_POR_PAGINA))

  // Página efetiva: clamped no total. DERIVADA durante render (não via effect).
  // Isso elimina o warning React 19 de "setState dentro de effect" que teríamos
  // se fizéssemos isso com useEffect + setPaginaAtual.
  const paginaEfetiva = Math.min(paginaAtual, totalPaginas)

  const pontosPaginados = useMemo(() => {
    const inicio = (paginaEfetiva - 1) * ITENS_POR_PAGINA
    return pontos.slice(inicio, inicio + ITENS_POR_PAGINA)
  }, [pontos, paginaEfetiva])

  const numerosPaginas = useMemo(
    () => calcularNumerosPaginas(paginaEfetiva, totalPaginas),
    [paginaEfetiva, totalPaginas]
  )

  const irParaPagina = (n: number) => {
    if (n >= 1 && n <= totalPaginas) {
      setPaginaAtual(n)
    }
  }

  // Coluna cujos valores estão TODOS vazios é ocultada, não exibida com traços
  // (system.md §4). Plus Code é o caso real: em projetos que não usam o campo, a
  // coluna era uma fileira de "—" ocupando largura de dado.
  // O critério olha o conjunto filtrado inteiro, não só a página — senão a coluna
  // apareceria e desapareceria ao paginar.
  const mostrarPlusCode = useMemo(
    () => pontos.some((p) => p.plusCode.trim() !== ""),
    [pontos],
  )
  const totalColunas = mostrarPlusCode ? 7 : 6

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Projeto</TableHead>
              <TableHead>UM</TableHead>
              <TableHead>RA</TableHead>
              <TableHead>Endereço</TableHead>
              {mostrarPlusCode && <TableHead>Plus Code</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pontosPaginados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={totalColunas} className="h-48">
                  <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                    <SearchX className="h-10 w-10 opacity-50" />
                    <div className="max-w-sm space-y-1 text-center">
                      <p className="font-heading text-base">
                        Nenhum ponto encontra os filtros
                      </p>
                      <p className="text-xs">
                        Tente remover algum filtro — o de status costuma ser o
                        mais restritivo. Se acabou de editar a planilha, clique
                        em <span className="font-medium">Atualizar Pontos</span>{" "}
                        no topo.
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              
              pontosPaginados.map((ponto) => (
                <LinhaPonto
                  key={ponto.id}
                  ponto={ponto}
                  projeto={projetosMap.get(ponto.projetoId)}
                  onEditar={onEditar}
                  mostrarPlusCode={mostrarPlusCode}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPaginas > 1 && (
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando{" "}
            <span className="font-medium">
              {(paginaEfetiva - 1) * ITENS_POR_PAGINA + 1}
            </span>
            {" – "}
            <span className="font-medium">
              {Math.min(paginaEfetiva * ITENS_POR_PAGINA, pontos.length)}
            </span>{" "}
            de <span className="font-medium">{pontos.length}</span> pontos
          </p>

          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    irParaPagina(paginaEfetiva - 1)
                  }}
                  className={
                    paginaEfetiva === 1 ? "pointer-events-none opacity-50" : ""
                  }
                />
              </PaginationItem>

              {numerosPaginas.map((item, idx) => {
                if (item === "...") {
                  return (
                    <PaginationItem key={"ellipsis-" + idx}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )
                }
                return (
                  <PaginationItem key={item}>
                    <PaginationLink
                      href="#"
                      isActive={item === paginaEfetiva}
                      onClick={(e) => {
                        e.preventDefault()
                        irParaPagina(item)
                      }}
                    >
                      {item}
                    </PaginationLink>
                  </PaginationItem>
                )
              })}

              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    irParaPagina(paginaEfetiva + 1)
                  }}
                  className={
                    paginaEfetiva === totalPaginas
                      ? "pointer-events-none opacity-50"
                      : ""
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  )
}

// ============================================================
// SUBCOMPONENTES
// ============================================================

function LinhaPonto({
  ponto,
  projeto,
  onEditar,
  mostrarPlusCode,
}: {
  ponto: Ponto
  projeto: Projeto | undefined
  onEditar: (ponto: Ponto) => void
  mostrarPlusCode: boolean
}) {
  const linkMaps = obterLinkMaps(ponto)

  return (
    <TableRow>
      <TableCell>
        {projeto ? (
          <Badge
            variant="outline"
            className="badge-cor-dado font-mono"
            style={{ "--cor-dado": projeto.cor } as React.CSSProperties}
          >
            {projeto.sigla}
          </Badge>
        ) : (
          <Badge variant="outline">—</Badge>
        )}
      </TableCell>
      <TableCell className="font-medium">{ponto.umNome}</TableCell>
      <TableCell>{ponto.raNome}</TableCell>
      <TableCell className="max-w-xs truncate" title={ponto.endereco}>
        {ponto.endereco}
      </TableCell>
      {mostrarPlusCode && (
        <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
          {ponto.plusCode || "—"}
        </TableCell>
      )}
      <TableCell>
        <StatusBadge status={ponto.status} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {linkMaps ? (
            <Button
              variant="ghost"
              size="icon"
              asChild
              title="Abrir no Google Maps"
            >
              <a href={linkMaps} target="_blank" rel="noopener noreferrer">
                <MapPin className="h-4 w-4" />
              </a>
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEditar(ponto)}
            title="Editar ponto"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

/**
 * Status do ponto — cada um com identidade própria (system.md §5.2).
 *
 *   Pendente   warn    aguarda ação humana, precisa chamar atenção
 *   Agendado   accent  comprometido, em andamento
 *   Histórico  muted   encerrado, recolhe-se ao fundo
 *
 * Antes: Pendente vinha em VERDE e "Agendado" e "Histórico" caíam no mesmo
 * cinza — dois estados operacionalmente opostos, visualmente idênticos. O verde
 * também era semanticamente errado: sugere concluído, quando o ponto está
 * justamente esperando alguém agir.
 *
 * O vocabulário tem exatamente estes três valores. "Atual" é palavra da planilha,
 * traduzida na ingestão, e nunca chega à interface.
 */
function StatusBadge({ status }: { status: string }) {
  if (status === "Pendente") {
    return (
      <Badge variant="outline" className="border-warn bg-warn-tint text-warn">
        Pendente
      </Badge>
    )
  }
  if (status === "Agendado") {
    return (
      <Badge
        variant="outline"
        className="border-primary bg-accent text-accent-foreground"
      >
        Agendado
      </Badge>
    )
  }
  if (status === "Histórico") {
    return (
      <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
        Histórico
      </Badge>
    )
  }
  // Valor fora do vocabulário: aparece como está, para não esconder o problema.
  return (
    <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
      {status || "—"}
    </Badge>
  )
}

// ============================================================
// HELPERS
// ============================================================

function obterLinkMaps(ponto: Ponto): string | null {
  if (ponto.linkMaps) return ponto.linkMaps
  if (ponto.latitude && ponto.longitude) {
    return `https://www.google.com/maps/search/?api=1&query=${ponto.latitude},${ponto.longitude}`
  }
  return null
}

function calcularNumerosPaginas(
  atual: number,
  total: number
): Array<number | "..."> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const paginas: Array<number | "..."> = []
  paginas.push(1)

  if (atual > 3) paginas.push("...")

  const inicio = Math.max(2, atual - 1)
  const fim = Math.min(total - 1, atual + 1)
  for (let i = inicio; i <= fim; i++) paginas.push(i)

  if (atual < total - 2) paginas.push("...")
  paginas.push(total)

  return paginas
}
