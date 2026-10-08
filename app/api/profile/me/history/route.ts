import { getProfileHistory } from '@/lib/profile-store';
import { getBearerToken, jsonError, unauthorized } from '@/lib/profile-api';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  const url = new URL(request.url);
  const quizId = url.searchParams.get('quizId') || undefined;
  const requestedPage = Number.parseInt(url.searchParams.get('page') || '1', 10);
  const requestedSize = Number.parseInt(url.searchParams.get('pageSize') || '10', 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
  const pageSize = Number.isFinite(requestedSize) ? Math.min(25, Math.max(1, requestedSize)) : 10;
  try {
    const result = await getProfileHistory(token, { page, pageSize, quizId });
    if (!result) return Response.json({ error: 'Profile or quiz history not found.' }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
