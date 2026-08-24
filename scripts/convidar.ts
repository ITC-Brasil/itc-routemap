/**
 * Emissão de convites de acesso — CLI.
 *
 * O cadastro é fechado: `lib/better-auth.ts` bloqueia a criação de conta no hook
 * `user.create.before` se o email não tiver um `Convite` com `status="ativo"` e
 * `expiraEm` no futuro. Vale para os DOIS métodos de login (Google e
 * email/senha). Sem convite, a pessoa recebe "Você não tem um convite válido".
 *
 * Não existe tela de admin para isso (só localidades, projetos, técnicos e UMs),
 * então este script é a única forma suportada de convidar alguém. A tela fica
 * para depois — com 3 pessoas na virada, ela não se pagaria agora.
 *
 * Uso:
 *   npx tsx scripts/convidar.ts pessoa@empresa.com
 *   npx tsx scripts/convidar.ts pessoa@empresa.com --dias=30
 *   npx tsx scripts/convidar.ts --listar
 *   npx tsx scripts/convidar.ts --revogar pessoa@empresa.com
 *
 * Em produção (container), o `app` não serve: a imagem standalone não tem `tsx`
 * (devDependency). Use o one-off da imagem do stage `builder`, o mesmo
 * procedimento do `migrate deploy` e do `db:seed` (ver §10.5 do handoff):
 *
 *   docker run --rm --network itc-routemap_default --env-file .env.docker \
 *     -e DATABASE_URL="postgresql://itc_user:<senha>@postgres:5432/itc_routemap" \
 *     itc-routemap-migrate:latest npx tsx scripts/convidar.ts pessoa@empresa.com
 *
 * Dentro da rede do compose o host do banco é `postgres`, não `localhost`.
 */

import "dotenv/config"
import { config as carregarEnv } from "dotenv"
import { PrismaClient } from "@prisma/client"

// .env.local tem precedência em dev; o .env já veio pelo import acima.
carregarEnv({ path: ".env.local" })

const prisma = new PrismaClient()

/**
 * 14 dias. O convite não é enviado por email por nenhum sistema — alguém avisa a
 * pessoa por fora —, então a janela precisa sobreviver a férias e a um fim de
 * semana esquecido. Curto demais gera "convite inválido" para quem foi convidado
 * de verdade, que é o erro mais confuso de diagnosticar aqui. Reemitir é trivial
 * (`--dias`), então errar para o lado longo custa pouco.
 */
const DIAS_PADRAO = 14

/** Validação de formato deliberadamente simples: um @, um ponto no domínio. */
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Acao =
  | { tipo: "convidar"; email: string; dias: number }
  | { tipo: "listar" }
  | { tipo: "revogar"; email: string }
  | { tipo: "erro"; mensagem: string }

function lerArgumentos(argv: string[]): Acao {
  const flags = argv.filter((a) => a.startsWith("--"))
  const posicionais = argv.filter((a) => !a.startsWith("--"))

  const flagDias = flags.find((f) => f.startsWith("--dias="))
  const dias = flagDias ? Number(flagDias.slice("--dias=".length)) : DIAS_PADRAO
  if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
    return { tipo: "erro", mensagem: "--dias precisa ser um inteiro entre 1 e 365." }
  }

  if (flags.includes("--listar")) return { tipo: "listar" }

  const revogar = flags.includes("--revogar")
  const email = posicionais[0]?.toLowerCase().trim()

  if (!email) {
    return {
      tipo: "erro",
      mensagem: revogar
        ? "Informe o email a revogar: --revogar pessoa@empresa.com"
        : "Informe o email a convidar: npx tsx scripts/convidar.ts pessoa@empresa.com",
    }
  }
  if (!FORMATO_EMAIL.test(email)) {
    return { tipo: "erro", mensagem: `Email invalido: "${email}"` }
  }

  return revogar ? { tipo: "revogar", email } : { tipo: "convidar", email, dias }
}

function situacao(c: {
  status: string
  expiraEm: Date
}): "ativo" | "expirado" | "consumido" | "revogado" {
  if (c.status === "consumido") return "consumido"
  if (c.status === "revogado") return "revogado"
  return c.expiraEm.getTime() > Date.now() ? "ativo" : "expirado"
}

const data = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "—")

async function listar() {
  const convites = await prisma.convite.findMany({ orderBy: { criadoEm: "desc" } })
  if (convites.length === 0) {
    console.log("Nenhum convite emitido.")
    return
  }
  console.log(`${convites.length} convite(s):\n`)
  console.log(
    "  " +
      "email".padEnd(40) +
      "situacao".padEnd(11) +
      "expira em".padEnd(18) +
      "consumido em".padEnd(18) +
      "criado por"
  )
  for (const c of convites) {
    console.log(
      "  " +
        c.email.padEnd(40) +
        situacao(c).padEnd(11) +
        data(c.expiraEm).padEnd(18) +
        data(c.consumidoEm).padEnd(18) +
        (c.criadoPor ?? "—")
    )
  }
  const contas = await prisma.user.count()
  console.log(`\n${contas} conta(s) criada(s) no total.`)
}

async function revogar(email: string) {
  const convite = await prisma.convite.findUnique({ where: { email } })
  if (!convite) {
    console.log(`Nenhum convite para ${email} — nada a revogar.`)
    return
  }
  if (convite.status === "consumido") {
    // Revogar não desfaz o acesso: a conta já existe e a sessão dela não passa
    // mais pelo hook do convite. Dizer isso é mais útil que revogar em silêncio
    // e deixar a impressão de que o acesso foi cortado.
    console.log(
      `Convite de ${email} ja foi CONSUMIDO (em ${data(convite.consumidoEm)}) — a conta existe.`
    )
    console.log("Revogar o convite NAO remove o acesso. Para isso, apague o User.")
    return
  }
  await prisma.convite.update({ where: { email }, data: { status: "revogado" } })
  console.log(`Convite de ${email} revogado.`)
}

async function convidar(email: string, dias: number) {
  // Um email que já tem conta não precisa de convite, e criar um daria a falsa
  // impressão de que resolveria o acesso. Pior: o Better Auth só usa o convite na
  // CRIAÇÃO da conta, e recusa uma segunda conta para o mesmo email
  // ("Esse email já está registrado com outro método de login").
  const conta = await prisma.user.findUnique({ where: { email } })
  if (conta) {
    const metodos = await prisma.account.findMany({
      where: { userId: conta.id },
      select: { providerId: true },
    })
    const comoEntra = metodos.map((m) => m.providerId).join(", ") || "desconhecido"
    console.log(`${email} JA TEM CONTA (papel=${conta.papel}, login: ${comoEntra}).`)
    console.log("Convite nao emitido — seria inutil: o convite so vale na criacao da conta.")
    console.log("Se a pessoa nao consegue entrar, o problema e outro (metodo de login ou senha).")
    return
  }

  const expiraEm = new Date(Date.now() + dias * 24 * 60 * 60 * 1000)
  const anterior = await prisma.convite.findUnique({ where: { email } })

  // Idempotente por upsert: `email` é @unique, então reemitir reativa o mesmo
  // registro em vez de tentar (e falhar em) duplicar. Cobre os três casos de
  // reemissão — expirado, revogado e ativo com prazo esticado.
  await prisma.convite.upsert({
    where: { email },
    update: { status: "ativo", expiraEm, consumidoEm: null, consumidoPor: null },
    create: { email, status: "ativo", expiraEm, criadoPor: "cli" },
  })

  const acao = anterior ? `REEMITIDO (era ${situacao(anterior)})` : "CRIADO"
  console.log(`Convite ${acao} para ${email}`)
  console.log(`  expira em ${data(expiraEm)} (${dias} dia(s))`)
  console.log(
    "\nA pessoa entra em /login. O cadastro fecha no primeiro acesso, que consome o convite."
  )
}

async function main() {
  const acao = lerArgumentos(process.argv.slice(2))

  if (acao.tipo === "erro") {
    console.error(acao.mensagem)
    console.error(
      "\nUso:\n" +
        "  npx tsx scripts/convidar.ts pessoa@empresa.com [--dias=N]\n" +
        "  npx tsx scripts/convidar.ts --listar\n" +
        "  npx tsx scripts/convidar.ts --revogar pessoa@empresa.com"
    )
    process.exitCode = 1
    return
  }

  if (acao.tipo === "listar") await listar()
  else if (acao.tipo === "revogar") await revogar(acao.email)
  else await convidar(acao.email, acao.dias)
}

main()
  .catch((err) => {
    console.error("Falhou:", err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
