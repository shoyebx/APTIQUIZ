'use client';

import { FormEvent, useState } from 'react';
import { ImagePlus, LockKeyhole, UserRound, X } from 'lucide-react';

export type ProfileFields = {
  fullName: string;
  username: string;
  avatar?: string | null;
  college?: string;
  course?: string;
  branch?: string;
  yearOfStudy?: number | null;
  bio?: string;
  location?: string;
  profileVisibility?: 'public' | 'private';
  showCollege?: boolean;
  showCourse?: boolean;
};

type ProfileEditorProps = {
  initialValues?: Partial<ProfileFields>;
  submitLabel: string;
  cancelLabel?: string;
  onSave: (values: ProfileFields) => Promise<void>;
  onCancel?: () => void;
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

export default function ProfileEditor({ initialValues, submitLabel, cancelLabel, onSave, onCancel }: ProfileEditorProps) {
  const [values, setValues] = useState<ProfileFields>({
    fullName: initialValues?.fullName || '',
    username: initialValues?.username || '',
    avatar: initialValues?.avatar || null,
    college: initialValues?.college || '',
    course: initialValues?.course || '',
    branch: initialValues?.branch || '',
    yearOfStudy: initialValues?.yearOfStudy || null,
    bio: initialValues?.bio || '',
    location: initialValues?.location || '',
    profileVisibility: initialValues?.profileVisibility || 'private',
    showCollege: initialValues?.showCollege || false,
    showCourse: initialValues?.showCourse || false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [photoError, setPhotoError] = useState('');

  const update = <K extends keyof ProfileFields>(key: K, value: ProfileFields[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const selectPhoto = (file?: File) => {
    setPhotoError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError('Choose a JPG, PNG, or WEBP image.');
      return;
    }
    if (file.size > 256 * 1024) {
      setPhotoError('Image must be 256 KB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update('avatar', typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => setPhotoError('Could not read this image. Try another file.');
    reader.readAsDataURL(file);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (values.fullName.trim().length < 2 || values.fullName.trim().length > 80) {
      setError('Full name must be between 2 and 80 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(values.username)) {
      setError('Username must be 3–20 letters, numbers, or underscores.');
      return;
    }
    setBusy(true);
    try {
      await onSave({ ...values, username: values.username.toLowerCase() });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 sm:flex-row sm:text-left">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-indigo-200/20 bg-gradient-to-br from-indigo-400/25 to-cyan-300/10 text-xl font-bold text-indigo-100">
          {values.avatar ? <img src={values.avatar} alt="Profile preview" className="h-full w-full object-cover" /> : initials(values.fullName)}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-indigo-50">
            <ImagePlus className="h-4 w-4" /> {values.avatar ? 'Change photo' : 'Upload photo'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => selectPhoto(event.target.files?.[0])} />
          </label>
          {values.avatar && <button type="button" onClick={() => update('avatar', null)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.06]"><X className="h-3.5 w-3.5" /> Remove</button>}
          <p className="w-full text-center text-[11px] text-slate-500 sm:text-left">JPG, PNG, or WEBP · max 256 KB. Initials appear if no photo is set.</p>
          {photoError && <p className="w-full text-center text-xs text-rose-300 sm:text-left">{photoError}</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-300">Full name <span className="text-rose-300">*</span>
          <input required minLength={2} maxLength={80} value={values.fullName} onChange={(event) => update('fullName', event.target.value)} autoComplete="name" className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1321] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-300/50" placeholder="Your name" />
        </label>
        <label className="block text-xs font-medium text-slate-300">Username <span className="text-rose-300">*</span>
          <div className="mt-2 flex items-center rounded-xl border border-white/10 bg-[#0b1321] focus-within:border-indigo-300/50"><span className="pl-3.5 text-sm text-slate-500">@</span><input required minLength={3} maxLength={20} pattern="[A-Za-z0-9_]{3,20}" value={values.username} onChange={(event) => update('username', event.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} autoComplete="username" className="w-full rounded-r-xl bg-transparent px-2.5 py-3 text-sm text-white outline-none placeholder:text-slate-600" placeholder="aptiplayer" /></div>
          <span className="mt-1 block text-[10px] text-slate-500">3–20 letters, numbers, or underscores.</span>
        </label>
        <label className="block text-xs font-medium text-slate-300">College / University
          <input maxLength={120} value={values.college} onChange={(event) => update('college', event.target.value)} autoComplete="organization" className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1321] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-300/50" placeholder="Where you study" />
        </label>
        <label className="block text-xs font-medium text-slate-300">Course
          <input maxLength={100} value={values.course} onChange={(event) => update('course', event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1321] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-300/50" placeholder="e.g. B.Tech" />
        </label>
        <label className="block text-xs font-medium text-slate-300">Branch
          <input maxLength={100} value={values.branch} onChange={(event) => update('branch', event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1321] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-300/50" placeholder="e.g. Computer Science" />
        </label>
        <label className="block text-xs font-medium text-slate-300">Location (optional)
          <input maxLength={100} value={values.location} onChange={(event) => update('location', event.target.value)} autoComplete="address-level2" className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1321] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-300/50" placeholder="City or region" />
        </label>
        <label className="block text-xs font-medium text-slate-300">Year of study
          <select value={values.yearOfStudy || ''} onChange={(event) => update('yearOfStudy', event.target.value ? Number(event.target.value) : null)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1321] px-3.5 py-3 text-sm text-white outline-none transition focus:border-indigo-300/50"><option value="">Not specified</option>{Array.from({ length: 8 }, (_, index) => <option key={index + 1} value={index + 1}>Year {index + 1}</option>)}</select>
        </label>
        <label className="block text-xs font-medium text-slate-300 sm:col-span-2">Short bio
          <textarea maxLength={300} rows={3} value={values.bio} onChange={(event) => update('bio', event.target.value)} className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-[#0b1321] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-300/50" placeholder="What are you working toward?" />
          <span className="mt-1 block text-right text-[10px] text-slate-500">{values.bio?.length || 0}/300</span>
        </label>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-white"><LockKeyhole className="h-4 w-4 text-indigo-200" /> Privacy</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-[11px] text-slate-400">Profile visibility<select value={values.profileVisibility} onChange={(event) => update('profileVisibility', event.target.value as 'public' | 'private')} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0b1321] px-2.5 py-2 text-xs text-slate-200"><option value="private">Private</option><option value="public">Public</option></select></label>
          <label className="flex items-center gap-2 self-end pb-2 text-[11px] text-slate-300"><input type="checkbox" checked={!!values.showCollege} onChange={(event) => update('showCollege', event.target.checked)} className="accent-indigo-400" /> Show college publicly</label>
          <label className="flex items-center gap-2 self-end pb-2 text-[11px] text-slate-300"><input type="checkbox" checked={!!values.showCourse} onChange={(event) => update('showCourse', event.target.checked)} className="accent-indigo-400" /> Show course publicly</label>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2.5 text-sm text-rose-200">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && <button type="button" onClick={onCancel} className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.05]">{cancelLabel || 'Cancel'}</button>}
        <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-indigo-400 disabled:cursor-wait disabled:opacity-60"><UserRound className="h-4 w-4" />{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  );
}
