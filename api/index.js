import { ready, app } from "../artifacts/api-server/dist/vercel.mjs";

export default async function handler(req, res) {
  await ready;
  app(req, res);
}
