-- Etapa 15.0 + identidade do ponto no NocoDB.
--
-- A ordem importa: o índice único de ums.tecnicoAtualId só é criado DEPOIS do
-- backfill, e o backfill aborta a migração inteira se qualquer par não afetar
-- exatamente uma linha. Antes de aplicar: npm run checar:migracao-cobertura.

-- 1. Identidade do ponto na tabela Localidades do NocoDB
ALTER TABLE "pontos" ADD COLUMN "nocodbId" INTEGER;
CREATE UNIQUE INDEX "pontos_nocodbId_key" ON "pontos"("nocodbId");

-- 2. Escrita de volta no NocoDB que falhou e aguarda reenvio
ALTER TABLE "pontos" ADD COLUMN "nocodbPendente" BOOLEAN NOT NULL DEFAULT false;

-- 3. Backfill de ums.tecnicoAtualId
--
-- Emparelhamento literal, conferido no NocoDB (linhas "Atual") em 2026-10-07.
-- Casa por nome EXATO dos dois lados; não há casamento aproximado. Cada par
-- precisa encontrar exatamente uma UM e exatamente um técnico, senão a
-- migração falha e nada é gravado.
DO $$
DECLARE
  par RECORD;
  qtd_ums INTEGER;
  qtd_tecnicos INTEGER;
  afetadas INTEGER;
BEGIN
  FOR par IN
    SELECT * FROM (VALUES
      ('SPV01',    'Paulo'),
      ('SPV02',    'João Marcos'),
      ('BSBIA01',  'Allan'),
      ('BSBIA02',  'Mateus Fernandes'),
      ('BSBIA03',  'João Wesley'),
      ('BSBIA04',  'José Frederico'),
      ('CODHAB01', 'Lucas Andrade')
    ) AS t(um_nome, tecnico_nome)
  LOOP
    SELECT count(*) INTO qtd_ums FROM "ums" WHERE "nome" = par.um_nome;
    SELECT count(*) INTO qtd_tecnicos FROM "tecnicos" WHERE "nome" = par.tecnico_nome;

    IF qtd_ums <> 1 OR qtd_tecnicos <> 1 THEN
      RAISE EXCEPTION 'Backfill 15.0: % (% em ums) -> % (% em tecnicos). Esperado 1 e 1.',
        par.um_nome, qtd_ums, par.tecnico_nome, qtd_tecnicos;
    END IF;

    UPDATE "ums"
       SET "tecnicoAtualId" = (SELECT "id" FROM "tecnicos" WHERE "nome" = par.tecnico_nome)
     WHERE "nome" = par.um_nome;

    GET DIAGNOSTICS afetadas = ROW_COUNT;
    IF afetadas <> 1 THEN
      RAISE EXCEPTION 'Backfill 15.0: UPDATE de % -> % afetou % linha(s), esperado 1.',
        par.um_nome, par.tecnico_nome, afetadas;
    END IF;
  END LOOP;
END $$;

-- 4. Índice único: um técnico é dono de no máximo uma UM
CREATE UNIQUE INDEX "ums_tecnicoAtualId_key" ON "ums"("tecnicoAtualId");

-- 5. Modo de transporte principal passa a ser obrigatório
ALTER TABLE "tecnicos" ALTER COLUMN "modoPrincipal" SET NOT NULL;
