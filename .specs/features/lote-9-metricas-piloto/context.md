# Lote 9 — Métricas do Piloto: Context

**Gathered:** 2026-08-29
**Spec:** `.specs/features/lote-9-metricas-piloto/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Fechar a malha de medição do piloto (Fase 10 do roadmap / L9 pela AD-020). O Dashboard já roda inteiramente sobre dado real desde o lote-7 — não há mock a substituir. O que falta é o que torna os números **confiáveis e comparáveis**: baseline pré-piloto registrável pela imobiliária, uma cobrança visível da confirmação de comparecimento, visibilidade sobre a saúde da integração agente↔CRM e um artefato levável à reunião de piloto.

Quatro frentes, todas escolhidas pelo usuário:

- **A — Baseline real por tenant**, com os dois baselines que faltam no schema.
- **B — Captura confiável de comparecimento.**
- **C — Saúde da integração agente↔CRM.**
- **D — Relatório do piloto** (não discutida; default registrado como assumption).

---

## Implementation Decisions

### A · Baseline

- **Snapshot único por imobiliária, editável** — continua nas colunas `baseline_*` de `tenants`, ganha tela de edição. Baseline pré-piloto é, por definição, um número só: o de antes do produto entrar. Histórico versionado por período foi considerado e descartado.
- **Os 5 KPIs passam a ter baseline**: entram `baseline_escalation_pct` e `baseline_attendance_pct` (nullable, aditivas, mesmo padrão da AD-004), fechando a régua da tela. O baseline de escalonamento é o mais discutível de levantar (a imobiliária não tinha agente antes), mas deixar um tile sem baseline lê como bug, não como escolha.
- **Edição vive em Configurações**, sob a permissão que já existe: `configuracoes:escrever` = administrador e gestor (`src/lib/permissions.ts`). Nenhum recorte novo de acesso.
- **Enquanto o baseline está vazio**, administrador e gestor veem convite para registrar (link para Configurações); corretor vê só o texto atual "Baseline não disponível", já que não alcança a tela. Não prometer ação a quem não pode agir.
- **Comparação normalizada ao período**: baseline mensal → diário (÷ 30) × dias do período selecionado, com o valor normalizado escrito por extenso no tile. Uniformiza os cinco tiles e evita o número que parece inventado.
- **Validação**: volume e minutos inteiros ≥ 0; percentuais inteiros 0–100.

### B · Comparecimento

- **Bloco "Reuniões a confirmar" no Dashboard**, escopado pelo `LeadScope` que já existe: corretor vê só as da carteira dele, gestor e administrador veem todas. Confirmação em um clique, sem sair da tela.
- **Posição**: acima do bloco de saúde da integração, ambos abaixo dos KPIs, gráficos e leads recentes.
- **A pendência nasce ao fim da reunião** — `meeting_at + MEETING_DURATION_MS` (30 min, constante já existente em `src/server/data/index.ts:1146`).
- **Prescreve em 14 dias sem virar falta**: sai da lista e continua fora do denominador da taxa. A lista precisa ter fim para não virar ruído, mas silêncio não vira métrica ruim da imobiliária — é justamente o número que vai ser mostrado ao cliente.
- O cálculo atual de `attendanceRate` está correto e **não muda**: denominador é `meeting_attended !== null`.

### C · Saúde da integração

- **Persistência só de recusas**: tabela nova gravando exclusivamente requisições recusadas de `/api/v1` (401/404/409/413/422/5xx — rota, método, status, `code`, instante, tenant quando conhecido). O sucesso continua sendo derivado do dado que já existe (última mensagem, leads criados, `first_response_at`).
- **Razão**: hoje uma chamada recusada não deixa rastro nenhum — `problem.ts` responde e a requisição evapora. "Nenhum lead novo hoje" e "todas as chamadas recusadas hoje" são o mesmo silêncio na tela. Foi exatamente o modo de falha do incidente da credencial `httpHeaderAuth` sem prefixo `Bearer`.
- **Nunca persistir payload nem conteúdo de mensagem** — só metadado da recusa. A tabela é sinal operacional, não log de auditoria de conteúdo.
- **Visível a administrador e gestor**, mesma régua de Configurações. Corretor não opera integração.
- **Superfície**: bloco na parte de baixo do Dashboard — depois dos KPIs, dos gráficos e da tabela de leads recentes. Decisão explícita do usuário: *"não é a informação mais importante de um CRM imobiliário"*. Ganha destaque visual quando há problema, mas nunca muda de lugar.
- **Limiar de "com problema"** (default aceito): nenhuma chamada bem-sucedida do agente nas últimas 24h **ou** qualquer recusa nas últimas 24h. Sinal binário e legível, não um SLA.
- **Retenção 30 dias**, purgada pela rota de cron que já roda (`app/api/cron/expire-documents`). Mesma janela do TTL de documentos, sem máquina nova de agendamento.

### Agent's Discretion

- Forma exata do bloco de saúde (contagem por código de erro vs. lista das últimas recusas) e a composição visual dos dois blocos novos no Dashboard.
- Ponto de instrumentação da recusa no servidor — `problem()` é hoje o gargalo único de toda recusa do `/api/v1` (`src/server/integration/problem.ts`), mas não conhece tenant nem rota; o desenho decide entre instrumentar o wrapper de rota ou passar contexto para a fábrica.
- Rótulos e microcópia dos blocos novos.

### Declined / Undiscussed Gray Areas → Assumptions

- **D · Relatório do piloto** — não discutida. Default registrado na spec: rota imprimível do Dashboard com os KPIs do período vs. baseline e CSS de impressão (PDF gerado pelo navegador), **sem dependência nova**. Export CSV da base bruta vai para Deferred Ideas.

---

## Specific References

- "Bloco no dashboard, mas não no topo (imagino que não seja a informação mais importante de um CRM imobiliário)" — sobre a saúde da integração.
- Incidente que motiva a frente C: credencial `httpHeaderAuth` do n8n sem o prefixo `Bearer`, corrigida pelo usuário, mas invisível para o CRM durante todo o período em que esteve errada (Handoff do lote-8).
- Incidente correlato: `BETTER_AUTH_SECRET` ausente na Vercel, que falhava silenciosamente em produção — mesma classe de cegueira.

---

## Deferred Ideas

- Export CSV da base bruta de leads do período.
- Alerta ativo (e-mail/WhatsApp) quando a integração cai — este lote só põe o sinal na tela.
- Baseline versionado por período (re-levantamento trimestral).
- Log de sucesso do `/api/v1` com latência e volume por rota.
- Visão cross-tenant de saúde para o operador da plataforma.
- Ranking/dashboard por corretor.
