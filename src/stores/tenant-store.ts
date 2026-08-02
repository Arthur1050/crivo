import { create } from "zustand";

/**
 * Espelho client-side do tenant ativo, usado apenas para UI (nome no header,
 * item selecionado no switcher). O cookie `crivo_tenant` é a fonte de
 * verdade (design.md — Tech Decisions); esta store NÃO usa `zustand/persist`
 * / localStorage — ela é inicializada e atualizada a partir de dados vindos
 * do servidor.
 */
interface TenantState {
  tenantId: string;
  tenantName: string;
  setTenant: (tenantId: string, tenantName: string) => void;
}

export const useTenantStore = create<TenantState>((set) => ({
  tenantId: "",
  tenantName: "",
  setTenant: (tenantId, tenantName) => set({ tenantId, tenantName }),
}));
