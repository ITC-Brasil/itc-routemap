import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { APIError } from "better-auth/api"
import { prisma } from "@/lib/prisma"

/**
 * Configuração central do Better Auth.
 *
 * Regras de acesso (etapa 3.1):
 * - Convite obrigatório para AMBOS os métodos (email/senha e Google):
 *   a criação de conta é bloqueada no databaseHook `user.create.before`
 *   se o email não tiver convite válido (status "ativo" e não expirado).
 * - O convite é consumido no primeiro acesso (status → "consumido").
 * - Cada pessoa usa 1 método fixo — sem account linking. Se o email já
 *   existe (registrado com outro método), a criação é rejeitada com
 *   mensagem clara.
 * - `papel` ("admin" | "operador") vive no próprio User via
 *   additionalFields; clientes não podem defini-lo no signup (input: false).
 */

const MSG_SEM_CONVITE =
  "Você não tem um convite válido. Solicite ao administrador."
const MSG_EMAIL_JA_REGISTRADO =
  "Esse email já está registrado com outro método de login."

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  user: {
    additionalFields: {
      papel: {
        type: "string",
        defaultValue: "operador",
        input: false, // nunca aceito do cliente; só seed/admin alteram
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const email = user.email.toLowerCase().trim()

          // 1 método fixo: se o email já tem conta (criada por outro
          // método), rejeita a criação de uma segunda conta.
          const existente = await prisma.user.findUnique({
            where: { email },
          })
          if (existente) {
            throw new APIError("UNPROCESSABLE_ENTITY", {
              message: MSG_EMAIL_JA_REGISTRADO,
            })
          }

          // Convite obrigatório: precisa existir, estar "ativo" e não expirado
          const convite = await prisma.convite.findUnique({
            where: { email },
          })
          const conviteValido =
            convite !== null &&
            convite.status === "ativo" &&
            convite.expiraEm.getTime() > Date.now()

          if (!conviteValido) {
            throw new APIError("FORBIDDEN", {
              message: MSG_SEM_CONVITE,
            })
          }

          // Consome o convite no primeiro acesso.
          // consumidoPor guarda o email (o id do User ainda não existe
          // neste ponto do hook).
          await prisma.convite.update({
            where: { id: convite.id },
            data: {
              status: "consumido",
              consumidoEm: new Date(),
              consumidoPor: email,
            },
          })

          return { data: { ...user, email } }
        },
      },
    },
  },
})
