import { reorderQuestions } from '@/lib/question-bank-store';
import { getBearerToken, jsonError, readJsonBody, unauthorized } from '@/lib/profile-api';

export const runtime = 'nodejs';

export async function PATCH(request: Request, { params }: { params: { setId: string } }) {
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  try {
    const body = await readJsonBody(request);
    const questions = await reorderQuestions(token, params.setId, body.questionIds);
    return questions ? Response.json({ items: questions }) : Response.json({ error: 'Question set not found.' }, { status: 404 });
  } catch (error) {
    return jsonError(error);
  }
}
