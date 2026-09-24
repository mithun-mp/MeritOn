
const Performance = require('../models/Performance');

async function updateRanks(TestId) {
  const testPerformances = await Performance.find({ TestId });

  if (testPerformances.length === 0) return;

  // Sort according to rules: netScore desc, correctCount desc, time asc
  testPerformances.sort((a, b) => {
    if (b.NetScore !== a.NetScore) return b.NetScore - a.NetScore;
    if (b.CorrectCount !== a.CorrectCount) return b.CorrectCount - a.CorrectCount;
    return a.TotalTimeTaken - b.TotalTimeTaken;
  });

  let currentRank = 1;
  const totalCount = testPerformances.length;
  const bulkOps = [];

  for (let i = 0; i < testPerformances.length; i++) {
    const item = testPerformances[i];
    // Handle ties
    if (i > 0) {
      const prev = testPerformances[i-1];
      if (
        item.NetScore < prev.NetScore ||
        item.CorrectCount < prev.CorrectCount ||
        item.TotalTimeTaken > prev.TotalTimeTaken
      ) {
        currentRank = i + 1;
      }
    }
    const percentile = ((totalCount - (currentRank - 1)) / totalCount) * 100;

    bulkOps.push({
      updateOne: {
        filter: { _id: item._id },
        update: {
          $set: {
            Rank: currentRank,
            Percentile: parseFloat(percentile.toFixed(2))
          }
        }
      }
    });
  }

  if (bulkOps.length > 0) {
    await Performance.bulkWrite(bulkOps);
  }
}

module.exports = { updateRanks };
