import { describe, expect, it } from "vitest";
import { canAccessCrmNav, CRM_NAV } from "./CrmSidebar";

const nav = (id: string) => CRM_NAV.find((item) => item.id === id)!;

describe("canAccessCrmNav", () => {
  it("libera somente módulos concedidos para um atendente", () => {
    expect(canAccessCrmNav(nav("contacts"), "atendente", ["contacts"])).toBe(true);
    expect(canAccessCrmNav(nav("conversations"), "atendente", ["contacts"])).toBe(false);
  });

  it("não expõe a gestão da equipe por uma permissão manipulada", () => {
    expect(canAccessCrmNav(nav("team"), "atendente", ["team"])).toBe(false);
  });

  it.each(["admin", "super_admin", "gestor"])("mantém o acesso gerencial para %s", (role) => {
    expect(CRM_NAV.every((item) => canAccessCrmNav(item, role, []))).toBe(true);
  });
});
