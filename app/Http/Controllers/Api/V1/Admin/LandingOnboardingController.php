<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Rules\ScalarLeaves;
use App\Services\Landing\LandingOnboardingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Thin, per the house onboarding contract (Appendix A 7.2): validate, hand to
 * the service, return what the confirmation UI reads.
 *
 * The page is never named in either verb. There is one landing page per
 * brand, so the caller's tenant + brand already identify it, and an {id}
 * segment would be an IDOR surface with nothing to gain.
 */
class LandingOnboardingController extends Controller
{
    public function __construct(private LandingOnboardingService $service) {}

    public function show(): JsonResponse
    {
        return response()->json($this->service->prefill());
    }

    public function store(Request $request): JsonResponse
    {
        // copy and theme land in landing_pages.content and .theme, which are
        // schemaless `array` casts, and the public renderer reads their
        // leaves as strings -- theme.brand_color goes into
        // Accent::for(?string ...) and every copy leaf through Blade's e(),
        // which is htmlspecialchars() with a `string` parameter. An ARRAY
        // leaf there is not a cosmetic problem, it is a TypeError: HTTP 500
        // on a live public marketing page, from stored data, on every
        // request until somebody edits the row. So each leaf is typed as the
        // scalar it is, and the containers carry ScalarLeaves as well -- the
        // leaf rules alone would let `copy` arrive as {"headline": {"a":
        // {"b": 1}}} with an unlisted key nobody validated.
        //
        // The slug messages are named for the same reason
        // LandingPageController::store()/update() name theirs: the word
        // "slug" must never reach a tenant (spec 9), and Laravel's own
        // defaults say it verbatim -- "The slug field must not be greater
        // than 63 characters." This wizard never renders a slug field at
        // all (it posts back the suggestion it was handed), so the only way
        // in is a direct API call; that is a narrow blast radius, not a
        // closed one, and the three controllers that accept an address must
        // not disagree about how they refuse one.
        $data = $request->validate([
            'template_key'       => ['required', 'string', Rule::in(LandingOnboardingService::templateKeys())],
            'slug'               => 'required|string|max:63',
            'copy'               => ['sometimes', 'array', new ScalarLeaves(depth: 1)],
            'copy.headline'      => 'nullable|string|max:120',
            'copy.subtext'       => 'nullable|string|max:200',
            'theme'              => ['sometimes', 'array', new ScalarLeaves(depth: 1)],
            'theme.brand_color'  => 'nullable|string|max:32',
            'theme.font_pairing' => 'nullable|string|in:editorial,modern,classic',
            // Task 2 (contact editable): a leaf per overridable field, same
            // three ContactDetails::resolve() honours (App\Landing\ContactDetails)
            // — name/city/country/currency/timezone stay Property-only and are
            // deliberately not accepted here. Every message is named, the same
            // reason the slug messages above are: Laravel's own default for an
            // 'email' failure is "The contact.email field must be a valid email
            // address." — a raw dotted key handed to a tenant is exactly the
            // "must never reach a tenant" failure spec §9 already names for
            // "slug", just spelled with a different field.
            'contact'            => ['sometimes', 'array', new ScalarLeaves(depth: 1)],
            'contact.phone'      => 'nullable|string|max:64',
            'contact.email'      => 'nullable|string|email|max:191',
            'contact.address'    => 'nullable|string|max:191',
            'sections'           => 'nullable|array',
            'sections.*.key'     => 'required|string|max:64',
            'sections.*.enabled' => 'required|boolean',
        ], [
            'slug.required'         => 'Please choose a web address.',
            'slug.string'           => 'That web address is not valid.',
            'slug.max'              => 'Please use a shorter web address — up to 63 characters.',
            'contact.phone.string'  => 'Please enter a valid phone number.',
            'contact.phone.max'     => 'Please use a shorter phone number — up to 64 characters.',
            'contact.email.string'  => 'Please enter a valid email address.',
            'contact.email.email'   => 'Please enter a valid email address.',
            'contact.email.max'     => 'Please use a shorter email address — up to 191 characters.',
            'contact.address.string' => 'Please enter a valid address.',
            'contact.address.max'   => 'Please use a shorter address — up to 191 characters.',
        ]);

        return response()->json(['page' => $this->service->apply($data)], 201);
    }
}
