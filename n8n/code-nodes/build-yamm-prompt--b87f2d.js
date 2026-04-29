// node: Build YAMM Prompt
// id:   b87f2ddb-a999-4e4a-8119-01e59e7e7eb5
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// HYPOTHESIS TO ENTITY ROUTING MAP
const HYP_ENTITY_MAP = {
  'SH-': ['SHELL'],
  'BP-': ['BP'],
  'MOL-': ['MOL'],
  'HAL-': ['HALLIBURTON'],
  'EON-': ['EON'],
  'EDF-': ['EDF'],
  'ML-': ['MICHELIN'],
  'MBG-': ['MERCEDES_BENZ'],
  'PAG-': ['PORSCHE'],
  'CUP-': ['SEAT'],
  'SKD-': ['SKODA'],
  'AUD-': ['AUDI'],
  'VW-': ['VW_GROUP'],
  'DAE-': ['DATWYLER'],
  'WOC-': ['WOCO'],
  'IFX-': ['INFINEON'],
  'BET_E': ['SHELL', 'BP', 'HALLIBURTON', 'EON', 'EDF', 'RWE', 'TOTALENERGIES', 'SLB', 'TECHNIPFMC', 'EQUINOR', 'CHEVRON', 'EXXONMOBIL', 'BAKER_HUGHES'],
  'BET_M': ['VW_GROUP', 'MERCEDES_BENZ', 'AUDI', 'PORSCHE', 'SKODA', 'SEAT', 'MICHELIN', 'DATWYLER', 'INFINEON', 'DAIMLER_TRUCK', 'CONTINENTAL', 'BOSCH'],
  'BET_SC': ['SHELL', 'BP', 'HALLIBURTON', 'VW_GROUP', 'MERCEDES_BENZ', 'INFINEON', 'DATWYLER'],
  'BET_X': ['SHELL', 'BP', 'HALLIBURTON', 'EON', 'EDF', 'VW_GROUP', 'MERCEDES_BENZ'],
  'BET_I': ['SHELL', 'BP', 'HALLIBURTON', 'EON', 'EDF', 'VW_GROUP', 'MERCEDES_BENZ', 'AUDI', 'PORSCHE', 'MICHELIN'],
  'BET_C': ['SHELL', 'BP', 'HALLIBURTON', 'EON', 'EDF', 'VW_GROUP', 'MERCEDES_BENZ', 'AUDI', 'PORSCHE', 'MICHELIN']
};

function getEntitiesForHypothesis(hypId) {
  for (const prefix of Object.keys(HYP_ENTITY_MAP)) {
    if (hypId.startsWith(prefix)) {
      return HYP_ENTITY_MAP[prefix];
    }
  }
  return [];
}

// Collect all ACT signals across all batches
const allItems = $('Parse Classification').all();
const allResults = [];
allItems.forEach(item => {
  (item.json.results || []).forEach(r => allResults.push(r));
});

const actSignals = allResults.filter(r => r.overall_classification === 'ACT');
const ctx = allItems[0].json;
const todayTopic = ctx.today_topic || '';
const today = ctx.today || '';

if (actSignals.length === 0) {
  return [{ json: { skip_yamm: true, reason: 'No ACT signals today', today } }];
}

// Build one output item per ACT signal
return actSignals.map(signal => {
  // Get all target entities for this signal's hypothesis matches
  const targetEntities = new Set();
  (signal.hypothesis_matches || []).forEach(match => {
    if (match.match_strength === 'WEAK') return;
    getEntitiesForHypothesis(match.hyp_id).forEach(e => {
      if (!e.startsWith('PE_')) targetEntities.add(e);
    });
  });

  const topMatch = (signal.hypothesis_matches || [])[0] || {};

  const prompt = [
    'You are a FutureBridge Advisory analyst writing outreach emails.',
    '',
    'TODAY SIGNAL: ' + JSON.stringify(signal),
    'TODAY TOPIC: ' + todayTopic,
    '',
    'Write three email variants — one per persona.',
    'Each email follows this exact protocol:',
    '1. Signal — one sentence on what happened (no FutureBridge name in body)',
    '2. Strategy bridge — one sentence connecting to recipient strategic position',
    '3. Hypothesis — share the hypothesis this signal informed. Start: I track these things. This formed a question for me...',
    '4. Soft CTA — Let me know if it hits the spot',
    '',
    'Rules: under 120 words. No FutureBridge name in body. No em-dashes. Short unequal sentences. No consultant cliches. Peer register not vendor register.',
    '',
    'Personas:',
    'EXECUTIVE_STRATEGIC: C-suite. Competitive position and capital allocation. Frame as a strategic window.',
    'STRATEGY_DIRECTOR: Senior strategy or BD. Their roadmap. Frame as a decision trigger.',
    'TECH_SCOUT: Innovation scouting. What is technically confirmed. Frame as an evidence update.',
    '',
    'Respond with valid JSON only:',
    '{',
    '  "subject_executive": "",',
    '  "body_executive": "",',
    '  "subject_strategy": "",',
    '  "body_strategy": "",',
    '  "subject_tech": "",',
    '  "body_tech": "",',
    '  "signal_summary_one_line": ""',
    '}'
  ].join('\n');

  return {
    json: {
      signal_id: signal.signal_id,
      overall_classification: signal.overall_classification,
      hypothesis_matches: signal.hypothesis_matches,
      top_hypothesis: topMatch.hyp_id || '',
      target_entities: Array.from(targetEntities),
      yamm_prompt: prompt,
      today_topic: todayTopic,
      today,
      request_body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    }
  };
});