import React from 'react';
import { Utensils, RefreshCw, FileSpreadsheet, CheckCircle2, AlertCircle, Cpu } from 'lucide-react';
import { QuoteSessionState } from '../types';

interface NavbarProps {
  state: QuoteSessionState | null;
  onReset: () => void;
  onToggleMcp: () => void;
  isMcpOpen: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ state, onReset, onToggleMcp, isMcpOpen }) => {
  const getStatusBadge = () => {
    if (!state) return null;
    switch (state.status) {
      case 'INCOMPLETE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertCircle className="w-3.5 h-3.5" />
            Incomplete Inquiry
          </span>
        );
      case 'READY_FOR_REVIEW':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Ready for Review
          </span>
        );
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Delivery Confirmed
          </span>
        );
      case 'EXPORTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Sheet Exported
          </span>
        );
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 text-slate-900 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-amber-500 rounded-xl shadow-xs text-white">
            <Utensils className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-slate-900">Maharaja Catering</h1>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium border border-amber-200">MCP Multi-Agent</span>
            </div>
            <p className="text-xs text-slate-500">Automated Catering Quote Assistant & Grounded Price Book</p>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          {getStatusBadge()}

          <button
            onClick={onToggleMcp}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              isMcpOpen
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>MCP Agent Logs</span>
          </button>

          <button
            onClick={onReset}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>New Inquiry</span>
          </button>
        </div>
      </div>
    </header>
  );
};
