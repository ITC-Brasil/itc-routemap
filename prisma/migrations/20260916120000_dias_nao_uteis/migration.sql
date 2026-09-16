-- CreateTable
CREATE TABLE "dias_nao_uteis" (
    "id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "descricao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dias_nao_uteis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dias_nao_uteis_data_key" ON "dias_nao_uteis"("data");
