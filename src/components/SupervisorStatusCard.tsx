import React, { useState } from 'react';
import { User, Calendar, Clock, Users, MapPin, AlertCircle, ShieldCheck, Edit3, ShoppingBag, Truck } from 'lucide-react';
import { QuoteSessionState } from '../types';

interface SupervisorStatusCardProps {
  state: QuoteSessionState;
  onUpdateFields: (updated: Partial<QuoteSessionState>) => void;
}

export const SupervisorStatusCard: React.FC<SupervisorStatusCardProps> = ({ state, onUpdateFields }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [customerName, setCustomerName] = useState(state.customer_name || '');
  const [eventDate, setEventDate] = useState(state.event_date || '');
  const [eventTime, setEventTime] = useState(state.event_time || '');
  const [guestCount, setGuestCount] = useState<number | ''>(state.guest_count || '');
  const [fulfillmentType, setFulfillmentType] = useState<'pickup' | 'delivery' | null>(state.fulfillment_type || null);
  const [eventLocation, setEventLocation] = useState(state.event_location || '');

  const missing = state.missing_fields || [];

  const handleSave = () => {
    onUpdateFields({
      customer_name: customerName,
      event_date: eventDate,
      event_time: eventTime,
      guest_count: guestCount ? Number(guestCount) : null,
      fulfillment_type: fulfillmentType,
      event_location: eventLocation,
    });
    setIsEditing(false);
  };

  const handleQuickFulfillment = (type: 'pickup' | 'delivery') => {
    setFulfillmentType(type);
    onUpdateFields({
      fulfillment_type: type,
    });
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-200/60">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Supervisor Agent Checkpoint</h3>
            <p className="text-[11px] text-slate-500">Mandatory Field Validation & Session State</p>
          </div>
        </div>

        <button
          onClick={() => setIsEditing(!isEditing)}
          className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:text-slate-900 hover:bg-slate-200 border border-slate-200 flex items-center gap-1 font-semibold transition-colors cursor-pointer"
        >
          <Edit3 className="w-3 h-3" />
          <span>{isEditing ? 'Cancel' : 'Edit Details'}</span>
        </button>
      </div>

      {state.prompt_for_missing && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-900">Action Required: Missing Information</p>
              <p className="text-xs text-amber-800 mt-0.5">{state.prompt_for_missing}</p>
            </div>
          </div>

          {missing.includes('fulfillment_type') && (
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <span className="text-[11px] text-amber-800 font-semibold">Specify:</span>
              <button
                onClick={() => handleQuickFulfillment('pickup')}
                className="px-2.5 py-1 bg-white hover:bg-amber-600 hover:text-white text-amber-800 text-xs font-semibold rounded-lg border border-amber-300 flex items-center gap-1 shadow-xs transition-all cursor-pointer"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Pickup</span>
              </button>
              <button
                onClick={() => handleQuickFulfillment('delivery')}
                className="px-2.5 py-1 bg-white hover:bg-amber-600 hover:text-white text-amber-800 text-xs font-semibold rounded-lg border border-amber-300 flex items-center gap-1 shadow-xs transition-all cursor-pointer"
              >
                <Truck className="w-3.5 h-3.5" />
                <span>Delivery</span>
              </button>
            </div>
          )}
        </div>
      )}

      {isEditing ? (
        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Customer Name *</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Varun Sharma"
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none focus:border-amber-600"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Guest Count *</label>
              <input
                type="number"
                value={guestCount}
                onChange={(e) => setGuestCount(e.target.value ? Number(e.target.value) : '')}
                placeholder="e.g. 20"
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none focus:border-amber-600"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Order Fulfillment *</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setFulfillmentType('pickup')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    fulfillmentType === 'pickup'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Pickup</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFulfillmentType('delivery')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    fulfillmentType === 'delivery'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Delivery</span>
                </button>
              </div>
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Event Date *</label>
              <input
                type="text"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                placeholder="e.g. August 4, 2026"
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none focus:border-amber-600"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Event Time *</label>
              <input
                type="text"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                placeholder="e.g. 5:00 PM"
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none focus:border-amber-600"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">
                {fulfillmentType === 'delivery' ? 'Delivery Address *' : 'Location (Optional for Pickup)'}
              </label>
              <input
                type="text"
                value={eventLocation}
                onChange={(e) => setEventLocation(e.target.value)}
                placeholder={fulfillmentType === 'delivery' ? 'e.g. 125 Grand Blvd, San Jose, CA' : 'Maharaja Restaurant Pickup'}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none focus:border-amber-600"
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-xs transition-all cursor-pointer"
            >
              Save & Re-validate
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <div className={`p-3 rounded-xl border ${missing.includes('customer_name') ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-slate-50 border-slate-200/80 text-slate-800'}`}>
            <div className="flex items-center gap-1.5 text-slate-500 mb-1 font-semibold">
              <User className="w-3.5 h-3.5" />
              <span>Customer</span>
            </div>
            <p className="font-bold text-slate-900 truncate">{state.customer_name || 'Not Provided'}</p>
          </div>

          <div className={`p-3 rounded-xl border ${missing.includes('guest_count') ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-slate-50 border-slate-200/80 text-slate-800'}`}>
            <div className="flex items-center gap-1.5 text-slate-500 mb-1 font-semibold">
              <Users className="w-3.5 h-3.5" />
              <span>Guest Count</span>
            </div>
            <p className="font-bold text-slate-900">{state.guest_count ? `${state.guest_count} Guests` : 'Not Provided'}</p>
          </div>

          <div className={`p-3 rounded-xl border ${missing.includes('fulfillment_type') ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-slate-50 border-slate-200/80 text-slate-800'}`}>
            <div className="flex items-center gap-1.5 text-slate-500 mb-1 font-semibold">
              {state.fulfillment_type === 'pickup' ? (
                <ShoppingBag className="w-3.5 h-3.5 text-amber-600" />
              ) : (
                <Truck className="w-3.5 h-3.5 text-amber-600" />
              )}
              <span>Fulfillment</span>
            </div>
            <p className="font-bold capitalize">
              {state.fulfillment_type === 'pickup' ? (
                <span className="text-amber-800 font-bold">Store Pickup</span>
              ) : state.fulfillment_type === 'delivery' ? (
                <span className="text-amber-800 font-bold">Catering Delivery</span>
              ) : (
                <span className="text-slate-500 font-medium">Pending Choice</span>
              )}
            </p>
          </div>

          <div className={`p-3 rounded-xl border ${missing.includes('event_date') ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-slate-50 border-slate-200/80 text-slate-800'}`}>
            <div className="flex items-center gap-1.5 text-slate-500 mb-1 font-semibold">
              <Calendar className="w-3.5 h-3.5" />
              <span>Date</span>
            </div>
            <p className="font-bold text-slate-900 truncate">{state.event_date || 'Not Provided'}</p>
          </div>

          <div className={`p-3 rounded-xl border ${missing.includes('event_time') ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-slate-50 border-slate-200/80 text-slate-800'}`}>
            <div className="flex items-center gap-1.5 text-slate-500 mb-1 font-semibold">
              <Clock className="w-3.5 h-3.5" />
              <span>Time</span>
            </div>
            <p className="font-bold text-slate-900 truncate">{state.event_time || 'Not Provided'}</p>
          </div>
        </div>
      )}
    </div>
  );
};
