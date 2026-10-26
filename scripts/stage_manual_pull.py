"""Manual refresh helper: turns HubSpot MCP pulls saved in raw_new/ into the raw/ files
that build_details_from_raw.py reads. Used until the daily GitHub Action has its HUBSPOT_TOKEN."""
import json, pathlib, shutil, time
ROOT = pathlib.Path(__file__).resolve().parent.parent
NEW, RAW = ROOT / "raw_new", ROOT / "raw"


def tsv(name):
    c = json.loads((NEW / name).read_text())["results"][0]["content"]
    lines = c.split("Dataset TSV:\n")[1].strip("\n").split("\n")
    return lines[0], [l for l in lines[1:] if l and not l.startswith("Showing ")]


def write_tsv(name, head, rows):
    body = "Dataset TSV:\n" + "\n".join([head] + rows) + f"\n\nShowing {len(rows)} of {len(rows)} total results.\n"
    (RAW / name).write_text(json.dumps({"results": [{"content": body}]}, ensure_ascii=False))


backup = ROOT / ("raw_backup_" + time.strftime("%Y%m%d_%H%M"))
shutil.copytree(RAW, backup)
for f in ["deals.txt", "deal_contacts.txt", "meetings.txt"]:
    h, rows = tsv(f); write_tsv(f, h, rows)
h, a = tsv("mql.txt"); _, b = tsv("sql.txt"); write_tsv("contacts.txt", h, a + b)
h, a = tsv("qual.txt"); _, b = tsv("lost_sales.txt"); write_tsv("lost_qual.txt", h, a + b)
recs = json.loads((NEW / "money.txt").read_text())["results"]
new = [{"content": json.dumps({"objectTypeId": "0-3", "properties": r["properties"]}, ensure_ascii=False)} for r in recs]
have = {r["properties"]["hs_object_id"] for r in recs}
for f in ["money.txt", "sources.txt"]:
    # keep earlier records for deals outside this pull (2022-23 SEA wins filed under a non-SEA region)
    old = [r for r in json.loads((backup / f).read_text())["results"]
           if r.get("content", "").startswith("{") and json.loads(r["content"])["properties"].get("hs_object_id") not in have]
    (RAW / f).write_text(json.dumps({"results": new + old}, ensure_ascii=False))
print("staged into raw/; previous files kept in", backup.name)
