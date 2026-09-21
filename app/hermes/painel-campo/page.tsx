import { montarPainelCampo, type PainelCampo } from "@/lib/hermes/painel-campo"
import { verificarAcessoHermes } from "@/lib/hermes/acesso"
import { PainelTv } from "./_components/painel-tv"

/**
 * TV3 · CAMPO · ALOCAÇÃO — a página que a TV abre.
 *
 * Server component: confere o acesso, monta o primeiro dado no servidor e
 * entrega a tela já preenchida. A partir daí quem atualiza é o cliente, a cada
 * 60s, contra /api/hermes/painel-campo — a mesma função por baixo.
 *
 * Renderizar o primeiro estado no servidor importa aqui mais que no resto do
 * app: se a TV religar durante uma queda de rede, ela mostra o que o servidor
 * conseguiu montar em vez de um esqueleto vazio para sempre.
 */
export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function PainelCampoPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  // O `request.url` não existe em server component; o token da query é lido
  // aqui e repassado ao verificador, que também aceita o header.
  const acesso = await verificarAcessoHermes(
    token ? `https://painel.local/?token=${encodeURIComponent(token)}` : undefined
  )

  if (!acesso.permitido) {
    return <TelaNegada motivo={acesso.motivo} />
  }

  // Se o banco estiver fora no primeiro render, não há "último dado bom" para
  // preservar — mas também não pode aparecer a tela de erro do Next numa TV de
  // mural. O painel monta vazio, com o carimbo já envelhecendo: o cliente tenta
  // de novo em 60s e a tela se preenche sozinha quando o banco voltar.
  let inicial: PainelCampo
  try {
    inicial = await montarPainelCampo()
  } catch (err) {
    console.error("[hermes] falha ao montar o painel no servidor:", err)
    inicial = PAINEL_VAZIO
  }

  return <PainelTv inicial={inicial} token={token ?? null} />
}

/**
 * Estado inicial quando nem o servidor conseguiu montar o dado.
 *
 * `loteConfirmadoEm: null` faz a tela cair no "Nenhum lote confirmado", que é
 * o texto correto para uma TV: não mente sobre o campo, não mostra grade vazia
 * e não expõe erro técnico para quem passa no corredor.
 */
const PAINEL_VAZIO: PainelCampo = {
  geradoEm: new Date().toISOString(),
  ancoraChegada: null,
  loteConfirmadoEm: null,
  totais: {
    unidades: 0,
    cobertas: 0,
    semTecnico: 0,
    deslocamentoTotalSeg: 0,
    deslocamentoMedioSeg: 0,
  },
  unidades: [],
  tecnicosSemUnidade: [],
}

/**
 * Acesso negado — texto grande e sem detalhe técnico.
 *
 * Quem vê esta tela é quem passa pelo corredor, não quem a configurou. O
 * motivo exato fica no log do servidor.
 */
function TelaNegada({ motivo }: { motivo: string }) {
  return (
    <main className="flex min-h-[90vh] flex-col items-center justify-center gap-4 text-center">
      <p className="font-mono text-[1.4vw] uppercase tracking-[0.35em] text-[#7d8590]">
        TV3 · Campo · Alocação
      </p>
      <p className="text-[3vw] font-bold text-[#d29922]">Acesso não autorizado</p>
      <p className="max-w-[50vw] text-[1.2vw] text-[#7d8590]">{motivo}</p>
    </main>
  )
}
