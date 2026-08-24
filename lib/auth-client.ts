"use client"

import { createAuthClient } from "better-auth/react"

/**
 * Client de autenticação Better Auth (browser).
 * baseURL omitida: usa a mesma origem do app (o handler vive em
 * /api/auth/[...all]).
 */
export const authClient = createAuthClient()

export const { signIn, signUp, signOut, useSession } = authClient
