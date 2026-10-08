'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Medal, Trophy } from 'lucide-react';
import { useProfile } from '@/components/profile-context';

type Competitor = {
  id: string;
  rank: number;
  fullName: string;
  username: string;
  avatarUrl: string | null;
  level: number;
  levelName: string;
  xp: number;
  score: number;
  wins: number;
  accuracy: number | null;
};

type CurrentCompetitor = { id: string; rank: number | null; level: number; xp: number; score: number } | null;
type LeaderboardResponse = { items: Competitor[]; page: number; pageSize: number; total: number; hasMore: boolean; currentUser: CurrentCompetitor };
const numberFormat = new Intl.NumberFormat();

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

function rankStyle(rank: number) {
  if (rank === 1) return 'border-amber-200/20 bg-amber-200/[0.08] text-amber-100';
  if (rank === 2) return 'border-slate-200/15 bg-slate-200/[0.06] text-slate-100';
  if (rank === 3) return 'border-orange-200/15 bg-orange-200/[0.06] text-orange-100';
  return 'border-white/[0.07] bg-white/[0.035] text-slate-300';
}

export default function LeaderboardPage() {
  const { token } = useProfile();
  const [items, setItems] = useState<Competitor[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentCompetitor>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadPage = useCallback(async (nextPage: number) => {
    setLoading(true);
    setError(false);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const response = await fetch(`/api/leaderboard?page=${nextPage}&pageSize=25`, { headers, cache: 'no-store' });
      if (!response.ok) throw new Error('Leaderboard request failed.');
      const result: LeaderboardResponse = await response.json();
      setItems((existing) => nextPage === 1 ? result.items : [...existing, ...result.items]);
      setPage(nextPage);
      setCurrentUser(result.currentUser);
      setHasMore(result.hasMore);
      setTotal(result.total);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadPage(1); }, [loadPage]);

  const currentIsShown = !!currentUser && items.some((entry) => entry.id === currentUser.id);

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_80%_0%,rgba(79,70,229,.16),transparent_36%),#090f1d] px-4 pb-16 pt-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-7 flex items-center justify-between gap-3">
          <a href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 transition hover:text-white"><ArrowLeft className="h-4 w-4" /> AptiQuiz</a>
          <a href="/profile" className="text-xs font-semibold text-indigo-200 transition hover:text-white">My profile <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></a>
        </header>

        <section className="overflow-hidden rounded-[28px] border border-indigo-300/15 bg-[radial-gradient(ellipse_at_82%_0%,rgba(79,70,229,.22),transparent_42%),linear-gradient(145deg,#101a2d,#0b1220_70%)] p-5 shadow-[0_32px_80px_rgba(0,0,0,.22)] sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.08] pb-5">
            <div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200/10 bg-amber-200/[0.07] text-amber-200"><Trophy className="h-6 w-6" /></div><div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-200">AptiQuiz standings</p><h1 className="mt-1 text-3xl font-black text-white sm:text-4xl">Global leaderboard</h1><p className="mt-1 text-sm text-slate-400">Ranked by level, XP, then best score.</p></div></div>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-300">{total} ranked players</span>
          </div>

          {error ? <div className="py-14 text-center"><p className="text-sm font-semibold text-white">Leaderboard unavailable</p><button type="button" onClick={() => void loadPage(1)} className="mt-3 text-xs font-semibold text-indigo-200 hover:text-white">Try again</button></div>
            : items.length ? <ol className="mt-4 space-y-2">
              {items.map((competitor) => {
                const isCurrentUser = competitor.id === currentUser?.id;
                return (
                  <li key={competitor.id} className={`rounded-2xl border p-3 transition hover:-translate-y-0.5 hover:bg-white/[0.06] sm:p-4 ${isCurrentUser ? 'border-cyan-300/30 bg-cyan-300/[0.07] ring-1 ring-cyan-200/10' : 'border-white/[0.07] bg-white/[0.035]'}`}>
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 sm:gap-4">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl border text-xs font-bold ${rankStyle(competitor.rank)}`} aria-label={`Rank ${competitor.rank}`}>{competitor.rank <= 3 ? <Medal className="h-4 w-4" /> : `#${competitor.rank}`}</span>
                      <a href={`/profile/${encodeURIComponent(competitor.username)}`} className="group flex min-w-0 items-center gap-2.5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-indigo-300/25 to-cyan-300/10 text-xs font-bold text-white">{competitor.avatarUrl ? <img src={competitor.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(competitor.fullName)}</span>
                        <span className="min-w-0"><span className="flex items-center gap-1.5"><span className="block truncate text-sm font-semibold text-white group-hover:text-cyan-100">{competitor.fullName}</span>{isCurrentUser && <span className="rounded-full bg-cyan-200/10 px-1.5 py-0.5 text-[8px] font-bold uppercase text-cyan-100">You</span>}</span><span className="mt-0.5 block truncate text-[10px] text-slate-400">@{competitor.username}</span></span>
                      </a>
                      <div className="text-right"><span className="inline-flex rounded-lg border border-indigo-200/10 bg-indigo-200/[0.07] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-indigo-100">Level {competitor.level}</span><p className="mt-1 text-xs font-bold tabular-nums text-amber-100">{numberFormat.format(competitor.xp)} XP</p></div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3 pl-12 text-[10px] sm:ml-[52px] sm:pl-0"><div><span className="text-slate-500">Best score </span><span className="font-semibold text-slate-200">{numberFormat.format(competitor.score)}</span></div><div><span className="text-slate-500">Wins </span><span className="font-semibold text-slate-200">{competitor.wins}</span></div><div><span className="text-slate-500">Accuracy </span><span className="font-semibold text-slate-200">{competitor.accuracy == null ? '—' : `${competitor.accuracy}%`}</span></div></div>
                  </li>
                );
              })}
            </ol> : loading ? <div className="py-14 text-center text-sm text-slate-400">Loading global standings…</div> : <div className="py-14 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-300/[0.08] text-indigo-100"><Trophy className="h-5 w-5" /></div><p className="mt-4 text-sm font-semibold text-white">No completed public competitors yet.</p><p className="mt-1 text-xs text-slate-500">Complete a competition and choose a public profile to appear here.</p></div>}

          {hasMore && <button type="button" disabled={loading} onClick={() => void loadPage(page + 1)} className="mt-4 w-full rounded-xl border border-white/10 px-4 py-3 text-xs font-semibold text-indigo-100 transition hover:bg-white/[0.05] disabled:opacity-50">{loading ? 'Loading…' : 'Load more competitors'}</button>}
          {currentUser && !currentIsShown && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-200/10 bg-cyan-200/[0.04] px-4 py-3"><div><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-100/70">Your rank</p><p className="mt-1 text-sm font-bold text-white">{currentUser.rank ? `#${currentUser.rank}` : 'Not ranked yet'} <span className="ml-1 text-[10px] font-medium text-slate-400">· Level {currentUser.level} · {numberFormat.format(currentUser.xp)} XP</span></p></div><a href="/profile" className="text-xs font-semibold text-cyan-100 hover:text-white">View my profile</a></div>}
        </section>
      </div>
    </main>
  );
}
