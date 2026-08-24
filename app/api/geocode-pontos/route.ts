// app/api/geocode-pontos/route.ts
//
// Endpoint de batch geocoding: processa pontos com status="Pendente" e que
// estejam SEM latitude/longitude no Postgres, geocodifica os endereços
// usando a Google Maps Geocoding API, e atualiza o registro.
//
// Pensado pra ser chamado automaticamente APÓS uma sincronização do Sheets
// bem-sucedida (mas pode rodar isolado para debug/correções).
//
// Idempotente: pontos que JÁ TÊM lat/lng são ignorados (não desperdiça API).

import { NextResponse } from "next/server"
import { exigirSessaoApi } from "@/lib/session-server"
import {
  listarPontosPendentesSemCoordenadas,
  atualizarCoordenadasPontosEmLote,
} from "@/lib/db/pontos"
import { geocodificarLote } from "@/lib/google-geocoding"

// ============================================================
// TIPOS
// ============================================================

type RequestBody = {
  /** Se informado, restringe aos pontos desse projeto. Sem isso = todos. */
  projetoId?: string
}

type ResultadoPorPonto = {
  pontoId: string
  umNome: string
  endereco: string
  sucesso: boolean
  erro?: string
  coordenadas?: { latitude: number; longitude: number }
}

// ============================================================
// HANDLER
// ============================================================

export async function POST(request: Request) {
  // Blindagem: sessao obrigatoria ANTES de qualquer escrita no banco ou
  // chamada paga a API externa.
  const { erro: erroSessao } = await exigirSessaoApi()
  if (erroSessao) return erroSessao

  const inicio = Date.now()

  try {
    // Body opcional
    let body: RequestBody = {}
    try {
      body = await request.json()
    } catch {
      // sem body = processa todos
    }

    // 1. Busca candidatos no Postgres: status=Pendente e sem latitude/longitude
    //    (filtro na query). O recorte de endereço vazio é feito aqui com
    //    trim(), preservando a semântica da versão Firestore.
    const pendentes = await listarPontosPendentesSemCoordenadas(body.projetoId)
    const candidatos = pendentes.filter(
      (p) => typeof p.endereco === "string" && p.endereco.trim().length > 0,
    )

    // Caso degenerado: nada pra fazer
    if (candidatos.length === 0) {
      return NextResponse.json({
        sucesso: true,
        total: 0,
        geocodados: 0,
        falhas: 0,
        resultados: [],
        duracaoMs: Date.now() - inicio,
      })
    }

    // 2. Geocoda os endereços únicos em paralelo (com dedup interno)
    const enderecos = candidatos.map((p) => p.endereco.trim())
    const mapaResultados = await geocodificarLote(enderecos, 5)

    // 3. Monta os resultados e acumula as atualizações de coordenadas
    const resultados: ResultadoPorPonto[] = []
    const updates: { id: string; latitude: number; longitude: number }[] = []

    for (const p of candidatos) {
      const endereco = p.endereco.trim()
      const umNome = p.umNome || p.id

      const r = mapaResultados.get(endereco)

      if (!r) {
        resultados.push({
          pontoId: p.id,
          umNome,
          endereco,
          sucesso: false,
          erro: "Endereço não foi processado (lote vazio)",
        })
        continue
      }

      if (!r.sucesso) {
        resultados.push({
          pontoId: p.id,
          umNome,
          endereco,
          sucesso: false,
          erro: r.erro,
        })
        continue
      }

      // Geocoding deu certo → agenda update do ponto
      updates.push({
        id: p.id,
        latitude: r.coordenadas.latitude,
        longitude: r.coordenadas.longitude,
      })
      resultados.push({
        pontoId: p.id,
        umNome,
        endereco,
        sucesso: true,
        coordenadas: r.coordenadas,
      })
    }

    // 4. Grava tudo numa única transação atômica (só se houver update real)
    if (updates.length > 0) {
      await atualizarCoordenadasPontosEmLote(updates)
    }

    const geocodados = resultados.filter((r) => r.sucesso).length
    const falhas = resultados.filter((r) => !r.sucesso).length

    return NextResponse.json({
      sucesso: true,
      total: candidatos.length,
      geocodados,
      falhas,
      resultados,
      duracaoMs: Date.now() - inicio,
    })
  } catch (err) {
    console.error("Erro em /api/geocode-pontos:", err)
    const mensagem = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { sucesso: false, erro: "Erro interno", detalhe: mensagem },
      { status: 500 },
    )
  }
}
