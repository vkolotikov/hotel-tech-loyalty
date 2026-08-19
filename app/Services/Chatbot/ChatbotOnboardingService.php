<?php

namespace App\Services\Chatbot;

use App\Models\Brand;
use App\Models\ChatbotBehaviorConfig;
use App\Models\ChatWidgetConfig;
use App\Models\CrmSetting;
use App\Models\HotelSetting;
use App\Models\KnowledgeItem;
use App\Models\Organization;
use App\Services\OrganizationSetupService;
use Illuminate\Support\Facades\DB;

/**
 * First-run chatbot setup: what to ask, and what to write.
 *
 * FIRST-RUN DETECTION
 * The Content Planner decides this by row existence — no profile row means no
 * setup yet. That does not transfer here, because chat config rows ARE created
 * at signup (AuthController writes a ChatWidgetConfig shell, IndustryPresetService
 * stamps a behaviour identity). Every org, brand new or three years old, already
 * has rows. So row existence would show the wizard to nobody, and "config looks
 * empty" would show it to established venues who deliberately cleared a field.
 *
 * Instead this follows the marker idiom already used for the setup and members
 * onboardings: a row in the org-scoped `crm_settings` key/value table. A
 * migration stamps every organisation that exists at deploy time, so the wizard
 * is structurally incapable of appearing for a current user — that is the
 * requirement, and it is enforced by data rather than by a heuristic.
 *
 * One consequence worth naming: `crm_settings` is unique on
 * (organization_id, key) with no brand dimension, while chat configs are unique
 * on (organization_id, brand_id). So the wizard runs once per ORGANISATION, not
 * once per brand. A multi-brand org configures its second brand through normal
 * settings. That is the right trade — a wizard that reappears when you add a
 * brand reads as a bug.
 */
class ChatbotOnboardingService
{
    /** crm_settings key. Presence = "this org has been through (or dismissed) setup". */
    public const MARKER = 'chatbot_onboarding_completed_at';

    public function __construct(
        private readonly ChatbotPresetService $presets,
    ) {}

    /**
     * Everything the wizard needs to render, plus whether it should render.
     *
     * @return array<string,mixed>
     */
    public function state(int $orgId, ?int $brandId = null): array
    {
        $brandId = $brandId ?? Brand::currentOrDefaultIdForOrg($orgId);
        $org     = Organization::withoutGlobalScopes()->find($orgId);
        $industry = $org?->resolved_industry ?: Organization::DEFAULT_INDUSTRY;

        $preset = $this->presets->for($industry);
        $widget = ChatWidgetConfig::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('brand_id', $brandId)
            ->first();

        return [
            'completed'  => $this->isCompleted($orgId),
            'industry'   => $industry,
            'widget_key' => $widget?->widget_key,
            'preset'     => [
                'assistant_name'    => $preset->assistantName,
                'tone'              => $preset->tone,
                'goal'              => $preset->goal,
                'core_rules'        => $preset->coreRules,
                'escalation_policy' => $preset->escalationPolicy,
                'fallback_message'  => $preset->fallbackMessage,
                'welcome_title'     => $preset->welcomeTitle,
                'welcome_subtitle'  => $preset->welcomeSubtitle,
                'suggestions'       => $preset->suggestions,
            ],
            'facts'   => $this->presets->factsFor($industry),
            'prefill' => $this->prefill($orgId, $org, $widget),
        ];
    }

    public function isCompleted(int $orgId): bool
    {
        return CrmSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', self::MARKER)
            ->exists();
    }

    /**
     * Anything we already know, so the wizard asks for as little as possible.
     *
     * The facts are deliberately sourced from where a venue has most likely
     * already typed them during signup or company setup — asking again for an
     * address the product already has is the fastest way to make a wizard feel
     * like paperwork.
     *
     * @return array<string,string>
     */
    private function prefill(int $orgId, ?Organization $org, ?ChatWidgetConfig $widget): array
    {
        $settings = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->pluck('value', 'key');

        $out = [
            'company_name' => $widget?->company_name ?: ($org?->name ?? ''),
            'address'      => (string) ($settings['company_address'] ?? $settings['address'] ?? ''),
            'phone'        => (string) ($settings['company_phone'] ?? $settings['phone'] ?? ''),
            'email'        => (string) ($settings['company_email'] ?? $settings['email'] ?? ''),
        ];

        return array_filter($out, fn ($v) => is_string($v) && trim($v) !== '');
    }

    /**
     * Apply the wizard's answers.
     *
     * Everything lands in one transaction. A half-applied setup is the worst
     * outcome available here: the marker could be written while the knowledge
     * entries were not, leaving a venue with a live public assistant, no facts,
     * and no way back into the wizard that would have given it them.
     *
     * @param  array<string,mixed>  $input
     * @return array<string,mixed>  what was written, for the confirmation screen
     */
    public function apply(int $orgId, array $input, ?int $brandId = null): array
    {
        $brandId  = $brandId ?? Brand::currentOrDefaultIdForOrg($orgId);
        $org      = Organization::withoutGlobalScopes()->find($orgId);
        $industry = $org?->resolved_industry ?: Organization::DEFAULT_INDUSTRY;
        $preset   = $this->presets->for($industry);

        $facts   = is_array($input['facts'] ?? null) ? $input['facts'] : [];
        $entries = $this->presets->renderFaq($preset, $facts);

        $companyName = trim((string) ($input['company_name'] ?? '')) ?: ($org?->name ?? '');

        return DB::transaction(function () use (
            $orgId, $brandId, $industry, $preset, $input, $facts, $entries, $companyName
        ) {
            $this->writeBehaviour($orgId, $brandId, $preset, $input);
            $this->writeWidget($orgId, $brandId, $industry, $preset, $input, $companyName);
            $created = $this->writeKnowledge($orgId, $brandId, $entries);

            CrmSetting::withoutGlobalScopes()->updateOrCreate(
                ['organization_id' => $orgId, 'key' => self::MARKER],
                ['value' => [
                    'completed_at' => now()->toIso8601String(),
                    'source'       => 'wizard',
                    'industry'     => $industry,
                ]],
            );

            return [
                'knowledge_created' => $created,
                'facts_supplied'    => count(array_filter($facts, fn ($v) => is_string($v) && trim($v) !== '')),
                'industry'          => $industry,
            ];
        });
    }

    /**
     * Record that the admin chose not to run setup.
     *
     * Stamps the same marker: a wizard that reappears after being dismissed is
     * indistinguishable from a broken one. Settings remain reachable normally.
     */
    public function skip(int $orgId): void
    {
        CrmSetting::withoutGlobalScopes()->updateOrCreate(
            ['organization_id' => $orgId, 'key' => self::MARKER],
            ['value' => [
                'completed_at' => now()->toIso8601String(),
                'source'       => 'skipped',
            ]],
        );
    }

    /* ─── writers ───────────────────────────────────────────────────────── */

    private function writeBehaviour(int $orgId, int $brandId, ChatbotPreset $preset, array $input): void
    {
        // Only the rules the admin left ticked. An unrecognised string is
        // dropped rather than trusted — this text is concatenated into the
        // system prompt, so it is not a free-text channel.
        $rules = array_values(array_intersect(
            is_array($input['core_rules'] ?? null) ? $input['core_rules'] : $preset->coreRules,
            $preset->coreRules,
        ));

        $escalation = $preset->escalationPolicy;
        $handoff    = trim((string) ($input['handoff_email'] ?? ''));
        if ($handoff !== '') {
            $escalation .= " When you take someone's details, tell them the team will reply by email.";
        }

        $config = ChatbotBehaviorConfig::getForOrg($orgId, $brandId);
        $config->fill([
            'organization_id'   => $orgId,
            'brand_id'          => $brandId,
            'assistant_name'    => trim((string) ($input['assistant_name'] ?? '')) ?: $preset->assistantName,
            'goal'              => $preset->goal,
            'tone'              => (string) ($input['tone'] ?? $preset->tone),
            'sales_style'       => $preset->salesStyle,
            'language'          => (string) ($input['language'] ?? 'en'),
            'core_rules'        => $rules,
            'escalation_policy' => $escalation,
            'fallback_message'  => $preset->fallbackMessage,
            'is_active'         => true,
        ])->save();
    }

    private function writeWidget(
        int $orgId,
        int $brandId,
        string $industry,
        ChatbotPreset $preset,
        array $input,
        string $companyName,
    ): void {
        $widget = ChatWidgetConfig::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('brand_id', $brandId)
            ->first();

        if (!$widget) {
            return; // signup always creates the shell; nothing to configure otherwise
        }

        $attrs = [
            'company_name'     => $companyName,
            'welcome_title'    => $preset->welcomeTitle,
            'welcome_subtitle' => $preset->welcomeSubtitle,
            'suggestions'      => $preset->suggestions,
            'show_suggestions' => true,
            // Fixes the "Powered by Hotel AI" default reaching a non-hotel
            // venue's public site. The column is nullable and nothing ever
            // wrote it, so the widget's hard-coded English fallback applied to
            // every org in every locale.
            'branding_text'    => $companyName !== '' ? "Powered by {$companyName}" : null,
        ];

        // The column default is the hotel gold '#c9a84c', which is truthy, so
        // the per-industry fallback further down the read path never fired for
        // any org that has ever existed. Only overwrite while it is still that
        // untouched default — a venue that picked its own colour keeps it.
        if (!$widget->primary_color || strtolower($widget->primary_color) === '#c9a84c') {
            $attrs['primary_color'] = OrganizationSetupService::industryPrimaryColor($industry);
        }

        // "Talk to a person" destination. Stored as typed; the public config
        // endpoint normalises it to wa.me-safe digits.
        $whatsapp = trim((string) ($input['handoff_whatsapp'] ?? ''));
        if ($whatsapp !== '') {
            $attrs['handoff_whatsapp'] = $whatsapp;
        }

        // Where to email when a visitor asks for a person. Without this the
        // only alert is a sound in an inbox somebody has to already have open.
        $handoffEmail = trim((string) ($input['handoff_email'] ?? ''));
        if ($handoffEmail !== '') {
            $attrs['handoff_email'] = $handoffEmail;
        }

        $tz = trim((string) ($input['timezone'] ?? ''));
        if ($tz !== '' && in_array($tz, timezone_identifiers_list(), true)) {
            $attrs['timezone'] = $tz;
        }

        $widget->fill($attrs)->save();
    }

    /**
     * @param  list<array{question:string,answer:string,keywords:list<string>}>  $entries
     */
    private function writeKnowledge(int $orgId, int $brandId, array $entries): int
    {
        if ($entries === []) {
            return 0;
        }

        // Re-running the wizard must not duplicate the FAQ. Match on the
        // question, which is preset-authored and stable.
        $existing = KnowledgeItem::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('brand_id', $brandId)
            ->pluck('question')
            ->map(fn ($q) => mb_strtolower(trim((string) $q)))
            ->all();

        $created = 0;

        foreach ($entries as $i => $entry) {
            if (in_array(mb_strtolower($entry['question']), $existing, true)) {
                continue;
            }

            KnowledgeItem::withoutGlobalScopes()->create([
                'organization_id' => $orgId,
                'brand_id'        => $brandId,
                'question'        => $entry['question'],
                'answer'          => $entry['answer'],
                'keywords'        => $entry['keywords'],
                // Starter facts answer the most common questions, so they should
                // win ties against anything imported later.
                'priority'        => 100 - $i,
                'is_active'       => true,
            ]);

            $created++;
        }

        return $created;
    }
}
