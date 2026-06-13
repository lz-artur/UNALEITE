Quero especificar uma funcionalidade para o MVP da UNA Laticínios relacionada à entrada de leite cru por produtor, considerando que cada produtor pode entregar leite com características diferentes de qualidade, como teor de gordura, proteína, acidez, CBT e outros indicadores.

Contexto:

A fábrica recebe leite de vários produtores diferentes. Cada produtor pode entregar um volume diferente de leite e com qualidade diferente.

Exemplo:
- Produtor João entregou 1.000 litros com 3,4% de gordura
- Produtor Maria entregou 800 litros com 3,0% de gordura
- Produtor Carlos entregou 1.200 litros com 3,6% de gordura

Essas diferenças interferem em dois pontos principais:

1. Pagamento ao produtor:
O leite com melhor composição pode receber bônus.
O leite com qualidade inferior pode receber penalização.
Então o valor pago por litro não deve ser necessariamente igual para todos os produtores.

2. Produção industrial:
O teor de gordura e proteína interfere no rendimento da produção.
Por exemplo, um leite com maior teor de gordura/proteína pode render mais queijo, manteiga ou derivados.
Portanto, o estoque de leite cru precisa armazenar essas informações para permitir análise de rendimento e custo real da produção.

Objetivo da funcionalidade:

Criar uma funcionalidade onde cada entrada de leite cru seja registrada individualmente por produtor, contendo volume, preço base, composição laboratorial e cálculo de valor a pagar.

Além disso, o sistema deve permitir que os lotes de leite sejam usados em produção considerando suas características de qualidade, permitindo acompanhar o impacto do teor de gordura/proteína no rendimento industrial.

Funcionalidade: Entrada de Leite por Produtor com Qualidade e Precificação Diferenciada

Requisitos principais:

1. Registro de entrada individual por produtor

O sistema deve permitir cadastrar uma entrada de leite cru informando:

- Produtor
- Rota de coleta
- Transportador
- Data e hora da coleta
- Data e hora da recepção
- Volume entregue em litros
- Temperatura de recepção
- Número do lote gerado
- Status do lote:
  - Aguardando análise
  - Aprovado
  - Bloqueado
  - Utilizado em produção
  - Parcialmente utilizado

2. Registro de análise de composição do leite

Para cada entrada de leite, o sistema deve permitir registrar:

- Percentual de gordura
- Percentual de proteína
- Acidez
- CBT
- CCS
- Crioscopia
- Densidade
- Resultado do Alizarol
- Presença de antibiótico
- Observações laboratoriais

3. Regras de bloqueio automático

O sistema deve bloquear automaticamente o lote quando:

- Alizarol for reprovado
- Antibiótico for detectado
- Acidez estiver fora do limite definido
- Crioscopia estiver fora do padrão
- Qualquer parâmetro obrigatório for marcado como reprovado

Lotes bloqueados não podem ser usados em ordens de produção.

4. Precificação diferenciada por produtor

O sistema deve permitir configurar uma tabela de pagamento do leite com:

- Preço base por litro
- Bônus por gordura
- Bônus por proteína
- Penalização por acidez alta
- Penalização por CBT fora do padrão
- Penalização por CCS fora do padrão
- Penalização por temperatura fora do limite
- Penalização por reprovação parcial de qualidade, quando aplicável

Exemplo de cálculo:

Preço base do leite: R$ 2,30 por litro

Produtor João:
- Volume: 1.000 litros
- Gordura: 3,4%
- Proteína: dentro do padrão
- Bônus gordura: R$ 0,05 por litro
- Valor final por litro: R$ 2,35
- Total a pagar: R$ 2.350,00

Produtor Maria:
- Volume: 800 litros
- Gordura: 3,0%
- Acidez acima do ideal
- Penalização: R$ 0,03 por litro
- Valor final por litro: R$ 2,27
- Total a pagar: R$ 1.816,00

5. Cálculo da Folha do Leite

O sistema deve gerar uma folha de pagamento por período, geralmente mensal ou quinzenal, contendo:

- Produtor
- Total de litros entregues
- Média de gordura
- Média de proteína
- Média de CBT
- Média de CCS
- Preço base aplicado
- Total de bônus
- Total de penalizações
- Valor médio final por litro
- Valor total a pagar

O sistema deve permitir visualizar o detalhamento das entregas de cada produtor.

6. Estoque de leite cru com composição

O estoque de leite cru não deve armazenar apenas o volume em litros.

Cada lote de leite cru deve conter também:

- Produtor de origem
- Volume disponível
- Percentual de gordura
- Percentual de proteína
- Status de qualidade
- Custo real por litro
- Valor total do lote
- Data de entrada
- Validade ou prazo máximo de uso
- Histórico de movimentação

7. Uso em Ordem de Produção

Ao criar uma Ordem de Produção, o sistema deve permitir selecionar apenas lotes de leite aprovados.

A OP deve registrar:

- Lotes de leite usados
- Volume usado de cada lote
- Composição média ponderada do leite usado
- Custo médio ponderado do leite usado
- Produto fabricado
- Rendimento teórico esperado
- Rendimento real obtido

Exemplo:

OP 102 - Queijo Prato

Lotes usados:
- Lote L001 - João - 1.000L - 3,4% gordura - R$ 2,35/L
- Lote L002 - Maria - 800L - 3,0% gordura - R$ 2,27/L

Cálculo automático:
- Volume total usado: 1.800L
- Gordura média ponderada: calcular automaticamente
- Custo médio ponderado por litro: calcular automaticamente
- Custo total do leite usado: calcular automaticamente
- Rendimento esperado: baseado na ficha técnica do produto
- Rendimento real: informado ao finalizar a produção

8. Cálculo de média ponderada

O sistema deve calcular média ponderada para indicadores de qualidade.

Exemplo:

Produtor João:
1.000 litros com 3,4% de gordura

Produtor Maria:
800 litros com 3,0% de gordura

Cálculo:
((1.000 * 3,4) + (800 * 3,0)) / 1.800

Resultado:
Gordura média ponderada = 3,22%

Essa lógica deve ser aplicada também para proteína, CBT, CCS e outros indicadores numéricos.

9. Impacto no rendimento produtivo

O sistema deve permitir cadastrar uma ficha técnica por produto com rendimento teórico.

Exemplo:

Produto: Queijo Prato
- Rendimento teórico padrão: 10 litros de leite para 1 kg de queijo
- Gordura mínima ideal: 3,2%
- Proteína mínima ideal: 3,0%

Ao finalizar a OP, o sistema deve comparar:

- Rendimento teórico esperado
- Rendimento real obtido
- Diferença em litros
- Diferença em percentual
- Custo real por kg produzido

Exemplo:

Volume usado: 5.000 litros
Rendimento teórico: 10L por kg
Produção esperada: 500 kg

Produção real: 470 kg

Resultado:
- Rendimento real: 10,63L por kg
- Perda/diferença: 30 kg abaixo do esperado
- Sistema deve indicar que houve perda produtiva

10. Relatórios e indicadores

Criar relatórios para:

- Ranking de produtores por qualidade do leite
- Média de gordura por produtor
- Média de proteína por produtor
- Volume entregue por produtor
- Valor pago por produtor
- Custo médio do leite por período
- Rendimento por OP
- Comparação entre qualidade do leite e rendimento da produção
- Lotes bloqueados por motivo

11. Telas necessárias

Criar as seguintes telas para essa funcionalidade:

Tela 1: Cadastro de Produtor
Campos:
- Nome
- CPF/CNPJ
- Fazenda
- Rota
- Dados bancários
- Status ativo/inativo

Tela 2: Entrada de Leite Cru
Campos:
- Produtor
- Rota
- Transportador
- Volume
- Temperatura
- Data/hora
- Lote gerado automaticamente

Tela 3: Análise de Qualidade do Leite
Campos:
- Lote
- Gordura
- Proteína
- Acidez
- CBT
- CCS
- Crioscopia
- Densidade
- Alizarol
- Antibiótico
- Resultado final: aprovado ou bloqueado

Tela 4: Configuração de Preço do Leite
Campos:
- Período de vigência
- Preço base por litro
- Regra de bônus por gordura
- Regra de bônus por proteína
- Penalização por acidez
- Penalização por CBT
- Penalização por CCS
- Penalização por temperatura

Tela 5: Estoque de Leite Cru
Colunas:
- Lote
- Produtor
- Volume inicial
- Volume disponível
- Gordura
- Proteína
- Custo por litro
- Status
- Data de entrada

Tela 6: Ordem de Produção
Campos:
- Produto
- Data
- Responsável
- Lotes de leite selecionados
- Volume