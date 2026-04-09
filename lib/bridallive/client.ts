import { prisma } from "@/lib/prisma";
import { getBridalLiveStoreConfig } from "@/lib/env";

import type {
  BridalLiveAuthRequest,
  BridalLiveAuthResult,
  BridalLiveListResult
} from "@/lib/bridallive/types";

function tokenExpiresSoon(expiresAt: Date) {
  return expiresAt.getTime() - 30 * 60_000 <= Date.now();
}

async function login(storeSlug: string) {
  const config = getBridalLiveStoreConfig(storeSlug);
  if (!config) {
    throw new Error(`BridalLive is not configured for ${storeSlug}.`);
  }

  const body: BridalLiveAuthRequest = {
    apiKey: config.apiKey,
    retailerId: config.retailerId
  };

  const response = await fetch(`${config.baseUrl}/api/auth/apiLogin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`BridalLive auth failed for ${storeSlug}: ${response.status} ${detail}`);
  }

  const result = (await response.json()) as BridalLiveAuthResult;
  if (!result.token) {
    throw new Error(`BridalLive auth for ${storeSlug} did not return a token.`);
  }

  const expiresAt = result.expires ? new Date(result.expires) : new Date(Date.now() + 8 * 60 * 60_000);
  await prisma.bridalLiveToken.upsert({
    where: { id: storeSlug },
    update: {
      token: result.token,
      expiresAt
    },
    create: {
      id: storeSlug,
      token: result.token,
      expiresAt
    }
  });

  return { token: result.token, config };
}

export async function getBridalLiveAccess(storeSlug: string) {
  const config = getBridalLiveStoreConfig(storeSlug);
  if (!config) {
    throw new Error(`BridalLive is not configured for ${storeSlug}.`);
  }

  const cached = await prisma.bridalLiveToken.findUnique({
    where: { id: storeSlug }
  });

  if (cached && !tokenExpiresSoon(cached.expiresAt)) {
    return { token: cached.token, config };
  }

  return login(storeSlug);
}

export async function postBridalLive<TResponse, TBody extends object>(
  storeSlug: string,
  path: string,
  body: TBody,
  query?: Record<string, string>
) {
  const { token, config } = await getBridalLiveAccess(storeSlug);
  const url = new URL(`${config.baseUrl}${path}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      token
    },
    body: JSON.stringify({
      retailerId: config.retailerId,
      ...body
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`BridalLive request failed for ${path}: ${response.status} ${detail}`);
  }

  return (await response.json()) as TResponse;
}

export type BridalLivePagedResponse<T> = BridalLiveListResult<T>;
