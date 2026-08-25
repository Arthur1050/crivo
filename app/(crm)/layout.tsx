import type { ReactNode } from "react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { getLastAgentMessageAt } from "@/src/server/data";
import { getLinkedTenants, setActiveTenant } from "@/src/server/tenant";
import { verifySession } from "@/src/server/auth/session";
import { Sidebar } from "@/src/components/shell/sidebar";

/**
 * Shell do CRM (redesign-crm-astryx — RD-01, design.md § R0): SideNav-only,
 * sem TopNav — a identidade do tenant (marca, cidade/UF, seletor, agente,
 * usuário) mora toda na sidebar, conforme a própria best practice da Astryx
 * ("Don't include a SideNavHeading when a TopNav is already providing app
 * identity").
 *
 * RSC-first (AD-007): o tenant ativo vem do cookie no servidor e o que
 * atravessa a fronteira para a `Sidebar` client é sempre SERIALIZÁVEL —
 * apenas strings, nunca a linha crua do tenant (que carrega `createdAt: Date`).
 */
export default async function CrmLayout({ children }: { children: ReactNode }) {
  // A guarda é a primeira coisa do shell: sem sessão válida ela redireciona
  // para `/login`, e sem vínculo nenhum para `/sem-acesso` — nenhuma das duas
  // situações chega a renderizar dado de imobiliária (spec.md — AUTH-01 AC1,
  // TENANT-01 AC6).
  const { user, tenantId: activeTenantId, roles } = await verifySession();

  // Apenas as imobiliárias VINCULADAS ao usuário (TENANT-01 AC3) — nunca a
  // lista completa do banco, que era o que o seletor mostrava antes do login
  // existir.
  const tenants = await getLinkedTenants(user.id);
  const active = tenants.find((tenant) => tenant.id === activeTenantId);

  if (!active) {
    throw new Error(
      "Imobiliária ativa não está entre os vínculos do usuário — a guarda deveria ter resolvido isso antes do shell."
    );
  }

  // lote-7 — SHELL-01: instante da última mensagem do agente do tenant
  // ativo, resolvido só a partir do próprio CRM (INT-08 — nenhuma chamada à
  // instância n8n). Serializado como ISO string na fronteira RSC → client
  // (AD-007).
  const lastAgentMessageAt = await getLastAgentMessageAt(activeTenantId);

  return (
    <AppShell
      contentPadding={6}
      variant="wash"
      sideNav={
        <Sidebar
          tenants={tenants.map((tenant) => ({
            id: tenant.id,
            name: tenant.name,
            city: tenant.city,
            state: tenant.state,
          }))}
          activeTenant={{
            id: active.id,
            name: active.name,
            agentName: active.agentName,
            city: active.city,
            state: active.state,
          }}
          // AUTH-01 AC6: nome e e-mail do usuário AUTENTICADO no shell. Antes
          // do login existir isto era `getMockManager`, um gestor fictício
          // derivado do nome do tenant — agora há uma pessoa real a exibir.
          manager={{ name: user.name, email: user.email }}
          // PERM-01 AC7: a navegação esconde o que o vínculo ativo não
          // alcança. Cosmético — a recusa server-side vale de qualquer jeito.
          roles={roles}
          onTenantChange={setActiveTenant}
          lastAgentMessageAt={lastAgentMessageAt ? lastAgentMessageAt.toISOString() : null}
        />
      }
    >
      {children}
    </AppShell>
  );
}
