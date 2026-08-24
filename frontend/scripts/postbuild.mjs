/**
 * Publish the Vite build.
 *
 * Two destinations, and the split is a security control, not tidiness:
 *
 *   dist/assets, dist/pwa, icons, ...  ->  ../public/spa/   (inside the docroot)
 *   dist/index.html                    ->  ../resources/spa-shell/index.html
 *
 * The shell is the admin login screen. It used to be copied into the docroot
 * along with everything else, which meant the WEB SERVER handed it out before
 * PHP booted — including on sites.hexa-tech.uk, the host that serves customer
 * landing pages and must never carry the admin origin. routes/web.php refuses
 * the shell on that host, and LandingHostGuard refuses it globally, but a
 * static file inside public/ never reaches either of them, and Laravel Cloud's
 * edge has no per-path or per-domain rule that could. The fix is for the file
 * not to be in the docroot at all; routes/web.php reads it from
 * resources/spa-shell/ and serves it itself.
 *
 * That fix is only durable if a rebuild reproduces it. Both public/spa and
 * frontend/dist are committed (Laravel Cloud also rebuilds on deploy), so a
 * postbuild that just copied dist/ wholesale would quietly put index.html back
 * in the docroot and reopen the hole with nobody noticing. Hence the assertion
 * at the end: this script fails the build rather than ship that.
 *
 * The assets themselves are public JS/CSS and stay servable at /spa/assets/,
 * which is what the shell's absolute URLs and public/sw.js both expect.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, '..');
const root = path.resolve(frontend, '..');

const DIST = path.join(frontend, 'dist');
const PUBLIC_SPA = path.join(root, 'public', 'spa');
const SHELL_DEST = path.join(root, 'resources', 'spa-shell', 'index.html');

// The shell is emitted by Vite as dist/index.html and must not land in the
// docroot copy. Keep this list in step with anything else that is build
// output but not a public asset.
const EXCLUDED_FROM_DOCROOT = new Set(['index.html']);

// public/spa/.htaccess is not build output in the sense the rest of this
// directory is — it is the local-Apache rule for this directory (nginx on
// Laravel Cloud ignores it). Vite copies it out of frontend/public, so it
// normally reappears anyway; preserving it across the wipe means a build that
// somehow does not emit it cannot leave the directory unprotected in between.
const PRESERVED = new Set(['.htaccess']);

function fail(message) {
  console.error('postbuild: ' + message);
  process.exit(1);
}

/** Empty `dir` in place, keeping the PRESERVED entries at its top level. */
function wipe(dir, top = true) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir)) {
    if (top && PRESERVED.has(entry)) continue;

    const full = path.join(dir, entry);

    if (fs.statSync(full).isDirectory()) {
      wipe(full, false);
      fs.rmdirSync(full);
    } else {
      fs.unlinkSync(full);
    }
  }
}

/** Copy `src` into `dest`, skipping EXCLUDED_FROM_DOCROOT at the top level. */
function copy(src, dest, top = true) {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src)) {
    if (top && EXCLUDED_FROM_DOCROOT.has(entry)) continue;

    const from = path.join(src, entry);
    const to = path.join(dest, entry);

    if (fs.statSync(from).isDirectory()) {
      copy(from, to, false);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  // Publishing a half-build would leave the app serving assets with no shell,
  // which routes/web.php answers with the stock Laravel welcome page. Stop
  // before touching public/spa so the previous build stays intact.
  fail('dist/index.html is missing — the Vite build did not produce a shell.');
}

wipe(PUBLIC_SPA);
copy(DIST, PUBLIC_SPA);

fs.mkdirSync(path.dirname(SHELL_DEST), { recursive: true });
fs.copyFileSync(path.join(DIST, 'index.html'), SHELL_DEST);

// The whole point of the split. Assert it rather than trust it: this is the
// step a future edit to the copy logic would silently undo.
if (fs.existsSync(path.join(PUBLIC_SPA, 'index.html'))) {
  fail(
    'public/spa/index.html exists after publishing. The admin shell would be served '
    + 'as a static file on every host, including the landing host. Refusing to finish.',
  );
}

console.log('postbuild: assets -> public/spa, shell -> resources/spa-shell/index.html');
