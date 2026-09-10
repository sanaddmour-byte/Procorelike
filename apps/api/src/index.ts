import { createApp } from "./app";
import { createApiDbClients } from "./db";
import { loadEnv } from "./env";

const env = loadEnv();
const clients = createApiDbClients(env);
const app = createApp(env, clients);

app.listen(env.API_PORT, () => {
  console.warn(`SiteOps API listening on :${env.API_PORT}`);
});
