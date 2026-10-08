import { duplicateQuestionSet } from '@/lib/question-bank-store';
import { getBearerToken, jsonError, unauthorized } from '@/lib/profile-api';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { setId: string } }) {
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  try {
    const questionSet = await duplicateQuestionSet(token, params.setId);
    return questionSet ? Response.json(questionSet, { status: 201 }) : Response.json({ error: 'Question set not found.' }, { status: 404 });
  } catch (error) {
    return jsonError(error);
  }
}
