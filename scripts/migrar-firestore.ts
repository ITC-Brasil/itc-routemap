/**
 * Migração de dados Firestore → Postgres.
 *
 * DRY-RUN POR DEFAULT: sem `--gravar`, apenas lê o Firestore, monta o
 * mapeamento e imprime o relatório. Nada é escrito no Postgres.
 *
 * SOMENTE LEITURA NO FIRESTORE: este arquivo usa exclusivamente
 * `collection(...).get()`. Não há nenhum `set`/`update`/`delete`/`batch` —
 * propriedade verificável por grep.
 *
 * IDs PRESERVADOS: os doc ids do Firestore entram como `id` no Postgres. O
 * schema define `String @id @default(cuid())`, e o default só se aplica quando
 * o valor não é fornecido. Isso mantém todos os vínculos cruzados
 * (Um.projetoId, Um.tecnicoAtualId, Um.raAtualId, Ponto.projetoId,
 * Rota.tecnicoId, Rota.pontoId, Rota.projetoId, Rota.realocadaDe) sem tabela de
 * remapeamento. Os `hashMd5`, porém, são todos recalculados: `linhaOrigem` saiu
 * do hash, então os valores gravados no Firestore têm um campo a mais.
 *
 * Uso:
 *   npx tsx scripts/migrar-firestore.ts                  # dry-run (default)
 *   npx tsx scripts/migrar-firestore.ts --gravar         # grava no Postgres
 *   npx tsx scripts/migrar-firestore.ts --gravar --forcar-conflitos
 *
 * Credencial: GOOGLE_SERVICE_ACCOUNT_BASE64 (a MESMA que o antigo
 * lib/firebase-admin.ts usava, e que hoje serve o Google Sheets; project_id
 * confere com NEXT_PUBLIC_FIREBASE_PROJECT_ID).
 */

import "dotenv/config"
import crypto from "crypto"
import { config as carregarEnv } from "dotenv"
import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { PrismaClient } from "@prisma/client"

// .env.local tem a credencial em dev; o .env já veio pelo import acima.
carregarEnv({ path: ".env.local" })

const prisma = new PrismaClient()

const GRAVAR = process.argv.includes("--gravar")
const FORCAR_CONFLITOS = process.argv.includes("--forcar-conflitos")

/**
 * Convites NÃO são migrados por este script.
 *
 * Motivo (decisão do usuário): o vocabulário de status é invertido entre os dois
 * sistemas — no Firestore "ativo" significa JÁ CONSUMIDO, e no Postgres
 * significa AINDA VÁLIDO. Quem tem "ativo" no Firestore tem conta no Firebase
 * Auth mas NÃO tem conta no Postgres; se o convite dessa pessoa for migrado
 * como "consumido", ela fica trancada fora do sistema na virada.
 * A decisão é por pessoa, feita pelo usuário a partir da lista que o dry-run
 * imprime. Este script apenas RELATA os convites.
 */
const MIGRAR_CONVITES = false

/**
 * CONSOLIDAÇÃO DE PROJETOS (decisão de domínio do usuário, 2026-07-28).
 *
 * O Firestore tem 7 documentos em `projetos`, mas o domínio real são **3
 * projetos**: criaram um "projeto" por ABA da planilha em vez de um projeto com
 * `sheetAbas[]` múltiplas. Não são duplicatas e nada é descartado — os
 * secundários deixam de existir como Projeto e suas abas/pontos/rotas/UMs
 * passam para o canônico da sigla.
 *
 * Canônico = o de `criadoEm` mais antigo de cada sigla (verificado no Firestore;
 * `sheetId`/`sheetUrl` são idênticos dentro de cada sigla, confirmando que é a
 * mesma planilha).
 */
const CANONICO_POR_SIGLA: Record<string, string> = {
  BSBIA: "KMPN6GsZS9VumMjPGTLG", // criadoEm 2026-05-26 20:49:40
  SPV: "J44DXkY1jNE9Z1oZ31eu", // criadoEm 2026-06-30 20:07:09
  CODHAB: "nfv4FP9dPwS4JsaRffVT", // único da sigla
}

/**
 * Pontos cujo `projetoId` não existe em `projetos` (projeto deletado no
 * Firestore). Ficam FORA da migração por default, aguardando decisão do
 * usuário. Passe `--incluir-orfaos` para migrá-los.
 */
const INCLUIR_ORFAOS = process.argv.includes("--incluir-orfaos")

/**
 * Vocabulário de status: planilha/Firestore → app. Mapeamento 1:1 confirmado
 * com o cliente em 2026-07-28 — o MESMO de `normalizarStatus` em
 * `app/api/sincronizar/route.ts` (mantenha os dois em sincronia):
 *
 *   Pendente   → Pendente    aguardando nova alocação
 *   Atual      → Agendado    em andamento, técnico atribuído
 *   Histórico  → Histórico    ciclo encerrado
 *
 * "Atual" NÃO vira "Histórico" — isso apagaria a atribuição corrente.
 */
const TRADUCAO_STATUS: Record<string, string> = {
  atual: "Agendado",
  pendente: "Pendente",
  historico: "Histórico",
}

function traduzirStatus(original: string): string {
  const chave = original
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
  return TRADUCAO_STATUS[chave] ?? original
}

// ============================================================
// RELATÓRIO
// ============================================================

type LinhaRelatorio = {
  colecao: string
  lidos: number
  mapeados: number
  ignorados: number
  gravados: number | null
}

const relatorio: LinhaRelatorio[] = []
const conflitos: string[] = []
const avisos: string[] = []

// ============================================================
// HELPERS
// ============================================================

/** Firestore Timestamp → Date. Aceita null/undefined e Date já convertido. */
function paraData(v: unknown): Date | null {
  if (!v) return null
  if (v instanceof Timestamp) return v.toDate()
  if (v instanceof Date) return v
  // Formato serializado { _seconds, _nanoseconds }
  if (typeof v === "object" && v !== null && "_seconds" in v) {
    return new Date((v as { _seconds: number })._seconds * 1000)
  }
  return null
}

function texto(v: unknown, padrao = ""): string {
  return typeof v === "string" ? v : padrao
}

function numero(v: unknown, padrao = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : padrao
}

function numeroOuNulo(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function booleano(v: unknown, padrao: boolean): boolean {
  return typeof v === "boolean" ? v : padrao
}

/**
 * Cópia fiel de `calcularHashPonto` (lib/db/pontos.ts) — 12 campos, separador
 * "|", md5. Replicada porque `lib/db/*` tem `import "server-only"` e não pode
 * ser carregado por script Node.
 *
 * Aplicada a TODOS os pontos: nenhum hash do Firestore serve mais, porque foram
 * calculados com `linhaOrigem` incluído (13 campos) e esse campo saiu do hash.
 */
function calcularHashPonto(p: {
  projetoId: string
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
    p.projetoId,
    p.ciclo,
    p.etapa,
    p.tecnicoNomeHistorico,
    p.umNome,
    p.raNome,
    p.uf,
    p.plusCode,
    p.endereco,
    p.referencia,
    p.linkMaps,
    p.status,
  ].join("|")
  return crypto.createHash("md5").update(chave).digest("hex")
}

// ============================================================
// LEITURA DO FIRESTORE (somente leitura)
// ============================================================

function iniciarFirestore() {
  const base64 = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64
  if (!base64) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_BASE64 não está no ambiente (.env.local ou .env.docker)."
    )
  }
  const credencial = JSON.parse(Buffer.from(base64, "base64").toString("utf8"))
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: credencial.project_id,
        clientEmail: credencial.client_email,
        privateKey: credencial.private_key,
      }),
    })
  }
  console.log(`Firestore: projeto ${credencial.project_id} (somente leitura)\n`)
  return getFirestore()
}

type DocFirestore = Record<string, unknown> & { id: string }

async function lerColecao(
  db: ReturnType<typeof getFirestore>,
  nome: string
): Promise<DocFirestore[]> {
  const snap = await db.collection(nome).get()
  return snap.docs.map((d) => ({
    ...(d.data() as Record<string, unknown>),
    id: d.id,
  }))
}

// ============================================================
// MAPEAMENTO POR ENTIDADE
// ============================================================

function mapProjeto(d: Record<string, unknown> & { id: string }) {
  return {
    id: d.id,
    nome: texto(d.nome),
    sigla: texto(d.sigla),
    cor: texto(d.cor, "#008F95"),
    // `ativo` não existe no Firestore — assumido true (campo novo do Postgres)
    ativo: booleano(d.ativo, true),
    sheetId: texto(d.sheetId),
    sheetUrl: texto(d.sheetUrl),
    sheetAbas: Array.isArray(d.sheetAbas) ? (d.sheetAbas as string[]) : [],
    ultimaSincronizacao: paraData(d.ultimaSincronizacao),
    criadoEm: paraData(d.criadoEm) ?? new Date(),
  }
}

function mapRa(d: Record<string, unknown> & { id: string }) {
  return {
    id: d.id,
    // RENOMEAÇÃO: Firestore `nomeCidade` → Postgres `nome` (que é @unique)
    nome: texto(d.nomeCidade) || texto(d.nome),
    cor: texto(d.cor, "#008F95"),
    criadoEm: paraData(d.criadoEm) ?? new Date(),
  }
}

function mapTecnico(d: Record<string, unknown> & { id: string }) {
  return {
    id: d.id,
    nome: texto(d.nome),
    cor: texto(d.cor, "#008F95"),
    endereco: texto(d.endereco),
    // No Firestore eram string vazia; no Postgres são nullable. Mantemos ""
    // para não alterar o que a UI já exibia.
    pontoReferencia: texto(d.pontoReferencia),
    plusCode: texto(d.plusCode),
    latitude: numeroOuNulo(d.latitude),
    longitude: numeroOuNulo(d.longitude),
    modoPrincipal: typeof d.modoPrincipal === "string" ? d.modoPrincipal : null,
    ativo: booleano(d.ativo, true),
    criadoEm: paraData(d.criadoEm) ?? new Date(),
  }
}

function mapUm(d: Record<string, unknown> & { id: string }) {
  return {
    id: d.id,
    nome: texto(d.nome),
    cor: texto(d.cor, "#008F95"),
    projetoId: texto(d.projetoId),
    tecnicoAtualId: typeof d.tecnicoAtualId === "string" ? d.tecnicoAtualId : null,
    raAtualId: typeof d.raAtualId === "string" ? d.raAtualId : null,
    criadoEm: paraData(d.criadoEm) ?? new Date(),
  }
}

function mapPonto(d: Record<string, unknown> & { id: string }) {
  return {
    id: d.id,
    projetoId: texto(d.projetoId),
    // raId não existe no Firestore (campo novo); o app usa raNome
    raId: null as string | null,
    linhaOrigem: numero(d.linhaOrigem),
    umNome: texto(d.umNome),
    raNome: texto(d.raNome),
    ciclo: numero(d.ciclo),
    etapa: numero(d.etapa),
    tecnicoNomeHistorico: texto(d.tecnicoNomeHistorico),
    uf: texto(d.uf),
    endereco: texto(d.endereco),
    referencia: texto(d.referencia),
    plusCode: texto(d.plusCode),
    linkMaps: texto(d.linkMaps),
    latitude: numeroOuNulo(d.latitude),
    longitude: numeroOuNulo(d.longitude),
    // Traduz o vocabulário da planilha/Firestore para o do app:
    // Atual → Agendado, Pendente e Histórico inalterados (ver TRADUCAO_STATUS).
    status: traduzirStatus(texto(d.status, "Pendente")),
    // Placeholder: sobrescrito para todos os pontos mais adiante, porque nenhum
    // hash do Firestore é válido depois de `linhaOrigem` sair do hash.
    hashMd5: texto(d.hashMd5),
    // tecnicoId/rotaId não existem no Firestore — reconstruídos depois, a partir
    // das rotas Confirmadas (ver reconstruirVinculoPontoRota)
    tecnicoId: null as string | null,
    rotaId: null as string | null,
    criadoEm: paraData(d.criadoEm) ?? new Date(),
  }
}

function mapRota(
  d: Record<string, unknown> & { id: string },
  siglaPorProjeto: Map<string, string>
) {
  const origem = (d.origem ?? {}) as Record<string, unknown>
  const destino = (d.destino ?? {}) as Record<string, unknown>
  return {
    id: d.id,
    loteId: texto(d.loteId),
    loteOrdem: numero(d.loteOrdem),
    loteJustificativa: texto(d.loteJustificativa),
    // Rotas pré-13.11 não têm origemDecisao
    origemDecisao: texto(d.origemDecisao, "auto"),
    tecnicoId: texto(d.tecnicoId),
    tecnicoNome: texto(d.tecnicoNome),
    pontoId: texto(d.pontoId),
    umNome: texto(d.umNome),
    projetoId: texto(d.projetoId),
    // projetoSigla é campo novo do Postgres — derivado do Projeto
    projetoSigla: siglaPorProjeto.get(texto(d.projetoId)) ?? "",
    // ACHATAMENTO: objeto aninhado no Firestore → colunas no Postgres
    origemEndereco: texto(origem.endereco),
    origemLatitude: numero(origem.latitude),
    origemLongitude: numero(origem.longitude),
    destinoEndereco: texto(destino.endereco),
    destinoLatitude: numero(destino.latitude),
    destinoLongitude: numero(destino.longitude),
    metricas: (d.metricas ?? {}) as object,
    modoPrincipal: texto(d.modoPrincipal, "DRIVE"),
    status: texto(d.status, "Sugerida"),
    realocadaDe: typeof d.realocadaDe === "string" ? d.realocadaDe : null,
    criadoEm: paraData(d.criadoEm) ?? new Date(),
  }
}

// ============================================================
// PRÉ-CHECAGENS
// ============================================================

function checarDuplicatas(
  entidade: string,
  campo: string,
  itens: Array<Record<string, unknown>>
) {
  const vistos = new Map<string, string[]>()
  for (const i of itens) {
    const valor = String(i[campo] ?? "").trim().toLowerCase()
    if (!valor) {
      conflitos.push(`${entidade}: id=${i.id} com "${campo}" VAZIO`)
      continue
    }
    vistos.set(valor, [...(vistos.get(valor) ?? []), String(i.id)])
  }
  for (const [valor, ids] of vistos) {
    if (ids.length > 1) {
      conflitos.push(
        `${entidade}: "${campo}" duplicado (${valor}) em ${ids.length} registros — @unique no Postgres: ${ids.join(", ")}`
      )
    }
  }
}

async function checarIdsJaExistentes(
  entidade: string,
  ids: string[],
  contar: (ids: string[]) => Promise<number>
) {
  if (ids.length === 0) return
  const n = await contar(ids)
  if (n > 0) {
    avisos.push(
      `${entidade}: ${n} id(s) já existem no Postgres — o upsert vai ATUALIZAR esses registros`
    )
  }
}

// ============================================================
// GRAVAÇÃO (só com --gravar)
// ============================================================

async function gravarEntidade<T extends { id: string }>(
  nome: string,
  itens: T[],
  upsert: (item: T) => Promise<unknown>
): Promise<number> {
  if (!GRAVAR) return 0
  // Uma transação por entidade: tudo-ou-nada por coleção.
  // A forma com ARRAY não aceita `timeout` (só `isolationLevel`) — o volume aqui
  // é pequeno (centenas de linhas), então o default basta.
  await prisma.$transaction(itens.map((i) => upsert(i) as never))
  return itens.length
}

/**
 * Vínculo Ponto↔Rota, com CHECAGEM DE ALINHAMENTO planilha × app.
 *
 * A migração pressupõe que a planilha e o app estejam alinhados: cada ponto
 * "Atual" (→ "Agendado") deve ser exatamente um dos pontos referenciados por uma
 * rota "Confirmada". Quando o passo manual do ciclo está pendente (a rota foi
 * confirmada no app mas a planilha ainda não foi marcada), os dois conjuntos
 * divergem — foi o que o dry-run de 2026-07-28 encontrou: 7 "Atual" e 7 pontos
 * de rotas, com apenas 3 em comum.
 *
 * Comportamento:
 * - ALINHADOS (conjuntos idênticos) → reconstrói `rotaId`/`tecnicoId` pela rota
 *   Confirmada mais recente de cada ponto. "Agendado" sem rota seria incoerente.
 * - DIVERGENTES → NÃO reconstrói nada e registra a diferença como CONFLITO, o
 *   que bloqueia a gravação. Alinhar a fonte (planilha) e rodar de novo.
 */
function analisarVinculo(
  rotas: ReturnType<typeof mapRota>[],
  pontos: ReturnType<typeof mapPonto>[]
) {
  const idsPontos = new Set(pontos.map((p) => p.id))
  const agendados = new Set(pontos.filter((p) => p.status === "Agendado").map((p) => p.id))
  const confirmadas = rotas.filter((r) => r.status === "Confirmada")
  const aplicaveis = confirmadas.filter((r) => idsPontos.has(r.pontoId))
  const pontosDeRotas = new Set(aplicaveis.map((r) => r.pontoId))

  const soAgendado = [...agendados].filter((id) => !pontosDeRotas.has(id))
  const soRota = [...pontosDeRotas].filter((id) => !agendados.has(id))
  const alinhado = soAgendado.length === 0 && soRota.length === 0

  if (!alinhado) {
    conflitos.push(
      `DESALINHAMENTO planilha × app: ${agendados.size} ponto(s) "Agendado" (era "Atual") x ${pontosDeRotas.size} ponto(s) com rota Confirmada — ${soAgendado.length} só Agendado, ${soRota.length} só em rota`
    )
    const descreve = (id: string) => {
      const p = pontos.find((x) => x.id === id)
      return p ? `${id} um=${p.umNome} ${p.raNome} c${p.ciclo}/e${p.etapa} status=${p.status}` : id
    }
    for (const id of soAgendado) conflitos.push(`  Agendado SEM rota Confirmada: ${descreve(id)}`)
    for (const id of soRota) conflitos.push(`  em rota Confirmada mas NÃO Agendado: ${descreve(id)}`)
    avisos.push(
      "Vínculo Ponto↔Rota NÃO reconstruído: a planilha e o app estão desalinhados (passo manual do ciclo pendente). Alinhe a planilha e rode o dry-run de novo."
    )
    return []
  }

  // Alinhado: um ponto pode ter várias rotas Confirmadas ao longo do tempo;
  // vale a mais recente, que é o estado atual.
  const porPonto = new Map<string, (typeof aplicaveis)[number]>()
  for (const r of aplicaveis) {
    const atual = porPonto.get(r.pontoId)
    if (!atual || r.criadoEm.getTime() > atual.criadoEm.getTime()) porPonto.set(r.pontoId, r)
  }
  const escolhidas = [...porPonto.values()]
  avisos.push(
    `Vínculo Ponto↔Rota: planilha e app ALINHADOS — ${escolhidas.length} ponto(s) Agendado recebem rotaId/tecnicoId (rota Confirmada mais recente)`
  )
  return escolhidas
}

/** Grava o vínculo já analisado. Roda DEPOIS de pontos e rotas existirem. */
async function gravarVinculo(escolhidas: ReturnType<typeof mapRota>[]) {
  if (!GRAVAR || escolhidas.length === 0) return escolhidas.length
  await prisma.$transaction(
    escolhidas.map((r) =>
      prisma.ponto.update({
        where: { id: r.pontoId },
        data: { tecnicoId: r.tecnicoId, rotaId: r.id },
      })
    )
  )
  return escolhidas.length
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("=".repeat(72))
  console.log(
    GRAVAR
      ? "MODO: GRAVAÇÃO (--gravar) — vai escrever no Postgres"
      : "MODO: DRY-RUN (default) — nada será escrito no Postgres"
  )
  console.log("=".repeat(72) + "\n")

  const db = iniciarFirestore()

  // ---------- leitura ----------
  const [projetosRaw, rasRaw, tecnicosRaw, umsRaw, pontosRaw, rotasRaw, convitesRaw] =
    await Promise.all([
      lerColecao(db, "projetos"),
      lerColecao(db, "ras"),
      lerColecao(db, "tecnicos"),
      lerColecao(db, "ums"),
      lerColecao(db, "pontos"),
      lerColecao(db, "rotas"),
      lerColecao(db, "convites"),
    ])

  // ---------- CONSOLIDAÇÃO: 7 documentos de projeto → 3 projetos ----------
  const todosProjetos = projetosRaw.map(mapProjeto)

  // id de qualquer documento -> id canônico da sua sigla
  const paraCanonico = new Map<string, string>()
  for (const p of todosProjetos) {
    const canonico = CANONICO_POR_SIGLA[p.sigla]
    if (!canonico) {
      conflitos.push(
        `Projeto ${p.id}: sigla "${p.sigla}" não tem canônico definido em CANONICO_POR_SIGLA`
      )
      continue
    }
    paraCanonico.set(p.id, canonico)
  }
  const remapear = (id: string) => paraCanonico.get(id) ?? id

  // Canônico recebe a UNIÃO dos sheetAbas de todos os documentos da sigla
  const projetos = todosProjetos
    .filter((p) => CANONICO_POR_SIGLA[p.sigla] === p.id)
    .map((canon) => {
      const irmaos = todosProjetos.filter((p) => p.sigla === canon.sigla)
      const abas = [...new Set(irmaos.flatMap((p) => p.sheetAbas))].sort()
      const sheetIds = new Set(irmaos.map((p) => p.sheetId))
      const sheetUrls = new Set(irmaos.map((p) => p.sheetUrl))
      if (sheetIds.size > 1 || sheetUrls.size > 1) {
        conflitos.push(
          `Sigla ${canon.sigla}: sheetId/sheetUrl DIVERGEM entre os documentos — consolidação insegura`
        )
      }
      // Mantém a sincronização mais recente entre os irmãos
      const ultima = irmaos
        .map((p) => p.ultimaSincronizacao)
        .filter((d): d is Date => d instanceof Date)
        .sort((a, b) => b.getTime() - a.getTime())[0]
      return { ...canon, sheetAbas: abas, ultimaSincronizacao: ultima ?? null }
    })

  const naoCanonicos = todosProjetos.filter((p) => CANONICO_POR_SIGLA[p.sigla] !== p.id)
  avisos.push(
    `Consolidação: ${todosProjetos.length} documentos de projeto → ${projetos.length} projetos; ${naoCanonicos.length} não-canônicos não são migrados como Projeto`
  )

  const ras = rasRaw.map(mapRa)
  const tecnicos = tecnicosRaw.map(mapTecnico)

  // ---------- remapeamento para o canônico ----------
  const ums = umsRaw.map(mapUm).map((u) => ({ ...u, projetoId: remapear(u.projetoId) }))

  const idsProjetosOriginais = new Set(todosProjetos.map((p) => p.id))
  let hashesRecalculados = 0
  let orfaosDescartados = 0

  const statusTraduzidos = pontosRaw.filter(
    (p) => traduzirStatus(texto(p.status, "Pendente")) !== texto(p.status, "Pendente")
  ).length

  const pontos = pontosRaw
    .map(mapPonto)
    .filter((p) => {
      const conhecido = idsProjetosOriginais.has(p.projetoId)
      if (!conhecido && !INCLUIR_ORFAOS) {
        orfaosDescartados++
        return false
      }
      return true
    })
    .map((p) => {
      // Hash recalculado SEMPRE: `linhaOrigem` saiu do hash em 2026-07-30 (junto
      // com a troca da identidade por posição de linha pela chave natural), então
      // TODO hash vindo do Firestore está obsoleto — inclui um campo a mais.
      // Antes desta mudança só os pontos remapeados ou com status traduzido
      // precisavam recalcular.
      hashesRecalculados++
      const atualizado = { ...p, projetoId: remapear(p.projetoId) }
      return { ...atualizado, hashMd5: calcularHashPonto(atualizado) }
    })

  const siglaPorProjeto = new Map(projetos.map((p) => [p.id, p.sigla]))
  const rotas = rotasRaw
    .map((r) => mapRota(r, siglaPorProjeto))
    .map((r) => {
      const novoProjetoId = remapear(r.projetoId)
      return {
        ...r,
        projetoId: novoProjetoId,
        projetoSigla: siglaPorProjeto.get(novoProjetoId) ?? r.projetoSigla,
      }
    })

  if (orfaosDescartados > 0) {
    avisos.push(
      `Pontos órfãos NÃO migrados: ${orfaosDescartados} (projeto inexistente no Firestore). Use --incluir-orfaos para migrar.`
    )
  }
  avisos.push(
    `hashMd5 recalculados: ${hashesRecalculados} (todos — linhaOrigem saiu do hash)`
  )
  avisos.push(
    `Status traduzido (Atual→Agendado): ${statusTraduzidos} ponto(s) no Firestore`
  )

  // ---------- pré-checagens (já sobre os dados consolidados) ----------
  checarDuplicatas("Projeto", "sigla", projetos)
  checarDuplicatas("Ra", "nome", ras)

  // Vocabulário de status dos pontos vs. o que o app novo entende
  const STATUS_CONHECIDOS = ["Pendente", "Agendado", "Histórico"]
  const statusDesconhecidos = new Map<string, number>()
  for (const p of pontos) {
    if (!STATUS_CONHECIDOS.includes(p.status)) {
      statusDesconhecidos.set(p.status, (statusDesconhecidos.get(p.status) ?? 0) + 1)
    }
  }
  for (const [st, n] of statusDesconhecidos) {
    avisos.push(
      `Ponto.status "${st}" (${n} pontos) NÃO é reconhecido pelo app novo (espera ${STATUS_CONHECIDOS.join("/")}) — preservado como está, aguarda decisão de mapeamento`
    )
  }

  const idsProjetos = new Set(projetos.map((p) => p.id))
  const idsTecnicos = new Set(tecnicos.map((t) => t.id))
  const idsRas = new Set(ras.map((r) => r.id))
  const idsPontos = new Set(pontos.map((p) => p.id))

  for (const u of ums) {
    if (u.projetoId && !idsProjetos.has(u.projetoId))
      conflitos.push(`Um ${u.id}: projetoId "${u.projetoId}" não existe em projetos`)
    if (u.tecnicoAtualId && !idsTecnicos.has(u.tecnicoAtualId))
      avisos.push(`Um ${u.id}: tecnicoAtualId órfão`)
    if (u.raAtualId && !idsRas.has(u.raAtualId))
      avisos.push(`Um ${u.id}: raAtualId órfão`)
  }
  for (const p of pontos) {
    if (p.projetoId && !idsProjetos.has(p.projetoId))
      conflitos.push(`Ponto ${p.id}: projetoId "${p.projetoId}" não existe`)
  }
  let rotasSemSigla = 0
  for (const r of rotas) {
    if (!r.projetoSigla) rotasSemSigla++
    if (r.tecnicoId && !idsTecnicos.has(r.tecnicoId))
      avisos.push(`Rota ${r.id}: tecnicoId órfão (histórico preserva o snapshot tecnicoNome)`)
  }
  if (rotasSemSigla > 0)
    avisos.push(`Rotas sem projetoSigla derivável: ${rotasSemSigla} (projeto ausente)`)

  await checarIdsJaExistentes("Projeto", [...idsProjetos], (ids) =>
    prisma.projeto.count({ where: { id: { in: ids } } })
  )
  await checarIdsJaExistentes("Ponto", [...idsPontos], (ids) =>
    prisma.ponto.count({ where: { id: { in: ids } } })
  )

  // Checagem de alinhamento planilha × app ANTES do bloqueio: um desalinhamento
  // é conflito e deve impedir a gravação.
  const vinculoEscolhido = analisarVinculo(rotas, pontos)

  const bloqueado = conflitos.length > 0 && !FORCAR_CONFLITOS
  if (GRAVAR && bloqueado) {
    console.log("CONFLITOS encontrados — gravação ABORTADA (use --forcar-conflitos para ignorar):")
    for (const c of conflitos) console.log("  ✗ " + c)
    return
  }

  // ---------- gravação (na ordem de dependência) ----------
  const gProjetos = await gravarEntidade("projetos", projetos, (p) =>
    prisma.projeto.upsert({ where: { id: p.id }, update: p, create: p })
  )
  const gRas = await gravarEntidade("ras", ras, (r) =>
    prisma.ra.upsert({ where: { id: r.id }, update: r, create: r })
  )
  const gTecnicos = await gravarEntidade("tecnicos", tecnicos, (t) =>
    prisma.tecnico.upsert({ where: { id: t.id }, update: t, create: t })
  )
  const gUms = await gravarEntidade("ums", ums, (u) =>
    prisma.um.upsert({ where: { id: u.id }, update: u, create: u })
  )
  const gPontos = await gravarEntidade("pontos", pontos, (p) =>
    prisma.ponto.upsert({ where: { id: p.id }, update: p, create: p })
  )
  const gRotas = await gravarEntidade("rotas", rotas, (r) =>
    prisma.rota.upsert({
      where: { id: r.id },
      update: r as never,
      create: r as never,
    })
  )
  const vinculos = await gravarVinculo(vinculoEscolhido)

  relatorio.push(
    { colecao: "projetos", lidos: projetosRaw.length, mapeados: projetos.length, ignorados: 0, gravados: GRAVAR ? gProjetos : null },
    { colecao: "ras", lidos: rasRaw.length, mapeados: ras.length, ignorados: 0, gravados: GRAVAR ? gRas : null },
    { colecao: "tecnicos", lidos: tecnicosRaw.length, mapeados: tecnicos.length, ignorados: 0, gravados: GRAVAR ? gTecnicos : null },
    { colecao: "ums", lidos: umsRaw.length, mapeados: ums.length, ignorados: 0, gravados: GRAVAR ? gUms : null },
    { colecao: "pontos", lidos: pontosRaw.length, mapeados: pontos.length, ignorados: 0, gravados: GRAVAR ? gPontos : null },
    { colecao: "rotas", lidos: rotasRaw.length, mapeados: rotas.length, ignorados: 0, gravados: GRAVAR ? gRotas : null },
    { colecao: "convites", lidos: convitesRaw.length, mapeados: 0, ignorados: convitesRaw.length, gravados: MIGRAR_CONVITES ? 0 : null }
  )

  // ---------- relatório ----------
  console.log("CONTAGEM POR COLEÇÃO")
  console.log("  colecao      lidos  mapeados  gravados")
  for (const l of relatorio) {
    console.log(
      `  ${l.colecao.padEnd(12)} ${String(l.lidos).padStart(5)} ${String(l.mapeados).padStart(9)} ${String(l.gravados ?? "-").padStart(9)}`
    )
  }

  console.log(
    `\nVÍNCULO Ponto↔Rota: ${vinculos} ponto(s) Agendado com rotaId/tecnicoId reconstruídos`
  )

  // ---------- detalhe da consolidação ----------
  console.log("\nPROJETOS CANÔNICOS (resultado da consolidação)")
  for (const p of projetos) {
    const nPontos = pontos.filter((x) => x.projetoId === p.id).length
    const nRotas = rotas.filter((x) => x.projetoId === p.id).length
    const nUms = ums.filter((u) => u.projetoId === p.id).length
    console.log(`  ${p.sigla}`)
    console.log(`    id        : ${p.id}`)
    console.log(`    sheetId   : ${p.sheetId}`)
    console.log(`    sheetAbas : ${JSON.stringify(p.sheetAbas)}`)
    console.log(`    pontos=${nPontos}  rotas=${nRotas}  ums=${nUms}`)
  }

  console.log("\n  documentos NÃO-canônicos (deixam de existir como Projeto):")
  for (const p of naoCanonicos) {
    console.log(
      `    ${p.id}  sigla=${p.sigla.padEnd(7)} abas=${JSON.stringify(p.sheetAbas)} → canônico ${remapear(p.id)}`
    )
  }

  console.log("\nUMs (7) COM projetoId REMAPEADO")
  console.log("  id                       nome         projetoId (canônico)     sigla")
  for (const u of [...ums].sort((a, b) => a.nome.localeCompare(b.nome))) {
    console.log(
      `  ${u.id.padEnd(24)} ${u.nome.padEnd(12)} ${u.projetoId.padEnd(24)} ${siglaPorProjeto.get(u.projetoId) ?? "?"}`
    )
  }

  console.log(`\nCONFLITOS (bloqueiam a gravação): ${conflitos.length}`)
  for (const c of conflitos.slice(0, 40)) console.log("  ✗ " + c)
  if (conflitos.length > 40) console.log(`  ... e mais ${conflitos.length - 40}`)

  console.log(`\nAVISOS (não bloqueiam): ${avisos.length}`)
  for (const a of avisos.slice(0, 25)) console.log("  ! " + a)
  if (avisos.length > 25) console.log(`  ... e mais ${avisos.length - 25}`)

  // ---------- convites: lista para decisão manual ----------
  console.log("\n" + "=".repeat(72))
  console.log("CONVITES — NÃO MIGRADOS (aguardam decisão por linha)")
  console.log("  Atenção ao vocabulário invertido:")
  console.log('    Firestore "pendente" = ainda NAO consumido  -> Postgres "ativo"')
  console.log('    Firestore "ativo"    = JA consumido          -> Postgres "consumido"')
  console.log("  Quem tem \"ativo\" no Firestore tem conta no Firebase Auth mas NAO no")
  console.log("  Postgres: se vier como \"consumido\", fica sem acesso na virada.")
  console.log("=".repeat(72))
  console.log("  email                                     status(FS)   criadoEm     expiraEm")
  const convitesOrdenados = [...convitesRaw].sort((a, b) =>
    texto(a.email).localeCompare(texto(b.email))
  )
  for (const c of convitesOrdenados) {
    const criado = paraData(c.criadoEm)
    const expira = paraData(c.expiraEm)
    const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—")
    console.log(
      `  ${texto(c.email).padEnd(41)} ${texto(c.status, "?").padEnd(12)} ${fmt(criado).padEnd(12)} ${fmt(expira)}`
    )
  }

  if (!GRAVAR) {
    console.log("\nDRY-RUN concluído — nada foi escrito. Use --gravar para persistir.")
  }
}

main()
  .catch((err) => {
    console.error("FALHA:", err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
