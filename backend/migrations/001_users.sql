-- Пользователи и уникальность e-mail без учёта регистра.
-- Bob@Example.com и bob@example.com — один и тот же пользователь.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
