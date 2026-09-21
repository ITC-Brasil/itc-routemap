/**
 * Passo 1 da Etapa 15.0 — checagem dos dados ANTES de migrar.
 *
 * Rode com: npm run checar:migracao-cobertura
 * Sai com código 1 quando existe impedimento.
 *
 * A migração da 15.0 tem três pedaços de DDL que o dado atual pode recusar:
 *
 *  1. ÍNDICE ÚNICO em `ums.tecnicoAtualId` — falha se dois `ums` terminarem
 *     com o mesmo técnico. Em Postgres, `UNIQUE` em coluna nullable aceita
 *     quantos NULL quiser, então UM sem dono não atrapalha; o que atrapalha é
 *     técnico repetido.
 *  2. BACKFILL de `ums.tecnicoAtualId` a partir dos pontos Agendados — que
 *     casa `pontos.umNome` com `ums.nome` por TEXTO (a dívida registrada da
 *     etapa). Nome que não casa não tem para onde ir.
 *  3. `tecnicos.modoPrincipal` para NOT NULL — falha com uma única linha nula.
 *
 * E há um detalhe que só o dado responde: a coluna `tecnicoAtualId` pode já
 * ter valor. `scripts/migrar-firestore.ts` copiava esse campo do Firestore, e
 * desde então nenhum fluxo do app o mantém. Se sobrou lixo lá, ele pode tanto
 * quebrar o índice único por conta própria quanto divergir do emparelhamento
 * real — e nesse caso alguém tem de dizer qual dos dois vale.
 *
 * Este script não escreve nada. Ele só lê e dá o veredito.
 */

import { prisma } from "@/lib/prisma"
import { obterCobertura } from "@/lib/db/cobertura"
import type { ModoTransporte } from "@/lib/rotas-utils"

const MODOS_VALIDOS: ModoTransporte[] = [
  "DRIVE",
  "TWO_WHEELER",
  "WALK",
  "BICYCLE",
  "TRANSIT",
]

const impedimentos: string[] = []
const decisoes: string[] = []
const avisos: string[] = []

function titulo(texto: string) {
  console.log(`\n${texto}`)
  console.log("-".repeat(texto.length))
}

async function main() {
  const cobertura = await obterCobertura()

  const [ums, tecnicos] = await Promise.all([
    prisma.um.findMany({
      select: { id: true, nome: true, tecnicoAtualId: true },
      orderBy: { nome: "asc" },
    }),
    prisma.tecnico.findMany({
      select: { id: true, nome: true, ativo: true, modoPrincipal: true },
      orderBy: { nome: "asc" },
    }),
  ])

  const nomeTecnico = new Map(tecnicos.map((t) => [t.id, t.nome]))

  // ========================================================
  titulo("Cadastro")
  // ========================================================
  console.log(`UMs cadastradas:        ${ums.length}`)
  console.log(`Técnicos ativos:        ${tecnicos.filter((t) => t.ativo).length}`)
  console.log(`Técnicos inativos:      ${tecnicos.filter((t) => !t.ativo).length}`)
  console.log(`Pares em vigor:         ${cobertura.pares.length}`)

  // ========================================================
  titulo("Emparelhamento que o backfill vai gravar")
  // ========================================================
  const nomesUms = new Map(ums.map((u) => [u.nome, u]))
  const donoPorUm = new Map<string, { id: string; nome: string }[]>()

  for (const par of cobertura.pares) {
    if (!nomesUms.has(par.umNome)) continue
    const lista = donoPorUm.get(par.umNome) ?? []
    lista.push({ id: par.tecnicoId, nome: par.tecnicoNome })
    donoPorUm.set(par.umNome, lista)
  }

  for (const um of ums) {
    const donos = donoPorUm.get(um.nome) ?? []
    const alvo =
      donos.length === 0
        ? "(ninguém — nasce NULL, vermelho na 15.6)"
        : donos.length === 1
          ? donos[0].nome
          : `AMBÍGUO: ${donos.map((d) => d.nome).join(" / ")}`
    console.log(`  ${um.nome.padEnd(14)} → ${alvo}`)
  }

  // ========================================================
  // Impedimento 1 — técnico que viraria dono de duas UMs
  // ========================================================
  const umsPorTecnico = new Map<string, string[]>()
  for (const [umNome, donos] of donoPorUm) {
    for (const dono of donos) {
      const lista = umsPorTecnico.get(dono.id) ?? []
      lista.push(umNome)
      umsPorTecnico.set(dono.id, lista)
    }
  }
  for (const [tecnicoId, umsDele] of umsPorTecnico) {
    if (umsDele.length > 1) {
      impedimentos.push(
        `${nomeTecnico.get(tecnicoId) ?? tecnicoId} ficaria dono de ${umsDele.length} UMs (${umsDele.join(", ")}) — o índice único recusa`
      )
    }
  }

  // ========================================================
  // Decisão humana — UM com mais de um candidato a dono
  // ========================================================
  for (const [umNome, donos] of donoPorUm) {
    if (donos.length > 1) {
      decisoes.push(
        `${umNome} tem ${donos.length} técnicos agendados (${donos.map((d) => d.nome).join(", ")}) — qual vira o dono?`
      )
    }
  }

  // ========================================================
  // Aviso — vínculo que o backfill perde por nome
  // ========================================================
  for (const par of cobertura.paresForaDoCadastro) {
    avisos.push(
      `${par.umNome} está agendada para ${par.tecnicoNome} mas não existe em ums — o backfill perde este vínculo`
    )
  }

  // ========================================================
  titulo("Estado atual de ums.tecnicoAtualId")
  // ========================================================
  const comValor = ums.filter((u) => u.tecnicoAtualId !== null)
  console.log(`Linhas com valor:       ${comValor.length} de ${ums.length}`)

  if (comValor.length === 0) {
    console.log("Coluna vazia, como esperado — nada herdado do Firestore.")
  } else {
    // Duplicata que já existe na coluna quebra o índice único mesmo sem
    // backfill nenhum.
    const contagem = new Map<string, string[]>()
    for (const u of comValor) {
      const lista = contagem.get(u.tecnicoAtualId!) ?? []
      lista.push(u.nome)
      contagem.set(u.tecnicoAtualId!, lista)
    }
    for (const [tecnicoId, umsDele] of contagem) {
      if (umsDele.length > 1) {
        impedimentos.push(
          `ums.tecnicoAtualId JÁ tem ${nomeTecnico.get(tecnicoId) ?? tecnicoId} em ${umsDele.length} linhas (${umsDele.join(", ")}) — o índice único recusa antes de qualquer backfill`
        )
      }
    }

    for (const u of comValor) {
      const donos = donoPorUm.get(u.nome) ?? []
      const atual = nomeTecnico.get(u.tecnicoAtualId!) ?? u.tecnicoAtualId!
      if (!nomeTecnico.has(u.tecnicoAtualId!)) {
        avisos.push(
          `${u.nome} aponta para o técnico ${u.tecnicoAtualId} que não existe mais em tecnicos`
        )
      } else if (donos.length === 1 && donos[0].id !== u.tecnicoAtualId) {
        decisoes.push(
          `${u.nome}: a coluna diz ${atual}, os pontos agendados dizem ${donos[0].nome} — qual vale?`
        )
      } else if (donos.length === 0) {
        avisos.push(
          `${u.nome} tem ${atual} na coluna mas nenhum ponto agendado — o backfill sobrescreveria com NULL se não preservar o valor existente`
        )
      }
    }
  }

  // ========================================================
  titulo("tecnicos.modoPrincipal para NOT NULL")
  // ========================================================
  const semModo = tecnicos.filter(
    (t) => t.modoPrincipal === null || t.modoPrincipal.trim() === ""
  )
  const modoInvalido = tecnicos.filter(
    (t) =>
      t.modoPrincipal !== null &&
      t.modoPrincipal.trim() !== "" &&
      !MODOS_VALIDOS.includes(t.modoPrincipal as ModoTransporte)
  )

  console.log(`Com modo preenchido:    ${tecnicos.length - semModo.length} de ${tecnicos.length}`)

  for (const t of semModo) {
    // Inclui inativos de propósito: NOT NULL vale para a tabela inteira, não
    // só para quem está operando.
    impedimentos.push(
      `${t.nome}${t.ativo ? "" : " (inativo)"} está sem modoPrincipal — NOT NULL recusa`
    )
  }
  for (const t of modoInvalido) {
    impedimentos.push(
      `${t.nome} tem modoPrincipal "${t.modoPrincipal}", que não é modo da Routes API (${MODOS_VALIDOS.join(", ")})`
    )
  }
  if (semModo.length === 0 && modoInvalido.length === 0) {
    console.log("Todos preenchidos e com valor válido.")
  }

  // ========================================================
  titulo("Veredito")
  // ========================================================
  if (impedimentos.length > 0) {
    console.log("IMPEDIMENTO — a migração falharia com este dado:")
    for (const i of impedimentos) console.log(`  x ${i}`)
  }
  if (decisoes.length > 0) {
    console.log("\nDECISÃO HUMANA — o backfill não tem como escolher:")
    for (const d of decisoes) console.log(`  ? ${d}`)
  }
  if (avisos.length > 0) {
    console.log("\nAVISO — migra, mas alguém precisa saber:")
    for (const a of avisos) console.log(`  ! ${a}`)
  }

  const semDono = ums.filter((u) => (donoPorUm.get(u.nome) ?? []).length === 0)
  if (semDono.length > 0) {
    console.log(
      `\n${semDono.length} UM(s) nascem sem dono (NULL): ${semDono.map((u) => u.nome).join(", ")}`
    )
    console.log(
      "Isso é permitido pelo índice único e é o estado que a 15.6 pinta de vermelho."
    )
  }

  if (impedimentos.length === 0 && decisoes.length === 0) {
    console.log("\nLIBERADO: a migração da 15.0 pode ser escrita e aplicada.")
  } else {
    console.log("\nNÃO LIBERADO: resolva os itens acima antes de migrar.")
    process.exitCode = 1
  }
}

main()
  .catch((err) => {
    console.error("Erro ao checar:", err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
