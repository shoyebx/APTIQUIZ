const XP_PER_CORRECT_ANSWER = 10;
const XP_PER_COMPLETED_QUIZ = 25;
const XP_FOR_WIN = 50;
const XP_FOR_PODIUM = 25;
const XP_PER_LEVEL = 250;

const ACHIEVEMENTS = [
  { id: 'first-victory', name: 'First Victory', description: 'Win your first quiz.' },
  { id: 'speed-demon', name: 'Speed Demon', description: 'Answer a question correctly in 5 seconds or less.' },
  { id: 'perfect-accuracy', name: 'Perfect Accuracy', description: 'Answer every question in a quiz correctly.' },
  { id: 'winning-streak', name: 'Winning Streak', description: 'Win three quizzes in a row.' },
  { id: 'quiz-master', name: 'Quiz Master', description: 'Complete 10 quizzes.' },
  { id: 'top-three', name: 'Top 3', description: 'Finish a quiz in the top three.' },
];

function calculateQuizXp(quiz) {
  const correctAnswers = (quiz.answers || []).filter((answer) => answer.correct).length;
  const rankingBonus = quiz.rank === 1 ? XP_FOR_WIN : quiz.rank > 1 && quiz.rank <= 3 ? XP_FOR_PODIUM : 0;
  return correctAnswers * XP_PER_CORRECT_ANSWER + XP_PER_COMPLETED_QUIZ + rankingBonus;
}

function calculateProgression(history = []) {
  const quizzes = [...history].sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime());
  const currentXp = quizzes.reduce((total, quiz) => total + calculateQuizXp(quiz), 0);
  const level = Math.floor(currentXp / XP_PER_LEVEL) + 1;
  const levelNames = [
    { minimum: 1, name: 'Beginner' },
    { minimum: 3, name: 'Learner' },
    { minimum: 6, name: 'Competitor' },
    { minimum: 10, name: 'Advanced Competitor' },
    { minimum: 16, name: 'Expert' },
    { minimum: 25, name: 'Master' },
  ];
  const levelName = [...levelNames].reverse().find((entry) => level >= entry.minimum)?.name || 'Beginner';
  const nextLevelXp = level * XP_PER_LEVEL;
  const currentLevelXp = currentXp % XP_PER_LEVEL;

  const wins = quizzes.filter((quiz) => quiz.rank === 1).length;
  let longestWinStreak = 0;
  let currentWinStreak = 0;
  quizzes.forEach((quiz) => {
    currentWinStreak = quiz.rank === 1 ? currentWinStreak + 1 : 0;
    longestWinStreak = Math.max(longestWinStreak, currentWinStreak);
  });

  const hasPerfectQuiz = quizzes.some((quiz) => {
    const answered = (quiz.answers || []).filter((answer) => answer.responseMs != null);
    return quiz.totalQuestions > 0 && answered.length === quiz.totalQuestions && answered.every((answer) => answer.correct);
  });
  const hasFastCorrectAnswer = quizzes.some((quiz) => (quiz.answers || []).some((answer) => answer.correct && answer.responseMs != null && answer.responseMs <= 5000));
  const unlocked = new Set();
  if (wins > 0) unlocked.add('first-victory');
  if (hasFastCorrectAnswer) unlocked.add('speed-demon');
  if (hasPerfectQuiz) unlocked.add('perfect-accuracy');
  if (longestWinStreak >= 3) unlocked.add('winning-streak');
  if (quizzes.length >= 10) unlocked.add('quiz-master');
  if (quizzes.some((quiz) => quiz.rank > 0 && quiz.rank <= 3)) unlocked.add('top-three');

  return {
    currentXp,
    level,
    levelName,
    xpIntoLevel: currentLevelXp,
    xpForNextLevel: nextLevelXp,
    progressPercent: Math.round((currentLevelXp / XP_PER_LEVEL) * 100),
    wins,
    achievements: ACHIEVEMENTS.map((achievement) => ({
      ...achievement,
      unlocked: unlocked.has(achievement.id),
    })),
  };
}

function calculateStats(history = []) {
  const quizzesPlayed = history.length;
  const scores = history.map((quiz) => quiz.score).filter(Number.isFinite);
  const answers = history.flatMap((quiz) => quiz.answers || []);
  const participatedAnswers = answers.filter((answer) => answer.responseMs != null);
  const correctAnswers = participatedAnswers.filter((answer) => answer.correct).length;
  const responseTotal = participatedAnswers.reduce((total, answer) => total + answer.responseMs, 0);
  const byTopic = new Map();

  history.forEach((quiz) => {
    (quiz.answers || []).forEach((answer) => {
      if (!answer.topic) return;
      const topicStats = byTopic.get(answer.topic) || { total: 0, correct: 0 };
      if (answer.responseMs != null) {
        topicStats.total += 1;
        if (answer.correct) topicStats.correct += 1;
      }
      byTopic.set(answer.topic, topicStats);
    });
  });

  const topicRates = [...byTopic.entries()]
    .filter(([, topic]) => topic.total > 0)
    .map(([name, topic]) => ({ name, accuracy: topic.correct / topic.total, answered: topic.total }));
  const strongestArea = topicRates.length ? [...topicRates].sort((a, b) => b.accuracy - a.accuracy || b.answered - a.answered)[0] : null;
  const weakestArea = topicRates.length ? [...topicRates].sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered)[0] : null;

  return {
    quizzesPlayed,
    averageScore: scores.length ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length) : null,
    bestScore: scores.length ? Math.max(...scores) : null,
    accuracy: participatedAnswers.length ? Math.round((correctAnswers / participatedAnswers.length) * 100) : null,
    averageResponseMs: participatedAnswers.length ? Math.round(responseTotal / participatedAnswers.length) : null,
    wins: history.filter((quiz) => quiz.rank === 1).length,
    totalQuestions: history.reduce((total, quiz) => total + (quiz.totalQuestions || 0), 0),
    totalQuestionsAnswered: participatedAnswers.length,
    correctAnswers,
    strongestArea,
    weakestArea,
  };
}

function calculateRankings(profiles, targetId) {
  const target = profiles.find((profile) => profile.id === targetId);
  if (!target || !target.quizHistory?.length) {
    return { globalRank: null, collegeRank: null, bestRank: null };
  }

  const eligible = profiles
    .map((profile) => ({ profile, progression: calculateProgression(profile.quizHistory || []) }))
    .filter(({ profile, progression }) => profile.id === targetId || progression.currentXp > 0)
    .sort((a, b) => b.progression.currentXp - a.progression.currentXp || a.profile.createdAt.localeCompare(b.profile.createdAt));
  const globalRank = eligible.findIndex(({ profile }) => profile.id === targetId);
  const college = target?.college?.trim().toLocaleLowerCase();
  const collegeEligible = college
    ? eligible.filter(({ profile }) => profile.college?.trim().toLocaleLowerCase() === college)
    : [];
  const collegeRank = college ? collegeEligible.findIndex(({ profile }) => profile.id === targetId) : -1;
  const completedRanks = target.quizHistory.map((quiz) => quiz.rank).filter((rank) => Number.isInteger(rank) && rank > 0);

  return {
    globalRank: globalRank < 0 ? null : globalRank + 1,
    collegeRank: collegeRank < 0 ? null : collegeRank + 1,
    bestRank: completedRanks.length ? Math.min(...completedRanks) : null,
  };
}

module.exports = {
  ACHIEVEMENTS,
  XP_PER_CORRECT_ANSWER,
  XP_PER_COMPLETED_QUIZ,
  XP_FOR_WIN,
  XP_FOR_PODIUM,
  XP_PER_LEVEL,
  calculateQuizXp,
  calculateProgression,
  calculateStats,
  calculateRankings,
};
