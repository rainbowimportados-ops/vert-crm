// Funções puras do conector com o sistema da clínica (sem Deno nem rede),
// usadas pela edge function crm-clinica e testadas com vitest.

/** Variantes do telefone para a busca: 5516999990001 -> 16999990001, 1699990001... */
export function variantesTelefone(telefone: string | null | undefined) {
  const digitos = String(telefone ?? "").replace(/\D/g, "");
  const local = digitos.startsWith("55") && digitos.length >= 12 ? digitos.slice(2) : digitos;
  const ddd = local.slice(0, 2);
  const numero = local.slice(2);
  // celular com 9 na frente; alguns cadastros antigos guardam sem o 9
  const sem9 = numero.length === 9 && numero.startsWith("9") ? `${ddd}${numero.slice(1)}` : local;
  const formatado = numero.length >= 8
    ? `(${ddd}) ${numero.slice(0, numero.length - 4)}-${numero.slice(-4)}`
    : local;
  return { telefone: digitos, telefone_local: local, telefone_sem9: sem9, telefone_formatado: formatado, numero };
}

/** Troca {chave} pelo valor (codificado para URL) e junta com o endereço base. */
export function montarUrl(base: string, caminho: string, vars: Record<string, string | null | undefined>) {
  const preenchido = caminho.replace(/\{(\w+)\}/g, (_, chave) => encodeURIComponent(vars[chave] ?? ""));
  return new URL(preenchido, base.endsWith("/") ? base : `${base}/`).toString();
}

/** Token anti-CSRF de formulários Rails/Devise (e parecidos). */
export function extrairCsrf(html: string) {
  const input = html.match(/name=["']authenticity_token["'][^>]*value=["']([^"']+)["']/i)
    ?? html.match(/value=["']([^"']+)["'][^>]*name=["']authenticity_token["']/i);
  if (input) return { campo: "authenticity_token", valor: decodeEntidades(input[1]) };
  const meta = html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']csrf-token["']/i);
  if (meta) return { campo: "authenticity_token", valor: decodeEntidades(meta[1]) };
  return null;
}

/** Guarda os cookies dos cabeçalhos Set-Cookie (nome=valor) num mapa. */
export function guardarCookies(jar: Map<string, string>, setCookies: string[]) {
  for (const linha of setCookies) {
    const par = linha.split(";")[0]?.trim();
    if (!par || !par.includes("=")) continue;
    const i = par.indexOf("=");
    const nome = par.slice(0, i).trim();
    const valor = par.slice(i + 1).trim();
    if (/expires=thu, 01 jan 1970/i.test(linha) || valor === "") jar.delete(nome);
    else jar.set(nome, valor);
  }
  return jar;
}

export function cabecalhoCookie(jar: Map<string, string>) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

/** Ids de paciente achados no HTML/JSON da busca, na ordem, sem repetir. */
export function extrairIds(texto: string, padrao: string) {
  let re: RegExp;
  try {
    re = new RegExp(padrao, "g");
  } catch {
    return [];
  }
  const ids: string[] = [];
  for (const m of texto.matchAll(re)) {
    const id = m[1] ?? m[0];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'",
};

export function decodeEntidades(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z#0-9]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m);
}

/** HTML -> texto legível (linhas e colunas de tabela preservadas), cortado em `max`. */
export function htmlParaTexto(html: string, max = 30_000) {
  const texto = html
    .replace(/<(script|style|svg|noscript|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|section|article|table|thead|tbody)>/gi, "\n")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<input[^>]*value=["']([^"']*)["'][^>]*>/gi, " $1 ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntidades(texto)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n[ \n]*/g, "\n")
    .trim()
    .slice(0, max);
}

/** A resposta do login parece ter voltado para a tela de login (falhou)? */
export function pareceTelaDeLogin(html: string, campoSenha: string) {
  return html.includes(`name="${campoSenha}"`) || html.includes(`name='${campoSenha}'`);
}

export interface Orcamento {
  titulo: string;
  data: string | null;
  aguardando: number | null;
  aprovado: number | null;
  situacao: string | null;
}

export function somarOrcamentos(orcamentos: Orcamento[]) {
  let aguardando = 0;
  let aprovado = 0;
  for (const o of orcamentos) {
    aguardando += Number(o.aguardando) || 0;
    aprovado += Number(o.aprovado) || 0;
  }
  return { aguardando: Math.round(aguardando * 100) / 100, aprovado: Math.round(aprovado * 100) / 100 };
}

/** Link que o usuário colou (ex.: https://app.santeodonto.io/customers/1598027/edit) -> id. */
export function idDoLink(link: string, padrao: string) {
  return extrairIds(link, padrao)[0] ?? (/^\d+$/.test(link.trim()) ? link.trim() : null);
}
