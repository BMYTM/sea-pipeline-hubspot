"""Run: pip install playwright && python -m playwright install chromium && python tests/filter_check.py .
"""
"""Checks every filter on the SEA portal against an independent re-computation from data/details.json."""
import asyncio, json, re, subprocess, sys, time
from datetime import date, timedelta
from urllib.parse import urlencode
from playwright.async_api import async_playwright

ROOT = sys.argv[1]
D = json.load(open(ROOT + "/data/details.json"))
TODAY = date.today().isoformat()
plus = lambda n: (date.today() + timedelta(days=n)).isoformat()
FY = {"fy27": ("2026-04-01", "2027-04-01"), "fy26": ("2025-04-01", "2026-04-01"), "fy25": ("2024-04-01", "2025-04-01"), "fy24": ("2023-04-01", "2024-04-01")}
COUNTRIES = ["", "Thailand", "Philippines", "Indonesia", "Malaysia", "Singapore"]


def in_fy(d, k): return bool(d) and FY[k][0] <= d < FY[k][1]


# ---------- independent expectations ----------
def exp_closures(f):
    out = []
    for r in D["closures"]:
        if f.get("country") and r["country"] != f["country"]: continue
        if f.get("year") and r["year"] != f["year"]: continue
        if f.get("period") and not in_fy(r["close_date"], f["period"]): continue
        if f.get("month") and r["month"] != f["month"]: continue
        if f.get("owner") and r["deal_owner"] != f["owner"]: continue
        if f.get("acct") and r["account_owner"] != f["acct"]: continue
        sf = f.get("source")
        if sf and not (r["source"] == "Partner" if sf == "partner" else r["source"] != "Partner" if sf == "direct" else r["source"] == sf): continue
        if f.get("partner") and r.get("partner") != f["partner"]: continue
        out.append(r)
    return out


def exp_active(f):
    out = []
    for r in D["active"]:
        cd, la = r["close_date"], r["last_activity"]
        if f.get("country") and r["country"] != f["country"]: continue
        st = f.get("status")
        if st:
            want = set()
            for x in st.split(","):
                want |= {"Demo/Developing", "Proposal Sent", "Commercial/Contracting"} if x == "active" else {x}
            if r["stage"] not in want: continue
        pp, ps = f.get("proposal"), r.get("proposal_sent")
        if pp and not ({"none": not ps, "any": bool(ps), "fy27": in_fy(ps, "fy27")}.get(pp, bool(ps) and ps >= plus(-int(pp) if pp.isdigit() else 0))): continue
        sf = f.get("source")
        if sf and not (r["source"] == "Partner" if sf == "partner" else r["source"] != "Partner" if sf == "direct" else r["source"] == sf): continue
        if f.get("partner") and r.get("partner") != f["partner"]: continue
        c = f.get("close")
        if c:
            ok = {"past": bool(cd) and cd < TODAY, "none": not cd, "fy27": bool(cd) and TODAY <= cd < "2027-04-01",
                  "later": bool(cd) and cd >= "2027-04-01"}.get(c)
            if ok is None: ok = bool(cd) and TODAY <= cd <= plus(int(c))
            if not ok: continue
        if f.get("owner") and r["deal_owner"] != f["owner"]: continue
        if f.get("acct") and r["account_owner"] != f["acct"]: continue
        h = f.get("health")
        if h:
            ok = {"stale": bool(la) and la < plus(-90), "never": not la, "cta": r["cta"] == "Yes",
                  "nocontact": not r["contacts"], "noamount": not r["amount"]}[h]
            if not ok: continue
        out.append(r)
    return out


def exp_leads(f):
    p = f.get("period", "")
    frm = plus(-30) if p == "30" else plus(-90) if p == "90" else FY[p][0] if p in FY else ""
    to = FY[p][1] if p in FY else "9999"
    m = f.get("month", "")
    inp = lambda d: bool(d) and (not frm or frm <= d < to) and (not m or d[:7] == m)
    out = []
    for r in D["leads"]:
        t = f.get("type", "")
        if t == "mql": ok = inp(r["mql_date"])
        elif t == "sql": ok = inp(r["sql_date"])
        elif t == "converted": ok = bool(r["mql_date"]) and inp(r["sql_date"])
        else:
            ok = (r["stage"] == "Marketing Qualified Lead" if t == "nowmql" else r["stage"] == "Sales Qualified Lead" if t == "nowsql" else True)
            ok = ok and (not (frm or m) or inp(r["mql_date"]) or inp(r["sql_date"]))
        if not ok: continue
        if f.get("country") and r["country"] != f["country"]: continue
        if f.get("owner") and r["owner"] != f["owner"]: continue
        if f.get("source") and r["source"] != f["source"]: continue
        out.append(r)
    return out


EXP = {"closures": exp_closures, "active": exp_active, "leads": exp_leads}
NOTE = {"closures": "#cl-note", "active": "#ac-note", "leads": "#ld-note"}


def owners(rows, keys): return sorted({r[k] for r in rows for k in keys if r.get(k)})


OPTS = {
    "closures": {"period": list(FY), "year": sorted({r["year"] for r in D["closures"]}), "owner": owners(D["closures"], ["deal_owner"]), "acct": owners(D["closures"], ["account_owner"]),
                 "source": ["partner", "direct"] + sorted({r["source"] for r in D["closures"] if r["source"] and r["source"] != "Partner"}), "partner": sorted({r["partner"] for r in D["closures"] if r.get("partner")}), "month": sorted({r["month"] for r in D["closures"]})},
    "active": {"status": ["active", "Demo/Developing", "Proposal Sent", "Commercial/Contracting", "On-Hold", "Demo/Developing,On-Hold", "Proposal Sent,On-Hold", "Demo/Developing,Proposal Sent"], "proposal": ["30", "90", "fy27", "any", "none"], "source": ["partner", "direct"] + sorted({r["source"] for r in D["active"] if r["source"] and r["source"] != "Partner"}), "partner": sorted({r["partner"] for r in D["active"] if r.get("partner")}),
               "close": ["past", "30", "90", "fy27", "later", "none"], "owner": owners(D["active"], ["deal_owner"]), "acct": owners(D["active"], ["account_owner"]),
               "health": ["stale", "never", "cta", "nocontact", "noamount"]},
    "leads": {"type": ["mql", "sql", "nowmql", "nowsql", "converted"], "period": ["30", "90", "fy27", "fy26"], "owner": owners(D["leads"], ["owner"]),
              "source": sorted({r["source"] for r in D["leads"] if r["source"]}),
              "month": sorted({d[:7] for r in D["leads"] for d in (r["mql_date"], r["sql_date"]) if d})[-18:]},
}
COMBOS = {"closures": [{"period": "fy26", "source": "partner"}, {"year": "2023", "owner": "Nova Sinulingga"}],
          "active": [{"status": "Demo/Developing,Proposal Sent", "close": "fy27"}, {"status": "Proposal Sent,On-Hold", "proposal": "any"}, {"status": "On-Hold", "close": "past"}, {"status": "active", "source": "partner", "close": "fy27"}, {"status": "Proposal Sent,Commercial/Contracting", "source": "direct"}, {"health": "stale", "owner": "Jun de Dios"}],
          "leads": [{"type": "mql", "period": "fy27"}, {"type": "sql", "period": "90"}, {"type": "nowmql", "owner": "Soranan Natejan"}, {"type": "mql", "month": "2026-09"}]}


def money(v):
    if v is None: return None
    return v


async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", "8770", "-d", ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    fails, checks, zeros = [], 0, []
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1280, "height": 900})
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("http://localhost:8770/index.html#closures"); await pg.wait_for_timeout(1500)

        async def view(tab, f):
            h = "#" + tab + ("?" + urlencode({k: v for k, v in f.items() if v}) if any(f.values()) else "")
            await pg.evaluate("(h) => { location.hash = h; }", h); await pg.wait_for_timeout(40)
            note = await pg.inner_text(NOTE[tab])
            rows = await pg.locator(NOTE[tab].replace("note", "tbl") + " tbody tr.row").count()
            ids = await pg.evaluate("(sel) => [...document.querySelectorAll(sel + ' tbody tr.row')].length", NOTE[tab].replace("note", "tbl"))
            n = int(re.match(r"([\d,]+)", note).group(1).replace(",", ""))
            return n, rows, note

        async def check(tab, f, label=None):
            nonlocal checks
            exp = EXP[tab](f); n, rows, note = await view(tab, f); checks += 1
            if n != len(exp) or rows != len(exp):
                fails.append(f"{tab} {f}: page note {n}, rows {rows}, expected {len(exp)}")
            if len(exp) == 0: zeros.append(f"{tab} {f}")
            # selected filters must show as pills and in the select
            for k, v in f.items():
                if not v: continue
                pills = await pg.inner_text("#fb-pills")
                if k not in ("country", "month", "quarter", "status"):
                    sel_val = await pg.evaluate("(lbl) => { const s=[...document.querySelectorAll('#fb-controls select')].find(x=>x.getAttribute('aria-label')===lbl); return s ? s.value : null; }",
                                                {"period": "Financial year" if tab == "closures" else "When", "year": "Calendar year", "owner": "Contact owner" if tab == "leads" else "Deal owner", "acct": "Account owner", "source": "Source" if tab == "leads" else "Deal source", "partner": "Partner",
                                                 "proposal": "Proposal sent", "close": "Closure date", "health": "Follow-up", "type": "Stage"}[k])
                    if sel_val != v: fails.append(f"{tab} {f}: dropdown for {k} shows {sel_val!r}")
                if "×" not in pills: fails.append(f"{tab} {f}: no filter pill shown")

        # 1. every single option, alone and with each country
        for tab, opts in OPTS.items():
            for c in COUNTRIES:
                await check(tab, {"country": c})
                for k, vals in opts.items():
                    for v in vals:
                        await check(tab, {"country": c, k: v})
            for combo in COMBOS[tab]:
                for c in COUNTRIES: await check(tab, dict(combo, country=c))

        # 1b. every dropdown option's count matches the list after picking it (with each country, and with a second filter)
        for tab, extra in [("closures", {}), ("closures", {"period": "fy26"}), ("active", {}), ("active", {"status": "On-Hold"}), ("leads", {}), ("leads", {"type": "mql"})]:
            for c in COUNTRIES:
                base = dict(extra, country=c)
                await view(tab, base)
                opts = await pg.evaluate("""() => [...document.querySelectorAll('#fb-controls select')].map(s => ({lbl: s.getAttribute('aria-label'),
                    opts: [...s.options].map(o => ({v: o.value, t: o.text, d: o.disabled}))}))""")
                keymap = {"Financial year": "period", "When": "period", "Calendar year": "year", "Deal owner": "owner", "Contact owner": "owner", "Account owner": "acct",
                          "Source": "source", "Deal source": "source", "Partner": "partner", "Proposal sent": "proposal", "Closure date": "close", "Follow-up": "health", "Stage": "type"}
                for sel in opts:
                    k = keymap[sel["lbl"]]
                    for o in sel["opts"]:
                        m = re.search(r"\(([\d,]+)\)$", o["t"])
                        if not m: fails.append(f"{tab} {base} {sel['lbl']} option '{o['t']}' has no count"); continue
                        claimed = int(m.group(1).replace(",", ""))
                        f = dict(base, **{k: o["v"]})
                        n, rows, _ = await view(tab, f); checks += 1
                        if claimed != n: fails.append(f"{tab} {base} option '{o['t']}' -> list {n}")
                        if n != len(EXP[tab](f)): fails.append(f"{tab} {f}: list {n} vs expected {len(EXP[tab](f))}")
                        if n == 0 and o["v"] and not o["d"] and base.get(k) != o["v"]: fails.append(f"{tab} {base} option '{o['t']}' is empty but selectable")

        # 1c. status toggles: count on each toggle == list after pressing it; toggles combine
        for c in COUNTRIES:
            for start in ["", "On-Hold", "Demo/Developing"]:
                await view("active", {"country": c, "status": start})
                for i in range(await pg.locator("#fb-controls .tog").count()):
                    await view("active", {"country": c, "status": start})
                    tog = pg.locator("#fb-controls .tog").nth(i)
                    if await tog.is_disabled(): continue
                    claimed = int((await tog.locator(".n").inner_text()).replace(",", ""))
                    name = (await tog.inner_text()).rsplit("\n", 1)[0].strip()
                    await tog.click(); await pg.wait_for_timeout(40)
                    h = await pg.evaluate("location.hash"); qs = (h[1:].split("?") + [""])[1]
                    from urllib.parse import unquote_plus
                    f = {k: unquote_plus(v) for k, v in (x.split("=", 1) for x in qs.split("&") if x)}
                    n, rows, _ = await view("active", f); checks += 1
                    if n != len(EXP["active"](f)): fails.append(f"toggle {name} from {start!r} {c}: list {n} vs expected {len(EXP['active'](f))} ({f})")
                    only = len(EXP["active"]({"country": c, "status": name}))
                    if claimed != only: fails.append(f"toggle {name} {c}: shows {claimed}, alone gives {only}")

        # 2. chips: count on chip == rows after clicking it (with a filter active)
        for tab, f in [("closures", {"period": "fy26"}), ("active", {"status": "On-Hold"}), ("leads", {"type": "mql"})]:
            for i, c in enumerate(COUNTRIES):
                await view(tab, f)
                chip = pg.locator("#fb-chips .chip").nth(i)
                shown = int((await chip.locator(".n").inner_text()).replace(",", ""))
                await chip.click(); await pg.wait_for_timeout(40)
                n, rows, _ = await view(tab, dict(f, country=c)); checks += 1
                if shown != n: fails.append(f"chip {tab} {c or 'All'} with {f}: chip says {shown}, list {n}")

        # 3. every clickable number in the summary tables
        for tab, tbl in [("closures", "#cl-year"), ("active", "#ac-sum"), ("leads", "#ld-sum")]:
            await view(tab, {})
            cnt = await pg.locator(tbl + " .cell").count()
            for i in range(cnt):
                await view(tab, {})
                cell = pg.locator(tbl + " .cell").nth(i)
                txt = (await cell.inner_text()).strip()
                m = re.match(r"([\d,]+)", txt)
                await cell.click(); await pg.wait_for_timeout(40)
                h = await pg.evaluate("location.hash")
                tabname, qs = (h[1:].split("?") + [""])[:2]
                f = dict(x.split("=", 1) for x in qs.split("&") if x)
                from urllib.parse import unquote_plus
                f = {k: unquote_plus(v) for k, v in f.items()}
                n, rows, _ = await view(tab, f); checks += 1
                exp = len(EXP[tab](f))
                if n != exp: fails.append(f"cell {tbl} #{i} '{txt}' -> {f}: list {n}, expected {exp}")
                if m and not txt.endswith(")") and int(m.group(1).replace(",", "")) != n:
                    fails.append(f"cell {tbl} #{i} shows '{txt}' but list has {n} ({f})")
                if txt.endswith(")"):  # conversion cell "x% (n)"
                    k = int(re.search(r"\((\d+)\)", txt).group(1))
                    if k != n: fails.append(f"cell {tbl} #{i} shows '{txt}' but list has {n}")

        # 4. KPI tiles on each tab
        for tab, sel in [("closures", "#cl-kpis"), ("active", "#ac-kpis"), ("leads", "#ld-kpis")]:
            for c in COUNTRIES:
                await view(tab, {"country": c})
                cnt = await pg.locator(sel + " .kpi.click").count()
                for i in range(cnt):
                    await view(tab, {"country": c})
                    tile = pg.locator(sel + " .kpi.click").nth(i)
                    val = (await tile.locator(".k-val").inner_text()).strip(); sub = (await tile.locator(".k-sub").inner_text()).strip()
                    await tile.click(); await pg.wait_for_timeout(40)
                    h = await pg.evaluate("location.hash"); qs = (h[1:].split("?") + [""])[1]
                    from urllib.parse import unquote_plus
                    f = {k: unquote_plus(v) for k, v in (x.split("=", 1) for x in qs.split("&") if x)}
                    n, rows, _ = await view(tab, f); checks += 1
                    claimed = re.match(r"^([\d,]+)$", val) or re.search(r"([\d,]+) (deals|contacts)", sub)
                    if claimed and int(claimed.group(1).replace(",", "")) != n:
                        fails.append(f"tile {tab} {c or 'All'} '{val} / {sub}' -> {f}: list has {n}")
                    if n != len(EXP[tab](f)): fails.append(f"tile {tab} {f}: list {n} vs expected {len(EXP[tab](f))}")

        # 5. overview -> drill targets land on the right numbers
        await pg.goto("http://localhost:8770/index.html#overview"); await pg.wait_for_timeout(1200)
        for i in range(await pg.locator("#country-tbl tbody tr.row").count()):
            await pg.goto("http://localhost:8770/index.html#overview"); await pg.wait_for_timeout(500)
            row = pg.locator("#country-tbl tbody tr.row").nth(i)
            cells = await row.locator("td").all_inner_texts()
            await row.click(); await pg.wait_for_timeout(200)
            n, rows, _ = await view("active", {"country": cells[0]}); checks += 1
            exp_open = int(cells[2]) + int(cells[4])
            if n != exp_open: fails.append(f"overview country row {cells[0]}: active {cells[2]} + on-hold {cells[4]} = {exp_open}, list {n}")
        for i in range(await pg.locator("#q-tbl tbody tr.row").count()):
            await pg.goto("http://localhost:8770/index.html#overview"); await pg.wait_for_timeout(500)
            row = pg.locator("#q-tbl tbody tr.row").nth(i)
            cells = await row.locator("td").all_inner_texts()
            await row.click(); await pg.wait_for_timeout(200)
            h = await pg.evaluate("location.hash"); n = int(re.match(r"([\d,]+)", await pg.inner_text("#ac-note")).group(1)); checks += 1
            if int(cells[1]) != n: fails.append(f"overview data-health '{cells[0]}' shows {cells[1]}, list {n} ({h})")
        for i in range(await pg.locator("#owner-tbl tbody tr.row").count()):
            await pg.goto("http://localhost:8770/index.html#overview"); await pg.wait_for_timeout(500)
            row = pg.locator("#owner-tbl tbody tr.row").nth(i)
            cells = await row.locator("td").all_inner_texts()
            await row.click(); await pg.wait_for_timeout(200)
            n = int(re.match(r"([\d,]+)", await pg.inner_text("#ac-note")).group(1)); checks += 1
            if int(cells[1]) != n: fails.append(f"overview owner '{cells[0]}' shows {cells[1]} open deals, list {n}")
        for i in range(await pg.locator("#kpis .kpi").count()):
            await pg.goto("http://localhost:8770/index.html#overview"); await pg.wait_for_timeout(500)
            t = pg.locator("#kpis .kpi").nth(i); sub = await t.locator(".k-sub").inner_text(); lab = await t.locator(".k-lab").inner_text()
            await t.click(); await pg.wait_for_timeout(200)
            h = await pg.evaluate("location.hash"); note_sel = "#cl-note" if h.startswith("#closures") else "#ac-note"
            n = int(re.match(r"([\d,]+)", await pg.inner_text(note_sel)).group(1)); checks += 1
            m = re.search(r"([\d,]+) deals", sub)
            if m and int(m.group(1)) != n: fails.append(f"overview tile '{lab}' says {m.group(1)} deals, list {n} ({h})")
            print(f"  overview tile '{lab}' -> {h} -> {n}")
        await b.close()
    srv.terminate()
    print(f"\nChecks run: {checks}\nPage errors: {errs}\nFailures: {len(fails)}")
    for x in fails[:80]: print("  FAIL", x)
    print(f"Filter views that are empty (may be correct): {len(zeros)}")
    for z in zeros[:400]: print("  0 ->", z)

asyncio.run(main())
