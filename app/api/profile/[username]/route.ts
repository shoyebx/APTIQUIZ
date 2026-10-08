import { getPublicProfileByUsername } from '@/lib/profile-store';
import { jsonError } from '@/lib/profile-api';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: { username: string } }) {
  try {
    const profile = await getPublicProfileByUsername(params.username);
    return profile ? Response.json(profile) : Response.json({ error: 'Public profile not found.' }, { status: 404 });
  } catch (error) {
    return jsonError(error);
  }
}
