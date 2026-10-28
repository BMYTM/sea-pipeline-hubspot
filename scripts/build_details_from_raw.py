"""One-off: builds data/details.json (and refreshes data/sea.json deal rows) from the
HubSpot exports pulled on 24 Oct 2026 into raw/. The daily GitHub Action
(scripts/fetch_hubspot.py) produces the same files straight from the HubSpot API."""
import json, time, re, pathlib
from datetime import datetime, timedelta
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW, DATA = ROOT / "raw", ROOT / "data"
PORTAL = 25298601
PORTAL_UTC_OFFSET = 7  # HubSpot account time zone (Bangkok)
REG = {"Thailand & Others": "Thailand", "Indonesia": "Indonesia", "Philippines": "Philippines", "Malaysia": "Malaysia", "Singapore": "Singapore"}
OPEN = {"280510157", "280510158", "280510159", "280510160"}
WON = "280510161"
OWNERS = {
 "1401897672": "Boonchoo Malhotra", "29741979": "Jun de Dios", "34133357": "Suntisuk Kulpiya", "1894277595": "Soranan Natejan",
 "33612211": "Allyssa Ruazol", "1856128718": "Prielle Seandrè Tactacan", "955171236": "Natthaya Areekul", "1107393774": "Reina Manlangit",
 "848583669": "Anuj Malik", "1714721271": "Arvind Balakrishnan", "533079233": "Nova Sinulingga", "682725058": "Bimo Haryotejo",
 "553393638": "Marta Gultom", "194032851": "Georgie Antony Chunkath", "33933207": "Sonu Kumar", "34182343": "Akash Kumar",
 "34182323": "Sonal Yadav", "31558294": "Prerna Taneja", "985326785": "Sakshi Kashyap", "75694492": "Shruti Malhotra",
 "32832438": "Sammy William Wamalwa", "487550599": "Amiel Sabangan", "333210046": "Sambhav Jain", "192531917": "HONO HR",
 "193254103": "Ajay Kadian", "29473190": "HONO", "38941506": "Vinay Dua", "193253359": "Mukul Jain", "1038973941": "Sheetal Gulati",
}


def table(name):
    c = json.loads((RAW / name).read_text())["results"][0]["content"]
    lines = c[c.find("Dataset TSV:") + 12:].strip("\n").split("\n")
    head = [re.search(r"\[([^\]]+)\]\s*$", h).group(1) if "[" in h else h for h in lines[0].split("\t")]
    # two columns are both named hubspot_owner_id: the first is the record's, the second the company's
    seen = set(); cols = []
    for h in head:
        cols.append(("company_" + h) if h in seen else h); seen.add(h)
    rows = []
    for l in lines[1:]:
        if not l or l.startswith("Showing "): continue
        cells = l.split("\t")
        rows.append({k: (None if v in ("Unassigned", "") else v) for k, v in zip(cols, cells)})
    return rows


def stage_id(v):
    m = re.search(r"\(([^()]+)\)$", v or ""); return m.group(1) if m else v


def stage_label(v):
    return re.sub(r"\s*\([^()]+\)$", "", v or "")


def num(v):
    try: return float(v) if v is not None else None
    except ValueError: return None


def owner(i):
    return OWNERS.get(i, i) if i else None


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


def url(kind, i):
    return f"https://app.hubspot.com/contacts/{PORTAL}/record/{kind}/{i}"


def main():
    deals = table("deals.txt")
    contacts_by_deal = defaultdict(list)
    for r in table("deal_contacts.txt"):
        name = " ".join(x for x in [r.get("firstname"), r.get("lastname")] if x)
        if not name: continue
        c = {"name": name, "title": r.get("jobtitle")}
        if c not in contacts_by_deal[r["hs_object_id"]]: contacts_by_deal[r["hs_object_id"]].append(c)

    # the SQL export can lag HubSpot by hours: take stage, owner, dates and amounts from the live record
    live = json.loads((RAW / "live.json").read_text()) if (RAW / "live.json").exists() else {}
    LBL = {"280510157": "Demo/Developing", "280510158": "Proposal Sent", "280510159": "Commercial/Contracting", "280510160": "On-Hold", WON: "Closed won"}
    if live:
        fresh = []
        for d in deals:
            L = live.get(d["hs_object_id"])
            if not L: continue  # moved out of SEA open/won since the export (e.g. lost today)
            d = dict(d, dealstage=f"{LBL.get(L['dealstage'], L['dealstage'])} ({L['dealstage']})")
            for k in ["hubspot_owner_id", "hs_deal_stage_probability", "hs_next_step", "amount_in_home_currency"]:
                if k in L: d[k] = L[k]
            for k in ["closedate", "notes_last_updated"]:  # live values are UTC timestamps; the export uses the portal's day
                if L.get(k): d[k] = (datetime.fromisoformat(L[k].replace("Z", "+00:00")) + timedelta(hours=PORTAL_UTC_OFFSET)).strftime("%Y-%m-%d")
            if L.get("amount_in_home_currency") not in (None, ""): d["amount_in_home_currency"] = str(round(float(L["amount_in_home_currency"]), 8))
            fresh.append(d)
        deals = fresh
    closures, active = [], []
    for d in deals:
        if d.get("region") not in REG: continue
        sid = stage_id(d["dealstage"]); st = parse_status(d.get("test"))
        base = {"id": d["hs_object_id"], "deal": (d.get("dealname") or "").strip(), "country": REG[d["region"]],
                "amount": num(d.get("amount_in_home_currency")), "close_date": d.get("closedate"), "created": d.get("createdate"),
                "deal_owner": owner(d.get("hubspot_owner_id")), "company": d.get("name"), "account_owner": owner(d.get("company_hubspot_owner_id")),
                "source": d.get("new_deal_source"), "contacts": contacts_by_deal.get(d["hs_object_id"], []),
                "remarks": st.get("remarks") or None, "headcount": st.get("headcount"), "industry": st.get("industry"),
                "url": url("0-3", d["hs_object_id"])}
        if sid == WON:
            cd = d.get("closedate") or ""
            closures.append(dict(base, year=cd[:4] or None, month=cd[:7] or None))
        elif sid in OPEN:
            active.append(dict(base, stage_id=sid, stage=stage_label(d["dealstage"]), probability=num(d.get("hs_deal_stage_probability")),
                               next_step=d.get("hs_next_step"), last_activity=d.get("notes_last_updated"),
                               conv_prob=st.get("conv_prob"), conv_reason=st.get("conv_reason"), cta=st.get("cta"), cta_reason=st.get("cta_reason")))

    # SEA closures filed under a non-SEA HubSpot region (see data/sea_overrides.json)
    over = json.loads((DATA / "sea_overrides.json").read_text())["deals"]
    have = {c["id"] for c in closures}
    for r in json.loads((RAW / "legacy_closures.json").read_text()):
        if r["id"] in have or r["id"] not in over: continue
        cd = r["close_date"]
        closures.append(dict(r, country=over[r["id"]]["country"], year=cd[:4], month=cd[:7], remarks=None, headcount=None,
                             url=url("0-3", r["id"]), region_note="Region in HubSpot: " + over[r["id"]]["hubspot_region"]))

    leads = {}
    for r in table("contacts.txt") + json.loads((RAW / "contacts_pre2024.json").read_text()):
        mql, sql = r.get("hs_v2_date_entered_marketingqualifiedlead"), r.get("hs_v2_date_entered_salesqualifiedlead")
        if not (mql or sql) or r.get("country__hono_") not in REG.values(): continue
        i = r["hs_object_id"]
        if i in leads:
            if not leads[i]["company"] and (r.get("company") or r.get("name")): leads[i]["company"] = r.get("company") or r.get("name")
            continue
        leads[i] = {"id": i, "name": " ".join(x for x in [r.get("firstname"), r.get("lastname")] if x) or None,
                    "title": r.get("jobtitle"), "company": r.get("company") or r.get("name"), "country": r["country__hono_"],
                    "stage": stage_label(r.get("lifecyclestage")), "lead_status": stage_label(r.get("hs_lead_status")),
                    "mql_date": mql, "sql_date": sql, "opp_date": r.get("hs_v2_date_entered_opportunity"),
                    "customer_date": r.get("hs_v2_date_entered_customer"), "owner": owner(r.get("hubspot_owner_id")),
                    "source": stage_label(r.get("hs_analytics_source")), "created": r.get("createdate"),
                    "last_activity": r.get("notes_last_updated"), "deals": int(num(r.get("num_associated_deals")) or 0),
                    "url": url("0-1", i)}

    # money, headcount and proposal-sent fields (pulled 24 Oct into raw/money.txt)
    import sys; sys.path.insert(0, str(ROOT / "scripts")); from money_fields import money_fields
    mj = json.loads((RAW / "money.txt").read_text())
    money = {}
    for r in mj["results"]:
        pr = json.loads(r["content"])["properties"]
        money[pr["hs_object_id"]] = {k: (v.replace("&amp;", "&") if isinstance(v, str) else v) for k, v in pr.items() if not k.endswith(("_formatted", "_iso"))}
        for k, v in pr.items():
            if k.endswith("_iso"): money[pr["hs_object_id"]][k[:-4]] = v
    for row in closures + active:
        row.update(money_fields(money.get(row["id"], {}), row["amount"], row.get("headcount")))
        # contract and finance fields for the weekly review (blank until the team fills them in HubSpot)
        m = money.get(row["id"], {})
        row.update({"tcv": num(m.get("hs_tcv")), "acv": num(m.get("hs_acv")), "invoice_date": (m.get("invoice_raised_date") or None),
                    "payment_status": m.get("payment_status") or None, "paid_date": (m.get("amount_received_date") or None)})
    from money_fields import source_fields
    srcj = json.loads((RAW / "sources.txt").read_text())
    srcs = {}
    for r in srcj["results"]:
        if not r.get("content", "").startswith("{"): continue
        pr = json.loads(r["content"])["properties"]
        srcs[pr["hs_object_id"]] = pr
    for row in closures + active:
        sp = srcs.get(row["id"]) or {"new_deal_source": row.get("source")}
        row.update(source_fields(sp))

    # last meeting logged on the deal (raw/meetings.txt: MEETING rows with their deal id)
    from money_fields import last_meeting
    mt = json.loads((RAW / "meetings.txt").read_text())["results"][0]["content"].split("Dataset TSV:\n")[1].strip().split("\n")
    hdr = mt[0].split("\t"); di = [k for k, h in enumerate(hdr) if h.startswith("Deal [")][0]
    ti = [k for k, h in enumerate(hdr) if "hs_meeting_title" in h][0]; si = [k for k, h in enumerate(hdr) if "hs_meeting_start_time" in h][0]
    oi = next((k for k, h in enumerate(hdr) if "[hubspot_owner_id]" in h), None)  # meeting owner (Activity assigned to)
    meet, mowner = defaultdict(dict), {}
    for line in mt[1:]:
        c = line.split("\t")
        if len(c) == len(hdr):
            mid_ = c[[k for k, h in enumerate(hdr) if h.startswith("Record ID")][0]]
            meet[c[di]][mid_] = (c[si][:10], c[ti])
            if oi is not None: mowner[mid_] = owner(c[oi]) if c[oi] not in ("", "Unassigned") else None
    mday = time.strftime("%Y-%m-%d", time.localtime((RAW / "meetings.txt").stat().st_mtime))
    for row in active:
        row.update(last_meeting(list(meet.get(row["id"], {}).values()), mday))
    deal_ids = {r["id"] for r in closures + active}
    meetings = sorted(({"id": mid, "deal_id": did, "date": d_, "title": (t if t and t != "Unassigned" else None), "owner": mowner.get(mid)}
                       for did, ms in meet.items() if did in deal_ids for mid, (d_, t) in ms.items()),
                      key=lambda x: (x["date"], x["id"]), reverse=True)

    # a deal linked to two companies comes back as two rows: keep one
    def dedupe(rows):
        seen, out_ = set(), []
        for r in rows:
            if r["id"] in seen: continue
            seen.add(r["id"]); out_.append(r)
        return out_
    closures, active = dedupe(closures), dedupe(active)
    from money_fields import fix_all
    closures, active = fix_all(closures), fix_all(active)
    leads = {k: fix_all(v) for k, v in leads.items()}

    from datetime import timezone
    pulled = datetime.fromtimestamp((RAW / "deals.txt").stat().st_mtime, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out = {"generated_at": pulled, "source": "HubSpot (manual pull)",
           "closures": sorted(closures, key=lambda x: x["close_date"] or "", reverse=True),
           "active": sorted(active, key=lambda x: -(x["amount"] or 0)),
           "meetings": meetings,
           "leads": sorted(leads.values(), key=lambda x: max(x["mql_date"] or "", x["sql_date"] or ""), reverse=True)}
    (DATA / "details.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print("closures", len(closures), "active", len(active), "leads", len(leads),
          "with contacts", sum(1 for x in closures + active if x["contacts"]))

    # keep the Overview tab on the same snapshot as the new tabs
    sea = json.loads((DATA / "sea.json").read_text())
    sea["generated_at"] = out["generated_at"]
    sea["open_deals"] = [{"id": a["id"], "deal": a["deal"], "stage_id": a["stage_id"], "stage": a["stage"],
                          "region": next(k for k, v in REG.items() if v == a["country"]), "amount": a["amount"],
                          "close_date": a["close_date"], "owner": a["deal_owner"] or "Unassigned", "last_contacted": a["last_activity"],
                          "probability": a["probability"], "url": a["url"]} for a in out["active"]]
    agg = defaultdict(lambda: [0, 0.0])
    for a in out["active"]: agg[(a["country"], a["stage_id"])][0] += 1; agg[(a["country"], a["stage_id"])][1] += a["amount"] or 0
    for c in closures: agg[(c["country"], WON)][0] += 1; agg[(c["country"], WON)][1] += c["amount"] or 0
    keep = [r for r in sea["pipeline_stage"] if r["stage_id"] not in OPEN | {WON}]
    # closed-lost / failed-assessment rows and the Qualification-pipeline funnel, when a fresh pull exists
    if (RAW / "lost_qual.txt").exists():
        lq, seen_ = [], set()
        for r in table("lost_qual.txt"):
            if r["hs_object_id"] in seen_ or r.get("region") not in REG: continue
            seen_.add(r["hs_object_id"]); lq.append(r)
        la = defaultdict(lambda: [0, 0.0]); qa = defaultdict(int)
        for r in lq:
            sid = stage_id(r["dealstage"])
            if sid in ("280510162", "286129884"):
                la[(r["region"], sid)][0] += 1; la[(r["region"], sid)][1] += num(r.get("amount_in_home_currency")) or 0
            else:
                qa[(r["region"], stage_label(r["dealstage"]))] += 1
        lbl = {"280510162": "Closed lost", "286129884": "Failed Assessment"}
        keep = [{"region": rg, "stage_id": sid, "stage": lbl[sid], "count": n, "amount": round(a, 2)} for (rg, sid), (n, a) in sorted(la.items())]
        sea["qual_stage"] = [{"region": rg, "stage": st, "count": n} for (rg, st), n in sorted(qa.items())]
    inv = {v: k for k, v in REG.items()}
    labels = {"280510157": "Demo/Developing", "280510158": "Proposal Sent", "280510159": "Commercial/Contracting", "280510160": "On-Hold", WON: "Closed won"}
    sea["pipeline_stage"] = keep + [{"region": inv[c], "stage_id": s, "stage": labels[s], "count": n, "amount": round(a, 2)} for (c, s), (n, a) in sorted(agg.items())]
    wq = defaultdict(lambda: [0, 0.0])
    for c in closures:
        if (c["close_date"] or "") >= "2025-04-01":
            y, m = int(c["close_date"][:4]), int(c["close_date"][5:7]); q = f"{y}-{((m - 1) // 3) * 3 + 1:02d}-01"
            wq[(inv[c["country"]], q)][0] += 1; wq[(inv[c["country"]], q)][1] += c["amount"] or 0
    sea["won_quarterly"] = [{"region": r, "quarter": q, "count": n, "amount": round(a, 2)} for (r, q), (n, a) in sorted(wq.items())]
    (DATA / "sea.json").write_text(json.dumps(sea, indent=1, ensure_ascii=False))
    print("sea.json open deals", len(sea["open_deals"]))


if __name__ == "__main__":
    main()
