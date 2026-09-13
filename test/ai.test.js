import test from 'node:test';
import assert from 'node:assert/strict';
import { AIAdapter, extractResponseText } from '../src/ai.js';

function makeResponse(payload) {
  return {
    ok: true,
    status: 200,
    async json() { return payload; },
    async text() { return JSON.stringify(payload); },
  };
}

function openAIEnvelope(object) {
  return {
    status: 'completed',
    output: [
      {
        type: 'message',
        content: [
          { type: 'output_text', text: JSON.stringify(object) },
        ],
      },
    ],
  };
}

test('extractResponseText finds output_text in raw Responses API payload', () => {
  const payload = openAIEnvelope({ hello: 'world' });
  assert.equal(extractResponseText(payload), '{"hello":"world"}');
});

test('generateProfile sends strict structured output and returns validated profile', async () => {
  const profile = {
    archetype: 'quiet night-shift worker',
    temperament: 'patient and dry',
    traits: ['patient', 'observant', 'loyal', 'sarcastic'],
    likes: ['tea', 'football', 'night walks', 'old music'],
    dislikes: ['show-offs', 'litter', 'being rushed', 'loud chewing'],
    speakingStyle: 'casual, short, dry humor',
    values: ['loyalty', 'privacy', 'reliability'],
    quirks: ['always notices the weather', 'judges terrible shoes'],
    socialEnergy: 4,
    patience: 8,
  };

  let request;
  const adapter = new AIAdapter({
    apiKey: 'test-key',
    model: 'gpt-5.6-luna',
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return makeResponse(openAIEnvelope(profile));
    },
  });

  const result = await adapter.generateProfile({ npcUserId: 123, username: 'SomeUser', displayName: 'Some User' });

  assert.deepEqual(result, profile);
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.body.model, 'gpt-5.6-luna');
  assert.equal(request.body.text.format.type, 'json_schema');
  assert.equal(request.body.text.format.strict, true);
  assert.match(request.body.instructions, /fictional.*character/i);
  assert.doesNotMatch(request.body.instructions, /infer real/i);
});

test('generatePlayerTurn rejects malformed structured output', async () => {
  const adapter = new AIAdapter({
    apiKey: 'test-key',
    fetchImpl: async () => makeResponse(openAIEnvelope({ npcLine: 'bad' })),
  });

  await assert.rejects(
    adapter.generatePlayerTurn({ npcProfile: {}, relationship: {}, player: {} }),
    /invalid player turn/i,
  );
});

test('player opening prompt requires username recognition and opinion-shaped greeting', async () => {
  const turn = {
    npcLine: 'PkLeetunor, good to see you.',
    responses: [
      { id: 'a', text: 'Good to see you too.', opinionDelta: 2 },
      { id: 'b', text: 'Whatever.', opinionDelta: -3 },
    ],
    relationshipSummary: 'They know each other.',
    memory: '',
    memoryImportance: 0,
  };

  let request;
  const adapter = new AIAdapter({
    apiKey: 'test-key',
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return makeResponse(openAIEnvelope(turn));
    },
  });

  await adapter.generatePlayerTurn({
    isOpening: true,
    npcProfile: {},
    player: { username: 'PkLeetunor' },
    relationship: { opinion: 10 },
  });

  assert.match(request.instructions, /opening.*must.*username/i);
  assert.match(request.instructions, /low opinion.*annoy/i);
  assert.match(request.instructions, /high opinion.*warm/i);
});
