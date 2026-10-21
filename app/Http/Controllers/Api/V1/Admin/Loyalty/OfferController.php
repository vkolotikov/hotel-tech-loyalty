<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\SpecialOffer;
use App\Scopes\BrandScope;
use App\Services\Appointments\VenueClock;
use App\Services\Booking\Setup\OwnRows;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyForms;
use App\Services\Loyalty\LoyaltyRefused;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Offers (spec 2026-10-21 §4.6): every staff member reads them, staff with
 * `can_manage_offers` add and change them (§5). The rules are
 * OffersAdminController's, without the image (JSON only in this release):
 * the code trimmed and upper-cased, one organisation never holding the same
 * code twice, `tier_ids` this organisation's tiers. Offers are brand-scoped:
 * read as the request's brand binding gives, created on the brand the
 * model's own hook picks.
 */
class OfferController extends Controller
{
    private const CODE = 'regex:/^[A-Za-z0-9-]+$/';

    public function index(): JsonResponse
    {
        $today = VenueClock::today((int) app('current_organization_id'));

        return response()->json([
            'offers'  => SpecialOffer::query()->orderByDesc('created_at')->orderByDesc('id')->get()
                ->map(fn (SpecialOffer $o) => self::row($o, $today))->values(),
            'options' => ['types' => LoyaltyForms::OFFER_TYPES, 'applies_to' => LoyaltyForms::appliesTo()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        LoyaltyAccess::require($request->user(), LoyaltyAccess::MANAGE_REWARDS);
        $this->normaliseCode($request);
        $data = $request->validate([
            'title'            => 'required|string|max:191',
            'description'      => 'required|string',
            'type'             => ['required', Rule::in(LoyaltyForms::OFFER_TYPES)],
            'value'            => 'required|numeric|min:0|max:999999.99',
            'code'             => ['nullable', 'string', 'min:4', 'max:24', self::CODE],
            'applies_to'       => ['nullable', Rule::in(LoyaltyForms::appliesTo())],
            'tier_ids'         => 'nullable|array',
            'tier_ids.*'       => ['integer', OwnRows::rule('loyalty_tiers')],
            'start_date'       => 'required|date',
            'end_date'         => 'required|date|after:start_date',
            'usage_limit'      => 'nullable|integer|min:1',
            'per_member_limit' => 'nullable|integer|min:1',
            'is_featured'      => 'boolean',
        ]);
        $this->refuseTakenCode($data['code'] ?? null);

        $offer = SpecialOffer::create(self::columns($data) + ['created_by' => $request->user()->id]);

        return response()->json(['offer' => self::row($offer->fresh(), VenueClock::today((int) app('current_organization_id')))], 201);
    }

    /**
     * OffersAdminController::update's rules: any field alone. An offer written before the type list (or by the AI
     * generator) may keep the type it has; a date sent alone is held against the stored other one.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::require($request->user(), LoyaltyAccess::MANAGE_REWARDS);
        $offer = SpecialOffer::query()->find($id) ?? throw LoyaltyRefused::notFound();
        $this->normaliseCode($request);

        $types = LoyaltyForms::OFFER_TYPES;
        if (is_string($offer->type) && $offer->type !== '' && !in_array($offer->type, $types, true)) {
            $types[] = $offer->type;
        }
        $start = $request->has('start_date') ? 'start_date' : $offer->start_date?->toDateString();
        $end = $request->has('end_date') ? null : $offer->end_date?->toDateString();
        $data = $request->validate([
            'title'            => 'sometimes|required|string|max:191',
            'description'      => 'sometimes|required|string',
            'type'             => ['sometimes', Rule::in($types)],
            'value'            => 'sometimes|numeric|min:0|max:999999.99',
            'code'             => ['sometimes', 'nullable', 'string', 'min:4', 'max:24', self::CODE],
            'applies_to'       => ['sometimes', 'nullable', Rule::in(LoyaltyForms::appliesTo())],
            'tier_ids'         => 'sometimes|nullable|array',
            'tier_ids.*'       => ['integer', OwnRows::rule('loyalty_tiers')],
            'start_date'       => array_merge(['sometimes', 'date'], $end ? ['before:' . $end] : []),
            'end_date'         => array_merge(['sometimes', 'date'], $start ? ['after:' . $start] : []),
            'usage_limit'      => 'sometimes|nullable|integer|min:1',
            'per_member_limit' => 'sometimes|nullable|integer|min:1',
            'is_featured'      => 'sometimes|boolean',
            'is_active'        => 'sometimes|boolean',
        ]);
        if (array_key_exists('code', $data)) {
            $this->refuseTakenCode($data['code'], $offer);
        }

        $offer->update(self::columns($data));

        return response()->json(['offer' => self::row($offer->fresh(), VenueClock::today((int) app('current_organization_id')))]);
    }

    /** @return array<string, mixed> */
    private static function row(SpecialOffer $o, string $today): array
    {
        return [
            'id'               => (int) $o->id,
            'title'            => (string) $o->title,
            'description'      => $o->description,
            'type'             => $o->type,
            'value'            => (float) $o->value,
            'code'             => $o->code,
            'applies_to'       => (string) ($o->applies_to ?? 'all'),
            'tier_ids'         => LoyaltyForms::ints($o->tier_ids),
            'start_date'       => $o->start_date?->format('Y-m-d'),
            'end_date'         => $o->end_date?->format('Y-m-d'),
            'usage_limit'      => $o->usage_limit !== null ? (int) $o->usage_limit : null,
            'times_used'       => (int) $o->times_used,
            'per_member_limit' => $o->per_member_limit !== null ? (int) $o->per_member_limit : null,
            'is_active'        => (bool) $o->is_active,
            'is_featured'      => (bool) $o->is_featured,
            'state'            => self::state($o, $today),
        ];
    }

    /** Off when switched off; otherwise where the venue's today falls against its dates (spec §6.6). */
    private static function state(SpecialOffer $o, string $today): string
    {
        return match (true) {
            !$o->is_active                                                      => 'off',
            $o->end_date !== null && $o->end_date->format('Y-m-d') < $today     => 'ended',
            $o->start_date !== null && $o->start_date->format('Y-m-d') > $today => 'upcoming',
            default                                                             => 'live',
        };
    }

    /**
     * The offer's columns from the form's fields: `applies_to` never stored empty (the column holds `all` for every
     * booking), `tier_ids` integers whatever the transport and empty meaning every tier, null — stored as `[]` it
     * would match no tier at all (SpecialOffer::scopeForTier).
     *
     * @return array<string, mixed>
     */
    private static function columns(array $data): array
    {
        if (array_key_exists('applies_to', $data)) {
            $data['applies_to'] ??= 'all';
        }
        if (array_key_exists('tier_ids', $data)) {
            $data['tier_ids'] = LoyaltyForms::ints($data['tier_ids']);
        }

        return $data;
    }

    /** Trim the code before validation, so `' welcome10 '` passes the character rule, then upper-case it. */
    private function normaliseCode(Request $request): void
    {
        if ($request->filled('code')) {
            $request->merge(['code' => strtoupper(trim((string) $request->input('code')))]);
        }
    }

    /**
     * One organisation never holds the same code twice, whatever the brand: a member types a code without saying
     * which brand it is for. So the brand scope is lifted here, and only here; the tenant scope stays.
     */
    private function refuseTakenCode(?string $code, ?SpecialOffer $offer = null): void
    {
        if ($code === null || $code === '') {
            return;
        }
        $taken = SpecialOffer::withoutGlobalScope(BrandScope::class)
            ->where('code', $code)
            ->when($offer, fn ($q) => $q->whereKeyNot($offer->id))
            ->exists();
        if ($taken) {
            throw ValidationException::withMessages(['code' => 'That code is already used by another offer.']);
        }
    }
}
