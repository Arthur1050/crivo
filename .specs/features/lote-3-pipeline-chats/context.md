# Lote 3 — Pipeline + Chats + Refinamentos · Context

**Gathered:** 2026-08-02
**Spec:** `.specs/features/lote-3-pipeline-chats/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Lote 3 entrega, sobre a fundação mock-first existente: (a) a tela **Pipeline de leads** em Kanban (Fase 4 do roadmap) com drag-and-drop e detalhe do lead; (b) a tela **Chats** somente leitura (Fase 6); (c) **refinamentos de UI** das telas do Lote 2 (espaçamento do botão Ações em Documentos, reorganização de Configurações em Cards); (d) adoção da lib de ícones **Lucide-Animated** em todo o projeto (novas telas + retrofit de Documentos/Configurações); (e) **cor nas categorias** de documentos (paleta fixa).

---

## Implementation Decisions

### Kanban — interatividade

- **Drag-and-drop habilitado**: o gestor pode arrastar leads entre as 3 colunas de status; a mudança persiste via server action (tenant-scoped).
- Falha na persistência → card volta à coluna original com mensagem de erro.

### Detalhe do lead

- Abre como **drawer/painel lateral** sobre/ao lado do quadro — o contexto das colunas não se perde.
- Conteúdo: resumo executivo da conversa, motivo do escalonamento (quando aplicável) e campos de qualificação preenchidos.

### Cor das categorias

- **Paleta fixa** token-backed (as 10 cores nomeadas do componente `Token` da Astryx: red, orange, yellow, green, teal, cyan, blue, purple, pink, gray), escolhida num picker simples ao criar/editar categoria.
- Sem color picker livre — regra do projeto proíbe hex cru.

### Chats

- **Somente leitura** (PRD §7.2: "visualização das conversas"). Sem composer no v1 — takeover humano é assunto das Fases 7+.

### Agent's Discretion

- Layout exato do card do lead no Kanban (quais campos aparecem no card), desde que nome + indicadores essenciais estejam presentes.
- Ícones específicos escolhidos por rota/ação (verificar disponibilidade no registry da lucide-animated; usar o mais próximo disponível).
- Mecânica do painel lateral (LayoutPanel in-page vs Dialog como fallback), preservando a decisão "não perder o contexto do quadro".
- Organização exata das seções lado a lado em Configurações (grid 2 colunas responsivo).

### Declined / Undiscussed Gray Areas → Assumptions

- **E2E/browser tests para o Kanban interativo**: não discutido em profundidade — registrado como assumption no spec.md (default: sem Playwright neste lote; regras de negócio testadas na camada action/DAL; interação de drag é do componente Board da Astryx).
- **Semântica de mover lead manualmente** (ex.: arrastar para "qualificado e agendado" sem reunião marcada): default — a mudança altera apenas `status` + `updatedAt`; nenhum outro campo é inferido ou exigido. Campos ausentes exibem fallback no detalhe.
- **Ordenação dos cards dentro da coluna**: default — `updatedAt` DESC (mais recentemente atualizado primeiro); sem reordenação manual dentro da coluna.

---

## Specific References

- Template Astryx `kanban-board` como referência do Pipeline; `ai-chat` como referência de Chats (AD-005 — checar templates antes de construir do zero).
- Lucide-Animated (https://lucide-animated.com/): ícones animados baseados em Lucide, instalados individualmente via shadcn CLI como componentes locais, dependência `motion`.

---

## Deferred Ideas

- Composer/takeover humano na tela de Chats (Fase 7+ — contrato; Fase 8 — WhatsApp real).
- Link cruzado lead ↔ conversa (abrir a conversa do lead a partir do drawer do Pipeline) — deixado como P3 no spec; se não couber no lote, cai para lote futuro sem dor.
- Reordenação manual de cards dentro da mesma coluna.
