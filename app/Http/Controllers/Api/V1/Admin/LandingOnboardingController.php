<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Landing\ThemeRules;
use App\Models\Organization;
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
            // The final scenario, step 2: offerableTemplateKeys(), not
            // templateKeys(). The wizard's design step draws from the same
            // `offerable` flag on the wire, so what the picker offers and
            // what this endpoint accepts are one list — and a design retired
            // from the offer cannot be created by a caller who guessed its
            // key either. See LandingOnboardingService::offerableTemplateKeys().
            'template_key'       => ['required', 'string', Rule::in(LandingOnboardingService::offerableTemplateKeys())],
            // Landing phase 3c (wizard industry step): which industry's
            // words the page is written in -- the wizard's own first step,
            // and the value LandingOnboardingService::apply() moves the
            // ORGANISATION onto (see syncOrganizationIndustry() there for
            // what that does and, just as importantly, what it does not).
            //
            // Rule::in against Organization::INDUSTRIES rather than a
            // literal, for the same reason template_key is validated
            // against templateKeys(): the picker the wizard renders is
            // built from that same constant, so what is OFFERED and what is
            // ACCEPTED cannot come apart. Aliases ('hospitality') are not
            // in it and are refused here -- the service normalises what
            // does get through, so nothing depends on this rule being the
            // only narrowing, but a wizard that only ever sends canonical
            // ids should not have the endpoint quietly widen for it.
            //
            // 'sometimes': a client that never asks (an older build, a
            // direct API call) keeps the pre-existing behaviour exactly --
            // the page is filed under the org's own industry.
            'industry'           => ['sometimes', 'string', Rule::in(Organization::INDUSTRIES)],
            'slug'               => 'required|string|max:63',
            'copy'               => ['sometimes', 'array', new ScalarLeaves(depth: 1)],
            'copy.headline'      => 'nullable|string|max:120',
            'copy.subtext'       => 'nullable|string|max:200',
            // D6 (landing phase 3c): the per-key theme rules
            // ('theme.brand_color', 'theme.font_pairing') that used to live
            // here as sibling dotted rules moved to App\Landing\ThemeRules,
            // validated below as its OWN Validator instance rather than
            // dotted keys added to THIS array -- see ThemeRules::validate()'s
            // docblock for why (the phase-3a
            // Validator::$excludeUnvalidatedArrayKeys trap: dotted rules
            // naming only SOME of an array field's children silently
            // strip the rest from validated() instead of refusing them,
            // and D6 needs an unrecognised key -- Task 1's new `palette`
            // included -- to 422, not to vanish quietly).
            'theme'              => ['sometimes', 'array', new ScalarLeaves(depth: 1)],
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
            // Named for the same reason the slug and contact messages
            // below are: Laravel's own default here is "The selected
            // industry is invalid.", which tells a tenant nothing they can
            // act on about a choice they made from a list this screen drew
            // for them.
            'industry.in'           => 'Please choose one of the listed industries.',
            'industry.string'       => 'Please choose one of the listed industries.',
            // The final scenario: the wizard now ASKS which design, so this
            // rule can fail for a real person rather than only for a direct
            // API call. Laravel's own default is "The selected template key
            // is invalid." — a raw field name at a tenant, exactly what the
            // slug messages below already exist to prevent. Worded
            // character-for-character as LandingPageController's, so the same
            // mistake reads the same wherever it is made.
            'template_key.required' => 'Please choose one of the available page styles.',
            'template_key.string'   => 'Please choose one of the available page styles.',
            'template_key.in'       => 'Please choose one of the available page styles.',
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

        // D6: see the comment on the 'theme' rule above -- validated as its
        // own Validator instance (App\Landing\ThemeRules::validate()), never
        // as sibling dotted rules in the array above, so an unrecognised key
        // (a stray `theme.whatever`, or a `theme.palette` outside the six
        // curated ids) is refused with a 422 rather than silently dropped.
        // Only is_array(): 'theme' is 'sometimes', so it is simply absent
        // from $data when the request never sent it at all.
        $theme = $data['theme'] ?? null;

        if (is_array($theme)) {
            ThemeRules::validate($theme);
        }

        return response()->json(['page' => $this->service->apply($data)], 201);
    }
}
