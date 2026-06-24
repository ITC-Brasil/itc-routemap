"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { MapPin, Pencil, Plus, Trash2, Users } from "lucide-react"
import {
  listarTecnicos,
  deletarTecnico,
  type Tecnico,
} from "@/lib/firestore/tecnicos"
import { TecnicoFormDialog } from "@/components/tecnicos/tecnico-form-dialog"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { TecnicoAvatar } from "@/components/tecnico-avatar"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

export default function TecnicosPage() {
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([])
  const [carregando, setCarregando] = useState(true)

  const [formAberto, setFormAberto] = useState(false)
  const [tecnicoEditando, setTecnicoEditando] = useState<Tecnico | null>(null)

  const [deleteAberto, setDeleteAberto] = useState(false)
  const [tecnicoDeletando, setTecnicoDeletando] = useState<Tecnico | null>(null)

  const recarregar = async () => {
    setCarregando(true)
    try {
      const lista = await listarTecnicos()
      setTecnicos(lista)
    } catch (err) {
      console.error("Erro ao carregar técnicos:", err)
      toast.error("Erro ao carregar a lista de técnicos.")
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    recarregar()
  }, [])

  const handleNovoTecnico = () => {
    setTecnicoEditando(null)
    setFormAberto(true)
  }

  const handleEditar = (tecnico: Tecnico) => {
    setTecnicoEditando(tecnico)
    setFormAberto(true)
  }

  const handleDeletar = (tecnico: Tecnico) => {
    setTecnicoDeletando(tecnico)
    setDeleteAberto(true)
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Administração
          </p>
          <h1 className="mt-1 font-heading text-4xl text-foreground">
            Técnicos
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cadastro de técnicos com endereço residencial e coordenadas
            geográficas. Base para o cálculo automatizado de rotas.
          </p>
        </div>

        <Button onClick={handleNovoTecnico} className="gap-2">
          <Plus className="h-4 w-4" />
          Cadastrar Técnico
        </Button>
      </div>

      {carregando ? (
        <LoadingState />
      ) : tecnicos.length === 0 ? (
        <EmptyState onCadastrar={handleNovoTecnico} />
      ) : (
        <ListaTecnicos
          tecnicos={tecnicos}
          onEditar={handleEditar}
          onDeletar={handleDeletar}
        />
      )}

      {!carregando && tecnicos.length > 0 && (
        <p className="mt-4 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {tecnicos.length}{" "}
          {tecnicos.length === 1 ? "técnico cadastrado" : "técnicos cadastrados"}
        </p>
      )}

      <TecnicoFormDialog
        open={formAberto}
        onOpenChange={setFormAberto}
        tecnico={tecnicoEditando}
        onSaved={recarregar}
      />

      {tecnicoDeletando && (
        <ConfirmDeleteDialog
          open={deleteAberto}
          onOpenChange={setDeleteAberto}
          titulo="Deletar técnico"
          nomeItem={tecnicoDeletando.nome}
          descricao="Esta ação não pode ser desfeita. Alocações vinculadas a este técnico permanecerão registradas, mas sem técnico associado."
          onConfirm={() => deletarTecnico(tecnicoDeletando.id)}
          onDeleted={recarregar}
          mensagemSucesso="Técnico deletado com sucesso!"
        />
      )}
    </main>
  )
}

// ============================================================
// COMPONENTES AUXILIARES
// ============================================================

function LoadingState() {
  return (
    <div className="flex min-h-[300px] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Carregando técnicos
        </p>
      </div>
    </div>
  )
}

function ListaTecnicos({
  tecnicos,
  onEditar,
  onDeletar,
}: {
  tecnicos: Tecnico[]
  onEditar: (t: Tecnico) => void
  onDeletar: (t: Tecnico) => void
}) {
  return (
    <div className="rounded-lg border bg-card">
      <Accordion type="single" collapsible className="divide-y">
        {tecnicos.map((tecnico) => (
          <ItemTecnico
            key={tecnico.id}
            tecnico={tecnico}
            onEditar={onEditar}
            onDeletar={onDeletar}
          />
        ))}
      </Accordion>
    </div>
  )
}

function ItemTecnico({
  tecnico,
  onEditar,
  onDeletar,
}: {
  tecnico: Tecnico
  onEditar: (t: Tecnico) => void
  onDeletar: (t: Tecnico) => void
}) {
  const temCoordenadas =
    tecnico.latitude !== null && tecnico.longitude !== null

  const linkMaps = temCoordenadas
    ? `https://www.google.com/maps?q=${tecnico.latitude},${tecnico.longitude}`
    : ""

  return (
    <AccordionItem
      value={tecnico.id}
      className="border-b-0 px-4 [&[data-state=open]]:bg-muted/40"
    >
      <AccordionTrigger className="hover:no-underline">
        <div className="flex w-full items-center gap-3 pr-4">
          <TecnicoAvatar nome={tecnico.nome} cor={tecnico.cor} size="md" />
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate font-medium text-foreground" title={tecnico.nome}>
              {tecnico.nome}
            </p>
            <p className="truncate text-xs text-muted-foreground" title={tecnico.endereco || "Sem endereço cadastrado"}>
              {tecnico.endereco || "Sem endereço cadastrado"}
            </p>
          </div>
        </div>
      </AccordionTrigger>

      <AccordionContent>
        <div className="space-y-4 pb-4">
          <div className="space-y-3 rounded-md border bg-background p-4">
            <DetalheLinha label="Endereço" valor={tecnico.endereco || "—"} />
            <DetalheLinha
              label="Ponto de referência"
              valor={tecnico.pontoReferencia || "—"}
            />
            <DetalheLinha
              label="Plus Code"
              valor={tecnico.plusCode || "—"}
              mono
            />
            <DetalheLinha
              label="Coordenadas"
              valor={
                temCoordenadas
                  ? `${tecnico.latitude!.toFixed(7)}, ${tecnico.longitude!.toFixed(7)}`
                  : "Não obtidas"
              }
              mono={temCoordenadas}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEditar(tecnico)}
              className="gap-2"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDeletar(tecnico)}
              className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Deletar
            </Button>
            {temCoordenadas && (
              
              <a
                href={linkMaps}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                <MapPin className="h-3.5 w-3.5" />
                Ver no Google Maps
              </a>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

function DetalheLinha({
  label,
  valor,
  mono = false,
}: {
  label: string
  valor: string
  mono?: boolean
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={`text-sm text-foreground ${mono ? "font-mono" : ""}`}>
        {valor}
      </p>
    </div>
  )
}

function EmptyState({ onCadastrar }: { onCadastrar: () => void }) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed bg-card p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Users className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h3 className="font-heading text-xl text-foreground">
          Nenhum técnico cadastrado
        </h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          Cadastre os técnicos com seus endereços residenciais. As coordenadas
          serão obtidas automaticamente via Google Maps.
        </p>
      </div>
      <Button onClick={onCadastrar} className="gap-2">
        <Plus className="h-4 w-4" />
        Cadastrar Técnico
      </Button>
    </div>
  )
}