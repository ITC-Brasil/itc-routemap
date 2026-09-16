/**
 * Seed do calendário de feriados e pontos facultativos do DF — 2026.
 *
 * Rode com: npm run db:seed:dias-nao-uteis
 * Idempotente: usa upsert por data, então rodar duas vezes não duplica.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ ATENÇÃO — CONFERIR NO DODF ANTES DE CONFIAR                           │
 * │                                                                        │
 * │ Esta lista foi montada a partir da cobertura de imprensa do decreto   │
 * │ (Correio Braziliense, dez/2025), NÃO da leitura do Diário Oficial. As  │
 * │ reportagens citam o Decreto nº 48.093/2025 e o nº 48.117 — os números  │
 * │ divergem entre veículos, o que já é motivo para conferir.             │
 * │                                                                        │
 * │ O calendário sai por decreto ANUAL e muda de ano para ano, inclusive   │
 * │ na classificação de datas. Para 2027 em diante, cadastre pela tela do  │
 * │ Admin (/admin/dias-nao-uteis) em vez de editar este arquivo.          │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * REGRA DE INCLUSÃO — o que entra e o que não entra:
 *
 * Entram as datas em que NÃO há expediente às 08:00, que é o horário da
 * âncora de chegada. Por isso:
 *
 *  - 18/02 (Quarta-feira de Cinzas, facultativo ATÉ 14h) ENTRA: às 08h não há
 *    expediente.
 *  - 24/12 e 31/12 (facultativos APÓS 14h) NÃO entram: às 08h o expediente é
 *    normal, e o técnico consegue ser atendido. Tratá-los como não úteis
 *    empurraria a âncora um dia à toa.
 *
 * Fins de semana não precisariam estar aqui (a regra já os exclui), mas
 * 15/11 foi mantido para a tabela espelhar o decreto por inteiro.
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

type DiaSemeado = { data: string; descricao: string }

const CALENDARIO_DF_2026: DiaSemeado[] = [
  { data: "2026-01-01", descricao: "Confraternização Universal (feriado nacional)" },
  { data: "2026-01-02", descricao: "Ponto facultativo" },
  { data: "2026-02-16", descricao: "Carnaval (ponto facultativo)" },
  { data: "2026-02-17", descricao: "Carnaval (ponto facultativo)" },
  { data: "2026-02-18", descricao: "Quarta-feira de Cinzas (facultativo até 14h)" },
  { data: "2026-04-03", descricao: "Paixão de Cristo (feriado nacional)" },
  { data: "2026-04-20", descricao: "Ponto facultativo" },
  { data: "2026-04-21", descricao: "Tiradentes e Aniversário de Brasília (feriados)" },
  { data: "2026-05-01", descricao: "Dia Mundial do Trabalho (feriado nacional)" },
  { data: "2026-06-04", descricao: "Corpus Christi (feriado distrital)" },
  { data: "2026-06-05", descricao: "Ponto facultativo" },
  { data: "2026-09-07", descricao: "Independência do Brasil (feriado nacional)" },
  { data: "2026-10-12", descricao: "Nossa Senhora Aparecida (feriado nacional)" },
  { data: "2026-10-28", descricao: "Dia do Servidor Público (ponto facultativo)" },
  { data: "2026-11-02", descricao: "Finados (feriado nacional)" },
  { data: "2026-11-15", descricao: "Proclamação da República (feriado nacional, domingo)" },
  { data: "2026-11-20", descricao: "Consciência Negra (feriado nacional)" },
  { data: "2026-11-30", descricao: "Dia do Evangélico (feriado distrital)" },
  { data: "2026-12-25", descricao: "Natal (feriado nacional)" },
]

async function main() {
  let criados = 0
  let jaExistiam = 0

  for (const dia of CALENDARIO_DF_2026) {
    const data = new Date(`${dia.data}T00:00:00Z`)
    const existente = await prisma.diaNaoUtil.findUnique({ where: { data } })

    if (existente) {
      jaExistiam++
      continue
    }

    await prisma.diaNaoUtil.create({
      data: { data, descricao: dia.descricao },
    })
    criados++
  }

  console.log(
    `Dias não úteis semeados: ${criados} criado(s), ${jaExistiam} já existia(m).`
  )
  console.log(
    "CONFIRA as datas no DODF — esta lista veio da imprensa, não do decreto."
  )
}

main()
  .catch((err) => {
    console.error("Erro ao semear dias não úteis:", err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
