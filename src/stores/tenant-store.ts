import { create } from "zustand";

/**
 * Espelho client-side da imobiliária ativa, usado apenas para UI (nome no
 * header, item selecionado no seletor).
 *
 * A fonte de verdade é o `activeOrganizationId` da SESSÃO autenticada
 * (AD-021, que emenda a AD-007) — não mais o cookie `crivo_tenant`, que deixou
 * de existir como mecanismo. Esta store continua sendo só espelho: não usa
 * `zustand/persist` / localStorage, e é inicializada e atualizada
 * exclusivamente a partir do que o servidor já resolveu e validou contra os
 * vínculos reais do usuário.
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
