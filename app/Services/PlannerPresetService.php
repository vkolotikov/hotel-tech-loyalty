<?php

namespace App\Services;

use App\Models\CrmSetting;
use App\Models\PlannerTemplate;
use Illuminate\Support\Facades\DB;

/**
 * One-click industry setup for the Planner — mirror of
 * IndustryPresetService but scoped to the daily-tasks side of the
 * product. CRM Phase 9 reshaped the sales pipeline; this reshapes:
 *
 *   1. Task groups (the icon-tab row in Schedule / Day / Month views)
 *   2. Task templates (the one-click "use a template" library inside
 *      the New Task drawer + side panel)
 *
 * Applying a preset is data-safe:
 *   • planner_groups is a CrmSetting value — overwritten on apply.
 *     Tasks already assigned to a group whose name disappears keep
 *     their `task_group` string (they just stop showing in any group
 *     tab; admin can reassign or re-add the group).
 *   • Templates are seeded idempotently — we skip rows whose `name`
 *     already exists for the org so re-applying the preset doesn't
 *     duplicate. Custom templates the admin added stay intact.
 *
 * Atomic: wrapped in a DB transaction so a partial-apply never
 * leaves the org with new groups but no templates (or vice-versa).
 */
class PlannerPresetService
{
    /**
     * @return array{presets:array,current:?string}
     */
    public function listPresets(): array
    {
        $current = optional(CrmSetting::where('key', 'planner_preset')->first())->value;
        $current = is_string($current) ? trim($current, '"') : null;

        $presets = [];
        foreach (self::PRESETS as $key => $p) {
            $presets[] = [
                'key'            => $key,
                'label'          => $p['label'],
                'description'    => $p['description'],
                'icon'           => $p['icon'],
                'group_count'    => count($p['groups']),
                'template_count' => count($p['templates']),
                'groups'         => $p['groups'],
                'is_current'     => $current === $key,
            ];
        }

        return [
            'presets' => $presets,
            'current' => $current,
        ];
    }

    /**
     * Apply a planner preset. Returns summary for the toast.
     *
     * @return array{groups_set:int,templates_added:int,templates_skipped:int}
     */
    public function apply(string $key): array
    {
        $preset = self::PRESETS[$key] ?? null;
        if (!$preset) {
            throw new \InvalidArgumentException("Unknown planner preset '{$key}'.");
        }

        $summary = ['groups_set' => 0, 'templates_added' => 0, 'templates_skipped' => 0];

        DB::transaction(function () use ($preset, $key, &$summary) {
            // 1. Groups — single CrmSetting key holds the JSON array
            CrmSetting::updateOrCreate(
                ['key' => 'planner_groups'],
                ['value' => json_encode($preset['groups'])],
            );
            $summary['groups_set'] = count($preset['groups']);

            // 2. Templates — idempotent by name. Existing rows with the
            //    same `name` are left alone (don't clobber edits an
            //    admin may have made to e.g. "Morning briefing").
            $existing = PlannerTemplate::pluck('name')->map(fn ($n) => mb_strtolower($n))->all();
            $sortOrderByCategory = [];

            foreach ($preset['templates'] as $tpl) {
                if (in_array(mb_strtolower($tpl['name']), $existing, true)) {
                    $summary['templates_skipped']++;
                    continue;
                }

                $category = $tpl['category'] ?? 'General';
                $sortOrderByCategory[$category] = ($sortOrderByCategory[$category] ?? 0) + 1;

                PlannerTemplate::create([
                    'name'             => $tpl['name'],
                    'title'            => $tpl['title'] ?? $tpl['name'],
                    'category'         => $category,
                    'task_group'       => $tpl['task_group'] ?? null,
                    'task_category'    => $tpl['task_category'] ?? null,
                    'priority'         => $tpl['priority'] ?? 'Normal',
                    'duration_minutes' => $tpl['duration_minutes'] ?? null,
                    'description'      => $tpl['description'] ?? null,
                    'sort_order'       => $sortOrderByCategory[$category],
                ]);
                $summary['templates_added']++;
            }

            // 3. Remember which preset is active so the picker can
            //    highlight "Currently: …" — same pattern as CRM presets.
            CrmSetting::updateOrCreate(
                ['key' => 'planner_preset'],
                ['value' => $key],
            );
        });

        return $summary;
    }

    /**
     * Eight starter industries. Groups are the icon-tab list shown
     * in Schedule / Day / Month views; templates seed the org-wide
     * template library staff use from "Use a template" in the
     * drawer + side panel.
     *
     * Adding a new industry: drop a new key in this array with the
     * same shape — no other code changes needed. The picker auto-
     * discovers presets via self::PRESETS.
     */
    public const PRESETS = [
        'hotel' => [
            'label'       => 'Hotel',
            'description' => 'Front-of-house + housekeeping + F&B + maintenance. The classic 7-group hotel shift planner.',
            'icon'        => 'building-2',
            'groups'      => ['Front Desk', 'Housekeeping', 'F&B', 'Maintenance', 'Sales', 'Events', 'Management'],
            'templates'   => [
                ['name' => 'Morning briefing',        'title' => 'Morning team briefing',         'category' => 'Front Desk',   'task_group' => 'Front Desk',   'priority' => 'High',   'duration_minutes' => 15, 'description' => 'Daily kickoff with the AM shift — arrivals, VIPs, ops blockers.'],
                ['name' => 'Check-in prep',           'title' => 'Prep arriving rooms',           'category' => 'Front Desk',   'task_group' => 'Front Desk',   'priority' => 'Normal', 'duration_minutes' => 30],
                ['name' => 'Room inspection',         'title' => 'Inspect rooms post-cleaning',   'category' => 'Housekeeping', 'task_group' => 'Housekeeping', 'priority' => 'Normal', 'duration_minutes' => 45],
                ['name' => 'Turndown service',        'title' => 'Evening turndown',              'category' => 'Housekeeping', 'task_group' => 'Housekeeping', 'priority' => 'Normal', 'duration_minutes' => 60],
                ['name' => 'Breakfast service',       'title' => 'Breakfast buffet setup',        'category' => 'F&B',          'task_group' => 'F&B',          'priority' => 'High',   'duration_minutes' => 90],
                ['name' => 'Daily walk-through',      'title' => 'Property maintenance walk',     'category' => 'Maintenance',  'task_group' => 'Maintenance',  'priority' => 'Normal', 'duration_minutes' => 30],
                ['name' => 'VIP arrival prep',        'title' => 'VIP arrival amenity setup',     'category' => 'Front Desk',   'task_group' => 'Front Desk',   'priority' => 'High',   'duration_minutes' => 30],
                ['name' => 'Pre-shift lineup',        'title' => 'Shift lineup + handover',       'category' => 'Management',   'task_group' => 'Management',   'priority' => 'Normal', 'duration_minutes' => 15],
            ],
        ],

        'beauty' => [
            'label'       => 'Beauty / Spa',
            'description' => 'Stylist / therapist day. Station setup, treatment prep, retail follow-up, closing checklist.',
            'icon'        => 'sparkles',
            'groups'      => ['Reception', 'Treatments', 'Retail', 'Cleaning', 'Management'],
            'templates'   => [
                ['name' => 'Station setup',           'title' => 'Set up treatment station',      'category' => 'Treatments',   'task_group' => 'Treatments',   'priority' => 'High',   'duration_minutes' => 15],
                ['name' => 'Sterilize tools',         'title' => 'Sterilize tools + tray prep',   'category' => 'Treatments',   'task_group' => 'Treatments',   'priority' => 'High',   'duration_minutes' => 15],
                ['name' => 'Confirm appointments',    'title' => 'Confirm tomorrow\'s bookings',  'category' => 'Reception',    'task_group' => 'Reception',    'priority' => 'Normal', 'duration_minutes' => 30],
                ['name' => 'Retail inventory',        'title' => 'Restock retail shelves',        'category' => 'Retail',       'task_group' => 'Retail',       'priority' => 'Normal', 'duration_minutes' => 45],
                ['name' => 'Client follow-up',        'title' => 'Follow up post-treatment',      'category' => 'Reception',    'task_group' => 'Reception',    'priority' => 'Normal', 'duration_minutes' => 15],
                ['name' => 'End-of-day clean',        'title' => 'Deep-clean all stations',       'category' => 'Cleaning',     'task_group' => 'Cleaning',     'priority' => 'High',   'duration_minutes' => 30],
            ],
        ],

        'medical' => [
            'label'       => 'Medical / Healthcare',
            'description' => 'Patient flow + clinical prep + admin. Pre-clinic huddle, room turnover, scripts, billing.',
            'icon'        => 'stethoscope',
            'groups'      => ['Reception', 'Clinical', 'Lab', 'Billing', 'Admin'],
            'templates'   => [
                ['name' => 'Morning huddle',          'title' => 'Pre-clinic team huddle',        'category' => 'Clinical',     'task_group' => 'Clinical',     'priority' => 'High',   'duration_minutes' => 15],
                ['name' => 'Room turnover',           'title' => 'Clean + restock exam room',     'category' => 'Clinical',     'task_group' => 'Clinical',     'priority' => 'High',   'duration_minutes' => 10],
                ['name' => 'Patient confirmations',   'title' => 'Confirm tomorrow\'s patients',  'category' => 'Reception',    'task_group' => 'Reception',    'priority' => 'Normal', 'duration_minutes' => 30],
                ['name' => 'Lab specimen review',     'title' => 'Review pending lab results',    'category' => 'Lab',          'task_group' => 'Lab',          'priority' => 'High',   'duration_minutes' => 30],
                ['name' => 'Insurance claims',        'title' => 'Submit + chase outstanding claims', 'category' => 'Billing',  'task_group' => 'Billing',      'priority' => 'Normal', 'duration_minutes' => 60],
                ['name' => 'Script refills',          'title' => 'Process prescription refills',  'category' => 'Clinical',     'task_group' => 'Clinical',     'priority' => 'Normal', 'duration_minutes' => 30],
                ['name' => 'Charts to sign',          'title' => 'Sign open patient charts',      'category' => 'Admin',        'task_group' => 'Admin',        'priority' => 'High',   'duration_minutes' => 45],
            ],
        ],

        'legal' => [
            'label'       => 'Legal / Law firm',
            'description' => 'Matter intake → research → filing → billing. Time-conscious cadence with court deadlines.',
            'icon'        => 'scale',
            'groups'      => ['Intake', 'Case Work', 'Court Filing', 'Billing', 'Admin'],
            'templates'   => [
                ['name' => 'Client intake call',      'title' => 'Initial client intake call',    'category' => 'Intake',       'task_group' => 'Intake',       'priority' => 'High',   'duration_minutes' => 30],
                ['name' => 'Conflict check',          'title' => 'Run conflict check on new matter', 'category' => 'Intake',    'task_group' => 'Intake',       'priority' => 'High',   'duration_minutes' => 15],
                ['name' => 'Case file review',       'title' => 'Review case file + notes',      'category' => 'Case Work',    'task_group' => 'Case Work',    'priority' => 'Normal', 'duration_minutes' => 60],
                ['name' => 'Draft motion',            'title' => 'Draft motion / pleading',       'category' => 'Case Work',    'task_group' => 'Case Work',    'priority' => 'High',   'duration_minutes' => 120],
                ['name' => 'Court filing',            'title' => 'E-file documents + serve',      'category' => 'Court Filing', 'task_group' => 'Court Filing', 'priority' => 'High',   'duration_minutes' => 30],
                ['name' => 'Time entry',              'title' => 'Log billable hours',            'category' => 'Billing',      'task_group' => 'Billing',      'priority' => 'Normal', 'duration_minutes' => 15],
                ['name' => 'Send invoice',            'title' => 'Issue monthly client invoice',  'category' => 'Billing',      'task_group' => 'Billing',      'priority' => 'Normal', 'duration_minutes' => 30],
            ],
        ],

        'real_estate' => [
            'label'       => 'Real estate',
            'description' => 'Listings + showings + offers + closings. Agent-focused weekly cadence.',
            'icon'        => 'home',
            'groups'      => ['Listings', 'Showings', 'Negotiations', 'Closings', 'Marketing'],
            'templates'   => [
                ['name' => 'New listing prep',        'title' => 'Stage + photograph new listing','category' => 'Listings',     'task_group' => 'Listings',     'priority' => 'High',   'duration_minutes' => 120],
                ['name' => 'MLS update',              'title' => 'Update MLS + portal listings',  'category' => 'Listings',     'task_group' => 'Listings',     'priority' => 'Normal', 'duration_minutes' => 30],
                ['name' => 'Showing prep',            'title' => 'Confirm + prep property showing','category' => 'Showings',    'task_group' => 'Showings',     'priority' => 'High',   'duration_minutes' => 30],
                ['name' => 'Post-showing follow-up',  'title' => 'Call buyer after viewing',      'category' => 'Showings',     'task_group' => 'Showings',     'priority' => 'Normal', 'duration_minutes' => 15],
                ['name' => 'Offer review',            'title' => 'Review + counter incoming offer','category' => 'Negotiations','task_group' => 'Negotiations', 'priority' => 'High',   'duration_minutes' => 45],
                ['name' => 'Closing walk-through',    'title' => 'Final walk-through with client','category' => 'Closings',     'task_group' => 'Closings',     'priority' => 'High',   'duration_minutes' => 60],
                ['name' => 'Social post',             'title' => 'Post listing to social',        'category' => 'Marketing',    'task_group' => 'Marketing',    'priority' => 'Low',    'duration_minutes' => 15],
            ],
        ],

        'education' => [
            'label'       => 'Education / Tutoring',
            'description' => 'Lesson prep → delivery → parent comms → admin. Term-based rhythm.',
            'icon'        => 'graduation-cap',
            'groups'      => ['Admissions', 'Teaching', 'Curriculum', 'Operations', 'Admin'],
            'templates'   => [
                ['name' => 'Lesson plan',             'title' => 'Plan tomorrow\'s lesson',       'category' => 'Teaching',     'task_group' => 'Teaching',     'priority' => 'High',   'duration_minutes' => 45],
                ['name' => 'Materials prep',          'title' => 'Print / prep teaching materials','category' => 'Teaching',    'task_group' => 'Teaching',     'priority' => 'Normal', 'duration_minutes' => 30],
                ['name' => 'Parent call',             'title' => 'Progress call with parent',     'category' => 'Admissions',   'task_group' => 'Admissions',   'priority' => 'Normal', 'duration_minutes' => 20],
                ['name' => 'Grade assignments',       'title' => 'Grade + return student work',   'category' => 'Teaching',     'task_group' => 'Teaching',     'priority' => 'Normal', 'duration_minutes' => 60],
                ['name' => 'Trial lesson',            'title' => 'Run trial / assessment lesson', 'category' => 'Admissions',   'task_group' => 'Admissions',   'priority' => 'High',   'duration_minutes' => 30],
                ['name' => 'Curriculum review',       'title' => 'Review + update unit plan',     'category' => 'Curriculum',   'task_group' => 'Curriculum',   'priority' => 'Normal', 'duration_minutes' => 60],
                ['name' => 'Supply check',            'title' => 'Inventory + reorder supplies',  'category' => 'Operations',   'task_group' => 'Operations',   'priority' => 'Low',    'duration_minutes' => 30],
            ],
        ],

        'fitness' => [
            'label'       => 'Fitness / Wellness',
            'description' => 'Studio / gym day. Equipment, class setup, member check-ins, retention calls.',
            'icon'        => 'dumbbell',
            'groups'      => ['Front Desk', 'Training', 'Classes', 'Maintenance', 'Sales'],
            'templates'   => [
                ['name' => 'Equipment check',         'title' => 'Inspect + sanitize equipment',  'category' => 'Maintenance',  'task_group' => 'Maintenance',  'priority' => 'High',   'duration_minutes' => 30],
                ['name' => 'Class setup',             'title' => 'Set up class studio',           'category' => 'Classes',      'task_group' => 'Classes',      'priority' => 'High',   'duration_minutes' => 15],
                ['name' => 'PT session prep',         'title' => 'Prep personal training session','category' => 'Training',     'task_group' => 'Training',     'priority' => 'High',   'duration_minutes' => 15],
                ['name' => 'Member check-in calls',   'title' => 'Call at-risk members',          'category' => 'Sales',        'task_group' => 'Sales',        'priority' => 'Normal', 'duration_minutes' => 30],
                ['name' => 'Trial conversion',        'title' => 'Convert trial → membership',    'category' => 'Sales',        'task_group' => 'Sales',        'priority' => 'High',   'duration_minutes' => 30],
                ['name' => 'Locker room reset',       'title' => 'Restock + clean locker rooms',  'category' => 'Maintenance',  'task_group' => 'Maintenance',  'priority' => 'Normal', 'duration_minutes' => 30],
            ],
        ],

        'restaurant' => [
            'label'       => 'Restaurant',
            'description' => 'Service-day rhythm. Open, prep, lunch, transition, dinner, close.',
            'icon'        => 'utensils',
            'groups'      => ['Front of House', 'Kitchen', 'Bar', 'Cleaning', 'Management'],
            'templates'   => [
                ['name' => 'Opening checklist',       'title' => 'Restaurant opening procedure',  'category' => 'Management',   'task_group' => 'Management',   'priority' => 'High',   'duration_minutes' => 30],
                ['name' => 'Prep list',               'title' => 'Kitchen prep for service',      'category' => 'Kitchen',      'task_group' => 'Kitchen',      'priority' => 'High',   'duration_minutes' => 120],
                ['name' => 'Pre-shift meeting',       'title' => 'Pre-shift staff briefing',      'category' => 'Front of House','task_group' => 'Front of House','priority' => 'High',  'duration_minutes' => 15],
                ['name' => 'Bar setup',               'title' => 'Stock + setup bar service',     'category' => 'Bar',          'task_group' => 'Bar',          'priority' => 'High',   'duration_minutes' => 30],
                ['name' => 'Confirm reservations',    'title' => 'Confirm tonight\'s reservations','category' => 'Front of House','task_group' => 'Front of House','priority' => 'High','duration_minutes' => 30],
                ['name' => 'Deep clean',              'title' => 'End-of-night deep clean',       'category' => 'Cleaning',     'task_group' => 'Cleaning',     'priority' => 'High',   'duration_minutes' => 60],
                ['name' => 'Closing cashout',         'title' => 'Cash-out + closing report',     'category' => 'Management',   'task_group' => 'Management',   'priority' => 'High',   'duration_minutes' => 30],
            ],
        ],
    ];
}
