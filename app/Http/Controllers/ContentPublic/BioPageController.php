<?php

namespace App\Http\Controllers\ContentPublic;

use App\Http\Controllers\Controller;
use App\Services\Content\ContentBioPublic;
use Symfony\Component\HttpFoundation\Response;

/**
 * A brand's link-in-bio page on the public host (spec 2026-10-19 §6.2, §6.3): no page by that name, or one switched
 * off, is the host's normal 404; a page that is on is cached for five minutes like a landing page. Served from
 * routes/landing.php: no `web` group, no session, the landing CSP (the brand colour comes in through its nonce).
 */
class BioPageController extends Controller
{
    public function show(string $name): Response
    {
        $page = ContentBioPublic::forName($name);
        abort_if($page === null, 404);

        return response()->view('content-public.bio', $page)->header('Cache-Control', 'public, max-age=300');
    }
}
