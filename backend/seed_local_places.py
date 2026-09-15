import requests
from sqlalchemy import text
from db import _engine

AREAS = {
    "Bendigo": "3550",
    "Castlemaine": "3450",
    "Ballarat": "3350",
    "Harcourt": "3453",
    "Melbourne CBD": "3000",
    "Clayton": "3168",
}

WIFI_LIMIT = 20
SUPPORT_LIMIT = 20


def upsert_wifi(records):
    if not records:
        return 0
    inserted = 0
    with _engine.begin() as conn:
        for rec in records:
            if not rec.get("id"):
                continue
            conn.execute(
                text(
                    """
                    INSERT INTO wifi_locations
                        (id, name, address, suburb, postcode, latitude, longitude,
                         opening_hours, access_conditions, verification_status, data_updated_at)
                    VALUES
                        (:id, :name, :address, :suburb, :postcode, :latitude, :longitude,
                         :opening_hours, :access_conditions, :verification_status, :data_updated_at)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        address = EXCLUDED.address,
                        suburb = EXCLUDED.suburb,
                        postcode = EXCLUDED.postcode,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        opening_hours = EXCLUDED.opening_hours,
                        access_conditions = EXCLUDED.access_conditions,
                        verification_status = EXCLUDED.verification_status,
                        data_updated_at = EXCLUDED.data_updated_at
                    """
                ),
                {
                    "id": rec.get("id"),
                    "name": rec.get("name"),
                    "address": rec.get("address"),
                    "suburb": rec.get("suburb"),
                    "postcode": rec.get("postcode"),
                    "latitude": rec.get("latitude"),
                    "longitude": rec.get("longitude"),
                    "opening_hours": rec.get("openingHours"),
                    "access_conditions": rec.get("accessConditions") or [],
                    "verification_status": rec.get("verificationStatus"),
                    "data_updated_at": rec.get("dataUpdatedAt"),
                },
            )
            inserted += 1
    return inserted


def upsert_support(records):
    if not records:
        return 0
    inserted = 0
    with _engine.begin() as conn:
        for rec in records:
            if not rec.get("id"):
                continue
            conn.execute(
                text(
                    """
                    INSERT INTO charities
                        (id, name, service_types, address, suburb, postcode, latitude, longitude,
                         phone, website, eligibility, partner_status, availability_status,
                         availability_updated_at, availability_freshness, data_updated_at)
                    VALUES
                        (:id, :name, :service_types, :address, :suburb, :postcode, :latitude, :longitude,
                         :phone, :website, :eligibility, :partner_status, :availability_status,
                         :availability_updated_at, :availability_freshness, :data_updated_at)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        service_types = EXCLUDED.service_types,
                        address = EXCLUDED.address,
                        suburb = EXCLUDED.suburb,
                        postcode = EXCLUDED.postcode,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        phone = EXCLUDED.phone,
                        website = EXCLUDED.website,
                        eligibility = EXCLUDED.eligibility,
                        partner_status = EXCLUDED.partner_status,
                        availability_status = EXCLUDED.availability_status,
                        availability_updated_at = EXCLUDED.availability_updated_at,
                        availability_freshness = EXCLUDED.availability_freshness,
                        data_updated_at = EXCLUDED.data_updated_at
                    """
                ),
                {
                    "id": rec.get("id"),
                    "name": rec.get("name"),
                    "service_types": rec.get("serviceTypes") or ["Community support services"],
                    "address": rec.get("address"),
                    "suburb": rec.get("suburb"),
                    "postcode": rec.get("postcode"),
                    "latitude": rec.get("latitude"),
                    "longitude": rec.get("longitude"),
                    "phone": rec.get("phone"),
                    "website": rec.get("website"),
                    "eligibility": rec.get("eligibility"),
                    "partner_status": rec.get("partnerStatus"),
                    "availability_status": rec.get("availabilityStatus"),
                    "availability_updated_at": rec.get("availabilityUpdatedAt"),
                    "availability_freshness": rec.get("availabilityFreshness"),
                    "data_updated_at": rec.get("dataUpdatedAt"),
                },
            )
            inserted += 1
    return inserted


def main():
    wifi_total = 0
    support_total = 0
    for area, postcode in AREAS.items():
        wifi_resp = requests.get(f"http://127.0.0.1:5001/api/wifi?postcode={postcode}", timeout=30)
        wifi_resp.raise_for_status()
        wifi_records = wifi_resp.json().get("records", [])[:WIFI_LIMIT]

        support_resp = requests.get(f"http://127.0.0.1:5001/api/charities?postcode={postcode}", timeout=30)
        support_resp.raise_for_status()
        support_records = support_resp.json().get("records", [])[:SUPPORT_LIMIT]

        wifi_total += upsert_wifi(wifi_records)
        support_total += upsert_support(support_records)
        print(f"{area} ({postcode}) -> wifi={len(wifi_records)} support={len(support_records)}")

    print(f"TOTAL wifi upserted={wifi_total}")
    print(f"TOTAL support upserted={support_total}")


if __name__ == "__main__":
    main()
