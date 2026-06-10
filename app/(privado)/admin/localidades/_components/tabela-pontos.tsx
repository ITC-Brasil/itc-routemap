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
import type { Ponto } from "@/lib/firestore/pontos"
import type { Projeto } from "@/lib/firestore/projetos"
import { corTextoIdeal } from "@/lib/firestore/ras"

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

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Projeto</TableHead>
              <TableHead>UM</TableHead>
              <TableHead>RA</TableHead>
              <TableHead>Endereço</TableHead>
              <TableHead>Plus Code</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pontosPaginados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-48">
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
}: {
  ponto: Ponto
  projeto: Projeto | undefined
  onEditar: (ponto: Ponto) => void
}) {
  const linkMaps = obterLinkMaps(ponto)

  return (
    <TableRow>
      <TableCell>
        {projeto ? (
          <Badge
            className="font-mono"
            style={{
              backgroundColor: projeto.cor,
              color: corTextoIdeal(projeto.cor),
            }}
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
      <TableCell className="font-mono text-xs text-muted-foreground">
        {ponto.plusCode || "—"}
      </TableCell>
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

function StatusBadge({ status }: { status: string }) {
  if (status === "Pendente") {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
        Pendente
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="text-muted-foreground">
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
