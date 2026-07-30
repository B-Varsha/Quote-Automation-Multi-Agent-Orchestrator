import React from 'react';
import { Calculator, Info, Scale, Check } from 'lucide-react';
import { PortionRuleResult } from '../types';

interface PortionRulesPanelProps {
  guestCount: number | null;
  portionRecommendations: PortionRuleResult[];
}

export const PortionRulesPanel: React.FC<PortionRulesPanelProps> = ({
  guestCount,
  portionRecommendations,
}) => {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-200/60">
            <Scale className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Worker 2: Portion & Scaling Agent</h3>
            <p className="text-[11px] text-slate-500">Automated Catering Tray Math for {guestCount || 50} Guests</p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 font-semibold border border-amber-200">
            Maharaja Scaling Rules
          </span>
        </div>
      </div>

      {/* Rules summary badges */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 text-[11px]">
        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
          <p className="text-slate-500 font-semibold">Biryanis</p>
          <p className="text-amber-800 font-bold">~75 guests / Large Tray</p>
        </div>
        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
          <p className="text-slate-500 font-semibold">Curries & Gravies</p>
          <p className="text-amber-800 font-bold">~90 guests / Large Tray</p>
        </div>
        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
          <p className="text-slate-500 font-semibold">Side Rice Trays</p>
          <p className="text-amber-800 font-bold">~60 guests / Side Tray</p>
        </div>
        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
          <p className="text-slate-500 font-semibold">Appetizer Pieces</p>
          <p className="text-amber-800 font-bold">1.75 pcs / guest</p>
        </div>
        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
          <p className="text-slate-500 font-semibold">Naans & Breads</p>
          <p className="text-amber-800 font-bold">1.5 naans / guest</p>
        </div>
        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
          <p className="text-slate-500 font-semibold">Desserts</p>
          <p className="text-amber-800 font-bold">1.25 pcs / guest</p>
        </div>
      </div>

      {portionRecommendations.length === 0 ? (
        <p className="text-xs text-slate-500 py-3 text-center">No portion recommendations calculated yet.</p>
      ) : (
        <div className="space-y-2">
          {portionRecommendations.map((rec, idx) => (
            <div key={idx} className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs flex items-start gap-2.5">
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900">{rec.item_name}: </span>
                <span className="text-slate-700">{rec.explanation}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
