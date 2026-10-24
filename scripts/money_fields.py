"""Shared logic: headcount, subscription / implementation split, year-1 total, booked currency, proposal sent date."""
from datetime import datetime, timezone

SOURCE_LABEL = {"Other": "Others/Referrals", "Others/Referrals (Other)": "Others/Referrals"}


def source_fields(p):
    src = p.get("new_deal_source")
    src = SOURCE_LABEL.get(src, src) if src else None
    sub = p.get("new_deal_subsource") or p.get("internal_reference__sub_sources") or None
    if sub and "@" in sub: sub = None  # email-valued options are not partner names
    return {"source": src, "sub_source": sub, "partner": sub if src == "Partner" else None}


MONEY_PROPS = ["new_deal_subsource", "internal_reference__sub_sources", "amount", "deal_currency_code", "hs_exchange_rate", "annual_subscription_fee", "implementation_fee",
               "recurring_amount", "onetime_amount", "number_of_employees", "proposal_sent_date", "hs_v2_date_entered_280510158"]


def _num(v):
    try: return float(v) if v not in (None, "") else None
    except (TypeError, ValueError): return None


def _day(v):
    if v in (None, ""): return None
    s = str(v)
    if s.isdigit(): return datetime.fromtimestamp(int(s) / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
    return s[:10]


def money_fields(p, usd_total, remarks_headcount=None):
    """p: raw HubSpot deal properties. usd_total: amount in company currency (USD)."""
    rate = _num(p.get("hs_exchange_rate")) or 1.0
    ccy = p.get("deal_currency_code") or "USD"
    to_usd = lambda v: None if v is None else round(v * rate, 2)
    sub, imp = _num(p.get("annual_subscription_fee")), _num(p.get("implementation_fee"))
    rec, one = _num(p.get("recurring_amount")), _num(p.get("onetime_amount"))
    close = lambda a, b: a is not None and b is not None and abs(a - b) <= max(2, 0.02 * abs(b))
    split = None
    if (sub is not None or imp is not None) and close((sub or 0) + (imp or 0), usd_total / rate if usd_total else None):
        split = (to_usd(sub), to_usd(imp), "fees")
    elif (rec is not None or one is not None) and close((rec or 0) + (one or 0), usd_total / rate if usd_total else None):
        split = (to_usd(rec), to_usd(one), "recurring/one-time")
    elif sub is not None or imp is not None:
        split = (to_usd(sub), to_usd(imp), "mismatch")
    elif rec is not None or one is not None:
        split = (to_usd(rec), to_usd(one), "mismatch")
    hc = _num(p.get("number_of_employees"))
    if hc is None and remarks_headcount:
        hc = _num(str(remarks_headcount).replace(",", ""))
    return {
        "subscription": split[0] if split else None,
        "implementation": split[1] if split else None,
        "split_note": None if not split or split[2] != "mismatch" else "Subscription + implementation in HubSpot do not add up to the deal value",
        "year1_total": usd_total,
        "booked_currency": ccy,
        "booked_amount": _num(p.get("amount")) if ccy != "USD" else None,
        "headcount": int(hc) if hc is not None else None,
        "proposal_sent": _day(p.get("proposal_sent_date")) or _day(p.get("hs_v2_date_entered_280510158")),
        "proposal_sent_source": "Proposal sent Date field" if p.get("proposal_sent_date") else ("Date entered Proposal Sent stage" if p.get("hs_v2_date_entered_280510158") else None),
    }


def fix_text(t):
    """Repair Thai text stored in HubSpot as UTF-8 bytes read as Windows-1252 (e.g. 'à¸œà¸¹...')."""
    if not isinstance(t, str) or ("à¸" not in t and "à¹" not in t): return t
    b = bytearray()
    for ch in t:
        o = ord(ch)
        if o < 256: b.append(o)
        else:
            try: b += ch.encode("cp1252")
            except UnicodeEncodeError: return t
    try: return b.decode("utf-8")
    except UnicodeDecodeError: return t


def fix_all(obj):
    if isinstance(obj, str): return fix_text(obj)
    if isinstance(obj, list): return [fix_all(x) for x in obj]
    if isinstance(obj, dict): return {k: fix_all(v) for k, v in obj.items()}
    return obj


def last_meeting(meetings, today):
    """meetings: list of (start_date 'YYYY-MM-DD', title). Returns the latest one on or before today."""
    past = sorted((m for m in meetings if m[0] and m[0] <= today), reverse=True)
    if not past: return {"last_meeting": None, "last_meeting_title": None, "meetings": 0}
    t = past[0][1]
    return {"last_meeting": past[0][0], "last_meeting_title": None if not t or t == "Unassigned" else t.strip(), "meetings": len(past)}
