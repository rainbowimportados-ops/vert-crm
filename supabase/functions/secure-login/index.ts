// secure-login — versão corrigida (Onda 1)
//
// ============================================================================
// POR QUE ESTA FUNÇÃO PRECISAVA MUDAR DE IDEIA, E NÃO SÓ DE CÓDIGO
// ============================================================================
//
// A versão publicada (v1) tenta impedir força bruta contando senhas erradas e
// bloqueando a conta na 4ª. Duas coisas quebram esse desenho:
//
// 1. ELA NÃO IMPEDE FORÇA BRUTA.
//    O endpoint nativo do Supabase — /auth/v1/token?grant_type=password —
//    continua público e aceita a anon key, que vai dentro do bundle do site.
//    Um atacante simplesmente não passa por aqui. Só a tela de login do app
//    passa. É uma tranca voluntária.
//
// 2. ELA ENTREGA UM BOTÃO DE BLOQUEIO REMOTO PARA QUALQUER UM.
//    A função é pública (verify_jwt = false) e a chave do bloqueio é o e-mail.
//    Quem souber o e-mail de alguém — inclusive o da conta master — manda
//    4 requisições com senha errada e grava blocked = true. A partir daí o
//    dono NÃO ENTRA MAIS NEM COM A SENHA CERTA (423), e o desbloqueio só sai
//    por e-mail de redefinição. O atacante repete e mantém a conta fora do ar
//    indefinidamente. Isso é negação de serviço de graça, e mira justamente
//    quem tem o e-mail mais conhecido.
//
// Ou seja: o controle não entregava a proteção prometida e criava um risco
// novo, pior que o original. Por isso aqui eu REMOVO O BLOQUEIO.
//
// O que fica: a contagem (útil para você enxergar tentativa suspeita) e o
// e-mail de redefinição na 3ª errada (bom para o usuário que esqueceu a
// senha). O que sai: `blocked`, o 423, e a capacidade de terceiro trancar
// conta alheia.
//
// A proteção real contra força bruta NÃO se faz aqui — se faz no painel do
// Supabase, em Authentication > Attack Protection:
//   • ligar CAPTCHA (hCaptcha ou Turnstile) — vale para o endpoint nativo;
//   • ligar "Leaked password protection" (hoje está desligada);
//   • revisar os rate limits de Auth.
// Só isso alcança o /auth/v1/token, que é por onde o ataque de verdade entra.
//
// PENDÊNCIA NO FRONTEND (lado do VS Code):
//   src/contexts/AuthContext.tsx, linhas 224-228, tem um catch que, em caso de
//   falha de rede, chama signInWithPassword direto. Enquanto existir bloqueio,
//   esse catch o anula. Sem bloqueio ele deixa de ser falha de segurança, mas
//   continua escondendo erro do usuário — vale tratar.
//
// verify_jwt continua false: esta é a porta de entrada, o usuário ainda não
// tem sessão.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const TENTATIVAS_ATE_RESET = 3;  // na 3ª errada dispara o e-mail de redefinição
const JANELA_MIN = 30;           // erros antigos expiram em 30 min
const RESET_REDIRECT = "https://vertcontrol.vercel.app/reset-password";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const { email: rawEmail, password } = await req.json().catch(() => ({}));
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
    if (!email || !email.includes("@") || typeof password !== "string" || !password) {
      return json(400, { code: "bad_request", error: "Informe email e senha." });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: row } = await db
      .from("login_attempts")
      .select("failed_count, last_attempt_at, reset_sent_at")
      .eq("email", email)
      .maybeSingle();

    // NÃO existe mais o portão de `blocked`. Ninguém tranca conta alheia.

    const expirou =
      row &&
      Date.now() - new Date(row.last_attempt_at).getTime() >
        JANELA_MIN * 60 * 1000;
    const anteriores = expirou ? 0 : row?.failed_count ?? 0;

    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const authData = await authRes.json().catch(() => ({}));

    if (authRes.ok) {
      if (row) await db.from("login_attempts").delete().eq("email", email);
      return json(200, {
        code: "ok",
        access_token: authData.access_token,
        refresh_token: authData.refresh_token,
        user: authData.user ?? null,
      });
    }

    const errCode = authData?.error_code || authData?.error || "";
    const errMsg = authData?.error_description || authData?.msg || "";
    const senhaErrada =
      authRes.status === 400 &&
      (errCode === "invalid_credentials" ||
        errCode === "invalid_grant" ||
        /invalid login credentials/i.test(errMsg));

    if (!senhaErrada) {
      return json(401, { code: "auth_error", error: errMsg || "Não foi possível entrar." });
    }

    const contagem = anteriores + 1;
    const agora = new Date().toISOString();

    // 3ª errada: manda o e-mail de redefinição uma única vez por janela.
    // Não revela se a conta existe — o Supabase responde igual nos dois casos.
    const jaMandouNestaJanela = !expirou && !!row?.reset_sent_at;
    let resetEnviado = jaMandouNestaJanela;

    if (contagem >= TENTATIVAS_ATE_RESET && !jaMandouNestaJanela) {
      try {
        const anon = createClient(SUPABASE_URL, ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { error } = await anon.auth.resetPasswordForEmail(email, {
          redirectTo: RESET_REDIRECT,
        });
        resetEnviado = !error;
      } catch (_) { /* segue mesmo se o envio falhar */ }
    }

    await db.from("login_attempts").upsert({
      email,
      failed_count: contagem,
      blocked: false, // permanece sempre false — a coluna fica por compatibilidade
      reset_sent_at: resetEnviado ? (row?.reset_sent_at ?? agora) : null,
      last_attempt_at: agora,
    });

    if (contagem >= TENTATIVAS_ATE_RESET) {
      console.warn("secure-login: tentativas repetidas", { email, contagem });
      return json(401, {
        code: "reset_sent",
        error: resetEnviado
          ? "Email ou senha incorretos. Enviamos um link de redefinição de senha para o endereço cadastrado, caso você tenha esquecido."
          : "Email ou senha incorretos.",
      });
    }

    const restantes = TENTATIVAS_ATE_RESET - contagem;
    return json(401, {
      code: "invalid_password",
      remaining: restantes,
      error: "Email ou senha incorretos.",
    });
  } catch (e) {
    console.error("secure-login error:", e);
    return json(500, { code: "server_error", error: "Erro interno. Tente novamente." });
  }
});
