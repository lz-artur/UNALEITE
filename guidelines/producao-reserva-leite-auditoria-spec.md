# SPEC — Reserva transacional de leite e histórico visual da produção

## 1. Objetivo

Corrigir as divergências de saldo de leite causadas pelo fluxo atual de Ordens de Produção (OPs), impedir novas reservas duplicadas e disponibilizar uma trilha visual que permita ao usuário entender cada alteração sem consultar diretamente o banco de dados.

A entrega deve transformar criação, edição, finalização, cancelamento e estorno de OP em operações atômicas, preservar o histórico operacional e reconciliar os dois lotes afetados já identificados em produção.

## 2. Diagnóstico confirmado em produção

### 2.1 Lote comprometido por OP em andamento

- Lote: `LT-2026-1789989268744`.
- Volume original: `8.116 L`.
- Saldo gravado: `8.116 L`.
- OP: `OP-2026-1790012486088`.
- Status da OP: `Em Andamento`.
- Consumo registrado: `8.116 L`.
- Saldo alocável correto: `0 L`.

O fluxo atual cria a OP e o registro de consumo, mas não reserva o leite no saldo do lote.

### 2.2 Lote consumido por OP finalizada

- Lote: `LT-2026-1789988003355`.
- Volume original: `11.087 L`.
- Saldo gravado: `11.087 L`.
- OP: `OP-2026-1790012132762`.
- Status da OP: `Finalizada`.
- Consumo registrado: `11.087 L`.
- Movimentação de saída registrada: `11.087 L`.
- Produto acabado gerado: sim.
- Saldo correto: `0 L`.

A estrutura da finalização está presente, mas o lote terminou novamente com saldo integral e status `Aprovado`. O fluxo de exclusão atual é capaz de produzir esse estado porque restaura o leite de qualquer OP excluída, inclusive quando uma OP em andamento nunca havia reservado esse saldo.

### 2.3 Fragilidades estruturais

- Criação, edição, finalização e exclusão executam várias gravações independentes.
- Falhas intermediárias podem deixar apenas parte da operação persistida.
- A validação de saldo e sua atualização não usam bloqueio de linha, permitindo concorrência.
- Algumas gravações não verificam explicitamente o erro retornado.
- Exclusão física remove a evidência necessária para auditoria.
- Não existe histórico visual de reserva, consumo, devolução ou correção de saldo.
- Os testes atuais não cobrem integralmente o ciclo do leite.

## 3. Decisões funcionais

### 3.1 Significado do saldo disponível

`milk_lots.available_volume_liters` representa o volume **alocável para novas OPs**.

Assim:

- ao abrir uma OP, o leite é reservado e deixa de estar disponível;
- ao finalizar, a reserva passa a consumo efetivo sem uma segunda baixa;
- ao cancelar uma OP em andamento, a reserva é devolvida;
- uma OP finalizada somente pode ser estornada quando nenhum produto gerado tiver sido consumido, vendido, expedido ou reprocessado.

### 3.2 Estados da OP

| Estado | Significado | Efeito no leite |
|---|---|---|
| `Em Andamento` | Produção aberta, recursos reservados | Saldo já reduzido |
| `Finalizada` | Produção concluída e produtos gerados | Reserva convertida em consumo |
| `Cancelada` | OP aberta cancelada | Reserva devolvida |
| `Estornada` | Finalização revertida por usuário autorizado | Consumo e produtos revertidos de forma auditável |

Exclusão física deixa de ser uma ação disponível na aplicação. Registros históricos não são apagados.

### 3.3 Registro de consumo de leite

`production_order_milk_consumptions` continua sendo a fonte de rastreabilidade do volume da OP e recebe:

- `state`: `Reservado`, `Consumido` ou `Estornado`;
- `reserved_at`;
- `consumed_at`;
- `reversed_at`;
- restrição única por `production_order_id` enquanto cada OP aceitar apenas um lote de leite.

O nome atual da tabela será preservado para reduzir o risco da migração. O estado deixa explícita a diferença entre reserva e consumo físico.

## 4. Requisitos funcionais

### RF-01 — Criar OP com reserva

Ao criar uma OP, o sistema deve, na mesma transação:

1. Bloquear o lote de leite para atualização.
2. Validar status e saldo.
3. Reduzir `available_volume_liters` pelos litros planejados.
4. Atualizar o status do lote para `Parcialmente Utilizado` ou `Utilizado`.
5. Criar a OP.
6. Criar o consumo com estado `Reservado`.
7. Reservar os insumos e produtos acabados planejados.
8. Registrar o evento visual `OP criada e recursos reservados`.

Se qualquer etapa falhar, nenhuma alteração pode permanecer.

### RF-02 — Impedir reserva concorrente

- A leitura do lote deve usar `SELECT ... FOR UPDATE` dentro da transação.
- A atualização deve exigir saldo suficiente no momento da gravação.
- Duas requisições simultâneas nunca podem produzir saldo negativo ou dupla reserva.
- Quando o saldo já tiver sido tomado, a segunda requisição retorna uma mensagem funcional informando o saldo atualizado.

### RF-03 — Editar OP em andamento

A edição deve calcular o delta entre a reserva anterior e a nova:

- aumento: reservar somente a diferença;
- redução: devolver somente a diferença;
- troca de lote: devolver a reserva antiga e reservar no lote novo na mesma transação;
- falha ao reservar o novo lote: manter integralmente a situação anterior.

Cada alteração gera um evento com valores anterior e novo.

### RF-04 — Finalizar OP

Na finalização:

- não descontar novamente o leite, insumos ou produtos já reservados;
- converter o consumo de `Reservado` para `Consumido`;
- atualizar a OP para `Finalizada`;
- criar os lotes de produto acabado e coprodutos;
- criar as movimentações físicas de saída e entrada;
- registrar rendimento e quantidades realizadas;
- registrar o evento `OP finalizada`.

Todas as etapas pertencem à mesma transação.

### RF-05 — Cancelar OP em andamento

O cancelamento substitui a exclusão:

- somente OP `Em Andamento` pode ser cancelada;
- exige motivo obrigatório;
- devolve exatamente as reservas registradas;
- marca os consumos como `Estornado`;
- mantém OP, consumos e eventos consultáveis;
- não cria movimentação física de entrada, pois ainda não houve consumo físico;
- registra o evento `OP cancelada e reservas liberadas`.

### RF-06 — Estornar OP finalizada

O estorno deve ser uma ação administrativa separada:

- exige permissão específica, motivo e confirmação reforçada;
- é bloqueado se qualquer lote produzido tiver saldo inferior ao produzido ou possuir vínculo posterior;
- reverte os lotes produzidos, reservas/consumos de insumos e leite e movimentações relacionadas;
- não apaga os registros originais;
- gera movimentações compensatórias, nunca apaga a movimentação histórica;
- marca a OP como `Estornada`;
- registra quem realizou o estorno e por quê.

### RF-07 — Consulta de disponibilidade

- O backend é a fonte de verdade do saldo.
- O seletor de lote exibe somente lotes com saldo alocável positivo e status permitido.
- O frontend pode atualizar a lista para melhorar a experiência, mas nunca substitui a validação transacional.
- Ao receber conflito de saldo, a tela atualiza os lotes e preserva os demais campos preenchidos.

### RF-08 — Reconciliação administrativa

Deve existir uma consulta administrativa que compare, para cada lote:

`volume original − reservas ativas − consumos efetivos = saldo alocável esperado`

A consulta deve mostrar:

- saldo gravado;
- saldo esperado;
- diferença;
- OPs responsáveis;
- última alteração conhecida;
- situação: conciliado ou divergente.

Correção automática em massa fica fora do primeiro rollout. Ajustes posteriores exigem motivo e geram evento de auditoria.

## 5. Histórico e logs visuais

### 5.1 Nova tabela `production_events`

Campos mínimos:

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | Chave primária |
| `production_order_id` | uuid, anulável | Sem exclusão em cascata |
| `milk_lot_id` | uuid, anulável | Permite timeline pelo lote |
| `event_type` | texto | Catálogo controlado |
| `title` | texto | Texto curto para interface |
| `description` | texto | Explicação amigável |
| `actor_id` | uuid, anulável | Usuário responsável |
| `actor_name` | texto | Snapshot do nome/e-mail |
| `before_state` | jsonb | Valores anteriores relevantes |
| `after_state` | jsonb | Valores posteriores relevantes |
| `metadata` | jsonb | Motivo, IDs relacionados e contexto não sensível |
| `correlation_id` | uuid | Agrupa eventos da mesma operação |
| `created_at` | timestamptz | Data e hora imutáveis |

Índices:

- `(production_order_id, created_at desc)`;
- `(milk_lot_id, created_at desc)`;
- `(correlation_id)`;
- `(event_type, created_at desc)`.

Os eventos são append-only. A aplicação não terá endpoint para editar ou excluir eventos.

### 5.2 Catálogo inicial de eventos

- `order_created`
- `resources_reserved`
- `order_updated`
- `milk_lot_changed`
- `reservation_increased`
- `reservation_reduced`
- `order_completed`
- `stock_movements_created`
- `order_cancelled`
- `order_reversed`
- `balance_reconciled`
- `operation_failed`

### 5.3 Eventos de falha

Falhas transacionais são revertidas junto com a operação. Para deixá-las visíveis:

- o service registra `operation_failed` em uma gravação independente após receber o erro da função transacional;
- a falha guarda ação, usuário, mensagem funcional e `correlation_id`;
- não devem ser gravados tokens, payloads completos, chaves ou mensagens internas sensíveis;
- falha de indisponibilidade total do banco permanece somente no log técnico da aplicação.

### 5.4 Tela de histórico da OP

Adicionar a ação `Ver histórico` no menu da OP. A ação abre um painel ou modal com:

- cabeçalho com número, produto, lote de leite e status;
- timeline em ordem cronológica decrescente;
- data/hora e usuário responsável;
- título e descrição amigáveis;
- chips de `Reserva`, `Produção`, `Cancelamento`, `Estorno`, `Correção` ou `Falha`;
- expansão `Ver alterações` com valores anterior e novo;
- botão `Atualizar`.

Exemplo:

> **Leite reservado**  
> Maria — 21/09/2026 14:41  
> 8.116 L reservados do lote LT-2026-1789989268744. Saldo: 8.116 L → 0 L.

### 5.5 Histórico no detalhe do lote de leite

No detalhe do lote, incluir a seção `Movimentações e histórico`, unificando visualmente:

- recepção;
- análise e aprovação/bloqueio;
- reserva em OP;
- alteração de reserva;
- consumo na finalização;
- cancelamento ou estorno;
- reconciliação administrativa.

Cada item deve oferecer link para abrir a OP relacionada quando ela existir.

### 5.6 Mensagens após ações

Após uma operação bem-sucedida, exibir resumo objetivo, por exemplo:

- `OP criada. 8.116 L foram reservados e o lote ficou sem saldo disponível.`
- `OP cancelada. 8.116 L retornaram ao lote LT-...`.
- `OP finalizada. A reserva foi convertida em consumo e o lote produzido foi criado.`

## 6. API e backend

### 6.1 Funções transacionais no PostgreSQL

Criar funções RPC com `SECURITY DEFINER`, `search_path` fixo e validação explícita de usuário:

- `create_production_order_atomic(...)`;
- `update_production_order_atomic(...)`;
- `complete_production_order_atomic(...)`;
- `cancel_production_order_atomic(...)`;
- `reverse_production_order_atomic(...)`;
- `reconcile_milk_lot_balance(...)`.

As funções devem bloquear e processar lotes em ordem determinística para evitar deadlocks.

### 6.2 Endpoints

| Método | Endpoint | Finalidade |
|---|---|---|
| `POST` | `/production-orders` | Criar e reservar atomicamente |
| `PATCH` | `/production-orders/:id` | Editar reservas atomicamente |
| `POST` | `/production-orders/:id/complete` | Finalizar atomicamente |
| `POST` | `/production-orders/:id/cancel` | Cancelar OP aberta |
| `POST` | `/production-orders/:id/reverse` | Estornar OP finalizada |
| `GET` | `/production-orders/:id/events` | Histórico da OP |
| `GET` | `/milk-lots/:id/events` | Histórico do lote |
| `GET` | `/production-reconciliation/milk-lots` | Relatório de divergências |

O `DELETE /production-orders/:id` fica temporariamente compatível durante a implantação, mas passa a chamar cancelamento ou estorno conforme o estado. Depois do período de compatibilidade, deve ser removido.

### 6.3 Identidade do usuário

Todos os comandos recebem o usuário autenticado. O controller de exclusão atual deve passar `@CurrentUser()` ao service. O backend resolve um nome legível a partir de `app_users`, mantendo também o ID.

## 7. Migração e correção de dados

### 7.1 Migration estrutural

A migration deve:

1. Criar `production_events`.
2. Adicionar estado e timestamps aos consumos de leite.
3. Adicionar campos de cancelamento/estorno às OPs.
4. Criar índices e restrições.
5. Criar as funções transacionais.
6. Revogar execução pública das RPCs e conceder somente ao papel usado pelo backend.

### 7.2 Backfill

- OP `Em Andamento`: consumo existente vira `Reservado`.
- OP `Finalizada`: consumo existente vira `Consumido`.
- Dados legados sem linha de consumo não recebem linha inventada automaticamente.
- Criar evento `historical_state_imported` para registros importados, deixando claro que não representa uma ação ocorrida em tempo real.

### 7.3 Correção dos dois lotes confirmados

Executar em transação idempotente e com pré-condições:

1. Confirmar códigos, IDs, volumes e OPs esperadas.
2. Confirmar que a soma reservada/consumida corresponde ao volume integral.
3. Atualizar ambos para `available_volume_liters = 0` e status `Utilizado`.
4. Marcar o consumo da OP em andamento como `Reservado`.
5. Marcar o consumo da OP finalizada como `Consumido`.
6. Não criar nova movimentação para a OP finalizada, pois a saída de 11.087 L já existe.
7. Não criar movimentação física para a OP em andamento.
8. Criar evento `balance_reconciled` com saldo anterior, saldo novo, motivo e referência à investigação.

Se qualquer pré-condição não corresponder ao esperado, a migration deve abortar sem alterações.

### 7.4 Ordem segura de implantação

1. Backup/snapshot do banco.
2. Migration aditiva de tabelas, colunas e RPCs.
3. Deploy do backend usando as RPCs.
4. Teste de fumaça transacional.
5. Correção idempotente dos dois lotes.
6. Deploy do frontend com histórico e novas ações.
7. Monitoramento da reconciliação.
8. Remoção posterior do caminho legado de exclusão.

## 8. Permissões

- Usuário com acesso à produção pode ver eventos operacionais.
- Criar, editar e finalizar seguem as permissões atuais da produção.
- Cancelar exige permissão de alteração de OP.
- Estornar e reconciliar exigem permissão administrativa específica.
- Detalhes técnicos internos de falha não são exibidos ao usuário comum.

## 9. Testes obrigatórios

### 9.1 Banco e concorrência

- Criar OP com 100% do lote deixa saldo zero.
- Criar OP parcial deixa o saldo correto.
- Duas criações simultâneas para o mesmo saldo: somente uma vence.
- Falha em qualquer etapa faz rollback integral.
- Reexecução com a mesma chave de idempotência não duplica OP, eventos ou movimentos.

### 9.2 Edição

- Aumentar e reduzir litros aplica somente o delta.
- Trocar lote restaura o antigo e reserva o novo.
- Falha no novo lote mantém a reserva antiga.
- OP finalizada não permite edição de lote ou litros.

### 9.3 Finalização

- Finalizar não baixa leite duas vezes.
- Consumo muda de `Reservado` para `Consumido`.
- Movimentação de leite corresponde aos litros da OP.
- Produto e coprodutos são criados uma única vez.
- Segunda tentativa de finalização é idempotente ou rejeitada sem efeitos colaterais.

### 9.4 Cancelamento e estorno

- Cancelar OP aberta devolve exatamente a reserva.
- Cancelar duas vezes não devolve duas vezes.
- Estorno é bloqueado quando produto gerado já foi movimentado.
- Estorno permitido cria movimentos compensatórios e preserva o histórico.

### 9.5 Histórico visual

- Timeline apresenta eventos em ordem correta.
- Exibe usuário, data, ação e saldos anterior/novo.
- Usuário comum não vê metadados técnicos sensíveis.
- Links entre lote e OP funcionam.
- Estado vazio e erro de carregamento possuem mensagens claras.

### 9.6 Regressão

- Relatórios de produção continuam usando o custo capturado no consumo.
- Ajuste de quantidade produzida continua funcionando.
- FIFO de insumos e produtos acabados não muda de comportamento.
- Estoque, dashboard e detalhes do lote refletem o novo saldo.

## 10. Critérios de aceite

1. Um lote 100% reservado deixa imediatamente de aparecer em novas OPs.
2. Nenhuma combinação de chamadas concorrentes produz saldo negativo ou dupla reserva.
3. Finalizar uma OP não altera novamente o saldo alocável reservado na criação.
4. Cancelar devolve o saldo uma única vez.
5. OPs não são apagadas fisicamente pela aplicação.
6. Toda mudança de reserva, consumo, cancelamento, estorno ou correção aparece na timeline com usuário e horário.
7. Os dois lotes confirmados ficam com saldo zero e status `Utilizado`, mantendo toda a rastreabilidade existente.
8. O relatório de reconciliação não aponta divergências novas após o rollout.
9. Testes unitários, de integração e concorrência passam antes da implantação.

## 11. Fora do escopo desta entrega

- Múltiplos lotes de leite na mesma OP.
- Replanejamento automático de produção.
- Correção automática indiscriminada de divergências históricas.
- Exclusão definitiva de OPs ou eventos pela interface.
- Alteração retroativa de custos de produções finalizadas.

## 12. Plano de entrega

### Fase 1 — Fundação e proteção

- Migration estrutural.
- RPCs de criação, edição, finalização e cancelamento.
- Testes transacionais e de concorrência.
- Bloqueio do caminho legado de exclusão física.

### Fase 2 — Reconciliação controlada

- Backfill dos estados de consumo.
- Correção dos dois lotes confirmados.
- Relatório administrativo de divergências.
- Validação pós-migração.

### Fase 3 — Transparência para o usuário

- Endpoints de eventos.
- Timeline da OP.
- Histórico no detalhe do lote.
- Mensagens pós-operação e tratamento visual de conflitos.

### Fase 4 — Estorno e endurecimento

- Fluxo administrativo de estorno.
- Movimentações compensatórias.
- Alertas e monitoramento de divergência.
- Remoção definitiva do endpoint legado de exclusão.

## 13. Observabilidade pós-implantação

Durante os primeiros dias, acompanhar diariamente:

- lotes com diferença entre saldo gravado e esperado;
- tentativas recusadas por saldo concorrente;
- falhas por tipo de operação;
- cancelamentos e estornos;
- operações sem evento correspondente;
- OP finalizada sem movimento de leite ou sem lote produzido.

Qualquer divergência deve gerar alerta administrativo e permanecer visível no relatório de reconciliação até resolução.
