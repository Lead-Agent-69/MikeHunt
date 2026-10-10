# Dealer outreach sources: public dealer lists for lots with no website

Source: Elle's section V audit (regional networks and dealer directories), 2026-10-10.
Full evidence lives outside the repo at `/workspace/mikehunt-audit/regional_networks.md` (section 4)
and `/workspace/mikehunt-audit/regional/`.

**Docs only.** Nothing here is imported, scraped or contacted yet. These are seed lists for a future
manual (phone / mail) outreach workflow to reach lots the crawler can never find because they have no
website. Re-check each list's terms and the state's rules before any import or outreach.

## Usable public lists

| State | List | Format | Size / notes | License / terms |
|---|---|---|---|---|
| CT | DMV Licensed Automobile Dealers and Repairers, data.ct.gov dataset `apne-w8c6` (https://data.ct.gov/Transportation/Licensed-Automobile-Dealers-And-Repairers/apne-w8c6) | CSV / JSON / OData API, weekly | **2,303 used dealers** (of 5,365 rows; also 696 new dealers, 109 recyclers). Name, address, license type, expiry, geocode. No phone | **Public domain** (dataset metadata) |
| RI | DMV Licensed Dealership Listing (https://dmv.ri.gov/media/1/download) | PDF | **405 dealers**. License #, name, address. No phone in the current file | State public document, no license stated |
| ID | ITD "Active Idaho Dealers" (https://apps.itd.idaho.gov/apps/fund/dealer/activeidahodealers.pdf) | PDF | Dealer #, name, address, phone, sales type (fields per search, not all verified) | State public document |
| ME | BMV dealer lists on maine.gov/sos: `Used Car_0.pdf`, `New Car.pdf`, `Recycler.pdf` | PDF | Name, license type, address | Public |
| VT | DMV VD-100 "Vermont Licensed Dealers" (dated 07.31.25) | XLSX | New and used dealers (fields not verified) | Public |
| WY | WYDOT monthly lists: `DEALERS-Web List.xlsx` (e.g. `9-4-26 DEALERS-Web List.xlsx`) and **`SALVAGE YARDS - Web List.xlsx`** | XLSX, monthly | Includes **salvage yards**, unique among these states | Public |
| OK | data.ok.gov "Used Motor Vehicle and Parts Commission Dealer License Search" (+ OUMVDMHC "UD List with Lot Address" PDF) | CSV + PDF | UD / WD / AD license types, lot address | Open data portal |
| WA | Data.WA `4pvz-wrik` "Vehicle and Vessel Dealer Licenses" and `ucdg-xgbj` "DOL Business Licenses Related to the Transportation Industry" | CSV / API | Fields not verified | Open data |

## Restricted or not usable as a list

- **NM**: no public list. MVD records need an IPRA request, and NMSA 14-3-15.1 bars using agency
  computerized databases for a **commercial purpose or for solicitation/advertisement** without written
  approval. Any request must ask for an approved outreach use.
- **MD**: no bulk download. The MVA **sells** a printed dealer book (about $20 pickup / $22 mailed);
  otherwise lookup only.
- **NMIADA** (NM dealer association directory): terms **forbid** automated access and compiling its data
  into a directory or database without written permission. Not harvested.
- **ARA** (Automotive Recyclers Association directory): terms limit use to personal, noncommercial use and
  forbid copying or distributing it. Not harvested.
- Also: WV needs a FOIA request; SC and DE are per-dealer lookups only; MA licenses used-car dealers town
  by town, so there is no statewide list.

## Permission asks (Jonah's call; nothing sent)

- **AutoFunds**: dealer-website platform whose terms ban bots; it runs 9 of the 11 priced CT/RI
  independent sites probed. A permission or feed agreement would unlock most of CT.
- **NMIADA**: written permission to use its member directory (it has website links); the terms name
  `info@nmaia.org`. Best single unlock for NM.

Whether to ask either one, and in what words, is Jonah's decision.
