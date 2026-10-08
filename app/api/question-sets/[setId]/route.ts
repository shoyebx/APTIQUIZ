import {
  deleteQuestionSet,
  getQuestionSet,
  updateQuestionSet,
} from '@/lib/question-bank-store';
import { getBearerToken, jsonError, readJsonBody, unauthorized } from '@/lib/profile-api';

export const runtime = 'nodejs';

type RouteContext = { params: { setId: string } };

export async function GET(request: Request, { params }: RouteContext) {
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  try {
    const questionSet = await getQuestionSet(token, params.setId);
    return questionSet ? Response.json(questionSet) : Response.json({ error: 'Question set not found.' }, { status: 404 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  try {
    const questionSet = await updateQuestionSet(token, params.setId, await readJsonBody(request));
    return questionSet ? Response.json(questionSet) : Response.json({ error: 'Question set not found.' }, { status: 404 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  try {
    const deleted = await deleteQuestionSet(token, params.setId);
    return deleted ? new Response(null, { status: 204 }) : Response.json({ error: 'Question set not found.' }, { status: 404 });
  } catch (error) {
    return jsonError(error);
  }
}
