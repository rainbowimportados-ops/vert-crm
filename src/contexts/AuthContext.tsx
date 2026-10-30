import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "super_admin" | "admin" | "gestor" | "financeiro" | "recepcao" | "doutor" | "atendente";

export interface Organization {
  id: string;
  name: string;
  slug: string | null;
  status: "trial" | "active" | "blocked" | "canceled";
  plan: string;
  trial_ends_at: string;
  show_whatsapp_groups?: boolean;
}

export function isOrgActive(org: Organization | null): boolean {
  if (!org) return false;
  if (org.status === "active") return true;
  if (org.status === "trial") return new Date(org.trial_ends_at).getTime() > Date.now();
  return false;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  fullName: string | null;
  avatarUrl: string | null;
  organization: Organization | null;
  orgLoaded: boolean;
  refreshOrganization: () => Promise<void>;
  /** Relê o perfil (nome, avatar, papel) sem precisar recarregar a página. */
  refreshProfile: () => Promise<void>;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; code?: string; remaining?: number }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isDeveloper: boolean;
  isTester: boolean;
  isFinanceiro: boolean;
  isRecepcao: boolean;
  isDoutor: boolean;
  isAtendente: boolean;
  isGestor: boolean;
  /** Pode direcionar conversas, ver toda a equipe e a área de grupos. */
  canManageAtendimento: boolean;
  /**
   * Conta criada pelo Google que ainda não foi liberada por um administrador.
   * Nasce sem organização, então não enxerga dado nenhum — a tela de espera
   * existe para explicar isso em vez de mostrar um erro solto.
   */
  aguardandoLiberacao: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [aguardandoLiberacao, setAguardandoLiberacao] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [isTester, setIsTester] = useState(false);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [orgLoaded, setOrgLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const fetchedForUserId = useRef<string | null>(null);

  const fetchOrganization = async (userId: string) => {
    try {
      const { data: prof } = await (supabase as any)
        .from("profiles")
        .select("organization_id")
        .eq("id", userId)
        .maybeSingle();
      const orgId = (prof as any)?.organization_id as string | null;
      if (!orgId) {
        setOrganization(null);
      } else {
        const { data: org } = await (supabase as any)
          .from("organizations")
          .select("id, name, slug, status, plan, trial_ends_at, show_whatsapp_groups")
          .eq("id", orgId)
          .maybeSingle();
        setOrganization((org as unknown as Organization) ?? null);
      }
    } catch {
      setOrganization(null);
    } finally {
      setOrgLoaded(true);
    }
  };

  const refreshOrganization = async () => {
    const uid = fetchedForUserId.current;
    if (uid) await fetchOrganization(uid);
  };

  // Salvar o nome no Perfil chamava refreshOrganization, que só refaz a
  // organização — o fullName do contexto continuava o antigo. O Dashboard
  // seguia dizendo "Bom dia, <nome antigo>" e o próprio campo só mudava depois
  // de F5, então o usuário salvava de novo achando que não tinha gravado.
  const refreshProfile = async () => {
    const uid = fetchedForUserId.current || user?.id;
    if (uid) await fetchRole(uid);
  };

  const fetchRole = async (userId: string) => {
    try {
      const [rolesRes, profileRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("profiles").select("full_name, avatar_url, is_developer, is_tester, approval_status").eq("id", userId).maybeSingle(),
      ]);
      fetchOrganization(userId);
      if (!rolesRes.error && rolesRes.data && rolesRes.data.length > 0) {
        const roles = rolesRes.data.map((r: any) => r.role as AppRole);
        const priority: AppRole[] = ["super_admin", "admin", "gestor", "financeiro", "recepcao", "doutor", "atendente"];
        const top = priority.find((p) => roles.includes(p)) ?? roles[0];
        setRole(top);
      } else {
        setRole(null);
      }
      if (!profileRes.error && profileRes.data) {
        setFullName(profileRes.data.full_name);
        setAvatarUrl((profileRes.data as any).avatar_url ?? null);
        setIsDeveloper(profileRes.data.is_developer ?? false);
        setIsTester(profileRes.data.is_tester ?? false);
        setAguardandoLiberacao((profileRes.data as any).approval_status === "pendente");
      }
    } catch {
      setRole(null);
      setIsDeveloper(false);
      setIsTester(false);
      // Na dúvida não libera: falha de rede não vira acesso.
      setAguardandoLiberacao(false);
    }
  };

  useEffect(() => {
    // Set up auth state listener BEFORE getSession
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          if (fetchedForUserId.current !== session.user.id) {
            fetchedForUserId.current = session.user.id;
            // Defer to avoid Supabase auth deadlock
            setTimeout(() => fetchRole(session.user.id), 0);
          }
        } else {
          fetchedForUserId.current = null;
          setRole(null);
          setFullName(null);
          setAvatarUrl(null);
          setIsDeveloper(false);
          setIsTester(false);
          setOrganization(null);
          setOrgLoaded(false);
        }
        setLoading(false);
      }
    );

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user && fetchedForUserId.current !== session.user.id) {
        fetchedForUserId.current = session.user.id;
        fetchRole(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Heartbeat: mark user as online + listen for forced logout
  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    const beat = () => {
      supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", uid);
    };
    beat();
    const interval = setInterval(beat, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", onVis);

    const uniq = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`force-logout-${uid}-${uniq}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${uid}` },
        (payload: any) => {
          if (payload.new?.force_logout_at) {
            supabase.auth.signOut();
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
      supabase.removeChannel(channel);
    };
  }, [user?.id]);


  const signIn = async (email: string, password: string) => {
    try {
      // Login passa pela função secure-login (limite de 3 tentativas + bloqueio)
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/secure-login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ email, password }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.access_token && data?.refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        return { error: error as Error | null };
      }
      return {
        error: new Error(data?.error || "Não foi possível entrar."),
        code: typeof data?.code === "string" ? data.code : undefined,
        remaining: typeof data?.remaining === "number" ? data.remaining : undefined,
      };
    } catch {
      // Falha de rede na função → tenta o login direto para não travar o acesso
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error as Error | null };
    }
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login` },
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        fullName,
        avatarUrl,
        organization,
        orgLoaded,
        refreshOrganization,
        refreshProfile,
        loading,
        signIn,
        signInWithGoogle,
        signUp,
        signOut,
        isAdmin: role === "admin" || role === "super_admin",
        isDeveloper,
        isTester,
        isFinanceiro: role === "financeiro" || role === "admin" || role === "super_admin",
        isRecepcao: role === "recepcao" || role === "admin" || role === "super_admin",
        isDoutor: role === "doutor" || role === "admin" || role === "super_admin",
        isAtendente: role === "atendente",
        isGestor: role === "gestor",
        canManageAtendimento: role === "admin" || role === "super_admin" || role === "gestor" || role === "recepcao" || role === "financeiro",
        aguardandoLiberacao,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
