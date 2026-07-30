import React, { useState } from 'react';
import { Cpu, Terminal, CheckCircle2, AlertCircle, Clock, ChevronRight, X } from 'lucide-react';
import { MCPLog, QuoteSessionState } from '../types';

interface MCPTraceDrawerProps {
  state: QuoteSessionState | null;
  isOpen: boolean;
  onClose: () => void;
}

export const MCPTraceDrawer: React.FC<MCPTraceDrawerProps> = ({ state, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'logs' | 'raw'>('logs');

  if (!isOpen) return null;

  const logs: MCPLog[] = state?.agent_logs || [];

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[500px] z-50 bg-white border-l border-slate-200 shadow-2xl flex flex-col text-slate-900">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-200">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">MCP Agent Execution Trace</h3>
            <p className="text-[11px] text-slate-500">Model Context Protocol Multi-Agent Session Log</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 px-4">
        <button
          onClick={() => setActiveTab('logs')}
          className={`py-2.5 px-3 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'logs' ? 'border-amber-600 text-amber-700 font-bold' : 'border-transparent hover:text-slate-900'
          }`}
        >
          Agent Step Logs ({logs.length})
        </button>
        <button
          onClick={() => setActiveTab('raw')}
          className={`py-2.5 px-3 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'raw' ? 'border-amber-600 text-amber-700 font-bold' : 'border-transparent hover:text-slate-900'
          }`}
        >
          Raw Session JSON
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
        {activeTab === 'logs' ? (
          logs.length === 0 ? (
            <p className="text-slate-500 text-center py-8">No agent execution trace logs recorded yet.</p>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-amber-800 font-bold font-sans text-xs flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-amber-600" />
                    {log.agent_name}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      log.status === 'SUCCESS'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : log.status === 'INCOMPLETE'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}
                  >
                    {log.status}
                  </span>
                </div>

                <div className="text-[11px] text-slate-800 font-sans mb-2 font-medium">
                  <span className="text-slate-500 font-semibold">{log.action}: </span>
                  {log.details}
                </div>

                {log.payload && Object.keys(log.payload).length > 0 && (
                  <pre className="bg-slate-900 p-2.5 rounded-lg text-[10px] text-emerald-400 overflow-x-auto border border-slate-800 shadow-inner">
                    {JSON.stringify(log.payload, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )
        ) : (
          <pre className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-[10px] text-emerald-400 overflow-x-auto shadow-inner">
            {JSON.stringify(state, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};
