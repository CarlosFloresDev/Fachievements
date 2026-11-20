import { igdbSteamCandidates } from './igdb';

export interface SteamAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  iconGray: string;
  hidden: boolean;
  percent: number | null;
}

export interface SteamAchievementList {
  appId: string;
  achievements: SteamAchievement[];
}

interface RawSchemaAchievement {
  name: string;
  displayName: string;
  description?: string;
  icon: string;
  icongray: string;
  hidden: number;
}

const MAX_CANDIDATES = 8;

async function fetchSchema(appId: string, key: string, lang: string): Promise<RawSchemaAchievement[]> {
  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${key}&appid=${appId}&l=${lang}`
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { game?: { availableGameStats?: { achievements?: RawSchemaAchievement[] } } };
    return json.game?.availableGameStats?.achievements ?? [];
  } catch {
    return [];
  }
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Busca en la tienda de Steam: coincidencias exactas de nombre y las que empiezan igual (remasters, ediciones). */
async function storeSearch(name: string): Promise<{ exact: string[]; prefix: string[] }> {
  const empty: { exact: string[]; prefix: string[] } = { exact: [], prefix: [] };
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&l=english&cc=US`
    );
    if (!res.ok) return empty;
    const json = (await res.json()) as { items?: { id: number; name: string }[] };
    const target = normalize(name);
    const items = json.items ?? [];
    return {
      exact: items.filter((i) => normalize(i.name) === target).map((i) => String(i.id)),
      prefix: items.filter((i) => normalize(i.name).startsWith(`${target} `)).map((i) => String(i.id)),
    };
  } catch {
    return empty;
  }
}

/**
 * Lista completa de logros de Steam para un juego de IGDB, o null si no hay una versión en Steam con logros.
 * Prueba el juego, sus remasters, ediciones y ports, y por último la búsqueda de la tienda.
 */
export async function getSteamAchievements(igdbId: string | number, lang = 'spanish'): Promise<SteamAchievementList | null> {
  const key = import.meta.env.STEAM_API_KEY as string | undefined;
  if (!key) return null;

  const info = await igdbSteamCandidates(igdbId);
  if (!info) return null;

  const tried = new Set<string>();
  let appId: string | null = null;
  let list: RawSchemaAchievement[] = [];

  const tryAll = async (ids: string[]) => {
    for (const id of ids) {
      if (appId || tried.size >= MAX_CANDIDATES || tried.has(id)) continue;
      tried.add(id);
      const ach = await fetchSchema(id, key, lang);
      if (ach.length > 0) {
        appId = id;
        list = ach;
      }
    }
  };

  // Orden: nombre exacto en la tienda, ids de IGDB (juego, remasters, ediciones, ports) y luego coincidencias parciales.
  const store = await storeSearch(info.name);
  await tryAll([...store.exact, ...info.appIds, ...store.prefix]);
  if (!appId) return null;

  const percents = new Map<string, number>();
  try {
    const pctRes = await fetch(
      `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appId}`
    );
    if (pctRes.ok) {
      const pct = (await pctRes.json()) as { achievementpercentages?: { achievements?: { name: string; percent: string | number }[] } };
      for (const a of pct.achievementpercentages?.achievements ?? []) percents.set(a.name, Number(a.percent));
    }
  } catch {
    /* los porcentajes son opcionales */
  }

  const resolved: string = appId;
  return {
    appId: resolved,
    achievements: list
      .map((a) => ({
        id: `steam:${resolved}:${a.name}`,
        name: a.displayName,
        description: a.description ?? '',
        icon: a.icon,
        iconGray: a.icongray,
        hidden: a.hidden === 1,
        percent: percents.has(a.name) ? percents.get(a.name)! : null,
      }))
      .sort((x, y) => (y.percent ?? 0) - (x.percent ?? 0)),
  };
}
