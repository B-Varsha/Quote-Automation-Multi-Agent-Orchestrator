#!/usr/bin/env python3
"""
Maharaja Catering Menu Extractor Agent (Pure AI Engine)

Fully delegates extraction, entity recognition, category consistency, 
and Step Back reasoning grounding to Gemini.
"""

import sys
import json
import os
import time
import urllib.request

def load_menu_db():
    possible_paths = [
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'menu_prices.json'),
        os.path.join(os.getcwd(), 'menu_prices.json'),
        'menu_prices.json'
    ]
    for p in possible_paths:
        if os.path.exists(p):
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
    return {"categories": []}

def get_flattened_menu(menu_db):
    items = []
    for cat in menu_db.get("categories", []):
        cat_id = cat.get("id", "")
        cat_name = cat.get("name", "")
        for item in cat.get("items", []):
            item_copy = dict(item)
            item_copy["category_id"] = cat_id
            item_copy["category_name"] = cat_name
            items.append(item_copy)
    return items

def process_inquiry(inquiry_text: str):
    menu_db = load_menu_db()
    flattened_menu = get_flattened_menu(menu_db)
    
    api_key = os.environ.get("GEMINI_API_KEY", "YOUR_ACTUAL_API_KEY")
    
    if not api_key or api_key == "YOUR_ACTUAL_API_KEY":
        return {"error": "Missing valid Gemini API key. Pure AI extraction requires an active key."}

    menu_context = json.dumps(flattened_menu, indent=2)

    prompt_payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": f"""You are the Menu Extractor Agent for Maharaja Catering. 
Extract the order details and match food items to our official catalog.

OFFICIAL MENU CATALOG:
{menu_context}

EXTRACTION AND GROUNDING RULES:
1. Extract logistics like name, guest count, date, time, and location.
2. Extract all food and drink items requested.
3. For every item you MUST perform Step Back Reasoning before matching.
   Step 1 Abstraction: Identify the broad food category of the requested dish. Write this in step_back_analysis.
   Step 2 Reasoning: Compare this broad category to the OFFICIAL MENU CATALOG. Determine the best available options that strictly belong to this exact category. Write this in reasoning.
   Step 3 Matching: 
     If an exact or highly confident match exists set matched to true.
     If ambiguous set matched to false and provide clarification_options.
     If custom or missing set matched to false and provide top_suggestions strictly from the same broad category identified in Step 1.
4. CRITICAL: Never suggest items outside the abstracted category. Do not suggest rice for a bread query.

CUSTOMER INQUIRY:
"{inquiry_text}"
"""
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "customer_name": {"type": "STRING"},
                    "guest_count": {"type": "INTEGER"},
                    "fulfillment_type": {"type": "STRING"},
                    "event_date": {"type": "STRING"},
                    "event_time": {"type": "STRING"},
                    "event_location": {"type": "STRING"},
                    "extracted_items": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "id": {"type": "STRING"},
                                "item_id": {"type": "STRING"},
                                "item_name": {"type": "STRING"},
                                "category": {"type": "STRING"},
                                "step_back_analysis": {
                                    "type": "STRING",
                                    "description": "Abstract the user request into a broad food category."
                                },
                                "reasoning": {
                                    "type": "STRING",
                                    "description": "Explain how the catalog suggestions fit the abstracted category."
                                },
                                "unit_type": {"type": "STRING"},
                                "quantity": {"type": "NUMBER"},
                                "unit_price": {"type": "NUMBER"},
                                "total_price": {"type": "NUMBER"},
                                "matched": {"type": "BOOLEAN"},
                                "match_confidence": {"type": "INTEGER"},
                                "requires_human_review": {"type": "BOOLEAN"},
                                "clarification_needed": {"type": "BOOLEAN"},
                                "clarification_prompt": {"type": "STRING"},
                                "clarification_options": {
                                    "type": "ARRAY",
                                    "items": {
                                        "type": "OBJECT",
                                        "properties": {
                                            "id": {"type": "STRING"},
                                            "name": {"type": "STRING"},
                                            "category": {"type": "STRING"},
                                            "unit_type": {"type": "STRING"},
                                            "unit_price": {"type": "NUMBER"},
                                            "confidence": {"type": "INTEGER"}
                                        }
                                    }
                                },
                                "top_suggestions": {
                                    "type": "ARRAY",
                                    "items": {
                                        "type": "OBJECT",
                                        "properties": {
                                            "id": {"type": "STRING"},
                                            "name": {"type": "STRING"},
                                            "category": {"type": "STRING"},
                                            "unit_type": {"type": "STRING"},
                                            "unit_price": {"type": "NUMBER"},
                                            "confidence": {"type": "INTEGER"}
                                        }
                                    }
                                },
                                "notes": {"type": "STRING"}
                            },
                            "required": ["item_name", "quantity", "matched", "step_back_analysis", "reasoning"]
                        }
                    }
                }
            }
        }
    }

    models_to_try = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-flash-8b", "gemini-flash-latest"]
    last_error_msg = None

    for model_name in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        headers = {
            'Content-Type': 'application/json',
            'x-goog-api-key': api_key,
            'User-Agent': 'aistudio-build'
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(prompt_payload).encode('utf-8'),
            headers=headers
        )

        for attempt in range(2):
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    text_resp = data['candidates'][0]['content']['parts'][0]['text']
                    parsed = json.loads(text_resp)
                    parsed["extraction_method"] = "pure_gemini_rag"
                    parsed["extraction_reasoning"] = f"Fully automated extraction and Step Back catalog grounding via {model_name}."
                    return parsed
            except urllib.error.HTTPError as http_err:
                try:
                    err_body = http_err.read().decode('utf-8')
                    err_json = json.loads(err_body)
                    last_error_msg = f"HTTP {http_err.code} {err_json.get('error', {}).get('message', err_body)}"
                except Exception:
                    last_error_msg = f"HTTP {http_err.code} {http_err.reason}"
                time.sleep(0.5)
            except Exception as gen_err:
                last_error_msg = str(gen_err)
                time.sleep(0.5)

    return {
        "error": "Failed to connect to Gemini API after 3 attempts.",
        "details": last_error_msg
    }

class ExtractorAgent:
    def extract_from_text(self, text: str):
        return process_inquiry(text)

if __name__ == "__main__":
    text = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else sys.stdin.read()
    print(json.dumps(process_inquiry(text), indent=2))