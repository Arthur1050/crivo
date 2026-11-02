import { ROLE } from "../../lib/vocabulary";
import type { Role } from "@/src/lib/permissions";

/**
 * Papéis oferecidos nos formulários de usuário, com a descrição vinda da
 * tabela de permissões do produto (context.md — Papéis e permissões). Uma
 * lista só, consumida pelo convite e pela alteração de papéis.
 */
export const ROLE_OPTIONS: {
  value: Role;
  label: string;
  description: string;
}[] = [
  {
    value: ROLE.admin,
    label: "Administrador",
    description: "Tudo do gestor, mais a gestão de usuários e papéis.",
  },
  {
    value: ROLE.manager,
    label: "Gestor",
    description:
      "Vê a imobiliária inteira e edita Documentos e Configurações do agente.",
  },
  {
    value: ROLE.attendant,
    label: "Corretor",
    description: "Vê apenas a própria carteira e recebe leads e reuniões.",
  },
];
