/// <reference types="google.maps" />

/**
 * Estilo do Google Maps por tema — compartilhado pelo mapa de um par
 * (`MapaAlocacao`) e pelo mapa do lote (`MapaLote`).
 *
 * No claro, a base do Google já é clara e só tiramos o ruído (POIs e ícones de
 * transporte não pedidos). No escuro é obrigatório: a base padrão fica BRANCA
 * dentro de uma tela escura e ofusca — o mapa passava a ser a coisa mais luminosa
 * da página.
 *
 * Os tons acompanham os tokens do tema escuro (--bg-surface, --bg-muted,
 * --border) para o mapa não parecer uma janela recortada de outro produto.
 */

export const ESTILO_CLARO: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  {
    featureType: "transit",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }],
  },
]

export const ESTILO_ESCURO: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1E2422" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8E9A98" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#141918" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2A302E" }] },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#333B39" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#3A423F" }],
  },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0C1615" }] },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#181E1D" }],
  },
]
