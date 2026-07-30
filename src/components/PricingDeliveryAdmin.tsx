import React, { useState } from 'react';
import { DollarSign, Truck, UtensilsCrossed, ShieldAlert, Check, Percent } from 'lucide-react';
import { DeliveryDetails, QuoteBreakdown } from '../types';

interface PricingDeliveryAdminProps {
  delivery: DeliveryDetails;
  pricing: QuoteBreakdown;
  guestCount: number | null;
  fulfillmentType?: 'pickup' | 'delivery' | null;
  onConfirmDelivery: (updated: {
    estimated_miles: number;
    delivery_fee_override?: number;
    setup_fee_override?: number;
    plate_type: string;
    discount: number;
  }) => Promise<void>;
  isUpdating: boolean;
}

export const PricingDeliveryAdmin: React.FC<PricingDeliveryAdminProps> = ({
  delivery,
  pricing,
  guestCount,
  fulfillmentType = 'delivery',
  onConfirmDelivery,
  isUpdating,
}) => {
  const [miles, setMiles] = useState(delivery.estimated_miles || 10);
  const [plateType, setPlateType] = useState(delivery.plate_type || 'disposable_plates');
  const [discount, setDiscount] = useState(delivery.discount || 0);
  const [deliveryFeeOverride, setDeliveryFeeOverride] = useState<string>('');
  const [setupFeeOverride, setSetupFeeOverride] = useState<string>('');

  const handleConfirm = async () => {
    await onConfirmDelivery({
      estimated_miles: Number(miles),
      delivery_fee_override: deliveryFeeOverride !== '' ? Number(deliveryFeeOverride) : undefined,
      setup_fee_override: setupFeeOverride !== '' ? Number(setupFeeOverride) : undefined,
      plate_type: plateType,
      discount: Number(discount),
    });
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-200/60">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Worker 3: Pricing & Delivery Agent</h3>
            <p className="text-[11px] text-slate-500">Admin Delivery Fees, Setup, Plate Sets & Discount Overrides</p>
          </div>
        </div>

        <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
          Admin Checkpoint
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-5">
        {/* Left Column: Delivery & Plate Options */}
        <div className="space-y-4">
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            {fulfillmentType === 'pickup' ? (
              <div className="text-xs">
                <div className="flex items-center gap-2 text-amber-800 font-bold mb-1">
                  <UtensilsCrossed className="w-4 h-4 text-amber-600" />
                  <span>Store Pickup Order ($0 Delivery / Setup Fee)</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Customer will pick up order directly at Maharaja Catering. No delivery distance or setup charges apply.
                </p>
              </div>
            ) : fulfillmentType === 'delivery' ? (
              <>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-amber-600" />
                    Delivery Distance: {miles} mi
                  </label>
                  <span className="text-[10px] text-slate-500 font-semibold">
                    {miles <= 15 ? '$50 Local' : miles <= 30 ? '$100 Extended' : '$100 + $2.50/mi'}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="60"
                  value={miles}
                  onChange={(e) => setMiles(Number(e.target.value))}
                  className="w-full accent-amber-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-medium">
                  <span>0 mi (Local)</span>
                  <span>15 mi</span>
                  <span>30 mi (Extended)</span>
                  <span>60 mi</span>
                </div>
              </>
            ) : (
              <div className="text-xs">
                <p className="text-amber-800 font-bold">Order Fulfillment Choice Required</p>
                <p className="text-[11px] text-slate-600">
                  Please specify whether this order is for Pickup or Delivery to finalize delivery fees.
                </p>
              </div>
            )}
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <label className="block text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <UtensilsCrossed className="w-3.5 h-3.5 text-amber-600" />
              Plate & Cutlery Package:
            </label>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setPlateType('disposable_plates')}
                className={`p-2 rounded-lg text-left border transition-all cursor-pointer ${
                  plateType === 'disposable_plates'
                    ? 'bg-amber-500 text-slate-950 border-amber-600 font-bold shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <p className="font-bold text-[11px]">Standard</p>
                <p className={`text-[10px] ${plateType === 'disposable_plates' ? 'text-slate-900' : 'text-slate-500'}`}>$2.50 / guest</p>
              </button>

              <button
                type="button"
                onClick={() => setPlateType('eco_plates')}
                className={`p-2 rounded-lg text-left border transition-all cursor-pointer ${
                  plateType === 'eco_plates'
                    ? 'bg-amber-500 text-slate-950 border-amber-600 font-bold shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <p className="font-bold text-[11px]">Eco Bamboo</p>
                <p className={`text-[10px] ${plateType === 'eco_plates' ? 'text-slate-900' : 'text-slate-500'}`}>$4.50 / guest</p>
              </button>

              <button
                type="button"
                onClick={() => setPlateType('none')}
                className={`p-2 rounded-lg text-left border transition-all cursor-pointer ${
                  plateType === 'none'
                    ? 'bg-amber-500 text-slate-950 border-amber-600 font-bold shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <p className="font-bold text-[11px]">None</p>
                <p className={`text-[10px] ${plateType === 'none' ? 'text-slate-900' : 'text-slate-500'}`}>$0.00</p>
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
              Plate Total for {guestCount || 0} guests: <span className="font-bold text-slate-900">${(delivery?.total_plate_cost || 0).toFixed(2)}</span>
            </p>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Discount ($)</label>
              <input
                type="number"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 font-mono focus:outline-none focus:border-amber-600"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Fee Overrides</label>
              <input
                type="number"
                placeholder="Delivery Override"
                value={deliveryFeeOverride}
                onChange={(e) => setDeliveryFeeOverride(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 font-mono focus:outline-none focus:border-amber-600 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Financial Grand Total Summary Card */}
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 text-white flex flex-col justify-between shadow-md">
          <div>
            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-4 pb-2 border-b border-slate-800 flex items-center justify-between">
              <span>Official Quote Financial Summary</span>
              <DollarSign className="w-4 h-4 text-amber-400" />
            </h4>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Food & Services Subtotal:</span>
                <span className="font-mono font-bold text-white">${(pricing?.subtotal || 0).toFixed(2)}</span>
              </div>

              {(pricing?.discount || 0) > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Special Discount:</span>
                  <span className="font-mono font-bold">-${(pricing?.discount || 0).toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-300">
                <span>Delivery & Setup Fee:</span>
                <span className="font-mono font-bold text-white">${(pricing?.delivery_and_setup || 0).toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>Estimated Taxes (8.875%):</span>
                <span className="font-mono text-slate-300">${(pricing?.tax_amount || 0).toFixed(2)}</span>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
                <span className="text-sm font-bold text-white">Grand Total:</span>
                <span className="text-xl font-bold font-mono text-amber-400">${(pricing?.grand_total || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleConfirm}
            disabled={isUpdating}
            className="mt-5 w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            {isUpdating ? (
              <span>Updating Calculations...</span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Confirm Delivery & Lock Pricing</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
