# SEA Pipeline — HubSpot

Team review dashboard for HONO's Southeast Asia pipeline (Thailand, Philippines, Indonesia, Malaysia, Singapore), built from HubSpot.

Live site: https://bmytm.github.io/sea-pipeline-hubspot/

This is a separate project from the existing SEA Dashboard (`sea-dashboard`) and from `sea-hubspot-dashboard`. It does not read or change either repo.

## What's on the page

Two tabs only. On-hold deals are left out of the dashboard.

- **Closures** tab: every closed-won deal by country, year and month, with headcount, subscription, implementation, year-1 total (USD and local currency), account, owners and linked contacts
- **Active pipeline** tab: every open deal (excluding On-Hold) by country with status (pick several at once), deal source (Partner and partner name, or the direct source), proposal-sent date, closure date, last meeting date, employee headcount, subscription, implementation and year-1 total (USD and local currency), notes, owners and contacts
- **Meetings** tab: upcoming meetings (next on top, click to open the deal), meetings by month, and the full list of past and upcoming meetings, filterable by when, meeting owner (who the meeting is assigned to in HubSpot), deal stage, deal owner and client vs internal. Each deal's detail panel also lists its meetings. Only meetings linked to a deal in HubSpot are included.
- Every tab filters by country and downloads as CSV
- **Download weekly review (PPT)** (top right) builds the weekly review deck in the browser from the latest data: FY target and YTD vs last FY, monthly and quarterly ACV, contracts signed, proposals, open pipeline, meetings completed and scheduled, and a list of HubSpot fields the team still needs to fill in. `tests/report_check.py` checks the deck against the data.
- Click anything to drill down: tiles, chart bars and summary numbers filter the list; rows open a detail panel with contacts, notes and a HubSpot link
- Every dropdown shows how many rows each choice gives, and hides choices with none
- `tests/filter_check.py` re-checks every filter, dropdown count, summary number and tile against the data (about 2,000 checks)
- Filters are kept in the link (e.g. `#active?country=Thailand&status=Proposal%20Sent`), so a filtered view can be shared

## How the data gets here

```
HubSpot ──(daily GitHub Action, token in repo secret)──> data/sea.json ──> GitHub Pages site
```

- `scripts/fetch_hubspot.py` pulls SEA deals, contacts, companies and owners from the HubSpot API and writes `data/sea.json` and `data/details.json`.
- `.github/workflows/refresh.yml` runs it every day at 07:17 Manila (06:17 Bangkok) and commits the new file. **Actions → Refresh HubSpot data → Run workflow** refreshes on demand.
- The browser only reads `data/sea.json`. **No HubSpot token is ever in the code or on the site.**
- `scripts/seed_snapshot.py` and `scripts/build_details_from_raw.py` wrote the first snapshots (23–24 Oct 2026); the daily job replaces them.

## Daily refresh without IT

A scheduled Claude task refreshes the data every morning through the HubSpot connector, following `REFRESH.md`. No API token is needed. The token setup below is an alternative if IT can create a HubSpot private app.

## Optional: connect HubSpot with a private-app token

1. In HubSpot: **Settings → Integrations → Private Apps → Create a private app** (name it "SEA dashboard").
2. Scopes: `crm.objects.deals.read`, `crm.objects.contacts.read`, `crm.objects.companies.read`, `crm.objects.owners.read`. Create it and copy the access token.
3. In this repo: **Settings → Secrets and variables → Actions → New repository secret**, name `HUBSPOT_TOKEN`, paste the token.
4. **Actions → Refresh HubSpot data → Run workflow** to check it works.

## Definitions

- SEA = HubSpot `region` in "Thailand & Others", Indonesia, Philippines, Malaysia, Singapore; **Sales Pipeline** only.
- Active = Demo/Developing, Proposal Sent, Commercial/Contracting. On-Hold deals are not shown. Weighted = value × HubSpot stage probability.
- Values are HubSpot's company-currency amount (USD). FY27 = 1 Apr 2026 – 31 Mar 2027.
- Year-1 total = the HubSpot deal amount in USD. Subscription and implementation come from Annual Subscription Fee + Implementation Fee (or Recurring + One-time Amount) when they add up to the total; the detail panel flags splits that don't.
- Local currency = USD converted at the daily rate in `data/fx.json` (THB, PHP, IDR, MYR, SGD). HubSpot stores almost every SEA deal in USD, so there is no booked local amount to show; the few legacy deals booked in INR show that amount in the detail panel.
- Proposal sent = the deal's Proposal sent Date field, or the date it entered the Proposal Sent stage when that field is empty.
- Employee headcount = the deal's Number of Employees (or the headcount in its Deal Status remarks).
- Notes = the deal's "Deal Status" remarks plus Next step. 
- Last meeting = the latest meeting (on or before today) associated with the deal in HubSpot. Meetings logged only on the contact or company, not the deal, don't count.
- Deal source = HubSpot Deal Source; the name under it is the Deal Sub-source (the partner's name for Partner deals). The Deal source filter has Partner, Direct (non-partner) and each direct source; the Partner filter picks one partner.
- `data/sea_overrides.json` lists SEA closed-won deals that HubSpot files under a non-SEA Region (mostly 2022–2023 deals tagged India-North, e.g. AG&P). They are counted under the country given there and tagged "region not SEA" on the page. Fix the Region in HubSpot, then remove the entry.
- Closed-lost values are left out of every total: some Thailand and Philippines lost deals look like local-currency entries.

## Note on access

GitHub Pages sites are public to anyone with the link. The page asks search engines not to index it, but treat the link as confidential. Deal and contact links open HubSpot, which still needs a HubSpot login. Contacts show name and job title only; emails and phone numbers are not published.
