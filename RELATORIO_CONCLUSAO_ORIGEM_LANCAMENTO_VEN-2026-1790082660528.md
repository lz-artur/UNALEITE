# Relatório de conclusão — origem do contas a receber

**Venda:** `VEN-2026-1790082660528`  
**Cliente:** BEMIX SUPERMERCADOS LTDA  
**Valor:** R$ 2.094,20  
**Atendimento:** `ATD-1` (Concluído)  
**Base da análise:** registros do banco de dados operacional, consultados em modo somente leitura em 29/09/2026.

## Conclusão objetiva

Os registros confirmam que o contas a receber de R$ 2.094,20 foi gerado automaticamente pelo fluxo normal de atendimento da venda `VEN-2026-1790082660528`.

Não há evidência de lançamento avulso, duplicidade, valor divergente ou vínculo criado aleatoriamente. O título financeiro possui ligação interna direta tanto com a venda quanto com o atendimento que o originou e foi criado no exato mesmo instante do atendimento.

Assim, com base nas evidências disponíveis, **não há indício de bug na geração do contas a receber**. A operação registrada é consistente com o comportamento esperado do sistema: concluir o atendimento e gerar a fatura correspondente.

> Observação técnica: nenhum conjunto de registros permite provar de modo absoluto que um software nunca teve um defeito. O que esta análise comprova é que, neste caso, o banco registra uma cadeia consistente, completa e esperada de venda → atendimento → contas a receber, sem sinal de falha na geração do título.

## Evidências verificadas

| Verificação | Evidência encontrada |
|---|---|
| Venda vinculada | `VEN-2026-1790082660528`, status **Atendido** |
| Atendimento de origem | `ATD-1`, status **Concluído** |
| Valor da venda | R$ 2.094,20 |
| Valor do contas a receber | R$ 2.094,20 |
| Descrição do título | `Venda VEN-2026-1790082660528 - BEMIX SUPERMERCADOS LTDA (Fatura - Atendimento ATD-1)` |
| Vínculo com a venda | `reference_table = sales_orders` e `reference_id` igual à chave interna da venda |
| Vínculo com o atendimento | `attendance_id` igual à chave interna do atendimento `ATD-1` |
| Situação financeira | Aberto |
| Duplicidade para esta venda | Não identificada na consulta realizada |

## Linha do tempo da operação

Os horários abaixo foram gravados no banco em UTC e convertidos para o horário de Recife (UTC−3).

| Evento | Data/hora gravada (UTC) | Horário Recife |
|---|---:|---:|
| Criação da venda | 22/09/2026 13:11:00,593 | 22/09/2026 10:11:00,593 |
| Criação/conclusão do atendimento `ATD-1` | 22/09/2026 13:12:46,208 | 22/09/2026 10:12:46,208 |
| Geração do contas a receber | 22/09/2026 13:12:46,208 | 22/09/2026 10:12:46,208 |

O atendimento e o contas a receber possuem a **mesma data, hora e milissegundo** de criação. Essa coincidência, somada às chaves internas e à descrição do título, demonstra que a fatura foi criada como consequência direta do atendimento.

## Esclarecimento sobre a data exibida na tela

O banco gravou a data comercial da venda em 22/09/2026 e o vencimento em 26/09/2026, ambos à meia-noite em UTC. A interface converte esses horários para o fuso de Recife e, por isso, apresenta 21/09/2026 e 25/09/2026.

Esse é um problema de apresentação de datas por fuso horário. Ele **não altera** o valor, o atendimento, os vínculos internos nem a geração do contas a receber.

## Limitação de auditoria de usuário

O atendimento e a venda não registraram usuário nos campos `created_by`/`updated_by`; portanto, não é possível atribuir a operação a uma pessoa específica com os dados atuais. Essa ausência de autoria não invalida os vínculos técnicos que comprovam a origem automática do título.

## Recomendação

Para fortalecer futuras auditorias, o sistema deve gravar obrigatoriamente o usuário logado na criação e conclusão de cada venda/atendimento, além de registrar um evento explícito de geração do lançamento financeiro.
