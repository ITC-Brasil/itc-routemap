import "dotenv/config"
import crypto from "crypto"
import { prisma } from "../lib/prisma"

/**
 * Seed de DADOS DE TESTE — NÃO é o seed oficial (prisma/seed.ts, que cria
 * o admin). Este arquivo popula entidades de negócio para validar a app
 * com dados reais em ambiente de teste.
 *
 * Todos os registros usam IDs com prefixo `teste-`, o que permite:
 *   - Idempotência: reexecutar faz `upsert` nos mesmos IDs.
 *   - Limpeza cirúrgica: `--limpar` remove só o que começa com `teste-`,
 *     sem precisar de `migrate reset`.
 *
 * Uso:
 *   npx tsx prisma/seed-teste.ts            # cria/atualiza
 *   npx tsx prisma/seed-teste.ts --limpar   # remove só os `teste-*`
 *
 * NÃO toca em User/Session/Account — o admin existente fica intacto.
 */

const PREFIXO = "teste-"

// ============================================================
// HASH — cópia fiel de calcularHashPonto (lib/db/pontos.ts)
// ============================================================
// lib/db/pontos.ts tem `import "server-only"` e não pode ser importado
// por um script Node. A ordem dos campos e o separador "|" abaixo são
// IDÊNTICOS aos da função original — qualquer divergência faria a
// sincronização do Sheets reprocessar as linhas como "alteradas".
function calcularHashPonto(input: {
  projetoId: string
  linhaOrigem: number
  ciclo: number
  etapa: number
  tecnicoNomeHistorico: string
  umNome: string
  raNome: string
  uf: string
  plusCode: string
  endereco: string
  referencia: string
  linkMaps: string
  status: string
}): string {
  const chave = [
    input.projetoId,
    input.linhaOrigem,
    input.ciclo,
    input.etapa,
    input.tecnicoNomeHistorico,
    input.umNome,
    input.raNome,
    input.uf,
    input.plusCode,
    input.endereco,
    input.referencia,
    input.linkMaps,
    input.status,
  ].join("|")

  return crypto.createHash("md5").update(chave).digest("hex")
}

// ============================================================
// DATAS
// ============================================================

/** Hoje às 09:00 local — exercita `isHoje` no Histórico. */
function hojeManha(): Date {
  const d = new Date()
  d.setHours(9, 0, 0, 0)
  return d
}

/**
 * Dia anterior às 14:00 — exercita "neste mês, mas não hoje".
 * Se hoje for dia 1 (ontem cairia no mês passado), usa hoje às 03:00
 * para o lote continuar dentro do mês corrente.
 */
function ontemTarde(): Date {
  const hoje = new Date()
  if (hoje.getDate() === 1) {
    const d = new Date()
    d.setHours(3, 0, 0, 0)
    return d
  }
  const d = new Date()
  d.setDate(d.getDate() - 1)
  d.setHours(14, 0, 0, 0)
  return d
}

// ============================================================
// DADOS
// ============================================================

const PROJETOS = [
  {
    id: "teste-proj-ativo",
    nome: "Projeto Teste ITC",
    sigla: "TST",
    cor: "#008F95",
    ativo: true,
  },
  {
    id: "teste-proj-inativo",
    nome: "Projeto Teste Inativo",
    sigla: "TSTI",
    cor: "#6B7280",
    ativo: false,
  },
]

const RAS = [
  { id: "teste-ra-brasilia", nome: "Brasília", cor: "#008F95" },
  { id: "teste-ra-taguatinga", nome: "Taguatinga", cor: "#0F766E" },
  { id: "teste-ra-ceilandia", nome: "Ceilândia", cor: "#B45309" },
]

const UMS = [
  {
    id: "teste-um-01",
    nome: "UM Teste Asa Norte",
    cor: "#008F95",
    projetoId: "teste-proj-ativo",
    tecnicoAtualId: "teste-tec-01",
    raAtualId: "teste-ra-brasilia",
  },
  {
    id: "teste-um-02",
    nome: "UM Teste Taguatinga",
    cor: "#0F766E",
    projetoId: "teste-proj-ativo",
    tecnicoAtualId: null,
    raAtualId: null,
  },
  {
    id: "teste-um-03",
    nome: "UM Teste Ceilandia",
    cor: "#B45309",
    projetoId: "teste-proj-ativo",
    tecnicoAtualId: null,
    raAtualId: null,
  },
  {
    id: "teste-um-04",
    nome: "UM Teste Projeto Inativo",
    cor: "#6B7280",
    projetoId: "teste-proj-inativo",
    tecnicoAtualId: null,
    raAtualId: null,
  },
]

// Endereços reais de Brasília com coordenadas plausíveis. `latitude`/
// `longitude` são obrigatórias no cálculo: Rota.origemLatitude é Float
// NOT NULL, então todo técnico usado numa rota precisa ter coords.
const TECNICOS = [
  {
    id: "teste-tec-01",
    nome: "Tecnico Teste Carlos",
    cor: "#008F95",
    endereco: "SQN 210, Asa Norte, Brasília - DF",
    pontoReferencia: "Proximo ao Parque da Cidade",
    plusCode: null,
    latitude: -15.7594,
    longitude: -47.8811,
    modoPrincipal: "DRIVE",
    ativo: true,
  },
  {
    id: "teste-tec-02",
    nome: "Tecnica Teste Ana",
    cor: "#0F766E",
    endereco: "QNL 12, Taguatinga Norte, Taguatinga - DF",
    pontoReferencia: null,
    plusCode: null,
    latitude: -15.8331,
    longitude: -48.0575,
    modoPrincipal: "TWO_WHEELER",
    ativo: true,
  },
  {
    id: "teste-tec-03",
    nome: "Tecnico Teste Bruno (inativo)",
    cor: "#B45309",
    endereco: "QNM 18, Ceilândia Sul, Ceilândia - DF",
    pontoReferencia: null,
    plusCode: null,
    latitude: -15.8156,
    longitude: -48.1109,
    modoPrincipal: null,
    ativo: false,
  },
]

/**
 * Pontos. Distribuição pensada para exercitar cada caminho:
 *
 * 01-04 → "Agendado", com coords, vinculados às 4 rotas do seed
 *         (consistência: rota Confirmada ⇒ ponto Agendado + rotaId).
 * 05-08 → "Pendente", com coords → alimentam o calcular-rotas.
 *         `obterDestinoDaUM` escolhe o de MAIOR (ciclo, etapa) por UM.
 * 09    → "Pendente" SEM coords, endereço real → WRITE-PATH do
 *         /api/geocode-pontos. Ciclo/etapa deliberadamente BAIXOS para
 *         nunca ser escolhido como destino de rota (não polui o cálculo).
 * 10    → "Histórico", com coords → valida filtro de status.
 */
const PONTOS = [
  // --- Agendados (vinculados a rotas) ---
  {
    id: "teste-ponto-01",
    projetoId: "teste-proj-ativo",
    raId: "teste-ra-brasilia",
    linhaOrigem: 2,
    umNome: "UM Teste Asa Norte",
    raNome: "Brasília",
    ciclo: 3,
    etapa: 2,
    tecnicoNomeHistorico: "Tecnico Teste Carlos",
    uf: "DF",
    endereco: "SCS Quadra 2, Asa Sul, Brasília - DF",
    referencia: "Edificio comercial",
    plusCode: null,
    linkMaps: "",
    latitude: -15.7997,
    longitude: -47.8919,
    status: "Agendado",
    tecnicoId: "teste-tec-01",
    rotaId: "teste-rota-01",
  },
  {
    id: "teste-ponto-02",
    projetoId: "teste-proj-ativo",
    raId: "teste-ra-taguatinga",
    linhaOrigem: 3,
    umNome: "UM Teste Taguatinga",
    raNome: "Taguatinga",
    ciclo: 3,
    etapa: 2,
    tecnicoNomeHistorico: "Tecnica Teste Ana",
    uf: "DF",
    endereco: "QNM 34, Taguatinga Sul, Taguatinga - DF",
    referencia: null,
    plusCode: null,
    linkMaps: "",
    latitude: -15.8467,
    longitude: -48.0631,
    status: "Agendado",
    tecnicoId: "teste-tec-02",
    rotaId: "teste-rota-02",
  },
  {
    id: "teste-ponto-03",
    projetoId: "teste-proj-ativo",
    raId: "teste-ra-ceilandia",
    linhaOrigem: 4,
    umNome: "UM Teste Ceilandia",
    raNome: "Ceilândia",
    ciclo: 3,
    etapa: 2,
    tecnicoNomeHistorico: "Tecnico Teste Carlos",
    uf: "DF",
    endereco: "QNP 14, Ceilândia Norte, Ceilândia - DF",
    referencia: null,
    plusCode: null,
    linkMaps: "",
    latitude: -15.8022,
    longitude: -48.1178,
    status: "Agendado",
    tecnicoId: "teste-tec-01",
    rotaId: "teste-rota-03",
  },
  {
    id: "teste-ponto-04",
    projetoId: "teste-proj-ativo",
    raId: "teste-ra-brasilia",
    linhaOrigem: 5,
    umNome: "UM Teste Asa Norte",
    raNome: "Brasília",
    ciclo: 2,
    etapa: 4,
    tecnicoNomeHistorico: "Tecnica Teste Ana",
    uf: "DF",
    endereco: "SHN Quadra 1, Asa Norte, Brasília - DF",
    referencia: "Hotel",
    plusCode: null,
    linkMaps: "",
    latitude: -15.7889,
    longitude: -47.8869,
    status: "Agendado",
    tecnicoId: "teste-tec-02",
    rotaId: "teste-rota-04",
  },

  // --- Pendentes com coords (alimentam o calcular-rotas) ---
  {
    id: "teste-ponto-05",
    projetoId: "teste-proj-ativo",
    raId: "teste-ra-brasilia",
    linhaOrigem: 6,
    umNome: "UM Teste Asa Norte",
    raNome: "Brasília",
    ciclo: 4,
    etapa: 1,
    tecnicoNomeHistorico: "",
    uf: "DF",
    endereco: "SQN 315, Asa Norte, Brasília - DF",
    referencia: null,
    plusCode: null,
    linkMaps: "",
    latitude: -15.7508,
    longitude: -47.8811,
    status: "Pendente",
    tecnicoId: null,
    rotaId: null,
  },
  {
    // Mesma UM do 05, mas (ciclo, etapa) MAIOR → este é o destino escolhido
    id: "teste-ponto-06",
    projetoId: "teste-proj-ativo",
    raId: "teste-ra-brasilia",
    linhaOrigem: 7,
    umNome: "UM Teste Asa Norte",
    raNome: "Brasília",
    ciclo: 4,
    etapa: 2,
    tecnicoNomeHistorico: "",
    uf: "DF",
    endereco: "SQN 410, Asa Norte, Brasília - DF",
    referencia: "Bloco B",
    plusCode: null,
    linkMaps: "",
    latitude: -15.7442,
    longitude: -47.8783,
    status: "Pendente",
    tecnicoId: null,
    rotaId: null,
  },
  {
    id: "teste-ponto-07",
    projetoId: "teste-proj-ativo",
    raId: "teste-ra-taguatinga",
    linhaOrigem: 8,
    umNome: "UM Teste Taguatinga",
    raNome: "Taguatinga",
    ciclo: 4,
    etapa: 2,
    tecnicoNomeHistorico: "",
    uf: "DF",
    endereco: "QSA 5, Taguatinga Sul, Taguatinga - DF",
    referencia: null,
    plusCode: null,
    linkMaps: "",
    latitude: -15.8394,
    longitude: -48.0525,
    status: "Pendente",
    tecnicoId: null,
    rotaId: null,
  },
  {
    id: "teste-ponto-08",
    projetoId: "teste-proj-ativo",
    raId: "teste-ra-ceilandia",
    linhaOrigem: 9,
    umNome: "UM Teste Ceilandia",
    raNome: "Ceilândia",
    ciclo: 4,
    etapa: 2,
    tecnicoNomeHistorico: "",
    uf: "DF",
    endereco: "QNN 13, Ceilândia Sul, Ceilândia - DF",
    referencia: null,
    plusCode: null,
    linkMaps: "",
    latitude: -15.8253,
    longitude: -48.1058,
    status: "Pendente",
    tecnicoId: null,
    rotaId: null,
  },

  // --- Pendente SEM coords: alvo do write-path do geocode ---
  {
    id: "teste-ponto-09",
    projetoId: "teste-proj-ativo",
    raId: "teste-ra-brasilia",
    linhaOrigem: 10,
    umNome: "UM Teste Asa Norte",
    raNome: "Brasília",
    // Ciclo/etapa baixos de propósito: nunca vira destino de rota
    ciclo: 1,
    etapa: 1,
    tecnicoNomeHistorico: "",
    uf: "DF",
    endereco: "Praça dos Três Poderes, Brasília - DF",
    referencia: "Alvo do teste de geocoding",
    plusCode: null,
    linkMaps: "",
    latitude: null,
    longitude: null,
    status: "Pendente",
    tecnicoId: null,
    rotaId: null,
  },

  // --- Histórico ---
  {
    id: "teste-ponto-10",
    projetoId: "teste-proj-ativo",
    raId: "teste-ra-taguatinga",
    linhaOrigem: 11,
    umNome: "UM Teste Taguatinga",
    raNome: "Taguatinga",
    ciclo: 1,
    etapa: 3,
    tecnicoNomeHistorico: "Tecnico Teste Bruno (inativo)",
    uf: "DF",
    endereco: "QNL 24, Taguatinga Norte, Taguatinga - DF",
    referencia: null,
    plusCode: null,
    linkMaps: "",
    latitude: -15.8289,
    longitude: -48.0692,
    status: "Histórico",
    tecnicoId: null,
    rotaId: null,
  },
]

/**
 * Rotas. `metricas` segue o shape exato de
 * `Partial<Record<ModoTransporte, MetricaModo>>` (lib/rotas-utils.ts):
 * `{ distanciaMetros, duracaoSegundos, observacao? }` — sem campos extras.
 *
 * Dois lotes: um de hoje (3 rotas, "auto") e um de ontem
 * (1 rota, "ajuste-pos-auto") — exercitam isHoje/isNesteMes e o badge de
 * origem da decisão no Histórico.
 */
const ROTAS = [
  {
    id: "teste-rota-01",
    loteId: "teste-lote-a",
    loteOrdem: 1,
    loteJustificativa:
      "Lote de teste A: alocacao automatica por proximidade (dados de seed).",
    origemDecisao: "auto",
    tecnicoId: "teste-tec-01",
    tecnicoNome: "Tecnico Teste Carlos",
    pontoId: "teste-ponto-01",
    umNome: "UM Teste Asa Norte",
    projetoId: "teste-proj-ativo",
    projetoSigla: "TST",
    origemEndereco: "SQN 210, Asa Norte, Brasília - DF",
    origemLatitude: -15.7594,
    origemLongitude: -47.8811,
    destinoEndereco: "SCS Quadra 2, Asa Sul, Brasília - DF",
    destinoLatitude: -15.7997,
    destinoLongitude: -47.8919,
    metricas: {
      DRIVE: { distanciaMetros: 6400, duracaoSegundos: 780 },
      TWO_WHEELER: { distanciaMetros: 6100, duracaoSegundos: 690 },
    },
    modoPrincipal: "DRIVE",
    status: "Confirmada",
    realocadaDe: null,
    criadoEm: hojeManha(),
  },
  {
    id: "teste-rota-02",
    loteId: "teste-lote-a",
    loteOrdem: 2,
    loteJustificativa:
      "Lote de teste A: alocacao automatica por proximidade (dados de seed).",
    origemDecisao: "auto",
    tecnicoId: "teste-tec-02",
    tecnicoNome: "Tecnica Teste Ana",
    pontoId: "teste-ponto-02",
    umNome: "UM Teste Taguatinga",
    projetoId: "teste-proj-ativo",
    projetoSigla: "TST",
    origemEndereco: "QNL 12, Taguatinga Norte, Taguatinga - DF",
    origemLatitude: -15.8331,
    origemLongitude: -48.0575,
    destinoEndereco: "QNM 34, Taguatinga Sul, Taguatinga - DF",
    destinoLatitude: -15.8467,
    destinoLongitude: -48.0631,
    metricas: {
      TWO_WHEELER: { distanciaMetros: 2300, duracaoSegundos: 360 },
      DRIVE: { distanciaMetros: 2500, duracaoSegundos: 420 },
    },
    modoPrincipal: "TWO_WHEELER",
    status: "Confirmada",
    realocadaDe: null,
    criadoEm: hojeManha(),
  },
  {
    id: "teste-rota-03",
    loteId: "teste-lote-a",
    loteOrdem: 3,
    loteJustificativa:
      "Lote de teste A: alocacao automatica por proximidade (dados de seed).",
    origemDecisao: "auto",
    tecnicoId: "teste-tec-01",
    tecnicoNome: "Tecnico Teste Carlos",
    pontoId: "teste-ponto-03",
    umNome: "UM Teste Ceilandia",
    projetoId: "teste-proj-ativo",
    projetoSigla: "TST",
    origemEndereco: "SQN 210, Asa Norte, Brasília - DF",
    origemLatitude: -15.7594,
    origemLongitude: -47.8811,
    destinoEndereco: "QNP 14, Ceilândia Norte, Ceilândia - DF",
    destinoLatitude: -15.8022,
    destinoLongitude: -48.1178,
    metricas: {
      DRIVE: {
        distanciaMetros: 28400,
        duracaoSegundos: 2280,
        observacao: "Inclui trecho de via expressa",
      },
    },
    modoPrincipal: "DRIVE",
    status: "Confirmada",
    realocadaDe: null,
    criadoEm: hojeManha(),
  },
  {
    id: "teste-rota-04",
    loteId: "teste-lote-b",
    loteOrdem: 1,
    loteJustificativa:
      "Lote de teste B: par ajustado manualmente apos a sugestao automatica.",
    origemDecisao: "ajuste-pos-auto",
    tecnicoId: "teste-tec-02",
    tecnicoNome: "Tecnica Teste Ana",
    pontoId: "teste-ponto-04",
    umNome: "UM Teste Asa Norte",
    projetoId: "teste-proj-ativo",
    projetoSigla: "TST",
    origemEndereco: "QNL 12, Taguatinga Norte, Taguatinga - DF",
    origemLatitude: -15.8331,
    origemLongitude: -48.0575,
    destinoEndereco: "SHN Quadra 1, Asa Norte, Brasília - DF",
    destinoLatitude: -15.7889,
    destinoLongitude: -47.8869,
    metricas: {
      TWO_WHEELER: { distanciaMetros: 21800, duracaoSegundos: 1980 },
      DRIVE: { distanciaMetros: 22600, duracaoSegundos: 1860 },
    },
    modoPrincipal: "TWO_WHEELER",
    status: "Confirmada",
    realocadaDe: null,
    criadoEm: ontemTarde(),
  },
]

// ============================================================
// LIMPEZA
// ============================================================

async function limpar() {
  // Ordem: das entidades que referenciam para as referenciadas.
  const rotas = await prisma.rota.deleteMany({
    where: { id: { startsWith: PREFIXO } },
  })
  const pontos = await prisma.ponto.deleteMany({
    where: { id: { startsWith: PREFIXO } },
  })
  const ums = await prisma.um.deleteMany({
    where: { id: { startsWith: PREFIXO } },
  })
  const tecnicos = await prisma.tecnico.deleteMany({
    where: { id: { startsWith: PREFIXO } },
  })
  const ras = await prisma.ra.deleteMany({
    where: { id: { startsWith: PREFIXO } },
  })
  const projetos = await prisma.projeto.deleteMany({
    where: { id: { startsWith: PREFIXO } },
  })

  console.log("Limpeza dos registros `teste-*`:")
  console.log(`  rotas:    ${rotas.count}`)
  console.log(`  pontos:   ${pontos.count}`)
  console.log(`  ums:      ${ums.count}`)
  console.log(`  tecnicos: ${tecnicos.count}`)
  console.log(`  ras:      ${ras.count}`)
  console.log(`  projetos: ${projetos.count}`)
}

// ============================================================
// SEMEADURA
// ============================================================

async function semear() {
  for (const p of PROJETOS) {
    await prisma.projeto.upsert({
      where: { id: p.id },
      update: p,
      create: p,
    })
  }

  for (const ra of RAS) {
    await prisma.ra.upsert({
      where: { id: ra.id },
      update: ra,
      create: ra,
    })
  }

  for (const um of UMS) {
    await prisma.um.upsert({
      where: { id: um.id },
      update: um,
      create: um,
    })
  }

  for (const t of TECNICOS) {
    await prisma.tecnico.upsert({
      where: { id: t.id },
      update: t,
      create: t,
    })
  }

  for (const ponto of PONTOS) {
    // hashMd5 derivado dos mesmos campos que a sincronização usa
    const hashMd5 = calcularHashPonto({
      projetoId: ponto.projetoId,
      linhaOrigem: ponto.linhaOrigem,
      ciclo: ponto.ciclo,
      etapa: ponto.etapa,
      tecnicoNomeHistorico: ponto.tecnicoNomeHistorico,
      umNome: ponto.umNome,
      raNome: ponto.raNome,
      uf: ponto.uf,
      plusCode: ponto.plusCode ?? "",
      endereco: ponto.endereco,
      referencia: ponto.referencia ?? "",
      linkMaps: ponto.linkMaps,
      status: ponto.status,
    })
    const dados = { ...ponto, hashMd5 }
    await prisma.ponto.upsert({
      where: { id: ponto.id },
      update: dados,
      create: dados,
    })
  }

  for (const rota of ROTAS) {
    await prisma.rota.upsert({
      where: { id: rota.id },
      update: rota,
      create: rota,
    })
  }

  // Contagens para conferência
  const [projetos, ras, ums, tecnicos, pontos, rotas] = await Promise.all([
    prisma.projeto.count({ where: { id: { startsWith: PREFIXO } } }),
    prisma.ra.count({ where: { id: { startsWith: PREFIXO } } }),
    prisma.um.count({ where: { id: { startsWith: PREFIXO } } }),
    prisma.tecnico.count({ where: { id: { startsWith: PREFIXO } } }),
    prisma.ponto.count({ where: { id: { startsWith: PREFIXO } } }),
    prisma.rota.count({ where: { id: { startsWith: PREFIXO } } }),
  ])

  const semCoords = await prisma.ponto.count({
    where: {
      id: { startsWith: PREFIXO },
      status: "Pendente",
      OR: [{ latitude: null }, { longitude: null }],
    },
  })

  console.log("Seed de teste aplicado (registros `teste-*`):")
  console.log(`  projetos: ${projetos}`)
  console.log(`  ras:      ${ras}`)
  console.log(`  ums:      ${ums}`)
  console.log(`  tecnicos: ${tecnicos}`)
  console.log(`  pontos:   ${pontos}  (Pendentes sem coords: ${semCoords})`)
  console.log(`  rotas:    ${rotas}`)
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const deveLimpar = process.argv.includes("--limpar")
  if (deveLimpar) {
    await limpar()
    return
  }
  await semear()
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
