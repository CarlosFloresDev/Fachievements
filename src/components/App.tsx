import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Auth from './Auth';
import Profile from './Profile';
import GameView from './GameView';
import type { Session } from '@supabase/supabase-js';
import type { Manifest, GameMeta } from '../lib/types';

interface AppProps {
  manifest?: Manifest | null;
  meta?: GameMeta;
  igdbId?: string;
  view?: 'tracker' | 'profile';
}

export default function App({ manifest, meta, igdbId, view = 'tracker' }: AppProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [recoveryMsg, setRecoveryMsg] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '4rem', color: '#7d7d7d', fontSize: '0.8rem', letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: "'DM Mono', monospace" }}>
      Sincronizando...
    </div>
  );

  if (recovery) {
    const save = async () => {
      if (newPassword.length < 8) { setRecoveryMsg('Usa al menos 8 caracteres.'); return; }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) setRecoveryMsg(error.message);
      else { setRecovery(false); setRecoveryMsg(''); }
    };
    return (
      <div style={{ background: '#0d0d0d', border: '1px solid #1e1e1e', borderRadius: '12px', padding: '2rem', maxWidth: '420px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', letterSpacing: '0.06em', color: '#f0ece4', margin: 0 }}>Nueva contraseña</h2>
        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 8 caracteres" style={{ background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#f0ece4', padding: '0.8rem 1rem', fontSize: '0.95rem' }} />
        <button onClick={save} style={{ background: '#f5a623', color: '#000', fontWeight: 700, border: 'none', borderRadius: '7px', padding: '0.7rem', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.78rem' }}>Guardar</button>
        {recoveryMsg && <p style={{ color: '#e54545', fontSize: '0.8rem', margin: 0 }}>{recoveryMsg}</p>}
      </div>
    );
  }

  if (view === 'profile') {
    return session ? <Profile session={session} /> : <Auth />;
  }

  return meta ? <GameView session={session} manifest={manifest ?? null} meta={meta} igdbId={igdbId ?? ''} /> : null;
}
