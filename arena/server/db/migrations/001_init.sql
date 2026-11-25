CREATE TABLE IF NOT EXISTS players (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  is_bot      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ratings (
  player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  game        TEXT NOT NULL,
  elo         INTEGER NOT NULL DEFAULT 1200,
  games       INTEGER NOT NULL DEFAULT 0,
  wins        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, game)
);

CREATE TABLE IF NOT EXISTS matches (
  id          SERIAL PRIMARY KEY,
  game        TEXT NOT NULL,
  player0_id  INTEGER NOT NULL REFERENCES players(id),
  player1_id  INTEGER NOT NULL REFERENCES players(id),
  winner      SMALLINT NOT NULL CHECK (winner IN (0, 1)),
  moves       JSONB NOT NULL,
  elo_delta   INTEGER NOT NULL DEFAULT 0,
  source      TEXT NOT NULL DEFAULT 'online',
  started_at  TIMESTAMPTZ NOT NULL,
  ended_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS matches_game_ended_idx ON matches (game, ended_at DESC);
CREATE INDEX IF NOT EXISTS ratings_game_elo_idx ON ratings (game, elo DESC);
