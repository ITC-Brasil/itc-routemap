import { test, expect, Page } from "@playwright/test"

/**
 * CRUD ponta a ponta — exercita o write-path das server actions até o
 * Postgres (criar → editar → excluir) em cada cadastro, e a confirmação de
 * alocação (prisma.$transaction em confirmarAlocacao).
 *
 * DÍVIDA DE TESTE (2026-07-24) — blocos de Projetos, UMs, Técnicos e
 * Confirmação de alocação estão em `describe.skip`. Motivo: são os asserts/
 * seletores deste spec que não fecham, NÃO a aplicação. Comprovado por
 * screenshot + leitura direta do Postgres:
 *   - Projetos/Técnicos: os registros SÃO criados, mas o app normaliza o nome
 *     para title case ("ZZ Teste CRUD" → "Zz Teste Crud"), então
 *     `getByText(nome, { exact: true })` nunca casa.
 *   - UMs: o combobox abre e lista os projetos, mas os itens não expõem
 *     `role="option"`, então o clique na opção estoura timeout.
 *   - Confirmação: o fluxo tem uma etapa intermediária de re-otimização
 *     ("Aplicar re-otimização" / "Ignorar e ver resultado", feature 13.12)
 *     antes de "Confirmar alocação" — o spec pulava essa tela.
 * O write-path dessas operações está provado na camada lib/db (criar/editar/
 * excluir em Projetos, UMs, Técnicos, Pontos + a transação de
 * confirmarAlocacao com ponto → Agendado + rotaId). Reescrever estes asserts
 * é trabalho de teste, não de app.
 *
 * O bloco de Localidades permanece ativo e passa: prova editar Ponto via UI.
 */

// Prefixo JA em Title Case: `criarProjeto`/`criarTecnico` normalizam o nome
// com titleCase (lib/text-utils.ts), comportamento intencional de
// padronizacao. Com o valor ja normalizado, o que o spec digita e identico ao
// que a app grava, e os asserts podem usar exact:true.
const PREFIXO = "Zz Teste Crud"

/** Espera um toast do sonner com o texto esperado. */
async function esperarToast(page: Page, regex: RegExp) {
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: regex }).first()
  ).toBeVisible({ timeout: 15000 })
}

/**
 * Escolhe um valor num Combobox custom. O trigger é um
 * `<Button id={id} role="combobox">` dentro de um Popover, e a lista usa
 * CommandItem (role=option).
 */
async function escolherNoCombobox(page: Page, id: string, opcao: RegExp) {
  const trigger = page.getByRole("dialog").locator(`#${id}`)
  await trigger.scrollIntoViewIfNeeded()
  await trigger.click()
  const item = page.getByRole("option", { name: opcao }).first()
  await item.waitFor({ state: "visible", timeout: 10000 })
  await item.click()
}

/**
 * Na página de Técnicos a lista é um Accordion: os botões Editar/Deletar vivem
 * dentro do AccordionContent e só existem depois de expandir o item. O trigger
 * é o único elemento com o nome como TEXTO visível (os botões de ação usam
 * aria-label + ícone), então `hasText` isola ele.
 */
async function expandirTecnico(page: Page, nome: string) {
  await page.getByRole("button").filter({ hasText: nome }).first().click()
  // Diferente de Projetos/UMs (que usam aria-label `Editar <nome>` em botões de
  // ícone), aqui os botões têm TEXTO visível "Editar"/"Deletar". Como o
  // Accordion é `type="single"`, só o item expandido os mostra.
  await page.getByRole("button", { name: /^Editar$/ }).waitFor({
    state: "visible",
    timeout: 10000,
  })
}

test.describe("CRUD — Projetos", () => {
  test.use({ storageState: "tests/e2e/.auth/user.json" })
  test.describe.configure({ mode: "serial" })

  const nome = `${PREFIXO} Projeto`
  const nomeEditado = `${PREFIXO} Projeto Editado`

  test("criar projeto persiste depois do reload", async ({ page }) => {
    await page.goto("/admin/projetos")
    await page.getByRole("button", { name: /Cadastrar Projeto/i }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible()

    await page.locator("#nome").fill(nome)
    await page.locator("#sigla").fill("ZZC")
    // Obrigatórios: o form valida URL da planilha e ao menos uma aba.
    await page
      .locator("#sheetUrl")
      .fill("https://docs.google.com/spreadsheets/d/1ZZtesteCrudPlanilha/edit")
    await page.locator("#sheetAbas").fill("ABA01")
    await page.getByRole("dialog").getByRole("button", { name: /^Cadastrar$/ }).click()
    await esperarToast(page, /cadastrado|sucesso/i)

    await page.reload()
    await expect(page.getByText(nome, { exact: true })).toBeVisible({
      timeout: 15000,
    })
  })

  test("editar projeto persiste depois do reload", async ({ page }) => {
    await page.goto("/admin/projetos")
    await page.getByRole("button", { name: `Editar ${nome}` }).click()
    await expect(page.getByRole("dialog")).toBeVisible()

    await page.locator("#nome").fill(nomeEditado)
    await page.getByRole("button", { name: /Salvar alterações/i }).click()
    await esperarToast(page, /atualizado|sucesso/i)

    await page.reload()
    await expect(page.getByText(nomeEditado, { exact: true })).toBeVisible({
      timeout: 15000,
    })
  })

  test("excluir projeto remove do banco", async ({ page }) => {
    await page.goto("/admin/projetos")
    await page.getByRole("button", { name: `Deletar ${nomeEditado}` }).click()
    await page.getByRole("button", { name: /Confirmar deleção/i }).click()
    await esperarToast(page, /deletado|sucesso/i)

    await page.reload()
    await expect(page.getByText(nomeEditado, { exact: true })).toHaveCount(0)
  })
})

test.describe("CRUD — UMs", () => {
  test.use({ storageState: "tests/e2e/.auth/user.json" })
  test.describe.configure({ mode: "serial" })

  const nome = `${PREFIXO} UM`
  const nomeEditado = `${PREFIXO} UM Editada`

  test("criar UM vinculada a projeto", async ({ page }) => {
    await page.goto("/admin/ums")
    await page.getByRole("button", { name: /Cadastrar UM/i }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible()

    await page.locator("#nome").fill(nome)
    await escolherNoCombobox(page, "projeto", /Projeto Teste ITC/i)
    await page.getByRole("dialog").getByRole("button", { name: /^Cadastrar$/ }).click()
    await esperarToast(page, /cadastrada|cadastrado|sucesso/i)

    await page.reload()
    await expect(page.getByText(nome, { exact: true })).toBeVisible({
      timeout: 15000,
    })
  })

  test("editar UM persiste", async ({ page }) => {
    await page.goto("/admin/ums")
    await page.getByRole("button", { name: `Editar ${nome}` }).click()
    await expect(page.getByRole("dialog")).toBeVisible()

    await page.locator("#nome").fill(nomeEditado)
    await page.getByRole("button", { name: /Salvar alterações/i }).click()
    await esperarToast(page, /atualizada|atualizado|sucesso/i)

    await page.reload()
    await expect(page.getByText(nomeEditado, { exact: true })).toBeVisible({
      timeout: 15000,
    })
  })

  test("excluir UM remove do banco", async ({ page }) => {
    await page.goto("/admin/ums")
    await page.getByRole("button", { name: `Deletar ${nomeEditado}` }).click()
    await page.getByRole("button", { name: /Confirmar deleção/i }).click()
    await esperarToast(page, /deletada|deletado|sucesso/i)

    await page.reload()
    await expect(page.getByText(nomeEditado, { exact: true })).toHaveCount(0)
  })
})

test.describe("CRUD — Técnicos", () => {
  test.use({ storageState: "tests/e2e/.auth/user.json" })
  test.describe.configure({ mode: "serial" })

  const nome = `${PREFIXO} Tecnico`
  const nomeEditado = `${PREFIXO} Tecnico Editado`

  test("criar técnico com coordenadas via Plus Code", async ({ page }) => {
    await page.goto("/admin/tecnicos")
    await page.getByRole("button", { name: /Cadastrar Técnico/i }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible()

    await page.locator("#nome").fill(nome)
    await page.locator("#endereco").fill("SQN 106, Asa Norte, Brasília - DF")
    // O form exige Plus Code + coordenadas obtidas antes de salvar.
    // Plus Code verificado por HTTP no /api/geocoding (retorna Sobradinho, DF)
    await page.locator("#plusCode").fill("85QW+RFW SOBRADINHO, BRASÍLIA - DF")
    await page.getByRole("button", { name: /Obter Coordenadas/i }).click()
    await esperarToast(page, /coordenadas obtidas|sucesso/i)

    await page.getByRole("dialog").getByRole("button", { name: /^Cadastrar$/ }).click()
    await esperarToast(page, /cadastrado|sucesso/i)

    await page.reload()
    await expect(page.getByText(nome, { exact: true })).toBeVisible({
      timeout: 15000,
    })
  })

  test("editar técnico persiste", async ({ page }) => {
    await page.goto("/admin/tecnicos")
    await expandirTecnico(page, nome)
    await page.getByRole("button", { name: /^Editar$/ }).click()
    await expect(page.getByRole("dialog")).toBeVisible()

    await page.locator("#nome").fill(nomeEditado)
    await page.getByRole("button", { name: /Salvar alterações/i }).click()
    await esperarToast(page, /atualizado|sucesso/i)

    await page.reload()
    await expect(page.getByText(nomeEditado, { exact: true })).toBeVisible({
      timeout: 15000,
    })
  })

  test("excluir técnico remove do banco", async ({ page }) => {
    await page.goto("/admin/tecnicos")
    await expandirTecnico(page, nomeEditado)
    await page.getByRole("button", { name: /^Deletar$/ }).click()
    await page.getByRole("button", { name: /Confirmar deleção/i }).click()
    await esperarToast(page, /deletado|sucesso/i)

    await page.reload()
    await expect(page.getByText(nomeEditado, { exact: true })).toHaveCount(0)
  })
})

test.describe("CRUD — Localidades (editar ponto)", () => {
  test.use({ storageState: "tests/e2e/.auth/user.json" })

  test("editar referência de um ponto persiste", async ({ page }) => {
    await page.goto("/admin/localidades")
    await expect(page.getByText(/PONTOS ENCONTRADOS/i)).toBeVisible({
      timeout: 20000,
    })

    // Ponto determinístico do seed (evita depender da ordem da tabela)
    const linha = page.locator("tr").filter({ hasText: "SCS Quadra 2" }).first()
    await linha.getByRole("button").last().click()
    await expect(page.getByRole("dialog")).toBeVisible()

    const marca = `ref-crud-${Date.now()}`
    await page.locator("#edit-referencia").fill(marca)
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Salvar|Confirmar mudança/i })
      .click()
    await esperarToast(page, /atualizado|sucesso/i)

    // Persistência: reabre o MESMO ponto e confere o valor
    await page.reload()
    await expect(page.getByText(/PONTOS ENCONTRADOS/i)).toBeVisible({
      timeout: 20000,
    })
    const linhaDepois = page.locator("tr").filter({ hasText: "SCS Quadra 2" }).first()
    await linhaDepois.getByRole("button").last().click()
    await expect(page.locator("#edit-referencia")).toHaveValue(marca)
  })
})

test.describe("Confirmação de alocação (transação)", () => {
  test.use({ storageState: "tests/e2e/.auth/user.json" })

  test("calcular e confirmar cria rotas e agenda pontos", async ({ page }) => {
    test.setTimeout(180000)

    await page.goto("/calcular-rotas")
    await page.waitForLoadState("networkidle")

    const btnCalcular = page.getByRole("button", { name: /Calcular Alocação/i })
    if (!(await btnCalcular.isEnabled())) {
      test.skip(true, "Sem técnicos/UMs disponíveis para alocar")
    }
    await btnCalcular.click()

    // Etapa intermediária (13.12): quando algum técnico selecionado já tem rota
    // ativa, o app oferece re-otimizar ANTES de mostrar o resultado. Aqui
    // seguimos por "Ignorar e ver resultado" — aplicar a re-otimização
    // cancelaria rotas existentes e tornaria o teste dependente do estado.
    // A tela é condicional, então esperamos o primeiro dos dois marcadores.
    const btnIgnorar = page.getByRole("button", { name: /Ignorar e ver resultado/i })
    const btnConfirmar = page.getByRole("button", { name: /Confirmar alocação/i })

    await expect(btnIgnorar.or(btnConfirmar).first()).toBeVisible({
      timeout: 120000,
    })
    if (await btnIgnorar.isVisible()) {
      await btnIgnorar.click()
    }

    // O resultado aparece mesmo sem Gemini (fallback template): o botão de
    // confirmar é o marcador estável, não o banner da IA.
    await expect(btnConfirmar).toBeVisible({ timeout: 60000 })
    await btnConfirmar.click()

    // Tela final da confirmação: a transação persistiu o lote.
    await expect(
      page.getByText(/alocaç(ão|ao) confirmada|confirmada com sucesso|rotas confirmadas/i).first()
    ).toBeVisible({ timeout: 60000 })
  })
})
