#!/usr/bin/env node
/**
 * AI Platform Control Center — Model Deprecation Scraper
 * Fetches deprecation dates from AWS Bedrock and Google Vertex AI docs.
 * Run: node scripts/scrape-deprecations.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'model-deprecations.json');

const SOURCES = {
  aws: 'https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle.html',
  google: 'https://cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versioning',
};

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AI-Platform-Scraper/1.0)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseDate(str) {
  if (!str) return null;
  // Try common formats: "April 30, 2025", "2025-04-30", "Apr 30, 2025"
  const d = new Date(str.trim());
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return null;
}

function scrapeAWS(html) {
  const models = [];
  // Look for table rows with model info and dates
  // AWS page typically has tables with | Model ID | Deprecation date | End of life date |
  const tableRegex = /<tr[\s\S]*?<\/tr>/gi;
  const tables = html.match(tableRegex) || [];

  for (const row of tables) {
    // Extract cell text
    const cells = (row.match(/<td[\s\S]*?<\/td>/gi) || [])
      .map(td => td.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

    if (cells.length < 3) continue;

    // Look for rows that contain model IDs (contain "anthropic" or "amazon" or "meta" etc)
    const modelCell = cells.find(c => /anthropic\.|amazon\.|meta\.|ai21\.|cohere\.|mistral\./i.test(c));
    if (!modelCell) continue;

    // Find date-like cells
    const dateCells = cells.filter(c => /\d{4}/.test(c) && /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4}-\d{2}-\d{2}/i.test(c));
    if (dateCells.length < 1) continue;

    const deprecationDate = parseDate(dateCells[0]);
    const eolDate = parseDate(dateCells[1] || dateCells[0]);

    // Extract model name from the row
    const nameCell = cells.find(c => c !== modelCell && c.length > 3 && !/^\d/.test(c)) || modelCell;

    if (deprecationDate) {
      models.push({
        provider: 'AWS Bedrock',
        model_id: modelCell.split(' ')[0].toLowerCase(),
        model_name: nameCell,
        deprecation_date: deprecationDate,
        end_of_life_date: eolDate || deprecationDate,
        status: new Date(deprecationDate) < new Date() ? 'deprecated' : 'active',
        notes: '',
        source_url: SOURCES.aws,
      });
    }
  }

  return models;
}

function scrapeGoogle(html) {
  const models = [];
  const tableRegex = /<tr[\s\S]*?<\/tr>/gi;
  const tables = html.match(tableRegex) || [];

  for (const row of tables) {
    const cells = (row.match(/<td[\s\S]*?<\/td>/gi) || [])
      .map(td => td.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim());

    if (cells.length < 2) continue;

    const modelCell = cells.find(c => /gemini|palm|bison|gecko|unicorn|text-/i.test(c));
    if (!modelCell) continue;

    const dateCells = cells.filter(c => /\d{4}/.test(c) && /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4}-\d{2}-\d{2}/i.test(c));
    if (dateCells.length < 1) continue;

    const deprecationDate = parseDate(dateCells[0]);
    const eolDate = parseDate(dateCells[1] || dateCells[0]);

    if (deprecationDate) {
      models.push({
        provider: 'Google Vertex AI',
        model_id: modelCell.split(' ')[0].toLowerCase(),
        model_name: modelCell,
        deprecation_date: deprecationDate,
        end_of_life_date: eolDate || deprecationDate,
        status: new Date(deprecationDate) < new Date() ? 'deprecated' : 'active',
        notes: '',
        source_url: SOURCES.google,
      });
    }
  }

  return models;
}

function mergeModels(existing, scraped) {
  const map = {};
  // Start with existing
  for (const m of existing) map[m.model_id] = { ...m };
  // Overlay scraped (update dates if found, keep manual entries)
  for (const m of scraped) {
    if (map[m.model_id]) {
      // Update dates from scrape but keep manual overrides if scrape found nothing new
      map[m.model_id] = { ...map[m.model_id], ...m, notes: map[m.model_id].notes };
    } else {
      map[m.model_id] = m;
    }
  }
  return Object.values(map).sort((a, b) => a.deprecation_date.localeCompare(b.deprecation_date));
}

async function main() {
  console.log('🔍 Scraping AWS Bedrock deprecation dates...');
  let awsModels = [];
  try {
    const awsHtml = await fetchPage(SOURCES.aws);
    awsModels = scrapeAWS(awsHtml);
    console.log(`  ✅ AWS: found ${awsModels.length} model entries`);
  } catch (err) {
    console.error(`  ❌ AWS scrape failed: ${err.message}`);
    // TODO: SLACK — post failure alert when webhook is set up
    process.exitCode = 1;
  }

  console.log('🔍 Scraping Google Vertex AI deprecation dates...');
  let googleModels = [];
  try {
    const googleHtml = await fetchPage(SOURCES.google);
    googleModels = scrapeGoogle(googleHtml);
    console.log(`  ✅ Google: found ${googleModels.length} model entries`);
  } catch (err) {
    console.error(`  ❌ Google scrape failed: ${err.message}`);
    // TODO: SLACK — post failure alert when webhook is set up
    process.exitCode = 1;
  }

  // Load existing data
  const existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const merged = mergeModels(existing.models, [...awsModels, ...googleModels]);

  const updated = {
    last_updated: new Date().toISOString(),
    scrape_status: process.exitCode === 1 ? 'partial_failure' : 'success',
    models: merged,
  };

  fs.writeFileSync(DATA_FILE, JSON.stringify(updated, null, 2));
  console.log(`\n✅ Updated ${DATA_FILE} with ${merged.length} models`);

  if (process.exitCode === 1) {
    console.warn('\n⚠️  One or more scrapers failed — some data may be stale. Check output above.');
  }
}

main().catch(err => {
  console.error('Fatal scrape error:', err);
  // TODO: SLACK — post failure alert when webhook is set up
  process.exit(1);
});
