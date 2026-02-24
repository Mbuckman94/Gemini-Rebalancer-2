import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  PieChart, ArrowRight, Upload, Trash2, Sparkles, Loader2, Globe, LayoutGrid, 
  PieChart as PieIcon, ChevronUp, ChevronDown, Briefcase, ArrowUpDown, 
  RefreshCw, Scale, Plus, Zap, ZapOff, ShieldCheck, Search, PlusCircle, 
  Newspaper, TrendingUp, Calendar, Info, Target, Users, Layers, Check, X, 
  Copy, Pencil, LineChart, AlertTriangle, FlaskConical, Database, WifiOff, 
  BarChart2, Activity, Banknote, Settings, Columns, GripVertical, ChevronRight, 
  RotateCcw, Landmark, MapPin, Key, Clock, ArrowDownAZ, ArrowUpAZ, 
  ArrowUpNarrowWide, ArrowDownWideNarrow, LayoutList, DollarSign, Eye, EyeOff
} from 'lucide-react';

// --- CONFIGURATION & KEY MANAGEMENT ---
const apiKey = process.env.GEMINI_API_KEY || ""; 

// Default Keys mapping to your Google AI Studio Secrets
const DEFAULT_FINNHUB_KEYS = [
  process.env.Finnhub_API_Key1,
  process.env.Finnhub_API_Key2,
  process.env.Finnhub_API_Key3,
  process.env.Finnhub_API_Key4,
  process.env.Finnhub_API_Key5
].filter(Boolean);

const DEFAULT_LOGO_DEV_KEY = process.env['Logo.Dev_API_Key'] || "";

const DEFAULT_TIINGO_KEYS = [
  process.env.Tiingo_API_Key1,
  process.env.Tiingo_API_Key2,
  process.env.Tiingo_API_Key3,
  process.env.Tiingo_API_Key4,
  process.env.Tiingo_API_Key5
].filter(Boolean);

const REFRESH_INTERVAL = 15000; 
const GLOBAL_QUOTE_CACHE = new Map(); // key: symbol, value: { price, yield, timestamp }
const QUOTE_CACHE_TTL = 60000; // 60 seconds

// Dynamic Key Getters
const getFinnhubKeys = () => {
    const userKeys = localStorage.getItem('user_finnhub_key');
    if (userKeys) return userKeys.split(',').map(k => k.trim()).filter(k => k);
    return DEFAULT_FINNHUB_KEYS;
};

const getLogoDevKey = () => localStorage.getItem('user_logo_dev_key') || DEFAULT_LOGO_DEV_KEY;

const getTiingoKeys = () => {
    const userKeys = localStorage.getItem('user_tiingo_key');
    if (userKeys) return userKeys.split(',').map(k => k.trim()).filter(k => k);
    return DEFAULT_TIINGO_KEYS;
};

// Finnhub Rotation Logic
let finnhubKeyIndex = 0;
const fetchFinnhub = async (endpoint) => {
    const keys = getFinnhubKeys();
    let attempts = 0;
    const maxAttempts = keys.length * 2; // Allow some retries across keys
    
    while (attempts < maxAttempts) {
        const currentKey = keys[finnhubKeyIndex % keys.length];
        finnhubKeyIndex++; // Rotate to next key for next request
        
        const separator = endpoint.includes('?') ? '&' : '?';
        const url = `https://finnhub.io/api/v1/${endpoint}${separator}token=${currentKey}`;
        
        try {
            const res = await fetch(url);
            if (res.status === 429) {
                // Rate limited - wait briefly then retry with next key
                attempts++;
                await new Promise(r => setTimeout(r, 500 + (attempts * 500)));
                continue;
            }
            if (!res.ok) throw new Error(`Finnhub error: ${res.status}`);
            return await res.json();
        } catch (e) {
            attempts++;
            if (attempts >= maxAttempts) throw e;
            await new Promise(r => setTimeout(r, 200));
        }
    }
};

// --- DEFAULT LAYOUT ---
const DEFAULT_COLUMNS = [
  { id: 'symbol', label: 'Security', width: 200, visible: true },
  { id: 'quantity', label: 'Shares', width: 100, visible: true, align: 'right' },
  { id: 'price', label: 'Mkt Price', width: 100, visible: true, align: 'right' },
  { id: 'currentValue', label: 'Value', width: 120, visible: true, align: 'right' },
  { id: 'yield', label: 'Yield', width: 80, visible: true, align: 'right' },
  { id: 'currentPct', label: 'Weight', width: 80, visible: true, align: 'right' },
  { id: 'targetPct', label: 'Goal %', width: 100, visible: true, align: 'right' },
  { id: 'actualTargetValue', label: 'Goal $', width: 120, visible: true, align: 'right' },
  { id: 'tradeValue', label: 'Trade $', width: 120, visible: true, align: 'right' },
  { id: 'tradeShares', label: 'Trade Shares', width: 160, visible: true, align: 'right' },
];

// --- STYLES ---
const GlobalStyles = () => (
  <style>{`
    input::-webkit-outer-spin-button,
    input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    input[type=number] {
      -moz-appearance: textfield;
    }
    .custom-scrollbar::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: rgba(24, 24, 27, 0.5);
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #3f3f46;
      border-radius: 10px;
      border: 2px solid #18181b;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #52525b;
    }
    .col-resizer {
      position: absolute;
      right: 0;
      top: 0;
      width: 4px;
      height: 100%;
      cursor: col-resize;
      user-select: none;
      touch-action: none;
      opacity: 0;
      transition: opacity 0.2s;
      background: #3b82f6;
    }
    th:hover .col-resizer {
      opacity: 1;
    }
    .gauge-progress {
        transition: stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .gauge-marker {
        transition: transform 1s cubic-bezier(0.4, 0, 0.2, 1);
        transform-origin: 100px 100px;
    }
  `}</style>
);

// --- HELPERS ---

const generateId = () => Math.random().toString(36).substr(2, 9);

const safeSetItem = (key, value) => {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            Object.keys(localStorage).forEach(k => {
                if(k.startsWith('tiingo_')) localStorage.removeItem(k);
            });
            try { localStorage.setItem(key, value); } catch (retryE) {}
        }
    }
};

const trackApiUsage = (key) => {
  try {
    const history = JSON.parse(localStorage.getItem('tiingo_usage_log') || '{}');
    if (!history[key]) history[key] = [];
    history[key].push(Date.now());
    const oneDay = 24 * 60 * 60 * 1000;
    const now = Date.now();
    history[key] = history[key].filter(t => now - t < oneDay);
    safeSetItem('tiingo_usage_log', JSON.stringify(history));
  } catch (e) {}
};

async function callGemini(prompt, systemInstruction = "", isJson = false) {
  const userKey = localStorage.getItem('user_gemini_key');
  let keyToUse = userKey ? userKey.trim() : apiKey;
  
  if (!keyToUse) {
      console.warn("No Gemini API Key found. AI features may fail.");
  }

  const models = [
      "gemini-2.5-flash-preview-09-2025", 
      "gemini-1.5-flash"
  ];

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
    ...(isJson && { generationConfig: { responseMimeType: "application/json" } })
  };

  let lastError = null;

  for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keyToUse}`;
      let delay = 1000;
      
      for (let i = 0; i < 3; i++) { // Retry loop per model
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          if (!response.ok) {
              const errText = await response.text().catch(() => response.statusText);
              if (response.status === 401 || response.status === 403) {
                  throw new Error(`Auth Error (${response.status}): Invalid API Key.`);
              }
              throw new Error(`API Error: ${response.status} ${errText}`);
          }
          
          const data = await response.json();
          return data.candidates?.[0]?.content?.parts?.[0]?.text;
        } catch (err) {
          lastError = err;
          if (err.message.includes("Auth Error")) throw err; // Stop immediately on auth error
          if (i === 2) break; // Try next model
          await new Promise(r => setTimeout(r, delay));
          delay *= 2;
        }
      }
  }
  throw lastError || new Error("All models failed.");
}

const CASH_TICKERS = ["FDRXX", "FCASH", "SPAXX", "CASH", "MMDA", "USD", "CORE", "FZFXX", "SWVXX"];
const COVERED_CALL_TICKERS = ['JEPI', 'JEPQ', 'QYLD', 'XYLD', 'RYLD', 'DIVO', 'GPIX', 'GPIQ', 'SPYI', 'ISPY', 'FEPI', 'SVOL'];
const BENCHMARK_OPTIONS = [
  { id: 'SPY', label: 'S&P 500 (SPY)', components: { SPY: 1 } },
  { id: 'QQQ', label: 'Nasdaq 100 (QQQ)', components: { QQQ: 1 } },
  { id: '90/10', label: '90% S&P 500 / 10% Bond', components: { SPY: 0.9, AGG: 0.1 } },
  { id: '80/20', label: '80% S&P 500 / 20% Bond', components: { SPY: 0.8, AGG: 0.2 } },
  { id: '70/30', label: '70% S&P 500 / 30% Bond', components: { SPY: 0.7, AGG: 0.3 } },
  { id: '60/40', label: '60% S&P 500 / 40% Bond', components: { SPY: 0.6, AGG: 0.4 } },
  { id: '50/50', label: '50% S&P 500 / 50% Bond', components: { SPY: 0.5, AGG: 0.5 } },
];
const TIME_RANGES = [
    { label: '1M', days: 30 }, { label: '3M', days: 90 }, { label: '6M', days: 180 },
    { label: 'YTD', days: 'ytd' }, { label: '1Y', days: 365 }, { label: '3Y', days: 365 * 3 },
    { label: '5Y', days: 365 * 5 }, { label: 'Custom', days: 'Custom' },
];

const isBond = (symbol, description) => {
    if (!description) return false;
    const bondPattern = /\d+\.?\d*%\s+\d{2}\/\d{2}\/\d{4}/;
    const isCusip = symbol && symbol.length === 9 && /^[0-9A-Z]+$/.test(symbol);
    const hasBondKeywords = description.includes(" BDS ") || description.includes(" NOTE ") || description.includes(" CORP ") || description.includes(" MUNI ");
    return bondPattern.test(description) || (isCusip && hasBondKeywords);
};

const isCoveredCall = (p) => {
    if (COVERED_CALL_TICKERS.includes(p.symbol)) return true;
    const desc = (p.description || "").toUpperCase();
    return desc.includes('COVERED CALL') || desc.includes('BUYWRITE') || desc.includes('OPTION INCOME');
};

const parseFidelityCSV = (text) => {
    const lines = text.split(/\r?\n/);
    let startIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("Security ID") && lines[i].includes("Quantity")) {
            startIndex = i;
            break;
        }
    }
    if (startIndex === -1) return [];

    const headers = lines[startIndex].split(',').map(h => h.trim());
    const symIdx = headers.findIndex(h => h.includes("Security ID"));
    const qtyIdx = headers.findIndex(h => h.includes("Quantity"));
    const descIdx = headers.findIndex(h => h.includes("Security Description"));
    const priceIdx = headers.findIndex(h => h.includes("Last Price") || h.includes("Price") || h.includes("Close"));

    const parseLine = (line) => {
        const row = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                row.push(current.trim());
                current = "";
            } else {
                current += char;
            }
        }
        row.push(current.trim());
        return row;
    };

    const results = [];
    for (let i = startIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        const row = parseLine(line);
        if (row.length <= Math.max(symIdx, qtyIdx)) continue;
        const symbol = row[symIdx];
        if (!symbol || symbol === "Pending") continue;
        let qtyStr = row[qtyIdx].replace(/[",]/g, '');
        const quantity = parseFloat(qtyStr);
        if (isNaN(quantity)) continue;
        const desc = descIdx > -1 ? row[descIdx].replace(/^"|"$/g, '') : "";
        const isCash = CASH_TICKERS.some(t => symbol.includes(t)) || desc.toUpperCase().includes("CASH");
        const isFixedIncome = isBond(symbol, desc);
        
        let price = isCash ? 1.0 : 0;
        if (priceIdx > -1 && row[priceIdx]) {
            const pStr = row[priceIdx].replace(/[$,]/g, '');
            const pVal = parseFloat(pStr);
            if (!isNaN(pVal)) price = pVal;
        }

        let val = quantity * price;
        let extractedYield = 0;

        if (isFixedIncome) {
            val = (quantity * price) / 100;
            const yieldMatch = desc.match(/(\d+\.?\d*)%/);
            if (yieldMatch) {
                extractedYield = parseFloat(yieldMatch[1]);
            }
        }

        results.push({
            id: generateId(),
            symbol: symbol,
            description: desc,
            quantity: quantity,
            price: price,
            currentValue: val,
            yield: extractedYield, 
            targetPct: 0,
            roundingMode: 'exact',
            metadata: isFixedIncome ? { assetClass: 'Fixed Income' } : null
        });
    }
    return results;
};

const formatCurrency = (val) => {
  const num = Number(val);
  if (isNaN(num) || num === 0) return '$0.00';
  const str = Math.abs(num).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (num < 0 ? '-$' : '$') + str;
};

const formatPercent = (val) => (Number(val) * 100).toFixed(2) + '%';
const formatQuantity = (val) => Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

// --- UTILITY COMPONENTS ---

const Button = ({ children, variant = 'primary', size = 'md', onClick, className = '', disabled = false, loading = false }) => {
  const base = "inline-flex items-center justify-center font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20",
    secondary: "bg-zinc-900 text-zinc-100 hover:bg-zinc-800 border border-zinc-800",
    ghost: "text-zinc-600 hover:text-white hover:bg-zinc-900",
    sparkle: "bg-gradient-to-br from-indigo-500 to-blue-600 text-white hover:opacity-90 shadow-lg shadow-indigo-600/20"
  };
  return (
    <button className={`${base} ${variants[variant]} ${size === 'icon' ? 'p-2' : 'px-4 py-2 text-sm'} ${className}`} onClick={onClick} disabled={disabled || loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
};

const Card = ({ children, className = "", title, icon: Icon, onClick }) => (
  <div onClick={onClick} className={`bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col transition-colors ${onClick ? 'cursor-pointer hover:border-zinc-600' : ''} ${className}`}>
    {(title || Icon) && (
      <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/50 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-zinc-500" />}
        <span className="text-[10px] font-black uppercase tracking-[0.1em] text-zinc-500">{title}</span>
      </div>
    )}
    <div className="p-4 flex-1">{children}</div>
  </div>
);

// Map common bond issuer names to their stock tickers for logo retrieval
const BOND_ISSUERS = {
  "WELLS FARGO": "WFC", "JPMORGAN": "JPM", "J P MORGAN": "JPM", "BANK OF AMERICA": "BAC", 
  "GOLDMAN SACHS": "GS", "GOLDMAN": "GS", "MORGAN STANLEY": "MS", "CITIGROUP": "C", 
  "CITI": "C", "BLACKROCK": "BLK", "BERKSHIRE": "BRK.B", "CHARLES SCHWAB": "SCHW", 
  "AMERICAN EXPRESS": "AXP", "VISA": "V", "MASTERCARD": "MA", "CAPITAL ONE": "COF", 
  "US BANCORP": "USB", "PNC": "PNC", "TRUIST": "TFC", "HSBC": "HSBC", "BARCLAYS": "BCS", 
  "UBS": "UBS", "DEUTSCHE BANK": "DB", "ROYAL BANK OF CANADA": "RY", "TORONTO DOMINION": "TD",
  "APPLE": "AAPL", "MICROSOFT": "MSFT", "AMAZON": "AMZN", "ALPHABET": "GOOGL", 
  "GOOGLE": "GOOGL", "META": "META", "FACEBOOK": "META", "NVIDIA": "NVDA", 
  "INTEL": "INTC", "AMD": "AMD", "ADVANCED MICRO": "AMD", "MICROCHIP": "MCHP", 
  "BROADCOM": "AVGO", "QUALCOMM": "QCOM", "TEXAS INSTRUMENTS": "TXN", "ORACLE": "ORCL", 
  "IBM": "IBM", "CISCO": "CSCO", "SALESFORCE": "CRM", "ADOBE": "ADBE", "INTUIT": "INTU", 
  "PAYPAL": "PYPL", "SERVICENOW": "NOW", "NETFLIX": "NFLX", "TAKE-TWO": "TTWO", 
  "LEIDOS": "LDOS", "BOOZ ALLEN": "BAH", "UBER": "UBER", "AT&T": "T", "VERIZON": "VZ", 
  "T-MOBILE": "TMUS", "COMCAST": "CMCSA", "CHARTER": "CHTR", "DISNEY": "DIS", 
  "WARNER BROS": "WBD", "PARAMOUNT": "PARA", "UNITEDHEALTH": "UNH", "CVS": "CVS", 
  "ELEVANCE": "ELV", "ANTHEM": "ELV", "CIGNA": "CI", "PFIZER": "PFE", 
  "JOHNSON & JOHNSON": "JNJ", "JOHNSON": "JNJ", "ABBVIE": "ABBV", "MERCK": "MRK", 
  "BRISTOL-MYERS": "BMY", "BRISTOL MYERS": "BMY", "AMGEN": "AMGN", "GILEAD": "GILD", 
  "ELI LILLY": "LLY", "LILLY": "LLY", "THERMO FISHER": "TMO", "DANAHER": "DHR", 
  "ABBOTT": "ABT", "STRYKER": "SYK", "MEDTRONIC": "MDT", "BECTON DICKINSON": "BDX", 
  "BOSTON SCIENTIFIC": "BSX", "WALMART": "WMT", "COSTCO": "COST", "TARGET": "TGT", 
  "HOME DEPOT": "HD", "LOWE'S": "LOW", "MCDONALD": "MCD", "STARBUCKS": "SBUX", 
  "NIKE": "NKE", "PROCTER & GAMBLE": "PG", "P&G": "PG", "PEPSICO": "PEP", 
  "COCA-COLA": "KO", "PHILIP MORRIS": "PM", "ALTRIA": "MO", "COLGATE": "CL", 
  "ESTEE LAUDER": "EL", "GENERAL MOTORS": "GM", "GM ": "GM", "FORD": "F", 
  "TESLA": "TSLA", "TOYOTA": "TM", "HONDA": "HMC", "BOEING": "BA", "LOCKHEED": "LMT", 
  "RAYTHEON": "RTX", "NORTHROP": "NOC", "GENERAL DYNAMICS": "GD", "L3HARRIS": "LHX", 
  "HONEYWELL": "HON", "GENERAL ELECTRIC": "GE", "CATERPILLAR": "CAT", "DEERE": "DE", 
  "3M": "MMM", "UPS": "UPS", "UNITED PARCEL": "UPS", "FEDEX": "FDX", "UNION PACIFIC": "UNP", 
  "CSX": "CSX", "EXXON": "XOM", "CHEVRON": "CVX", "CONOCOPHILLIPS": "COP", 
  "SCHLUMBERGER": "SLB", "EOG": "EOG", "MARATHON": "MPC", "PHILLIPS 66": "PSX", 
  "VALERO": "VLO", "OCCIDENTAL": "OXY", "KINDER MORGAN": "KMI", "WILLIAMS COS": "WMB", 
  "ENTERPRISE PRODUCTS": "EPD", "ENERGY TRANSFER": "ET", "NEXTERA": "NEE", 
  "DUKE ENERGY": "DUK", "SOUTHERN CO": "SO", "DOMINION": "D", "EXELON": "EXC", 
  "AMERICAN ELECTRIC": "AEP", "SEMPI": "SRE", "PACIFIC GAS": "PCG", "CONSOLIDATED EDISON": "ED", 
  "PUBLIC SERVICE": "PEG", "TREASURY": "GOVT", "UNITED STATES TREAS": "GOVT", 
  "US TREASURY": "GOVT", "FANNIE MAE": "FNMA", "FREDDIE MAC": "FMCC"
};

const CompanyLogo = React.memo(({ symbol, description, logoTicker, stateCode, isLoading, className = "" }) => {
  const [error, setError] = useState(false);
    
  useEffect(() => {
      setError(false);
  }, [symbol, logoTicker]);

  const displaySymbol = useMemo(() => {
      if (logoTicker) return logoTicker;
      if (!symbol) return null;
      
      const isPotentialBond = symbol.length === 9 && /^[0-9A-Z]+$/.test(symbol);
      if (isPotentialBond && description) {
          const upperDesc = description.toUpperCase();
          for (const [key, ticker] of Object.entries(BOND_ISSUERS)) {
              if (upperDesc.includes(key)) return ticker;
          }
      }
      return symbol;
  }, [symbol, description, logoTicker]);

  const isCash = symbol && CASH_TICKERS.some(t => symbol.toUpperCase().includes(t));
  const isBondLike = symbol && symbol.length === 9 && /^[0-9A-Z]+$/.test(symbol);

  if (isLoading && isBondLike && !logoTicker && !stateCode && !isCash) {
       return (
            <div className={`flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-lg flex-shrink-0 ${className}`}>
                <Sparkles className="h-4 w-4 text-blue-500 animate-pulse" />
            </div>
       );
  }

  if (stateCode) {
      return (
        <div className={`flex items-center justify-center bg-teal-950 text-teal-400 rounded-lg border border-teal-500/30 flex-shrink-0 relative overflow-hidden group ${className}`}>
            <div className="relative flex items-center justify-center">
                <MapPin className="h-6 w-6 text-teal-500 fill-teal-950/50" strokeWidth={1.5} />
                <span className="absolute text-[8px] font-black tracking-tighter text-white -mt-1">{stateCode}</span>
            </div>
        </div>
      );
  }

  if (!symbol) return null;
    
  if (error || isCash) {
      return (
        <div className={`flex items-center justify-center bg-zinc-800 text-[10px] font-bold text-zinc-400 rounded-lg border border-zinc-700/50 flex-shrink-0 ${className}`}>
            {isBondLike ? <Landmark className="h-4 w-4 opacity-50" /> : symbol.slice(0, 3)}
        </div>
      );
  }

  return (
    <div className={`bg-white rounded-lg flex items-center justify-center overflow-hidden border border-zinc-700/50 shadow-sm flex-shrink-0 ${className}`}>
        <img 
            src={`https://img.logo.dev/ticker/${displaySymbol}?token=${getLogoDevKey()}`} 
            onError={() => setError(true)} 
            alt={symbol} 
            className="w-full h-full object-contain" 
        />
    </div>
  );
});

const Gauge = ({ value, max, label, subLabel }) => {
  const radius = 30;
  const stroke = 6; const circumference = 2 * Math.PI * radius; const arcLength = circumference * 0.75;
  const percentage = Math.min(Math.max(value, 0), max) / max;
  let color = percentage > 0.85 ? "#ef4444" : percentage > 0.6 ? "#eab308" : "#22c55e";
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-20 w-20 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-[225deg]" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="#27272a" strokeWidth={stroke} strokeDasharray={`${arcLength} ${circumference}`} strokeLinecap="round" />
          <circle cx="40" cy="40" r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${arcLength} ${circumference}`} strokeDashoffset={arcLength - (percentage * arcLength)} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-2"><span className="text-xl font-black text-white leading-none">{value}</span><span className="text-[9px] text-zinc-500 font-bold uppercase">/ {max}</span></div>
      </div>
      <div className="text-center mt-1"><div className="text-[10px] font-black uppercase text-zinc-400">{label}</div><div className="text-[9px] text-zinc-600">{subLabel}</div></div>
    </div>
  );
};

const SleekGauge = ({ value, target, label, subLabel, color }) => {
    const radius = 80;
    const stroke = 12;
    const startAngle = -220;
    const endAngle = 40;
    const totalAngle = endAngle - startAngle;
    
    const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
        const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
        return {
            x: centerX + (radius * Math.cos(angleInRadians)),
            y: centerY + (radius * Math.sin(angleInRadians))
        };
    };

    const describeArc = (x, y, radius, startAngle, endAngle) => {
        const start = polarToCartesian(x, y, radius, endAngle);
        const end = polarToCartesian(x, y, radius, startAngle);
        const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
        return [
            "M", start.x, start.y, 
            "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
        ].join(" ");
    };

    const pct = Math.min(Math.max(value, 0), 100);
    const progressAngle = startAngle + (totalAngle * (pct / 100));
    
    const needleAngle = Math.min(Math.max(startAngle + (totalAngle * (value/100)), startAngle), endAngle);
    
    const markerPos = polarToCartesian(100, 100, radius, needleAngle);
    const markerInner = polarToCartesian(100, 100, radius - (stroke / 2), needleAngle);
    const markerOuter = polarToCartesian(100, 100, radius + (stroke / 2), needleAngle);

    const targetAngle = Math.min(Math.max(startAngle + (totalAngle * (target/100)), startAngle), endAngle);
    const targetPos = polarToCartesian(100, 100, radius, targetAngle);
    const targetInnerLine = polarToCartesian(100, 100, radius - 15, targetAngle);

    const gradients = {
        pink: ['#FF0055', '#FF00AA'],
        purple: ['#8800FF', '#AA00FF'],
        blue: ['#0088FF', '#00AAFF'],
        cyan: ['#00FFFF', '#00FFAA']
    };
    const [startColor, endColor] = gradients[color] || gradients.blue;

    return (
        <div className="flex flex-col items-center justify-center p-4">
            <div className="relative w-[200px] h-[120px] flex justify-center">
                <svg width="200" height="150" viewBox="0 0 200 150" className="overflow-visible">
                    <defs>
                        <linearGradient id={`grad-${label}`} x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor={startColor} />
                            <stop offset="100%" stopColor={endColor} />
                        </linearGradient>
                        <filter id="glow">
                            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                            <feMerge>
                                <feMergeNode in="coloredBlur"/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                    </defs>

                    <path 
                        d={describeArc(100, 100, radius, startAngle, endAngle)} 
                        fill="none" 
                        stroke="#18181b" 
                        strokeWidth={stroke} 
                        strokeLinecap="round" 
                    />

                    <path 
                        d={describeArc(100, 100, radius, startAngle, progressAngle)} 
                        fill="none" 
                        stroke={`url(#grad-${label})`} 
                        strokeWidth={stroke} 
                        strokeLinecap="round"
                        className="gauge-progress"
                        filter="url(#glow)"
                    />

                    {target > 0 && (
                          <line 
                            x1={targetInnerLine.x} y1={targetInnerLine.y} 
                            x2={targetPos.x} y2={targetPos.y} 
                            stroke="white" 
                            strokeWidth="2"
                            opacity="0.6"
                        />
                    )}

                    <line 
                        x1={markerInner.x} y1={markerInner.y} 
                        x2={markerOuter.x} y2={markerOuter.y} 
                        stroke="white" 
                        strokeWidth="4" 
                        className="gauge-marker"
                        strokeLinecap="butt"
                    />
                    
                    {Array.from({length: 9}).map((_, i) => {
                        const tickAngle = startAngle + (totalAngle * (i / 8));
                        const p1 = polarToCartesian(100, 100, radius + 18, tickAngle);
                        const p2 = polarToCartesian(100, 100, radius + 24, tickAngle);
                        return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#3f3f46" strokeWidth="2" opacity="0.5" />;
                    })}

                    <text x="100" y="105" textAnchor="middle" fill="white" fontSize="42" fontWeight="900" fontFamily="monospace" letterSpacing="-2px">
                        {Math.round(value)}%
                    </text>
                </svg>
            </div>
            
            <div className="text-center mt-0 w-full relative z-10">
                <div className="flex items-center justify-center gap-2 mb-1">
                    <div className={`h-2 w-2 rounded-full`} style={{ background: startColor }} />
                    <span className="text-xs font-black uppercase tracking-widest text-zinc-400">{label}</span>
                </div>
                {subLabel}
            </div>
        </div>
    );
};

const TargetAllocator = ({ positions, client, onUpdateClient }) => {
    const [targets, setTargets] = useState(client.allocationTargets || {
        equity: 40,
        fixedIncome: 20,
        coveredCall: 20,
        cash: 20
    });

    const hiddenBuckets = client.settings?.hiddenBuckets || [];

    const handleTargetChange = (key, value) => {
        const newTargets = { ...targets, [key]: parseFloat(value) || 0 };
        setTargets(newTargets);
        onUpdateClient({ ...client, allocationTargets: newTargets });
    };

    const stats = useMemo(() => {
        let equity = 0;
        let fixedIncome = 0;
        let coveredCall = 0;
        let cash = 0;
        
        const total = positions.reduce((sum, p) => sum + (Number(p.currentValue) || 0), 0);
        
        positions.forEach(p => {
            const val = Number(p.currentValue) || 0;
            const isC = CASH_TICKERS.some(t => p.symbol.toUpperCase().includes(t)) || p.metadata?.assetClass === 'Cash';
            const isFi = p.metadata?.assetClass === 'Fixed Income' || p.metadata?.assetClass === 'Municipal Bond' || isBond(p.symbol, p.description);
            const isCc = isCoveredCall(p);
            
            if (isC) cash += val;
            else if (isCc) coveredCall += val;
            else if (isFi) fixedIncome += val;
            else equity += val; 
        });
        
        return {
            total,
            values: { equity, fixedIncome, coveredCall, cash },
            percents: {
                equity: total > 0 ? (equity / total) * 100 : 0,
                fixedIncome: total > 0 ? (fixedIncome / total) * 100 : 0,
                coveredCall: total > 0 ? (coveredCall / total) * 100 : 0,
                cash: total > 0 ? (cash / total) * 100 : 0,
            }
        };
    }, [positions]);

    const buckets = [
        { id: 'equity', label: 'Equities', color: 'pink' },
        { id: 'fixedIncome', label: 'Bonds', color: 'purple' },
        { id: 'coveredCall', label: 'Covered Call', color: 'blue' },
        { id: 'cash', label: 'Cash', color: 'cyan' },
    ];

    const visibleBuckets = buckets.filter(b => !hiddenBuckets.includes(b.id));
    const totalTargetSum = visibleBuckets.reduce((sum, b) => sum + (targets[b.id] || 0), 0);
    const remaining = 100 - totalTargetSum;

    const calculateDelta = (key) => {
        const targetVal = stats.total * (targets[key] / 100);
        const currentVal = stats.values[key];
        return targetVal - currentVal;
    };

    return (
        <div className="p-8 mb-8 bg-zinc-950 border-b border-zinc-800">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
                <div>
                    <h3 className="text-2xl font-black text-white tracking-tighter flex items-center gap-2">
                         <Target className="h-6 w-6 text-blue-500" />
                        Portfolio Targets
                    </h3>
                    <p className="text-zinc-500 text-xs mt-1 font-medium italic">Adjust target class weights to view rebalance required.</p>
                </div>

                <div className="flex items-center gap-6 p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800/80 shadow-inner">
                    <div className="flex flex-col gap-1 pr-6 border-r border-zinc-800">
                        <div className="flex items-center gap-2">
                            <div className={`h-2.5 w-2.5 rounded-full ${Math.abs(remaining) < 0.05 ? 'bg-green-500' : 'bg-orange-500'} shadow-lg`} />
                            <span className={`text-sm font-black uppercase tracking-widest ${Math.abs(remaining) < 0.05 ? 'text-green-400' : 'text-zinc-300'}`}>
                                Total: {totalTargetSum.toFixed(1)}%
                            </span>
                        </div>
                        <p className={`text-[10px] font-bold uppercase tracking-tight ${remaining > 0 ? 'text-blue-400' : remaining < 0 ? 'text-red-400' : 'text-green-500'}`}>
                            {remaining > 0 ? `+${remaining.toFixed(1)}% Needed` : remaining < 0 ? `${Math.abs(remaining).toFixed(1)}% Excess` : 'Perfectly Balanced'}
                        </p>
                    </div>
                    <div className="w-32 h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/50">
                        <div 
                            className={`h-full transition-all duration-700 ease-out ${totalTargetSum > 100 ? 'bg-red-500' : totalTargetSum === 100 ? 'bg-green-500' : 'bg-blue-600'}`} 
                            style={{ width: `${Math.min(totalTargetSum, 100)}%` }} 
                        />
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap justify-center gap-8">
                {visibleBuckets.map(bucket => {
                    const currentPct = stats.percents[bucket.id];
                    const delta = calculateDelta(bucket.id);
                    return (
                        <div key={bucket.id} className="flex flex-col items-center group w-full md:w-auto max-w-[250px]">
                            <SleekGauge 
                                value={currentPct} 
                                target={targets[bucket.id]} 
                                label={bucket.label} 
                                color={bucket.color}
                                subLabel={
                                    <div className={`text-[10px] font-mono font-black mt-1 py-1 px-2 rounded bg-zinc-900/50 ${delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-zinc-600'}`}>
                                        {delta > 0 ? '+' : ''}{formatCurrency(delta)}
                                    </div>
                                }
                            />
                            <div className="mt-2 w-full px-12">
                                <div className="relative bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden group-hover:border-zinc-500 transition-colors focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/20">
                                    <input 
                                        type="number" 
                                        className="w-full bg-transparent p-2 text-center text-white font-mono font-bold text-sm focus:outline-none"
                                        value={targets[bucket.id]} 
                                        onChange={e => handleTargetChange(bucket.id, e.target.value)} 
                                    />
                                    <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <label className="block text-[8px] font-black uppercase text-zinc-600 mt-1 text-center tracking-widest">Goal Class %</label>
                            </div>
                        </div>
                    );
                })}
                {visibleBuckets.length === 0 && (
                     <div className="flex flex-col items-center justify-center p-12 text-zinc-500">
                         <Info className="h-8 w-8 mb-2 opacity-50"/>
                         <p className="text-sm font-bold">All Asset Classes Hidden</p>
                         <p className="text-xs">Adjust visibility in settings.</p>
                     </div>
                )}
            </div>
        </div>
    );
};
// --- CORE DASHBOARD PIECES ---

const StyleBox = ({ data }) => {
  const rows = ['Large', 'Mid', 'Small'];
  const cols = ['Value', 'Core', 'Growth'];
  
  const rowDisplay = { 'Large': 'Large', 'Mid': 'Medium', 'Small': 'Small' };
  const colDisplay = { 'Value': 'Value', 'Core': 'Blend', 'Growth': 'Growth' };

  return (
    <div className="flex items-start gap-3 w-full max-w-[260px] mx-auto p-2">
      <div className="flex flex-col justify-between py-1 h-full min-h-[140px] text-[9px] font-black text-zinc-500 uppercase tracking-widest text-right">
        {rows.map(r => <div key={r} className="flex-1 flex items-center justify-end">{rowDisplay[r]}</div>)}
        <div className="h-5"></div> 
      </div>

      <div className="flex-1 flex flex-col gap-2 h-full">
        <div className="grid grid-cols-3 grid-rows-3 gap-px bg-zinc-800 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl aspect-square w-full">
          {rows.map(row => 
            cols.map(col => {
              const key = `${row}-${col}`;
              const val = data?.[key] || 0;
              const opacity = Math.min(val * 2.5, 1);
              const isSignificant = val > 0.01;
              
              return (
                <div key={key} className="relative bg-zinc-900/80 flex items-center justify-center group">
                  {isSignificant && (
                    <div 
                      className="absolute inset-0 bg-blue-600 transition-all duration-500" 
                      style={{ opacity: Math.max(opacity, 0.1) }} 
                    />
                  )}
                  <span className={`relative z-10 text-xs font-mono font-bold ${val > 0.15 ? 'text-white' : isSignificant ? 'text-zinc-300' : 'text-zinc-700'}`}>
                    {Math.round(val * 100)}%
                  </span>
                </div>
              );
            })
          )}
        </div>
        <div className="grid grid-cols-3 text-center text-[9px] font-black text-zinc-500 uppercase tracking-widest">
          {cols.map(c => <span key={c}>{colDisplay[c]}</span>)}
        </div>
      </div>
    </div>
  );
};

const Toggle = ({ value, onChange, options }) => (
    <div className="flex bg-zinc-950 p-0.5 rounded-lg mb-3 border border-zinc-800">
        {options.map(opt => (
            <button
                key={opt}
                onClick={() => onChange(opt)}
                className={`flex-1 px-2 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-md transition-all ${value === opt ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
                {opt}
            </button>
        ))}
    </div>
);

const AnalyticsDashboard = ({ positions, client, onUpdateClient }) => {
  const [sectorView, setSectorView] = useState('Equity');
  const [geoView, setGeoView] = useState('Equity');
  
  const ASSET_CLASSES = ["U.S. Equity", "Non-U.S. Equity", "Fixed Income", "Other", "Not Classified"];

  const stats = useMemo(() => {
    const invested = positions.filter(p => {
        const s = p.symbol.toUpperCase();
        return !CASH_TICKERS.some(t => s.includes(t)) && 
               !(p.description && p.description.toUpperCase().includes('CASH')) &&
               p.metadata?.assetClass !== 'Cash';
    });

    const totalVal = invested.reduce((sum, p) => sum + (Number(p.currentValue) || 0), 0);
    
    const equities = [];
    const fixedIncome = [];
    let equityTotal = 0;
    let fiTotal = 0;

    invested.forEach(p => {
        const isFi = p.metadata?.assetClass === 'Fixed Income' || p.metadata?.assetClass === 'Municipal Bond' || isBond(p.symbol, p.description);
        if (isFi) {
            fixedIncome.push(p);
            fiTotal += (Number(p.currentValue) || 0);
        } else {
            equities.push(p);
            equityTotal += (Number(p.currentValue) || 0);
        }
    });

    const aggregate = (assets, total, key) => {
        const res = {};
        assets.forEach(p => {
            const k = p.metadata?.[key] || 'Unclassified';
            const w = total > 0 ? (Number(p.currentValue) || 0) / total : 0;
            res[k] = (res[k] || 0) + w;
        });
        return res;
    };

    const allocation = ASSET_CLASSES.reduce((acc, curr) => ({ ...acc, [curr]: 0 }), {});
    invested.forEach(p => {
        const k = p.metadata?.assetClass || 'Not Classified';
        const w = totalVal > 0 ? (Number(p.currentValue) || 0) / totalVal : 0;
        allocation[k] = (allocation[k] || 0) + w;
    });

    return { 
        allocation, 
        styleBox: aggregate(equities, equityTotal, 'style'), 
        sectors: {
            Equity: aggregate(equities, equityTotal, 'sector'),
            'Fixed Income': aggregate(fixedIncome, fiTotal, 'sector')
        },
        countries: {
            Equity: aggregate(equities, equityTotal, 'country'),
            'Fixed Income': aggregate(fixedIncome, fiTotal, 'country')
        },
        totalVal 
    };
  }, [positions]);

  return (
    <div className="flex flex-col bg-zinc-950">
      <TargetAllocator positions={positions} client={client} onUpdateClient={onUpdateClient} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-8 border-b border-zinc-800">
        <Card title="Asset Distribution" icon={PieIcon}>
            <div className="space-y-3">
            {ASSET_CLASSES.map(k => (
                <div key={k} className="flex justify-between text-xs items-center">
                <span className="text-zinc-500 font-medium">{k}</span>
                <div className="flex items-center gap-3">
                    <div className="w-24 h-1 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${(stats.allocation[k] || 0) * 100}%` }} /></div>
                    <span className="font-mono w-12 text-right text-white font-bold">{((stats.allocation[k] || 0) * 100).toFixed(1)}%</span>
                </div>
                </div>
            ))}
            </div>
        </Card>
        <Card title="Equity Style Grid" icon={LayoutGrid}>
            <div className="h-full flex items-center justify-center relative">
                <StyleBox data={stats.styleBox} />
                <div className="absolute top-0 right-0 text-[9px] text-zinc-600 font-black uppercase tracking-widest opacity-50">Equity Only</div>
            </div>
        </Card>
        <Card title="Sector Exposure" icon={PieChart}>
            <div className="flex flex-col h-full">
                <Toggle value={sectorView} onChange={setSectorView} options={['Equity', 'Fixed Income']} />
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-2 custom-scrollbar flex-1">
                {Object.entries(stats.sectors[sectorView]).sort((a,b) => b[1]-a[1]).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-[11px] py-1 border-b border-zinc-800/30 last:border-0"><span className="text-zinc-500 font-medium truncate max-w-[140px]">{k}</span><span className="font-mono text-zinc-200 font-bold">{(v * 100).toFixed(1)}%</span></div>
                ))}
                {Object.keys(stats.sectors[sectorView]).length === 0 && <div className="text-center text-zinc-600 text-[10px] mt-4 italic">No {sectorView} assets found.</div>}
                </div>
            </div>
        </Card>
        <Card title="Geo Concentration" icon={Globe}>
            <div className="flex flex-col h-full">
                <Toggle value={geoView} onChange={setGeoView} options={['Equity', 'Fixed Income']} />
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-2 custom-scrollbar flex-1">
                {Object.entries(stats.countries[geoView]).sort((a,b) => b[1]-a[1]).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-[11px] py-1 border-b border-zinc-800/30 last:border-0"><span className="text-zinc-500 font-medium truncate max-w-[140px]">{k}</span><span className="font-mono text-zinc-200 font-bold">{(v * 100).toFixed(1)}%</span></div>
                ))}
                {Object.keys(stats.countries[geoView]).length === 0 && <div className="text-center text-zinc-600 text-[10px] mt-4 italic">No {geoView} assets found.</div>}
                </div>
            </div>
        </Card>
      </div>
    </div>
  );
};

const ApiKeyManager = ({ keys, onChange, label, placeholder }) => {
    const [newKey, setNewKey] = useState("");
    const handleAdd = () => {
        if (newKey.trim()) {
            onChange([...keys, newKey.trim()]);
            setNewKey("");
        }
    };

    const handleRemove = (index) => {
        onChange(keys.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-3">
            <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}</label>
            <div className="space-y-2">
                {keys.map((k, i) => (
                    <div key={i} className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 group">
                        <div className="h-2 w-2 rounded-full bg-blue-500/50" />
                        <span className="flex-1 font-mono text-xs text-zinc-300 truncate">{k}</span>
                        <button onClick={() => handleRemove(i)} className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
            </div>
            <div className="flex gap-2">
                <input 
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white text-xs font-mono focus:outline-none focus:border-blue-500 transition-colors" 
                    value={newKey} 
                    onChange={e => setNewKey(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder={placeholder} 
                />
                <button onClick={handleAdd} className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl w-12 flex items-center justify-center transition-colors border border-zinc-700">
                    <Plus className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
};

const GlobalSettingsModal = ({ onClose }) => {
    const [finnhubKeys, setFinnhubKeys] = useState(() => {
        const stored = localStorage.getItem('user_finnhub_key');
        return stored ? stored.split(',').filter(k => k.trim()) : [];
    });
    const [logoDev, setLogoDev] = useState(localStorage.getItem('user_logo_dev_key') || '');
    const [tiingoKeys, setTiingoKeys] = useState(() => {
        const stored = localStorage.getItem('user_tiingo_key');
        return stored ? stored.split(',').filter(k => k.trim()) : [];
    });
    const [geminiKey, setGeminiKey] = useState(localStorage.getItem('user_gemini_key') || '');

    const handleSave = () => {
        if (finnhubKeys.length > 0) localStorage.setItem('user_finnhub_key', finnhubKeys.join(','));
        else localStorage.removeItem('user_finnhub_key');

        if (logoDev) localStorage.setItem('user_logo_dev_key', logoDev);
        else localStorage.removeItem('user_logo_dev_key');

        if (tiingoKeys.length > 0) localStorage.setItem('user_tiingo_key', tiingoKeys.join(','));
        else localStorage.removeItem('user_tiingo_key');

        if (geminiKey) localStorage.setItem('user_gemini_key', geminiKey);
        else localStorage.removeItem('user_gemini_key');
        
        window.location.reload(); 
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-md w-full shadow-2xl relative max-w-md">
                <button onClick={onClose} className="absolute top-6 right-6 text-zinc-500 hover:text-white"><X className="h-6 w-6" /></button>
                <div className="mb-6">
                    <h3 className="text-xl font-black text-white flex items-center gap-2 tracking-tight">
                        <Key className="h-5 w-5 text-blue-500"/> API Configuration
                    </h3>
                    <p className="text-zinc-500 text-xs mt-1 font-medium">Enter your personal API keys to power the app.</p>
                </div>
                <div className="space-y-6">
                    <ApiKeyManager 
                        label="Finnhub API Keys" 
                        placeholder="Add Finnhub Key..." 
                        keys={finnhubKeys} 
                        onChange={setFinnhubKeys} 
                    />
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Logo.dev API Key</label>
                        <input className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white text-xs font-mono focus:outline-none focus:border-blue-500" value={logoDev} onChange={e => setLogoDev(e.target.value)} placeholder="Default used if empty" />
                    </div>
                    <ApiKeyManager 
                        label="Tiingo API Keys" 
                        placeholder="Add Tiingo Key..." 
                        keys={tiingoKeys} 
                        onChange={setTiingoKeys} 
                    />
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Gemini API Key (AI Features)</label>
                        <input className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white text-xs font-mono focus:outline-none focus:border-blue-500" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} placeholder="System default used if empty" />
                    </div>
                </div>
                <div className="mt-8">
                    <Button variant="primary" onClick={handleSave} className="w-full rounded-xl py-3 h-12">Save & Reload</Button>
                </div>
            </div>
        </div>
    );
};

const ApiUsageModal = ({ onClose }) => {
  const [usage, setUsage] = useState({});
  useEffect(() => {
    const raw = JSON.parse(localStorage.getItem('tiingo_usage_log') || '{}');
    const now = Date.now();
    const stats = {};
    getTiingoKeys().forEach((key, idx) => {
        const timestamps = raw[key] || [];
        stats[key] = { hourly: timestamps.filter(t => now - t < 3600000).length, daily: timestamps.filter(t => now - t < 86400000).length };
    });
    setUsage(stats);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-4xl w-full shadow-2xl relative">
            <button onClick={onClose} className="absolute top-6 right-6 text-zinc-500 hover:text-white"><X className="h-6 w-6" /></button>
            <div className="mb-8 border-b border-zinc-800 pb-4"><h3 className="text-2xl font-black text-white tracking-tighter mb-1 flex items-center gap-2"><Activity className="h-6 w-6 text-blue-500" /> API Health Monitor</h3><p className="text-zinc-500 text-sm font-medium">Real-time quota tracking based on local session data.</p></div>
             <div className="grid grid-cols-5 gap-4">
                {getTiingoKeys().map((key, idx) => {
                    const stat = usage[key] || { hourly: 0, daily: 0 };
                    return (
                        <div key={idx} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex flex-col items-center">
                            <Gauge value={stat.hourly} max={50} label={`Key ${idx + 1}`} subLabel="Hourly Limit" />
                            <div className="mt-4 w-full bg-zinc-900 rounded-lg p-2 flex justify-between items-center text-[10px]"><span className="text-zinc-500 font-bold">24H</span><span className="text-zinc-300 font-mono">{stat.daily} / 1000</span></div>
                        </div>
                    );
                })}
            </div>
        </div>
    </div>
  );
};

const SettingsModal = ({ layout, onUpdateLayout, hiddenBuckets = [], onToggleBucket, onClose }) => {
    const [activeTab, setActiveTab] = useState('columns');
    const toggleCol = (id) => {
        const next = layout.map(col => col.id === id ? { ...col, visible: !col.visible } : col);
        onUpdateLayout(next);
    };

    const moveCol = (index, direction) => {
        const next = [...layout];
        const newIndex = index + direction;
        if (newIndex >= 0 && newIndex < layout.length) {
            [next[index], next[newIndex]] = [next[newIndex], next[index]];
            onUpdateLayout(next);
        }
    };

    const buckets = [
        { id: 'equity', label: 'Equities' },
        { id: 'fixedIncome', label: 'Bonds' },
        { id: 'coveredCall', label: 'Covered Calls' },
        { id: 'cash', label: 'Cash' },
    ];

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-md w-full shadow-2xl relative">
                <button onClick={onClose} className="absolute top-6 right-6 text-zinc-500 hover:text-white"><X className="h-6 w-6" /></button>
                <div className="mb-6">
                    <h3 className="text-xl font-black text-white flex items-center gap-2 tracking-tight">
                        <Settings className="h-5 w-5 text-blue-500"/> Dashboard Settings
                    </h3>
                </div>
                
                <div className="flex p-1 bg-zinc-950 border border-zinc-800 rounded-xl mb-6">
                     <button 
                        onClick={() => setActiveTab('columns')} 
                        className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'columns' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                     >
                         Columns
                     </button>
                     <button 
                        onClick={() => setActiveTab('assets')} 
                        className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'assets' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                     >
                         Asset Classes
                     </button>
                </div>

                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                    {activeTab === 'columns' ? (
                        <>
                            <div className="text-zinc-500 text-xs font-medium mb-3 px-1">Toggle visibility and rearrange columns.</div>
                            {layout.map((col, idx) => (
                                <div 
                                    key={col.id} 
                                    className={`flex items-center gap-2 w-full p-2 rounded-xl border transition-all ${col.visible ? 'bg-zinc-950 border-zinc-800/50' : 'bg-zinc-950/50 border-zinc-800 opacity-60'}`}
                                >
                                    <div className="flex flex-col gap-1">
                                        <button 
                                            disabled={idx === 0}
                                            onClick={() => moveCol(idx, -1)}
                                            className="p-1 hover:text-blue-400 disabled:opacity-20 transition-colors"
                                        >
                                            <ChevronUp className="h-3 w-3" />
                                        </button>
                                        <button 
                                            disabled={idx === layout.length - 1}
                                            onClick={() => moveCol(idx, 1)}
                                            className="p-1 hover:text-blue-400 disabled:opacity-20 transition-colors"
                                        >
                                            <ChevronDown className="h-3 w-3" />
                                        </button>
                                    </div>
                                    <button 
                                        onClick={() => toggleCol(col.id)}
                                        className="flex-1 flex items-center justify-between px-3 py-2 text-left"
                                    >
                                        <span className={`font-bold text-sm ${col.visible ? 'text-zinc-100' : 'text-zinc-500'}`}>{col.label}</span>
                                        {col.visible ? <Check className="h-4 w-4 text-blue-400" /> : <div className="h-4 w-4 rounded-full border border-zinc-700" />}
                                    </button>
                                </div>
                            ))}
                        </>
                    ) : (
                        <>
                            <div className="text-zinc-500 text-xs font-medium mb-3 px-1">Hide unused asset categories from the target allocator.</div>
                            {buckets.map(bucket => {
                                const isHidden = hiddenBuckets.includes(bucket.id);
                                return (
                                    <button
                                        key={bucket.id}
                                        onClick={() => onToggleBucket(bucket.id)}
                                        className={`flex items-center justify-between w-full p-4 rounded-xl border transition-all ${!isHidden ? 'bg-zinc-950 border-zinc-800/50' : 'bg-zinc-950/50 border-zinc-800 opacity-60'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            {!isHidden ? <Eye className="h-4 w-4 text-blue-500" /> : <EyeOff className="h-4 w-4 text-zinc-600" />}
                                            <span className={`font-bold text-sm ${!isHidden ? 'text-zinc-100' : 'text-zinc-500'}`}>{bucket.label}</span>
                                        </div>
                                        {!isHidden && <Check className="h-4 w-4 text-blue-400" />}
                                    </button>
                                );
                            })}
                        </>
                    )}
                </div>
                <div className="mt-6">
                    <Button variant="primary" onClick={onClose} className="w-full rounded-xl py-3 h-12">Done</Button>
                </div>
            </div>
        </div>
    );
};

const InsightsHub = ({ positions }) => {
  const [activeTab, setActiveTab] = useState('news');
  const [insights, setInsights] = useState({ news: null, earnings: [], analysts: {} });
  const [loading, setLoading] = useState(false);
  const nonCashSymbols = useMemo(() => positions.filter(p => !CASH_TICKERS.some(t => p.symbol.includes(t))).map(p => p.symbol), [positions]);

  const fetchData = async () => {
    if (nonCashSymbols.length === 0) return;
    setLoading(true);
    try {
      const nowStr = new Date().toISOString().split('T')[0];
      const calRes = await fetchFinnhub(`calendar/earnings?from=${nowStr}&to=${new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]}`);
      const calData = await calRes;
      
      const newsResults = await Promise.all(nonCashSymbols.slice(0, 3).map(s => fetchFinnhub(`company-news?symbol=${s}&from=${nowStr}&to=${nowStr}`)));
      const newsSummary = newsResults.flat().slice(0, 10).map(n => `[${n.related}] ${n.headline}`).join('\n');
      const aiResponse = await callGemini(`Briefly summarize this news:\n${newsSummary}`, "Senior Financial Analyst. Concise bullet points.", false);
      const analysts = {};
      for (const s of nonCashSymbols.slice(0, 8)) {
        const r = await fetchFinnhub(`stock/recommendation?symbol=${s}`);
        if (r?.[0]) analysts[s] = r[0];
      }
      setInsights({ news: aiResponse, earnings: calData.earningsCalendar || [], analysts });
    } catch (e) {} finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [nonCashSymbols.join(',')]);
  return (
    <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl mb-8 overflow-hidden">
      <div className="flex border-b border-zinc-800 bg-zinc-900/50">
        {[ {id:'news', icon: Newspaper, label:'News'}, {id:'earnings', icon: Calendar, label:'Earnings'}, {id:'analysts', icon: TrendingUp, label:'Analysts'} ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex items-center gap-2 px-6 py-4 text-xs font-black uppercase tracking-widest transition-all ${activeTab === t.id ? 'bg-zinc-950 text-blue-400 border-b-2 border-blue-500' : 'text-zinc-500 hover:text-zinc-300'}`}>
            <t.icon className="h-3.5 w-3.5" />{t.label}
          </button>
        ))}
        <div className="flex-1" /><button onClick={fetchData} className="p-4 text-zinc-600 hover:text-blue-400"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      <div className="p-8 min-h-[160px]">
        {loading ? <div className="h-24 flex items-center justify-center gap-3 text-zinc-500"><Loader2 className="h-5 w-5 animate-spin" /><span className="text-[10px] font-black uppercase tracking-widest">Loading Intelligence...</span></div> : (
          <div className="animate-in fade-in slide-in-from-bottom-2">
            {activeTab === 'news' && <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{insights.news || "No significant updates."}</div>}
            {activeTab === 'earnings' && <div className="grid grid-cols-4 gap-4">{insights.earnings.filter(e => nonCashSymbols.includes(e.symbol)).map(e => <div key={e.symbol} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800"><div className="font-black text-white">{e.symbol}</div><div className="text-xs text-zinc-500">{e.date}</div></div>)}</div>}
            {activeTab === 'analysts' && <div className="grid grid-cols-4 gap-4">{Object.entries(insights.analysts).map(([s, d]) => <div key={s} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800"><div className="font-black text-white">{s}</div><div className="text-[10px] text-zinc-500 mt-1">BUY: {d.buy+d.strongBuy} | HOLD: {d.hold} | SELL: {d.sell}</div></div>)}</div>}
          </div>
        )}
      </div>
    </div>
  );
};

const BacktestModal = ({ model, onClose }) => {
  const [history, setHistory] = useState([]);
  const [benchmark, setBenchmark] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState({ modelReturn: 0, benchReturn: 0, volatility: 0, sharpe: 0 });
  const [progress, setProgress] = useState("");
  const [usingCache, setUsingCache] = useState(false);
  const [failures, setFailures] = useState([]);
  const [hoverData, setHoverData] = useState(null);
    
  const dataCache = useRef({});
  const inFlightRequests = useRef(new Map());
  const keyIndex = useRef(0);
    
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState(model.defaultBenchmark || 'SPY');
  const [selectedRange, setSelectedRange] = useState('1Y');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [assetsLoaded, setAssetsLoaded] = useState(false);

  const filterData = (dataSeries, range, customS, customE) => {
    if (!dataSeries || dataSeries.length === 0) return [];
    let cutoffDate = new Date();
    const today = new Date();
    if (range === 'Custom' && customS) { 
        cutoffDate = new Date(customS);
    } else {
        switch (range) {
            case '1M': cutoffDate.setMonth(today.getMonth() - 1); break;
            case '3M': cutoffDate.setMonth(today.getMonth() - 3); break;
            case '6M': cutoffDate.setMonth(today.getMonth() - 6); break;
            case 'YTD': cutoffDate = new Date(today.getFullYear(), 0, 1); break;
            case '1Y': cutoffDate.setFullYear(today.getFullYear() - 1); break;
            case '3Y': cutoffDate.setFullYear(today.getFullYear() - 3); break;
            case '5Y': cutoffDate.setFullYear(today.getFullYear() - 5); break;
            default: cutoffDate.setFullYear(today.getFullYear() - 1);
        }
    }

    let filtered = dataSeries.filter(d => d.date >= cutoffDate);
    if (range === 'Custom' && customE) { 
        filtered = filtered.filter(d => d.date <= new Date(customE));
    }
    if (filtered.length > 0) {
        const startVal = filtered[0].value;
        filtered = filtered.map(d => ({ ...d, value: d.value / startVal }));
    }
    return filtered;
  };

  const calcMetrics = (modelSeries, benchSeries) => {
    if (!modelSeries || modelSeries.length < 2) return;
    const totalReturn = (modelSeries[modelSeries.length - 1].value - 1) * 100;
    const benchReturn = benchSeries && benchSeries.length > 0 ? (benchSeries[benchSeries.length - 1].value - 1) * 100 : 0;
    const dailyReturns = modelSeries.map((p, i) => i === 0 ? 0 : (p.value / modelSeries[i-1].value) - 1).slice(1);
    const meanReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / dailyReturns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;
    setMetrics({ modelReturn: totalReturn, benchReturn, volatility, sharpe: volatility ? totalReturn / volatility : 0 });
  };

  const fetchTiingo = async (symbol, startTimestamp) => {
    const cleanSymbol = symbol.toUpperCase().replace(/[\.\/]/g, '-');
    if (CASH_TICKERS.some(t => cleanSymbol.includes(t)) || cleanSymbol === 'USD') {
        const now = Math.floor(Date.now() / 1000);
        const start = new Date(startTimestamp * 1000).getTime() / 1000;
        const days = Math.ceil((now - start) / 86400);
        const data = { t: Array.from({length: days}, (_, i) => start + (i * 86400)), c: Array.from({length: days}, () => 1.0) };
        dataCache.current[cleanSymbol] = data;
        return data;
    }
    const cacheKey = `tiingo_${cleanSymbol}_5Y`; 
    if (dataCache.current[cleanSymbol]) return dataCache.current[cleanSymbol];
    if (inFlightRequests.current.has(cacheKey)) return inFlightRequests.current.get(cacheKey);
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
                dataCache.current[cleanSymbol] = parsed.data;
                return parsed.data;
            }
        } catch (e) {}
    }

    const fetchPromise = (async () => {
        let attempts = 0;
        const keys = getTiingoKeys();
        const maxAttempts = keys.length * 2;
        while (attempts < maxAttempts) {
            const currentKey = keys[keyIndex.current % keys.length];
            const startDate = new Date(startTimestamp * 1000).toISOString().split('T')[0];
            const url = `https://api.tiingo.com/tiingo/daily/${cleanSymbol}/prices?startDate=${startDate}&resampleFreq=daily&token=${currentKey}`;
            let jsonResponse = null;
            try {
                try {
                    const res = await fetch(url);
                    if (res.status === 429) throw new Error("429");
                    if (res.ok) jsonResponse = await res.json();
                } catch (e) { if (e.message === "429") throw e; }

                if (!jsonResponse) {
                    try {
                        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
                        const res = await fetch(proxyUrl);
                        if (res.status === 429) throw new Error("429");
                        if (res.ok) jsonResponse = await res.json();
                    } catch (e) { if (e.message === "429") throw e; }
                }

                if (!jsonResponse) {
                      try {
                        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
                        const res = await fetch(proxyUrl);
                        if (res.ok) {
                            const wrapper = await res.json();
                            if (wrapper.contents) {
                                const parsed = JSON.parse(wrapper.contents);
                                if (parsed.detail && parsed.detail.includes("throttle")) throw new Error("429");
                                jsonResponse = parsed;
                            }
                        }
                    } catch (e) { if (e.message === "429") throw e; }
                }

                if (jsonResponse && Array.isArray(jsonResponse) && jsonResponse.length > 0) {
                      const normalized = { t: jsonResponse.map(d => new Date(d.date).getTime() / 1000), c: jsonResponse.map(d => d.adjClose || d.close) };
                      safeSetItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: normalized }));
                      dataCache.current[cleanSymbol] = normalized;
                      trackApiUsage(currentKey); 
                      return normalized;
                }
                throw new Error("Fetch failed");
            } catch (err) {
                keyIndex.current++;
                attempts++;
                await new Promise(r => setTimeout(r, 1000 + (attempts * 500)));
            }
        }
        throw new Error(`Max retries exceeded for ${cleanSymbol}`);
    })();

    inFlightRequests.current.set(cacheKey, fetchPromise);
    try { return await fetchPromise; } finally { inFlightRequests.current.delete(cacheKey); }
  };

  useEffect(() => {
    const fetchAssets = async () => {
        setLoading(true); setError(null); setFailures([]); setUsingCache(false); setProgress("Initializing 5Y Data...");
        const end = Math.floor(Date.now() / 1000);
        const start = end - (5 * 365 * 24 * 60 * 60); 
        if (getTiingoKeys().length === 0) { setError("No API Key"); setLoading(false); return; }
        try {
             const uniqueTickers = [...new Set(model.allocations.map(a => a.symbol))];
             const batchSize = 5;
             const failed = [];
             let usedCache = false;
             for (let i = 0; i < uniqueTickers.length; i += batchSize) {
                const batch = uniqueTickers.slice(i, i + batchSize);
                setProgress(`Fetching assets...`);
                await Promise.allSettled(batch.map(async (sym) => {
                      const cleanSym = sym.toUpperCase().replace(/[\.\/]/g, '-');
                      if (localStorage.getItem(`tiingo_${cleanSym}_5Y`)) usedCache = true;
                      try { await fetchTiingo(sym, start); } catch(e) { failed.push(sym); }
                }));
             }
             if (failed.length === uniqueTickers.length) throw new Error("All assets failed to fetch.");
             if (failed.length > 0) setFailures(failed);
             if (usedCache) setUsingCache(true);
             setAssetsLoaded(true); 
        } catch(e) { setError(e.message); setLoading(false); }
    };
    fetchAssets();
  }, [model]);

  useEffect(() => {
    if (!assetsLoaded) return;
    const buildCharts = async () => {
        setProgress("Building Benchmark...");
        const end = Math.floor(Date.now() / 1000);
        const start = end - (5 * 365 * 24 * 60 * 60); 
        const selectedBench = BENCHMARK_OPTIONS.find(b => b.id === selectedBenchmarkId);
        if (!selectedBench) return;
        const components = Object.keys(selectedBench.components);
        for (const ticker of components) { if (!dataCache.current[ticker]) { try { await fetchTiingo(ticker, start); } catch(e) {} } }
        let masterTicker = 'SPY';
        if (!dataCache.current['SPY']) masterTicker = components[0];
        if (!dataCache.current[masterTicker]) {
              const firstAsset = model.allocations.find(a => dataCache.current[a.symbol.toUpperCase().replace(/[\.\/]/g, '-')]);
              if (firstAsset) masterTicker = firstAsset.symbol.toUpperCase().replace(/[\.\/]/g, '-');
        }
        const masterData = dataCache.current[masterTicker];
        if (!masterData || !masterData.t) { setError("Reference data missing."); setLoading(false); return; }
        
        const fullTimeline = masterData.t;
        const fullBenchSeries = fullTimeline.map((time, idx) => {
            let val = 0; let totalW = 0;
            Object.entries(selectedBench.components).forEach(([sym, w]) => {
                const d = dataCache.current[sym];
                if (d && d.c) {
                    const price = d.c[idx] || d.c[d.c.length-1];
                    const startP = d.c[0];
                    if (price && startP) { val += (price / startP) * w; totalW += w; }
                }
            });
            return { date: new Date(time * 1000), value: totalW > 0 ? val / totalW : 1 };
        });

        const validAllocations = model.allocations.filter(a => dataCache.current[a.symbol.toUpperCase().replace(/[\.\/]/g, '-')]);
        const totalAllocWeight = validAllocations.reduce((sum, a) => sum + a.percent, 0);
        const fullModelSeries = fullTimeline.map((time, idx) => {
             let val = 0;
             validAllocations.forEach(alloc => {
                 const s = alloc.symbol.toUpperCase().replace(/[\.\/]/g, '-');
                 const d = dataCache.current[s];
                 const price = d.c[idx] || d.c[d.c.length-1];
                 const startP = d.c[0];
                 if (price && startP) { val += (price / startP) * (totalAllocWeight > 0 ? alloc.percent / totalAllocWeight : 0); }
             });
             return { date: new Date(time * 1000), value: val };
        });
        
        const filteredModel = filterData(fullModelSeries, selectedRange, customStart, customEnd);
        const filteredBench = filterData(fullBenchSeries, selectedRange, customStart, customEnd);
        setHistory(filteredModel); setBenchmark(filteredBench);
        calcMetrics(filteredModel, filteredBench); setLoading(false);
    };
    buildCharts();
  }, [selectedBenchmarkId, assetsLoaded, selectedRange, customStart, customEnd]); 

  const handleMouseMove = (e) => {
    if (!history || history.length === 0) return;
    const svgRect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - svgRect.left;
    const padding = 20;
    const chartWidth = svgRect.width - (padding * 2);
    const relativeX = Math.max(0, Math.min(x - padding, chartWidth));
    const index = Math.round((relativeX / chartWidth) * (history.length - 1));
    if (index >= 0 && index < history.length) {
        setHoverData({ index, date: history[index].date, modelVal: history[index].value, benchVal: benchmark[index]?.value });
    }
  };

  const renderChart = () => {
    if (history.length === 0) return null;
    const width = 500, height = 200, padding = 20, bottomPadding = 20;
    const minVal = Math.min(...history.map(d => d.value), ...benchmark.map(d => d.value)) * 0.95;
    const maxVal = Math.max(...history.map(d => d.value), ...benchmark.map(d => d.value)) * 1.05;
    const getX = (i) => (i / (history.length - 1)) * (width - padding * 2) + padding;
    const chartHeight = height - bottomPadding;
    const getY = (val) => chartHeight - padding - ((val - minVal) / (maxVal - minVal)) * (chartHeight - padding * 2);
    const makePath = (data) => data.map((d, i) => `${i===0?'M':'L'} ${getX(i)} ${getY(d.value)}`).join(' ');
    
    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible cursor-crosshair" onMouseMove={handleMouseMove} onMouseLeave={() => setHoverData(null)}>
            <line x1={padding} y1={getY(1)} x2={width-padding} y2={getY(1)} stroke="#334155" strokeDasharray="4" opacity="0.5" />
            <path d={makePath(benchmark)} fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="4" />
            <path d={makePath(history)} fill="none" stroke="#3b82f6" strokeWidth="3" />
            {hoverData && (
                <>
                    <line x1={getX(hoverData.index)} y1={padding} x2={getX(hoverData.index)} y2={chartHeight - padding} stroke="#e4e4e7" strokeWidth="1" strokeDasharray="2" />
                    <circle cx={getX(hoverData.index)} cy={getY(hoverData.modelVal)} r="5" fill="#3b82f6" stroke="white" strokeWidth="2" />
                    {hoverData.benchVal && <circle cx={getX(hoverData.index)} cy={getY(hoverData.benchVal)} r="4" fill="#64748b" />}
                </>
            )}
            <text x={padding} y={height - 5} fill="#52525b" fontSize="10" fontWeight="bold" textAnchor="start" style={{ textTransform: 'uppercase' }}>{history[0].date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}</text>
            <text x={width - padding} y={height - 5} fill="#52525b" fontSize="10" fontWeight="bold" textAnchor="end" style={{ textTransform: 'uppercase' }}>{history[history.length-1].date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}</text>
        </svg>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-4xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button onClick={onClose} className="absolute top-6 right-6 text-zinc-500 hover:text-white"><X className="h-6 w-6" /></button>
            <div className="mb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
                <div><h3 className="text-2xl font-black text-white tracking-tighter mb-1">Backtest Intelligence</h3><p className="text-zinc-500 text-sm font-medium">{model.name} Performance</p></div>
                <div className="flex flex-col gap-2">
                    <div className="flex bg-zinc-950 border border-zinc-800 rounded-lg p-1 gap-1">
                        {TIME_RANGES.map(r => <button key={r.label} onClick={() => setSelectedRange(r.label)} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${selectedRange === r.label ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>{r.label}</button>)}
                    </div>
                    <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 w-full">
                        <BarChart2 className="h-4 w-4 text-zinc-500" />
                        <select value={selectedBenchmarkId} onChange={(e) => setSelectedBenchmarkId(e.target.value)} className="bg-transparent text-xs font-bold text-zinc-300 focus:outline-none cursor-pointer w-full">
                            {BENCHMARK_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                        </select>
                    </div>
                 </div>
            </div>

            {selectedRange === 'Custom' && (
                <div className="flex gap-4 mb-6 bg-zinc-950 border border-zinc-800 p-3 rounded-xl items-center justify-center">
                    <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-zinc-500 uppercase">Start</span><input type="date" className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white" value={customStart} onChange={e => setCustomStart(e.target.value)} /></div>
                    <ArrowRight className="h-4 w-4 text-zinc-600" />
                    <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-zinc-500 uppercase">End</span><input type="date" className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white" value={customEnd} onChange={e => setCustomEnd(e.target.value)} /></div>
                </div>
            )}

            {loading ? (
                <div className="h-64 flex flex-col items-center justify-center gap-4 text-zinc-500"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /><span className="text-xs font-black uppercase tracking-widest">{progress}</span></div>
            ) : error ? (
                <div className="h-64 flex flex-col items-center justify-center gap-4 text-red-400"><WifiOff className="h-10 w-10 opacity-50" /><div className="text-center"><p className="font-bold">Backtest Failed</p><p className="text-xs text-red-400/60 mt-1">{error}</p></div></div>
            ) : (
                <>
                    {failures.length > 0 && (
                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 mb-6 flex items-center gap-3">
                            <AlertTriangle className="h-5 w-5 text-orange-400" />
                            <div className="text-xs text-orange-200"><span className="font-bold block">Partial Data</span>Skipped: {failures.join(', ')}.</div>
                        </div>
                    )}
                    <div className="grid grid-cols-4 gap-4 mb-8">
                        <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-2xl"><div className="text-[10px] font-black uppercase text-zinc-500 tracking-widest mb-1">Model Return</div><div className={`text-2xl font-mono font-bold ${metrics.modelReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>{metrics.modelReturn > 0 ? '+' : ''}{metrics.modelReturn.toFixed(2)}%</div></div>
                        <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-2xl border-l-4 border-l-blue-600"><div className="text-[10px] font-black uppercase text-zinc-500 tracking-widest mb-1">Benchmark</div><div className="text-2xl font-mono font-bold text-zinc-300">{metrics.benchReturn > 0 ? '+' : ''}{metrics.benchReturn.toFixed(2)}%</div></div>
                        <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-2xl"><div className="text-[10px] font-black uppercase text-zinc-500 tracking-widest mb-1">Alpha</div><div className={`text-2xl font-mono font-bold ${metrics.modelReturn - metrics.benchReturn >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>{(metrics.modelReturn - metrics.benchReturn) > 0 ? '+' : ''}{(metrics.modelReturn - metrics.benchReturn).toFixed(2)}%</div></div>
                        <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-2xl"><div className="text-[10px] font-black uppercase text-zinc-500 tracking-widest mb-1">Volatility</div><div className="text-2xl font-mono font-bold text-zinc-400">{metrics.volatility.toFixed(2)}%</div></div>
                    </div>
                    
                    <div className="relative h-64 w-full mb-4 group">
                        {renderChart()}
                        {hoverData && (
                            <div className="absolute bg-zinc-900/90 backdrop-blur-md border border-zinc-700 p-3 rounded-xl shadow-2xl pointer-events-none z-10 w-48 left-5 top-5">
                                <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">{hoverData.date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center text-xs"><span className="font-bold text-blue-400">Model</span><span className="font-mono text-white">{((hoverData.modelVal - 1) * 100).toFixed(2)}%</span></div>
                                    <div className="flex justify-between items-center text-xs"><span className="font-bold text-zinc-500">Benchmark</span><span className="font-mono text-zinc-400">{((hoverData.benchVal - 1) * 100).toFixed(2)}%</span></div>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex justify-center gap-8 text-[10px] font-bold uppercase tracking-widest">
                        <div className="flex items-center gap-2 text-blue-400"><div className="w-3 h-1 bg-blue-500 rounded-full" /> {model.name}</div>
                        <div className="flex items-center gap-2 text-zinc-500"><div className="w-3 h-1 bg-zinc-600 rounded-full border border-dashed border-zinc-500" /> {BENCHMARK_OPTIONS.find(b=>b.id===selectedBenchmarkId)?.label}</div>
                    </div>
                </>
            )}
        </div>
    </div>
  );
};
const Rebalancer = ({ client, onUpdateClient, onBack, models, isAggregated, onDeleteAccount }) => {
  const [positions, setPositions] = useState(client.positions || []);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [newTicker, setNewTicker] = useState('');
  const [isAddingTicker, setIsAddingTicker] = useState(false);
  const [plannedValue, setPlannedValue] = useState(null); 
  const [showModelModal, setShowModelModal] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [modelTargetValue, setModelTargetValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [layout, setLayout] = useState(() => {
      try { return JSON.parse(localStorage.getItem('rebalance_layout')) || DEFAULT_COLUMNS; } 
      catch(e) { return DEFAULT_COLUMNS; }
  });
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const startResizeRef = useRef(null);

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(client.name);
  const nameInputRef = useRef(null);

  useEffect(() => {
      setPositions(client.positions || []);
  }, [client.positions]);

  const totalValue = useMemo(() => plannedValue !== null ? plannedValue : positions.reduce((sum, p) => sum + (Number(p.currentValue) || 0), 0), [positions, plannedValue]);

  const handleSaveName = () => {
    if (tempName.trim() && tempName !== client.name) {
      onUpdateClient({ ...client, name: tempName.trim() });
    }
    setIsEditingName(false);
  };

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isEditingName]);

  const handleResetGoals = () => {
    const totalVal = positions.reduce((sum, p) => sum + (Number(p.currentValue) || 0), 0);
    const nextPositions = positions.map(p => {
        const currentWeight = totalVal > 0 ? (p.currentValue / totalVal) * 100 : 0;
        return { ...p, targetPct: currentWeight };
    });
    setPositions(nextPositions);
    onUpdateClient({ ...client, positions: nextPositions, lastUpdated: new Date().toISOString() });
  };

  const applyModel = async () => {
    const model = models.find(m => m.id === selectedModelId);
    if (!model) return;
    const targetValNum = parseFloat(modelTargetValue);
    if (!isNaN(targetValNum) && targetValNum > 0) setPlannedValue(targetValNum);
    setIsAddingTicker(true);

    const cleanPositions = positions.filter(p => {
        if (p.quantity > 0) return true; 
        if (p.description && typeof p.description === 'string' && p.description.startsWith('Model:')) {
            return false; 
        }
        return true; 
    });

    const existingMap = new Map(cleanPositions.map(p => [p.symbol, p]));
    const newPositions = [];
    
    for (const alloc of model.allocations) {
      const symbol = alloc.symbol.toUpperCase();
      let pos = existingMap.get(symbol);
      if (!pos) {
        let price = 0;
        try {
          const res = await fetchFinnhub(`quote?symbol=${symbol}`);
          price = res.c || 0;
        } catch (e) {}
        pos = { id: generateId(), symbol, description: `Model: ${model.name}`, quantity: 0, price, currentValue: 0, yield: 0, targetPct: alloc.percent, roundingMode: 'exact', metadata: null };
      } else { 
          const isModelPlaceholder = pos.quantity === 0 && pos.description.startsWith('Model:');
          pos = { 
              ...pos, 
              targetPct: alloc.percent, 
              description: isModelPlaceholder ? `Model: ${model.name}` : pos.description 
          }; 
          existingMap.delete(symbol);
      }
      newPositions.push(pos);
    }
    existingMap.forEach((pos) => newPositions.push({ ...pos, targetPct: 0 }));
    setPositions(newPositions); 
    setShowModelModal(false);
    setIsAddingTicker(false);
    onUpdateClient({ ...client, positions: newPositions, lastUpdated: new Date().toISOString() });
  };

  useEffect(() => {
    if (positions.length > 0) { setIsLive(true); fetchPrices(); }
    const timer = setInterval(fetchPrices, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [positions.length]);

  const fetchPrices = async () => {
    const nonCash = positions.filter(p => !CASH_TICKERS.some(t => p.symbol.toUpperCase().includes(t)));
    if (nonCash.length === 0) return;

    const uniqueSymbols = [...new Set(nonCash.map(p => p.symbol))];
    const now = Date.now();
    const updates = new Map(); 

    try {
        await Promise.all(uniqueSymbols.map(async (sym) => {
            const cached = GLOBAL_QUOTE_CACHE.get(sym);
            if (cached && (now - cached.timestamp < QUOTE_CACHE_TTL)) {
                updates.set(sym, cached);
                return;
            }

            try {
                const data = await fetchFinnhub(`quote?symbol=${sym}`);
                const fallbackYield = nonCash.find(p => p.symbol === sym)?.yield || 0;
                let dividendYield = fallbackYield;

                try {
                    const metricsData = await fetchFinnhub(`stock/metric?symbol=${sym}&metric=all`);
                    if (metricsData.metric && metricsData.metric.currentDividendYieldTTM) {
                        dividendYield = metricsData.metric.currentDividendYieldTTM;
                    }
                } catch(e) {}

                if (data.c > 0) {
                    const entry = { price: data.c, yield: dividendYield, timestamp: now };
                    GLOBAL_QUOTE_CACHE.set(sym, entry);
                    updates.set(sym, entry);
                }
            } catch(e) {
                if (cached) updates.set(sym, cached);
            }
        }));

        setPositions(prev => prev.map(p => {
            const update = updates.get(p.symbol);
            if (update) {
                return { 
                    ...p, 
                    price: update.price, 
                    currentValue: p.quantity * update.price, 
                    yield: update.yield
                };
            }
            return p;
        }));
    } catch (err) { setIsLive(false); }
  };

  const addTicker = async () => {
    if (!newTicker.trim()) return;
    setIsAddingTicker(true);
    const symbols = newTicker.split(/[\s,]+/).filter(s => s.trim().length > 0);
    try {
      const newItems = await Promise.all(symbols.map(async (sym) => {
        const symbol = sym.trim().toUpperCase();
        const res = await fetchFinnhub(`quote?symbol=${symbol}`);
        let initYield = 0;
        try {
              const metrics = await fetchFinnhub(`stock/metric?symbol=${symbol}&metric=all`);
              initYield = metrics.metric?.currentDividendYieldTTM || 0;
        } catch(e) {}
        return { id: generateId(), symbol, description: `Added: ${symbol}`, quantity: 0, price: res.c || 0, currentValue: 0, yield: initYield, targetPct: 0, roundingMode: 'exact', metadata: null };
      }));
      setPositions(prev => [...prev, ...newItems]); setNewTicker('');
    } finally { setIsAddingTicker(false); }
  };

  const handleEnrich = async (overridePositions) => {
    const targetPositions = overridePositions || positions;
    setIsEnriching(true);
    try {
      const stocks = targetPositions.filter(p => !CASH_TICKERS.some(t => p.symbol.toUpperCase().includes(t)));
      if (stocks.length === 0) return;
      const tickers = stocks.map(p => `${p.symbol}: ${p.description}`).join('\n');
      const systemPrompt = `
        You are a financial data engine.
        For each ticker, return a JSON object keyed by the exact ticker symbol provided.
        Each value must be an object with these exact keys: 'assetClass', 'style', 'sector', 'country', 'logoTicker', 'stateCode'.
        **CRITICAL FOR MUNICIPAL BONDS:**
        - Identify the US State of the issuer (e.g. "MIAMI-DADE" -> "FL", "MICHIGAN ST HSG" -> "MI").
        - Return the 2-letter US State code in 'stateCode'.
        - If not a municipal bond, 'stateCode' should be null.
        **CRITICAL FOR CORPORATE BONDS:**
        - Identify the parent company/issuer of the bond.
        - Return the stock ticker of that issuer in the 'logoTicker' field.
        - Example: "WELLS FARGO & CO" -> "WFC", "MICROCHIP TECH" -> "MCHP", "LEIDOS" -> "LDOS".
        - If it is a standard stock/ETF, 'logoTicker' should be null or the same as the symbol.
        **CRITICAL FOR ETFs & MUTUAL FUNDS:**
        - You MUST reference the "Morningstar Style Box" methodology to determine the 'style' field.
        - 1. assetClass options: "U.S. Equity", "Non-U.S. Equity", "Fixed Income", "Municipal Bond", "Other".
        - 2. style options: "Large-Value", "Large-Core", "Large-Growth", "Mid-Value", "Mid-Core", "Mid-Growth", "Small-Value", "Small-Core", "Small-Growth".
        - 3. sector options: "Technology", "Healthcare", "Financial Services", "Real Estate", "Energy", "Industrials", "Communication Services", "Consumer Defensive", "Consumer Cyclical", "Utilities", "Basic Materials".
        - 4. country: The primary country or region of risk.
        
        Output valid JSON only. Do not include markdown formatting.
      `;
      const result = await callGemini(`Classify these assets:\n${tickers}`, systemPrompt, true);
      const cleanResult = result.replace(/```json\n?|```/g, '').trim();
      const enrichment = JSON.parse(cleanResult);
      
      const next = targetPositions.map(p => {
        const isCash = CASH_TICKERS.some(t => p.symbol.toUpperCase().includes(t));
        if (isCash) return { ...p, metadata: { assetClass: 'Cash', sector: 'Cash', country: 'United States', style: 'Mid-Core' }};
        const aiData = enrichment[p.symbol] || enrichment[p.symbol.toUpperCase()] || {};
        return { 
          ...p, 
          metadata: { 
            assetClass: aiData.assetClass || 'Not Classified', 
            sector: aiData.sector || 'Misc', 
            country: aiData.country || 'United States', 
            style: aiData.style || 'Mid-Core',
            logoTicker: aiData.logoTicker || null, 
            stateCode: aiData.stateCode || null 
          } 
        };
      });
      setPositions(next); 
      onUpdateClient({ ...client, positions: next, lastUpdated: new Date().toISOString() });
    } catch (e) {
        console.error("AI Enrichment Failed", e);
        const fallbackPositions = targetPositions.map(p => {
            if (p.metadata && p.metadata.assetClass !== 'Not Classified') return p; 
            
            const desc = (p.description || "").toUpperCase();
            const isBondPos = isBond(p.symbol, desc);
           
            let fallbackMeta = { 
                assetClass: isBondPos ? 'Fixed Income' : 'U.S. Equity',
                sector: 'Unclassified',
                country: 'United States',
                style: 'Mid-Core',
                logoTicker: null,
                stateCode: null
            };

            if (desc.includes("INTL") || desc.includes("EMERGING")) fallbackMeta.assetClass = "Non-U.S. Equity";
            if (desc.includes("TECH")) fallbackMeta.sector = "Technology";
            if (desc.includes("HEALTH") || desc.includes("PHARM")) fallbackMeta.sector = "Healthcare";
            if (desc.includes("BANK") || desc.includes("FIN")) fallbackMeta.sector = "Financial Services";
            if (desc.includes("UTIL") || desc.includes("PWR")) fallbackMeta.sector = "Utilities";
            
            return { ...p, metadata: fallbackMeta };
        });
        setPositions(fallbackPositions);
        onUpdateClient({ ...client, positions: fallbackPositions, lastUpdated: new Date().toISOString() });

    } finally { setIsEnriching(false); }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
        const parsed = parseFidelityCSV(evt.target.result);
        const uniqueSymbols = [...new Set(parsed
            .filter(p => !(CASH_TICKERS.some(t => p.symbol.includes(t)) || (p.description && p.description.toUpperCase().includes("CASH"))))
            .map(p => p.symbol)
        )];

        const priceMap = new Map();
        try {
            await Promise.all(uniqueSymbols.map(async (symbol) => {
                try {
                    const data = await fetchFinnhub(`quote?symbol=${symbol}`);
                    if (data.c) priceMap.set(symbol, data.c);
                } catch(e) {}
            }));
        } catch(e) {}

        const liveParsed = parsed.map(p => {
             const isCash = CASH_TICKERS.some(t => p.symbol.includes(t)) || (p.description && p.description.toUpperCase().includes("CASH"));
             const isFixedIncome = isBond(p.symbol, p.description);
             let price = p.price; 
             
             if (isCash) {
                 price = 1.0;
             } else if (priceMap.has(p.symbol)) {
                 price = priceMap.get(p.symbol);
             }
             
             let val = p.quantity * price;
             if (isFixedIncome) {
                 val = (p.quantity * price) / 100;
             }
             
             return { ...p, price: price, currentValue: val };
        });

        const totalVal = liveParsed.reduce((sum, p) => sum + (p.currentValue || 0), 0);
        const hasNonCashPositions = positions.some(p => !CASH_TICKERS.some(t => p.symbol.toUpperCase().includes(t)));
        const existingMap = new Map();
        if (hasNonCashPositions) {
            positions.forEach(p => {
                if (p.targetPct && p.targetPct > 0) {
                    existingMap.set(p.symbol, p.targetPct);
                }
            });
        }

        const merged = liveParsed.map(p => {
            const currentWeight = totalVal > 0 ? (p.currentValue / totalVal) * 100 : 0;
            const targetPct = existingMap.has(p.symbol) ? existingMap.get(p.symbol) : currentWeight;
            return { ...p, targetPct };
        });

        setPositions(merged); 
        onUpdateClient({ ...client, positions: merged, lastUpdated: new Date().toISOString() });
        handleEnrich(merged);
    };
    reader.readAsText(file);
  };

  const displayPositions = useMemo(() => {
    const rawStocks = positions.filter(p => !CASH_TICKERS.some(t => p.symbol.toUpperCase().includes(t)));
    const rawCash = positions.filter(p => CASH_TICKERS.some(t => p.symbol.toUpperCase().includes(t)));
    const stocks = rawStocks.map(p => {
      const currentPct = totalValue > 0 ? (Number(p.currentValue) || 0) / totalValue : 0;
      let targetValue = totalValue * ((Number(p.targetPct) || 0) / 100);
      let tradeValue = targetValue - (Number(p.currentValue) || 0);
      if (Math.abs(tradeValue) < 0.01) tradeValue = 0;

      const isBondPos = isBond(p.symbol, p.description);
      let tradeShares = 0;
      
      if (p.price > 0) {
        if (isBondPos) {
            tradeShares = (tradeValue * 100) / p.price;
        } else {
            tradeShares = tradeValue / p.price;
        }
        
        if (p.roundingMode === '0.5') {
            tradeShares = Math.round(tradeShares * 2) / 2;
            tradeValue = isBondPos ? (tradeShares * p.price) / 100 : tradeShares * p.price;
            targetValue = (Number(p.currentValue) || 0) + tradeValue;
        } else if (p.roundingMode === '1.0') {
            tradeShares = Math.round(tradeShares);
            tradeValue = isBondPos ? (tradeShares * p.price) / 100 : tradeShares * p.price;
            targetValue = (Number(p.currentValue) || 0) + tradeValue;
        }
      }

      return { ...p, currentPct, actualTargetValue: targetValue, actualTargetPct: totalValue > 0 ? (targetValue / totalValue) * 100 : 0, tradeValue, tradeShares };
    });

    if (sortConfig.key) { 
        stocks.sort((a,b) => a[sortConfig.key] < b[sortConfig.key] ? (sortConfig.direction==='asc'?-1:1) : (sortConfig.direction==='asc'?1:-1));
    }
    const totalCashValue = rawCash.reduce((sum, c) => sum + (c.currentValue || 0), 0);
    const cashYield = rawCash.length > 0 ? rawCash[0].yield : 0; 
    const cashWeight = totalValue > 0 ? totalCashValue / totalValue : 0;
    const totalStockTargetPct = stocks.reduce((sum, s) => sum + (s.targetPct || 0), 0);
    const cashTargetPct = Math.max(0, 100 - totalStockTargetPct);
    const cashTargetValue = totalValue * (cashTargetPct / 100);
    
    let cashTradeValue = cashTargetValue - totalCashValue;
    if (Math.abs(cashTradeValue) < 0.01) cashTradeValue = 0;

    const aggregatedCash = {
        id: 'CASH_AGG',
        symbol: 'CASH',
        description: 'Sweep & Money Market',
        quantity: totalCashValue,
        price: 1.00,
        currentValue: totalCashValue,
        yield: cashYield,
        currentPct: cashWeight,
        targetPct: cashTargetPct,
        actualTargetValue: cashTargetValue,
        tradeValue: cashTradeValue,
        tradeShares: cashTradeValue,
        isCash: true
    };

    return { stocks, aggregatedCash };
  }, [positions, totalValue, sortConfig]);

  const totals = useMemo(() => {
      const all = [...displayPositions.stocks, displayPositions.aggregatedCash];
      const calculatedYield = all.reduce((acc, p) => {
          const weight = p.currentPct || 0;
          const y = p.yield || 0;
          return acc + (y * weight);
      }, 0);

      return {
          value: all.reduce((s, p) => s + (p.currentValue || 0), 0),
          weight: all.reduce((s, p) => s + (p.currentPct || 0), 0),
          targetPct: all.reduce((s, p) => s + (p.targetPct || 0), 0),
          targetValue: all.reduce((s, p) => s + (p.actualTargetValue || 0), 0),
          tradeValue: all.reduce((s, p) => s + (p.tradeValue || 0), 0),
          weightedYield: calculatedYield
      };
  }, [displayPositions]);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    else if (sortConfig.key === key && sortConfig.direction === 'desc') {
      setSortConfig({ key: null, direction: 'asc' });
      return;
    }
    setSortConfig({ key, direction });
  };

  const handleResizeStart = (e, colId) => {
      e.preventDefault();
      startResizeRef.current = { id: colId, startX: e.clientX, startWidth: layout.find(c => c.id === colId).width };
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
  };
  
  const handleResizeMove = useCallback((e) => {
      if (!startResizeRef.current) return;
      const { id, startX, startWidth } = startResizeRef.current;
      const newWidth = Math.max(50, startWidth + (e.clientX - startX));
      setLayout(prev => prev.map(col => col.id === id ? { ...col, width: newWidth } : col));
  }, [layout]);
  
  const handleResizeEnd = () => {
      startResizeRef.current = null;
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      localStorage.setItem('rebalance_layout', JSON.stringify(layout));
  };

  const updateLayout = (newLayout) => {
      setLayout(newLayout);
      localStorage.setItem('rebalance_layout', JSON.stringify(newLayout));
  };

  const handleToggleBucket = (id) => {
      const settings = client.settings || {};
      const currentHidden = settings.hiddenBuckets || [];
      const newHidden = currentHidden.includes(id) 
          ? currentHidden.filter(h => h !== id)
          : [...currentHidden, id];
          
      onUpdateClient({
          ...client,
          settings: { ...settings, hiddenBuckets: newHidden },
          lastUpdated: new Date().toISOString()
      });
  };

  const handleDeletePos = (id) => {
    if (confirmDeleteId === id) { setPositions(prev => prev.filter(p => p.id !== id)); setConfirmDeleteId(null); }
    else { setConfirmDeleteId(id); setTimeout(() => setConfirmDeleteId(null), 3000); }
  };

  const handleTargetPctChange = (id, val) => {
    const num = parseFloat(val) || 0;
    setPositions(positions.map(p => p.id === id ? { ...p, targetPct: num } : p));
  };

  const handleTargetValueChange = (id, val) => {
    const num = parseFloat(val) || 0;
    const newPct = totalValue > 0 ? (num / totalValue) * 100 : 0;
    setPositions(positions.map(p => p.id === id ? { ...p, targetPct: newPct } : p));
  };

  const setRoundingMode = (id, mode) => {
    setPositions(positions.map(p => p.id === id ? { ...p, roundingMode: mode } : p));
  };

  const renderCell = (col, p) => {
      switch(col.id) {
          case 'symbol': return <div className="flex items-center gap-4"><CompanyLogo symbol={p.symbol} description={p.description} logoTicker={p.metadata?.logoTicker} stateCode={p.metadata?.stateCode} isLoading={isEnriching} className="h-10 w-10" /><div className="flex flex-col"><span className="font-black text-white">{p.symbol}</span><span className="text-[11px] text-zinc-500 truncate max-w-[120px]">{p.description}</span></div></div>;
          case 'quantity': return <span className="text-zinc-300 font-medium">{formatQuantity(p.quantity)}</span>;
          case 'price': return <span className="text-zinc-300 font-medium">{formatCurrency(p.price)}</span>;
          case 'currentValue': return <span className="font-bold text-white">{formatCurrency(p.currentValue)}</span>;
          case 'yield': return (
             <div className="relative w-full h-full p-0 hover:bg-zinc-900 cursor-pointer border border-transparent hover:border-zinc-700 transition-colors">
                <input type="number" className="w-full h-full p-4 bg-transparent text-right font-mono text-xs text-zinc-500 focus:text-white focus:outline-none" value={p.yield || ''} placeholder="--" onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setPositions(positions.map(x => x.id === p.id ? { ...x, yield: val } : x));
                }} /><span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 pointer-events-none">%</span>
             </div>
          );
          case 'currentPct': return <span className="text-zinc-300 font-bold">{formatPercent(p.currentPct)}</span>;
          case 'targetPct': return <div className="h-full bg-blue-600/5 hover:bg-blue-600/10"><input type="number" className="w-full h-full p-4 bg-transparent text-right font-mono text-blue-300 font-bold focus:outline-none cursor-pointer" value={p.targetPct || ''} onChange={e => handleTargetPctChange(p.id, e.target.value)} placeholder="0.0" /></div>;
          case 'actualTargetValue': return <div className="h-full bg-blue-600/5 hover:bg-blue-600/10"><input type="number" className="w-full h-full p-4 bg-transparent text-right font-mono text-blue-300 font-bold focus:outline-none cursor-pointer" value={Math.round(totalValue * (p.targetPct/100)) || ''} onChange={e => handleTargetValueChange(p.id, e.target.value)} placeholder="0" /></div>;
          case 'tradeValue': return <span className={`font-mono font-black ${p.tradeValue > 0 ? 'text-green-500' : p.tradeValue < 0 ? 'text-red-500' : 'text-zinc-800'}`}>{p.tradeValue !== 0 ? formatCurrency(p.tradeValue) : '--'}</span>;
          case 'tradeShares': return p.isCash ? <span className="font-mono text-zinc-700">--</span> : (
            <div className="flex flex-col items-end gap-1.5 p-3">
                <span className={`font-mono font-black ${p.tradeValue > 0 ? 'text-green-500' : p.tradeValue < 0 ? 'text-red-500' : 'text-zinc-800'}`}>
                    {p.tradeShares !== 0 ? (p.tradeShares > 0 ? '+' : '') + formatQuantity(p.tradeShares) : '--'}
                </span>
                <div className="flex bg-zinc-900 rounded-lg p-0.5 border border-zinc-800">
                    {[
                        { label: 'EX', value: 'exact' },
                        { label: '0.5', value: '0.5' },
                        { label: '1.0', value: '1.0' }
                    ].map(opt => (
                        <button 
                            key={opt.value}
                            onClick={() => setRoundingMode(p.id, opt.value)}
                            className={`px-2 py-0.5 text-[8px] font-black rounded-md transition-all ${p.roundingMode === opt.value ? 'bg-blue-600 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            {opt.label}
                        </button>
                     ))}
                </div>
            </div>
          );
          default: return null;
      }
  };

  const visibleCols = layout.filter(c => c.visible);

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden">
        {!isAggregated && (
            <div className="px-8 py-2 flex items-center justify-between border-b border-zinc-900 shrink-0">
                <div className="flex items-center group gap-2">
                    {isEditingName ? (
                        <div className="flex items-center gap-2">
                            <input
                                ref={nameInputRef}
                                className="bg-zinc-900 border border-blue-500 text-sm font-bold text-white rounded px-2 py-1 focus:outline-none"
                                value={tempName}
                                onChange={e => setTempName(e.target.value)}
                                onBlur={handleSaveName}
                                onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                            />
                            <button onClick={handleSaveName} className="text-green-500 hover:text-green-400"><Check className="h-4 w-4" /></button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase tracking-widest text-zinc-500">{client.name}</span>
                            <button onClick={() => { setIsEditingName(true); setTempName(client.name); }} className="text-zinc-700 hover:text-zinc-400 opacity-0 group-hover:opacity-100"><Pencil className="h-3 w-3" /></button>
                        </div>
                    )}
                    {client.lastUpdated && (
                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-600 bg-zinc-900/50 px-2 py-1 rounded-md border border-zinc-800/50 ml-2">
                            <Clock className="h-3 w-3" />
                            <span>Last Edited: {new Date(client.lastUpdated).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {onDeleteAccount && (
                        <button onClick={onDeleteAccount} className="text-red-900 hover:text-red-500 transition-colors p-2 rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                            <Trash2 className="h-3 w-3" /> Delete Account
                        </button>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-zinc-500 h-8"><Upload className="h-3 w-3"/>CSV<input type="file" className="hidden" accept=".csv" onChange={handleFileUpload}/></label>
                    <Button variant="secondary" onClick={handleResetGoals} className="rounded-full px-3 h-8 text-[10px]"><RotateCcw className="h-3 w-3 mr-2"/> Reset</Button>
                    <Button variant="secondary" onClick={() => setShowSettingsModal(true)} className="rounded-full px-3 h-8"><Settings className="h-3.5 w-3.5"/></Button>
                    <Button variant="secondary" onClick={() => setShowModelModal(true)} className="rounded-full px-4 text-[10px] h-8"><Layers className="h-3 w-3 mr-2"/> Apply Model</Button>
                    <Button variant="sparkle" onClick={() => handleEnrich()} loading={isEnriching} className="rounded-full px-4 text-[10px] h-8 shadow-indigo-600/10"><Sparkles className="h-3 w-3 mr-2"/> AI Scan</Button>
                    <Button variant="primary" onClick={() => onUpdateClient({...client, positions, lastUpdated: new Date().toISOString()})} className="rounded-full px-6 text-[10px] h-8 shadow-blue-600/20">Commit</Button>
                </div>
            </div>
        )}
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col bg-zinc-950">
        <AnalyticsDashboard positions={positions} client={client} onUpdateClient={onUpdateClient} />
        <div className="px-8 py-8 max-w-[1600px] w-full mx-auto">
          <InsightsHub positions={positions} />
          <div className="bg-zinc-900/20 border border-zinc-800 rounded-2xl overflow-x-auto custom-scrollbar shadow-2xl">
            <table className="w-full text-left text-sm border-collapse min-w-[1200px]" style={{ tableLayout: 'fixed' }}>
              <thead className="bg-zinc-950/80 border-b border-zinc-800 sticky top-0 z-10 backdrop-blur-md">
                <tr>
                    {visibleCols.map(col => (
                        <th key={col.id} style={{ width: col.width }} className={`relative p-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 cursor-pointer hover:text-white transition-colors whitespace-nowrap ${col.align==='right'?'text-right':'text-left'}`} onClick={() => handleSort(col.id)}>
                            <div className={`flex items-center gap-1.5 ${col.align==='right'?'justify-end':'justify-start'}`}>{col.label}{sortConfig.key===col.id ? (sortConfig.direction==='asc'?<ChevronUp className="h-3 w-3 text-blue-400"/>:<ChevronDown className="h-3 w-3 text-blue-400"/>):<ArrowUpDown className="h-3 w-3 opacity-20"/>}</div>
                            <div className="col-resizer" onMouseDown={(e) => handleResizeStart(e, col.id)} onClick={(e)=>e.stopPropagation()} />
                        </th>
                    ))}
                    <th className="p-4 w-20 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/50">
                {!isAggregated && (
                    <tr className="bg-zinc-950/50 group">
                        <td colSpan={visibleCols.length + 1} className="p-0 border-b border-zinc-800">
                            <div className="flex items-center gap-4 p-4">
                                <div className="h-10 w-10 rounded-xl border border-dashed border-zinc-800 flex items-center justify-center text-zinc-700 group-focus-within:border-blue-500/50 group-focus-within:text-blue-500 transition-colors"><PlusCircle className="h-5 w-5" /></div>
                                <input className="bg-transparent flex-1 py-2 text-sm text-white focus:outline-none font-bold placeholder-zinc-700" placeholder="Add Security (e.g. NVDA, AAPL)..." value={newTicker} onChange={e => setNewTicker(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTicker()} />
                                {newTicker && <Button onClick={addTicker} variant="ghost" loading={isAddingTicker} className="text-blue-500 hover:bg-blue-500/10 px-6 h-8 rounded-xl uppercase text-[10px] font-black">Add</Button>}
                            </div>
                        </td>
                    </tr>
                )}
                {displayPositions.stocks.map(p => (
                  <tr key={p.id} className="hover:bg-zinc-900/40 group">
                    {visibleCols.map(col => <td key={col.id} className={`p-0 border-b border-zinc-900/50 ${col.align==='right'?'text-right':''} ${['targetPct', 'actualTargetValue', 'yield'].includes(col.id) ? 'bg-blue-600/5' : ''}`}>{['targetPct', 'actualTargetValue', 'yield', 'tradeShares'].includes(col.id) ? renderCell(col, p) : <div className="p-4">{renderCell(col, p)}</div>}</td>)}
                    <td className="p-4 text-right">
                        {!isAggregated && (
                            <button onClick={() => handleDeletePos(p.id)} className={`p-2 rounded-lg transition-all ${confirmDeleteId === p.id ? 'bg-red-500 text-white' : 'text-zinc-600 hover:text-red-500'}`}>{confirmDeleteId === p.id ? <Check className="h-4 w-4"/> : <Trash2 className="h-4 w-4" />}</button>
                        )}
                    </td>
                  </tr>
                ))}
                <tr className="bg-zinc-950 border-t-2 border-zinc-800">
                    {visibleCols.map(col => (
                          <td key={col.id} className={`p-0 ${col.align==='right'?'text-right':''} ${['targetPct', 'actualTargetValue', 'yield', 'currentValue'].includes(col.id) ? 'bg-blue-600/5' : ''}`}>
                             {col.id === 'symbol' ? <div className="p-4 flex items-center gap-4"><div className="h-10 w-10 bg-green-900/20 rounded-lg flex items-center justify-center text-green-500 border border-green-500/20"><Banknote className="h-5 w-5" /></div><div className="flex flex-col"><span className="font-black text-white">CASH</span><span className="text-[11px] text-zinc-500">Sweep</span></div></div> :
                              col.id === 'currentValue' ? 
                                <div className={`p-0 border border-transparent transition-colors h-full ${!isAggregated ? 'hover:bg-zinc-900 cursor-pointer hover:border-zinc-700' : ''}`}>
                                    <input disabled={isAggregated} type="number" className="w-full h-full p-4 bg-transparent text-right font-mono font-bold text-white focus:outline-none" value={displayPositions.aggregatedCash.currentValue} onChange={(e) => {
                                        const newVal = parseFloat(e.target.value) || 0;
                                        const cashTickers = positions.filter(p => CASH_TICKERS.some(t => p.symbol.toUpperCase().includes(t)));
                                        if (cashTickers.length > 0) {
                                            const diff = newVal - displayPositions.aggregatedCash.currentValue;
                                            setPositions(positions.map(p => p.id === cashTickers[0].id ? { ...p, currentValue: p.currentValue + diff } : p));
                                        } else {
                                            setPositions([...positions, { id: generateId(), symbol: 'FCASH', description: 'Cash', quantity: newVal, price: 1, currentValue: newVal, yield: 0, targetPct: 0, roundingMode: 'exact', metadata: { assetClass: 'Cash' } }]);
                                        }
                                    }} />
                                </div> :
                              col.id === 'price' ? <div className="p-4 font-mono text-zinc-300 text-xs">$1.00</div> :
                              col.id === 'quantity' ? <div className="p-4 font-mono text-zinc-300 text-xs">--</div> :
                              renderCell(col, displayPositions.aggregatedCash)
                             }
                          </td>
                    ))}
                    <td className="p-4 text-right"></td>
                </tr>
              </tbody>
              <tfoot className="bg-zinc-950/80 backdrop-blur-md border-t-4 border-zinc-800 sticky bottom-0 z-10">
                  <tr className="text-zinc-400">
                      {visibleCols.map((col, idx) => (
                          <td key={col.id} className={`p-4 ${col.align==='right'?'text-right':''} ${idx===0?'font-black uppercase tracking-widest text-[10px]':''} ${col.id==='currentValue'?'font-mono font-black text-white text-base':''} ${col.id==='currentPct'?'font-mono text-white font-bold':''} ${col.id==='targetPct'?'bg-blue-600/10 font-mono text-blue-400 font-bold':''} ${col.id==='actualTargetValue'?'bg-blue-600/10 font-mono text-blue-400 font-bold':''} ${col.id==='tradeValue'?'font-mono text-zinc-500 font-bold':''}`}>
                              {col.id === 'symbol' ? 'Total Portfolio' :
                               col.id === 'currentValue' ? formatCurrency(totals.value) :
                               col.id === 'currentPct' ? formatPercent(totals.weight) :
                               col.id === 'targetPct' ? formatPercent(totals.targetPct/100) :
                               col.id === 'actualTargetValue' ? formatCurrency(totals.targetValue) :
                               col.id === 'tradeValue' ? formatCurrency(totals.tradeValue) :
                               col.id === 'yield' ? formatPercent(totals.weightedYield / 100) :
                               ''}
                          </td>
                      ))}
                      <td></td>
                  </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
      {showModelModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl">
            <h3 className="text-2xl font-black text-white tracking-tighter mb-6">Apply Strategy</h3>
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Portfolio Value ($)</label>
                <input 
                  type="number" 
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-white font-mono font-bold focus:outline-none focus:border-blue-500" 
                  value={modelTargetValue} 
                  onChange={e => setModelTargetValue(e.target.value)} 
                  placeholder="0.00" 
                />
              </div>
              <div className="relative group">
                <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Strategy Model</label>
                <div className="relative">
                  <select 
                    value={selectedModelId} 
                    onChange={e => setSelectedModelId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-white font-bold focus:outline-none focus:border-blue-500 appearance-none cursor-pointer pr-10"
                  >
                    <option value="" disabled>Select a strategy...</option>
                    {models.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                    <ChevronDown className="h-4 w-4" />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <Button variant="secondary" onClick={() => setShowModelModal(false)} className="flex-1 rounded-xl h-12">Cancel</Button>
                <Button variant="primary" onClick={applyModel} disabled={!selectedModelId} className="flex-1 rounded-xl h-12">Apply</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showSettingsModal && (
          <SettingsModal 
            layout={layout} 
            onUpdateLayout={updateLayout} 
            hiddenBuckets={client.settings?.hiddenBuckets || []}
            onToggleBucket={handleToggleBucket}
            onClose={() => setShowSettingsModal(false)} 
          />
      )}
    </div>
  );
};
const ClientDashboard = ({ client, onUpdateClient, onBack, models }) => {
    const normalizedClient = useMemo(() => {
        if (client.accounts) return client;
        return {
            ...client,
            accounts: [{
                id: generateId(),
                name: 'Primary Portfolio',
                positions: client.positions || [],
                lastUpdated: client.lastUpdated
            }]
        };
    }, [client]);

    const [activeTab, setActiveTab] = useState('overview'); 
    const [isEditingAccount, setIsEditingAccount] = useState(false);
    const [newAccountName, setNewAccountName] = useState("");

    const aggregatedPositions = useMemo(() => {
        if (!normalizedClient.accounts) return [];
        const map = new Map();
        
        normalizedClient.accounts.forEach(acc => {
            (acc.positions || []).forEach(pos => {
                const existing = map.get(pos.symbol);
                if (existing) {
                    existing.quantity += (Number(pos.quantity) || 0);
                    existing.currentValue += (Number(pos.currentValue) || 0);
                    if (pos.metadata) {
                        existing.metadata = { ...(existing.metadata || {}), ...pos.metadata };
                    }
                } else {
                    map.set(pos.symbol, { 
                        ...pos, 
                        quantity: Number(pos.quantity) || 0, 
                        currentValue: Number(pos.currentValue) || 0,
                        metadata: pos.metadata ? { ...pos.metadata } : null
                    });
                }
            });
        });
        return Array.from(map.values());
    }, [normalizedClient]);

    const handleCreateAccount = () => {
        const newAcc = { 
            id: generateId(), 
            name: newAccountName || 'New Account', 
            positions: [],
            lastUpdated: new Date().toISOString()
        };
        const updatedClient = { 
            ...normalizedClient, 
            accounts: [...normalizedClient.accounts, newAcc],
            lastUpdated: new Date().toISOString()
        };
        onUpdateClient(updatedClient);
        setNewAccountName("");
        setIsEditingAccount(false);
        setActiveTab(newAcc.id);
    };

    const handleUpdateData = (updatedData) => {
        const currentTimestamp = updatedData.lastUpdated || new Date().toISOString();
        
        if (activeTab === 'overview') {
             let updatedAccounts = normalizedClient.accounts;

             if (updatedData.positions) {
                 const updates = new Map();
                 updatedData.positions.forEach(p => {
                     updates.set(p.symbol, { 
                         price: p.price, 
                         yield: p.yield, 
                         metadata: p.metadata 
                     });
                 });

                 updatedAccounts = updatedAccounts.map(acc => ({
                     ...acc,
                     positions: (acc.positions || []).map(pos => {
                         const up = updates.get(pos.symbol);
                         if (up) {
                             return {
                                 ...pos,
                                 price: up.price !== undefined ? up.price : pos.price,
                                 yield: up.yield !== undefined ? up.yield : pos.yield,
                                 metadata: { ...pos.metadata, ...up.metadata } 
                             };
                         }
                         return pos;
                     })
                 }));
             }

             onUpdateClient({
                 ...normalizedClient,
                 accounts: updatedAccounts,
                 allocationTargets: updatedData.allocationTargets,
                 settings: updatedData.settings,
                 lastUpdated: currentTimestamp
             });
        } else {
            const updatedAccounts = normalizedClient.accounts.map(acc => 
                acc.id === activeTab ? { ...acc, ...updatedData, lastUpdated: currentTimestamp } : acc
            );
            onUpdateClient({ 
                ...normalizedClient, 
                accounts: updatedAccounts,
                lastUpdated: currentTimestamp 
            });
        }
    };
    
    const handleDeleteAccount = (accId) => {
        const updatedAccounts = normalizedClient.accounts.filter(a => a.id !== accId);
        onUpdateClient({ 
            ...normalizedClient, 
            accounts: updatedAccounts,
            lastUpdated: new Date().toISOString()
        });
        setActiveTab('overview');
    };

    const activeAccount = normalizedClient.accounts.find(a => a.id === activeTab);
    const portfolioData = activeTab === 'overview' 
        ? { 
            name: client.name + ' (Household)', 
            positions: aggregatedPositions, 
            id: 'overview',
            lastUpdated: client.lastUpdated,
            allocationTargets: client.allocationTargets,
            settings: client.settings
          }
        : activeAccount;

    return (
        <div className="flex flex-col h-screen bg-zinc-950 overflow-hidden">
            <div className="bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800 pt-6 px-8 shrink-0 z-20">
               <div className="flex items-center gap-4 mb-6">
                   <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-10 w-10"><ArrowRight className="rotate-180 h-5 w-5"/></Button>
                   <h2 className="text-3xl font-black text-white tracking-tighter">{client.name}</h2>
               </div>
               <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-0">
                   <button 
                       onClick={() => setActiveTab('overview')}
                       className={`px-6 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${activeTab === 'overview' ? 'border-blue-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                   >
                       Overview
                   </button>
                   {normalizedClient.accounts.map(acc => (
                       <div key={acc.id} className="group relative flex items-center">
                           <button 
                               onClick={() => setActiveTab(acc.id)}
                               className={`px-6 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === acc.id ? 'border-blue-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                           >
                               {acc.name}
                           </button>
                       </div>
                   ))}
                   <div className="ml-4 flex items-center gap-2 pb-2">
                       {isEditingAccount ? (
                           <div className="flex items-center bg-zinc-900 rounded-lg p-1 border border-zinc-800">
                               <input autoFocus className="bg-transparent text-xs text-white px-2 outline-none w-32" placeholder="Account Name" value={newAccountName} onChange={e => setNewAccountName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreateAccount()} />
                               <button onClick={handleCreateAccount} className="p-1 text-green-500 hover:bg-zinc-800 rounded"><Check className="h-3 w-3"/></button>
                               <button onClick={() => setIsEditingAccount(false)} className="p-1 text-zinc-500 hover:bg-zinc-800 rounded"><X className="h-3 w-3"/></button>
                           </div>
                       ) : (
                           <button onClick={() => setIsEditingAccount(true)} className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-400 px-3 py-1 rounded-full hover:bg-blue-500/10 transition-colors">
                               <PlusCircle className="h-3 w-3" /> Add Account
                           </button>
                       )}
                   </div>
               </div>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0">
                <Rebalancer 
                    key={activeTab} 
                    client={portfolioData}
                    onUpdateClient={handleUpdateData}
                    onBack={onBack}
                    models={models}
                    isAggregated={activeTab === 'overview'}
                    onDeleteAccount={activeTab !== 'overview' ? () => handleDeleteAccount(activeTab) : undefined}
                />
            </div>
        </div>
    );
};

const ModelManager = ({ models, onUpdateModels }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState(null); 
  const [modelName, setModelName] = useState('');
  const [defaultBench, setDefaultBench] = useState('SPY');
  const [allocations, setAllocations] = useState([{ symbol: '', percent: '', description: '' }]);
  const [isSaving, setIsSaving] = useState(false);
  const [backtestModel, setBacktestModel] = useState(null); 
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const handleAddRow = () => setAllocations([...allocations, { symbol: '', percent: '', description: '' }]);
  const handleRemoveRow = (idx) => setAllocations(allocations.filter((_, i) => i !== idx));
  const handleChange = (idx, field, val) => {
    const next = [...allocations];
    if (field === 'symbol') { 
        next[idx][field] = val.toUpperCase(); 
        next[idx].description = ''; 
    } else { 
        next[idx][field] = val; 
    }
    setAllocations(next);
  };

  const saveModel = async () => {
    if (!modelName.trim()) return;
    setIsSaving(true);
    const finnhubKey = getFinnhubKeys()[0]; 
    try {
        const enriched = await Promise.all(allocations.filter(a => a.symbol.trim() !== '').map(async (a) => {
            if (a.description) return {...a, percent: parseFloat(a.percent)}; 
            const res = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${a.symbol.toUpperCase()}&token=${finnhubKey}`).then(r => r.json());
            return { ...a, description: res.name || a.symbol, percent: parseFloat(a.percent) };
        }));
        const modelData = { name: modelName, defaultBenchmark: defaultBench, allocations: enriched };
        if (editingId) { 
            onUpdateModels(models.map(m => m.id === editingId ? { ...m, ...modelData } : m));
        } else { 
            onUpdateModels([...models, { id: generateId(), ...modelData }]);
        }
        setIsCreating(false); setEditingId(null); setModelName(''); setAllocations([{ symbol: '', percent: '', description: '' }]);
    } catch (error) { } finally { setIsSaving(false); }
  };

  const handleDeleteClick = (id) => {
    if (confirmDeleteId === id) {
      onUpdateModels(models.filter(m => m.id !== id));
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-12 space-y-8 pb-24">
      <GlobalStyles />
      <div className="flex justify-between items-end">
        <div><h1 className="text-4xl font-black text-white tracking-tighter">Model Strategies</h1><p className="text-zinc-500 text-lg mt-2 font-medium">Define your target allocations.</p></div>
        <div className="flex gap-2">
            <Button onClick={() => setShowUsageModal(true)} variant="secondary" className="rounded-xl px-4 h-12"><Activity className="h-5 w-5" /></Button>
            {!isCreating && <Button onClick={() => setIsCreating(true)} className="rounded-xl px-6 h-12 uppercase text-[10px] tracking-widest font-black"><Plus className="h-4 w-4 mr-2" /> Create Model</Button>}
        </div>
      </div>
      {isCreating && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-8 shadow-2xl">
          <div className="flex justify-between items-start mb-6"><h3 className="text-xl font-black text-white">{editingId ? 'Edit Strategy' : 'New Strategy'}</h3><button onClick={() => setIsCreating(false)} className="text-zinc-500 hover:text-white"><X className="h-5 w-5" /></button></div>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
                <div><label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Strategy Name</label><input className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-blue-500" value={modelName} onChange={e => setModelName(e.target.value)} /></div>
                <div><label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Default Benchmark</label><select className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-blue-500" value={defaultBench} onChange={e => setDefaultBench(e.target.value)}>{BENCHMARK_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}</select></div>
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500">Allocations</label>
              {allocations.map((alloc, idx) => (
                <div key={idx} className="flex gap-4 items-center">
                  <input className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-white font-mono uppercase" placeholder="Ticker" value={alloc.symbol} onChange={e => handleChange(idx, 'symbol', e.target.value)} />
                  <div className="relative w-32 border border-zinc-800 rounded-xl overflow-hidden focus-within:border-blue-500 bg-zinc-950"><input type="number" className="w-full bg-transparent px-4 py-4 text-right text-white font-mono text-lg focus:outline-none" value={alloc.percent} onChange={e => handleChange(idx, 'percent', e.target.value)} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 font-bold pointer-events-none">%</span></div>
                  <button onClick={() => handleRemoveRow(idx)} className="text-zinc-600 hover:text-red-500 p-2"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <button onClick={handleAddRow} className="text-blue-500 text-xs font-bold uppercase tracking-widest hover:text-blue-400 mt-2 flex items-center gap-1"><PlusCircle className="h-3 w-3" /> Add Asset</button>
            </div>
            <div className="flex justify-end pt-4 border-t border-zinc-800"><Button onClick={saveModel} disabled={!modelName || isSaving} loading={isSaving} className="rounded-xl px-8">Save Strategy</Button></div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {models.map(m => (
          <div key={m.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="h-10 w-10 bg-zinc-800 rounded-lg flex items-center justify-center text-blue-500"><Layers className="h-5 w-5" /></div>
              <div className="flex items-center gap-1">
                <button onClick={() => setBacktestModel(m)} className="text-zinc-600 hover:text-blue-400 p-2"><LineChart className="h-4 w-4" /></button>
                <button onClick={() => { setModelName(m.name); setDefaultBench(m.defaultBenchmark); setAllocations(m.allocations.map(a=>({...a, percent: a.percent.toString()}))); setEditingId(m.id); setIsCreating(true); }} className="text-zinc-600 hover:text-white p-2"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => handleDeleteClick(m.id)} className={`p-2 rounded-lg transition-colors ${confirmDeleteId === m.id ? 'bg-red-500 text-white' : 'text-zinc-600 hover:text-red-500'}`}>{confirmDeleteId === m.id ? <Check className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}</button>
              </div>
            </div>
            <h3 className="text-xl font-black text-white tracking-tight mb-4">{m.name}</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50 custom-scrollbar">
              {m.allocations.map((a, i) => (
                <div key={i} className="flex justify-between text-xs items-center py-1 border-b border-zinc-800/30 last:border-0"><div className="flex flex-col"><span className="font-bold text-white">{a.symbol}</span><span className="text-[9px] text-zinc-500 truncate max-w-[120px]">{a.description}</span></div><span className="font-mono text-zinc-300 font-bold">{a.percent}%</span></div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {backtestModel && <BacktestModal model={backtestModel} onClose={() => setBacktestModel(null)} />}
      {showUsageModal && <ApiUsageModal onClose={() => setShowUsageModal(false)} />}
    </div>
  );
};

const ClientList = ({ clients, onCreateClient, onSelectClient, onDeleteClient }) => {
  const [name, setName] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'recent', direction: 'desc' });
  const [viewMode, setViewMode] = useState('grid');

  const getClientValue = (client) => {
    let total = 0;
    if (client.accounts) {
         client.accounts.forEach(acc => {
             (acc.positions || []).forEach(p => total += (Number(p.currentValue) || 0));
         });
    } else if (client.positions) {
         client.positions.forEach(p => total += (Number(p.currentValue) || 0));
    }
    return total;
  };

  const handleSortToggle = (key) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      let defaultDir = 'asc';
      if (key === 'recent' || key === 'value') defaultDir = 'desc';
      return { key, direction: defaultDir };
    });
  };

  const sortedClients = useMemo(() => {
      const withValues = clients.map(c => ({
          ...c,
          totalValue: getClientValue(c)
      }));

      return withValues.sort((a, b) => {
          const dir = sortConfig.direction === 'asc' ? 1 : -1;
          
          if (sortConfig.key === 'recent') {
              const dateA = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
              const dateB = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
              return (dateA - dateB) * dir;
          }
          if (sortConfig.key === 'value') {
              return (a.totalValue - b.totalValue) * dir;
          }
          return a.name.localeCompare(b.name) * dir;
      });
  }, [clients, sortConfig]);

  return (
    <div className="max-w-7xl mx-auto p-8 md:p-12 space-y-12 pb-24">
      <GlobalStyles />
      <div className="flex flex-col md:flex-row justify-between items-end gap-6">
        <div><h1 className="text-4xl font-black text-white tracking-tighter">Portfolios</h1><p className="text-zinc-500 text-base mt-2 font-medium">Quant-based rebalancing & allocation tools.</p></div>
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
            <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1 h-12 items-center">
                 <button 
                    onClick={() => setViewMode('grid')} 
                    className={`h-full px-3 rounded-lg flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'grid' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                    title="Grid View"
                >
                    <LayoutGrid className="h-4 w-4" />
                </button>
                 <button 
                    onClick={() => setViewMode('list')} 
                    className={`h-full px-3 rounded-lg flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'list' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                    title="List View"
                >
                    <LayoutList className="h-4 w-4" />
                </button>
            </div>

            <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1 h-12 items-center">
                <button 
                    onClick={() => handleSortToggle('recent')} 
                    className={`h-full px-3 rounded-lg flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-all ${sortConfig.key === 'recent' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                    title={sortConfig.direction === 'desc' ? "Newest First" : "Oldest First"}
                >
                    <Clock className="h-4 w-4" />
                    {sortConfig.key === 'recent' && (sortConfig.direction === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
                </button>
                <button 
                    onClick={() => handleSortToggle('name')} 
                    className={`h-full px-3 rounded-lg flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-all ${sortConfig.key === 'name' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                    title={sortConfig.direction === 'asc' ? "Name: A-Z" : "Name: Z-A"}
                >
                    {sortConfig.key === 'name' && sortConfig.direction === 'desc' ? <ArrowUpAZ className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
                </button>
                <button 
                    onClick={() => handleSortToggle('value')} 
                    className={`h-full px-3 rounded-lg flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-all ${sortConfig.key === 'value' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                    title={sortConfig.direction === 'desc' ? "Value: High to Low" : "Value: Low to High"}
                >
                    {sortConfig.key === 'value' && sortConfig.direction === 'asc' ? <ArrowUpNarrowWide className="h-4 w-4" /> : <ArrowDownWideNarrow className="h-4 w-4" />}
                </button>
            </div>
            
            <div className="flex gap-3 bg-zinc-900/50 p-1.5 rounded-2xl border border-zinc-800 shadow-2xl w-full md:w-auto">
                 <input className="bg-transparent rounded-xl px-4 py-2 text-sm text-white focus:outline-none w-full md:w-64 font-medium" placeholder="Account identifier..." value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && name.trim() && (onCreateClient({name}), setName(''))} />
                <Button onClick={() => { if(name.trim()) { onCreateClient({name}); setName(''); } }} className="rounded-xl px-6 whitespace-nowrap">Add New Client</Button>
            </div>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedClients.map(c => (
            <Card key={c.id} className="group relative border-zinc-800 hover:border-blue-500/50 transition-all rounded-2xl" onClick={() => onSelectClient(c.id)}>
                <div className="flex justify-between items-start">
                    <div className="h-12 w-12 bg-zinc-800 rounded-xl flex items-center justify-center group-hover:bg-blue-600/10 transition-colors">
                         <Briefcase className="h-6 w-6 text-zinc-400 group-hover:text-blue-500 transition-colors" />
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); onDeleteClient(c.id); }} className="text-zinc-800 hover:text-red-500 transition-colors p-2">
                         <Trash2 className="h-4 w-4" />
                    </button>
                </div>
                
                <div className="mt-6">
                    <h3 className="font-black text-xl text-zinc-100 tracking-tight leading-tight mb-1">{c.name}</h3>
                    <div className="text-2xl font-mono font-bold text-white">{formatCurrency(c.totalValue)}</div>
                </div>

                <div className="mt-6 pt-6 border-t border-zinc-800/50 text-xs text-zinc-500 flex justify-between items-center font-bold uppercase tracking-widest">
                    <span>{c.accounts ? c.accounts.length + ' Accounts' : '1 Account'}</span>
                    <span className="text-blue-500 group-hover:translate-x-1 transition-transform flex items-center gap-2">
                        {c.lastUpdated && (
                            <span className="text-[9px] text-zinc-600 font-mono normal-case tracking-normal hidden sm:inline">
                                 {new Date(c.lastUpdated).toLocaleDateString()}
                            </span>
                        )}
                        Configure →
                    </span>
                </div>
            </Card>
            ))}
        </div>
      ) : (
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
             <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-950 border-b border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                        <tr>
                             <th className="p-6">Client Name</th>
                            <th className="p-6 text-right">Accounts</th>
                            <th className="p-6 text-right">Total Value</th>
                            <th className="p-6 text-right">Last Updated</th>
                            <th className="p-6 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                         {sortedClients.map(c => (
                            <tr key={c.id} onClick={() => onSelectClient(c.id)} className="hover:bg-zinc-900 cursor-pointer group transition-colors">
                                <td className="p-6 font-bold text-white flex items-center gap-4">
                                     <div className="h-8 w-8 bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-500 group-hover:text-blue-500 group-hover:bg-blue-500/10 transition-colors">
                                        <Briefcase className="h-4 w-4" />
                                     </div>
                                    {c.name}
                                </td>
                                <td className="p-6 text-right font-mono">{c.accounts ? c.accounts.length : 1}</td>
                                <td className="p-6 text-right font-mono font-bold text-white">{formatCurrency(c.totalValue)}</td>
                                <td className="p-6 text-right text-xs text-zinc-500 font-mono">
                                     {c.lastUpdated ? new Date(c.lastUpdated).toLocaleDateString() : '--'}
                                </td>
                                <td className="p-6 text-right">
                                     <button 
                                        onClick={(e) => { e.stopPropagation(); onDeleteClient(c.id); }} 
                                        className="text-zinc-600 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-zinc-800"
                                    >
                                         <Trash2 className="h-4 w-4" />
                                    </button>
                                </td>
                             </tr>
                        ))}
                    </tbody>
                </table>
            </div>
             {sortedClients.length === 0 && (
                <div className="p-12 text-center text-zinc-500 font-medium">No clients found. Create one to get started.</div>
            )}
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [view, setView] = useState('clients');
  const [clients, setClients] = useState(() => {
    try { const saved = localStorage.getItem('rebalance_db_v4'); return saved ? JSON.parse(saved) : []; } catch (e) { return []; }
  });
  const [models, setModels] = useState(() => {
    try { const saved = localStorage.getItem('rebalance_models'); return saved ? JSON.parse(saved) : []; } catch (e) { return []; }
  });
  const [route, setRoute] = useState({ path: '/', params: {} });
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);

  useEffect(() => { localStorage.setItem('rebalance_db_v4', JSON.stringify(clients)); }, [clients]);
  useEffect(() => { localStorage.setItem('rebalance_models', JSON.stringify(models)); }, [models]);

  if (route.path === '/client') {
    const client = clients.find(c => c.id === route.params.id);
    if (!client) { setRoute({ path: '/', params: {} }); return null; }
    return (
        <ClientDashboard 
            client={client} 
            models={models} 
            onBack={() => setRoute({ path: '/', params: {} })} 
            onUpdateClient={u => setClients(clients.map(c => c.id === u.id ? u : c))} 
        />
    );
  }

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 flex overflow-hidden">
        <GlobalStyles />
        <div className="w-20 border-r border-zinc-800 flex flex-col items-center py-8 bg-zinc-950/50 backdrop-blur-xl shrink-0">
            <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-lg shadow-blue-600/30 mb-8">IA</div>
            <div className="flex flex-col gap-4 w-full px-2 flex-1">
                <button onClick={() => setView('clients')} className={`h-12 w-12 mx-auto rounded-xl flex items-center justify-center transition-all ${view === 'clients' ? 'bg-zinc-800 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'}`}><Users className="h-5 w-5" /></button>
                <button onClick={() => setView('models')} className={`h-12 w-12 mx-auto rounded-xl flex items-center justify-center transition-all ${view === 'models' ? 'bg-zinc-800 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'}`}><Layers className="h-5 w-5" /></button>
            </div>
            <div className="w-full px-2 mt-auto">
                 <button onClick={() => setShowGlobalSettings(true)} className="h-12 w-12 mx-auto rounded-xl flex items-center justify-center transition-all text-zinc-500 hover:text-white hover:bg-zinc-900"><Key className="h-5 w-5" /></button>
            </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
            {view === 'clients' ? (
                <ClientList 
                    clients={clients} 
                    onCreateClient={c => setClients([...clients, { ...c, id: generateId(), accounts: [], lastUpdated: new Date().toISOString() }])} 
                    onSelectClient={id => setRoute({ path: '/client', params: { id } })} 
                    onDeleteClient={id => setClients(clients.filter(c => c.id !== id))} 
                />
            ) : (
                <ModelManager models={models} onUpdateModels={setModels} />
            )}
        </div>
         {showGlobalSettings && <GlobalSettingsModal onClose={() => setShowGlobalSettings(false)} />}
    </div>
  );
}