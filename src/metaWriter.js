const fs = require('fs');
const path = require('path');
const {
  formatTimestampWithOffset,
  parseNumber,
} = require('./utils');

async function computeMetaStats() {
  const processedDir = path.join(__dirname, 'data', 'processed-flips');
  let totalFlips = 0;
  let totalProfit = 0;

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.csv')) {
        const content = await fs.promises.readFile(fullPath, 'utf8');
        const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length <= 1) continue;

        const header = lines[0].split(',');
        const profitIndex = header.indexOf('profit');
        if (profitIndex === -1) continue;

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          let inQuotes = false;
          let cellIndex = 0;
          let start = 0;
          let profitValue = '';

          for (let j = 0; j < line.length; j++) {
            const ch = line[j];
            if (inQuotes) {
              if (ch === '"') {
                if (line[j + 1] === '"') {
                  j++;
                } else {
                  inQuotes = false;
                }
              }
            } else {
              if (ch === '"') {
                inQuotes = true;
              } else if (ch === ',') {
                if (cellIndex === profitIndex) {
                  profitValue = line.substring(start, j);
                  break;
                }
                cellIndex++;
                start = j + 1;
              }
            }
          }

          if (profitValue === '' && cellIndex === profitIndex) {
            profitValue = line.substring(start);
          }

          const profitNum = parseNumber(profitValue.replace(/^"|"$|""/g, ''));
          totalProfit += profitNum;
          totalFlips++;
        }
      }
    }
  }

  await walk(processedDir);
  return { totalFlips, totalProfit };
}

async function writeMeta() {
  const { totalFlips, totalProfit } = await computeMetaStats();
  const meta = {
    last_updated: new Date().toISOString(),
    total_flips: totalFlips,
    total_profit: totalProfit,
    net_worth: totalProfit + 1000
  };
  const outDir = path.join(__dirname, 'data');
  await fs.promises.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'meta.json');
  await fs.promises.writeFile(outPath, JSON.stringify(meta, null, 2), 'utf8');
}

async function writeSummaryIndex() {
  const summaryDir = path.join(__dirname, 'data', 'daily-summary');
  let entries;
  try {
    entries = await fs.promises.readdir(summaryDir, { withFileTypes: true });
  } catch (err) {
    const outPath = path.join(__dirname, 'data', 'summary-index.json');
    await fs.promises.writeFile(outPath, JSON.stringify([], null, 2), 'utf8');
    return;
  }

  const dates = entries
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.json'))
    .map(e => e.name.slice(0, -5))
    .sort((a, b) => new Date(a) - new Date(b));

  const outPath = path.join(__dirname, 'data', 'summary-index.json');
  await fs.promises.writeFile(outPath, JSON.stringify(dates, null, 2), 'utf8');
}

module.exports = {
  writeMeta,
  writeSummaryIndex,
};