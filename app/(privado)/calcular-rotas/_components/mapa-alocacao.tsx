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
// - Se rotaData.polyline for null, mostra linha reta TRACEJADA e fina, na cor do
//   técnico a 40%. Com a polyline, traçado SÓLIDO de 3px na cor cheia. A diferença
//   é informação: o mapa mostra sozinho se o caminho real já foi carregado ou se
//   aquilo ali é só a ligação entre dois pontos.
//
// Sobre o renderizador: o protótipo usa Leaflet + OpenStreetMap (itc-map.js), mas
// este componente JÁ usava a Google Maps JS API — e é o que deve continuar, porque
// as rotas vêm da Google Routes API e o traçado precisa cair sobre a mesma base
// cartográfica. Leaflet não entra no projeto.

import { useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { loadGoogleMaps } from "@/lib/google-maps-loader"
import type { ModoTransporte } from "@/lib/rotas-utils"

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
  /** Cor cadastrada do técnico — marcador de origem e o traçado (system.md §5.4). */
  corTecnico?: string
  /** Cor cadastrada do projeto — marcador de destino. */
  corProjeto?: string
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
  corTecnico,
  corProjeto,
  carregando,
  erro,
  className,
}: Props) {
  const { resolvedTheme } = useTheme()
  const escuro = resolvedTheme === "dark"
  // A cor do traçado é a do técnico: é o deslocamento DELE. O modo já aparece em
  // texto ao lado do mapa, e colorir por modo competia com a cor do cadastro.
  const corRota = corTecnico ?? corDoModo(modo)
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
          styles: escuro ? ESTILO_ESCURO : ESTILO_CLARO,
        })

        mapInstanceRef.current = map

        // Marcadores na cor do cadastro: origem = técnico, destino = projeto
        // (system.md §5.4). Antes eram os pinos vermelhos padrão do Google, iguais
        // em todo par — não davam para relacionar mapa e lista.
        markersRef.current = [
          new g.maps.Marker({
            position: { lat: origem.latitude, lng: origem.longitude },
            map,
            icon: marcador(g, corTecnico ?? "#008F95"),
            label: { text: "A", color: "#FFFFFF", fontWeight: "bold", fontSize: "11px" },
            title: "Origem (técnico)",
          }),
          new g.maps.Marker({
            position: { lat: destino.latitude, lng: destino.longitude },
            map,
            icon: marcador(g, corProjeto ?? "#491027"),
            label: { text: "B", color: "#FFFFFF", fontWeight: "bold", fontSize: "11px" },
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
    
  }, [
    origem.latitude,
    origem.longitude,
    destino.latitude,
    destino.longitude,
    corTecnico,
    corProjeto,
    escuro,
  ])

  // ====== 1b. Alternância de tema sem recriar o mapa ======
  useEffect(() => {
    mapInstanceRef.current?.setOptions({
      styles: escuro ? ESTILO_ESCURO : ESTILO_CLARO,
    })
  }, [escuro])

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

    if (rotaData.polyline) {
      // Caminho REAL: a mesma geometria que a Routes API calculou, já no corpo do
      // /api/routes/single. Nenhuma chamada nova — só decodificar e desenhar.
      const path = g.maps.geometry.encoding.decodePath(rotaData.polyline)
      polylineRef.current = new g.maps.Polyline({
        path,
        strokeColor: corRota,
        strokeOpacity: 1,
        strokeWeight: 3,
        map: mapInstanceRef.current,
      })

      // Reajusta bounds pra incluir toda a rota
      const bounds = new g.maps.LatLngBounds()
      path.forEach((p) => bounds.extend(p))
      mapInstanceRef.current.fitBounds(bounds, 60)
    } else {
      // Estado intermediário: ligação reta, tracejada e fina, na cor do técnico a
      // 40%. Não promete ser caminho — e a diferença de peso diz, sem legenda,
      // que o traçado real ainda não foi carregado.
      polylineRef.current = new g.maps.Polyline({
        path: [
          { lat: origem.latitude, lng: origem.longitude },
          { lat: destino.latitude, lng: destino.longitude },
        ],
        geodesic: true,
        strokeOpacity: 0,
        icons: [
          {
            icon: {
              path: "M 0,-1 0,1",
              strokeOpacity: 0.4,
              scale: 1.5,
              strokeColor: corRota,
            },
            offset: "0",
            repeat: "12px",
          },
        ],
        map: mapInstanceRef.current,
      })
    }
  }, [
    mapPronto,
    rotaData,
    corRota,
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

/** Marcador circular preenchido com a cor do cadastro, com anel branco. */
function marcador(
  g: typeof google,
  cor: string
): google.maps.Symbol {
  return {
    path: g.maps.SymbolPath.CIRCLE,
    fillColor: cor,
    fillOpacity: 1,
    strokeColor: "#FFFFFF",
    strokeWeight: 2,
    scale: 9,
  }
}

/**
 * Estilo do mapa por tema.
 *
 * No claro, a base do Google é clara e só tiramos o ruído (POIs e transporte não
 * pedidos). No escuro é obrigatório: a base padrão fica BRANCA dentro de uma tela
 * escura e ofusca — o mapa passava a ser a coisa mais luminosa da página.
 */
const ESTILO_CLARO: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
]

const ESTILO_ESCURO: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1E2422" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8E9A98" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#141918" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2A302E" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#333B39" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3A423F" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0C1615" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#181E1D" }] },
]

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