/// <reference types="google.maps" />
"use client"

// app/(privado)/calcular-rotas/_components/mapa-alocacao.tsx
//
// Renderiza um mini-mapa com a rota entre origem e destino para um modo
// específico de transporte. A polyline (geometria da rota) e os steps
// (no caso de TRANSIT) vêm do endpoint /api/routes/single, fetchados
// pelo componente pai.
//
// Decisões:
// - O componente NÃO faz fetch. Recebe os dados prontos (rotaData).
//   Isso simplifica cache no parent e evita race conditions ao trocar modo.
// - Se rotaData for null, mostra loading skeleton.
// - Se rotaData.polyline for null, mostra linha reta tracejada como fallback.

import { useEffect, useRef, useState } from "react"
import { loadGoogleMaps } from "@/lib/google-maps-loader"
import type { ModoTransporte } from "@/lib/firestore/rotas"

type LatLng = { latitude: number; longitude: number }

export type RotaData = {
  polyline: string | null
  distanciaMetros: number
  duracaoSegundos: number
}

interface Props {
  origem: LatLng
  destino: LatLng
  modo: ModoTransporte
  rotaData: RotaData | null
  /** True enquanto o pai está buscando a rota */
  carregando?: boolean
  /** Mensagem de erro do pai (ex: nenhuma rota encontrada) */
  erro?: string | null
  className?: string
}

export function MapaAlocacao({
  origem,
  destino,
  modo,
  rotaData,
  carregando,
  erro,
  className,
}: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<google.maps.Map | null>(null)
  const polylineRef = useRef<google.maps.Polyline | null>(null)
  const markersRef = useRef<google.maps.Marker[]>([])
  const [mapErro, setMapErro] = useState<string | null>(null)
  const [mapPronto, setMapPronto] = useState(false)

  // ====== 1. Inicializa o mapa uma vez ======
  useEffect(() => {
    let cancelado = false

    async function init() {
      try {
        const g = await loadGoogleMaps()
        if (cancelado || !mapDivRef.current) return

        const map = new g.maps.Map(mapDivRef.current, {
          center: { lat: origem.latitude, lng: origem.longitude },
          zoom: 12,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
          mapTypeControl: false,
          streetViewControl: false,
        })

        mapInstanceRef.current = map

        // Markers de origem e destino
        markersRef.current = [
          new g.maps.Marker({
            position: { lat: origem.latitude, lng: origem.longitude },
            map,
            label: { text: "A", color: "white", fontWeight: "bold" },
            title: "Origem (técnico)",
          }),
          new g.maps.Marker({
            position: { lat: destino.latitude, lng: destino.longitude },
            map,
            label: { text: "B", color: "white", fontWeight: "bold" },
            title: "Destino (UM)",
          }),
        ]

        // Ajusta bounds pros dois pontos caberem
        const bounds = new g.maps.LatLngBounds()
        bounds.extend({ lat: origem.latitude, lng: origem.longitude })
        bounds.extend({ lat: destino.latitude, lng: destino.longitude })
        map.fitBounds(bounds, 60)

        setMapPronto(true)
      } catch (err) {
        if (cancelado) return
        setMapErro(err instanceof Error ? err.message : String(err))
      }
    }

    init()

    return () => {
      cancelado = true
      // Cleanup
      polylineRef.current?.setMap(null)
      markersRef.current.forEach((m) => m.setMap(null))
      markersRef.current = []
    }
    
  }, [origem.latitude, origem.longitude, destino.latitude, destino.longitude])

  // ====== 2. Redesenha a polyline quando o modo/rotaData mudar ======
  useEffect(() => {
    if (!mapPronto || !mapInstanceRef.current || typeof window === "undefined")
      return

    const g = window.google
    if (!g?.maps) return

    // Remove polyline anterior
    polylineRef.current?.setMap(null)
    polylineRef.current = null

    // Sem dados de rota ainda? Nada a desenhar agora.
    if (!rotaData) return

    const cor = corDoModo(modo)

    if (rotaData.polyline) {
      // Decodifica a polyline encoded do Google
      const path = g.maps.geometry.encoding.decodePath(rotaData.polyline)
      polylineRef.current = new g.maps.Polyline({
        path,
        strokeColor: cor,
        strokeOpacity: 0.85,
        strokeWeight: 5,
        map: mapInstanceRef.current,
      })

      // Reajusta bounds pra incluir toda a rota
      const bounds = new g.maps.LatLngBounds()
      path.forEach((p) => bounds.extend(p))
      mapInstanceRef.current.fitBounds(bounds, 60)
    } else {
      // Fallback: linha reta tracejada
      polylineRef.current = new g.maps.Polyline({
        path: [
          { lat: origem.latitude, lng: origem.longitude },
          { lat: destino.latitude, lng: destino.longitude },
        ],
        geodesic: true,
        strokeColor: cor,
        strokeOpacity: 0,
        icons: [
          {
            icon: {
              path: "M 0,-1 0,1",
              strokeOpacity: 1,
              scale: 4,
              strokeColor: cor,
            },
            offset: "0",
            repeat: "16px",
          },
        ],
        map: mapInstanceRef.current,
      })
    }
  }, [
    mapPronto,
    rotaData,
    modo,
    origem.latitude,
    origem.longitude,
    destino.latitude,
    destino.longitude,
  ])

  // ===== Render =====
  return (
    <div className={`relative ${className ?? ""}`}>
      <div
        ref={mapDivRef}
        className="h-72 w-full overflow-hidden rounded-md bg-muted"
        aria-label="Mapa da rota"
      />

      {/* Overlay de loading enquanto o mapa carrega ou o fetch da rota acontece */}
      {(!mapPronto || carregando) && !mapErro && !erro && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-background/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-full bg-background px-3 py-1.5 text-sm shadow">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            {!mapPronto ? "Carregando mapa..." : "Buscando rota..."}
          </div>
        </div>
      )}

      {/* Overlay de erro do mapa */}
      {mapErro && (
        <div className="absolute inset-0 flex items-center justify-center rounded-md bg-destructive/10 text-sm text-destructive">
          Erro no mapa: {mapErro}
        </div>
      )}

      {/* Overlay de erro de rota (vindo do pai) */}
      {erro && mapPronto && (
        <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-md bg-background/95 px-3 py-2 text-xs shadow">
          ⚠ {erro}
        </div>
      )}
    </div>
  )
}

// ============================================================
// HELPERS
// ============================================================

function corDoModo(modo: ModoTransporte): string {
  switch (modo) {
    case "DRIVE":
      return "#008F95" // Ciano ITC
    case "TWO_WHEELER":
      return "#491027" // Bordô
    case "WALK":
      return "#7c3aed" // Roxo
    case "BICYCLE":
      return "#16a34a" // Verde
    case "TRANSIT":
      return "#f59e0b" // Âmbar
    default:
      return "#6b7280"
  }
}