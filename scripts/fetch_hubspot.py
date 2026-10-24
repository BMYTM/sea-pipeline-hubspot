"""Pull SEA pipeline data from HubSpot and write data/sea.json and data/details.json.

Runs in the GitHub Action with HUBSPOT_TOKEN (a HubSpot private-app token with
crm.objects.deals.read, crm.objects.contacts.read, crm.objects.companies.read and
crm.objects.owners.read). The token is read from the environment only; it is never
written to the repo or to the site. Standard library only, so the Action needs no installs.
"""
import json, os, re, sys, time, pathlib, urllib.request, urllib.error
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from money_fields import money_fields, MONEY_PROPS, fix_all
from collections import defaultdict
from datetime import datetime, timezone

API = "https://api.hubapi.com"
TOKEN = os.environ.get("HUBSPOT_TOKEN")
SALES, QUAL = "144168382", "1545971955"
REGIONS = ["Thailand & Others", "Indonesia", "Philippines", "Malaysia", "Singapore"]
COUNTRY = {"Thailand & Others": "Thailand", "Indonesia": "Indonesia", "Philippines": "Philippines", "Malaysia": "Malaysia", "Singapore": "Singapore"}
OPEN = {"280510157", "280510158", "280510159", "280510160"}
WON = "280510161"
WON_SINCE = "2025-04-01"
DATA = pathlib.Path(__file__).resolve().parent.parent / "data"
LIFECYCLE = {"lead": "Lead", "opportunity": "Opportunity", "subscriber": "Subscriber", "marketingqualifiedlead": "Marketing Qualified Lead",
             "salesqualifiedlead": "Sales Qualified Lead", "customer": "Customer", "other": "Other", "2135332051": "Cold",
             "2135192806": "Interested", "2220863733": "Disqualified", "2135332052": "Proposal", "2135192805": "Contracting",
             "2135332053": "On Hold", "2143749331": "Lost/Not Intrested"}


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


def search(obj, filter_groups, props):
    rows, after = [], None
    while True:
        body = {"filterGroups": filter_groups, "properties": props, "limit": 200,
                "sorts": [{"propertyName": "hs_object_id", "direction": "ASCENDING"}]}
        if after: body["after"] = after
        res = req("POST", f"/crm/v3/objects/{obj}/search", body)
        rows += res.get("results", [])
        after = res.get("paging", {}).get("next", {}).get("after")
        if not after: return rows
        if len(rows) >= 9800: sys.exit(f"More than 9,800 {obj} matched; the search API caps at 10,000.")
        time.sleep(0.3)


def search_deals(pipeline, props):
    return search("deals", [{"filters": [
        {"propertyName": "pipeline", "operator": "EQ", "value": pipeline},
        {"propertyName": "region", "operator": "IN", "values": REGIONS}]}], props)


def batch_read(obj, ids, props):
    out = {}
    ids = list(dict.fromkeys(ids))
    for i in range(0, len(ids), 100):
        res = req("POST", f"/crm/v3/objects/{obj}/batch/read", {"properties": props, "inputs": [{"id": x} for x in ids[i:i + 100]]})
        for r in res.get("results", []): out[str(r["id"])] = r["properties"]
    return out


def associations(frm, to, ids):
    out = defaultdict(list)
    for i in range(0, len(ids), 1000):
        res = req("POST", f"/crm/v4/associations/{frm}/{to}/batch/read", {"inputs": [{"id": x} for x in ids[i:i + 1000]]})
        for r in res.get("results", []):
            out[str(r["from"]["id"])] = [str(t["toObjectId"]) for t in r.get("to", [])]
    return out


def owners():
    out, after = {}, None
    while True:
        res = req("GET", "/crm/v3/owners?limit=500&archived=false" + (f"&after={after}" if after else ""))
        for o in res.get("results", []):
            out[str(o["id"])] = f"{o.get('firstName') or ''} {o.get('lastName') or ''}".strip() or o.get("email") or str(o["id"])
        after = res.get("paging", {}).get("next", {}).get("after")
        if not after: break
    after = None
    while True:  # deactivated owners still own old deals
        res = req("GET", "/crm/v3/owners?limit=500&archived=true" + (f"&after={after}" if after else ""))
        for o in res.get("results", []):
            out.setdefault(str(o["id"]), f"{o.get('firstName') or ''} {o.get('lastName') or ''}".strip() or str(o["id"]))
        after = res.get("paging", {}).get("next", {}).get("after")
        if not after: return out


def stage_labels():
    res = req("GET", "/crm/v3/pipelines/deals")
    return {s["id"]: s["label"] for p in res.get("results", []) for s in p.get("stages", [])}


def num(v):
    try: return float(v) if v not in (None, "") else None
    except ValueError: return None


def day(v):
    return (v or "")[:10] or None


def quarter(d):
    y, m = int(d[:4]), int(d[5:7])
    return f"{y}-{((m - 1) // 3) * 3 + 1:02d}-01"


def parse_status(t):
    """The team's 'Deal Status' field: Remarks ... 5. Conversion Probability: X Reason: Y 6. Call to Action: Z Reason: W"""
    if not t: return {}
    t = re.sub(r"\s+", " ", t).strip()
    g = lambda p: (re.search(p, t) or [None, None])[1]
    out = {
        "remarks": (g(r"Remarks:\s*(.*?)\s*1\. Head Count") or "").strip(),
        "headcount": (g(r"Head Count:\s*([\d,]*)") or "").strip(", ") or None,
        "industry": (g(r"Industry:\s*(.*?),\s*3\.") or "").strip() or None,
        "conv_prob": (g(r"Conversion Probability:\s*(?!Reason)(\w*)") or "").strip() or None,
        "conv_reason": (g(r"Conversion Probability:\s*(?:(?!Reason)\w+)?\s*Reason:\s*(.*?)\s*6\. Call to Action") or "").strip(" -") or None,
        "cta": (g(r"Call to Action:\s*(?!Reason)(\w*)") or "").strip() or None,
        "cta_reason": (g(r"Call to Action:\s*(?:(?!Reason)\w+)?\s*Reason:\s*(.*)$") or "").strip() or None,
    }
    if not out["remarks"] and "1. Head Count" not in t: out["remarks"] = t
    return out


def main():
    if not TOKEN: sys.exit("Set HUBSPOT_TOKEN (repo secret) first.")
    labels, own = stage_labels(), owners()
    portal = req("GET", "/account-info/v3/details").get("portalId")
    link = lambda kind, i: f"https://app.hubspot.com/contacts/{portal}/record/{kind}/{i}"
    who = lambda i: own.get(i or "", i) if i else None
    props = ["dealname", "dealstage", "pipeline", "region", "amount_in_home_currency", "closedate", "createdate", "hubspot_owner_id",
             "notes_last_contacted", "notes_last_updated", "hs_deal_stage_probability", "hs_next_step", "new_deal_source", "test",
             "number_of_employees"] + [x for x in MONEY_PROPS if x != "number_of_employees"]
    sales = search_deals(SALES, props)
    qual = search_deals(QUAL, ["dealstage", "region"])
    # SEA closures filed under a non-SEA HubSpot region (see data/sea_overrides.json)
    over = json.loads((DATA / "sea_overrides.json").read_text()).get("deals", {})
    seen = {str(d["id"]) for d in sales}
    to_region = {v: k for k, v in COUNTRY.items()}
    region_note = {}
    for i, p in batch_read("deals", [i for i in over if i not in seen], props).items():
        if p.get("dealstage") != WON or p.get("pipeline", SALES) != SALES and p.get("pipeline"): continue
        region_note[i] = "Region in HubSpot: " + (p.get("region") or "not set")
        p["region"] = to_region.get(over[i]["country"], over[i]["country"])
        sales.append({"id": i, "properties": p})
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # ---- overview (sea.json)
    pipe = defaultdict(lambda: [0, 0.0]); won = defaultdict(lambda: [0, 0.0]); open_deals = []
    for d in sales:
        p = d["properties"]; s, r, a = p.get("dealstage"), p.get("region"), num(p.get("amount_in_home_currency"))
        pipe[(r, s)][0] += 1; pipe[(r, s)][1] += a or 0
        close = day(p.get("closedate"))
        if s == WON and close and close >= WON_SINCE:
            won[(r, quarter(close))][0] += 1; won[(r, quarter(close))][1] += a or 0
        if s in OPEN:
            open_deals.append({"id": str(d["id"]), "deal": (p.get("dealname") or "").strip(), "stage_id": s,
                "stage": labels.get(s, s), "region": r, "amount": a, "close_date": close,
                "owner": who(p.get("hubspot_owner_id")) or "Unassigned",
                "last_contacted": day(p.get("notes_last_updated")),
                "probability": num(p.get("hs_deal_stage_probability")), "url": link("0-3", d["id"])})
    qs = defaultdict(int)
    for d in qual:
        p = d["properties"]; qs[(p.get("region"), labels.get(p.get("dealstage"), p.get("dealstage")))] += 1
    sea = {"generated_at": now, "source": "HubSpot (daily refresh)", "target_usd": 3000000, "fy_start": "2026-04-01",
           "pipeline_stage": [{"region": r, "stage_id": s, "stage": labels.get(s, s), "count": n, "amount": round(a, 2)} for (r, s), (n, a) in sorted(pipe.items())],
           "won_quarterly": [{"region": r, "quarter": q, "count": n, "amount": round(a, 2)} for (r, q), (n, a) in sorted(won.items())],
           "qual_stage": [{"region": r, "stage": s, "count": n} for (r, s), n in sorted(qs.items())],
           "open_deals": sorted(open_deals, key=lambda x: -(x["amount"] or 0))}

    # ---- country-wise detail (details.json)
    keep = [d for d in sales if d["properties"].get("dealstage") in OPEN | {WON}]
    ids = [str(d["id"]) for d in keep]
    d2c, d2co = associations("deals", "contacts", ids), associations("deals", "companies", ids)
    cons = batch_read("contacts", [c for v in d2c.values() for c in v], ["firstname", "lastname", "jobtitle"])
    cos = batch_read("companies", [c for v in d2co.values() for c in v], ["name", "hubspot_owner_id"])
    closures, active = [], []
    for d in keep:
        p, i = d["properties"], str(d["id"]); s = p.get("dealstage"); st = parse_status(p.get("test"))
        co = cos.get((d2co.get(i) or [None])[0] or "", {})
        people = []
        for c in d2c.get(i, []):
            x = cons.get(c, {}); n = " ".join(v for v in [x.get("firstname"), x.get("lastname")] if v)
            if n: people.append({"name": n, "title": x.get("jobtitle") or None})
        base = {"id": i, "deal": (p.get("dealname") or "").strip(), "country": COUNTRY.get(p.get("region"), p.get("region")),
                "amount": num(p.get("amount_in_home_currency")), "close_date": day(p.get("closedate")), "created": day(p.get("createdate")),
                "deal_owner": who(p.get("hubspot_owner_id")), "company": co.get("name"), "account_owner": who(co.get("hubspot_owner_id")),
                "source": p.get("new_deal_source"), "contacts": people, "remarks": st.get("remarks") or None,
                "headcount": st.get("headcount"), "industry": st.get("industry"), "url": link("0-3", i)}
        base.update(money_fields(p, base["amount"], st.get("headcount")))
        if s == WON:
            cd = base["close_date"] or ""
            closures.append(dict(base, year=cd[:4] or None, month=cd[:7] or None, **({"region_note": region_note[i]} if i in region_note else {})))
        else:
            active.append(dict(base, stage_id=s, stage=labels.get(s, s), probability=num(p.get("hs_deal_stage_probability")),
                               next_step=p.get("hs_next_step") or None, last_activity=day(p.get("notes_last_updated")),
                               conv_prob=st.get("conv_prob"), conv_reason=st.get("conv_reason"), cta=st.get("cta"), cta_reason=st.get("cta_reason")))

    countries = list(COUNTRY.values())
    lprops = ["firstname", "lastname", "jobtitle", "company", "country__hono_", "lifecyclestage", "hs_lead_status",
              "hs_v2_date_entered_marketingqualifiedlead", "hs_v2_date_entered_salesqualifiedlead", "hs_v2_date_entered_opportunity",
              "hs_v2_date_entered_customer", "hubspot_owner_id", "hs_analytics_source", "createdate", "notes_last_updated", "num_associated_deals"]
    raw = search("contacts", [
        {"filters": [{"propertyName": "hs_v2_date_entered_marketingqualifiedlead", "operator": "HAS_PROPERTY"},
                     {"propertyName": "country__hono_", "operator": "IN", "values": countries}]},
        {"filters": [{"propertyName": "hs_v2_date_entered_salesqualifiedlead", "operator": "HAS_PROPERTY"},
                     {"propertyName": "country__hono_", "operator": "IN", "values": countries}]}], lprops)
    leads = {}
    for r in raw:
        p, i = r["properties"], str(r["id"])
        leads[i] = {"id": i, "name": " ".join(v for v in [p.get("firstname"), p.get("lastname")] if v) or None,
                    "title": p.get("jobtitle") or None, "company": p.get("company") or None, "country": p.get("country__hono_"),
                    "stage": LIFECYCLE.get(p.get("lifecyclestage"), p.get("lifecyclestage")),
                    "lead_status": (p.get("hs_lead_status") or "").replace("_", " ").title() or None,
                    "mql_date": day(p.get("hs_v2_date_entered_marketingqualifiedlead")), "sql_date": day(p.get("hs_v2_date_entered_salesqualifiedlead")),
                    "opp_date": day(p.get("hs_v2_date_entered_opportunity")), "customer_date": day(p.get("hs_v2_date_entered_customer")),
                    "owner": who(p.get("hubspot_owner_id")), "source": (p.get("hs_analytics_source") or "").replace("_", " ").title() or None,
                    "created": day(p.get("createdate")), "last_activity": day(p.get("notes_last_updated")),
                    "deals": int(num(p.get("num_associated_deals")) or 0), "url": link("0-1", i)}
    details = {"generated_at": now, "source": "HubSpot (daily refresh)",
               "closures": sorted(closures, key=lambda x: x["close_date"] or "", reverse=True),
               "active": sorted(active, key=lambda x: -(x["amount"] or 0)),
               "leads": sorted(leads.values(), key=lambda x: max(x["mql_date"] or "", x["sql_date"] or ""), reverse=True)}

    # exchange rates for the local-currency view (keep the last good file if the call fails)
    try:
        with urllib.request.urlopen("https://open.er-api.com/v6/latest/USD", timeout=30) as resp:
            fx_api = json.loads(resp.read())
        fx = json.loads((DATA / "fx.json").read_text())
        if fx_api.get("result") == "success":
            fx["rates"] = {k: fx_api["rates"][k] for k in fx["rates"] if k in fx_api["rates"]}
            fx["as_of"] = datetime.fromtimestamp(fx_api["time_last_update_unix"], tz=timezone.utc).strftime("%Y-%m-%d")
            (DATA / "fx.json").write_text(json.dumps(fx, indent=1))
    except Exception as e:
        print("Exchange rates not refreshed:", e)

    (DATA / "sea.json").write_text(json.dumps(sea, indent=1, ensure_ascii=False))
    (DATA / "details.json").write_text(json.dumps(fix_all(details), indent=1, ensure_ascii=False))
    print(f"{len(sales)} sales deals, {len(open_deals)} open, {len(closures)} won, {len(leads)} MQL/SQL contacts")


if __name__ == "__main__":
    main()
