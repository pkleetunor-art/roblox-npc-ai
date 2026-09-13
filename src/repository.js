export function canonicalNpcPair(first, second) {
  const x = Number(first);
  const y = Number(second);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error('NPC ids must be numeric');
  }
  if (x === y) {
    throw new Error('NPC relationship requires distinct ids');
  }
  if (x < y) return { a: x, b: y, swapped: false };
  return { a: y, b: x, swapped: true };
}

export class Repository {
  constructor(queryable) {
    if (!queryable || typeof queryable.query !== 'function') {
      throw new Error('Repository requires a pg Pool/Client-like queryable');
    }
    this.db = queryable;
  }

  async getNpcProfile(userId) {
    const result = await this.db.query(
      `SELECT npc_user_id, username, display_name, profile, created_at, updated_at
       FROM npc_profiles
       WHERE npc_user_id = $1`,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  async insertNpcProfile({ userId, username, displayName, profile }) {
    await this.db.query(
      `INSERT INTO npc_profiles (npc_user_id, username, display_name, profile)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (npc_user_id) DO NOTHING`,
      [userId, username, displayName, JSON.stringify(profile)],
    );
    return this.getNpcProfile(userId);
  }

  async ensurePlayerRelationship({ npcUserId, playerUserId, playerUsername }) {
    const result = await this.db.query(
      `INSERT INTO player_relationships (
         npc_user_id, player_user_id, player_username, opinion, relationship_summary
       ) VALUES ($1, $2, $3, 50, '')
       ON CONFLICT (npc_user_id, player_user_id)
       DO UPDATE SET
         player_username = EXCLUDED.player_username,
         updated_at = NOW()
       RETURNING npc_user_id, player_user_id, player_username, opinion,
                 relationship_summary, created_at, updated_at`,
      [npcUserId, playerUserId, playerUsername],
    );
    return result.rows[0];
  }

  async getPlayerRelationship({ npcUserId, playerUserId }) {
    const result = await this.db.query(
      `SELECT npc_user_id, player_user_id, player_username, opinion,
              relationship_summary, created_at, updated_at
       FROM player_relationships
       WHERE npc_user_id = $1 AND player_user_id = $2`,
      [npcUserId, playerUserId],
    );
    return result.rows[0] ?? null;
  }

  async applyPlayerOpinionDelta({
    npcUserId,
    playerUserId,
    playerUsername,
    delta,
    relationshipSummary,
  }) {
    const result = await this.db.query(
      `UPDATE player_relationships
       SET opinion = GREATEST(1, LEAST(100, opinion + $4)),
           player_username = $3,
           relationship_summary = $5,
           updated_at = NOW()
       WHERE npc_user_id = $1 AND player_user_id = $2
       RETURNING npc_user_id, player_user_id, player_username, opinion,
                 relationship_summary, created_at, updated_at`,
      [npcUserId, playerUserId, playerUsername, delta, relationshipSummary],
    );
    return result.rows[0] ?? null;
  }

  async addMemory({ npcUserId, subjectType, subjectId = null, memory, importance = 1 }) {
    const result = await this.db.query(
      `INSERT INTO memories (npc_user_id, subject_type, subject_id, memory, importance)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, npc_user_id, subject_type, subject_id, memory, importance, created_at`,
      [npcUserId, subjectType, subjectId, memory, importance],
    );
    return result.rows[0];
  }

  async getMemories({ npcUserId, subjectType, subjectId = null, limit = 8 }) {
    const result = await this.db.query(
      `SELECT id, npc_user_id, subject_type, subject_id, memory, importance, created_at
       FROM memories
       WHERE npc_user_id = $1
         AND subject_type = $2
         AND (($3::bigint IS NULL AND subject_id IS NULL) OR subject_id = $3)
       ORDER BY importance DESC, created_at DESC
       LIMIT $4`,
      [npcUserId, subjectType, subjectId, limit],
    );
    return result.rows;
  }

  async getRecentNpcMemories({ npcUserId, limit = 12 }) {
    const result = await this.db.query(
      `SELECT id, npc_user_id, subject_type, subject_id, memory, importance, created_at
       FROM memories
       WHERE npc_user_id = $1
       ORDER BY importance DESC, created_at DESC
       LIMIT $2`,
      [npcUserId, limit],
    );
    return result.rows;
  }

  async addMessage({ conversationId, npcUserId, playerUserId, speaker, speakerName, text }) {
    const result = await this.db.query(
      `INSERT INTO conversation_messages (
         conversation_id, npc_user_id, player_user_id, speaker, speaker_name, text
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6)
       RETURNING id, conversation_id, npc_user_id, player_user_id,
                 speaker, speaker_name, text, created_at`,
      [conversationId, npcUserId, playerUserId, speaker, speakerName, text],
    );
    return result.rows[0];
  }

  async getRecentMessages({ npcUserId, playerUserId, limit = 16 }) {
    const result = await this.db.query(
      `SELECT id, conversation_id, speaker, speaker_name, text, created_at
       FROM conversation_messages
       WHERE npc_user_id = $1 AND player_user_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [npcUserId, playerUserId, limit],
    );
    return [...result.rows].reverse();
  }

  async createPlayerSession({ id, npcUserId, playerUserId, playerUsername, pendingOptions }) {
    const result = await this.db.query(
      `INSERT INTO player_sessions (
         id, npc_user_id, player_user_id, player_username, pending_options, active
       ) VALUES ($1::uuid, $2, $3, $4, $5::jsonb, TRUE)
       RETURNING *`,
      [id, npcUserId, playerUserId, playerUsername, JSON.stringify(pendingOptions)],
    );
    return result.rows[0];
  }

  async getPlayerSession(id) {
    const result = await this.db.query(
      `SELECT * FROM player_sessions WHERE id = $1::uuid`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async updatePlayerSessionOptions({ id, pendingOptions }) {
    const result = await this.db.query(
      `UPDATE player_sessions
       SET pending_options = $2::jsonb, updated_at = NOW()
       WHERE id = $1::uuid AND active = TRUE
       RETURNING *`,
      [id, JSON.stringify(pendingOptions)],
    );
    return result.rows[0] ?? null;
  }

  async endPlayerSession(id) {
    const result = await this.db.query(
      `UPDATE player_sessions
       SET active = FALSE, updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING *`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async ensureNpcRelationship({ npcAUserId, npcBUserId }) {
    const pair = canonicalNpcPair(npcAUserId, npcBUserId);
    await this.db.query(
      `INSERT INTO npc_relationships (
         npc_a_user_id, npc_b_user_id, opinion_a_of_b, opinion_b_of_a,
         summary_a, summary_b
       ) VALUES ($1, $2, 50, 50, '', '')
       ON CONFLICT (npc_a_user_id, npc_b_user_id) DO NOTHING`,
      [pair.a, pair.b],
    );
    return this.getNpcRelationship({ npcAUserId, npcBUserId });
  }

  async getNpcRelationship({ npcAUserId, npcBUserId }) {
    const pair = canonicalNpcPair(npcAUserId, npcBUserId);
    const result = await this.db.query(
      `SELECT npc_a_user_id, npc_b_user_id, opinion_a_of_b, opinion_b_of_a,
              summary_a, summary_b, created_at, updated_at
       FROM npc_relationships
       WHERE npc_a_user_id = $1 AND npc_b_user_id = $2`,
      [pair.a, pair.b],
    );
    const row = result.rows[0];
    if (!row) return null;

    if (!pair.swapped) {
      return {
        raw: row,
        opinionAOfB: row.opinion_a_of_b,
        opinionBOfA: row.opinion_b_of_a,
        summaryA: row.summary_a,
        summaryB: row.summary_b,
      };
    }

    return {
      raw: row,
      opinionAOfB: row.opinion_b_of_a,
      opinionBOfA: row.opinion_a_of_b,
      summaryA: row.summary_b,
      summaryB: row.summary_a,
    };
  }

  async applyNpcRelationshipOutcome({
    npcAUserId,
    npcBUserId,
    deltaA,
    deltaB,
    summaryA,
    summaryB,
  }) {
    const pair = canonicalNpcPair(npcAUserId, npcBUserId);
    const canonicalDeltaA = pair.swapped ? deltaB : deltaA;
    const canonicalDeltaB = pair.swapped ? deltaA : deltaB;
    const canonicalSummaryA = pair.swapped ? summaryB : summaryA;
    const canonicalSummaryB = pair.swapped ? summaryA : summaryB;

    const result = await this.db.query(
      `UPDATE npc_relationships
       SET opinion_a_of_b = GREATEST(1, LEAST(100, opinion_a_of_b + $3)),
           opinion_b_of_a = GREATEST(1, LEAST(100, opinion_b_of_a + $4)),
           summary_a = $5,
           summary_b = $6,
           updated_at = NOW()
       WHERE npc_a_user_id = $1 AND npc_b_user_id = $2
       RETURNING *`,
      [pair.a, pair.b, canonicalDeltaA, canonicalDeltaB, canonicalSummaryA, canonicalSummaryB],
    );
    return result.rows[0] ?? null;
  }

  async createSocialSession({ id, npcAUserId, npcBUserId, generatedPayload }) {
    const result = await this.db.query(
      `INSERT INTO npc_social_sessions (
         id, npc_a_user_id, npc_b_user_id, generated_payload, status
       ) VALUES ($1::uuid, $2, $3, $4::jsonb, 'pending')
       RETURNING *`,
      [id, npcAUserId, npcBUserId, JSON.stringify(generatedPayload)],
    );
    return result.rows[0];
  }

  async getSocialSession(id) {
    const result = await this.db.query(
      `SELECT * FROM npc_social_sessions WHERE id = $1::uuid`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async setSocialSessionStatus({ id, status }) {
    const result = await this.db.query(
      `UPDATE npc_social_sessions
       SET status = $2, updated_at = NOW()
       WHERE id = $1::uuid AND status = 'pending'
       RETURNING *`,
      [id, status],
    );
    return result.rows[0] ?? null;
  }

  async runInTransaction(callback) {
    if (typeof this.db.connect !== 'function') {
      return callback(this);
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(new Repository(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
