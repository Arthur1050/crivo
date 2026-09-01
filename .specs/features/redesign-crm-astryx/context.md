# Redesign CRM com Astryx — Context (decisões do discuss)

Sessão de 2026-08-02, janela de planejamento. Perguntas respondidas pelo usuário via AskUserQuestion; todas as 4 recomendações aceitas.

## Decisões do usuário

| # | Área cinzenta | Decisão | Implicação |
| --- | --- | --- | --- |
| 1 | Dados de tenant ausentes no schema (cidade/UF, WhatsApp do agente, website, mensagem de apresentação) | **Adicionar colunas nullable + seed** | Migração aditiva em `tenants` (`city`, `state`, `agent_whatsapp`, `website`, `agent_presentation_message`); seed preenche os 2 tenants com valores distintos; Fase 9 troca a fonte, não as telas (AD-004) |
| 2 | Bloco de usuário no rodapé da sidebar (sem auth no projeto) | **Mock estático** | Helper puro determinístico por tenant (sem tabela, sem schema); quando auth existir, vira dado real |
| 3 | Card "Agente IA — Online" + persona do agente | **Status mock + persona editável** | "Online" é literal fixo mockado; `agentName` e `agent_presentation_message` editáveis e persistidos nas Configurações via `updateTenantSettings` estendido |
| 4 | Escopo funcional | **Paridade funcional** | Nenhuma feature nova: sem drag-and-drop, sem sidebar colapsável, sem filtros novos. Redesign é 100% recomposição visual + os dados aditivos acima |

## Contexto da validação que originou a feature

- Usuário forneceu 10 imagens: 5 telas atuais ("extremamente ruins") e 5 layouts de referência ("extremamente melhor"). **As imagens não existem como arquivos no repo** — a transcrição textual fiel delas está em `design.md` § Referência Visual, que é a fonte de verdade para a execução.
- Validação técnica contra o CLI da Astryx (`component --list`, `template --list`, `component SideNav`, `template kanban-board --skeleton`) e o site https://astryx.atmeta.com confirmou: todos os elementos da referência têm componente/anatomia correspondente na lib. Conclusão registrada como AD-010 no STATE.md: **manter Astryx, não migrar para Shadcn**.
- O usuário valoriza explicitamente sair do padrão visual Shadcn dominante no mercado.
