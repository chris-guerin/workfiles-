# EV charging infrastructure ontology — structural decisions and uncertainties

**Companion to:** `ev_charging.html` (open in browser to navigate)
**Built:** 2026-05-03 (autonomous run)
**Scope:** structural skeleton only — no H1/H2/H3 readings, no personas, no analytical content. Just the taxonomy.

---

## Read this first if you want to understand the shape

The tree is built around the user-proposed five lifecycle phases — **MAKE / BUILD / BUY / USE / MAINTAIN** — with one substantive redefinition (BUY) and one folded-in phase (END-OF-LIFE → MAINTAIN). Eight decisions did the structural work; six places I'm genuinely uncertain.

---

## Structural decisions

### D1. Lifecycle phasing — five phases retained, BUY redefined

Kept MAKE / BUILD / BUY / USE / MAINTAIN. **BUY redefined** as "commercial structures, capital flow, ownership models" rather than transactional procurement moments. Reason: procurement happens at every phase (component sourcing in MAKE, equipment purchase in BUILD, energy purchase ongoing under USE, parts under MAINTAIN), so "Buy" as a transactional category fragments the tree. As a *capital-and-commercial-structure* category — CapEx vs CaaS, public funding, energy procurement contracts, roaming-and-clearing economics — it has a distinct shape that doesn't double-count.

This is the only meaningful divergence from the user's specification. If BUY-as-capital-structures isn't the right framing, the natural alternative is to drop BUY entirely and fold the capital/commercial content into BUILD (CapEx structures) and USE (energy contracts, roaming) — that would give a four-phase tree.

### D2. End-of-life folded into MAINTAIN (5.6), not a sixth phase

Decommissioning, recycling, second-life redeployment all sit under MAINTAIN. Reason: keeps the user-specified 5-phase shape; EOL operationally looks more like long-tail maintain (asset register, service-out, dispose) than a structurally-distinct phase. If you want EOL surfaced as a peer of MAINTAIN, splitting is a one-node change.

### D3. Software is split across phases, not consolidated as a horizontal

Firmware and CSMS *development* live under MAKE (1.4 embedded firmware, 1.5 CSMS/back-office software). Protocol *operation* lives under USE (4.5 OCPP, 4.3 ISO 15118 / DIN 70121 in-session). OTA updates live under MAINTAIN (5.2). The same protocol therefore appears under MAKE (as a stack capability) and USE (as a session-time interaction) — leaves are different.

The alternative was a horizontal "Software" branch sitting alongside the five lifecycle phases. Rejected because it breaks the lifecycle frame the user asked for, and because most signals about charging software (e.g. "OCPP 2.1 ratified", "ChargePoint backend outage") naturally land in either USE or MAINTAIN.

### D4. AC/DC and public/private/depot/home are sub-axes, not top-level

These are real distinctions but they don't generate independent sub-trees — the lifecycle decomposition is the same for AC and DC, with hardware-specific differences appearing under specific leaves (connectors 1.2, grid connection 2.2, power-electronics topologies 1.1.2). Same for public/depot/home: it's a deployment-context distinction that surfaces as parameter shifts at site-selection 2.1 and grid-connection 2.2, not as a top-level branch.

### D5. V2G / V2H / V2L sit under USE 4.3 alongside unidirectional energy delivery

V2X is "what flows during the session" — so it's a USE concern. The hardware enabler (bidirectional inverter) is under MAKE 1.1.2 (power converter topologies). The commercial enabler (FERC 2222 aggregation, grid-services participation) is under BUY 3.3 and USE 4.7. This deliberately scatters V2G across the tree because the technology touches three lifecycle moments. **This is one of my uncertain calls — see U2 below.**

### D6. Cross-cutting tags are flagged but not built out

Each node that's shared with a parallel technology stack carries an `xc:` badge. Ten cross-cutting axes defined: `battery_storage`, `grid_modernisation`, `solar_pv`, `motor_drives`, `traction_drives`, `ot_cybersecurity`, `e_waste`, `retail_payments`, `clean_energy_finance`, `data_telecoms`. Per the user's instruction those parallel ontologies are not built out here — the tags are placeholders for later population.

The biggest cross-cutting cluster is **power electronics** (1.1) — almost every leaf is shared with battery storage, grid modernisation, solar PV inverters, motor drives, and traction drives. When those ontologies are built, expect heavy entity reuse across the full 1.1 sub-tree.

### D7. Depth target — bottoms out where the next level would add zero signal-matching specificity

- **Power electronics** goes to chip family with named vendors: SiC MOSFETs (Wolfspeed C3M, Infineon CoolSiC, ON Semi EliteSiC, ROHM Gen4), GaN HEMTs (Navitas, GaN Systems / Infineon, Transphorm, EPC), Si IGBT (Infineon, Mitsubishi, Fuji, Hitachi). Doesn't go to specific part numbers.
- **Connectors** go to the specific standard (IEC 62196 Type 2, CCS Combo 2, NACS / SAE J3400, MCS / SAE J3271, GB/T 20234.3, CHAdeMO, ChaoJi).
- **Software** goes to the specific protocol version: OCPP 1.6J, OCPP 2.0.1, OCPP 2.1; OCPI 2.1.1, OCPI 2.2.1; ISO 15118-2, ISO 15118-20, DIN 70121; OpenADR 3.0; IEEE 2030.5.
- **Grid connection** goes to LV / MV / HV class with kV thresholds and connection-process leaves (UK G99, US ICA, FERC interconnection).
- **Regulatory** goes to the specific instrument (UK PCPR 2023, EU AFIR Art 5, US NEVI 23 CFR Part 680, US 30C, IRC §45W, BIL).
- **Capital structures** goes to the specific vehicle (NEVI Formula, LEVI, EU CEF-T AFIF, US 30C, LCFS / RTFO credits).

### D8. Library choice — vanilla `<details>` + custom CSS, no CDN dependencies

Chose vanilla `<details>`/`<summary>` over treant.js, d3, jsTree, or any other library because:
1. **Zero CDN dependencies.** The file works offline. Cannot fail because Cloudflare/jsDelivr is having a bad day.
2. **Native browser semantics.** Keyboard accessible (Tab + Enter to expand), screen-reader compatible, no JS errors possible — `<details>` is bulletproof.
3. **Mobile-friendly without a responsive library.**
4. **The tree is fundamentally a hierarchy of expand/collapse nodes — that is exactly what `<details>` represents semantically.**
5. JS is used only for: (a) rendering the tree from the data structure, (b) computing counts on load, (c) handling leaf clicks to populate the detail side panel. ~120 lines total. No frameworks.

Trade-off: I don't get the visual polish of an animated horizontal tree. But the user said "click a node to expand/collapse children, click a leaf to see description and sources" — that's exactly what this gives, and it cannot break.

---

## Where I was genuinely uncertain — these are the places to look at first

### U1. Where does BUY end and BUILD begin?

The buy/build seam is fuzzy. **Procurement of installed chargers** — when a CPO buys 200 chargers from ABB to install at a site — is that a BUY action (transactional) or a BUILD action (it's bundled with the deployment)? My call: equipment procurement is in BUILD 2.4 (hardware install) because the procurement decision is inseparable from the deployment activity; **capital structures and ownership models** are in BUY 3.1 because those persist across many procurement cycles. Possible alternative: pull all procurement (BUILD 2.4 + parts in MAINTAIN 5.3) into a unified BUY-procurement subtree. I rejected that because it splinters BUILD.

### U2. V2G is scattered — should it be consolidated?

V2G touches MAKE 1.1.2 (bidirectional inverter topology), MAKE 1.4 (firmware support for ISO 15118-20), USE 4.3.5 (V2G energy flow during session), USE 4.3.6 (bidirectional inverter operation), USE 4.7 (grid services participation), BUY 3.3.4 (demand response participation), BUY 3.4.4 (Plug & Charge PKI for V2G commercial), BUILD 2.2.6 (DER integration). I left it scattered for analytical purity (V2G *is* a multi-phase technology), but signals about V2G will need to fan out across multiple branches when used. The alternative was a top-level V2G branch alongside MAKE/BUILD/BUY/USE/MAINTAIN — clean for V2G signals, but breaks the lifecycle frame.

### U3. Cybersecurity is split between MAKE 1.4.4 (primitives) and MAINTAIN 5.4 (operations)

Same problem as software (D3). Could be a horizontal cluster instead. I kept it lifecycle-anchored to be consistent with the software treatment. If signals about charging cybersecurity behave more like a single-cluster topic (e.g. "ENISA publishes EVSE security guidance" lands at neither MAKE nor MAINTAIN cleanly), this should be promoted to a horizontal.

### U4. Depot/fleet is not its own branch

Fleet and depot charging share the same hardware/software/grid mechanics as public DC, just at different scale. I refused to make depot/fleet a top-level branch. Where it's structurally different — overnight depot at MV connection, MCS for trucks at HV, fleet-specific OCPP operations like AuthorizeRemoteTxRequests — those surface as specific leaves under existing branches. **If fleet emerges as a primary signal-matching axis (e.g. truck depots are a separate market with separate hypothesis), this decision should reverse.**

### U5. Wireless / inductive charging (SAE J2954, IEC 61980)

Currently treated as a leaf under MAKE 1.2 (connector & cable assemblies — wireless is the alternative to a connector). Could legitimately be promoted to a peer of conductive charging at top of MAKE. Signal volume on wireless is currently low (commercial deployments minimal); if this changes, promote.

### U6. Roaming sits in two places — BUY 3.4 (commercial structures) and USE 4.4/4.5 (clearing protocols at session time)

Same scatter pattern as V2G. The Hubject roaming hub appears as a commercial party (BUY 3.4.2) and as a protocol target (USE 4.5.3). I kept the split because the commercial agreement and the technical protocol are different things signal-wise (a commercial signal is "Hubject and Gireve sign hub-to-hub agreement"; a technical signal is "OICP 2.3 published"). If roaming is a primary signal-matching cluster for the analyst, consolidate.

---

## What this ontology is NOT (per user instruction)

- No H1/H2/H3 readings (those come later).
- No personas / value statements / replacement cycles.
- No commercial sizing or market estimates per leaf.
- No analytical content beyond what's needed for a one-line description.

The job here was the structural skeleton. Analysis hangs off this in a separate stage.

---

## Counts (also rendered live in the HTML page)

See the Counts panel at the top of `ev_charging.html` — it computes nodes / leaves / deepest path / cross-cutting tags from the data structure on page load, so the numbers are always live and don't drift.

---

## Sources used

Citation registry of ~60 references covering: standards bodies (IEC, ISO, SAE, IEEE, DIN, GB/T, NFPA, UL, BS, MID, OIML), industry alliances (Open Charge Alliance, EVRoaming, Hubject, CharIN, CHAdeMO), regulatory frameworks (EU AFIR, UK PCPR 2023, US NEVI / 23 CFR Part 680, US 30C, IRA, BIL, FERC orders, EU WEEE, EU MID), patent classifications (CPC B60L 53, H02J 7, H02J 50, G06Q 50/06), industry data (IEA Global EV Outlook, BloombergNEF, IRENA, US DOE AFDC), security frameworks (NIST IR 8473, NIST SP 800-82, ENISA EVSE), and accessibility/codes (US ADA, UK BS 7671, IET COP, NFPA 70 / NEC Article 625, UK ENA G98/G99). Each leaf cites at least one. URLs included where applicable; full registry rendered in the page footer.

---

## Sanity checks performed before commit

- Tree renders to nested `<details>` without any orphan or duplicate IDs.
- Every leaf has at least one source ID and a description.
- Counts panel computes from the live data structure (not hardcoded).
- No external dependencies (no CDN, no font, no library).
- File opens locally (file://) and renders in a modern browser.
- Mobile breakpoint at 768px collapses side-panel below tree.
