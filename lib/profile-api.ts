import { ProfileError } from './profile-store';

export function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]{40,64})$/);
  return match?.[1] || null;
}

export async function readJsonBody(request: Request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 500_000) throw new ProfileError('BODY_TOO_LARGE', 'Profile update is too large.', 413);
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 500_000) {
    throw new ProfileError('BODY_TOO_LARGE', 'Profile update is too large.', 413);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new ProfileError('INVALID_BODY', 'Request body must be valid JSON.');
  }
}

export function jsonError(error: unknown) {
  const profileError = error as Error & { status?: number; code?: string };
  const status = profileError.status || 500;
  return Response.json({
    error: status >= 500 ? 'Profile service is temporarily unavailable.' : profileError.message,
    code: status >= 500 ? 'PROFILE_SERVICE_ERROR' : profileError.code || 'INVALID_REQUEST',
  }, { status });
}

export function unauthorized() {
  return Response.json({ error: 'A valid profile session is required.', code: 'UNAUTHORIZED' }, { status: 401 });
}
