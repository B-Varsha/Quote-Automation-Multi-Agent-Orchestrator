from typing import List, Tuple
from app.models.schemas import ExtractedItem, DeliveryDetails, QuoteBreakdown

class PricingDeliveryAgent:
    """Worker Agent 3: Pricing & Delivery Agent.
    Calculates delivery fees based on location rules ($50 local, $100 extended, per mile),
    subtotals, taxes, plate costs, and grand totals.
    """

    def calculate_pricing_and_delivery(
        self,
        items: List[ExtractedItem],
        guest_count: int,
        estimated_miles: float = 10.0,
        delivery_fee_override: float = None,
        setup_fee_override: float = None,
        plate_type: str = "disposable_plates",
        discount: float = 0.0,
        tax_rate: float = 0.08875
    ) -> Tuple[DeliveryDetails, QuoteBreakdown]:
        
        # Calculate Delivery Fee based on distance rules
        if delivery_fee_override is not None:
            delivery_fee = float(delivery_fee_override)
        else:
            if estimated_miles <= 15.0:
                delivery_fee = 50.00
            elif estimated_miles <= 30.0:
                delivery_fee = 100.00
            else:
                delivery_fee = 100.00 + ((estimated_miles - 30.0) * 2.50)

        setup_fee = setup_fee_override if setup_fee_override is not None else 50.00

        # Plate cost calculation
        plate_cost_per_guest = 2.50
        if plate_type == "eco_plates":
            plate_cost_per_guest = 4.50
        elif plate_type == "none":
            plate_cost_per_guest = 0.00

        guest_cnt = guest_count if guest_count and guest_count > 0 else 0
        total_plate_cost = guest_cnt * plate_cost_per_guest

        delivery_details = DeliveryDetails(
            estimated_miles=estimated_miles,
            delivery_fee=delivery_fee,
            setup_fee=setup_fee,
            plate_type=plate_type,
            plate_cost_per_guest=plate_cost_per_guest,
            total_plate_cost=total_plate_cost,
            discount=discount
        )

        # Calculate Food Subtotal
        subtotal = sum(item.total_price for item in items) + total_plate_cost
        after_discount = max(0.0, subtotal - discount)
        
        # Delivery & Setup
        delivery_and_setup = delivery_fee + setup_fee
        
        # Taxable amount = discounted subtotal + delivery & setup
        taxable_amount = after_discount + delivery_and_setup
        tax_amount = round(taxable_amount * tax_rate, 2)
        grand_total = round(taxable_amount + tax_amount, 2)

        breakdown = QuoteBreakdown(
            subtotal=subtotal,
            discount=discount,
            taxable_amount=taxable_amount,
            tax_rate=tax_rate,
            tax_amount=tax_amount,
            delivery_and_setup=delivery_and_setup,
            plate_total=total_plate_cost,
            grand_total=grand_total
        )

        return delivery_details, breakdown
