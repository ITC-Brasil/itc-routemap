import Image from "next/image"

/**
 * Marca ITC RouteMap — versão animada com queda para a estática.
 *
 * O pacote de identidade trouxe os SVGs animados (SMIL, laço de 4s) e o estado de
 * repouso da animação é idêntico ao arquivo estático. SMIL **não** respeita
 * `prefers-reduced-motion` por conta própria, então a troca é feita aqui: os dois
 * arquivos são renderizados e as variantes `motion-safe`/`motion-reduce` do
 * Tailwind decidem qual aparece. Sem JavaScript e sem flash na hidratação.
 *
 * A composição ciano + branco (`-negative-color`) não vinha no pacote: havia
 * `negative` (tudo branco) e `color` (símbolo ciano com texto #1B1B1B, que
 * desaparece no escuro). Foi composta a partir das duas.
 */

type Props = {
  /** Largura em px do arquivo (o SVG escala pela classe). */
  width: number
  height: number
  className?: string
  priority?: boolean
}

export function LockupRouteMap({ width, height, className, priority }: Props) {
  return (
    <>
      <Image
        src="/logos/lockup/routemap-lockup-horizontal-animated-negative-color.svg"
        alt="ITC RouteMap"
        width={width}
        height={height}
        priority={priority}
        className={`hidden motion-safe:block ${className ?? ""}`}
      />
      <Image
        src="/logos/lockup/routemap-lockup-horizontal-negative-color.svg"
        alt="ITC RouteMap"
        width={width}
        height={height}
        priority={priority}
        className={`motion-reduce:block hidden ${className ?? ""}`}
      />
    </>
  )
}

/** Só o símbolo de rota, em branco — para o quadrado teal do rail. */
export function SimboloRouteMap({ className }: { className?: string }) {
  return (
    <>
      <Image
        src="/logos/animado/routemap-simbolo-animado-branco.svg"
        alt=""
        aria-hidden="true"
        width={26}
        height={26}
        className={`hidden motion-safe:block ${className ?? ""}`}
      />
      <Image
        src="/logos/routemap-simbolo-branco.svg"
        alt=""
        aria-hidden="true"
        width={26}
        height={26}
        className={`motion-reduce:block hidden ${className ?? ""}`}
      />
    </>
  )
}
