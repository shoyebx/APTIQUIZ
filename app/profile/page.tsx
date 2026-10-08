'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Award,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Crown,
  Gauge,
  LockKeyhole,
  LogOut,
  Medal,
  Pencil,
  Shield,
  Target,
  Trash2,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { useProfile, type UserProfile } from '@/components/profile-context';

type QuizRecord = {
  id: string;
  name: string;
  roomCode: string;
  playedAt: string;
  totalQuestions: number;
  score: number;
  rank: number;
  answers: Array<{ questionId: string; topic: string; correct: boolean; responseMs: number | null; points: number }>;
};

type HistoryResponse = { items: QuizRecord[]; page: number; pageSize: number; total: number; hasMore: boolean };

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

function formatAverage(value: number | null) {
  return value == null ? '—' : `${(value / 1000).toFixed(1)}s`;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

function quizAccuracy(quiz: QuizRecord) {
  const answered = quiz.answers.filter((answer) => answer.responseMs != null);
  return answered.length ? Math.round((answered.filter((answer) => answer.correct).length / answered.length) * 100) : null;
}

function historyAverage(quiz: QuizRecord) {
  const times = quiz.answers.map((answer) => answer.responseMs).filter((value): value is number => value != null);
  return times.length ? Math.round(times.reduce((sum, value) => sum + value, 0) / times.length) : null;
}

function Metric({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof Trophy }) {
  return <div className="rounded-2xl border border-white/[0.08] bg-[#111a2a] p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-400">{label}</p><Icon className="h-4 w-4 text-indigo-200" /></div><p className="mt-3 text-2xl font-bold text-white">{value}</p><p className="mt-1 text-[10px] text-slate-500">{note}</p></div>;
}

export default function ProfilePage() {
  const router = useRouter();
  const { profile, token, loading, requestSetup, updateProfile, signOut, deleteProfile } = useProfile();
  const [history, setHistory] = useState<QuizRecord[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState<QuizRecord | null>(null);
  const [rankingsOpen, setRankingsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);

  const loadHistory = useCallback(async (page: number) => {
    if (!token) return;
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/profile/me/history?page=${page}&pageSize=10`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load quiz history.');
      const result: HistoryResponse = await response.json();
      setHistory((current) => page === 1 ? result.items : [...current, ...result.items]);
      setHistoryPage(page);
      setHistoryTotal(result.total);
      setHasMore(result.hasMore);
    } catch {
      setSettingsError('Quiz history could not be loaded right now.');
    } finally {
      setHistoryLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadHistory(1);
  }, [loadHistory]);

  const trend = useMemo(() => [...history].reverse().slice(-8), [history]);
  const answered = profile?.stats.totalQuestionsAnswered ?? 0;
  const incorrect = Math.max(0, answered - (profile?.stats.correctAnswers ?? 0));
  const maxScore = Math.max(1, ...trend.map((quiz) => quiz.score));
  const maxResponse = Math.max(1, ...trend.map((quiz) => historyAverage(quiz) ?? 0));

  const updateSetting = async (fields: Partial<Pick<UserProfile, 'profileVisibility' | 'showCollege' | 'showCourse'>>) => {
    setSettingsError('');
    setSettingsBusy(true);
    try {
      await updateProfile(fields);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Could not update profile settings.');
    } finally {
      setSettingsBusy(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteProfile();
      setDeleteOpen(false);
      router.push('/');
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Could not delete this profile.');
      setDeleteOpen(false);
    }
  };

  if (loading) return <div className="profile-page min-h-screen bg-[#090f1d] px-5 py-20 text-center text-slate-400">Loading profile…</div>;

  if (!profile) return (
    <main className="profile-page min-h-screen bg-[#090f1d] px-4 py-12 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-xl rounded-[28px] border border-white/[0.08] bg-[#111a2a] p-7 text-center sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-400/10 text-indigo-200"><Users className="h-6 w-6" /></div>
        <h1 className="mt-5 text-3xl font-black text-white">Build your competitor profile</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">Create a persistent AptiQuiz identity to save your results, track progress, and choose what other players can see.</p>
        <button type="button" onClick={requestSetup} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-400">Create profile <ArrowRight className="h-4 w-4" /></button>
        <a href="/" className="ml-4 text-sm font-medium text-slate-400 hover:text-white">Back home</a>
      </div>
    </main>
  );

  return (
    <main className="profile-page min-h-screen bg-[radial-gradient(ellipse_at_80%_0%,rgba(79,70,229,.15),transparent_35%),#090f1d] px-4 pb-16 pt-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1360px]">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><a href="/" className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-lg font-black text-white">A</a><div><p className="text-sm font-bold text-white">AptiQuiz <span className="font-normal text-slate-500">/ Player profile</span></p><p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Your competitive record</p></div></div>
          <div className="flex items-center gap-2"><a href="/profile/edit" className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-400"><Pencil className="h-3.5 w-3.5" /> Edit profile</a><button type="button" onClick={signOut} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3.5 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/[0.05]"><LogOut className="h-3.5 w-3.5" /> Sign out</button></div>
        </header>

        <section className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="relative overflow-hidden rounded-[28px] border border-indigo-300/15 bg-[radial-gradient(ellipse_at_85%_20%,rgba(79,70,229,.2),transparent_45%),linear-gradient(120deg,#121d34,#101827_70%)] p-5 sm:p-7">
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-br from-indigo-400/25 to-cyan-300/10 text-2xl font-black text-white sm:h-28 sm:w-28">{profile.avatar ? <img src={profile.avatar} alt={`${profile.fullName} avatar`} className="h-full w-full object-cover" /> : initials(profile.fullName)}</div>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-black tracking-tight text-white">{profile.fullName}</h1><span className="rounded-full border border-indigo-200/15 bg-indigo-200/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-indigo-100">Level {profile.progression.level}</span></div><p className="mt-1 text-sm font-medium text-indigo-200">@{profile.username}</p><p className="mt-3 text-sm text-slate-300">{[profile.college, profile.course, profile.branch, profile.yearOfStudy ? `Year ${profile.yearOfStudy}` : '', profile.location].filter(Boolean).join(' · ') || 'Add your college and course to complete your profile.'}</p><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{profile.bio || 'No bio yet.'}</p><p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-slate-500"><CalendarDays className="h-3.5 w-3.5" /> Member since {formatDate(profile.createdAt)}</p></div>
              <a href="/profile/edit" aria-label="Edit profile" className="absolute right-0 top-0 rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/[0.06] sm:static"><Pencil className="h-4 w-4" /></a>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/[0.08] bg-[#111a2a] p-5">
            <div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-200">Competitive level</p><p className="mt-1 text-xl font-bold text-white">{profile.progression.levelName}</p></div><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-300/10 text-amber-200"><Crown className="h-5 w-5" /></div></div>
            <div className="mt-5 flex items-center justify-between text-xs"><span className="font-bold text-white">{profile.progression.currentXp} XP</span><span className="text-slate-500">{profile.progression.xpForNextLevel} XP to level {profile.progression.level + 1}</span></div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-300 transition-all duration-700" style={{ width: `${profile.progression.progressPercent}%` }} /></div>
            <p className="mt-2 text-[10px] text-slate-500">{profile.progression.xpIntoLevel} / 250 XP this level</p>
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/[0.07] pt-4 text-center"><div><p className="text-lg font-bold text-white">{profile.rankings.globalRank ? `#${profile.rankings.globalRank}` : '—'}</p><p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Global</p></div><div><p className="text-lg font-bold text-white">{profile.rankings.collegeRank ? `#${profile.rankings.collegeRank}` : '—'}</p><p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">College</p></div><div><p className="text-lg font-bold text-white">{profile.rankings.bestRank ? `#${profile.rankings.bestRank}` : '—'}</p><p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Best finish</p></div></div>
            {!profile.rankings.globalRank && <p className="mt-3 text-center text-[10px] text-slate-500">Ranking will appear after your first competition.</p>}
          </div>
        </section>

        <div className="mb-6 rounded-2xl border border-indigo-200/10 bg-indigo-300/[0.04] p-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
          <div className="min-w-0"><div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-200">Profile completion</span><span className="font-bold text-indigo-200">{profile.completion.percent}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]"><div className="h-full rounded-full bg-indigo-400 transition-all duration-500" style={{ width: `${profile.completion.percent}%` }} /></div><p className="mt-2 text-[10px] text-slate-500">{profile.completion.missing[0] || 'Your profile is complete.'}</p></div><a href="/profile/edit" className="mt-3 inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-indigo-200 hover:text-white sm:mt-0">Complete profile <ArrowRight className="h-3.5 w-3.5" /></a>
        </div>

        <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <Metric label="Quizzes played" value={profile.stats.quizzesPlayed ? String(profile.stats.quizzesPlayed) : '—'} note={profile.stats.quizzesPlayed ? 'completed' : 'Not enough data yet'} icon={Trophy} />
          <Metric label="Average score" value={profile.stats.averageScore == null ? '—' : String(profile.stats.averageScore)} note={profile.stats.averageScore == null ? 'Not enough data yet' : 'per competition'} icon={Gauge} />
          <Metric label="Best score" value={profile.stats.bestScore == null ? '—' : String(profile.stats.bestScore)} note={profile.stats.bestScore == null ? 'Not enough data yet' : 'personal best'} icon={Crown} />
          <Metric label="Accuracy" value={profile.stats.accuracy == null ? '—' : `${profile.stats.accuracy}%`} note={profile.stats.accuracy == null ? 'Not enough data yet' : 'answered questions'} icon={Target} />
          <Metric label="Avg. response" value={formatAverage(profile.stats.averageResponseMs)} note={profile.stats.averageResponseMs == null ? 'Not enough data yet' : 'per answer'} icon={Clock3} />
          <Metric label="Quiz wins" value={profile.stats.wins ? String(profile.stats.wins) : '—'} note={profile.stats.quizzesPlayed ? 'first-place finishes' : 'Not enough data yet'} icon={Medal} />
          <Metric label="Questions" value={profile.stats.totalQuestionsAnswered ? String(profile.stats.totalQuestionsAnswered) : '—'} note={profile.stats.totalQuestionsAnswered ? `${profile.stats.totalQuestions} in completed quizzes` : 'Not enough data yet'} icon={CircleHelp} />
        </section>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <div className="space-y-5">
            <section className="rounded-[26px] border border-white/[0.08] bg-[#111a2a] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-200">Performance analytics</p><h2 className="mt-1 text-xl font-bold text-white">Your progress over time</h2></div><BarChart3 className="h-5 w-5 text-indigo-200" /></div>
              {history.length < 2 ? <div className="mt-5 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center"><p className="text-sm font-semibold text-white">Complete a few quizzes to unlock performance insights.</p><p className="mt-1 text-xs text-slate-500">Score and accuracy trends appear after more than one saved result.</p></div> : <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div><p className="mb-3 text-xs font-semibold text-slate-300">Score over time</p><div className="flex h-32 items-end gap-2 rounded-xl border border-white/[0.06] bg-[#0d1523] px-3 pb-3 pt-4">{trend.map((quiz) => <div key={quiz.id} className="group flex h-full min-w-0 flex-1 flex-col justify-end" title={`${quiz.name}: ${quiz.score} points`}><div className="w-full rounded-t-md bg-gradient-to-t from-indigo-500 to-cyan-300 transition-all duration-500" style={{ height: `${Math.max(8, (quiz.score / maxScore) * 100)}%` }} /><span className="mt-2 truncate text-center text-[9px] text-slate-500">{formatDate(quiz.playedAt).split(' ').slice(0, 2).join(' ')}</span></div>)}</div></div>
                <div><p className="mb-3 text-xs font-semibold text-slate-300">Accuracy over time</p><div className="space-y-3">{trend.map((quiz) => <div key={quiz.id}><div className="mb-1 flex justify-between text-[10px]"><span className="max-w-[65%] truncate text-slate-400">{quiz.name}</span><span className="font-semibold text-slate-200">{quizAccuracy(quiz) == null ? '—' : `${quizAccuracy(quiz)}%`}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300" style={{ width: `${quizAccuracy(quiz) || 0}%` }} /></div></div>)}</div></div>
                <div className="md:col-span-2"><p className="mb-3 text-xs font-semibold text-slate-300">Average response time</p><div className="flex h-24 items-end gap-2 rounded-xl border border-white/[0.06] bg-[#0d1523] px-3 pb-3 pt-4">{trend.map((quiz) => { const average = historyAverage(quiz); return <div key={quiz.id} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${quiz.name}: ${formatAverage(average)}`}><div className="w-full rounded-t-md bg-gradient-to-t from-cyan-500 to-emerald-300 transition-all duration-500" style={{ height: `${average == null ? 0 : Math.max(8, (average / maxResponse) * 100)}%` }} /><span className="mt-2 truncate text-center text-[9px] text-slate-500">{average == null ? '—' : `${(average / 1000).toFixed(1)}s`}</span></div>; })}</div></div>
                <div className="md:col-span-2"><p className="mb-3 text-xs font-semibold text-slate-300">Correct vs. incorrect</p><div className="flex h-3 overflow-hidden rounded-full bg-rose-400/60"><div className="h-full bg-emerald-400" style={{ width: `${answered ? (profile.stats.correctAnswers / answered) * 100 : 0}%` }} /></div><div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>{profile.stats.correctAnswers} correct</span><span>{incorrect} incorrect · avg {formatAverage(profile.stats.averageResponseMs)}</span></div></div>
              </div>}
              {profile.stats.strongestArea && profile.stats.weakestArea && <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-emerald-300/10 bg-emerald-300/[0.04] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-200">Strongest area</p><p className="mt-2 font-bold text-white">{profile.stats.strongestArea.name}</p><p className="mt-1 text-xs text-slate-400">{Math.round(profile.stats.strongestArea.accuracy * 100)}% accuracy · {profile.stats.strongestArea.answered} answers</p></div><div className="rounded-2xl border border-amber-300/10 bg-amber-300/[0.04] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-200">Needs improvement</p><p className="mt-2 font-bold text-white">{profile.stats.weakestArea.name}</p><p className="mt-1 text-xs text-slate-400">{Math.round(profile.stats.weakestArea.accuracy * 100)}% accuracy · {profile.stats.weakestArea.answered} answers</p></div></div>}
            </section>

            <section className="overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#111a2a]">
              <div className="flex items-end justify-between gap-3 border-b border-white/[0.07] px-5 py-5 sm:px-6"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-200">Your record</p><h2 className="mt-1 text-xl font-bold text-white">Quiz history</h2></div><span className="text-xs text-slate-500">{historyTotal} saved</span></div>
              {history.length ? <div className="divide-y divide-white/[0.06]">{history.map((quiz) => <button key={quiz.id} type="button" onClick={() => setSelectedQuiz(quiz)} className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-white/[0.025] sm:px-6"><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-400/10 text-indigo-200"><Trophy className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{quiz.name}</p><p className="mt-1 text-[10px] text-slate-500">{formatDate(quiz.playedAt)} · Room {quiz.roomCode} · {quiz.totalQuestions} questions</p></div></div><div className="flex items-center gap-4 text-right"><div><p className="text-sm font-bold text-indigo-100">{quiz.score}</p><p className="text-[9px] text-slate-500">score</p></div><div><p className="text-sm font-bold text-white">{quizAccuracy(quiz) == null ? '—' : `${quizAccuracy(quiz)}%`}</p><p className="text-[9px] text-slate-500">accuracy</p></div><div><p className="text-sm font-bold text-white">#{quiz.rank || '—'}</p><p className="text-[9px] text-slate-500">rank</p></div><ChevronDown className="h-4 w-4 -rotate-90 text-slate-500" /></div></button>)}</div> : <div className="px-6 py-10 text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-400/10 text-indigo-200"><Trophy className="h-5 w-5" /></div><p className="mt-3 text-sm font-semibold text-white">No quiz history yet.</p><p className="mt-1 text-xs text-slate-500">Join your first competition to start building your AptiQuiz profile.</p><a href="/" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-200 hover:text-white">Find a quiz <ArrowRight className="h-3.5 w-3.5" /></a></div>}
              {hasMore && <button type="button" disabled={historyLoading} onClick={() => void loadHistory(historyPage + 1)} className="w-full border-t border-white/[0.07] px-5 py-3 text-xs font-semibold text-indigo-200 hover:bg-white/[0.03] disabled:opacity-50">{historyLoading ? 'Loading…' : 'Load more results'}</button>}
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-[26px] border border-white/[0.08] bg-[#111a2a] p-5">
              <div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-200">Milestones</p><h2 className="mt-1 text-lg font-bold text-white">Achievements</h2></div><Award className="h-5 w-5 text-amber-200" /></div>
              <div className="mt-4 space-y-2">{profile.progression.achievements.map((achievement) => <div key={achievement.id} className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${achievement.unlocked ? 'border-amber-200/10 bg-amber-200/[0.04]' : 'border-white/[0.05] bg-[#0d1523] opacity-55'}`}><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${achievement.unlocked ? 'bg-amber-200/10 text-amber-200' : 'bg-white/[0.05] text-slate-500'}`}>{achievement.unlocked ? <Medal className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}</div><div className="min-w-0"><p className="text-xs font-semibold text-white">{achievement.name}</p><p className="mt-0.5 text-[10px] leading-4 text-slate-500">{achievement.description}</p></div>{achievement.unlocked && <Check className="ml-auto h-4 w-4 shrink-0 text-emerald-300" />}</div>)}</div>
              {profile.stats.quizzesPlayed === 0 && <p className="mt-4 text-center text-[10px] text-slate-500">Your achievements will appear here as you compete.</p>}
            </section>

            <section className="rounded-[26px] border border-white/[0.08] bg-[#111a2a] p-5">
              <button type="button" onClick={() => setRankingsOpen((open) => !open)} aria-expanded={rankingsOpen} className="flex w-full items-center justify-between text-left"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-200">Visibility</p><h2 className="mt-1 text-lg font-bold text-white">Profile settings</h2></div><ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${rankingsOpen ? 'rotate-180' : ''}`} /></button>
              {rankingsOpen && <div className="mt-4 space-y-4">{[
                { label: 'Public profile', detail: 'Let players find your public profile.', checked: profile.profileVisibility === 'public', change: (checked: boolean) => updateSetting({ profileVisibility: checked ? 'public' : 'private' }) },
                { label: 'Show college', detail: 'Display your college to other players.', checked: profile.showCollege, change: (checked: boolean) => updateSetting({ showCollege: checked }) },
                { label: 'Show course', detail: 'Display your course and branch publicly.', checked: profile.showCourse, change: (checked: boolean) => updateSetting({ showCourse: checked }) },
              ].map((setting) => <label key={setting.label} className="flex items-start justify-between gap-3"><span><span className="block text-xs font-semibold text-slate-200">{setting.label}</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">{setting.detail}</span></span><input type="checkbox" checked={setting.checked} disabled={settingsBusy} onChange={(event) => void setting.change(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-indigo-400" /></label>)}</div>}
              {settingsError && <p role="alert" className="mt-3 rounded-lg bg-rose-400/10 px-3 py-2 text-[11px] text-rose-200">{settingsError}</p>}
            </section>

            <section className="rounded-[26px] border border-rose-300/10 bg-[#111a2a] p-5">
              <div className="flex items-center gap-2 text-rose-200"><Shield className="h-4 w-4" /><h2 className="text-sm font-bold">Account actions</h2></div>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">This profile has no email login or recovery provider configured. Signing out removes this device&apos;s profile credential.</p>
              <button type="button" onClick={signOut} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/[0.04]"><LogOut className="h-3.5 w-3.5" /> Sign out on this device</button>
              <button type="button" onClick={() => setDeleteOpen(true)} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-300/15 px-3 py-2.5 text-xs font-semibold text-rose-200 hover:bg-rose-300/[0.06]"><Trash2 className="h-3.5 w-3.5" /> Delete profile</button>
            </section>
          </aside>
        </div>
      </div>

      {selectedQuiz && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedQuiz(null); }}><section role="dialog" aria-modal="true" aria-labelledby="history-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[26px] border border-white/10 bg-[#111a2a] p-5 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-200">Room {selectedQuiz.roomCode}</p><h2 id="history-title" className="mt-1 text-xl font-bold text-white">{selectedQuiz.name}</h2><p className="mt-1 text-xs text-slate-500">{formatDate(selectedQuiz.playedAt)} · Rank #{selectedQuiz.rank || '—'}</p></div><button type="button" aria-label="Close history details" onClick={() => setSelectedQuiz(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06]"><X className="h-4 w-4" /></button></div><div className="mt-5 grid grid-cols-3 gap-2"><div className="rounded-xl bg-white/[0.04] p-3"><p className="text-[10px] text-slate-500">Score</p><p className="mt-1 font-bold text-white">{selectedQuiz.score}</p></div><div className="rounded-xl bg-white/[0.04] p-3"><p className="text-[10px] text-slate-500">Accuracy</p><p className="mt-1 font-bold text-white">{quizAccuracy(selectedQuiz) == null ? '—' : `${quizAccuracy(selectedQuiz)}%`}</p></div><div className="rounded-xl bg-white/[0.04] p-3"><p className="text-[10px] text-slate-500">Avg. response</p><p className="mt-1 font-bold text-white">{formatAverage(historyAverage(selectedQuiz))}</p></div></div><div className="mt-5 space-y-2">{selectedQuiz.answers.map((answer, index) => <div key={`${answer.questionId}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-[#0d1523] px-3 py-2.5"><div><p className="text-xs font-semibold text-white">Question {index + 1}</p><p className="text-[10px] text-slate-500">{answer.topic || 'Aptitude'}</p></div><div className="text-right"><p className={`text-xs font-semibold ${answer.responseMs == null ? 'text-slate-500' : answer.correct ? 'text-emerald-200' : 'text-rose-200'}`}>{answer.responseMs == null ? 'No answer' : answer.correct ? 'Correct' : 'Incorrect'}</p><p className="text-[10px] text-slate-500">{formatAverage(answer.responseMs)} · {answer.points} pts</p></div></div>)}</div></section></div>}

      {deleteOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><section role="alertdialog" aria-modal="true" aria-labelledby="delete-title" className="w-full max-w-sm rounded-[24px] border border-rose-300/15 bg-[#111a2a] p-5 shadow-2xl"><h2 id="delete-title" className="text-lg font-bold text-white">Delete your AptiQuiz account?</h2><p className="mt-2 text-sm leading-6 text-slate-400">This action cannot be undone. Your profile and saved quiz history will be permanently removed.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDeleteOpen(false)} className="rounded-xl border border-white/10 px-3.5 py-2.5 text-xs font-semibold text-slate-300">Cancel</button><button type="button" onClick={() => void confirmDelete()} className="rounded-xl bg-rose-500 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-rose-400">Delete profile</button></div></section></div>}
    </main>
  );
}
