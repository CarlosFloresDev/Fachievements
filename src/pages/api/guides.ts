import type { APIRoute } from 'astro';
import { createServerSupabase } from '../../lib/supabase';

/** IDs de IGDB que ya tienen guía publicada. */
export const GET: APIRoute = async () => {
  try {
    const { data, error } = await createServerSupabase().from('game_guides').select('igdb_id');
    if (error) throw error;
    return Response.json((data ?? []).map(r => String(r.igdb_id)), {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (e) {
    console.error('[api/guides]', e);
    return Response.json([]);
  }
};
