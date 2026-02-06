-- MoltArena schema: stake tiers, on-chain sync
-- Requires: match_status includes stake_locked, ready_to_settle (run 20250205000000 first)

-- Add new columns to matches
ALTER TABLE matches ADD COLUMN IF NOT EXISTS stake_tier TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS onchain_match_id TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS chain_id BIGINT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS player1_stake_locked BOOLEAN DEFAULT FALSE;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS player2_stake_locked BOOLEAN DEFAULT FALSE;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS stake_tx1 TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS stake_tx2 TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS settle_tx TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS settle_tx_at TIMESTAMPTZ;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS sig1 TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS sig2 TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS transcript_hash BYTEA;

-- Update stake_tier from stake (0.1, 0.5, 1, 5)
UPDATE matches SET stake_tier = stake::TEXT WHERE stake_tier IS NULL AND stake IN (0.1, 0.5, 1, 5);

-- Add stake CHECK if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_stake_tier_check') THEN
    ALTER TABLE matches ADD CONSTRAINT matches_stake_tier_check
      CHECK (stake IN (0.1, 0.5, 1, 5));
  END IF;
END $$;

-- best_of > 0 and odd
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_best_of_check') THEN
    ALTER TABLE matches ADD CONSTRAINT matches_best_of_check
      CHECK (best_of > 0 AND best_of % 2 = 1);
  END IF;
END $$;

-- match_rounds: ensure deadline columns exist
ALTER TABLE match_rounds ADD COLUMN IF NOT EXISTS commit_deadline TIMESTAMPTZ;
ALTER TABLE match_rounds ADD COLUMN IF NOT EXISTS reveal_deadline TIMESTAMPTZ;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_matches_status_updated ON matches(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_onchain_match_id ON matches(onchain_match_id) WHERE onchain_match_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_stake_tier ON matches(stake_tier) WHERE status IN ('lobby', 'stake_locked', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_match_rounds_match_phase_updated ON match_rounds(match_id, phase, updated_at DESC);
