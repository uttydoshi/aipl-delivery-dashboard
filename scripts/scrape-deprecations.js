#!/usr/bin/env node
/**
 * AI Platform Control Center — Model Deprecation Scraper (Playwright)
 * Uses headless Chromium to scrape AWS and Google docs pages.
 * Run: node scripts/scrape-deprecations.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'model-deprecations.json');

const SOURCES = {
  awsLifecycle:   'https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle.html',
  awsFoundations: 'https://docs.aws.amazon.com/bedrock/latest/userguide/foundation-models.html',
  google:         'https://cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versioning',
};

// ─────────────────────────────────────────────
// Date parsing helpers
// ─────────────────────────────────────────────
function parseDate(str) {
  if (!str) return null;
  const s = str.trim();
  if (!s || s === 'N/A' || s === '—' || /no retirement/i.test(s)) return '9999-12-31';
  // "Not before October 16, 2026" → use that date
  const notBefore = s.match(/not before (.+)/i);
  if (notBefore) return parseDate(notBefore[1]);
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
  }
  return null;
}

// ─────────────────────────────────────────────
// AWS Bedrock — model lifecycle page
// ─────────────────────────────────────────────
async function scrapeAwsLifecycle(page) {
  console.log('  → Fetching AWS lifecycle page...');
  await page.goto(SOURCES.awsLifecycle, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('table', { timeout: 15000 });

  const models = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('table').forEach(table => {
      const headers = [...table.querySelectorAll('th')].map(th => th.innerText.trim().toLowerCase());
      if (!headers.some(h => /deprecat|lifecycle|end.of.life|eol/i.test(h))) return;

      table.querySelectorAll('tbody tr').forEach(row => {
        const cells = [...row.querySelectorAll('td')].map(td => td.innerText.trim());
        if (cells.length < 2) return;
        results.push({ cells, headers });
      });
    });
    return results;
  });

  return models.map(({ cells, headers }) => {
    const get = keywords => {
      const idx = headers.findIndex(h => keywords.some(k => h.includes(k)));
      return idx >= 0 ? cells[idx] : '';
    };
    const modelId = (get(['model id', 'model name', 'id']) || cells[0]).toLowerCase().trim();
    const deprecationRaw = get(['deprecat']) || get(['end of support']) || '';
    const eolRaw = get(['end of life', 'eol']) || deprecationRaw;
    const deprecationDate = parseDate(deprecationRaw);
    if (!deprecationDate || !modelId) return null;

    return {
      provider: 'AWS Bedrock',
      model_id: modelId,
      model_name: cells[0],
      deprecation_date: deprecationDate,
      end_of_life_date: parseDate(eolRaw) || deprecationDate,
      status: deprecationDate < new Date().toISOString().split('T')[0] ? 'deprecated' : 'active',
      notes: '',
      source_url: SOURCES.awsLifecycle,
    };
  }).filter(Boolean);
}

// ─────────────────────────────────────────────
// AWS Bedrock — foundation models page
// (secondary source — catches models not on lifecycle page)
// ─────────────────────────────────────────────
async function scrapeAwsFoundations(page) {
  console.log('  → Fetching AWS foundation models page...');
  await page.goto(SOURCES.awsFoundations, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('table', { timeout: 15000 });

  return page.evaluate((sourceUrl) => {
    const results = [];
    document.querySelectorAll('table').forEach(table => {
      const headers = [...table.querySelectorAll('th')].map(th => th.innerText.trim().toLowerCase());
      if (!headers.some(h => /model/i.test(h))) return;

      table.querySelectorAll('tbody tr').forEach(row => {
        const cells = [...row.querySelectorAll('td')].map(td => td.innerText.trim());
        if (cells.length < 2) return;

        // Look for cells containing deprecation/EOL info
        const hasDeprecationInfo = cells.some(c => /deprecat|end.of.life|lifecycle/i.test(c));
        if (!hasDeprecationInfo) return;

        const modelCell = cells[0];
        results.push({ cells, headers, sourceUrl });
      });
    });
    return results;
  }, SOURCES.awsFoundations);
}

// ─────────────────────────────────────────────
// Google Vertex AI — model versioning page
// Handles JS-rendered tabs
// ─────────────────────────────────────────────
async function scrapeGoogle(page) {
  console.log('  → Fetching Google Vertex AI model versioning page...');
  await page.goto(SOURCES.google, { waitUntil: 'networkidle', timeout: 45000 });

  const models = [];

  // Click through each tab and scrape
  const tabSelectors = [
    null, // first tab is active by default
    'button:has-text("Veo models")',
    'button:has-text("Embeddings models")',
  ];

  for (let i = 0; i < tabSelectors.length; i++) {
    if (tabSelectors[i]) {
      try {
        const tab = await page.$(tabSelectors[i]);
        if (tab) await tab.click();
        await page.waitForTimeout(800);
      } catch { /* tab might not exist */ }
    }

    const tabModels = await page.evaluate((sourceUrl) => {
      const results = [];
      document.querySelectorAll('table').forEach(table => {
        const headers = [...table.querySelectorAll('th')].map(th => th.innerText.trim().toLowerCase());
        if (!headers.some(h => /model/i.test(h))) return;
        // Only tables with retirement/deprecation columns
        if (!headers.some(h => /retir|deprecat|end.of/i.test(h))) return;

        table.querySelectorAll('tbody tr').forEach(row => {
          const cells = [...row.querySelectorAll('td')].map(td => td.innerText.trim());
          if (cells.length < 2) return;

          const get = keywords => {
            const idx = headers.findIndex(h => keywords.some(k => h.includes(k)));
            return idx >= 0 && cells[idx] ? cells[idx] : '';
          };

          const modelId = get(['model id']) || cells[0];
          const retirementRaw = get(['retirement', 'retir', 'deprecat', 'end of life']) || '';
          const upgradeRaw = get(['recommended upgrade', 'upgrade']) || '';

          if (!modelId || !retirementRaw) return;

          results.push({ modelId, retirementRaw, upgradeRaw, sourceUrl });
        });
      });
      return results;
    }, SOURCES.google);

    models.push(...tabModels);
  }

  return models.map(({ modelId, retirementRaw, upgradeRaw, sourceUrl }) => {
    const retirementDate = parseDate(retirementRaw);
    if (!retirementDate) return null;

    const modelIdClean = modelId.trim();
    const nameParts = modelIdClean.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1));
    const modelName = nameParts.join(' ');

    return {
      provider: 'Google Vertex AI',
      model_id: modelIdClean,
      model_name: modelName,
      deprecation_date: retirementDate,
      end_of_life_date: retirementDate,
      status: retirementDate !== '9999-12-31' && retirementDate < new Date().toISOString().split('T')[0] ? 'deprecated' : 'active',
      notes: upgradeRaw ? `Upgrade to ${upgradeRaw}` : (retirementDate === '9999-12-31' ? 'No retirement date announced' : ''),
      source_url: sourceUrl,
    };
  }).filter(Boolean);
}

// ─────────────────────────────────────────────
// Merge scraped into existing (preserve manual overrides)
// ─────────────────────────────────────────────
function mergeModels(existing, scraped) {
  const map = {};
  for (const m of existing) map[m.model_id] = { ...m };
  for (const m of scraped) {
    if (map[m.model_id]) {
      // Update dates from scrape, preserve manual notes
      map[m.model_id] = {
        ...map[m.model_id],
        deprecation_date: m.deprecation_date,
        end_of_life_date: m.end_of_life_date,
        status: m.status,
        source_url: m.source_url,
      };
    } else {
      map[m.model_id] = m;
    }
  }
  return Object.values(map).sort((a, b) => a.deprecation_date.localeCompare(b.deprecation_date));
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

  let awsModels = [];
  let googleModels = [];
  let hasErrors = false;

  // AWS lifecycle page
  try {
    const models = await scrapeAwsLifecycle(page);
    awsModels.push(...models);
    console.log(`  ✅ AWS lifecycle: ${models.length} models found`);
  } catch (err) {
    console.error(`  ❌ AWS lifecycle scrape failed: ${err.message}`);
    hasErrors = true;
    // TODO: SLACK — alert when webhook is set up
  }

  // AWS foundation models page (secondary source)
  try {
    const models = await scrapeAwsFoundations(page);
    console.log(`  ✅ AWS foundation models: ${models.length} additional entries found`);
    // Only add models not already found from lifecycle page
    const existingIds = new Set(awsModels.map(m => m.model_id));
    awsModels.push(...models.filter(m => m && !existingIds.has(m.model_id)));
  } catch (err) {
    console.error(`  ❌ AWS foundation models scrape failed: ${err.message}`);
    // Non-fatal — lifecycle page is primary source
  }

  // Google Vertex AI
  try {
    googleModels = await scrapeGoogle(page);
    console.log(`  ✅ Google: ${googleModels.length} models found`);
  } catch (err) {
    console.error(`  ❌ Google scrape failed: ${err.message}`);
    hasErrors = true;
    // TODO: SLACK — alert when webhook is set up
  }

  await browser.close();

  const existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const scraped = [...awsModels, ...googleModels];

  if (scraped.length === 0) {
    console.error('\n❌ No models scraped from any source. Keeping existing data unchanged.');
    process.exit(1);
  }

  const merged = mergeModels(existing.models, scraped);
  const updated = {
    last_updated: new Date().toISOString(),
    scrape_status: hasErrors ? 'partial_failure' : 'success',
    models: merged,
  };

  fs.writeFileSync(DATA_FILE, JSON.stringify(updated, null, 2));
  console.log(`\n✅ Saved ${merged.length} models to ${DATA_FILE}`);

  if (hasErrors) {
    console.warn('⚠️  Some scrapers failed — data may be partially stale.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  // TODO: SLACK — alert when webhook is set up
  process.exit(1);
});
