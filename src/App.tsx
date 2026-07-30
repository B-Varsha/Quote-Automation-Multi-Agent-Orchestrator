import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { InquiryInput } from './components/InquiryInput';
import { SupervisorStatusCard } from './components/SupervisorStatusCard';
import { ItemsTable } from './components/ItemsTable';
import { PortionRulesPanel } from './components/PortionRulesPanel';
import { PricingDeliveryAdmin } from './components/PricingDeliveryAdmin';
import { GoogleSheetsExportModal } from './components/GoogleSheetsExportModal';
import { MCPTraceDrawer } from './components/MCPTraceDrawer';
import { QuoteSessionState, MenuDatabase, ExtractedItem } from './types';
import { FileSpreadsheet, Sparkles, CheckCircle2, ArrowRight, Lock, Loader2 } from 'lucide-react';

export default function App() {
  const [sessionState, setSessionState] = useState<QuoteSessionState | null>(null);
  const [menuDb, setMenuDb] = useState<MenuDatabase | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingWorker2, setIsLoadingWorker2] = useState<boolean>(false);
  const [isLoadingWorker3, setIsLoadingWorker3] = useState<boolean>(false);
  const [isUpdatingDelivery, setIsUpdatingDelivery] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [isMcpOpen, setIsMcpOpen] = useState<boolean>(false);

  // Fetch Maharaja Catering Menu Database on mount
  useEffect(() => {
    fetch('/api/menu')
      .then((res) => res.json())
      .then((data) => setMenuDb(data))
      .catch((err) => console.error('Failed to load menu database:', err));
  }, []);

  const handleProcessText = async (text: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/quote/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionState?.session_id,
          inquiry_text: text,
        }),
      });
      const data: QuoteSessionState = await res.json();
      setSessionState(data);
    } catch (err) {
      console.error('Error processing inquiry text:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessImage = async (file: File, notes: string) => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (sessionState?.session_id) {
        formData.append('session_id', sessionState.session_id);
      }
      formData.append('additional_notes', notes);

      const res = await fetch('/api/quote/process-image', {
        method: 'POST',
        body: formData,
      });
      const data: QuoteSessionState = await res.json();
      setSessionState(data);
    } catch (err) {
      console.error('Error processing inquiry image:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunWorker2 = async () => {
    if (!sessionState?.session_id) return;
    setIsLoadingWorker2(true);
    try {
      const res = await fetch('/api/quote/run-worker-2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionState.session_id }),
      });
      const data: QuoteSessionState = await res.json();
      setSessionState(data);
    } catch (err) {
      console.error('Error running Worker 2:', err);
    } finally {
      setIsLoadingWorker2(false);
    }
  };

  const handleRunWorker3 = async () => {
    if (!sessionState?.session_id) return;
    setIsLoadingWorker3(true);
    try {
      const res = await fetch('/api/quote/run-worker-3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionState.session_id }),
      });
      const data: QuoteSessionState = await res.json();
      setSessionState(data);
    } catch (err) {
      console.error('Error running Worker 3:', err);
    } finally {
      setIsLoadingWorker3(false);
    }
  };

  const handleUpdateFields = async (updatedFields: Partial<QuoteSessionState>) => {
    if (!sessionState) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/quote/update-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionState.session_id,
          customer_name: updatedFields.customer_name !== undefined ? updatedFields.customer_name : sessionState.customer_name,
          event_date: updatedFields.event_date !== undefined ? updatedFields.event_date : sessionState.event_date,
          event_time: updatedFields.event_time !== undefined ? updatedFields.event_time : sessionState.event_time,
          guest_count: updatedFields.guest_count !== undefined ? updatedFields.guest_count : sessionState.guest_count,
          fulfillment_type: updatedFields.fulfillment_type !== undefined ? updatedFields.fulfillment_type : sessionState.fulfillment_type,
          event_location: updatedFields.event_location !== undefined ? updatedFields.event_location : sessionState.event_location,
        }),
      });
      const data: QuoteSessionState = await res.json();
      setSessionState(data);
    } catch (err) {
      console.error('Error updating details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateQuantity = (index: number, newQty: number) => {
    if (!sessionState) return;
    const updatedItems = [...sessionState.extracted_items];
    const item = updatedItems[index];
    item.quantity = newQty;
    item.total_price = Number(((item.unit_price || 0) * newQty).toFixed(2));

    // Recalculate subtotal & pricing locally
    const foodSubtotal = updatedItems.reduce((acc, curr) => acc + (curr.total_price || 0), 0);
    const subtotal = Number((foodSubtotal + (sessionState.delivery?.total_plate_cost || 0)).toFixed(2));
    const afterDiscount = Math.max(0, subtotal - (sessionState.delivery?.discount || 0));
    const taxable = Number((afterDiscount + (sessionState.pricing?.delivery_and_setup || 0)).toFixed(2));
    const tax = Number((taxable * (sessionState.pricing?.tax_rate || 0.08875)).toFixed(2));
    const grandTotal = Number((taxable + tax).toFixed(2));

    setSessionState({
      ...sessionState,
      extracted_items: updatedItems,
      pricing: {
        ...sessionState.pricing,
        subtotal,
        taxable_amount: taxable,
        tax_amount: tax,
        grand_total: grandTotal,
      },
    });
  };

  const handleRemoveItem = (index: number) => {
    if (!sessionState) return;
    const updatedItems = sessionState.extracted_items.filter((_, i) => i !== index);
    const foodSubtotal = updatedItems.reduce((acc, curr) => acc + (curr.total_price || 0), 0);
    const subtotal = Number((foodSubtotal + (sessionState.delivery?.total_plate_cost || 0)).toFixed(2));
    const afterDiscount = Math.max(0, subtotal - (sessionState.delivery?.discount || 0));
    const taxable = Number((afterDiscount + (sessionState.pricing?.delivery_and_setup || 0)).toFixed(2));
    const tax = Number((taxable * (sessionState.pricing?.tax_rate || 0.08875)).toFixed(2));
    const grandTotal = Number((taxable + tax).toFixed(2));

    setSessionState({
      ...sessionState,
      extracted_items: updatedItems,
      pricing: {
        ...sessionState.pricing,
        subtotal,
        taxable_amount: taxable,
        tax_amount: tax,
        grand_total: grandTotal,
      },
    });
  };

  const handleAddItem = (newItem: ExtractedItem) => {
    if (!sessionState) return;
    const updatedItems = [...sessionState.extracted_items, newItem];
    handleUpdateAllItems(updatedItems);
  };

  const handleUpdateAllItems = async (updatedItems: ExtractedItem[]) => {
    if (!sessionState) return;
    try {
      const res = await fetch('/api/quote/update-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionState.session_id,
          items: updatedItems,
        }),
      });
      const data: QuoteSessionState = await res.json();
      setSessionState(data);
    } catch (err) {
      console.error('Error updating items:', err);
    }
  };

  const handleConfirmDelivery = async (updated: {
    estimated_miles: number;
    delivery_fee_override?: number;
    setup_fee_override?: number;
    plate_type: string;
    discount: number;
  }) => {
    if (!sessionState) return;
    setIsUpdatingDelivery(true);
    try {
      const res = await fetch('/api/quote/confirm-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionState.session_id,
          estimated_miles: updated.estimated_miles,
          delivery_fee_override: updated.delivery_fee_override,
          setup_fee_override: updated.setup_fee_override,
          plate_type: updated.plate_type,
          discount: updated.discount,
        }),
      });
      const data: QuoteSessionState = await res.json();
      setSessionState(data);
    } catch (err) {
      console.error('Error confirming delivery:', err);
    } finally {
      setIsUpdatingDelivery(false);
    }
  };

  const handleExportSheet = async (title?: string) => {
    if (!sessionState) throw new Error('No session');
    const res = await fetch('/api/quote/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionState.session_id,
        spreadsheet_title: title,
      }),
    });
    const data = await res.json();
    return data;
  };

  const handleReset = () => {
    setSessionState(null);
  };

  const isWorker1Done = Boolean(sessionState && sessionState.completed_workers?.includes(1));
  const isWorker2Done = Boolean(sessionState && sessionState.completed_workers?.includes(2));
  const isWorker3Done = Boolean(sessionState && sessionState.completed_workers?.includes(3));
  const isWorker4Done = Boolean(sessionState && sessionState.completed_workers?.includes(4));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased selection:bg-amber-500/20 selection:text-amber-900">
      <Navbar
        state={sessionState}
        onReset={handleReset}
        onToggleMcp={() => setIsMcpOpen(!isMcpOpen)}
        isMcpOpen={isMcpOpen}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Sequential Multi-Worker Execution Tracker Bar */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold">
            {/* Step 1 */}
            <div className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${isWorker1Done ? 'bg-amber-600 text-white shadow-xs' : 'bg-slate-100 text-slate-400'}`}>
                {isWorker1Done ? '✓' : '1'}
              </span>
              <span className={isWorker1Done ? 'text-amber-900 font-bold' : 'text-slate-500'}>
                Worker 1: Extraction
              </span>
            </div>
            <div className="hidden sm:block text-slate-300">➔</div>

            {/* Step 2 */}
            <div className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${isWorker2Done ? 'bg-amber-600 text-white shadow-xs' : isWorker1Done ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-400'}`}>
                {isWorker2Done ? '✓' : '2'}
              </span>
              <span className={isWorker2Done ? 'text-amber-900 font-bold' : isWorker1Done ? 'text-amber-800 font-semibold' : 'text-slate-400'}>
                Worker 2: Portion Scaling
              </span>
            </div>
            <div className="hidden sm:block text-slate-300">➔</div>

            {/* Step 3 */}
            <div className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${isWorker3Done ? 'bg-amber-600 text-white shadow-xs' : isWorker2Done ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-400'}`}>
                {isWorker3Done ? '✓' : '3'}
              </span>
              <span className={isWorker3Done ? 'text-amber-900 font-bold' : isWorker2Done ? 'text-amber-800 font-semibold' : 'text-slate-400'}>
                Worker 3: Pricing & Delivery
              </span>
            </div>
            <div className="hidden sm:block text-slate-300">➔</div>

            {/* Step 4 */}
            <div className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${isWorker4Done ? 'bg-emerald-600 text-white shadow-xs' : isWorker3Done ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-400'}`}>
                {isWorker4Done ? '✓' : '4'}
              </span>
              <span className={isWorker4Done ? 'text-emerald-800 font-bold' : isWorker3Done ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                Worker 4: Google Sheets
              </span>
            </div>
          </div>
        </div>

        {/* Worker 1: Ingestion Panel */}
        <InquiryInput
          onProcessText={handleProcessText}
          onProcessImage={handleProcessImage}
          isLoading={isLoading}
        />

        {/* Sequential Step Execution Flow */}
        {sessionState && (
          <div className="space-y-8">
            {/* WORKER 1 OUTPUT: Customer & Event Details + Menu Items Table */}
            <div className="space-y-6 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="bg-amber-100 text-amber-900 font-bold text-xs px-2.5 py-1 rounded-full border border-amber-200">
                    Worker 1 Active
                  </span>
                  <h2 className="text-sm font-bold text-slate-900">
                    Ingestion, Extraction & Grounded Menu Matching
                  </h2>
                </div>
                <span className="text-xs text-amber-700 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Worker 1 Done
                </span>
              </div>

              {/* Event & Customer Info */}
              <SupervisorStatusCard state={sessionState} onUpdateFields={handleUpdateFields} />

              {/* Items Table */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Extracted Food Items (Grounded in Price Book)
                </h3>
                <ItemsTable
                  items={sessionState.extracted_items}
                  menuDb={menuDb}
                  onUpdateQuantity={handleUpdateQuantity}
                  onRemoveItem={handleRemoveItem}
                  onAddItem={handleAddItem}
                  onUpdateAllItems={handleUpdateAllItems}
                />
              </div>

              {/* STEP 1 -> STEP 2 TRANSITION BUTTON */}
              {!isWorker2Done && (
                <div className="bg-amber-50 border-2 border-amber-300/80 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs mt-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-600 text-white font-bold text-xs">✓</span>
                      <h3 className="text-sm font-bold text-amber-900">Worker 1: Extraction & Menu Grounding Complete</h3>
                    </div>
                    <p className="text-xs text-amber-800 mt-1">
                      Review extracted customer details and menu items above. Click below to proceed to Worker 2 for portion rules and tray scaling.
                    </p>
                  </div>
                  <button
                    onClick={handleRunWorker2}
                    disabled={isLoadingWorker2}
                    className="w-full sm:w-auto px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  >
                    {isLoadingWorker2 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span>Run Worker 2: Portion & Scaling Agent ➔</span>
                  </button>
                </div>
              )}
            </div>

            {/* WORKER 2 OUTPUT: Portion Rules & Tray Scaling Math */}
            <div className={`space-y-6 bg-white border rounded-2xl p-6 shadow-sm transition-all ${isWorker2Done ? 'border-slate-200/90' : 'border-slate-200 bg-slate-50/50 opacity-60'}`}>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-xs px-2.5 py-1 rounded-full border ${isWorker2Done ? 'bg-amber-100 text-amber-900 border-amber-200' : 'bg-slate-200 text-slate-600 border-slate-300'}`}>
                    Worker 2 {isWorker2Done ? 'Complete' : 'Pending'}
                  </span>
                  <h2 className="text-sm font-bold text-slate-900">
                    Portion & Scaling Agent (Catering Rule Math)
                  </h2>
                </div>
                {isWorker2Done ? (
                  <span className="text-xs text-amber-700 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Worker 2 Done
                  </span>
                ) : (
                  <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" />
                    Awaiting Worker 1 Click
                  </span>
                )}
              </div>

              {isWorker2Done ? (
                <>
                  <PortionRulesPanel
                    guestCount={sessionState.guest_count}
                    portionRecommendations={sessionState.portion_recommendations}
                  />

                  {/* STEP 2 -> STEP 3 TRANSITION BUTTON */}
                  {!isWorker3Done && (
                    <div className="bg-amber-50 border-2 border-amber-300/80 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs mt-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-600 text-white font-bold text-xs">✓</span>
                          <h3 className="text-sm font-bold text-amber-900">Worker 2: Portion & Tray Scaling Complete</h3>
                        </div>
                        <p className="text-xs text-amber-800 mt-1">
                          Tray quantities and guest portion rules calculated. Click below to proceed to Worker 3 for pricing, delivery fees, and tax math.
                        </p>
                      </div>
                      <button
                        onClick={handleRunWorker3}
                        disabled={isLoadingWorker3}
                        className="w-full sm:w-auto px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                      >
                        {isLoadingWorker3 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        <span>Run Worker 3: Pricing & Delivery Agent ➔</span>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-6 text-center text-slate-500 text-xs">
                  Click <strong className="text-amber-800 font-semibold">"Run Worker 2: Portion & Scaling Agent"</strong> above to calculate tray counts and guest portions.
                </div>
              )}
            </div>

            {/* WORKER 3 OUTPUT: Pricing, Taxes, Delivery, & Total Math */}
            <div className={`space-y-6 bg-white border rounded-2xl p-6 shadow-sm transition-all ${isWorker3Done ? 'border-slate-200/90' : 'border-slate-200 bg-slate-50/50 opacity-60'}`}>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-xs px-2.5 py-1 rounded-full border ${isWorker3Done ? 'bg-amber-100 text-amber-900 border-amber-200' : 'bg-slate-200 text-slate-600 border-slate-300'}`}>
                    Worker 3 {isWorker3Done ? 'Complete' : 'Pending'}
                  </span>
                  <h2 className="text-sm font-bold text-slate-900">
                    Pricing & Delivery Agent (Financial Calculations)
                  </h2>
                </div>
                {isWorker3Done ? (
                  <span className="text-xs text-amber-700 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Worker 3 Done
                  </span>
                ) : (
                  <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" />
                    Awaiting Worker 2 Click
                  </span>
                )}
              </div>

              {isWorker3Done ? (
                <>
                  <PricingDeliveryAdmin
                    delivery={sessionState.delivery}
                    pricing={sessionState.pricing}
                    guestCount={sessionState.guest_count}
                    fulfillmentType={sessionState.fulfillment_type}
                    onConfirmDelivery={handleConfirmDelivery}
                    isUpdating={isUpdatingDelivery}
                  />

                  {/* STEP 3 -> STEP 4 TRANSITION BUTTON */}
                  {!isWorker4Done && (
                    <div className="bg-emerald-50 border-2 border-emerald-300/80 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs mt-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs">✓</span>
                          <h3 className="text-sm font-bold text-emerald-900">Worker 3: Pricing & Delivery Verified</h3>
                        </div>
                        <p className="text-xs text-emerald-800 mt-1">
                          All financial calculations, delivery fees, and taxes verified. Everything is ready to proceed to Worker 4 for Google Sheets export.
                        </p>
                      </div>
                      <button
                        onClick={() => setShowExportModal(true)}
                        className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>Run Worker 4: Export to Google Sheet ➔</span>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-6 text-center text-slate-500 text-xs">
                  Click <strong className="text-amber-800 font-semibold">"Run Worker 3: Pricing & Delivery Agent"</strong> above after Worker 2 completes.
                </div>
              )}
            </div>

            {/* WORKER 4 OUTPUT: Google Sheets Export Status */}
            {isWorker4Done && (
              <div className="bg-emerald-50 border-2 border-emerald-300/90 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-200">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-emerald-950">Worker 4: Google Sheets Quote Exported</h3>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      The official catering quote spreadsheet has been generated and is ready for distribution.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowExportModal(true)}
                  className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>View / Re-export Quote Sheet</span>
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {showExportModal && sessionState && (
        <GoogleSheetsExportModal
          state={sessionState}
          onExport={handleExportSheet}
          onClose={() => setShowExportModal(false)}
        />
      )}

      <MCPTraceDrawer
        state={sessionState}
        isOpen={isMcpOpen}
        onClose={() => setIsMcpOpen(false)}
      />
    </div>
  );
}

