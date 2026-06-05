#!/usr/bin/env node
/**
 * AI Platform Control Center — Deprecation Checker
 * Checks model-deprecations.json for models within 90 days of deprecation.
 * Run: node scripts/check-deprecations.js
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'model-deprecations.json');
const SLACK_CHANNEL = 'temp_help_ai_platform'; // Easy to change
const WARNING_DAYS = 90;
const URGENT_DAYS = 30;

// TODO: SLACK — set this from environment variable SLACK_WEBHOOK_URL when ready
// const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

function daysUntil(dateStr) {
  if (!dateStr || dateStr === '9999-12-31') return 99999;
  const target = new Date(dateStr); // handles "dd-Mon-yyyy" and "yyyy-mm-dd"
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function urgencyEmoji(days) {
  if (days < 0) return '💀';
  if (days <= URGENT_DAYS) return '🔴';
  if (days <= WARNING_DAYS) return '🟠';
  return '🟢';
}

// TODO: SLACK — uncomment when SLACK_WEBHOOK_URL is available
// async function postToSlack(message) {
//   if (!SLACK_WEBHOOK_URL) { console.warn('No SLACK_WEBHOOK_URL set'); return; }
//   const https = require('https');
//   const url = new URL(SLACK_WEBHOOK_URL);
//   const body = JSON.stringify({
//     channel: `#${SLACK_CHANNEL}`,
//     text: message,
//     unfurl_links: false,
//   });
//   return new Promise((resolve, reject) => {
//     const req = https.request({ hostname: url.hostname, path: url.pathname, method: 'POST',
//       headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
//     }, res => { res.resume(); resolve(res.statusCode); });
//     req.on('error', reject);
//     req.write(body);
//     req.end();
//   });
// }

function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const models = data.models || [];

  const approaching = models
    .filter(m => {
      const days = daysUntil(m.deprecation_date);
      return days >= 0 && days <= WARNING_DAYS;
    })
    .sort((a, b) => daysUntil(a.deprecation_date) - daysUntil(b.deprecation_date));

  const alreadyDeprecated = models.filter(m => daysUntil(m.deprecation_date) < 0);

  console.log(`\n📋 Model Deprecation Report — ${new Date().toDateString()}`);
  console.log(`   Data last updated: ${data.last_updated}`);
  console.log(`   Scrape status: ${data.scrape_status}`);
  console.log('');

  if (approaching.length === 0) {
    console.log('✅ No models deprecating within the next 90 days.\n');
  } else {
    console.log(`⚠️  ${approaching.length} model(s) deprecating within ${WARNING_DAYS} days:\n`);
    for (const m of approaching) {
      const days = daysUntil(m.deprecation_date);
      const emoji = urgencyEmoji(days);
      console.log(`  ${emoji} ${m.model_name} (${m.provider})`);
      console.log(`     Model ID: ${m.model_id}`);
      console.log(`     Deprecation: ${m.deprecation_date} (${days} days away)`);
      console.log(`     EOL: ${m.end_of_life_date}`);
      if (m.notes) console.log(`     Notes: ${m.notes}`);
      console.log('');
    }

    // TODO: SLACK — build and send message when webhook is ready
    // const lines = approaching.map(m => {
    //   const days = daysUntil(m.deprecation_date);
    //   return `${urgencyEmoji(days)} *${m.model_name}* (${m.provider}) — deprecates *${m.deprecation_date}* (${days} days)`;
    // });
    // const msg = `*⏰ LLM Model Deprecation Alert*\n${lines.join('\n')}\n<${data.models[0]?.source_url}|View docs>`;
    // await postToSlack(msg);
  }

  if (alreadyDeprecated.length > 0) {
    console.log(`💀 ${alreadyDeprecated.length} model(s) already past deprecation date — may want to remove from JSON.`);
    for (const m of alreadyDeprecated) {
      console.log(`   - ${m.model_name} (${m.provider}) — was ${m.deprecation_date}`);
    }
    console.log('');
  }

  // Exit with code 1 if any urgent models found (lets CI flag it)
  if (approaching.some(m => daysUntil(m.deprecation_date) <= URGENT_DAYS)) {
    console.warn('🔴 URGENT: At least one model deprecates within 30 days!\n');
    process.exit(1);
  }
}

main();
