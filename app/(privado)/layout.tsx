"use client"

import { AuthGuard } from "@/components/auth/auth-guard"
import { Navbar } from "@/components/layout/navbar"
import packageJson from "@/package.json"

export default function PrivadoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      <div className="relative z-10 flex min-h-screen flex-col">
        <Navbar />
        <main className="container mx-auto flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
        <footer className="border-t bg-muted/30">
          <div className="container mx-auto flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <span className="font-mono text-xs text-muted-foreground">
              ITC RouteMap · Grupo ITC Brasil
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              v{packageJson.version}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              © 2026 Grupo ITC Brasil
            </span>
          </div>
        </footer>
      </div>
    </AuthGuard>
  )
}