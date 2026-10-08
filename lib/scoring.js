function calculateScore({ isCorrect, remainingMs, totalMs, basePoints = 500 }) {
  if (!isCorrect) {
    return 0;
  }

  const safeTotal = Math.max(1, Number(totalMs) || 1);
  const safeRemaining = Math.max(0, Number(remainingMs) || 0);
  const ratio = Math.min(1, Math.max(0, safeRemaining / safeTotal));

  return basePoints + Math.floor(basePoints * ratio);
}

function summarizePlayerStats({ totalQuestions, correct, incorrect, totalResponseMs }) {
  const safeTotal = Math.max(0, Number(totalQuestions) || 0);
  const totalCorrect = Math.max(0, Number(correct) || 0);
  const totalIncorrect = Math.max(0, Number(incorrect) || 0);
  const responseMs = Math.max(0, Number(totalResponseMs) || 0);
  const accuracy = safeTotal > 0 ? Math.round((totalCorrect / safeTotal) * 100) : 0;
  const avgResponseMs = safeTotal > 0 ? Math.round(responseMs / safeTotal) : 0;

  return {
    accuracy,
    avgResponseMs: avgResponseMs,
    correct: totalCorrect,
    incorrect: totalIncorrect,
  };
}

module.exports = {
  calculateScore,
  summarizePlayerStats,
};
