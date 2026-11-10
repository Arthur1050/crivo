# Lote 18a — Costuras do núcleo — Validação

## Capturas da base e do fim (T3, T44 — KEEP-05)

**Data**: 2026-11-10. **Base**: `bf5e646`, num worktree descartável. **Fim**: `lote-18a` em `2154adc` (código igual ao de `0ad44fb`, a T43). As duas subiram com `npm run preview:test` na porta 3210, contra o mesmo banco de teste base, em sequência (a base foi derrubada antes de o fim subir), sem suíte nem script de fixture entre elas. Mesma janela do Chrome (1440 × 900, área útil de 1384 × 849) e mesmas escalas por captura.

**Logins**: administrador `verificacao@fixture.test` e corretor `corretor@fixture.test`, na `krivo-demo`.

**Método**: comparação visual de cada par e diferença de pixels em tons de cinza com limiar de 40 (Pillow), contando os pixels acima do limiar.

| Página | Administrador | Corretor |
| --- | --- | --- |
| Login | nenhuma (178 pixels no campo de e-mail: cursor do mouse e caret, só na captura do fim) | mesma tela, sem sessão |
| Dashboard | nenhuma (0 pixels) | nenhuma (0 pixels) |
| Pipeline | nenhuma (0 pixels) | nenhuma (0 pixels) |
| Chats | nenhuma (0 pixels) | nenhuma (0 pixels) |
| Documentos | nenhuma (0 pixels) | nenhuma (0 pixels) |
| Imóveis | nenhuma (0 pixels) | nenhuma (0 pixels) |
| Configurações | nenhuma (0 pixels) | nenhuma (0 pixels; 404 nas duas) |
| Usuários | nenhuma (0 pixels) | nenhuma (0 pixels; 404 nas duas) |

**Menu de cada papel**: igual ao da base. Administrador: Dashboard, Pipeline, Chats, Documentos, Imóveis, Configurações e Usuários. Corretor: Dashboard, Pipeline, Chats, Documentos e Imóveis.

**Observações**: o selo "1 Issue" do modo de desenvolvimento do Next aparece nas mesmas páginas nas duas versões (Dashboard, Documentos e Configurações), então não vem do lote. Os textos relativos ("há 1 dia", "Atualizada ontem") são dado variável e saíram iguais porque as duas sessões rodaram no mesmo dia. Resultado: **nenhuma diferença visível**; nenhuma correção foi necessária.

**Arquivos**: `evidence/base/` e `evidence/end/`, com os mesmos nomes (`login.jpg`, `admin-01-dashboard.jpg` a `admin-07-usuarios.jpg`, `corretor-01-dashboard.jpg` a `corretor-07-usuarios.jpg`).
