# SEA Pipeline — HubSpot

Team review dashboard for HONO's Southeast Asia pipeline (Thailand, Philippines, Indonesia, Malaysia, Singapore), built from HubSpot.

Live site: https://bmytm.github.io/sea-pipeline-hubspot/

This is a separate project from the existing SEA Dashboard (`sea-dashboard`) and from `sea-hubspot-dashboard`. It does not read or change either repo.

## What's on the page

- FY27 closed-won vs the USD 3M target, active pipeline, weighted pipeline, on-hold value and the gap to target
- Open pipeline by country and stage, plus closed-won by quarter
- Country scorecard (win rate) and a by-owner view
- Every open SEA deal: filter, search, sort, download CSV, and open the deal in HubSpot
- Top of funnel (Qualification pipeline) and a data-health check
- **Closures** tab: every closed-won deal by country, year and month, with account, deal owner, account owner and linked contacts
- **Active pipeline** tab: every open deal by country with status, conversion probability, closure date, notes (Deal Status remarks, next step, call to action), owners and contacts
- **MQL & SQL** tab: contacts that reached MQL or SQL by country, monthly trend, conversion, and the contact list
- Every tab filters by country and downloads as CSV
- Click anything to drill down: tiles, chart bars and summary numbers filter the list; rows open a detail panel with contacts, notes and a HubSpot link
- Every dropdown shows how many rows each choice gives, and hides choices with none
- `tests/filter_check.py` re-checks every filter, dropdown count, summary number and tile against the data (about 2,000 checks)
- Filters are kept in the link (e.g. `#active?country=Thailand&status=On-Hold`), so a filtered view can be shared

## How the data gets here

```
HubSpot ──(daily GitHub Action, token in repo secret)──> data/sea.json ──> GitHub Pages site
```

- `scripts/fetch_hubspot.py` pulls SEA deals, contacts, companies and owners from the HubSpot API and writes `data/sea.json` and `data/details.json`.
- `.github/workflows/refresh.yml` runs it every day at 07:17 Manila (06:17 Bangkok) and commits the new file. **Actions → Refresh HubSpot data → Run workflow** refreshes on demand.
- The browser only reads `data/sea.json`. **No HubSpot token is ever in the code or on the site.**
- `scripts/seed_snapshot.py` and `scripts/build_details_from_raw.py` wrote the first snapshots (23–24 Oct 2026); the daily job replaces them.

## One-time setup: connect HubSpot

1. In HubSpot: **Settings → Integrations → Private Apps → Create a private app** (name it "SEA dashboard").
2. Scopes: `crm.objects.deals.read`, `crm.objects.contacts.read`, `crm.objects.companies.read`, `crm.objects.owners.read`. Create it and copy the access token.
3. In this repo: **Settings → Secrets and variables → Actions → New repository secret**, name `HUBSPOT_TOKEN`, paste the token.
4. **Actions → Refresh HubSpot data → Run workflow** to check it works.

## Definitions

- SEA = HubSpot `region` in "Thailand & Others", Indonesia, Philippines, Malaysia, Singapore; **Sales Pipeline** only.
- Active = Demo/Developing, Proposal Sent, Commercial/Contracting. On hold = On-Hold. Weighted = value × HubSpot stage probability.
- Values are HubSpot's company-currency amount (USD). FY27 = 1 Apr 2026 – 31 Mar 2027.
- MQL / SQL = the contact's lifecycle stage history (date entered MQL / SQL), grouped by the contact's Country field.
- Notes = the deal's "Deal Status" remarks plus Next step. Conversion probability is the owner's own rating in those remarks.
- `data/sea_overrides.json` lists SEA closed-won deals that HubSpot files under a non-SEA Region (mostly 2022–2023 deals tagged India-North, e.g. AG&P). They are counted under the country given there and tagged "region not SEA" on the page. Fix the Region in HubSpot, then remove the entry.
- Closed-lost values are left out of every total: some Thailand and Philippines lost deals look like local-currency entries.

## Note on access

GitHub Pages sites are public to anyone with the link. The page asks search engines not to index it, but treat the link as confidential. Deal and contact links open HubSpot, which still needs a HubSpot login. Contacts show name and job title only; emails and phone numbers are not published.
