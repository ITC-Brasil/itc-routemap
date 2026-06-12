// lib/google-maps-loader.ts
//
// Carrega o Google Maps JavaScript SDK uma única vez por sessão.
// - Idempotente: chamar várias vezes retorna a mesma Promise
// - Lazy: só carrega quando o primeiro consumidor chamar
// - Client-only: rejeita se chamado no server (não cabe em SSR)
//
// Uso típico:
//   const google = await loadGoogleMaps()
//   const map = new google.maps.Map(div, { ... })
/// <reference types="google.maps" />
"use client"

// Tipagem global do Google Maps namespace
declare global {
  interface Window {
    google?: typeof google
  }
}

let loadPromise: Promise<typeof google> | null = null

/**
 * Carrega (ou retorna do cache) o SDK do Google Maps.
 * Inclui a biblioteca "geometry" pra usar decodePath na polyline.
 */
export function loadGoogleMaps(): Promise<typeof google> {
  if (loadPromise) return loadPromise

  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("Google Maps só pode ser carregado no client (browser)."),
    )
  }

  // SDK já carregado pelo HTML?
  if (window.google?.maps) {
    return Promise.resolve(window.google)
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return Promise.reject(
      new Error(
        "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY não está configurada no .env.local.",
      ),
    )
  }

  loadPromise = new Promise<typeof google>((resolve, reject) => {
    // Verifica se já tem um script tag inserido (HMR pode reordenar)
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-google-maps-loader="true"]',
    )
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.google) resolve(window.google)
        else reject(new Error("Google Maps carregou mas window.google é null"))
      })
      existing.addEventListener("error", () =>
        reject(new Error("Falha ao carregar Google Maps SDK")),
      )
      return
    }

    const script = document.createElement("script")
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey,
    )}&libraries=geometry&loading=async&language=pt-BR&region=BR`
    script.async = true
    script.defer = true
    script.dataset.googleMapsLoader = "true"
    script.onload = () => {
      if (window.google?.maps) {
        resolve(window.google)
      } else {
        reject(
          new Error("Google Maps SDK carregou mas window.google.maps é null"),
        )
      }
    }
    script.onerror = () =>
      reject(new Error("Falha de rede ao carregar Google Maps SDK"))
    document.head.appendChild(script)
  })

  return loadPromise
}