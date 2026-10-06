# Pricing Analytics — observação da conta de teste

GETs somente leitura pelo root em 2026-10-02, sem envio, escrita de configuração
ou publicação de saldo. Token servidor consumido apenas no header Authorization;
nenhum token, telefone comercial completo ou payload bruto persistido.

Fonte primária de sintaxe: [SDK oficial Meta, WhatsAppBusinessAccount.php](https://github.com/facebook/facebook-php-business-sdk/blob/main/src/FacebookAds/Object/WhatsAppBusinessAccount.php#L891).
O método getPricingAnalytics documenta phone_numbers como list<string>, start/end
inteiros, DAILY, VOLUME, SERVICE, FREE_CUSTOMER_SERVICE e dimensões PHONE,
PRICING_CATEGORY, PRICING_TYPE, COUNTRY. A leitura abaixo comprova essa chamada
na Graph v25.0 dessa conta; o SDK sozinho não comprova a semântica do saldo.

WABA `1000796702954808` já identificada como Test WhatsApp Business Account.
GET /v25.0/{WABA}/phone_numbers, fields=id,display_phone_number: HTTP200,
um número, ID `1321478747709350`, sem próxima página. O display foi normalizado
para dígitos no servidor; SHA256 do número normalizado:
`aef696b712b89a7e9cc3a9f960bfdc08bb6640d47f38246dcf49d6c5cb4b0cbb`.
Isso comprova WABA→número dessa resposta, sem comprovar vínculo ao tenant.

GET /v25.0/{WABA}/pricing_analytics com phone_numbers=[número normalizado],
start=1790812800, end=1790995749 e os filtros/dimensões acima: HTTP200.
Período diagnóstico UTC: 2026-10-01T00:00:00Z até 2026-10-03T02:49:09Z;
esse fuso não foi declarado como fuso da conta. SHA256 do corpo observado:
`cf034004d4f1a19dde5731ba777c16520d83ca0a311cc541d52771489e75bb93`.

Forma observada: data[].data_points[], um grupo e um ponto, chaves
start/end/phone_number/country/pricing_type/pricing_category/volume.
phone_number coincide exatamente com o número normalizado usado no filtro;
categoria SERVICE, tipo FREE_CUSTOMER_SERVICE, país uppercase alpha2 e volume
inteiro não negativo, diferente de zero. Não há campo metric no ponto; VOLUME
é filtro da requisição, sem inferir que COST tenha o mesmo contrato.
Top-level contém somente data, sem próxima página. Ausência de paging nessa
resposta não comprova o protocolo inteiro de paginação.

Ponto observado cobre start=1790838000 e end=1790924400:
2026-10-01T07:00:00Z até 2026-10-02T07:00:00Z. Não cobre integralmente o
período solicitado. Não preencher lacunas com zero, recortar bucket futuro,
publicar saldo ou deduzir IANA desses horários. T11 deve recusar esse conjunto
para publicar snapshot integral; T12 conserva o mesmo gate de cobertura.

Continuam não comprovados: IANA primário de timezone_id=1, vínculo ao tenant,
resposta integral do mês da conta, significado de vazio/zero, paginação completa
e cobrança de produção. usageEnabled permanece falso. Provas sintéticas do
adapter validam execução/recusa sem conceder essas capacidades reais.

Comparação adicional de granularidade, somente GETs com mesmo número/filtros e
diagnóstico UTC start=1790812800/end=1790995842 (2026-10-03T02:50:42Z):

| Granularidade | Resultado sanitizado | SHA256 da resposta |
| --- | --- | --- |
| HALF_HOUR | HTTP200; um grupo, dois pontos [1790895600,1790897400) e [1790897400,1790899200); identidade/filtros/país válidos, volumes não zero; sem next | `929c77cbd1c615314807c332e062740755a28d92e25d6b528666c906faa7c053` |
| MONTHLY | HTTP200; data=[]; sem next; zero não comprovado | `8fe32e407a1038ee38753b70e5374b3a46d6ae9d5f16cd5b73c53abaca8f5ed0` |

HALF_HOUR também não cobre o período integral. MONTHLY vazio, enquanto outras
granularidades apresentam volume não zero, não concede prova de zero. Nenhuma
dessas leituras autoriza preencher ausência, inferir fuso ou habilitar produção.

Scripts locais usados: analytics-probe.local.mjs (shape sem filtro) e
analytics-filter-probe.local.mjs (filtro/número/intervalos/flags sanitizados).
Ambos ficam fora do commit; o relatório é a evidência versionada sanitizada.
