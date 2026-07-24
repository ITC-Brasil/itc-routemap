"use client"

import { Suspense, useEffect, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn, signUp } from "@/lib/auth-client"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

const MSG_SEM_CONVITE =
  "Você não tem um convite válido. Solicite ao administrador."

/**
 * Mapeia códigos de erro que o Better Auth devolve via query string
 * (fluxo social/Google) para mensagens amigáveis.
 */
function mensagemDoErroQuery(codigo: string): string {
  if (codigo === "unable_to_create_user") return MSG_SEM_CONVITE
  if (codigo === "access_denied") return "Login cancelado. Tente novamente."
  return "Erro ao fazer login. Tente novamente."
}

function LoginConteudo() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  const [loading, setLoading] = useState(false)
  // Modo do formulário: login normal ou primeiro acesso (cria a conta e
  // consome o convite no servidor)
  const [primeiroAcesso, setPrimeiroAcesso] = useState(false)

  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [senha, setSenha] = useState("")

  // Erro vindo do redirect do fluxo Google (ex.: convite inválido) é lido
  // da query string uma única vez no mount.
  const [error, setError] = useState<string | null>(() => {
    const codigo = searchParams.get("error")
    return codigo ? mensagemDoErroQuery(codigo) : null
  })

  // Redireciona pra home APENAS se logado E sem erro ativo
  useEffect(() => {
    if (!authLoading && user && !error) {
      router.replace("/")
    }
  }, [user, authLoading, router, error])

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)
    // Fluxo por redirect: se o servidor recusar a criação da conta
    // (sem convite), o Better Auth volta pra /login?error=...
    const { error: erro } = await signIn.social({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/login",
    })
    if (erro) {
      setError(erro.message ?? "Erro ao fazer login. Tente novamente.")
      setLoading(false)
    }
  }

  const handleSubmitEmail = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (primeiroAcesso) {
        const { error: erro } = await signUp.email({
          name: nome.trim(),
          email: email.trim(),
          password: senha,
        })
        if (erro) {
          setError(erro.message ?? MSG_SEM_CONVITE)
          return
        }
      } else {
        const { error: erro } = await signIn.email({
          email: email.trim(),
          password: senha,
        })
        if (erro) {
          setError(
            erro.status === 401
              ? "Email ou senha incorretos."
              : erro.message ?? "Erro ao fazer login. Tente novamente."
          )
          return
        }
      }
      router.push("/")
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Carregando
          </p>
        </div>
      </div>
    )
  }

  if (user && !error) {
    return null
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border shadow-lg">
        <CardHeader className="space-y-4 pb-8 pt-10">
          <p className="text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Grupo ITC Brasil
          </p>

          <div className="flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary">
              <span className="font-heading text-2xl text-primary-foreground">
                ITC
              </span>
            </div>
            <CardTitle className="font-heading text-3xl text-foreground">
              ITC RouteMap
            </CardTitle>
            <CardDescription className="text-center text-base">
              Sistema de Alocação Inteligente de Técnicos
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pb-10">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleGoogleLogin}
            disabled={loading}
            variant="outline"
            className="w-full gap-3"
            size="lg"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09 0-.73.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Entrar com Google
          </Button>

          {/* Separador */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              ou
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Formulário email/senha */}
          <form onSubmit={handleSubmitEmail} className="space-y-4">
            {primeiroAcesso && (
              <div className="space-y-2">
                <Label htmlFor="nome">Nome</Label>
                <Input
                  id="nome"
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Seu nome completo"
                  required
                  autoComplete="name"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@grupoitcbrasil.com.br"
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                autoComplete={primeiroAcesso ? "new-password" : "current-password"}
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full" size="lg">
              {loading
                ? "Entrando..."
                : primeiroAcesso
                  ? "Criar conta com convite"
                  : "Entrar"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => {
              setPrimeiroAcesso((v) => !v)
              setError(null)
            }}
            className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {primeiroAcesso
              ? "Já tem conta? Entrar"
              : "Primeiro acesso? Criar conta com convite"}
          </button>

          <p className="text-center text-xs text-muted-foreground">
            Acesso restrito a usuários autorizados.
            <br />
            Solicite um convite ao administrador do sistema.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}

/**
 * useSearchParams() exige um limite de <Suspense> para o Next conseguir
 * pré-renderizar a página estaticamente (senão o build falha com CSR bailout).
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      }
    >
      <LoginConteudo />
    </Suspense>
  )
}
