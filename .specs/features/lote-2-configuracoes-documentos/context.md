# Lote 2 — Configurações + Documentos · Context

**Gathered:** 2026-08-02
**Spec:** `.specs/features/lote-2-configuracoes-documentos/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Duas telas do CRM sobre a fundação da Fase 1 (mock-first, AD-004):

- **F2 Configurações** (`/configuracoes`): editar nome da imobiliária, nome/persona do agente e modalidade suportada (novos/usados/ambos); visualização substancial (não exaustiva) dos documentos de contexto com link para a página de Documentos.
- **F3 Documentos** (`/documentos`): gestão completa dos documentos de contexto do agente — upload, organização (modalidade + categorias planas + renomear + busca) e exclusão.

---

## Implementation Decisions

### Upload de documentos

- **Metadata-only (mock)**: o upload registra nome, tipo MIME, tamanho e modalidade no Postgres; o binário do arquivo NÃO é armazenado.
- Armazenamento real (ex.: Vercel Blob) entra na Fase 7/9 atrás da mesma interface — substituição de fonte, não redesenho (AD-004).

### Organização dos documentos

- **Filtro/agrupamento por modalidade** (novo/usado/ambos) — espelha como o agente consome o contexto (tenant + modalidade).
- **Renomear** documento após o upload.
- **Busca por nome** na listagem.
- **Categorias planas** criadas pelo usuário (ex.: "Tabelas de preço"); cada documento pertence a **no máximo uma** categoria (nullable). Sem hierarquia, sem tags múltiplas.

### Preview / download

- **Não existe no v1** — a listagem exibe apenas metadados (nome, modalidade, categoria, tamanho, data). Coerente com upload metadata-only.

### Mudança de modalidade suportada

- **Documentos ficam intactos** quando a imobiliária muda a modalidade suportada; a filtragem de contexto do agente simplesmente deixa de usar os da modalidade desativada. Reversível, sem perda de dado e sem aviso especial.

### Agent's Discretion

- UX de edição das Configurações (form com botão salvar vs. salvar por campo), layout das telas, componentes Astryx específicos, formato do dropzone/input de upload, confirmação de exclusão — decididos no Design/Execute seguindo o catálogo Astryx (AD-005).
- Comportamento de exclusão de categoria (documentos ficam sem categoria) — default do agente, ver Assumptions na spec.

### Declined / Undiscussed Gray Areas → Assumptions

- Nenhuma área foi recusada; assumptions residuais (limites de validação, unicidade de nomes, hard delete) estão logadas na spec em Assumptions & Open Questions.

---

## Specific References

No specific requirements — open to standard approaches (catálogo Astryx primeiro, per AD-005).

---

## Deferred Ideas

- Preview/download de documentos e armazenamento real do binário → Fase 7/9.
- TTL/exclusão automática (LGPD) — `expiresAt` já existe no schema; mecanismo é da Fase 7.
