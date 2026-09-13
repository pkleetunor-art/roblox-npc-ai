import test from 'node:test';
import assert from 'node:assert/strict';
import { SocialService } from '../src/socialService.js';

function profileFor(name) {
  return {
    archetype: `${name} archetype`,
    temperament: 'calm',
    traits: ['loyal', 'dry', 'observant', 'stubborn'],
    likes: ['football', 'music', 'food', 'walking'],
    dislikes: ['bragging', 'noise', 'rudeness', 'waiting'],
    speakingStyle: 'casual',
    values: ['loyalty', 'honesty', 'privacy'],
    quirks: ['notices shoes', 'complains about weather'],
    socialEnergy: 5,
    patience: 5,
  };
}

class FakeRepo {
  constructor() {
    this.profiles = new Map();
    this.relationships = new Map();
    this.messages = [];
    this.memories = [];
    this.playerSessions = new Map();
    this.npcRelationships = new Map();
    this.socialSessions = new Map();
  }

  pair(n, p) { return `${n}:${p}`; }
  npcPair(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }

  async getNpcProfile(id) { return this.profiles.get(id) ?? null; }
  async insertNpcProfile({ userId, username, displayName, profile }) {
    if (!this.profiles.has(userId)) {
      this.profiles.set(userId, { npc_user_id: userId, username, display_name: displayName, profile });
    }
    return this.profiles.get(userId);
  }
  async ensurePlayerRelationship({ npcUserId, playerUserId, playerUsername }) {
    const key = this.pair(npcUserId, playerUserId);
    if (!this.relationships.has(key)) {
      this.relationships.set(key, {
        npc_user_id: npcUserId,
        player_user_id: playerUserId,
        player_username: playerUsername,
        opinion: 50,
        relationship_summary: '',
      });
    }
    const rel = this.relationships.get(key);
    rel.player_username = playerUsername;
    return { ...rel };
  }
  async getPlayerRelationship({ npcUserId, playerUserId }) {
    const rel = this.relationships.get(this.pair(npcUserId, playerUserId));
    return rel ? { ...rel } : null;
  }
  async applyPlayerOpinionDelta({ npcUserId, playerUserId, playerUsername, delta, relationshipSummary }) {
    const rel = this.relationships.get(this.pair(npcUserId, playerUserId));
    rel.opinion = Math.max(1, Math.min(100, rel.opinion + delta));
    rel.player_username = playerUsername;
    rel.relationship_summary = relationshipSummary;
    return { ...rel };
  }
  async addMemory(memory) { this.memories.push({ ...memory }); return memory; }
  async getMemories({ npcUserId, subjectType, subjectId }) {
    return this.memories.filter((m) => m.npcUserId === npcUserId && m.subjectType === subjectType && m.subjectId === subjectId);
  }
  async getRecentNpcMemories({ npcUserId, limit = 12 }) {
    return this.memories
      .filter((m) => m.npcUserId === npcUserId)
      .slice(-limit)
      .reverse();
  }
  async addMessage(message) { this.messages.push({ ...message }); return message; }
  async getRecentMessages({ npcUserId, playerUserId, limit = 16 }) {
    return this.messages.filter((m) => m.npcUserId === npcUserId && m.playerUserId === playerUserId).slice(-limit);
  }
  async createPlayerSession(session) {
    const row = {
      id: session.id,
      npc_user_id: session.npcUserId,
      player_user_id: session.playerUserId,
      player_username: session.playerUsername,
      pending_options: structuredClone(session.pendingOptions),
      active: true,
    };
    this.playerSessions.set(row.id, row);
    return structuredClone(row);
  }
  async getPlayerSession(id) {
    const row = this.playerSessions.get(id);
    return row ? structuredClone(row) : null;
  }
  async updatePlayerSessionOptions({ id, pendingOptions }) {
    const row = this.playerSessions.get(id);
    if (!row || !row.active) return null;
    row.pending_options = structuredClone(pendingOptions);
    return structuredClone(row);
  }
  async endPlayerSession(id) {
    const row = this.playerSessions.get(id);
    if (!row) return null;
    row.active = false;
    return structuredClone(row);
  }
  async ensureNpcRelationship({ npcAUserId, npcBUserId }) {
    const key = this.npcPair(npcAUserId, npcBUserId);
    if (!this.npcRelationships.has(key)) {
      this.npcRelationships.set(key, {
        a: Math.min(npcAUserId, npcBUserId), b: Math.max(npcAUserId, npcBUserId),
        opinion_a_of_b: 50, opinion_b_of_a: 50, summary_a: '', summary_b: '',
      });
    }
    return this.getNpcRelationship({ npcAUserId, npcBUserId });
  }
  async getNpcRelationship({ npcAUserId, npcBUserId }) {
    const row = this.npcRelationships.get(this.npcPair(npcAUserId, npcBUserId));
    if (!row) return null;
    const swapped = npcAUserId > npcBUserId;
    return {
      opinionAOfB: swapped ? row.opinion_b_of_a : row.opinion_a_of_b,
      opinionBOfA: swapped ? row.opinion_a_of_b : row.opinion_b_of_a,
      summaryA: swapped ? row.summary_b : row.summary_a,
      summaryB: swapped ? row.summary_a : row.summary_b,
    };
  }
  async applyNpcRelationshipOutcome({ npcAUserId, npcBUserId, deltaA, deltaB, summaryA, summaryB }) {
    const key = this.npcPair(npcAUserId, npcBUserId);
    const row = this.npcRelationships.get(key);
    const swapped = npcAUserId > npcBUserId;
    if (!swapped) {
      row.opinion_a_of_b = Math.max(1, Math.min(100, row.opinion_a_of_b + deltaA));
      row.opinion_b_of_a = Math.max(1, Math.min(100, row.opinion_b_of_a + deltaB));
      row.summary_a = summaryA;
      row.summary_b = summaryB;
    } else {
      row.opinion_b_of_a = Math.max(1, Math.min(100, row.opinion_b_of_a + deltaA));
      row.opinion_a_of_b = Math.max(1, Math.min(100, row.opinion_a_of_b + deltaB));
      row.summary_b = summaryA;
      row.summary_a = summaryB;
    }
    return row;
  }
  async createSocialSession({ id, npcAUserId, npcBUserId, generatedPayload }) {
    const row = { id, npc_a_user_id: npcAUserId, npc_b_user_id: npcBUserId, generated_payload: structuredClone(generatedPayload), status: 'pending' };
    this.socialSessions.set(id, row);
    return structuredClone(row);
  }
  async getSocialSession(id) {
    const row = this.socialSessions.get(id);
    return row ? structuredClone(row) : null;
  }
  async setSocialSessionStatus({ id, status }) {
    const row = this.socialSessions.get(id);
    if (!row || row.status !== 'pending') return null;
    row.status = status;
    return structuredClone(row);
  }
  async runInTransaction(fn) { return fn(this); }
}

class FakeAI {
  constructor() { this.profileCalls = []; this.playerCalls = []; this.socialCalls = []; }
  async generateProfile(ctx) {
    this.profileCalls.push(structuredClone(ctx));
    return profileFor(ctx.username);
  }
  async generatePlayerTurn(ctx) {
    this.playerCalls.push(structuredClone(ctx));
    return {
      npcLine: ctx.isOpening
        ? `${ctx.player.username}, good to see you.`
        : `Alright ${ctx.player.username}, I hear you.`,
      responses: [
        { id: 'a', text: 'Glad to hear it.', opinionDelta: 4 },
        { id: 'b', text: 'Whatever.', opinionDelta: -6 },
      ],
      relationshipSummary: `Knows ${ctx.player.username}; opinion ${ctx.relationship.opinion}.`,
      memory: `${ctx.player.username} talked with the NPC.`,
      memoryImportance: 2,
    };
  }
  async generateSocialChat(ctx) {
    this.socialCalls.push(structuredClone(ctx));
    return {
      exchanges: [
        { a: 'You still like football?', b: 'Obviously.' },
        { a: 'Thought so.', b: 'You ask every time.' },
        { a: 'Because you never shut up about it.', b: 'Fair.' },
        { a: 'Anyway, game later?', b: 'Maybe.' },
      ],
      farewellA: 'Alright, see you later.',
      farewellB: 'Yeah, catch you around.',
      summaryA: 'A and B know each other and joke about football.',
      summaryB: 'B and A know each other and joke about football.',
      memoryA: 'B still likes football.',
      memoryB: 'A may watch a game later.',
      memoryImportanceA: 2,
      memoryImportanceB: 2,
      opinionDeltaA: 1,
      opinionDeltaB: 1,
    };
  }
}

const npc = { userId: 1001, username: 'NpcFriend', displayName: 'NPC Friend' };
const player = { userId: 2002, username: 'PkLeetunor', displayName: 'PK' };

test('first player conversation creates persistent NPC once, uses username, and returns exactly two responses', async () => {
  const repo = new FakeRepo();
  const ai = new FakeAI();
  const service = new SocialService({ repository: repo, ai, idFactory: () => '11111111-1111-4111-8111-111111111111' });

  const first = await service.startPlayerConversation({ npc, player });
  const secondProfile = await service.ensureNpcProfile(npc);

  assert.equal(ai.profileCalls.length, 1);
  assert.equal(secondProfile.profile.archetype, 'NpcFriend archetype');
  assert.equal(first.npcLine.includes('PkLeetunor'), true);
  assert.equal(first.responses.length, 2);
  assert.deepEqual(first.responses.map((x) => Object.keys(x).sort()), [['id', 'text'], ['id', 'text']]);
  assert.equal(first.opinion, 50);
});

test('chosen AI response changes opinion, persists player line/memory, and feeds new opinion into next AI turn', async () => {
  const repo = new FakeRepo();
  const ai = new FakeAI();
  let id = 0;
  const service = new SocialService({ repository: repo, ai, idFactory: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}` });

  const start = await service.startPlayerConversation({ npc, player });
  const next = await service.respondPlayerConversation({ conversationId: start.conversationId, choiceId: 'b' });

  assert.equal(next.opinion, 44);
  assert.equal(ai.playerCalls.at(-1).relationship.opinion, 44);
  assert.equal(repo.messages.some((m) => m.speaker === 'player' && m.text === 'Whatever.'), true);
  assert.equal(repo.memories.some((m) => m.subjectId === player.userId), true);
});

test('opinion remains clamped to 1..100 across repeated responses', async () => {
  const repo = new FakeRepo();
  const ai = new FakeAI();
  let seq = 0;
  const service = new SocialService({ repository: repo, ai, idFactory: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}` });

  await service.ensureNpcProfile(npc);
  await repo.ensurePlayerRelationship({ npcUserId: npc.userId, playerUserId: player.userId, playerUsername: player.username });
  repo.relationships.get(`${npc.userId}:${player.userId}`).opinion = 3;

  const start = await service.startPlayerConversation({ npc, player });
  const next = await service.respondPlayerConversation({ conversationId: start.conversationId, choiceId: 'b' });
  assert.equal(next.opinion, 1);
});

test('social chat is generated from both persistent character profiles but only affects memory after completion', async () => {
  const repo = new FakeRepo();
  const ai = new FakeAI();
  let seq = 0;
  const service = new SocialService({ repository: repo, ai, idFactory: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}` });

  const npcB = { userId: 1002, username: 'OtherFriend', displayName: 'Other Friend' };
  const chat = await service.startNpcChat({ npcA: npc, npcB });

  assert.equal(ai.profileCalls.length, 2);
  assert.equal(chat.turns.length, 10);
  assert.match(chat.turns.at(-2).text, /see you/i);
  assert.match(chat.turns.at(-1).text, /catch you/i);
  assert.equal(repo.memories.length, 0);

  await service.completeNpcChat({ chatId: chat.chatId });
  assert.equal(repo.memories.length, 2);
  const relation = await repo.getNpcRelationship({ npcAUserId: npc.userId, npcBUserId: npcB.userId });
  assert.equal(relation.opinionAOfB, 51);
  assert.equal(relation.opinionBOfA, 51);
});

test('cancelled social chat does not persist generated memories or relationship changes', async () => {
  const repo = new FakeRepo();
  const ai = new FakeAI();
  const service = new SocialService({ repository: repo, ai, idFactory: () => '22222222-2222-4222-8222-222222222222' });
  const npcB = { userId: 1002, username: 'OtherFriend', displayName: 'Other Friend' };

  const chat = await service.startNpcChat({ npcA: npc, npcB });
  await service.cancelNpcChat({ chatId: chat.chatId });
  const completion = await service.completeNpcChat({ chatId: chat.chatId });

  assert.equal(completion.completed, false);
  assert.equal(repo.memories.length, 0);
  const relation = await repo.getNpcRelationship({ npcAUserId: npc.userId, npcBUserId: npcB.userId });
  assert.equal(relation.opinionAOfB, 50);
});


test('NPC social AI receives broader memories the character knows, including prior player interactions', async () => {
  const repo = new FakeRepo();
  const ai = new FakeAI();
  const service = new SocialService({
    repository: repo,
    ai,
    idFactory: () => '33333333-3333-4333-8333-333333333333',
  });

  const npcB = { userId: 1002, username: 'OtherFriend', displayName: 'Other Friend' };

  await service.ensureNpcProfile(npc);
  await repo.addMemory({
    npcUserId: npc.userId,
    subjectType: 'player',
    subjectId: player.userId,
    memory: 'PkLeetunor said they love football yesterday.',
    importance: 4,
  });

  await service.startNpcChat({ npcA: npc, npcB });

  const context = ai.socialCalls.at(-1);
  assert.ok(Array.isArray(context.npcA.knownMemories));
  assert.equal(
    context.npcA.knownMemories.some((entry) => entry.memory.includes('PkLeetunor')),
    true,
  );
});

test('player dialogue AI receives the NPC broader persistent knowledge, not only memories about that player', async () => {
  const repo = new FakeRepo();
  const ai = new FakeAI();
  const service = new SocialService({
    repository: repo,
    ai,
    idFactory: () => '44444444-4444-4444-8444-444444444444',
  });

  await service.ensureNpcProfile(npc);
  await repo.addMemory({
    npcUserId: npc.userId,
    subjectType: 'world',
    subjectId: null,
    memory: 'The cafe near the square changed its menu.',
    importance: 3,
  });

  await service.startPlayerConversation({ npc, player });

  const context = ai.playerCalls.at(-1);
  assert.ok(Array.isArray(context.knownMemories));
  assert.equal(
    context.knownMemories.some((entry) => entry.memory.includes('cafe near the square')),
    true,
  );
});
