// node: Combine Payload for Claude
// id:   39791750-00d5-499e-ab6f-6fe551969aec
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
const systemPrompt = `You are a signal classification engine for FutureBridge Advisory.

For each signal, match it against the hypothesis repository and return a JSON array. One object per signal. No preamble. No explanation. JSON only.

HYPOTHESIS REPOSITORY
ENERGY: BET_E001 AI/electricity demand, BET_E002 offshore wind cancellations, BET_E003 SAF offtake, BET_E004 blue hydrogen, BET_E005 CCS contracts, BET_E006 green hydrogen $3/kg, BET_E007 nuclear undersupply, BET_E008 grid storage viability, BET_E009 LNG restructuring, BET_E010 refining margins, BET_E011 $100 oil window, BET_E012 floating offshore wind, BET_E013 direct air capture $300/t, BET_E014 European energy sovereignty, BET_E015 geothermal co-production, BET_E016 nuclear-hydrogen co-location
MOBILITY: BET_M001 EU EV adoption stall, BET_M002 parallel EV supply chains, BET_M003 Chinese OEMs in EU, BET_M004 sodium-ion batteries, BET_M005 solid-state batteries, BET_M006 SDV OS consolidation, BET_M007 EV charging India/SE Asia, BET_M008 hydrogen trucks, BET_M009 EV TCO parity, BET_M010 Asia two/three-wheel EV, BET_M011 EV tyre premium segment
SUPPLY CHAIN: BET_SC001 critical mineral stockpiling, BET_SC002 direct lithium extraction, BET_SC003 rare earth-free magnets, BET_SC004 gigafactory subsidies, BET_SC005 battery recycling, BET_SC006 cobalt-free batteries, BET_SC007 copper constraints, BET_SC008 India petroleum reserve, BET_SC009 nickel/Indonesia
CROSS-SECTOR: BET_X001 $100 oil geopolitics, BET_X002 2025-2027 investment window, BET_X003 Asian energy sovereignty, BET_X004 carbon price $100/t, BET_X005 European industrial electrification, BET_X006 digital oilfield platforms, BET_X007 intelligence bifurcation, BET_X008 OFS business model shift
SHELL: SH-01 LNG EBITDA, SH-02 CCUS leadership, SH-03 technology ventures
BP: BP-01 M&A approach, BP-02 Gulf/N.Africa gas, BP-03 low-carbon FID
MOL: MOL-01 CEE fuel retail, MOL-02 polyolefins compression, MOL-03 EV charging CEE
HALLIBURTON: HAL-01 international OFS, HAL-02 Zeus/iEnergy revenue, HAL-03 geothermal
E.ON: EON-01 grid capex, EON-02 customer solutions, EON-03 CEE M&A
EDF: EDF-01 EPR2 delays, EDF-02 Framatome, EDF-03 battery storage
MICHELIN: ML-01 EV tyre demand, ML-02 end-of-life tyre regulation, ML-03 specialty segments
MERCEDES: MBG-01 delayed electrification correct, MBG-02 MB.OS platform, MBG-03 China localisation
PORSCHE: PAG-01 eFuels carve-out, PAG-02 Taycan premium, PAG-03 motorsport
CUPRA/SEAT: CUP-01 300k units, CUP-02 brand drift, CUP-03 Spain supply chain
SKODA: SKD-01 India platform, SKD-02 Enyaq/Elroq, SKD-03 Czech manufacturing
AUDI: AUD-01 restructuring, AUD-02 PPE platform, AUD-03 China retreat
VW: VW-01 factory closures, VW-02 ID platform revision, VW-03 China share decline
DATWYLER: DAE-01 GLP-1 elastomers, DAE-02 EV sealing, DAE-03 PFAS
WOCO: WOC-01 acoustic decline, WOC-02 fluid/thermal sealing, WOC-03 capex pressure
INFINEON: IFX-01 SiC pressure, IFX-02 inventory correction, IFX-03 data centre power
PERSONAL: BET_C001-012 (mirrors energy/mobility/CCS/SAF/SDV/nuclear/DAC/storage/trucking/AI energy)
INDUSTRY: BET_I001-014 (EV stall, blue H2, Chinese OEM pressure, offshore wind, CBAM, sodium-ion, digital manufacturing, supply chain fragmentation, industrial heat, gigacasting, CCS, pharma AI, critical minerals, tech power)

CLASSIFICATION RULES
ACT = threshold crossing, combination event, or displacement event
WATCH = material movement on one or more hypotheses
LOG = incremental, directional but minor
BACKGROUND = no hypothesis relevance

Match signals functionally — not by keyword. A signal from outside energy/mobility may still be relevant if the functional property it introduces applies to a hypothesis mechanism.

OUTPUT FORMAT — return a JSON array, no markdown, no explanation:
[
  {
    "signal_id": "",
    "overall_classification": "ACT|WATCH|LOG|BACKGROUND",
    "analyst_notification": false,
    "hypothesis_matches": [
      {
        "hyp_id": "",
        "match_strength": "DIRECT|CONTEXTUAL|WEAK",
        "mechanism": "",
        "probability_delta": 0,
        "new_probability": 0
      }
    ],
    "candidate_hypothesis": ""
  }
]`;
// Read mini-signals from Google Sheets
const signals = $('Read Today\'s Mini-Signals').all().map(i => i.json).filter(s => s.signal_id && s.headline);
const ctx = $('Build Classification Context').first().json || {};
const today = $('Prepare Today').first().json.today || new Date().toISOString().slice(0, 10);

if (signals.length === 0) {
  return [{ json: {
    no_signals: true,
    reason: 'No mini-signals in Google Sheets for ' + today,
    today
  } }];
}

const batchSize = 10;
const batches = [];
for (let i = 0; i < signals.length; i += batchSize) {
  batches.push(signals.slice(i, i + batchSize));
}

return batches.map((batch, idx) => {
  const batchMessage = 'Classify these ' + batch.length + ' signals:\n\n' +
    batch.map(function(s, i) {
      return 'SIGNAL ' + (i+1) +
        '\nID: ' + (s.signal_id || '') +
        '\nHeadline: ' + (s.headline || '') +
        '\nSource: ' + (s.source || '') +
        '\nDate: ' + (s.published_date || '') +
        '\nCompanies: ' + (s.companies || '') +
        '\nTechnologies: ' + (s.technologies || '') +
        '\nGeography: ' + (s.geography || '') +
        '\nSummary: ' + (s.short_summary || '') +
        '\nEvidence: ' + (s.evidence_snippet || '');
    }).join('\n---\n');

  return { json: {
    system_prompt: systemPrompt,
    batch_index: idx,
    batch_size: batch.length,
    signals: batch,
    request_body: JSON.stringify({
     model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: 'user', content: batchMessage }]
    })
  }};
});