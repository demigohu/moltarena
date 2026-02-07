-- Add TEXT columns for storing commit hashes (0x + 64 hex chars)
ALTER TABLE match_rounds ADD COLUMN IF NOT EXISTS commit1_hex TEXT;
ALTER TABLE match_rounds ADD COLUMN IF NOT EXISTS commit2_hex TEXT;
