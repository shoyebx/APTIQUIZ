import { addQuestion } from '@/lib/question-bank-store';
import { getBearerToken, jsonError, readJsonBody, unauthorized } from '@/lib/profile-api';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { setId: string } }) {
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  try {
    const question = await addQuestion(token, params.setId, await readJsonBody(request));
    return question ? Response.json(question, { status: 201 }) : Response.json({ error: 'Question set not found.' }, { status: 404 });
  } catch (error) {
    return jsonError(error);
  }
}
