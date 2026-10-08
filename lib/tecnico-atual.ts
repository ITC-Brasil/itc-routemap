/**
 * Plano de escrita de `ums.tecnicoAtualId` — puro, sem banco.
 *
 * A coluna tem índice ÚNICO (Etapa 15.0): um técnico é dono de no máximo uma
 * UM. O Postgres checa o índice a cada UPDATE, não no fim da transação. Então
 * uma troca entre duas UMs (A: X→Y, B: Y→X) gravada na ordem ingênua falha no
 * primeiro UPDATE: gravar A=Y enquanto B ainda tem Y põe Y em duas UMs.
 *
 * A saída é zerar primeiro TODAS as UMs afetadas e só depois gravar os novos
 * valores. Zerar nunca viola o índice (Postgres aceita vários NULL em coluna
 * UNIQUE), e depois dele cada técnico novo só aparece uma vez.
 *
 * Este módulo só monta e valida o plano; quem aplica é lib/db/transicoes-ponto.ts,
 * dentro da transação. Separado para o teste da troca rodar sem Postgres.
 */

// ============================================================
// TIPOS
// ============================================================

/** Estado atual de uma UM no banco. */
export type UmTecnicoAtual = {
  umId: string
  umNome: string
  tecnicoAtualId: string | null
}

/** Valor que uma UM afetada deve ter ao fim da transação. */
export type AlvoTecnicoAtual = {
  umId: string
  tecnicoId: string | null
}

export type OperacaoTecnicoAtual = {
  umId: string
  tecnicoAtualId: string | null
}

export class ErroTecnicoAtual extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = "ErroTecnicoAtual"
  }
}

// ============================================================
// PLANO
// ============================================================

/**
 * Monta a sequência de UPDATEs para levar as UMs afetadas aos valores-alvo.
 *
 * @param ums   Todas as UMs do cadastro, com o valor atual da coluna.
 * @param alvos Valor final de cada UM afetada pela transação.
 * @param nomeTecnico Para mensagens de erro legíveis.
 * @returns     Operações na ordem em que devem ser aplicadas: primeiro os
 *              NULLs de todas as afetadas, depois os valores não nulos.
 *
 * @throws ErroTecnicoAtual quando o estado final violaria o índice único:
 *   - dois alvos com o mesmo técnico;
 *   - técnico-alvo que já é dono de uma UM que a transação NÃO mexe. Esse
 *     caso é um técnico em duas UMs ao mesmo tempo, e não um problema de
 *     ordem de escrita — nenhuma ordem resolve.
 */
export function planejarTecnicoAtual(
  ums: UmTecnicoAtual[],
  alvos: AlvoTecnicoAtual[],
  nomeTecnico: (id: string) => string = (id) => id
): OperacaoTecnicoAtual[] {
  const umPorId = new Map(ums.map((u) => [u.umId, u]))
  const afetadas = new Set(alvos.map((a) => a.umId))

  // Alvo duplicado entre UMs afetadas
  const umPorTecnicoAlvo = new Map<string, string>()
  for (const alvo of alvos) {
    if (!alvo.tecnicoId) continue
    const outra = umPorTecnicoAlvo.get(alvo.tecnicoId)
    if (outra) {
      throw new ErroTecnicoAtual(
        `${nomeTecnico(alvo.tecnicoId)} ficaria como técnico atual de ` +
          `${umPorId.get(outra)?.umNome ?? outra} e de ` +
          `${umPorId.get(alvo.umId)?.umNome ?? alvo.umId} ao mesmo tempo.`
      )
    }
    umPorTecnicoAlvo.set(alvo.tecnicoId, alvo.umId)
  }

  // Técnico-alvo que é dono de UM fora da transação
  for (const um of ums) {
    if (afetadas.has(um.umId) || !um.tecnicoAtualId) continue
    const destino = umPorTecnicoAlvo.get(um.tecnicoAtualId)
    if (destino) {
      throw new ErroTecnicoAtual(
        `${nomeTecnico(um.tecnicoAtualId)} já é o técnico atual de ${um.umNome} ` +
          `e não pode assumir ${umPorId.get(destino)?.umNome ?? destino} sem ` +
          `deixar ${um.umNome}. Inclua ${um.umNome} no mesmo lote ou cancele ` +
          "o lote que o colocou lá."
      )
    }
  }

  const zerar: OperacaoTecnicoAtual[] = alvos
    .filter((a) => umPorId.get(a.umId)?.tecnicoAtualId != null)
    .map((a) => ({ umId: a.umId, tecnicoAtualId: null }))

  const gravar: OperacaoTecnicoAtual[] = alvos
    .filter((a) => a.tecnicoId !== null)
    .map((a) => ({ umId: a.umId, tecnicoAtualId: a.tecnicoId }))

  return [...zerar, ...gravar]
}

// ============================================================
// CANDIDATOS DO CÁLCULO
// ============================================================

/** Técnico que ficou fora do cálculo, com o motivo. */
export type TecnicoForaDoLote<T> = {
  tecnico: T
  /** UM da qual ele é o técnico atual (e que não está no lote). */
  umNome: string
}

/**
 * Separa os técnicos que podem entrar no cálculo de rotas.
 *
 * Candidatos: técnicos que não são `tecnicoAtualId` de nenhuma UM, e os donos
 * das UMs que estão no lote. Fica de fora quem é o técnico atual de uma UM que
 * o lote não inclui: alocá-lo em outra UM o poria em duas ao mesmo tempo, e a
 * confirmação recusaria (`planejarTecnicoAtual`). Filtrar aqui evita oferecer
 * um resultado que não pode ser confirmado; a recusa na confirmação continua
 * como trava.
 *
 * @param umNomesNoLote Nomes das UMs selecionadas para o cálculo.
 */
export function separarCandidatos<T extends { id: string }>(
  tecnicos: T[],
  ums: { nome: string; tecnicoAtualId: string | null }[],
  umNomesNoLote: ReadonlySet<string>
): { candidatos: T[]; foraDoLote: TecnicoForaDoLote<T>[] } {
  const umDoTecnico = new Map<string, string>()
  for (const um of ums) {
    if (um.tecnicoAtualId) umDoTecnico.set(um.tecnicoAtualId, um.nome)
  }

  const candidatos: T[] = []
  const foraDoLote: TecnicoForaDoLote<T>[] = []
  for (const tecnico of tecnicos) {
    const umNome = umDoTecnico.get(tecnico.id)
    if (umNome === undefined || umNomesNoLote.has(umNome)) {
      candidatos.push(tecnico)
    } else {
      foraDoLote.push({ tecnico, umNome })
    }
  }
  return { candidatos, foraDoLote }
}
