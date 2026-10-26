# Refreshing the data without an API token

Used by the daily scheduled Claude task (and for any manual refresh) until a HubSpot private-app token is added. It pulls through the HubSpot connector of the person running it, so no IT setup is needed.

Today's date goes where `TODAY` appears (YYYY-MM-DD). Each pull must be saved to the exact file named below in `raw_new/`, as the raw tool output (`{"results":[...]}`). If a result comes back inline instead of as a saved file, take it from the session transcript; never retype rows.

| File | Tool | Query |
|---|---|---|
| `deals.txt` | query_crm_data, LOW | `SELECT test, region, dealname, closedate, dealstage, createdate, COMPANY.name, hs_next_step, hs_object_id, new_deal_source, hubspot_owner_id, notes_last_updated, amount_in_home_currency, COMPANY.hubspot_owner_id, hs_deal_stage_probability FROM DEAL WHERE pipeline = '144168382' AND region IN ('Thailand & Others', 'Indonesia', 'Philippines', 'Malaysia', 'Singapore') AND dealstage IN ('280510157', '280510158', '280510159', '280510160', '280510161') LIMIT 1000` |
| `deal_contacts.txt` | query_crm_data, LOW | `SELECT test, dealname, dealstage, hs_object_id, CONTACT.jobtitle, CONTACT.lastname, CONTACT.firstname, CONTACT.lifecyclestage FROM DEAL WHERE` *(same WHERE as deals)* |
| `mql.txt` | query_crm_data, HIGH | `SELECT company, jobtitle, lastname, firstname, createdate, COMPANY.name, hs_object_id, country__hono_, hs_lead_status, lifecyclestage, hubspot_owner_id, notes_last_updated, hs_analytics_source, num_associated_deals, COMPANY.hubspot_owner_id, COMPANY.numberofemployees, hs_v2_date_entered_customer, hs_v2_date_entered_opportunity, hs_v2_date_entered_salesqualifiedlead, hs_v2_date_entered_marketingqualifiedlead FROM CONTACT WHERE country__hono_ IN ('Thailand', 'Indonesia', 'Philippines', 'Malaysia', 'Singapore') AND hs_v2_date_entered_marketingqualifiedlead IS NOT NULL ORDER BY hs_v2_date_entered_marketingqualifiedlead DESC LIMIT 1000` |
| `sql.txt` | query_crm_data, HIGH | same as mql.txt, with `salesqualifiedlead` in place of `marketingqualifiedlead` in the WHERE and ORDER BY |
| `qual.txt` | query_crm_data, HIGH | `SELECT region, dealname, closedate, dealstage, COMPANY.name, hs_object_id, COMPANY.country, hubspot_owner_id, closed_lost_reason, amount_in_home_currency FROM DEAL WHERE region IN ('Thailand & Others', 'Indonesia', 'Philippines', 'Malaysia', 'Singapore') AND pipeline = '1545971955' LIMIT 1000` |
| `lost_sales.txt` | query_crm_data, HIGH | same SELECT, `WHERE region IN (...SEA...) AND pipeline = '144168382' AND dealstage IN ('280510162', '286129884') LIMIT 1000` |
| `meetings.txt` | query_crm_data, HIGH | `SELECT hs_object_id, hs_meeting_start_time, hs_meeting_title, DEAL.hs_object_id, DEAL.region FROM MEETING WHERE DEAL.pipeline = '144168382' AND DEAL.hs_is_closed = 'false' AND hs_meeting_start_time <= 'TODAY' ORDER BY hs_meeting_start_time DESC LIMIT 1000` |
| `money.txt` | search_crm_objects | objectType DEAL, limit 200, one filter group: pipeline EQ 144168382, region IN the 5 SEA regions, dealstage IN 280510157/158/159/160/161. Properties: dealname, dealstage, region, amount, amount_in_home_currency, closedate, deal_currency_code, hs_exchange_rate, annual_subscription_fee, implementation_fee, recurring_amount, onetime_amount, number_of_employees, proposal_sent_date, hs_v2_date_entered_280510158, new_deal_source, new_deal_subsource, internal_reference__sub_sources, hubspot_owner_id, hs_deal_stage_probability, hs_next_step, notes_last_updated. This live record overrides the SQL export (which can lag HubSpot by hours) for stage, owner, dates and amounts. |

Checks before publishing: every TSV ends with "Showing N of N total results" (N equal on both sides), and `money.txt` has `total` equal to the number of results.

Then:

```
python3 scripts/stage_manual_pull.py
python3 scripts/build_details_from_raw.py
python3 -m http.server 8765 &   # then: python3 tests/filter_check.py "$PWD"  → Failures: 0
git add data && git commit -m "Refresh HubSpot data (<date>)" && git push
```

Stop and don't push if open deals drop below 80 or closures below 35 (a sign a pull came back partial).
