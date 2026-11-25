import { describe, expect, it } from "vitest";
import {
  cabecalhoCookie,
  extrairCsrf,
  extrairIds,
  guardarCookies,
  htmlParaTexto,
  idDoLink,
  montarUrl,
  pareceTelaDeLogin,
  somarOrcamentos,
  variantesTelefone,
} from "../../../supabase/functions/crm-clinica/lib";

// Conector do sistema da clínica (edge function crm-clinica): partes sem rede.

describe("telefone para a busca no sistema da clínica", () => {
  it("tira o 55, monta a versão sem o 9 e a formatada", () => {
    const v = variantesTelefone("+55 16 99207-4868");
    expect(v.telefone).toBe("5516992074868");
    expect(v.telefone_local).toBe("16992074868");
    expect(v.telefone_sem9).toBe("1692074868");
    expect(v.telefone_formatado).toBe("(16) 99207-4868");
  });
});

describe("endereços do sistema", () => {
  it("preenche os campos do modelo e codifica", () => {
    expect(montarUrl("https://app.santeodonto.io", "/customers?search={telefone_formatado}", { telefone_formatado: "(16) 99207-4868" }))
      .toBe("https://app.santeodonto.io/customers?search=(16)%2099207-4868");
    expect(montarUrl("https://app.santeodonto.io/", "/customers/{id}/edit", { id: "1598027" }))
      .toBe("https://app.santeodonto.io/customers/1598027/edit");
  });
  it("acha o id do paciente no link colado ou no HTML da busca", () => {
    const padrao = "/customers/(\\d+)";
    expect(idDoLink("https://app.santeodonto.io/customers/1598027/edit", padrao)).toBe("1598027");
    expect(idDoLink("1598027", padrao)).toBe("1598027");
    expect(extrairIds('<a href="/customers/12/edit">A</a><a href="/customers/12">A</a><a href="/customers/34/edit">B</a>', padrao))
      .toEqual(["12", "34"]);
    expect(extrairIds("qualquer", "([")).toEqual([]);
  });
});

describe("login web", () => {
  it("pega o token do formulário ou da meta tag", () => {
    expect(extrairCsrf('<input type="hidden" name="authenticity_token" value="abc&#x2F;123" />')?.valor).toBe("abc/123");
    expect(extrairCsrf('<meta name="csrf-token" content="xyz" />')?.valor).toBe("xyz");
    expect(extrairCsrf("<form></form>")).toBeNull();
  });
  it("guarda e remove cookies da sessão", () => {
    const jar = guardarCookies(new Map(), ["_sante_session=s1; path=/; HttpOnly", "lang=pt; path=/"]);
    expect(cabecalhoCookie(jar)).toBe("_sante_session=s1; lang=pt");
    guardarCookies(jar, ["lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT"]);
    expect(cabecalhoCookie(jar)).toBe("_sante_session=s1");
  });
  it("percebe quando voltou para a tela de login", () => {
    expect(pareceTelaDeLogin('<input type="password" name="user[password]">', "user[password]")).toBe(true);
    expect(pareceTelaDeLogin("<h1>Pacientes</h1>", "user[password]")).toBe(false);
  });
});

describe("página do paciente para o Claude", () => {
  it("vira texto com as colunas da tabela e sem scripts", () => {
    const html = `<html><head><title>x</title></head><body><script>alert(1)</script>
      <h1>Douglas dos Santos Silva</h1><table><tr><th>Orçamento</th><th>Valor</th></tr>
      <tr><td>Reparo dente 45</td><td>R$&nbsp;300,00</td></tr></table></body></html>`;
    const t = htmlParaTexto(html);
    expect(t).toContain("Douglas dos Santos Silva");
    expect(t).toContain("Reparo dente 45 | R$ 300,00 |");
    expect(t).not.toContain("alert");
    expect(htmlParaTexto("a".repeat(50), 10)).toHaveLength(10);
  });
  it("soma aguardando e aprovado", () => {
    expect(somarOrcamentos([
      { titulo: "A", data: null, aguardando: 300, aprovado: 0, situacao: null },
      { titulo: "B", data: null, aguardando: 12850.5, aprovado: null, situacao: null },
      { titulo: "C", data: null, aguardando: null, aprovado: 540, situacao: null },
    ])).toEqual({ aguardando: 13150.5, aprovado: 540 });
  });
});
