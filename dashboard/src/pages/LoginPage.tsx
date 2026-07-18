import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Bot, LockKeyhole } from 'lucide-react';
import { supabase } from '../lib/supabase';

/** Authenticates an existing Supabase user without exposing a signup path for the private deployment. */
export function LoginPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) setError(signInError.message);
  };
  return <div className="login-page"><div className="login-glow" /><form className="login-card" onSubmit={submit}>
    <div className="brand login-brand"><span className="brand-mark"><Bot size={19} /></span><span>relay</span></div>
    <div><p className="eyebrow">PRIVATE AI ASSISTANT</p><h1>Stay present, without being always on.</h1><p className="subtle">Your WhatsApp assistant is ready when you are.</p></div>
    <label>Email<input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
    <label>Password<input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
    {error && <p className="form-error">{error}</p>}
    <button className="button button--primary button--wide" disabled={loading}>{loading ? 'Signing in…' : <>Enter workspace <ArrowRight size={17} /></>}</button>
    <p className="login-security"><LockKeyhole size={13} /> Protected by your Supabase account</p>
  </form></div>;
}
