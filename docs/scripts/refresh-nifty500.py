#!/usr/bin/env python3
"""Refresh the public company-name snapshot; does not add company emissions data."""
from __future__ import annotations

import csv
from datetime import datetime, timedelta, timezone
import hashlib
import io
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
SOURCE = "https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv"
SECTORS = {
    "Automobile and Auto Components": "automotive",
    "Fast Moving Consumer Goods": "fmcg",
    "Healthcare": "pharma",
    "Chemicals": "materials",
    "Metals & Mining": "materials",
    "Construction Materials": "materials",
    "Oil Gas & Consumable Fuels": "materials",
}


def main() -> None:
    raw = subprocess.check_output([
        "curl", "--fail", "--silent", "--show-error", "--location",
        "--max-time", "45", "--user-agent", "Mozilla/5.0", SOURCE,
    ])
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    if not 450 <= len(rows) <= 600:
        raise ValueError(f"Unexpected source row count: {len(rows)}; review the source before publishing.")
    companies = [
        {
            "name": row["Company Name"].strip(),
            "symbol": row["Symbol"].strip(),
            "industry": row["Industry"].strip(),
            "sector": SECTORS.get(row["Industry"].strip(), "general"),
        }
        for row in rows
    ]
    if any(not company[field] for company in companies for field in ("name", "symbol", "industry")):
        raise ValueError("Source has an empty company name, symbol or industry.")
    if len({company["symbol"] for company in companies}) != len(companies):
        raise ValueError("Source has duplicate symbols; review before publishing.")

    now = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    metadata = {
        "source": "NSE Indices Limited: NIFTY 500 constituent list",
        "url": SOURCE,
        "asof": now.date().isoformat(),
        "retrieved_at": now.isoformat(timespec="seconds"),
        "count": len(companies),
        "effective_date": None,
        "asof_note": "Download date. The source CSV does not state an effective date.",
        "raw_sha256": hashlib.sha256(raw).hexdigest(),
        "raw_path": "docs/data/nifty500-source.csv",
        "classification_note": "Name, symbol and industry are source fields. Sector is a broad demo preset mapping, not an NSE classification or a company's reported freight activity.",
        "scenario_note": "Company selection personalizes a synthetic demonstration. No company shipment data, customer relationship or emissions disclosure is represented.",
        "sector_mapping": SECTORS,
        "sector_default": "general",
    }
    public_data = ROOT / "apps/web/public/data"
    source_dir = ROOT / "docs/data"
    public_data.mkdir(parents=True, exist_ok=True)
    source_dir.mkdir(parents=True, exist_ok=True)
    (source_dir / "nifty500-source.csv").write_bytes(raw)
    (public_data / "nifty500.json").write_text(json.dumps(companies, ensure_ascii=False, separators=(",", ":")) + "\n")
    (public_data / "nifty500-meta.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    print(f"Published {len(companies)} constituent records as of {metadata['asof']}.")


if __name__ == "__main__":
    main()
