-- 거시지표 관측치 (long format)
-- 같은 (날짜, 지표)는 덮어쓰기(upsert) → 수집·수기입력 모두 동일 테이블 사용
CREATE TABLE IF NOT EXISTS observations (
  obs_date   DATE             NOT NULL,
  indicator  TEXT             NOT NULL,
  value      DOUBLE PRECISION,
  source     TEXT,                       -- 'ECOS' | 'FRED' | 'ECB' | 'Yahoo' | 'manual'
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (obs_date, indicator)
);

CREATE INDEX IF NOT EXISTS idx_obs_indicator ON observations (indicator);
CREATE INDEX IF NOT EXISTS idx_obs_date ON observations (obs_date);
