import math
from typing import List, Dict, Any
from app.models.schemas import ExtractedItem, PortionRuleResult

class PortionScalingAgent:
    """Worker Agent 2: Portion & Scaling Agent.
    Calculates tray counts & quantities based on Maharaja Catering rules:
    - Biryani: ~75 guests per large tray (or ~35 per medium tray)
    - Curries: ~90 guests per large tray (or ~45 per medium tray)
    - Appetizers: 1.75 pieces per guest (1.5 - 2 pcs)
    - Breads: 1.5 naans per guest
    - Rice: ~60 guests per large tray
    - Desserts: 1.25 pieces per guest
    """

    def calculate_portions(self, guest_count: int, items: List[ExtractedItem]) -> Tuple[List[ExtractedItem], List[PortionRuleResult]]:
        if not guest_count or guest_count <= 0:
            guest_count = 50  # Default estimate if not provided

        updated_items: List[ExtractedItem] = []
        portion_logs: List[PortionRuleResult] = []

        for item in items:
            cat = item.category or "general"
            unit_price = item.unit_price
            new_qty = item.quantity
            rec_large = 0
            rec_med = 0
            rec_pcs = 0
            explanation = ""

            if cat == "biryani":
                # ~75 guests per large tray
                large_trays = max(1, math.ceil(guest_count / 75.0))
                rec_large = large_trays
                new_qty = float(large_trays)
                explanation = f"Calculated {large_trays} Large Tray(s) based on ~75 guests/tray rule for {guest_count} guests."
            
            elif cat == "curry":
                # ~90 guests per large tray
                large_trays = max(1, math.ceil(guest_count / 90.0))
                rec_large = large_trays
                new_qty = float(large_trays)
                explanation = f"Calculated {large_trays} Large Tray(s) based on ~90 guests/tray rule for {guest_count} guests."

            elif cat == "appetizer_pieces":
                # 1.75 pieces per guest
                total_pcs = max(20, math.ceil(guest_count * 1.75))
                rec_pcs = total_pcs
                new_qty = float(total_pcs)
                explanation = f"Calculated {total_pcs} pieces based on 1.75 pieces/guest rule for {guest_count} guests."

            elif cat == "bread_pieces":
                # 1.5 breads per guest
                total_breads = max(20, math.ceil(guest_count * 1.5))
                rec_pcs = total_breads
                new_qty = float(total_breads)
                explanation = f"Calculated {total_breads} Naans based on 1.5 naans/guest rule for {guest_count} guests."

            elif cat == "rice_trays":
                # ~60 guests per large tray
                large_trays = max(1, math.ceil(guest_count / 60.0))
                rec_large = large_trays
                new_qty = float(large_trays)
                explanation = f"Calculated {large_trays} Large Tray(s) based on ~60 guests/tray rule for {guest_count} guests."

            elif cat == "dessert_pieces":
                # 1.25 pieces per guest
                total_pcs = max(20, math.ceil(guest_count * 1.25))
                rec_pcs = total_pcs
                new_qty = float(total_pcs)
                explanation = f"Calculated {total_pcs} pieces based on 1.25 pieces/guest rule for {guest_count} guests."

            elif item.unit_type == "per_guest":
                new_qty = float(guest_count)
                explanation = f"Scaled to {guest_count} guests (per guest service rate)."

            else:
                explanation = f"Maintained requested quantity of {item.quantity} {item.unit_type}."

            updated_item = ExtractedItem(
                item_id=item.item_id,
                item_name=item.item_name,
                category=item.category,
                quantity=new_qty,
                unit_type=item.unit_type,
                unit_price=unit_price,
                total_price=float(unit_price * new_qty),
                matched=item.matched,
                notes=explanation
            )
            updated_items.append(updated_item)

            portion_logs.append(PortionRuleResult(
                item_name=item.item_name,
                recommended_trays_large=rec_large,
                recommended_trays_medium=rec_med,
                recommended_pieces=rec_pcs,
                explanation=explanation
            ))

        return updated_items, portion_logs
