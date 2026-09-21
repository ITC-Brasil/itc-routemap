import type { Metadata } from "next"

/**
 * Layout das telas do mural HERMES.
 *
 * Fora de `(privado)` de propósito: nada de Rail, navbar, AuthGuard ou
 * qualquer navegação. A TV não faz login e o painel é somente leitura — não há
 * para onde ir a partir dele, e um link ali seria um jeito de alguém sair da
 * tela sem querer e ninguém perceber por dias.
 *
 * Tema escuro fixo, não o do sistema: mural de monitoramento fica aceso 24h e
 * fundo claro numa TV grande ilumina a sala inteira à noite. Se TV1 e TV2
 * forem claras, os tokens estão todos neste arquivo — é aqui que se troca.
 */
export const metadata: Metadata = {
  title: "TV3 · Campo · Alocação",
  // Painel interno num mural: não deve aparecer em busca nenhuma.
  robots: { index: false, follow: false },
}

export default function HermesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      // `h-screen` + `overflow-hidden`: a tela é exatamente a viewport e nunca
      // rola. Se o conteúdo não coube, o certo é a faixa de densidade mudar —
      // rolagem numa TV esconde dado de quem passa no corredor, porque não há
      // quem role. `box-border` faz o padding de overscan caber dentro da
      // altura em vez de somar a ela.
      className="box-border flex h-screen flex-col overflow-hidden bg-[#0d1117] text-[#e6edf3]"
      style={{
        // A seta parada no meio da tela é o defeito mais comum destes painéis:
        // alguém mexe no mouse do mini-PC uma vez e ela fica lá por semanas.
        cursor: "none",
        // Overscan: algumas TVs cortam a borda do sinal. A margem evita perder
        // justamente o rodapé, que é onde está o carimbo que diz se o dado é
        // confiável. Em `vw`/`vh` e não `%`: padding percentual se resolve
        // contra a LARGURA nos quatro lados, então "2%" dava 38px em cima e
        // embaixo num 1920 e empurrava a tela para além da altura.
        padding: "1.6vh 1.6vw",
      }}
    >
      {children}
    </div>
  )
}
