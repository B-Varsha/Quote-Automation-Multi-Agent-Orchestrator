import uuid
from typing import Dict, Any, Optional, List
from app.models.schemas import QuoteSessionState, ProcessQuoteRequest, ConfirmDeliveryRequest
from app.agents.extractor import ExtractorAgent
from app.agents.portion_scaling import PortionScalingAgent
from app.agents.pricing_delivery import PricingDeliveryAgent
from app.agents.sheets_export import SheetsExportAgent
from app.agents.mcp_protocol import MCPContext

# In-memory session store (Redis-ready keyed by session_id)
SESSION_STORE: Dict[str, QuoteSessionState] = {}

class SupervisorAgent:
    """Supervisor Agent (Orchestrator):
    - Manages state progression and session memory keyed by session_id.
    - Validates mandatory fields: customer_name, event_date, event_time, guest_count.
    - Routes requests across Worker 1 (Extractor), Worker 2 (Portion & Scaling),
      Worker 3 (Pricing & Delivery), and Worker 4 (Google Sheets Export).
    """

    def __init__(self):
        self.extractor = ExtractorAgent()
        self.portion_scaler = PortionScalingAgent()
        self.pricing_delivery = PricingDeliveryAgent()
        self.sheets_exporter = SheetsExportAgent()

    def get_or_create_session(self, session_id: Optional[str] = None) -> QuoteSessionState:
        if session_id and session_id in SESSION_STORE:
            return SESSION_STORE[session_id]
        
        new_id = session_id or str(uuid.uuid4())
        new_state = QuoteSessionState(session_id=new_id)
        SESSION_STORE[new_id] = new_state
        return new_state

    def validate_mandatory_fields(self, state: QuoteSessionState) -> List[str]:
        missing = []
        if not state.customer_name or not state.customer_name.strip():
            missing.append("customer_name")
        if not state.event_date or not state.event_date.strip():
            missing.append("event_date")
        if not state.event_time or not state.event_time.strip():
            missing.append("event_time")
        if not state.guest_count or state.guest_count <= 0:
            missing.append("guest_count")
        return missing

    def process_inquiry(self, inquiry_text: str, session_id: Optional[str] = None) -> QuoteSessionState:
        state = self.get_or_create_session(session_id)
        mcp = MCPContext(session_id=state.session_id)

        # Log Supervisor Orchestration Start
        mcp.log("SupervisorAgent", "ROUTE_INQUIRY", "PENDING", {"raw_text": inquiry_text}, "Received user catering inquiry.")

        # Step 1: Extractor Agent
        extracted_data = self.extractor.extract_from_text(inquiry_text)
        
        # Merge extracted fields if not already provided
        if extracted_data.get("customer_name") and not state.customer_name:
            state.customer_name = extracted_data["customer_name"]
        if extracted_data.get("event_date") and not state.event_date:
            state.event_date = extracted_data["event_date"]
        if extracted_data.get("event_time") and not state.event_time:
            state.event_time = extracted_data["event_time"]
        if extracted_data.get("guest_count") and not state.guest_count:
            state.guest_count = extracted_data["guest_count"]
        if extracted_data.get("event_location") and not state.event_location:
            state.event_location = extracted_data["event_location"]

        if extracted_data.get("extracted_items"):
            state.extracted_items = extracted_data["extracted_items"]

        mcp.log("ExtractorAgent", "PARSE_AND_MATCH", "SUCCESS", {
            "items_count": len(state.extracted_items),
            "matched_items": [i.item_name for i in state.extracted_items]
        }, "Extracted items and matched against Maharaja Catering price book menu_prices.json.")

        # Step 2: Portion & Scaling Agent
        if state.guest_count and state.extracted_items:
            updated_items, portion_logs = self.portion_scaler.calculate_portions(state.guest_count, state.extracted_items)
            state.extracted_items = updated_items
            state.portion_recommendations = portion_logs
            mcp.log("PortionScalingAgent", "SCALE_PORTIONS", "SUCCESS", {
                "guest_count": state.guest_count,
                "recommendations": [p.dict() for p in portion_logs]
            }, "Calculated tray counts and quantities using catering rules.")

        # Step 3: Pricing & Delivery Agent
        delivery_details, breakdown = self.pricing_delivery.calculate_pricing_and_delivery(
            items=state.extracted_items,
            guest_count=state.guest_count or 0,
            estimated_miles=state.delivery.estimated_miles or 10.0,
            delivery_fee_override=state.delivery.delivery_fee,
            setup_fee_override=state.delivery.setup_fee,
            plate_type=state.delivery.plate_type,
            discount=state.delivery.discount
        )
        state.delivery = delivery_details
        state.pricing = breakdown
        mcp.log("PricingDeliveryAgent", "CALCULATE_PRICING", "SUCCESS", {
            "subtotal": breakdown.subtotal,
            "delivery_and_setup": breakdown.delivery_and_setup,
            "grand_total": breakdown.grand_total
        }, "Calculated subtotals, delivery fees, taxes, and grand totals.")

        # Step 4: Validate Mandatory Fields
        missing = self.validate_mandatory_fields(state)
        state.missing_fields = missing
        
        if missing:
            state.status = "INCOMPLETE"
            readable_missing = ", ".join([f.replace("_", " ").title() for f in missing])
            state.prompt_for_missing = f"Please provide the missing inquiry details to finalize your quote: {readable_missing}."
            mcp.log("SupervisorAgent", "VALIDATE_MANDATORY_FIELDS", "INCOMPLETE", {
                "missing_fields": missing
            }, state.prompt_for_missing)
        else:
            state.status = "READY_FOR_REVIEW"
            state.prompt_for_missing = None
            mcp.log("SupervisorAgent", "VALIDATE_MANDATORY_FIELDS", "SUCCESS", {
                "missing_fields": []
            }, "All mandatory fields validated. Quote is ready for review/export.")

        # Save MCP trace to state logs
        state.agent_logs.extend([msg.dict() for msg in mcp.messages])
        SESSION_STORE[state.session_id] = state
        return state

    def confirm_delivery(self, req: ConfirmDeliveryRequest) -> QuoteSessionState:
        state = self.get_or_create_session(req.session_id)
        mcp = MCPContext(session_id=state.session_id)

        miles = req.estimated_miles if req.estimated_miles is not None else state.delivery.estimated_miles
        del_fee = req.delivery_fee_override
        setup_fee = req.setup_fee_override
        p_type = req.plate_type or state.delivery.plate_type
        disc = req.discount if req.discount is not None else state.delivery.discount

        delivery_details, breakdown = self.pricing_delivery.calculate_pricing_and_delivery(
            items=state.extracted_items,
            guest_count=state.guest_count or 0,
            estimated_miles=miles,
            delivery_fee_override=del_fee,
            setup_fee_override=setup_fee,
            plate_type=p_type,
            discount=disc
        )

        state.delivery = delivery_details
        state.pricing = breakdown
        state.status = "CONFIRMED"

        mcp.log("PricingDeliveryAgent", "CONFIRM_DELIVERY_ADMIN", "SUCCESS", {
            "miles": miles,
            "delivery_fee": delivery_details.delivery_fee,
            "grand_total": breakdown.grand_total
        }, "Admin confirmed delivery fees, plate costs, and pricing overrides.")

        state.agent_logs.extend([msg.dict() for msg in mcp.messages])
        SESSION_STORE[state.session_id] = state
        return state

    def export_quote(self, session_id: str, title: Optional[str] = None) -> Dict[str, Any]:
        state = self.get_or_create_session(session_id)
        mcp = MCPContext(session_id=state.session_id)

        res = self.sheets_exporter.export_quote_to_sheet(state, title)
        state.status = "EXPORTED"

        mcp.log("SheetsExportAgent", "EXPORT_GOOGLE_SHEET", "SUCCESS", {
            "spreadsheet_url": res["spreadsheet_url"]
        }, "Exported official Maharaja Catering Quote to Google Spreadsheet.")

        state.agent_logs.extend([msg.dict() for msg in mcp.messages])
        SESSION_STORE[state.session_id] = state
        return res
