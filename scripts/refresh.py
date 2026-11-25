#!/usr/bin/env python3
"""Fetch and validate the complete official FCSI export before replacing the cache."""
import argparse
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import re
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def text(element, path):
    return (element.findtext(path) or "").strip()


def coordinates(lat, lon):
    try:
        pair = [float(lat), float(lon)]
        if all(math.isfinite(n) for n in pair) and -90 <= pair[0] <= 90 and -180 <= pair[1] <= 180 and pair != [0, 0]:
            return pair
    except (TypeError, ValueError):
        pass
    return None


def records(stream):
    organizations = {}
    for _, element in ET.iterparse(stream, events=("end",)):
        if element.tag == "ReportingOrganization":
            organizations[text(element, "Code")] = text(element, "EN")
            element.clear()
        elif element.tag == "Site":
            identity = element.get("FederalSiteIdentifier", "")
            if not re.fullmatch(r"[A-Za-z0-9]{1,24}", identity):
                raise ValueError("Unexpected or missing federal site identifier")
            years = sorted(element.findall("AnnualData"), key=lambda row: row.get("FiscalYear", ""), reverse=True)
            latest_year = years[0].get("FiscalYear", "") if years else ""
            latest = [row for row in years if row.get("FiscalYear", "") == latest_year]
            # Preserve conflicts rather than silently choosing a custodian's report.
            steps = sorted({text(row, "HighestStepCompleted") for row in latest if text(row, "HighestStepCompleted")})
            pairs = sorted({(text(item, "Contamination/EN"), text(item, "Medium/EN")) for item in element.findall("ContaminationDetails/ContaminatedMedia")})
            code = element.get("ReportingOrganization", "")
            yield {
                "id": identity, "name": text(element, "Name/EN") or text(element, "Name/FR") or "Unnamed site",
                "municipality": text(element, "Location/Municipality"), "province": text(element, "Location/Province"),
                "country": text(element, "Location/Country/EN"), "custodian": organizations.get(code, code),
                "status": text(element, "SiteStatus/Status/EN"), "description": text(element, "SiteStatus/Description/EN"),
                "classification": text(element, "Classification/Name/EN"), "classification_code": text(element, "Classification/Code"),
                "geo": coordinates(text(element, "Location/Latitude"), text(element, "Location/Longitude")),
                "contaminants": sorted({a for a, _ in pairs if a}), "media": sorted({b for _, b in pairs if b}), "contamination_media": pairs,
                "strategies": sorted({(item.text or "").strip() for item in element.findall("ManagementStrategy/ManagementType/EN") if (item.text or "").strip()}),
                "fiscal_year": latest_year, "steps": steps, "updated": element.get("LastModified", "")[:10],
                "action_plan": text(element, "ActionPlan/EN"), "information": text(element, "AdditionalInformation/EN"),
                "property": text(element, "PropertyNumber")
            }
            element.clear()


def validate(rows, config, previous_count=0):
    if len(rows) < config["minimum_records"]:
        raise ValueError(f"Only {len(rows)} records; refusing incomplete export")
    if len({row["id"] for row in rows}) != len(rows):
        raise ValueError("Duplicate federal site identifiers")
    if len({row["province"] for row in rows if row["province"]}) < config["minimum_provinces"]:
        raise ValueError("Unexpected provincial coverage")
    if previous_count and len(rows) < previous_count * config["minimum_previous_fraction"]:
        raise ValueError("Large record-count decline requires review before publication")
    if not any(row["geo"] for row in rows):
        raise ValueError("No usable site coordinates")
    if any(row["status"] not in {"Active", "Closed", "Suspected"} for row in rows):
        raise ValueError("Unexpected site status; review source schema")


def refresh(root=ROOT):
    config = json.loads((root / "config/source.json").read_text())
    request = urllib.request.Request(config["download_url"], headers={"User-Agent": "CoolCode-ContaminatedPlaces/1.0 (+https://coolcode.ca/contaminatedplaces/)"})
    with urllib.request.urlopen(request, timeout=config["timeout_seconds"]) as response:
        raw = response.read(config["maximum_download_bytes"] + 1)
        modified = response.headers.get("Last-Modified", "")
        final_url = response.url
        if response.status != 200 or len(raw) > config["maximum_download_bytes"]:
            raise ValueError("Unexpected download status or size")
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = [entry for entry in archive.infolist() if entry.filename.lower().endswith(".xml")]
        if len(entries) != 1 or entries[0].file_size > config["maximum_xml_bytes"]:
            raise ValueError("Expected one size-bounded XML export in ZIP")
        with archive.open(entries[0]) as stream:
            rows = sorted(records(stream), key=lambda row: row["id"])
    previous_file = root / "data/status.json"
    previous_count = json.loads(previous_file.read_text()).get("count", 0) if previous_file.exists() else 0
    validate(rows, config, previous_count)
    checked = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    status = {"schema_version": 1, "checked_at": checked, "retrieved": checked[:10],
              "source_modified": parsedate_to_datetime(modified).isoformat() if modified else None,
              "source_sha256": hashlib.sha256(raw).hexdigest(), "count": len(rows),
              "mapped": sum(row["geo"] is not None for row in rows),
              "latest_fiscal_year": max((row["fiscal_year"] for row in rows), default=""),
              "sources": [{"name": "Federal Contaminated Sites Inventory", "url": config["catalogue_url"], "download": final_url}]}
    payload = {"schema_version": 1, "sites": rows}
    target = root / "data"
    target.mkdir(exist_ok=True)
    # Stage both files only after the complete source validates. CI tests before commit/deploy.
    with tempfile.TemporaryDirectory(dir=target, prefix="refresh-") as temporary:
        stage = Path(temporary)
        (stage / "sites.json.gz").write_bytes(gzip.compress(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode(), mtime=0))
        (stage / "status.json").write_text(json.dumps(status, indent=2) + "\n")
        (stage / "sites.json.gz").replace(target / "sites.json.gz")
        (stage / "status.json").replace(target / "status.json")
    print(f"Validated {status['count']:,} sites, {status['mapped']:,} mapped; checked {checked}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    refresh()
