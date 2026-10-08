import { getPublicAvatarByUsername } from '@/lib/profile-store';
import { jsonError } from '@/lib/profile-api';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: { username: string } }) {
  try {
    const avatar = await getPublicAvatarByUsername(params.username);
    if (!avatar) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(avatar.buffer), {
      headers: {
        'Content-Type': avatar.contentType,
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
