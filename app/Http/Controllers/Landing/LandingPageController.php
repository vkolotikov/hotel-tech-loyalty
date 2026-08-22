<?php
namespace App\Http\Controllers\Landing;

use App\Http\Controllers\Controller;
use App\Http\Middleware\LandingPageSecurity;
use App\Landing\PageContent;
use App\Models\LandingPage;
use App\Support\Accent;
use App\Support\LandingSlug;
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
        return redirect()->to('/' . $target->slug, 301);
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

        return $this->render($model)
            ->header('Cache-Control', 'no-store')
            ->header('X-Robots-Tag', 'noindex');
    }

    private function render(LandingPage $page): Response
    {
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
        ]);
    }
}
