import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore"
import { signOut, User } from "firebase/auth"
import { auth, db } from "@/lib/firebase"

/**
 * Resultado da verificação de convite.
 * - autorizado: true  → usuário pode entrar
 * - autorizado: false → usuário deve ser deslogado, com motivo amigável em `mensagem`
 */
export type ResultadoConvite = {
  autorizado: boolean
  mensagem?: string
}

/**
 * Verifica se um usuário recém-logado tem convite válido para acessar o sistema.
 *
 * Regras:
 * 1. Precisa existir um documento na coleção `convites` com o email do usuário
 * 2. O convite precisa estar com status "pendente" OU "ativo"
 *    - "pendente" = ainda não foi consumido (primeiro login)
 *    - "ativo"    = já foi consumido em login anterior (logins futuros)
 * 3. A data `expiraEm` precisa estar no futuro
 *
 * Em caso de sucesso no primeiro login, marca o convite como "ativo".
 */
export async function verificarConvite(user: User): Promise<ResultadoConvite> {
  if (!user.email) {
    return {
      autorizado: false,
      mensagem: "Conta sem email associado. Use uma conta Google válida.",
    }
  }

  // Normaliza o email para minúsculas (case-insensitive)
  const emailNormalizado = user.email.toLowerCase().trim()

  try {
    // Busca um convite com o email do usuário
    const convitesRef = collection(db, "convites")
    const q = query(convitesRef, where("email", "==", emailNormalizado))
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      return {
        autorizado: false,
        mensagem:
          "Acesso não autorizado. Esta conta não possui convite ativo no sistema.",
      }
    }

    // Pega o primeiro convite encontrado (deveria existir só 1 por email)
    const conviteDoc = snapshot.docs[0]
    const convite = conviteDoc.data()

    // Valida status do convite
    const statusValidos = ["pendente", "ativo"]
    if (!statusValidos.includes(convite.status)) {
      return {
        autorizado: false,
        mensagem: `Convite ${convite.status}. Contate o administrador.`,
      }
    }

    // Valida data de expiração
    const agora = Timestamp.now()
    if (convite.expiraEm && convite.expiraEm.toMillis() < agora.toMillis()) {
      return {
        autorizado: false,
        mensagem:
          "Seu convite expirou. Solicite um novo convite ao administrador.",
      }
    }

    // Se for primeiro login (status="pendente"), marca como "ativo"
    if (convite.status === "pendente") {
      await updateDoc(doc(db, "convites", conviteDoc.id), {
        status: "ativo",
        consumidoEm: serverTimestamp(),
        consumidoPor: user.uid,
      })
    }

    return { autorizado: true }
  } catch (err) {
    console.error("Erro ao verificar convite:", err)
    return {
      autorizado: false,
      mensagem: "Erro ao validar acesso. Tente novamente.",
    }
  }
}

/**
 * Desloga o usuário do Firebase.
 * Usado tanto pelo botão "Sair" quanto pela validação automática quando
 * detecta que o usuário não tem convite válido.
 */
export async function logout(): Promise<void> {
  await signOut(auth)
}