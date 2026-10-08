import { storeQuestionImage } from '@/lib/question-image-store';
import { getBearerToken, jsonError, unauthorized } from '@/lib/profile-api';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  try {
    const form = await request.formData();
    const file = form.get('image');
    if (!(file instanceof File)) return Response.json({ error: 'Choose an image to upload.' }, { status: 400 });
    if (file.size > 2 * 1024 * 1024) return Response.json({ error: 'Question images must be 2 MB or smaller.' }, { status: 413 });
    const result = await storeQuestionImage(token, Buffer.from(await file.arrayBuffer()), file.type);
    return Response.json({ ...result, altText: String(form.get('altText') || '').slice(0, 200) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
