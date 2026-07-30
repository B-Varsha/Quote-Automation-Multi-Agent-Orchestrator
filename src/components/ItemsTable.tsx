import React, { useState } from 'react';
import { ShoppingBag, Plus, Trash2, CheckCircle2, AlertTriangle, HelpCircle, PlusCircle, Sparkles, X, Check } from 'lucide-react';
import { ExtractedItem, ItemSuggestion, MenuDatabase } from '../types';

interface ItemsTableProps {
  items: ExtractedItem[];
  menuDb: MenuDatabase | null;
  onUpdateQuantity: (index: number, newQty: number) => void;
  onRemoveItem: (index: number) => void;
  onAddItem: (newItem: ExtractedItem) => void;
  onUpdateAllItems?: (newItems: ExtractedItem[]) => void;
}

export const ItemsTable: React.FC<ItemsTableProps> = ({
  items,
  menuDb,
  onUpdateQuantity,
  onRemoveItem,
  onAddItem,
  onUpdateAllItems,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeAddTab, setActiveAddTab] = useState<'menu' | 'custom'>('menu');
  const [searchTerm, setSearchTerm] = useState('');

  // State for Custom Item form in Add Modal
  const [newCustomName, setNewCustomName] = useState('');
  const [newCustomPrice, setNewCustomPrice] = useState<number>(100);
  const [newCustomUnitType, setNewCustomUnitType] = useState<string>('tray_large');
  const [newCustomNotes, setNewCustomNotes] = useState('');

  // State for Inline Human-In-The-Loop Custom Edit per item
  const [activeCustomEditIndex, setActiveCustomEditIndex] = useState<number | null>(null);
  const [customEditName, setCustomEditName] = useState('');
  const [customEditPrice, setCustomEditPrice] = useState<number>(100);
  const [customEditUnitType, setCustomEditUnitType] = useState<string>('tray_large');

  const allMenuItems = menuDb
    ? menuDb.categories.flatMap((cat) => cat.items.map((i) => ({ ...i, categoryName: cat.name })))
    : [];

  const filteredMenuItems = allMenuItems.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const reviewItems = items.filter((i) => i.requires_human_review || !i.matched);

  // 1. Confirm a suggested menu match for a low-confidence/unrecognized dish
  const handleSelectSuggestion = (itemIndex: number, suggestion: ItemSuggestion) => {
    const updatedItems = [...items];
    const targetItem = updatedItems[itemIndex];
    const qty = targetItem.quantity || 1;

    updatedItems[itemIndex] = {
      ...targetItem,
      item_id: suggestion.id,
      item_name: suggestion.name,
      category: suggestion.category,
      unit_type: suggestion.unit_type || 'tray_large',
      unit_price: suggestion.unit_price,
      total_price: Number(((suggestion.unit_price || 0) * qty).toFixed(2)),
      matched: true,
      requires_human_review: false,
      notes: `Matched verified item from Maharaja Price Book (${suggestion.name})`,
      match_confidence: 100,
    };

    if (onUpdateAllItems) {
      onUpdateAllItems(updatedItems);
    }
  };

  // 2. Confirm custom item details for an unrecognized dish
  const handleConfirmCustomForReviewItem = (itemIndex: number) => {
    if (!customEditName.trim()) return;

    const updatedItems = [...items];
    const targetItem = updatedItems[itemIndex];
    const qty = targetItem.quantity || 1;

    updatedItems[itemIndex] = {
      ...targetItem,
      item_name: customEditName.trim(),
      unit_type: customEditUnitType,
      unit_price: Number(customEditPrice || 0),
      total_price: Number(((Number(customEditPrice) || 0) * qty).toFixed(2)),
      matched: false,
      requires_human_review: false,
      notes: `Custom dish rate ($${(Number(customEditPrice) || 0).toFixed(2)} / ${(customEditUnitType || 'tray_large').replace('_', ' ')}) confirmed by user`,
    };

    setActiveCustomEditIndex(null);
    if (onUpdateAllItems) {
      onUpdateAllItems(updatedItems);
    }
  };

  const handleOpenCustomEdit = (index: number, item: ExtractedItem) => {
    setActiveCustomEditIndex(index);
    setCustomEditName(item.item_name);
    setCustomEditPrice(item.unit_price || 100);
    setCustomEditUnitType(item.unit_type || 'tray_large');
  };

  // 3. Handle adding dish from menu modal
  const handleSelectMenuItem = (menuItem: any) => {
    const unitPrice = menuItem.large_tray_price || menuItem.unit_price || 100;
    const newItem: ExtractedItem = {
      item_id: menuItem.id,
      item_name: menuItem.name,
      category: menuItem.category,
      quantity: 1,
      unit_type: menuItem.unit_type || 'tray_large',
      unit_price: unitPrice,
      total_price: unitPrice,
      matched: true,
      requires_human_review: false,
      notes: 'Added from Maharaja Catering Price Book',
      match_confidence: 100,
    };
    onAddItem(newItem);
    setShowAddModal(false);
  };

  // 4. Handle adding brand new custom item
  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomName.trim()) return;

    const newItem: ExtractedItem = {
      item_id: `custom_${Date.now()}`,
      item_name: newCustomName.trim(),
      category: 'custom',
      quantity: 1,
      unit_type: newCustomUnitType,
      unit_price: Number(newCustomPrice),
      total_price: Number(newCustomPrice),
      matched: false,
      requires_human_review: false,
      notes: newCustomNotes || 'Custom off-menu specialty dish',
    };

    onAddItem(newItem);
    setNewCustomName('');
    setNewCustomPrice(100);
    setNewCustomNotes('');
    setShowAddModal(false);
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
      {/* Table Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-200/60">
            <ShoppingBag className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Itemized Catering Menu & Quantities</h3>
            <p className="text-[11px] text-slate-500">Worker 1 (Extractor) Grounded Items & Maharaja Catering Price Book</p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(!showAddModal)}
          className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Dish / Custom Item</span>
        </button>
      </div>

      {/* Modal / Panel for Adding Dishes or Custom Items */}
      {showAddModal && (
        <div className="p-4 bg-slate-50 border border-amber-200 rounded-xl shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveAddTab('menu')}
                className={`text-xs font-bold px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  activeAddTab === 'menu'
                    ? 'bg-amber-600 text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                From Menu Catalog
              </button>
              <button
                onClick={() => setActiveAddTab('custom')}
                className={`text-xs font-bold px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  activeAddTab === 'custom'
                    ? 'bg-amber-600 text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                + Add Custom / Off-Menu Dish
              </button>
            </div>
            <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          {activeAddTab === 'menu' ? (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-slate-600 font-medium">Select dish from Maharaja Catering Price Book:</span>
                <input
                  type="text"
                  placeholder="Filter menu..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                {filteredMenuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelectMenuItem(item)}
                    className="text-left p-2 rounded-lg bg-white hover:bg-amber-50/80 border border-slate-200 text-xs flex justify-between items-center transition-colors cursor-pointer group"
                  >
                    <div>
                      <p className="font-semibold text-slate-900 group-hover:text-amber-900">{item.name}</p>
                      <p className="text-[10px] text-slate-500 capitalize">{(item.unit_type || 'tray_large').replace('_', ' ')}</p>
                    </div>
                    <span className="text-amber-700 font-mono font-bold">
                      ${(item.large_tray_price || item.unit_price || 0).toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <form onSubmit={handleAddCustomItem} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 items-end">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Custom Dish Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mushroom Korma, Special Chana Masala"
                  value={newCustomName}
                  onChange={(e) => setNewCustomName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Unit Price ($) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newCustomPrice}
                  onChange={(e) => setNewCustomPrice(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Unit Type</label>
                <select
                  value={newCustomUnitType}
                  onChange={(e) => setNewCustomUnitType(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900"
                >
                  <option value="tray_large">Tray Large</option>
                  <option value="tray_medium">Tray Medium</option>
                  <option value="piece">Piece / Unit</option>
                  <option value="per_guest">Per Guest</option>
                </select>
              </div>
              <div className="sm:col-span-4 flex justify-end gap-2 pt-1">
                <button
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-1.5 rounded-lg cursor-pointer transition-colors"
                >
                  Save & Add Custom Dish
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* HUMAN-IN-THE-LOOP REVIEW BANNER FOR UNRECOGNIZED / LOW CONFIDENCE DISHES */}
      {reviewItems.length > 0 && (
        <div className="p-4 bg-amber-50/90 border-2 border-amber-300 rounded-xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs tracking-wide uppercase">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Human-In-The-Loop Review Required ({reviewItems.length} Unrecognized Dish{reviewItems.length > 1 ? 'es' : ''})</span>
            </div>
            <span className="bg-amber-200 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
              Action Needed
            </span>
          </div>

          <p className="text-xs text-amber-900 leading-relaxed">
            The Menu Extractor cannot match requested dishes below to the price book with high confidence. Please select the closest matching option from Maharaja Catering Price Book or enter a custom rate.
          </p>

          <div className="space-y-3 pt-1">
            {items.map((item, index) => {
              if (!item.requires_human_review && item.matched) return null;

              return (
                <div key={index} className="p-3.5 bg-white border border-amber-200 rounded-lg shadow-2xs space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">Requested Dish:</span>
                      <span className="px-2.5 py-0.5 rounded-md bg-amber-100/90 text-amber-900 font-bold text-xs border border-amber-200">
                        "{item.item_name}"
                      </span>
                      {item.match_confidence !== undefined && (
                        <span className="text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded font-mono font-semibold">
                          {item.match_confidence}% Match Score
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                      {item.clarification_needed ? 'Clarification Required' : 'Unrecognized / Low Confidence'}
                    </span>
                  </div>

                  {/* Grounded Catalog Clarification Options from Maharaja Price Book */}
                  {((item.clarification_options && item.clarification_options.length > 0) || (item.top_suggestions && item.top_suggestions.length > 0)) && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
                        <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                        {item.clarification_prompt || 'Grounded matching options from Maharaja Catering Price Book:'}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {(item.clarification_options || item.top_suggestions || []).map((sug) => (
                          <button
                            key={sug.id}
                            onClick={() => handleSelectSuggestion(index, sug)}
                            className="p-2.5 rounded-lg border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/70 bg-slate-50/80 text-left transition-all cursor-pointer group shadow-2xs"
                          >
                            <div className="flex justify-between items-start">
                              <span className="font-bold text-slate-900 text-xs group-hover:text-emerald-900">{sug.name}</span>
                              <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                                ${(sug.unit_price || 0).toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between items-center mt-1 text-[10px] text-slate-500">
                              <span className="capitalize">{(sug.unit_type || 'tray_large').replace('_', ' ')}</span>
                              <span className="text-emerald-700 font-semibold">{sug.confidence}% Similarity</span>
                            </div>
                            <div className="mt-2 pt-1 border-t border-slate-200/60 text-center text-[10px] font-bold text-emerald-700 group-hover:underline flex items-center justify-center gap-1">
                              <Check className="w-3 h-3" /> Select This Dish (${(sug.unit_price || 0).toFixed(2)})
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Custom Option Entry Fallback */}
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-600">Not available on menu?</span>
                      <button
                        onClick={() => handleOpenCustomEdit(index, item)}
                        className="text-xs text-amber-700 hover:text-amber-900 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Specify Custom Dish Price & Unit</span>
                      </button>
                    </div>

                    {activeCustomEditIndex === index && (
                      <div className="mt-2 p-3 bg-amber-50/60 rounded-lg border border-amber-200 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Dish Name</label>
                          <input
                            type="text"
                            value={customEditName}
                            onChange={(e) => setCustomEditName(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Unit Price ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={customEditPrice}
                            onChange={(e) => setCustomEditPrice(Number(e.target.value))}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Unit Type</label>
                          <select
                            value={customEditUnitType}
                            onChange={(e) => setCustomEditUnitType(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-900"
                          >
                            <option value="tray_large">Tray Large</option>
                            <option value="tray_medium">Tray Medium</option>
                            <option value="piece">Piece / Unit</option>
                            <option value="per_guest">Per Guest</option>
                          </select>
                        </div>
                        <button
                          onClick={() => handleConfirmCustomForReviewItem(index)}
                          className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-1.5 px-3 rounded cursor-pointer transition-colors"
                        >
                          Confirm Custom Price
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Items Table */}
      {items.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-xs">
          No food items extracted yet. Enter an inquiry or click "Add Dish / Custom Item".
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-800">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Dish / Item Name</th>
                <th className="py-2.5 px-3">Unit Type</th>
                <th className="py-2.5 px-3 text-center">Quantity</th>
                <th className="py-2.5 px-3 text-right">Unit Price</th>
                <th className="py-2.5 px-3 text-right">Line Total</th>
                <th className="py-2.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, index) => (
                <tr key={index} className={`transition-colors ${item.requires_human_review ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-slate-50/70'}`}>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{item.item_name}</span>
                      {item.matched ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 font-semibold" title="Verified match in Maharaja Catering Price Book">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Menu Match
                        </span>
                      ) : item.requires_human_review ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 font-bold" title="Unrecognized item requiring human confirmation">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          Needs Review
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 font-semibold" title="Custom dish with confirmed rate">
                          Custom Item
                        </span>
                      )}
                    </div>
                    {item.notes && <p className="text-[10px] text-slate-500 mt-0.5">{item.notes}</p>}
                  </td>
                  <td className="py-3 px-3 text-slate-500 capitalize font-mono text-[11px]">
                    {(item.unit_type || 'tray_large').replace('_', ' ')}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => onUpdateQuantity(index, Math.max(1, item.quantity - 1))}
                        className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                      >
                        -
                      </button>
                      <span className="w-8 text-center font-bold font-mono text-slate-900 text-xs">{item.quantity}</span>
                      <button
                        onClick={() => onUpdateQuantity(index, item.quantity + 1)}
                        className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-600">
                    ${(item.unit_price ?? 0).toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-amber-700">
                    ${(item.total_price ?? 0).toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <button
                      onClick={() => onRemoveItem(index)}
                      className="text-slate-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                      title="Remove item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="font-semibold text-slate-700">Menu Match:</span>
            <span>Matched verified dish in Maharaja Catering Price Book (`menu_prices.json`).</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <span className="font-semibold text-slate-700">Human Review / Custom:</span>
            <span>Unrecognized or custom item requiring human confirmation or user rate entry.</span>
          </div>
        </div>
      )}
    </div>
  );
};
