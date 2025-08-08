const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  parseCSV,
  ensureDir,
  parseNumber,
  formatDate,
  toCSVCell,
} = require('./utils');

async function runParser() {
  const inputPath = path.resolve(
    process.env.HOME || process.env.USERPROFILE,
    'OneDrive',
    'Documents',
    'flips.csv'
  );

  console.log(`🔍 Looking for CSV at: ${inputPath}`);

  let csvText;
  try {
    csvText = await fs.promises.readFile(inputPath, 'utf8');
    console.log(`✅ Found CSV file! Size: ${csvText.length} characters`);
  } catch (err) {
    console.error(`❌ Could not find flips.csv at: ${inputPath}`);
    console.error('Error details:', err.message);
    throw err;
  }

  const { header, records } = parseCSV(csvText);
  console.log(`📊 Parsed ${records.length} records from CSV`);
  console.log(`📋 Headers: ${header.join(', ')}`);

  if (header.length === 0) {
    console.warn('No data found in input CSV.');
    return;
  }

  const flipIndexPath = path.join(__dirname, 'data', 'flip-index.json');
  let flipIndex = {};
  try {
    const idxText = await fs.promises.readFile(flipIndexPath, 'utf8');
    flipIndex = JSON.parse(idxText);
  } catch (_) {
    console.log('📝 No existing flip index found, creating new one');
  }

  const flipsByDate = {};
  let processedCount = 0;
  let skippedCount = 0;

  for (const row of records) {
    if (row['deleted'] && String(row['deleted']).toLowerCase() === 'true') {
      console.log(`⏭️ Skipping deleted flip: ${row['Item']}`);
      continue;
    }

    const accountId = row['Account'] || 'default';
    const itemName = row['Item']?.trim();
    const status = row['Status'];
    const openedQuantity = parseNumber(row['Bought']);
    const closedQuantity = parseNumber(row['Sold']);
    const avgBuyPrice = parseNumber(row['Avg. buy price']);
    const avgSellPrice = parseNumber(row['Avg. sell price']);
    const taxPaid = parseNumber(row['Tax']);
    const profit = parseNumber(row['Profit']);
    const openedTimeRaw = row['First buy time'];
    const closedTimeRaw = row['Last sell time'];
    const updatedTimeRaw = closedTimeRaw;

    // ✅ Skip any flips before the official challenge start date
    const challengeStart = new Date("2025-07-28T05:00:00Z")
    const closedDateObj = new Date(closedTimeRaw);
    if (closedDateObj < challengeStart) {
      console.log(`📅 Skipping flip before challenge start: ${itemName}`);
      continue;
    }

    // 🛡️ Safety Check: Ensure item name and timestamps exist
    if (!itemName || (!openedTimeRaw && !closedTimeRaw)) {
      console.error(`❌ Flip row is missing item name or timestamp. Re-export from Copilot before proceeding.`);
      console.error(`Row: ${JSON.stringify(row)}`);
      throw new Error(`❌ Flip row is missing item name or timestamp. Re-export from Copilot before proceeding.\nRow: ${JSON.stringify(row)}`);
    }

    const spent = openedQuantity * avgBuyPrice;
    const receivedPostTax = closedQuantity * avgSellPrice - taxPaid;

    const hashInput = `${accountId}|${itemName}|${status}|${closedQuantity}|${receivedPostTax}|${taxPaid}|${profit}|${closedTimeRaw}`;
    const flipHash = crypto.createHash('sha256').update(hashInput).digest('hex');

    if (flipIndex.hasOwnProperty(flipHash)) {
      skippedCount++;
      continue;
    }

    const closedDate = formatDate(new Date(closedTimeRaw));

    const recordOut = {
      account_id: accountId,
      item_name: itemName,
      status,
      opened_quantity: openedQuantity,
      spent,
      closed_quantity: closedQuantity,
      received_post_tax: receivedPostTax,
      tax_paid: taxPaid,
      profit,
      opened_time: openedTimeRaw,
      closed_time: closedTimeRaw,
      updated_time: updatedTimeRaw,
      flip_hash: flipHash,
    };

    if (!flipsByDate.hasOwnProperty(closedDate)) {
      flipsByDate[closedDate] = [];
    }
    flipsByDate[closedDate].push(recordOut);
    flipIndex[flipHash] = closedDate;
    processedCount++;
  }

  console.log(`📈 Processing summary:`);
  console.log(`   • Processed: ${processedCount} new flips`);
  console.log(`   • Skipped: ${skippedCount} existing flips`);
  console.log(`   • Dates with new flips: ${Object.keys(flipsByDate).length}`);

  const processedBase = path.join(__dirname, 'data', 'processed-flips');
  console.log(`📁 Creating processed files in: ${processedBase}`);

  for (const [dateStr, recordsForDate] of Object.entries(flipsByDate)) {
    const [mm, dd, yyyy] = dateStr.split('-');
    const dirPath = path.join(processedBase, yyyy, mm, dd);
    console.log(`📂 Creating directory: ${dirPath}`);
    await ensureDir(dirPath);

    const filePath = path.join(dirPath, `${dateStr}.csv`);
    let fileExists = false;
    try {
      await fs.promises.access(filePath);
      fileExists = true;
    } catch (_) {}

    const headerCols = [
      'account_id',
      'item_name',
      'status',
      'opened_quantity',
      'spent',
      'closed_quantity',
      'received_post_tax',
      'tax_paid',
      'profit',
      'opened_time',
      'closed_time',
      'updated_time',
      'flip_hash',
    ];

    let output = '';
    if (!fileExists) {
      output += headerCols.join(',') + '\n';
    }

    for (const rec of recordsForDate) {
      const row = headerCols.map(key => toCSVCell(rec[key]));
      output += row.join(',') + '\n';
    }

    console.log(`💾 Writing ${recordsForDate.length} records to: ${filePath}`);
    await fs.promises.appendFile(filePath, output, 'utf8');
  }

  await ensureDir(path.join(__dirname, 'data'));
  await fs.promises.writeFile(flipIndexPath, JSON.stringify(flipIndex, null, 2), 'utf8');
  console.log(`💾 Updated flip index with ${Object.keys(flipIndex).length} total flips`);

  const now = new Date();
  const archiveDate = formatDate(now);
  const [amm, add, ayyy] = archiveDate.split('-');
  const rawDir = path.join(__dirname, 'data', 'raw-input', amm, add);
  await ensureDir(rawDir);
  const archivePath = path.join(rawDir, `copilot-export-${archiveDate}.csv`);
  await fs.promises.writeFile(archivePath, csvText, 'utf8');
  console.log(`📦 Archived original CSV to: ${archivePath}`);

  console.log(`✅ Parser completed successfully!`);
}

module.exports = {
  runParser,
};