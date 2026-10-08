import { createProfile } from '@/lib/profile-store';
import { jsonError, readJsonBody } from '@/lib/profile-api';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const result = await createProfile(body);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
