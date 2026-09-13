CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS npc_profiles (
    npc_user_id BIGINT PRIMARY KEY,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    profile JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_relationships (
    npc_user_id BIGINT NOT NULL REFERENCES npc_profiles(npc_user_id) ON DELETE CASCADE,
    player_user_id BIGINT NOT NULL,
    player_username TEXT NOT NULL,
    opinion INTEGER NOT NULL DEFAULT 50 CHECK (opinion BETWEEN 1 AND 100),
    relationship_summary TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (npc_user_id, player_user_id)
);

CREATE TABLE IF NOT EXISTS npc_relationships (
    npc_a_user_id BIGINT NOT NULL REFERENCES npc_profiles(npc_user_id) ON DELETE CASCADE,
    npc_b_user_id BIGINT NOT NULL REFERENCES npc_profiles(npc_user_id) ON DELETE CASCADE,
    opinion_a_of_b INTEGER NOT NULL DEFAULT 50 CHECK (opinion_a_of_b BETWEEN 1 AND 100),
    opinion_b_of_a INTEGER NOT NULL DEFAULT 50 CHECK (opinion_b_of_a BETWEEN 1 AND 100),
    summary_a TEXT NOT NULL DEFAULT '',
    summary_b TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (npc_a_user_id < npc_b_user_id),
    PRIMARY KEY (npc_a_user_id, npc_b_user_id)
);

CREATE TABLE IF NOT EXISTS memories (
    id BIGSERIAL PRIMARY KEY,
    npc_user_id BIGINT NOT NULL REFERENCES npc_profiles(npc_user_id) ON DELETE CASCADE,
    subject_type TEXT NOT NULL CHECK (subject_type IN ('player', 'npc', 'world', 'chat')),
    subject_id BIGINT,
    memory TEXT NOT NULL,
    importance SMALLINT NOT NULL DEFAULT 1 CHECK (importance BETWEEN 0 AND 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS memories_npc_subject_idx
    ON memories (npc_user_id, subject_type, subject_id, importance DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS conversation_messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL,
    npc_user_id BIGINT NOT NULL REFERENCES npc_profiles(npc_user_id) ON DELETE CASCADE,
    player_user_id BIGINT,
    speaker TEXT NOT NULL CHECK (speaker IN ('npc', 'player')),
    speaker_name TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversation_messages_pair_idx
    ON conversation_messages (npc_user_id, player_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS player_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    npc_user_id BIGINT NOT NULL REFERENCES npc_profiles(npc_user_id) ON DELETE CASCADE,
    player_user_id BIGINT NOT NULL,
    player_username TEXT NOT NULL,
    pending_options JSONB NOT NULL DEFAULT '[]'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS player_sessions_active_idx
    ON player_sessions (npc_user_id, player_user_id, active, updated_at DESC);

CREATE TABLE IF NOT EXISTS npc_social_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    npc_a_user_id BIGINT NOT NULL REFERENCES npc_profiles(npc_user_id) ON DELETE CASCADE,
    npc_b_user_id BIGINT NOT NULL REFERENCES npc_profiles(npc_user_id) ON DELETE CASCADE,
    generated_payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS npc_social_sessions_status_idx
    ON npc_social_sessions (status, updated_at DESC);
