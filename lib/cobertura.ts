/**
 * Cobertura UM ↔ técnico — a pergunta que o sistema não sabia responder.
 *
 * O emparelhamento é 1:1 rígido: toda UM em operação tem exatamente um
 * técnico, e todo técnico tem no máximo uma UM. Até aqui isso era só
 * combinado — nada no código media, e a única forma de saber era abrir o
 * histórico e conferir lote por lote.
 *
 * Este módulo é a régua. Puro de propósito: recebe o cadastro e o
 * emparelhamento vigente e devolve o diagnóstico, sem tocar banco nem rede.
 * A consulta que alimenta isso vive em `lib/db/cobertura.ts`; a rotação da
 * Etapa 15 precisa das duas coisas separadas, porque o motor de rotação também
 * vai avaliar hipóteses que ainda não estão no banco.
 *
 * ONDE MORA O EMPARELHAMENTO HOJE: em `pontos`, não em `ums`. A coluna
 * `ums.tecnicoAtualId` existe desde a migração do Firestore e está inerte —
 * `criarUM` grava `null`, nenhum fluxo do app escreve nela. Quem mantém o
 * vínculo são as transações de confirmar e cancelar alocação, que ligam e
 * desligam `ponto.status = "Agendado"` com `ponto.tecnicoId`.
 *
 * A LIGAÇÃO É POR NOME. `pontos.umNome` é texto, não referência a `ums.id` —
 * é assim em todo o sistema (ver `obterDestinosPorUM`). Por isso existe
 * `paresForaDoCadastro`: um ponto agendado cujo `umNome` não casa com nenhuma
 * linha de `ums` não é descartado em silêncio, porque seria uma UM sendo
 * operada sem o cadastro saber.
 */

// ============================================================
// TIPOS
// ============================================================

/** Um vínculo UM ↔ técnico em vigor, lido dos pontos agendados. */
export type ParVigente = {
  /** Nome da UM como está gravado no ponto. */
  umNome: string
  tecnicoId: string
  tecnicoNome: string
}

/** Uma UM do cadastro, com o contexto do projeto dela. */
export type UmCadastrada = {
  id: string
  nome: string
  projetoId: string
  projetoSigla: string
  /**
   * `false` quando o projeto está inativo ou não existe mais (o vínculo é por
   * id, sem foreign key). Não filtra nada aqui: `ums` não tem coluna `ativo`,
   * e esconder uma UM do diagnóstico por causa da flag do projeto é
   * exatamente como uma UM descoberta passa despercebida. Quem exibe decide
   * como apresentar.
   */
  projetoAtivo: boolean
}

export type TecnicoDisponivel = {
  id: string
  nome: string
}

export type Cobertura = {
  /** Instante da medição — o diagnóstico vale para um momento, não para sempre. */
  medidoEm: Date
  /** Emparelhamento vigente, um item por par distinto (UM, técnico). */
  pares: ParVigente[]
  /** UMs do cadastro sem nenhum técnico agendado. O alerta vermelho da 15.6. */
  umsSemTecnico: UmCadastrada[]
  /** Técnicos ativos sem nenhuma UM. São os candidatos naturais da rotação. */
  tecnicosSemUm: TecnicoDisponivel[]
  /** Violação do 1:1: a mesma UM com técnicos diferentes agendados. */
  umsComMaisDeUmTecnico: { umNome: string; tecnicos: string[] }[]
  /** Violação do 1:1: o mesmo técnico agendado em UMs diferentes. */
  tecnicosComMaisDeUmaUm: {
    tecnicoId: string
    tecnicoNome: string
    ums: string[]
  }[]
  /** Pares cujo `umNome` não existe em `ums`. Ver nota sobre ligação por nome. */
  paresForaDoCadastro: ParVigente[]
  /** Verdadeiro só quando nada acima aponta problema. */
  invarianteOk: boolean
}

export type EntradaCobertura = {
  ums: UmCadastrada[]
  /** Somente técnicos ativos: um técnico inativo não é vaga a preencher. */
  tecnicos: TecnicoDisponivel[]
  /**
   * Pares lidos dos pontos agendados. Pode repetir o mesmo par várias vezes —
   * uma UM tem vários pontos (ciclo/etapa) e mais de um pode estar agendado
   * para o mesmo técnico. Repetição do MESMO par é normal e não é violação;
   * a deduplicação acontece aqui.
   */
  agendamentos: ParVigente[]
}

// ============================================================
// AVALIAÇÃO
// ============================================================

export function avaliarCobertura(
  entrada: EntradaCobertura,
  medidoEm: Date = new Date()
): Cobertura {
  const { ums, tecnicos, agendamentos } = entrada

  // Índices por nome de UM e por id de técnico. Conjuntos, não contadores: o
  // que viola o 1:1 é haver DOIS técnicos distintos na mesma UM, não haver
  // dois pontos agendados da mesma UM para o mesmo técnico.
  const tecnicosPorUm = new Map<string, Map<string, string>>()
  const umsPorTecnico = new Map<string, Set<string>>()
  const nomeDoTecnico = new Map<string, string>()

  for (const par of agendamentos) {
    nomeDoTecnico.set(par.tecnicoId, par.tecnicoNome)

    let porUm = tecnicosPorUm.get(par.umNome)
    if (!porUm) {
      porUm = new Map()
      tecnicosPorUm.set(par.umNome, porUm)
    }
    porUm.set(par.tecnicoId, par.tecnicoNome)

    let porTecnico = umsPorTecnico.get(par.tecnicoId)
    if (!porTecnico) {
      porTecnico = new Set()
      umsPorTecnico.set(par.tecnicoId, porTecnico)
    }
    porTecnico.add(par.umNome)
  }

  const nomesCadastrados = new Set(ums.map((u) => u.nome))

  const pares: ParVigente[] = []
  for (const [umNome, porUm] of tecnicosPorUm) {
    for (const [tecnicoId, tecnicoNome] of porUm) {
      pares.push({ umNome, tecnicoId, tecnicoNome })
    }
  }

  const umsSemTecnico = ums.filter((u) => !tecnicosPorUm.has(u.nome))

  const tecnicosSemUm = tecnicos.filter((t) => !umsPorTecnico.has(t.id))

  const umsComMaisDeUmTecnico = Array.from(tecnicosPorUm.entries())
    .filter(([, porUm]) => porUm.size > 1)
    .map(([umNome, porUm]) => ({
      umNome,
      tecnicos: Array.from(porUm.values()),
    }))

  const tecnicosComMaisDeUmaUm = Array.from(umsPorTecnico.entries())
    .filter(([, umsDele]) => umsDele.size > 1)
    .map(([tecnicoId, umsDele]) => ({
      tecnicoId,
      tecnicoNome: nomeDoTecnico.get(tecnicoId) ?? tecnicoId,
      ums: Array.from(umsDele),
    }))

  const paresForaDoCadastro = pares.filter(
    (p) => !nomesCadastrados.has(p.umNome)
  )

  return {
    medidoEm,
    pares,
    umsSemTecnico,
    tecnicosSemUm,
    umsComMaisDeUmTecnico,
    tecnicosComMaisDeUmaUm,
    paresForaDoCadastro,
    invarianteOk:
      umsSemTecnico.length === 0 &&
      umsComMaisDeUmTecnico.length === 0 &&
      tecnicosComMaisDeUmaUm.length === 0 &&
      paresForaDoCadastro.length === 0,
  }
}

/**
 * Por que o invariante falhou, em frases prontas para tela e para log.
 *
 * Devolve `[]` quando está tudo certo. Existe aqui, e não na tela, porque a
 * 15.6 pede o mesmo texto no Início e no rail, e a verificação por script
 * precisa dele idêntico — três redações do mesmo problema divergem.
 */
export function descreverProblemas(cobertura: Cobertura): string[] {
  const problemas: string[] = []

  for (const um of cobertura.umsSemTecnico) {
    problemas.push(
      `${um.nome} (${um.projetoSigla}) está sem técnico` +
        (um.projetoAtivo ? "" : " — projeto inativo ou ausente")
    )
  }

  for (const dup of cobertura.umsComMaisDeUmTecnico) {
    problemas.push(
      `${dup.umNome} tem ${dup.tecnicos.length} técnicos agendados: ${dup.tecnicos.join(", ")}`
    )
  }

  for (const dup of cobertura.tecnicosComMaisDeUmaUm) {
    problemas.push(
      `${dup.tecnicoNome} está agendado em ${dup.ums.length} UMs: ${dup.ums.join(", ")}`
    )
  }

  for (const par of cobertura.paresForaDoCadastro) {
    problemas.push(
      `${par.umNome} está agendada para ${par.tecnicoNome} mas não existe no cadastro de UMs`
    )
  }

  return problemas
}
