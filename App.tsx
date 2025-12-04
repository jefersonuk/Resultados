
import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Wallet, 
  TrendingUp, 
  Bell, 
  Search, 
  Menu,
  ChevronRight,
  Calendar,
  PieChart,
  Landmark,
  ShieldAlert,
  Briefcase,
  FileText,
  BarChart4,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { generateDataStory } from './services/geminiService';
import { MonthlyMetric, AIInsight, KPIData, FinancialRecord } from './types';
import KPICard from './components/KPICard';
import { EvolutionChart } from './components/Charts';
import AIInsightsPanel from './components/AIInsightsPanel';
import CreditPortfolioTab from './components/CreditPortfolioTab';
import TreasuryTab from './components/TreasuryTab';
import ProvisionTab from './components/ProvisionTab';
import ServiceTab from './components/ServiceTab';
import AdministrativeExpensesTab from './components/AdministrativeExpensesTab';
import NetProfitTab from './components/NetProfitTab';
import { RAW_DATA_2021, RAW_DATA_2022, RAW_DATA_2023, RAW_DATA_2024, RAW_DATA_2025 } from './data/rawFinancialData';

// === PARSER DE DADOS ===
const parseBrazilianNumber = (val: string): number => {
  if (!val) return 0;
  
  let cleanVal = val.trim();
  let isNegative = false;
  
  // Handle (123) as negative -123
  if (cleanVal.startsWith('(') && cleanVal.endsWith(')')) {
    isNegative = true;
    cleanVal = cleanVal.slice(1, -1);
  }
  
  // Remove points (thousands separator) and replace comma with dot
  cleanVal = cleanVal.replace(/\./g, '').replace(',', '.');
  
  let num = parseFloat(cleanVal);
  if (isNaN(num)) return 0;
  
  return isNegative ? -num : num;
};

const MONTH_MAP: { [key: string]: number } = {
  'Jan': 1, 'Fev': 2, 'Mar': 3, 'Abr': 4, 'Mai': 5, 'Jun': 6,
  'Jul': 7, 'Ago': 8, 'Set': 9, 'Out': 10, 'Nov': 11, 'Dez': 12
};

const MONTH_LABELS = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const parseFinancialData = (): { aggregated: MonthlyMetric[], detailed: FinancialRecord[], products: string[] } => {
  const aggregatedMetrics: MonthlyMetric[] = [];
  const detailedRecords: FinancialRecord[] = [];
  const productSet = new Set<string>();

  const processYear = (year: number, rawData: string) => {
    const lines = rawData.split('\n');
    let monthBlockMap: { blockIndex: number, month: number }[] = [];
    
    // 1. Tentar detectar linha de cabeçalho
    let headerIndex = -1;
    for(let i=0; i<lines.length; i++) {
      if(lines[i].startsWith('Nivel 1')) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex !== -1) {
      // Se encontrou cabeçalho, usa mapeamento dinâmico
      const headerLine = lines[headerIndex];
      const headerParts = headerLine.split(',');
      
      let currentBlock = 0;
      // Avança de 4 em 4 no cabeçalho (Orçado, Realizado, Dif$, Dif%)
      for (let i = 3; i < headerParts.length; i += 4) {
        const monthName = headerParts[i].trim();
        if (monthName === 'Total') break;

        if (MONTH_MAP[monthName]) {
          monthBlockMap.push({
            blockIndex: currentBlock,
            month: MONTH_MAP[monthName]
          });
        }
        currentBlock++;
      }
    } else {
      // Fallback: Se não encontrou cabeçalho, assume estrutura baseada no ano
      // 2021 começa em Março (3), outros começam em Janeiro (1)
      const startMonth = year === 2021 ? 3 : 1;
      
      // Assume até 12 meses consecutivos
      for (let i = 0; i < 12; i++) {
        const month = startMonth + i;
        if (month > 12) break;
        monthBlockMap.push({ blockIndex: i, month: month });
      }
    }

    // 2. Processar linhas de dados
    // Se teve cabeçalho, começa depois dele. Se não, começa da linha 0.
    const startDataIndex = headerIndex !== -1 ? headerIndex + 1 : 0;

    for (let i = startDataIndex; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      const parts = line.split(',');
      
      // Identificar tipo da linha
      let type: 'saldo' | 'renda' | null = null;
      if (parts[0].startsWith('SALDO')) type = 'saldo';
      else if (parts[0].startsWith('RENDAS')) type = 'renda';
      
      if (!type) continue;

      const product = parts[1].trim(); 
      
      // Iterar sobre os blocos mapeados
      monthBlockMap.forEach(({ blockIndex, month }) => {
        // Calcular índice base nos DADOS
        const baseIndex = 3 + (blockIndex * 8);
        
        if (baseIndex + 3 >= parts.length) return;

        // Reconstrói números quebrados pela vírgula do CSV
        const orcadoStr = parts[baseIndex] + ',' + parts[baseIndex+1];
        const realizadoStr = parts[baseIndex+2] + ',' + parts[baseIndex+3];
        
        const orcado = parseBrazilianNumber(orcadoStr);
        const realizado = parseBrazilianNumber(realizadoStr);
        
        // Escala para Milhões
        const orcadoM = orcado / 1000000;
        const realizadoM = realizado / 1000000;

        if (product === 'Total') {
          // Agregado (Apenas Saldo)
          if (type === 'saldo') {
             const dateKey = `${MONTH_LABELS[month]}/${year.toString().slice(-2)}`;
             const existingIdx = aggregatedMetrics.findIndex(m => m.date === dateKey);
             
             if (existingIdx === -1) {
                // Filtra meses futuros vazios (apenas zeros), mas mantém se houver orçado (meta)
                if (orcado !== 0 || realizado !== 0) {
                    aggregatedMetrics.push({
                      date: dateKey,
                      orcado: orcadoM,
                      realizado: realizadoM,
                      churnRate: 0
                    });
                }
             }
          }
        } else {
          // Detalhado
          productSet.add(product);
          // Adiciona se tiver dados relevantes
          if (orcado !== 0 || realizado !== 0) {
              detailedRecords.push({
                 id: `${year}-${month}-${product}-${type}`,
                 year: year,
                 month: month,
                 monthLabel: MONTH_LABELS[month],
                 product: product,
                 type: type,
                 orcado: orcadoM,
                 realizado: realizadoM
              });
          }
        }
      });
    }
  };

  // Processar na ordem cronológica
  processYear(2021, RAW_DATA_2021);
  processYear(2022, RAW_DATA_2022);
  processYear(2023, RAW_DATA_2023);
  processYear(2024, RAW_DATA_2024);
  processYear(2025, RAW_DATA_2025);

  // Ordenação Agregada (Ano -> Mês)
  aggregatedMetrics.sort((a, b) => {
    const [ma, ya] = a.date.split('/');
    const [mb, yb] = b.date.split('/');
    const yearA = parseInt(ya) + 2000;
    const yearB = parseInt(yb) + 2000;
    
    if (yearA !== yearB) return yearA - yearB;
    return MONTH_MAP[ma] - MONTH_MAP[mb];
  });

  return { 
    aggregated: aggregatedMetrics, 
    detailed: detailedRecords,
    products: Array.from(productSet).sort()
  };
};

const BanestesLogo = () => (
  <div className="flex items-center gap-1 select-none group cursor-pointer">
    <div className="relative w-8 h-8 mr-1">
       <div className="absolute top-0 right-0 w-6 h-6 bg-banestes-blue rounded-full rounded-bl-none"></div>
       <div className="absolute bottom-0 right-0 w-6 h-6 bg-banestes-blue rounded-full rounded-tl-none"></div>
       <div className="absolute top-0 left-0 w-2 h-full bg-banestes-blue rounded-l-md"></div>
       <div className="absolute bottom-[2px] -left-[2px] w-0 h-0 border-l-[10px] border-l-transparent border-b-[10px] border-b-banestes-green border-r-[10px] border-r-transparent transform -rotate-45 z-10"></div>
    </div>
    <span className="font-brand font-bold text-3xl tracking-tight text-white group-hover:text-banestes-blue transition-colors duration-300">
      banestes
    </span>
  </div>
);

type TabType = 'dashboard' | 'portfolio' | 'treasury' | 'provision' | 'services' | 'admin-expenses' | 'net-profit';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [data, setData] = useState<{ aggregated: MonthlyMetric[], detailed: FinancialRecord[], products: string[] }>({ aggregated: [], detailed: [], products: [] });
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [loadingInsights, setLoadingInsights] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Mobile sidebar state
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true); // Desktop sidebar state

  useEffect(() => {
    const initData = async () => {
        try {
          const parsed = parseFinancialData();
          setData(parsed);
        } catch (e) {
          console.error("Erro ao processar dados:", e);
        }
    };
    initData();
  }, []);

  const getPageTitle = () => {
    switch(activeTab) {
      case 'dashboard': return 'Agência Digital';
      case 'portfolio': return 'Análise de Carteira';
      case 'treasury': return 'Tesouraria';
      case 'provision': return 'Provisão (PDD)';
      case 'services': return 'Prestação de Serviços';
      case 'admin-expenses': return 'Despesas Administrativas';
      case 'net-profit': return 'Demonstrativo de Resultado';
      default: return 'Dashboard';
    }
  };

  const toggleSidebar = () => {
    // Check if we are on desktop (lg breakpoint is usually 1024px)
    if (window.matchMedia("(min-width: 1024px)").matches) {
        setIsDesktopSidebarOpen(!isDesktopSidebarOpen);
    } else {
        setIsSidebarOpen(!isSidebarOpen);
    }
  };

  return (
    <div className="flex h-screen bg-banestes-bg text-slate-200 font-sans overflow-hidden selection:bg-banestes-blue selection:text-white">
      {/* Sidebar */}
      <aside 
        className={`fixed lg:static inset-y-0 left-0 z-50 bg-banestes-dark border-r border-banestes-blue/20 transform transition-all duration-300 flex flex-col
            ${isSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full lg:translate-x-0'}
            ${isDesktopSidebarOpen ? 'lg:w-72' : 'lg:w-0 lg:overflow-hidden lg:border-r-0'}
        `}
      >
        <div className="p-8 border-b border-white/5 whitespace-nowrap overflow-hidden">
          <BanestesLogo />
        </div>
        
        <nav className="flex-1 px-4 py-8 space-y-2 overflow-y-auto overflow-x-hidden">
          <button 
            onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 font-medium text-sm group whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-banestes-blue text-white shadow-[0_0_20px_-5px_#0814DD]' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <LayoutDashboard size={20} className={`min-w-[20px] ${activeTab === 'dashboard' ? 'animate-pulse' : ''}`} />
            <span>Visão Geral</span>
            {activeTab === 'dashboard' && <ChevronRight size={16} className="ml-auto opacity-50" />}
          </button>
          
          <button 
            onClick={() => { setActiveTab('portfolio'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 font-medium text-sm group whitespace-nowrap ${activeTab === 'portfolio' ? 'bg-banestes-blue text-white shadow-[0_0_20px_-5px_#0814DD]' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <Wallet size={20} className="min-w-[20px]" />
            <span>Carteira de Crédito</span>
            {activeTab === 'portfolio' && <ChevronRight size={16} className="ml-auto opacity-50" />}
          </button>

          <button 
            onClick={() => { setActiveTab('services'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 font-medium text-sm group whitespace-nowrap ${activeTab === 'services' ? 'bg-banestes-blue text-white shadow-[0_0_20px_-5px_#0814DD]' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <Briefcase size={20} className="min-w-[20px]" />
            <span>Prestação de Serviços</span>
            {activeTab === 'services' && <ChevronRight size={16} className="ml-auto opacity-50" />}
          </button>

          <button 
            onClick={() => { setActiveTab('treasury'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 font-medium text-sm group whitespace-nowrap ${activeTab === 'treasury' ? 'bg-banestes-blue text-white shadow-[0_0_20px_-5px_#0814DD]' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <Landmark size={20} className="min-w-[20px]" />
            <span>Tesouraria</span>
            {activeTab === 'treasury' && <ChevronRight size={16} className="ml-auto opacity-50" />}
          </button>

          <button 
            onClick={() => { setActiveTab('provision'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 font-medium text-sm group whitespace-nowrap ${activeTab === 'provision' ? 'bg-banestes-blue text-white shadow-[0_0_20px_-5px_#0814DD]' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <ShieldAlert size={20} className="min-w-[20px]" />
            <span>PDD</span>
            {activeTab === 'provision' && <ChevronRight size={16} className="ml-auto opacity-50" />}
          </button>

          <button 
            onClick={() => { setActiveTab('admin-expenses'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 font-medium text-sm group whitespace-nowrap ${activeTab === 'admin-expenses' ? 'bg-banestes-blue text-white shadow-[0_0_20px_-5px_#0814DD]' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <FileText size={20} className="min-w-[20px]" />
            <span>Outras Despesas Adm</span>
            {activeTab === 'admin-expenses' && <ChevronRight size={16} className="ml-auto opacity-50" />}
          </button>

          <div className="pt-4 pb-2">
              <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Resultados</p>
           </div>

          <button 
            onClick={() => { setActiveTab('net-profit'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 font-medium text-sm group whitespace-nowrap ${activeTab === 'net-profit' ? 'bg-banestes-green text-white shadow-[0_0_20px_-5px_#00AB16]' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <BarChart4 size={20} className="min-w-[20px]" />
            <span>Lucro Líquido</span>
            {activeTab === 'net-profit' && <ChevronRight size={16} className="ml-auto opacity-50" />}
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative transition-all duration-300">
        <header className="h-20 bg-banestes-bg/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-8 z-40 sticky top-0">
          <div className="flex items-center gap-4">
             <button onClick={toggleSidebar} className="p-2 text-slate-400 hover:text-white transition-colors">
                {isDesktopSidebarOpen ? <PanelLeftClose size={24} /> : <Menu size={24} />}
             </button>
             <div>
               <h1 className="text-xl font-brand font-bold text-white tracking-tight">
                  {getPageTitle()}
               </h1>
               <p className="text-xs text-slate-400 hidden sm:block">Atualizado em 15/10/2025</p>
             </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center bg-banestes-dark border border-white/10 rounded-full px-4 py-2 w-64 focus-within:border-banestes-blue transition-colors">
               <Search size={16} className="text-slate-500 mr-2" />
               <input type="text" placeholder="Buscar indicadores..." className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600" />
            </div>
            <button className="relative p-2.5 bg-banestes-dark border border-white/10 rounded-full text-slate-400 hover:text-white hover:border-banestes-blue transition-all">
               <Bell size={18} />
               <span className="absolute top-2 right-2.5 w-2 h-2 bg-banestes-pink rounded-full border border-banestes-dark"></span>
            </button>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-banestes-blue to-banestes-green p-[2px]">
               <div className="w-full h-full rounded-full bg-banestes-dark flex items-center justify-center text-xs font-bold text-white">
                  AD
               </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8 scrollbar-thin scrollbar-thumb-banestes-blue/20 scrollbar-track-transparent">
          <div className="max-w-7xl mx-auto space-y-8 h-full">
            
            {activeTab === 'dashboard' && (
               <div className="flex flex-col items-center justify-center h-full min-h-[600px] relative overflow-hidden rounded-3xl bg-banestes-dark border border-banestes-blue/20 p-8 shadow-2xl">
                  {/* Decorative Elements */}
                  <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-banestes-blue/10 rounded-full blur-[100px]"></div>
                      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-banestes-green/10 rounded-full blur-[100px]"></div>
                      <div className="absolute top-[20%] right-[20%] w-[10%] h-[10%] bg-banestes-pink/10 rounded-full blur-[80px] animate-pulse"></div>
                  </div>

                  <div className="relative z-10 flex flex-col items-center text-center space-y-8">
                      <div className="p-4 bg-banestes-bg/50 backdrop-blur-xl border border-white/10 rounded-3xl shadow-xl transform hover:scale-105 transition-transform duration-500">
                         <div className="flex items-center gap-2">
                            <div className="relative w-12 h-12">
                               <div className="absolute top-0 right-0 w-9 h-9 bg-banestes-blue rounded-full rounded-bl-none"></div>
                               <div className="absolute bottom-0 right-0 w-9 h-9 bg-banestes-blue rounded-full rounded-tl-none"></div>
                               <div className="absolute top-0 left-0 w-3 h-full bg-banestes-blue rounded-l-lg"></div>
                               <div className="absolute bottom-[3px] -left-[3px] w-0 h-0 border-l-[15px] border-l-transparent border-b-[15px] border-b-banestes-green border-r-[15px] border-r-transparent transform -rotate-45 z-10"></div>
                            </div>
                            <span className="font-brand font-extrabold text-5xl tracking-tighter text-white">
                              banestes
                            </span>
                         </div>
                      </div>

                      <div className="space-y-4 max-w-2xl">
                          <h1 className="text-5xl md:text-6xl font-brand font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400 leading-tight">
                            Acompanhamento de Resultados
                          </h1>
                          <p className="text-2xl font-light text-banestes-lightBlue tracking-wide">
                            Agência Digital
                          </p>
                      </div>

                      <div className="mt-12 flex items-center gap-4">
                          <div className="px-6 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md">
                             <span className="text-sm font-medium text-slate-300">Outubro / 2025</span>
                          </div>
                          <div className="w-px h-8 bg-white/10"></div>
                          <div className="flex items-center gap-2">
                             <span className="w-2 h-2 rounded-full bg-banestes-green animate-pulse"></span>
                             <span className="text-sm font-medium text-banestes-green">Dados Atualizados</span>
                          </div>
                      </div>
                  </div>
                  
                  <div className="absolute bottom-8 text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                      SUREC - Superintendência Regional Centro
                  </div>
               </div>
            )}

            {activeTab === 'portfolio' && (
              <CreditPortfolioTab data={data.detailed} availableProducts={data.products} />
            )}

            {activeTab === 'services' && (
              <ServiceTab />
            )}

            {activeTab === 'treasury' && (
              <TreasuryTab />
            )}

            {activeTab === 'provision' && (
              <ProvisionTab />
            )}

            {activeTab === 'admin-expenses' && (
              <AdministrativeExpensesTab />
            )}

            {activeTab === 'net-profit' && (
              <NetProfitTab />
            )}

          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
