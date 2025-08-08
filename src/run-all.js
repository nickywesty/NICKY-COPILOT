const { runParser } = require('./parser');
const { runItemStats } = require('./itemStats');
const { runSummaryBuilder } = require('./summaryBuilder');
const { writeMeta, writeSummaryIndex } = require('./metaWriter');
const fs = require('fs');
const path = require('path');

function readMetaSummary() {
  try {
    const metaPath = path.join(__dirname, 'data', 'meta.json');
    const text = fs.readFileSync(metaPath, 'utf8');
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function countItemStats() {
  try {
    const itemStatsPath = path.join(__dirname, 'data', 'item-stats.csv');
    const text = fs.readFileSync(itemStatsPath, 'utf8');
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 1);
    return lines.length - 1;
  } catch {
    return 0;
  }
}

function countSummaries() {
  try {
    const dir = path.join(__dirname, 'data', 'daily-summary');
    return fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.json')).length;
  } catch {
    return 0;
  }
}

function durationMs(start) {
  const ms = Date.now() - start;
  return (ms / 1000).toFixed(2) + 's';
}

async function runAll() {
  console.log("🔄 Starting OSRS Flip Tracker Pipeline...");

  let start;

  start = Date.now();
  await runParser();
  console.log(`✔️ Parsed flips in ${durationMs(start)}`);

  start = Date.now();
  await runItemStats();
  const itemCount = countItemStats();
  console.log(`✔️ Built item stats (${itemCount} items) in ${durationMs(start)}`);

  start = Date.now();
  await runSummaryBuilder();
  const summaryCount = countSummaries();
  console.log(`✔️ Rebuilt daily summaries (${summaryCount} days) in ${durationMs(start)}`);

  start = Date.now();
  await writeMeta();
  await writeSummaryIndex();
  console.log(`✔️ Wrote meta + summary index in ${durationMs(start)}`);

  const meta = readMetaSummary();

  console.log("\n✅ Pipeline Complete:");
  console.log(`• 🧾 Total Flips Processed: ${meta.total_flips ?? "?"}`);
  console.log(`• 💸 Total Profit: ${meta.total_profit?.toLocaleString() ?? "?"} GP`);
  console.log(`• 💰 Current Net Worth: ${meta.net_worth?.toLocaleString() ?? "?"} GP`);
  console.log(`• 📦 Item Stats Count: ${itemCount}`);
  console.log(`• 📊 Daily Summaries Written: ${summaryCount}`);
  console.log(`• 🕒 Last Updated: ${meta.last_updated ?? "?"}`);
}

if (require.main === module) {
  runAll().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  runAll,
};