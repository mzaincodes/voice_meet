/**
 * Applies the persisted (or system) colour scheme before first paint.
 *
 * This is a Server Component emitting a blocking inline script on purpose:
 * doing it in an effect would flash the light theme on every load.
 */
// This design is dark-first, so dark is the default and only an explicit
// in-app toggle (persisted here) opts out of it.
const SCRIPT = `(function(){try{var s=localStorage.getItem('voicemeet:theme');document.documentElement.classList.toggle('dark',s!=='light');}catch(e){document.documentElement.classList.add('dark');}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
