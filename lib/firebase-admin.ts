import { initializeApp, getApps, cert, type App } from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"

/**
 * Firebase Admin SDK — para uso EXCLUSIVO server-side.
 *
 * Bypassa as Security Rules do Firestore (autentica via Service Account).
 * NUNCA importar isso em código que roda no navegador — só em API Routes.
 *
 * Credencial: armazenada como JSON em Base64 na variável
 * GOOGLE_SERVICE_ACCOUNT_BASE64. Esse formato evita problemas de quebra
 * de linha com a private key (problema clássico em variáveis de ambiente).
 */

let adminApp: App | null = null
let adminDb: Firestore | null = null

type ServiceAccountJson = {
  type: string
  project_id: string
  private_key_id: string
  private_key: string
  client_email: string
  client_id: string
}

/**
 * Decodifica a credencial do Service Account a partir da variável Base64.
 */
function lerCredencial(): ServiceAccountJson {
  const base64 = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64

  if (!base64) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_BASE64 não está configurada nas variáveis de ambiente."
    )
  }

  try {
    const json = Buffer.from(base64, "base64").toString("utf-8")
    return JSON.parse(json) as ServiceAccountJson
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_BASE64 contém valor inválido. Verifique a codificação."
    )
  }
}

/**
 * Inicializa (ou recupera) a instância do Firebase Admin.
 * Singleton: garante que só seja inicializado uma vez por processo.
 */
function getAdminApp(): App {
  if (adminApp) return adminApp

  const apps = getApps()
  if (apps.length > 0) {
    adminApp = apps[0]
    return adminApp
  }

  const credencial = lerCredencial()

  adminApp = initializeApp({
    credential: cert({
      projectId: credencial.project_id,
      clientEmail: credencial.client_email,
      privateKey: credencial.private_key,
    }),
  })

  return adminApp
}

/**
 * Retorna a instância do Firestore Admin.
 * Use isso em API Routes e funções server-side.
 */
export function getAdminDb(): Firestore {
  if (adminDb) return adminDb

  adminDb = getFirestore(getAdminApp())
  return adminDb
}

/**
 * Retorna o e-mail do Service Account (útil para exibir ao admin).
 */
export function getServiceAccountEmail(): string {
  return lerCredencial().client_email
}