import { cronJobs } from "convex/server";

const crons = cronJobs();

// Price map updates are now inline (via priceMapChunks) — no cron needed.
// commitV2 pending commits cleanup removed — commitV2 deleted.

export default crons;
