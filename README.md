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

## How the data gets here

```
HubSpot ──(daily GitHub Action, token in repo secret)──> data/sea.json ──> GitHub Pages site
```

- `scripts/fetch_hubspot.py` pulls SEA deals and owners from the HubSpot API and writes `data/sea.json`.
- `.github/workflows/refresh.yml` runs it every day at 07:17 Manila (06:17 Bangkok) and commits the new file. **Actions → Refresh HubSpot data → Run workflow** refreshes on demand.
- The browser only reads `data/sea.json`. **No HubSpot token is ever in the code or on the site.**
- `scripts/seed_snapshot.py` wrote the first snapshot (23 Oct 2026); the daily job replaces it.

## One-time setup: connect HubSpot

1. In HubSpot: **Settings → Integrations → Private Apps → Create a private app** (name it "SEA dashboard").
2. Scopes: `crm.objects.deals.read`, `crm.objects.owners.read`. Create it and copy the access token.
3. In this repo: **Settings → Secrets and variables → Actions → New repository secret**, name `HUBSPOT_TOKEN`, paste the token.
4. **Actions → Refresh HubSpot data → Run workflow** to check it works.

## Definitions

- SEA = HubSpot `region` in "Thailand & Others", Indonesia, Philippines, Malaysia, Singapore; **Sales Pipeline** only.
- Active = Demo/Developing, Proposal Sent, Commercial/Contracting. On hold = On-Hold. Weighted = value × HubSpot stage probability.
- Values are HubSpot's company-currency amount (USD). FY27 = 1 Apr 2026 – 31 Mar 2027.
- Closed-lost values are left out of every total: some Thailand and Philippines lost deals look like local-currency entries.

## Note on access

GitHub Pages sites are public to anyone with the link. The page asks search engines not to index it, but treat the link as confidential. Deal links open HubSpot, which still needs a HubSpot login.
