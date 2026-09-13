#!/usr/bin/env python3
"""Check that the public company snapshot exactly matches its retained source."""
import csv
import hashlib
import io
import json
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[2]
config = runpy.run_path(str(Path(__file__).with_name("refresh-nifty500.py")))
raw = (ROOT / "docs/data/nifty500-source.csv").read_bytes()
source_rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
companies = json.loads((ROOT / "apps/web/public/data/nifty500.json").read_text())
meta = json.loads((ROOT / "apps/web/public/data/nifty500-meta.json").read_text())
expected = [
    {
        "name": row["Company Name"].strip(),
        "symbol": row["Symbol"].strip(),
        "industry": row["Industry"].strip(),
        "sector": config["SECTORS"].get(row["Industry"].strip(), "general"),
    }
    for row in source_rows
]
assert companies == expected, "Public company data differs from the retained NSE source."
assert len(companies) == meta["count"], "Metadata count does not match public data."
assert len({row["symbol"] for row in companies}) == len(companies), "Duplicate company symbols."
assert meta["raw_sha256"] == hashlib.sha256(raw).hexdigest(), "Raw snapshot hash mismatch."
assert meta["url"] == config["SOURCE"], "Unexpected source URL."
assert meta["effective_date"] is None, "Source does not provide an effective date."
assert meta["asof"] == meta["retrieved_at"][:10], "As-of date must be the recorded retrieval date."
assert set(row["sector"] for row in companies) <= {"automotive", "fmcg", "materials", "pharma", "general"}
print(f"Source integrity verified: {len(companies)} NSE records, snapshot {meta['asof']}.")
