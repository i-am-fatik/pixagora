/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as btcpay from "../btcpay.js";
import type * as canvases from "../canvases.js";
import type * as chat from "../chat.js";
import type * as credits from "../credits.js";
import type * as history from "../history.js";
import type * as http from "../http.js";
import type * as leaderboard from "../leaderboard.js";
import type * as pixels from "../pixels.js";
import type * as pricing from "../pricing.js";
import type * as seed from "../seed.js";
import type * as transactions from "../transactions.js";
import type * as users from "../users.js";
import type * as webhook_utils from "../webhook_utils.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  btcpay: typeof btcpay;
  canvases: typeof canvases;
  chat: typeof chat;
  credits: typeof credits;
  history: typeof history;
  http: typeof http;
  leaderboard: typeof leaderboard;
  pixels: typeof pixels;
  pricing: typeof pricing;
  seed: typeof seed;
  transactions: typeof transactions;
  users: typeof users;
  webhook_utils: typeof webhook_utils;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
