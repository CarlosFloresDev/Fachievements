import { igdbExternalSteamId } from './igdb';

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

/** Lista completa de logros de Steam para un juego de IGDB, o null si no está en Steam. */
export async function getSteamAchievements(igdbId: string | number, lang = 'spanish'): Promise<SteamAchievementList | null> {
  const appId = await igdbExternalSteamId(igdbId);
  if (!appId) return null;

  const key = import.meta.env.STEAM_API_KEY as string | undefined;
  const [schemaRes, pctRes] = await Promise.all([
    key
      ? fetch(`https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${key}&appid=${appId}&l=${lang}`)
      : Promise.resolve(null),
    fetch(`https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appId}`),
  ]);

  const percents = new Map<string, number>();
  if (pctRes.ok) {
    const pct = (await pctRes.json()) as { achievementpercentages?: { achievements?: { name: string; percent: string | number }[] } };
    for (const a of pct.achievementpercentages?.achievements ?? []) percents.set(a.name, Number(a.percent));
  }

  if (schemaRes && schemaRes.ok) {
    const schema = (await schemaRes.json()) as {
      game?: { availableGameStats?: { achievements?: { name: string; displayName: string; description?: string; icon: string; icongray: string; hidden: number }[] } };
    };
    const list = schema.game?.availableGameStats?.achievements ?? [];
    if (list.length === 0) return null;
    return {
      appId,
      achievements: list
        .map(a => ({
          id: `steam:${appId}:${a.name}`,
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

  return null;
}
