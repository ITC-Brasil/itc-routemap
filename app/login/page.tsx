"use client"

import { Eye, EyeOff } from "lucide-react"
import { LockupRouteMap } from "@/components/layout/logo-routemap"
import { Suspense, useEffect, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn, signUp } from "@/lib/auth-client"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  const [mostrarSenha, setMostrarSenha] = useState(false)

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
    // Duas colunas (protótipo v2): painel ink com a marca à esquerda, formulário
    // sobre off-white à direita. Abaixo de `lg` o painel sai e sobra o
    // formulário — a marca é ambientação, não informação, e em tela estreita o
    // que importa é entrar.
    <main className="grid min-h-screen lg:grid-cols-[minmax(320px,1fr)_minmax(420px,1fr)]">
      <aside className="hidden flex-col justify-between gap-12 bg-ink p-14 lg:flex">
        {/* Lockup oficial, símbolo ciano + wordmark branco, animado. O painel usa
            --ink, escuro nos dois temas, então o logo não acompanha o alternador.
            A variante `negative` (tudo branco) perdia o ciano da marca. */}
        <LockupRouteMap
          width={275}
          height={64}
          priority
          className="h-[38px] w-auto self-start"
        />
        {/* Copy do protótipo, verbatim. O que estava aqui antes — um display
            "ALOCAÇÃO INTELIGENTE" em caixa-alta e um parágrafo descritivo — era
            invenção minha: dizia o que o sistema faz, não o que ele resolve.
            A frase do protótipo é a promessa do produto numa linha.

            Nota: o protótipo usa Archivo 700 em 42px, em caixa de sentença, não o
            Display 48px em caixa-alta da §2 do system.md. Precedência é do
            protótipo. */}
        <div className="max-w-[460px] space-y-5">
          <h1 className="text-balance font-heading text-[42px] font-bold leading-[1.1] tracking-[-0.02em] text-[#F4F6F6]">
            Cada técnico na unidade móvel mais perto de casa.
          </h1>
          <p className="text-pretty text-base leading-relaxed text-[#8E9A98]">
            Distâncias reais do Google Routes e alocação ótima pelo algoritmo
            Húngaro — o time inteiro resolvido numa rodada.
          </p>
        </div>
        <div className="space-y-4">
          <div className="h-0.5 w-16 bg-primary" />
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
            Grupo ITC Brasil
          </span>
        </div>
      </aside>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[420px] space-y-6">
          <div className="space-y-1.5">
            {/* A marca reaparece no alto do formulário para quem está sem o
                painel (tela estreita), em versão compacta. */}
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary lg:hidden">
              Grupo ITC Brasil
            </p>
            <h2 className="font-heading text-[32px] font-bold leading-[1.15] tracking-[-0.01em]">
              Entrar
            </h2>
            <p className="text-muted-foreground">Use seu e-mail corporativo.</p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Ação primária: é o método que a equipe usa — os três usuários do
              sistema antigo entram por Google e nenhum tem senha. */}
          <Button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="h-11 w-full gap-3 text-[15px]"
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
              <Label htmlFor="email">E-mail corporativo</Label>
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
              {/* Mostrar/ocultar: um campo mascarado sem escape faz a pessoa
                  apagar tudo e redigitar ao errar uma tecla. É o único campo de
                  senha do fluxo — login e primeiro acesso compartilham este
                  input, mudando só o autoComplete. */}
              <div className="relative">
                <Input
                  id="senha"
                  type={mostrarSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  autoComplete={
                    primeiroAcesso ? "new-password" : "current-password"
                  }
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha((v) => !v)}
                  aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={mostrarSenha}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {mostrarSenha ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              variant="outline"
              className="h-11 w-full"
            >
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

          {/* Aviso de acesso por convite: o cadastro é fechado, e sem isto a
              recusa do primeiro acesso pareceria erro do sistema. */}
          <p className="text-center text-xs text-muted-foreground">
            Acesso por convite. Solicite liberação ao administrador do sistema.
          </p>
        </div>
      </div>
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
