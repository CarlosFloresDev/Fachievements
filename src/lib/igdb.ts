import type { GameMeta, GameSearchResult, FeaturedGame } from './types';

interface CachedToken {
  token: string;
  expiresAt: number;
}

let tokenCache: CachedToken | null = null;

async function getTwitchToken(): Promise<string> {
  const clientId = import.meta.env.TWITCH_CLIENT_ID;
  const clientSecret = import.meta.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Faltan TWITCH_CLIENT_ID o TWITCH_CLIENT_SECRET en las variables de entorno');
  }

  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
    { method: 'POST' }
  );

  if (!res.ok) {
    throw new Error(`Twitch OAuth falló con estado ${res.status}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function igdbQuery<T>(endpoint: string, body: string): Promise<T> {
  const token = await getTwitchToken();
  const clientId = import.meta.env.TWITCH_CLIENT_ID as string;

  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`IGDB ${endpoint} respondió ${res.status}`);
  }
  return (await res.json()) as T;
}

interface RawGame {
  id: number;
  name: string;
  summary?: string;
  cover?: { image_id: string };
  total_rating?: number;
  first_release_date?: number;
  platforms?: { name: string }[];
  screenshots?: { image_id: string }[];
}

export async function getGameMetadata(igdbId: string | number): Promise<GameMeta | null> {
  const id = Number(igdbId);
  if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) {
    return null;
  }

  try {
    const data = await igdbQuery<RawGame[]>(
      'games',
      `fields name, summary, cover.image_id, first_release_date, platforms.name, screenshots.image_id, total_rating; where id = ${id};`
    );
    if (!data || data.length === 0) return null;
    const game = data[0];
    return {
      name: game.name,
      summary: game.summary ?? null,
      coverUrl: game.cover ? `https://images.igdb.com/igdb/image/upload/t_1080p/${game.cover.image_id}.jpg` : null,
      rating: game.total_rating ? Math.round(game.total_rating) : null,
      releaseDate: game.first_release_date ? new Date(game.first_release_date * 1000).getFullYear() : 'N/A',
      platforms: game.platforms?.map(p => p.name).join(', ') || 'Múltiples plataformas',
      screenshots: game.screenshots?.map(s => `https://images.igdb.com/igdb/image/upload/t_screenshot_big/${s.image_id}.jpg`) ?? [],
    };
  } catch (error) {
    console.error('[igdb] getGameMetadata:', error);
    return null;
  }
}

export async function searchGames(query: string): Promise<GameSearchResult[]> {
  const sanitized = query.replace(/"/g, '').slice(0, 80);
  if (sanitized.length < 3) return [];

  const data = await igdbQuery<RawGame[]>(
    'games',
    `search "${sanitized}"; fields name, cover.image_id; limit 12;`
  );
  return data.map(g => ({
    id: g.id,
    name: g.name,
    coverUrl: g.cover ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg` : null,
  }));
}

export async function getCoversByIds(ids: number[]): Promise<Record<number, string | null>> {
  const cleanIds = ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (cleanIds.length === 0) return {};
  const data = await igdbQuery<RawGame[]>(
    'games',
    `fields id, cover.image_id; where id = (${cleanIds.join(',')}); limit ${cleanIds.length};`
  );
  const out: Record<number, string | null> = {};
  for (const g of data) {
    out[g.id] = g.cover ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg` : null;
  }
  return out;
}

export async function getFeaturedGames(): Promise<FeaturedGame[]> {
  const data = await igdbQuery<RawGame[]>(
    'games',
    `fields name, cover.image_id, total_rating, total_rating_count;
     where total_rating > 82 & total_rating_count > 200 & cover != null & version_parent = null;
     sort total_rating_count desc; limit 80;`
  );
  const shuffled = [...data].sort(() => Math.random() - 0.5).slice(0, 12);
  return shuffled.map(g => ({
    id: g.id,
    name: g.name,
    rating: g.total_rating ? Math.round(g.total_rating) : null,
    coverUrl: g.cover ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg` : null,
  }));
}

/** App ID de Steam asociado a un juego de IGDB (fuente externa 1 = Steam). */
type ExtRef = { uid?: string; external_game_source?: number };
type GameRefs = { external_games?: ExtRef[] };

function steamUids(g?: GameRefs): string[] {
  return (g?.external_games ?? [])
    .filter((e) => e.external_game_source === 1 && e.uid && /^\d+$/.test(e.uid))
    .map((e) => e.uid as string);
}

/**
 * Posibles appids de Steam para un juego de IGDB, en orden de preferencia:
 * el propio juego, sus remasters/remakes/ports y sus ediciones (Complete, GOTY...).
 * Devuelve también el nombre para poder buscar en la tienda de Steam como último recurso.
 */
export async function igdbSteamCandidates(igdbId: string | number): Promise<{ name: string; appIds: string[] } | null> {
  const id = Number(igdbId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const ext = 'external_games.uid, external_games.external_game_source';
  try {
    const [games, versions] = await Promise.all([
      igdbQuery<(GameRefs & { name: string; remasters?: GameRefs[]; remakes?: GameRefs[]; ports?: GameRefs[] })[]>(
        'games',
        `fields name, ${ext}, remasters.${ext.replace(', ', ', remasters.')}, remakes.${ext.replace(', ', ', remakes.')}, ports.${ext.replace(', ', ', ports.')}; where id = ${id};`
      ),
      igdbQuery<GameRefs[]>('games', `fields ${ext}; where version_parent = ${id}; limit 20;`),
    ]);
    const g = games[0];
    if (!g) return null;
    const ordered = [
      ...steamUids(g),
      ...(g.remasters ?? []).flatMap(steamUids),
      ...(g.remakes ?? []).flatMap(steamUids),
      ...versions.flatMap(steamUids),
      ...(g.ports ?? []).flatMap(steamUids),
    ];
    return { name: g.name, appIds: [...new Set(ordered)] };
  } catch (e) {
    console.error('[igdb] steam candidates:', e);
    return null;
  }
}
