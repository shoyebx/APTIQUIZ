'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check } from 'lucide-react';
import ProfileEditor from '@/components/profile-editor';
import { useProfile } from '@/components/profile-context';

export default function EditProfilePage() {
  const router = useRouter();
  const { profile, loading, requestSetup, updateProfile } = useProfile();
  const [saved, setSaved] = useState(false);

  if (loading) return <main className="profile-page min-h-screen bg-[#090f1d] px-4 py-16 text-center text-slate-400">Loading profile…</main>;
  if (!profile) return <main className="profile-page min-h-screen bg-[#090f1d] px-4 py-16 text-center text-slate-100"><h1 className="text-2xl font-bold">Create a profile to get started.</h1><button type="button" onClick={requestSetup} className="mt-4 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-bold">Create profile</button></main>;

  return (
    <main className="profile-page min-h-screen bg-[radial-gradient(ellipse_at_80%_0%,rgba(79,70,229,.15),transparent_35%),#090f1d] px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <a href="/profile" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to profile</a>
        <section className="mt-5 rounded-[28px] border border-white/[0.08] bg-[#111a2a] p-5 sm:p-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-200">Player identity</p>
          <h1 className="mt-2 text-3xl font-black text-white">Edit profile</h1>
          <p className="mb-6 mt-2 text-sm text-slate-400">Choose what other players can see. Email and account credentials are not collected by AptiQuiz.</p>
          {saved && <p role="status" className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-2.5 text-sm font-semibold text-emerald-200"><Check className="h-4 w-4" /> Profile updated successfully.</p>}
          <ProfileEditor key={profile.updatedAt} initialValues={profile} submitLabel="Save Changes" cancelLabel="Cancel" onCancel={() => router.push('/profile')} onSave={async (values) => { await updateProfile(values); setSaved(true); }} />
        </section>
      </div>
    </main>
  );
}
