/**
 * Google and Apple buttons, shown only for configured providers. On /register?invite=… they carry the
 * invitation (`invite`), so a new account can be created from it; elsewhere they sign in to an existing
 * account and can carry a safe return path. `note` is a short line under the buttons.
 */
export function SocialSignInOptions({ google, apple, returnTo, invite, note }: { google: boolean; apple: boolean; returnTo?: string; invite?: string; note?: string }) {
  if (!google && !apple) return null;
  const query = invite ? `?invite=${encodeURIComponent(invite)}` : returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
  return <>
    <div className="social-auth-options">
      {google && <a className="button social-auth-button" href={`/api/auth/oauth/google/start${query}`} rel="nofollow">Continue with Google</a>}
      {apple && <a className="button social-auth-button" href={`/api/auth/oauth/apple/start${query}`} rel="nofollow">Continue with Apple</a>}
    </div>
    {note && <p className="social-auth-note">{note}</p>}
    <div className="auth-divider"><span>or use email</span></div>
  </>;
}
