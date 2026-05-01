// node: Detect Companies & Tag
// id:   1a76902d-c961-4100-b3f9-bd80a340f929
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// Detect companies, classify signals, assign relevance scores
const items = $input.all();
const results = [];

// Watched companies by sector
const WATCH_COMPANIES = {
  energy: ['Shell', 'BP', 'ExxonMobil', 'Chevron', 'TotalEnergies', 'Equinor', 'Eni', 'Aramco', 'Repsol', 'OMV', 'Orsted', 'Iberdrola', 'Enel', 'Engie', 'E.ON', 'RWE', 'Vattenfall', 'SSE', 'National Grid', 'Octopus Energy'],
  auto_oem: ['BMW', 'Mercedes-Benz', 'Volkswagen', 'Audi', 'Porsche', 'Tesla', 'BYD', 'Toyota', 'Honda', 'Nissan', 'Hyundai', 'Kia', 'GM', 'Ford', 'Stellantis', 'Rivian', 'Lucid', 'NIO', 'Li Auto', 'XPeng', 'Geely', 'Volvo Cars'],
  cv_oem: ['Daimler Truck', 'Volvo Group', 'PACCAR', 'TRATON', 'Scania', 'MAN', 'DAF', 'Iveco', 'Nikola', 'Hyzon', 'Quantron'],
  battery: ['CATL', 'LG Energy', 'Panasonic', 'Samsung SDI', 'SK On', 'BYD', 'CALB', 'EVE Energy', 'Gotion', 'QuantumScape', 'Solid Power', 'Northvolt', 'ACC', 'AESC'],
  tech: ['Waymo', 'Cruise', 'Aurora Innovation', 'Mobileye', 'NVIDIA', 'Qualcomm', 'Bosch', 'Continental', 'ZF', 'Valeo', 'Aptiv', 'Magna'],
  hydrogen: ['Plug Power', 'Bloom Energy', 'Nel ASA', 'ITM Power', 'Ballard Power', 'Cummins', 'Air Liquide', 'Linde', 'Air Products', 'Hyundai', 'Toyota'],
  carbon: ['Climeworks', 'Carbon Engineering', 'Global Thermostat', '1PointFive', 'Occidental', 'CarbonCure', 'Svante', 'Carbon Clean']
};

const ALL_COMPANIES = [...new Set(Object.values(WATCH_COMPANIES).flat())];

// Signal type detection
const SIGNAL_TYPES = {
  'Patent Filing': ['patent', 'filed', 'granted', 'intellectual property', 'USPTO', 'EPO'],
  'Funding': ['funding', 'raises', 'raised', 'investment', 'series a', 'series b', 'series c', 'venture', 'vc', 'financing', 'capital'],
  'M&A': ['acquires', 'acquired', 'acquisition', 'merger', 'merges', 'buys', 'bought', 'takeover', 'deal'],
  'Partnership': ['partnership', 'partners', 'collaboration', 'joint venture', 'jv', 'alliance', 'teams up', 'agreement'],
  'Policy': ['regulation', 'regulatory', 'legislation', 'law', 'mandate', 'policy', 'government', 'subsidy', 'incentive', 'ban', 'directive', 'act', 'statute'],
  'Launch': ['launches', 'launched', 'unveils', 'unveiled', 'introduces', 'announces', 'new product', 'debut', 'reveal'],
  'Milestone': ['milestone', 'record', 'first', 'breakthrough', 'achieves', 'reached', 'surpasses'],
  'Legislation': ['parliament', 'council', 'directive', 'regulation (eu)', 'statutory instrument', 'act of parliament', 'bill', 'eur-lex', 'legislation.gov']
};

// Legislation source detection
const LEGISLATION_SOURCES = ['eur-lex.europa.eu', 'legislation.gov.uk', 'bills.parliament.uk'];

for (const item of items) {
  const title = (item.json.title || '').toString();
  const content = (item.json.content || item.json.description || item.json.summary || '').toString();
  const link = (item.json.link || item.json.guid || '').toString();
  const pubDate = item.json.pubDate || item.json.isoDate || new Date().toISOString();
  const fullText = (title + ' ' + content).toLowerCase();
  
  if (!title || title.length < 10) continue;
  
  // Detect if this is a legislation item
  const isLegislation = LEGISLATION_SOURCES.some(src => link.toLowerCase().includes(src));
  
  // Detect source type
  let source = 'Google News RSS';
  if (link.includes('eur-lex')) source = 'EUR-Lex';
  else if (link.includes('legislation.gov.uk')) source = 'UK Legislation';
  else if (link.includes('bills.parliament.uk')) source = 'UK Parliament';
  
  // Detect signal type
  let signalType = isLegislation ? 'Legislation' : 'News';
  for (const [type, keywords] of Object.entries(SIGNAL_TYPES)) {
    if (keywords.some(kw => fullText.includes(kw.toLowerCase()))) {
      signalType = type;
      break;
    }
  }
  
  // Detect companies mentioned
  const companiesFound = ALL_COMPANIES.filter(c => 
    fullText.includes(c.toLowerCase())
  );
  
  // Detect sector and assign radar
  let sectorTags = [];
  let radar = 'None detected';
  
  for (const [sector, companies] of Object.entries(WATCH_COMPANIES)) {
    if (companies.some(c => fullText.includes(c.toLowerCase()))) {
      sectorTags.push(sector);
    }
  }
  
  // Tech tags based on content
  let techTags = [];
  if (fullText.includes('hydrogen') || fullText.includes('fuel cell')) techTags.push('Hydrogen');
  if (fullText.includes('battery') || fullText.includes('lithium') || fullText.includes('solid state')) techTags.push('Batteries');
  if (fullText.includes('carbon capture') || fullText.includes('ccus') || fullText.includes('direct air')) techTags.push('DAC/CCUS');
  if (fullText.includes('charging') || fullText.includes('ev infrastructure')) techTags.push('EV Charging');
  if (fullText.includes('autonomous') || fullText.includes('self-driving') || fullText.includes('lidar')) techTags.push('Autonomous');
  if (fullText.includes('electric truck') || fullText.includes('commercial vehicle')) techTags.push('Electric Trucks');
  if (fullText.includes('geothermal') || fullText.includes('nuclear') || fullText.includes('smr') || fullText.includes('fusion')) techTags.push('Geothermal/Nuclear');
  if (fullText.includes('software defined') || fullText.includes('vehicle os')) techTags.push('SDV');
  
  // Legislation-specific tags
  if (isLegislation) {
    if (fullText.includes('energy') || fullText.includes('electricity') || fullText.includes('renewable')) techTags.push('Energy Policy');
    if (fullText.includes('transport') || fullText.includes('vehicle') || fullText.includes('emission')) techTags.push('Transport Policy');
    if (fullText.includes('environment') || fullText.includes('climate') || fullText.includes('carbon')) techTags.push('Climate Policy');
    if (fullText.includes('battery') || fullText.includes('waste') || fullText.includes('recycl')) techTags.push('Battery Regulation');
  }
  
  // Geography detection
  let geography = 'Global';
  if (fullText.includes('eu ') || fullText.includes('europe') || fullText.includes('brussels') || link.includes('eur-lex')) geography = 'EU';
  else if (fullText.includes('uk ') || fullText.includes('britain') || fullText.includes('england') || link.includes('legislation.gov.uk')) geography = 'UK';
  else if (fullText.includes('us ') || fullText.includes('usa') || fullText.includes('america') || fullText.includes('washington')) geography = 'USA';
  else if (fullText.includes('china') || fullText.includes('chinese')) geography = 'China';
  else if (fullText.includes('germany') || fullText.includes('german')) geography = 'Germany';
  else if (fullText.includes('japan')) geography = 'Japan';
  
  // Assign radar based on content
  if (techTags.some(t => ['Hydrogen', 'DAC/CCUS', 'Geothermal/Nuclear'].includes(t))) radar = 'Shell Tech Radar';
  if (techTags.some(t => ['Batteries', 'EV Charging', 'Autonomous', 'SDV'].includes(t))) radar = 'Auto OEM Radar';
  if (techTags.includes('Electric Trucks')) radar = 'CV OEM Radar';
  if (isLegislation) radar = radar + ', Regulatory Radar';
  
  // Relevance score
  let relevance = 'MEDIUM';
  if (companiesFound.length > 0) relevance = 'HIGH';
  if (isLegislation && (techTags.length > 0 || sectorTags.length > 0)) relevance = 'HIGH';
  if (signalType === 'M&A' || signalType === 'Funding' || signalType === 'Policy') relevance = 'HIGH';
  
  const signalId = (isLegislation ? 'LEG-' : 'NEWS-') + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 4);
  
  results.push({
    json: {
      signal_id: signalId,
      date_detected: new Date().toISOString().split('T')[0],
      source: source,
      signal_type: signalType,
      title: title.substring(0, 250),
      sector_tags: sectorTags.length > 0 ? sectorTags.join(', ') : 'General',
      tech_tags: techTags.length > 0 ? techTags.join(', ') : 'General',
      geography: geography,
      companies_mentioned: companiesFound.length > 0 ? companiesFound.join(', ') : 'None detected',
      relevance_score: relevance,
      radar_to_update: radar,
      prompt_to_trigger: isLegislation ? 'Regulatory Impact Note' : 'Tech Deep Dive',
      status: 'NEW',
      notes: '',
      url: link,
      pub_date: pubDate
    }
  });
}

return results;