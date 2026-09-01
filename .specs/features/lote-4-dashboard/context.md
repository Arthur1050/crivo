# Lote 4 — Dashboard · Context

**Gathered:** 2026-08-02
**Spec:** `.specs/features/lote-4-dashboard/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Página `/dashboard` (substitui o placeholder da Fase 1) com KPIs operacionais do piloto sobre dado mockado (PRD §7.7): tempo médio até a 1ª resposta, volume de leads no período, taxa de qualificação, taxa de escalonamento, taxa de comparecimento à reunião, distribuição por modalidade e por motivação, e comparação com baseline pré-piloto. Filtro de período. Somente leitura — o Dashboard não escreve nada além do que o seed provê.

---

## Implementation Decisions

### Período de análise

- Presets de **7 / 30 / 90 dias** E **range customizado** (date picker de início/fim). Ambos, não um ou outro — resposta explícita do usuário.
- Default ao abrir: 30 dias (assumption, ver spec).

### Comparação com baseline

- **Baseline mockado no seed**: o seed ganha valores de baseline por tenant e a UI de comparação já nasce funcionando — coerente com o mock-first (AD-004). Valores reais substituem o seed quando forem coletados na reunião da demo (Fase 10).

### Estrutura visual

- **Tiles de KPI no topo + gráficos abaixo**: linha de stat tiles com os números-chave (1ª resposta, volume, taxas) e gráficos maiores abaixo (volume no tempo, distribuições).

### Dados incompletos nas taxas

- **Excluir nulos do cálculo + exibir a base considerada**: nulos ficam fora do cálculo e o KPI mostra a base (ex.: "67% de 12 reuniões confirmadas"). Honesto e auditável.

### Agent's Discretion

- Granularidade da série de volume (dia vs. semana) por faixa de período.
- Tipo de gráfico por métrica (barra/linha/donut), desde que dentro do padrão do template `dashboard` da Astryx.
- Formato de exibição de tempo e percentuais (definidos com precisão na spec como assumptions).
- Semântica exata da comparação com baseline quando as unidades não são diretamente comparáveis (volume período × baseline mensal).

### Declined / Undiscussed Gray Areas → Assumptions

- Fuso horário dos limites de período, teto do range customizado, tratamento de params inválidos, timestamp que ancora o lead ao período — todos logados como assumptions na spec (nenhum foi discutido; defaults do agente).

---

## Specific References

Nenhuma referência externa específica — usuário aceitou as recomendações padrão. O template `dashboard` da Astryx (Analytics Dashboard) é a referência visual obrigatória (AD-005).

---

## Deferred Ideas

- Campos manuais de baseline em Configurações (opção descartada no discuss) — pode virar melhoria quando o baseline real for coletado (Fase 10).
- Export/print do dashboard para a demo — não discutido, fora de escopo.
