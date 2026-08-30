<?php
namespace App\Http\Controllers\Landing;

use App\Http\Controllers\Controller;
use App\Http\Middleware\LandingPageSecurity;
use App\Landing\PageContent;
use App\Models\LandingPage;
use App\Support\Accent;
use App\Support\LandingSlug;
use App\Support\ScalarTree;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class LandingPageController extends Controller
{
    public function show(string $slug): Response|RedirectResponse
    {
        // withoutGlobalScopes: there is no authenticated tenant on a public
        // request, so the tenant scope would match nothing. The slug is the
        // lookup key and it is globally unique.
        $page = LandingPage::withoutGlobalScopes()
            ->published()
            ->where('slug', $slug)
            ->first();

        if ($page !== null) {
            return $this->render($page)
                ->header('Cache-Control', 'public, max-age=' . config('landing.cache_ttl') . ', must-revalidate');
        }

        $target = $this->liveRedirectTarget($slug);

        abort_if($target === null, 404);

        // Revalidated here rather than trusted from the column. Every WRITE
        // path enforces LandingSlug::isValid() -- the admin controller and
        // the route's own `[a-z0-9-]+` constraint both forbid a slash -- but
        // there is no CHECK constraint behind that at the database level, so
        // the invariant lives entirely in application code this line does
        // not go through. A migration, a manual UPDATE, or a bug in some
        // future writer is all it takes for $target->slug to hold something
        // like "/evil.example.com": redirect()->to() treats a leading "//"
        // as an already-complete URL (Illuminate\Routing\UrlGenerator::
        // isValidUrl()) and passes it through untouched, without ever
        // prepending this host -- an open redirect off this origin. A slug
        // this feature wrote itself always passes this check, so it can
        // never fire on a legitimate rename; it exists for the row that was
        // never written by this feature at all.
        if (!LandingSlug::isValid($target->slug)) {
            // Logged, not merely refused. Failing closed keeps the visitor
            // safe but tells nobody, and the only other symptom is a page
            // that has quietly stopped resolving -- which surfaces, if at
            // all, as a customer reporting a broken link. The slug is
            // operator-owned data rather than anything the request carries,
            // so this cannot be driven by an attacker, and the volume is
            // bounded by real traffic to one broken row.
            Log::warning('landing.redirect.invalid_target_slug', [
                'from_slug' => $slug,
                'page_id'   => $target->id,
            ]);

            abort(404);
        }

        // The redirect row is keyed by the OLD address and carries only the
        // page id -- never a cached copy of where it points today. Reading
        // the target's LIVE slug here, rather than trusting anything stored
        // on the row, is what makes a rename chain (a -> b -> c) resolve in
        // one hop: whichever old address a visitor holds, this always lands
        // them on where the page lives right now, not on the next link in
        // the chain.
        //
        // The Cache-Control is not decoration. This redirect is TEMPORARY --
        // landing_page_redirects.expires_at is now + 90 days -- but it is
        // served as a 301, the status browsers cache hardest, and Symfony
        // deliberately REMOVES the framework's default no-cache from a 301
        // (RedirectResponse::__construct), so without this line the response
        // carries no freshness information whatsoever and a browser is
        // entitled to treat it as permanent. Confirmed in real Chromium, not
        // reasoned about: after the server stopped serving the redirect the
        // browser kept following it without revalidating, and a rename-back
        // (a -> b -> a, which the admin update() explicitly supports) left
        // the tenant's own live URL at ERR_TOO_MANY_REDIRECTS -- a state no
        // server-side fix can reach, because the server is never asked.
        // Matching the page's own short, revalidating TTL keeps the redirect
        // cheap to serve while capping the damage of any stale copy at
        // cache_ttl seconds.
        return redirect()->to('/' . $target->slug, 301)
            ->header('Cache-Control', 'public, max-age=' . config('landing.cache_ttl') . ', must-revalidate');
    }

    /**
     * The live page a redirect row points at today, or null if following it
     * would be unsafe: no live row for this slug, the row has expired, or the
     * page it names is now a draft or gone entirely. A draft must never be
     * exposed this way -- it would both dead-end at the renderer's own
     * ->published() check and, worse, confirm to a visitor that a draft
     * exists behind the old address. So this asks the exact same question
     * show() already asked above.
     *
     * Task 11's invariant -- no redirect row may share a slug with a live
     * page -- is what keeps this from ever looping. show() has already tried
     * $slug against live pages and missed by the time this runs, so a row
     * that were somehow keyed on its own target's current slug could only be
     * reached here if that target were not currently published; a published
     * page at $slug would have matched the query above and returned already.
     */
    private function liveRedirectTarget(string $slug): ?LandingPage
    {
        $row = DB::table('landing_page_redirects')
            ->where('slug', $slug)
            ->where('expires_at', '>', now())
            ->first();

        if ($row === null) {
            return null;
        }

        return LandingPage::withoutGlobalScopes()
            ->published()
            ->find($row->landing_page_id);
    }

    /** Signed URL, so a draft can be shown to its owner and nobody else. */
    public function preview(Request $request, int $page): Response
    {
        $model = LandingPage::withoutGlobalScopes()->find($page);

        abort_if($model === null, 404);

        // The editor's live pane iframes this URL from whichever admin host the
        // tenant is signed in to, and this product answers on SIX of them
        // (config/pwa.php's list: the umbrella app.hexa-tech.uk, loyalty.hotel-
        // tech.ai, and the sub-brand domains). Naming only config('app.url')
        // here meant the browser refused the frame on the other five and the
        // editor showed an empty pane -- the exact "preview not works" a tenant
        // reported, and the reason a broken design could ship unseen.
        //
        // Only the PREVIEW relaxes frame-ancestors; a published page keeps
        // 'none'. The URL is signed and short-lived, and the value still names
        // only our own origins rather than '*', so a draft cannot be framed by
        // a third party who somehow obtains the link.
        $request->attributes->set(
            'landing.frame_ancestors',
            "'self' " . implode(' ', LandingPageSecurity::adminOrigins())
        );

        return $this->render($model)
            ->header('Cache-Control', 'no-store')
            ->header('X-Robots-Tag', 'noindex');
    }

    private function render(LandingPage $page): Response
    {
        // Nothing below this line may throw on stored data. theme, content
        // and seo are schemaless `array` casts whose leaves are read as
        // strings — brand_color reaches Accent::for(?string ...) and every
        // copy and seo leaf reaches Blade's e(), which is htmlspecialchars()
        // with a `string` parameter — so an ARRAY leaf is not a cosmetic
        // problem: it is a TypeError, which is a 500 on a LIVE public page on
        // every request until somebody edits the row. Preview shares this
        // method, so it 500s identically and the tenant cannot even see what
        // they broke.
        //
        // The admin API now refuses those writes (ScalarLeaves), but a
        // validator only governs rows written after it shipped; these columns
        // have no CHECK constraint behind them, and a migration, an import or
        // a raw UPDATE never meets a validator at all. So the render path
        // prunes rather than trusts — the same rule, asked the other way.
        //
        // The model is mutated IN MEMORY only. Nothing on this path saves,
        // and pruning here rather than in the cast keeps the admin API honest
        // about what is actually stored.
        $page->theme   = ScalarTree::prune($page->theme, 1);
        $page->content = ScalarTree::prune($page->content, 2);
        $page->seo     = ScalarTree::prune($page->seo, 1);

        $content = PageContent::for($page);
        $accent  = Accent::for($page->theme['brand_color'] ?? null, $content->profile->accent);

        return response()->view('landing.' . $page->template_key . '.layout', [
            'page'     => $page,
            'content'  => $content,
            'profile'  => $content->profile,
            'sections' => $page->sections,
            // Resolved here rather than in the template so all three templates
            // get the same contrast guarantees from one place. A tenant hex
            // that no readable label can sit on is discarded here, not painted
            // and hoped over — see App\Support\Accent.
            'accent'   => $accent,
            // The booking widget is FRAMED from the admin origin, never
            // inlined here. LandingHostGuard refuses /api/v1/booking/* and
            // /book/{token} on this host by ruling: the widget's isolation is
            // a browser origin boundary, which an XSS on customer content
            // cannot cross, and inlining it to save an iframe would trade that
            // away. The URL is resolved by the same middleware that writes
            // frame-src, from the same config value, so the template can never
            // name a host the policy does not permit -- and gets null, rather
            // than a broken frame, when there is no origin to name.
            'bookingUrl' => LandingPageSecurity::widgetUrl('/booking-widget', [
                'org'   => $page->organization_id,
                'lang'  => app()->getLocale(),
                'color' => $accent->brand,
                'tpl'   => $page->template_key,
            ]),
            // The chat panel is FRAMED too, and for a harder reason than
            // booking's. The widget injects an inline <script> and positions
            // itself with inline style ATTRIBUTES; this page's script-src and
            // style-src refuse both, and a nonce -- which fixed the injected
            // <style> element -- cannot reach an attribute. Same-origin, what
            // a real tenant page rendered was the widget's raw DOM in the
            // document flow below the footer. On the admin origin the widget
            // runs under no policy at all and needs no changes; the landing
            // page keeps only a launcher of its own. See routes/web.php.
            //
            // rawurlencode, then widgetUrl(): the key is a uuid column in
            // production but this template must not depend on that to keep
            // the path it builds inside the prefix frame-src names.
            'chatFrameUrl' => filled($content->widgetKey)
                ? LandingPageSecurity::widgetUrl(
                    '/chat-frame/' . rawurlencode((string) $content->widgetKey),
                    ['lang' => app()->getLocale()],
                )
                : null,
        ]);
    }
}
