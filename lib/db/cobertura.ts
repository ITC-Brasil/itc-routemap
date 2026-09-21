import "server-only"

import { prisma } from "@/lib/prisma"
import { STATUS_PONTO_AGENDADO } from "@/lib/rotas-utils"
import {
  avaliarCobertura,
  type Cobertura,
  type ParVigente,
  type UmCadastrada,
} from "@/lib/cobertura"

/**
 * A consulta de cobertura: quais UMs estão sem técnico e quais técnicos estão
 * sem UM, num dado instante.
 *
 * Três leituras e uma avaliação pura. As regras de 1:1 ficam em
 * `lib/cobertura.ts`, que é testável sem banco; aqui só mora de onde o dado
 * vem — e de onde ele vem é a parte que exigiu conferência:
 *
 *  - CADASTRO DE UMs: tabela `ums`. Não tem coluna `ativo`; o único `ativo` ao
 *    alcance é o do projeto, e ele não filtra nada em lugar nenhum do app.
 *    Então nenhuma UM é excluída aqui — cada uma vem com `projetoAtivo` para
 *    quem exibe decidir. Esconder UM do diagnóstico é como a UM descoberta
 *    passa despercebida, que é justamente o que a Etapa 15 quer impedir.
 *
 *  - EMPARELHAMENTO VIGENTE: `pontos` com `status = "Agendado"` e `tecnicoId`
 *    preenchido. É o par que as transações de alocação mantêm: confirmar liga
 *    (`confirmarAlocacao`), cancelar desliga e devolve o ponto para
 *    "Pendente" (`cancelarLote`). NÃO se usa `ums.tecnicoAtualId`: a coluna
 *    existe desde a migração e está inerte, `criarUM` grava `null` e nenhum
 *    fluxo escreve nela. NÃO se lê `rotas` direto: uma rota Confirmada cujo
 *    ponto já foi liberado não é vínculo em vigor, e o ponto é o lado que as
 *    duas transações sempre atualizam.
 *
 *  - TÉCNICOS: só os `ativo = true`. Técnico inativo não é vaga a preencher
 *    nem candidato de rotação.
 *
 * Sem cache: são dezenas de linhas de cada tabela, e o consumidor mais caro
 * (a rotação) faz chamadas à Routes API ordens de grandeza mais lentas.
 */
export async function obterCobertura(): Promise<Cobertura> {
  const [umsRows, tecnicosRows, pontosAgendados] = await Promise.all([
    prisma.um.findMany({
      select: { id: true, nome: true, projetoId: true },
    }),
    prisma.tecnico.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
    }),
    prisma.ponto.findMany({
      where: { status: STATUS_PONTO_AGENDADO, tecnicoId: { not: null } },
      select: { umNome: true, tecnicoId: true },
    }),
  ])

  // Projetos vêm em consulta separada porque o vínculo é id solto, sem foreign
  // key (Opção A da migração): um `include` não existe, e o join em memória é
  // o mesmo que `listarUMsComProjeto` já faz.
  const projetos = await prisma.projeto.findMany({
    where: { id: { in: Array.from(new Set(umsRows.map((u) => u.projetoId))) } },
    select: { id: true, sigla: true, ativo: true },
  })
  const projetoPorId = new Map(projetos.map((p) => [p.id, p]))

  const ums: UmCadastrada[] = umsRows.map((u) => {
    const projeto = projetoPorId.get(u.projetoId)
    return {
      id: u.id,
      nome: u.nome,
      projetoId: u.projetoId,
      projetoSigla: projeto?.sigla ?? "sem projeto",
      projetoAtivo: projeto?.ativo ?? false,
    }
  })

  // O nome do técnico não está no ponto — só o id. Buscar os nomes de TODOS os
  // técnicos (não apenas os ativos) porque um ponto agendado pode apontar para
  // um técnico desativado depois, e esse par precisa aparecer no diagnóstico
  // com nome, não com um cuid.
  const nomesTecnicos = new Map(
    (
      await prisma.tecnico.findMany({ select: { id: true, nome: true } })
    ).map((t) => [t.id, t.nome])
  )

  const agendamentos: ParVigente[] = pontosAgendados.map((p) => ({
    umNome: p.umNome,
    tecnicoId: p.tecnicoId!,
    tecnicoNome: nomesTecnicos.get(p.tecnicoId!) ?? p.tecnicoId!,
  }))

  return avaliarCobertura({ ums, tecnicos: tecnicosRows, agendamentos })
}
