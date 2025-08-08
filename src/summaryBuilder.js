const fs = require('fs');
const path = require('path');
const {
  ensureDir,
  formatDate,
  parseNumber,
} = require('./utils');

async function walkCsvFiles(dir, results = []) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkCsvFiles(fullPath, results);
    } else if (entry.isFile() && fullPath.toLowerCase().endsWith('.csv')) {
      results.push(fullPath);
    }
  }
  return results;
}

function parseProcessedLine(line, header) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        cells.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  cells.push(current);
  if (cells.length === 0) return null;
  const obj = {};
  for (let i = 0; i < header.length; i++) {
    obj[header[i]] = cells[i] !== undefined ? cells[i] : '';
  }
  return obj;
}

async function runSummaryBuilder() {
  const processedDir = path.join(__dirname, 'data', 'processed-flips');
  let csvFiles = [];
  try {
    csvFiles = await walkCsvFiles(processedDir);
  } catch (err) {
    return;
  }

  const summaryByDate = {};

  // Inject Day 0 baseline (start of challenge)
  summaryByDate["07-27-2025"] = {
    flips: 0,
    totalProfit: 0,
    totalSpent: 0,
    injected: true,
    items: new Set(),
  };

  for (const filePath of csvFiles) {
    const content = await fs.promises.readFile(filePath, 'utf8');
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) continue;

    const header = lines[0].split(',');
    for (let i = 1; i < lines.length; i++) {
      const rowObj = parseProcessedLine(lines[i], header);
      if (!rowObj) continue;

      const closedTime = rowObj['closed_time'];
      const closedDate = formatDate(new Date(closedTime));
      const itemName = rowObj['item_name']?.trim();
      const profit = parseNumber(rowObj['profit']);
      const spent = parseNumber(rowObj['spent']);

      if (!summaryByDate.hasOwnProperty(closedDate)) {
        summaryByDate[closedDate] = {
          flips: 0,
          totalProfit: 0,
          totalSpent: 0,
          items: new Set(),
        };
      }

      const summary = summaryByDate[closedDate];
      summary.flips += 1;
      summary.totalProfit += profit;
      summary.totalSpent += spent;
      if (itemName) summary.items.add(itemName);
    }
  }

  const dailySummaryDir = path.join(__dirname, 'data', 'daily-summary');
  await ensureDir(dailySummaryDir);

  const sortedDates = Object.keys(summaryByDate).sort((a, b) => {
    const [am, ad, ay] = a.split('-');
    const [bm, bd, by] = b.split('-');
    return new Date(`${ay}-${am}-${ad}`) - new Date(`${by}-${bm}-${bd}`);
  });

  let runningNetWorth = 0;
  const BASELINE_DATE = new Date("2025-07-27");

  for (const dateStr of sortedDates) {
    const summary = summaryByDate[dateStr];

    const itemsFlipped = summary.items instanceof Set ? summary.items.size : 0;
    const flips = summary.flips;
    const profit = summary.totalProfit;
    const gpPerDay = profit;
    const roiPercent = summary.totalSpent === 0 ? 0 : (profit / summary.totalSpent) * 100;
    runningNetWorth += profit;

    const [mm, dd, yyyy] = dateStr.split("-");
    const thisDate = new Date(`${yyyy}-${mm}-${dd}`);
    const day = Math.floor((thisDate - BASELINE_DATE) / (1000 * 60 * 60 * 24));

    const percentToGoal = (runningNetWorth / 2147000000) * 100;
    const previousDateIdx = sortedDates.indexOf(dateStr) - 1;
    const previousDate = sortedDates[previousDateIdx];
    const previousNetWorth = previousDate ? summaryByDate[previousDate].runningNetWorth : 0;
    const percentChange = previousNetWorth === 0 ? 0 : ((runningNetWorth - previousNetWorth) / previousNetWorth) * 100;

    summary.runningNetWorth = runningNetWorth;

    const summaryObj = {
      date: dateStr,
      day,
      flips,
      items_flipped: itemsFlipped,
      profit,
      gp_per_day: gpPerDay,
      roi_percent: roiPercent,
      net_worth: runningNetWorth,
      percent_to_goal: percentToGoal,
      percent_change: percentChange,
    };

    const outPath = path.join(dailySummaryDir, `${dateStr}.json`);
    await fs.promises.writeFile(outPath, JSON.stringify(summaryObj, null, 2), 'utf8');
  }
}

module.exports = {
  runSummaryBuilder,
};
