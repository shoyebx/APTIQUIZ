import {
  createQuestionSet,
  listQuestionSets,
} from '@/lib/question-bank-store';
import { getBearerToken, jsonError, readJsonBody, unauthorized } from '@/lib/profile-api';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  const url = new URL(request.url);
  try {
    const sets = await listQuestionSets(token, {
      search: url.searchParams.get('search') || '',
      topic: url.searchParams.get('topic') || '',
      difficulty: url.searchParams.get('difficulty') || '',
      status: url.searchParams.get('status') || '',
    });
    return Response.json({ items: sets });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  try {
    const questionSet = await createQuestionSet(token, await readJsonBody(request));
    return Response.json(questionSet, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
