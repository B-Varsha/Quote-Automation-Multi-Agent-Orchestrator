from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

class ExtractedItem(BaseModel):
    item_id: Optional[str] = None
    item_name: str
    category: Optional[str] = "custom"
    quantity: float = 1.0
    unit_type: str = "tray_large"  # tray_large, tray_medium, piece, per_guest, dispenser
    unit_price: float = 0.0
    total_price: float = 0.0
    matched: bool = False
    notes: Optional[str] = None

class MandatoryFields(BaseModel):
    customer_name: Optional[str] = None
    event_date: Optional[str] = None
    event_time: Optional[str] = None
    guest_count: Optional[int] = None

class PortionRuleResult(BaseModel):
    item_name: str
    recommended_trays_large: Optional[int] = 0
    recommended_trays_medium: Optional[int] = 0
    recommended_pieces: Optional[int] = 0
    explanation: str

class DeliveryDetails(BaseModel):
    address: Optional[str] = None
    estimated_miles: float = 10.0
    delivery_fee: float = 50.00
    setup_fee: float = 50.00
    plate_type: str = "disposable_plates"  # disposable_plates ($2.50) or eco_plates ($4.50) or none
    plate_cost_per_guest: float = 2.50
    total_plate_cost: float = 0.0
    discount: float = 0.0

class QuoteBreakdown(BaseModel):
    subtotal: float = 0.0
    discount: float = 0.0
    taxable_amount: float = 0.0
    tax_rate: float = 0.08875
    tax_amount: float = 0.0
    delivery_and_setup: float = 100.00
    plate_total: float = 0.0
    grand_total: float = 0.0

class QuoteSessionState(BaseModel):
    session_id: str
    status: str = "INCOMPLETE"  # INCOMPLETE, READY_FOR_REVIEW, CONFIRMED, EXPORTED
    customer_name: Optional[str] = None
    event_date: Optional[str] = None
    event_time: Optional[str] = None
    guest_count: Optional[int] = None
    event_location: Optional[str] = None
    
    extracted_items: List[ExtractedItem] = []
    portion_recommendations: List[PortionRuleResult] = []
    delivery: DeliveryDetails = Field(default_factory=DeliveryDetails)
    pricing: QuoteBreakdown = Field(default_factory=QuoteBreakdown)
    
    missing_fields: List[str] = []
    prompt_for_missing: Optional[str] = None
    agent_logs: List[Dict[str, Any]] = []
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())

class ProcessQuoteRequest(BaseModel):
    session_id: Optional[str] = None
    inquiry_text: str

class ConfirmDeliveryRequest(BaseModel):
    session_id: str
    estimated_miles: Optional[float] = None
    delivery_fee_override: Optional[float] = None
    setup_fee_override: Optional[float] = None
    plate_type: Optional[str] = None
    discount: Optional[float] = 0.0

class ExportQuoteRequest(BaseModel):
    session_id: str
    spreadsheet_title: Optional[str] = None

class ExportQuoteResponse(BaseModel):
    session_id: str
    spreadsheet_url: str
    status: str = "SUCCESS"
    message: str
