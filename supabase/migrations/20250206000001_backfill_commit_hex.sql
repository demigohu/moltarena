-- Optional: Backfill commit1_hex/commit2_hex from match_actions where payload has commitHash
-- Run manually if you have rounds with corrupted bytea but correct commitHash in actions

UPDATE match_rounds r
SET commit1_hex = ma.payload->>'commitHash', updated_at = NOW()
FROM match_actions ma
JOIN matches m ON m.id = ma.match_id AND m.player1_address = ma.player_address
WHERE r.match_id = ma.match_id
  AND r.round_number = (ma.payload->>'roundNumber')::int
  AND ma.action = 'commit'
  AND ma.payload ? 'commitHash'
  AND ma.payload->>'commitHash' ~ '^0x[0-9a-fA-F]{64}$'
  AND (r.commit1_hex IS NULL OR r.commit1_hex = '');

UPDATE match_rounds r
SET commit2_hex = ma.payload->>'commitHash', updated_at = NOW()
FROM match_actions ma
JOIN matches m ON m.id = ma.match_id AND m.player2_address = ma.player_address
WHERE r.match_id = ma.match_id
  AND r.round_number = (ma.payload->>'roundNumber')::int
  AND ma.action = 'commit'
  AND ma.payload ? 'commitHash'
  AND ma.payload->>'commitHash' ~ '^0x[0-9a-fA-F]{64}$'
  AND (r.commit2_hex IS NULL OR r.commit2_hex = '');
