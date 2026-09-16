import json
from pathlib import Path

from db import (
    db_available,
    load_checklist_items_from_db,
    load_helplines_from_db,
    save_checklist_items_to_db,
    save_helplines_to_db,
)

DATA_DIR = Path(__file__).parent.parent / "data"


def _flask_app():
    from extensions import app
    return app


def _load_helplines_json():
    """Reads the hand-curated helpline directory straight from
    data/helplines.json. This is the seed source for the 'helplines'
    table, and also the fallback used when no database is configured
    (e.g. local development)."""
    with open(DATA_DIR / "helplines.json", encoding="utf-8") as f:
        data = json.load(f)
    return data["records"]


def _load_checklist_json():
    """Reads the hand-curated pre-crisis checklist from
    data/pre_crisis_checklist.json, flattened into one row per item to
    match the shape the frontend expects. Seed source for the
    'pre_crisis_checklist_items' table, and the fallback when no
    database is configured."""
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


def seed_static_crisis_content():
    """Loads the hand-curated JSON files into Postgres so /api/helplines
    and /api/checklist can serve from the database like every other
    dataset. Upsert-only and safe to run on every startup. No-ops if no
    database is configured."""
    if not db_available():
        return
    try:
        save_helplines_to_db(_load_helplines_json())
        save_checklist_items_to_db(_load_checklist_json())
    except Exception as e:
        _flask_app().logger.error(f"Crisis content seeding failed: {e}")


def get_helplines(crisis_type="", service_type=""):
    records = load_helplines_from_db()
    if not records:
        records = _load_helplines_json()
    if crisis_type:
        records = [r for r in records if r.get("crisisType") == crisis_type]
    if service_type:
        records = [
            r for r in records
            if (r.get("serviceType") or "").lower() == service_type.lower()
        ]
    return records


def get_checklist_items(crisis_type=""):
    records = load_checklist_items_from_db()
    if not records:
        records = _load_checklist_json()
    if crisis_type:
        records = [r for r in records if r.get("crisisType") == crisis_type]
    return records
