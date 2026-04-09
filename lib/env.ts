function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

type BridalLiveStoreConfig = {
  retailerId: string;
  apiKey: string;
  baseUrl?: string;
};

let cachedBridalLiveStoreConfigs: Record<string, BridalLiveStoreConfig> | null | undefined;

function parseBridalLiveStoreConfigs() {
  if (cachedBridalLiveStoreConfigs !== undefined) {
    return cachedBridalLiveStoreConfigs;
  }

  const raw = process.env.BRIDALLIVE_STORE_CONFIG;
  if (!raw) {
    cachedBridalLiveStoreConfigs = null;
    return cachedBridalLiveStoreConfigs;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, BridalLiveStoreConfig>;
    cachedBridalLiveStoreConfigs = parsed;
    return parsed;
  } catch (error) {
    throw new Error(
      `Invalid BRIDALLIVE_STORE_CONFIG JSON: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export const appEnv = {
  defaultStoreSlug: process.env.APP_STORE_DEFAULT || "curve",
  supabaseUrl: getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  bridalLiveBaseUrl: process.env.BRIDALLIVE_BASE_URL || "https://api.bridallive.com/bl-server/api",
  bridalLiveRetailerId: process.env.BRIDALLIVE_RETAILER_ID || "",
  bridalLiveApiKey: process.env.BRIDALLIVE_API_KEY || "",
  bridalLiveStoreConfig: process.env.BRIDALLIVE_STORE_CONFIG || "",
  cronSecret: process.env.CRON_SECRET || ""
};

export function getBridalLiveStoreConfig(storeSlug: string): BridalLiveStoreConfig | null {
  const configs = parseBridalLiveStoreConfigs();
  const mapped = configs?.[storeSlug];
  if (mapped?.retailerId && mapped.apiKey) {
    return {
      retailerId: mapped.retailerId,
      apiKey: mapped.apiKey,
      baseUrl: mapped.baseUrl || appEnv.bridalLiveBaseUrl
    };
  }

  if (appEnv.bridalLiveRetailerId && appEnv.bridalLiveApiKey) {
    return {
      retailerId: appEnv.bridalLiveRetailerId,
      apiKey: appEnv.bridalLiveApiKey,
      baseUrl: appEnv.bridalLiveBaseUrl
    };
  }

  return null;
}

export function hasBridalLiveStoreConfig(storeSlug: string) {
  return Boolean(getBridalLiveStoreConfig(storeSlug));
}
