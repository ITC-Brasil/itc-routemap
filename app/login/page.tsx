"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { signInWithPopup } from "firebase/auth"
import { auth, googleProvider } from "@/lib/firebase"
import { logout, verificarConvite } from "@/lib/auth"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function LoginPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/")
    }
  }, [user, authLoading, router])

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await signInWithPopup(auth, googleProvider)
      const usuario = result.user

      console.log("📥 Autenticação Google bem-sucedida:", {
        nome: usuario.displayName,
        email: usuario.email,
        uid: usuario.uid,
      })

      const resultadoConvite = await verificarConvite(usuario)

      if (!resultadoConvite.autorizado) {
        console.warn("🚫 Acesso negado:", resultadoConvite.mensagem)
        await logout()
        setError(resultadoConvite.mensagem ?? "Acesso não autorizado.")
        return
      }

      console.log("✅ Convite válido — redirecionando para a home")
      router.push("/")
    } catch (err: unknown) {
      console.error("❌ Erro no login:", err)
      const errorMessage = err instanceof Error ? err.message : String(err)

      if (errorMessage.includes("popup-closed-by-user")) {
        setError("Login cancelado. Tente novamente.")
      } else if (errorMessage.includes("unauthorized-domain")) {
        setError("Este domínio não está autorizado. Contate o administrador.")
      } else if (errorMessage.includes("network-request-failed")) {
        setError("Erro de conexão. Verifique sua internet.")
      } else {
        setError("Erro ao fazer login. Tente novamente.")
      }
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

  if (user) {
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
            className="w-full gap-3"
            size="lg"
          >
            {loading ? (
              <span>Entrando...</span>
            ) : (
              <>
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
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
              </>
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Acesso restrito a administradores autorizados.
            <br />
            Solicite um convite ao administrador do sistema.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}