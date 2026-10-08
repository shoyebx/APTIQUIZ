'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Award, BarChart3, Medal, Target, Trophy, Users } from 'lucide-react';

type PublicProfile = {
  id: string;
  fullName: string;
  username: string;
  avatarUrl: string | null;
  bio: string;
  college: string;
  course: string;
  level: number;
  levelName: string;
  achievements: Array<{ id: string; name: string; description: string; unlocked: boolean }>;
  stats: { quizzesPlayed: number; wins: number; accuracy: number | null; bestScore: number | null };
};

export default function PublicProfilePage({ params }: { params: { username: string } }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/profile/${encodeURIComponent(params.username)}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('not found');
        return response.json();
      })
      .then((value: PublicProfile) => { if (active) setProfile(value); })
      .catch(() => { if (active) setMissing(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params.username]);

  if (loading) return <main className="profile-page min-h-screen bg-[#090f1d] px-4 py-20 text-center text-slate-400">Loading player profile…</main>;
  if (missing || !profile) return <main className="profile-page min-h-screen bg-[#090f1d] px-4 py-20 text-center text-slate-100"><h1 className="text-2xl font-bold">Public profile unavailable</h1><p className="mt-2 text-sm text-slate-400">This profile may be private or no longer exist.</p><a href="/" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-indigo-200"><ArrowLeft className="h-4 w-4" /> Back to AptiQuiz</a></main>;

  return (
    <main className="profile-page min-h-screen bg-[radial-gradient(ellipse_at_80%_0%,rgba(79,70,229,.15),transparent_35%),#090f1d] px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <a href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> AptiQuiz</a>
        <section className="mt-5 rounded-[28px] border border-indigo-300/15 bg-[radial-gradient(ellipse_at_85%_20%,rgba(79,70,229,.2),transparent_45%),linear-gradient(120deg,#121d34,#101827_70%)] p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[26px] border border-white/10 bg-indigo-400/15 text-2xl font-black">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : profile.fullName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-black text-white">{profile.fullName}</h1><span className="rounded-full border border-indigo-200/15 bg-indigo-200/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-indigo-100">Level {profile.level} · {profile.levelName}</span></div><p className="mt-1 text-sm font-medium text-indigo-200">@{profile.username}</p>{(profile.college || profile.course) && <p className="mt-3 text-sm text-slate-300">{[profile.college, profile.course].filter(Boolean).join(' · ')}</p>}<p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{profile.bio || 'Aptitude competitor on AptiQuiz.'}</p></div></div>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{[
          { label: 'Competitions', value: profile.stats.quizzesPlayed || '—', icon: Users },
          { label: 'Wins', value: profile.stats.wins || '—', icon: Trophy },
          { label: 'Accuracy', value: profile.stats.accuracy == null ? '—' : `${profile.stats.accuracy}%`, icon: Target },
          { label: 'Best score', value: profile.stats.bestScore ?? '—', icon: BarChart3 },
        ].map((metric) => { const Icon = metric.icon; return <div key={metric.label} className="rounded-2xl border border-white/[0.08] bg-[#111a2a] p-4"><Icon className="h-4 w-4 text-indigo-200" /><p className="mt-3 text-xl font-bold text-white">{metric.value}</p><p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">{metric.label}</p></div>; })}</section>

        <section className="mt-5 rounded-[26px] border border-white/[0.08] bg-[#111a2a] p-5 sm:p-6"><div className="flex items-center gap-2"><Award className="h-5 w-5 text-amber-200" /><h2 className="text-lg font-bold text-white">Achievements</h2></div>{profile.achievements.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{profile.achievements.map((achievement) => <div key={achievement.id} className="flex items-center gap-3 rounded-xl border border-amber-200/10 bg-amber-200/[0.04] p-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-200/10 text-amber-200"><Medal className="h-4 w-4" /></div><div><p className="text-xs font-semibold text-white">{achievement.name}</p><p className="mt-0.5 text-[10px] text-slate-500">{achievement.description}</p></div></div>)}</div> : <p className="mt-4 text-sm text-slate-500">No achievements unlocked yet.</p>}</section>
      </div>
    </main>
  );
}
