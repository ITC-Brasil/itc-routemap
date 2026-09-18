"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Tabela que vira lista de cartões abaixo de `md`.
 *
 * Uma tabela de seis colunas não cabe em 375px, e `overflow-x-auto` só troca o
 * problema por rolagem lateral — a primeira coluna, que é onde está a
 * identificação da linha, some para fora da tela. Abaixo de `md` cada linha
 * passa a ser um bloco: as células empilham como "rótulo · valor", o cabeçalho
 * some (os rótulos passaram para dentro das células) e a rolagem lateral deixa
 * de existir.
 *
 * A MESMA marcação alimenta as duas formas. Escrever uma tabela para o desktop
 * e uma lista de cartões para o celular é manter dois componentes com o mesmo
 * conteúdo, e eles divergem no primeiro campo novo.
 *
 * Quem usa a tabela informa, por célula:
 *
 *  - `rotulo`: o texto do cabeçalho daquela coluna. Aparece só no cartão,
 *    antes do valor. Sem ele o cartão vira uma pilha de valores sem nome.
 *  - `prioridade`: o que acontece com a célula no cartão.
 *      essencial  — visível, no topo do cartão (padrão)
 *      secundaria — visível, abaixo das essenciais, em corpo menor
 *      auxiliar   — só na tabela; some no cartão (ordinais, colunas de apoio)
 *      acao       — botões da linha, sempre no rodapé do cartão
 *
 * A ordem no cartão sai da prioridade, não do DOM: no desktop a identificação
 * pode estar na terceira coluna sem prejuízo, mas no cartão ela precisa ser a
 * primeira linha.
 */

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full md:overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm max-md:block", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b max-md:hidden", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0 max-md:block", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0 max-md:block",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        "max-md:flex max-md:flex-col max-md:gap-1 max-md:px-4 max-md:py-3.5",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

/** O que acontece com a célula quando a linha vira cartão. */
type PrioridadeCelula = "essencial" | "secundaria" | "auxiliar" | "acao"

const CLASSES_PRIORIDADE: Record<PrioridadeCelula, string> = {
  essencial: "max-md:order-1",
  secundaria: "max-md:order-2 max-md:text-[13px]",
  auxiliar: "max-md:hidden",
  acao: "max-md:order-3 max-md:justify-end max-md:pt-1",
}

function TableCell({
  className,
  rotulo,
  prioridade = "essencial",
  children,
  ...props
}: React.ComponentProps<"td"> & {
  /** Cabeçalho da coluna, repetido dentro do cartão. */
  rotulo?: string
  prioridade?: PrioridadeCelula
}) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        // No cartão a célula é uma linha "rótulo à esquerda, valor à direita".
        // `whitespace-normal` porque endereço e descrição precisam quebrar —
        // é o `nowrap` que força a rolagem lateral quando não há colunas.
        "max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-4 max-md:p-0 max-md:whitespace-normal",
        CLASSES_PRIORIDADE[prioridade],
        className
      )}
      {...props}
    >
      {rotulo && (
        <span
          aria-hidden="true"
          className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground md:hidden"
        >
          {rotulo}
        </span>
      )}
      {/* `md:contents` some com este invólucro na tabela: acima de `md` os
          filhos voltam a ser filhos diretos da célula, e nada do que já estava
          escrito muda de comportamento. */}
      <span className="min-w-0 text-right max-md:block md:contents">
        {children}
      </span>
    </td>
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
