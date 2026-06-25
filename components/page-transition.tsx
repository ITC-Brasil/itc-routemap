"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [displayChildren, setDisplayChildren] = useState(children)
  const [transitionState, setTransitionState] = useState<"idle" | "exit" | "enter">("idle")
  const prevPathnameRef = useRef(pathname)

  useEffect(() => {
    if (pathname === prevPathnameRef.current) return
    prevPathnameRef.current = pathname

    setTransitionState("exit")
    const t1 = setTimeout(() => {
      setDisplayChildren(children)
      setTransitionState("enter")
      const t2 = setTimeout(() => setTransitionState("idle"), 400)
      return () => clearTimeout(t2)
    }, 250)
    return () => clearTimeout(t1)
  }, [pathname, children])

  useEffect(() => {
    if (transitionState === "idle") {
      setDisplayChildren(children)
    }
  }, [children, transitionState])

  const style: React.CSSProperties = {
    transition: "transform 400ms cubic-bezier(0.4,0,0.2,1), opacity 400ms ease",
    willChange: "transform, opacity",
    ...(transitionState === "exit" && {
      transform: "translateX(-40%)",
      opacity: 0,
    }),
    ...(transitionState === "enter" && {
      transform: "translateX(4%)",
      opacity: 0,
      transition: "none",
    }),
    ...(transitionState === "idle" && {
      transform: "translateX(0)",
      opacity: 1,
    }),
  }

  return (
    <div style={style}>
      {displayChildren}
    </div>
  )
}
