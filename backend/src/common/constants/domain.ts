export const MILK_LOT_STATUS = {
  PENDING_ANALYSIS: 'Aguardando Análise',
  APPROVED: 'Aprovado',
  BLOCKED: 'Bloqueado',
  PARTIALLY_USED: 'Parcialmente Utilizado',
  USED: 'Utilizado',
} as const;

export const ANALYSIS_STATUS = {
  APPROVED: 'Aprovado',
  REPROVED: 'Reprovado',
  NOT_DETECTED: 'Não Detectado',
  DETECTED: 'Detectado',
} as const;

export const PRODUCTION_ORDER_STATUS = {
  IN_PROGRESS: 'Em Andamento',
  FINISHED: 'Finalizada',
  CANCELED: 'Cancelada',
} as const;

export const SUPPLY_LOT_STATUS = {
  AVAILABLE: 'Disponivel',
  BLOCKED: 'Bloqueado',
  EXPIRED: 'Vencido',
  USED: 'Utilizado',
  PARTIALLY_USED: 'Parcialmente Utilizado',
} as const;

export const PURCHASE_STATUS = {
  OPEN: 'Aberta',
  PARTIALLY_RECEIVED: 'Parcialmente Recebida',
  RECEIVED: 'Recebida',
  CANCELED: 'Cancelada',
} as const;

export const SALES_ORDER_STATUS = {
  OPEN: 'Aberto',
  PARTIALLY_FULFILLED: 'Parcialmente Atendido',
  FULFILLED: 'Atendido',
  CANCELED: 'Cancelado',
} as const;
