import { getLeaderboardPage } from '@/lib/profile-store';
import { getBearerToken, jsonError } from '@/lib/profile-api';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization');
  const token = getBearerToken(request);
  if (authorization && !token) {
    return Response.json({ error: 'Invalid profile session.', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestedPage = Number.parseInt(url.searchParams.get('page') || '1', 10);
  const requestedSize = Number.parseInt(url.searchParams.get('pageSize') || '8', 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
  const pageSize = Number.isFinite(requestedSize) ? Math.min(100, Math.max(1, requestedSize)) : 8;

  try {
    const leaderboard = await getLeaderboardPage({ token: token || undefined, page, pageSize });
    return Response.json(leaderboard, {
      headers: { 'Cache-Control': token ? 'private, no-store' : 'public, max-age=30' },
    });
  } catch (error) {
    return jsonError(error);
  }
}
