import {
  deleteProfile,
  getProfileByToken,
  updateProfile,
} from '@/lib/profile-store';
import { getBearerToken, jsonError, readJsonBody, unauthorized } from '@/lib/profile-api';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  try {
    const profile = await getProfileByToken(token);
    return profile ? Response.json(profile) : unauthorized();
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  try {
    const profile = await updateProfile(token, await readJsonBody(request));
    return Response.json(profile);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  try {
    const deleted = await deleteProfile(token);
    return deleted ? new Response(null, { status: 204 }) : unauthorized();
  } catch (error) {
    return jsonError(error);
  }
}
