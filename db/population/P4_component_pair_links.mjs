// db/population/P4_component_pair_links.mjs
// Add component_pair_links from the P4 client components (Infineon, Mercedes, Michelin,
// MOL Group, SEAT/CUPRA, Audi) to existing ontology pairs.
//
// Mapping per Chris's guidance + brief content:
//   - Infineon SiC components → silicon_carbide_power_electronics × passenger_car_electrification (primary)
//   - Infineon SiC charging-tangent → silicon_carbide × ev_charging_infrastructure (secondary)
//   - Infineon auto-semi components → automotive_grade_semiconductors × passenger_car_electrification (primary)
//   - Mercedes MB.OS components → software_defined_vehicle_platform × OEM software platform (primary)
//   - Mercedes MB.OS components → SDV × passenger_car_electrification (secondary)
//   - Mercedes OTA component → automotive_ota_update_platform × OEM software platform (primary)
//   - Mercedes premium-BEV exposure → battery_electric_vehicle_platform × premium_ev_market (exposure_only)
//   - Michelin EV tyre demand exposure → battery_electric_vehicle_platform × passenger_car_electrification (exposure_only)
//   - SEAT/CUPRA MEB cell production → BEV × passenger (primary)
//   - SEAT/CUPRA MEB cell production → LFP × passenger (secondary)
//   - Audi PPE 800V charging → SiC × passenger (secondary)
//
// Note: Michelin has NO direct ontology coverage — current mobility ontology has no tyre pairs.
//       EV-tyre demand is recorded as exposure_only to BEV × passenger.
//       Tyre-specific pairs flagged for next session (see _next.md / MASTER.md sec.13).
//
// Run:
//   node db/population/P4_component_pair_links.mjs           # dry-run
//   node db/population/P4_component_pair_links.mjs --commit  # write to PG

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
async function loadEnv(p){if(!existsSync(p))return; for(const l of (await readFile(p,'utf8')).split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const eq=t.indexOf('=');if(eq<0)continue;const k=t.slice(0,eq).trim(),v=t.slice(eq+1).trim().replace(/^["']|["']$/g,'');if(!process.env[k])process.env[k]=v;}}
await loadEnv(join(__dirname,'..','.env'));
await loadEnv(join(__dirname,'..','..','n8n','.env'));

const COMMIT = process.argv.includes('--commit');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

// component_name, owning_company, target_pair_label, role, reasoning
const LINKS = [
  // Infineon → SiC × passenger (primary)
  { component: 'STMICRO_CATANIA_SIC_FAB_RAMP', company: 'Infineon Technologies AG',
    pair: 'SiC power electronics × passenger car electrification',
    role: 'primary',
    reason: 'STMicro Catania SiC fab ramp directly informs the SiC × passenger pair horizon assessment — competitive supply expansion is the structural force on the pair.' },
  { component: 'CHINESE_IDM_SIC_QUALIFICATION', company: 'Infineon Technologies AG',
    pair: 'SiC power electronics × passenger car electrification',
    role: 'primary',
    reason: 'Chinese IDM (BYD Semi, CRRC) automotive SiC qualification status is a primary indicator for the global SiC × passenger pair — non-Chinese qualification breakouts shift competitive dynamics.' },
  { component: 'SIC_WAFER_PRICE_TRAJECTORY', company: 'Infineon Technologies AG',
    pair: 'SiC power electronics × passenger car electrification',
    role: 'primary',
    reason: 'SiC wafer price is the principal economics driver for the pair; trajectory shapes commercial economics across the entire SiC × passenger market.' },
  { component: 'EUROPEAN_OEM_SIC_DUAL_SOURCING', company: 'Infineon Technologies AG',
    pair: 'SiC power electronics × passenger car electrification',
    role: 'secondary',
    reason: 'European OEM dual-sourcing is an indicator at the customer-side rather than supply-side; secondary anchor.' },

  // Infineon → auto-semis × passenger (primary)
  { component: 'INFINEON_AUTO_BOOK_TO_BILL', company: 'Infineon Technologies AG',
    pair: 'Automotive-grade semiconductors × passenger car electrification',
    role: 'primary',
    reason: 'Infineon book-to-bill is a primary supplier-side indicator for the auto-semi × passenger pair recovery cycle.' },
  { component: 'TIER1_INVENTORY_WEEKS_OF_SUPPLY', company: 'Infineon Technologies AG',
    pair: 'Automotive-grade semiconductors × passenger car electrification',
    role: 'primary',
    reason: 'Tier-1 inventory weeks is the demand-side indicator for the auto-semi × passenger pair recovery cycle.' },
  { component: 'GLOBAL_EV_PRODUCTION_VOLUME_2026', company: 'Infineon Technologies AG',
    pair: 'Automotive-grade semiconductors × passenger car electrification',
    role: 'secondary',
    reason: 'Global EV production volume is a structural demand driver for auto-semi × passenger; secondary because it spans more than auto-semi.' },

  // Mercedes-Benz → SDV × OEM platform (primary)
  { component: 'MB_OS_PRODUCTION_ROLLOUT', company: 'Mercedes-Benz',
    pair: 'Software-defined vehicle platform × OEM vehicle software platform',
    role: 'primary',
    reason: 'MB.OS is Mercedes\' primary instance of the SDV × OEM software platform pair.' },
  { component: 'MB_OS_THIRD_PARTY_DEVELOPER_PIPELINE', company: 'Mercedes-Benz',
    pair: 'Software-defined vehicle platform × OEM vehicle software platform',
    role: 'primary',
    reason: 'Third-party developer ecosystem is a primary structural feature of the SDV × OEM software platform pair.' },

  // Mercedes-Benz → SDV × passenger (secondary)
  { component: 'MB_OS_PRODUCTION_ROLLOUT', company: 'Mercedes-Benz',
    pair: 'Software-defined vehicle platform × passenger car electrification',
    role: 'secondary',
    reason: 'MB.OS rollout to passenger BEVs is the application-side instance of SDV × passenger; secondary because the primary anchor for Mercedes is OEM platform layer.' },

  // Mercedes-Benz → OTA × OEM platform (primary)
  { component: 'MERCEDES_OTA_SOFTWARE_REVENUE', company: 'Mercedes-Benz',
    pair: 'OTA software update platform × OEM vehicle software platform',
    role: 'primary',
    reason: 'Mercedes OTA revenue is a primary instance of the OTA × OEM software platform pair.' },

  // Mercedes-Benz → BEV × premium (exposure_only)
  // Note: Mercedes' MBG-01 hypothesis is ANTI-electrification — the brief frames Mercedes as
  // hedging against premium-BEV penetration. So exposure_only role accurately captures the
  // posture: Mercedes is exposed to BEV × premium movement without being a primary instance.
  { component: 'EUROPEAN_PREMIUM_BEV_PENETRATION', company: 'Mercedes-Benz',
    pair: 'BEV platform × passenger car electrification',
    role: 'exposure_only',
    reason: 'Mercedes is structurally exposed to premium BEV penetration without being a primary instance — MBG-01 hedge against electrification means component is exposed-to rather than instance-of.' },

  // SEAT/CUPRA → BEV × passenger (primary)
  { component: 'POWERCO_SAGUNT_CELL_PRODUCTION', company: 'SEAT / CUPRA',
    pair: 'BEV platform × passenger car electrification',
    role: 'primary',
    reason: 'PowerCo Sagunt cell production is a primary feeder for SEAT/CUPRA MEB-based passenger BEV instances.' },
  { component: 'SEAT_CUPRA_BATTERY_LOCALISATION', company: 'SEAT / CUPRA',
    pair: 'BEV platform × passenger car electrification',
    role: 'primary',
    reason: 'Spanish localisation rate of vehicle BOM is a primary indicator of MEB-based BEV passenger anchoring.' },

  // SEAT/CUPRA → LFP × passenger (secondary)
  { component: 'POWERCO_SAGUNT_CELL_PRODUCTION', company: 'SEAT / CUPRA',
    pair: 'LFP battery chemistry × passenger car electrification',
    role: 'secondary',
    reason: 'PowerCo Unified Cell LFP variant produced at Salzgitter (and likely Sagunt) feeds entry-level CUPRA / SEAT MEB BEVs.' },

  // Audi → SiC × passenger (secondary)
  { component: 'PPE_800V_CHARGING_PERFORMANCE', company: 'Audi AG',
    pair: 'SiC power electronics × passenger car electrification',
    role: 'secondary',
    reason: 'PPE 800V architecture relies on SiC power electronics for switching efficiency — PPE platform is an instance customer of the SiC × passenger pair.' },

  // Audi → SDV × passenger (secondary)
  { component: 'PPE_800V_CHARGING_PERFORMANCE', company: 'Audi AG',
    pair: 'Software-defined vehicle platform × passenger car electrification',
    role: 'secondary',
    reason: 'PPE platform vehicles run on CARIAD SDV stack; secondary linkage via shared platform.' },

  // Michelin → BEV × passenger (exposure_only — tyre demand depends on EV fleet)
  { component: 'GLOBAL_EV_FLEET_TRAJECTORY', company: 'Michelin Group',
    pair: 'BEV platform × passenger car electrification',
    role: 'exposure_only',
    reason: 'Michelin EV-tyre demand is structurally exposed to global EV fleet trajectory; component is exposed-to (replacement-tyre demand follows fleet) rather than instance-of (Michelin is not a BEV platform supplier). NOTE: ontology has no tyre-specific pair; flagged in MASTER.md sec.13 for next session.' },
];

const componentLookup = async (name, companyName) => {
  const r = await c.query(`
    SELECT comp.id FROM catalogue.components comp
    JOIN catalogue.initiatives_v2 iv ON iv.id = comp.initiative_id
    JOIN catalogue.companies co ON co.id = iv.company_id
    WHERE comp.name = $1 AND co.name = $2
    ORDER BY comp.id
    LIMIT 1
  `, [name, companyName]);
  return r.rows[0]?.id ?? null;
};

const pairLookup = async (label) => {
  const r = await c.query(`SELECT id FROM technology_application_pairs WHERE pair_label = $1 LIMIT 1`, [label]);
  return r.rows[0]?.id ?? null;
};

console.log(`=== P4 component_pair_links — Mode: ${COMMIT ? 'COMMIT' : 'DRY-RUN'} ===`);
let inserted = 0, reused = 0, errors = 0;

if (COMMIT) await c.query('BEGIN');
try {
  for (const link of LINKS) {
    const compId = await componentLookup(link.component, link.company);
    const pairId = await pairLookup(link.pair);
    if (!compId) {
      console.log(`  [SKIP] component not found: ${link.component} in ${link.company}`);
      errors++;
      continue;
    }
    if (!pairId) {
      console.log(`  [SKIP] pair not found: ${link.pair}`);
      errors++;
      continue;
    }
    const exists = await c.query(`SELECT id FROM component_pair_links WHERE component_id = $1 AND pair_id = $2`, [compId, pairId]);
    if (exists.rows[0]) {
      console.log(`  [reuse] ${link.component} → ${link.pair.slice(0, 60)}  (role=${link.role})`);
      reused++;
      continue;
    }
    if (COMMIT) {
      await c.query(`
        INSERT INTO component_pair_links (component_id, pair_id, link_role, reasoning_text, source_citation)
        VALUES ($1, $2, $3, $4, $5)
      `, [compId, pairId, link.role, link.reason, 'P4_component_pair_links']);
      console.log(`  [insert] ${link.component} → ${link.pair.slice(0, 60)}  (role=${link.role})`);
    } else {
      console.log(`  [would-insert] ${link.component} → ${link.pair.slice(0, 60)}  (role=${link.role})`);
    }
    inserted++;
  }
  if (COMMIT) await c.query('COMMIT');
} catch (err) {
  if (COMMIT) await c.query('ROLLBACK').catch(()=>{});
  console.error('ERROR:', err.message);
  process.exit(2);
}
console.log(`\nLinks: inserted=${inserted}, reused=${reused}, errors=${errors}, total=${LINKS.length}`);
await c.end();
