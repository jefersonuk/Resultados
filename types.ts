
export interface MonthlyMetric {
  date: string; // Format: "MM/YY"
  orcado: number;
  realizado: number;
  churnRate: number; // Mantido para KPI de inadimplência
}

export interface FinancialRecord {
  id: string;
  year: number;
  month: number;
  monthLabel: string;
  product: string;
  type: 'saldo' | 'renda';
  orcado: number;
  realizado: number;
}

export interface KPIData {
  label: string;
  value: string;
  change: number; // percentage
  trend: 'up' | 'down' | 'neutral';
  description: string;
}

export interface AIInsight {
  title: string;
  summary: string;
  actionableItem: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}
