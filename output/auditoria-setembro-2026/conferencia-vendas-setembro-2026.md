# Conferência de vendas e contas a receber — setembro de 2026

Consulta em produção: 30/09/2026, 23:34:31 (America/Recife).

A sessão e as transações estavam configuradas somente para leitura (transaction_read_only = on). Não houve inserções, atualizações, exclusões ou execução de migrações. A conexão e a senha não foram armazenadas neste relatório.

## Resultado

- 68 pedidos de setembro: 64 atendidos, 3 parcialmente atendidos e 1 aberto.
- Os 67 pedidos atendidos ou parcialmente atendidos possuem contas a receber vinculadas.
- Nenhum atendimento concluído foi identificado sem título associado ao pedido; o valor nominal dos títulos associados cobre os valores dos atendimentos, com tolerância de R$ 0,01. Isso verifica cobertura, sem certificar o saldo devido após pagamentos e devoluções.
- Dos 37 pedidos com data de venda entre 14 e 30 de setembro, 36 têm atendimento e títulos; 1 está aberto, sem atendimento ou título.
- 76 títulos vinculados: 42 pagos, 8 parciais e 26 abertos. Foram encontrados 14 títulos na categoria RECEITAS OPERACIONAIS e 62 na categoria Vendas.

## Único pedido sem contas a receber

| Pedido | Data registrada | Cliente | Status | Valor do pedido | Atendimento |
|---|---|---|---|---:|---|
| VEN-2026-1790791144819 | 29/09/2026 | SERGIO | Aberto | R$ 12.722,50 | Nenhum |

Este pedido está aberto. A ausência do título, isoladamente, não comprova falha na geração financeira, pois o atendimento ainda não foi registrado.

## Títulos adicionais que exigem revisão

Oito títulos abertos já existiam no banco antes desta consulta, todos criados em 30/09/2026 às 23:04:50 (America/Recife). Cada um se refere a um atendimento que já possui outro título na categoria RECEITAS OPERACIONAIS. A consulta não identifica quem executou essa operação nem sua justificativa.

Em seis casos, o título anterior tem o mesmo valor positivo: são possíveis duplicidades que somam R$ 119.770,74 em novos títulos abertos. Cinco títulos anteriores estão pagos e um está parcialmente recebido. Nos dois outros casos, os títulos anteriores têm valor zero, e os novos somam R$ 51.867,40; é necessário conferir o histórico e as devoluções antes de concluir se são indevidos. O total dos oito títulos adicionais é R$ 171.638,14.

| Pedido | Cliente | Valor anterior | Status anterior | Recebimentos anteriores | Novo título aberto | Observação |
|---|---|---:|---|---:|---:|---|
| VEN-2026-1789407863720 | RENATA FABRICA | R$ 1.236,25 | Pago | R$ 1.236,25 | R$ 1.236,25 | Mesmo atendimento e mesmo valor |
| VEN-2026-1789575571702 | CARLOS JR | R$ 5.101,85 | Pago | R$ 5.101,85 | R$ 5.101,85 | Mesmo atendimento e mesmo valor |
| VEN-2026-1789991012485 | PACHECO DISTRIBUIDORA DE ALIMENTOS LTDA | R$ 0,00 | Pago | R$ 0,00 | R$ 35.278,10 | Título anterior zerado; revisar histórico |
| VEN-2026-1790016433956 | PANIFICADORA IMPERIAL LTDA | R$ 245,12 | Pago | R$ 245,12 | R$ 245,12 | Mesmo atendimento e mesmo valor |
| VEN-2026-1790017772983 | PACHECO DISTRIBUIDORA DE ALIMENTOS LTDA | R$ 4.680,00 | Pago | R$ 4.680,00 | R$ 4.680,00 | Mesmo atendimento e mesmo valor |
| VEN-2026-1790021462295 | PACHECO DISTRIBUIDORA DE ALIMENTOS LTDA | R$ 0,00 | Pago | R$ 0,00 | R$ 16.589,30 | Título anterior zerado; revisar histórico e devolução |
| VEN-2026-1790077824640 | JUNIOR BARRETOS - SERGIPE | R$ 108.443,52 | Parcial | R$ 90.000,00 | R$ 108.443,52 | Mesmo atendimento e mesmo valor |
| VEN-2026-1790424026372 | PEDRO  VIZINHO SITIO SERROTE | R$ 64,00 | Pago | R$ 64,00 | R$ 64,00 | Mesmo atendimento e mesmo valor |

### Identificadores para conferir os oito casos

| Pedido | Atendimento | Título anterior | Título adicional aberto |
|---|---|---|---|
| VEN-2026-1789407863720 | 6f1bfeef-9111-4fbe-a0e1-d132b6eca8e9 | f72c2eda-3c78-474f-b72a-a4f391c9bb1e | bc7b428b-cd48-488a-84b4-9d9d253dbcbc |
| VEN-2026-1789575571702 | f6e510f3-1f4f-4c87-9aab-c158782fb20a | c4d3116f-94ff-485d-b673-26d54ab5d02c | 8e290c7e-7385-4c96-8cb8-dcca6f5d71fe |
| VEN-2026-1789991012485 | 16e029cf-92a8-4342-a580-8a9a0623d39c | e51be31f-9065-4dff-9044-86ad3f9be54f | 7c943028-4f1e-4a51-a335-ba40845bc445 |
| VEN-2026-1790016433956 | 4e70e985-2e17-4841-b424-a4b0c887c3e8 | 01f331cf-6054-4a3c-a414-d0c651942bf7 | f7a184db-41d6-4f21-a5ad-4065fc6cf473 |
| VEN-2026-1790017772983 | 9256621d-c3ef-4834-b3f2-87adec907d8e | 43cc7e8f-f339-4231-bc49-d3f6bb469281 | 6cbf18a3-fbf8-4bd1-a8ad-cbf419ba4ead |
| VEN-2026-1790021462295 | f5a118a9-71e4-435a-b41e-9d6d6f3d946d | 116f4fd7-5a7c-4bbf-9dd9-52d414a6d63d | 7be7332b-6a3f-438e-9d5a-8278afc1e37b |
| VEN-2026-1790077824640 | 850d7993-c06f-4524-8e48-a8c9eeb6162f | 05f040d6-d260-4b75-8d4d-a8229440a00b | 948d4a39-7a37-4918-bcb7-f782237887e1 |
| VEN-2026-1790424026372 | 07ba7f3d-ee07-4c72-8831-61758c2a9ec7 | 4ac3c094-6c44-4dd5-8847-6f15cfb6026a | 7c1ee223-4204-42d9-afc7-3333bad3d23d |

## Lista completa dos pedidos de setembro

O valor atendido soma somente atendimentos concluídos. O valor nominal dos títulos soma os lançamentos vinculados, inclusive os títulos adicionais sinalizados acima; não representa saldo a cobrar.

| Data registrada | Pedido | Cliente | Status do pedido | Valor do pedido | Valor atendido | Títulos | Valor nominal dos títulos | Resultado |
|---|---|---|---|---:|---:|---:|---:|---|
| 01/09/2026 | VEN-2026-1788360284859 | DUDE | Atendido | R$ 6.271,50 | R$ 6.271,50 | 1 | R$ 6.271,50 | Título vinculado |
| 01/09/2026 | VEN-2026-1788366953159 | ISSAC VICTOR SILVA DE MORAES | Atendido | R$ 12.857,40 | R$ 12.857,40 | 1 | R$ 12.857,40 | Título vinculado |
| 01/09/2026 | VEN-2026-1788444664191 | EUDES | Parcialmente Atendido | R$ 80.822,10 | R$ 21.016,56 | 1 | R$ 21.016,56 | Título vinculado |
| 02/09/2026 | VEN-2026-1788361890062 | RENATA FABRICA | Atendido | R$ 687,30 | R$ 687,30 | 1 | R$ 687,30 | Título vinculado |
| 02/09/2026 | VEN-2026-1788363466382 | DENIZARD DEMETRIO ALVES | Atendido | R$ 1.185,00 | R$ 1.185,00 | 1 | R$ 1.185,00 | Título vinculado |
| 03/09/2026 | VEN-2026-1788447742203 | CARLOS JR | Atendido | R$ 7.299,85 | R$ 7.299,85 | 1 | R$ 7.299,85 | Título vinculado |
| 03/09/2026 | VEN-2026-1788566677281 | DENIZARD DEMETRIO ALVES | Atendido | R$ 1.190,00 | R$ 1.190,00 | 1 | R$ 1.190,00 | Título vinculado |
| 03/09/2026 | VEN-2026-1788566967988 | LUCINHA COZINHA | Atendido | R$ 127,68 | R$ 127,68 | 1 | R$ 127,68 | Título vinculado |
| 03/09/2026 | VEN-2026-1788567068490 | ANTONIO TACIANO | Atendido | R$ 19.298,68 | R$ 19.298,68 | 1 | R$ 19.298,68 | Título vinculado |
| 03/09/2026 | VEN-2026-1788567361795 | ARTHUR | Atendido | R$ 148,20 | R$ 148,20 | 1 | R$ 148,20 | Título vinculado |
| 04/09/2026 | VEN-2026-1788567229700 | IRAN | Atendido | R$ 20,00 | R$ 20,00 | 1 | R$ 20,00 | Título vinculado |
| 05/09/2026 | VEN-2026-1788877497782 | CARLOS JR | Atendido | R$ 752,00 | R$ 752,00 | 1 | R$ 752,00 | Título vinculado |
| 05/09/2026 | VEN-2026-1788877937964 | NEIDE ( RENATA) | Atendido | R$ 597,50 | R$ 597,50 | 1 | R$ 597,50 | Título vinculado |
| 07/09/2026 | VEN-2026-1788876296155 | JUNIOR BARRETOS - SERGIPE | Atendido | R$ 112.359,00 | R$ 112.359,00 | 1 | R$ 112.359,00 | Título vinculado |
| 07/09/2026 | VEN-2026-1788878399480 | SERGIO | Atendido | R$ 2.568,00 | R$ 2.568,00 | 1 | R$ 2.568,00 | Título vinculado |
| 08/09/2026 | VEN-2026-1788875786336 | LUCAS  COSTA | Atendido | R$ 1.271,70 | R$ 1.271,70 | 1 | R$ 1.271,70 | Título vinculado |
| 08/09/2026 | VEN-2026-1788876593475 | RAFAEL ( CAPOEIRAS) | Atendido | R$ 3.265,65 | R$ 3.265,65 | 1 | R$ 3.265,65 | Título vinculado |
| 08/09/2026 | VEN-2026-1788876915128 | ALEXANDRE | Atendido | R$ 2.644,65 | R$ 2.644,65 | 2 | R$ 2.644,65 | Título vinculado |
| 08/09/2026 | VEN-2026-1788893234057 | RENATA FABRICA | Atendido | R$ 607,50 | R$ 607,50 | 1 | R$ 607,50 | Título vinculado |
| 08/09/2026 | VEN-2026-1788963623063 | DUDE | Atendido | R$ 6.183,63 | R$ 6.183,63 | 1 | R$ 6.183,63 | Título vinculado |
| 10/09/2026 | VEN-2026-1789043697039 | SERGIO | Atendido | R$ 9.873,95 | R$ 9.873,95 | 1 | R$ 9.873,95 | Título vinculado |
| 10/09/2026 | VEN-2026-1789062446642 | DENIZARD DEMETRIO ALVES | Atendido | R$ 1.232,50 | R$ 1.232,50 | 1 | R$ 1.232,50 | Título vinculado |
| 10/09/2026 | VEN-2026-1789066237097 | RENATA FABRICA | Atendido | R$ 1.278,60 | R$ 1.278,60 | 1 | R$ 1.278,60 | Título vinculado |
| 10/09/2026 | VEN-2026-1789066893294 | CARLOS JR | Atendido | R$ 3.809,60 | R$ 3.809,60 | 1 | R$ 3.809,60 | Título vinculado |
| 10/09/2026 | VEN-2026-1789066942719 | DENIZARD DEMETRIO ALVES | Atendido | R$ 1.215,00 | R$ 1.215,00 | 1 | R$ 1.215,00 | Título vinculado |
| 10/09/2026 | VEN-2026-1789126518908 | VALKIRIA | Atendido | R$ 32,00 | R$ 32,00 | 1 | R$ 32,00 | Título vinculado |
| 11/09/2026 | VEN-2026-1789408183797 | FLAVIO QUITANDA | Atendido | R$ 1.321,65 | R$ 1.321,65 | 1 | R$ 1.321,65 | Título vinculado |
| 11/09/2026 | VEN-2026-1789408278837 | FLAVIO QUITANDA | Atendido | R$ 1.765,80 | R$ 1.765,80 | 1 | R$ 1.765,80 | Título vinculado |
| 11/09/2026 | VEN-2026-1789411348897 | DUDE | Atendido | R$ 6.355,68 | R$ 6.355,68 | 1 | R$ 6.355,68 | Título vinculado |
| 12/09/2026 | VEN-2026-1789408084861 | IGOR RAMON | Atendido | R$ 64,00 | R$ 64,00 | 1 | R$ 64,00 | Título vinculado |
| 13/09/2026 | VEN-2026-1789407668058 | JOÃO PAULO | Atendido | R$ 780,07 | R$ 780,07 | 1 | R$ 780,07 | Título vinculado |
| 14/09/2026 | VEN-2026-1789407863720 | RENATA FABRICA | Atendido | R$ 1.236,25 | R$ 1.236,25 | 2 | R$ 2.472,50 | Revisar título adicional |
| 14/09/2026 | VEN-2026-1789408431510 | RENATA FABRICA | Atendido | R$ 2.562,70 | R$ 2.562,70 | 1 | R$ 2.562,70 | Título vinculado |
| 14/09/2026 | VEN-2026-1789409266068 | LUCAS  COSTA | Atendido | R$ 1.332,45 | R$ 1.332,45 | 1 | R$ 1.332,45 | Título vinculado |
| 14/09/2026 | VEN-2026-1789470854002 | JUNIOR BARRETOS - SERGIPE | Atendido | R$ 111.098,06 | R$ 111.098,06 | 1 | R$ 111.098,06 | Título vinculado |
| 15/09/2026 | VEN-2026-1789492808514 | ISSAC VICTOR SILVA DE MORAES | Atendido | R$ 19.812,60 | R$ 19.812,60 | 1 | R$ 19.812,60 | Título vinculado |
| 15/09/2026 | VEN-2026-1789575571702 | CARLOS JR | Atendido | R$ 5.101,85 | R$ 5.101,85 | 2 | R$ 10.203,70 | Revisar título adicional |
| 16/09/2026 | VEN-2026-1789567877967 | SERGIO | Atendido | R$ 3.919,60 | R$ 3.919,60 | 1 | R$ 3.919,60 | Título vinculado |
| 16/09/2026 | VEN-2026-1789570035133 | SERGIO | Atendido | R$ 9.765,00 | R$ 9.765,00 | 1 | R$ 9.765,00 | Título vinculado |
| 17/09/2026 | VEN-2026-1789654839769 | RENATA FABRICA | Parcialmente Atendido | R$ 1.233,75 | R$ 1.203,75 | 1 | R$ 1.233,75 | Título vinculado |
| 17/09/2026 | VEN-2026-1789654928048 | DENIZARD DEMETRIO ALVES | Atendido | R$ 1.216,25 | R$ 1.216,25 | 1 | R$ 1.216,25 | Título vinculado |
| 17/09/2026 | VEN-2026-1789659606627 | SERGIO | Atendido | R$ 1.851,25 | R$ 1.851,25 | 1 | R$ 1.851,25 | Título vinculado |
| 17/09/2026 | VEN-2026-1789664770608 | SERGIO | Atendido | R$ 147,50 | R$ 147,50 | 1 | R$ 147,50 | Título vinculado |
| 17/09/2026 | VEN-2026-1789738305635 | DENIZARD DEMETRIO ALVES | Atendido | R$ 40,00 | R$ 40,00 | 1 | R$ 40,00 | Título vinculado |
| 18/09/2026 | VEN-2026-1789738098631 | RENATA FABRICA | Atendido | R$ 1.320,95 | R$ 1.320,95 | 1 | R$ 1.320,95 | Título vinculado |
| 18/09/2026 | VEN-2026-1789750563677 | RENATA FABRICA | Atendido | R$ 110,20 | R$ 110,20 | 1 | R$ 110,20 | Título vinculado |
| 18/09/2026 | VEN-2026-1789750693168 | SERGIO | Atendido | R$ 118,90 | R$ 118,90 | 1 | R$ 118,90 | Título vinculado |
| 18/09/2026 | VEN-2026-1789991012485 | PACHECO DISTRIBUIDORA DE ALIMENTOS LTDA | Atendido | R$ 35.278,10 | R$ 35.278,10 | 2 | R$ 35.278,10 | Revisar título adicional |
| 21/09/2026 | VEN-2026-1790015408245 | LUCAS  COSTA | Atendido | R$ 1.966,95 | R$ 1.966,95 | 1 | R$ 1.966,95 | Título vinculado |
| 21/09/2026 | VEN-2026-1790016433956 | PANIFICADORA IMPERIAL LTDA | Atendido | R$ 245,12 | R$ 245,12 | 2 | R$ 490,24 | Revisar título adicional |
| 21/09/2026 | VEN-2026-1790017772983 | PACHECO DISTRIBUIDORA DE ALIMENTOS LTDA | Atendido | R$ 4.680,00 | R$ 4.680,00 | 2 | R$ 9.360,00 | Revisar título adicional |
| 21/09/2026 | VEN-2026-1790021462295 | PACHECO DISTRIBUIDORA DE ALIMENTOS LTDA | Parcialmente Atendido | R$ 30.524,00 | R$ 16.589,30 | 2 | R$ 16.589,30 | Revisar título adicional |
| 21/09/2026 | VEN-2026-1790077824640 | JUNIOR BARRETOS - SERGIPE | Atendido | R$ 108.443,52 | R$ 108.443,52 | 2 | R$ 216.887,04 | Revisar título adicional |
| 22/09/2026 | VEN-2026-1790082660528 | BEMIX SUPERMERCADOS LTDA | Atendido | R$ 2.094,20 | R$ 2.094,20 | 1 | R$ 2.094,20 | Título vinculado |
| 22/09/2026 | VEN-2026-1790085144059 | CARUARU FRIOS LTDA | Atendido | R$ 32.075,20 | R$ 32.075,20 | 1 | R$ 32.075,20 | Título vinculado |
| 22/09/2026 | VEN-2026-1790085464286 | ISSAC VICTOR SILVA DE MORAES | Atendido | R$ 19.980,00 | R$ 19.980,00 | 1 | R$ 19.980,00 | Título vinculado |
| 23/09/2026 | VEN-2026-1790180701628 | SERGIO | Atendido | R$ 7.610,05 | R$ 7.610,05 | 1 | R$ 7.610,05 | Título vinculado |
| 23/09/2026 | VEN-2026-1790335826523 | CARLOS JR | Atendido | R$ 4.848,00 | R$ 4.848,00 | 1 | R$ 4.848,00 | Título vinculado |
| 24/09/2026 | VEN-2026-1790263922514 | DENIZARD DEMETRIO ALVES | Atendido | R$ 2.407,50 | R$ 2.407,50 | 1 | R$ 2.407,50 | Título vinculado |
| 24/09/2026 | VEN-2026-1790264840773 | SERGIO | Atendido | R$ 15.870,00 | R$ 15.870,00 | 1 | R$ 15.870,00 | Título vinculado |
| 24/09/2026 | VEN-2026-1790264887246 | SERGIO | Atendido | R$ 102,50 | R$ 102,50 | 1 | R$ 102,50 | Título vinculado |
| 26/09/2026 | VEN-2026-1790424026372 | PEDRO  VIZINHO SITIO SERROTE | Atendido | R$ 64,00 | R$ 64,00 | 2 | R$ 128,00 | Revisar título adicional |
| 26/09/2026 | VEN-2026-1790426405953 | ALYNNE  COLABORADORA | Atendido | R$ 64,00 | R$ 64,00 | 1 | R$ 64,00 | Título vinculado |
| 26/09/2026 | VEN-2026-1790426436867 | NEUZA COLABORADORA | Atendido | R$ 67,20 | R$ 67,20 | 1 | R$ 67,20 | Título vinculado |
| 28/09/2026 | VEN-2026-1790612197433 | LUCAS  COSTA | Atendido | R$ 1.992,60 | R$ 1.992,60 | 1 | R$ 1.992,60 | Título vinculado |
| 28/09/2026 | VEN-2026-1790691303268 | JUNIOR BARRETOS - SERGIPE | Atendido | R$ 119.718,28 | R$ 119.718,28 | 1 | R$ 119.718,28 | Título vinculado |
| 29/09/2026 | VEN-2026-1790679817842 | DUDE | Atendido | R$ 5.759,05 | R$ 5.759,05 | 1 | R$ 5.759,05 | Título vinculado |
| 29/09/2026 | VEN-2026-1790791144819 | SERGIO | Aberto | R$ 12.722,50 | R$ 0,00 | 0 | R$ 0,00 | Sem título; pedido aberto |

## Critério da conferência

Foram consultados os pedidos com data registrada em setembro, incluindo pedidos com criação ou atendimento no período para evitar omissões na fronteira de datas. Todos os 68 pedidos retornados têm data de pedido em setembro. As datas de pedido são mostradas como a data civil gravada pelo formulário (campos gravados à meia-noite UTC); horários de auditoria e de criação são apresentados no fuso America/Recife.

Os vínculos foram conferidos por referência direta ao pedido, attendance_id, referência direta ao atendimento e referência à finalização financeira (incluindo o grupo de parcelas). Foram considerados todos os títulos Receber, independentemente da categoria, do status de pagamento e da data em que o título foi criado. Nenhum pedido desta amostra possui finalização financeira registrada na tabela específica.

Quatro atendimentos antigos não têm título ligado diretamente a attendance_id, mas estão cobertos por títulos ligados ao pedido: RENATA FABRICA (VEN-2026-1788361890062), SERGIO (VEN-2026-1788878399480), ALEXANDRE (VEN-2026-1788876915128) e DUDE (VEN-2026-1788963623063). A ausência de attendance_id isoladamente não indica falta de contas a receber.

O script de reconciliação já presente no projeto filtra a existência de títulos pela categoria Vendas. Esse critério pode classificar como ausentes títulos reclassificados para RECEITAS OPERACIONAIS. Uma eventual automação deve considerar os vínculos independentemente da categoria e tratar separadamente parcelas, pagamentos, devoluções e títulos zerados. Esse script não foi executado.

Esta conferência descreve o estado atual do banco. Ela não reconstitui quais títulos estavam ausentes anteriormente nem comprova a causa da regressão relatada.

## Investigação da venda VEN-2026-1790679817842

Após a captura de tela enviada pelo usuário, o título foi reconferido diretamente em produção, somente por leitura:

- Cliente: DUDE.
- Valor: R$ 5.759,05.
- Status: Aberto, sem recebimentos registrados.
- Vencimento gravado: 30/09/2026.
- Criado em 29/09/2026 às 09:09:41 (America/Recife).
- Título: 37cf7564-7200-4a29-9a19-5ed23d0dc393.
- Categoria: Vendas.

O vencimento está dentro do período da tela e a descrição contém exatamente o número pesquisado. Esses dois filtros não explicam sua ausência.

No código local, FinanceService.listEntries consulta todos os lançamentos financeiros, ordenados por categoria e descrição, sem paginação, e só depois filtra tipo, vencimento e demais critérios em memória. A busca textual na tela opera sobre essa lista já recebida.

Uma consulta SQL que reproduziu a ordenação mostrou 1.054 lançamentos financeiros e colocou esse título na posição 1.053. O Supabase documenta um limite padrão de 1.000 linhas por consulta, configurável por projeto: https://supabase.com/docs/reference/python/select . Se esse limite estiver ativo, o título fica fora da resposta antes de a pesquisa ser aplicada. Nesse cenário, 45 dos 81 títulos com vencimento em setembro ficam fora da consulta, explicando a omissão de vários registros já existentes. Os 81 títulos por vencimento abrangem também pedidos de outros meses e lançamentos que não são vendas; são um universo diferente dos 76 títulos vinculados aos pedidos de setembro.

A hipótese de truncamento é fortemente consistente com o código e os dados. A resposta autenticada do backend publicado e o limite efetivo configurado no projeto ainda não foram verificados. As requisições com chave pública e sem sessão retornaram zero linhas, por restrição de acesso; não são evidência de ausência dos títulos. O site público usa o mesmo projeto de produção informado.

A correção indicada é aplicar os filtros na consulta ao banco e paginar os resultados de forma estável, preservando os critérios de status calculado. A validação deve confirmar a presença do título acima e a cobertura completa do período. Não se deve gerar outro título para esse pedido. Nenhum código da aplicação nem dado de produção foi alterado nesta investigação.
