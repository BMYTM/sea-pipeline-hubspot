"""Pull SEA pipeline data from HubSpot and write data/sea.json.

Runs in the GitHub Action with HUBSPOT_TOKEN (a HubSpot private-app token with
crm.objects.deals.read and crm.objects.owners.read). The token is read from the
environment only; it is never written to the repo or to the site.
Standard library only, so the Action needs no installs.
"""
import json, os, sys, time, pathlib, urllib.request, urllib.error
from collections import defaultdict
from datetime import datetime, timezone

API = "https://api.hubapi.com"
TOKEN = os.environ.get("HUBSPOT_TOKEN")
SALES, QUAL = "144168382", "1545971955"
REGIONS = ["Thailand & Others", "Indonesia", "Philippines", "Malaysia", "Singapore"]
OPEN = {"280510157", "280510158", "280510159", "280510160"}
WON = "280510161"
WON_SINCE = "2025-04-01"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "sea.json"


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method, headers={
        "Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(r, timeout=60) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(2 * (attempt + 1)); continue
            sys.exit(f"HubSpot {method} {path} failed: {e.code} {e.read().decode()[:400]}")
    sys.exit(f"HubSpot {method} {path} kept failing (rate limit or server error)")


def search_deals(pipeline, props):
    rows, after = [], None
    while True:
        body = {"filterGroups": [{"filters": [
                    {"propertyName": "pipeline", "operator": "EQ", "value": pipeline},
                    {"propertyName": "region", "operator": "IN", "values": REGIONS}]}],
                "properties": props, "limit": 200,
                "sorts": [{"propertyName": "hs_object_id", "direction": "ASCENDING"}]}
        if after: body["after"] = after
        res = req("POST", "/crm/v3/objects/deals/search", body)
        rows += res.get("results", [])
        after = res.get("paging", {}).get("next", {}).get("after")
        if not after: return rows
        if len(rows) >= 9800: sys.exit("More than 9,800 deals matched; the search API caps at 10,000.")
        time.sleep(0.3)


def owners():
    out, after = {}, None
    while True:
        res = req("GET", "/crm/v3/owners?limit=500" + (f"&after={after}" if after else ""))
        for o in res.get("results", []):
            name = f"{o.get('firstName') or ''} {o.get('lastName') or ''}".strip() or o.get("email") or str(o["id"])
            out[str(o["id"])] = name
        after = res.get("paging", {}).get("next", {}).get("after")
        if not after: return out


def stage_labels():
    res = req("GET", "/crm/v3/pipelines/deals")
    return {s["id"]: s["label"] for p in res.get("results", []) for s in p.get("stages", [])}


def num(v):
    try: return float(v) if v not in (None, "") else None
    except ValueError: return None


def quarter(d):
    y, m = int(d[:4]), int(d[5:7])
    return f"{y}-{((m - 1) // 3) * 3 + 1:02d}-01"


def main():
    if not TOKEN: sys.exit("Set HUBSPOT_TOKEN (repo secret) first.")
    labels, own = stage_labels(), owners()
    portal = req("GET", "/account-info/v3/details").get("portalId")
    props = ["dealname", "dealstage", "region", "amount_in_home_currency", "closedate",
             "hubspot_owner_id", "notes_last_contacted", "hs_deal_stage_probability"]
    sales = search_deals(SALES, props)
    qual = search_deals(QUAL, ["dealstage", "region"])

    pipe = defaultdict(lambda: [0, 0.0]); won = defaultdict(lambda: [0, 0.0]); open_deals = []
    for d in sales:
        p = d["properties"]; s, r, a = p.get("dealstage"), p.get("region"), num(p.get("amount_in_home_currency"))
        pipe[(r, s)][0] += 1; pipe[(r, s)][1] += a or 0
        close = (p.get("closedate") or "")[:10] or None
        if s == WON and close and close >= WON_SINCE:
            won[(r, quarter(close))][0] += 1; won[(r, quarter(close))][1] += a or 0
        if s in OPEN:
            open_deals.append({"id": str(d["id"]), "deal": (p.get("dealname") or "").strip(), "stage_id": s,
                "stage": labels.get(s, s), "region": r, "amount": a, "close_date": close,
                "owner": own.get(p.get("hubspot_owner_id") or "", p.get("hubspot_owner_id") or "Unassigned"),
                "last_contacted": (p.get("notes_last_contacted") or "")[:10] or None,
                "probability": num(p.get("hs_deal_stage_probability")),
                "url": f"https://app.hubspot.com/contacts/{portal}/record/0-3/{d['id']}"})
    qs = defaultdict(int)
    for d in qual:
        p = d["properties"]; qs[(p.get("region"), labels.get(p.get("dealstage"), p.get("dealstage")))] += 1

    out = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "HubSpot (daily refresh)", "target_usd": 3000000, "fy_start": "2026-04-01",
        "pipeline_stage": [{"region": r, "stage_id": s, "stage": labels.get(s, s), "count": n, "amount": round(a, 2)}
                           for (r, s), (n, a) in sorted(pipe.items())],
        "won_quarterly": [{"region": r, "quarter": q, "count": n, "amount": round(a, 2)} for (r, q), (n, a) in sorted(won.items())],
        "qual_stage": [{"region": r, "stage": s, "count": n} for (r, s), n in sorted(qs.items())],
        "open_deals": sorted(open_deals, key=lambda x: -(x["amount"] or 0)),
    }
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print(f"{len(sales)} sales deals, {len(open_deals)} open, {len(qual)} qualification deals -> {OUT}")


if __name__ == "__main__":
    main()
