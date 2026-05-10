<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * Embeddable lead-capture form. Each form has a public `embed_key`
 * the customer pastes into an <iframe> on their website. Submissions
 * are processed by `Public\LeadFormPublicController::submit` which
 * creates a Guest + Inquiry from the payload.
 */
class LeadForm extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'brand_id',
        'name', 'embed_key', 'description',
        'default_source', 'default_inquiry_type',
        'default_property_id', 'default_assigned_to',
        'fields', 'design',
        'is_active',
        'submission_count', 'last_submitted_at',
    ];

    protected $casts = [
        'fields'             => 'array',
        'design'             => 'array',
        'is_active'          => 'boolean',
        'submission_count'   => 'integer',
        'last_submitted_at'  => 'datetime',
    ];

    public function submissions(): HasMany
    {
        return $this->hasMany(LeadFormSubmission::class);
    }

    /**
     * Return a NEW unique embed_key. Used on create + the regenerate
     * action. 32 chars random alpha-num — long enough that brute-force
     * scanning the URL space is infeasible.
     */
    public static function newEmbedKey(): string
    {
        do {
            $key = Str::random(32);
        } while (static::withoutGlobalScopes()->where('embed_key', $key)->exists());
        return $key;
    }

    /**
     * Default field set for new forms. Admins toggle / customise from
     * the editor. Order matters — it's the visual order on the page.
     */
    public static function defaultFields(): array
    {
        return [
            ['key' => 'name',         'type' => 'text',     'label' => 'Your name',                       'placeholder' => 'e.g. Sarah Williams',         'required' => true,  'enabled' => true],
            ['key' => 'email',        'type' => 'email',    'label' => 'Email',                           'placeholder' => 'you@example.com',             'required' => true,  'enabled' => true],
            ['key' => 'phone',        'type' => 'phone',    'label' => 'Phone (optional)',                'placeholder' => '+49 …',                       'required' => false, 'enabled' => true],
            ['key' => 'inquiry_type', 'type' => 'select',   'label' => 'What can we help with?',          'placeholder' => '',                            'required' => false, 'enabled' => false, 'options_source' => 'inquiry_types'],
            ['key' => 'check_in',     'type' => 'date',     'label' => 'Date',                            'placeholder' => '',                            'required' => false, 'enabled' => false],
            ['key' => 'check_out',    'type' => 'date',     'label' => 'Until',                           'placeholder' => '',                            'required' => false, 'enabled' => false],
            ['key' => 'num_people',   'type' => 'number',   'label' => 'Party size',                      'placeholder' => '2',                           'required' => false, 'enabled' => false],
            ['key' => 'message',      'type' => 'textarea', 'label' => 'Tell us more',                    'placeholder' => 'Anything we should know?',    'required' => false, 'enabled' => true],
        ];
    }

    /**
     * Default design config — readable on white, primary cyan to match
     * the marketing-site palette. Admins tweak from the editor.
     */
    public static function defaultDesign(): array
    {
        return [
            'title'            => 'Get in touch',
            'intro'            => "Tell us a bit about what you're looking for and we'll be in touch shortly.",
            'submit_text'      => 'Send',
            'success_title'    => 'Thanks!',
            'success_message'  => "We've got your details and will be in touch soon.",
            'primary_color'    => '#22d3ee',
            'theme'            => 'light',          // light | dark
            'corners'          => 'rounded',        // sharp | rounded
            'show_privacy_link'=> true,
            'show_brand_logo'  => true,
        ];
    }
}
