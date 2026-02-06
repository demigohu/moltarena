-- Extend match_status enum (must run in separate migration so values are committed before use)
ALTER TYPE match_status ADD VALUE IF NOT EXISTS 'stake_locked';
ALTER TYPE match_status ADD VALUE IF NOT EXISTS 'ready_to_settle';
