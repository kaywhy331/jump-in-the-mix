export function SocialSignInOptions({ google, apple }: { google: boolean; apple: boolean }) {
  if (!google && !apple) return null;
  return <>
    <div className="social-auth-options">
      {google && <a className="button social-auth-button" href="/api/auth/oauth/google/start">Continue with Google</a>}
      {apple && <a className="button social-auth-button" href="/api/auth/oauth/apple/start">Continue with Apple</a>}
    </div>
    <div className="auth-divider"><span>or use email</span></div>
  </>;
}
