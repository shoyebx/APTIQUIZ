'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, BookOpen, Copy, FilePlus2, Pencil, Search, Trash2 } from 'lucide-react';
import { useProfile } from '@/components/profile-context';

const topics = ['Quantitative Aptitude', 'Logical Reasoning', 'Verbal Ability', 'Data Interpretation'];
const difficulties = ['Easy', 'Medium', 'Hard'];

type QuestionSetSummary = {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'ready' | 'archived';
  questionCount: number;
  topics: string[];
  difficultyDistribution: Record<string, number>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  readiness: { ready: boolean; issues: string[] };
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

async function apiError(response: Response) {
  const data = await response.json().catch(() => ({}));
  return new Error(data.error || 'Question Bank request failed.');
}

export default function QuestionBankPage() {
  const router = useRouter();
  const { token, profile, loading: profileLoading } = useProfile();
  const [sets, setSets] = useState<QuestionSetSummary[]>([]);
  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleteSet, setDeleteSet] = useState<QuestionSetSummary | null>(null);

  const loadSets = useCallback(async () => {
    if (!token) return;
    const query = new URLSearchParams({ search, topic, difficulty, status });
    const response = await fetch(`/api/question-sets?${query}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!response.ok) throw await apiError(response);
    const result = await response.json();
    setSets(result.items);
  }, [token, search, topic, difficulty, status]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (active) void loadSets().catch((loadError) => setError(loadError.message));
    }, search ? 180 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [loadSets, search]);

  const duplicate = async (questionSet: QuestionSetSummary) => {
    if (!token || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/question-sets/${questionSet.id}/duplicate`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw await apiError(response);
      await loadSets();
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : 'Could not duplicate this set.');
    } finally {
      setBusy(false);
    }
  };

  const archive = async (questionSet: QuestionSetSummary) => {
    if (!token || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/question-sets/${questionSet.id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: questionSet.status === 'archived' ? 'draft' : 'archived' }) });
      if (!response.ok) throw await apiError(response);
      await loadSets();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Could not update set status.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!token || !deleteSet) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/question-sets/${deleteSet.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw await apiError(response);
      setDeleteSet(null);
      await loadSets();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete this set.');
      setDeleteSet(null);
    } finally {
      setBusy(false);
    }
  };

  const totalQuestions = sets.reduce((sum, questionSet) => sum + questionSet.questionCount, 0);
  const draftCount = sets.filter((questionSet) => questionSet.status === 'draft').length;
  const readyCount = sets.filter((questionSet) => questionSet.status === 'ready').length;

  if (profileLoading) return <main className="min-h-screen bg-[#f2f5fc] p-8 text-slate-500">Loading Question Bank…</main>;
  if (!profile || !token) return <main className="min-h-screen bg-[#f2f5fc] px-4 py-16"><section className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center"><BookOpen className="mx-auto h-8 w-8 text-indigo-600" /><h1 className="mt-4 text-2xl font-black text-slate-900">Question Bank</h1><p className="mt-2 text-sm text-slate-600">Create an AptiQuiz profile to create and manage your own question sets.</p><a href="/profile" className="mt-5 inline-flex rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white">Go to profile</a></section></main>;

  return (
    <main className="min-h-screen bg-[#f2f5fc] px-4 pb-16 pt-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4"><div><a href="/" className="text-xs font-semibold text-slate-500 hover:text-slate-900">AptiQuiz <span className="mx-1 text-slate-300">/</span> Host tools</a><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Question Bank</h1><p className="mt-2 text-sm text-slate-600">Create, organize and reuse your aptitude questions.</p></div><button type="button" onClick={() => router.push('/question-bank/create')} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-950/10 transition hover:bg-indigo-500"><FilePlus2 className="h-4 w-4" /> Create question set</button></header>

        <section className="mb-6 grid grid-cols-3 gap-3"><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Question sets</p><p className="mt-2 text-2xl font-black">{sets.length}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Questions</p><p className="mt-2 text-2xl font-black">{totalQuestions}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Draft / Ready</p><p className="mt-2 text-2xl font-black">{draftCount}<span className="mx-2 text-slate-300">/</span>{readyCount}</p></div></section>

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(130px,180px))]"><label className="relative block"><span className="sr-only">Search sets or questions</span><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sets or question text" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" /></label><select aria-label="Filter by topic" value={topic} onChange={(event) => setTopic(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs"><option value="">All topics</option>{topics.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Filter by difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs"><option value="">All difficulties</option>{difficulties.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs"><option value="">All statuses</option><option value="draft">Draft</option><option value="ready">Ready</option><option value="archived">Archived</option></select></div>{error && <p role="alert" className="mt-3 text-xs text-rose-700">{error}</p>}</section>

        {sets.length ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sets.map((questionSet) => <article key={questionSet.id} className="flex flex-col rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-lg font-bold text-slate-900">{questionSet.name || 'Untitled question set'}</h2><p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-slate-500">{questionSet.description || 'No description'}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] ${questionSet.status === 'ready' ? 'bg-emerald-50 text-emerald-700' : questionSet.status === 'archived' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>{questionSet.status}</span></div><div className="mt-4 flex items-center justify-between border-y border-slate-100 py-3"><span className="text-sm font-bold text-slate-900">{questionSet.questionCount} questions</span><span className="text-[10px] text-slate-500">{questionSet.readiness.ready ? 'Ready to use' : `${questionSet.readiness.issues.length} item(s) to fix`}</span></div><div className="mt-3 flex min-h-12 flex-wrap content-start gap-1.5">{questionSet.topics.length ? questionSet.topics.map((value) => <span key={value} className="rounded-lg bg-indigo-50 px-2 py-1 text-[9px] font-semibold text-indigo-700">{value}</span>) : <span className="text-[10px] text-slate-400">No topics added</span>}</div><div className="mt-3 text-[10px] text-slate-500">Easy {questionSet.difficultyDistribution.Easy || 0} <span className="mx-1 text-slate-300">·</span> Medium {questionSet.difficultyDistribution.Medium || 0} <span className="mx-1 text-slate-300">·</span> Hard {questionSet.difficultyDistribution.Hard || 0}</div><p className="mt-3 text-[10px] text-slate-400">Updated {formatDate(questionSet.updatedAt)} <span className="mx-1 text-slate-300">·</span> {questionSet.createdBy}</p><div className="mt-auto flex flex-wrap gap-2 pt-5"><button type="button" onClick={() => router.push(`/question-bank/${questionSet.id}`)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white hover:bg-slate-700"><Pencil className="h-3.5 w-3.5" />Open / Edit</button><button type="button" disabled={busy} onClick={() => void duplicate(questionSet)} title="Duplicate set" aria-label={`Duplicate ${questionSet.name}`} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Copy className="h-4 w-4" /></button><button type="button" disabled={busy} onClick={() => void archive(questionSet)} title={questionSet.status === 'archived' ? 'Restore set' : 'Archive set'} aria-label={questionSet.status === 'archived' ? `Restore ${questionSet.name}` : `Archive ${questionSet.name}`} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Archive className="h-4 w-4" /></button><button type="button" onClick={() => setDeleteSet(questionSet)} title="Delete set" aria-label={`Delete ${questionSet.name}`} className="rounded-xl border border-rose-200 p-2.5 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button></div></article>)}</section> : <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-14 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><BookOpen className="h-5 w-5" /></div><h2 className="mt-4 text-lg font-bold text-slate-900">{search || topic || difficulty || status ? 'No question sets match these filters.' : 'Start your Question Bank.'}</h2><p className="mt-2 text-sm text-slate-500">{search || topic || difficulty || status ? 'Adjust the filters or try a different search.' : 'Create a reusable set, then choose it when hosting a competition.'}</p>{!search && !topic && !difficulty && !status && <button type="button" onClick={() => router.push('/question-bank/create')} className="mt-5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white">Create your first set</button>}</section>}
      </div>
      {deleteSet && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"><section role="alertdialog" aria-modal="true" aria-labelledby="delete-set-title" className="w-full max-w-sm rounded-[24px] border border-slate-200 bg-white p-5 shadow-2xl"><h2 id="delete-set-title" className="text-lg font-bold text-slate-900">Delete question set?</h2><p className="mt-2 text-sm text-slate-600">“{deleteSet.name || 'Untitled set'}” and its question list will be removed permanently.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDeleteSet(null)} className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold">Cancel</button><button type="button" disabled={busy} onClick={() => void confirmDelete()} className="rounded-xl bg-rose-600 px-3.5 py-2.5 text-xs font-bold text-white disabled:opacity-50">Delete set</button></div></section></div>}
    </main>
  );
}
