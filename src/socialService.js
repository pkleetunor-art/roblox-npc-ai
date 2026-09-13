import { randomUUID } from 'node:crypto';

function jsonObject(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return null;
}

function relationshipContext(row) {
  return {
    opinion: Number(row?.opinion ?? 50),
    summary: row?.relationship_summary ?? '',
  };
}

function publicResponses(options) {
  return (options ?? []).map((option) => ({ id: option.id, text: option.text }));
}

function assertIdentity(value, label) {
  if (!value || !Number.isInteger(Number(value.userId)) || Number(value.userId) <= 0) {
    throw new Error(`${label}.userId must be a positive Roblox UserId`);
  }
  if (typeof value.username !== 'string' || value.username.length < 1 || value.username.length > 32) {
    throw new Error(`${label}.username is invalid`);
  }
}

export class SocialService {
  constructor({ repository, ai, idFactory = randomUUID } = {}) {
    if (!repository) throw new Error('repository is required');
    if (!ai) throw new Error('ai adapter is required');
    this.repository = repository;
    this.ai = ai;
    this.idFactory = idFactory;
  }

  async ensureNpcProfile(npc) {
    assertIdentity(npc, 'npc');
    const userId = Number(npc.userId);
    const existing = await this.repository.getNpcProfile(userId);
    if (existing) return existing;

    const profile = await this.ai.generateProfile({
      npcUserId: userId,
      username: npc.username,
      displayName: npc.displayName || npc.username,
    });

    return this.repository.insertNpcProfile({
      userId,
      username: npc.username,
      displayName: npc.displayName || npc.username,
      profile,
    });
  }

  async #playerContext({ profileRow, relationship, player, npcUserId, isOpening, selectedPlayerResponse = null }) {
    const [recentMessages, memories, knownMemories] = await Promise.all([
      this.repository.getRecentMessages({
        npcUserId,
        playerUserId: Number(player.userId),
        limit: 16,
      }),
      this.repository.getMemories({
        npcUserId,
        subjectType: 'player',
        subjectId: Number(player.userId),
        limit: 8,
      }),
      this.repository.getRecentNpcMemories({
        npcUserId,
        limit: 12,
      }),
    ]);

    return {
      isOpening,
      npcProfile: profileRow.profile,
      npcIdentity: {
        userId: Number(profileRow.npc_user_id),
        username: profileRow.username,
        displayName: profileRow.display_name,
      },
      player: {
        userId: Number(player.userId),
        username: player.username,
        displayName: player.displayName || player.username,
      },
      relationship: relationshipContext(relationship),
      selectedPlayerResponse,
      recentMessages: recentMessages.map((message) => ({
        speaker: message.speaker,
        speakerName: message.speaker_name ?? message.speakerName,
        text: message.text,
      })),
      importantMemories: memories.map((memory) => ({
        memory: memory.memory,
        importance: Number(memory.importance ?? 1),
      })),
      knownMemories: knownMemories.map((memory) => ({
        subjectType: memory.subject_type ?? memory.subjectType ?? 'unknown',
        subjectId: memory.subject_id ?? memory.subjectId ?? null,
        memory: memory.memory,
        importance: Number(memory.importance ?? 1),
      })),
    };
  }

  async startPlayerConversation({ npc, player }) {
    assertIdentity(npc, 'npc');
    assertIdentity(player, 'player');

    const profileRow = await this.ensureNpcProfile(npc);
    const relationship = await this.repository.ensurePlayerRelationship({
      npcUserId: Number(npc.userId),
      playerUserId: Number(player.userId),
      playerUsername: player.username,
    });

    const context = await this.#playerContext({
      profileRow,
      relationship,
      player,
      npcUserId: Number(npc.userId),
      isOpening: true,
    });

    const turn = await this.ai.generatePlayerTurn(context);
    const conversationId = this.idFactory();

    await this.repository.createPlayerSession({
      id: conversationId,
      npcUserId: Number(npc.userId),
      playerUserId: Number(player.userId),
      playerUsername: player.username,
      pendingOptions: turn.responses,
    });

    await this.repository.addMessage({
      conversationId,
      npcUserId: Number(npc.userId),
      playerUserId: Number(player.userId),
      speaker: 'npc',
      speakerName: profileRow.display_name || profileRow.username,
      text: turn.npcLine,
    });

    const updatedRelationship = await this.repository.applyPlayerOpinionDelta({
      npcUserId: Number(npc.userId),
      playerUserId: Number(player.userId),
      playerUsername: player.username,
      delta: 0,
      relationshipSummary: turn.relationshipSummary || relationship.relationship_summary || '',
    });

    return {
      conversationId,
      npcLine: turn.npcLine,
      responses: publicResponses(turn.responses),
      opinion: Number(updatedRelationship?.opinion ?? relationship.opinion ?? 50),
      npcCharacterTag: profileRow.profile?.archetype || 'Civilian',
    };
  }

  async respondPlayerConversation({ conversationId, choiceId }) {
    const session = await this.repository.getPlayerSession(conversationId);
    if (!session || session.active !== true) {
      throw new Error('Conversation is not active');
    }

    const options = jsonObject(session.pending_options) ?? session.pending_options;
    if (!Array.isArray(options) || options.length === 0) {
      throw new Error('Conversation has no pending response options');
    }

    const chosen = options.find((option) => option?.id === choiceId);
    if (!chosen) throw new Error('Invalid response choice');

    // Consume the option before mutating opinion, preventing duplicate submissions.
    await this.repository.updatePlayerSessionOptions({ id: conversationId, pendingOptions: [] });

    const npcUserId = Number(session.npc_user_id);
    const playerUserId = Number(session.player_user_id);
    const playerUsername = session.player_username;

    const profileRow = await this.repository.getNpcProfile(npcUserId);
    if (!profileRow) throw new Error('NPC profile no longer exists');

    let relationship = await this.repository.getPlayerRelationship({ npcUserId, playerUserId });
    if (!relationship) {
      relationship = await this.repository.ensurePlayerRelationship({
        npcUserId,
        playerUserId,
        playerUsername,
      });
    }

    relationship = await this.repository.applyPlayerOpinionDelta({
      npcUserId,
      playerUserId,
      playerUsername,
      delta: Number(chosen.opinionDelta || 0),
      relationshipSummary: relationship.relationship_summary || '',
    });

    await this.repository.addMessage({
      conversationId,
      npcUserId,
      playerUserId,
      speaker: 'player',
      speakerName: playerUsername,
      text: chosen.text,
    });

    const player = {
      userId: playerUserId,
      username: playerUsername,
      displayName: playerUsername,
    };

    const context = await this.#playerContext({
      profileRow,
      relationship,
      player,
      npcUserId,
      isOpening: false,
      selectedPlayerResponse: chosen.text,
    });

    const turn = await this.ai.generatePlayerTurn(context);

    relationship = await this.repository.applyPlayerOpinionDelta({
      npcUserId,
      playerUserId,
      playerUsername,
      delta: 0,
      relationshipSummary: turn.relationshipSummary || relationship.relationship_summary || '',
    });

    if (turn.memory && turn.memoryImportance > 0) {
      await this.repository.addMemory({
        npcUserId,
        subjectType: 'player',
        subjectId: playerUserId,
        memory: turn.memory,
        importance: turn.memoryImportance,
      });
    }

    await this.repository.addMessage({
      conversationId,
      npcUserId,
      playerUserId,
      speaker: 'npc',
      speakerName: profileRow.display_name || profileRow.username,
      text: turn.npcLine,
    });

    await this.repository.updatePlayerSessionOptions({
      id: conversationId,
      pendingOptions: turn.responses,
    });

    return {
      conversationId,
      npcLine: turn.npcLine,
      responses: publicResponses(turn.responses),
      opinion: Number(relationship.opinion),
      npcCharacterTag: profileRow.profile?.archetype || 'Civilian',
    };
  }

  async endPlayerConversation({ conversationId }) {
    const ended = await this.repository.endPlayerSession(conversationId);
    return { ended: Boolean(ended) };
  }

  async startNpcChat({ npcA, npcB }) {
    assertIdentity(npcA, 'npcA');
    assertIdentity(npcB, 'npcB');
    if (Number(npcA.userId) === Number(npcB.userId)) {
      throw new Error('NPC social chat requires two different characters');
    }

    const [profileA, profileB] = await Promise.all([
      this.ensureNpcProfile(npcA),
      this.ensureNpcProfile(npcB),
    ]);

    const relationship = await this.repository.ensureNpcRelationship({
      npcAUserId: Number(npcA.userId),
      npcBUserId: Number(npcB.userId),
    });

    const [memoriesA, memoriesB, knownMemoriesA, knownMemoriesB] = await Promise.all([
      this.repository.getMemories({
        npcUserId: Number(npcA.userId),
        subjectType: 'npc',
        subjectId: Number(npcB.userId),
        limit: 8,
      }),
      this.repository.getMemories({
        npcUserId: Number(npcB.userId),
        subjectType: 'npc',
        subjectId: Number(npcA.userId),
        limit: 8,
      }),
      this.repository.getRecentNpcMemories({
        npcUserId: Number(npcA.userId),
        limit: 12,
      }),
      this.repository.getRecentNpcMemories({
        npcUserId: Number(npcB.userId),
        limit: 12,
      }),
    ]);

    const generated = await this.ai.generateSocialChat({
      npcA: {
        identity: {
          userId: Number(npcA.userId),
          username: npcA.username,
          displayName: npcA.displayName || npcA.username,
        },
        profile: profileA.profile,
        opinionOfB: relationship.opinionAOfB,
        relationshipSummary: relationship.summaryA,
        memoriesAboutB: memoriesA.map((m) => ({ memory: m.memory, importance: Number(m.importance ?? 1) })),
        knownMemories: knownMemoriesA.map((m) => ({
          subjectType: m.subject_type ?? m.subjectType ?? 'unknown',
          subjectId: m.subject_id ?? m.subjectId ?? null,
          memory: m.memory,
          importance: Number(m.importance ?? 1),
        })),
      },
      npcB: {
        identity: {
          userId: Number(npcB.userId),
          username: npcB.username,
          displayName: npcB.displayName || npcB.username,
        },
        profile: profileB.profile,
        opinionOfA: relationship.opinionBOfA,
        relationshipSummary: relationship.summaryB,
        memoriesAboutA: memoriesB.map((m) => ({ memory: m.memory, importance: Number(m.importance ?? 1) })),
        knownMemories: knownMemoriesB.map((m) => ({
          subjectType: m.subject_type ?? m.subjectType ?? 'unknown',
          subjectId: m.subject_id ?? m.subjectId ?? null,
          memory: m.memory,
          importance: Number(m.importance ?? 1),
        })),
      },
    });

    const chatId = this.idFactory();
    await this.repository.createSocialSession({
      id: chatId,
      npcAUserId: Number(npcA.userId),
      npcBUserId: Number(npcB.userId),
      generatedPayload: generated,
    });

    const turns = [];
    for (const exchange of generated.exchanges) {
      turns.push({ speaker: 'a', text: exchange.a });
      turns.push({ speaker: 'b', text: exchange.b });
    }
    turns.push({ speaker: 'a', text: generated.farewellA });
    turns.push({ speaker: 'b', text: generated.farewellB });

    return { chatId, turns };
  }

  async completeNpcChat({ chatId }) {
    return this.repository.runInTransaction(async (repo) => {
      const session = await repo.getSocialSession(chatId);
      if (!session || session.status !== 'pending') {
        return { completed: false };
      }

      const claimed = await repo.setSocialSessionStatus({ id: chatId, status: 'completed' });
      if (!claimed) return { completed: false };

      const generated = jsonObject(session.generated_payload);
      if (!generated) throw new Error('Social session payload is invalid');

      const npcAUserId = Number(session.npc_a_user_id);
      const npcBUserId = Number(session.npc_b_user_id);

      await repo.ensureNpcRelationship({ npcAUserId, npcBUserId });
      await repo.applyNpcRelationshipOutcome({
        npcAUserId,
        npcBUserId,
        deltaA: Number(generated.opinionDeltaA || 0),
        deltaB: Number(generated.opinionDeltaB || 0),
        summaryA: generated.summaryA || '',
        summaryB: generated.summaryB || '',
      });

      if (generated.memoryA && generated.memoryImportanceA > 0) {
        await repo.addMemory({
          npcUserId: npcAUserId,
          subjectType: 'npc',
          subjectId: npcBUserId,
          memory: generated.memoryA,
          importance: generated.memoryImportanceA,
        });
      }

      if (generated.memoryB && generated.memoryImportanceB > 0) {
        await repo.addMemory({
          npcUserId: npcBUserId,
          subjectType: 'npc',
          subjectId: npcAUserId,
          memory: generated.memoryB,
          importance: generated.memoryImportanceB,
        });
      }

      return { completed: true };
    });
  }

  async cancelNpcChat({ chatId }) {
    const cancelled = await this.repository.setSocialSessionStatus({
      id: chatId,
      status: 'cancelled',
    });
    return { cancelled: Boolean(cancelled) };
  }
}
