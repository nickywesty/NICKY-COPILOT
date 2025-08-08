const fs = require('fs');
const path = require('path');
const {
  ensureDir,
  formatDate,
  parseNumber,
  toCSVCell,
} = require('./utils');

/**
 * Recursively collect all .csv flip files from processed directory.
 */
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

/**
 * Parses a processed flip CSV line into an object using the header.
 */
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

async function runItemStats() {
  const processedDir = path.join(__dirname, 'data', 'processed-flips');
  let csvFiles = [];
  try {
    csvFiles = await walkCsvFiles(processedDir);
  } catch (err) {
    return;
  }

  const statsByName = {};

  for (const filePath of csvFiles) {
    const content = await fs.promises.readFile(filePath, 'utf8');
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) continue;

    const header = lines[0].split(',');
    for (let i = 1; i < lines.length; i++) {
      const row = parseProcessedLine(lines[i], header);
      if (!row) continue;

      const itemName = row['item_name']?.trim();
      const profit = parseNumber(row['profit']);
      const spent = parseNumber(row['spent']);
      const closedTime = row['closed_time'];

      if (!itemName) continue;
      if (!statsByName.hasOwnProperty(itemName)) {
        statsByName[itemName] = {
          item_name: itemName,
          flips: 0,
          totalProfit: 0,
          totalSpent: 0,
          lastFlipped: null,
        };
      }

      const stat = statsByName[itemName];
      stat.flips += 1;
      stat.totalProfit += profit;
      stat.totalSpent += spent;

      const closedDate = new Date(closedTime);
      if (!stat.lastFlipped || closedDate > stat.lastFlipped) {
        stat.lastFlipped = closedDate;
      }
    }
  }

  const statsArray = Object.values(statsByName).sort((a, b) => b.totalProfit - a.totalProfit);
  const headerCols = [
    'item_name',
    'flips',
    'total_profit',
    'total_spent',
    'roi_percent',
    'avg_profit_per_flip',
    'last_flipped',
  ];

  let output = headerCols.join(',') + '\n';
  for (const stat of statsArray) {
    const roiPercent = stat.totalSpent === 0 ? 0 : (stat.totalProfit / stat.totalSpent) * 100;
    const avgProfit = stat.flips === 0 ? 0 : (stat.totalProfit / stat.flips);
    const lastFlippedDate = stat.lastFlipped ? formatDate(stat.lastFlipped) : '';
    const row = [
      toCSVCell(stat.item_name),
      toCSVCell(stat.flips),
      toCSVCell(stat.totalProfit),
      toCSVCell(stat.totalSpent),
      toCSVCell(roiPercent),
      toCSVCell(avgProfit),
      toCSVCell(lastFlippedDate),
    ];
    output += row.join(',') + '\n';
  }

  const outDir = path.join(__dirname, 'data');
  await ensureDir(outDir);
  const outPath = path.join(outDir, 'item-stats.csv');
  await fs.promises.writeFile(outPath, output, 'utf8');
}

module.exports = {
  runItemStats,
};