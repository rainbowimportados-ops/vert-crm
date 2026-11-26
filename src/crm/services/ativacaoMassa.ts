import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrmContext } from "../provider/CrmProvider";
import type { FichaAtivacao } from "./ativacao";
import { FILTROS_VAZIOS, type FiltrosAtivacao, type Ordem } from "./ativacaoFiltros";

// Ações em massa do quadro Ativar pacientes. Tudo passa pelo RLS do usuário.

export function useAcoesEmMassa() {
  const { organizationId } = useCrmContext();
  const qc = useQueryClient();
  const recarregar = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["crm-ativacao"] }),
      qc.invalidateQueries({ queryKey: ["crm-central"] }),
    ]);
  };
  const ids = (fichas: FichaAtivacao[]) => fichas.map((f) => f.conversationId);

  return {
    resolver: async (fichas: FichaAtivacao[], resolvida: boolean) => {
      const { error } = await supabase
        .from("conversations")
        .update({ ativacao_resolvida_em: resolvida ? new Date().toISOString() : null } as never)
        .in("id", ids(fichas));
      if (error) throw error;
      await recarregar();
    },
    /** userId nulo tira o responsável. */
    atribuir: async (fichas: FichaAtivacao[], userId: string | null) => {
      const { error } = await supabase
        .from("conversations")
        .update({ assignee_id: userId } as never)
        .in("id", ids(fichas));
      if (error) throw error;
      await recarregar();
    },
    etiquetar: async (fichas: FichaAtivacao[], tag: { id: string; label: string }, colocar: boolean) => {
      const contatos = [...new Set(fichas.map((f) => f.contactId))];
      if (colocar) {
        const jaTem = new Set(fichas.filter((f) => f.tags.includes(tag.label)).map((f) => f.contactId));
        const novos = contatos.filter((c) => !jaTem.has(c));
        if (novos.length) {
          const { error } = await supabase
            .from("contact_tags")
            .insert(novos.map((contact_id) => ({ organization_id: organizationId, contact_id, tag_id: tag.id })) as never);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase.from("contact_tags").delete().eq("tag_id", tag.id).in("contact_id", contatos);
        if (error) throw error;
      }
      await recarregar();
    },
    criarEtiqueta: async (label: string) => {
      const { data, error } = await supabase
        .from("tags")
        .insert({ organization_id: organizationId, label } as never)
        .select("id, label")
        .single();
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["crm-tags", organizationId] });
      return data as unknown as { id: string; label: string };
    },
    /** Lembrete de retorno com data (aparece na Central, em "Retornos"). */
    agendarRetorno: async (fichas: FichaAtivacao[], p: { prazo: string; texto: string; responsavelId: string | null }) => {
      const { error } = await supabase.from("crm_compromissos" as never).insert(
        fichas.map((f) => ({
          organization_id: organizationId,
          conversation_id: f.conversationId,
          contact_id: f.contactId,
          tipo: "retorno",
          texto: p.texto.trim() || "Retomar a conversa",
          prazo: p.prazo,
          responsavel_id: p.responsavelId ?? f.assigneeId,
        })) as never,
      );
      if (error) throw error;
      await recarregar();
    },
  };
}

// ---------- filtros salvos (por navegador) ----------

export interface FiltroSalvo {
  nome: string;
  filtros: FiltrosAtivacao;
  ordem: Ordem;
}

const CHAVE_SALVOS = "vert-crm-ativacao-filtros-salvos";

export function lerFiltrosSalvos(): FiltroSalvo[] {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_SALVOS) ?? "[]");
    if (!Array.isArray(bruto)) return [];
    return bruto
      .filter((s) => s && typeof s.nome === "string")
      .map((s) => ({ nome: s.nome, ordem: s.ordem ?? "urgencia", filtros: { ...FILTROS_VAZIOS, ...s.filtros } }));
  } catch {
    return [];
  }
}

export function gravarFiltrosSalvos(lista: FiltroSalvo[]) {
  try {
    localStorage.setItem(CHAVE_SALVOS, JSON.stringify(lista));
  } catch {
    /* sem armazenamento: os filtros salvos valem só nesta aba */
  }
}

/** Baixa um texto como arquivo. */
export function baixarArquivo(nome: string, conteudo: string, tipo = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
