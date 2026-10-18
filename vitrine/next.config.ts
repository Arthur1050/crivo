import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // AD-025: a vitrine precisa de Cache Components, que o CRM mantém desligado (AD-007).
  cacheComponents: true,
  cacheLife: {
    // AD-042: pior caso de 5 min quando o aviso de revalidação falha.
    vitrine: { stale: 60, revalidate: 60, expire: 300 },
  },
  // F19: com um `package-lock.json` também na raiz do repositório, o Next
  // escolheria a raiz do repositório como raiz do Turbopack (e avisaria).
  // As duas raízes precisam ser iguais: se divergem, o Next usa
  // `outputFileTracingRoot`, que a Vercel preenche com a raiz do repositório
  // (NEXT_PRIVATE_OUTPUT_TRACE_ROOT), e o Turbopack passa a compilar o
  // `proxy.ts` do CRM (AD-025: a vitrine não tem proxy).
  outputFileTracingRoot: path.resolve(__dirname),
  turbopack: { root: path.resolve(__dirname) },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // AD-043: noindex em toda rota, inclusive imagem e API.
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
