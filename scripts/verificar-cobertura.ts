/**
 * Verifica o invariante de cobertura contra os DADOS ATUAIS.
 *
 * Rode com: npm run verificar:cobertura
 * Sai com código 1 quando o invariante está quebrado, para servir de porta em
 * script de deploy ou tarefa agendada.
 *
 * Não é um teste do runner unitário de propósito: `playwright.unit.config.ts`
 * é sem banco, e amarrar a regra do 1:1 ao Postgres estar de pé faria a regra
 * desaparecer justamente quando o banco caísse. A regra em si é testada em
 * `tests/unit/cobertura.spec.ts`; aqui se testa o dado.
 *
 * `lib/db/*` é `server-only`, então o runner precisa da condição react-server
 * (já embutida no script do package.json).
 */

import { obterCobertura } from "@/lib/db/cobertura"
import { descreverProblemas } from "@/lib/cobertura"

async function main() {
  const cobertura = await obterCobertura()

  console.log(
    `Cobertura medida em ${cobertura.medidoEm.toLocaleString("pt-BR")}`
  )
  console.log(`Pares em vigor:      ${cobertura.pares.length}`)
  console.log(`UMs sem técnico:     ${cobertura.umsSemTecnico.length}`)
  console.log(`Técnicos sem UM:     ${cobertura.tecnicosSemUm.length}`)

  if (cobertura.pares.length > 0) {
    console.log("\nEmparelhamento vigente:")
    for (const par of [...cobertura.pares].sort((a, b) =>
      a.umNome.localeCompare(b.umNome, "pt-BR")
    )) {
      console.log(`  ${par.umNome} → ${par.tecnicoNome}`)
    }
  }

  if (cobertura.tecnicosSemUm.length > 0) {
    console.log("\nTécnicos ativos sem UM (candidatos de rotação):")
    for (const t of cobertura.tecnicosSemUm) console.log(`  ${t.nome}`)
  }

  const problemas = descreverProblemas(cobertura)

  if (problemas.length === 0) {
    console.log("\nInvariante OK: toda UM com um técnico, nenhum técnico em duas.")
    return
  }

  console.log("\nINVARIANTE QUEBRADO:")
  for (const p of problemas) console.log(`  - ${p}`)
  process.exitCode = 1
}

main().catch((err) => {
  console.error("Erro ao verificar cobertura:", err)
  process.exit(1)
})
