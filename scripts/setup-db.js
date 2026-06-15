// DB 스키마 적용 (psql 없이 Node로 실행)
// 사용법: npm run setup-db
import { loadEnv } from "./load-env.js";
loadEnv();
import fs from "fs";
import path from "path";
import { pool } from "../lib/db.js";

const sql = fs.readFileSync(path.resolve(process.cwd(), "scripts/schema.sql"), "utf8");
console.log("[setup-db] schema.sql 적용 중…");
await pool().query(sql);
console.log("[setup-db] 완료 — observations 테이블/인덱스 준비됨.");
process.exit(0);
