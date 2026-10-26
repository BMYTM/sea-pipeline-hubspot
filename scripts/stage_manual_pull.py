"""Refresh without an API token: turns HubSpot pulls saved in raw_new/ (made through the HubSpot
connector, see REFRESH.md) into the raw/ files that build_details_from_raw.py reads."""
import json, pathlib, shutil
ROOT = pathlib.Path(__file__).resolve().parent.parent
NEW, RAW, STATIC = ROOT / "raw_new", ROOT / "raw", ROOT / "scripts" / "static"
RAW.mkdir(exist_ok=True)


def tsv(name):
    c = json.loads((NEW / name).read_text())["results"][0]["content"]
    lines = c.split("Dataset TSV:\n")[1].strip("\n").split("\n")
    return lines[0], [l for l in lines[1:] if l and not l.startswith("Showing ")]


def write_tsv(name, head, rows):
    body = "Dataset TSV:\n" + "\n".join([head] + rows) + f"\n\nShowing {len(rows)} of {len(rows)} total results.\n"
    (RAW / name).write_text(json.dumps({"results": [{"content": body}]}, ensure_ascii=False))


# fixed inputs: 2022-23 SEA wins filed under a non-SEA region, and pre-2024 MQL/SQL contacts
for f in ["legacy_closures.json", "contacts_pre2024.json"]:
    shutil.copy(STATIC / f, RAW / f)
for f in ["deals.txt", "deal_contacts.txt", "meetings.txt"]:
    h, rows = tsv(f); write_tsv(f, h, rows)
h, a = tsv("mql.txt"); _, b = tsv("sql.txt"); write_tsv("contacts.txt", h, a + b)
h, a = tsv("qual.txt"); _, b = tsv("lost_sales.txt"); write_tsv("lost_qual.txt", h, a + b)
recs = json.loads((NEW / "money.txt").read_text())["results"]
new = [{"content": json.dumps({"objectTypeId": "0-3", "properties": r["properties"]}, ensure_ascii=False)} for r in recs]
have = {r["properties"]["hs_object_id"] for r in recs}
for f in ["money", "sources"]:
    old = [r for r in json.loads((STATIC / f"legacy_{f}.json").read_text())["results"]
           if json.loads(r["content"])["properties"]["hs_object_id"] not in have]
    (RAW / f"{f}.txt").write_text(json.dumps({"results": new + old}, ensure_ascii=False))
# the live record (search API) is current to the minute; the SQL reporting copy can lag by hours
(RAW / "live.json").write_text(json.dumps({r["properties"]["hs_object_id"]: r["properties"] for r in recs}, ensure_ascii=False))
print("staged", len(recs), "deals into raw/")
