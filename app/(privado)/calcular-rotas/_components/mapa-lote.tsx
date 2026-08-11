/// <reference types="google.maps" />
"use client"

// Mapa do LOTE — todos os pares de uma alocação num único mapa.
//
// É o elemento principal do Resultado e do Detalhe do lote no protótipo v2, e a
// razão é de leitura: a distribuição geográfica de uma alocação se entende num
// relance, antes de ler par por par. O mapa de um par (MapaAlocacao) continua
// existindo dentro do card expandido; este é adicional, não substituto.
//
// Nenhuma chamada externa: o componente recebe o que já está em memória. Onde a
// polyline do par já foi carregada (o par foi expandido em algum momento), desenha
// o caminho real; onde não, a ligação reta tracejada — a mesma convenção do mapa
// de um par, então o mapa mostra sozinho o que já foi buscado.

import { useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { loadGoogleMaps } from "@/lib/google-maps-loader"
import { ESTILO_CLARO, ESTILO_ESCURO } from "@/lib/mapa-estilo"

export type ParNoMapa = {
  /** Chave estável do par — a mesma usada para destacar e para o cache de rota. */
  chave: string
  tecnicoNome: string
  umNome: string
  origem: { latitude: number; longitude: number }
  destino: { latitude: number; longitude: number }
  corTecnico: string
  corProjeto: string
  /** Polyline codificada, quando já carregada para este par. */
  polyline: string | null
}

interface Props {
  pares: ParNoMapa[]
  /** Par destacado — o expandido no card. */
  chaveSelecionada?: string | null
  altura?: number
  className?: string
}

export function MapaLote({
  pares,
  chaveSelecionada,
  altura = 460,
  className,
}: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const desenhosRef = useRef<Array<google.maps.Polyline | google.maps.Marker>>([])
  const [pronto, setPronto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const { resolvedTheme } = useTheme()
  const escuro = resolvedTheme === "dark"

  // ====== Cria o mapa uma vez ======
  useEffect(() => {
    let cancelado = false

    async function init() {
      try {
        const g = await loadGoogleMaps()
        if (cancelado || !divRef.current) return
        mapRef.current = new g.maps.Map(divRef.current, {
          center: { lat: -15.793, lng: -47.882 },
          zoom: 10,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
          mapTypeControl: false,
          streetViewControl: false,
          styles: escuro ? ESTILO_ESCURO : ESTILO_CLARO,
        })
        setPronto(true)
      } catch (err) {
        if (!cancelado) setErro(err instanceof Error ? err.message : String(err))
      }
    }

    init()
    return () => {
      cancelado = true
      desenhosRef.current.forEach((d) => d.setMap(null))
      desenhosRef.current = []
    }
  }, [escuro])

  // ====== Estilo acompanha o alternador, sem recriar o mapa ======
  useEffect(() => {
    mapRef.current?.setOptions({ styles: escuro ? ESTILO_ESCURO : ESTILO_CLARO })
  }, [escuro])

  // ====== Redesenha pares, destaque e enquadramento ======
  useEffect(() => {
    if (!pronto || !mapRef.current || typeof window === "undefined") return
    const g = window.google
    if (!g?.maps) return
    const map = mapRef.current

    desenhosRef.current.forEach((d) => d.setMap(null))
    desenhosRef.current = []

    const bounds = new g.maps.LatLngBounds()
    const temSelecao = Boolean(chaveSelecionada)

    for (const par of pares) {
      const selecionado = par.chave === chaveSelecionada
      // Sem seleção, todos os pares têm o mesmo peso. Com seleção, os outros
      // recuam para 25% — é o "acender" do protótipo, feito por contraste em vez
      // de esconder o resto, que perderia o contexto geográfico.
      const atenuar = temSelecao && !selecionado
      const opacidade = atenuar ? 0.25 : 1

      const o = { lat: par.origem.latitude, lng: par.origem.longitude }
      const d = { lat: par.destino.latitude, lng: par.destino.longitude }
      bounds.extend(o)
      bounds.extend(d)

      if (par.polyline) {
        const path = g.maps.geometry.encoding.decodePath(par.polyline)
        desenhosRef.current.push(
          new g.maps.Polyline({
            path,
            strokeColor: par.corTecnico,
            strokeOpacity: opacidade,
            strokeWeight: selecionado ? 5 : 3,
            zIndex: selecionado ? 20 : 10,
            map,
          })
        )
        path.forEach((p) => bounds.extend(p))
      } else {
        desenhosRef.current.push(
          new g.maps.Polyline({
            path: [o, d],
            geodesic: true,
            strokeOpacity: 0,
            zIndex: selecionado ? 20 : 5,
            icons: [
              {
                icon: {
                  path: "M 0,-1 0,1",
                  strokeOpacity: 0.4 * opacidade,
                  scale: 1.5,
                  strokeColor: par.corTecnico,
                },
                offset: "0",
                repeat: "12px",
              },
            ],
            map,
          })
        )
      }

      desenhosRef.current.push(
        new g.maps.Marker({
          position: o,
          map,
          opacity: opacidade,
          zIndex: selecionado ? 30 : 10,
          icon: ponto(g, par.corTecnico, selecionado ? 8 : 6),
          title: `${par.tecnicoNome} (origem)`,
        }),
        new g.maps.Marker({
          position: d,
          map,
          opacity: opacidade,
          zIndex: selecionado ? 30 : 10,
          icon: ponto(g, par.corProjeto, selecionado ? 9 : 7),
          title: `${par.umNome} (destino)`,
        })
      )
    }

    if (!bounds.isEmpty()) {
      // Com um par destacado, enquadra nele; sem destaque, o lote inteiro.
      if (temSelecao) {
        const sel = pares.find((p) => p.chave === chaveSelecionada)
        if (sel) {
          const b = new g.maps.LatLngBounds()
          b.extend({ lat: sel.origem.latitude, lng: sel.origem.longitude })
          b.extend({ lat: sel.destino.latitude, lng: sel.destino.longitude })
          map.fitBounds(b, 80)
          return
        }
      }
      map.fitBounds(bounds, 50)
    }
  }, [pronto, pares, chaveSelecionada])

  return (
    <div className={`relative ${className ?? ""}`}>
      <div
        ref={divRef}
        style={{ height: altura }}
        className="w-full bg-muted"
        aria-label="Mapa do lote"
      />
      {!pronto && !erro && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="h-4 w-32 animate-pulse rounded bg-skeleton" />
        </div>
      )}
      {erro && (
        <div className="absolute inset-0 flex items-center justify-center bg-destructive/10 text-sm text-destructive">
          Erro no mapa: {erro}
        </div>
      )}
    </div>
  )
}

/** Ponto circular preenchido com a cor do cadastro, com anel branco. */
function ponto(
  g: typeof google,
  cor: string,
  escala: number
): google.maps.Symbol {
  return {
    path: g.maps.SymbolPath.CIRCLE,
    fillColor: cor,
    fillOpacity: 1,
    strokeColor: "#FFFFFF",
    strokeWeight: 1.5,
    scale: escala,
  }
}
