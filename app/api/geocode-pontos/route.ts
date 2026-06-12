// app/api/geocode-pontos/route.ts
//
// Endpoint de batch geocoding: processa pontos com status="Pendente" e que
// estejam SEM latitude/longitude no Firestore, geocodifica os endereços
// usando a Google Maps Geocoding API, e atualiza o documento.
//
// Pensado pra ser chamado automaticamente APÓS uma sincronização do Sheets
// bem-sucedida (mas pode rodar isolado para debug/correções).
//
// Idempotente: pontos que JÁ TÊM lat/lng são ignorados (não desperdiça API).

import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/firebase-admin"
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
  const inicio = Date.now()

  try {
    const adminDb = getAdminDb()
    // Body opcional
    let body: RequestBody = {}
    try {
      body = await request.json()
    } catch {
      // sem body = processa todos
    }

    // 1. Busca candidatos no Firestore: status=Pendente, com endereço,
    //    e sem latitude/longitude. (O filtro de lat/lng não dá pra fazer
    //    direto na query do Firestore — fazemos client-side.)
    let query: FirebaseFirestore.Query = adminDb
      .collection("pontos")
      .where("status", "==", "Pendente")

    if (body.projetoId) {
      query = query.where("projetoId", "==", body.projetoId)
    }

    const snapshot = await query.get()
    const candidatos = snapshot.docs.filter((doc) => {
      const data = doc.data()
      return (
        (data.latitude == null || data.longitude == null) &&
        typeof data.endereco === "string" &&
        data.endereco.trim().length > 0
      )
    })

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
    const enderecos = candidatos.map(
      (doc) => (doc.data().endereco as string).trim(),
    )
    const mapaResultados = await geocodificarLote(enderecos, 5)

    // 3. Atualiza os documentos em batch
    const batch = adminDb.batch()
    const resultados: ResultadoPorPonto[] = []

    for (const doc of candidatos) {
      const data = doc.data()
      const endereco = (data.endereco as string).trim()
      const umNome = (data.umNome as string | undefined) ?? doc.id

      const r = mapaResultados.get(endereco)

      if (!r) {
        resultados.push({
          pontoId: doc.id,
          umNome,
          endereco,
          sucesso: false,
          erro: "Endereço não foi processado (lote vazio)",
        })
        continue
      }

      if (!r.sucesso) {
        resultados.push({
          pontoId: doc.id,
          umNome,
          endereco,
          sucesso: false,
          erro: r.erro,
        })
        continue
      }

      // Geocoding deu certo → atualiza ponto
      batch.update(doc.ref, {
        latitude: r.coordenadas.latitude,
        longitude: r.coordenadas.longitude,
        enderecoFormatado: r.enderecoFormatado,
        atualizadoEm: new Date(),
      })
      resultados.push({
        pontoId: doc.id,
        umNome,
        endereco,
        sucesso: true,
        coordenadas: r.coordenadas,
      })
    }

    // Só commita se houver alguma update real
    const temAtualizacao = resultados.some((r) => r.sucesso)
    if (temAtualizacao) {
      await batch.commit()
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