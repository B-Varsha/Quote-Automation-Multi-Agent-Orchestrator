export interface ItemSuggestion {
  id: string;
  name: string;
  category: string;
  unit_type: string;
  unit_price: number;
  confidence: number;
}

export interface ExtractedItem {
  id?: string;
  item_id?: string;
  item_name: string;
  category: string;
  quantity: number;
  unit_type: string;
  unit_price: number;
  total_price: number;
  matched: boolean;
  notes?: string;
  raw_input?: string;
  match_confidence?: number;
  requires_human_review?: boolean;
  clarification_needed?: boolean;
  clarification_prompt?: string;
  clarification_options?: ItemSuggestion[];
  top_suggestions?: ItemSuggestion[];
}

export interface PortionRuleResult {
  item_name: string;
  recommended_trays_large?: number;
  recommended_trays_medium?: number;
  recommended_pieces?: number;
  explanation: string;
}

export interface DeliveryDetails {
  estimated_miles: number;
  delivery_fee: number;
  setup_fee: number;
  plate_type: string;
  plate_cost_per_guest: number;
  total_plate_cost: number;
  discount: number;
}

export interface QuoteBreakdown {
  subtotal: number;
  discount: number;
  taxable_amount: number;
  tax_rate: number;
  tax_amount: number;
  delivery_and_setup: number;
  plate_total: number;
  grand_total: number;
}

export interface MCPLog {
  agent_name: string;
  action: string;
  status: 'PENDING' | 'SUCCESS' | 'ERROR' | 'INCOMPLETE' | 'SKIPPED';
  timestamp: number;
  payload: Record<string, any>;
  details: string;
}

export interface QuoteSessionState {
  session_id: string;
  status: 'INCOMPLETE' | 'READY_FOR_REVIEW' | 'CONFIRMED' | 'EXPORTED';
  customer_name: string | null;
  event_date: string | null;
  event_time: string | null;
  guest_count: number | null;
  fulfillment_type: 'pickup' | 'delivery' | null;
  event_location: string | null;
  extracted_items: ExtractedItem[];
  portion_recommendations: PortionRuleResult[];
  delivery: DeliveryDetails;
  pricing: QuoteBreakdown;
  missing_fields: string[];
  prompt_for_missing?: string | null;
  agent_logs: MCPLog[];
  completed_workers?: number[];
  active_worker_step?: number;
}

export interface MenuItem {
  id: string;
  name: string;
  aliases?: string[];
  unit_type: string;
  unit_price?: number;
  large_tray_price?: number;
  medium_tray_price?: number;
  category: string;
}

export interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}

export interface MenuDatabase {
  restaurant: string;
  currency: string;
  default_tax_rate: number;
  portion_rules: Record<string, any>;
  delivery_pricing_rules: Record<string, any>;
  categories: MenuCategory[];
}
