import test from 'node:test';
import assert from 'node:assert/strict';
import {
  profileSchema,
  playerTurnSchema,
  socialChatSchema,
  validateProfile,
  validatePlayerTurn,
  validateSocialChat,
} from '../src/aiSchemas.js';

test('profile schema requires one stable fictional character profile shape', () => {
  const valid = {
    archetype: 'laid-back student',
    temperament: 'calm but stubborn',
    traits: ['loyal', 'dry', 'observant', 'competitive'],
    likes: ['football', 'late-night food', 'music', 'quiet streets'],
    dislikes: ['bragging', 'crowds', 'being rushed', 'bad coffee'],
    speakingStyle: 'short casual sentences with dry jokes',
    values: ['loyalty', 'honesty', 'independence'],
    quirks: ['always complains about coffee', 'notices shoes'],
    socialEnergy: 5,
    patience: 6,
  };

  assert.equal(validateProfile(valid), true);
  assert.equal(profileSchema.type, 'object');
  assert.equal(profileSchema.additionalProperties, false);
});

test('player turn schema enforces exactly two responses and opinion deltas -8..8', () => {
  const valid = {
    npcLine: 'PkLeetunor, you again? What happened this time?',
    responses: [
      { id: 'a', text: 'Good to see you too.', opinionDelta: 2 },
      { id: 'b', text: 'None of your business.', opinionDelta: -4 },
    ],
    relationshipSummary: 'They have spoken before and the NPC finds the player mildly annoying.',
    memory: 'PkLeetunor joked back instead of getting angry.',
    memoryImportance: 2,
  };

  assert.equal(validatePlayerTurn(valid), true);
  assert.equal(validatePlayerTurn({ ...valid, responses: [valid.responses[0]] }), false);
  assert.equal(validatePlayerTurn({ ...valid, responses: [
    { id: 'a', text: 'x', opinionDelta: 9 },
    valid.responses[1],
  ] }), false);
});

test('social chat schema has exchanges plus two explicit farewells', () => {
  const valid = {
    exchanges: [
      { a: 'You still going to that place later?', b: 'Maybe. Depends if it rains.' },
      { a: 'You say that every time.', b: 'And I am usually right.' },
      { a: 'Fair enough.', b: 'Exactly.' },
      { a: 'Anyway, tell me if you do.', b: 'I will.' },
    ],
    farewellA: 'Alright, I should get going. See you later.',
    farewellB: 'Yeah, catch you around.',
    summaryA: 'A and B chatted casually about later plans.',
    summaryB: 'B and A chatted casually about later plans.',
    memoryA: 'B might go out later if the weather holds.',
    memoryB: 'A asked B about later plans.',
    memoryImportanceA: 1,
    memoryImportanceB: 1,
    opinionDeltaA: 1,
    opinionDeltaB: 1,
  };

  assert.equal(validateSocialChat(valid), true);
  assert.equal(validateSocialChat({ ...valid, exchanges: [] }), false);
  assert.equal(socialChatSchema.type, 'object');
});
