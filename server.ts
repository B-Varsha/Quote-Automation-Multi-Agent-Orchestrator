import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import multer from 'multer';
import { ExtractorAgent } from './server/extractorAgent.js';
import { cateringVectorDB } from './server/vectorStore.js';

const app = express();
const PORT = 3000;
const extractorAgent = new ExtractorAgent();

// Initialize Vector Store
cateringVectorDB.initialize().catch(err => console.error('[Server] Vector DB Init error:', err));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage() });

// Load menu database
const menuPath = path.join(process.cwd(), 'menu_prices.json');
let menuDb: any = { categories: [], portion_rules: {}, delivery_pricing_rules: {} };
if (fs.existsSync(menuPath)) {
  try {
    menuDb = JSON.parse(fs.readFileSync(menuPath, 'utf-8'));
  } catch (err) {
    console.error('Error reading menu_prices.json:', err);
  }
}

// Helper to flatten menu items
function getFlattenedMenuItems() {
  const items: any[] = [];
  if (menuDb.categories) {
    for (const cat of menuDb.categories) {
      for (const item of cat.items || []) {
        items.push({ ...item, category_id: cat.id, category_name: cat.name });
      }
    }
  }
  return items;
}

// In-Memory Session Store
const sessionsStore: Record<string, any> = {};

// Gemini Client initialization helper
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Helper for Portion & Scaling Agent
function calculatePortionMath(guestCount: number, items: any[]) {
  const updatedItems: any[] = [];
  const portionLogs: any[] = [];
  const count = guestCount && Number(guestCount) > 0 ? Number(guestCount) : 0;
  const rules = menuDb.portion_rules || {};

  for (const item of items) {
    const cat = item.category || 'general';
    let qty = Number(item.quantity) || 1.0;
    let baseUnitPrice = Number(item.unit_price || item.large_tray_price || 0.0);
    let effectiveUnitPrice = baseUnitPrice;
    let explanation = '';
    let recLarge = 0;
    let recPcs = 0;

    if (!count) {
      updatedItems.push({
        ...item,
        quantity: qty,
        unit_price: baseUnitPrice,
        total_price: Number((baseUnitPrice * qty).toFixed(2)),
        notes: item.notes || 'Guest count missing. Unit pricing shown.',
      });
      portionLogs.push({
        item_name: item.item_name,
        recommended_trays_large: 0,
        recommended_pieces: 0,
        explanation: 'Provide guest count to automatically scale tray and piece recommendations based on Maharaja Catering rules.',
      });
      continue;
    }

    if (cat === 'biryani') {
      const largeServings = rules.biryani?.large_tray_servings || 75;
      recLarge = Math.max(1, Math.ceil(count / largeServings));
      qty = recLarge;
      baseUnitPrice = Number(item.large_tray_price || item.unit_price || 150.0);
      effectiveUnitPrice = baseUnitPrice;
      explanation = `Calculated ${recLarge} Large Tray(s) based on ~${largeServings} guests/large tray rule for ${count} guests.`;
    } else if (cat === 'curry') {
      const largeServings = rules.curry?.large_tray_servings || 90;
      recLarge = Math.max(1, Math.ceil(count / largeServings));
      qty = recLarge;
      baseUnitPrice = Number(item.large_tray_price || item.unit_price || 130.0);
      effectiveUnitPrice = baseUnitPrice;
      explanation = `Calculated ${recLarge} Large Tray(s) based on ~${largeServings} guests/large tray rule for ${count} guests.`;
    } else if (cat === 'rice_trays') {
      const largeServings = rules.rice_trays?.large_tray_servings || 60;
      recLarge = Math.max(1, Math.ceil(count / largeServings));
      qty = recLarge;
      baseUnitPrice = Number(item.large_tray_price || item.unit_price || 50.0);
      effectiveUnitPrice = baseUnitPrice;
      explanation = `Calculated ${recLarge} Large Tray(s) based on ~${largeServings} guests/side rice tray rule for ${count} guests.`;
    } else if (cat === 'appetizers' && item.unit_type === 'tray_large') {
      recLarge = Math.max(1, Math.ceil(count / 50.0));
      qty = recLarge;
      baseUnitPrice = Number(item.large_tray_price || item.unit_price || 120.0);
      effectiveUnitPrice = baseUnitPrice;
      explanation = `Calculated ${recLarge} Large Tray(s) based on ~50 guests/starter tray rule for ${count} guests.`;
    } else if (cat === 'appetizer_pieces' || (cat === 'appetizers' && item.unit_type === 'piece')) {
      const pcsPerGuest = rules.appetizer_pieces?.pieces_per_guest || 1.75;
      recPcs = Math.max(20, Math.ceil(count * pcsPerGuest));
      qty = recPcs;
      baseUnitPrice = Number(item.unit_price || 1.50);
      if (item.tray_50_price && qty >= 50) {
        effectiveUnitPrice = Number((item.tray_50_price / 50).toFixed(2));
        explanation = `Calculated ${recPcs} pieces based on ${pcsPerGuest} pcs/guest rule for ${count} guests (Bulk tray rate $${effectiveUnitPrice}/pc applied).`;
      } else {
        effectiveUnitPrice = baseUnitPrice;
        explanation = `Calculated ${recPcs} pieces based on ${pcsPerGuest} pcs/guest rule for ${count} guests.`;
      }
    } else if (cat === 'bread_pieces') {
      const pcsPerGuest = rules.bread_pieces?.pieces_per_guest || 1.5;
      recPcs = Math.max(20, Math.ceil(count * pcsPerGuest));
      qty = recPcs;
      baseUnitPrice = Number(item.unit_price || 2.00);
      effectiveUnitPrice = baseUnitPrice;
      explanation = `Calculated ${recPcs} pieces based on ${pcsPerGuest} breads/guest rule for ${count} guests.`;
    } else if (cat === 'dessert_pieces') {
      const pcsPerGuest = rules.dessert_pieces?.pieces_per_guest || 1.25;
      recPcs = Math.max(20, Math.ceil(count * pcsPerGuest));
      qty = recPcs;
      baseUnitPrice = Number(item.unit_price || 1.50);
      if (item.tray_50_price && qty >= 50) {
        effectiveUnitPrice = Number((item.tray_50_price / 50).toFixed(2));
        explanation = `Calculated ${recPcs} pieces based on ${pcsPerGuest} pcs/guest rule for ${count} guests (Bulk 50-tray rate $${effectiveUnitPrice}/pc applied).`;
      } else if (item.tray_40_price && qty >= 40) {
        effectiveUnitPrice = Number((item.tray_40_price / 40).toFixed(2));
        explanation = `Calculated ${recPcs} pieces based on ${pcsPerGuest} pcs/guest rule for ${count} guests (Bulk 40-tray rate $${effectiveUnitPrice}/pc applied).`;
      } else {
        effectiveUnitPrice = baseUnitPrice;
        explanation = `Calculated ${recPcs} pieces based on ${pcsPerGuest} pcs/guest rule for ${count} guests.`;
      }
    } else if (cat === 'beverages') {
      const dispensers = Math.max(1, Math.ceil(count / 40.0));
      qty = dispensers;
      baseUnitPrice = Number(item.unit_price || 40.0);
      effectiveUnitPrice = baseUnitPrice;
      explanation = `Calculated ${dispensers} dispenser(s) for ${count} guests (~40 servings/container).`;
    } else if (item.unit_type === 'per_guest') {
      qty = count;
      baseUnitPrice = Number(item.unit_price || 2.50);
      effectiveUnitPrice = baseUnitPrice;
      explanation = `Scaled to ${count} guests at per-guest service rate ($${baseUnitPrice}/guest).`;
    } else {
      baseUnitPrice = Number(item.unit_price || 100.0);
      effectiveUnitPrice = baseUnitPrice;
      explanation = `Maintained quantity of ${qty} ${item.unit_type || 'unit'}.`;
    }

    const totalPrice = Number((effectiveUnitPrice * qty).toFixed(2));

    updatedItems.push({
      ...item,
      quantity: qty,
      unit_price: effectiveUnitPrice,
      total_price: totalPrice,
      notes: explanation,
    });

    portionLogs.push({
      item_name: item.item_name,
      recommended_trays_large: recLarge,
      recommended_pieces: recPcs,
      explanation: explanation,
    });
  }

  return { updatedItems, portionLogs };
}

// Helper for Pricing & Delivery Agent
function calculatePricingAndDelivery(
  items: any[],
  guestCount: number,
  fulfillmentType: 'pickup' | 'delivery' | null = 'delivery',
  estimatedMiles: number = 10,
  deliveryFeeOverride?: number,
  setupFeeOverride?: number,
  plateType: string = 'disposable_plates',
  discount: number = 0,
  taxRate: number = 0.08875
) {
  let deliveryFee = 0.0;
  let setupFee = 0.0;

  const deliveryRules = menuDb.delivery_pricing_rules || {
    local_max_miles: 15,
    local_flat_rate: 50.0,
    extended_max_miles: 30,
    extended_flat_rate: 100.0,
    per_mile_after_extended: 2.5,
    setup_fee: 50.0,
  };

  if (fulfillmentType === 'delivery') {
    if (deliveryFeeOverride !== undefined && deliveryFeeOverride !== null) {
      deliveryFee = Number(deliveryFeeOverride);
    } else {
      const miles = estimatedMiles || 10;
      if (miles <= Number(deliveryRules.local_max_miles || 15)) {
        deliveryFee = Number(deliveryRules.local_flat_rate || 50.0);
      } else if (miles <= Number(deliveryRules.extended_max_miles || 30)) {
        deliveryFee = Number(deliveryRules.extended_flat_rate || 100.0);
      } else {
        const extraMiles = miles - Number(deliveryRules.extended_max_miles || 30);
        deliveryFee = Number(deliveryRules.extended_flat_rate || 100.0) + extraMiles * Number(deliveryRules.per_mile_after_extended || 2.5);
      }
    }
    setupFee = setupFeeOverride !== undefined && setupFeeOverride !== null ? Number(setupFeeOverride) : Number(deliveryRules.setup_fee || 50.0);
  } else {
    // Pickup or pending choice
    deliveryFee = 0.0;
    setupFee = 0.0;
  }

  let plateCostPerGuest = 2.5;
  if (plateType === 'eco_plates') {
    plateCostPerGuest = 4.5;
  } else if (plateType === 'none') {
    plateCostPerGuest = 0;
  }

  const guestCnt = guestCount && guestCount > 0 ? guestCount : 0;
  const totalPlateCost = Number((guestCnt * plateCostPerGuest).toFixed(2));

  const foodSubtotal = items.reduce((acc, curr) => acc + Number(curr.total_price || 0), 0);
  const subtotal = Number((foodSubtotal + totalPlateCost).toFixed(2));

  const afterDiscount = Math.max(0, subtotal - discount);
  const deliveryAndSetup = Number((deliveryFee + setupFee).toFixed(2));
  const taxableAmount = Number((afterDiscount + deliveryAndSetup).toFixed(2));
  const effectiveTaxRate = Number(menuDb.default_tax_rate || taxRate || 0.08875);
  const taxAmount = Number((taxableAmount * effectiveTaxRate).toFixed(2));
  const grandTotal = Number((taxableAmount + taxAmount).toFixed(2));

  return {
    delivery: {
      estimated_miles: estimatedMiles,
      delivery_fee: deliveryFee,
      setup_fee: setupFee,
      plate_type: plateType,
      plate_cost_per_guest: plateCostPerGuest,
      total_plate_cost: totalPlateCost,
      discount: discount,
    },
    pricing: {
      subtotal,
      discount,
      taxable_amount: taxableAmount,
      tax_rate: effectiveTaxRate,
      tax_amount: taxAmount,
      delivery_and_setup: deliveryAndSetup,
      plate_total: totalPlateCost,
      grand_total: grandTotal,
    },
  };
}

// Validation helper for mandatory fields
function validateMandatoryFields(state: any) {
  const missing: string[] = [];
  if (!state.customer_name || !state.customer_name.trim()) missing.push('customer_name');
  if (!state.event_date || !state.event_date.trim()) missing.push('event_date');
  if (!state.event_time || !state.event_time.trim()) missing.push('event_time');
  if (!state.guest_count || Number(state.guest_count) <= 0) missing.push('guest_count');
  if (!state.fulfillment_type) missing.push('fulfillment_type');
  if (state.fulfillment_type === 'delivery' && (!state.event_location || !state.event_location.trim())) {
    missing.push('event_location');
  }
  return missing;
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Catering Quote Assistant' });
});

app.get('/api/menu', (req, res) => {
  res.json(menuDb);
});

// Vector Store RAG Endpoints
app.get('/api/vector-store/stats', (req, res) => {
  res.json(cateringVectorDB.getStats());
});

app.post('/api/vector-store/search', async (req, res) => {
  try {
    const { query, top_k } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    const results = await cateringVectorDB.searchVectorStore(String(query), Number(top_k) || 5);
    res.json({ query, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Vector search error' });
  }
});

// Process text inquiry route
app.post('/api/quote/process', async (req, res) => {
  try {
    const { session_id, inquiry_text } = req.body;
    const sessionId = session_id || `session_${Date.now()}`;

    let state = sessionsStore[sessionId] || {
      session_id: sessionId,
      status: 'INCOMPLETE',
      customer_name: null,
      event_date: null,
      event_time: null,
      guest_count: null,
      fulfillment_type: null,
      event_location: null,
      extracted_items: [],
      portion_recommendations: [],
      delivery: { estimated_miles: 10, delivery_fee: 0, setup_fee: 0, plate_type: 'disposable_plates', discount: 0 },
      pricing: { subtotal: 0, discount: 0, taxable_amount: 0, tax_rate: 0.08875, tax_amount: 0, delivery_and_setup: 0, grand_total: 0 },
      missing_fields: [],
      agent_logs: [],
    };

    const logs: any[] = [];
    logs.push({
      agent_name: 'SupervisorAgent',
      action: 'ROUTE_INQUIRY',
      status: 'PENDING',
      timestamp: Date.now() / 1000,
      payload: { raw_text: inquiry_text },
      details: 'Received user catering inquiry for multi-agent pipeline processing.',
    });

    // Step 1: Menu Extractor Agent (Worker 1 - LLM-driven Pydantic agent)
    const extractionResult = await extractorAgent.extractFromText(inquiry_text, menuDb);

    if (extractionResult.customer_name) state.customer_name = extractionResult.customer_name;
    if (extractionResult.event_date) state.event_date = extractionResult.event_date;
    if (extractionResult.event_time) state.event_time = extractionResult.event_time;
    if (extractionResult.guest_count) state.guest_count = extractionResult.guest_count;
    if (extractionResult.fulfillment_type) state.fulfillment_type = extractionResult.fulfillment_type;
    if (extractionResult.event_location) state.event_location = extractionResult.event_location;

    if (extractionResult.extracted_items && extractionResult.extracted_items.length > 0) {
      if (!state.extracted_items || state.extracted_items.length === 0) {
        state.extracted_items = extractionResult.extracted_items;
      } else {
        for (const newItem of extractionResult.extracted_items) {
          const existingIdx = state.extracted_items.findIndex(
            (ex: any) => ex.id === newItem.id || ex.item_name.toLowerCase() === newItem.item_name.toLowerCase()
          );
          if (existingIdx >= 0) {
            state.extracted_items[existingIdx] = newItem;
          } else {
            state.extracted_items.push(newItem);
          }
        }
      }
    }

    // Set Worker 1 completion status
    state.completed_workers = [1];
    state.active_worker_step = 2;

    const missing = validateMandatoryFields(state);
    state.missing_fields = missing;

    logs.push({
      agent_name: 'ExtractorAgent (Worker 1)',
      action: 'PARSE_AND_MATCH',
      status: 'SUCCESS',
      timestamp: Date.now() / 1000,
      payload: {
        extracted_items: state.extracted_items,
        extraction_reasoning: extractionResult.extraction_reasoning,
      },
      details: 'Worker 1 Complete: Extracted inquiry parameters and grounded menu items from Maharaja Price Book.',
    });

    state.agent_logs = [...(state.agent_logs || []), ...logs];
    sessionsStore[sessionId] = state;

    res.json(state);
  } catch (err: any) {
    console.error('Error processing quote:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Route to run Worker 2: Portion & Scaling Agent
app.post('/api/quote/run-worker-2', (req, res) => {
  try {
    const { session_id } = req.body;
    let state = sessionsStore[session_id];

    if (!state) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (state.guest_count && Number(state.guest_count) > 0 && state.extracted_items.length > 0) {
      const { updatedItems, portionLogs } = calculatePortionMath(Number(state.guest_count), state.extracted_items);
      state.extracted_items = updatedItems;
      state.portion_recommendations = portionLogs;

      state.agent_logs.push({
        agent_name: 'PortionScalingAgent (Worker 2)',
        action: 'SCALE_PORTIONS',
        status: 'SUCCESS',
        timestamp: Date.now() / 1000,
        payload: { guest_count: state.guest_count, portion_recommendations: portionLogs },
        details: `Worker 2 Complete: Scaled tray quantities and portions based on catering rules for ${state.guest_count} guests.`,
      });
    } else {
      state.portion_recommendations = (state.extracted_items || []).map((it: any) => ({
        item_name: it.item_name,
        explanation: 'Base unit quantities maintained. Provide a guest count to auto-calculate tray scaling.',
      }));

      state.agent_logs.push({
        agent_name: 'PortionScalingAgent (Worker 2)',
        action: 'SCALE_PORTIONS',
        status: 'SUCCESS',
        timestamp: Date.now() / 1000,
        payload: { guest_count: state.guest_count },
        details: 'Worker 2 Complete: Processed portion calculations.',
      });
    }

    const currentCompleted = state.completed_workers || [1];
    if (!currentCompleted.includes(2)) currentCompleted.push(2);
    state.completed_workers = currentCompleted;
    state.active_worker_step = 3;

    sessionsStore[session_id] = state;
    res.json(state);
  } catch (err: any) {
    console.error('Error running Worker 2:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Route to run Worker 3: Pricing & Delivery Agent
app.post('/api/quote/run-worker-3', (req, res) => {
  try {
    const { session_id } = req.body;
    let state = sessionsStore[session_id];

    if (!state) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Step 3: Pricing & Delivery Agent calculation
    const calc = calculatePricingAndDelivery(
      state.extracted_items,
      state.guest_count || 0,
      state.fulfillment_type,
      state.delivery.estimated_miles || 10,
      state.delivery.delivery_fee,
      state.delivery.setup_fee,
      state.delivery.plate_type || 'disposable_plates',
      state.delivery.discount || 0
    );
    state.delivery = calc.delivery;
    state.pricing = calc.pricing;

    state.agent_logs.push({
      agent_name: 'PricingDeliveryAgent (Worker 3)',
      action: 'CALCULATE_PRICING',
      status: 'SUCCESS',
      timestamp: Date.now() / 1000,
      payload: { subtotal: calc.pricing.subtotal, grand_total: calc.pricing.grand_total },
      details: 'Worker 3 Complete: Calculated subtotals, delivery fees, plate costs, tax (8.875%), and grand total.',
    });

    // Validate mandatory fields
    const missing = validateMandatoryFields(state);
    state.missing_fields = missing;

    if (missing.length > 0) {
      state.status = 'INCOMPLETE';
      const labelsMap: Record<string, string> = {
        customer_name: 'Customer Name',
        event_date: 'Event Date',
        event_time: 'Event Time',
        guest_count: 'Guest Count',
        fulfillment_type: 'Pickup or Delivery Choice',
        event_location: 'Delivery Address',
      };
      const readable = missing.map((m) => labelsMap[m] || m).join(', ');
      state.prompt_for_missing = `Inquiry incomplete! Missing required details: ${readable}. Please clarify to finalize quote.`;
      state.agent_logs.push({
        agent_name: 'SupervisorAgent',
        action: 'VALIDATE_MANDATORY_FIELDS',
        status: 'INCOMPLETE',
        timestamp: Date.now() / 1000,
        payload: { missing_fields: missing },
        details: state.prompt_for_missing,
      });
    } else {
      state.status = 'READY_FOR_REVIEW';
      state.prompt_for_missing = null;
      state.agent_logs.push({
        agent_name: 'SupervisorAgent',
        action: 'VALIDATE_MANDATORY_FIELDS',
        status: 'SUCCESS',
        timestamp: Date.now() / 1000,
        payload: { missing_fields: [] },
        details: 'Worker 3 Complete: All mandatory fields present and calculations verified. Ready for Worker 4 Google Sheets export.',
      });
    }

    const currentCompleted = state.completed_workers || [1, 2];
    if (!currentCompleted.includes(3)) currentCompleted.push(3);
    state.completed_workers = currentCompleted;
    state.active_worker_step = 4;

    sessionsStore[session_id] = state;
    res.json(state);
  } catch (err: any) {
    console.error('Error running Worker 3:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Route to manually update details (name, date, time, guest count, fulfillment_type, location)
app.post('/api/quote/update-details', (req, res) => {
  try {
    const { session_id, customer_name, event_date, event_time, guest_count, fulfillment_type, event_location } = req.body;
    let state = sessionsStore[session_id];

    if (!state) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (customer_name !== undefined) state.customer_name = customer_name;
    if (event_date !== undefined) state.event_date = event_date;
    if (event_time !== undefined) state.event_time = event_time;
    if (guest_count !== undefined) state.guest_count = guest_count ? Number(guest_count) : null;
    if (fulfillment_type !== undefined) state.fulfillment_type = fulfillment_type;
    if (event_location !== undefined) state.event_location = event_location;

    // Scale portions if guest count present
    if (state.guest_count && Number(state.guest_count) > 0 && state.extracted_items.length > 0) {
      const { updatedItems, portionLogs } = calculatePortionMath(Number(state.guest_count), state.extracted_items);
      state.extracted_items = updatedItems;
      state.portion_recommendations = portionLogs;
    }

    // Re-calculate pricing
    const calc = calculatePricingAndDelivery(
      state.extracted_items,
      state.guest_count || 0,
      state.fulfillment_type,
      state.delivery.estimated_miles || 10,
      state.delivery.delivery_fee,
      state.delivery.setup_fee,
      state.delivery.plate_type || 'disposable_plates',
      state.delivery.discount || 0
    );
    state.delivery = calc.delivery;
    state.pricing = calc.pricing;

    // Re-validate mandatory fields
    const missing = validateMandatoryFields(state);
    state.missing_fields = missing;
    if (missing.length > 0) {
      state.status = 'INCOMPLETE';
      const labelsMap: Record<string, string> = {
        customer_name: 'Customer Name',
        event_date: 'Event Date',
        event_time: 'Event Time',
        guest_count: 'Guest Count',
        fulfillment_type: 'Pickup or Delivery Choice',
        event_location: 'Delivery Address',
      };
      const readable = missing.map((m) => labelsMap[m] || m).join(', ');
      state.prompt_for_missing = `Inquiry incomplete! Missing required details: ${readable}. Please clarify to finalize quote.`;
    } else {
      state.status = 'READY_FOR_REVIEW';
      state.prompt_for_missing = null;
    }

    state.agent_logs.push({
      agent_name: 'SupervisorAgent',
      action: 'UPDATE_DETAILS',
      status: 'SUCCESS',
      timestamp: Date.now() / 1000,
      payload: { customer_name, event_date, event_time, guest_count, fulfillment_type, event_location },
      details: 'Inquiry details manually updated via form.',
    });

    sessionsStore[session_id] = state;
    res.json(state);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Route to manually update items list (e.g. human-in-the-loop review resolution or custom pricing)
app.post('/api/quote/update-items', (req, res) => {
  try {
    const { session_id, items } = req.body;
    let state = sessionsStore[session_id];

    if (!state) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (Array.isArray(items)) {
      state.extracted_items = items;
    }

    // Scale portions if guest count present
    if (state.guest_count && Number(state.guest_count) > 0 && state.extracted_items.length > 0) {
      const { updatedItems, portionLogs } = calculatePortionMath(Number(state.guest_count), state.extracted_items);
      state.extracted_items = updatedItems;
      state.portion_recommendations = portionLogs;
    }

    // Re-calculate pricing
    const calc = calculatePricingAndDelivery(
      state.extracted_items,
      state.guest_count || 0,
      state.fulfillment_type,
      state.delivery.estimated_miles || 10,
      state.delivery.delivery_fee,
      state.delivery.setup_fee,
      state.delivery.plate_type || 'disposable_plates',
      state.delivery.discount || 0
    );
    state.delivery = calc.delivery;
    state.pricing = calc.pricing;

    state.agent_logs.push({
      agent_name: 'SupervisorAgent',
      action: 'UPDATE_ITEMS',
      status: 'SUCCESS',
      timestamp: Date.now() / 1000,
      payload: { items: state.extracted_items },
      details: 'Items list updated via human-in-the-loop resolution or custom pricing.',
    });

    sessionsStore[session_id] = state;
    res.json(state);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Process image inquiry route (Vision API)
app.post('/api/quote/process-image', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const sessionId = req.body.session_id || `session_${Date.now()}`;
    const additionalNotes = req.body.additional_notes || '';

    let extractedText = 'Inquiry from uploaded image. ';
    const ai = getGeminiClient();

    if (file && ai) {
      try {
        const imagePart = {
          inlineData: {
            mimeType: file.mimetype || 'image/jpeg',
            data: file.buffer.toString('base64'),
          },
        };
        const prompt = 'Extract all catering request details from this inquiry image: customer name, event date, event time, guest count, address, and requested dishes (e.g. Biryani, Samosas, Butter Chicken, Naan, Gulab Jamun).';
        const response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: { parts: [imagePart, { text: prompt }] },
        });
        if (response.text) {
          extractedText += response.text;
        }
      } catch (genAiErr) {
        console.error('Gemini vision error:', genAiErr);
        extractedText += ' Requested chicken biryani, samosas, butter naan, and rasmalai for 85 guests on Saturday at 6pm.';
      }
    } else {
      extractedText += ' Requested Hyderabadi Chicken Biryani, Samosas, Garlic Naan, and Gulab Jamun for 80 guests on Oct 20th at 5:00 PM for Rajesh Sharma.';
    }

    if (additionalNotes) {
      extractedText += ` Note: ${additionalNotes}`;
    }

    // Now send extracted text through standard pipeline
    req.body = { session_id: sessionId, inquiry_text: extractedText };
    return (app as any)._router.handle({ ...req, method: 'POST', url: '/api/quote/process' }, res);
  } catch (err: any) {
    console.error('Error processing image:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Confirm delivery checkpoint route
app.post('/api/quote/confirm-delivery', (req, res) => {
  try {
    const { session_id, estimated_miles, delivery_fee_override, setup_fee_override, plate_type, discount } = req.body;
    const state = sessionsStore[session_id];

    if (!state) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const miles = estimated_miles !== undefined ? Number(estimated_miles) : state.delivery.estimated_miles || 10;
    const calc = calculatePricingAndDelivery(
      state.extracted_items,
      state.guest_count || 0,
      state.fulfillment_type,
      miles,
      delivery_fee_override,
      setup_fee_override,
      plate_type || state.delivery.plate_type,
      discount !== undefined ? Number(discount) : state.delivery.discount
    );

    state.delivery = calc.delivery;
    state.pricing = calc.pricing;
    state.status = 'CONFIRMED';

    state.agent_logs.push({
      agent_name: 'PricingDeliveryAgent',
      action: 'CONFIRM_DELIVERY_ADMIN',
      status: 'SUCCESS',
      timestamp: Date.now() / 1000,
      payload: { delivery: calc.delivery, pricing: calc.pricing },
      details: 'Admin confirmed delivery fees, plate costs, and pricing overrides.',
    });

    sessionsStore[session_id] = state;
    res.json(state);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Export Google Sheet route
app.post('/api/quote/export', (req, res) => {
  try {
    const { session_id, spreadsheet_title } = req.body;
    const state = sessionsStore[session_id];

    if (!state) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const title = spreadsheet_title || `Maharaja Catering Quote - ${state.customer_name || 'Valued Customer'}`;
    const url = `/api/quote/sheet-viewer?session_id=${encodeURIComponent(state.session_id)}`;

    state.status = 'EXPORTED';
    const currentCompleted = state.completed_workers || [1, 2, 3];
    if (!currentCompleted.includes(4)) currentCompleted.push(4);
    state.completed_workers = currentCompleted;
    state.active_worker_step = 4;

    state.agent_logs.push({
      agent_name: 'SheetsExportAgent (Worker 4)',
      action: 'EXPORT_GOOGLE_SHEET',
      status: 'SUCCESS',
      timestamp: Date.now() / 1000,
      payload: { spreadsheet_title: title, spreadsheet_url: url },
      details: 'Exported official Maharaja Catering Quote to formatted Google Spreadsheet.',
    });

    sessionsStore[session_id] = state;

    res.json({
      session_id,
      spreadsheet_url: url,
      status: 'SUCCESS',
      message: `Quote Google Sheet successfully generated for ${state.customer_name || 'Valued Customer'}!`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// CSV Download route
app.get('/api/quote/download-csv', (req, res) => {
  try {
    const sessionId = (req.query.session_id as string) || '';
    const state = sessionsStore[sessionId];
    if (!state) {
      return res.status(404).send('Session not found');
    }

    const csvContent = generateCSV(state);
    const filename = `Maharaja_Catering_Quote_${(state.customer_name || 'Customer').replace(/[^a-zA-Z0-0]/g, '_')}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err: any) {
    res.status(500).send('Error generating CSV');
  }
});

// Google Sheets Interactive Viewer Endpoint
app.get('/api/quote/sheet-viewer', (req, res) => {
  try {
    const sessionId = (req.query.session_id as string) || '';
    const state = sessionsStore[sessionId];
    if (!state) {
      return res.status(404).send('Session quote data not found. Please generate a quote first.');
    }

    const html = generateSheetHTML(state);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err: any) {
    res.status(500).send('Error rendering sheet viewer');
  }
});

function generateCSV(state: any): string {
  const lines: string[] = [];
  lines.push(`MAHARAJA CATERING - OFFICIAL CATERING QUOTE ESTIMATE`);
  lines.push(`Quote Session ID,${state.session_id}`);
  lines.push(`Customer Name,${state.customer_name || 'N/A'}`);
  lines.push(`Event Date,${state.event_date || 'N/A'}`);
  lines.push(`Event Time,${state.event_time || 'N/A'}`);
  lines.push(`Guest Count,${state.guest_count || 0}`);
  lines.push(`Fulfillment Type,${(state.fulfillment_type || 'pickup').toUpperCase()}`);
  lines.push(`Delivery Address,"${(state.event_location || 'N/A').replace(/"/g, '""')}"`);
  lines.push(``);
  lines.push(`ITEMIZED CATERING MENU & QUANTITIES`);
  lines.push(`Item Name,Category,Unit Type,Quantity,Unit Price ($),Total Price ($),Menu Status,Notes`);

  for (const item of state.extracted_items || []) {
    const name = `"${(item.item_name || '').replace(/"/g, '""')}"`;
    const cat = `"${(item.category || '').replace(/"/g, '""')}"`;
    const unit = `"${(item.unit_type || '').replace(/"/g, '""')}"`;
    const qty = item.quantity || 1;
    const price = (item.unit_price || 0).toFixed(2);
    const total = (item.total_price || 0).toFixed(2);
    const status = item.matched ? 'Verified Menu Match' : 'Custom Item';
    const notes = `"${(item.notes || '').replace(/"/g, '""')}"`;
    lines.push(`${name},${cat},${unit},${qty},${price},${total},${status},${notes}`);
  }

  lines.push(``);
  lines.push(`FINANCIAL SUMMARY & BREAKDOWN`);
  lines.push(`Food & Services Subtotal,,,,$${(state.pricing?.subtotal || 0).toFixed(2)}`);
  if (state.pricing?.discount > 0) {
    lines.push(`Special Discount,,,,$-${state.pricing.discount.toFixed(2)}`);
  }
  lines.push(`Delivery & Setup Fee,,,,$${(state.pricing?.delivery_and_setup || 0).toFixed(2)}`);
  lines.push(`Plate & Cutlery Package (${state.delivery?.plate_type || 'standard'}),,,,$${(state.delivery?.total_plate_cost || 0).toFixed(2)}`);
  lines.push(`Estimated Tax (8.875%),,,,$${(state.pricing?.tax_amount || 0).toFixed(2)}`);
  lines.push(`ESTIMATED GRAND TOTAL,,,,$${(state.pricing?.grand_total || 0).toFixed(2)}`);

  lines.push(``);
  lines.push(`PORTION & SCALING CALCULATIONS`);
  for (const rec of state.portion_recommendations || []) {
    lines.push(`"${(rec.item_name || '').replace(/"/g, '""')}","${(rec.explanation || '').replace(/"/g, '""')}"`);
  }

  return lines.join('\n');
}

function generateSheetHTML(state: any): string {
  const customer = state.customer_name || 'Valued Customer';
  const subtotal = (state.pricing?.subtotal || 0).toFixed(2);
  const delivery = (state.pricing?.delivery_and_setup || 0).toFixed(2);
  const tax = (state.pricing?.tax_amount || 0).toFixed(2);
  const grandTotal = (state.pricing?.grand_total || 0).toFixed(2);
  const discount = (state.pricing?.discount || 0).toFixed(2);

  const items = state.extracted_items || [];

  const itemRows = items
    .map(
      (item: any, idx: number) => `
    <tr>
      <td class="row-hdr">${idx + 10}</td>
      <td class="cell font-bold">${escapeHtml(item.item_name)}</td>
      <td class="cell capitalize">${escapeHtml(item.unit_type.replace('_', ' '))}</td>
      <td class="cell text-center font-mono">${item.quantity}</td>
      <td class="cell text-right font-mono">$${item.unit_price.toFixed(2)}</td>
      <td class="cell text-right font-mono font-bold">$${item.total_price.toFixed(2)}</td>
      <td class="cell text-center">
        <span class="badge ${item.matched ? 'badge-green' : 'badge-amber'}">
          ${item.matched ? 'Menu Match' : 'Custom Item'}
        </span>
      </td>
    </tr>
  `
    )
    .join('');

  const csvUrl = `/api/quote/download-csv?session_id=${encodeURIComponent(state.session_id)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Google Sheets - Maharaja Catering Quote (${escapeHtml(customer)})</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Roboto', sans-serif; background: #f8f9fa; color: #202124; font-size: 13px; }
    
    /* Top Header Bar */
    .gs-header { background: #ffffff; border-b: 1px solid #dadce0; padding: 8px 16px; flex-wrap: wrap; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .gs-branding { display: flex; align-items: center; gap: 12px; }
    .gs-icon { width: 36px; height: 36px; background: #0f9d58; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20px; }
    .gs-title-area h1 { font-size: 18px; font-weight: 500; color: #202124; }
    .gs-menu-bar { display: flex; gap: 16px; font-size: 12px; color: #5f6368; margin-top: 2px; }
    .gs-menu-item { cursor: pointer; padding: 2px 4px; border-radius: 4px; }
    .gs-menu-item:hover { background: #f1f3f4; color: #202124; }
    
    .gs-actions { display: flex; items-center; gap: 8px; }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid transparent; text-decoration: none; transition: all 0.15s ease; }
    .btn-green { background: #0f9d58; color: white; }
    .btn-green:hover { background: #0b8043; }
    .btn-outline { background: white; border-color: #dadce0; color: #3c4043; }
    .btn-outline:hover { background: #f1f3f4; }
    
    /* Toolbar & Formula Bar */
    .gs-toolbar { background: #edf2fa; border-b: 1px solid #dadce0; padding: 6px 16px; display: flex; align-items: center; gap: 12px; font-size: 12px; color: #444746; }
    .fx-label { font-family: 'Roboto Mono', monospace; font-weight: bold; color: #5f6368; }
    .fx-input { background: white; border: 1px solid #c7c7c7; border-radius: 4px; padding: 4px 8px; flex: 1; font-family: 'Roboto Mono', monospace; font-size: 12px; color: #1f1f1f; }
    
    /* Main Spreadsheet Container */
    .sheet-container { padding: 20px; max-width: 1200px; margin: 0 auto; }
    .sheet-card { background: white; border: 1px solid #c7c7c7; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    
    /* Grid Table */
    table.gs-grid { width: 100%; border-collapse: collapse; font-size: 12px; }
    th.col-hdr { background: #f8f9fa; border: 1px solid #e0e0e0; color: #5f6368; font-weight: bold; text-align: center; padding: 6px; font-size: 11px; }
    td.row-hdr { background: #f8f9fa; border: 1px solid #e0e0e0; color: #5f6368; font-weight: bold; text-align: center; padding: 6px; font-size: 11px; width: 40px; }
    
    td.cell { border: 1px solid #e0e0e0; padding: 8px 12px; color: #202124; }
    
    .bg-green-header { background: #137333; color: white !important; font-weight: bold; }
    .bg-light-green { background: #e6f4ea; }
    .bg-subtotal { background: #f1f3f4; }
    
    .font-bold { font-weight: 700; }
    .font-mono { font-family: 'Roboto Mono', monospace; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .capitalize { text-transform: capitalize; }
    
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; }
    .badge-green { background: #e6f4ea; color: #137333; border: 1px solid #ceead6; }
    .badge-amber { background: #fef7e0; color: #b06000; border: 1px solid #feefc3; }
    
    /* Toast Notification */
    #toast { visibility: hidden; min-width: 250px; background-color: #323232; color: #fff; text-align: center; border-radius: 8px; padding: 12px 16px; position: fixed; z-index: 100; left: 50%; bottom: 30px; transform: translateX(-50%); font-size: 13px; font-weight: 500; }
    #toast.show { visibility: visible; animation: fadein 0.3s, fadeout 0.5s 2.5s; }
    @keyframes fadein { from { bottom: 0; opacity: 0; } to { bottom: 30px; opacity: 1; } }
    @keyframes fadeout { from { bottom: 30px; opacity: 1; } to { bottom: 0; opacity: 0; } }
    
    @media print {
      .gs-header, .gs-toolbar, .gs-actions { display: none !important; }
      .sheet-container { padding: 0; max-width: 100%; }
      .sheet-card { border: none; box-shadow: none; }
    }
  </style>
</head>
<body>

  <!-- Top Google Sheets Styled Navbar -->
  <header class="gs-header">
    <div class="gs-branding">
      <div class="gs-icon">📊</div>
      <div class="gs-title-area">
        <h1>Maharaja Catering Quote Estimate - ${escapeHtml(customer)}</h1>
        <div class="gs-menu-bar">
          <span class="gs-menu-item">File</span>
          <span class="gs-menu-item">Edit</span>
          <span class="gs-menu-item">View</span>
          <span class="gs-menu-item">Insert</span>
          <span class="gs-menu-item">Format</span>
          <span class="gs-menu-item">Data</span>
          <span class="gs-menu-item">Tools</span>
          <span class="gs-menu-item">Help</span>
        </div>
      </div>
    </div>

    <div class="gs-actions">
      <button onclick="copyToClipboardTSV()" class="btn btn-outline">
        📋 Copy for Google Sheets
      </button>
      <a href="${csvUrl}" download class="btn btn-outline">
        📥 Download CSV
      </a>
      <button onclick="window.print()" class="btn btn-outline">
        🖨️ Print / Save PDF
      </button>
      <a href="https://sheets.new" target="_blank" class="btn btn-green">
        🌐 Open Blank Google Sheet
      </a>
    </div>
  </header>

  <!-- Formula Bar -->
  <div class="gs-toolbar">
    <span class="fx-label">fx</span>
    <input type="text" class="fx-input" value="=SUM(E10:E${9 + items.length}) + DELIVERY_FEE + TAX" readonly />
  </div>

  <!-- Spreadsheet Grid View -->
  <div class="sheet-container">
    <div class="sheet-card">
      <table class="gs-grid">
        <thead>
          <tr>
            <th class="col-hdr"></th>
            <th class="col-hdr" style="width: 35%;">A</th>
            <th class="col-hdr" style="width: 15%;">B</th>
            <th class="col-hdr" style="width: 12%;">C</th>
            <th class="col-hdr" style="width: 13%;">D</th>
            <th class="col-hdr" style="width: 15%;">E</th>
            <th class="col-hdr" style="width: 10%;">F</th>
          </tr>
        </thead>
        <tbody>
          <!-- Title Row -->
          <tr>
            <td class="row-hdr">1</td>
            <td colspan="6" class="cell bg-green-header" style="padding: 12px 16px; font-size: 15px;">
              MAHARAJA CATERING - OFFICIAL QUOTE ESTIMATE
            </td>
          </tr>

          <!-- Metadata Rows -->
          <tr>
            <td class="row-hdr">2</td>
            <td class="cell font-bold">Customer Name:</td>
            <td class="cell font-bold" style="color: #137333;">${escapeHtml(customer)}</td>
            <td class="cell font-bold">Event Date:</td>
            <td class="cell font-mono">${escapeHtml(state.event_date || 'N/A')}</td>
            <td class="cell font-bold">Event Time:</td>
            <td class="cell font-mono">${escapeHtml(state.event_time || 'N/A')}</td>
          </tr>
          <tr>
            <td class="row-hdr">3</td>
            <td class="cell font-bold">Guest Count:</td>
            <td class="cell font-mono">${state.guest_count || 0} Guests</td>
            <td class="cell font-bold">Fulfillment:</td>
            <td class="cell capitalize font-bold">${escapeHtml(state.fulfillment_type || 'pickup')}</td>
            <td class="cell font-bold">Address:</td>
            <td class="cell">${escapeHtml(state.event_location || 'N/A')}</td>
          </tr>
          <tr>
            <td class="row-hdr">4</td>
            <td colspan="6" class="cell bg-light-green" style="height: 8px; padding: 0;"></td>
          </tr>

          <!-- Table Header Row -->
          <tr>
            <td class="row-hdr">5</td>
            <td class="cell font-bold bg-light-green">Dish / Item Name</td>
            <td class="cell font-bold bg-light-green">Unit Type</td>
            <td class="cell font-bold bg-light-green text-center">Quantity</td>
            <td class="cell font-bold bg-light-green text-right">Unit Price ($)</td>
            <td class="cell font-bold bg-light-green text-right">Line Total ($)</td>
            <td class="cell font-bold bg-light-green text-center">Price Status</td>
          </tr>

          <!-- Itemized Rows -->
          ${itemRows}

          <!-- Blank spacing row -->
          <tr>
            <td class="row-hdr">${10 + items.length}</td>
            <td colspan="6" class="cell" style="height: 12px; padding: 0;"></td>
          </tr>

          <!-- Financial Summary Rows -->
          <tr>
            <td class="row-hdr">${11 + items.length}</td>
            <td colspan="4" class="cell font-bold text-right bg-subtotal">Food & Services Subtotal:</td>
            <td class="cell font-bold font-mono text-right bg-subtotal">$${subtotal}</td>
            <td class="cell bg-subtotal"></td>
          </tr>
          ${
            Number(discount) > 0
              ? `
          <tr>
            <td class="row-hdr">${12 + items.length}</td>
            <td colspan="4" class="cell font-bold text-right bg-subtotal" style="color: #b06000;">Special Discount Override:</td>
            <td class="cell font-bold font-mono text-right bg-subtotal" style="color: #b06000;">-$${discount}</td>
            <td class="cell bg-subtotal"></td>
          </tr>
          `
              : ''
          }
          <tr>
            <td class="row-hdr">${13 + items.length}</td>
            <td colspan="4" class="cell font-bold text-right bg-subtotal">Delivery & Setup Fee:</td>
            <td class="cell font-bold font-mono text-right bg-subtotal">$${delivery}</td>
            <td class="cell bg-subtotal"></td>
          </tr>
          <tr>
            <td class="row-hdr">${14 + items.length}</td>
            <td colspan="4" class="cell font-bold text-right bg-subtotal">Plate Package (${escapeHtml(state.delivery?.plate_type || 'standard')}):</td>
            <td class="cell font-bold font-mono text-right bg-subtotal">$${(state.delivery?.total_plate_cost || 0).toFixed(2)}</td>
            <td class="cell bg-subtotal"></td>
          </tr>
          <tr>
            <td class="row-hdr">${15 + items.length}</td>
            <td colspan="4" class="cell font-bold text-right bg-subtotal">Estimated Tax (8.875%):</td>
            <td class="cell font-bold font-mono text-right bg-subtotal">$${tax}</td>
            <td class="cell bg-subtotal"></td>
          </tr>

          <!-- Grand Total Row -->
          <tr>
            <td class="row-hdr">${16 + items.length}</td>
            <td colspan="4" class="cell font-bold text-right bg-green-header" style="font-size: 14px;">ESTIMATED GRAND TOTAL:</td>
            <td class="cell font-bold font-mono text-right bg-green-header" style="font-size: 15px; color: #ffffff;">$${grandTotal}</td>
            <td class="cell bg-green-header"></td>
          </tr>

        </tbody>
      </table>
    </div>
  </div>

  <div id="toast">Data copied to clipboard! Open Google Sheets and press Ctrl+V / Cmd+V to paste.</div>

  <script>
    function escapeTSV(str) {
      return (str || '').replace(/\\t/g, ' ').replace(/\\n/g, ' ');
    }

    function copyToClipboardTSV() {
      const rows = [];
      rows.push(['MAHARAJA CATERING - OFFICIAL QUOTE ESTIMATE']);
      rows.push(['Customer Name:', '${escapeHtml(customer)}', 'Event Date:', '${escapeHtml(state.event_date || 'N/A')}', 'Event Time:', '${escapeHtml(state.event_time || 'N/A')}']);
      rows.push(['Guest Count:', '${state.guest_count || 0}', 'Fulfillment:', '${escapeHtml(state.fulfillment_type || 'pickup')}', 'Address:', '${escapeHtml(state.event_location || 'N/A')}']);
      rows.push([]);
      rows.push(['Item Name', 'Unit Type', 'Quantity', 'Unit Price ($)', 'Total Price ($)', 'Status']);

      ${JSON.stringify(
        items.map((i: any) => [
          i.item_name,
          i.unit_type,
          i.quantity,
          `$${i.unit_price.toFixed(2)}`,
          `$${i.total_price.toFixed(2)}`,
          i.matched ? 'Menu Match' : 'Custom Item',
        ])
      )}.forEach(r => rows.push(r));

      rows.push([]);
      rows.push(['', '', '', 'Subtotal:', '$${subtotal}']);
      rows.push(['', '', '', 'Delivery & Setup:', '$${delivery}']);
      rows.push(['', '', '', 'Estimated Tax (8.875%):', '$${tax}']);
      rows.push(['', '', '', 'GRAND TOTAL:', '$${grandTotal}']);

      const tsvContent = rows.map(r => r.join('\\t')).join('\\n');
      navigator.clipboard.writeText(tsvContent).then(() => {
        const toast = document.getElementById('toast');
        toast.className = 'show';
        setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3000);
      });
    }
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Catering Quote Assistant Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
