<?php

namespace App\Services;

use App\Models\CrmSetting;
use App\Models\CustomField;
use App\Models\Inquiry;
use App\Models\InquiryLostReason;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * One-click industry setup. CRM Phase 9.
 *
 * Bundles the four pieces an industry needs into a single preset:
 *   1. Pipeline name + stage list (with kinds + colors + win-prob defaults)
 *   2. Lost-reason taxonomy
 *   3. Inquiry form + leads list field-visibility config
 *   4. Custom-fields starter set (delegated to CustomFieldService::applyPreset)
 *
 * Applying a preset is destructive on the schema (replaces stages + lost
 * reasons + layout) but PRESERVES data:
 *
 *   • Existing inquiries get reassigned to the new pipeline's stage of
 *     the same `kind` (open/won/lost). If no kind match, fallback to the
 *     first open stage. Saved `custom_data` is untouched.
 *   • Lost reasons that have historical inquiries attached are soft-
 *     deactivated (is_active=false) instead of hard-deleted, so the
 *     funnel report keeps its labels for past leads.
 *   • Custom fields are added idempotently — keys that already exist
 *     are skipped.
 *
 * Atomic: wrapped in a DB transaction so a partial-apply never leaves
 * the org with mismatched stages and lost-reasons.
 */
class IndustryPresetService
{
    public function __construct(protected CustomFieldService $customFields) {}

    /**
     * @return array{presets:array,current:?string}  metadata for the picker UI.
     */
    public function listPresets(): array
    {
        $current = optional(CrmSetting::where('key', 'industry_preset')->first())->value;
        $current = is_string($current) ? trim($current, '"') : null;

        $presets = [];
        foreach (self::PRESETS as $key => $p) {
            $presets[] = [
                'key'           => $key,
                'label'         => $p['label'],
                'description'   => $p['description'],
                'icon'          => $p['icon'],
                'pipeline_name' => $p['pipeline']['name'],
                'stage_count'   => count($p['pipeline']['stages']),
                'reason_count'  => count($p['lost_reasons']),
                'field_count'   => $this->countCustomFields($p['custom_fields_key'] ?? null),
                'is_current'    => $current === $key,
            ];
        }

        return [
            'presets' => $presets,
            'current' => $current,
        ];
    }

    /**
     * Apply an industry preset. Throws \InvalidArgumentException for
     * unknown keys. Returns a summary of what changed for the toast.
     *
     * @return array{stages_replaced:int,reasons_set:int,fields_added:int,fields_deactivated:int,layout_updated:bool}
     */
    public function apply(string $key): array
    {
        $preset = self::PRESETS[$key] ?? null;
        if (!$preset) {
            throw new \InvalidArgumentException("Unknown industry preset '{$key}'.");
        }

        // Read the previously-applied preset so we can clean up fields
        // it added that the new preset doesn't want. Manually-added
        // fields stay untouched — only fields whose key matches an OLD
        // preset's seed are candidates for deactivation.
        $previousKey = optional(CrmSetting::where('key', 'industry_preset')->first())->value;
        $previousKey = is_string($previousKey) ? trim($previousKey, '"') : null;

        $summary = [
            'stages_replaced'     => 0,
            'reasons_set'         => 0,
            'fields_added'        => 0,
            'fields_deactivated'  => 0,
            'layout_updated'      => false,
        ];

        DB::transaction(function () use ($preset, $previousKey, $key, &$summary) {
            // ── 1. Pipeline + stages ────────────────────────────────
            $summary['stages_replaced'] = $this->replaceDefaultPipelineStages(
                $preset['pipeline']
            );

            // ── 2. Lost reasons ─────────────────────────────────────
            $summary['reasons_set'] = $this->replaceLostReasons($preset['lost_reasons']);

            // ── 3. Layout config (which built-in fields to show) ────
            CrmSetting::updateOrCreate(
                ['key' => 'inquiry_fields'],
                ['value' => $preset['layout']],
            );
            $summary['layout_updated'] = true;

            // ── 4. Track which preset is active so we can clean up
            //     the previous preset's fields next time the admin
            //     switches industries.
            CrmSetting::updateOrCreate(
                ['key' => 'industry_preset'],
                ['value' => $key],
            );
        });

        // ── 5. Custom fields. Three cases:
        //
        //   (a) Switching from preset A to preset B → deactivate fields
        //       whose key was seeded by A but not by B. Admin's
        //       manual fields stay active.
        //   (b) First apply ever or no previous preset → just add.
        //   (c) Re-applying same preset → idempotent, nothing changes.
        //
        // applyPreset() itself is idempotent (skips existing keys), so
        // we don't risk duplicates either way.
        if ($previousKey && $previousKey !== $key) {
            $summary['fields_deactivated'] = $this->deactivateOldPresetFields($previousKey, $key);
        }

        if (!empty($preset['custom_fields_key'])) {
            $created = $this->customFields->applyPreset($preset['custom_fields_key']);
            $summary['fields_added'] = count($created);

            // Also re-activate any matching keys that were soft-deactivated
            // from a previous switch. Common case: admin tries Beauty,
            // switches to Medical, switches back — beauty fields they
            // already entered data into shouldn't be lost.
            $newKeys = $this->keysFromPreset($key);
            CustomField::where('is_active', false)
                ->whereIn('key', array_merge(...array_values($newKeys)))
                ->get()
                ->each(function (CustomField $f) use ($newKeys) {
                    if (in_array($f->key, $newKeys[$f->entity] ?? [], true)) {
                        $f->forceFill(['is_active' => true])->save();
                    }
                });
        }

        return $summary;
    }

    /**
     * Soft-deactivate custom fields that the OLD preset added but the
     * NEW preset doesn't. Saved values on entity rows stay intact —
     * the field is just hidden. If the admin switches back, they
     * resurrect.
     */
    private function deactivateOldPresetFields(string $oldKey, string $newKey): int
    {
        $oldKeys = $this->keysFromPreset($oldKey);
        $newKeys = $this->keysFromPreset($newKey);
        if (!$oldKeys) return 0;

        $touched = 0;
        foreach ($oldKeys as $entity => $keys) {
            $newSet = $newKeys[$entity] ?? [];
            $toDeactivate = array_values(array_diff($keys, $newSet));
            if (empty($toDeactivate)) continue;

            $touched += CustomField::where('entity', $entity)
                ->whereIn('key', $toDeactivate)
                ->where('is_active', true)
                ->update(['is_active' => false]);
        }
        return $touched;
    }

    /**
     * Map a preset key → { entity: [field_keys] } from the
     * CustomFieldService::PRESETS data, used to compute the diff
     * between the old and new preset.
     */
    private function keysFromPreset(string $presetKey): array
    {
        $preset = self::PRESETS[$presetKey] ?? null;
        if (!$preset) return [];
        $cfKey = $preset['custom_fields_key'] ?? null;
        if (!$cfKey) return [];

        $defs = CustomFieldService::PRESETS[$cfKey] ?? [];
        $out = [];
        foreach ($defs as $entity => $fields) {
            $out[$entity] = array_values(array_filter(array_map(
                fn ($f) => $f['key'] ?? null,
                $fields,
            )));
        }
        return $out;
    }

    /**
     * Replace the org's default pipeline name + stage list. Existing
     * inquiries are migrated to the closest-matching new stage by
     * `kind`. Returns the number of new stages seeded.
     */
    private function replaceDefaultPipelineStages(array $pipelineDef): int
    {
        $pipeline = Pipeline::where('is_default', true)->first();

        // No default pipeline exists yet (fresh org). Create one.
        if (!$pipeline) {
            $pipeline = Pipeline::create([
                'name'        => $pipelineDef['name'],
                'slug'        => Str::slug($pipelineDef['name']) . '-' . Str::random(4),
                'description' => $pipelineDef['description'] ?? null,
                'is_default'  => true,
                'sort_order'  => 0,
            ]);
        } else {
            $pipeline->forceFill([
                'name'        => $pipelineDef['name'],
                'description' => $pipelineDef['description'] ?? $pipeline->description,
            ])->save();
        }

        // Capture the old stages BEFORE we add new ones so we can map
        // existing inquiries off them cleanly.
        $oldStages = PipelineStage::where('pipeline_id', $pipeline->id)->get();

        // Seed new stages first (negative sort_order temporarily so they
        // don't collide with existing stages on the unique-ish ordering).
        $newStages = collect();
        foreach ($pipelineDef['stages'] as $i => $s) {
            $newStages->push(PipelineStage::create([
                'pipeline_id'             => $pipeline->id,
                'name'                    => $s['name'],
                'slug'                    => Str::slug($s['name']) . '-' . Str::random(4),
                'kind'                    => $s['kind'],
                'color'                   => $s['color'],
                'default_win_probability' => $s['default_win_probability'] ?? null,
                'sort_order'              => 1000 + $i, // temp high so they sort after
            ]));
        }

        // Build a kind → first new stage map for migration.
        $byKind = [];
        foreach ($newStages as $ns) {
            $byKind[$ns->kind] ??= $ns;
        }
        $fallback = $byKind['open'] ?? $newStages->first();

        // Reassign inquiries off the old stages. Match by kind first,
        // fallback to first open. Status text mirrors the new stage name
        // so the legacy `inquiries.status` column stays in sync.
        foreach ($oldStages as $old) {
            $target = $byKind[$old->kind] ?? $fallback;
            Inquiry::where('pipeline_stage_id', $old->id)
                ->update([
                    'pipeline_stage_id' => $target->id,
                    'status'            => $target->name,
                ]);
        }

        // Drop the old stages now that nothing references them.
        if ($oldStages->isNotEmpty()) {
            PipelineStage::whereIn('id', $oldStages->pluck('id'))->delete();
        }

        // Reset sort_order on the new stages to 0..N-1 now that the old
        // ones are gone.
        foreach ($newStages as $i => $ns) {
            $ns->update(['sort_order' => $i]);
        }

        return $newStages->count();
    }

    /**
     * Replace the lost-reason taxonomy. Reasons with usage are soft-
     * deactivated (kept around so the funnel report retains their
     * labels for historical leads); unused reasons get hard-deleted.
     * New reasons are then created in the listed order.
     */
    private function replaceLostReasons(array $labels): int
    {
        // Soft-deactivate or hard-delete existing reasons.
        InquiryLostReason::all()->each(function (InquiryLostReason $r) {
            if ($r->inquiries()->exists()) {
                $r->forceFill(['is_active' => false])->save();
            } else {
                $r->delete();
            }
        });

        // Create the new set in display order. The dedup MUST stay
        // inside the tenant scope — looking across orgs would let an
        // industry-preset reactivate a row from a different
        // organization. The TenantScope global scope handles that for
        // us; we just don't strip it here.
        foreach ($labels as $i => $label) {
            $existing = InquiryLostReason::where('label', $label)->first();
            if ($existing) {
                $existing->forceFill([
                    'is_active'  => true,
                    'sort_order' => $i,
                ])->save();
                continue;
            }
            InquiryLostReason::create([
                'label'      => $label,
                'slug'       => Str::slug($label) . '-' . Str::random(4),
                'sort_order' => $i,
                'is_active'  => true,
            ]);
        }

        return count($labels);
    }

    private function countCustomFields(?string $cfKey): int
    {
        if (!$cfKey) return 0;
        $defs = CustomFieldService::PRESETS[$cfKey] ?? [];
        $n = 0;
        foreach ($defs as $entityFields) $n += count($entityFields);
        return $n;
    }

    /* ─── Preset definitions ──────────────────────────────────── */

    /**
     * Built-in form fields shown by the Hotel default. Reused by any
     * industry that books a stay (real estate viewings hide most of
     * these but keep dates).
     */
    private const HOTEL_LAYOUT = [
        'form' => [
            'check_in' => true, 'check_out' => true, 'num_rooms' => true,
            'inquiry_type' => true, 'source' => true, 'room_type' => true,
            'rate_offered' => true, 'total_value' => true,
            'status' => true, 'priority' => true, 'assigned_to' => true,
            'special_requests' => true, 'notes' => true,
        ],
        'list' => [
            'stay' => true, 'value' => true, 'owner' => true,
            'touches' => true, 'next_task' => true, 'bulk_select' => false,
        ],
    ];

    /**
     * Service-only layout — hides every stay-specific field. Used by
     * Beauty, Medical, Legal, Education, Fitness which don't book
     * rooms. Keeps total_value (bill amount) and inquiry_type
     * (service category).
     */
    private const SERVICE_LAYOUT = [
        'form' => [
            'check_in' => false, 'check_out' => false, 'num_rooms' => false,
            'inquiry_type' => true, 'source' => true, 'room_type' => false,
            'rate_offered' => true, 'total_value' => true,
            'status' => true, 'priority' => true, 'assigned_to' => true,
            'special_requests' => true, 'notes' => true,
        ],
        'list' => [
            'stay' => false, 'value' => true, 'owner' => true,
            'touches' => true, 'next_task' => true, 'bulk_select' => false,
        ],
    ];

    /**
     * Eight curated industry bundles. Each preset is opinionated —
     * the shapes (stage count, lost-reason taxonomy, layout) reflect
     * how that industry's sales / intake actually flows, not just a
     * find-and-replace of names.
     */
    public const PRESETS = [
        'hotel' => [
            'label'       => 'Hotel',
            'description' => 'Stay reservations + group sales. Restores the original 8-stage hotel flow with stay-specific form fields.',
            'icon'        => 'building-2',
            'pipeline'    => [
                'name'        => 'Sales',
                'description' => 'Default sales pipeline for hotel bookings + group sales.',
                'stages'      => [
                    ['name' => 'New',           'kind' => 'open', 'color' => '#3b82f6', 'default_win_probability' => 10],
                    ['name' => 'Responded',     'kind' => 'open', 'color' => '#6366f1', 'default_win_probability' => 25],
                    ['name' => 'Site Visit',    'kind' => 'open', 'color' => '#a855f7', 'default_win_probability' => 40],
                    ['name' => 'Proposal Sent', 'kind' => 'open', 'color' => '#eab308', 'default_win_probability' => 55],
                    ['name' => 'Negotiating',   'kind' => 'open', 'color' => '#f59e0b', 'default_win_probability' => 70],
                    ['name' => 'Tentative',     'kind' => 'open', 'color' => '#fb923c', 'default_win_probability' => 90],
                    ['name' => 'Confirmed',     'kind' => 'won',  'color' => '#22c55e', 'default_win_probability' => 100],
                    ['name' => 'Lost',          'kind' => 'lost', 'color' => '#ef4444', 'default_win_probability' => 0],
                ],
            ],
            'lost_reasons' => [
                'Price', 'Unavailable for those dates', 'Went elsewhere',
                'No response from guest', 'Disqualified', 'Other',
            ],
            'layout'             => self::HOTEL_LAYOUT,
            'custom_fields_key'  => null, // hotel uses built-in fields
        ],

        'beauty' => [
            'label'       => 'Beauty / Spa',
            'description' => 'Treatments, services + bookings. Six-stage flow tuned for spas; service-only form (no check-in dates).',
            'icon'        => 'sparkles',
            'pipeline'    => [
                'name'        => 'Bookings',
                'description' => 'Spa booking + service inquiry pipeline.',
                'stages'      => [
                    ['name' => 'Inquiry',      'kind' => 'open', 'color' => '#3b82f6', 'default_win_probability' => 30],
                    ['name' => 'Consultation', 'kind' => 'open', 'color' => '#a855f7', 'default_win_probability' => 50],
                    ['name' => 'Booked',       'kind' => 'open', 'color' => '#f59e0b', 'default_win_probability' => 80],
                    ['name' => 'Completed',    'kind' => 'won',  'color' => '#22c55e', 'default_win_probability' => 100],
                    ['name' => 'No-show',      'kind' => 'lost', 'color' => '#ef4444', 'default_win_probability' => 0],
                    ['name' => 'Cancelled',    'kind' => 'lost', 'color' => '#71717a', 'default_win_probability' => 0],
                ],
            ],
            'lost_reasons' => [
                'Therapist unavailable', 'Price', 'Allergies / conditions',
                'Found another provider', 'No response', 'Cancelled by guest', 'Other',
            ],
            'layout'             => self::SERVICE_LAYOUT,
            'custom_fields_key'  => 'beauty',
        ],

        'medical' => [
            'label'       => 'Medical / Healthcare',
            'description' => 'Patient intake + appointments. Privacy-aware fields (DOB, insurance, allergies). Service-only form.',
            'icon'        => 'stethoscope',
            'pipeline'    => [
                'name'        => 'Patient pipeline',
                'description' => 'Patient intake + appointment lifecycle.',
                'stages'      => [
                    ['name' => 'New patient',     'kind' => 'open', 'color' => '#3b82f6', 'default_win_probability' => 25],
                    ['name' => 'Triage',          'kind' => 'open', 'color' => '#a855f7', 'default_win_probability' => 45],
                    ['name' => 'Consultation',    'kind' => 'open', 'color' => '#f59e0b', 'default_win_probability' => 70],
                    ['name' => 'In treatment',    'kind' => 'open', 'color' => '#fb923c', 'default_win_probability' => 90],
                    ['name' => 'Discharged',      'kind' => 'won',  'color' => '#22c55e', 'default_win_probability' => 100],
                    ['name' => 'Did not return',  'kind' => 'lost', 'color' => '#ef4444', 'default_win_probability' => 0],
                ],
            ],
            'lost_reasons' => [
                'Insurance issue', 'Did not return', 'Wrong specialty',
                'Patient declined', 'Out of area', 'Referred elsewhere', 'Other',
            ],
            'layout'             => self::SERVICE_LAYOUT,
            'custom_fields_key'  => 'medical',
        ],

        'legal' => [
            'label'       => 'Legal / Law firm',
            'description' => 'Matter intake → engagement → close. Conflict-check, retainer, fee arrangement fields.',
            'icon'        => 'scale',
            'pipeline'    => [
                'name'        => 'Matters',
                'description' => 'Matter intake + engagement lifecycle.',
                'stages'      => [
                    ['name' => 'New matter',     'kind' => 'open', 'color' => '#3b82f6', 'default_win_probability' => 20],
                    ['name' => 'Conflict check', 'kind' => 'open', 'color' => '#a855f7', 'default_win_probability' => 35],
                    ['name' => 'Consultation',   'kind' => 'open', 'color' => '#eab308', 'default_win_probability' => 55],
                    ['name' => 'Retainer sent',  'kind' => 'open', 'color' => '#f59e0b', 'default_win_probability' => 75],
                    ['name' => 'Engaged',        'kind' => 'won',  'color' => '#22c55e', 'default_win_probability' => 100],
                    ['name' => 'Declined',       'kind' => 'lost', 'color' => '#ef4444', 'default_win_probability' => 0],
                ],
            ],
            'lost_reasons' => [
                'Conflict of interest', 'Out of scope', 'Engaged other counsel',
                'Cost', 'Could not assist', 'Pro-se / DIY', 'Other',
            ],
            'layout'             => self::SERVICE_LAYOUT,
            'custom_fields_key'  => 'legal',
        ],

        'real_estate' => [
            'label'       => 'Real estate',
            'description' => 'Buyer / seller pipeline. Viewing → offer → close. Budget + property-type fields, dates kept (viewing date).',
            'icon'        => 'home',
            'pipeline'    => [
                'name'        => 'Property pipeline',
                'description' => 'Buyer / seller lead lifecycle.',
                'stages'      => [
                    ['name' => 'New lead',         'kind' => 'open', 'color' => '#3b82f6', 'default_win_probability' => 20],
                    ['name' => 'Qualified',        'kind' => 'open', 'color' => '#6366f1', 'default_win_probability' => 35],
                    ['name' => 'Viewing scheduled','kind' => 'open', 'color' => '#a855f7', 'default_win_probability' => 50],
                    ['name' => 'Offer made',       'kind' => 'open', 'color' => '#f59e0b', 'default_win_probability' => 75],
                    ['name' => 'Under contract',   'kind' => 'open', 'color' => '#fb923c', 'default_win_probability' => 90],
                    ['name' => 'Closed',           'kind' => 'won',  'color' => '#22c55e', 'default_win_probability' => 100],
                    ['name' => 'Lost',             'kind' => 'lost', 'color' => '#ef4444', 'default_win_probability' => 0],
                ],
            ],
            'lost_reasons' => [
                'Found another property', 'Financing fell through', 'Lost interest',
                'Out of budget', 'Lost to competitor', 'Inspection issues', 'Other',
            ],
            // Real estate keeps dates (viewing date) but hides rooms/room-type.
            'layout' => [
                'form' => [
                    'check_in' => true, 'check_out' => false, 'num_rooms' => false,
                    'inquiry_type' => true, 'source' => true, 'room_type' => false,
                    'rate_offered' => true, 'total_value' => true,
                    'status' => true, 'priority' => true, 'assigned_to' => true,
                    'special_requests' => true, 'notes' => true,
                ],
                'list' => [
                    'stay' => true, 'value' => true, 'owner' => true,
                    'touches' => true, 'next_task' => true, 'bulk_select' => false,
                ],
            ],
            'custom_fields_key'  => 'real_estate',
        ],

        'education' => [
            'label'       => 'Education / Tutoring',
            'description' => 'Inquiry → trial → enrolment. Program / format / level fields, parent contact.',
            'icon'        => 'graduation-cap',
            'pipeline'    => [
                'name'        => 'Enrolment',
                'description' => 'Student / parent enquiry lifecycle.',
                'stages'      => [
                    ['name' => 'Inquiry',          'kind' => 'open', 'color' => '#3b82f6', 'default_win_probability' => 25],
                    ['name' => 'Trial scheduled',  'kind' => 'open', 'color' => '#a855f7', 'default_win_probability' => 50],
                    ['name' => 'Trial done',       'kind' => 'open', 'color' => '#f59e0b', 'default_win_probability' => 70],
                    ['name' => 'Enrolled',         'kind' => 'won',  'color' => '#22c55e', 'default_win_probability' => 100],
                    ['name' => 'Did not enrol',    'kind' => 'lost', 'color' => '#ef4444', 'default_win_probability' => 0],
                ],
            ],
            'lost_reasons' => [
                'Cost', 'Schedule conflict', 'Wrong fit', 'Found alternative',
                'No response', 'Distance / location', 'Other',
            ],
            'layout'             => self::SERVICE_LAYOUT,
            'custom_fields_key'  => 'education',
        ],

        'fitness' => [
            'label'       => 'Fitness / Wellness',
            'description' => 'Trial → membership. Goal, experience level, injuries, preferred trainer.',
            'icon'        => 'dumbbell',
            'pipeline'    => [
                'name'        => 'Membership',
                'description' => 'Trial-to-membership lifecycle.',
                'stages'      => [
                    ['name' => 'Trial requested',    'kind' => 'open', 'color' => '#3b82f6', 'default_win_probability' => 25],
                    ['name' => 'Trial done',         'kind' => 'open', 'color' => '#a855f7', 'default_win_probability' => 50],
                    ['name' => 'Membership offered', 'kind' => 'open', 'color' => '#f59e0b', 'default_win_probability' => 75],
                    ['name' => 'Active member',      'kind' => 'won',  'color' => '#22c55e', 'default_win_probability' => 100],
                    ['name' => 'Did not join',       'kind' => 'lost', 'color' => '#ef4444', 'default_win_probability' => 0],
                ],
            ],
            'lost_reasons' => [
                'Cost', 'Schedule', 'Location', 'Found another gym',
                'No response', 'Injury / health', 'Other',
            ],
            'layout'             => self::SERVICE_LAYOUT,
            'custom_fields_key'  => 'fitness',
        ],

        'restaurant' => [
            'label'       => 'Restaurant',
            'description' => 'Reservation requests, dietary preferences, occasion fields. Service-only form.',
            'icon'        => 'utensils',
            'pipeline'    => [
                'name'        => 'Reservations',
                'description' => 'Reservation request lifecycle.',
                'stages'      => [
                    ['name' => 'Requested',  'kind' => 'open', 'color' => '#3b82f6', 'default_win_probability' => 60],
                    ['name' => 'Confirmed',  'kind' => 'open', 'color' => '#f59e0b', 'default_win_probability' => 90],
                    ['name' => 'Seated',     'kind' => 'won',  'color' => '#22c55e', 'default_win_probability' => 100],
                    ['name' => 'No-show',    'kind' => 'lost', 'color' => '#ef4444', 'default_win_probability' => 0],
                    ['name' => 'Cancelled',  'kind' => 'lost', 'color' => '#71717a', 'default_win_probability' => 0],
                ],
            ],
            'lost_reasons' => [
                'No availability', 'Cancelled by guest', 'No-show',
                'Found another venue', 'Wrong cuisine / fit', 'Other',
            ],
            'layout'             => self::SERVICE_LAYOUT,
            'custom_fields_key'  => 'restaurant',
        ],
    ];
}
