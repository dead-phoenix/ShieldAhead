import json
import os
import random
import subprocess
import sys
from collections import Counter
from pathlib import Path

import pytest
import requests

import build_offline_data as bod

FIXTURES = Path(__file__).resolve().parent / "fixtures"
SCRIPTS_DIR = Path(__file__).resolve().parent.parent

BENDIGO = (144.2794, -36.7570)
ECHUCA = (144.7515, -36.1420)
BALLARAT = (143.8503, -37.5622)
MELBOURNE_CBD = (144.9631, -37.8136)


@pytest.fixture(scope="module")
def region_fixture():
    return json.loads((FIXTURES / "region_lgas.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def region(region_fixture):
    return bod.Region([(l["code"], l["name"], l["rings"]) for l in region_fixture["lgas"]])


def square(x0, y0, size):
    return [[[x0, y0], [x0, y0 + size], [x0 + size, y0 + size], [x0 + size, y0], [x0, y0]]]


def make_record(**overrides):
    fields = dict(
        id="vicmap-foi-1", category="police", name="Bendigo Police Station", address=None,
        suburb="Bendigo", postcode="3550", lat=-36.757, lng=144.279, locationPrecision="feature",
        serviceTypes=["Police station"], verification=None, sourceId="vicmap-foi",
    )
    fields.update(overrides)
    return bod.service_record(**fields)


class StubLocalities:
    def name_at(self, lng, lat):
        return "Bendigo"


class StubPostal:
    centroids = {"3550": (144.28, -36.76), "3350": (143.85, -37.56)}

    def postcode_at(self, lng, lat):
        return "3550"


# ---------------------------------------------------------------- region

def test_six_lga_codes_map_to_expected_names(region_fixture):
    expected = {
        "21370": "Campaspe",
        "21670": "Central Goldfields",
        "22620": "Greater Bendigo",
        "23940": "Loddon",
        "24130": "Macedon Ranges",
        "25430": "Mount Alexander",
    }
    assert bod.REGION_LGAS == expected
    assert {l["code"]: l["name"] for l in region_fixture["lgas"]} == expected
    assert set(bod.VICMAP_LGA_CODES) == set(expected)
    bod.validate_region_lgas(expected)


def test_validate_region_lgas_rejects_wrong_or_missing_lgas():
    wrong = dict(bod.REGION_LGAS, **{"22620": "Ballarat"})
    with pytest.raises(bod.PipelineError):
        bod.validate_region_lgas(wrong)
    missing = {k: v for k, v in bod.REGION_LGAS.items() if k != "21370"}
    with pytest.raises(bod.PipelineError):
        bod.validate_region_lgas(missing)


@pytest.mark.parametrize("point", [BENDIGO, ECHUCA], ids=["Bendigo", "Echuca"])
def test_region_includes_bendigo_and_echuca(region, point):
    assert region.contains(*point)


@pytest.mark.parametrize("point", [BALLARAT, MELBOURNE_CBD], ids=["Ballarat", "Melbourne CBD"])
def test_region_excludes_ballarat_and_melbourne(region, point):
    assert not region.contains(*point)


def test_bbox_alone_would_leak_ballarat(region):
    assert bod.bbox_contains_point(bod.REGION_BBOX, *BALLARAT)
    assert not region.contains(*BALLARAT)
    box = region.bbox
    guard = bod.REGION_BBOX
    assert guard[0] <= box[0] and guard[1] <= box[1] and box[2] <= guard[2] and box[3] <= guard[3]


def test_lga_for_names_the_containing_lga(region):
    assert region.lga_for(*BENDIGO) == "Greater Bendigo"
    assert region.lga_for(*ECHUCA) == "Campaspe"


# ---------------------------------------------------------------- geometry

def test_point_in_rings_handles_holes():
    rings = square(0, 0, 10) + square(4, 4, 2)
    assert bod.point_in_rings(1, 1, rings)
    assert not bod.point_in_rings(5, 5, rings)


def test_label_point_is_centroid_for_convex_and_inside_for_concave():
    x, y = bod.polygon_label_point(square(0, 0, 2))
    assert (round(x, 6), round(y, 6)) == (1, 1)
    u_shape = [[[0, 0], [0, 3], [1, 3], [1, 1], [2, 1], [2, 3], [3, 3], [3, 0], [0, 0]]]
    x, y = bod.polygon_label_point(u_shape)
    assert bod.point_in_rings(x, y, u_shape)


# ---------------------------------------------------------------- hospital filter / emergency

def test_hospital_filter_keeps_general_hospitals_only():
    assert bod.emergency_category("general hospital") == "hospital"
    assert bod.emergency_category("day procedure centre") is None
    assert bod.emergency_category("police station") == "police"
    assert bod.emergency_category("fire station") == "fire"
    assert bod.emergency_category("ambulance station") == "ambulance"


def _foi(pfi, subtype, name, x=144.28, y=-36.75, vmadd=None):
    return {
        "attributes": {"OBJECTID": 999, "pfi": pfi, "name": name.upper(), "name_label": name,
                       "feature_subtype": subtype, "vmadd_pfi": vmadd},
        "geometry": {"x": x, "y": y},
    }


def test_build_emergency_records_uses_pfi_ids_and_drops_day_procedure():
    features = [
        _foi("200", "general hospital", "Bendigo Hospital", vmadd="77"),
        _foi("100", "day procedure centre", "Bendigo Day Surgery"),
        _foi("300", "fire station", "Bendigo Fire Station"),
    ]
    addresses = {"77": {"address": "100 Barnard Street", "suburb": "Bendigo", "postcode": "3550"}}
    records = bod.build_emergency_records(features, addresses, StubLocalities(), StubPostal())
    by_id = {r["id"]: r for r in records}
    assert set(by_id) == {"vicmap-foi-200", "vicmap-foi-300"}
    hospital = by_id["vicmap-foi-200"]
    assert hospital["category"] == "hospital"
    assert hospital["serviceTypes"] == ["General hospital"]
    assert hospital["address"] == "100 Barnard Street"
    assert hospital["locationPrecision"] == "feature"
    assert by_id["vicmap-foi-300"]["suburb"] == "Bendigo"


# ---------------------------------------------------------------- overrides

def test_apply_overrides_excludes_and_adds_service_types():
    records = [
        make_record(id="a", category="hospital", name="Wayipunga Bendigo Early Parenting Centre", serviceTypes=["General hospital"]),
        make_record(id="b", category="hospital", name="Dingee Bush Nursing Centre", serviceTypes=["General hospital"]),
    ]
    overrides = {
        "exclude": [{"id": "a", "name": "Wayipunga Bendigo Early Parenting Centre", "reason": "r"}],
        "addServiceTypes": [{"id": "b", "name": "Dingee Bush Nursing Centre", "serviceTypes": ["Bush nursing centre"], "reason": "r"},
                            {"id": "gone", "name": "Old", "serviceTypes": ["x"], "reason": "r"}],
    }
    kept, warnings = bod.apply_overrides(records, overrides)
    assert [r["id"] for r in kept] == ["b"]
    assert kept[0]["serviceTypes"] == ["General hospital", "Bush nursing centre"]
    assert len(warnings) == 1 and "gone" in warnings[0]


def test_apply_overrides_fails_on_name_mismatch():
    records = [make_record(id="a", name="Something Else")]
    with pytest.raises(bod.PipelineError):
        bod.apply_overrides(records, {"exclude": [{"id": "a", "name": "Expected", "reason": "r"}]})


def test_committed_overrides_file_is_reviewed_and_complete():
    overrides = bod.load_overrides()
    excluded = {e["name"] for e in overrides["exclude"]}
    assert {"Wayipunga Bendigo Early Parenting Centre", "Hems3 Ambulance Station",
            "Oscar 1 Emerg Response Fire Station"} <= excluded
    additions = {e["name"]: e["serviceTypes"] for e in overrides["addServiceTypes"]}
    assert additions["Dingee Bush Nursing Centre"] == ["Bush nursing centre"]
    assert additions["Lockington District Bush Nursing Centre"] == ["Bush nursing centre"]
    for entry in overrides["exclude"] + overrides["addServiceTypes"]:
        assert entry["reason"].strip()
        assert entry["id"].startswith("vicmap-foi-")


# ---------------------------------------------------------------- schema validation

def test_valid_service_record_passes():
    assert bod.validate_service_record(make_record()) == []


@pytest.mark.parametrize("change, expected", [
    ({"lat": None}, "lat/lng missing"),
    ({"lat": -37.8136, "lng": 144.9631}, "outside region bbox"),
    ({"category": "pharmacy"}, "category"),
    ({"locationPrecision": "exact"}, "locationPrecision"),
    ({"verification": "maybe"}, "verification"),
    ({"serviceTypes": []}, "serviceTypes"),
    ({"postcode": "355"}, "postcode"),
])
def test_invalid_service_records_fail(change, expected):
    errors = bod.validate_service_record(make_record(**change))
    assert any(expected in e for e in errors), errors


def test_charity_records_must_hide_address_and_round_to_3dp():
    ok = make_record(id="acnc-1", category="charity", lat=-36.757, lng=144.279, locationPrecision="street",
                     verification="not-confirmed", sourceId="acnc")
    assert bod.validate_service_record(ok) == []
    with_address = make_record(id="acnc-1", category="charity", address="1 Smith Street", sourceId="acnc")
    assert "charity address must be null" in bod.validate_service_record(with_address)
    precise = make_record(id="acnc-1", category="charity", lat=-36.75712, sourceId="acnc")
    assert any("3 decimal" in e for e in bod.validate_service_record(precise))


def _doc(name, records):
    source = {k: "x" for k in bod.SOURCE_KEYS}
    return bod.make_document({"id": "loddon-campaspe"}, [], [source], records, "2026-01-01T00:00:00Z")


def test_validate_data_file_fails_when_a_category_is_empty():
    records = [make_record(id="1", category="police"), make_record(id="2", category="fire", name="F")]
    errors = bod.validate_data_file("offline-emergency-services.json", _doc("e", records))
    assert any("'hospital' has 0 records" in e for e in errors)
    assert any("'ambulance' has 0 records" in e for e in errors)


def test_validate_data_file_flags_duplicates_and_stray_categories():
    records = [make_record(id="1", category="wifi"), make_record(id="1", category="police")]
    errors = bod.validate_data_file("offline-wifi.json", _doc("w", records))
    assert any("duplicate ids" in e for e in errors)
    assert any("unexpected categories" in e for e in errors)


def test_budget_checks():
    ok = {name: 50_000 for name in bod.SERVICE_FILES}
    ok.update({"postcodes.json": 40_000, "localities.json": 100_000, "offline-manifest.json": 1_000})
    assert bod.check_budgets(ok)[0] == []
    too_big_services = dict(ok, **{"offline-charities.json": 250_000})
    assert any("service files total" in e for e in bod.check_budgets(too_big_services)[0])
    too_big_total = dict(ok, **{"localities.json": 600_000})
    assert any("all files total" in e for e in bod.check_budgets(too_big_total)[0])
    missing = {k: v for k, v in ok.items() if k != "offline-wifi.json"}
    assert any("offline-wifi.json is missing" in e for e in bod.check_budgets(missing)[0])


# ---------------------------------------------------------------- determinism

def _records(n=20):
    return [make_record(id=f"vicmap-foi-{i:03d}", name=f"Station {i}") for i in range(n)]


def test_serialisation_is_independent_of_input_order():
    records = _records()
    shuffled = records[:]
    random.Random(7).shuffle(shuffled)
    a = bod.serialise_document(_doc("x", records))
    b = bod.serialise_document(_doc("x", shuffled))
    assert a == b
    assert a.endswith("]}\n")
    lines = a.splitlines()
    assert len(lines) == len(records) + 2  # header line, one line per record, closing line
    assert json.loads(a)["records"] == sorted(records, key=lambda r: r["id"])


def test_data_version_tracks_records_only():
    records = _records()
    assert bod.data_version(records) == bod.data_version(json.loads(json.dumps(records)))
    changed = json.loads(json.dumps(records))
    changed[0]["name"] = "Renamed"
    assert bod.data_version(changed) != bod.data_version(records)


def test_unchanged_records_keep_previous_file_byte_for_byte():
    source = {k: "x" for k in bod.SOURCE_KEYS}
    old = bod.make_document({"id": "r"}, ["n"], [dict(source, retrievedAt="2026-01-01T00:00:00Z")], _records(), "2026-01-01T00:00:00Z")
    old_text = bod.serialise_document(old)
    new = bod.make_document({"id": "r"}, ["n"], [dict(source, retrievedAt="2026-02-01T00:00:00Z")], _records(), "2026-02-01T00:00:00Z")
    assert bod.reuse_if_unchanged(new, old_text) == old_text
    changed_records = _records()
    changed_records[3]["name"] = "Renamed"
    changed = bod.make_document({"id": "r"}, ["n"], [source], changed_records, "2026-02-01T00:00:00Z")
    assert bod.reuse_if_unchanged(changed, old_text) != old_text


def test_only_a_data_version_change_rewrites_the_file_and_manifest():
    source = {k: "x" for k in bod.SOURCE_KEYS}
    old_source = dict(source, retrievedAt="2026-01-01T00:00:00Z", sourceUpdatedAt="2025-12-01T00:00:00Z")
    old = bod.make_document({"id": "r"}, ["Updated by the publisher on 2025-12-01."], [old_source], _records(),
                            "2026-01-01T00:00:00Z")
    old_text = bod.serialise_document(old)
    old_manifest = bod.build_manifest({"f.json": old_text})

    new_source = dict(source, retrievedAt="2026-02-01T00:00:00Z", sourceUpdatedAt="2026-01-20T00:00:00Z")
    dates_only = bod.make_document({"id": "r"}, ["Updated by the publisher on 2026-01-20."], [new_source], _records(),
                                   "2026-02-01T00:00:00Z")
    assert dates_only["dataVersion"] == old["dataVersion"]
    kept = bod.reuse_if_unchanged(dates_only, old_text)
    assert kept == old_text
    assert bod.build_manifest({"f.json": kept}) == old_manifest

    changed_records = _records()
    changed_records[0]["postcode"] = "3551"
    changed = bod.make_document({"id": "r"}, ["Updated by the publisher on 2026-01-20."], [new_source], changed_records,
                                "2026-02-01T00:00:00Z")
    rewritten = bod.reuse_if_unchanged(changed, old_text)
    assert json.loads(rewritten)["dataVersion"] == changed["dataVersion"] != old["dataVersion"]
    assert json.loads(rewritten)["sources"][0]["sourceUpdatedAt"] == "2026-01-20T00:00:00Z"
    assert bod.build_manifest({"f.json": rewritten}) != old_manifest

    tampered = json.loads(old_text)
    tampered["records"][0]["name"] = "Hand edited"
    assert bod.reuse_if_unchanged(dates_only, json.dumps(tampered)) == bod.serialise_document(dates_only)


def test_manifest_is_deterministic_and_describes_files():
    texts = {"b.json": bod.serialise_document(_doc("b", _records(3))), "a.json": bod.serialise_document(_doc("a", _records(2)))}
    first = bod.build_manifest(texts)
    assert first == bod.build_manifest(dict(reversed(list(texts.items()))))
    manifest = json.loads(first)
    assert [f["file"] for f in manifest["files"]] == ["a.json", "b.json"]
    assert manifest["files"][0]["recordCount"] == 2
    assert manifest["files"][0]["bytes"] == len(texts["a.json"].encode("utf-8"))


# ---------------------------------------------------------------- localities and postcodes

@pytest.mark.parametrize("raw, expected", [
    ("MOONLIGHT FLAT (CASTLEMAINE)", "Moonlight Flat (Castlemaine)"),
    ("SPRINGFIELD (ROMSEY)", "Springfield (Romsey)"),
    ("KANGAROO FLAT", "Kangaroo Flat"),
    ("MCKENZIE HILL", "McKenzie Hill"),
    ("BRIDGEWATER ON LODDON", "Bridgewater on Loddon"),
    ("O'BRIENS CROSSING", "O'Briens Crossing"),
    ("BUSHMAN'S GULLY", "Bushman's Gully"),
    ("CARLSRUHE-SOUTH", "Carlsruhe-South"),
    ("  GOLDEN   SQUARE ", "Golden Square"),
])
def test_display_locality_name(raw, expected):
    assert bod.display_locality_name(raw) == expected


def test_title_case_capitalises_after_brackets():
    assert bod.title_case_place("NEWSTEAD (NEWSTEAD COMMUNITY CENTRE)") == "Newstead (Newstead Community Centre)"


def test_public_spaces_skip_neighbourhood_safer_places():
    features = [
        {"attributes": {"OBJECTID": 1, "pfi": "10", "name": "Castlemaine Library", "feature_type": "community space",
                        "feature_subtype": "library", "theme1": None, "theme2": None, "vmadd_pfi": None},
         "geometry": {"x": 144.21, "y": -37.06}},
        {"attributes": {"OBJECTID": 2, "pfi": "11", "name": "NEWSTEAD (NEWSTEAD COMMUNITY CENTRE) NSP",
                        "feature_type": "emergency facility", "feature_subtype": "neighbourhood safer place",
                        "theme1": None, "theme2": None, "vmadd_pfi": None},
         "geometry": {"x": 144.06, "y": -37.11}},
    ]
    records = bod.build_public_space_records(features, {}, StubLocalities(), StubPostal())
    assert [r["id"] for r in records] == ["vicmap-foi-10"]
    assert records[0]["verification"] == "likely"
    assert records[0]["serviceTypes"] == ["Library", "Free Wi-Fi likely but not confirmed"]


def test_region_postcodes_use_address_share_threshold():
    counts = {
        "3550": {("BENDIGO", "325"): 900},
        "3364": {("SMEATON", "330"): 700, ("ALLENDALE", "330"): 50, ("NEWLYN", "313"): 250},
        "3064": {("CRAIGIEBURN", "357"): 1000, ("X", "339"): 5},
    }
    shares = bod.region_postcode_shares(counts)
    assert shares["3550"][0] == 1.0
    assert bod.select_region_postcodes(shares, {"3550", "3364", "3064"}) == ["3364", "3550"]
    assert bod.select_region_postcodes(shares, {"3550"}) == ["3550"]


def test_locality_postcodes_apply_two_percent_threshold_and_order():
    counts = {
        "3450": {("CASTLEMAINE", "353"): 970, ("CHEWTON", "353"): 10},
        "3451": {("CASTLEMAINE", "353"): 30, ("CHEWTON", "353"): 500},
        "3453": {("CASTLEMAINE", "353"): 1},
    }
    result = bod.locality_postcodes(counts)
    assert result["CASTLEMAINE"] == ["3450", "3451"]
    assert result["CHEWTON"] == ["3451"]


def test_build_locality_records_keeps_only_region_postcode_localities():
    polygons = {"CASTLEMAINE": ("205409496", square(144.2, -37.07, 0.02)), "CRAIGIEBURN": ("1", square(144.9, -37.6, 0.02))}
    records, missing = bod.build_locality_records(
        {"CASTLEMAINE": ["3450"], "CRAIGIEBURN": ["3064"], "CHEWTON": ["3451"]}, ["3450", "3451"], polygons
    )
    assert [r["name"] for r in records] == ["Castlemaine"]
    assert records[0]["id"] == "loc-205409496"
    assert missing == ["CHEWTON"]
    assert bod.validate_locality_record(records[0]) == []


def test_postcode_records_are_statewide_shape():
    postal = bod.PostalAreas({"3550": square(144.2, -36.8, 0.1), "3000": square(144.95, -37.82, 0.02)})
    records = bod.build_postcode_records(postal)
    assert [r["id"] for r in records] == ["3000", "3550"]
    assert all(bod.validate_postcode_record(r) == [] for r in records)
    assert postal.postcode_at(144.25, -36.75) == "3550"


# ---------------------------------------------------------------- charities

@pytest.mark.parametrize("lines, expected", [
    ({"Address_Line_1": "15 Hargreaves St"}, (15, "", "HARGREAVES", "STREET")),
    ({"Address_Line_1": "Unit 2/15A Smith Street"}, (15, "A", "SMITH", "STREET")),
    ({"Address_Line_1": "15-17 High St."}, (15, "", "HIGH", "STREET")),
    ({"Address_Line_1": "Level 1", "Address_Line_2": "100 Mitchell Street"}, (100, "", "MITCHELL", "STREET")),
    ({"Address_Line_1": "40 Mount Alexander Rd"}, (40, "", "MOUNT ALEXANDER", "ROAD")),
    ({"Address_Line_1": "PO Box 123"}, None),
    ({"Address_Line_1": "Corner of High and Low"}, None),
])
def test_parse_street_address(lines, expected):
    assert bod.parse_street_address(lines) == expected


def _addr(pfi, x=144.28, y=-36.76, suffix=None, postcode="3550", locality="BENDIGO", primary="Y"):
    return {"attributes": {"pfi": pfi, "house_suffix_1": suffix, "postcode": postcode,
                           "locality_name": locality, "is_primary": primary},
            "geometry": {"x": x, "y": y}}


def test_address_match_prefers_exact_then_lowest_pfi():
    candidates = [_addr("900"), _addr("500", primary="N"), _addr("700"), _addr("100", suffix="B")]
    assert bod.choose_address_match(candidates, "", "3550", "BENDIGO")["attributes"]["pfi"] == "700"
    assert bod.choose_address_match(candidates, "B", "3550", "BENDIGO")["attributes"]["pfi"] == "100"
    assert bod.choose_address_match([], "", "3550", "BENDIGO") is None


class FakeGeocodeHttp:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def arcgis_query(self, label, layer_url, params, timeout=90):
        self.calls.append(params["where"])
        for needle, features in self.responses.items():
            if needle in params["where"]:
                return {"features": features}
        return {"features": []}


def _charity(abn, name, line1, town, postcode, **extra):
    base = {"ABN": abn, "Charity_Legal_Name": name, "Address_Line_1": line1, "Town_City": town,
            "State": "VIC", "Postcode": postcode, "Charity_Website": "example.org.au",
            "People_at_risk_of_homelessness": "Y"}
    base.update(extra)
    return base


def test_build_charity_records_privacy_precision_and_region(region):
    http = FakeGeocodeHttp({"road_name = 'HARGREAVES'": [_addr("42", x=144.28123, y=-36.75789)]})
    raw = [
        _charity("1", "Street Charity", "15 Hargreaves St", "BENDIGO", "3550"),
        _charity("2", "PO Box Charity", "PO Box 9", "Bendigo", "3550"),
        _charity("3", "Ballarat Charity", "PO Box 1", "Ballarat", "3350"),
        _charity("4", "Unrelated Club", "1 Oval Rd", "Bendigo", "3550", People_at_risk_of_homelessness="N"),
    ]
    stats = Counter()
    records = bod.build_charity_records(http, raw, "2026-01-01", region, StubPostal(), stats)
    by_id = {r["id"]: r for r in records}
    assert set(by_id) == {"acnc-1", "acnc-2"}
    street, approx = by_id["acnc-1"], by_id["acnc-2"]
    assert street["locationPrecision"] == "street" and (street["lat"], street["lng"]) == (-36.758, 144.281)
    assert approx["locationPrecision"] == "postcode" and (approx["lat"], approx["lng"]) == (-36.76, 144.28)
    assert street["address"] is None and approx["address"] is None
    assert street["suburb"] == "Bendigo" and street["postcode"] == "3550"
    assert street["website"] == "https://example.org.au"
    assert stats["outsideRegion"] == 1 and stats["notSupportRelevant"] == 1
    assert all(bod.validate_service_record(r) == [] for r in records)


def test_normalise_website():
    assert bod.normalise_website("www.example.org") == "https://www.example.org"
    assert bod.normalise_website("http://example.org/a") == "http://example.org/a"
    assert bod.normalise_website("not a url") is None
    assert bod.normalise_website("") is None


# ---------------------------------------------------------------- HTTP retries

class FlakySession:
    def __init__(self, failures, payload):
        self.failures = failures
        self.payload = payload
        self.headers = {}
        self.calls = 0

    def post(self, url, data=None, timeout=None):
        return self._respond()

    def get(self, url, params=None, timeout=None):
        return self._respond()

    def _respond(self):
        self.calls += 1
        if self.calls <= self.failures:
            raise requests.ConnectionError("boom")

        class Response:
            status_code = 200
            content = json.dumps(self.payload).encode("utf-8")

            def raise_for_status(self):
                return None

        return Response()


def test_http_retries_with_backoff_then_succeeds():
    sleeps = []
    http = bod.Http(sleep=sleeps.append)
    http.session = FlakySession(2, {"features": []})
    assert http.arcgis_query("vicmap-foi", "https://services-ap1.arcgis.com/x", {"where": "1=1"}) == {"features": []}
    assert http.requests_by_label["vicmap-foi"] == 3
    backoffs = [s for s in sleeps if s >= bod.BACKOFF_BASE_SECONDS]
    assert backoffs == [bod.BACKOFF_BASE_SECONDS, bod.BACKOFF_BASE_SECONDS * 2]


def test_http_gives_clear_error_after_max_attempts():
    http = bod.Http(sleep=lambda _s: None)
    http.session = FlakySession(99, {})
    with pytest.raises(bod.PipelineError) as error:
        http.arcgis_query("abs-poa-2021", "https://geo.abs.gov.au/x", {"where": "1=1"})
    message = str(error.value)
    assert "[abs-poa-2021]" in message and f"after {bod.MAX_ATTEMPTS} attempts" in message and "boom" in message


def test_http_retries_arcgis_error_payloads():
    http = bod.Http(sleep=lambda _s: None)
    http.session = FlakySession(0, {"error": {"code": 400, "message": "Unable to perform query"}})
    with pytest.raises(bod.PipelineError) as error:
        http.arcgis_query("vicmap-address", "https://services-ap1.arcgis.com/x", {})
    assert "ArcGIS error" in str(error.value)
    assert http.session.calls == bod.MAX_ATTEMPTS


# ---------------------------------------------------------------- no database, no secrets

def test_importing_the_pipeline_never_reads_env_files_or_imports_db(tmp_path):
    probe = f"""
import builtins, pathlib, sys
real_read_text = pathlib.Path.read_text
real_open = builtins.open
def is_env(path):
    return str(path).replace('\\\\', '/').rsplit('/', 1)[-1].startswith('.env')
def guarded_read_text(self, *a, **k):
    if is_env(self):
        raise SystemExit('read ' + str(self))
    return real_read_text(self, *a, **k)
def guarded_open(file, *a, **k):
    if is_env(file):
        raise SystemExit('open ' + str(file))
    return real_open(file, *a, **k)
pathlib.Path.read_text = guarded_read_text
builtins.open = guarded_open
sys.path.insert(0, {str(SCRIPTS_DIR)!r})
import build_offline_data
build_offline_data.assert_no_database_imports()
bad = [m for m in ('db', 'extensions', 'cache', 'sqlalchemy', 'services.acnc_service', 'services.geocoding') if m in sys.modules]
print('LOADED', bad)
"""
    env = {k: v for k, v in os.environ.items() if k not in ("DATABASE_URL", "ORS_API_KEY", "REFRESH_SECRET")}
    result = subprocess.run([sys.executable, "-c", probe], capture_output=True, text=True, env=env, cwd=tmp_path, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "LOADED []" in result.stdout
