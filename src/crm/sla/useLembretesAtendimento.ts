import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useCrmContext } from "../provider/CrmProvider";
import { readManifestSettings } from "../services/settings";
import { paraConversa, tempoDeEspera } from "../services/ativacao";
import { ESQUECIDO_H, META_RESPOSTA_MIN, useSla } from "../services/sla";
import { displayName } from "../sdk/phone";
import type { CrmConversation } from "../sdk/types";

const VERIFICA_A_CADA_MS = 60_000;
const RESUMO_A_CADA_MS = 30 * 60_000;

/**
 * Lembretes de atendimento, em qualquer tela do CRM:
 * - aviso quando um paciente passa da meta de resposta (uma vez por mensagem);
 * - a cada 30 min, se houver pacientes esquecidos ou leads novos sem contato.
 * Respeita "Follow-up próximo" e "Notificação no computador" em Configurações → Notificações.
 */
export function useLembretesAtendimento(onOpen: (c: CrmConversation) => void) {
  const sla = useSla();
  const { manifest, activeConnectionId } = useCrmContext();
  const prefs = readManifestSettings(manifest).notifications;
  const avisados = useRef(new Map<string, string>()); // conversa -> última mensagem já avisada
  const ultimoResumo = useRef(0);
  const estado = useRef({ sla, prefs, onOpen, activeConnectionId });
  estado.current = { sla, prefs, onOpen, activeConnectionId };

  useEffect(() => {
    avisados.current.clear();
  }, [activeConnectionId]);

  useEffect(() => {
    const avisar = (titulo: string, texto: string, abrir?: () => void) => {
      toast.warning(titulo, {
        description: texto,
        duration: 15_000,
        action: abrir ? { label: "Responder", onClick: abrir } : undefined,
      });
      const { prefs: p } = estado.current;
      if (p.desktop && typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
        try {
          const n = new Notification(titulo, { body: texto, tag: "vert-crm-atendimento" });
          n.onclick = () => {
            window.focus();
            abrir?.();
            n.close();
          };
        } catch {
          /* navegador sem suporte */
        }
      }
    };

    const verificar = () => {
      const { sla: s, prefs: p, onOpen: abrirConversa, activeConnectionId: conexao } = estado.current;
      if (!p.followup || s.carregando) return;
      const agora = Date.now();

      // 1) quem acabou de passar da meta de resposta
      const novos = s.aguardando.filter((f) => {
        const espera = agora - new Date(f.ultimaMsgEm).getTime();
        return espera > META_RESPOSTA_MIN * 60_000 && espera < ESQUECIDO_H * 3600_000 && avisados.current.get(f.conversationId) !== f.ultimaMsgEm;
      });
      novos.forEach((f) => avisados.current.set(f.conversationId, f.ultimaMsgEm));
      if (novos.length) {
        const f = novos[0];
        const nome = displayName(f.nome ?? "", f.telefone ?? "");
        avisar(
          novos.length === 1 ? `${nome} espera resposta há ${tempoDeEspera(f.ultimaMsgEm)}` : `${novos.length} pacientes passaram de ${META_RESPOSTA_MIN} min sem resposta`,
          novos.length === 1 ? (f.ultimoTexto ? `"${f.ultimoTexto.slice(0, 90)}"` : "Mandou mídia.") : `O primeiro é ${nome}, há ${tempoDeEspera(f.ultimaMsgEm)}.`,
          () => abrirConversa(paraConversa(f, conexao)),
        );
        return;
      }

      // 2) resumo periódico de esquecidos e leads parados
      if (agora - ultimoResumo.current < RESUMO_A_CADA_MS) return;
      if (!s.esquecidos && !s.leadsParados) return;
      ultimoResumo.current = agora;
      const partes = [
        s.esquecidos ? `${s.esquecidos} paciente${s.esquecidos > 1 ? "s" : ""} sem resposta há mais de ${ESQUECIDO_H} h` : "",
        s.leadsParados ? `${s.leadsParados} lead${s.leadsParados > 1 ? "s" : ""} novo${s.leadsParados > 1 ? "s" : ""} sem contato` : "",
      ].filter(Boolean);
      const antigo = s.maisAntigo;
      avisar(
        "Atendimento esquecido",
        `${partes.join(" e ")}.${antigo ? ` Mais antigo: ${displayName(antigo.nome ?? "", antigo.telefone ?? "")}, há ${tempoDeEspera(antigo.ultimaMsgEm)}.` : ""}`,
        antigo ? () => abrirConversa(paraConversa(antigo, conexao)) : undefined,
      );
    };

    const primeiro = setTimeout(verificar, 20_000);
    const ciclo = setInterval(verificar, VERIFICA_A_CADA_MS);
    return () => {
      clearTimeout(primeiro);
      clearInterval(ciclo);
    };
  }, []);
}
