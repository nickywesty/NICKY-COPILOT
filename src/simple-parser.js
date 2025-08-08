const fs = require('fs');
const path = require('path');

// Simple CSV parser
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',');
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const record = {};

    headers.forEach((header, index) => {
      record[header.trim()] = values[index] ? values[index].trim() : '';
    });

    records.push(record);
  }

  return { headers, records };
}

// Main function
async function processFlips() {
  console.log('🚀 Starting OSRS Flip Tracker...');

  // Try multiple possible paths for the CSV file
  const possiblePaths = [
    path.join(__dirname, '..', 'flips.csv'),  // Project root first
    path.join(__dirname, 'flips.csv'),        // src folder
    'C:\\Users\\nick\\OneDrive\\Documents\\flips.csv',
    'C:\\Users\\nick\\Documents\\flips.csv'
  ];

  let csvText = null;
  let usedPath = null;

  // Try each path until we find the file
  for (const filePath of possiblePaths) {
    try {
      console.log(`🔍 Trying: ${filePath}`);
      csvText = await fs.promises.readFile(filePath, 'utf8');
      usedPath = filePath;
      console.log(`✅ Found CSV file at: ${filePath}`);
      break;
    } catch (err) {
      console.log(`❌ Not found: ${filePath}`);
    }
  }

  if (!csvText) {
    console.error('❌ Could not find flips.csv file in any expected location');
    console.log('💡 Please copy your flips.csv file to one of these locations:');
    possiblePaths.forEach(p => console.log(`   - ${p}`));
    return;
  }

  console.log(`📊 CSV file size: ${csvText.length} characters`);

  // Parse the CSV
  const { headers, records } = parseCSV(csvText);
  console.log(`📋 Headers: ${headers.join(', ')}`);
  console.log(`📈 Total records: ${records.length}`);

  // Show some sample data
  console.log(`📋 Sample record:`, records[0]);

  // Filter for completed flips only
  const completedFlips = records.filter(record => {
    const profit = parseFloat(record['Profit']) || 0;
    const status = record['Status'];
    const lastSellTime = record['Last sell time'];

    return profit > 0 && lastSellTime && status !== 'BUYING';
  });

  console.log(`✅ Completed flips: ${completedFlips.length}`);
  console.log(`⏭️  Skipped (incomplete/buying): ${records.length - completedFlips.length}`);

  // Show top 5 most profitable flips
  const topFlips = [...completedFlips]
    .sort((a, b) => parseFloat(b['Profit']) - parseFloat(a['Profit']))
    .slice(0, 5);

  console.log(`🔥 Top 5 Most Profitable Flips:`);
  topFlips.forEach((flip, i) => {
    console.log(`   ${i + 1}. ${flip['Item']}: ${parseFloat(flip['Profit']).toLocaleString()} GP`);
  });

  // Calculate basic stats
  const totalProfit = completedFlips.reduce((sum, flip) => {
    return sum + (parseFloat(flip['Profit']) || 0);
  }, 0);

  const uniqueItems = new Set(completedFlips.map(flip => flip['Item'])).size;
  const avgProfit = totalProfit / completedFlips.length;

  // Starting cash and net worth calculation
  const startingCash = 211026040; // 211.026M GP starting cash
  const currentNetWorth = startingCash + totalProfit;

  console.log(`💰 Total Trading Profit: ${totalProfit.toLocaleString()} GP`);
  console.log(`💵 Starting Cash: ${startingCash.toLocaleString()} GP`);
  console.log(`🏦 Current Net Worth: ${currentNetWorth.toLocaleString()} GP`);
  console.log(`📦 Unique Items: ${uniqueItems}`);
  console.log(`⭐ Average Profit per Flip: ${avgProfit.toLocaleString()} GP`);

  // Create data directory
  const dataDir = path.join(__dirname, '..', 'data');
  await fs.promises.mkdir(dataDir, { recursive: true });
  console.log(`📁 Created data directory: ${dataDir}`);

  // Save processed data as JSON
  const processedData = {
    meta: {
      totalFlips: completedFlips.length,
      totalTradingProfit: totalProfit,
      startingCash: startingCash,
      currentNetWorth: currentNetWorth,
      uniqueItems: uniqueItems,
      averageProfitPerFlip: avgProfit,
      lastUpdated: new Date().toISOString()
    },
    flips: completedFlips.map(flip => ({
      item: flip['Item'],
      profit: parseFloat(flip['Profit']) || 0,
      sellTime: flip['Last sell time'],
      account: flip['Account'],
      status: flip['Status']
    }))
  };

  const outputPath = path.join(dataDir, 'flips.json');
  await fs.promises.writeFile(outputPath, JSON.stringify(processedData, null, 2));
  console.log(`💾 Saved processed data to: ${outputPath}`);

  console.log('🎉 Processing complete!');
}

// Run if this file is executed directly
if (require.main === module) {
  processFlips().catch(console.error);
}

module.exports = { processFlips };