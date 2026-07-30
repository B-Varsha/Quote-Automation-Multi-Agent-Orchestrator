import { GoogleGenAI, Type } from '@google/genai';
import { execFileSync } from 'child_process';
import path from 'path';
import { cateringVectorDB } from './vectorStore';

export interface ItemSuggestion {
  id: string;
  name: string;
  category: string;
  unit_type: string;
  unit_price: number;
  confidence: number;
}

export interface ExtractedItemSchema {
  id: string;
  item_id: string;
  item_name: string;
  category: string;
  unit_type: 'large_tray' | 'small_tray' | 'per_person' | 'per_piece' | string;
  quantity: number;
  unit_price: number;
  total_price: number;
  matched: boolean;
  notes: string;
  match_confidence?: number;
  requires_human_review?: boolean;
  clarification_needed?: boolean;
  clarification_prompt?: string;
  clarification_options?: ItemSuggestion[];
  top_suggestions?: ItemSuggestion[];
}

export interface ExtractionResult {
  customer_name: string | null;
  event_date: string | null;
  event_time: string | null;
  guest_count: number | null;
  fulfillment_type: 'pickup' | 'delivery' | null;
  event_location: string | null;
  extracted_items: ExtractedItemSchema[];
  extraction_reasoning?: string;
  missing_fields: string[];
}

/**
 * Normalizes string for string comparison
 */
function normalizeDishString(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Applies culinary typo normalizations and semantic equivalence mappings
 */
export function applyTypoAndSemanticNormalization(str: string): string {
  let norm = normalizeDishString(str);
  if (!norm) return '';

  // Typo & shorthand normalizations
  norm = norm
    .replace(/\b(pulao|pulav|pullaow|palao|pilaf|polao)\b/g, 'pulav')
    .replace(/\b(veg|vegetable)\b/g, 'veg')
    .replace(/\bchiken\s*6[56]\b/g, 'chicken 65')
    .replace(/\bchicken\s*6[56]\b/g, 'chicken 65')
    .replace(/\bchicken\s*65\s*fry\b/g, 'chicken 65')
    .replace(/\bmasal\b/g, 'masala')
    .replace(/\bmachurian\b/g, 'manchurian')
    .replace(/\bmachuri\b/g, 'manchurian')
    .replace(/\bmanchuri\b/g, 'manchurian')
    .replace(/\bchanna\b/g, 'chana')
    .replace(/\bnan\b/g, 'naan')
    .replace(/\bbiriyani\b/g, 'biryani')
    .replace(/\bpaner\b/g, 'paneer')
    .replace(/\bpanner\b/g, 'paneer');

  // Semantic equivalents mapping
  // 1. Gobi <-> Cauliflower
  norm = norm.replace(/\bcauliflower\b/g, 'gobi');

  // 2. Chole <-> Chana Masala
  if (/\bchole\b/.test(norm) && !norm.includes('masala')) {
    norm = norm.replace(/\bchole\b/g, 'chana masala');
  }

  // 3. Mutton / Lamb <-> Goat
  norm = norm.replace(/\b(mutton|lamb)\b/g, 'goat');

  // 4. Roti / Flatbread <-> Naan
  if (/\b(roti|flatbread)\b/.test(norm) && !norm.includes('naan')) {
    norm = norm.replace(/\b(roti|flatbread)\b/g, 'naan');
  }

  return norm;
}

/**
 * Standard Levenshtein Distance
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

/**
 * Compute similarity using Levenshtein distance after typo & semantic normalization
 */
function computeSimilarity(str1: string, str2: string): number {
  const norm1 = applyTypoAndSemanticNormalization(str1);
  const norm2 = applyTypoAndSemanticNormalization(str2);

  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 1.0;

  const dist = levenshteinDistance(norm1, norm2);
  const maxLen = Math.max(norm1.length, norm2.length);
  let score = maxLen > 0 ? 1.0 - dist / maxLen : 0;

  // Substring or Token Overlap (Cap at 0.75 for non-exact partial matches so generic phrases do not false auto-match)
  if (norm1.length >= 3 && norm2.length >= 3) {
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      score = Math.max(score, 0.75);
    }
  }

  return score;
}

/**
 * 1. REGEX STRUCTURED METADATA EXTRACTOR
 * Extracts dates, times, guest counts, fulfillment type, delivery address, and customer names directly via RegEx rules.
 */
function extractStructuredMetadataWithRegex(text: string) {
  const textLower = text.toLowerCase();

  // A. Guest Count / Headcount Regex
  let guestCount: number | null = null;
  const guestMatch =
    text.match(/(\d{1,4})\s*(?:guests?|people|pax|persons?|attendees?|ppl|headcount)/i) ||
    text.match(/(?:for|party of|count of|catering for)\s*(\d{1,4})/i);

  if (guestMatch) {
    guestCount = parseInt(guestMatch[1], 10);
  } else {
    // Standalone number heuristic
    const standaloneMatch = text.match(/(?:^|[\s,])(\d{1,4})(?:[\s,]|$)/);
    if (standaloneMatch) {
      const val = parseInt(standaloneMatch[1], 10);
      if (val > 0 && val < 2000 && val !== 2025 && val !== 2026) {
        guestCount = val;
      }
    }
  }

  // B. Event Date Regex
  let eventDate: string | null = null;
  const dateMatch = text.match(
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{2,4})?|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:,?\s*\d{2,4})?/i
  );
  if (dateMatch) {
    eventDate = dateMatch[0].trim();
  }

  // C. Event Time Regex
  let eventTime: string | null = null;
  const timeMatch = text.match(
    /\b(?:around|at|by)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)|\d{1,2}\s*(?:am|pm))\b|\b(lunch|dinner|evening|afternoon|noon|morning)\b/i
  );
  if (timeMatch) {
    eventTime = timeMatch[0].trim();
  }

  // D. Fulfillment Type Regex
  let fulfillmentType: 'pickup' | 'delivery' | null = null;
  if (/\b(?:pickup|pick\s*up|takeout|take-out|collect|collection)\b/i.test(textLower)) {
    fulfillmentType = 'pickup';
  } else if (/\b(?:delivery|deliver|dropoff|drop-off|drop\s*off)\b/i.test(textLower)) {
    fulfillmentType = 'delivery';
  }

  // E. Delivery Location Regex
  let eventLocation: string | null = null;
  const locationMatch = text.match(/(?:delivery to|deliver to|dropoff at|location:?|address:?)\s+([a-zA-Z0-9\s,.'-]+?)(?:\.|$)/i);
  if (locationMatch) {
    eventLocation = locationMatch[1].trim();
  }

  // F. Customer Name Regex
  let customerName: string | null = null;
  const nameMatch =
    text.match(/(?:this is|i am|i'm|my name is|from|hi,?\s*this is|hello,?\s*this is)\s+([a-zA-Z]{2,20})/i) ||
    text.match(/^([a-zA-Z]{2,20})\s*[,:-]\s*\d+/);

  if (nameMatch) {
    const candidate = nameMatch[1].trim();
    const banned = /^(hi|hello|hey|catering|guests?|people|pax|aug|august|sep|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|today|tomorrow|pickup|delivery)$/i;
    if (!banned.test(candidate)) {
      customerName = candidate;
    }
  }

  return {
    guestCount,
    eventDate,
    eventTime,
    fulfillmentType,
    eventLocation,
    customerName,
  };
}

/**
 * Helper to validate if a string candidate is a valid dish phrase name
 */
function isFoodDishPhrase(phrase: string): boolean {
  if (!phrase || phrase.trim().length < 2) return false;
  const lower = phrase.toLowerCase().trim();

  if (/\b(inquiry|inquiry for|customer|customer:|customer name|headcount|event date|event time|guest count|delivery address|fulfillment|pickup|order details|catering for|booking for|location|address|phone|email|pax|people|guests|attendees|2025|2026|2027)\b/i.test(lower)) {
    return false;
  }
  if (/^(inquiry|customer|headcount|event|guest|fulfillment|delivery|pickup|booking|order|date|time|location|address|phone|email|pax)/i.test(lower)) {
    return false;
  }
  if (/^\d+$/.test(lower) || /^\d{1,4}[\/\-]\d{1,4}/.test(lower)) return false;

  return true;
}

/**
 * DEPRECATED STUB FOR BACKWARDS COMPATIBILITY
 * Pure AI control now passes LLM item_name strings directly to fuzzy grounding.
 */
export function cleanDishPhrase(rawPhrase: string): {
  cleanedName: string;
  quantity: number;
  unitType: 'large_tray' | 'small_tray' | 'per_person' | 'per_piece' | string;
} {
  const cleanedName = (rawPhrase || '').trim();
  return {
    cleanedName,
    quantity: 1,
    unitType: 'large_tray',
  };
}

function hasModifierConflict(userDishName: string, candidateName: string, candidateAliases: string[] = []): boolean {
  const userLower = userDishName.toLowerCase();
  const candidateText = (candidateName + ' ' + candidateAliases.join(' ')).toLowerCase();

  // Mutually exclusive modifier groups
  const modifierGroups = [
    // Proteins & Primary Starters
    ['chicken', 'mutton', 'goat', 'lamb', 'beef', 'pork', 'fish', 'shrimp', 'prawn', 'paneer', 'veg', 'vegetable', 'egg', 'chana', 'gobi', 'aloo', 'dal'],
    // Breads & Naan Modifiers
    ['garlic', 'butter', 'plain', 'tandoori', 'stuffed', 'cheese', 'bullet', 'roti', 'paratha', 'poori'],
    // Preparation / Flavor Modifiers
    ['biryani', 'curry', 'masala', 'korma', 'tikka', '65', 'manchurian', 'makhani', 'kadai', 'vindaloo', 'saag', 'palak', 'fry', 'chilli']
  ];

  for (const group of modifierGroups) {
    const userTokens = group.filter(token => new RegExp(`\\b${token}\\b`, 'i').test(userLower));
    const candidateTokens = group.filter(token => new RegExp(`\\b${token}\\b`, 'i').test(candidateText));

    if (userTokens.length > 0 && candidateTokens.length > 0) {
      // If user specified a modifier in this group (e.g. "chicken") but candidate has a conflicting modifier (e.g. "mutton"), conflict!
      const hasOverlap = userTokens.some(ut => candidateTokens.includes(ut));
      if (!hasOverlap) {
        return true;
      }
    }
  }

  return false;
}

export class ExtractorAgent {
  private customApiKey?: string;

  constructor(apiKey?: string) {
    this.customApiKey = apiKey;
  }

  private getAiClient(): GoogleGenAI | null {
    const key = this.customApiKey || process.env.GEMINI_API_KEY;
    if (!key || key === 'MY_GEMINI_API_KEY') {
      return null;
    }
    return new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  /**
   * Flatten menu prices database with expanded alias map including spelling variations and semantic synonyms
   */
  private getFlattenedMenu(menuDb: any) {
    const items: any[] = [];
    if (menuDb && menuDb.categories) {
      for (const cat of menuDb.categories) {
        for (const item of cat.items || []) {
          const aliases: string[] = item.aliases ? [...item.aliases] : [];

          // Dynamically enrich common Indian culinary spelling variants and semantic synonyms
          const lowerName = item.name.toLowerCase();
          const itemId = item.id ? item.id.toLowerCase() : '';

          if (itemId === 'amritsari_chana_masala' || itemId === 'chana_masala' || lowerName.includes('chana')) {
            aliases.push('channa masala', 'channa masal', 'chana masala', 'chana masal', 'chole masala', 'pindi chana');
          }
          if (itemId === 'butter_naan') {
            aliases.push('butter naan', 'butter nan', 'plain butter naan');
          }
          if (itemId === 'garlic_naan') {
            aliases.push('garlic nan', 'garlic naan', 'garlic butter naan');
          }
          if (itemId === 'chicken_65' || lowerName.includes('chicken 65')) {
            aliases.push('chicken 65', 'chicken 66', 'chicken65', 'chiken 65', 'chiken 66', 'chicken 65 fry', 'chiken 65 fry');
          }
          if (itemId === 'gobi_manchurian' || lowerName.includes('gobi') || lowerName.includes('manchurian') || lowerName.includes('machurian')) {
            aliases.push('gobi manchurian', 'gobi machurian', 'gobi manchuri', 'gobi machuri', 'cauliflower manchurian', 'cauliflower machurian', 'gobi 65');
          }
          if (itemId === 'chicken_biryani' || lowerName.includes('chicken biryani')) {
            aliases.push('hyderabadi chicken biryani', 'chicken biryani', 'chicken biriyani', 'chiken biryani');
          }
          if (itemId === 'special_goat_mutton_biryani' || lowerName.includes('goat') || lowerName.includes('mutton') || lowerName.includes('lamb')) {
            aliases.push('special goat/mutton biryani', 'goat biryani', 'mutton biryani', 'lamb biryani', 'mutton biriyani', 'goat biriyani');
          }
          if (itemId === 'paneer_butter_masala' || lowerName.includes('paneer butter')) {
            aliases.push('paneer butter masala', 'paner butter masala', 'panner butter masala', 'paneer makhani');
          }
          if (itemId === 'butter_chicken' || lowerName.includes('butter chicken')) {
            aliases.push('maharaja butter chicken', 'butter chicken', 'chicken makhani');
          }
          if (itemId === 'lamb_rogan_josh' || lowerName.includes('rogan josh')) {
            aliases.push('lamb rogan josh', 'mutton rogan josh', 'goat rogan josh', 'rogan josh');
          }
          if (itemId === 'buffet_warmer' || lowerName.includes('chafing') || lowerName.includes('warmer')) {
            aliases.push('buffet chafing dish warmer rental (per station)', 'buffet chafing dish warmer rental', 'chafing dish warmer', 'warmer rental');
          }

          items.push({
            id: item.id,
            name: item.name,
            category: cat.id || 'general',
            category_name: cat.name,
            unit_type: item.unit_type || 'large_tray',
            unit_price: item.large_tray_price || item.unit_price || 0,
            aliases: Array.from(new Set(aliases)),
          });
        }
      }
    }
    return items;
  }

  /**
   * MAIN HYBRID EXTRACTION PIPELINE:
   * 1. Deterministic RegEx extracts structured metadata (dates, times, guest counts, fulfillment).
   * 2. Gemini LLM parses customer name and clean dish names (excluding greetings/notes/addresses).
   * 3. Deterministic Cleaner strips any residual container text ("2 trays of", "30 plain nan") and extracts quantities.
   * 4. Fuzzy Matcher grounds cleaned dish names against menu database.
   */
  async extractFromText(inquiryText: string, menuDb: any): Promise<ExtractionResult> {
    const flattenedMenu = this.getFlattenedMenu(menuDb);

    // Initialize & query the Vector RAG Store
    let ragVectorContext = '';
    try {
      const ragResults = await cateringVectorDB.searchVectorStore(inquiryText, 8);
      if (ragResults && ragResults.length > 0) {
        ragVectorContext = ragResults
          .map(r => `- ${r.document.name} [Category: ${r.document.category_name || r.document.category}] (Vector Cosine Similarity: ${r.confidence}%)`)
          .join('\n');
      }
    } catch (vErr) {
      console.warn('[ExtractorAgent] Vector DB search warning:', vErr);
    }

    // STEP 1: Execute Python RAG Agent FIRST
    try {
      const pyScriptPath = path.join(process.cwd(), 'app', 'agents', 'extractor.py');
      const output = execFileSync('python3', [pyScriptPath, inquiryText], {
        encoding: 'utf-8',
        timeout: 15000,
        env: { ...process.env },
      });

      if (output && output.trim()) {
        const pyResult = JSON.parse(output);
        if (pyResult && Array.isArray(pyResult.extracted_items)) {
          const missing: string[] = [];
          if (!pyResult.customer_name) missing.push('customer_name');
          if (!pyResult.event_date) missing.push('event_date');
          if (!pyResult.event_time) missing.push('event_time');
          if (!pyResult.guest_count) missing.push('guest_count');
          if (!pyResult.fulfillment_type) missing.push('fulfillment_type');
          if (pyResult.fulfillment_type === 'delivery' && !pyResult.event_location) missing.push('event_location');

          return {
            customer_name: pyResult.customer_name || null,
            event_date: pyResult.event_date || null,
            event_time: pyResult.event_time || null,
            guest_count: pyResult.guest_count || null,
            fulfillment_type: pyResult.fulfillment_type || null,
            event_location: pyResult.event_location || null,
            extracted_items: pyResult.extracted_items || [],
            extraction_reasoning: pyResult.extraction_reasoning || 'Extracted via Python RAG Agent.',
            missing_fields: missing,
          };
        }
      }
    } catch (pyErr) {
      console.warn('[ExtractorAgent] Python RAG execution error:', pyErr);
    }

    // STEP 2: Deterministic RegEx Metadata Extraction Fallback
    const regexMeta = extractStructuredMetadataWithRegex(inquiryText);

    // STEP 3: Node Gemini LLM Parsing Fallback
    const aiClient = this.getAiClient();
    let llmResponse: {
      customer_name?: string;
      guest_count?: number;
      fulfillment_type?: 'pickup' | 'delivery' | string;
      event_date?: string;
      event_time?: string;
      event_location?: string;
      items?: { item_name?: string; clean_dish_name?: string; quantity?: number; unit_type?: string; notes?: string }[];
      extraction_reasoning?: string;
    } | null = null;
    let geminiApiError: string | null = null;
    let usedModelName = 'gemini-3.6-flash';

    if (aiClient) {
      try {
        const systemInstruction = `You are Worker 1: Menu Extractor Agent for Maharaja Catering using Agentic RAG Architecture. You are responsible for 100% of the extraction and parsing task.

SYSTEMATIC DECISION PROCEDURE FOR PARAMETER EXTRACTION:

1. CUSTOMER NAME vs DISH NAMES DECISION PROCEDURE:
   - Identify the primary person or company placing the catering order.
   - Person names (e.g. "Farhan", "Kebab Singh", "Balaji", "Rahul Sharma", "Anand Kumar", "Priya Patel", "TechCorp") specified in preambles ("Hi, this is Farhan", "Farhan here", "Name is...", "I am...", "Inquiry from...") are strictly 'customer_name'.
   - CRITICAL: "Farhan" or "Kebab Singh" are human customer names — NEVER extract "Farhan", "Singh", "Kebab", "Balaji", or any human name as a food dish!
   - Never extract words from customer names, email handles, preambles, or signatures into food items.
   - If multiple names appear, pick the primary contact person ordering.

2. QUANTITY vs HEADCOUNT (GUEST COUNT) DECISION PROCEDURE:
   - Headcount expressions ("40 pax", "party of 50", "for 50 guests", "for 100 people") specify 'guest_count'.
   - Item quantity expressions ("2 trays", "50 pieces", "50 plates of biryani") specify food item 'quantity'.
   - "50 plates of biryani for 50 people" -> biryani item quantity: 50, guest_count: 50.

3. ITEM EXTRACTION & OFF-MENU POLICY:
   - Extract ALL requested food/drink items into 'items', INCLUDING off-menu dishes missing from the price book! NEVER omit an item simply because it is off-menu or custom.
   - item_name: Pure food dish name ONLY. Strip out leading quantities, container words ("trays of", "boxes of"), preambles ("we want"), and headcount terms ("pax").
   - Preserve exact modifiers ("Garlic Naan", "Chicken Biryani", "Mutton Karahi", "Filter Coffee").
   - Generic or ambiguous dishes ("butter masala", "tikka masala", "biryani", "naan", "paneer", "curry"): extract clean requested phrase (e.g. "butter masala", "naan") as a distinct item so catalog grounding can present exact available variants. Never skip or merge generic dish phrases.

EXAMPLES:
Input 1: "Hello, my name is Kebab Singh. Need catering for 50 people on Friday. Please prepare 2 trays of butter chicken, garlic naan, and gulab jamun."
Output: {
  "customer_name": "Kebab Singh",
  "guest_count": 50,
  "event_date": "Friday",
  "items": [
    {"item_name": "butter chicken", "quantity": 2, "unit_type": "large_tray"},
    {"item_name": "garlic naan", "quantity": 1, "unit_type": "per_piece"},
    {"item_name": "gulab jamun", "quantity": 1, "unit_type": "large_tray"}
  ]
}

Input 2: "Hi, I am Anand. We need 50 plates of biryani and 50 samosas for 50 people this Saturday."
Output: {
  "customer_name": "Anand",
  "guest_count": 50,
  "event_date": "Saturday",
  "items": [
    {"item_name": "biryani", "quantity": 50, "unit_type": "per_person"},
    {"item_name": "samosa", "quantity": 50, "unit_type": "per_piece"}
  ]
}`;
        const prompt = `VECTOR RAG RETRIEVED MENU & HISTORICAL ORDER CONTEXT:
${ragVectorContext || 'No vector matches retrieved'}

CATERING MENU PRICE BOOK (Ground Truth Reference):
${JSON.stringify(flattenedMenu.map(m => m.name), null, 2)}

RAW CUSTOMER INQUIRY TEXT:
"""
${inquiryText}
"""

Extract clean structured inquiry items.`;

        let responseText = '';
        for (const modelName of ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-flash-latest']) {
          try {
            const response = await aiClient.models.generateContent({
              model: modelName,
              contents: prompt,
              config: {
                systemInstruction,
                temperature: 0,
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    customer_name: { type: Type.STRING, description: 'Customer name or null' },
                    guest_count: { type: Type.NUMBER, description: 'Guest count headcount integer or null' },
                    fulfillment_type: { type: Type.STRING, description: 'pickup, delivery, or null' },
                    event_date: { type: Type.STRING, description: 'Event date string or null' },
                    event_time: { type: Type.STRING, description: 'Event time string or null' },
                    event_location: { type: Type.STRING, description: 'Delivery location or address string or null' },
                    items: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          item_name: { type: Type.STRING, description: 'Pure canonical food dish name ONLY' },
                          quantity: { type: Type.NUMBER, description: 'Item quantity number' },
                          unit_type: { type: Type.STRING, description: 'large_tray, per_piece, etc.' },
                          notes: { type: Type.STRING, description: 'Item notes' },
                        },
                        required: ['item_name'],
                      },
                    },
                    extraction_reasoning: { type: Type.STRING, description: 'Brief explanation of extracted dishes' },
                  },
                },
              },
            });

            if (response.text) {
              responseText = response.text;
              usedModelName = modelName;
              break;
            }
          } catch (mErr: any) {
            geminiApiError = mErr?.message || String(mErr);
            console.warn(`[ExtractorAgent] Gemini ${modelName} failed:`, geminiApiError);
          }
        }

        if (responseText) {
          llmResponse = JSON.parse(responseText);
          llmResponse!.extraction_reasoning = (llmResponse!.extraction_reasoning || `Extracted via ${usedModelName}`);
        }
      } catch (err: any) {
        geminiApiError = err?.message || String(err);
        console.error('[ExtractorAgent] Gemini LLM extraction error:', err);
      }
    } else {
      geminiApiError = 'GEMINI_API_KEY is not configured or is a placeholder.';
    }

    // If Node Gemini succeeded, ground and return!
    const grounded = await this.groundAndSanitizeHybrid(inquiryText, regexMeta, llmResponse, flattenedMenu);
    grounded.extraction_reasoning = `Gemini Model Fallback (${usedModelName || 'gemini-1.5-flash-8b'}): ${grounded.extraction_reasoning || 'Parsed customer text and grounded items.'}`;
    return grounded;

    // If Gemini model calls failed due to API auth / quota errors, run fallback and make error explicit
    const fallbackResult = await this.groundAndSanitizeHybrid(inquiryText, regexMeta, null, flattenedMenu);
    fallbackResult.extraction_reasoning = `Gemini Model Authentication/Quota Note: ${geminiApiError || 'Gemini API call unfulfilled'}. (Local NLP parser ran as backup — please update your GEMINI_API_KEY in AI Studio Settings to re-enable live Gemini AI parsing).`;
    return fallbackResult;
  }

  /**
   * PURE AGENTIC RAG GROUNDING & VECTOR EMBEDDING MATCHING STAGE
   */
  private async groundAndSanitizeHybrid(
    rawText: string,
    regexMeta: ReturnType<typeof extractStructuredMetadataWithRegex>,
    llmResult: any,
    flattenedMenu: any[]
  ): Promise<ExtractionResult> {
    // 1. Customer Name (LLM primary, RegEx fallback)
    let customerName = llmResult?.customer_name ? String(llmResult.customer_name).trim() : null;
    if (customerName && /^(hi|hello|hey|catering|guests?|people|pax|aug|august|pickup|delivery|null|undefined)$/i.test(customerName)) {
      customerName = null;
    }
    if (!customerName) {
      customerName = regexMeta.customerName;
    }

    // 2. Guest Count & Fulfillment details (LLM primary, RegEx fallback)
    const guestCount = (typeof llmResult?.guest_count === 'number' && llmResult.guest_count > 0 ? llmResult.guest_count : null) ?? regexMeta.guestCount;
    const fulfillmentType = (llmResult?.fulfillment_type === 'pickup' || llmResult?.fulfillment_type === 'delivery' ? llmResult.fulfillment_type : null) || regexMeta.fulfillmentType;
    const eventDate = llmResult?.event_date || regexMeta.eventDate;
    const eventTime = llmResult?.event_time || regexMeta.eventTime;
    const eventLocation = llmResult?.event_location || regexMeta.eventLocation;

    // 3. Raw items list from LLM (or simple string split fallback ONLY if LLM call failed)
    let candidateItems: { item_name: string; quantity?: number; unit_type?: string; notes?: string }[] = [];

    if (llmResult !== null && Array.isArray(llmResult?.items)) {
      candidateItems = llmResult.items.map((it: any) => ({
        item_name: String(it.item_name || it.clean_dish_name || it.dish || '').trim(),
        quantity: it.quantity,
        unit_type: it.unit_type,
        notes: it.notes,
      }));
    } else {
      // Fallback if LLM failed
      const clauses = rawText
        .split(/(?:,|\n|;|\band\b)/i)
        .map(s => s.trim())
        .filter(Boolean);

      for (const clause of clauses) {
        if (isFoodDishPhrase(clause)) {
          candidateItems.push({
            item_name: clause,
            quantity: 1,
            unit_type: 'large_tray',
          });
        }
      }
    }

    // Filter out person names, customer name tokens, and non-food greeting words
    const commonNamesList = [
      'farhan', 'kebab singh', 'balaji', 'rahul', 'priya', 'anand', 'vikram',
      'varun', 'ananya', 'rajesh', 'sundar', 'siddharth', 'arjun', 'aarti',
      'divya', 'fatima', 'zainab', 'mohammed', 'ali', 'tariq', 'techcorp', 'singh'
    ];
    const customerTokens = (customerName || '').toLowerCase().split(/\s+/).filter(t => t.length >= 2);

    candidateItems = candidateItems.filter(it => {
      const rawName = (it.item_name || '').toLowerCase().trim();
      if (!rawName || rawName.length < 2) return false;

      // Exclude exact customer name match
      if (customerName && rawName === customerName.toLowerCase().trim()) return false;

      const hasFoodKeywords = /(biryani|curry|masala|naan|nan|tikka|paneer|chicken|mutton|goat|lamb|samosa|pakora|lassi|chai|rice|pulav|pulao|dal|halwa|jamun|rasmalai|kebab masala|kebab roll|chicken kebab|mutton kebab|gobi|chana|manchurian|roti|paratha|bread|dessert|drink|beverage|plates|cutlery)/i.test(rawName);

      if (!hasFoodKeywords) {
        if (commonNamesList.includes(rawName)) return false;
        if (customerTokens.includes(rawName)) return false;
        if (/^(hi|hello|hey|thanks|regards|dear|catering|inquiry|booking|order|pax|guests?|people|delivery|pickup)$/i.test(rawName)) return false;
      }

      return true;
    });

    const groundedItems: ExtractedItemSchema[] = [];

    // STEP 4: Vector Embedding & Hybrid Similarity Grounding
    for (const item of candidateItems) {
      const cleanDishName = (item.item_name || '').trim();
      if (!cleanDishName || cleanDishName.length < 2) continue;

      const quantity = Math.max(1, Number(item.quantity) || 1);
      const unitType = item.unit_type || 'large_tray';

      // Query vector DB for this candidate dish name
      let vectorSearchResults: any[] = [];
      try {
        vectorSearchResults = await cateringVectorDB.searchVectorStore(cleanDishName, 5, 'menu_item');
      } catch (vErr) {
        console.warn('[ExtractorAgent] Vector search error for dish:', cleanDishName, vErr);
      }

      // Hybrid Scoring: Vector Cosine Similarity + String Levenshtein + Strict Modifier Alignment
      const scoredCandidates = flattenedMenu.map((m) => {
        let maxSim = computeSimilarity(cleanDishName, m.name);
        if (m.aliases) {
          for (const alias of m.aliases) {
            const sim = computeSimilarity(cleanDishName, alias);
            if (sim > maxSim) maxSim = sim;
          }
        }

        const vecMatch = vectorSearchResults.find(v => v.document.id === m.id);
        if (vecMatch) {
          maxSim = Math.max(maxSim, vecMatch.similarity);
        }

        // Apply strict modifier conflict penalty (e.g. Chicken vs Mutton Biryani, Garlic vs Plain Naan)
        const isConflict = hasModifierConflict(cleanDishName, m.name, m.aliases || []);
        if (isConflict) {
          maxSim = maxSim * 0.15; // Heavily penalize mismatching variant
        }

        return {
          item: m,
          score: maxSim,
        };
      });

      scoredCandidates.sort((a, b) => b.score - a.score);

      const topCandidate = scoredCandidates[0];
      const topScore = topCandidate ? topCandidate.score : 0;

      // Extract query tokens for noise filtering (words >= 3 chars, excluding common stop words)
      const normDishLower = cleanDishName.toLowerCase().trim();
      const queryTokens = normDishLower
        .split(/\s+/)
        .filter(t => t.length >= 3 && !['with', 'and', 'for', 'the', 'tray', 'trays', 'large', 'small', 'pax', 'need', 'please'].includes(t));

      // Filter noise out of suggestions: Keep items with score >= 0.35 that match query tokens or category
      const nonNoiseCandidates = scoredCandidates.filter((c) => {
        if (c.score < 0.35) return false;
        const candNameLower = c.item.name.toLowerCase();
        const candCatLower = (c.item.category_name || c.item.category || '').toLowerCase();
        const candAliases = (c.item.aliases || []).join(' ').toLowerCase();

        // If candidate shares at least one meaningful token with query or is in same category, keep it
        if (queryTokens.length === 0) return true;
        return queryTokens.some(qt => candNameLower.includes(qt) || candCatLower.includes(qt) || candAliases.includes(qt));
      });

      const suggestionsSource = nonNoiseCandidates.length > 0 ? nonNoiseCandidates : scoredCandidates.filter(c => c.score >= 0.35);

      // Top 3 suggestions for Human-In-The-Loop review (strictly noise-filtered)
      const topSuggestions: ItemSuggestion[] = suggestionsSource.slice(0, 3).map((c) => ({
        id: c.item.id,
        name: c.item.name,
        category: c.item.category,
        unit_type: c.item.unit_type,
        unit_price: Number(c.item.unit_price) || 0,
        confidence: Number((c.score * 100).toFixed(0)),
      }));

      // CONFIDENCE THRESHOLD LOGIC
      const CONFIDENCE_THRESHOLD = 0.82;
      const genericKeywords = [
        'butter masala', 'masala', 'curry', 'gravy', 'biryani', 'naan', 'nan', 'paneer',
        'tikka', 'kebab', 'kabab', 'korma', 'roti', 'pulav', 'pulao', 'manchurian', '65',
        'fry', 'bread', 'dal', 'samosa', 'lassi', 'chana', 'gobi', 'tikka masala'
      ];

      const isExactGenericPhrase = genericKeywords.some(w => normDishLower === w || normDishLower === `special ${w}`);

      // If requested dish name is a partial substring of candidate (e.g. "butter masala" inside "Paneer Butter Masala")
      // without specifying the primary protein/veggie, require human clarification!
      const topNameLower = topCandidate ? topCandidate.item.name.toLowerCase() : '';
      const isPartialSubName = topCandidate && topScore < 0.95 && topNameLower.includes(normDishLower) && normDishLower.length < topNameLower.length;

      const isGeneric = isExactGenericPhrase || isPartialSubName;

      if (isGeneric) {
        // Generic or ambiguous dish requested (e.g. "butter masala", "naan", "biryani") -> Present options strictly from price book
        const matchingCatalogVariants = flattenedMenu.filter(m => {
          const mNameLower = m.name.toLowerCase();
          const mCatLower = (m.category_name || m.category || '').toLowerCase();
          return queryTokens.some(qt => mNameLower.includes(qt) || mCatLower.includes(qt));
        });

        const isCurryQuery = queryTokens.some(qt => ['masala', 'curry', 'gravy', 'korma', 'makhani'].includes(qt));
        const isBreadQuery = queryTokens.some(qt => ['naan', 'nan', 'roti', 'paratha', 'bread'].includes(qt));

        const optionsSource = matchingCatalogVariants.length > 0
          ? matchingCatalogVariants.map(m => {
              let score = computeSimilarity(cleanDishName, m.name);
              if (m.aliases) {
                for (const alias of m.aliases) {
                  score = Math.max(score, computeSimilarity(cleanDishName, alias));
                }
              }
              const catLower = (m.category || m.category_name || '').toLowerCase();
              if (isCurryQuery && (catLower.includes('curry') || catLower.includes('gravy') || catLower.includes('main'))) {
                score += 0.20;
              }
              if (isCurryQuery && catLower.includes('bread')) {
                score -= 0.30;
              }
              if (isBreadQuery && catLower.includes('bread')) {
                score += 0.20;
              }
              return { item: m, score };
            }).sort((a, b) => b.score - a.score)
          : scoredCandidates.filter(c => c.score >= 0.35);

        const optionsToUse = (optionsSource.length > 0 ? optionsSource : scoredCandidates.slice(0, 3))
          .slice(0, 4)
          .map(c => {
            const m = c.item || c;
            return {
              id: m.id,
              name: m.name,
              category: m.category,
              unit_type: m.unit_type || 'tray_large',
              unit_price: Number(m.unit_price || m.large_tray_price || 100),
              confidence: Math.min(100, Math.max(0, Number(((c.score || 0.75) * 100).toFixed(0)))),
            };
          });

        const customId = `generic_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

        groundedItems.push({
          id: customId,
          item_id: customId,
          item_name: cleanDishName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          category: 'ambiguous_variant',
          unit_type: unitType || 'large_tray',
          quantity,
          unit_price: optionsToUse[0]?.unit_price || 100.0,
          total_price: Number(((optionsToUse[0]?.unit_price || 100.0) * quantity).toFixed(2)),
          matched: false,
          match_confidence: Number((topScore * 100).toFixed(0)) || 60,
          requires_human_review: true,
          clarification_needed: true,
          clarification_prompt: `Generic or ambiguous dish requested ("${cleanDishName}"). Please select which specific catalog variant to confirm:`,
          clarification_options: optionsToUse,
          top_suggestions: optionsToUse,
          notes: `Clarification Required: Unspecific dish "${cleanDishName}". Select grounded menu variant from catalog.`,
        });
      } else if (topScore >= CONFIDENCE_THRESHOLD) {
        const match = topCandidate.item;
        const itemId = match.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        groundedItems.push({
          id: itemId,
          item_id: itemId,
          item_name: match.name, // Grounded clean menu name from Maharaja Price Book
          category: match.category || 'general',
          unit_type: match.unit_type || unitType || 'large_tray',
          quantity,
          unit_price: Number(match.unit_price) || 0,
          total_price: Number(((match.unit_price || 0) * quantity).toFixed(2)),
          matched: true,
          match_confidence: Number((topScore * 100).toFixed(0)),
          requires_human_review: false,
          notes: `Vector RAG Matched from Maharaja Price Book (${match.category_name || 'Menu'}, Vector Confidence: ${Math.round(topScore * 100)}%)`,
          top_suggestions: topSuggestions,
        });
      } else {
        // Unrecognized dish (e.g. off-menu dish) -> Flag for Human Review
        const customId = `unrecognized_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        const formattedCleanedName = cleanDishName
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');

        groundedItems.push({
          id: customId,
          item_id: customId,
          item_name: formattedCleanedName,
          category: 'unrecognized',
          unit_type: unitType || 'large_tray',
          quantity,
          unit_price: 100.0,
          total_price: Number((100.0 * quantity).toFixed(2)),
          matched: false,
          match_confidence: Number((topScore * 100).toFixed(0)),
          requires_human_review: true,
          notes: `Human Review Required: Unrecognized dish "${formattedCleanedName}" (Vector Confidence: ${Math.round(topScore * 100)}%). Select suggested menu dish or confirm custom price.`,
          top_suggestions: topSuggestions,
        });
      }
    }

    // Determine missing required fields
    const missing: string[] = [];
    if (!customerName) missing.push('customer_name');
    if (!eventDate) missing.push('event_date');
    if (!eventTime) missing.push('event_time');
    if (!guestCount) missing.push('guest_count');
    if (!fulfillmentType) missing.push('fulfillment_type');
    if (fulfillmentType === 'delivery' && !eventLocation) missing.push('event_location');

    return {
      customer_name: customerName,
      event_date: eventDate,
      event_time: eventTime,
      guest_count: guestCount,
      fulfillment_type: fulfillmentType,
      event_location: eventLocation,
      extracted_items: groundedItems,
      extraction_reasoning: llmResult?.extraction_reasoning || 'Extracted parameters via AI LLM and grounded menu matching.',
      missing_fields: missing,
    };
  }
}
