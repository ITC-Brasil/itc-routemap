import { NextResponse } from "next/server"

import { montarPainelCampo } from "@/lib/hermes/painel-campo"
import { verificarAcessoHermes } from "@/lib/hermes/acesso"

/**
 * GET /api/hermes/painel-campo
 *
 * O mesmo dado que a página TV3 mostra, em JSON. Duração em segundos e
 * distância em metros: formatação é da camada de exibição, não do contrato.
 *
 * Sem sessão de usuário — quem autoriza é `verificarAcessoHermes` (token fixo
 * + faixa de IP). Somente leitura.
 */

// O painel reflete o último lote confirmado, que muda algumas vezes ao dia.
// `no-store` porque o valor de um carimbo de atualização é justamente não ser
// servido de cache: uma TV mostrando dado velho com cara de novo é pior que
// uma TV apagada.
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: Request) {
  const acesso = await verificarAcessoHermes(request.url)
  if (!acesso.permitido) {
    return NextResponse.json(
      { erro: acesso.motivo },
      { status: acesso.status, headers: { "Cache-Control": "no-store" } }
    )
  }

  try {
    const painel = await montarPainelCampo()
    return NextResponse.json(painel, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (err) {
    // O detalhe fica no log do servidor e NÃO volta no corpo. As outras rotas
    // do app devolvem `detalhe` porque exigem sessão de usuário; esta é
    // alcançável por qualquer TV do mural, e a mensagem de erro do Prisma traz
    // stack trace com caminho absoluto do filesystem e nome de tabela.
    console.error("Erro em /api/hermes/painel-campo:", err)
    return NextResponse.json(
      { erro: "Falha ao montar o painel." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    )
  }
}
