import { Page, expect } from "@playwright/test"

export async function irPara(page: Page, rota: string) {
  await page.goto(rota)
  await page.waitForLoadState("networkidle")
}

export async function esperarToast(page: Page, texto?: string) {
  const toast = page.locator("[data-sonner-toast]").first()
  await expect(toast).toBeVisible({ timeout: 5000 })
  if (texto) await expect(toast).toContainText(texto)
  return toast
}

export async function esperarSkeleton(page: Page) {
  await page.waitForFunction(
    () => document.querySelectorAll(".animate-pulse").length === 0,
    { timeout: 10000 }
  )
}
