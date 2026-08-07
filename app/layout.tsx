import type { Metadata } from "next";
import { Archivo, Inter, Poppins } from "next/font/google";
import { AuthProvider } from "@/contexts/auth-context";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { BackgroundGrid } from "@/components/background-grid"


// Pesos idênticos aos que o protótipo v2 carrega do Google Fonts:
// Archivo 600;700;800 · Inter 300;400;500;600;700 · Poppins 200;300.
// O mono não é uma webfont no protótipo — usa a pilha do sistema (ver
// --font-mono em globals.css), então Space Mono saiu.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// Carregada por decisão do time, para uso pontual em display.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["200", "300"],
});

export const metadata: Metadata = {
  title: "ITC RouteMap",
  description: "Sistema de Alocação Inteligente de Técnicos — Grupo ITC Brasil",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${archivo.variable} ${inter.variable} ${poppins.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <BackgroundGrid />
          <AuthProvider>{children}</AuthProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}