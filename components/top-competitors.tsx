'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Medal, Trophy } from 'lucide-react';
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
};

type CurrentCompetitor = {
  id: string;
  rank: number | null;
  level: number;
  xp: number;
  score: number;
} | null;

type LeaderboardResponse = {
  items: Competitor[];
  total: number;
  currentUser: CurrentCompetitor;
};

const numberFormat = new Intl.NumberFormat();

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

export default function TopCompetitors() {
  const { token } = useProfile();
  const [items, setItems] = useState<Competitor[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentCompetitor>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    fetch('/api/leaderboard?page=1&pageSize=6', { headers, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Leaderboard unavailable.');
        return response.json() as Promise<LeaderboardResponse>;
      })
      .then((data) => {
        if (!active) return;
        setItems(data.items);
        setCurrentUser(data.currentUser);
      })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const currentIsShown = !!currentUser && items.some((entry) => entry.id === currentUser.id);

  return (
    <section aria-labelledby="top-competitors-title" className="relative overflow-hidden rounded-[28px] border border-indigo-300/15 bg-[radial-gradient(ellipse_at_82%_0%,rgba(79,70,229,.22),transparent_42%),linear-gradient(145deg,#101a2d,#0b1220_70%)] p-5 text-white shadow-[0_32px_80px_rgba(15,23,42,0.22)] sm:p-6">
      <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full border border-indigo-200/[0.06]" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-200/10 bg-amber-200/[0.07] text-amber-200"><Trophy className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-200">Top competitors</p>
              <h2 id="top-competitors-title" className="mt-1 text-lg font-bold text-white sm:text-xl">Highest-level players</h2>
              <p className="mt-1 text-xs text-slate-400">On AptiQuiz</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Global</span>
        </div>

        {loading ? (
          <div className="mt-5 space-y-2" aria-label="Loading top competitors">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-[62px] animate-pulse rounded-2xl bg-white/[0.04]" />)}</div>
        ) : failed ? (
          <div className="mt-5 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center"><p className="text-sm font-semibold text-white">Leaderboard unavailable</p><p className="mt-1 text-xs text-slate-500">Try again in a moment.</p></div>
        ) : items.length ? (
          <ol className="relative mt-5 space-y-2">
            {items.map((competitor) => {
              const isCurrentUser = competitor.id === currentUser?.id;
              const podium = competitor.rank <= 3;
              const rankTone = competitor.rank === 1
                ? 'border-amber-200/20 bg-amber-200/[0.08] text-amber-100'
                : competitor.rank === 2
                  ? 'border-slate-200/15 bg-slate-200/[0.06] text-slate-100'
                  : competitor.rank === 3
                    ? 'border-orange-200/15 bg-orange-200/[0.06] text-orange-100'
                    : 'border-white/[0.07] bg-white/[0.035] text-slate-300';
              return (
                <li key={competitor.id} className={`leaderboard-row-enter rounded-2xl border px-3 py-3 transition duration-200 hover:-translate-y-0.5 hover:bg-white/[0.07] ${isCurrentUser ? 'border-cyan-300/30 bg-cyan-300/[0.07] ring-1 ring-cyan-200/10' : 'border-white/[0.07] bg-white/[0.035]'}`}>
                  <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-xs font-bold ${rankTone}`} aria-label={`Rank ${competitor.rank}`}>
                      {podium ? <Medal className="h-4 w-4" /> : `#${competitor.rank}`}
                    </span>
                    <a href={`/profile/${encodeURIComponent(competitor.username)}`} className="flex min-w-0 flex-1 items-center gap-2.5 group">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-indigo-300/25 to-cyan-300/10 text-[11px] font-bold text-white">
                        {competitor.avatarUrl ? <img src={competitor.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(competitor.fullName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-white group-hover:text-cyan-100">{competitor.fullName}</span>
                          {isCurrentUser && <span className="shrink-0 rounded-full bg-cyan-200/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-cyan-100">You</span>}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-slate-400">@{competitor.username}</span>
                      </span>
                    </a>
                    <div className="shrink-0 text-right">
                      <span className="inline-flex rounded-lg border border-indigo-200/10 bg-indigo-200/[0.07] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-indigo-100">Level {competitor.level}</span>
                      <p className="mt-1 text-[11px] font-bold tabular-nums text-amber-100">{numberFormat.format(competitor.xp)} XP</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-amber-200/[0.07] text-amber-100"><Trophy className="h-4 w-4" /></div><p className="mt-3 text-sm font-semibold text-white">The leaderboard starts here.</p><p className="mt-1 text-xs leading-5 text-slate-500">Complete a competition to earn your first XP and appear among the competitors.</p></div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
          {currentUser && !currentIsShown ? (
            <div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Your rank</p><p className="mt-0.5 text-sm font-bold text-white">{currentUser.rank ? `#${currentUser.rank}` : 'Not ranked yet'} <span className="ml-1 text-[10px] font-medium text-slate-400">· Level {currentUser.level} · {numberFormat.format(currentUser.xp)} XP</span></p></div>
          ) : currentIsShown ? <p className="text-xs font-semibold text-cyan-100">You’re on the leaderboard.</p> : <p className="text-[10px] text-slate-500">Level, XP, then best score</p>}
          <a href="/leaderboard" className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-indigo-100 transition hover:text-white">View full leaderboard <ArrowRight className="h-3.5 w-3.5" /></a>
        </div>
        {currentUser && !currentIsShown && <a href="/profile" className="mt-2 inline-flex text-[10px] font-semibold text-cyan-200 hover:text-white">View my profile</a>}
      </div>
    </section>
  );
}
