// Valores atuais do domínio; a troca do dado e do fio fica para o L18c.
export const MODALITY = { new: "novo", used: "usado", both: "ambos" } as const;
export const PROPERTY_TYPE = { house: "casa", apartment: "apartamento" } as const;
export const PROPERTY_KIND = {
  house: "casa", apartment: "apartamento", townhouse: "sobrado", penthouse: "cobertura",
  land: "terreno", commercial_room: "sala_comercial", farmhouse: "chacara",
} as const;
export const PROPERTY_STATUS = { available: "disponivel", reserved: "reservado", sold: "vendido" } as const;
export const MOTIVATION = { investor: "investidor", resident: "morador" } as const;
export const CREDIT_STATUS = { pre_approved: "pre_aprovado", own_funds: "recurso_proprio", fgts: "fgts" } as const;
export const STOREFRONT_LAYOUT = { grid: "grade", editorial: "editorial" } as const;
