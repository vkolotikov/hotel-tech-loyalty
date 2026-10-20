<?php

namespace App\Http\Controllers\ContentPublic;

use App\Http\Controllers\Controller;
use App\Models\ContentLink;
use App\Services\Content\ContentLinkClicks;
use App\Services\Content\ContentLinks;
use App\Services\Content\ContentPublicLanguage;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * A tracked short link on the public host (spec 2026-10-19 §5.3, §5.4). A live code answers 302 to its address with
 * its tags, never cached; a switched-off code a plain "no longer active" page (404) in the brand's Content language; an
 * unknown code the host's normal 404. Read across tenants by code (a public request has no tenant), as
 * LandingPageController::show reads a page by slug. Served from routes/landing.php: no `web` group, no session.
 */
class GoController extends Controller
{
    public function show(Request $request, string $code): Response
    {
        $link = ContentLink::withoutGlobalScopes()->where('code', $code)->first();
        abort_if($link === null, 404);
        if ($link->destination === null) {
            $language = ContentPublicLanguage::of($link->brand_id === null ? null : (int) $link->brand_id);

            return response()->view('content-public.link-off', ['lang' => $language], 404)->header('Cache-Control', 'no-store');
        }
        if (!$request->isMethod('HEAD') && !ContentLinkClicks::isRobot($request->userAgent())) {
            ContentLinkClicks::count($link, $request->query('via') === 'bio' ? 'bio' : 'direct');
        }

        return new RedirectResponse(ContentLinks::target($link->destination, (array) $link->utm), 302, ['Cache-Control' => 'no-store']);
    }
}
