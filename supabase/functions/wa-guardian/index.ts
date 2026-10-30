// wa-guardian — decide se o VPS deve reiniciar o container da Evolution.
// Chamado por um cron no VPS a cada 15 min:
//   curl -s ".../wa-guardian?s=SECRET" | grep -q '"restart":true' && docker restart evolution-api
// Regra "sessão zumbi": estado diz "connected", mas NENHUMA mensagem recebida
// há mais de 3 horas dentro do horário comercial (08h–20h, seg–sáb, America/Sao_Paulo).
// Cooldown: no máximo 1 restart a cada 3 horas.
// Deploy: verify_jwt = false (autenticado pelo secret próprio, só devolve um boolean).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

const SILENCE_HOURS = 3;
const COOLDOWN_HOURS = 3;

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("s") ?? "";
    if (!secret) return json({ restart: false });

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { data: state } = await db
      .from("crm_keepalive_state")
      .select("id, guardian_secret, last_docker_restart_at")
      .limit(1)
      .maybeSingle();
    if (!state || state.guardian_secret !== secret) return json({ restart: false });

    // Horário comercial em São Paulo (08–20h, seg–sáb)
    const now = new Date();
    const sp = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hour12: false,
      weekday: "short",
    }).formatToParts(now);
    const hour = Number(sp.find((p) => p.type === "hour")?.value ?? "0");
    const weekday = sp.find((p) => p.type === "weekday")?.value ?? "";
    const businessHours = weekday !== "Sun" && hour >= 8 && hour < 20;
    if (!businessHours) return json({ restart: false, motivo: "fora do horario" });

    // Cooldown
    if (state.last_docker_restart_at) {
      const since = Date.now() - new Date(state.last_docker_restart_at).getTime();
      if (since < COOLDOWN_HOURS * 3600 * 1000) {
        return json({ restart: false, motivo: "cooldown" });
      }
    }

    // Silêncio anormal: nenhuma mensagem RECEBIDA há mais de N horas
    const { data: lastIn } = await db
      .from("messages")
      .select("message_at")
      .eq("direction", "in")
      .order("message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastAt = lastIn?.message_at ? new Date(lastIn.message_at).getTime() : 0;
    const silentMs = Date.now() - lastAt;
    const zombie = silentMs > SILENCE_HOURS * 3600 * 1000;

    if (zombie) {
      await db
        .from("crm_keepalive_state")
        .update({ last_docker_restart_at: new Date().toISOString() })
        .eq("id", state.id);
      console.log(`wa-guardian: silêncio de ${Math.round(silentMs / 60000)} min → restart`);
      return json({ restart: true, silencio_min: Math.round(silentMs / 60000) });
    }

    return json({ restart: false, silencio_min: Math.round(silentMs / 60000) });
  } catch (e) {
    console.error("wa-guardian error:", e);
    return json({ restart: false });
  }
});
