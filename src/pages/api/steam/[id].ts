import type { APIRoute } from 'astro';
import { getSteamAchievements } from '../../../lib/steam';

export const GET: APIRoute = async ({ params }) => {
  const id = params.id ?? '';
  if (!/^\d+$/.test(id)) return Response.json({ error: 'id inválido' }, { status: 400 });
  try {
    const data = await getSteamAchievements(id);
    return Response.json(data, { headers: { 'Cache-Control': 'public, max-age=3600' } });
  } catch (e) {
    console.error('[api/steam]', e);
    return Response.json(null);
  }
};
