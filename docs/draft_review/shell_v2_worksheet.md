# Shell v2 catalogue — worksheet view

**Generated:** 2026-05-04T08:06:41.028Z
**Source:** read-only query of `/components_with_full_record?company_id=4` joined to `/component_attributes?component_id=X` for each component (the view aggregates value/source/confidence/status but not `not_in_source_reason` or `not_applicable_reason`, so the per-component fetch fills those in).
**Company:** Shell (id=4, sector=energy) — Royal Dutch Shell plc. v2 catalogue first-cut population from March 2026 brief.
**Schema:** PG `hypothesis-db` v7.0 (post migration 006)

## Headline counts

| | Count |
|---|---:|
| Initiatives | **9** |
| Components | **29** |
| Component attributes | **356** |
| &nbsp;&nbsp;populated (🟢) | 99 |
| &nbsp;&nbsp;not_in_source (🟡) | 257 |
| &nbsp;&nbsp;not_applicable (⚪) | 0 |

## Reading the worksheet

Each initiative is a top-level section. Under each initiative, each component is a sub-section showing one row per attribute. Rows show `#` (display_order), attribute name + label, status (🟢 populated · 🟡 not_in_source · ⚪ not_applicable), value cell (the value if populated, em-dash if not), source-or-reason cell (citation if populated; `NIS:` reason if not_in_source; `NA:` reason if not_applicable), and confidence band on populated rows. Tech_function attributes show the controlled-vocab function name in backticks; if the underlying tech_function has a description it can be read from `/tech_functions`. Time horizons, baseline confidence, and persona are shown in the initiative header.

---

## 1. NW European LNG portfolio dominance and EBITDA leadership

**Horizon:** H1 · **Persona:** strategy · **Year:** 2028 · **Baseline confidence:** 0.550 · **Status:** `draft_unreviewed`

> **Hypothesis:** Shell's LNG portfolio will deliver more than 45% of group EBITDA by 2028, contingent on European import infrastructure expansion, sustained gas price floor, long-term offtake commitments, and EU regulatory permissibility for re-export operations.

**Why it matters:** LNG performance is the single largest determinant of Shell's 2025-2028 cash generation envelope and dividend cover.

**Strategy context:** Integrated Gas — Shell's historic core franchise; ~40% of group EBITDA in 2024-25 with intent to extend.

**Brief description:** LNG portfolio with European import re-export trading and Asia-Pacific long-term offtake.

**Decision threshold:** >45% of group EBITDA from Integrated Gas / LNG portfolio in 2028 reporting

**Time horizon source:** Brief HYP SH-01 + brief Section 02

### 1.1 GLOBAL_LNG_DEMAND_TRAJECTORY

**Type:** `market` · **Vector:** `market` · **Cross-industry:** ✗ no

**Description:** Global LNG demand structure and trajectory; ~400 Mtpa in 2025 with European recovery and Asia-Pacific growth.

**Source citation:** Shell brief Section 02 (Strategy — LNG core engine); brief HYP SH-01

_Resolution: 🟢 4 populated · 🟡 8 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **market_size**<br><sub>Market size</sub> | 🟢 populated | ~400 Mtpa global LNG trade 2025; Asia-Pacific ~270 Mtpa | Shell brief Section 02 + HYP SH-01 | high |
| 2 | **cagr**<br><sub>CAGR</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 3 | **price_elasticity**<br><sub>Price elasticity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **demand_certainty**<br><sub>Demand certainty</sub> | 🟢 populated | high — Europe demand structurally restored post Russian-pipeline; Asia growing | Shell brief Section 02 | med |
| 5 | **offtake_structure**<br><sub>Offtake structure</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 6 | **contract_maturity**<br><sub>Contract maturity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **geographic_spread**<br><sub>Geographic spread</sub> | 🟢 populated | global with concentration in NW Europe, NE Asia, S Asia | Shell brief Section 02 | high |
| 8 | **segment_fragmentation**<br><sub>Segment fragmentation</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **switching_cost**<br><sub>Switching cost</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **substitute_threat**<br><sub>Substitute threat</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **channel_control**<br><sub>Channel control</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **subsidy_dependency**<br><sub>Subsidy dependency</sub> | 🟢 populated | 0 pct | LNG demand is not subsidy-driven; cost-of-energy-arbitrage market | high |

### 1.2 EU_LNG_IMPORT_INFRASTRUCTURE

**Type:** `ecosystem` · **Vector:** `ecosystem` · **Cross-industry:** ✗ no

**Description:** EU LNG import terminal and FSRU capacity build, ~190 bcm/yr 2025 expanding through new German FSRU + Mediterranean.

**Source citation:** Shell brief HYP SH-01 WNTBT

_Resolution: 🟢 3 populated · 🟡 9 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **infrastructure_readiness**<br><sub>Infrastructure readiness</sub> | 🟢 populated | high — ~190 bcm/yr installed; pipeline of German FSRU + Mediterranean terminals on track | Shell brief HYP SH-01 WNTBT | med |
| 2 | **standards_maturity**<br><sub>Standards maturity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 3 | **interoperability**<br><sub>Interoperability</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **partner_concentration**<br><sub>Partner concentration</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 5 | **capital_intensity**<br><sub>Capital intensity</sub> | 🟢 populated | multi-€bn per terminal; total EU build envelope >€20bn | Shell brief HYP SH-01 WNTBT | low |
| 6 | **talent_availability**<br><sub>Talent availability</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **supply_chain_depth**<br><sub>Supply chain depth</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **platform_effects**<br><sub>Platform effects</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **institutional_support**<br><sub>Institutional support</sub> | 🟢 populated | strong — REPowerEU framework + member-state co-financing | Shell brief Section 02 + HYP SH-01 | med |
| 10 | **collaboration_density**<br><sub>Collaboration density</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **geographic_clustering**<br><sub>Geographic clustering</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **lock_in_risk**<br><sub>Lock-in risk</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |

### 1.3 GAS_PRICE_FLOOR_TTF

**Type:** `market` · **Vector:** `market` · **Cross-industry:** ✗ no

**Description:** European TTF gas price floor; sustained pricing >$6/MMBtu protects LNG netback margin.

**Source citation:** Shell brief HYP SH-01 WNTBT

_Resolution: 🟢 3 populated · 🟡 9 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **market_size**<br><sub>Market size</sub> | 🟢 populated | TTF $8-12/MMBtu through 2025 | Shell brief HYP SH-01 | high |
| 2 | **cagr**<br><sub>CAGR</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 3 | **price_elasticity**<br><sub>Price elasticity</sub> | 🟢 populated | moderate — gas demand reasonably inelastic at industrial users; high at power-substitution margin | Shell brief HYP SH-01 | low |
| 4 | **demand_certainty**<br><sub>Demand certainty</sub> | 🟢 populated | moderate — Europe demand structural but weather/electricity-mix dependent | Shell brief HYP SH-01 | med |
| 5 | **offtake_structure**<br><sub>Offtake structure</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 6 | **contract_maturity**<br><sub>Contract maturity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **geographic_spread**<br><sub>Geographic spread</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **segment_fragmentation**<br><sub>Segment fragmentation</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **switching_cost**<br><sub>Switching cost</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **substitute_threat**<br><sub>Substitute threat</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **channel_control**<br><sub>Channel control</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **subsidy_dependency**<br><sub>Subsidy dependency</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |

### 1.4 EU_GAS_REGULATORY_FRAMEWORK

**Type:** `regulation` · **Vector:** `regulation` · **Cross-industry:** ✗ no

**Description:** EU gas import + re-export regulatory permissibility for LNG operations.

**Source citation:** Shell brief HYP SH-01 WNTBT + system drivers

_Resolution: 🟢 4 populated · 🟡 8 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **regulation_stage**<br><sub>Regulation stage</sub> | 🟢 populated | `in_force` | Shell brief HYP SH-01 | high |
| 2 | **enforcement**<br><sub>Enforcement strength</sub> | 🟢 populated | `strong` | Shell brief HYP SH-01 | med |
| 3 | **jurisdictional_reach**<br><sub>Jurisdictional reach</sub> | 🟢 populated | EU-27 + UK aligned | Shell brief HYP SH-01 | med |
| 4 | **implementation_progress**<br><sub>Implementation progress</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 5 | **political_durability**<br><sub>Political durability</sub> | 🟢 populated | moderate-to-strong currently; political risk if energy-security politics shift toward import quotas / re-export controls | Shell brief HYP SH-01 system drivers | med |
| 6 | **grandfather_clauses**<br><sub>Grandfather clauses</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **compliance_cost**<br><sub>Compliance cost</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **audit_cadence**<br><sub>Audit cadence</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **precedent_strength**<br><sub>Precedent strength</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **harmonisation**<br><sub>Harmonisation</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **sunset_risk**<br><sub>Sunset risk</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **judicial_exposure**<br><sub>Judicial exposure</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |

### 1.5 NORTH_AMERICAN_LNG_OVERSUPPLY

**Type:** `market` · **Vector:** `market` · **Cross-industry:** ✗ no

**Description:** US LNG export capacity expansion as portfolio threat — multiple mega-projects in construction.

**Source citation:** Shell brief Section 02 (peer landscape)

_Resolution: 🟢 2 populated · 🟡 10 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **market_size**<br><sub>Market size</sub> | 🟢 populated | US export capacity >100 Mtpa operational by 2026; multiple mega-projects pre/in FID | Shell brief Section 02 | high |
| 2 | **cagr**<br><sub>CAGR</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 3 | **price_elasticity**<br><sub>Price elasticity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **demand_certainty**<br><sub>Demand certainty</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 5 | **offtake_structure**<br><sub>Offtake structure</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 6 | **contract_maturity**<br><sub>Contract maturity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **geographic_spread**<br><sub>Geographic spread</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **segment_fragmentation**<br><sub>Segment fragmentation</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **switching_cost**<br><sub>Switching cost</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **substitute_threat**<br><sub>Substitute threat</sub> | 🟢 populated | high — US LNG is direct substitute for Shell-marketed volumes on price | Shell brief Section 02 | med |
| 11 | **channel_control**<br><sub>Channel control</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **subsidy_dependency**<br><sub>Subsidy dependency</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |

---

## 2. Industrial CCUS services leadership (Quest + Northern Lights)

**Horizon:** H2 · **Persona:** strategy · **Year:** 2030 · **Baseline confidence:** 0.450 · **Status:** `draft_unreviewed`

> **Hypothesis:** Shell's selective CCUS investment will position it as the leading IOC in industrial decarbonisation services by 2030, generating more than $2bn annually, contingent on capture chemistry maturation, US/EU policy continuity, third-party customer pipeline conversion, and sustained capital deployment.

**Why it matters:** CCUS is Shell's clearest differentiated transition position vs IOC peers and a non-LNG growth lever.

**Strategy context:** Renewables & Energy Solutions — selective CCUS investment positioning for IOC services leadership.

**Brief description:** Quest (Alberta operational since 2015) + Northern Lights (Norway commissioning 2024) + capture-as-a-service offerings.

**Decision threshold:** >$2bn annual revenue from industrial CCUS services by 2030

**Time horizon source:** Brief HYP SH-02 + Section 04

### 2.1 INDUSTRIAL_CCUS_CAPTURE_TECH

**Type:** `tech` · **Vector:** `tech` · **Cross-industry:** ✓ yes

**Description:** Industrial post-combustion CO2 capture (amine, membrane, oxy-combustion) at scale — Shell Quest tech baseline.

**Source citation:** Shell brief Section 04 (Quest); HYP SH-02; brief Section 06 S-04

_Resolution: 🟢 4 populated · 🟡 9 not_in_source · ⚪ 0 not_applicable (of 13 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **tech_function**<br><sub>Tech function</sub> | 🟢 populated | `industrial_post_combustion_co2_capture` | Shell brief Section 04 (Quest description) | high |
| 2 | **trl**<br><sub>Technology readiness level</sub> | 🟢 populated | `8` | Quest operational since 2015 + Northern Lights commissioning 2024 — brief Section 04 | high |
| 3 | **ttm_months**<br><sub>Time to market</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **cost_trajectory**<br><sub>Cost trajectory</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 5 | **velocity_pct_yoy**<br><sub>Velocity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 6 | **scale_up_factor**<br><sub>Scale-up factor</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **patent_density**<br><sub>Patent density</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **supply_concentration**<br><sub>Supply concentration</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **capex_intensity**<br><sub>CAPEX intensity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **opex_trajectory**<br><sub>OPEX trajectory</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **substitution_risk**<br><sub>Substitution risk</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **obsolescence_horizon**<br><sub>Obsolescence horizon</sub> | 🟢 populated | 25 years | Quest design life implies ~25y for current capture-tech generation | low |
| 13 | **incumbency_depth**<br><sub>Incumbency depth</sub> | 🟢 populated | moderate — Shell Quest, Equinor Sleipner, ExxonMobil LaBarge are long-running ops; CCS tech vendors include Aker Carbon Capture, Mitsubishi MHI, Carbon Engineering | Shell brief Section 06 S-04 | med |

### 2.2 US_45Q_TAX_CREDIT

**Type:** `regulation` · **Vector:** `regulation` · **Cross-industry:** ✓ yes

**Description:** US 45Q tax credit for CCS — $85/t for industrial; political durability is the decisive variable.

**Source citation:** Shell brief Section 04 + HYP SH-02 system drivers

_Resolution: 🟢 5 populated · 🟡 7 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **regulation_stage**<br><sub>Regulation stage</sub> | 🟢 populated | `in_force` | Shell brief Section 04 | high |
| 2 | **enforcement**<br><sub>Enforcement strength</sub> | 🟢 populated | `strong` | Shell brief HYP SH-02 | med |
| 3 | **jurisdictional_reach**<br><sub>Jurisdictional reach</sub> | 🟢 populated | US federal — applies nationally | Shell brief Section 04 | high |
| 4 | **implementation_progress**<br><sub>Implementation progress</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 5 | **political_durability**<br><sub>Political durability</sub> | 🟢 populated | weak-to-moderate — IRA-linked, vulnerable to administration change | Shell brief HYP SH-02 system drivers | med |
| 6 | **grandfather_clauses**<br><sub>Grandfather clauses</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **compliance_cost**<br><sub>Compliance cost</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **audit_cadence**<br><sub>Audit cadence</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **precedent_strength**<br><sub>Precedent strength</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **harmonisation**<br><sub>Harmonisation</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **sunset_risk**<br><sub>Sunset risk</sub> | 🟢 populated | material — IRA repeal scenarios under active discussion in US politics | Shell brief HYP SH-02 system drivers | med |
| 12 | **judicial_exposure**<br><sub>Judicial exposure</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |

### 2.3 NORTH_SEA_CO2_STORAGE_CAPACITY

**Type:** `ecosystem` · **Vector:** `ecosystem` · **Cross-industry:** ✗ no

**Description:** North Sea geological CO2 storage capacity — Northern Lights, Endurance, others.

**Source citation:** Shell brief Section 04 (Northern Lights)

_Resolution: 🟢 4 populated · 🟡 8 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **infrastructure_readiness**<br><sub>Infrastructure readiness</sub> | 🟢 populated | moderate-to-high — Northern Lights operational 2024; multiple licences awarded across Norwegian + UK Continental Shelf | Shell brief Section 04 | med |
| 2 | **standards_maturity**<br><sub>Standards maturity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 3 | **interoperability**<br><sub>Interoperability</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **partner_concentration**<br><sub>Partner concentration</sub> | 🟢 populated | count: 3-5 major operators (Equinor, Shell, TotalEnergies, BP, Harbour); high concentration | Shell brief Section 04 | med |
| 5 | **capital_intensity**<br><sub>Capital intensity</sub> | 🟢 populated | Northern Lights total ~$2.6bn for 1.5 Mtpa Phase 1; multi-€bn for portfolio scale | Shell brief Section 04 | low |
| 6 | **talent_availability**<br><sub>Talent availability</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **supply_chain_depth**<br><sub>Supply chain depth</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **platform_effects**<br><sub>Platform effects</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **institutional_support**<br><sub>Institutional support</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **collaboration_density**<br><sub>Collaboration density</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **geographic_clustering**<br><sub>Geographic clustering</sub> | 🟢 populated | North Sea — Norway + UK + Netherlands | Shell brief Section 04 | high |
| 12 | **lock_in_risk**<br><sub>Lock-in risk</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |

### 2.4 INDUSTRIAL_DECARBONISATION_SERVICES_DEMAND

**Type:** `market` · **Vector:** `market` · **Cross-industry:** ✓ yes

**Description:** Industrial-customer demand for CCUS-as-a-service — refineries, cement, steel, ammonia.

**Source citation:** Shell brief Section 04 + Section 06 S-04 (CCaaS signal)

_Resolution: 🟢 3 populated · 🟡 9 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **market_size**<br><sub>Market size</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 2 | **cagr**<br><sub>CAGR</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 3 | **price_elasticity**<br><sub>Price elasticity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **demand_certainty**<br><sub>Demand certainty</sub> | 🟢 populated | moderate — strong commercial discussions but binding contracts conversion has lagged announcements | Shell brief Section 06 S-04 | med |
| 5 | **offtake_structure**<br><sub>Offtake structure</sub> | 🟢 populated | `long_term_contract` | Shell brief Section 04 — typically 10-15y service agreements | med |
| 6 | **contract_maturity**<br><sub>Contract maturity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **geographic_spread**<br><sub>Geographic spread</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **segment_fragmentation**<br><sub>Segment fragmentation</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **switching_cost**<br><sub>Switching cost</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **substitute_threat**<br><sub>Substitute threat</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **channel_control**<br><sub>Channel control</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **subsidy_dependency**<br><sub>Subsidy dependency</sub> | 🟢 populated | 80 pct | Shell brief Section 06 S-04 — Highly subsidy-dependent — without 45Q / EU ETS / UK CCUS contracts demand collapses | med |

---

## 3. Shell Recharge EV charging network as retail energy anchor

**Horizon:** H1 · **Persona:** operations · **Year:** 2028 · **Baseline confidence:** 0.500 · **Status:** `draft_unreviewed`

> **Hypothesis:** Shell's EV charging network (Shell Recharge) will reach EBIT-positive operations across European primary markets by 2028, contingent on BEV fleet penetration, fast-charger utilisation rates, and continued capex cost-down on hardware.

**Why it matters:** Recharge is the single retail-energy bet Shell has explicitly retained as strategic; first credible IOC public-charging franchise.

**Strategy context:** Mobility — Shell Recharge as retained strategic EV charging franchise.

**Brief description:** EV public DC charging at Shell sites + on-street + workplace; ~500k charge points target globally.

**Decision threshold:** Shell Recharge European operations turn EBIT-positive at network level by 2028 reporting

**Time horizon source:** Brief Section 04

### 3.1 EV_PUBLIC_CHARGING_DEMAND

**Type:** `market` · **Vector:** `market` · **Cross-industry:** ✓ yes

**Description:** European public EV charging demand — utilisation rates, dwell times, fleet share.

**Source citation:** Shell brief Section 04 (Shell Recharge); Section 02 retail energy framing

_Resolution: 🟢 2 populated · 🟡 10 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **market_size**<br><sub>Market size</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 2 | **cagr**<br><sub>CAGR</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 3 | **price_elasticity**<br><sub>Price elasticity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **demand_certainty**<br><sub>Demand certainty</sub> | 🟢 populated | moderate-to-high — EU mandated AFIR site density forces demand floor | Shell brief Section 02 | med |
| 5 | **offtake_structure**<br><sub>Offtake structure</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 6 | **contract_maturity**<br><sub>Contract maturity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **geographic_spread**<br><sub>Geographic spread</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **segment_fragmentation**<br><sub>Segment fragmentation</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **switching_cost**<br><sub>Switching cost</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **substitute_threat**<br><sub>Substitute threat</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **channel_control**<br><sub>Channel control</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **subsidy_dependency**<br><sub>Subsidy dependency</sub> | 🟢 populated | 40 pct | Shell brief Section 02 — BEV fleet penetration partially policy-driven (EU 2035 ICE ban, fleet electrification mandates) | low |

### 3.2 BEV_FLEET_PENETRATION_EUROPE

**Type:** `market` · **Vector:** `market` · **Cross-industry:** ✓ yes

**Description:** European BEV penetration of new car sales + parc — drives addressable charging market.

**Source citation:** Shell brief Section 02 (Power transition)

_Resolution: 🟢 3 populated · 🟡 9 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **market_size**<br><sub>Market size</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 2 | **cagr**<br><sub>CAGR</sub> | 🟢 populated | 15 pct_per_year | Shell brief Section 02 + IEA-class ranges — European BEV new-sales share approximately doubling 2-3 years across primary markets | low |
| 3 | **price_elasticity**<br><sub>Price elasticity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **demand_certainty**<br><sub>Demand certainty</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 5 | **offtake_structure**<br><sub>Offtake structure</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 6 | **contract_maturity**<br><sub>Contract maturity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **geographic_spread**<br><sub>Geographic spread</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **segment_fragmentation**<br><sub>Segment fragmentation</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **switching_cost**<br><sub>Switching cost</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **substitute_threat**<br><sub>Substitute threat</sub> | 🟢 populated | moderate — H2 cars + e-fuels remain niche; no near-term substitute to BEV mass-market | Shell brief Section 02 | med |
| 11 | **channel_control**<br><sub>Channel control</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **subsidy_dependency**<br><sub>Subsidy dependency</sub> | 🟢 populated | 60 pct | Shell brief Section 02 — BEV economics still policy-shaped — EU 2035 ICE ban + national incentives | med |

### 3.3 EV_CHARGING_HARDWARE_CAPEX

**Type:** `tech` · **Vector:** `tech` · **Cross-industry:** ✓ yes

**Description:** DC fast-charger hardware capex curve — installed cost per port for 150-350 kW units.

**Source citation:** Shell brief Section 04 (Recharge); Section 02 (Power transition)

_Resolution: 🟢 4 populated · 🟡 9 not_in_source · ⚪ 0 not_applicable (of 13 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **tech_function**<br><sub>Tech function</sub> | 🟢 populated | `fast_ev_charging_dc` | Shell brief Section 04 | high |
| 2 | **trl**<br><sub>Technology readiness level</sub> | 🟢 populated | `9` | Mass-deployed at commercial scale | high |
| 3 | **ttm_months**<br><sub>Time to market</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **cost_trajectory**<br><sub>Cost trajectory</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 5 | **velocity_pct_yoy**<br><sub>Velocity</sub> | 🟢 populated | -7 pct_per_year | Shell brief Section 02 + ev_charging.html ontology — Hardware capex declining ~5-10% YoY per industry consensus | low |
| 6 | **scale_up_factor**<br><sub>Scale-up factor</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **patent_density**<br><sub>Patent density</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **supply_concentration**<br><sub>Supply concentration</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **capex_intensity**<br><sub>CAPEX intensity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **opex_trajectory**<br><sub>OPEX trajectory</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **substitution_risk**<br><sub>Substitution risk</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **obsolescence_horizon**<br><sub>Obsolescence horizon</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 13 | **incumbency_depth**<br><sub>Incumbency depth</sub> | 🟢 populated | high — ABB, Tritium, BTC Power, Wallbox, Alpitronic, Kempower; commoditising | Industry knowledge documented in /docs/ontology/ev_charging.html | med |

---

## 4. Brazil deepwater portfolio sustained as cash flow pillar

**Horizon:** H1 · **Persona:** strategy · **Year:** 2030 · **Baseline confidence:** 0.600 · **Status:** `draft_unreviewed`

> **Hypothesis:** Shell's Brazilian deepwater portfolio (Lula-area, 25% stake) sustains as a cash flow pillar through 2030, contingent on Brazilian fiscal regime stability, deepwater unit-economics holding, and Brent price support.

**Why it matters:** Highest-margin upstream asset class for Shell; low-CI barrels provide transition-credible production base.

**Strategy context:** Upstream — Shell's Brazilian deepwater (Lula-area, 25% stake) as 2030 sustaining-bet.

**Brief description:** Lula and adjacent fields; mature operational asset providing low-CI/bbl barrels.

**Decision threshold:** Lula-area share of Shell upstream EBITDA stays >15% through 2028

**Time horizon source:** Brief Section 04

### 4.1 DEEPWATER_PRODUCTION_ECONOMICS

**Type:** `tech` · **Vector:** `tech` · **Cross-industry:** ✗ no

**Description:** Subsea deepwater oil production unit economics — break-even cost per barrel for Lula-area Shell volumes.

**Source citation:** Shell brief Section 04 (Lula Field)

_Resolution: 🟢 4 populated · 🟡 9 not_in_source · ⚪ 0 not_applicable (of 13 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **tech_function**<br><sub>Tech function</sub> | 🟢 populated | `deepwater_oil_production` | Shell brief Section 04 | high |
| 2 | **trl**<br><sub>Technology readiness level</sub> | 🟢 populated | `9` | Operational at commercial scale; mature asset | high |
| 3 | **ttm_months**<br><sub>Time to market</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **cost_trajectory**<br><sub>Cost trajectory</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 5 | **velocity_pct_yoy**<br><sub>Velocity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 6 | **scale_up_factor**<br><sub>Scale-up factor</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **patent_density**<br><sub>Patent density</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **supply_concentration**<br><sub>Supply concentration</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **capex_intensity**<br><sub>CAPEX intensity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **opex_trajectory**<br><sub>OPEX trajectory</sub> | 🟢 populated | Lula-area opex below long-term average; brief frames as "low-CI" advantage | Shell brief Section 04 | med |
| 11 | **substitution_risk**<br><sub>Substitution risk</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **obsolescence_horizon**<br><sub>Obsolescence horizon</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 13 | **incumbency_depth**<br><sub>Incumbency depth</sub> | 🟢 populated | moderate — Petrobras-led pre-salt; Shell + Equinor + ExxonMobil + TotalEnergies are partners | Shell brief Section 04 | high |

### 4.2 BRAZIL_DEEPWATER_REGULATORY_REGIME

**Type:** `regulation` · **Vector:** `regulation` · **Cross-industry:** ✗ no

**Description:** Brazilian fiscal + regulatory framework for pre-salt deepwater; Petrobras-led production-sharing model.

**Source citation:** Shell brief Section 04

_Resolution: 🟢 4 populated · 🟡 8 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **regulation_stage**<br><sub>Regulation stage</sub> | 🟢 populated | `in_force` | Shell brief Section 04 | high |
| 2 | **enforcement**<br><sub>Enforcement strength</sub> | 🟢 populated | `strong` | Shell brief Section 04 | med |
| 3 | **jurisdictional_reach**<br><sub>Jurisdictional reach</sub> | 🟢 populated | Brazilian federal — pre-salt area | Shell brief Section 04 | high |
| 4 | **implementation_progress**<br><sub>Implementation progress</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 5 | **political_durability**<br><sub>Political durability</sub> | 🟢 populated | moderate — Brazil fiscal regime has been stable but executive elections drive periodic uncertainty | Shell brief Section 04 | med |
| 6 | **grandfather_clauses**<br><sub>Grandfather clauses</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **compliance_cost**<br><sub>Compliance cost</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **audit_cadence**<br><sub>Audit cadence</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **precedent_strength**<br><sub>Precedent strength</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **harmonisation**<br><sub>Harmonisation</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **sunset_risk**<br><sub>Sunset risk</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **judicial_exposure**<br><sub>Judicial exposure</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |

### 4.3 OIL_PRICE_BRENT

**Type:** `market` · **Vector:** `market` · **Cross-industry:** ✓ yes

**Description:** Brent crude oil price as commodity floor for deepwater economics.

**Source citation:** Shell brief Section 05 outlook

_Resolution: 🟢 2 populated · 🟡 10 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **market_size**<br><sub>Market size</sub> | 🟢 populated | Brent ~$70-85/bbl 2025; Shell brief Section 05 implies $60-80 range planning | Shell brief Section 05 | med |
| 2 | **cagr**<br><sub>CAGR</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 3 | **price_elasticity**<br><sub>Price elasticity</sub> | 🟢 populated | low at industrial/transport users; high at marginal oil-substitution decisions | Shell brief Section 05 | low |
| 4 | **demand_certainty**<br><sub>Demand certainty</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 5 | **offtake_structure**<br><sub>Offtake structure</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 6 | **contract_maturity**<br><sub>Contract maturity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **geographic_spread**<br><sub>Geographic spread</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **segment_fragmentation**<br><sub>Segment fragmentation</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **switching_cost**<br><sub>Switching cost</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **substitute_threat**<br><sub>Substitute threat</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **channel_control**<br><sub>Channel control</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **subsidy_dependency**<br><sub>Subsidy dependency</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |

---

## 5. Sustainable aviation fuel (SAF) portfolio scaling toward 2030 mandate

**Horizon:** H2 · **Persona:** strategy · **Year:** 2030 · **Baseline confidence:** 0.400 · **Status:** `draft_unreviewed`

> **Hypothesis:** Shell's SAF and biofuels portfolio will reach 10% of aviation fuel volume by 2030, contingent on EU SAF mandate continuity, airline offtake commitment growth, blending infrastructure capex execution, and IOC capital discipline pressure not forcing exit.

**Why it matters:** SAF is the only available aviation decarbonisation lever pre-2035; EU mandate creates a large sub-market.

**Strategy context:** Mobility / Renewables & Energy Solutions — SAF portfolio as transition fuel position.

**Brief description:** HEFA + co-processing routes; airline offtake; EU SAF mandate framework.

**Decision threshold:** Shell SAF/biofuels reach >=10% of aviation fuel volumes sold by 2030

**Time horizon source:** Brief Section 04 + HYP SH-03

### 5.1 EU_SAF_MANDATE

**Type:** `regulation` · **Vector:** `regulation` · **Cross-industry:** ✗ no

**Description:** EU ReFuelEU Aviation SAF mandate — escalating blending percentage 2025-2050.

**Source citation:** Shell brief Section 04 (SAF — Sustainable Aviation Fuel)

_Resolution: 🟢 5 populated · 🟡 7 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **regulation_stage**<br><sub>Regulation stage</sub> | 🟢 populated | `in_force` | Shell brief Section 04 | high |
| 2 | **enforcement**<br><sub>Enforcement strength</sub> | 🟢 populated | `strong` | Shell brief Section 04 | med |
| 3 | **jurisdictional_reach**<br><sub>Jurisdictional reach</sub> | 🟢 populated | EU-27 + UK aligning | Shell brief Section 04 | high |
| 4 | **implementation_progress**<br><sub>Implementation progress</sub> | 🟢 populated | 30 pct | Shell brief Section 04 — Mandate phase-in started 2025 at 2%; escalating to 6% by 2030 | med |
| 5 | **political_durability**<br><sub>Political durability</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 6 | **grandfather_clauses**<br><sub>Grandfather clauses</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **compliance_cost**<br><sub>Compliance cost</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **audit_cadence**<br><sub>Audit cadence</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **precedent_strength**<br><sub>Precedent strength</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **harmonisation**<br><sub>Harmonisation</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **sunset_risk**<br><sub>Sunset risk</sub> | 🟢 populated | low-to-moderate — mandate codified through 2050 but blend percentages reviewable | Shell brief Section 04 | med |
| 12 | **judicial_exposure**<br><sub>Judicial exposure</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |

### 5.2 SAF_BLENDING_INFRASTRUCTURE

**Type:** `tech` · **Vector:** `tech` · **Cross-industry:** ✗ no

**Description:** Airport-side SAF blending and supply infrastructure — terminals, into-plane fuelling, ASTM-approved blends.

**Source citation:** Shell brief Section 04

_Resolution: 🟢 3 populated · 🟡 10 not_in_source · ⚪ 0 not_applicable (of 13 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **tech_function**<br><sub>Tech function</sub> | 🟢 populated | `saf_blending_and_co_processing` | Shell brief Section 04 | high |
| 2 | **trl**<br><sub>Technology readiness level</sub> | 🟢 populated | `8` | Co-processing operational; HEFA mature; ATJ commercialising | med |
| 3 | **ttm_months**<br><sub>Time to market</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **cost_trajectory**<br><sub>Cost trajectory</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 5 | **velocity_pct_yoy**<br><sub>Velocity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 6 | **scale_up_factor**<br><sub>Scale-up factor</sub> | 🟢 populated | 0.05 multiplier | Shell brief Section 04 — Current SAF supply ~0.5% of jet fuel; need ~10x scale to hit 2030 target | low |
| 7 | **patent_density**<br><sub>Patent density</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **supply_concentration**<br><sub>Supply concentration</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **capex_intensity**<br><sub>CAPEX intensity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **opex_trajectory**<br><sub>OPEX trajectory</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **substitution_risk**<br><sub>Substitution risk</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **obsolescence_horizon**<br><sub>Obsolescence horizon</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 13 | **incumbency_depth**<br><sub>Incumbency depth</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |

### 5.3 IOC_CAPITAL_DISCIPLINE_PRESSURE

**Type:** `market` · **Vector:** `market` · **Cross-industry:** ✓ yes

**Description:** IOC peer capital-discipline pressure — investor expectation that IOCs stay disciplined on transition capex.

**Source citation:** Shell brief HYP SH-03 (counter-hypothesis predicting Shell biofuels exit)

_Resolution: 🟢 2 populated · 🟡 10 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **market_size**<br><sub>Market size</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 2 | **cagr**<br><sub>CAGR</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 3 | **price_elasticity**<br><sub>Price elasticity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **demand_certainty**<br><sub>Demand certainty</sub> | 🟢 populated | high pressure from investor base for IOC capital discipline | Shell brief HYP SH-03 | med |
| 5 | **offtake_structure**<br><sub>Offtake structure</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 6 | **contract_maturity**<br><sub>Contract maturity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **geographic_spread**<br><sub>Geographic spread</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **segment_fragmentation**<br><sub>Segment fragmentation</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **switching_cost**<br><sub>Switching cost</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **substitute_threat**<br><sub>Substitute threat</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **channel_control**<br><sub>Channel control</sub> | 🟢 populated | investor + sell-side analyst opinion; not directly controllable by Shell | Shell brief HYP SH-03 | med |
| 12 | **subsidy_dependency**<br><sub>Subsidy dependency</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |

---

## 6. Industrial blue hydrogen retention for hard-to-abate sectors

**Horizon:** H2 · **Persona:** strategy · **Year:** 2030 · **Baseline confidence:** 0.550 · **Status:** `draft_unreviewed`

> **Hypothesis:** Shell retains and grows industrial blue hydrogen capability for hard-to-abate sectors through 2030, contingent on SMR-with-CCS economics holding, captive industrial demand persisting, and CCUS-enabling regulation (45Q-style) continuing.

**Why it matters:** Blue H2 is Shell's pragmatic hydrogen position vs the more ambitious green H2 retreat; lower-risk transition lever.

**Strategy context:** Renewables & Energy Solutions — Shell retains blue H2 capability for industrial customers as green H2 ambitions scale back.

**Brief description:** SMR-with-CCS hydrogen production for refining + ammonia + steel + chemicals customers.

**Decision threshold:** Shell industrial blue H2 capacity >0.5 Mtpa by 2030

**Time horizon source:** Brief Section 04 (Hydrogen)

### 6.1 BLUE_HYDROGEN_SMR_CCS_TECH

**Type:** `tech` · **Vector:** `tech` · **Cross-industry:** ✓ yes

**Description:** SMR with CCS for blue hydrogen production at industrial scale.

**Source citation:** Shell brief Section 04 (Hydrogen)

_Resolution: 🟢 3 populated · 🟡 10 not_in_source · ⚪ 0 not_applicable (of 13 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **tech_function**<br><sub>Tech function</sub> | 🟢 populated | `smr_with_ccs_blue_hydrogen` | Shell brief Section 04 | high |
| 2 | **trl**<br><sub>Technology readiness level</sub> | 🟢 populated | `8` | SMR mature TRL 9; SMR+CCS at TRL 8 with operational facilities (e.g. Quest, Air Products Port Arthur) | high |
| 3 | **ttm_months**<br><sub>Time to market</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **cost_trajectory**<br><sub>Cost trajectory</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 5 | **velocity_pct_yoy**<br><sub>Velocity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 6 | **scale_up_factor**<br><sub>Scale-up factor</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **patent_density**<br><sub>Patent density</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **supply_concentration**<br><sub>Supply concentration</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **capex_intensity**<br><sub>CAPEX intensity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **opex_trajectory**<br><sub>OPEX trajectory</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **substitution_risk**<br><sub>Substitution risk</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **obsolescence_horizon**<br><sub>Obsolescence horizon</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 13 | **incumbency_depth**<br><sub>Incumbency depth</sub> | 🟢 populated | high — Air Products, Linde, Air Liquide, Shell, BP, Equinor | Shell brief Section 04 | med |

### 6.2 INDUSTRIAL_H2_HARD_TO_ABATE_DEMAND

**Type:** `market` · **Vector:** `market` · **Cross-industry:** ✓ yes

**Description:** Industrial hydrogen demand from refineries, ammonia, methanol, steel, chemicals.

**Source citation:** Shell brief Section 04

_Resolution: 🟢 3 populated · 🟡 9 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **market_size**<br><sub>Market size</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 2 | **cagr**<br><sub>CAGR</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 3 | **price_elasticity**<br><sub>Price elasticity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **demand_certainty**<br><sub>Demand certainty</sub> | 🟢 populated | high — captive industrial hydrogen demand is structural | Shell brief Section 04 | high |
| 5 | **offtake_structure**<br><sub>Offtake structure</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 6 | **contract_maturity**<br><sub>Contract maturity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **geographic_spread**<br><sub>Geographic spread</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **segment_fragmentation**<br><sub>Segment fragmentation</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **switching_cost**<br><sub>Switching cost</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **substitute_threat**<br><sub>Substitute threat</sub> | 🟢 populated | moderate — green H2 is the substitute but cost gap material; non-H2 DRI threatens steel sub-segment | Shell brief Section 04 + worked example Section 8.2 | med |
| 11 | **channel_control**<br><sub>Channel control</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **subsidy_dependency**<br><sub>Subsidy dependency</sub> | 🟢 populated | 50 pct | Shell brief Section 04 — Blue H2 economics depend on 45Q / EU CCUS contracts to bridge cost vs grey H2 | med |

---

## 7. NW European green hydrogen production capacity (managed retreat)

**Horizon:** H3 · **Persona:** strategy · **Year:** 2030 · **Baseline confidence:** 0.350 · **Status:** `draft_unreviewed`

> **Hypothesis:** Shell's announced 2030 NW European green hydrogen production capacity (Holland Hydrogen 1 + REFHYNE II + NortH2 stake) is delivered within ±50% of stated targets, contingent on PEM electrolyser cost-down, NW European industrial offtake FID density, EU Hydrogen Bank funding, and absence of structural steel-decarbonisation alternative pathway maturation.

**Why it matters:** H3 hydrogen is the worked-example reference initiative; v2 baseline reflects March 2026 brief retreat signal.

**Strategy context:** Renewables & Energy Solutions — Shell announced 2030 NW European green H2 capacity now in managed retreat.

**Brief description:** Holland Hydrogen 1 (200MW), REFHYNE II, NortH2 stake — flagged as scaling back in March 2026 brief.

**Decision threshold:** 2030 NW European Shell green H2 capacity within ±50% of currently-announced figures

**Time horizon source:** /docs/WORKED_EXAMPLE_SHELL_H3.md + brief Section 04 retreat signal

### 7.1 PEM_ELECTROLYSIS_INDUSTRIAL_SCALE

**Type:** `tech` · **Vector:** `tech` · **Cross-industry:** ✓ yes

**Description:** PEM electrolyser stack + balance-of-plant at >100MW industrial scale.

**Source citation:** Worked example Section 6.2; Shell brief Section 04

_Resolution: 🟢 6 populated · 🟡 7 not_in_source · ⚪ 0 not_applicable (of 13 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **tech_function**<br><sub>Tech function</sub> | 🟢 populated | `pem_electrolysis_industrial_scale` | Worked example Section 6.2 | high |
| 2 | **trl**<br><sub>Technology readiness level</sub> | 🟢 populated | `7` | TRL 8-9 component; TRL 7-8 system at >100MW; Holland Hydrogen 1 commissioning | med |
| 3 | **ttm_months**<br><sub>Time to market</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **cost_trajectory**<br><sub>Cost trajectory</sub> | 🟢 populated | Current quotes 1,400-1,800 EUR/kW vs target <1,000 EUR/kW; 10-20% per doubling per IRENA | IRENA Hydrogen Cost Report 2024 + worked example | med |
| 5 | **velocity_pct_yoy**<br><sub>Velocity</sub> | 🟢 populated | -12 pct_per_year | IRENA per worked example — Cost-decline ~10-15% YoY across Western suppliers per IRENA learning rates | low |
| 6 | **scale_up_factor**<br><sub>Scale-up factor</sub> | 🟢 populated | 0.25 multiplier | Worked example Section 6.2 — Holland Hydrogen 1 is genuinely commercial-scale at 200MW; second-of-kind unproven | low |
| 7 | **patent_density**<br><sub>Patent density</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **supply_concentration**<br><sub>Supply concentration</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **capex_intensity**<br><sub>CAPEX intensity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **opex_trajectory**<br><sub>OPEX trajectory</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **substitution_risk**<br><sub>Substitution risk</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **obsolescence_horizon**<br><sub>Obsolescence horizon</sub> | 🟢 populated | 15 years | Industry consensus per worked example — Stack design life ~10-15 years; balance-of-plant >20 years | low |
| 13 | **incumbency_depth**<br><sub>Incumbency depth</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |

### 7.2 EU_HYDROGEN_BANK

**Type:** `regulation` · **Vector:** `regulation` · **Cross-industry:** ✗ no

**Description:** EU Hydrogen Bank funding — auction-based €/kg subsidy mechanism.

**Source citation:** Worked example Section 7.3

_Resolution: 🟢 5 populated · 🟡 7 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **regulation_stage**<br><sub>Regulation stage</sub> | 🟢 populated | `in_force` | European Commission disclosures per worked example | high |
| 2 | **enforcement**<br><sub>Enforcement strength</sub> | 🟢 populated | `strong` | EC funding mechanism | med |
| 3 | **jurisdictional_reach**<br><sub>Jurisdictional reach</sub> | 🟢 populated | EU-27 | Worked example | high |
| 4 | **implementation_progress**<br><sub>Implementation progress</sub> | 🟢 populated | 40 pct | EC Hydrogen Bank disclosures per worked example — Round 1 awarded €720m at <€0.50/kg subsidy 2024; Round 2 announced 2025 at €1.2bn | med |
| 5 | **political_durability**<br><sub>Political durability</sub> | 🟢 populated | moderate — committed framework but EU budget tightening risk | Worked example Section 7.3 | med |
| 6 | **grandfather_clauses**<br><sub>Grandfather clauses</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **compliance_cost**<br><sub>Compliance cost</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **audit_cadence**<br><sub>Audit cadence</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **precedent_strength**<br><sub>Precedent strength</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **harmonisation**<br><sub>Harmonisation</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **sunset_risk**<br><sub>Sunset risk</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **judicial_exposure**<br><sub>Judicial exposure</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |

### 7.3 NON_H2_DRI_THREAT

**Type:** `tech` · **Vector:** `tech` · **Cross-industry:** ✓ yes

**Description:** Non-hydrogen direct reduced iron pathway as alternative steel decarbonisation; Boston Metal, Electra.

**Source citation:** Worked example Section 8.2

_Resolution: 🟢 3 populated · 🟡 10 not_in_source · ⚪ 0 not_applicable (of 13 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **tech_function**<br><sub>Tech function</sub> | 🟢 populated | `pem_electrolysis_industrial_scale` | Same vocab — non-H2 DRI competes against PEM electrolysis as steel decarbonisation pathway | low |
| 2 | **trl**<br><sub>Technology readiness level</sub> | 🟢 populated | `5` | TRL 5-6; pilot scale; commercial scale 2027-2030 contested. Boston Metal Series C; Electra commercial pilot | med |
| 3 | **ttm_months**<br><sub>Time to market</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **cost_trajectory**<br><sub>Cost trajectory</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 5 | **velocity_pct_yoy**<br><sub>Velocity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 6 | **scale_up_factor**<br><sub>Scale-up factor</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **patent_density**<br><sub>Patent density</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **supply_concentration**<br><sub>Supply concentration</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **capex_intensity**<br><sub>CAPEX intensity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **opex_trajectory**<br><sub>OPEX trajectory</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **substitution_risk**<br><sub>Substitution risk</sub> | 🟢 populated | high — if Boston Metal or similar reaches commercial scale, steel offtake market for green H2 narrows materially | Worked example Section 8.2 | med |
| 12 | **obsolescence_horizon**<br><sub>Obsolescence horizon</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 13 | **incumbency_depth**<br><sub>Incumbency depth</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |

---

## 8. Namibia Orange Basin commercial development (45% stake)

**Horizon:** H2 · **Persona:** strategy · **Year:** 2027 · **Baseline confidence:** 0.500 · **Status:** `draft_unreviewed`

> **Hypothesis:** Shell's 45% stake in Namibian Orange Basin licence reaches commercial FID by end-2027, contingent on resource appraisal validating >1.5 bn boe, Namibian fiscal regime remaining stable, and frontier deepwater rig availability not delaying campaign.

**Why it matters:** Namibia could be next Guyana for Shell production trajectory — material 2030+ upstream lever.

**Strategy context:** Upstream — frontier deepwater exploration positioning post-Guyana.

**Brief description:** Shell 45% in TotalEnergies-operated licence; multiple discoveries 2022-2024.

**Decision threshold:** Shell+TotalEnergies-operated Orange Basin licence achieves FID by end-2027

**Time horizon source:** Brief Section 06 S-01

### 8.1 NAMIBIA_ORANGE_BASIN_RESOURCE

**Type:** `tech` · **Vector:** `tech` · **Cross-industry:** ✗ no

**Description:** Namibia Orange Basin oil resource — multiple discoveries by TotalEnergies, Shell, Galp 2022-2024.

**Source citation:** Shell brief Section 06 S-01

_Resolution: 🟢 3 populated · 🟡 10 not_in_source · ⚪ 0 not_applicable (of 13 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **tech_function**<br><sub>Tech function</sub> | 🟢 populated | `frontier_deepwater_appraisal` | Shell brief Section 06 S-01 | high |
| 2 | **trl**<br><sub>Technology readiness level</sub> | 🟢 populated | `7` | Discoveries confirmed TRL 7+; commercial production not yet; FID-stage | med |
| 3 | **ttm_months**<br><sub>Time to market</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **cost_trajectory**<br><sub>Cost trajectory</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 5 | **velocity_pct_yoy**<br><sub>Velocity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 6 | **scale_up_factor**<br><sub>Scale-up factor</sub> | 🟢 populated | 0.5 multiplier | Shell brief Section 06 S-01 — Pre-FID; appraisal pending; estimated 2B+ boe technical resource industry consensus | low |
| 7 | **patent_density**<br><sub>Patent density</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **supply_concentration**<br><sub>Supply concentration</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **capex_intensity**<br><sub>CAPEX intensity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **opex_trajectory**<br><sub>OPEX trajectory</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **substitution_risk**<br><sub>Substitution risk</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **obsolescence_horizon**<br><sub>Obsolescence horizon</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 13 | **incumbency_depth**<br><sub>Incumbency depth</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |

### 8.2 NAMIBIA_REGULATORY_FRAMEWORK

**Type:** `regulation` · **Vector:** `regulation` · **Cross-industry:** ✗ no

**Description:** Namibian upstream regulatory and fiscal framework.

**Source citation:** Shell brief Section 06 S-01 (no specific regulatory commentary)

_Resolution: 🟢 4 populated · 🟡 8 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **regulation_stage**<br><sub>Regulation stage</sub> | 🟢 populated | `in_force` | Petroleum Act framework stable | med |
| 2 | **enforcement**<br><sub>Enforcement strength</sub> | 🟢 populated | `moderate` | Brief is silent | low |
| 3 | **jurisdictional_reach**<br><sub>Jurisdictional reach</sub> | 🟢 populated | Namibian federal — applies to offshore licences | Industry consensus | med |
| 4 | **implementation_progress**<br><sub>Implementation progress</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): not addressed. T2 (industry sources): Brief is silent. Open question flagged in shell_phase1.md §7.5. | — |
| 5 | **political_durability**<br><sub>Political durability</sub> | 🟢 populated | moderate — government has signalled intent to revise local content rules but no major adverse changes published | Shell brief Section 06 S-01 + government public statements | low |
| 6 | **grandfather_clauses**<br><sub>Grandfather clauses</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): not addressed. T2 (industry sources): No public information on grandfather provisions for incumbent operators. | — |
| 7 | **compliance_cost**<br><sub>Compliance cost</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **audit_cadence**<br><sub>Audit cadence</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **precedent_strength**<br><sub>Precedent strength</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **harmonisation**<br><sub>Harmonisation</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **sunset_risk**<br><sub>Sunset risk</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **judicial_exposure**<br><sub>Judicial exposure</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |

### 8.3 DEEPWATER_DRILLING_CAPACITY

**Type:** `ecosystem` · **Vector:** `ecosystem` · **Cross-industry:** ✓ yes

**Description:** Frontier deepwater drilling rig + supply chain capacity globally.

**Source citation:** Shell brief Section 06 S-01 context

_Resolution: 🟢 3 populated · 🟡 9 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **infrastructure_readiness**<br><sub>Infrastructure readiness</sub> | 🟢 populated | weakening — drillship day-rates $450-550k/day for ultra-deepwater 6th-gen rigs 2025; supply chain tight | Industry consensus referenced in shell_phase1.mjs | med |
| 2 | **standards_maturity**<br><sub>Standards maturity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 3 | **interoperability**<br><sub>Interoperability</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **partner_concentration**<br><sub>Partner concentration</sub> | 🟢 populated | count: 4-5 major rig owners (Transocean, Valaris, Noble, Seadrill, Stena); high concentration | Industry consensus | med |
| 5 | **capital_intensity**<br><sub>Capital intensity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 6 | **talent_availability**<br><sub>Talent availability</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **supply_chain_depth**<br><sub>Supply chain depth</sub> | 🟢 populated | moderate — multiple basins competing for limited 6th-gen drillships | Shell brief Section 06 S-01 | med |
| 8 | **platform_effects**<br><sub>Platform effects</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **institutional_support**<br><sub>Institutional support</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **collaboration_density**<br><sub>Collaboration density</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **geographic_clustering**<br><sub>Geographic clustering</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **lock_in_risk**<br><sub>Lock-in risk</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |

---

## 9. Shell Chemicals pivot from commodity to performance chemicals

**Horizon:** H1 · **Persona:** strategy · **Year:** 2027 · **Baseline confidence:** 0.600 · **Status:** `draft_unreviewed`

> **Hypothesis:** Shell Chemicals pivots capital allocation predominantly toward performance/specialty chemicals by end-2027, contingent on commodity cracker economics remaining unfavourable, specialty end-market demand sustaining, internal capital reallocation execution, and accessible bolt-on M&A market.

**Why it matters:** Chemicals strategy is the most concrete restructure-posture initiative in the portfolio; near-term commercial signals.

**Strategy context:** Chemicals — Shell pivoting capital from commodity ethylene to specialty/performance chemicals.

**Brief description:** Refinery headcount cuts under way; cracker shutdown decisions pending; specialty M&A pipeline active.

**Decision threshold:** Shell Chemicals capital allocation shifts >50% to specialty/performance lines by end-2027

**Time horizon source:** Brief Section 02 + Section 06 S-03

### 9.1 SHELL_CHEMICALS_CAPITAL_REALLOCATION

**Type:** `ecosystem` · **Vector:** `ecosystem` · **Cross-industry:** ✗ no

**Description:** Shell Chemicals internal capital reallocation from commodity to specialty.

**Source citation:** Shell brief Section 02 (Chemicals strategy)

_Resolution: 🟢 3 populated · 🟡 9 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **infrastructure_readiness**<br><sub>Infrastructure readiness</sub> | 🟢 populated | moderate — refinery headcount cuts under way; specific cracker shutdowns pending; specialty capex line being built | Shell brief Section 02 | med |
| 2 | **standards_maturity**<br><sub>Standards maturity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 3 | **interoperability**<br><sub>Interoperability</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **partner_concentration**<br><sub>Partner concentration</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 5 | **capital_intensity**<br><sub>Capital intensity</sub> | 🟢 populated | multi-$bn specialty M&A bolt-ons + commodity divestment proceeds | Shell brief Section 02 | low |
| 6 | **talent_availability**<br><sub>Talent availability</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **supply_chain_depth**<br><sub>Supply chain depth</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **platform_effects**<br><sub>Platform effects</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **institutional_support**<br><sub>Institutional support</sub> | 🟢 populated | high — explicit Shell strategy direction in March 2026 brief | Shell brief Section 02 | high |
| 10 | **collaboration_density**<br><sub>Collaboration density</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **geographic_clustering**<br><sub>Geographic clustering</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **lock_in_risk**<br><sub>Lock-in risk</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |

### 9.2 COMMODITY_CRACKER_ECONOMICS

**Type:** `market` · **Vector:** `market` · **Cross-industry:** ✗ no

**Description:** European commodity ethylene cracker margins.

**Source citation:** Shell brief Section 06 S-03

_Resolution: 🟢 3 populated · 🟡 9 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **market_size**<br><sub>Market size</sub> | 🟢 populated | European cracker margins compressed 2024-2025; multiple shutdown announcements industry-wide | Shell brief Section 06 S-03 | high |
| 2 | **cagr**<br><sub>CAGR</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 3 | **price_elasticity**<br><sub>Price elasticity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **demand_certainty**<br><sub>Demand certainty</sub> | 🟢 populated | weak — structural over-capacity vs Asian + ME competition | Shell brief Section 06 S-03 | med |
| 5 | **offtake_structure**<br><sub>Offtake structure</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 6 | **contract_maturity**<br><sub>Contract maturity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **geographic_spread**<br><sub>Geographic spread</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **segment_fragmentation**<br><sub>Segment fragmentation</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **switching_cost**<br><sub>Switching cost</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **substitute_threat**<br><sub>Substitute threat</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **channel_control**<br><sub>Channel control</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **subsidy_dependency**<br><sub>Subsidy dependency</sub> | 🟢 populated | 0 pct | Industry consensus — Commodity cracker economics not subsidy-driven | high |

### 9.3 PERFORMANCE_CHEMICALS_DEMAND

**Type:** `market` · **Vector:** `market` · **Cross-industry:** ✗ no

**Description:** Specialty / performance chemicals end-market demand — adhesives, coatings, lubricant additives.

**Source citation:** Shell brief Section 06 S-03

_Resolution: 🟢 2 populated · 🟡 10 not_in_source · ⚪ 0 not_applicable (of 12 required)_

| # | Attribute | Status | Value | Source / Reason | Conf |
|---:|---|---|---|---|---|
| 1 | **market_size**<br><sub>Market size</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 2 | **cagr**<br><sub>CAGR</sub> | 🟢 populated | 4 pct_per_year | Shell brief Section 06 S-03 — Adhesives, coatings, lubricant additives demand growing 3-5%/yr per industry consensus | med |
| 3 | **price_elasticity**<br><sub>Price elasticity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 4 | **demand_certainty**<br><sub>Demand certainty</sub> | 🟢 populated | moderate-to-high — secular demand drivers from EV, packaging, construction | Shell brief Section 06 S-03 | med |
| 5 | **offtake_structure**<br><sub>Offtake structure</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 6 | **contract_maturity**<br><sub>Contract maturity</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 7 | **geographic_spread**<br><sub>Geographic spread</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 8 | **segment_fragmentation**<br><sub>Segment fragmentation</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 9 | **switching_cost**<br><sub>Switching cost</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 10 | **substitute_threat**<br><sub>Substitute threat</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 11 | **channel_control**<br><sub>Channel control</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |
| 12 | **subsidy_dependency**<br><sub>Subsidy dependency</sub> | 🟡 not_in_source | — | _NIS:_ T1 (brief): attribute not addressed in source. | — |


---

## Tech functions referenced in this catalogue

| function_name | description | physical_principle | typical_failure_mode |
|---|---|---|---|
| `deepwater_oil_production` | Subsea production from oil reservoirs at >1500m water depth using FPSO or platform host with long subsea tiebacks. | Multiphase flow assurance under high-pressure low-temperature subsea conditions; gas-lift artificial lift; subsea boosting. | Wax/hydrate formation in flowlines; subsea tree integrity; HPHT well integrity; reservoir compaction. |
| `fast_ev_charging_dc` | Direct-current fast EV charging hardware ≥150 kW; power electronics + grid interface + driver UX; CCS/NACS standard. | High-frequency power conversion via SiC/GaN switches; CCS/NACS protocol negotiation; thermal management of battery and cable. | Connector wear; power module failure; vandalism/cable theft; grid demand-charge exposure; downtime from CSMS issues. |
| `frontier_deepwater_appraisal` | Exploration and appraisal drilling in frontier deepwater basins (>2000m water depth, limited prior development) — Namibia Orange Basin, Suriname. | Same as deepwater_oil_production but with higher geological uncertainty and longer appraisal-to-FID timelines. | Reservoir quality below threshold; rig-availability constraints; political/fiscal regime change before FID. |
| `industrial_post_combustion_co2_capture` | Capture of CO2 from industrial flue gas streams using amine solvents or membrane separation, then compression and pipeline/ship transport to sequestration. | Selective absorption of CO2 by amine solvents (chemisorption) or selective permeability of polymer/composite membranes. | Solvent degradation under SOx/NOx; membrane fouling; capture-rate degradation over time; reboiler steam economics. |
| `pem_electrolysis_industrial_scale` | Proton exchange membrane water electrolysis for hydrogen production at >100 MW scale, with stack and balance-of-plant for grid-following operation. | Proton conduction through perfluorosulfonic acid membrane separating cathode and anode; water splitting at platinum-group catalysts. | Catalyst degradation under load cycling; membrane fluoride release; bipolar plate corrosion; iridium supply constraint. |
| `saf_blending_and_co_processing` | Sustainable aviation fuel produced via HEFA, ATJ, or co-processing routes; blended into Jet-A1 at ASTM-approved drop-in ratios. | Hydroprocessing of bio-oils (HEFA) or alcohol dehydration/oligomerisation/hydrogenation (ATJ) to produce paraffinic kerosene. | Feedstock supply security; refinery hydrogen supply; certification of higher blend ratios; catalyst poisoning by feed contaminants. |
| `smr_with_ccs_blue_hydrogen` | Steam methane reforming with carbon capture and storage producing low-carbon (blue) hydrogen for industrial off-take. | Catalytic steam reforming of methane to syngas; water-gas shift to CO2+H2; pre-combustion or post-combustion CCS captures CO2. | Reformer tube creep; shift catalyst poisoning; capture-rate degradation; methane slip when CCS rates pushed >95%. |

---

*End of worksheet. Generated read-only from live PG via the v2 API; no data modified.*