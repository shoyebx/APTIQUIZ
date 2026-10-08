import {
  deleteQuestion,
  duplicateQuestion,
  updateQuestion,
} from '@/lib/question-bank-store';
import { getBearerToken, jsonError, readJsonBody, unauthorized } from '@/lib/profile-api';

export const runtime = 'nodejs';

type RouteContext = { params: { setId: string; questionId: string } };

export async function PATCH(request: Request, { params }: RouteContext) {
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  try {
    const question = await updateQuestion(token, params.setId, params.questionId, await readJsonBody(request));
    if (question === null) return Response.json({ error: 'Question set not found.' }, { status: 404 });
    return question ? Response.json(question) : Response.json({ error: 'Question not found.' }, { status: 404 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  try {
    const deleted = await deleteQuestion(token, params.setId, params.questionId);
    return deleted ? new Response(null, { status: 204 }) : Response.json({ error: 'Question not found.' }, { status: 404 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  try {
    const question = await duplicateQuestion(token, params.setId, params.questionId);
    if (question === null) return Response.json({ error: 'Question set not found.' }, { status: 404 });
    return question ? Response.json(question, { status: 201 }) : Response.json({ error: 'Question not found.' }, { status: 404 });
  } catch (error) {
    return jsonError(error);
  }
}
