'use client';

import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import ProfileEditor, { type ProfileFields } from '@/components/profile-editor';

export type UserProfile = {
  id: string;
  fullName: string;
  username: string;
  avatar: string | null;
  college: string;
  course: string;
  branch: string;
  yearOfStudy: number | null;
  bio: string;
  location: string;
  profileVisibility: 'public' | 'private';
  showCollege: boolean;
  showCourse: boolean;
  createdAt: string;
  updatedAt: string;
  stats: {
    quizzesPlayed: number;
    averageScore: number | null;
    bestScore: number | null;
    accuracy: number | null;
    averageResponseMs: number | null;
    wins: number;
    totalQuestions: number;
    totalQuestionsAnswered: number;
    correctAnswers: number;
    strongestArea: { name: string; accuracy: number; answered: number } | null;
    weakestArea: { name: string; accuracy: number; answered: number } | null;
  };
  progression: {
    currentXp: number;
    level: number;
    levelName: string;
    xpIntoLevel: number;
    xpForNextLevel: number;
    progressPercent: number;
    wins: number;
    achievements: Array<{ id: string; name: string; description: string; unlocked: boolean }>;
  };
  rankings: { globalRank: number | null; collegeRank: number | null; bestRank: number | null };
  completion: { percent: number; missing: string[] };
};

type ProfileContextValue = {
  profile: UserProfile | null;
  token: string | null;
  loading: boolean;
  setupOpen: boolean;
  requestSetup: () => void;
  skipSetup: () => void;
  saveProfile: (fields: ProfileFields) => Promise<void>;
  updateProfile: (fields: Partial<ProfileFields>) => Promise<UserProfile>;
  refreshProfile: () => Promise<void>;
  signOut: () => void;
  deleteProfile: () => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);
const TOKEN_STORAGE_KEY = 'aptiquiz-profile-token';
const SKIP_STORAGE_KEY = 'aptiquiz-profile-skipped';

async function responseError(response: Response) {
  const payload = await response.json().catch(() => ({}));
  return new Error(payload.error || `Profile request failed (${response.status}).`);
}

export function readProfileToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupOpen, setSetupOpen] = useState(false);

  const refreshProfile = async () => {
    const currentToken = readProfileToken();
    if (!currentToken) {
      setToken(null);
      setProfile(null);
      return;
    }
    const response = await fetch('/api/profile/me', { headers: { Authorization: `Bearer ${currentToken}` }, cache: 'no-store' });
    if (!response.ok) {
      if (response.status === 401) {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        setToken(null);
        setProfile(null);
        return;
      }
      throw await responseError(response);
    }
    setToken(currentToken);
    setProfile(await response.json());
  };

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      const storedToken = readProfileToken();
      if (!storedToken) {
        if (window.location.pathname === '/' && window.localStorage.getItem(SKIP_STORAGE_KEY) !== '1') setSetupOpen(true);
        setLoading(false);
        return;
      }
      try {
        const response = await fetch('/api/profile/me', { headers: { Authorization: `Bearer ${storedToken}` }, cache: 'no-store' });
        if (!active) return;
        if (response.ok) {
          setProfile(await response.json());
          setToken(storedToken);
        } else if (response.status === 401) {
          window.localStorage.removeItem(TOKEN_STORAGE_KEY);
          if (window.location.pathname === '/' && window.localStorage.getItem(SKIP_STORAGE_KEY) !== '1') setSetupOpen(true);
        }
      } catch {
        if (active) setSetupOpen(false);
      } finally {
        if (active) setLoading(false);
      }
    };
    void initialize();
    return () => { active = false; };
  }, []);

  const saveProfile = async (fields: ProfileFields) => {
    const currentToken = readProfileToken();
    if (currentToken) {
      const response = await fetch('/api/profile/me', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!response.ok) throw await responseError(response);
      setProfile(await response.json());
      setToken(currentToken);
    } else {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!response.ok) throw await responseError(response);
      const result = await response.json();
      window.localStorage.setItem(TOKEN_STORAGE_KEY, result.token);
      window.localStorage.removeItem(SKIP_STORAGE_KEY);
      setToken(result.token);
      setProfile(result.profile);
    }
    setSetupOpen(false);
  };

  const updateProfile = async (fields: Partial<ProfileFields>) => {
    const currentToken = readProfileToken();
    if (!currentToken) throw new Error('Create a profile before editing it.');
    const response = await fetch('/api/profile/me', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (!response.ok) throw await responseError(response);
    const updated = await response.json();
    setProfile(updated);
    return updated;
  };

  const requestSetup = () => {
    window.localStorage.removeItem(SKIP_STORAGE_KEY);
    setSetupOpen(true);
  };

  const skipSetup = () => {
    window.localStorage.setItem(SKIP_STORAGE_KEY, '1');
    setSetupOpen(false);
  };

  const signOut = () => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.removeItem('aptiquiz-session');
    window.localStorage.setItem(SKIP_STORAGE_KEY, '1');
    setToken(null);
    setProfile(null);
    setSetupOpen(false);
  };

  const deleteProfile = async () => {
    const currentToken = readProfileToken();
    if (!currentToken) throw new Error('No profile session is available.');
    const response = await fetch('/api/profile/me', { method: 'DELETE', headers: { Authorization: `Bearer ${currentToken}` } });
    if (!response.ok) throw await responseError(response);
    signOut();
  };

  const value = { profile, token, loading, setupOpen, requestSetup, skipSetup, saveProfile, updateProfile, refreshProfile, signOut, deleteProfile };

  return (
    <ProfileContext.Provider value={value}>
      {children}
      {setupOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#070c16]/90 p-3 backdrop-blur-md sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby="profile-setup-title" className="my-auto w-full max-w-2xl rounded-[28px] border border-white/10 bg-[#101827] p-5 shadow-2xl shadow-black/50 sm:p-7"><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-200">Your competitor identity</p><h1 id="profile-setup-title" className="mt-2 text-2xl font-black text-white sm:text-3xl">Create your AptiQuiz Profile</h1><p className="mb-5 mt-2 text-sm text-slate-400">Set up your profile before you start competing. A profile is optional and private by default.</p><ProfileEditor submitLabel="Save Profile" cancelLabel="Skip for now" onSave={saveProfile} onCancel={skipSetup} /></section></div>}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const value = useContext(ProfileContext);
  if (!value) throw new Error('useProfile must be used inside ProfileProvider.');
  return value;
}
