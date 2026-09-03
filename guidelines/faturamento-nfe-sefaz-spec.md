# SPEC — Módulo de Faturamento NF-e 55 / SEFAZ-PE

## 1. Objetivo

Estruturar o módulo de faturamento da UNA Laticínios para criar rascunhos de NF-e a partir de pedidos de venda, permitir que o usuário complete manualmente os dados fiscais ainda não cadastrados e, quando todas as informações estiverem válidas, transmitir a NF-e diretamente para a SEFAZ-PE em ambiente de homologação.

O módulo deve ser construído de forma que as telas, persistência, validações e endpoints possam ser entregues antes da primeira transmissão real. A ausência temporária de NCM, CFOP, CST, IBS/CBS ou dados do destinatário não impede salvar um rascunho; impede apenas autorizar a NF-e.

## 2. Premissas confirmadas

- Documento fiscal: NF-e modelo 55.
- Emitente: JPS UNAMILK LTDA.
- CNPJ: 55.219.063/0001-25.
- Inscrição Estadual: 1173628-32.
- UF autorizadora: Pernambuco.
- Integração: direta com a SEFAZ-PE.
- Ambiente inicial: homologação (`tpAmb = 2`).
- Certificado: A1 disponível, válido até 18/05/2027.
- Alíquotas iniciais informadas: ICMS 20,5%, PIS 1,65% e COFINS 7,6%.
- O nome operacional do produto continua aparecendo normalmente no sistema.
- A descrição enviada à NF-e usa o campo específico `Nome fiscal do produto`.
- Informações fiscais faltantes podem ser preenchidas no ato do faturamento.
- Dados autorizados devem permanecer imutáveis, mesmo que os cadastros sejam alterados posteriormente.

As alíquotas confirmadas são valores padrão de preenchimento, não regras fiscais universais. O usuário deve poder alterá-las no rascunho conforme a operação, e a autorização deve exigir a classificação fiscal compatível.

## 3. Diagnóstico da codebase atual

### 3.1 Componentes que serão reutilizados

- Frontend React/Vite com navegação controlada por `App.tsx` e menu em `Layout.tsx`.
- Backend NestJS com módulos, controllers e services por domínio.
- Supabase/PostgreSQL como persistência e Supabase Storage para arquivos.
- Autenticação Bearer já aplicada nos controllers.
- Cadastro de produtos acabados em `finished_products`.
- Cadastro de clientes em `clients`.
- Pedidos e itens em `sales_orders` e `sales_order_items`.
- Atendimento e rastreabilidade de lotes em `sales_order_fulfillments`.
- Contas a receber já criadas a partir do pedido de venda.
- Permissões por página e ações básicas em `user_permissions`.
- Padrão de testes com Jest no backend e Vitest/Testing Library no frontend.

### 3.2 Restrições que influenciam o desenho

- O contas a receber é criado quando o pedido nasce; o faturamento não deve criar outro título.
- O estoque é baixado no atendimento do pedido; autorizar NF-e não pode gerar nova baixa.
- O pedido pode ser parcialmente atendido, embora o primeiro MVP de NF-e adote apenas pedidos completamente atendidos.
- As permissões atuais controlam principalmente a interface. Ações fiscais também precisam ser validadas no backend.
- Os cadastros genéricos aceitam payloads livres; os endpoints fiscais devem usar DTOs explícitos e validação estrita.
- As migrations existentes chegam ao prefixo `029`; o módulo fiscal deve iniciar em `030` ou posterior.

## 4. Escopo do MVP

### 4.1 Incluído

1. Configuração fiscal do emitente.
2. Upload seguro do certificado A1.
3. Campos fiscais opcionais nos cadastros de produto e cliente.
4. Listagem de pedidos elegíveis para faturamento.
5. Criação e edição de rascunho de NF-e.
6. Preenchimento manual de destinatário, operação, produtos, impostos, transporte e pagamento.
7. Salvamento parcial do rascunho.
8. Validação de prontidão com lista objetiva de pendências.
9. Consulta de disponibilidade da SEFAZ-PE.
10. Geração, validação, assinatura e transmissão do XML.
11. Consulta do resultado quando a resposta for assíncrona ou incerta.
12. Armazenamento do XML enviado e do XML autorizado com protocolo.
13. Geração e download do DANFE.
14. Download do XML autorizado.
15. Cancelamento de NF-e autorizada.
16. Histórico de tentativas e eventos.
17. Dashboard e filtros de notas.
18. Permissões específicas para faturamento.

### 4.2 Fora do primeiro MVP

- NFC-e modelo 65.
- Emissão em produção antes da homologação ser aprovada.
- Faturamento parcial de um pedido.
- Mais de uma NF-e para o mesmo pedido.
- Carta de correção eletrônica pela interface.
- Nota complementar, ajuste ou devolução automática.
- Contingência SVC-RS.
- Distribuição DF-e e manifestação do destinatário.
- Envio automático por e-mail.
- Motor tributário que decide sozinho a tributação.
- Importação, exportação, Zona Franca e operações triangulares.

O banco deve permitir evolução para múltiplas NF-e por pedido, mas a regra do MVP bloqueia um segundo faturamento autorizado para o mesmo pedido.

## 5. Princípios funcionais

### 5.1 Cadastro como padrão, rascunho como snapshot

- Produto e cliente fornecem valores padrão.
- O usuário pode completar ou substituir valores no rascunho.
- Alterar o rascunho não altera o cadastro automaticamente.
- A tela pode oferecer a ação explícita `Salvar também no cadastro` para campos reutilizáveis.
- Ao autorizar, dados do emitente, destinatário, itens e tributos ficam congelados.
- Uma alteração posterior no produto ou cliente não altera notas anteriores.

### 5.2 Nome operacional versus nome fiscal

- `name`: nomenclatura usada nas telas operacionais da UNA.
- `fiscal_name`: nomenclatura padrão sugerida no faturamento.
- `fiscal_name_snapshot`: descrição efetivamente utilizada no XML da NF-e.
- A tabela do faturamento mostra ambos para conferência.
- A autorização é bloqueada quando `fiscal_name_snapshot` estiver vazio.
- Não deve haver fallback silencioso para o nome operacional durante a autorização.

### 5.3 Separação entre atendimento e faturamento

- Atendimento continua responsável pela saída física e baixa de estoque.
- Faturamento documenta fiscalmente a saída já atendida.
- O rascunho é criado apenas para pedido com status `Atendido` no MVP.
- Quantidades da NF-e vêm das quantidades atendidas, não de texto livre.
- O usuário não pode faturar quantidade maior que a atendida.

### 5.4 Integração financeira

- A NF-e não cria um novo contas a receber.
- A nota é associada ao título ou às parcelas já vinculadas ao pedido.
- Cancelar a NF-e não cancela automaticamente recebimentos ou parcelas.
- O sistema exibe um alerta para revisão financeira após cancelamento.

## 6. Jornada do usuário

### 6.1 Fluxo principal

1. Usuário acessa `Faturamento`.
2. Seleciona `Emitir NF-e`.
3. Escolhe um pedido elegível e completamente atendido.
4. O sistema cria o rascunho e copia dados atuais do pedido, cliente, produtos e configuração fiscal.
5. O usuário percorre o assistente, preenchendo os campos ausentes.
6. O usuário pode salvar e sair a qualquer momento.
7. A etapa de revisão apresenta pendências, avisos e totais.
8. O usuário executa `Validar NF-e`.
9. Sem erros bloqueantes, a ação `Enviar para homologação` é habilitada.
10. O backend reserva número, gera chave, monta XML, valida schema, assina e transmite.
11. O sistema consulta o recibo/protocolo quando necessário.
12. Se autorizada, salva XML protocolado, gera DANFE e marca a nota como `Autorizada`.
13. Se rejeitada, exibe código e motivo; o usuário corrige o rascunho e tenta novamente quando a rejeição permitir.

### 6.2 Regra de homologação

- A interface deve exibir permanentemente o aviso `Ambiente de homologação — sem valor fiscal`.
- O XML usa `tpAmb = 2`.
- O gerador aplica automaticamente a expressão exigida pela SEFAZ no nome do destinatário em homologação, sem apagar o nome real salvo no snapshot interno.
- O DANFE deve identificar claramente o ambiente de homologação.

## 7. Telas

### 7.1 Tela principal `Faturamento`

Elementos:

- Banner do ambiente atual.
- Indicador do certificado: disponível, validade e alerta de vencimento.
- Indicador de status da SEFAZ.
- Cards: rascunhos, autorizadas no mês, rejeitadas e valor autorizado.
- Filtros por número, cliente, pedido, status e período.
- Tabela com número/série, pedido, cliente, emissão, status, valor e ações.
- Ação principal `Emitir NF-e`.

Ações por status:

| Status | Ações |
|---|---|
| Rascunho | Continuar, validar, excluir |
| Validada | Revisar, enviar para homologação |
| Processando | Consultar resultado |
| Rejeitada | Ver rejeição, corrigir, validar novamente |
| Autorizada | Ver, baixar XML, baixar DANFE, cancelar |
| Cancelada | Ver, baixar XML e evento de cancelamento |
| Pendente de conciliação | Consultar SEFAZ; nunca reenviar diretamente |

### 7.2 Assistente `Emitir NF-e`

#### Etapa 1 — Pedido

- Seleção de pedido atendido.
- Cliente, data, itens, lotes, quantidades e valores.
- Verificação de pedido já faturado.
- Sem edição manual de quantidade acima do atendido.

#### Etapa 2 — Destinatário

- Razão social/nome.
- CPF/CNPJ.
- Indicador de IE.
- Inscrição Estadual.
- E-mail e telefone.
- Logradouro, número, complemento, bairro e CEP.
- Município, código IBGE, UF, país e código do país.
- Indicador de consumidor final.
- Opção explícita `Salvar dados no cadastro do cliente`.

#### Etapa 3 — Produtos e tributação

Para cada item:

- Nome operacional somente para referência.
- Nome fiscal editável.
- Código do produto.
- NCM.
- CEST opcional.
- CFOP.
- Origem da mercadoria.
- Unidade comercial e tributável.
- Quantidade e valor unitário, originados do pedido.
- Desconto, frete, seguro e outras despesas, quando aplicáveis.
- CST e dados de ICMS.
- CST e dados de PIS.
- CST e dados de COFINS.
- IPI, FCP, ST e DIFAL, exibidos apenas quando habilitados.
- CST, `cClassTrib` e grupos necessários de IBS/CBS.
- Informações adicionais do produto.
- Opção explícita `Salvar como padrão do produto`.

O usuário informa classificações, base, redução e alíquotas. O sistema calcula valores monetários e totais, com arredondamento fiscal consistente. Valores calculados não devem ser alterados livremente sem uma regra explícita.

#### Etapa 4 — Operação, transporte e pagamento

- Natureza da operação.
- Finalidade da NF-e.
- Indicador de presença.
- Data/hora de emissão.
- Modalidade do frete.
- Transportadora, veículo e volumes quando aplicáveis.
- Peso líquido e bruto.
- Forma de pagamento e valor.
- Informações adicionais ao Fisco.
- Informações complementares ao contribuinte.

#### Etapa 5 — Revisão e validação

- Resumo de emitente e destinatário.
- Itens e tributos.
- Totais da NF-e.
- Lista de erros bloqueantes.
- Lista de avisos não bloqueantes.
- Status do certificado e SEFAZ.
- Botões `Salvar rascunho`, `Validar NF-e` e `Enviar para homologação`.

### 7.3 Detalhes da NF-e

- Timeline de estados, tentativas e eventos.
- Snapshots do emitente, destinatário e itens.
- Totais tributários.
- Código e mensagem de rejeição.
- Chave de acesso e protocolo.
- Downloads de XML e DANFE.
- Cancelamento com justificativa mínima exigida pelo schema/regra vigente.

### 7.4 Configurações fiscais

Acesso restrito:

- Dados do emitente.
- CRT/regime tributário.
- Ambiente.
- Série.
- Próximo número apenas como informação administrativa controlada.
- Upload/substituição do certificado.
- Validade e titular do certificado.
- Alíquotas sugeridas.
- Natureza de operação padrão.
- Informações complementares padrão.
- Teste de certificado.
- Consulta do status da SEFAZ.

## 8. Modelo de dados proposto

### 8.1 Alterações em cadastros existentes

`finished_products` — campos opcionais usados como padrão:

- `fiscal_name`
- `ncm`
- `cest`
- `goods_origin`
- `commercial_unit_symbol`
- `tax_unit_symbol`
- `internal_cfop`
- `interstate_cfop`
- `icms_cst`
- `pis_cst`
- `cofins_cst`
- `ibs_cbs_cst`
- `ibs_cbs_classification`
- `fiscal_additional_info`

`clients` — campos opcionais usados como padrão:

- `city_code`
- `country_code`
- `country_name`
- `ie_indicator`
- `final_consumer`
- `address_complement`

Campos opcionais preservam os cadastros existentes. A obrigatoriedade é aplicada na validação da NF-e.

### 8.2 `nfe_configs`

Uma configuração ativa por estabelecimento:

- Identificação e endereço completos do emitente.
- CNPJ, IE, CRT e CNAE administrativo.
- Ambiente, modelo e série.
- Defaults de operação e impostos.
- Caminho privado do certificado.
- Senha do certificado criptografada.
- Validade, titular e fingerprint do certificado.
- Versão da aplicação emissora e schema fiscal.
- Auditoria de criação e alteração.

### 8.3 `nfe_number_sequences`

- `issuer_cnpj`
- `environment`
- `model`
- `series`
- `next_number`
- `updated_at`

Restrição única pelo conjunto acima. A reserva do número deve ocorrer em transação ou função SQL com bloqueio de linha.

### 8.4 `nfe_invoices`

- Identificadores e vínculo com `sales_order_id`.
- Ambiente, modelo, série e número.
- Código numérico e chave de acesso.
- Status interno.
- Natureza, finalidade, presença, consumidor final e frete.
- Snapshots JSON do emitente, destinatário, transporte e pagamento.
- Totais explícitos para produtos e tributos.
- XML enviado e autorizado por caminho privado.
- Protocolo, código e motivo de rejeição.
- Datas de emissão, autorização e cancelamento.
- Versão do schema e biblioteca emissora.
- Auditoria completa.

Restrições:

- Chave de acesso única quando preenchida.
- Número único por CNPJ, ambiente, modelo e série.
- No MVP, apenas uma NF-e não cancelada/autorizada por pedido.

### 8.5 `nfe_invoice_items`

- Vínculos com NF-e, item do pedido e produto.
- `product_name_snapshot`.
- `fiscal_name_snapshot`.
- Código, NCM, CEST, CFOP, origem e unidades.
- Quantidades, preços, descontos, despesas e total.
- Campos de base, alíquota e valor dos tributos mais consultados.
- Snapshot JSON da tributação completa, incluindo IBS/CBS.
- Informações adicionais.

### 8.6 `nfe_invoice_fulfillments`

Tabela de rastreabilidade entre o item fiscal e os lotes atendidos:

- `nfe_invoice_item_id`
- `sales_order_fulfillment_id`
- `finished_product_lot_id`
- `quantity`

### 8.7 `nfe_transmissions`

Uma linha por tentativa técnica:

- NF-e, operação e número da tentativa.
- Idempotency key.
- Hash do XML.
- Código/recibo retornado.
- Request/response sanitizados.
- Status técnico e duração.
- Erro de rede ou schema.
- Timestamps.

Nunca armazenar senha ou chave privada nos logs.

### 8.8 `nfe_events`

- Tipo: autorização, cancelamento, inutilização futura ou conciliação.
- Sequência do evento.
- Status, protocolo e motivo.
- Caminho do XML do evento.
- Usuário e timestamps.

### 8.9 Arquivos privados

Buckets sugeridos:

- `fiscal-certificates`: privado; acesso exclusivo do backend.
- `nfe-xml`: privado; XML enviado, autorizado e eventos.
- `nfe-danfe`: privado; PDFs gerados ou regeneráveis.

Downloads devem ser feitos por endpoint autenticado ou URL assinada de curta duração.

## 9. Estados da NF-e

```text
RASCUNHO
  -> VALIDADA
  -> AUTORIZANDO
       -> AUTORIZADA
       -> REJEITADA
       -> PENDENTE_CONCILIACAO

REJEITADA
  -> RASCUNHO/CORRIGIDA
  -> VALIDADA

AUTORIZADA
  -> CANCELANDO
       -> CANCELADA
       -> AUTORIZADA (evento rejeitado)
```

Regras:

- Número e chave são reservados somente ao iniciar autorização.
- Clique duplicado não pode reservar novo número nem transmitir novamente.
- Após timeout ou resposta incerta, o estado é `PENDENTE_CONCILIACAO`.
- Antes de qualquer reenvio, consultar a chave/recibo na SEFAZ.
- NF-e autorizada é imutável.
- Correção de rejeição mantém histórico das tentativas.

## 10. Endpoints REST

### 10.1 Configuração

| Método | Rota | Uso |
|---|---|---|
| `GET` | `/nfe/config` | Carregar configuração sanitizada |
| `PUT` | `/nfe/config` | Atualizar emitente, série e defaults |
| `POST` | `/nfe/config/certificate` | Upload/substituição do A1 |
| `POST` | `/nfe/config/certificate/test` | Validar abertura, CNPJ e validade |
| `GET` | `/nfe/sefaz/status` | Consultar status do serviço PE |

A senha e o conteúdo do certificado nunca são retornados pelo `GET`.

### 10.2 Pedidos e rascunhos

| Método | Rota | Uso |
|---|---|---|
| `GET` | `/nfe/eligible-orders` | Listar pedidos atendidos e não faturados |
| `POST` | `/nfe/drafts` | Criar rascunho a partir de pedido |
| `GET` | `/nfe` | Listar notas com filtros |
| `GET` | `/nfe/:id` | Carregar detalhe completo |
| `PATCH` | `/nfe/:id` | Salvar cabeçalho e snapshots do rascunho |
| `PATCH` | `/nfe/:id/items/:itemId` | Salvar dados fiscais de um item |
| `POST` | `/nfe/:id/refresh-defaults` | Reaplicar defaults sem sobrescrever campos confirmados |
| `DELETE` | `/nfe/:id` | Excluir apenas rascunho sem numeração reservada |

### 10.3 Validação e emissão

| Método | Rota | Uso |
|---|---|---|
| `POST` | `/nfe/:id/validate` | Validar campos, cálculos e schema preliminar |
| `POST` | `/nfe/:id/authorize` | Reservar número, assinar e transmitir |
| `POST` | `/nfe/:id/reconcile` | Consultar resultado após timeout/incerteza |
| `GET` | `/nfe/:id/xml` | Download do XML autorizado |
| `GET` | `/nfe/:id/danfe` | Download do DANFE |
| `POST` | `/nfe/:id/cancel` | Enviar evento de cancelamento |

Os endpoints de alteração devem aceitar `expectedUpdatedAt` ou versão do registro para evitar sobrescrita concorrente do rascunho.

## 11. Arquitetura do backend

Novo módulo `backend/src/nfe`:

- `nfe.module.ts`: composição.
- `nfe.controller.ts`: endpoints de notas.
- `nfe-config.controller.ts`: configuração e certificado.
- `nfe.service.ts`: orquestração de rascunho, validação e estados.
- `nfe-draft.service.ts`: snapshot e edição.
- `nfe-validation.service.ts`: pendências e regras de prontidão.
- `nfe-tax-calculation.service.ts`: cálculos determinísticos e arredondamento.
- `nfe-xml.service.ts`: montagem e validação do XML.
- `nfe-sefaz.gateway.ts`: adaptador isolado para `nfewizard-io`.
- `nfe-certificate.service.ts`: leitura em memória, teste e criptografia da senha.
- `nfe-numbering.service.ts`: reserva transacional.
- `nfe-storage.service.ts`: XML, eventos e DANFE.
- `nfe-reconciliation.service.ts`: recuperação de transmissões incertas.
- `dto/*`: contratos explícitos.

O restante do sistema não deve importar diretamente `nfewizard-io`. Toda dependência fiscal externa fica atrás de `NfeSefazGateway`, permitindo atualização da biblioteca ou troca futura sem reescrever o módulo.

## 12. Integração direta com a SEFAZ

Serviços necessários no MVP:

- `NFeStatusServico4`.
- `NFeAutorizacao4`.
- `NFeRetAutorizacao4`.
- `NFeConsultaProtocolo4`.
- `NFeRecepcaoEvento4` para cancelamento.

Requisitos técnicos:

- Fixar versão exata da biblioteca e registrar essa versão na nota.
- Usar schemas atualizados para NF-e 4.00 e Reforma Tributária.
- Incluir IBS/CBS conforme regra vigente em 2026.
- Nunca desabilitar validação TLS.
- Definir timeout e registrar tentativas sanitizadas.
- Carregar certificado e senha apenas em memória durante a chamada.
- Consultar protocolo/chave antes de reenviar após falha incerta.
- Validar o XML localmente antes da transmissão.

## 13. Validações

### 13.1 Salvamento de rascunho

- Aceita campos incompletos.
- Valida apenas formato dos campos informados.
- Retorna `completionPercentage` e lista de pendências.

### 13.2 Prontidão para autorização

Bloqueios mínimos:

- Configuração fiscal incompleta.
- Certificado ausente, inválido, vencido ou de outro CNPJ.
- Série/numeração inválida.
- Pedido não atendido ou já faturado.
- Destinatário sem documento/endereço/código IBGE/indicador de IE.
- Item sem nome fiscal, NCM, CFOP, unidade ou origem.
- Tributação sem CST ou valores requeridos.
- IBS/CBS incompleto conforme schema vigente.
- Totais inconsistentes.
- Pagamento ou frete incompatível.
- XML inválido no schema.
- SEFAZ indisponível, salvo futuro fluxo de contingência.

### 13.3 Cálculo

- Usar decimal, nunca ponto flutuante binário para valores fiscais.
- Centralizar regras de arredondamento.
- Recalcular totais no backend; não confiar nos totais enviados pelo frontend.
- Comparar total da NF-e com o pedido e justificar diferenças de desconto/frete.

## 14. Segurança e permissões

Nova página `faturamento` e ações:

- `view`: listar, consultar e baixar documentos.
- `create`: criar rascunho.
- `edit`: alterar e validar rascunho.
- `authorize`: transmitir para SEFAZ.
- `cancel`: cancelar nota.
- `configure`: alterar emitente, ambiente, série ou certificado.

Recomendações:

- Criar guard/decorator de permissão no backend.
- `configure` somente para administrador fiscal.
- Registrar usuário, data, IP/request id e ação em operações fiscais.
- Exigir confirmação explícita para autorização e cancelamento.
- Não expor senha do certificado em resposta, log, URL ou nome de arquivo.
- Renomear o arquivo no storage usando identificador seguro, sem nome original sensível.
- Criptografar a senha com chave exclusiva do backend ou serviço de secrets.
- Bloquear mudança direta de ambiente para produção sem checklist administrativo.

## 15. Integrações com telas existentes

### 15.1 `App.tsx` e `Layout.tsx`

- Adicionar página e menu `Faturamento`.
- Incluir `faturamento` na ordem de páginas permitidas.
- Exibir badge de ambiente no módulo.

### 15.2 `CadastrosBase.tsx`

- Adicionar seção `Dados fiscais` ao produto acabado.
- Manter `Nome do produto` como campo operacional.
- Adicionar `Nome fiscal para NF-e` e defaults fiscais opcionais.

### 15.3 `Comercial.tsx`

- Exibir ação `Faturar` em pedido atendido e elegível.
- A ação navega para o módulo de faturamento já com o pedido selecionado.
- Não incorporar todo o formulário fiscal dentro da tela Comercial.

### 15.4 `ContasReceber.tsx`

- Exibir número/chave da NF-e vinculada quando autorizada.
- Não duplicar títulos.
- Após cancelamento fiscal, mostrar alerta de conciliação financeira.

## 16. Contratos principais do frontend

Adicionar tipos e funções em serviço próprio `nfeApi.ts`, evitando ampliar indefinidamente `operationsApi.ts`:

- `NfeInvoiceSummary`
- `NfeInvoiceDetail`
- `NfeDraftItem`
- `NfeValidationResult`
- `NfeConfig`
- `EligibleSalesOrder`
- `loadNfeInvoices`
- `loadNfeInvoice`
- `loadEligibleOrders`
- `createNfeDraft`
- `updateNfeDraft`
- `updateNfeDraftItem`
- `validateNfeDraft`
- `authorizeNfe`
- `reconcileNfe`
- `cancelNfe`
- `downloadNfeXml`
- `downloadDanfe`
- `loadNfeConfig`
- `updateNfeConfig`
- `uploadNfeCertificate`
- `checkSefazStatus`

## 17. Estratégia de testes

### 17.1 Unitários

- Snapshot de pedido/cliente/produto.
- Nome fiscal sem fallback silencioso.
- Validação de campos obrigatórios.
- Cálculos e arredondamento.
- Reserva concorrente de numeração.
- Montagem de chave de acesso.
- Transições válidas e inválidas de status.
- Sanitização de logs.
- Timeout seguido de consulta, sem reenvio duplicado.

### 17.2 Integração/backend

- Criar rascunho incompleto e salvar.
- Completar manualmente e validar.
- Impedir faturamento de pedido aberto/parcial.
- Impedir segunda NF-e no MVP.
- Autorizar com gateway mockado.
- Persistir XML/protocolo.
- Rejeição retorna código e motivo.
- Permissões bloqueiam autorização/configuração.

### 17.3 Frontend

- Navegação por etapas preserva rascunho.
- Pendências aparecem no campo correto.
- Nome operacional e fiscal aparecem separadamente.
- Botão de envio permanece bloqueado com erros.
- Clique duplo não dispara duas autorizações.
- Estados autorizada, rejeitada e pendente são renderizados corretamente.

### 17.4 Homologação real

1. Testar abertura e CNPJ do certificado.
2. Consultar status da SEFAZ-PE.
3. Gerar XML e validar no schema vigente.
4. Emitir cenário interno aprovado pelo contador.
5. Confirmar chave e protocolo.
6. Baixar XML autorizado e DANFE.
7. Consultar novamente a chave na SEFAZ.
8. Executar cancelamento de uma nota de teste.
9. Validar recuperação após simulação de timeout.

## 18. Fases de implementação

### Fase 0 — Fechamento fiscal da SPEC

- Confirmar dados restantes do emitente, CRT, endereço, série e numeração.
- Selecionar um cliente e um produto para o cenário de homologação.
- Obter do contador os códigos fiscais desse cenário.
- Validar campos IBS/CBS vigentes.

### Fase 1 — Fundação de dados e permissões

- Migrations `030+`.
- Tabelas fiscais, buckets privados e sequência transacional.
- Campos opcionais em produto/cliente.
- Permissão `faturamento` e guard no backend.

### Fase 2 — Rascunho sem SEFAZ

- Endpoints de pedidos elegíveis, criação, edição e validação.
- Tela principal e assistente completo.
- Snapshots e cálculo de totais.
- Testes unitários e de interface.

Resultado: o usuário consegue montar uma NF-e completa e visualizar todas as pendências, ainda sem transmissão.

### Fase 3 — Certificado e gateway SEFAZ

- Configuração fiscal.
- Upload/teste seguro do A1.
- Adapter `nfewizard-io`.
- Status do serviço, XML, schema, assinatura e autorização.
- Conciliação de timeout e idempotência.

### Fase 4 — Documentos e eventos

- Persistência do XML protocolado.
- DANFE.
- Downloads autenticados.
- Cancelamento e histórico.
- Vínculo visual com Comercial e Financeiro.

### Fase 5 — Homologação e endurecimento

- Cenários reais aprovados pelo contador.
- Testes de concorrência e falha.
- Auditoria de segurança.
- Checklist para futura passagem à produção.

## 19. Critérios de aceite do MVP

- Usuário cria rascunho a partir de pedido atendido.
- Campos faltantes podem ser preenchidos manualmente e salvos.
- Nome operacional nunca substitui silenciosamente o nome fiscal.
- Validação informa exatamente o que falta por seção e item.
- Backend recalcula e valida os totais.
- Certificado nunca chega ao frontend após o upload.
- Apenas usuário autorizado transmite ou cancela.
- Clique/retry não gera emissão duplicada.
- Timeout não provoca reenvio antes da consulta.
- NF-e autorizada armazena chave, protocolo e XML imutável.
- DANFE e XML podem ser baixados pelo sistema.
- Estoque e contas a receber não são duplicados.
- Uma NF-e de teste é autorizada e posteriormente consultada em homologação.
- Um evento de cancelamento de teste é homologado e armazenado.

## 20. Informações ainda necessárias para a primeira emissão

Esses dados não impedem iniciar Fases 1 e 2, mas bloqueiam a Fase 3 de homologação:

- Razão social/endereço completos do emitente e código IBGE.
- CRT/regime tributário.
- Série e número inicial de homologação.
- Um destinatário completo para teste.
- Um pedido atendido para teste.
- Nome fiscal, NCM, CFOP, origem e unidade do produto de teste.
- CST e parâmetros de ICMS, PIS e COFINS.
- CST, `cClassTrib` e parâmetros de IBS/CBS.
- Confirmação do contador sobre benefício fiscal de laticínios e informações complementares.

## 21. Referências normativas e técnicas

- Manual de Orientação do Contribuinte NF-e/NFC-e 7.0.
- Leiaute NF-e 4.00 e schemas vigentes.
- Nota Técnica 2025.002 e atualizações da Reforma Tributária do Consumo.
- Relação oficial de Web Services da NF-e para Pernambuco.
- Regras vigentes do RICMS-PE aplicáveis a laticínios.
- Documentação e versão fixada do `nfewizard-io` e `@nfewizard/danfe`.

Esta SPEC deve ser revisada sempre que houver nova Nota Técnica, schema, endpoint ou regra fiscal aplicável antes da passagem para produção.
