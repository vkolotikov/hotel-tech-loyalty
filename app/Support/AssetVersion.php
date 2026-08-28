<?php

namespace App\Support;

/**
 * A cache-busting query string for a static file under public/.
 *
 * F2 (phase 3c final fix wave): layout.blade.php linked ruled_page.css and
 * ruled_page.js with a bare asset() call, so the URL never changed even
 * though this branch rewrote both files wholesale — a browser holding a
 * cached 3b stylesheet pairs it with the rebuilt 3c markup and renders
 * nonsense, forever, until that visitor's cache happens to expire on its
 * own. The fix is the usual one: make the URL change whenever the file's
 * BYTES change, so a deploy is a new URL rather than a request to please
 * re-check an old one.
 *
 * Content hash, not filemtime. This repo's own deploy model checks the
 * repository out fresh (see the admin SPA's committed-build model, and
 * hotel-tech-loyalty:main being the thing a deploy actually watches) —
 * a filesystem mtime survives a `git checkout` only by accident, and
 * several common deploy shapes (a fresh clone, a tag switch, a container
 * rebuild from a tarball) hand every file the SAME checkout-time mtime
 * regardless of which one last actually changed content, which would
 * either cache-bust every asset on every deploy or bust none of them.
 * A content hash changes if and only if the bytes changed, which is
 * exactly the promise this class has to keep.
 */
final class AssetVersion
{
    /**
     * A short, stable, content-derived query string for the file at
     * $relativePath under public/ — "?v=" plus ten hex characters of its
     * md5, or '' when the file cannot be read at all. The empty string is
     * deliberate rather than a placeholder value: appending it to a URL
     * costs nothing (`asset('x.css') . ''` is just `asset('x.css')`), so a
     * missing file degrades to today's un-versioned behaviour instead of
     * 500ing the page — the guard the brief asks for.
     */
    public static function query(string $relativePath): string
    {
        $hash = self::hash($relativePath);

        return $hash === null ? '' : '?v=' . $hash;
    }

    /**
     * The raw hash, with no query-string formatting — split out so a test
     * can compare two files' versions directly without parsing a "?v="
     * prefix back off.
     */
    public static function hash(string $relativePath): ?string
    {
        $path = public_path($relativePath);

        if (!is_file($path) || !is_readable($path)) {
            return null;
        }

        $full = @md5_file($path);

        if ($full === false) {
            return null;
        }

        return substr($full, 0, 10);
    }
}
