# syntax=docker/dockerfile:1
# A diretiva `syntax` fixa o frontend do BuildKit, que é o que habilita o
# `--mount=type=cache` do stage `deps`. Docker 23+ já usa BuildKit por padrão
# e o Docker 29 do glpi-srv nem tem mais o builder clássico.
FROM node:20-alpine AS base
WORKDIR /app
# Telemetria do Next desligada em todos os stages: não há valor em enviá-la de
# dentro do build nem do container de produção.
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package*.json ./
# Cache mount do BuildKit: reaproveita o cache do npm (~/.npm) entre builds,
# evitando rebaixar todos os pacotes a cada `docker compose up -d --build` no
# servidor. O cache fica no builder, não vira camada da imagem.
RUN --mount=type=cache,target=/root/.npm npm ci

FROM base AS builder
# NEXT_PUBLIC_*: o Next embute no bundle do browser em BUILD-time,
# por isso chega como build arg (compose: build.args), não como
# environment de runtime.
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ARG NEXT_PUBLIC_SERVICE_ACCOUNT_EMAIL
ENV NEXT_PUBLIC_SERVICE_ACCOUNT_EMAIL=$NEXT_PUBLIC_SERVICE_ACCOUNT_EMAIL
# Heap maior para o type-check do `next build`. Sem isso o build FALHA dentro do
# container com "FATAL ERROR: Ineffective mark-compacts near heap limit -
# JavaScript heap out of memory" (verificado no ensaio de deploy de 2026-07-27:
# compila em ~44s e estoura no TypeScript). Mesmo valor usado no host.
ENV NODE_OPTIONS="--max-old-space-size=6144"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
