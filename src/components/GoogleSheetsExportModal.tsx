import React, { useState } from 'react';
import { FileSpreadsheet, ExternalLink, Download, CheckCircle, Copy, Sparkles, X } from 'lucide-react';
import { QuoteSessionState } from '../types';

interface GoogleSheetsExportModalProps {
  state: QuoteSessionState;
  onExport: (title?: string) => Promise<{ spreadsheet_url: string; message: string }>;
  onClose: () => void;
}

export const GoogleSheetsExportModal: React.FC<GoogleSheetsExportModalProps> = ({
  state,
  onExport,
  onClose,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ spreadsheet_url: string; message: string } | null>(null);
  const [sheetTitle, setSheetTitle] = useState(
    `Maharaja Catering Quote - ${state.customer_name || 'Valued Customer'}`
  );
  const [copied, setCopied] = useState(false);

  const handleRunExport = async () => {
    setIsExporting(true);
    try {
      const res = await onExport(sheetTitle);
      setExportResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyLink = () => {
    if (exportResult?.spreadsheet_url) {
      navigator.clipboard.writeText(exportResult.spreadsheet_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white border border-slate-200/80 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative text-slate-900">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Worker 4: Google Sheets Export Agent</h3>
            <p className="text-xs text-slate-500">Generate formatted Google Spreadsheet matching official Quote Template</p>
          </div>
        </div>

        {!exportResult ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Spreadsheet Document Title</label>
              <input
                type="text"
                value={sheetTitle}
                onChange={(e) => setSheetTitle(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-600"
              />
            </div>

            {/* Template layout preview card */}
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 text-xs font-mono space-y-2 text-slate-200 shadow-sm">
              <p className="text-amber-400 font-bold border-b border-slate-800 pb-1">
                MAHARAJA CATERING - OFFICIAL QUOTE ESTIMATE
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                <p>Customer: {state.customer_name || 'N/A'}</p>
                <p>Guests: {state.guest_count || 0}</p>
                <p>Date: {state.event_date || 'N/A'}</p>
                <p>Time: {state.event_time || 'N/A'}</p>
              </div>

              <div className="pt-2">
                <table className="w-full text-left text-[10px] text-slate-300 border-t border-slate-800">
                  <thead>
                    <tr className="text-slate-400 font-bold">
                      <th className="py-1">Item</th>
                      <th className="py-1 text-center">Qty</th>
                      <th className="py-1 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.extracted_items.slice(0, 3).map((item, i) => (
                      <tr key={i}>
                        <td className="py-0.5">{item.item_name}</td>
                        <td className="py-0.5 text-center">{item.quantity}</td>
                        <td className="py-0.5 text-right">${(item.total_price || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {state.extracted_items.length > 3 && (
                      <tr>
                        <td colSpan={3} className="text-slate-400 italic py-0.5">
                          + {state.extracted_items.length - 3} more items...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>${(state.pricing?.subtotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Delivery & Setup:</span>
                  <span>${(state.pricing?.delivery_and_setup || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Taxes (8.875%):</span>
                  <span>${(state.pricing?.tax_amount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-amber-400 font-bold text-xs pt-1 border-t border-slate-800">
                  <span>GRAND TOTAL:</span>
                  <span>${(state.pricing?.grand_total || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRunExport}
                disabled={isExporting}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-2 cursor-pointer"
              >
                {isExporting ? (
                  <span>Generating Google Sheet...</span>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Google Sheet</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 space-y-4">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-7 h-7" />
            </div>

            <div>
              <h4 className="text-lg font-bold text-slate-900">Google Spreadsheet Ready!</h4>
              <p className="text-xs text-slate-500 mt-1">{exportResult.message}</p>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2 max-w-lg mx-auto">
              <span className="text-xs text-emerald-700 font-mono font-semibold truncate">
                {window.location.origin}{exportResult.spreadsheet_url}
              </span>
              <button
                onClick={handleCopyLink}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-xs text-slate-700 shrink-0 flex items-center gap-1 font-semibold cursor-pointer shadow-xs"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? 'Copied!' : 'Copy Link'}</span>
              </button>
            </div>

            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <a
                href={exportResult.spreadsheet_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 shadow-sm cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open Google Sheet Viewer</span>
              </a>

              <a
                href={`/api/quote/download-csv?session_id=${encodeURIComponent(state.session_id)}`}
                download
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>Download .CSV File</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
