'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import type { UserProfile } from '@/components/profile-context';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Crown,
  Download,
  ExternalLink,
  MoreHorizontal,
  Radio,
  Share2,
  ShieldCheck,
  TimerReset,
  Trophy,
  Users,
  Wifi,
  X,
} from 'lucide-react';

export type HostPlayer = {
  id: string;
  name: string;
  college?: string;
  score: number;
  answered: boolean;
  connected: boolean;
  lastAnswer?: { optionId?: string; points?: number; responseMs?: number; correct?: boolean } | null;
  isHost?: boolean;
  publicProfile?: { fullName: string; username: string; avatarUrl: string | null; college: string; course: string; level: number; levelName: string } | null;
};

export type HostQuestion = {
  id: string;
  text: string;
  topic?: string;
  difficulty?: string;
  timeLimitMs?: number;
  options: { id: string; text: string }[];
  correctOptionId?: string;
  explanation?: string;
  image?: { url: string; altText?: string } | null;
  table?: { columns: string[]; rows: string[][] } | null;
};

export type HostRoundResult = {
  playerId: string;
  name: string;
  score: number;
  correct: boolean;
  points: number;
  responseMs?: number | null;
  selectedOption?: string | null;
};

export type HostRoundSnapshot = {
  questionIndex: number;
  results: HostRoundResult[];
};

export type HostRoom = {
  id: string;
  code: string;
  hostName: string;
  hostId: string;
  state: 'WAITING' | 'QUESTION_ACTIVE' | 'QUESTION_ENDED' | 'FINISHED';
  questionStartedAt?: number | null;
  questionEndsAt?: number | null;
  questionIndex?: number;
  totalQuestions?: number;
  questionSetId?: string | null;
  questionSetName?: string;
  answerDistribution?: Array<{ optionId: string; count: number }>;
  players: HostPlayer[];
  currentQuestion?: HostQuestion | null;
  leaderboard: Array<{ id: string; name: string; score: number; rank: number; college?: string; answered?: boolean; publicProfile?: HostPlayer['publicProfile'] }>;
  questionResults?: HostRoundResult[] | null;
};

type HostQuizConsoleProps = {
  room: HostRoom;
  connectionState: 'connected' | 'reconnecting' | 'disconnected';
  remainingMs: number;
  roundHistory: HostRoundSnapshot[];
  error: string;
  hostProfile: Pick<UserProfile, 'avatar' | 'username'> | null;
  profileToken: string | null;
  onStart: () => void;
  onLeave: () => void;
  onStartNewQuiz: () => void;
  onSelectQuestionSet: (questionSetId: string | null) => void;
};

type HostQuestionSetSummary = {
  id: string;
  name: string;
  description: string;
  questionCount: number;
  topics: string[];
  difficultyDistribution: Record<string, number>;
  status: string;
};

const connectionStyles = {
  connected: 'bg-emerald-400',
  reconnecting: 'bg-amber-400',
  disconnected: 'bg-rose-400',
};

const connectionLabels = {
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

function formatDuration(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function formatAverage(ms: number | null) {
  return ms == null ? '—' : `${(ms / 1000).toFixed(1)}s`;
}

export default function HostQuizConsole({
  room,
  connectionState,
  remainingMs,
  roundHistory,
  error,
  hostProfile,
  profileToken,
  onStart,
  onLeave,
  onStartNewQuiz,
  onSelectQuestionSet,
}: HostQuizConsoleProps) {
  const [joinUrl, setJoinUrl] = useState('');
  const [toast, setToast] = useState('');
  const [showControls, setShowControls] = useState(false);
  const [dialog, setDialog] = useState<'start' | 'leave' | 'qr' | null>(null);
  const [rankingsOpen, setRankingsOpen] = useState(true);
  const [starting, setStarting] = useState(false);
  const [questionSets, setQuestionSets] = useState<HostQuestionSetSummary[]>([]);
  const [selectedQuestionSetId, setSelectedQuestionSetId] = useState('');
  const [loadingQuestionSets, setLoadingQuestionSets] = useState(false);
  const [questionSetError, setQuestionSetError] = useState('');
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/?room=${encodeURIComponent(room.code)}`);
  }, [room.code]);

  useEffect(() => {
    if (room.state !== 'WAITING' || error) setStarting(false);
  }, [room.state, error]);

  useEffect(() => {
    setSelectedQuestionSetId(room.questionSetId || '');
  }, [room.questionSetId]);

  useEffect(() => {
    if (!profileToken || room.state !== 'WAITING') return;
    let active = true;
    setLoadingQuestionSets(true);
    fetch('/api/question-sets?status=ready', { headers: { Authorization: `Bearer ${profileToken}` }, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load ready question sets.');
        return response.json();
      })
      .then((data: { items: HostQuestionSetSummary[] }) => { if (active) setQuestionSets(data.items); })
      .catch((loadError) => { if (active) setQuestionSetError(loadError instanceof Error ? loadError.message : 'Could not load question sets.'); })
      .finally(() => { if (active) setLoadingQuestionSets(false); });
    return () => { active = false; };
  }, [profileToken, room.state]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const participants = room.players.filter((player) => !player.isHost && player.id !== room.hostId);
  const connectedCount = participants.filter((player) => player.connected).length;
  const answeredCount = participants.filter((player) => player.answered).length;
  const totalQuestions = room.totalQuestions ?? 0;
  const currentQuestionNumber = Math.min((room.questionIndex ?? 0) + 1, Math.max(totalQuestions, 1));
  const questionOptions = room.currentQuestion?.options ?? [];
  const optionCounts = questionOptions.map((option) => ({
    ...option,
    count: room.answerDistribution?.find((entry) => entry.optionId === option.id)?.count || 0,
  }));
  const maxOptionCount = Math.max(1, ...optionCounts.map((option) => option.count));
  const roundResults = room.questionResults ?? [];
  const roundParticipants = roundResults.filter((result) => result.responseMs != null);
  const averageRoundResponse = roundParticipants.length
    ? roundParticipants.reduce((sum, result) => sum + (result.responseMs ?? 0), 0) / roundParticipants.length
    : null;
  const roundTopPerformer = [...roundParticipants].sort((a, b) => b.points - a.points)[0];
  const roundAccuracy = roundParticipants.length
    ? Math.round((roundParticipants.filter((result) => result.correct).length / roundParticipants.length) * 100)
    : 0;
  const selectedSet = questionSets.find((questionSet) => questionSet.id === selectedQuestionSetId) || null;

  const sessionStats = useMemo(() => {
    const byPlayer = new Map<string, { correct: number; participated: number; responseMs: number; responseCount: number }>();
    roundHistory.forEach((round) => {
      round.results.forEach((result) => {
        const stats = byPlayer.get(result.playerId) ?? { correct: 0, participated: 0, responseMs: 0, responseCount: 0 };
        if (result.responseMs != null) {
          stats.participated += 1;
          stats.responseCount += 1;
          stats.responseMs += result.responseMs;
          if (result.correct) stats.correct += 1;
        }
        byPlayer.set(result.playerId, stats);
      });
    });
    return byPlayer;
  }, [roundHistory]);

  const canStart = connectionState === 'connected' && room.state === 'WAITING' && totalQuestions > 0;
  const stateLabel = room.state === 'WAITING'
    ? 'LOBBY OPEN'
    : room.state === 'QUESTION_ACTIVE'
      ? 'LIVE ROUND'
      : room.state === 'QUESTION_ENDED'
        ? 'ROUND COMPLETE'
        : 'COMPETITION COMPLETE';

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  };

  const copyText = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify(successMessage);
    } catch {
      notify('Clipboard access is unavailable in this browser.');
    }
  };

  const shareRoom = async () => {
    const shareData = { title: 'Join my AptiQuiz competition', text: `Join room ${room.code} on AptiQuiz`, url: joinUrl };
    try {
      if (navigator.share) await navigator.share(shareData);
      else await navigator.clipboard.writeText(`${shareData.text}: ${joinUrl}`);
      notify('Room link ready to share.');
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === 'AbortError') return;
      notify('Could not open sharing. Copy the room code instead.');
    }
  };

  const shareResults = async () => {
    const podium = room.leaderboard.slice(0, 3).map((entry) => `${entry.rank}. ${entry.name} — ${entry.score} points`).join('\n');
    const text = `AptiQuiz ${room.code} results\n${podium || 'Competition complete.'}`;
    try {
      if (navigator.share) await navigator.share({ title: 'AptiQuiz results', text });
      else await navigator.clipboard.writeText(text);
      notify('Results ready to share.');
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === 'AbortError') return;
      notify('Could not share results from this browser.');
    }
  };

  const downloadQr = () => {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `aptiquiz-${room.code}-qr.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    notify('QR code downloaded.');
  };

  const handleStart = () => {
    if (!canStart || starting) return;
    setStarting(true);
    setDialog(null);
    onStart();
  };

  const leaveRoom = () => {
    setDialog(null);
    onLeave();
  };

  const progressWidth = totalQuestions ? `${(currentQuestionNumber / totalQuestions) * 100}%` : '0%';

  return (
    <div className="host-console min-h-screen bg-[#090f1d] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#090f1d]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <a href="/" aria-label="AptiQuiz home" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-lg font-black text-white shadow-lg shadow-indigo-950/60">A</a>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-white sm:text-base">AptiQuiz <span className="font-normal text-slate-500">/ Host Console</span></div>
              <div className="mt-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:hidden">
                <span className={`h-1.5 w-1.5 rounded-full ${room.state === 'QUESTION_ACTIVE' ? 'animate-pulse bg-rose-400' : 'bg-cyan-300'}`} />
                {stateLabel}
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 sm:flex">
            <span className={`h-2 w-2 rounded-full ${room.state === 'QUESTION_ACTIVE' ? 'animate-pulse bg-rose-400' : room.state === 'FINISHED' ? 'bg-slate-500' : 'bg-cyan-300'}`} />
            <span className="text-xs font-semibold tracking-[0.14em] text-slate-200">{stateLabel}</span>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <span className={`h-2 w-2 rounded-full ${connectionStyles[connectionState]}`} />
              <span className="text-xs font-medium text-slate-300">{connectionLabels[connectionState]}</span>
            </div>
            <a href="/profile" aria-label="Open host profile" className="hidden h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-indigo-300/20 bg-indigo-400/15 text-xs font-bold text-indigo-100 sm:flex">{hostProfile?.avatar ? <img src={hostProfile.avatar} alt="" className="h-full w-full object-cover" /> : initials(room.hostName)}</a>
            <a href="/profile" className="hidden max-w-28 truncate text-sm font-medium text-slate-200 hover:text-indigo-200 sm:inline">{room.hostName}</a>
            <button type="button" onClick={() => setDialog('leave')} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-rose-400/40 hover:bg-rose-400/10 hover:text-rose-200" aria-label="Leave room">
              <ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Leave room</span>
            </button>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 border-t border-white/[0.06] py-2 text-[11px] font-medium text-slate-400 sm:hidden">
          <span className={`h-2 w-2 rounded-full ${connectionStyles[connectionState]}`} />{connectionLabels[connectionState]}
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-9">
        <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-300">Competition control</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Host Console</h1>
            <p className="mt-2 text-sm text-slate-400">Your room is ready. Bring your competitors in.</p>
          </div>
          <div className="relative flex items-center gap-2 self-start sm:self-auto">
            <button type="button" onClick={() => setShowControls((open) => !open)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]" aria-expanded={showControls}>
              <MoreHorizontal className="h-4 w-4" /> Room controls <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {showControls && (
              <div className="absolute right-0 top-12 z-30 w-52 rounded-2xl border border-white/10 bg-[#111a2a] p-1.5 shadow-2xl shadow-black/40">
                <button type="button" onClick={() => { void copyText(room.code, 'Room code copied!'); setShowControls(false); }} className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-white/[0.07]">Copy room code</button>
                <button type="button" onClick={() => { void shareRoom(); setShowControls(false); }} className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-white/[0.07]">Share room</button>
                <button type="button" onClick={() => { setDialog('qr'); setShowControls(false); }} className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-white/[0.07]">Show QR code</button>
                <div className="my-1 border-t border-white/[0.08]" />
                <button type="button" onClick={() => { setDialog('leave'); setShowControls(false); }} className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-rose-200 hover:bg-rose-400/10">Leave room</button>
              </div>
            )}
          </div>
        </div>

        <section className="mb-5 grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="relative overflow-hidden rounded-[26px] border border-indigo-300/15 bg-[radial-gradient(ellipse_at_80%_20%,rgba(79,70,229,.22),transparent_42%),linear-gradient(120deg,#121d34,#101827_62%,#101a2d)] p-5 shadow-[0_24px_70px_rgba(0,0,0,.18)] sm:p-7">
            <div className="absolute -right-14 -top-20 h-64 w-64 rounded-full border border-indigo-200/[0.06]" />
            <div className="absolute -right-4 -top-10 h-44 w-44 rounded-full border border-indigo-200/[0.07]" />
            <div className="relative flex flex-col justify-between gap-7 sm:flex-row sm:items-end">
              <div>
                <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-200/75"><Radio className="h-3.5 w-3.5" /> Room code</div>
                <div className="font-mono text-5xl font-black tracking-[0.18em] text-white sm:text-6xl">{room.code}</div>
                <p className="mt-3 max-w-lg text-sm leading-6 text-slate-300">Share this code with participants to join the competition.</p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <button type="button" onClick={() => void copyText(room.code, 'Room code copied!')} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-indigo-50"><Copy className="h-4 w-4" /> Copy code</button>
                  <button type="button" onClick={() => void shareRoom()} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"><Share2 className="h-4 w-4" /> Share room</button>
                </div>
              </div>
              <div className="flex items-center gap-3 self-start rounded-2xl border border-white/[0.08] bg-black/15 px-4 py-3 sm:self-auto">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200"><Users className="h-5 w-5" /></div>
                <div><p className="text-2xl font-bold leading-none text-white">{participants.length}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Players joined</p></div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-[26px] border border-white/[0.08] bg-[#111a2a] p-4 sm:p-5">
            <div className="shrink-0 rounded-2xl bg-white p-2.5">
              {joinUrl ? <QRCodeCanvas ref={qrCanvasRef} value={joinUrl} size={112} level="M" includeMargin /> : <div className="h-28 w-28 animate-pulse rounded-lg bg-slate-200" />}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200">Scan to join</p>
              <p className="mt-2 text-sm font-semibold text-white">Open the lobby instantly</p>
              <p className="mt-1 break-all text-[11px] leading-4 text-slate-400">{joinUrl}</p>
              <button type="button" onClick={downloadQr} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-200 transition hover:text-white"><Download className="h-3.5 w-3.5" /> Download QR</button>
            </div>
          </div>
        </section>

        <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'Players', value: participants.length, detail: 'joined', icon: Users, color: 'text-cyan-200' },
            { label: 'Connected', value: connectedCount, detail: 'in room', icon: Wifi, color: 'text-emerald-300' },
            { label: room.state === 'WAITING' ? 'Ready' : 'Answered', value: room.state === 'WAITING' ? '—' : `${answeredCount}/${participants.length}`, detail: room.state === 'WAITING' ? 'readiness not tracked' : 'this question', icon: Check, color: 'text-indigo-200' },
            { label: 'Questions', value: totalQuestions || '—', detail: 'in server set', icon: CircleHelp, color: 'text-amber-200' },
          ].map((stat) => {
            const Icon = stat.icon;
            return <div key={stat.label} className="rounded-2xl border border-white/[0.08] bg-[#101827] px-4 py-4 sm:px-5"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-400">{stat.label}</p><Icon className={`h-4 w-4 ${stat.color}`} /></div><div className="mt-3 flex items-baseline gap-2"><span className="text-2xl font-bold text-white">{stat.value}</span><span className="text-[10px] text-slate-500">{stat.detail}</span></div></div>;
          })}
        </section>

        {room.state === 'FINISHED' ? (
          <section className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
            <div className="rounded-[26px] border border-amber-200/10 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,.12),transparent_60%),#111a2a] p-6 sm:p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-300/10 text-amber-200"><Trophy className="h-6 w-6" /></div>
              <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200">Competition complete</p>
              <h2 className="mt-2 text-3xl font-black text-white">Final results</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">Final scores and ranks are taken directly from the server leaderboard.</p>
              <div className="mt-6 space-y-2">
                {room.leaderboard.slice(0, 3).map((entry, index) => <div key={entry.id} className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-3"><div className="flex items-center gap-3"><span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${index === 0 ? 'bg-amber-300/15 text-amber-200' : 'bg-white/[0.08] text-slate-300'}`}>{index === 0 ? <Crown className="h-4 w-4" /> : `#${entry.rank}`}</span><div><p className="text-sm font-semibold text-white">{entry.name}</p><p className="text-[11px] text-slate-500">{entry.college || 'College not listed'}</p></div></div><span className="text-sm font-bold text-indigo-200">{entry.score} pts</span></div>)}
              </div>
              {roundHistory.length > 0 && <p className="mt-5 text-xs leading-5 text-slate-500">Accuracy and response-time summaries use round results received during this host session ({roundHistory.length} of {totalQuestions} rounds).</p>}
              <div className="mt-6 flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                <button type="button" onClick={onStartNewQuiz} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-400"><Radio className="h-4 w-4" /> Start new quiz</button>
                <button type="button" onClick={() => void shareResults()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06]"><Share2 className="h-4 w-4" /> Share results</button>
                <button type="button" onClick={onLeave} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06]"><ArrowLeft className="h-4 w-4" /> Back to home</button>
              </div>
            </div>

            <div className="overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#111a2a]">
              <div className="border-b border-white/[0.07] px-5 py-4 sm:px-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Competition leaderboard</p></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-white/[0.025] text-[10px] uppercase tracking-[0.14em] text-slate-500"><tr><th className="px-4 py-3">Rank</th><th className="px-4 py-3">Player</th><th className="px-4 py-3">College</th><th className="px-4 py-3 text-right">Score</th><th className="px-4 py-3 text-right">Accuracy*</th><th className="px-4 py-3 text-right">Avg. time*</th></tr></thead>
                  <tbody>{room.leaderboard.filter((entry) => entry.id !== room.hostId).map((entry) => {
                    const stats = sessionStats.get(entry.id);
                    const accuracy = stats?.participated ? `${Math.round((stats.correct / stats.participated) * 100)}%` : '—';
                    const average = stats?.responseCount ? formatAverage(stats.responseMs / stats.responseCount) : '—';
                    return <tr key={entry.id} className="border-t border-white/[0.06]"><td className="px-4 py-3.5 font-semibold text-slate-300">#{entry.rank}</td><td className="px-4 py-3.5 font-semibold text-white">{entry.name}</td><td className="px-4 py-3.5 text-slate-400">{entry.college || '—'}</td><td className="px-4 py-3.5 text-right font-bold text-indigo-200">{entry.score}</td><td className="px-4 py-3.5 text-right text-slate-300">{accuracy}</td><td className="px-4 py-3.5 text-right text-slate-300">{average}</td></tr>;
                  })}</tbody>
                </table>
              </div>
              <p className="px-5 pb-4 text-[10px] text-slate-500">*Aggregate metrics reflect round-result events received in this host session. Scores remain server-authoritative.</p>
            </div>
          </section>
        ) : (
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
            <div className="space-y-5">
              {room.state === 'WAITING' ? (
                <section className="overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#111a2a]">
                  <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.07] px-5 py-5 sm:px-6">
                    <div><h2 className="text-xl font-bold text-white">Participants</h2><p className="mt-1 text-sm text-slate-400">Players currently waiting to compete.</p></div>
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300">{participants.length} {participants.length === 1 ? 'player' : 'players'}</span>
                  </div>
                  <div className="space-y-2 p-3 sm:p-4">
                    {participants.length ? participants.map((player) => <div key={player.id} className="host-player-enter flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#0d1523] px-3 py-3 sm:px-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-400/25 to-cyan-300/15 text-sm font-bold text-indigo-100">{player.publicProfile?.avatarUrl ? <img src={player.publicProfile.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(player.name)}</span><div className="min-w-0 flex-1">{player.publicProfile?.username ? <a href={`/profile/${player.publicProfile.username}`} className="block truncate text-sm font-semibold text-white hover:text-indigo-200">{player.name} <span className="text-xs font-normal text-indigo-200">@{player.publicProfile.username}</span></a> : <p className="truncate text-sm font-semibold text-white">{player.name}</p>}<p className="truncate text-xs text-slate-500">{player.publicProfile ? player.publicProfile.college || 'College hidden' : player.college || 'College not provided'}</p></div><div className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${player.connected ? 'bg-emerald-400/10 text-emerald-200' : 'bg-slate-700/60 text-slate-300'}`}><span className={`h-1.5 w-1.5 rounded-full ${player.connected ? 'bg-emerald-400' : 'bg-slate-400'}`} />{player.connected ? 'Connected' : 'Disconnected'}</div><span className="hidden min-w-[76px] text-right text-[10px] font-medium text-slate-500 sm:block">Ready status unavailable</span></div>) : <div className="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-400/10 text-indigo-200"><Users className="h-5 w-5" /></div><p className="mt-3 text-sm font-semibold text-white">The lobby is open</p><p className="mt-1 text-xs text-slate-500">Share the room code or QR to bring players in.</p></div>}
                  </div>
                </section>
              ) : (
                <section className="overflow-hidden rounded-[26px] border border-indigo-300/15 bg-[#111a2a]">
                  <div className="border-b border-white/[0.07] px-5 py-5 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-200">{room.state === 'QUESTION_ENDED' ? 'Round complete' : `Question ${currentQuestionNumber} of ${totalQuestions || '?'}`}</p><h2 className="mt-1 text-xl font-bold text-white">{room.currentQuestion?.topic || 'Aptitude challenge'}</h2></div>
                      {room.state === 'QUESTION_ACTIVE' && <div className="inline-flex items-center gap-2 rounded-xl border border-indigo-300/15 bg-indigo-400/10 px-3 py-2 text-sm font-bold tabular-nums text-indigo-100"><TimerReset className="h-4 w-4" />{formatDuration(remainingMs)}</div>}
                    </div>
                    <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-300 transition-all duration-500" style={{ width: progressWidth }} /></div>
                  </div>

                  {room.state === 'QUESTION_ENDED' ? (
                    <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
                      {[{ label: 'Correct answers', value: `${roundResults.filter((result) => result.correct).length}/${roundParticipants.length}` }, { label: 'Accuracy', value: `${roundAccuracy}%` }, { label: 'Avg. response', value: formatAverage(averageRoundResponse) }, { label: 'Top performer', value: roundTopPerformer?.name ?? '—' }].map((item) => <div key={item.label} className="rounded-2xl border border-white/[0.07] bg-[#0d1523] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</p><p className="mt-2 truncate text-lg font-bold text-white">{item.value}</p></div>)}
                      <div className="rounded-2xl border border-white/[0.07] bg-[#0d1523] p-4 sm:col-span-2 xl:col-span-4"><p className="text-sm font-semibold text-white">Questions advance automatically.</p><p className="mt-1 text-xs text-slate-500">The server will start the next round after the results transition.</p></div>
                    </div>
                  ) : (
                    <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.1fr_0.9fr]">
                      <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current question</p>
                        <h3 className="text-lg font-semibold leading-7 text-white sm:text-xl">{room.currentQuestion?.text}</h3>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">{questionOptions.map((option, index) => <div key={option.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-white/[0.07] bg-[#0d1523] px-3 py-2.5"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-[11px] font-bold text-slate-300">{String.fromCharCode(65 + index)}</span><span className="text-sm text-slate-300">{option.text}</span></div>)}</div>
                      </div>
                      <div className="rounded-2xl border border-white/[0.07] bg-[#0d1523] p-4">
                        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-white">Answer distribution</p><p className="mt-1 text-xs text-slate-500">Live totals, without player-level answers</p></div><span className="rounded-lg bg-indigo-400/10 px-2 py-1 text-xs font-semibold text-indigo-100">{answeredCount}/{participants.length}</span></div>
                        <div className="mt-5 space-y-4">{optionCounts.map((option, index) => <div key={option.id} className="grid grid-cols-[22px_1fr_24px] items-center gap-2"><span className="text-xs font-bold text-slate-400">{String.fromCharCode(65 + index)}</span><div className="h-2 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-300 transition-all duration-500" style={{ width: `${(option.count / maxOptionCount) * 100}%` }} /></div><span className="text-right text-xs tabular-nums text-slate-300">{option.count}</span></div>)}</div>
                        <div className="mt-5 flex items-center justify-between border-t border-white/[0.07] pt-3 text-xs"><span className="text-slate-400">Not answered</span><span className="font-semibold text-white">{Math.max(0, participants.length - answeredCount)}</span></div>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {room.state !== 'WAITING' && (
                <section className="overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#111a2a]">
                  <button type="button" onClick={() => setRankingsOpen((open) => !open)} aria-expanded={rankingsOpen} className="flex w-full items-center justify-between px-5 py-4 text-left sm:px-6"><div><h2 className="text-base font-bold text-white">Live rankings</h2><p className="mt-1 text-xs text-slate-500">Server-authoritative scores · {room.leaderboard.filter((entry) => entry.id !== room.hostId).length} competitors</p></div><ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${rankingsOpen ? 'rotate-180' : ''}`} /></button>
                  {rankingsOpen && <div className="overflow-x-auto border-t border-white/[0.07]"><table className="w-full min-w-[520px] text-left text-xs"><thead className="text-[10px] uppercase tracking-[0.14em] text-slate-500"><tr><th className="px-5 py-3">Rank</th><th className="px-3 py-3">Player</th><th className="px-3 py-3 text-right">Score</th><th className="px-3 py-3 text-right">Accuracy*</th><th className="px-5 py-3 text-right">Avg. time*</th></tr></thead><tbody>{room.leaderboard.filter((entry) => entry.id !== room.hostId).map((entry) => { const stats = sessionStats.get(entry.id); const accuracy = stats?.participated ? `${Math.round((stats.correct / stats.participated) * 100)}%` : '—'; const average = stats?.responseCount ? formatAverage(stats.responseMs / stats.responseCount) : '—'; return <tr key={entry.id} className="border-t border-white/[0.05]"><td className="px-5 py-3 font-bold text-slate-300">#{entry.rank}</td><td className="px-3 py-3"><span className="font-medium text-white">{entry.name}</span><span className="ml-2 text-slate-500">{entry.college || ''}</span></td><td className="px-3 py-3 text-right font-bold text-indigo-200">{entry.score}</td><td className="px-3 py-3 text-right text-slate-300">{accuracy}</td><td className="px-5 py-3 text-right text-slate-300">{average}</td></tr>; })}</tbody></table><p className="px-5 pb-3 text-[10px] text-slate-600">*Accuracy and average response time use round results received during this host session.</p></div>}
                </section>
              )}
            </div>

            <aside className="space-y-5">
              <section className="rounded-[26px] border border-white/[0.08] bg-[#111a2a] p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-200">Quiz content</p><h2 className="mt-1 text-lg font-bold text-white">Question set</h2></div><ShieldCheck className="h-5 w-5 text-indigo-200" /></div>
                {room.state === 'WAITING' ? <>
                  <label className="mt-4 block text-xs font-semibold text-slate-300">Ready sets<select value={selectedQuestionSetId} onChange={(event) => setSelectedQuestionSetId(event.target.value)} disabled={loadingQuestionSets || !questionSets.length} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1321] px-3 py-2.5 text-xs text-white disabled:opacity-50"><option value="">Built-in aptitude set · 5 questions</option>{questionSets.map((questionSet) => <option key={questionSet.id} value={questionSet.id}>{questionSet.name || 'Untitled'} · {questionSet.questionCount} questions</option>)}</select></label>
                  {selectedSet ? <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3"><p className="text-sm font-semibold text-white">{selectedSet.name}</p><p className="mt-1 text-[10px] leading-4 text-slate-400">{selectedSet.questionCount} questions · {selectedSet.topics.join(' · ') || 'Topics not set'}</p><p className="mt-1 text-[10px] text-slate-500">{Object.entries(selectedSet.difficultyDistribution).map(([difficulty, count]) => `${count} ${difficulty}`).join(' · ')}</p></div> : <div className="mt-4 divide-y divide-white/[0.06]">{[
                    { label: 'Question set', value: room.questionSetName || 'Built-in aptitude set' },
                    { label: 'Questions', value: `${totalQuestions} questions` },
                    { label: 'Scoring', value: 'Speed + accuracy' },
                  ].map((item) => <div key={item.label} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><span className="text-xs text-slate-400">{item.label}</span><span className="text-right text-xs font-semibold text-slate-200">{item.value}</span></div>)}</div>}
                  {loadingQuestionSets && <p className="mt-2 text-[10px] text-slate-500">Loading ready sets…</p>}
                  {questionSetError && <p className="mt-2 text-[10px] text-rose-200">{questionSetError}</p>}
                  <div className="mt-4 flex items-center justify-between gap-2"><a href="/question-bank" className="text-[10px] font-semibold text-indigo-200 hover:text-white">Manage question bank</a><button type="button" disabled={busy || selectedQuestionSetId === (room.questionSetId || '')} onClick={() => onSelectQuestionSet(selectedQuestionSetId || null)} className="rounded-lg bg-indigo-500 px-3 py-2 text-[10px] font-bold text-white hover:bg-indigo-400 disabled:opacity-40">{selectedQuestionSetId ? 'Use this set' : 'Use built-in set'}</button></div>
                </> : <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3"><p className="text-sm font-semibold text-white">{room.questionSetName || 'Built-in aptitude set'}</p><p className="mt-1 text-xs text-slate-400">{totalQuestions} questions · snapshot locked for this competition</p><p className="mt-2 text-[10px] text-slate-500">Editing the source set will not change this running quiz.</p></div>}
                <p className="mt-4 border-t border-white/[0.06] pt-3 text-[10px] leading-4 text-slate-500">Scoring and question timing remain controlled by the game server.</p>
              </section>

              {room.state === 'WAITING' && (
                <section className="rounded-[26px] border border-indigo-300/15 bg-[linear-gradient(145deg,rgba(79,70,229,.12),rgba(17,26,42,.92)_62%)] p-5 sm:p-6">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-200">Host readiness</p>
                  <h2 className="mt-1 text-xl font-bold text-white">Ready to start?</h2>
                  <div className="mt-4 space-y-3">{[
                    { label: 'Question set ready', ready: totalQuestions > 0 },
                    { label: 'Server connected', ready: connectionState === 'connected' },
                    { label: 'Lobby is waiting', ready: room.state === 'WAITING' },
                  ].map((item) => <div key={item.label} className="flex items-center gap-2.5 text-sm"><span className={`flex h-5 w-5 items-center justify-center rounded-full ${item.ready ? 'bg-emerald-400/10 text-emerald-200' : 'bg-amber-400/10 text-amber-200'}`}>{item.ready ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />}</span><span className={item.ready ? 'text-slate-200' : 'text-slate-400'}>{item.label}</span></div>)}</div>
                  <p className="mt-4 text-xs leading-5 text-slate-400">No player minimum is configured by the current game engine. You can start now or wait for more participants.</p>
                  <button type="button" disabled={!canStart || starting} onClick={() => setDialog('start')} className="mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-400 px-4 text-sm font-black tracking-[0.08em] text-white shadow-lg shadow-indigo-950/40 transition hover:from-indigo-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-50">{starting ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> STARTING QUIZ</> : <>START QUIZ <ExternalLink className="h-4 w-4" /></>}</button>
                  {error && <p className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
                </section>
              )}

              {room.state !== 'WAITING' && <section className="rounded-[22px] border border-white/[0.08] bg-[#111a2a] p-4"><p className="text-sm font-semibold text-white">Questions advance automatically.</p><p className="mt-1 text-xs leading-5 text-slate-500">Pause and manual next controls are not available in this game.</p></section>}
            </aside>
          </div>
        )}

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5 text-[11px] text-slate-500"><span>AptiQuiz Host Console <span className="mx-1.5 text-slate-700">/</span> Room {room.code}</span><span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Scores verified by the server</span></footer>
      </main>

      {dialog && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="host-dialog-title" className="w-full max-w-md rounded-[26px] border border-white/10 bg-[#111a2a] p-5 shadow-2xl shadow-black/50 sm:p-6">
          <div className="flex items-start justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-200">{dialog === 'start' ? 'Confirm start' : dialog === 'leave' ? 'Room controls' : 'Join this room'}</p><h2 id="host-dialog-title" className="mt-2 text-xl font-bold text-white">{dialog === 'start' ? 'Start the competition?' : dialog === 'leave' ? 'Leave this room?' : 'Scan to join'}</h2></div><button type="button" aria-label="Close dialog" onClick={() => setDialog(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white"><X className="h-4 w-4" /></button></div>
          {dialog === 'start' && <><p className="mt-3 text-sm leading-6 text-slate-400">Once started, players will begin the first round. The server will control timing, scoring, and automatic progression.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDialog(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.05]">Cancel</button><button type="button" disabled={!canStart || starting} onClick={handleStart} className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-400 disabled:opacity-50">{starting ? 'Starting…' : 'Start Quiz'}</button></div></>}
          {dialog === 'leave' && <><p className="mt-3 text-sm leading-6 text-slate-400">Your connection will end and you’ll return to AptiQuiz. The room remains in memory until the server process ends.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDialog(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.05]">Stay here</button><button type="button" onClick={leaveRoom} className="rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-400">Leave room</button></div></>}
          {dialog === 'qr' && <><div className="mt-5 flex justify-center rounded-2xl bg-white p-5">{joinUrl && <QRCodeCanvas value={joinUrl} size={224} level="H" includeMargin />}</div><p className="mt-3 break-all text-center text-xs text-slate-400">{joinUrl}</p><div className="mt-5 flex justify-center gap-2"><button type="button" onClick={downloadQr} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/[0.05]"><Download className="h-4 w-4" /> Download QR</button><button type="button" onClick={() => setDialog(null)} className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-400">Done</button></div></>}
        </div>
      </div>}

      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-xl border border-emerald-300/15 bg-[#172436] px-4 py-3 text-sm font-semibold text-emerald-100 shadow-xl shadow-black/30">{toast}</div>}
    </div>
  );
}
