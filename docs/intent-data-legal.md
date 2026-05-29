# Intent Data — Feasibility & Legal Memo

**Status:** Foundation for AIRE Phase C (intent prediction). Read before shipping any
outreach that targets homeowners based on property/intent data.
**Owner:** Caleb Jackson, REALTOR®, Rêve Realtors® (Baton Rouge, LA)
**Last reviewed:** 2026-05-28
**Disclaimer:** This is an engineering feasibility memo, not legal advice. Anything
flagged ⚠️ below should be cleared with a licensed attorney / the brokerage's
compliance contact before it drives real outreach.

---

## TL;DR (what ships now vs. what's parked)

| Capability | Verdict | Notes |
|---|---|---|
| PropStream **CSV import** of owned/exported lists | ✅ ships | Manual export from PropStream UI → upload to AIRE. No API. |
| Storing homeowner attributes (equity %, tenure, absentee, owner-occ) | ✅ ships | First-party DB; used for prioritization, not credit decisions. |
| **Sell-intent score** from property attrs + first-party engagement | ✅ ships | Internal prioritization signal. Not a consumer report. |
| Per-person **social/life-event** surveillance (Meta, etc.) | ❌ blocked | Meta Graph is aggregate-only; no lawful per-person life-event feed. |
| PropStream **API / reseller** automated pull | ⚠️ parked | No public API. Revisit only after written TOS/reseller clearance. |
| Cold **outreach** to scored homeowners | ⚠️ gated | TCPA/DNC rules below. Draft-and-approve only; no autodial/mass blast. |

The shipping path for Phase C is: **CSV in → attributes on the lead → an internal
sell-intent score that reorders who Caleb reaches out to**, with every message still
going through the human approve queue (Phase D). No source flagged ❌/⚠️ drives
automated sending.

---

## 1. PropStream

- **No public API.** PropStream does not offer a general developer API for pulling
  property/owner records programmatically. The supported, in-bounds path is the
  product's **native CSV/list export** from the PropStream UI, which the licensed
  user downloads and then uploads into AIRE.
- **TOS posture (⚠️ verify before any automation):** PropStream's terms restrict
  redistribution and bulk scraping. Importing **your own exported list** into your
  own CRM for your own follow-up is the ordinary use. Building an automated scraper
  or reselling the data is not — keep that parked behind written clearance.
- **What the export contains (typical):** owner name, mailing/site address, est.
  equity %, last-sale date / ownership tenure, owner-occupied vs absentee, and flags
  like pre-foreclosure. AIRE stores these as **property intel attached to a lead**.

## 2. FCRA boundary (important)

- Equity, tenure, foreclosure, and lien data are **property/public-record data**, not
  a consumer credit report — *as long as we do not use them to make or influence a
  credit, insurance, employment, or housing eligibility decision.*
- AIRE's use is **marketing prioritization only**: "who is statistically more likely
  to be thinking about selling, so Caleb calls them first." That is **not a
  permissible-purpose credit use** and must never be framed or used as one.
- 🚫 Hard rule: never use intel fields to *deny/condition service* or to assemble
  anything resembling a creditworthiness profile. If that need ever arises, it goes
  through a real FCRA-compliant consumer-reporting agency, not this pipeline.

## 3. TCPA / DNC (outreach, not data)

Owning a phone number ≠ permission to robo-contact it.

- **No autodialer / no mass blast.** AIRE's comms agents draft messages; a human
  approves and sends each one (Phase D approve queue). That keeps us out of ATDS /
  prerecorded-call territory.
- **Scrub against DNC** before outreach to any homeowner who isn't already an
  established lead/contact with a prior relationship. Existing-business-relationship
  and inquiry leads are lower risk; cold PropStream-only records are higher risk.
- **Texting cold numbers is the highest-risk channel** — prefer call/mail for purely
  cold PropStream records, and reserve SMS for leads with a prior relationship.
- Honor opt-outs immediately and permanently; log them.

## 4. Meta / social (aggregate-only)

- Meta Graph API exposes **aggregate** audience/insight data, not individual life
  events (moving, marriage, new baby, etc.). There is **no lawful per-person
  life-event feed** to ingest.
- ✅ Allowed: aggregate cohort signals (e.g. "engagement up among 35–44 in 70809")
  from `meta-insights.ts`, used as a soft, anonymous input.
- ❌ Not allowed: inferring or storing individual-level life events from social to
  trigger targeted outreach. AIRE will **not** attempt per-person social surveillance.

## 5. First-party signals (always fair game)

These are signals AIRE already owns and can use freely:

- Inbound ContactLog cadence / recency (the lead engaging with *us*).
- Pipeline stage, timeline field, pre-approval, price band.
- Email/site engagement we host.

First-party engagement is the **strongest and safest** intent input and should carry
the most weight in scoring.

---

## Decision

Phase C ships as: **PropStream CSV import → property-intel attributes on leads → an
internal sell-intent score blending those attributes with first-party engagement →
surfaced as a badge/signal that reorders outreach priority.** All outbound stays in
the human approve queue. PropStream API/reseller automation and any per-person social
inference remain parked until separately cleared.
