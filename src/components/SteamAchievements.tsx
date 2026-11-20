import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { SteamAchievementList } from '../lib/steam';

interface Props {
  igdbId: string;
  session: Session | null;
}

export default function SteamAchievements({ igdbId, session }: Props) {
  const [data, setData] = useState<SteamAchievementList | null | undefined>(undefined);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [query, setQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    fetch(`/api/steam/${igdbId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, [igdbId]);

  useEffect(() => {
    if (!session || !data) return;
    supabase
      .from('completed_steps')
      .select('step_id')
      .eq('user_id', session.user.id)
      .like('step_id', `steam:${data.appId}:%`)
      .then(({ data: rows }) => setDone(new Set((rows ?? []).map((r: { step_id: string }) => r.step_id))));
  }, [session, data]);

  const toggle = async (id: string) => {
    if (!session) return;
    const has = done.has(id);
    setDone(prev => {
      const next = new Set(prev);
      has ? next.delete(id) : next.add(id);
      return next;
    });
    if (has) await supabase.from('completed_steps').delete().match({ step_id: id, user_id: session.user.id });
    else await supabase.from('completed_steps').insert({ step_id: id, user_id: session.user.id, igdb_id: igdbId });
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.achievements ?? []).filter(a => {
      if (filter === 'done' && !done.has(a.id)) return false;
      if (filter === 'pending' && done.has(a.id)) return false;
      if (q && !(`${a.name} ${a.description}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [data, done, filter, query]);

  if (data === undefined) {
    return <p style={{ color: '#8c8c8c', fontSize: '0.85rem', padding: '1rem 0' }}>Cargando logros de Steam…</p>;
  }
  if (!data || data.achievements.length === 0) return null;

  const total = data.achievements.length;
  const count = data.achievements.filter(a => done.has(a.id)).length;
  const pct = Math.round((count / total) * 100);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ background: '#0d0d0d', border: '1px solid #1e1e1e', borderRadius: '10px', padding: '1.1rem 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', letterSpacing: '0.18em', color: '#f5a623', textTransform: 'uppercase', margin: 0 }}>Logros de Steam</p>
            <p style={{ color: '#9a9a9a', fontSize: '0.8rem', margin: '4px 0 0' }}>
              {session ? `${count} de ${total} conseguidos` : `${total} logros · inicia sesión para marcar tu progreso`}
            </p>
          </div>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', color: '#f0ece4' }}>{pct}%</span>
        </div>
        <div style={{ height: '6px', background: '#1a1a1a', borderRadius: '99px', marginTop: '0.75rem', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#f5a623,#ffd27a)', transition: 'width 0.3s' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {(['all', 'pending', 'done'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '0.4rem 0.85rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', border: '1px solid #2a2a2a', background: filter === f ? '#f5a623' : 'transparent', color: filter === f ? '#000' : '#9a9a9a', cursor: 'pointer' }}>
            {f === 'all' ? 'Todos' : f === 'pending' ? 'Pendientes' : 'Conseguidos'}
          </button>
        ))}
        <button onClick={() => setShowHidden(s => !s)} style={{ padding: '0.4rem 0.85rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', border: '1px solid #2a2a2a', background: 'transparent', color: '#9a9a9a', cursor: 'pointer' }}>
          {showHidden ? 'Ocultar secretos' : 'Mostrar secretos'}
        </button>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar logro…" style={{ flex: 1, minWidth: '160px', background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: '6px', color: '#f0ece4', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {list.map(a => {
          const isDone = done.has(a.id);
          const secret = a.hidden && !showHidden && !isDone;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => toggle(a.id)}
              disabled={!session}
              style={{ all: 'unset', boxSizing: 'border-box', display: 'flex', gap: '0.9rem', alignItems: 'center', padding: '0.75rem 1rem', borderRadius: '8px', border: `1px solid ${isDone ? 'rgba(245,166,35,0.35)' : '#1e1e1e'}`, background: isDone ? 'rgba(245,166,35,0.06)' : '#0d0d0d', cursor: session ? 'pointer' : 'default' }}
            >
              <img src={isDone ? a.icon : a.iconGray} alt="" width={44} height={44} loading="lazy" style={{ borderRadius: '6px', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: '#f0ece4', fontSize: '0.88rem', fontWeight: 600, margin: 0 }}>{secret ? 'Logro secreto' : a.name}</p>
                <p style={{ color: '#8c8c8c', fontSize: '0.78rem', margin: '2px 0 0', lineHeight: 1.45 }}>
                  {secret ? 'Pulsa "Mostrar secretos" para ver la descripción.' : a.description || 'Sin descripción.'}
                </p>
              </div>
              {a.percent !== null && (
                <span title="Jugadores que lo tienen" style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.72rem', color: a.percent < 10 ? '#f5a623' : '#8c8c8c', flexShrink: 0 }}>
                  {a.percent.toFixed(1)}%
                </span>
              )}
              <span aria-hidden="true" style={{ width: '20px', height: '20px', borderRadius: '5px', border: `2px solid ${isDone ? '#f5a623' : '#3a3a3a'}`, background: isDone ? '#f5a623' : 'transparent', display: 'grid', placeItems: 'center', color: '#000', fontSize: '0.75rem', fontWeight: 900, flexShrink: 0 }}>
                {isDone ? '✓' : ''}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
