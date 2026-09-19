// Run before the first paint; the root layout supplies the request's CSP nonce.
export const appearanceScript = `(function(){try{var t=localStorage.getItem('jitm-appearance');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}})();`;

