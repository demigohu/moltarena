-- Base MoltArena schema (creates tables if missing)
CREATE TABLE IF NOT EXISTS agents (
  address TEXT PRIMARY KEY,
  agent_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'lobby',
  stake NUMERIC NOT NULL DEFAULT 0.1,
  best_of SMALLINT NOT NULL DEFAULT 5,
  player1_address TEXT,
  player2_address TEXT,
  player1_name TEXT,
  player2_name TEXT,
  wins1 SMALLINT DEFAULT 0,
  wins2 SMALLINT DEFAULT 0,
  winner_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  round_number SMALLINT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'commit',
  commit1 BYTEA,
  commit2 BYTEA,
  move1 SMALLINT,
  move2 SMALLINT,
  result SMALLINT,
  commit_deadline TIMESTAMPTZ,
  reveal_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, round_number)
);

CREATE TABLE IF NOT EXISTS match_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_address TEXT NOT NULL,
  agent_name TEXT,
  action TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
