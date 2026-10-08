'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen, FilePlus2, Save } from 'lucide-react';
import { useProfile } from '@/components/profile-context';

const topics = ['Quantitative Aptitude', 'Logical Reasoning', 'Verbal Ability', 'Data Interpretation'];
const difficulties = ['Easy', 'Medium', 'Hard'];

export default function CreateQuestionSetPage() {
  const router = useRouter();
  const { token, profile } = useProfile();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultTopic, setDefaultTopic] = useState('');
  const [defaultDifficulty, setDefaultDifficulty] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (!token) { setError('Create a profile before creating question sets.'); return; }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/question-sets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, defaultTopic, defaultDifficulty }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not create this set.');
      router.push(`/question-bank/${result.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create this set.');
    } finally {
      setSaving(false);
    }
  };

  if (!token || !profile) return <main className="min-h-screen bg-[#f2f5fc] px-4 py-16 text-center"><h1 className="text-2xl font-black text-slate-900">Create a profile to author questions.</h1><a href="/profile" className="mt-4 inline-flex rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white">Go to profile</a></main>;

  return (
    <main className="min-h-screen bg-[#f2f5fc] px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl"><a href="/question-bank" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Question Bank</a>
        <section className="mt-5 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,.06)] sm:p-8"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><BookOpen className="h-5 w-5" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600">Question Bank</p><h1 className="mt-1 text-2xl font-black">Create a question set</h1></div></div><p className="mt-3 text-sm text-slate-600">Save a reusable draft now, then add and validate questions before marking it ready.</p>
          <div className="mt-7 space-y-5">
            <label className="block text-sm font-semibold">Set name <span className="text-slate-400">(optional for draft)</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="e.g. Placement Aptitude — Round 1" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal outline-none focus:border-indigo-400" /></label>
            <label className="block text-sm font-semibold">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={4} placeholder="What should hosts know about this set?" className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal outline-none focus:border-indigo-400" /><span className="mt-1 block text-right text-[10px] font-normal text-slate-500">{description.length}/1000</span></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Default topic<select value={defaultTopic} onChange={(event) => setDefaultTopic(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal"><option value="">No default</option>{topics.map((topic) => <option key={topic}>{topic}</option>)}</select></label><label className="text-sm font-semibold">Default difficulty<select value={defaultDifficulty} onChange={(event) => setDefaultDifficulty(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal"><option value="">No default</option>{difficulties.map((difficulty) => <option key={difficulty}>{difficulty}</option>)}</select></label></div>
          </div>
          {error && <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
          <div className="mt-7 flex flex-col-reverse justify-between gap-3 border-t border-slate-100 pt-5 sm:flex-row"><button type="button" onClick={() => router.push('/question-bank')} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><div className="flex flex-col gap-2 sm:flex-row"><button type="button" disabled={saving} onClick={() => void create()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Save className="h-4 w-4" /> Save draft</button><button type="button" disabled={saving} onClick={() => void create()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"><FilePlus2 className="h-4 w-4" />{saving ? 'Creating…' : 'Continue to questions'}</button></div></div>
        </section>
      </div>
    </main>
  );
}
