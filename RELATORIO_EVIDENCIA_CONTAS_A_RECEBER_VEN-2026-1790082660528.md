# Relatório de evidência — contas a receber

**Venda:** `VEN-2026-1790082660528`  
**Cliente:** BEMIX SUPERMERCADOS LTDA  
**Valor:** R$ 2.094,20  
**Consulta realizada em:** 29/09/2026  
**Fonte:** banco de dados operacional (consulta somente leitura)

## Conclusão

O contas a receber foi criado automaticamente como consequência do atendimento da venda. Não é um lançamento sem origem nem um registro solto: ele possui referências internas diretas para a venda e para o atendimento que o originou.

## Vínculo técnico comprovado

| Evidência | Registro encontrado |
|---|---|
| Venda | `VEN-2026-1790082660528` |
| Situação da venda | Atendido |
| Atendimento associado | `ATD-1` — Concluído |
| Valor da venda | R$ 2.094,20 |
| Contas a receber | `Venda VEN-2026-1790082660528 - BEMIX SUPERMERCADOS LTDA (Fatura - Atendimento ATD-1)` |
| Valor do contas a receber | R$ 2.094,20 |
| Situação financeira | Aberto |
| Referência armazenada | `reference_table = sales_orders` |
| Chave da venda usada pelo lançamento | `733d7861-5280-489a-8b4c-3597b9c2b41f` |
| Chave do atendimento usada pelo lançamento | `280d3846-8360-486e-b73f-cb686d243f1f` |

## Linha do tempo registrada no banco (UTC)

| Evento | Data e hora |
|---|---|
| Venda criada | 22/09/2026 13:11:00,593 |
| Atendimento `ATD-1` criado | 22/09/2026 13:12:46,208 |
| Contas a receber criado | 22/09/2026 13:12:46,208 |

O atendimento e o contas a receber têm **a mesma data, hora e milissegundo**. Além disso, o lançamento contém a identificação do atendimento (`ATD-1`) e a chave dele. Esse conjunto de vínculos demonstra que o lançamento foi produzido pelo fluxo de atendimento da venda.

## Observação sobre as datas exibidas na tela

No banco, a venda está datada em 22/09/2026 e o vencimento em 26/09/2026, ambos gravados à meia-noite em UTC. A tela mostrou 21/09/2026 e 25/09/2026 porque converte esse horário UTC para o fuso de Recife (UTC-3), recuando a data no calendário. Isso é um problema de apresentação de data na interface, mas **não altera** a criação, o valor nem o vínculo do contas a receber.

## Limite da evidência

Os campos de usuário criador desses registros estão nulos no banco para esta operação. Por isso, a evidência comprova a origem automática no fluxo de venda/atendimento, mas não permite atribuir a criação a uma pessoa específica. Para futuras auditorias, recomenda-se tornar obrigatório o preenchimento de `created_by` e guardar um log de evento da geração financeira.
