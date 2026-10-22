# Especificação Técnica e Guia de Implementação: Pagamento Parcial no Contas a Pagar

> **Status:** Implementado e Validado  
> **Módulo:** Financeiro -> Contas a Pagar  
> **Objetivo:** Permitir ao usuário registrar pagamentos parciais de títulos a pagar, com controle de histórico individual de baixas, cálculo dinâmico de saldo restante, estorno granular de pagamentos, integração com extrato bancário e sincronização dos indicadores de KPI.  
> **Última Atualização:** 21/10/2026  

---

## 1. Visão Geral e Contexto

No sistema UNA Laticínios, o módulo de **Contas a Receber** já contava com a dinâmica de recebimento parcial consolidada através do histórico individual de baixas (`financial_entry_receipts`). No entanto, o módulo de **Contas a Pagar** operava sob uma lógica simplificada e binária (`BaixaModal`), onde uma conta só podia ser baixada integralmente (100% do saldo) de uma única vez, sem a possibilidade de registrar pagamentos parciais, sem detalhamento de conta bancária de origem e sem histórico individual de liquidações.

Esta especificação documenta o desenho técnico e orienta qualquer desenvolvedor ou agente de IA sobre como a funcionalidade de pagamento parcial foi concebida, quais arquivos compõem a solução e como realizar a manutenção ou evolução sem necessidade de releitura integral da base de código.

---

## 2. Arquitetura da Solução

### 2.1 Modelo Conceitual e de Banco de Dados (Supabase)

A infraestrutura de banco de dados do sistema já havia sido desenhada com suporte genérico a baixas financeiras por meio da tabela `financial_entry_receipts`, que atende tanto a receitas (`entry_type = 'Receber'`) quanto a despesas (`entry_type = 'Pagar'`).

```
+----------------------------------------------------------------+
|                   public.financial_entries                     |
+----------------------------------------------------------------+
| id                     UUID (PK)                               |
| entry_type             TEXT ('Pagar' | 'Receber')              |
| description            TEXT                                    |
| amount                 NUMERIC(14,2)                           |
| discount_amount        NUMERIC(14,2)                           |
| due_date               TIMESTAMPTZ                             |
| payment_date           TIMESTAMPTZ (null se Parcial)           |
| status                 TEXT ('Aberto' | 'Parcial' | 'Pago' ...) |
| supplier_id            UUID (FK -> suppliers)                  |
| producer_id            UUID (FK -> producers)                  |
| bank_account_id        UUID (FK -> bank_accounts)              |
+----------------------------------------------------------------+
                               | 1
                               |
                               | N
+----------------------------------------------------------------+
|               public.financial_entry_receipts                  |
+----------------------------------------------------------------+
| id                     UUID (PK)                               |
| financial_entry_id     UUID (FK -> financial_entries)          |
| amount                 NUMERIC(14,2)                           |
| payment_date           TIMESTAMPTZ                             |
| payment_method         TEXT                                    |
| bank_account_id        UUID (FK -> bank_accounts)              |
| attachment_url         TEXT (comprovante bancário/recibo)      |
| notes                  TEXT                                    |
| created_by             UUID                                    |
| created_at             TIMESTAMPTZ                             |
+----------------------------------------------------------------+
```

#### Regras no Banco de Dados
1. **Inclusão de Baixa (`register_financial_receipt`)**:
   - Bloqueio com lock pessimista (`SELECT ... FOR UPDATE`) na obrigação (`financial_entries`).
   - Validação de consistência: `valor_pago > 0` e `(total_ja_pago + valor_novo) <= total_liquido`.
   - Inserção na tabela `financial_entry_receipts`.
   - Atualização do status da obrigação:
     - Se `total_pago >= total_liquido` $\rightarrow$ `status = 'Pago'` e `payment_date = data_pagamento`.
     - Se `total_pago < total_liquido` $\rightarrow$ `status = 'Parcial'` e `payment_date = NULL`.
2. **Estorno de Baixa (`delete_financial_receipt`)**:
   - Remove o registro específico da tabela `financial_entry_receipts`.
   - Recalcula a soma das baixas restantes:
     - Se `soma == 0` $\rightarrow$ `status = 'Aberto'`, `payment_date = NULL`.
     - Se `0 < soma < total_liquido` $\rightarrow$ `status = 'Parcial'`, `payment_date = NULL`.
     - Se `soma >= total_liquido` $\rightarrow$ `status = 'Pago'`, `payment_date = max(payment_date)`.
3. **Integridade de Alteração de Valor (`validate_financial_entry_amount`)**:
   - Impede que um título tenha seu valor alterado para um montante inferior ao que já foi pago.
4. **Extrato Bancário e Posição Financeira (`bank-accounts.service.ts`)**:
   - Cada baixa de um título com `entry_type = 'Pagar'` gera um movimento de débito (saída) na respectiva conta bancária informada.

---

## 3. Mapeamento de Arquivos e Responsabilidades

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| **Banco / Migrations** | `backend/supabase/migrations/0281_partial_financial_receipts.sql` | Criação da tabela `financial_entry_receipts` e RPCs de registro/estorno. |
| **Banco / Migrations** | `backend/supabase/migrations/048_round_financial_receipts_to_cents.sql` | Ajuste de precisão em centavos e descontos na RPC. |
| **Backend Service** | `backend/src/finance/finance.service.ts` | Normalização de lançamentos (`normalizeEntry`), cálculo de `received_amount` (valor pago) e `outstanding_amount` (saldo a pagar). |
| **Backend Controller** | `backend/src/finance/finance.controller.ts` | Endpoints `POST /:id/receipts` e `DELETE /:id/receipts/:receiptId`. |
| **Backend Extrato** | `backend/src/finance/bank-accounts.service.ts` | Geração dos movimentos de extrato debitando contas bancárias vinculadas às baixas de títulos `Pagar`. |
| **Frontend API** | `src/app/services/operationsApi.ts` | Tipagem `FinancialEntryRecord` (com aliases `valorPago`, `saldoPagar`, `pagamentos`), `createFinancialReceipt`/`Payment`, `deleteFinancialReceipt`/`Payment`. |
| **Frontend Modal** | `src/app/components/financeiro/PagamentoModal.tsx` *(Novo)* | Modal interativo para registrar pagamento parcial ou integral, selecionar conta de origem, data, forma de pagamento e anexo de comprovante. |
| **Frontend UI** | `src/app/components/financeiro/ContasPagar.tsx` | Visualização da tabela com colunas Pago e A Pagar (Saldo), badge Parcial, KPIs ajustados para saldo real, histórico de pagamentos e estorno granular. |

---

## 4. Regras de Negócio e Comportamento da UI

### 4.1 Registro de Pagamento (`PagamentoModal.tsx`)
- **Valor da Baixa**:
  - Deve ser maior que `R$ 0,00` e menor ou igual ao saldo a pagar remanescente (`saldoPagar`).
  - O campo vem pré-preenchido com o saldo restante (sugerindo baixa total), mas o usuário pode editar livremente para qualquer valor parcial.
- **Data do Pagamento**:
  - Padrão: data atual (`yyyy-MM-dd`), campo obrigatório.
- **Forma de Pagamento**:
  - Seleção obrigatória a partir das formas de pagamento ativas no cadastro (`Pix`, `Boleto`, `Transferência`, `Dinheiro`, etc.).
- **Conta de Origem**:
  - Seleção opcional/recomendada das contas bancárias ativas da empresa. Caso informada, o pagamento debitará o saldo no extrato daquela conta específica.
- **Comprovante**:
  - Upload opcional de PDF ou imagem. O arquivo é enviado ao bucket de anexos financeiros e a URL gerada fica atrelada à baixa individual.
- **Aviso de Saldo Remanescente**:
  - Se o valor digitado for inferior ao saldo, o modal exibe um aviso dinâmico: *"Após este pagamento, a despesa continuará parcialmente aberta com saldo de R$ X,XX"*.

### 4.2 Indicadores de KPI no Contas a Pagar
Os cálculos dos cards superiores devem refletir o saldo real do compromisso:
- **Pagos**: Soma de todos os valores efetivamente pagos no período (`entry.valorPago` ou `entry.valorRecebido`).
- **Vencidos**: Soma do saldo em aberto (`entry.saldoPagar`) de despesas não liquidadas com vencimento anterior ao dia de hoje.
- **Vencem Hoje**: Soma do saldo em aberto (`entry.saldoPagar`) de despesas não liquidadas com vencimento na data atual.
- **A Vencer**: Soma do saldo em aberto (`entry.saldoPagar`) de despesas não liquidadas com vencimento futuro.
- **Total**: Soma de `Pagos + A Vencer + Vencidos + Vencem Hoje`.

### 4.3 Tabela de Listagem
Colunas apresentadas:
1. `Checkbox` (seleção em lote)
2. `Vencimento`
3. `Último pagamento` (ou `-` se não houver pagamentos)
4. `Descrição` (com categoria contábil abaixo)
5. `Total (R$)` (valor bruto da obrigação)
6. `Pago (R$)` (em verde, indicando o total já liquidado)
7. `A pagar (R$)` (saldo remanescente em aberto)
8. `Situação` (Badge: Verde = Pago, Azul = Parcial, Vermelho = Vencido, Amarelo = Aberto)
9. `Ações` (Dropdown: Pagar, Editar, Ver detalhes, Excluir)

### 4.4 Modal de Detalhes da Despesa
- **Dados Gerais**: Descrição, fornecedor/produtor, categoria, centro de custo, subcategoria contábil.
- **Resumo de Valores**: Total, Valor Pago e Saldo a Pagar.
- **Histórico de Pagamentos**:
  - Cada baixa é listada em um card individual contendo:
    - Valor pago em destaque verde.
    - Data do pagamento, forma utilizada e conta bancária de origem.
    - Observações informadas na baixa.
    - Link para abrir/baixar o comprovante anexado.
    - Botão de **Estorno** (`CircleX` em âmbar): permite ao operador reverter aquela parcela específica caso tenha sido lançada incorretamente. O sistema confirma a ação e recalcula o saldo instantaneamente.
- **Ação Rápida**: Se o lançamento estiver aberto ou parcial (`saldoPagar > 0`), disponibiliza o botão "Registrar pagamento" diretamente no rodapé do modal de detalhes.

---

## 5. Changelog Técnico e Registro de Alterações

> Toda modificação de código efetuada nesta funcionalidade deve ser registrada nesta seção para manter a rastreabilidade histórica.

### [21/10/2026] - Criação da Documentação e Arquitetura da Solução
- **Autor:** Antigravity AI
- **Ação:** Elaboração deste documento técnico (`docs/pagamento-parcial-contas-a-pagar.md`) consolidando requisitos, arquitetura de dados, fluxo de telas e plano de implementação.
- **Arquivos Mapeados:**
  - `src/app/services/operationsApi.ts`
  - `src/app/components/financeiro/PagamentoModal.tsx`
  - `src/app/components/financeiro/ContasPagar.tsx`
  - `src/app/components/financeiro/RecebimentoModal.tsx` (referência)
  - `backend/src/finance/finance.service.ts`
  - `backend/src/finance/bank-accounts.service.ts`

### [21/10/2026] - Implementação Completa do Pagamento Parcial
- **Autor:** Antigravity AI
- **Modificações Realizadas:**
  1. `src/app/services/operationsApi.ts`:
     - Adicionados aliases `valorPago: number`, `saldoPagar: number` e `pagamentos: FinancialReceiptRecord[]` na interface `FinancialEntryRecord` e no mapeador `mapFinancialEntry`.
     - Exportados `CreateFinancialPaymentPayload`, `createFinancialPayment` e `deleteFinancialPayment`.
  2. `src/app/components/financeiro/PagamentoModal.tsx`:
     - Criado o componente de modal para registrar pagamentos com suporte a valor parcial (com teto no saldo remanescente), data, forma de pagamento, conta bancária de origem e upload opcional de comprovante.
  3. `src/app/components/financeiro/ContasPagar.tsx`:
     - Integrado o `PagamentoModal` substituindo o `BaixaModal` simplista.
     - Tabela atualizada com colunas **Total**, **Pago (R$)** em verde, **A pagar (R$)** refletindo o saldo real em aberto e badge estilizado para o status `'Parcial'`.
     - Ação de linha atualizada para **Pagar** quando `saldo > 0`.
     - KPIs atualizados para computar `pagos` acumulando os pagamentos parciais e `vencidos`/`vencemHoje`/`aVencer` baseados no saldo remanescente em aberto.
     - Modal de detalhes (`viewingEntry`) enriquecido com resumo de valores (Total, Já Pago, Saldo a Pagar), **Histórico de pagamentos** com cada baixa e botão de **estorno individual** (`deleteFinancialReceipt`), além do botão de atalho "Registrar pagamento" no rodapé.
     - Exportação CSV atualizada com colunas `Pago` e `A Pagar`.
  4. `src/app/components/financeiro/PagamentoModal.spec.tsx`:
     - Criada suíte de testes unitários validando renderização, pré-preenchimento, bloqueio de valor maior que saldo, aviso dinâmico e submissão com payload correto.
  5. `src/app/components/Financeiro.tsx`:
     - Atualizada a visualização geral do financeiro para considerar o saldo remanescente real nos cards de `totalPagar`, `totalReceber` e `totalVencido`, badge com estilo para `'Parcial'` e exibição do saldo em aberto abaixo do valor total na tabela.
- **Validação e Testes:**
  - `npm run build` executado com sucesso (build Vite 100% limpo).
  - `npx vitest run src/app/components/financeiro/PagamentoModal.spec.tsx`: 5/5 testes passaram.
  - `npm run test` (todos os testes frontend): 12 arquivos de teste e 73 testes passaram com 0 erros.
  - `npm run backend:test`: 17 suítes e 100 testes do backend passaram com 0 erros.

