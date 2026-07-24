import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Fixa a raiz do workspace no diretorio do projeto. Sem isso o Turbopack
  // infere a raiz errada quando existe outro package-lock.json acima
  // (ex: em C:\Users\<user>\), emitindo aviso de multiplos lockfiles.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
