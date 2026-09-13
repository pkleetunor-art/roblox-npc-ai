import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHttpHandler } from '../src/httpApp.js';

async function withServer(handler, fn) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function fakeService() {
  return {
    async startPlayerConversation(body) { return { route: 'start', body, opinion: 50, responses: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] }; },
    async respondPlayerConversation(body) { return { route: 'respond', body, opinion: 55 }; },
    async endPlayerConversation(body) { return { route: 'end', body, ended: true }; },
    async startNpcChat(body) { return { route: 'npc-chat', body, chatId: 'chat', turns: [] }; },
    async completeNpcChat(body) { return { route: 'complete', body, completed: true }; },
    async cancelNpcChat(body) { return { route: 'cancel', body, cancelled: true }; },
  };
}

async function jsonRequest(base, path, { token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(token ? { 'x-npc-ai-token': token } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, json: await response.json() };
}

test('health is public but v1 endpoints require backend token', async () => {
  const handler = createHttpHandler({ service: fakeService(), authToken: 'secret' });
  await withServer(handler, async (base) => {
    const health = await jsonRequest(base, '/health');
    assert.equal(health.response.status, 200);
    assert.equal(health.json.ok, true);

    const denied = await jsonRequest(base, '/v1/player/start', { body: {} });
    assert.equal(denied.response.status, 401);

    const allowed = await jsonRequest(base, '/v1/player/start', {
      token: 'secret',
      body: {
        npc: { userId: 1, username: 'Npc', displayName: 'NPC' },
        player: { userId: 2, username: 'Player', displayName: 'Player' },
      },
    });
    assert.equal(allowed.response.status, 200);
    assert.equal(allowed.json.ok, true);
    assert.equal(allowed.json.data.route, 'start');
  });
});

test('respond validates choice id before calling service', async () => {
  let called = false;
  const service = fakeService();
  service.respondPlayerConversation = async () => { called = true; return {}; };
  const handler = createHttpHandler({ service, authToken: 'secret' });

  await withServer(handler, async (base) => {
    const result = await jsonRequest(base, '/v1/player/respond', {
      token: 'secret',
      body: { conversationId: 'abc', choiceId: 'never-mind-is-server-action' },
    });
    assert.equal(result.response.status, 400);
    assert.equal(called, false);
  });
});

test('all social completion routes map to service methods', async () => {
  const handler = createHttpHandler({ service: fakeService(), authToken: 'secret' });
  await withServer(handler, async (base) => {
    for (const [path, field] of [
      ['/v1/npc/chat/complete', 'completed'],
      ['/v1/npc/chat/cancel', 'cancelled'],
    ]) {
      const result = await jsonRequest(base, path, {
        token: 'secret',
        body: { chatId: 'abc' },
      });
      assert.equal(result.response.status, 200);
      assert.equal(result.json.data[field], true);
    }
  });
});
