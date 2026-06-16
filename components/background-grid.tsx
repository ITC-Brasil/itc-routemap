"use client"

import { useEffect } from "react"

/**
 * Camada de fundo interativa: grid quadriculado + spotlight que segue o mouse.
 *
 * Pluga uma vez no layout raiz (app/layout.tsx). Os tokens de cor mudam
 * automaticamente entre tema claro e escuro via CSS vars no globals.css.
 *
 * Performance: o listener atualiza variáveis CSS direto no <html>, sem passar
 * por state React — zero re-render por movimento de mouse.
 */
export function BackgroundGrid() {
  useEffect(() => {
    const root = document.documentElement
    const handleMouseMove = (e: MouseEvent) => {
      root.style.setProperty("--mx", `${e.clientX}px`)
      root.style.setProperty("--my", `${e.clientY}px`)
    }
    window.addEventListener("mousemove", handleMouseMove)
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <div className="bg-grid" />
      <div className="bg-grid-hl" />
      <div className="bg-spot" />
    </div>
  )
}