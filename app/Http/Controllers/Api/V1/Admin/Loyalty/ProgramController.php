<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\BenefitDefinition;
use App\Models\EarnRateEvent;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\TierBenefit;
use App\Services\AnalyticsService;
use App\Services\Appointments\VenueClock;
use App\Services\Booking\Setup\OwnRows;
use App\Services\DiscountService;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyForms;
use App\Services\Loyalty\LoyaltyRefused;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator as FormValidator;

/**
 * Program (spec 2026-10-21 §4.5): the tier ladder with each tier's benefits,
 * the benefit catalogue and the boost events. Everyone reads it; only a
 * manager changes it (§5), as with the full admin's Program hub. The rules
 * are the full admin's (TierController, BenefitAdminController,
 * EarnRateEventController) plus the one its `exists:` rules lack: every id a
 * request names is this organisation's (§6.5).
 */
class ProgramController extends Controller
{
    private const COLOR = 'regex:/^#[0-9a-fA-F]{6}$/';
    /** loyalty_tiers.earn_rate is decimal(4,2): a larger rate would fail in the database, not in the form. */
    private const MAX_EARN_RATE = 99.99;

    public function show(Request $request): JsonResponse
    {
        $orgId = (int) app('current_organization_id');
        $named = VenueClock::isNamed($orgId);
        $members = LoyaltyMember::query()->where('is_active', true)
            ->selectRaw('tier_id, COUNT(*) AS n')->groupBy('tier_id')->pluck('n', 'tier_id');
        $benefits = $this->tierBenefits()->get()->groupBy('tier_id');

        return response()->json([
            'tiers'    => LoyaltyTier::query()->orderBy('sort_order')->orderBy('min_points')->get()
                ->map(fn (LoyaltyTier $t) => self::tierRow($t, (int) $members->get($t->id, 0), $benefits->get($t->id, collect())))
                ->values(),
            'benefits' => BenefitDefinition::query()->orderBy('sort_order')->orderBy('name')->get()
                ->map(fn (BenefitDefinition $b) => self::benefitRow($b))->values(),
            'boosts'   => EarnRateEvent::query()->orderByDesc('starts_at')->orderByDesc('id')->get()
                ->map(fn (EarnRateEvent $e) => self::boostRow($e, $named))->values(),
            'options'  => [
                'categories'        => LoyaltyForms::BENEFIT_CATEGORIES,
                'fulfillment_modes' => LoyaltyForms::FULFILLMENT_MODES,
                'value_types'       => DiscountService::VALUE_TYPES,
                'applies_to'        => LoyaltyForms::appliesTo(),
                // Release 4: the brands a new boost may be put on (one: nothing to choose).
                'brands'            => LoyaltyForms::brands($request->user(), $orgId),
            ],
        ]);
    }

    // ─── Tiers ──────────────────────────────────────────────────────────────

    public function storeTier(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $data = self::tierColumns($request->validate([
            'name'        => 'required|string|max:255',
            'color'       => ['nullable', 'string', self::COLOR],
            'min_points'  => 'required|integer|min:0|max:10000000',
            'earn_rate'   => 'required|numeric|min:0|max:' . self::MAX_EARN_RATE,
            'description' => 'nullable|string',
            'is_active'   => 'sometimes|boolean',
        ]));
        // At the end of the ladder, as TierController::store places a tier the form gave no order.
        $data['sort_order'] = (int) LoyaltyTier::query()->max('sort_order') + 1;

        $tier = LoyaltyTier::create($data);

        AuditLog::record('tier_created', $tier, $data, [], $request->user(), "Tier '{$tier->name}' created");
        AnalyticsService::clearDashboardCache();

        return response()->json(['tier' => $this->tierPayload($tier->fresh())], 201);
    }

    public function updateTier(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $tier = $this->tier($id);
        $data = self::tierColumns($request->validate([
            'name'        => 'sometimes|required|string|max:255',
            'color'       => ['sometimes', 'nullable', 'string', self::COLOR],
            'min_points'  => 'sometimes|integer|min:0|max:10000000',
            'earn_rate'   => 'sometimes|numeric|min:0|max:' . self::MAX_EARN_RATE,
            'description' => 'sometimes|nullable|string',
            'is_active'   => 'sometimes|boolean',
        ]));

        $old = $tier->only(array_keys($data));
        $tier->update($data);

        AuditLog::record('tier_updated', $tier, $data, $old, $request->user(), "Tier '{$tier->name}' updated");
        AnalyticsService::clearDashboardCache();

        return response()->json(['tier' => $this->tierPayload($tier->fresh())]);
    }

    // ─── A tier's benefits ──────────────────────────────────────────────────

    /**
     * Give a tier a benefit, or change the one it has: BenefitAdminController::assignTierBenefit's rules. A request
     * that does not send `value_type` (or `applies_to`) keeps what is stored, so rewording an enforceable discount
     * never turns it back into decoration.
     */
    public function attachBenefit(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $tier = $this->tier($id);
        $data = Validator::make($request->all(), [
            'benefit_id'   => ['required', 'integer', OwnRows::rule('benefit_definitions')],
            'value'        => 'nullable|string|max:255',
            'value_type'   => ['nullable', 'string', Rule::in(DiscountService::VALUE_TYPES)],
            'value_amount' => 'nullable|numeric|min:0|max:1000000',
            'applies_to'   => ['nullable', Rule::in(LoyaltyForms::appliesTo())],
        ])->after(function (FormValidator $v) use ($request) {
            // A percentage above 100 would hand money back; a multiplier below 1 would punish the member for
            // holding the tier.
            $type = $request->input('value_type');
            $amount = (float) $request->input('value_amount', 0);
            if ($type === DiscountService::PERCENT && $amount > 100) {
                $v->errors()->add('value_amount', 'A percentage discount cannot exceed 100%.');
            }
            if ($type === DiscountService::MULTIPLIER && $amount < 1) {
                $v->errors()->add('value_amount', 'A points multiplier must be at least 1.');
            }
        })->validate();

        $tb = TierBenefit::firstOrNew(['tier_id' => $tier->id, 'benefit_id' => (int) $data['benefit_id'], 'property_id' => null]);
        $old = $tb->exists ? $tb->only(['value', 'value_type', 'value_amount', 'applies_to', 'is_active']) : [];
        $tb->fill(['value' => $data['value'] ?? $tb->value, 'is_active' => true]);
        if ($request->has('value_type')) {
            $tb->value_type = $data['value_type'] ?: DiscountService::TEXT;
            $tb->value_amount = $tb->value_type === DiscountService::TEXT ? null : ($data['value_amount'] ?? null);
        }
        if ($request->has('applies_to')) {
            $tb->applies_to = $data['applies_to'] ?: 'all';
        }
        $tb->value_type ??= DiscountService::TEXT;
        $tb->applies_to ??= 'all';
        $tb->save();
        $tb->load('benefit');

        AuditLog::record('tier_benefit_assigned', $tb, $tb->only(['value', 'value_type', 'value_amount', 'applies_to', 'is_active']), $old,
            $request->user(), "Benefit '{$tb->benefit?->name}' given to tier '{$tier->name}'");

        return response()->json(['tier_benefit' => self::tierBenefitRow($tb)]);
    }

    /** Take a benefit off a tier: switched off, as the full admin does, so the members' history keeps its name. */
    public function detachBenefit(Request $request, int $id, int $tierBenefit): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $tier = $this->tier($id);
        $tb = TierBenefit::query()->with('benefit')->where('tier_id', $tier->id)->find($tierBenefit) ?? throw LoyaltyRefused::notFound();

        $tb->update(['is_active' => false]);

        AuditLog::record('tier_benefit_removed', $tb, ['is_active' => false], ['is_active' => true],
            $request->user(), "Benefit '{$tb->benefit?->name}' taken off tier '{$tier->name}'");

        return response()->json(['ok' => true]);
    }

    // ─── The benefit catalogue ──────────────────────────────────────────────

    public function storeBenefit(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $data = $request->validate([
            'name'             => 'required|string|max:255',
            // Unique within the organisation, as the database's (organization_id, code) index; another
            // organisation's codes are none of this one's business.
            'code'             => ['required', 'string', 'max:50', Rule::unique('benefit_definitions', 'code')->where('organization_id', (int) app('current_organization_id'))],
            'category'         => ['required', Rule::in(LoyaltyForms::BENEFIT_CATEGORIES)],
            'fulfillment_mode' => ['required', Rule::in(LoyaltyForms::FULFILLMENT_MODES)],
            'description'      => 'nullable|string',
        ]);

        $benefit = BenefitDefinition::create($data);

        AuditLog::record('benefit_created', $benefit, $data, [], $request->user(), "Benefit '{$benefit->name}' created");

        return response()->json(['benefit' => self::benefitRow($benefit->fresh())], 201);
    }

    /** The code stays as it was made, as in the full admin: presets find their benefits by it. */
    public function updateBenefit(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $benefit = BenefitDefinition::query()->find($id) ?? throw LoyaltyRefused::notFound();
        $data = $request->validate([
            'name'             => 'sometimes|required|string|max:255',
            'category'         => ['sometimes', Rule::in(LoyaltyForms::BENEFIT_CATEGORIES)],
            'fulfillment_mode' => ['sometimes', Rule::in(LoyaltyForms::FULFILLMENT_MODES)],
            'description'      => 'sometimes|nullable|string',
            'is_active'        => 'sometimes|boolean',
        ]);

        $old = $benefit->only(array_keys($data));
        $benefit->update($data);

        AuditLog::record('benefit_updated', $benefit, $data, $old, $request->user(), "Benefit '{$benefit->name}' updated");

        return response()->json(['benefit' => self::benefitRow($benefit->fresh())]);
    }

    // ─── Boost events ───────────────────────────────────────────────────────

    /** A new boost may name its brand (release 4, `brand`): one of the options' brands; none, the model's hook picks it as before. */
    public function storeBoost(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $event = EarnRateEvent::create($this->boostValues($request));

        AuditLog::record('earn_rate_event_created', $event, $event->toArray(), [],
            $request->user(), "Earn-rate event '{$event->name}' created ({$event->multiplier}x)");

        return response()->json(['boost' => self::boostRow($event->fresh(), VenueClock::isNamed((int) app('current_organization_id')))], 201);
    }

    public function updateBoost(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $event = $this->boost($id);
        $old = $event->toArray();
        $event->update($this->boostValues($request));

        AuditLog::record('earn_rate_event_updated', $event, $event->toArray(), $old,
            $request->user(), "Earn-rate event '{$event->name}' updated");

        return response()->json(['boost' => self::boostRow($event->fresh(), VenueClock::isNamed((int) app('current_organization_id')))]);
    }

    public function destroyBoost(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $event = $this->boost($id);
        $name = $event->name;
        $event->delete();

        AuditLog::record('earn_rate_event_deleted', null, ['id' => $id, 'name' => $name], [],
            $request->user(), "Earn-rate event '{$name}' deleted");

        return response()->json(['ok' => true]);
    }

    /**
     * EarnRateEventController's payload, without the property (the workspace has no property choice): a whole
     * event, on create and on change alike. The start and end are read as LoyaltyForms::instant() says, and the end
     * is compared with the start as the instants they are. Every save marks the times as the venue's
     * (`times_venue_at`, R4-6), as the full admin's save now does too. The brand is one of the options' brands, on
     * create and, since release 6, on change too (absent: a new boost goes where the model's hook puts it, a saved one
     * keeps its own).
     *
     * @return array<string, mixed>
     */
    private function boostValues(Request $request): array
    {
        $orgId = (int) app('current_organization_id');
        $data = Validator::make($request->all(), [
            'name'           => 'required|string|max:120',
            'description'    => 'nullable|string|max:500',
            'multiplier'     => 'required|numeric|min:1|max:10',
            'starts_at'      => 'required|date',
            'ends_at'        => 'required|date',
            'days_of_week'   => 'sometimes|nullable|array',
            'days_of_week.*' => 'integer|min:0|max:6',
            'tier_ids'       => 'sometimes|nullable|array',
            'tier_ids.*'     => ['integer', OwnRows::rule('loyalty_tiers')],
            'is_active'      => 'sometimes|boolean',
            'brand'          => LoyaltyForms::brandRule($request->user(), $orgId),
        ])->after(function (FormValidator $v) use ($request, $orgId) {
            if ($v->errors()->hasAny(['starts_at', 'ends_at'])) {
                return;
            }
            if (LoyaltyForms::instant((string) $request->input('ends_at'), $orgId)->lte(LoyaltyForms::instant((string) $request->input('starts_at'), $orgId))) {
                $v->errors()->add('ends_at', 'The end must be after the start.');
            }
        })->validate();

        $data['starts_at'] = LoyaltyForms::instant($data['starts_at'], $orgId);
        $data['ends_at'] = LoyaltyForms::instant($data['ends_at'], $orgId);
        $data['times_venue_at'] = now();
        $data = LoyaltyForms::withBrand($data);
        foreach (['days_of_week', 'tier_ids'] as $list) {
            if (array_key_exists($list, $data)) {
                $data[$list] = LoyaltyForms::ints($data[$list]);
            }
        }

        return $data;
    }

    // ─── Shapes ─────────────────────────────────────────────────────────────

    /** @return array<string, mixed> */
    private function tierPayload(LoyaltyTier $tier): array
    {
        return self::tierRow(
            $tier,
            LoyaltyMember::query()->where('tier_id', $tier->id)->where('is_active', true)->count(),
            $this->tierBenefits()->where('tier_id', $tier->id)->get(),
        );
    }

    /**
     * @param Collection<int, TierBenefit> $benefits
     * @return array<string, mixed>
     */
    private static function tierRow(LoyaltyTier $t, int $members, Collection $benefits): array
    {
        return [
            'id'          => (int) $t->id,
            'name'        => (string) $t->name,
            'description' => $t->description,
            'color'       => $t->color_hex,
            'min_points'  => (int) $t->min_points,
            'min_nights'  => $t->min_nights !== null ? (int) $t->min_nights : null,
            'min_stays'   => $t->min_stays !== null ? (int) $t->min_stays : null,
            'min_spend'   => $t->min_spend !== null ? (float) $t->min_spend : null,
            'earn_rate'   => (float) $t->earn_rate,
            'is_active'   => (bool) $t->is_active,
            'sort_order'  => (int) $t->sort_order,
            'members'     => $members,
            'benefits'    => $benefits->map(fn (TierBenefit $tb) => self::tierBenefitRow($tb))->values()->all(),
        ];
    }

    /** @return array<string, mixed> */
    private static function tierBenefitRow(TierBenefit $tb): array
    {
        return [
            'id'           => (int) $tb->id,
            'benefit_id'   => (int) $tb->benefit_id,
            'name'         => (string) ($tb->benefit?->name ?? ''),
            'category'     => $tb->benefit?->category,
            'value'        => $tb->value,
            'value_type'   => (string) ($tb->value_type ?? DiscountService::TEXT),
            'value_amount' => $tb->value_amount !== null ? (float) $tb->value_amount : null,
            'applies_to'   => (string) ($tb->applies_to ?? 'all'),
        ];
    }

    /** @return array<string, mixed> */
    private static function benefitRow(BenefitDefinition $b): array
    {
        return [
            'id'               => (int) $b->id,
            'name'             => (string) $b->name,
            'code'             => $b->code,
            'description'      => $b->description,
            'category'         => $b->category,
            'fulfillment_mode' => $b->fulfillment_mode,
            'is_active'        => (bool) $b->is_active,
            'sort_order'       => (int) $b->sort_order,
        ];
    }

    /**
     * A boost as Program shows it. `check_time` (R4-6): its times were last saved before every save read a time
     * without an offset as the venue's wall clock (no `times_venue_at`), at a venue whose clock is not UTC — the full
     * admin then stored 18:00 as 18:00 UTC, which is 21:00 in Riga. At a venue on UTC that read the same, so nothing
     * needs checking there. Saving the boost from either admin clears it.
     *
     * @return array<string, mixed>
     */
    private static function boostRow(EarnRateEvent $e, bool $namedZone): array
    {
        return [
            'id'           => (int) $e->id,
            'brand_id'     => $e->brand_id !== null ? (int) $e->brand_id : null,
            'name'         => (string) $e->name,
            'description'  => $e->description,
            'multiplier'   => (float) $e->multiplier,
            'starts_at'    => $e->starts_at?->toIso8601String(),
            'ends_at'      => $e->ends_at?->toIso8601String(),
            'days_of_week' => LoyaltyForms::ints($e->days_of_week),
            'tier_ids'     => LoyaltyForms::ints($e->tier_ids),
            'is_active'    => (bool) $e->is_active,
            'state'        => self::boostState($e),
            'check_time'   => $namedZone && $e->times_venue_at === null,
        ];
    }

    /** Off when switched off; otherwise where now falls against its instants (as EarnRateEventController's buckets). */
    private static function boostState(EarnRateEvent $e): string
    {
        $now = now();

        return match (true) {
            !$e->is_active                                    => 'off',
            $e->ends_at !== null && $e->ends_at->lt($now)     => 'ended',
            $e->starts_at !== null && $e->starts_at->gt($now) => 'upcoming',
            default                                           => 'live',
        };
    }

    /** @return array<string, mixed> The tier's columns from the form's fields (`color` is stored as `color_hex`). */
    private static function tierColumns(array $data): array
    {
        if (array_key_exists('color', $data)) {
            $data['color_hex'] = $data['color'];
            unset($data['color']);
        }

        return $data;
    }

    /**
     * The tiers' active benefits whose definition is this organisation's (both tenant-scoped), in the order given.
     *
     * @return Builder<TierBenefit>
     */
    private function tierBenefits(): Builder
    {
        return TierBenefit::query()->where('is_active', true)->whereHas('benefit')->with('benefit')->orderBy('id');
    }

    private function tier(int $id): LoyaltyTier
    {
        return LoyaltyTier::query()->find($id) ?? throw LoyaltyRefused::notFound();
    }

    private function boost(int $id): EarnRateEvent
    {
        return EarnRateEvent::query()->find($id) ?? throw LoyaltyRefused::notFound();
    }
}
