'use client';

import { FormEvent, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Eye, ImagePlus, Plus, Save, Table2, Trash2, X } from 'lucide-react';
import { useProfile } from '@/components/profile-context';

export type BankQuestion = {
  id: string;
  order: number;
  text: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string | null;
  topic: string;
  difficulty: string;
  timeLimitMs: number;
  explanation: string;
  image: { id: string; url: string; altText: string } | null;
  table: { columns: string[]; rows: string[][] } | null;
};

type QuestionEditorProps = {
  question: BankQuestion | null;
  defaultTopic: string;
  defaultDifficulty: string;
  onSave: (question: Omit<BankQuestion, 'id' | 'order'>) => Promise<void>;
  onDuplicate?: () => void;
  onDelete?: () => Promise<void>;
  onMove?: (direction: -1 | 1) => void;
  busy?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
};

const optionIds = ['A', 'B', 'C', 'D'];
const topics = ['Quantitative Aptitude', 'Logical Reasoning', 'Verbal Ability', 'Data Interpretation'];
const difficulties = ['Easy', 'Medium', 'Hard'];

type DraftQuestion = Omit<BankQuestion, 'id' | 'order'>;

function emptyQuestion(defaultTopic: string, defaultDifficulty: string): DraftQuestion {
  return {
    text: '',
    options: optionIds.map((id) => ({ id, text: '' })),
    correctOptionId: null,
    topic: defaultTopic,
    difficulty: defaultDifficulty,
    timeLimitMs: 20000,
    explanation: '',
    image: null,
    table: null,
  };
}

async function errorFrom(response: Response) {
  const data = await response.json().catch(() => ({}));
  return new Error(data.error || 'Could not save the question.');
}

export default function QuestionEditor({
  question,
  defaultTopic,
  defaultDifficulty,
  onSave,
  onDuplicate,
  onDelete,
  onMove,
  busy = false,
  canMoveUp = false,
  canMoveDown = false,
}: QuestionEditorProps) {
  const { token } = useProfile();
  const [draft, setDraft] = useState<DraftQuestion>(() => question ? {
    text: question.text,
    options: question.options.map((option) => ({ ...option })),
    correctOptionId: question.correctOptionId,
    topic: question.topic,
    difficulty: question.difficulty,
    timeLimitMs: question.timeLimitMs,
    explanation: question.explanation,
    image: question.image ? { ...question.image } : null,
    table: question.table ? { columns: [...question.table.columns], rows: question.table.rows.map((row) => [...row]) } : null,
  } : emptyQuestion(defaultTopic, defaultDifficulty));
  const [preview, setPreview] = useState(false);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const setField = <K extends keyof DraftQuestion>(key: K, value: DraftQuestion[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const emptyOption = draft.options.findIndex((option) => !option.text.trim());
    if (!draft.text.trim()) { setError('Question text is required.'); return; }
    if (emptyOption >= 0) { setError(`Option ${optionIds[emptyOption]} cannot be empty.`); return; }
    if (!draft.correctOptionId) { setError('Select the correct answer.'); return; }
    if (!draft.topic) { setError('Choose a topic.'); return; }
    if (!draft.difficulty) { setError('Choose a difficulty.'); return; }
    try {
      await onSave(draft);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the question.');
    }
  };

  const uploadImage = async (file?: File) => {
    if (!file) return;
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Choose a PNG, JPG, or WEBP image.'); return; }
    if (file.size > 2 * 1024 * 1024) { setError('Question images must be 2 MB or smaller.'); return; }
    if (!token) { setError('A profile is required to upload question images.'); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.set('image', file);
      form.set('altText', file.name.replace(/\.[^.]+$/, '').slice(0, 200));
      const response = await fetch('/api/question-images', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      if (!response.ok) throw await errorFrom(response);
      const image = await response.json();
      setField('image', { id: image.id, url: image.url, altText: image.altText });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Image upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const addColumn = () => {
    if (!draft.table || draft.table.columns.length >= 8) return;
    setField('table', {
      columns: [...draft.table.columns, `Column ${draft.table.columns.length + 1}`],
      rows: draft.table.rows.map((row) => [...row, '']),
    });
  };

  const addRow = () => {
    if (!draft.table || draft.table.rows.length >= 30) return;
    setField('table', { ...draft.table, rows: [...draft.table.rows, draft.table.columns.map(() => '')] });
  };

  const removeColumn = (columnIndex: number) => {
    if (!draft.table || draft.table.columns.length <= 1) return;
    setField('table', {
      columns: draft.table.columns.filter((_, index) => index !== columnIndex),
      rows: draft.table.rows.map((row) => row.filter((_, index) => index !== columnIndex)),
    });
  };

  const removeRow = (rowIndex: number) => {
    if (!draft.table) return;
    setField('table', { ...draft.table, rows: draft.table.rows.filter((_, index) => index !== rowIndex) });
  };

  return (
    <>
      <form onSubmit={submit} className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-600">{question ? `Question ${(question.order || 0) + 1}` : 'New question'}</p><h2 className="mt-1 text-xl font-bold text-slate-900">Question content</h2></div>
          <div className="flex items-center gap-1.5">
            {onMove && <><button type="button" disabled={!canMoveUp} onClick={() => onMove(-1)} title="Move question up" aria-label="Move question up" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-35"><ArrowUp className="h-4 w-4" /></button><button type="button" disabled={!canMoveDown} onClick={() => onMove(1)} title="Move question down" aria-label="Move question down" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-35"><ArrowDown className="h-4 w-4" /></button></>}
            <button type="button" onClick={() => { setShowCorrectAnswer(false); setPreview(true); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Eye className="h-3.5 w-3.5" /> Preview</button>
          </div>
        </div>

        <label className="block text-sm font-semibold text-slate-800">Question text
          <textarea required maxLength={2000} rows={4} value={draft.text} onChange={(event) => setField('text', event.target.value)} placeholder="Write the question exactly as participants will see it." className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-normal leading-6 text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-400" />
          <span className="mt-1 block text-right text-[10px] font-normal text-slate-500">{draft.text.length}/2000</span>
        </label>

        <section>
          <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-800">Answer options</h3><span className="text-[10px] text-slate-500">Choose one correct answer</span></div>
          <div className="space-y-2">
            {draft.options.map((option) => <div key={option.id} className={`grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2 rounded-xl border p-2.5 transition ${draft.correctOptionId === option.id ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">{option.id}</span><input type="radio" name="correctOption" aria-label={`Mark option ${option.id} correct`} checked={draft.correctOptionId === option.id} onChange={() => setField('correctOptionId', option.id)} className="h-4 w-4 accent-emerald-600" /><input aria-label={`Option ${option.id} text`} value={option.text} onChange={(event) => setField('options', draft.options.map((entry) => entry.id === option.id ? { ...entry, text: event.target.value } : entry))} maxLength={500} placeholder={`Enter option ${option.id}`} className="min-w-0 rounded-lg bg-transparent px-2 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400" /></div>)}
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-semibold text-slate-800">Topic<select value={draft.topic} onChange={(event) => setField('topic', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 focus:border-indigo-400"><option value="">Choose topic</option>{topics.map((topic) => <option key={topic}>{topic}</option>)}</select></label>
          <label className="text-sm font-semibold text-slate-800">Difficulty<select value={draft.difficulty} onChange={(event) => setField('difficulty', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 focus:border-indigo-400"><option value="">Choose difficulty</option>{difficulties.map((difficulty) => <option key={difficulty}>{difficulty}</option>)}</select></label>
          <label className="text-sm font-semibold text-slate-800">Time limit<select value={draft.timeLimitMs} onChange={(event) => setField('timeLimitMs', Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 focus:border-indigo-400">{[10000, 15000, 20000, 25000, 30000, 45000, 60000].map((time) => <option key={time} value={time}>{time / 1000} sec</option>)}</select></label>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-bold text-slate-800">Question image</h3><p className="mt-1 text-[10px] text-slate-500">PNG, JPG, or WEBP · max 2 MB</p></div><label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><ImagePlus className="h-3.5 w-3.5" />{draft.image ? 'Replace image' : 'Add image'}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => void uploadImage(event.target.files?.[0])} /></label></div>
          {uploading && <p className="mt-3 text-xs text-indigo-700">Uploading image…</p>}
          {draft.image && <div className="mt-3 flex flex-wrap items-start gap-3"><img src={draft.image.url} alt={draft.image.altText} className="max-h-48 max-w-full rounded-xl border border-slate-200 object-contain" /><div className="min-w-40 flex-1"><label className="text-xs font-medium text-slate-700">Image description<input value={draft.image.altText} onChange={(event) => setField('image', draft.image ? { ...draft.image, altText: event.target.value } : null)} maxLength={200} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs" /></label><button type="button" onClick={() => setField('image', null)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-rose-700"><X className="h-3.5 w-3.5" />Remove image</button></div></div>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800"><Table2 className="h-4 w-4" /> Question table</h3><p className="mt-1 text-[10px] text-slate-500">Optional structured data table, shown with horizontal scrolling on small screens.</p></div>{draft.table ? <div className="flex gap-2"><button type="button" onClick={addColumn} disabled={draft.table.columns.length >= 8} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[10px] font-semibold disabled:opacity-40"><Plus className="h-3 w-3" />Column</button><button type="button" onClick={addRow} disabled={draft.table.rows.length >= 30} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[10px] font-semibold disabled:opacity-40"><Plus className="h-3 w-3" />Row</button></div> : <button type="button" onClick={() => setField('table', { columns: ['Column 1', 'Column 2'], rows: [['', '']] })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Plus className="h-3.5 w-3.5" />Add table</button>}</div>
          {draft.table && <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-full border-collapse text-left text-xs"><thead><tr>{draft.table.columns.map((column, columnIndex) => <th key={columnIndex} className="min-w-32 border-b border-r border-slate-200 bg-slate-100 p-2"><div className="flex gap-1"><input aria-label={`Table column ${columnIndex + 1}`} value={column} onChange={(event) => setField('table', draft.table ? { ...draft.table, columns: draft.table.columns.map((entry, index) => index === columnIndex ? event.target.value : entry) } : null)} maxLength={80} className="min-w-0 flex-1 bg-transparent font-semibold text-slate-700 outline-none" /><button type="button" onClick={() => removeColumn(columnIndex)} aria-label={`Delete column ${columnIndex + 1}`} className="text-slate-400 hover:text-rose-600"><X className="h-3 w-3" /></button></div></th>)}</tr></thead><tbody>{draft.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={columnIndex} className="border-b border-r border-slate-100 p-1.5"><input aria-label={`Table row ${rowIndex + 1} column ${columnIndex + 1}`} value={cell} onChange={(event) => setField('table', draft.table ? { ...draft.table, rows: draft.table.rows.map((entry, index) => index === rowIndex ? entry.map((value, cellIndex) => cellIndex === columnIndex ? event.target.value : value) : entry) } : null)} maxLength={300} className="w-full min-w-24 bg-transparent px-1 py-1.5 text-slate-800 outline-none" /></td>)}<td className="border-b border-slate-100 p-1"><button type="button" onClick={() => removeRow(rowIndex)} aria-label={`Delete row ${rowIndex + 1}`} className="rounded p-1 text-slate-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></td></tr>)}</tbody></table></div>}
        </section>

        <label className="block text-sm font-semibold text-slate-800">Explanation <span className="font-normal text-slate-500">(optional)</span><textarea value={draft.explanation} onChange={(event) => setField('explanation', event.target.value)} rows={3} maxLength={3000} placeholder="Explain the solution for the post-question review." className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-normal text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-400" /></label>

        {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
          <div className="flex gap-2">{question && onDuplicate && <button type="button" onClick={onDuplicate} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Duplicate</button>}{question && onDelete && <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />Delete</button>}</div>
          <button type="submit" disabled={busy || uploading} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"><Save className="h-3.5 w-3.5" />{busy ? 'Saving…' : 'Save question'}</button>
        </div>
      </form>

      {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(false); }}><section role="dialog" aria-modal="true" aria-labelledby="question-preview-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600">Participant preview</p><h2 id="question-preview-title" className="mt-1 text-xl font-bold text-slate-900">{draft.topic || 'Question preview'} <span className="ml-1 text-xs font-semibold text-slate-500">{draft.difficulty}</span></h2></div><button type="button" aria-label="Close preview" onClick={() => setPreview(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><p className="mt-5 whitespace-pre-wrap text-base font-semibold leading-7 text-slate-900">{draft.text || 'Question text will appear here.'}</p>{draft.image && <img src={draft.image.url} alt={draft.image.altText} className="mt-4 max-h-64 max-w-full rounded-xl object-contain" />}{draft.table && <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-full text-left text-xs"><thead><tr>{draft.table.columns.map((column, index) => <th key={index} className="border-b bg-slate-50 px-3 py-2 font-semibold">{column}</th>)}</tr></thead><tbody>{draft.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border-b border-slate-100 px-3 py-2">{cell}</td>)}</tr>)}</tbody></table></div>}<div className="mt-5 grid gap-2 sm:grid-cols-2">{draft.options.map((option) => <div key={option.id} className={`rounded-xl border px-3 py-3 text-sm ${showCorrectAnswer && draft.correctOptionId === option.id ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700'}`}><span className="mr-2 font-bold">{option.id}.</span>{option.text || 'Option text'}</div>)}</div><div className="mt-5 flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-4"><button type="button" onClick={() => setShowCorrectAnswer((shown) => !shown)} className="text-xs font-semibold text-indigo-700">{showCorrectAnswer ? 'Hide answer key' : 'Host preview: show answer'}</button>{showCorrectAnswer && <span className="text-xs font-semibold text-emerald-700">Correct answer: {draft.correctOptionId || 'Not selected'}</span>}</div></section></div>}

      {confirmDelete && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4"><section role="alertdialog" aria-modal="true" aria-labelledby="delete-question-title" className="w-full max-w-sm rounded-[22px] border border-slate-200 bg-white p-5 shadow-2xl"><h2 id="delete-question-title" className="text-lg font-bold text-slate-900">Delete this question?</h2><p className="mt-2 text-sm text-slate-600">The question will be removed from this draft set.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setConfirmDelete(false)} className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-600">Cancel</button><button type="button" onClick={async () => { setConfirmDelete(false); await onDelete?.(); }} className="rounded-xl bg-rose-600 px-3.5 py-2.5 text-xs font-bold text-white">Delete question</button></div></section></div>}
    </>
  );
}
