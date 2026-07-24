import "dotenv/config"
import { prisma } from "../lib/prisma"
import { auth } from "../lib/better-auth"

/**
 * Redefinição pontual da senha de um admin JÁ existente.
 *
 * Usa exatamente o mesmo mecanismo do seed/signup do Better Auth:
 *   - ctx.password.hash()  → o MESMO hasher (scrypt) usado no signUpEmail
 *   - ctx.internalAdapter.updatePassword(userId, hash) → grava o hash no
 *     account de providerId="credential" (o método NÃO hasheia sozinho,
 *     por isso passamos o hash já pronto)
 *
 * A nova senha vem de ADMIN_PASSWORD_RESET (variável separada da
 * ADMIN_PASSWORD original, que suspeitamos ter hash corrompido).
 *
 * Uso:
 *   1. Defina ADMIN_PASSWORD_RESET no .env (16+ chars, só letras e números)
 *   2. tsx prisma/reset-admin-password.ts
 */
async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "dev.itcbrasil@gmail.com")
    .toLowerCase()
    .trim()
  const novaSenha = process.env.ADMIN_PASSWORD_RESET ?? ""

  // --- Validações da nova senha ---
  if (!novaSenha) {
    throw new Error(
      "Defina ADMIN_PASSWORD_RESET no .env antes de rodar (não reutilize ADMIN_PASSWORD)."
    )
  }
  if (novaSenha.length < 16) {
    throw new Error("ADMIN_PASSWORD_RESET precisa ter pelo menos 16 caracteres.")
  }
  if (!/^[A-Za-z0-9]+$/.test(novaSenha)) {
    throw new Error(
      "ADMIN_PASSWORD_RESET deve conter apenas letras e números (sem símbolos), para evitar problemas de interpretação no .env."
    )
  }

  // --- Localiza o usuário e o account de credencial ---
  const ctx = await auth.$context

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    throw new Error(`Usuário ${email} não existe. Rode o seed antes.`)
  }

  const contas = await ctx.internalAdapter.findAccountByUserId(user.id)
  const contaCredencial = contas.find((c) => c.providerId === "credential")
  if (!contaCredencial) {
    throw new Error(
      `Usuário ${email} não possui login por email/senha (nenhum account providerId="credential"). ` +
        "Provavelmente foi criado via Google — redefinir senha não se aplica."
    )
  }

  // --- Gera o hash com o MESMO hasher do signup e grava ---
  const hash = await ctx.password.hash(novaSenha)
  await ctx.internalAdapter.updatePassword(user.id, hash)

  // --- Verificação: relê o account e confere que a nova senha valida ---
  const contasApos = await ctx.internalAdapter.findAccountByUserId(user.id)
  const credencialApos = contasApos.find((c) => c.providerId === "credential")
  const ok =
    credencialApos?.password != null &&
    (await ctx.password.verify({
      hash: credencialApos.password,
      password: novaSenha,
    }))

  if (!ok) {
    throw new Error(
      "A senha foi gravada, mas a verificação falhou — NÃO use este resultado. Investigue antes de tentar logar."
    )
  }

  console.log(`Senha do admin ${email} redefinida e verificada com sucesso.`)
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
