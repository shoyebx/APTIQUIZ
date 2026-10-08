import { getQuestionImage } from '@/lib/question-image-store';
import { jsonError } from '@/lib/profile-api';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: { imageId: string } }) {
  try {
    const image = await getQuestionImage(params.imageId);
    if (!image) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(image.buffer), {
      headers: {
        'Content-Type': image.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
