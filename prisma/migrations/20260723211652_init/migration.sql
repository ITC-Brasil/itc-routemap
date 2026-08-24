-- CreateTable
CREATE TABLE "convites" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "consumidoEm" TIMESTAMP(3),
    "consumidoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT,

    CONSTRAINT "convites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projetos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sigla" TEXT NOT NULL,
    "cor" TEXT NOT NULL DEFAULT '#008F95',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "sheetId" TEXT NOT NULL DEFAULT '',
    "sheetUrl" TEXT NOT NULL DEFAULT '',
    "sheetAbas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ultimaSincronizacao" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projetos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ras" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL DEFAULT '#008F95',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ums" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL DEFAULT '#008F95',
    "projetoId" TEXT NOT NULL,
    "tecnicoAtualId" TEXT,
    "raAtualId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tecnicos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL DEFAULT '#008F95',
    "endereco" TEXT NOT NULL,
    "pontoReferencia" TEXT,
    "plusCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "modoPrincipal" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tecnicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pontos" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "raId" TEXT,
    "linhaOrigem" INTEGER NOT NULL DEFAULT 0,
    "umNome" TEXT NOT NULL,
    "raNome" TEXT NOT NULL,
    "ciclo" INTEGER NOT NULL,
    "etapa" INTEGER NOT NULL,
    "tecnicoNomeHistorico" TEXT NOT NULL DEFAULT '',
    "uf" TEXT NOT NULL DEFAULT '',
    "endereco" TEXT NOT NULL,
    "referencia" TEXT,
    "plusCode" TEXT,
    "linkMaps" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'Pendente',
    "hashMd5" TEXT NOT NULL DEFAULT '',
    "tecnicoId" TEXT,
    "rotaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pontos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rotas" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "loteOrdem" INTEGER NOT NULL,
    "loteJustificativa" TEXT NOT NULL DEFAULT '',
    "origemDecisao" TEXT NOT NULL DEFAULT 'auto',
    "tecnicoId" TEXT NOT NULL,
    "tecnicoNome" TEXT NOT NULL,
    "pontoId" TEXT NOT NULL,
    "umNome" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "projetoSigla" TEXT NOT NULL DEFAULT '',
    "origemEndereco" TEXT NOT NULL,
    "origemLatitude" DOUBLE PRECISION NOT NULL,
    "origemLongitude" DOUBLE PRECISION NOT NULL,
    "destinoEndereco" TEXT NOT NULL,
    "destinoLatitude" DOUBLE PRECISION NOT NULL,
    "destinoLongitude" DOUBLE PRECISION NOT NULL,
    "metricas" JSONB NOT NULL DEFAULT '{}',
    "modoPrincipal" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Sugerida',
    "realocadaDe" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "papel" TEXT NOT NULL DEFAULT 'operador',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "convites_email_key" ON "convites"("email");

-- CreateIndex
CREATE UNIQUE INDEX "projetos_sigla_key" ON "projetos"("sigla");

-- CreateIndex
CREATE UNIQUE INDEX "ras_nome_key" ON "ras"("nome");

-- CreateIndex
CREATE INDEX "ums_projetoId_idx" ON "ums"("projetoId");

-- CreateIndex
CREATE INDEX "pontos_projetoId_idx" ON "pontos"("projetoId");

-- CreateIndex
CREATE INDEX "pontos_raNome_idx" ON "pontos"("raNome");

-- CreateIndex
CREATE INDEX "rotas_loteId_loteOrdem_idx" ON "rotas"("loteId", "loteOrdem");

-- CreateIndex
CREATE INDEX "rotas_status_criadoEm_idx" ON "rotas"("status", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
