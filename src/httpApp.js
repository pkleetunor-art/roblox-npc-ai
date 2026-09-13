import { timingSafeEqual } from 'node:crypto';

const MAX_BODY_BYTES = 64 * 1024;

function writeJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left ?? ''));
  const b = Buffer.from(String(right ?? ''));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function readJson(req) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error('Request body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error('Request body must be valid JSON');
    error.statusCode = 400;
    throw error;
  }
}

function validId(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function validShortString(value, max = 128) {
  return typeof value === 'string' && value.length >= 1 && value.length <= max;
}

function requireIdentity(value, label) {
  if (!value || typeof value !== 'object') throw new Error(`${label} is required`);
  if (!validId(value.userId)) throw new Error(`${label}.userId must be positive`);
  if (!validShortString(value.username, 32)) throw new Error(`${label}.username is invalid`);
  if (value.displayName !== undefined && !validShortString(value.displayName, 64)) {
    throw new Error(`${label}.displayName is invalid`);
  }
}

function requireConversationId(value, label = 'conversationId') {
  if (!validShortString(value, 80)) throw new Error(`${label} is invalid`);
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function createHttpHandler({ service, authToken, logger = console } = {}) {
  if (!service) throw new Error('service is required');
  if (!authToken) throw new Error('BACKEND_AUTH_TOKEN is required');

  return async function handler(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/health') {
        writeJson(res, 200, { ok: true, service: 'persistent-roblox-npc-ai' });
        return;
      }

      if (!url.pathname.startsWith('/v1/')) {
        writeJson(res, 404, { ok: false, error: 'Not found' });
        return;
      }

      if (!safeEqual(req.headers['x-npc-ai-token'], authToken)) {
        writeJson(res, 401, { ok: false, error: 'Unauthorized' });
        return;
      }

      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: 'Method not allowed' });
        return;
      }

      const body = await readJson(req);
      let data;

      switch (url.pathname) {
        case '/v1/player/start': {
          try {
            requireIdentity(body.npc, 'npc');
            requireIdentity(body.player, 'player');
          } catch (error) {
            throw badRequest(error.message);
          }
          data = await service.startPlayerConversation({ npc: body.npc, player: body.player });
          break;
        }

        case '/v1/player/respond': {
          if (!validShortString(body.conversationId, 80)) throw badRequest('conversationId is invalid');
          if (body.choiceId !== 'a' && body.choiceId !== 'b') throw badRequest('choiceId must be a or b');
          data = await service.respondPlayerConversation({
            conversationId: body.conversationId,
            choiceId: body.choiceId,
          });
          break;
        }

        case '/v1/player/end': {
          try { requireConversationId(body.conversationId); } catch (error) { throw badRequest(error.message); }
          data = await service.endPlayerConversation({ conversationId: body.conversationId });
          break;
        }

        case '/v1/npc/chat': {
          try {
            requireIdentity(body.npcA, 'npcA');
            requireIdentity(body.npcB, 'npcB');
          } catch (error) {
            throw badRequest(error.message);
          }
          if (Number(body.npcA.userId) === Number(body.npcB.userId)) {
            throw badRequest('npcA and npcB must be different characters');
          }
          data = await service.startNpcChat({ npcA: body.npcA, npcB: body.npcB });
          break;
        }

        case '/v1/npc/chat/complete': {
          if (!validShortString(body.chatId, 80)) throw badRequest('chatId is invalid');
          data = await service.completeNpcChat({ chatId: body.chatId });
          break;
        }

        case '/v1/npc/chat/cancel': {
          if (!validShortString(body.chatId, 80)) throw badRequest('chatId is invalid');
          data = await service.cancelNpcChat({ chatId: body.chatId });
          break;
        }

        default:
          writeJson(res, 404, { ok: false, error: 'Not found' });
          return;
      }

      writeJson(res, 200, { ok: true, data });
    } catch (error) {
      const status = Number(error.statusCode) || 500;
      if (status >= 500) {
        logger.error?.('[npc-ai] request failed:', error);
      }
      writeJson(res, status, {
        ok: false,
        error: status >= 500 ? 'Backend request failed' : error.message,
      });
    }
  };
}
