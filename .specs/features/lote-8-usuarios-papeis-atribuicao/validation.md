# Lote 8 — Usuários, papéis e atribuição por agenda Validation

**Date**: 2026-08-27
**Spec**: `.specs/features/lote-8-usuarios-papeis-atribuicao/spec.md`
**Diff range**: `19edb45..f931156` (34 commits, 113 arquivos, +13571/−654)
**Verifier**: sub-agente independente (author ≠ verifier), read-only sobre a árvore real

---

## Task Completion

33/33 tasks marcadas `Done` em `tasks.md`. Duas carregam ressalva no próprio título e uma tem um critério de ambiente em aberto:

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T5, T7–T21, T23, T24, T26–T30, T32, T33 | ✅ Done | — |
| T6 | ✅ Done (título ainda diz ⚠️) | O bloqueio era verificação visual da tela de login. **Fechado na T32**: `/login` foi aberto no navegador e o card renderiza com o link "Esqueci minha senha". O título da task não foi reescrito depois. Carrega um `SPEC_DEVIATION` vivo (rate limit por IP — ver abaixo) |
| T22 | ✅ Done | Verificada visualmente (extensão Chrome, dev server local) |
| T25 | ⚠️ Parcial | Server action entregue e coberta; **UI não existe** — `saveWorkWindowAction` tem **zero consumidores de produção** (grep em `src/components/` e `app/`: só o arquivo de teste) |
| T31 | ⚠️ Parcial | 1 de 6 critérios em aberto (`- [ ]` em `tasks.md:1198`): "primeira mensagem no número de teste abre conversa nova". **Gap de ambiente, não de código** — a credencial `httpHeaderAuth` do n8n está sem o prefixo `Bearer `. Trabalho humano por AD-014 |

Nenhuma task bloqueada. Nenhum teste removido, pulado ou enfraquecido.

---

## Spec-Anchored Acceptance Criteria

Evidência re-derivada do zero. Cada critério foi lido na spec, o desfecho esperado extraído dela, e depois procurada a asserção real no código. Critério sem `file:line` conta como NÃO coberto.

### AUTH-01 — O CRM fica atrás de login

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| AC1 — requisição sem sessão em `/(crm)` redireciona para login sem renderizar dado | redirect para `/login`, zero dado de imobiliária | `proxy.ts:35-40` — `if (getSessionCookie(request)) next(); return NextResponse.redirect(new URL("/login", …))`; guarda em `src/server/auth/session.ts:138-143` — `redirect(reason === "sem-vinculo" ? "/sem-acesso" : "/login")`; decisão que alimenta o redirect asseverada em `src/server/auth/__tests__/session.test.ts:81` — `expect(resolution).toEqual({ ok: false, reason: "sem-sessao" })` | ✅ PASS (⚠️ o `redirect()` em si não é exercitado em vitest — provado por requisição real na T5) |
| AC2 — credenciais corretas criam sessão e levam ao Pipeline | sessão criada | `src/server/auth/__tests__/login.test.ts:53` — `expect(response.user.email).toBe(email)`; `:54` — `expect(headers.get("set-cookie")).toContain("better-auth.session_token")`; `:61` linha em `sessions` | ✅ PASS |
| AC3 — credenciais erradas: mesma mensagem genérica para e-mail inexistente e senha errada | resposta indistinguível | `login.test.ts:79-81` — `expect(wrongPassword.body?.message).toBeTruthy()` **antes** de `expect(unknownEmail.body?.message).toBe(wrongPassword.body?.message)` e a mesma comparação em `.code` | ✅ PASS |
| AC4 — >10 falhas em 1 min **para o mesmo e-mail** ⇒ recusa até o fim da janela | recusa chaveada por e-mail | `login.test.ts:135-137` — `expect(statuses[9]).toBe(401)`, `expect(statuses[10]).toBe(429)`, `expect(statuses[11]).toBe(429)`. Mas a chave é **IP + rota**: `src/server/auth/config.ts:86` — `"/sign-in/email": { window: 60, max: 10 }` (mecanismo nativo do better-auth, `createRateLimitKey(ip, path)`) | ⚠️ **SPEC_DEVIATION confirmado** — o limite existe e barra o brute force, mas por IP, não por e-mail |
| AC5 — sair invalida a sessão e volta ao login | sessão inexistente no servidor | `login.test.ts:101` — `expect(await auth.api.getSession(...)).toBeNull()`; `:104` — `expect(rows).toHaveLength(0)` para AQUELA sessão | ✅ PASS |
| AC6 — nome e e-mail do autenticado no shell | dados do usuário da sessão | `app/(crm)/layout.tsx:64` — `manager={{ name: user.name, email: user.email }}` vindo de `verifySession()`; render em `src/components/shell/sidebar.tsx` (footer `Item label={manager.name} description={manager.email}`) | ✅ PASS (camada `none` na matriz; verificado visualmente na T22/T23) |
| AC7 — `/api/v1/**` só por credencial de serviço, sem sessão | contrato inalterado | `proxy.ts:57` — matcher `/((?!api|_next/static|_next/image|.*\..*).*)` exclui `api` inteiro; contrato segue coberto por `src/server/data/__tests__/service-auth.test.ts:39` — `hash de chave de serviço ativa resolve` e pelos 9 arquivos de rota em `src/server/integration/__tests__/routes/` (todos verdes) | ✅ PASS |

### AUTH-02 — Usuário recupera a própria senha

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 — link de redefinição válido por 1 hora | validade = 1h | `src/server/auth/__tests__/reset-password.test.ts:87` — `expect(url.pathname).toBe("/recuperar-senha")`; `:94` — `expect(verification!.value).toBe(createdUserIds[0])`; `:98-99` — `expect(validadeMs).toBeGreaterThan(59*60*1000)` e `toBeLessThanOrEqual(60*60*1000 + 30_000)` | ✅ PASS |
| AC2 — e-mail inexistente vê a mesma confirmação | resposta idêntica, sem vazar existência | `reset-password.test.ts:113` — `expect(inexistente).toEqual(cadastrado)`; `:117` — `expect(enviados).toHaveLength(0)`; `:127` — `expect(orfaos).toHaveLength(0)` | ✅ PASS |
| AC3 — link válido grava senha nova, invalida o link, encerra as demais sessões | 3 efeitos | `reset-password.test.ts:151` senha nova entra; `:154-156` senha antiga `rejects.toThrow()`; `:160` — `expect(reuso.body?.code).toBe("INVALID_TOKEN")`; `:169` — `expect(depois.filter(s => idsAntigos.includes(s.id))).toHaveLength(0)` (2 sessões abertas antes, asseveradas em `:140`) | ✅ PASS |
| AC4 — link usado ou expirado é recusado, com opção de pedir outro | recusa + saída | usado: `:160`; expirado: `reset-password.test.ts:186` — `expect(expirado.body?.code).toBe("INVALID_TOKEN")` e `:192` senha em vigor inalterada. "Pedir um novo link" é a tela (`src/components/auth/reset-password-form.tsx`), verificada no navegador na T32 | ✅ PASS |

### TENANT-01 — O usuário pertence a uma ou mais imobiliárias

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 — vínculo como relação própria, papéis por vínculo, mesmo usuário em >1 imobiliária | `tenant_members` com único `(userId, organizationId)` | `src/server/auth/__tests__/organization.test.ts:126` — `await expect(db.insert(tenant_members).values({...})).rejects.toThrow()`; `:88-96` vínculo em `tenant_members`; `src/server/__tests__/users-actions.test.ts:265` — `expect(memberships).toHaveLength(2)` com papel distinto por imobiliária | ✅ PASS |
| AC2 — um vínculo ⇒ sem seletor | seletor ausente | `src/components/shell/sidebar.tsx` — `menu={tenants.length > 1 ? <TenantSwitcherMenu .../> : undefined}`; lista de 1 asseverada em `src/server/__tests__/linked-tenants.test.ts:62` | ✅ PASS (render é camada `none`) |
| AC3 — seletor contém exclusivamente as imobiliárias vinculadas | nunca a lista do banco | `linked-tenants.test.ts:62` — devolve só as vinculadas, com `not.toContain(alheio)` sobre um tenant que EXISTE no banco; `:118` vínculo desativado sai; `:141` sem vínculo devolve vazio | ✅ PASS |
| AC4 — cookie/`activeOrganizationId` fora dos vínculos ⇒ ignora e usa o primeiro vínculo | primeiro vínculo, papéis DAQUELE vínculo | `src/server/auth/__tests__/session.test.ts:155` — `expect(context.tenantId).toBe(primeiro)`, `not.toBe(alheio)`, `expect(context.roles).toEqual(["corretor"])`; implementação em `src/server/auth/session.ts:105-108` | ✅ PASS |
| AC5 — trocar a imobiliária ativa passa a resolver tudo naquele escopo e com aqueles papéis | escopo + papéis do vínculo | `organization.test.ts:110` — `expect(rows[0].activeOrganizationId).toBe(organizationId)` após `setActiveOrganization`; a leitura desse campo pela guarda em `session.ts:107` e os papéis DAQUELE vínculo em `session.test.ts:155` | ✅ PASS |
| AC6 — usuário sem vínculo vê tela de ausência de acesso, sem dado de imobiliária | sinal `sem-vinculo`, nada renderizado | `session.test.ts:112` — `expect(resolution).toMatchObject({ ok: false, reason: "sem-vinculo" })` e `expect(resolution).not.toHaveProperty("context")`; roteamento para `/sem-acesso` em `session.ts:142` | ✅ PASS |

### USER-01 — Administrador gerencia os usuários da imobiliária

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 — convite cria usuário pendente vinculado à imobiliária ativa e envia e-mail | pendente + e-mail com O token | `src/server/__tests__/users-actions.test.ts:221` — `expect(credentials).toHaveLength(0)`; `:228` — `expect(member!.inviteState).toBe("pendente")`; `:237` — `expect(sent.url).toContain(invitations[0].id)` | ✅ PASS |
| AC2 — e-mail já existente no sistema ganha vínculo novo, não segundo usuário | 1 usuário, 2 vínculos | `users-actions.test.ts:258` — `expect(rows).toHaveLength(1)`; `:265` — `expect(memberships).toHaveLength(2)` | ✅ PASS |
| AC3 — e-mail já vinculado à imobiliária ativa é recusado | mensagem própria, nada escrito | `users-actions.test.ts:288` — `expect(result.error).toBe("Este e-mail já pertence a esta imobiliária.")`; `:294` — `expect(memberships).toHaveLength(1)` | ✅ PASS |
| AC4 — falha de envio mantém o usuário criado e oferece reenviar | criação preservada | `users-actions.test.ts:316` — `expect(result.warning).toContain("Reenviar convite")` com `emailSent: false`, usuário lido de volta do banco em pendente | ✅ PASS |
| AC5 — reenviar emite token novo e invalida o anterior | antigo cancelado, novo pending | `users-actions.test.ts:355-357` — `expect(antigo.status).toBe("cancelado")`, `expect(novo.status).toBe("pending")`, `expect(lastInvitationEmail().url).toContain(novo.id)` | ✅ PASS |
| AC6 — convite válido + senha ativa o usuário e cria a sessão | credencial funcional + sessão | `src/server/__tests__/accept-invitation.test.ts:135` estado inicial sem credencial; `:149` credencial passa a existir; `:153` — `expect(login.user.id).toBe(convidado.userId)`; `:160` sessão; `:161` convite `accepted` | ✅ PASS |
| AC7 — convite expirado ou usado é recusado, com instrução | mensagem exata | `accept-invitation.test.ts:180` (usado), `:205` (expirado), `:219` (inexistente) — todos com `"Este convite não vale mais. Peça um novo convite ao administrador da imobiliária."`; `:186`/`:211` provam que nada foi escrito | ✅ PASS |
| AC8 — papéis novos valem na próxima requisição, sem relogin | papéis novos com o mesmo cookie | `users-actions.test.ts:399` — `expect(depois.context.roles).toEqual(["corretor","gestor"])` resolvido pela guarda REAL com o cookie de antes da alteração | ✅ PASS |
| AC9 — alteração que deixaria a imobiliária sem administrador é recusada | recusa + nada gravado | `users-actions.test.ts:418` mensagem exata; `:426` — `expect(row.role).toBe("administrador")`. Contraprova em `:452`: com outro administrador ativo o mesmo rebaixamento **passa** | ✅ PASS |
| AC10 — usuário desativado tem **o login recusado** e sai de toda lista de atribuição, mantendo o nome no histórico | login global recusado | `src/server/__tests__/deactivate-actions.test.ts:517`/`:520` sai de `getBrokers`/`getBrokerLoads`; `:526` — `expect(depois).toMatchObject({ ok: false, reason: "sem-vinculo" })` com a MESMA sessão emitida antes; `:532` nome preservado no lead | ⚠️ **SPEC_DEVIATION confirmado** — o que é recusado é o **acesso àquela imobiliária**, não o login global (usuário é multi-tenant por AD-021). As três metades da AC estão satisfeitas dentro dessa leitura |

### USER-02 — A desativação de um corretor decide o destino da carteira

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 — desativar com leads ativos exige escolher entre transferir / redistribuir / manter | recusa exigindo escolha, nada muda | `deactivate-actions.test.ts:219` — `expect(result.escolhaDeCarteiraObrigatoria).toBe(true)` com `leadsAtivos: 1`; `:222` vínculo ainda ativo; `:223` lead com o mesmo responsável | ✅ PASS |
| AC2 — transferir move todos os leads ativos numa única operação | todos os ativos ao destino | `deactivate-actions.test.ts:258` — `leadsReatribuidos: 2`; `:260-261` os dois ativos (um `em_qualificacao`, um `escalado_humano`) no destino | ✅ PASS |
| AC3 — redistribuir recalcula a carga a cada lead | alternância entre corretores | `deactivate-actions.test.ts:308-310` — `l1 → B`, `l2 → A`, `l3 → B`: alternância só ocorre com recontagem entre leads | ✅ PASS |
| AC4 — manter preserva a atribuição e sinaliza responsável inativo p/ admin e gestor | atribuição intacta + sinal | `deactivate-actions.test.ts:341` atribuição intacta; `:347` nome ainda presente; `:348` — `expect(card.brokerDeactivatedAt).not.toBeNull()` lido por `getLeads` no escopo amplo | ✅ PASS |
| AC5 — leads não ativos nunca mudam de responsável, nas três escolhas | histórico intocado | `deactivate-actions.test.ts:263` (transferir), `:342` (manter), `:371` (sem carteira) | ✅ PASS |
| AC6 — sem leads ativos, desativa direto sem perguntar | `{ ok: true, leadsAtivos: 0 }` sem `destino` | `deactivate-actions.test.ts:369` — sem `destino` no input; `:370` vínculo desativado | ✅ PASS |
| AC7 — destino desativado durante a operação recusa a transferência inteira | nada transferido | `deactivate-actions.test.ts:420` — `expect(transferencia).toEqual({ ok: false, reason: "destino-indisponivel" })`; `:434-436` nenhum lead moveu **e** a origem não foi desativada. Implementação com `select … for update` na transação | ✅ PASS |

### PERM-01 — Cada papel enxerga e faz exatamente o que lhe cabe

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 — admin e gestor: leitura de Dashboard/Pipeline/Chats e escrita em Documentos/Configurações | mesmo alcance fora de Usuários | `src/lib/__tests__/permissions.test.ts:59-68` — varredura provando `can(["administrador"], r, a) === can(["gestor"], r, a)` para todo recurso ≠ `usuarios`; no servidor: `src/server/__tests__/actions.test.ts:1123` gestor edita Configurações e Documentos | ✅ PASS |
| AC2 — gestão de usuários/papéis/convites exclusiva do administrador | só administrador | `permissions.test.ts:71-77` — `expect(can(["gestor"],"usuarios","escrever")).toBe(false)` e `ler` também `false`; no servidor: `src/server/__tests__/users-actions.test.ts:472`/`:478`/`:487` gestor recusado nas TRÊS actions com `"Sem permissão para escrever usuarios."`, corretor em `:515` | ✅ PASS |
| AC3 — corretor lê documentos de contexto, sem escrita, sem acesso a Configurações | `documentos: ["ler"]`, `configuracoes: []` | `permissions.test.ts:81-85`; `src/lib/permissions.ts:63-72` (matriz); no servidor: `actions.test.ts:1085` — `"Sem permissão para escrever documentos."` | ✅ PASS |
| AC4 — papéis acumulados ⇒ união das permissões | união, nunca interseção | `permissions.test.ts:93-95` e `:99-100` (`corretor+administrador` alcança `usuarios` que corretor sozinho não alcança); implementação `src/lib/permissions.ts:83` — `roles.some(...)`; no servidor: `actions.test.ts` (`["corretor","gestor"]` passa a editar Configurações) | ✅ PASS |
| AC5 — operação fora das permissões é recusada **no servidor**, mesmo sem controle na tela | recusa server-side | `actions.test.ts:1068` — `expect(result.ok).toBe(false)` + `expect(result.error).toBe("Sem permissão para escrever configuracoes.")` chamando a action **diretamente**; `:1071-1073` nada gravado (`name`, `agentName`, `supportedModality` inalterados) | ✅ PASS |
| AC6 — recusa registra em log estruturado usuário, imobiliária ativa e recurso negado | os 3 campos | `actions.test.ts:1102-1107` — `expect(log.event).toBe("permissao-negada")`, `log.userId`, `log.userEmail`, `log.tenantId`, `log.resource`, `log.action`, `log.roles`, campo a campo. Contraprova em `:1120` — `expect(warn).not.toHaveBeenCalled()` numa operação permitida | ✅ PASS |
| AC7 — ocultar da navegação os itens sem permissão | item some | `src/components/shell/sidebar.tsx` — `NAV_ITEMS.filter(item => can(roles, item.resource, "ler"))`, cada item carregando o `resource` da matriz | ✅ PASS (camada `none`; verificado por requisição real na T22: `href="/usuarios"` presente no HTML do administrador e ausente no do gestor) |

### SCOPE-01 — O corretor enxerga só a própria carteira

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 — Pipeline restrito aos leads do usuário | só os próprios | `src/server/data/__tests__/isolation.test.ts:349-353` — `expect(doA.map(l=>l.id)).toEqual([leadDeAId])`, `toEqual([leadDeBId])` e `not.toContain` cruzado nos dois sentidos | ✅ PASS |
| AC2 — Chats restrito às conversas dos leads do usuário | só as próprias | `isolation.test.ts:385-397` — `expect(resumosA.map(c=>c.id)).toEqual([conversaDeAId])`; `expect(await getMessages(scopeOf(corretorAId), conversaDeBId)).toEqual([])` **e** a própria thread continua chegando | ✅ PASS |
| AC3 — Dashboard calculado só sobre a carteira | KPIs distintos | `isolation.test.ts:406-408` — `leadCount` 3 no escopo amplo × 1 para cada corretor; `:411-419` volume e distribuições com a mesma discriminação | ✅ PASS |
| AC4 — lead de outro corretor pedido pelo id responde como inexistente | `null`, indistinguível | `isolation.test.ts:359` prova que o lead EXISTE (escopo amplo); `:362` — `expect(pedidoPeloA).toBeNull()`; `:366` — `expect(pedidoPeloA).toEqual(inexistente)` | ✅ PASS |
| AC5 — lead sem responsável visível p/ admin e gestor, invisível p/ corretor puro | visível/invisível | `isolation.test.ts:371-380` — `toContain(leadSemDonoId)` + `toHaveLength(3)` no amplo × `not.toContain` e `getLead(...) === null` no escopo do corretor | ✅ PASS |
| AC6 — filtro na camada de acesso a dados, imobiliária e responsável resolvidos juntos | nenhuma leitura sem escopo | `src/server/data/index.ts:66-70` (`assignedTo(scope)`), aplicado nas 9 funções de leitura que passaram a receber `LeadScope`; `src/lib/lead-scope.ts:18-21` — tipo obrigatório, call site esquecido não compila (`npx tsc --noEmit` exit 0) | ✅ PASS |

### AGENDA-01 — Corretor tem janela de trabalho declarada

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 — corretor salva a própria janela ⇒ dias + início + fim gravados | valores lidos de volta do banco | `src/server/__tests__/work-window-actions.test.ts:160-162` — `expect(saved.workDays).toEqual([1,2,3,4,5])`, `"08:00"`, `"14:00"` | ✅ PASS (⚠️ sem UI — ver Gaps) |
| AC2 — dias 1–7 e horários `HH:MM` em America/Sao_Paulo | aceita 1–7 e `HH:MM`; rejeita fora | `src/lib/__tests__/work-window.test.ts:151` (1–7 + `00:00`/`23:59`); `:180`/`:183` dia 8 e dia 0 recusados; `:189`/`:192` `"9:00"` e `"25:00"` recusados; fuso em `:47-48` — `10:59Z` (07:59 local) `false` × `11:00Z` (08:00 local) `true` | ✅ PASS |
| AC3 — fim não posterior ao início ⇒ recusa apontando o campo | `field: "workHoursEnd"` + mensagem | `work-window.test.ts:157` — `toEqual({ ok: false, field: "workHoursEnd", message: "O horário de fim precisa ser posterior ao de início." })` (fim **igual**), `:168` (fim anterior); na action: `work-window-actions.test.ts:237` mesmo objeto, `:243` nada gravado | ✅ PASS |
| AC4 — nenhum dia selecionado ⇒ recusa | `field: "workDays"` + mensagem | `work-window.test.ts:172` — `toEqual({ ok: false, field: "workDays", message: "Selecione ao menos um dia da semana." })`; na action: `work-window-actions.test.ts:258`, `:264` nada gravado | ✅ PASS |
| AC5 — sem janela declarada ⇒ indisponível em qualquer horário | sempre `false` | `work-window.test.ts:52` — `expect(coversInstant(null, …)).toBe(false)` e `:139` para `coversInterval`, ambos num instante que `MANHA` cobriria (`:23`/`:58` são o contraste) | ✅ PASS |
| AC6 — administrador ou gestor salva a janela de outro corretor com o mesmo efeito | mesmo efeito | `work-window-actions.test.ts:179-181` (administrador → `[6]`, `"09:00"`, `"13:00"`); `:199-201` (gestor → `[2,4]`, `"13:00"`, `"19:00"`) | ✅ PASS (⚠️ sem UI) |
| AC7 — sem papel admin/gestor, salvar a janela de outro é recusado no servidor | recusa + nada gravado | `work-window-actions.test.ts:216` — `toEqual({ ok: false, error: "Sem permissão para editar a janela de trabalho de outro usuário." })` com a action chamada **diretamente**; `:222` — `expect(depois).toEqual(antes)` | ✅ PASS |

### ATRIB-02 — O lead ganha responsável no agendamento

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 — criação pelo contrato deixa de atribuir; lead nasce sem responsável | `assignedUserId` nulo | `src/server/data/__tests__/broker-assignment.test.ts:255` — `expect(lead.assignedUserId).toBeNull()` sobre a MESMA fixture do lote-7 (3 corretores, cargas 3/1/1); `:293-294` reentrega idempotente não apaga um responsável que chegou depois | ✅ PASS |
| AC2 — escolhe entre corretores ativos cuja janela cobre **integralmente** o intervalo de 30 min | contenção integral | `src/lib/__tests__/broker-availability.test.ts:44` — `toEqual(["manha"])` numa reunião 10:00–10:30; `:57` exclui quem não declarou janela; na DAL: `src/server/data/__tests__/assignment.test.ts:239-240` — o corretor da tarde tem vínculo mais antigo e carga zero e **ainda assim não é escolhido**; na rota: `src/server/integration/__tests__/routes/leads-patch-atribuicao.test.ts:178` | ✅ PASS |
| AC3 — mais de um cobre ⇒ menor carga, desempate `createdAt` asc, depois `id` asc | id exato | `broker-availability.test.ts:135-140` — três candidatos cobrindo 13:15–13:45 e `expect(assignBroker(selected)).toBe("leve-antigo")`, o id exato entre dois de carga igual | ✅ PASS |
| AC4 — devolve ao chamador o corretor escolhido, **sem** expor a lista de candidatos | `{name,email}` e nada mais | `leads-patch-atribuicao.test.ts:178` — `expect(body.assignedBroker).toEqual({ name: "Corretora Manhã", email: manhaEmail })`; `:189-191` — `JSON.stringify(body)` **não contém** o e-mail do outro corretor, nem o id dele, nem o id interno do escolhido | ✅ PASS |
| AC5 — nenhum corretor cobre ⇒ recusa com código estável, sem criar a reunião | `code: "sem-corretor-disponivel"`, nada gravado | `leads-patch-atribuicao.test.ts:208-211` — 409 + `application/problem+json` + `expect(body.code).toBe("sem-corretor-disponivel")`; `:215-218` — `meetingAt`, `assignedUserId`, `status` e `executiveSummary` intactos | ✅ PASS |
| AC6 — corretor com reunião sobreposta sai dos candidatos | exclusão por sobreposição, não por dia | `broker-availability.test.ts:77` — `toEqual(["livre"])` com o outro tendo reunião 10:15–10:45; `:100` — reunião **encostada** (termina 10:00, outra começa 10:30) NÃO exclui | ✅ PASS |
| AC7 — dois agendamentos concorrentes: um confirma, o outro recebe o código de conflito | exatamente 1, `conflito-de-agenda` | `assignment.test.ts:333` — `expect(confirmados).toHaveLength(1)` sobre `Promise.all`; `:342` a mesma verdade lida do banco; `:395` — `expect(bloqueou).toBe(true)` por `pg_stat_activity` (o perdedor estava DE FATO travado no índice); `:396` — `toEqual({ ok:false, reason:"conflito-de-agenda" })`; na rota: `leads-patch-atribuicao.test.ts:269` + `:266` | ✅ PASS |
| AC8 — corretor escolhido entra como convidado do evento, pelo e-mail | `attendees` = e-mail do escolhido | `n8n/src/__tests__/agendamento.test.ts:41` — `expect(resultado.convidados).toEqual(["corretora.manha@imobiliaria-a.com.br"])`; fiação até o nó em `n8n/workflows/__tests__/tool-agendar-reuniao.test.ts:117-119` — `expect(additionalFields.attendees).toBe("={{ $('Code: interpretar resposta do CRM').first().json.convidados }}")`; execução real 1722 no fluxo publicado com `convidados: ["corretora.manha@triangulo.com.br"]` | ⚠️ **PASS parcial** — a **resolução** da expressão pelo nó do Google Calendar não é exercitável (`test_workflow` fixa nós com credencial). Ressalva já registrada em `spec.md` |

### ATRIB-03 — Lead escalado para humano nunca fica órfão

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 — lead sem responsável que vira escalado recebe corretor **na mesma operação** que grava o status | 1 escrita | `leads-patch-atribuicao.test.ts:293-294` (200 com `assignedBroker`); `:297-299` status `escalado_humano` **e** `assignedUserId` preenchido, lidos do banco; na DAL: `assignment.test.ts:424-426` (`assignedUserId`, `status`, `statusChangedBy` na mesma `UPDATE`) | ✅ PASS |
| AC2 — escolhe o de menor carga entre os que estão em janela no instante | filtro por janela | `broker-availability.test.ts:167` só quem está em janela às 09:00; `:185` o desempate por carga → `createdAt` | ✅ PASS |
| AC3 — ninguém em janela ⇒ menor carga entre **todos**, em vez de lead órfão | degradação | `broker-availability.test.ts:198` — sábado 22:00 devolve os **três** candidatos, inclusive quem nunca declarou janela; `:203` — `expect(assignBroker(selected)).toBe("tarde")`; `:215` a degradação não vaza para o caso normal | ✅ PASS |
| AC4 — imobiliária sem corretor ativo ⇒ escalonamento gravado, lead sinalizado | status gravado, sem responsável | `leads-patch-atribuicao.test.ts:317-318`/`:321-322` — 200, `assignedBroker` ausente do payload, lead sem responsável; na DAL: `assignment.test.ts:440-444` | ✅ PASS |
| AC5 — lead que já tem responsável preserva o responsável, sem reatribuir | responsável intacto | `assignment.test.ts:460` — `toMatchObject({ ok: true, brokerId: donoId })`; `:463-464` `not.toBe(ociosoId)` mesmo existindo um corretor de carga 0 | ✅ PASS |
| AC6 — trava humana inalterada, mesmo código de erro | `lead-travado-por-humano` | `leads-patch-atribuicao.test.ts:338` — `expect(body.code).toBe("lead-travado-por-humano")`; `:341-343` a recusa acontece **antes** de qualquer atribuição (nem responsável, nem status, nem `escalationReason`) | ✅ PASS |

### SEED-01 — O seed nasce com usuários, papéis e agenda

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 — cada imobiliária com ≥1 administrador, 1 gestor e 2 corretores com janela | contagens por tenant | `src/db/__tests__/seed.test.ts:187-189` — `toBeGreaterThanOrEqual(1)`, `(1)`, `(2)` para os 3 tenants | ✅ PASS |
| AC2 — corretores com janelas distintas, com ≥1 horário coberto por apenas um | cobertura única existe | `seed.test.ts:247` — `expect(new Set(janelas).size).toBeGreaterThanOrEqual(2)`; `:262` — `expect(coberturaUnica.length).toBeGreaterThan(0)`, varrendo 7 dias em passos de 30 min; `:239` validade de cada janela | ✅ PASS |
| AC3 — usuários do seed em convite pendente, sem credencial (exceto o do bootstrap) | zero linhas em `accounts` | `seed.test.ts:205` — `expect(credentials).toHaveLength(0)` para os 15 usuários semeados | ✅ PASS |
| AC4 — usuário em convite pendente segue elegível a lead e reunião | elegível | `seed.test.ts:213` — `expect(assigned.length).toBeGreaterThan(0)` | ✅ PASS |
| AC5 — bootstrap cria ou promove a administrador, com senha, sem e-mail | senha funcional + promoção acumulativa | `src/db/__tests__/create-admin.test.ts` — `expect(result.outcome).toBe("usuario-criado-e-vinculado")`, `expect(membership.role).toBe("administrador")`, `expect(signedIn.user.id).toBe(result.userId)` após `signInEmail`; promoção: `expect(memberships[0].role).toBe("corretor,administrador")` | ✅ PASS |
| AC6 — seed determinístico e reproduzível | mesmo estado em 2 execuções | `seed.test.ts:388` — teste de idempotência por `snapshotIds`, estendido para incluir `users` e `tenant_members` | ✅ PASS |
| AC7 — leads do seed sem responsável, exceto os que já têm reunião | bicondicional | `seed.test.ts:273` — `expect(lead.assignedUserId).toBeNull()` quando `meetingAt === null`; `:275` — `not.toBeNull()` quando não; mais duas asserções de que os dois lados existem na base | ✅ PASS |

**Status**: **75 ACs no total** (AUTH-01 7 · AUTH-02 4 · TENANT-01 6 · USER-01 10 · USER-02 7 · PERM-01 7 · SCOPE-01 6 · AGENDA-01 7 · ATRIB-02 8 · ATRIB-03 6 · SEED-01 7). ✅ **71 PASS limpos**; **2 SPEC_DEVIATION confirmados** (AUTH-01 AC4, USER-01 AC10); **1 PASS parcial** (ATRIB-02 AC8); **1 PASS com ressalva de camada** (AUTH-01 AC1 — o `redirect()` não é exercitado em vitest, provado por requisição real na T5). AGENDA-01 AC1/AC6 estão entre os PASS: as ACs são comportamentos de servidor e a server action as satisfaz — a UI ausente é gap de produto, não de AC. **Zero ACs sem evidência `file:line`.**

---

## Discrimination Sensor

Scratch isolado: `git worktree add <temp> HEAD --detach`, `node_modules` por junção NTFS, testes rodados com `npx vitest run --root <scratch>` a partir do cwd real (nenhum arquivo da árvore real tocado). Nenhum `git stash`.

**Baseline no scratch antes das mutações**: 79 testes puros passando (3 arquivos) + `isolation.test.ts` 23 passando.

| # | File:line | Mutação | Alvo | Killed? |
| - | --------- | ------- | ---- | ------- |
| 1 | `src/server/data/index.ts:66-70` | `assignedTo(scope)` passa a devolver sempre `undefined` — o filtro de carteira some do WHERE, mantendo o de imobiliária | SCOPE-01 AC1/AC3/AC4/AC5 | ✅ **Killed** — `isolation.test.ts` 4 falhas: Pipeline, lead por id, lead sem dono e Dashboard (`leadCount` 1 → 3) |
| 2 | `src/lib/work-window.ts:120` | `localEnd.time <= window.end` → `localStart.time <= window.end` (contenção integral vira "só o início dentro") | ATRIB-02 AC2 + edge case de borda de janela | ✅ **Killed** — 2 falhas: "reunião que COMEÇA no minuto de fim da janela não é coberta" e "reunião que transborda o fim da janela não é coberta" |
| 3 | `src/lib/broker-availability.ts:87` | `(inWindow.length > 0 ? inWindow : candidates)` → `inWindow` (remove a degradação) | ATRIB-03 AC3 | ✅ **Killed** — 1 falha: "com ninguém em janela, devolve TODOS os candidatos em vez de nenhum (AC3)" |
| 4 | `src/lib/permissions.ts:83` | `roles.some(...)` → `roles.every(...)` (união vira interseção) | PERM-01 AC4 | ✅ **Killed** — 3 falhas, incluindo os dois casos nomeados de papéis acumulados |

**Sensor depth**: lightweight+ (4 mutações; alvo em auth/escopo de dado, que é P0)
**Result**: **4/4 killed** — PASS ✅

**Isolamento verificado**: `git status --porcelain` da árvore real idêntico ao baseline pré-sensor (` M n8n/src/phase.mjs` + 4 untracked), `node_modules` real íntegro, worktree removido e podado.

**Limitação declarada**: as mutações rodaram sobre módulos alcançáveis pelo scratch. Não foi possível mutar `proxy.ts` (camada `none`, sem teste automatizado) nem os módulos do n8n publicados na instância.

---

## Interactive UAT Results

Não executada nesta rodada. O lote tem superfície de UI relevante, mas ela **já foi verificada com captura real durante a execução** (T22 tela de Usuários e diálogos, T23 aceite de convite e o edge case de sessão trocada, T32 os 4 estados de recuperação de senha + o card de login). A verificação restante é de ambiente, não de tela — ver Gaps.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ — o rename `brokerId → assignedUserId` foi precedido de grep completo de consumidores (19 arquivos, registrado na T11), aplicando a lição L-015 do lote-7 |
| No scope creep | ⚠️ — três tasks carregaram consequência mecânica além do `Where` declarado (T11 a DAL inteira, T20 e T25 a camada de dados). Em todas o motivo é o mesmo e está registrado: não existia estado intermediário compilável. Não é feature a mais |
| Matches patterns | ✅ — função pura em `src/lib/` testada em vitest, I/O só consumindo; `problem()` + `ProblemCode` para todo erro novo do contrato (AD-013); server action resolvendo o tenant no servidor |
| Spec-anchored outcome check (asserted values match spec) | ✅ — as asserções miram valores exatos (mensagens literais, `code` estável, ids específicos, `toEqual` sobre o objeto inteiro), não "existe uma asserção" |
| Per-layer Coverage Expectation met | ✅ — domínio 1:1 com ACs (`permissions.test.ts` varre as 36 combinações; `work-window.test.ts` cobre as 4 bordas); rotas com feliz + edge + erro (`leads-patch-atribuicao.test.ts` tem 6 casos, todos os `code` novos) |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — os arquivos novos nomeiam requirement ID no `describe` ou em comentário por AC |
| Documented guidelines followed | ✅ — `AGENTS.md`/`CLAUDE.md` (Astryx: self-check de `<div>`/`style={{}}`/valor cru registrado em cada task de tela); `vitest.config.ts` (`fileParallelism: false`); Test Coverage Matrix de `tasks.md` |
| Would senior engineer approve? | ✅ — com as duas ressalvas abaixo levantadas em revisão |

**Ressalvas de qualidade levantadas por este Verifier (não bloqueantes):**

- `src/lib/mock-manager.ts` ficou sem consumidor de produção (registrado na T9) e seus 5 testes continuam rodando. Código morto testado.
- `src/server/__tests__/tenant.test.ts` tem um caso **degradado** documentado na T9: passa por `` `headers` was called outside a request scope ``, não pela validação de vínculo que ele diz proteger. Não foi corrigido porque a regra do projeto é não mexer em teste alheio sem confirmação. O invariante está coberto por outro ângulo em `linked-tenants.test.ts`.
- `docs/integration/openapi.yaml` e o guia de integração **não documentam** os dois `code` novos (`sem-corretor-disponivel`, `conflito-de-agenda`) nem o campo `assignedBroker` da resposta. Pendência registrada na T28; nenhum teste detecta a divergência (`openapi.test.ts` valida paths, não códigos de erro).

---

## Edge Cases

- [x] **Último administrador ativo tenta desativar a si mesmo** — recusado: `deactivate-actions.test.ts:459` vínculo intacto com a mensagem exata; contraprova em `:472-473` (com dois administradores, passa).
- [~] **Usuário perde o papel corretor com leads atribuídos** — a metade "excluído de novas atribuições" está provada: `src/server/data/__tests__/broker-assignment.test.ts:153` (gestor puro fora de `getBrokerLoads`) e `:190-191` (fora de `getBrokers`). A metade "preserva os leads atribuídos a ele" **não tem asserção direta** — nenhum teste altera papel e depois lê os leads. É garantida por construção (`setMemberRoles` só escreve `tenant_members.role`) e o invariante análogo é asseverado para a desativação em `deactivate-actions.test.ts:532`. **Gap de evidência, não de comportamento.**
- [x] **Corretor desativado com reuniões futuras** — listadas na confirmação: `deactivate-actions.test.ts:585`/`:587` separam carteira ativa de reunião futura e provam que reunião passada não entra. Renderizado e capturado na T22 (`Reuniões futuras já marcadas (1)` acima de `Destino dos 3 leads ativos`).
- [~] **Sessão expira durante o preenchimento de um formulário** — a metade "sessão expirada é recusada" está provada: `src/server/auth/__tests__/session.test.ts:89-108` envelhece a linha de `sessions` e assevera `{ ok: false, reason: "sem-sessao" }`, com a prova de que ANTES resolvia. A metade "redireciona sem gravação parcial" é estrutural (toda server action passa por `verifySession()`, que redireciona antes de qualquer escrita) e **não tem teste dedicado**.
- [x] **Recurso de outra imobiliária pedido pelo identificador** — responde como inexistente: `isolation.test.ts` (isolamento entre tenants, herdado do lote-7 e mantido) e `assignment.test.ts:215-218` (o MESMO usuário vinculado a duas imobiliárias não traz carga nem reunião da vizinha).
- [x] **Convite aberto por alguém autenticado com outra conta** — encerra a sessão corrente antes de ativar: `accept-invitation.test.ts:244` prova que a sessão da outra conta estava VIVA antes; `:257-258` `getSession(...)` `null` depois; `:265` o convidado sai com sessão própria. Exercitado no navegador na T23.
- [x] **Janela cobre o horário mas o corretor está desativado no instante do agendamento** — excluído: `assignment.test.ts:186-188` (vínculo desativado e gestor fora dos candidatos).
- [x] **Reunião no minuto exato de início ou de fim da janela** — só o intervalo integralmente contido: `work-window.test.ts:68` (começa NO início: coberta), `:78` (termina NO fim: coberta), `:88` (começa no minuto de fim: **não** coberta), `:98` (transborda 15 min: **não** coberta). Confirmado pelo mutante 2.

**6 de 8 cobertos com asserção direta; 2 parciais** (metade estrutural sem teste dedicado).

---

## Gate Check

- **Gate command**: `npm test && npm run lint && npm run build && npx tsc --noEmit`
- **`npx vitest run`**: **912 passed / 912**, **74 arquivos**, 0 failed, 0 skipped, duração 483s, exit 0
- **`npm run lint`**: **0 erros**, 2 warnings — `n8n/generated/scheduler.ts:32:35` e `n8n/workflows/scheduler.ts:32:35` (`'ifElse' is defined but never used`), **pré-existentes e fora do escopo deste lote**. Exit 0
- **`npm run build`**: exit 0. Manifesto lista as rotas novas `/login`, `/recuperar-senha`, `/sem-acesso`, `/convite/[token]`, `/usuarios`, `/api/auth/[...all]`, e `ƒ Proxy (Middleware)`
- **`npx tsc --noEmit`**: **0 erros**, exit 0
- **Test count before feature**: 693 (55 arquivos, piso herdado do lote-7)
- **Test count after feature**: 912 (74 arquivos)
- **Delta**: **+219 testes, +19 arquivos**
- **Skipped tests**: nenhum
- **Failures**: nenhuma

**Test Integrity Check**: a contagem só subiu, monotonicamente, task a task (693 → 695 → 700 → 704 → 714 → 719 → 723 → 727 → 731 → 775 → 781 → 786 → 794 → 806 → 817 → 824 → 847 → 854 → 866 → 880 → 886 → 908 → 912). Duas reescritas de teste foram auditadas por serem os pontos onde uma redução disfarçada caberia:

- `src/server/data/__tests__/broker-assignment.test.ts` — a política `ATRIB-01` do lote-7 foi **revogada** por `ATRIB-02` AC1 (AD-022). O arquivo continua com **9 testes**: o caso de "lead nasce com corretor" manteve a fixture inteira (3 corretores, cargas 3/1/1) e trocou o desfecho para `toBeNull()`; o de reentrega ganhou discriminação **nova** (o responsável atribuído depois tem de sobreviver à reentrega, `:293-294`). Substituição 1:1, nunca redução.
- `src/server/__tests__/actions.test.ts` — as 44 asserções pré-existentes estão intactas; o que mudou foi o harness (mock de `cookies()` → mock de `verifySession`, no MESMO tenant real) e três títulos que diziam "pelo cookie" e tinham virado mentira.

O teste de pureza de `src/lib/broker-assignment.ts` continua ativo e **não foi enfraquecido**: `src/lib/__tests__/broker-assignment.test.ts:49` segue asseverando `expect(source).not.toMatch(/\bimport\b/)`. `git diff 19edb45..f931156 -- src/lib/broker-assignment.ts` é **vazio**.

---

## Desvios confirmados (`SPEC_DEVIATION`)

Cada um foi re-verificado neste relatório, não aceito de graça.

| # | Task | Desvio | Verificação independente | Veredito |
| - | ---- | ------ | ------------------------ | -------- |
| 1 | T3 | slug `vale-uberaba` em vez de `vale-do-uberaba` | `src/db/seed.ts:211-212`, `src/db/__tests__/seed.test.ts:44,103` e `docs/integration/openapi.yaml:329` usam todos `vale-uberaba`. Nenhum consumidor do outro valor | **Justificado** — alinhar a spec ao valor real seria a correção; mudar o código quebraria contrato documentado sem ganho |
| 2 | T6 | rate limit de login por **IP + rota**, não por e-mail (AUTH-01 AC4) | `src/server/auth/config.ts:78-86` — `rateLimit.customRules["/sign-in/email"] = { window: 60, max: 10 }`, mecanismo nativo do better-auth | **Justificado, mas é desvio real de AC.** A AC diz "para o mesmo e-mail". Um atacante distribuído por IPs não é barrado; um usuário legítimo atrás de NAT compartilhado pode ser. Decisão do usuário para um lote de endurecimento |
| 3 | T21 | USER-01 AC10 "recusar o login" implementado como recusar o **acesso àquela imobiliária** | `src/server/auth/session.ts:86-99` filtra vínculos por `isNull(deactivatedAt)`; `deactivate-actions.test.ts:526` prova `reason: "sem-vinculo"` com a sessão emitida antes | **Justificado** — a leitura literal contradiz AD-021 (conta única multi-imobiliária). Interpretação correta do espírito da spec |
| 4 | T25 | AGENDA-01 entregue como server action, **sem UI** | `grep saveWorkWindowAction` em `src/components/` e `app/`: **zero consumidores de produção**, só o teste | **Real e aberto** — nenhuma AC de AGENDA-01 exige tela, então não é FAIL de AC; mas a user story ("quero declarar em que dias eu atendo") não é alcançável pelo produto hoje. Ver Gaps |
| 5 | T26 | filtros em `src/lib/broker-availability.ts` em vez de dentro de `broker-assignment.ts` | O teste de pureza `broker-assignment.test.ts:49` proíbe `import` naquele arquivo; o design exigia importar `work-window.ts`. Módulo novo satisfaz os dois | **Justificado** — a alternativa era enfraquecer uma asserção existente para acomodar a implementação |
| 6 | T31 | mensagem de commit trocada (`docs(ambiente)` em vez de `chore(ambiente): reseed…`) | O commit `f7c6699` não contém reseed nenhum; contém o procedimento escrito | **Justificado** — a mensagem planejada gravaria afirmação falsa no histórico |

---

## Gaps (ranqueados — nenhum bloqueia o veredito)

1. **AGENDA-01 sem UI** (Major) — `saveWorkWindowAction` não tem consumidor de produção. Um corretor não consegue declarar a própria janela pelo CRM; só o seed e o bootstrap escrevem janela. Como a atribuição por agenda depende inteiramente da janela declarada, a metade "agenda" do lote não é operável por um cliente real. **Fix**: ligar o diálogo na tela de Usuários (o dado já é exibido lá) + a edição pelo próprio corretor. Exige captura visual real.
2. ~~**AUTH-01 AC4 chaveada por IP** (Major)~~ — **CORRIGIDO**. Contador próprio por e-mail em `login_attempts` (Postgres), ligado por `hooks.before`/`hooks.after` do better-auth em `/sign-in/email`. O limite por IP continua ligado — os dois são complementares. Prova: `src/server/auth/__tests__/login-attempts.test.ts`, 10 falhas do mesmo e-mail vindas de 10 IPs distintos recusam a 11ª (429) de um IP inédito, e outro e-mail no mesmo IP segue em 401.
3. **Credencial de serviço do n8n sem `Bearer `** (Major, **fora do código**) — 401 medido na execução 1731. Toda chamada do agente ao CRM falha até um humano corrigir o valor na UI do n8n (AD-014). Bloqueia o único critério `- [ ]` do lote (T31) e o desfecho ponta a ponta de ATRIB-02 AC8. **Fix**: humano, não código.
4. **ATRIB-02 AC8 metade não exercitável** (Minor) — a resolução da expressão `attendees` pelo nó do Google Calendar só se prova numa reunião agendada de verdade. Depende do item 3.
5. **`openapi.yaml` desatualizado** (Minor) — dois `code` novos e o campo `assignedBroker` existem no código e nos testes, não na documentação do contrato. Nenhum teste detecta.
6. **Edge case "perde o papel corretor" com meia evidência** (Minor) — falta asserção de que os leads já atribuídos sobrevivem a uma troca de papel.
7. **Edge case "sessão expira no formulário" com meia evidência** (Minor) — falta teste do "sem gravação parcial" numa server action.
8. **Teste degradado em `src/server/__tests__/tenant.test.ts`** (Minor) — passa pelo motivo errado; documentado na T9 e deliberadamente não tocado.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| AUTH-01 | Implementing | ✅ Verified (com `SPEC_DEVIATION` na AC4) |
| AUTH-02 | Implementing | ✅ Verified |
| TENANT-01 | Implementing | ✅ Verified |
| USER-01 | Implementing | ✅ Verified (com `SPEC_DEVIATION` na AC10) |
| USER-02 | Implementing | ✅ Verified |
| PERM-01 | Implementing | ✅ Verified |
| SCOPE-01 | Implementing | ✅ Verified |
| AGENDA-01 | Implementing ⚠️ | ✅ Verified server-side — **UI pendente** (gap 1) |
| ATRIB-02 | Implementing | ✅ Verified (AC8 parcial — gap 4) |
| ATRIB-03 | Implementing | ✅ Verified |
| SEED-01 | Implementing | ✅ Verified (T31 com 1 critério de ambiente aberto — gap 3) |

---

## Summary

**Overall**: ✅ Ready

**Result**: PASS ✅

**Spec-anchored check**: 75/75 ACs com evidência `file:line` real; 71 PASS limpos, 2 `SPEC_DEVIATION` confirmados e justificados, 1 PASS parcial (ATRIB-02 AC8), 1 com ressalva de camada declarada (AUTH-01 AC1). Zero ACs sem evidência.
**Sensor**: 4/4 mutações mortas.
**Gate**: 912 passed / 74 arquivos, 0 failed, 0 skipped; lint 0 erros; build exit 0; `tsc --noEmit` 0.

**O que funciona**: o CRM inteiro atrás de login com a autorização na camada de dados, não no proxy; imobiliária ativa vinda do vínculo e não de cookie livre; os três papéis com união de permissões e recusa server-side com log estruturado; carteira do corretor isolada por um tipo obrigatório que faz o call site esquecido não compilar — e o mutante 1 provou que o teste de vazamento pega a regressão; gestão completa de usuários (convite, reenvio, papéis, desativação com as três escolhas de carteira) com o invariante do último administrador protegido nas duas direções; atribuição por janela de trabalho no agendamento e no escalonamento, com índice único no banco absorvendo a corrida e traduzindo o perdedor num `code` estável; seed determinístico produzindo ambiente logável.

**O que não funciona / não foi provado**: a janela de trabalho não tem por onde ser editada no produto (gap 1); o limite de login é por IP, não por e-mail (gap 2); a credencial do n8n está inválida, então o agente não fala com o CRM e a ponta a ponta do agendamento real não fechou (gaps 3 e 4).

**Next steps**: nenhum fix é pré-condição do veredito. Em ordem de valor: (1) o humano corrigir o valor da credencial no n8n — destrava a prova de AC8 e o último critério da T31; (2) ligar a UI da janela de trabalho num lote de acabamento; (3) decidir sobre o rate limit por e-mail num lote de endurecimento; (4) atualizar `openapi.yaml`.
