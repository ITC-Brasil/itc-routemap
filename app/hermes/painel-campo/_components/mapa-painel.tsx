"use client"

/// <reference types="google.maps" />

import { useEffect, useRef, useState } from "react"

import { loadGoogleMaps } from "@/lib/google-maps-loader"
import { ESTILO_ESCURO } from "@/lib/mapa-estilo"
import type { UnidadePainel } from "@/lib/hermes/painel-campo"

/**
 * Mapa da coluna direita: um ponto por unidade, verde ou âmbar.
 *
 * Serve para responder "onde está o âmbar", não para identificar unidade
 * individual — com 12 pontos as siglas já se sobrepõem, e com 20 viram borrão.
 * Se a leitura geográfica ganhar importância, o caminho é agrupar por região
 * administrativa, não plotar rótulo.
 *
 * Sem controles: a TV não tem quem clique. `gestureHandling: "none"` evita que
 * um toque acidental na tela (várias são touch) deixe o mapa deslocado para
 * sempre, sem ninguém para arrastá-lo de volta.
 */

const VERDE = "#2ea043"
const AMBAR = "#d29922"

export function MapaPainel({ unidades }: { unidades: UnidadePainel[] }) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const marcadoresRef = useRef<google.maps.Marker[]>([])
  const [pronto, setPronto] = useState(false)
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    let cancelado = false

    loadGoogleMaps()
      .then((g) => {
        if (cancelado || !divRef.current) return
        mapRef.current = new g.maps.Map(divRef.current, {
          center: { lat: -15.793, lng: -47.882 },
          zoom: 10,
          disableDefaultUI: true,
          gestureHandling: "none",
          keyboardShortcuts: false,
          styles: ESTILO_ESCURO,
        })
        setPronto(true)
      })
      .catch(() => {
        // Sem chave ou sem rede: a coluna vira um bloco discreto. O painel
        // continua útil — os cartões são o conteúdo principal, o mapa é apoio.
        if (!cancelado) setFalhou(true)
      })

    return () => {
      cancelado = true
      marcadoresRef.current.forEach((m) => m.setMap(null))
      marcadoresRef.current = []
    }
  }, [])

  useEffect(() => {
    if (!pronto || !mapRef.current || typeof window === "undefined") return
    const g = window.google
    if (!g?.maps) return
    const map = mapRef.current

    marcadoresRef.current.forEach((m) => m.setMap(null))
    marcadoresRef.current = []

    const bounds = new g.maps.LatLngBounds()
    let plotados = 0

    for (const unidade of unidades) {
      if (unidade.latitude === null || unidade.longitude === null) continue
      const posicao = { lat: unidade.latitude, lng: unidade.longitude }
      bounds.extend(posicao)
      plotados++

      marcadoresRef.current.push(
        new g.maps.Marker({
          position: posicao,
          map,
          title: unidade.sigla,
          // Descoberta desenha por cima e maior: numa nuvem de pontos, o que
          // importa é achar o âmbar sem procurar.
          zIndex: unidade.estado === "sem_tecnico" ? 20 : 10,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            fillColor: unidade.estado === "sem_tecnico" ? AMBAR : VERDE,
            fillOpacity: 1,
            strokeColor: "#0d1117",
            strokeWeight: 2,
            scale: unidade.estado === "sem_tecnico" ? 9 : 7,
          },
        })
      )
    }

    if (plotados > 0) map.fitBounds(bounds, 40)
  }, [pronto, unidades])

  const semCoordenada = unidades.every(
    (u) => u.latitude === null || u.longitude === null
  )

  return (
    <section className="relative overflow-hidden rounded-[0.6vw] ring-1 ring-[#21262d]">
      <div ref={divRef} className="size-full min-h-[30vh] bg-[#161b22]" />

      {(falhou || (pronto && semCoordenada)) && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#161b22] px-[1vw] text-center">
          <p className="font-mono text-[0.9vw] text-[#6e7681]">
            {falhou
              ? "mapa indisponível"
              : "unidades sem coordenada geocodificada"}
          </p>
        </div>
      )}
    </section>
  )
}
