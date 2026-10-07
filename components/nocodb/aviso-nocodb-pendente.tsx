"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  contarPontosNocodbPendentes,
  reenviarPontosNocodbPendentes,
} from "@/lib/actions/nocodb"
import type { ResultadoEscritaNocodb } from "@/lib/db/escrita-nocodb"

/**
 * Escrita de volta no NocoDB que falhou — o aviso que não deixa a falha
 * passar em silêncio.
 *
 * Dois pontos de contato:
 *  - `avisarResultadoNocodb`: toast na hora, logo depois de confirmar ou
 *    cancelar, com o botão de reenvio.
 *  - `<AvisoNocodbPendente />`: faixa fixa no layout enquanto houver ponto com
 *    `nocodbPendente`. Sobrevive a navegação e a recarregar a página, que é
 *    o que o toast não faz.
 */

const EVENTO = "nocodb-pendentes-mudou"

/** Reenvia todos os pendentes e mostra o resultado. */
async function reenviar(): Promise<void> {
  try {
    const resultado = await reenviarPontosNocodbPendentes()
    if (resultado.ok) {
      toast.success("NocoDB atualizado", {
        description: `${resultado.linhasGravadas} linha${resultado.linhasGravadas === 1 ? "" : "s"} gravada${resultado.linhasGravadas === 1 ? "" : "s"}.`,
      })
    } else {
      toast.error("O NocoDB ainda não foi atualizado", {
        description: resultado.erro,
      })
    }
  } catch (err) {
    toast.error("Erro ao reenviar ao NocoDB", {
      description: err instanceof Error ? err.message : "Tente novamente.",
    })
  } finally {
    window.dispatchEvent(new Event(EVENTO))
  }
}

/**
 * Chame depois de confirmar, re-otimizar ou cancelar. Sucesso não mostra nada
 * (o toast da própria ação já basta); falha mostra aviso com reenvio.
 */
export function avisarResultadoNocodb(
  resultado: ResultadoEscritaNocodb,
  acao: string
): void {
  window.dispatchEvent(new Event(EVENTO))
  if (resultado.ok) return

  toast.warning(`${acao}, mas o NocoDB não foi atualizado`, {
    description: `${resultado.pontosPendentes} ponto${resultado.pontosPendentes === 1 ? "" : "s"} aguardando reenvio. ${resultado.erro}`,
    duration: Infinity,
    action: { label: "Reenviar ao NocoDB", onClick: () => void reenviar() },
  })
}

export function AvisoNocodbPendente() {
  const pathname = usePathname()
  const [pendentes, setPendentes] = useState(0)
  const [reenviando, setReenviando] = useState(false)

  useEffect(() => {
    let ativo = true
    const buscar = () => {
      contarPontosNocodbPendentes()
        .then((n) => {
          if (ativo) setPendentes(n)
        })
        .catch(() => {
          // Sem sessão ou banco fora: a faixa só some. O erro de verdade
          // aparece na tela que tentou a operação.
        })
    }
    buscar()
    window.addEventListener(EVENTO, buscar)
    return () => {
      ativo = false
      window.removeEventListener(EVENTO, buscar)
    }
  }, [pathname])

  if (pendentes === 0) return null

  const handleReenviar = async () => {
    setReenviando(true)
    await reenviar()
    setReenviando(false)
  }

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-lg border border-warn bg-warn-tint p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-warn">
            {pendentes} ponto{pendentes === 1 ? "" : "s"} não{" "}
            {pendentes === 1 ? "foi gravado" : "foram gravados"} no NocoDB
          </p>
          <p className="max-w-[640px] text-pretty text-[13px] leading-relaxed text-warn/80">
            A alocação está salva no RouteMap, mas o Técnico e o Status no
            NocoDB estão desatualizados. Enquanto isso, a sincronização não
            altera esses pontos.
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        onClick={handleReenviar}
        disabled={reenviando}
        className="shrink-0 gap-2"
      >
        <RefreshCw className={`size-4 ${reenviando ? "animate-spin" : ""}`} />
        {reenviando ? "Reenviando..." : "Reenviar ao NocoDB"}
      </Button>
    </div>
  )
}
