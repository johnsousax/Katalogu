import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

export function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export class Falha extends Error {
  status: number;
  constructor(mensagem: string, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

export async function usuarioDaRequisicao(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await admin().auth.getUser(token);
  return data?.user ?? null;
}

export async function papelNaLoja(db: SupabaseClient, lojaId: string, userId: string): Promise<string | null> {
  const { data: adm } = await db.from("admins_plataforma").select("user_id").eq("user_id", userId).maybeSingle();
  if (adm) return "dono";
  const { data } = await db.from("membros").select("papel").eq("loja_id", lojaId).eq("user_id", userId).maybeSingle();
  return data?.papel ?? null;
}

export async function exigirPapel(req: Request, db: SupabaseClient, lojaId: string, papeis?: string[]) {
  const user = await usuarioDaRequisicao(req);
  if (!user) throw new Falha("Faça login novamente.", 401);
  const papel = await papelNaLoja(db, lojaId, user.id);
  if (!papel || (papeis && !papeis.includes(papel))) throw new Falha("Você não tem permissão para esta ação.", 403);
  return { user, papel };
}

export function telefone(t: string | null | undefined): string | null {
  const d = String(t ?? "").replace(/\D/g, "");
  if (!d) return null;
  return d.length === 10 || d.length === 11 ? "55" + d : d;
}

export function brl(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  return (n < 0 ? "-" : "") + "R$ " + int.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dec;
}

export function normalizar(t: string | null | undefined): string {
  return String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ERROS: Record<string, string> = {
  SEM_PERMISSAO: "Você não tem permissão para esta ação.",
  PLANO_SEM_RECURSO: "Este recurso não está incluído no seu plano.",
};

export function traduzirErro(e: unknown): string {
  const msg = String((e as { message?: string })?.message ?? e ?? "");
  const m = msg.match(/([A-Z_]{5,})(?::(.*))?/);
  if (m && ERROS[m[1]]) {
    const extra = (m[2] ?? "").trim();
    return extra ? `${ERROS[m[1]]} ${extra}`.trim() : ERROS[m[1]];
  }
  return msg || "Algo deu errado. Tente novamente.";
}

export function tratar(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try {
      return await fn(req);
    } catch (e) {
      console.error(e);
      const status = e instanceof Falha ? e.status : 400;
      return json({ erro: traduzirErro(e) }, status);
    }
  };
}

const MAPA: Record<string, string> = {
  openai: "OPENAI_API_KEY", evolution_url: "EVOLUTION_URL", evolution_key: "EVOLUTION_API_KEY",
  vercel_token: "VERCEL_TOKEN", vercel_project: "VERCEL_PROJECT_ID", vercel_team: "VERCEL_TEAM_ID",
  webhook_secret: "WEBHOOK_SECRET", cron_secret: "CRON_SECRET", n8n_secret: "N8N_SECRET",
  google_maps: "GOOGLE_MAPS_KEY", meta_app_id: "META_APP_ID", meta_app_secret: "META_APP_SECRET",
  ifood_client_id: "IFOOD_CLIENT_ID", ifood_client_secret: "IFOOD_CLIENT_SECRET",
};
const VAULT: Record<string, string> = {
  openai: "gi_openai_api_key", evolution_url: "gi_evolution_url", evolution_key: "gi_evolution_api_key",
  vercel_token: "gi_vercel_token", vercel_project: "gi_vercel_project_id", vercel_team: "gi_vercel_team_id",
  webhook_secret: "gi_webhook_secret", cron_secret: "gi_cron_secret", n8n_secret: "gi_n8n_secret",
  google_maps: "gi_google_maps_key", meta_app_id: "gi_meta_app_id", meta_app_secret: "gi_meta_app_secret",
  ifood_client_id: "gi_ifood_client_id", ifood_client_secret: "gi_ifood_client_secret",
};
let cacheCfg: Record<string, string> | null = null;
let cacheEm = 0;
export async function cfg(chave: string): Promise<string> {
  const nomeEnv = MAPA[chave];
  const env = nomeEnv ? Deno.env.get(nomeEnv) : undefined;
  if (env) return env;
  if (!cacheCfg || Date.now() - cacheEm > 60_000) {
    const { data } = await admin().rpc("segredos_plataforma");
    cacheCfg = (data ?? {}) as Record<string, string>;
    cacheEm = Date.now();
  }
  return String(cacheCfg[VAULT[chave] ?? chave] ?? "").trim();
}

let cacheConfig: Record<string, string> | null = null;
let cacheConfigEm = 0;
/** Valor público de config_plataforma (url_base etc.) */
export async function config(chave: string): Promise<string> {
  if (!cacheConfig || Date.now() - cacheConfigEm > 60_000) {
    const { data } = await admin().from("config_plataforma").select("chave,valor");
    cacheConfig = Object.fromEntries((data ?? []).map((x: { chave: string; valor: string }) => [x.chave, x.valor ?? ""]));
    cacheConfigEm = Date.now();
  }
  return String(cacheConfig[chave] ?? "").trim();
}

/** Chama um webhook do n8n com a senha compartilhada e devolve o JSON */
export async function n8n(caminho: string, corpo: unknown, timeoutMs = 25_000): Promise<any> {
  const base = (await config("n8n_url")).replace(/\/+$/, "");
  if (!base) throw new Falha("O n8n ainda não foi configurado na plataforma.");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${base}/webhook/${caminho}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-gi-segredo": await cfg("n8n_secret") },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    });
    const txt = await r.text();
    let data: any = txt;
    try { data = JSON.parse(txt); } catch { /* texto */ }
    if (!r.ok) throw new Falha(`n8n (${r.status}): ${typeof data === "string" ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200)}`);
    return data;
  } finally {
    clearTimeout(t);
  }
}
