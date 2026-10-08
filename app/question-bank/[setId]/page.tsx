'use client';

import { DragEvent, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, GripVertical, Plus, Save, Settings2, ShieldCheck } from 'lucide-react';
import QuestionEditor, { type BankQuestion } from '@/components/question-editor';
import { useProfile } from '@/components/profile-context';

type QuestionSet = {
  id: string;
  name: string;
  description: string;
  defaultTopic: string;
  defaultDifficulty: string;
  status: 'draft' | 'ready' | 'archived';
  questions: BankQuestion[];
  readiness: { ready: boolean; issues: string[] };
  createdAt: string;
  updatedAt: string;
};

async function responseError(response: Response) {
  const data = await response.json().catch(() => ({}));
  return new Error(data.error || 'Question set request failed.');
}

export default function QuestionSetPage({ params }: { params: { setId: string } }) {
  const { token } = useProfile();
  const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [creatingQuestion, setCreatingQuestion] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultTopic, setDefaultTopic] = useState('');
  const [defaultDifficulty, setDefaultDifficulty] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showSetSettings, setShowSetSettings] = useState(false);
  const [draggedQuestionId, setDraggedQuestionId] = useState<string | null>(null);

  const loadSet = useCallback(async () => {
    if (!token) return;
    const response = await fetch(`/api/question-sets/${params.setId}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!response.ok) throw await responseError(response);
    const result: QuestionSet = await response.json();
    setQuestionSet(result);
    setName(result.name);
    setDescription(result.description);
    setDefaultTopic(result.defaultTopic);
    setDefaultDifficulty(result.defaultDifficulty);
    setSelectedQuestionId((current) => current && result.questions.some((question) => question.id === current) ? current : result.questions[0]?.id || null);
  }, [params.setId, token]);

  useEffect(() => { void loadSet().catch((loadError) => setError(loadError.message)); }, [loadSet]);

  const saveDetails = async () => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/question-sets/${params.setId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description, defaultTopic, defaultDifficulty, status: 'draft' }) });
      if (!response.ok) throw await responseError(response);
      const updated: QuestionSet = await response.json();
      setQuestionSet(updated);
      setInfo('Draft saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save set details.');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: 'ready' | 'draft' | 'archived') => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/question-sets/${params.setId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      if (!response.ok) throw await responseError(response);
      setQuestionSet(await response.json());
      setInfo(status === 'ready' ? 'Question set is ready to use.' : status === 'archived' ? 'Question set archived.' : 'Question set saved as draft.');
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Could not update question set status.');
    } finally {
      setBusy(false);
    }
  };

  const persistOrder = async (nextQuestions: BankQuestion[]) => {
    if (!questionSet || !token) return;
    const previous = questionSet.questions;
    setQuestionSet({ ...questionSet, status: 'draft', questions: nextQuestions.map((question, order) => ({ ...question, order })) });
    try {
      const response = await fetch(`/api/question-sets/${params.setId}/reorder`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ questionIds: nextQuestions.map((question) => question.id) }) });
      if (!response.ok) throw await responseError(response);
      const result = await response.json();
      setQuestionSet((current) => current ? { ...current, status: 'draft', questions: result.items } : current);
    } catch (reorderError) {
      setQuestionSet((current) => current ? { ...current, questions: previous } : current);
      setError(reorderError instanceof Error ? reorderError.message : 'Could not reorder questions.');
    }
  };

  const moveQuestion = (questionId: string, direction: -1 | 1) => {
    if (!questionSet) return;
    const index = questionSet.questions.findIndex((question) => question.id === questionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= questionSet.questions.length) return;
    const reordered = [...questionSet.questions];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    void persistOrder(reordered);
  };

  const dropQuestion = (targetId: string) => {
    if (!questionSet || !draggedQuestionId || draggedQuestionId === targetId) return;
    const reordered = [...questionSet.questions];
    const sourceIndex = reordered.findIndex((question) => question.id === draggedQuestionId);
    const targetIndex = reordered.findIndex((question) => question.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setDraggedQuestionId(null);
    void persistOrder(reordered);
  };

  const saveQuestion = async (values: Omit<BankQuestion, 'id' | 'order'>) => {
    if (!token || !questionSet) throw new Error('Question set is not ready.');
    setBusy(true);
    setError('');
    try {
      const isNew = creatingQuestion || !selectedQuestionId;
      const url = isNew ? `/api/question-sets/${params.setId}/questions` : `/api/question-sets/${params.setId}/questions/${selectedQuestionId}`;
      const response = await fetch(url, { method: isNew ? 'POST' : 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      if (!response.ok) throw await responseError(response);
      const saved: BankQuestion = await response.json();
      setQuestionSet((current) => {
        if (!current) return current;
        const questions = isNew ? [...current.questions, saved] : current.questions.map((question) => question.id === saved.id ? saved : question);
        return { ...current, status: 'draft', questions, readiness: { ready: false, issues: [] } };
      });
      setSelectedQuestionId(saved.id);
      setCreatingQuestion(false);
      setInfo(isNew ? 'Question saved.' : 'Question updated.');
    } finally {
      setBusy(false);
    }
  };

  const duplicateQuestion = async () => {
    if (!token || !selectedQuestionId || !questionSet) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/question-sets/${params.setId}/questions/${selectedQuestionId}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw await responseError(response);
      const duplicate: BankQuestion = await response.json();
      setQuestionSet({ ...questionSet, status: 'draft', questions: [...questionSet.questions.slice(0, duplicate.order), duplicate, ...questionSet.questions.slice(duplicate.order)] });
      setSelectedQuestionId(duplicate.id);
      setInfo('Question duplicated.');
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : 'Could not duplicate the question.');
    } finally {
      setBusy(false);
    }
  };

  const deleteQuestion = async () => {
    if (!token || !selectedQuestionId || !questionSet) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/question-sets/${params.setId}/questions/${selectedQuestionId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw await responseError(response);
      const nextQuestions = questionSet.questions.filter((question) => question.id !== selectedQuestionId).map((question, order) => ({ ...question, order }));
      setQuestionSet({ ...questionSet, status: 'draft', questions: nextQuestions });
      setSelectedQuestionId(nextQuestions[0]?.id || null);
      setCreatingQuestion(false);
      setInfo('Question deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete the question.');
      throw deleteError;
    } finally {
      setBusy(false);
    }
  };

  const selectedQuestion = questionSet?.questions.find((question) => question.id === selectedQuestionId) || null;

  if (!questionSet) return <main className="min-h-screen bg-[#f2f5fc] px-4 py-16 text-center text-slate-500">{error || 'Loading question set…'}</main>;

  return (
    <main className="min-h-screen bg-[#f2f5fc] px-3 pb-12 pt-5 text-slate-900 sm:px-5 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3"><a href="/question-bank" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Question Bank</a><div className="flex items-center gap-2"><a href="/" className="text-xs font-semibold text-slate-500 hover:text-slate-900">Host Quiz</a><button type="button" onClick={() => void saveDetails()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Save className="h-3.5 w-3.5" /> Save draft</button><button type="button" onClick={() => void setStatus('ready')} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"><ShieldCheck className="h-3.5 w-3.5" /> Mark ready</button></div></header>

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Question set name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Untitled question set" className="mt-1.5 w-full border-0 p-0 text-xl font-black text-slate-900 outline-none placeholder:text-slate-300 focus:ring-0" /></label><label className="mt-3 block text-xs font-medium text-slate-600">Description<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} placeholder="Describe what this set covers." className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label></div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] ${questionSet.status === 'ready' ? 'bg-emerald-50 text-emerald-700' : questionSet.status === 'archived' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>{questionSet.status}</span><button type="button" onClick={() => setShowSetSettings((shown) => !shown)} aria-expanded={showSetSettings} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600"><Settings2 className="h-3.5 w-3.5" /><ChevronDown className="h-3.5 w-3.5" /></button></div></div>{showSetSettings && <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-700">Default topic<select value={defaultTopic} onChange={(event) => setDefaultTopic(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal"><option value="">No default</option>{['Quantitative Aptitude', 'Logical Reasoning', 'Verbal Ability', 'Data Interpretation'].map((topic) => <option key={topic}>{topic}</option>)}</select></label><label className="text-xs font-semibold text-slate-700">Default difficulty<select value={defaultDifficulty} onChange={(event) => setDefaultDifficulty(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal"><option value="">No default</option>{['Easy', 'Medium', 'Hard'].map((difficulty) => <option key={difficulty}>{difficulty}</option>)}</select></label></div>}</section>

        {(error || info) && <p role={error ? 'alert' : 'status'} className={`mb-4 rounded-xl px-3 py-2.5 text-xs ${error ? 'border border-rose-200 bg-rose-50 text-rose-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || info}</p>}
        {!questionSet.readiness.ready && questionSet.questions.length > 0 && <details className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"><summary className="cursor-pointer font-semibold">{questionSet.readiness.issues.length || 1} item(s) need attention before this set is ready</summary><ul className="mt-2 list-inside list-disc space-y-1">{questionSet.readiness.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></details>}

        <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[285px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between px-1 py-1"><div><h2 className="text-sm font-bold">Questions</h2><p className="mt-0.5 text-[10px] text-slate-500">{questionSet.questions.length} in saved order</p></div><button type="button" onClick={() => { setCreatingQuestion(true); setSelectedQuestionId(null); }} className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-2 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100"><Plus className="h-3 w-3" />Add</button></div><ol className="mt-3 space-y-1.5">{questionSet.questions.map((question, index) => <li key={question.id} draggable onDragStart={() => setDraggedQuestionId(question.id)} onDragOver={(event: DragEvent<HTMLLIElement>) => event.preventDefault()} onDrop={() => dropQuestion(question.id)} onDragEnd={() => setDraggedQuestionId(null)} className={`flex items-start gap-1 rounded-xl border px-1.5 py-1.5 ${selectedQuestionId === question.id && !creatingQuestion ? 'border-indigo-200 bg-indigo-50' : 'border-transparent hover:bg-slate-50'}`}><span title="Drag to reorder" className="mt-2 cursor-grab text-slate-300"><GripVertical className="h-4 w-4" /></span><button type="button" onClick={() => { setSelectedQuestionId(question.id); setCreatingQuestion(false); }} className="min-w-0 flex-1 py-1 text-left"><span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">Question {index + 1}</span><span className="mt-1 line-clamp-2 block text-xs font-semibold text-slate-800">{question.text}</span><span className="mt-1 block truncate text-[9px] text-slate-500">{question.topic} · {question.difficulty}</span></button><span className="flex flex-col"><button type="button" aria-label={`Move question ${index + 1} up`} disabled={index === 0} onClick={() => moveQuestion(question.id, -1)} className="rounded p-1 text-slate-400 hover:text-indigo-700 disabled:opacity-25"><ArrowLeft className="h-3 w-3 rotate-90" /></button><button type="button" aria-label={`Move question ${index + 1} down`} disabled={index === questionSet.questions.length - 1} onClick={() => moveQuestion(question.id, 1)} className="rounded p-1 text-slate-400 hover:text-indigo-700 disabled:opacity-25"><ArrowLeft className="h-3 w-3 -rotate-90" /></button></span></li>)}</ol>{!questionSet.questions.length && <div className="px-3 py-8 text-center"><p className="text-xs font-semibold text-slate-700">No questions yet</p><p className="mt-1 text-[10px] leading-4 text-slate-500">Add four-option questions to prepare this set.</p><button type="button" onClick={() => { setCreatingQuestion(true); setSelectedQuestionId(null); }} className="mt-3 text-xs font-bold text-indigo-700">Add first question</button></div>}</aside>

          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><QuestionEditor key={creatingQuestion ? 'new-question' : selectedQuestionId || 'empty'} question={creatingQuestion ? null : selectedQuestion} defaultTopic={defaultTopic} defaultDifficulty={defaultDifficulty} busy={busy} canMoveUp={!!selectedQuestion && selectedQuestion.order > 0} canMoveDown={!!selectedQuestion && selectedQuestion.order < questionSet.questions.length - 1} onMove={selectedQuestion ? (direction) => moveQuestion(selectedQuestion.id, direction) : undefined} onSave={saveQuestion} onDuplicate={!creatingQuestion && selectedQuestion ? () => void duplicateQuestion() : undefined} onDelete={!creatingQuestion && selectedQuestion ? deleteQuestion : undefined} />
          </section>
        </div>
      </div>
    </main>
  );
}
