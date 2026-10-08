# APTIQUIZ ⚡

A live multiplayer aptitude quiz app built as a hackathon MVP for fast, fair, real-time gameplay.

## What is included

- Host room creation with short room codes
- Player join flow with optional college
- Live lobby with synchronized room state
- Server-authoritative quiz timing
- Speed + accuracy scoring
- Answer reveal after each round
- Leaderboard updates and final results
- Reconnect-safe session restoration
- 50-player load simulation script
- Unit tests for scoring and room validation

## Run locally

1. Install dependencies:
   npm install
2. Start the app:
   npm run dev
3. Open http://localhost:3000

## Environment

Copy `.env.example` to `.env` and adjust values if needed:

```bash
cp .env.example .env
```

## Fairness strategy

The server is the referee. Each round uses a server-owned question lifecycle and server timestamps instead of browser clocks.

- The host starts the round from the server.
- The server decides the active question and deadline.
- Clients only render countdown visuals based on server timestamps.
- Answers are validated on the server before scoring.
- Duplicate answers, wrong room membership, wrong question IDs, and late submissions are rejected.
- The score is computed on the server using correctness and remaining time, not from client-provided values.

This keeps players on different network conditions competitive without trusting the browser clock.

## Test script

Run the 50-player simulation with:

```bash
npm run test:50
```

The simulation connects 50 players to a single room, joins the lobby, starts the game, and submits randomized answers across multiple rounds. It records connection-level issues and verifies the room remains stable under a realistic concurrent load.

## Unit tests

```bash
npm test
```

The suite covers:

- scoring for correct vs wrong answers
- speed-bonus behavior
- room creation and state recovery
- duplicate and late answer rejection

## Notes

This MVP uses an in-memory authoritative game engine for real-time state management. It is intentionally designed to be fast and hackathon-friendly while keeping the core fairness rules required for live multiplayer quiz gameplay.
