<?php

namespace App\Services;

use App\Models\CustomField;
use Illuminate\Support\Str;

/**
 * Single home for the two operations entity controllers care about:
 *
 *   1. Validate + sanitize a `custom_data` payload before save. Drops
 *      keys that aren't defined for this entity, casts values to the
 *      field's type, and checks `required`.
 *
 *   2. Generate a stable JSON key from a label on field create.
 *
 * Industry presets live here too — `applyPreset()` seeds a starter
 * field set so a beauty/medical org doesn't have to rebuild the
 * schema from scratch.
 */
class CustomFieldService
{
    /**
     * Validate + cast a raw custom_data array against the active fields
     * for the given entity. Returns a new array safe to persist.
     *
     * Throws \Illuminate\Validation\ValidationException when a required
     * field is missing or a value fails type validation, so the caller
     * gets the standard 422 with `errors` payload.
     */
    public function validate(string $entity, ?array $raw): ?array
    {
        $raw = $raw ?? [];
        $fields = CustomField::where('entity', $entity)
            ->where('is_active', true)
            ->get();

        if ($fields->isEmpty()) {
            return $raw === [] ? null : null; // no schema, drop everything silently
        }

        $clean = [];
        $errors = [];

        foreach ($fields as $f) {
            $present = array_key_exists($f->key, $raw);
            $value = $raw[$f->key] ?? null;

            // empty-ish detection that handles all input types
            $empty = !$present
                || $value === null
                || $value === ''
                || (is_array($value) && count($value) === 0);

            if ($f->required && $empty) {
                $errors["custom_data.{$f->key}"] = ["{$f->label} is required."];
                continue;
            }
            if ($empty) continue;

            try {
                $clean[$f->key] = $this->castValue($f, $value);
            } catch (\InvalidArgumentException $e) {
                $errors["custom_data.{$f->key}"] = [$e->getMessage()];
            }
        }

        if (!empty($errors)) {
            throw \Illuminate\Validation\ValidationException::withMessages($errors);
        }

        return $clean === [] ? null : $clean;
    }

    /**
     * Type-coerce a single value. Anything that doesn't fit throws
     * InvalidArgumentException with a user-readable message.
     */
    private function castValue(CustomField $f, $raw)
    {
        return match ($f->type) {
            'text', 'textarea', 'url', 'email', 'phone' => (string) $raw,
            'number'   => is_numeric($raw)
                ? ($raw + 0) // preserve int vs float
                : throw new \InvalidArgumentException("{$f->label} must be a number."),
            'date'     => $this->castDate($f, (string) $raw),
            'checkbox' => (bool) $raw,
            'select'   => $this->castSelect($f, (string) $raw),
            'multiselect' => $this->castMultiselect($f, $raw),
            default    => $raw,
        };
    }

    private function castDate(CustomField $f, string $raw): string
    {
        // Accept ISO date or datetime; normalise to ISO8601 string.
        // Display layer (frontend) decides format.
        try {
            return \Carbon\Carbon::parse($raw)->toIso8601String();
        } catch (\Throwable $e) {
            throw new \InvalidArgumentException("{$f->label} must be a valid date.");
        }
    }

    private function castSelect(CustomField $f, string $raw)
    {
        $options = $f->config['options'] ?? [];
        if (!in_array($raw, $options, true)) {
            throw new \InvalidArgumentException("{$f->label}: '{$raw}' is not one of the configured options.");
        }
        return $raw;
    }

    private function castMultiselect(CustomField $f, $raw): array
    {
        if (!is_array($raw)) {
            throw new \InvalidArgumentException("{$f->label} must be a list.");
        }
        $options = $f->config['options'] ?? [];
        foreach ($raw as $item) {
            if (!in_array($item, $options, true)) {
                throw new \InvalidArgumentException("{$f->label}: '{$item}' is not a configured option.");
            }
        }
        return array_values(array_unique($raw));
    }

    /**
     * Build a stable, unique key from a human label. Used at create
     * time only — once persisted, the key is never re-derived (so
     * renaming the label doesn't orphan saved values on entity rows).
     */
    public function generateKey(string $entity, string $label): string
    {
        $base = Str::slug($label, '_');
        if ($base === '') $base = 'field';

        $key = $base;
        $i = 2;
        while (CustomField::where('entity', $entity)->where('key', $key)->exists()) {
            $key = $base . '_' . $i;
            $i++;
            if ($i > 99) {
                $key = $base . '_' . Str::random(4);
                break;
            }
        }
        return $key;
    }

    /**
     * Industry presets. Each preset is a starter field set the admin
     * can apply, then prune / extend from the editor. Idempotent —
     * fields whose key already exists for the entity are skipped, so
     * re-applying a preset doesn't create dupes.
     */
    public function applyPreset(string $preset): array
    {
        $defs = self::PRESETS[$preset] ?? null;
        if (!$defs) {
            throw new \InvalidArgumentException("Unknown preset '{$preset}'.");
        }

        $created = [];
        foreach ($defs as $entity => $fields) {
            $maxSort = (int) CustomField::where('entity', $entity)->max('sort_order');
            foreach ($fields as $i => $field) {
                $key = $field['key'] ?? $this->generateKey($entity, $field['label']);
                if (CustomField::where('entity', $entity)->where('key', $key)->exists()) {
                    continue;
                }
                $cf = CustomField::create([
                    'entity'       => $entity,
                    'key'          => $key,
                    'label'        => $field['label'],
                    'type'         => $field['type'],
                    'config'       => $field['config'] ?? null,
                    'help_text'    => $field['help_text'] ?? null,
                    'required'     => $field['required'] ?? false,
                    'is_active'    => true,
                    'show_in_list' => $field['show_in_list'] ?? false,
                    'sort_order'   => $maxSort + $i + 1,
                ]);
                $created[] = $cf;
            }
        }
        return $created;
    }

    /**
     * Industry-specific starter sets. Hotel orgs already have all the
     * built-in fields they need — no preset for hotel since it's the
     * baseline. Each preset is hand-tuned for its industry's typical
     * intake form: only the fields a non-technical user from that
     * industry would actually want, ordered by frequency-of-use.
     */
    public const PRESETS = [
        'beauty' => [
            'guest' => [
                ['key' => 'skin_type',          'label' => 'Skin type',          'type' => 'select',     'config' => ['options' => ['Normal', 'Dry', 'Oily', 'Combination', 'Sensitive']]],
                ['key' => 'hair_type',          'label' => 'Hair type',          'type' => 'select',     'config' => ['options' => ['Straight', 'Wavy', 'Curly', 'Coily', 'Coloured', 'Bleached']]],
                ['key' => 'allergies',          'label' => 'Allergies',          'type' => 'textarea',   'help_text' => 'Anything that affects product or ingredient choice.'],
                ['key' => 'preferred_therapist','label' => 'Preferred therapist','type' => 'text'],
                ['key' => 'last_visit_notes',   'label' => 'Last visit notes',   'type' => 'textarea',   'help_text' => 'What worked, what didn\'t — read before the next service.'],
                ['key' => 'birthday',           'label' => 'Birthday',           'type' => 'date',       'help_text' => 'For birthday-month offers.'],
            ],
            'inquiry' => [
                ['key' => 'service_type',       'label' => 'Service type',       'type' => 'select',     'config' => ['options' => ['Facial', 'Massage', 'Hair', 'Nails', 'Body', 'Wellness package', 'Other']]],
                ['key' => 'preferred_time',     'label' => 'Preferred time',     'type' => 'select',     'config' => ['options' => ['Morning', 'Lunch', 'Afternoon', 'Evening', 'Weekend']]],
                ['key' => 'first_time_client',  'label' => 'First-time client',  'type' => 'checkbox'],
            ],
        ],
        'medical' => [
            'guest' => [
                ['key' => 'date_of_birth',      'label' => 'Date of birth',      'type' => 'date',       'required' => true],
                ['key' => 'blood_type',         'label' => 'Blood type',         'type' => 'select',     'config' => ['options' => ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'Unknown']]],
                ['key' => 'allergies',          'label' => 'Allergies',          'type' => 'textarea',   'help_text' => 'Drug + environmental + food. List ALL.'],
                ['key' => 'current_medications','label' => 'Current medications','type' => 'textarea'],
                ['key' => 'chronic_conditions', 'label' => 'Chronic conditions', 'type' => 'textarea'],
                ['key' => 'insurance_provider', 'label' => 'Insurance provider', 'type' => 'text'],
                ['key' => 'policy_number',      'label' => 'Policy number',      'type' => 'text'],
                ['key' => 'emergency_contact',  'label' => 'Emergency contact',  'type' => 'text',       'help_text' => 'Name + phone of next-of-kin.'],
                ['key' => 'emergency_phone',    'label' => 'Emergency phone',    'type' => 'phone'],
            ],
            'inquiry' => [
                ['key' => 'reason_for_visit',   'label' => 'Reason for visit',   'type' => 'textarea',   'required' => true],
                ['key' => 'urgency',            'label' => 'Urgency',            'type' => 'select',     'config' => ['options' => ['Routine', 'Soon', 'Urgent', 'Emergency']]],
                ['key' => 'referring_doctor',   'label' => 'Referring doctor',   'type' => 'text'],
                ['key' => 'consent_to_contact', 'label' => 'Consent to contact', 'type' => 'checkbox',   'help_text' => 'Phone / SMS / email reminders.'],
            ],
        ],
        'legal' => [
            'guest' => [
                ['key' => 'matter_type',        'label' => 'Matter type',        'type' => 'select',     'config' => ['options' => ['Civil', 'Commercial', 'Family', 'Criminal', 'Property', 'Tax', 'Immigration', 'Other']]],
                ['key' => 'date_of_birth',      'label' => 'Date of birth',      'type' => 'date'],
                ['key' => 'id_number',          'label' => 'ID / Passport',      'type' => 'text'],
                ['key' => 'occupation',         'label' => 'Occupation',         'type' => 'text'],
                ['key' => 'conflict_check',     'label' => 'Conflict check done','type' => 'checkbox',   'help_text' => 'Have you cleared this client against current cases?'],
            ],
            'inquiry' => [
                ['key' => 'case_type',          'label' => 'Case type',          'type' => 'select',     'config' => ['options' => ['Litigation', 'Advisory', 'Contract review', 'Negotiation', 'Document drafting']]],
                ['key' => 'opposing_party',     'label' => 'Opposing party',     'type' => 'text'],
                ['key' => 'court_or_jurisdiction','label' => 'Court / jurisdiction', 'type' => 'text'],
                ['key' => 'key_deadline',       'label' => 'Key deadline',       'type' => 'date',       'help_text' => 'Statute of limitations, filing date, hearing.'],
                ['key' => 'retainer_amount',    'label' => 'Retainer amount',    'type' => 'number'],
                ['key' => 'fee_arrangement',    'label' => 'Fee arrangement',    'type' => 'select',     'config' => ['options' => ['Hourly', 'Flat fee', 'Contingency', 'Retainer + hourly']]],
            ],
        ],
        'real_estate' => [
            'guest' => [
                ['key' => 'buyer_or_seller',    'label' => 'Buyer or seller',    'type' => 'select',     'config' => ['options' => ['Buyer', 'Seller', 'Both', 'Renter', 'Landlord']]],
                ['key' => 'pre_approval',       'label' => 'Mortgage pre-approval','type' => 'checkbox'],
                ['key' => 'preferred_areas',    'label' => 'Preferred areas',    'type' => 'textarea',   'help_text' => 'Neighbourhoods / postcodes / proximity needs.'],
            ],
            'inquiry' => [
                ['key' => 'property_type',      'label' => 'Property type',      'type' => 'multiselect','config' => ['options' => ['Apartment', 'House', 'Townhouse', 'Land', 'Commercial', 'Industrial']]],
                ['key' => 'budget_min',         'label' => 'Budget — min',       'type' => 'number'],
                ['key' => 'budget_max',         'label' => 'Budget — max',       'type' => 'number'],
                ['key' => 'bedrooms',           'label' => 'Bedrooms',           'type' => 'number'],
                ['key' => 'bathrooms',          'label' => 'Bathrooms',          'type' => 'number'],
                ['key' => 'must_haves',         'label' => 'Must-haves',         'type' => 'textarea',   'help_text' => 'Garage, garden, balcony, lift, school district…'],
                ['key' => 'financing_type',     'label' => 'Financing',          'type' => 'select',     'config' => ['options' => ['Cash', 'Mortgage', 'Pre-approved mortgage', 'Investor financing']]],
                ['key' => 'decision_timeline',  'label' => 'Decision timeline',  'type' => 'select',     'config' => ['options' => ['Now', '1–3 months', '3–6 months', '6–12 months', 'Just looking']]],
            ],
        ],
        'education' => [
            'guest' => [
                ['key' => 'date_of_birth',      'label' => 'Date of birth',      'type' => 'date'],
                ['key' => 'parent_name',        'label' => 'Parent / guardian',  'type' => 'text',       'help_text' => 'For minors only.'],
                ['key' => 'parent_phone',       'label' => 'Parent phone',       'type' => 'phone'],
                ['key' => 'prior_education',    'label' => 'Prior education',    'type' => 'textarea'],
                ['key' => 'language_native',    'label' => 'Native language',    'type' => 'text'],
            ],
            'inquiry' => [
                ['key' => 'program_interest',   'label' => 'Program / course',   'type' => 'text',       'required' => true],
                ['key' => 'start_term',         'label' => 'Preferred start',    'type' => 'select',     'config' => ['options' => ['ASAP', 'Next month', 'Next term', 'Next year', 'Not sure']]],
                ['key' => 'study_format',       'label' => 'Format',             'type' => 'select',     'config' => ['options' => ['In-person', 'Online', 'Hybrid', 'Either']]],
                ['key' => 'level',              'label' => 'Level',              'type' => 'select',     'config' => ['options' => ['Beginner', 'Intermediate', 'Advanced', 'Certification', 'Diploma', 'Degree']]],
                ['key' => 'how_did_you_hear',   'label' => 'How did you hear?',  'type' => 'text'],
            ],
        ],
        'fitness' => [
            'guest' => [
                ['key' => 'fitness_goal',       'label' => 'Primary goal',       'type' => 'select',     'config' => ['options' => ['Weight loss', 'Muscle gain', 'Endurance', 'Flexibility', 'General health', 'Rehab', 'Sport-specific']]],
                ['key' => 'experience_level',   'label' => 'Experience level',   'type' => 'select',     'config' => ['options' => ['Beginner', 'Intermediate', 'Advanced']]],
                ['key' => 'injuries',           'label' => 'Injuries / conditions','type' => 'textarea', 'help_text' => 'Anything trainers should work around.'],
                ['key' => 'preferred_trainer',  'label' => 'Preferred trainer',  'type' => 'text'],
                ['key' => 'membership_tier',    'label' => 'Membership tier',    'type' => 'select',     'config' => ['options' => ['Drop-in', 'Monthly', 'Quarterly', 'Annual', 'Personal training', 'VIP']]],
                ['key' => 'medical_clearance',  'label' => 'Medical clearance',  'type' => 'checkbox',   'help_text' => 'Required if 50+ or with health conditions.'],
            ],
            'inquiry' => [
                ['key' => 'service_interest',   'label' => 'Service interest',   'type' => 'multiselect','config' => ['options' => ['Gym access', 'Personal training', 'Group classes', 'Nutrition coaching', 'Physiotherapy']]],
                ['key' => 'sessions_per_week',  'label' => 'Sessions / week',    'type' => 'number'],
                ['key' => 'preferred_time',     'label' => 'Preferred time',     'type' => 'select',     'config' => ['options' => ['Early morning', 'Morning', 'Lunch', 'Afternoon', 'Evening']]],
            ],
        ],
        'restaurant' => [
            'guest' => [
                ['key' => 'dietary',            'label' => 'Dietary preferences','type' => 'multiselect','config' => ['options' => ['Vegetarian', 'Vegan', 'Gluten-free', 'Lactose-free', 'Halal', 'Kosher', 'Pescatarian', 'Nut-free']]],
                ['key' => 'allergies',          'label' => 'Allergies',          'type' => 'textarea',   'help_text' => 'CRITICAL for kitchen — list ALL.'],
                ['key' => 'favourite_table',    'label' => 'Favourite table',    'type' => 'text',       'help_text' => 'e.g. Window table, Booth 4, Quiet corner.'],
                ['key' => 'wine_preferences',   'label' => 'Wine preferences',   'type' => 'textarea'],
                ['key' => 'birthday',           'label' => 'Birthday',           'type' => 'date'],
                ['key' => 'anniversary',        'label' => 'Anniversary',        'type' => 'date'],
            ],
            'inquiry' => [
                ['key' => 'occasion',           'label' => 'Occasion',           'type' => 'select',     'config' => ['options' => ['Birthday', 'Anniversary', 'Business', 'Date', 'Family gathering', 'Celebration', 'Other']]],
                ['key' => 'party_size',         'label' => 'Party size',         'type' => 'number'],
                ['key' => 'seating_preference', 'label' => 'Seating',            'type' => 'select',     'config' => ['options' => ['Indoor', 'Outdoor / terrace', 'Bar', 'Private room', 'No preference']]],
                ['key' => 'special_setup',      'label' => 'Special setup',      'type' => 'textarea',   'help_text' => 'Cake, flowers, surprise — anything the team should prep.'],
            ],
        ],
    ];
}
