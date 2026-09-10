import { existsSync } from "node:fs";
import path from "node:path";

// Local/dev/CI convenience: load the repo-root .env (copied from .env.example
// against the docker-compose stack) so integration tests have DATABASE_URL /
// DATABASE_URL_APP without a separate dotenv dependency (Node 20.12+/22 ships
// process.loadEnvFile natively).
const envPath = path.resolve(process.cwd(), "../../.env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
