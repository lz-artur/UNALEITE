// Tipos e Dados Mockados para UNA Laticínios

export interface Produtor {
  id: string;
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
  cidade: string;
  estado: string;
  ativo: boolean;
}

export interface Rota {
  id: string;
  nome: string;
  motorista: string;
  veiculo: string;
  placa: string;
  ativa: boolean;
}

export interface Transportador {
  id: string;
  nome: string;
  cnpj: string;
  telefone: string;
  ativo: boolean;
}

export interface LoteLeite {
  id: string;
  codigo: string;
  produtorId: string;
  rotaId: string;
  transportadorId: string;
  volumeLitros: number;
  volumeDisponivel?: number;
  temperatura: number;
  dataHoraRecebimento: Date;
  status: 'Aguardando Análise' | 'Aprovado' | 'Reprovado' | 'Bloqueado' | 'Parcialmente Utilizado' | 'Utilizado';
  motivoBloqueio?: string;
  analiseId?: string;
  custoLitro?: number;
  valorTotal?: number;
}

export interface AnaliseLaboral {
  id: string;
  loteId: string;
  dataAnalise: Date;
  alizarol: 'Aprovado' | 'Reprovado';
  acidez: number; // °D (graus Dornic)
  crioscopia: number; // °H
  densidade: number; // g/mL
  antibioticos: 'Não Detectado' | 'Detectado';
  gordura?: number; // %
  proteina?: number; // %
  alcool?: string;
  ph?: number;
  porcentagem_agua?: number;
  est?: number;
  esd?: number;
  redutase?: string;
  aprovado: boolean;
  observacoes?: string;
  subanalyses?: Omit<AnaliseLaboral, 'id' | 'loteId' | 'dataAnalise' | 'subanalyses'>[];
}

export interface PrecificacaoLeite {
  produtorId: string;
  loteId: string;
  precoBase: number;
  bonusGordura: number;
  bonusProteina: number;
  penalizacaoAcidez: number;
  penalizacaoCBT: number;
  penalizacaoCCS: number;
  penalizacaoTemperatura: number;
  precoFinal: number;
  valorTotal: number;
}

export interface Produto {
  id: string;
  nome: string;
  tipo: 'Queijo' | 'Iogurte' | 'Manteiga' | 'Requeijão' | 'Doce de Leite' | 'Outro';
  unidade: 'kg' | 'unidade' | 'litro';
  rendimentoTeorico: number; // litros de leite por kg/unidade
  precoVenda: number;
  ativo: boolean;
}

export interface Insumo {
  id: string;
  nome: string;
  tipo: 'Coalho' | 'Fermento' | 'Sal' | 'Embalagem' | 'Outro';
  unidade: 'kg' | 'litro' | 'unidade';
  estoqueAtual: number;
  estoqueMinimo: number;
  custoUnitario: number;
  dataValidade?: Date;
  lote?: string;
}

export interface OrdemProducao {
  id: string;
  numero: string;
  loteLeiteId: string;
  produtoId: string;
  litrosUtilizados: number;
  dataInicio: Date;
  dataFinalizacao?: Date;
  status: 'Em Andamento' | 'Finalizada' | 'Cancelada';
  quantidadeProduzida?: number;
  rendimentoReal?: number;
  insumos: { insumoId: string; quantidade: number }[];
  custos?: CustoProducao;
}

export interface CustoProducao {
  custoLeite: number;
  custoInsumos: number;
  custoEnergia: number;
  custoLenha: number;
  custoMaoObra: number;
  custoTotal: number;
  custoUnitario: number;
}

export interface EstoqueProduto {
  id: string;
  produtoId: string;
  ordemProducaoId: string;
  quantidade: number;
  dataProducao: Date;
  dataValidade: Date;
  lote: string;
  disponivel: number;
}

export interface Cliente {
  id: string;
  nome: string;
  cnpj: string;
  telefone: string;
  email: string;
  cidade: string;
  estado: string;
  ativo: boolean;
}

export interface PedidoVenda {
  id: string;
  numero: string;
  clienteId: string;
  data: Date;
  status: 'Pendente' | 'Expedido' | 'Cancelado';
  itens: { produtoId: string; quantidade: number; precoUnitario: number }[];
  valorTotal: number;
  temperaturaTransporte?: number;
}

export interface ContaFinanceira {
  id: string;
  tipo: 'Pagar' | 'Receber';
  descricao: string;
  valor: number;
  dataVencimento: Date;
  dataPagamento?: Date;
  status: 'Aberto' | 'Pago' | 'Vencido' | 'Cancelado';
  categoria: string;
  fornecedorId?: string;
  clienteId?: string;
  produtorId?: string;
  centroCusto?: string;
  subcategoriaContabil?: string;
  accountingCategoryId?: string;
  accountingSubcategoryId?: string;
  costCenterId?: string;
  formaPagamento?: string;
  tipoPagamento?: string;
  anexoUrl?: string;
  installmentGroupId?: string;
  installmentNumber?: number;
}

// Dados Mockados
export const produtores: Produtor[] = [
  {
    id: 'prod-001',
    nome: 'João da Silva',
    cpf: '123.456.789-00',
    telefone: '(34) 99999-0001',
    email: 'joao@email.com',
    cidade: 'Unaí',
    estado: 'MG',
    ativo: true
  },
  {
    id: 'prod-002',
    nome: 'Maria Santos',
    cpf: '234.567.890-11',
    telefone: '(34) 99999-0002',
    email: 'maria@email.com',
    cidade: 'Unaí',
    estado: 'MG',
    ativo: true
  },
  {
    id: 'prod-003',
    nome: 'Pedro Oliveira',
    cpf: '345.678.901-22',
    telefone: '(34) 99999-0003',
    email: 'pedro@email.com',
    cidade: 'Paracatu',
    estado: 'MG',
    ativo: true
  },
  {
    id: 'prod-004',
    nome: 'Ana Costa',
    cpf: '456.789.012-33',
    telefone: '(34) 99999-0004',
    email: 'ana@email.com',
    cidade: 'Unaí',
    estado: 'MG',
    ativo: true
  }
];

export const rotas: Rota[] = [
  {
    id: 'rota-001',
    nome: 'Rota 1 - Centro',
    motorista: 'Carlos Motorista',
    veiculo: 'Caminhão Tanque',
    placa: 'ABC-1234',
    ativa: true
  },
  {
    id: 'rota-002',
    nome: 'Rota 2 - Rural Norte',
    motorista: 'José Motorista',
    veiculo: 'Caminhão Tanque',
    placa: 'DEF-5678',
    ativa: true
  },
  {
    id: 'rota-003',
    nome: 'Rota 3 - Rural Sul',
    motorista: 'Paulo Motorista',
    veiculo: 'Caminhão Tanque',
    placa: 'GHI-9012',
    ativa: true
  }
];

export const transportadores: Transportador[] = [
  {
    id: 'transp-001',
    nome: 'Transportadora Rápida Ltda',
    cnpj: '12.345.678/0001-90',
    telefone: '(34) 3333-1111',
    ativo: true
  },
  {
    id: 'transp-002',
    nome: 'Logística do Campo',
    cnpj: '23.456.789/0001-01',
    telefone: '(34) 3333-2222',
    ativo: true
  }
];

export const lotes: LoteLeite[] = [
  {
    id: 'lote-001',
    codigo: 'LT-2026-001',
    produtorId: 'prod-001',
    rotaId: 'rota-001',
    transportadorId: 'transp-001',
    volumeLitros: 1500,
    volumeDisponivel: 500,
    temperatura: 4.2,
    dataHoraRecebimento: new Date('2026-05-01T06:30:00'),
    status: 'Parcialmente Utilizado',
    analiseId: 'analise-001',
    custoLitro: 2.35,
    valorTotal: 3525.00
  },
  {
    id: 'lote-002',
    codigo: 'LT-2026-002',
    produtorId: 'prod-002',
    rotaId: 'rota-001',
    transportadorId: 'transp-001',
    volumeLitros: 2000,
    volumeDisponivel: 500,
    temperatura: 3.8,
    dataHoraRecebimento: new Date('2026-05-02T06:45:00'),
    status: 'Parcialmente Utilizado',
    analiseId: 'analise-002',
    custoLitro: 2.27,
    valorTotal: 4540.00
  },
  {
    id: 'lote-003',
    codigo: 'LT-2026-003',
    produtorId: 'prod-003',
    rotaId: 'rota-002',
    transportadorId: 'transp-001',
    volumeLitros: 1800,
    volumeDisponivel: 1800,
    temperatura: 4.5,
    dataHoraRecebimento: new Date('2026-05-05T07:00:00'),
    status: 'Bloqueado',
    motivoBloqueio: 'Antibiótico detectado',
    analiseId: 'analise-003',
    custoLitro: 2.15,
    valorTotal: 3870.00
  },
  {
    id: 'lote-004',
    codigo: 'LT-2026-004',
    produtorId: 'prod-004',
    rotaId: 'rota-002',
    transportadorId: 'transp-002',
    volumeLitros: 2200,
    volumeDisponivel: 2200,
    temperatura: 4.0,
    dataHoraRecebimento: new Date('2026-05-10T06:20:00'),
    status: 'Aprovado',
    analiseId: 'analise-004',
    custoLitro: 2.40,
    valorTotal: 5280.00
  },
  {
    id: 'lote-005',
    codigo: 'LT-2026-005',
    produtorId: 'prod-001',
    rotaId: 'rota-001',
    transportadorId: 'transp-001',
    volumeLitros: 1600,
    volumeDisponivel: 1600,
    temperatura: 4.1,
    dataHoraRecebimento: new Date('2026-05-15T06:35:00'),
    status: 'Aguardando Análise'
  }
];

export const analises: AnaliseLaboral[] = [
  {
    id: 'analise-001',
    loteId: 'lote-001',
    dataAnalise: new Date('2026-05-01T08:00:00'),
    alizarol: 'Aprovado',
    acidez: 16,
    crioscopia: -0.530,
    densidade: 1.028,
    antibioticos: 'Não Detectado',
    gordura: 3.5,
    proteina: 3.2,
    aprovado: true
  },
  {
    id: 'analise-002',
    loteId: 'lote-002',
    dataAnalise: new Date('2026-05-02T08:15:00'),
    alizarol: 'Aprovado',
    acidez: 15,
    crioscopia: -0.535,
    densidade: 1.029,
    antibioticos: 'Não Detectado',
    gordura: 3.7,
    proteina: 3.3,
    aprovado: true
  },
  {
    id: 'analise-003',
    loteId: 'lote-003',
    dataAnalise: new Date('2026-05-05T08:30:00'),
    alizarol: 'Reprovado',
    acidez: 22,
    crioscopia: -0.520,
    densidade: 1.027,
    antibioticos: 'Detectado',
    gordura: 3.2,
    proteina: 3.0,
    aprovado: false,
    observacoes: 'Alizarol reprovado e antibiótico detectado - Lote bloqueado'
  },
  {
    id: 'analise-004',
    loteId: 'lote-004',
    dataAnalise: new Date('2026-05-10T08:00:00'),
    alizarol: 'Aprovado',
    acidez: 17,
    crioscopia: -0.532,
    densidade: 1.030,
    antibioticos: 'Não Detectado',
    gordura: 3.6,
    proteina: 3.4,
    aprovado: true
  }
];

export const precificacoes: PrecificacaoLeite[] = [
  {
    produtorId: 'prod-001',
    loteId: 'lote-001',
    precoBase: 2.30,
    bonusGordura: 0.05,
    bonusProteina: 0.00,
    penalizacaoAcidez: 0.00,
    penalizacaoCBT: 0.00,
    penalizacaoCCS: 0.00,
    penalizacaoTemperatura: 0.00,
    precoFinal: 2.35,
    valorTotal: 3525.00
  },
  {
    produtorId: 'prod-002',
    loteId: 'lote-002',
    precoBase: 2.30,
    bonusGordura: 0.10,
    bonusProteina: 0.05,
    penalizacaoAcidez: 0.00,
    penalizacaoCBT: 0.00,
    penalizacaoCCS: -0.05,
    penalizacaoTemperatura: 0.00,
    precoFinal: 2.40,
    valorTotal: 4800.00
  },
  {
    produtorId: 'prod-003',
    loteId: 'lote-003',
    precoBase: 2.30,
    bonusGordura: 0.00,
    bonusProteina: 0.00,
    penalizacaoAcidez: -0.05,
    penalizacaoCBT: -0.05,
    penalizacaoCCS: -0.10,
    penalizacaoTemperatura: 0.00,
    precoFinal: 2.10,
    valorTotal: 3780.00
  },
  {
    produtorId: 'prod-004',
    loteId: 'lote-004',
    precoBase: 2.30,
    bonusGordura: 0.08,
    bonusProteina: 0.07,
    penalizacaoAcidez: 0.00,
    penalizacaoCBT: 0.00,
    penalizacaoCCS: 0.00,
    penalizacaoTemperatura: 0.00,
    precoFinal: 2.45,
    valorTotal: 5390.00
  }
];

export const produtos: Produto[] = [
  {
    id: 'prod-q001',
    nome: 'Queijo Minas Frescal',
    tipo: 'Queijo',
    unidade: 'kg',
    rendimentoTeorico: 10, // 10 litros de leite por kg
    precoVenda: 28.50,
    ativo: true
  },
  {
    id: 'prod-q002',
    nome: 'Queijo Mussarela',
    tipo: 'Queijo',
    unidade: 'kg',
    rendimentoTeorico: 10,
    precoVenda: 32.00,
    ativo: true
  },
  {
    id: 'prod-i001',
    nome: 'Iogurte Natural',
    tipo: 'Iogurte',
    unidade: 'litro',
    rendimentoTeorico: 1.1,
    precoVenda: 8.50,
    ativo: true
  },
  {
    id: 'prod-m001',
    nome: 'Manteiga com Sal',
    tipo: 'Manteiga',
    unidade: 'kg',
    rendimentoTeorico: 25, // 25 litros de leite por kg
    precoVenda: 45.00,
    ativo: true
  },
  {
    id: 'prod-r001',
    nome: 'Requeijão Cremoso',
    tipo: 'Requeijão',
    unidade: 'kg',
    rendimentoTeorico: 8,
    precoVenda: 35.00,
    ativo: true
  }
];

export const insumos: Insumo[] = [
  {
    id: 'ins-001',
    nome: 'Coalho Líquido',
    tipo: 'Coalho',
    unidade: 'litro',
    estoqueAtual: 15,
    estoqueMinimo: 5,
    custoUnitario: 45.00,
    dataValidade: new Date('2026-12-31'),
    lote: 'COAL-2026-01'
  },
  {
    id: 'ins-002',
    nome: 'Fermento Lático',
    tipo: 'Fermento',
    unidade: 'kg',
    estoqueAtual: 8,
    estoqueMinimo: 3,
    custoUnitario: 65.00,
    dataValidade: new Date('2026-08-15'),
    lote: 'FERM-2026-02'
  },
  {
    id: 'ins-003',
    nome: 'Sal Refinado',
    tipo: 'Sal',
    unidade: 'kg',
    estoqueAtual: 150,
    estoqueMinimo: 50,
    custoUnitario: 2.50,
    lote: 'SAL-2026-01'
  },
  {
    id: 'ins-004',
    nome: 'Embalagem 500g',
    tipo: 'Embalagem',
    unidade: 'unidade',
    estoqueAtual: 500,
    estoqueMinimo: 200,
    custoUnitario: 0.80
  },
  {
    id: 'ins-005',
    nome: 'Fermento Iogurte',
    tipo: 'Fermento',
    unidade: 'kg',
    estoqueAtual: 2,
    estoqueMinimo: 5,
    custoUnitario: 120.00,
    dataValidade: new Date('2026-06-30'),
    lote: 'FERM-IOG-01'
  }
];

export const ordensProducao: OrdemProducao[] = [
  {
    id: 'op-001',
    numero: 'OP-2026-001',
    loteLeiteId: 'lote-001',
    produtoId: 'prod-q001',
    litrosUtilizados: 1000,
    dataInicio: new Date('2026-05-01T09:00:00'),
    dataFinalizacao: new Date('2026-05-01T16:00:00'),
    status: 'Finalizada',
    quantidadeProduzida: 98,
    rendimentoReal: 10.2,
    insumos: [
      { insumoId: 'ins-001', quantidade: 0.5 },
      { insumoId: 'ins-002', quantidade: 0.3 },
      { insumoId: 'ins-003', quantidade: 2 },
      { insumoId: 'ins-004', quantidade: 196 }
    ],
    custos: {
      custoLeite: 2000.00,
      custoInsumos: 189.30,
      custoEnergia: 45.00,
      custoLenha: 80.00,
      custoMaoObra: 150.00,
      custoTotal: 2464.30,
      custoUnitario: 25.15
    }
  },
  {
    id: 'op-002',
    numero: 'OP-2026-002',
    loteLeiteId: 'lote-002',
    produtoId: 'prod-q002',
    litrosUtilizados: 1500,
    dataInicio: new Date('2026-05-03T08:00:00'),
    dataFinalizacao: new Date('2026-05-03T17:00:00'),
    status: 'Finalizada',
    quantidadeProduzida: 145,
    rendimentoReal: 10.34,
    insumos: [
      { insumoId: 'ins-001', quantidade: 0.75 },
      { insumoId: 'ins-002', quantidade: 0.5 },
      { insumoId: 'ins-003', quantidade: 3 },
      { insumoId: 'ins-004', quantidade: 290 }
    ],
    custos: {
      custoLeite: 3000.00,
      custoInsumos: 298.75,
      custoEnergia: 60.00,
      custoLenha: 100.00,
      custoMaoObra: 200.00,
      custoTotal: 3658.75,
      custoUnitario: 25.23
    }
  },
  {
    id: 'op-003',
    numero: 'OP-2026-003',
    loteLeiteId: 'lote-004',
    produtoId: 'prod-i001',
    litrosUtilizados: 500,
    dataInicio: new Date('2026-05-12T08:00:00'),
    status: 'Em Andamento',
    insumos: [
      { insumoId: 'ins-005', quantidade: 0.2 }
    ]
  }
];

export const estoquesProdutos: EstoqueProduto[] = [
  {
    id: 'est-001',
    produtoId: 'prod-q001',
    ordemProducaoId: 'op-001',
    quantidade: 98,
    dataProducao: new Date('2026-05-01'),
    dataValidade: new Date('2026-05-11'),
    lote: 'LT-2026-001',
    disponivel: 78
  },
  {
    id: 'est-002',
    produtoId: 'prod-q002',
    ordemProducaoId: 'op-002',
    quantidade: 145,
    dataProducao: new Date('2026-05-03'),
    dataValidade: new Date('2026-05-13'),
    lote: 'LT-2026-002',
    disponivel: 120
  }
];

export const clientes: Cliente[] = [
  {
    id: 'cli-001',
    nome: 'Supermercado Bom Preço',
    cnpj: '11.222.333/0001-44',
    telefone: '(34) 3333-4444',
    email: 'compras@bompreco.com',
    cidade: 'Unaí',
    estado: 'MG',
    ativo: true
  },
  {
    id: 'cli-002',
    nome: 'Mercado da Vila',
    cnpj: '22.333.444/0001-55',
    telefone: '(34) 3333-5555',
    email: 'mercado@vila.com',
    cidade: 'Brasília',
    estado: 'DF',
    ativo: true
  },
  {
    id: 'cli-003',
    nome: 'Distribuidora Regional',
    cnpj: '33.444.555/0001-66',
    telefone: '(34) 3333-6666',
    email: 'vendas@regional.com',
    cidade: 'Paracatu',
    estado: 'MG',
    ativo: true
  }
];

export const pedidosVenda: PedidoVenda[] = [
  {
    id: 'pv-001',
    numero: 'PV-2026-001',
    clienteId: 'cli-001',
    data: new Date('2026-05-05'),
    status: 'Expedido',
    itens: [
      { produtoId: 'prod-q001', quantidade: 20, precoUnitario: 28.50 }
    ],
    valorTotal: 570.00,
    temperaturaTransporte: 5.0
  },
  {
    id: 'pv-002',
    numero: 'PV-2026-002',
    clienteId: 'cli-002',
    data: new Date('2026-05-08'),
    status: 'Expedido',
    itens: [
      { produtoId: 'prod-q002', quantidade: 25, precoUnitario: 32.00 }
    ],
    valorTotal: 800.00,
    temperaturaTransporte: 4.5
  },
  {
    id: 'pv-003',
    numero: 'PV-2026-003',
    clienteId: 'cli-003',
    data: new Date('2026-05-14'),
    status: 'Pendente',
    itens: [
      { produtoId: 'prod-q001', quantidade: 30, precoUnitario: 28.50 },
      { produtoId: 'prod-q002', quantidade: 20, precoUnitario: 32.00 }
    ],
    valorTotal: 1495.00
  }
];

export const contasFinanceiras: ContaFinanceira[] = [
  {
    id: 'cf-001',
    tipo: 'Pagar',
    descricao: 'Fornecedor de Insumos - Coalho',
    valor: 2250.00,
    dataVencimento: new Date('2026-05-20'),
    status: 'Aberto',
    categoria: 'Insumos'
  },
  {
    id: 'cf-002',
    tipo: 'Pagar',
    descricao: 'Energia Elétrica - Abril/2026',
    valor: 1850.00,
    dataVencimento: new Date('2026-05-10'),
    dataPagamento: new Date('2026-05-08'),
    status: 'Pago',
    categoria: 'Utilidades'
  },
  {
    id: 'cf-003',
    tipo: 'Pagar',
    descricao: 'Folha do Leite - Produtor João da Silva',
    valor: 3500.00,
    dataVencimento: new Date('2026-05-15'),
    status: 'Aberto',
    categoria: 'Matéria Prima',
    produtorId: 'prod-001'
  },
  {
    id: 'cf-004',
    tipo: 'Receber',
    descricao: 'Venda - Supermercado Bom Preço',
    valor: 570.00,
    dataVencimento: new Date('2026-05-15'),
    dataPagamento: new Date('2026-05-12'),
    status: 'Pago',
    categoria: 'Vendas',
    clienteId: 'cli-001'
  },
  {
    id: 'cf-005',
    tipo: 'Receber',
    descricao: 'Venda - Mercado da Vila',
    valor: 800.00,
    dataVencimento: new Date('2026-05-25'),
    status: 'Aberto',
    categoria: 'Vendas',
    clienteId: 'cli-002'
  },
  {
    id: 'cf-006',
    tipo: 'Pagar',
    descricao: 'Manutenção de Equipamentos',
    valor: 1200.00,
    dataVencimento: new Date('2026-05-05'),
    status: 'Vencido',
    categoria: 'Manutenção'
  }
];

// Funções auxiliares
export const getProdutorById = (id: string) => produtores.find(p => p.id === id);
export const getRotaById = (id: string) => rotas.find(r => r.id === id);
export const getTransportadorById = (id: string) => transportadores.find(t => t.id === id);
export const getLoteById = (id: string) => lotes.find(l => l.id === id);
export const getAnaliseByLoteId = (loteId: string) => analises.find(a => a.loteId === loteId);
export const getProdutoById = (id: string) => produtos.find(p => p.id === id);
export const getInsumoById = (id: string) => insumos.find(i => i.id === id);
export const getClienteById = (id: string) => clientes.find(c => c.id === id);
export const getPrecificacaoByLoteId = (loteId: string) => precificacoes.find(p => p.loteId === loteId);

// Estatísticas do Dashboard
export const calcularEstatisticas = () => {
  const leiteRecebidoMes = lotes
    .filter(l => l.dataHoraRecebimento.getMonth() === 4) // Maio (mês 4)
    .reduce((sum, l) => sum + l.volumeLitros, 0);

  const lotesAprovados = lotes.filter(l => l.status === 'Aprovado').length;
  const lotesBloqueados = lotes.filter(l => l.status === 'Bloqueado' || l.status === 'Reprovado').length;
  const opsAbertas = ordensProducao.filter(op => op.status === 'Em Andamento').length;
  const producaoFinalizada = ordensProducao.filter(op => op.status === 'Finalizada').length;

  const custoMedioKg = ordensProducao
    .filter(op => op.custos)
    .reduce((sum, op) => sum + (op.custos?.custoUnitario || 0), 0) /
    ordensProducao.filter(op => op.custos).length;

  const folhaLeite = contasFinanceiras
    .filter(c => c.tipo === 'Pagar' && c.categoria === 'Matéria Prima')
    .reduce((sum, c) => sum + c.valor, 0);

  const contasPagar = contasFinanceiras
    .filter(c => c.tipo === 'Pagar' && c.status !== 'Pago' && c.status !== 'Cancelado')
    .reduce((sum, c) => sum + c.valor, 0);

  const contasReceber = contasFinanceiras
    .filter(c => c.tipo === 'Receber' && c.status !== 'Pago' && c.status !== 'Cancelado')
    .reduce((sum, c) => sum + c.valor, 0);

  return {
    leiteRecebidoMes,
    lotesAprovados,
    lotesBloqueados,
    opsAbertas,
    producaoFinalizada,
    custoMedioKg,
    folhaLeite,
    contasPagar,
    contasReceber
  };
};
