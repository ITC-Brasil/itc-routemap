import "dotenv/config"
import { prisma } from "../lib/prisma"
import { auth } from "../lib/better-auth"

/**
 * Seed do primeiro administrador.
 *
 * Lê ADMIN_EMAIL, ADMIN_PASSWORD e ADMIN_NOME do ambiente e:
 * 1. Garante um Convite "ativo" para o email (o hook de criação de conta
 *    do Better Auth exige convite válido — o próprio hook o consome)
 * 2. Cria o User via API do Better Auth (hash de senha correto)
 * 3. Promove o User a papel="admin"
 *
 * Idempotente: se o admin já existe, não faz nada.
 *
 * Uso: npm run db:seed (requer Postgres de pé e DATABASE_URL no .env)
 */
async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").toLowerCase().trim()
  const senha = process.env.ADMIN_PASSWORD ?? ""
  const nome = (process.env.ADMIN_NOME ?? "Administrador").trim()

  if (!email || !senha) {
    throw new Error(
      "Defina ADMIN_EMAIL e ADMIN_PASSWORD no ambiente antes de rodar o seed."
    )
  }
  if (senha.length < 8) {
    throw new Error("ADMIN_PASSWORD precisa ter pelo menos 8 caracteres.")
  }

  const existente = await prisma.user.findUnique({ where: { email } })
  if (existente) {
    console.log(`Admin ${email} já existe (papel=${existente.papel}) — nada a fazer.`)
    return
  }

  // Convite válido por 24h — consumido imediatamente pelo hook do signup
  const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000)
  await prisma.convite.upsert({
    where: { email },
    update: { status: "ativo", expiraEm },
    create: { email, status: "ativo", expiraEm, criadoPor: "seed" },
  })

  // Cria via Better Auth para o hash de senha (scrypt) ficar correto
  await auth.api.signUpEmail({
    body: { email, password: senha, name: nome },
  })

  // Promove a admin (additionalField `papel` tem input:false — só o
  // servidor escreve)
  await prisma.user.update({ where: { email }, data: { papel: "admin" } })

  console.log(`Admin ${email} criado com papel=admin.`)
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
