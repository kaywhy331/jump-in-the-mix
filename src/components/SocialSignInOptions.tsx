export function SocialSignInOptions({ google, apple, returnTo }: { google: boolean; apple: boolean; returnTo?: string }) {
  if (!google && !apple) return null;
  return <>
    <div className="social-auth-options">
      {google && <a className="button social-auth-button" href={`/api/auth/oauth/google/start${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}>Continue with Google</a>}
      {apple && <a className="button social-auth-button" href={`/api/auth/oauth/apple/start${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}>Continue with Apple</a>}
    </div>
    <div className="auth-divider"><span>or use email</span></div>
  </>;
}
