import json
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"


def _load_helplines_json():
    """Reads the hand-curated helpline directory from data/helplines.json."""
    with open(DATA_DIR / "helplines.json", encoding="utf-8") as f:
        data = json.load(f)
    return data["records"]


def _load_checklist_json():
    """Reads the hand-curated pre-crisis checklist from
    data/pre_crisis_checklist.json, flattened into one row per item to
    match the shape the frontend expects."""
    with open(DATA_DIR / "pre_crisis_checklist.json", encoding="utf-8") as f:
        data = json.load(f)

    items = []
    for group in data["groups"]:
        crisis_type = group["crisisType"]
        category_id = group["categoryId"]
        category = group["category"]
        for order, item in enumerate(group["items"]):
            items.append({
                "id": f"{crisis_type}-{category_id}-{item['itemId']}",
                "crisisType": crisis_type,
                "category": category,
                "categoryId": category_id,
                "itemId": item["itemId"],
                "task": item["task"],
                "description": item["description"],
                "steps": item["steps"],
                "displayOrder": order,
                "isActive": True,
            })
    return items


# Same file loaders that already served production whenever the Neon tables
# were empty. Cached once at import so each request filters in memory.
_HELPLINES = _load_helplines_json()
_CHECKLIST_ITEMS = _load_checklist_json()


def get_helplines(crisis_type="", service_type=""):
    records = _HELPLINES
    if crisis_type:
        records = [r for r in records if r.get("crisisType") == crisis_type]
    if service_type:
        records = [
            r for r in records
            if (r.get("serviceType") or "").lower() == service_type.lower()
        ]
    return records


def get_checklist_items(crisis_type=""):
    records = _CHECKLIST_ITEMS
    if crisis_type:
        records = [r for r in records if r.get("crisisType") == crisis_type]
    return records
