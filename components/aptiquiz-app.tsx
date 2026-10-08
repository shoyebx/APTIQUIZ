'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import HostQuizConsole, { type HostRoundResult, type HostRoundSnapshot, type HostRoom } from '@/components/host-quiz-console';
import { readProfileToken, useProfile } from '@/components/profile-context';
import TopCompetitors from '@/components/top-competitors';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Crown,
  Gauge,
  Menu,
  Play,
  Radio,
  ShieldCheck,
  Sparkles,
  Swords,
  TimerReset,
  Trophy,
  Users,
  X,
} from 'lucide-react';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';

const navItems = [
  { label: 'Home', href: '#home' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Features', href: '#features' },
  { label: 'Leaderboard', href: '/leaderboard' },
  { label: 'About', href: '#about' },
];

const features = [
  {
    icon: Radio,
    title: 'Real-Time Multiplayer',
    description: 'Compete with multiple players in the same live quiz.',
  },
  {
    icon: Gauge,
    title: 'Speed + Accuracy Scoring',
    description: 'Your performance depends on both correctness and response speed.',
  },
  {
    icon: ShieldCheck,
    title: 'Fair Play',
    description: 'Server-authoritative validation helps prevent unfair scoring and cheating.',
  },
  {
    icon: Trophy,
    title: 'Live Leaderboards',
    description: 'See rankings update as the competition progresses.',
  },
  {
    icon: TimerReset,
    title: 'Reconnect Support',
    description: 'Continue your session even if your connection temporarily drops.',
  },
  {
    icon: Users,
    title: 'Group Competition',
    description: 'Perfect for classrooms, colleges, clubs, and competitive practice.',
  },
];

const steps = [
  { number: '01', title: 'Create or Join', description: 'Host a room or enter an existing room code.' },
  { number: '02', title: 'Get Ready', description: 'Wait for competitors and start the challenge.' },
  { number: '03', title: 'Answer Fast', description: 'Solve questions before the timer runs out.' },
  { number: '04', title: 'Climb the Leaderboard', description: 'See your score, rank, accuracy, and performance.' },
];

const stats = [
  { value: 'Live', label: 'multiplayer rooms' },
  { value: 'Server', label: 'authoritative scoring' },
  { value: 'Speed +', label: 'accuracy scoring' },
  { value: 'Global', label: 'competitor rankings' },
];

const useCases = [
  {
    icon: Users,
    title: 'Students',
    text: 'Practice aptitude and compete with classmates.',
  },
  {
    icon: Crown,
    title: 'Colleges',
    text: 'Run engaging aptitude competitions and campus challenges.',
  },
  {
    icon: Swords,
    title: 'Friends & Teams',
    text: 'Create private quiz rooms and compete together.',
  },
];

type Player = {
  id: string;
  name: string;
  college?: string;
  role?: string;
  score: number;
  answered: boolean;
  connected: boolean;
  lastAnswer?: { optionId?: string; points?: number; responseMs?: number; correct?: boolean } | null;
  isHost?: boolean;
  publicProfile?: { fullName: string; username: string; avatarUrl: string | null; college: string; course: string; level: number; levelName: string } | null;
};

type Question = {
  id: string;
  text: string;
  topic?: string;
  difficulty?: string;
  timeLimitMs?: number;
  options: { id: string; text: string }[];
  correctOptionId?: string;
  explanation?: string;
  image?: { url: string; altText?: string } | null;
  table?: { columns: string[]; rows: string[][] } | null;
};

type RoomSnapshot = {
  id: string;
  code: string;
  hostName: string;
  hostId: string;
  state: 'WAITING' | 'QUESTION_ACTIVE' | 'QUESTION_ENDED' | 'FINISHED';
  questionStartedAt?: number | null;
  questionEndsAt?: number | null;
  questionIndex?: number;
  totalQuestions?: number;
  questionSetId?: string | null;
  questionSetName?: string;
  answerDistribution?: Array<{ optionId: string; count: number }>;
  players: Player[];
  currentQuestion?: Question | null;
  leaderboard: Array<{ id: string; name: string; score: number; rank: number; college?: string; publicProfile?: Player['publicProfile'] }>;
  questionResults?: Array<{ playerId: string; name: string; score: number; correct: boolean; points: number; responseMs?: number | null; selectedOption?: string | null }> | null;
};

function readSession() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem('aptiquiz-session') || 'null');
  } catch {
    return null;
  }
}

function saveSession(value: Record<string, string>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('aptiquiz-session', JSON.stringify(value));
}

function formatTime(ms: number) {
  const value = Math.max(0, Math.ceil(ms / 1000));
  return `${value}s`;
}

export default function AptiQuizApp() {
  const { profile, token } = useProfile();
  const socketRef = useRef<Socket | null>(null);
  const hostInputRef = useRef<HTMLInputElement | null>(null);
  const joinInputRef = useRef<HTMLInputElement | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  // eslint-disable-line @typescript-eslint/no-unused-vars
  const [connectionState, setConnectionState] = useState<'connected' | 'reconnecting' | 'disconnected'>('reconnecting');
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  // eslint-disable-line @typescript-eslint/no-unused-vars
  const [roundHistory, setRoundHistory] = useState<HostRoundSnapshot[]>([]);
  const [hostName, setHostName] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [playerCollege, setPlayerCollege] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [roomState, setRoomState] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState('');
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const [lastMessage, setLastMessage] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    const hydrateFromStorage = () => {
      const state = readSession();
      if (state?.roomCode && state?.playerId) {
        setCurrentPlayerId(state.playerId);
        socket.emit('player_reconnect', {
          roomCode: state.roomCode,
          playerId: state.playerId,
          name: state.name,
          profileToken: readProfileToken(),
        });
      }
    };

    socket.on('connect', () => {
      setSocketReady(true);
      setConnectionState('connected');
      hydrateFromStorage();
    });

    socket.on('disconnect', () => {
      setSocketReady(false);
      setConnectionState(socket.active ? 'reconnecting' : 'disconnected');
    });

    socket.on('connect_error', () => {
      setSocketReady(false);
      setConnectionState('reconnecting');
    });

    socket.on('room_created', ({ roomCode, room }: { roomCode: string; room: RoomSnapshot }) => {
      setRoomState(room);
      setCurrentPlayerId(room.hostId);
      setRoundHistory([]);
      setJoinCode(roomCode);
      setLastMessage(`Room ${roomCode} is ready.`);
      saveSession({ roomCode, playerId: room.hostId, name: room.hostName || 'Host' });
    });

    socket.on('joined_room', ({ room, playerId }: { room: RoomSnapshot; playerId: string }) => {
      setRoomState(room);
      setCurrentPlayerId(playerId);
      const player = room.players.find((entry) => entry.id === playerId);
      saveSession({ roomCode: room.code, playerId, name: player?.name || 'Player' });
    });

    socket.on('room_state', (payload: RoomSnapshot) => {
      const existingSession = readSession();
      if (existingSession?.roomCode && payload?.code !== existingSession.roomCode) return;
      setRoomState(payload);
      if (payload?.code && existingSession?.roomCode === payload.code) {
        setCurrentPlayerId(existingSession.playerId);
        const player = payload.players.find((entry: Player) => entry.id === existingSession.playerId);
        if (player) {
          setPlayerName(player.name);
        }
      }
    });

    socket.on('error', ({ message }) => {
      setError(message);
      setLastMessage(message);
    });

    socket.on('question_started', ({ room }) => {
      setSelectedOptionId('');
      setRoomState(room);
      setLastMessage('Question live — answer before the server deadline.');
    });

    socket.on('answer_received', ({ optionId, points, correct }) => {
      setSelectedOptionId('');
      setLastMessage(correct ? `Correct! +${points} points.` : `Incorrect. The correct answer was option ${optionId}.`);
    });

    socket.on('round_results', ({ room, results }: { room: RoomSnapshot; results: HostRoundResult[] }) => {
      setRoomState(room);
      setSelectedOptionId('');
      setRoundHistory((history) => {
        const questionIndex = room.questionIndex ?? history.length;
        if (history.some((round) => round.questionIndex === questionIndex)) return history;
        return [...history, { questionIndex, results }];
      });
      setLastMessage('Round results are in.');
    });

    socket.on('game_finished', ({ room }) => {
      setRoomState(room);
      setLastMessage('Game finished. Final leaderboard is locked in.');
    });

    const ticker = setInterval(() => setNow(Date.now()), 250);

    return () => {
      clearInterval(ticker);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const requestedRoom = new URLSearchParams(window.location.search).get('room');
    if (requestedRoom) setJoinCode(requestedRoom.toUpperCase());
  }, []);

  const currentPlayer = roomState?.players?.find((player: Player) => player.id === currentPlayerId) || null;
  const activeQuestion = roomState?.currentQuestion || null;
  const remainingMs = roomState?.questionEndsAt && roomState.state === 'QUESTION_ACTIVE' ? Math.max(0, roomState.questionEndsAt - now) : 0;
  const leaderboard = roomState?.leaderboard || [];
  const isHostView = roomState?.players?.some((player: Player) => player.id === currentPlayerId && player.isHost);

  const focusInput = (type: 'host' | 'join') => {
    setTimeout(() => {
      if (type === 'host') {
        hostInputRef.current?.focus();
      } else {
        joinInputRef.current?.focus();
      }
    }, 120);
  };

  const handleNavAction = (type: 'join' | 'host') => {
    setMobileNavOpen(false);
    document.getElementById('quick-action')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    focusInput(type);
  };

  const handleCreateRoom = () => {
    setError('');
    const name = profile?.fullName || hostName.trim();
    if (!name) {
      setError('Enter a host name to create a room.');
      return;
    }
    socketRef.current?.emit('host_create_room', { hostName: name, profileToken: token || readProfileToken() });
    document.getElementById('quick-action')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleJoinRoom = () => {
    setError('');
    if (!joinCode.trim() || (!profile && !playerName.trim())) {
      setError('Both room code and player name are required.');
      return;
    }

    socketRef.current?.emit('join_room', {
      roomCode: joinCode.trim().toUpperCase(),
      name: profile?.fullName || playerName.trim(),
      college: profile?.college || playerCollege.trim(),
      profileToken: token || readProfileToken(),
    });

    document.getElementById('quick-action')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleStartGame = () => {
    if (!roomState?.code || roomState.state !== 'WAITING' || !socketReady) return;
    setError('');
    socketRef.current?.emit('host_start_game', { roomCode: roomState.code });
  };

  const handleSelectQuestionSet = (questionSetId: string | null) => {
    if (!roomState?.code || roomState.state !== 'WAITING' || !socketReady) return;
    setError('');
    socketRef.current?.emit('host_select_question_set', {
      roomCode: roomState.code,
      questionSetId,
      profileToken: token || readProfileToken(),
    });
  };

  const handleLeaveHostRoom = () => {
    window.localStorage.removeItem('aptiquiz-session');
    setRoomState(null);
    setCurrentPlayerId(null);
    setRoundHistory([]);
    setSelectedOptionId('');
    setError('');
    setLastMessage('You left the room.');
    socketRef.current?.disconnect();
    socketRef.current?.connect();
  };

  const handleStartNewQuiz = () => {
    const socket = socketRef.current;
    if (!socketReady || !socket) return;
    const nextHostName = roomState?.hostName || hostName || 'Host';
    setError('');
    setRoomState(null);
    setCurrentPlayerId(null);
    setRoundHistory([]);
    window.localStorage.removeItem('aptiquiz-session');
    socket.once('connect', () => socket.emit('host_create_room', { hostName: nextHostName, profileToken: token || readProfileToken() }));
    socket.disconnect();
    socket.connect();
  };

  const handleSubmitAnswer = (optionId: string) => {
    if (!roomState?.code || !activeQuestion || !currentPlayerId) return;
    setSelectedOptionId(optionId);
    socketRef.current?.emit('submit_answer', {
      roomCode: roomState.code,
      playerId: currentPlayerId,
      questionId: activeQuestion.id,
      optionId,
    });
  };

  const statusBadge = roomState?.state === 'WAITING'
    ? 'Lobby'
    : roomState?.state === 'QUESTION_ACTIVE'
      ? 'Question live'
      : roomState?.state === 'QUESTION_ENDED'
        ? 'Review'
        : roomState?.state === 'FINISHED'
          ? 'Finished'
          : 'Idle';

  if (roomState && isHostView) {
    return (
      <HostQuizConsole
        room={roomState as HostRoom}
        hostProfile={profile}
        profileToken={token || readProfileToken()}
        connectionState={connectionState}
        remainingMs={remainingMs}
        roundHistory={roundHistory}
        error={error}
        onStart={handleStartGame}
        onLeave={handleLeaveHostRoom}
        onStartNewQuiz={handleStartNewQuiz}
        onSelectQuestionSet={handleSelectQuestionSet}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#edf3ff] text-slate-900">
      <div className="bg-[radial-gradient(circle_at_top,_rgba(98,106,255,0.20),_transparent_35%),linear-gradient(180deg,#0b1221_0%,#0d1726_18%,#edf3ff_18%,#edf3ff_100%)]">
        <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
          <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <a href="#home" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-lg font-black text-white shadow-lg shadow-indigo-500/30">
                A
              </div>
              <div>
                <div className="text-lg font-bold tracking-tight text-white">AptiQuiz</div>
              </div>
            </a>

            <div className="hidden items-center gap-8 md:flex">
              {navItems.map((item) => (
                <a key={item.label} href={item.href} className="text-sm font-medium text-slate-300 transition hover:text-white">
                  {item.label}
                </a>
              ))}
            </div>

            <div className="hidden items-center gap-3 md:flex">
              <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${socketReady ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'}`}>
                <span className={`h-2 w-2 rounded-full ${socketReady ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {socketReady ? 'Live server' : 'Connecting'}
              </div>
              <a href="/profile" className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm font-semibold text-white transition hover:border-slate-500">
                <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-indigo-400/20 text-[10px] font-bold text-indigo-100">{profile?.avatar ? <img src={profile.avatar} alt="" className="h-full w-full object-cover" /> : profile?.fullName.slice(0, 1).toUpperCase() || 'P'}</span>
                {profile?.fullName || 'Profile'}
              </a>
              <button
                onClick={() => handleNavAction('join')}
                className="rounded-full border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-500 hover:bg-slate-900"
                type="button"
              >
                Join Quiz
              </button>
              <button
                onClick={() => handleNavAction('host')}
                className="rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400"
                type="button"
              >
                Host a Quiz
              </button>
            </div>

            <button
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/70 text-white md:hidden"
              type="button"
              aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              onClick={() => setMobileNavOpen((current) => !current)}
            >
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </nav>

          {mobileNavOpen && (
            <div className="border-t border-white/10 bg-slate-950 px-4 py-4 md:hidden">
              <div className="flex flex-col gap-3">
                <a href="/profile" onClick={() => setMobileNavOpen(false)} className="rounded-xl px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900">{profile?.fullName || 'Player Profile'}</a>
                {navItems.map((item) => (
                  <a key={item.label} href={item.href} className="rounded-xl px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900" onClick={() => setMobileNavOpen(false)}>
                    {item.label}
                  </a>
                ))}
                <button
                  type="button"
                  onClick={() => handleNavAction('join')}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-left text-sm font-medium text-white"
                >
                  Join Quiz
                </button>
                <button
                  type="button"
                  onClick={() => handleNavAction('host')}
                  className="rounded-xl bg-indigo-500 px-3 py-2 text-left text-sm font-semibold text-white"
                >
                  Host a Quiz
                </button>
              </div>
            </div>
          )}
        </header>

        <main className="mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
          <section id="home" className="pb-14 pt-4 lg:pb-16">
            <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
              <div>
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-300/[0.08] px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-100">
                  <Sparkles className="h-3.5 w-3.5" />
                  Real-Time Multiplayer Aptitude
                </div>
                <h1 className="max-w-xl text-4xl font-black tracking-[-0.06em] text-white sm:text-5xl lg:text-6xl">
                  Think Fast. <span className="text-indigo-300">Answer Smart.</span> Rank Higher.
                </h1>
                <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">
                  Challenge your friends, classmates, and competitors in real-time aptitude competitions.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => handleNavAction('host')}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Create Quiz
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavAction('join')}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white/70 px-6 py-3.5 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-white"
                  >
                    Join Quiz
                  </button>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-slate-300">
                  <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> No account required to join</span>
                  <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Real-time multiplayer</span>
                  <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Fair scoring</span>
                </div>
              </div>

              <div className="relative"><TopCompetitors /></div>
            </div>
          </section>

          <section id="quick-action" className="relative z-10 -mt-8 pb-12">
            <div className="grid gap-5 rounded-[30px] border border-slate-200 bg-white/80 p-4 shadow-[0_28px_80px_rgba(15,23,42,0.12)] backdrop-blur-lg md:grid-cols-2 md:p-6">
              <div className="rounded-[26px] border border-slate-200 bg-slate-950 p-6 text-white">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Host</p>
                    <h3 className="text-2xl font-bold">HOST A QUIZ</h3>
                  </div>
                </div>
                <p className="mb-5 text-slate-300">Create a room and challenge others in a live competitive quiz battle.</p>
                <label htmlFor="host-name" className="mb-2 block text-sm font-medium text-slate-300">Host name</label>
                <input
                  id="host-name"
                  ref={hostInputRef}
                  value={hostName}
                  onChange={(event) => setHostName(event.target.value)}
                  placeholder="Enter your name"
                  className="mb-4 w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white outline-none transition focus:border-indigo-400"
                />
                <button
                  type="button"
                  onClick={handleCreateRoom}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-indigo-400"
                >
                  Create Room
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Join</p>
                    <h3 className="text-2xl font-bold text-slate-900">JOIN A QUIZ</h3>
                  </div>
                </div>
                <p className="mb-5 text-slate-600">Enter a room code to compete live with classmates and friends.</p>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="room-code" className="mb-2 block text-sm font-medium text-slate-700">Room code</label>
                    <input
                      id="room-code"
                      ref={joinInputRef}
                      value={joinCode}
                      onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                      placeholder="Enter room code"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="player-name" className="mb-2 block text-sm font-medium text-slate-700">Your name</label>
                    <input
                      id="player-name"
                      value={playerName}
                      onChange={(event) => setPlayerName(event.target.value)}
                      placeholder="Enter your display name"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="college" className="mb-2 block text-sm font-medium text-slate-700">College (optional)</label>
                    <input
                      id="college"
                      value={playerCollege}
                      onChange={(event) => setPlayerCollege(event.target.value)}
                      placeholder="Your college"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-400"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleJoinRoom}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Join Room
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>

          {roomState && (
            <section className="pb-12">
              <div className="rounded-[30px] border border-slate-200 bg-white/80 p-5 shadow-[0_28px_80px_rgba(15,23,42,0.08)] backdrop-blur-lg md:p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Room status</p>
                    <h3 className="mt-1 text-3xl font-black tracking-[0.18em] text-slate-900">{roomState.code}</h3>
                  </div>
                  <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
                    {statusBadge}
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-3">
                      {roomState.state === 'WAITING' && isHostView && (
                        <button type="button" onClick={handleStartGame} className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
                          <Play className="h-4 w-4" />
                          Start game
                        </button>
                      )}
                      {roomState.state === 'QUESTION_ACTIVE' && activeQuestion && (
                        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700">
                          <TimerReset className="h-4 w-4" />
                          {formatTime(remainingMs)} remaining
                        </div>
                      )}
                    </div>

                    {roomState.state === 'WAITING' && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Lobby</p>
                        <div className="space-y-2">
                          {roomState.players.map((player: Player) => (
                            <div key={player.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">{player.publicProfile?.avatarUrl ? <img src={player.publicProfile.avatarUrl} alt="" className="h-full w-full object-cover" /> : (player.publicProfile?.fullName || player.name).slice(0, 1).toUpperCase()}</span>
                                <div className="min-w-0">
                                  {player.publicProfile?.username ? <a href={`/profile/${player.publicProfile.username}`} className="truncate font-semibold text-slate-900 hover:text-indigo-700">{player.name} <span className="text-xs font-normal text-indigo-600">@{player.publicProfile.username}</span></a> : <p className="truncate font-semibold text-slate-900">{player.name}</p>}
                                  <p className="truncate text-xs text-slate-500">{player.publicProfile ? player.publicProfile.college || 'College hidden' : player.college || 'College not set'}</p>
                                </div>
                              </div>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                                {player.isHost ? 'Host' : 'Player'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {roomState.state === 'QUESTION_ACTIVE' && activeQuestion && (
                      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">{activeQuestion.topic}</p>
                        <h4 className="mt-2 text-xl font-bold text-slate-900">{activeQuestion.text}</h4>
                        {activeQuestion.image && <img src={activeQuestion.image.url} alt={activeQuestion.image.altText || ''} className="mt-4 max-h-80 max-w-full rounded-xl border border-slate-200 object-contain" />}
                        {activeQuestion.table && <div className="mt-4 max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-full text-left text-sm"><thead><tr>{activeQuestion.table.columns.map((column, index) => <th key={index} className="border-b bg-slate-50 px-3 py-2 font-semibold">{column}</th>)}</tr></thead><tbody>{activeQuestion.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border-b border-slate-100 px-3 py-2">{cell}</td>)}</tr>)}</tbody></table></div>}
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {activeQuestion.options.map((option: { id: string; text: string }) => {
                            const isSelected = selectedOptionId === option.id || currentPlayer?.lastAnswer?.optionId === option.id;
                            const isDisabled = !!currentPlayer?.answered || roomState.state !== 'QUESTION_ACTIVE';
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => handleSubmitAnswer(option.id)}
                                disabled={isDisabled}
                                className={`rounded-2xl border px-3 py-3 text-left text-sm font-medium transition ${
                                  isSelected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                                } ${isDisabled ? 'cursor-not-allowed opacity-80' : ''}`}
                              >
                                {option.text}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-white">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Leaderboard</p>
                    <div className="space-y-2">
                      {leaderboard.length > 0 ? leaderboard.map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-400/20 text-[10px] font-bold text-indigo-100">{entry.publicProfile?.avatarUrl ? <img src={entry.publicProfile.avatarUrl} alt="" className="h-full w-full object-cover" /> : entry.name.slice(0, 1).toUpperCase()}</span>
                            <div className="min-w-0">
                              <span className="font-semibold text-white">#{entry.rank} {entry.publicProfile?.username ? <a href={`/profile/${entry.publicProfile.username}`} className="hover:text-indigo-200">{entry.name}</a> : entry.name}</span>
                              <p className="text-[11px] text-slate-400">{entry.publicProfile ? entry.publicProfile.college || 'College hidden' : entry.college || 'No college listed'}</p>
                            </div>
                          </div>
                          <span className="font-bold text-indigo-300">{entry.score}</span>
                        </div>
                      )) : (
                        <p className="text-slate-400">No scores yet.</p>
                      )}
                    </div>
                    {currentPlayer && (
                      <div className="mt-4 rounded-xl border border-slate-800 bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Your stats</p>
                        <div className="mt-2 text-sm text-slate-200">
                          <p>Name: {currentPlayer.name}</p>
                          <p>Score: {currentPlayer.score}</p>
                          <p>Status: {currentPlayer.answered ? 'Answered' : 'Waiting'}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          <section id="features" className="pb-16">
            <div className="mb-8 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">Features</p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">Everything you need to compete.</h2>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="group rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_28px_70px_rgba(79,70,229,0.12)]">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">{feature.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{feature.description}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section id="how-it-works" className="pb-16">
            <div className="mb-8 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">How it works</p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">Jump into the action in four steps.</h2>
            </div>

            <div className="grid gap-5 lg:grid-cols-4">
              {steps.map((step) => (
                <div key={step.number} className="relative rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-lg font-black text-white">
                    {step.number}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">{step.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{step.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="pb-16">
            <div className="grid gap-5 rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_28px_80px_rgba(15,23,42,0.06)] md:grid-cols-4 md:p-8">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
                  <p className="text-3xl font-black tracking-[-0.06em] text-slate-900">{stat.value}</p>
                  <p className="mt-2 text-sm font-medium text-slate-600">{stat.label}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="about" className="pb-16">
            <div className="mb-8 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">Who is AptiQuiz for?</p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">Built for competitive learning.</h2>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              {useCases.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">{item.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{item.text}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="pb-8">
            <div className="rounded-[32px] border border-slate-200 bg-[linear-gradient(135deg,#0b1221_0%,#1a2442_100%)] p-8 text-white shadow-[0_32px_80px_rgba(15,23,42,0.2)] md:p-12">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-300">Ready to test your aptitude?</p>
                  <h2 className="mt-3 max-w-xl text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">Join a live competition or create your own room.</h2>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button type="button" onClick={() => handleNavAction('join')} className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100">
                    Join Quiz
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => handleNavAction('host')} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10">
                    Host Quiz
                  </button>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-slate-200 bg-white/70 text-slate-700 backdrop-blur-sm">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-10 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-lg font-black text-white">
                  A
                </div>
                <div>
                  <div className="text-lg font-bold text-slate-900">AptiQuiz</div>
                </div>
              </div>
              <p className="max-w-md text-sm leading-6 text-slate-600">Real-time aptitude competition for smarter, faster learning.</p>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              {navItems.map((item) => (
                <a key={item.label} href={item.href} className="text-slate-600 transition hover:text-slate-900">
                  {item.label}
                </a>
              ))}
              <a href="#" className="text-slate-600 transition hover:text-slate-900">Privacy</a>
              <a href="#" className="text-slate-600 transition hover:text-slate-900">Terms</a>
            </div>
          </div>

          <div className="border-t border-slate-200 px-4 py-5 text-center text-xs text-slate-500 sm:px-6 lg:px-8">
            © 2026 AptiQuiz. Built for competitive learning.
          </div>
        </footer>
      </div>

      {error && (
        <div className="fixed bottom-4 left-1/2 z-[70] w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 shadow-lg shadow-red-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div>
              <p className="font-semibold">Room update</p>
              <p>{error}</p>
            </div>
          </div>
        </div>
      )}

      {lastMessage && !error && (
        <div className="fixed bottom-4 right-4 z-[70] rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-medium text-slate-700 shadow-xl backdrop-blur-sm">
          {lastMessage}
        </div>
      )}
    </div>
  );
}
