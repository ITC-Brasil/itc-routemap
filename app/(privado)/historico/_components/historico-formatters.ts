/**
 * Utilitários de formatação compartilhados pela tela de histórico.
 *
 * TODO P4: centralizar aqui formatadores que hoje vivem espalhados
 * (resultado-alocacao.tsx tem suas próprias versões). Quando consolidar,
 * substituir importações nos componentes existentes.
 */

import type { ModoTransporte } from "@/lib/firestore/rotas"

export function formatarDuracao(segundos: number): string {
  if (!segundos || segundos < 0) return "0min"
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

export function formatarDistancia(metros: number): string {
  if (!metros || metros < 0) return "0 km"
  const km = metros / 1000
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`
  return `${Math.round(km)} km`
}

export function nomeAmigavelModo(modo: ModoTransporte | string): string {
  switch (modo) {
    case "DRIVE":
      return "Carro"
    case "WALK":
      return "A pé"
    case "TRANSIT":
      return "Transporte público"
    case "BICYCLE":
      return "Bicicleta"
    case "TWO_WHEELER":
      return "Moto"
    default:
      return modo
  }
}

export function formatarData(data: Date): string {
  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function formatarDataHora(data: Date): string {
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}