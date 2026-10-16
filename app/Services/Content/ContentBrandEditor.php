<?php

namespace App\Services\Content;

use App\Models\ContentPlannerAudience;
use App\Models\ContentPlannerBrandVoice;
use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\Organization;
use App\Models\User;
use App\Services\ContentKnowledgeService;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

/**
 * The brand profile, edited one section at a time and in place (spec
 * 2026-10-14 §4.6, §7 F1): audiences, channels and the voice keep their ids,
 * so posts keep their links; removing an audience leaves its posts and
 * channels without it, never without anything else. Each change rescores the
 * profile's readiness (and saves it: a change is the moment to). AI strings
 * from quick setup are cut to their columns first (F8).
 */
final class ContentBrandEditor
{
    /** PostgreSQL's varchar limits on the planner's tables (the "widen" migration made the rest text). */
    public const PROFILE_LIMITS = ['name' => 255, 'default_language' => 10, 'default_tone' => 100, 'price_position' => 50, 'trend_mode' => 50];
    public const AUDIENCE_LIMITS = ['name' => 255, 'language' => 10];
    public const CHANNEL_LIMITS = ['platform' => 50, 'label' => 255, 'url' => 255, 'default_language' => 10, 'emoji_policy' => 50, 'hashtag_policy' => 50];
    public const VOICE_LIMITS = ['name' => 255, 'tone' => 100, 'style' => 100, 'formality_level' => 50, 'emoji_policy' => 50, 'hashtag_policy' => 50, 'sentence_style' => 50, 'point_of_view' => 50];

    private const PROFILE_FIELDS = ['name', 'default_language', 'default_tone', 'primary_goal', 'secondary_goals', 'content_rules', 'brand_summary', 'usp', 'mission', 'brand_values', 'brand_promise', 'differentiators', 'proof_points', 'price_position', 'main_cta', 'important_links', 'positioning', 'key_messages', 'content_mix', 'weekly_rhythm', 'engagement_goals', 'visual_style', 'trend_mode', 'setup_step', 'holiday_country', 'marketing_days'];
    private const AUDIENCE_FIELDS = ['name', 'description', 'industry', 'country', 'business_size', 'job_role', 'preferred_tone', 'language', 'pain_points', 'goals', 'fears', 'objections', 'buying_triggers', 'emotional_triggers', 'rational_triggers', 'questions', 'preferred_platforms', 'content_they_trust', 'desired_transformation', 'is_ai_assumed'];
    private const CHANNEL_FIELDS = ['platform', 'label', 'url', 'goal', 'role', 'cta_style', 'visual_style', 'link_policy', 'tone_override', 'default_language', 'emoji_policy', 'hashtag_policy', 'posts_per_week', 'preferred_formats', 'frequency', 'active', 'post_time'];
    private const VOICE_FIELDS = ['tone', 'style', 'formality_level', 'emoji_policy', 'hashtag_policy', 'sentence_style', 'point_of_view', 'preferred_words', 'forbidden_words', 'claims_to_avoid', 'example_good_posts', 'example_bad_posts'];

    public function __construct(private ContentKnowledgeService $knowledge)
    {
    }

    /**
     * Refuses a quick setup for a brand that is already set up — read from what is stored, so a run that finished
     * while this request waited for the lock is seen (spec 2026-10-15 §3.2).
     */
    public function refuseIfSetUp(ContentPlannerProfile $profile): void
    {
        if (ContentPlannerProfile::whereKey($profile->id)->whereNotNull('setup_completed_at')->exists()) {
            throw new ContentRefused('already_set_up', 'This brand is already set up — change it section by section.', 409);
        }
    }

    /** The brand's profile, created as an empty shell the first time a manager saves any part of it. */
    public function profileFor(Organization $org, User $user): ContentPlannerProfile
    {
        return ContentPlannerProfile::firstOrCreate(
            ['brand_id' => ContentContext::brandId()],
            ['name' => mb_substr($org->name . ' Content Plan', 0, 255), 'default_language' => 'en', 'created_by' => $user->id],
        );
    }

    /** @param array<string, mixed> $fields */
    public function saveProfile(ContentPlannerProfile $profile, array $fields): void
    {
        $profile->fill(Arr::only($fields, self::PROFILE_FIELDS))->save();
        $this->knowledge->readinessFor($profile);
    }

    /** @param array<string, mixed> $fields */
    public function saveVoice(ContentPlannerProfile $profile, array $fields): ContentPlannerBrandVoice
    {
        $voice = $profile->brandVoices()->where('active', true)->first()
            ?? $profile->brandVoices()->make(['name' => 'Default', 'brand_id' => $profile->brand_id, 'active' => true]);
        $voice->fill(Arr::only($fields, self::VOICE_FIELDS))->save();
        $this->knowledge->readinessFor($profile);

        return $voice;
    }

    /** @param array<string, mixed> $fields */
    public function createAudience(ContentPlannerProfile $profile, array $fields): ContentPlannerAudience
    {
        $audience = $profile->audiences()->create(Arr::only($fields, self::AUDIENCE_FIELDS) + ['brand_id' => $profile->brand_id, 'active' => true]);
        $this->knowledge->readinessFor($profile);

        return $audience;
    }

    /** @param array<string, mixed> $fields */
    public function updateAudience(ContentPlannerProfile $profile, ContentPlannerAudience $audience, array $fields): void
    {
        $audience->fill(Arr::only($fields, self::AUDIENCE_FIELDS))->save();
        $this->knowledge->readinessFor($profile);
    }

    public function deleteAudience(ContentPlannerProfile $profile, ContentPlannerAudience $audience): void
    {
        DB::transaction(function () use ($audience) {
            ContentPlannerPost::where('audience_id', $audience->id)->update(['audience_id' => null]);
            ContentPlannerChannel::where('audience_id', $audience->id)->update(['audience_id' => null]);
            $audience->delete();
        });
        $this->knowledge->readinessFor($profile);
    }

    /** @param array<string, mixed> $fields */
    public function createChannel(ContentPlannerProfile $profile, array $fields): ContentPlannerChannel
    {
        $channel = $profile->channels()->create(Arr::only($fields, [...self::CHANNEL_FIELDS, 'audience_id']) + ['brand_id' => $profile->brand_id, 'active' => true]);
        $this->knowledge->readinessFor($profile);

        return $channel;
    }

    /** @param array<string, mixed> $fields */
    public function updateChannel(ContentPlannerProfile $profile, ContentPlannerChannel $channel, array $fields): void
    {
        $channel->fill(Arr::only($fields, [...self::CHANNEL_FIELDS, 'audience_id']))->save();
        $this->knowledge->readinessFor($profile);
    }

    public function deleteChannel(ContentPlannerProfile $profile, ContentPlannerChannel $channel): void
    {
        $channel->delete();
        $this->knowledge->readinessFor($profile);
    }

    /**
     * Quick setup's answer written into a brand that has no audiences,
     * channels or voice of that kind yet (spec §4.6). Strings are cut to
     * their columns; channels on a platform HexaTech Content does not know
     * are left out; a channel's audience_index maps to the audience made here.
     *
     * Profile fields: on a profile that existed before (a guided setup begun
     * first) the AI fills only what is empty, and an empty AI answer never
     * wipes anything; what the manager gave in the quick setup form itself
     * ($given: name, language, goal) always applies.
     *
     * @param array<string, mixed> $payload
     * @param array<string, mixed> $given
     */
    public function applyPayload(ContentPlannerProfile $profile, array $payload, array $given = []): void
    {
        $blank = fn ($value) => $value === null || $value === '' || $value === [];
        $fields = array_filter(self::clamp(Arr::only($payload, self::PROFILE_FIELDS), self::PROFILE_LIMITS), fn ($value) => !$blank($value));
        if (!$profile->wasRecentlyCreated) {
            $fields = array_filter($fields, fn ($value, $field) => $blank($profile->getAttribute($field)), ARRAY_FILTER_USE_BOTH);
        }
        $given = array_filter(self::clamp(Arr::only($given, ['name', 'default_language', 'primary_goal']), self::PROFILE_LIMITS), fn ($value) => !$blank($value));

        DB::transaction(function () use ($profile, $payload, $fields, $given) {
            $profile->fill($given + $fields + ['setup_completed_at' => now()])->save();

            $audienceIds = [];
            if (!$profile->audiences()->exists()) {
                foreach ((array) ($payload['audiences'] ?? []) as $audience) {
                    if (is_array($audience)) {
                        $audienceIds[] = (int) $profile->audiences()->create(
                            self::clamp(Arr::only($audience, self::AUDIENCE_FIELDS) + ['name' => 'Audience'], self::AUDIENCE_LIMITS)
                            + ['brand_id' => $profile->brand_id, 'active' => true]
                        )->id;
                    }
                }
            }

            if (!$profile->channels()->exists()) {
                foreach ((array) ($payload['channels'] ?? []) as $channel) {
                    if (!is_array($channel) || !in_array($channel['platform'] ?? null, ContentRules::PLATFORMS, true)) {
                        continue;
                    }
                    $index = $channel['audience_index'] ?? null;
                    $profile->channels()->create(
                        self::clamp(Arr::only($channel, self::CHANNEL_FIELDS) + ['label' => ucfirst((string) $channel['platform'])], self::CHANNEL_LIMITS)
                        + [
                            'audience_id' => is_int($index) && isset($audienceIds[$index]) ? $audienceIds[$index] : null,
                            'brand_id'    => $profile->brand_id,
                            'active'      => true,
                        ]
                    );
                }
            }

            $voice = $payload['brand_voice'] ?? null;
            if (is_array($voice) && !$profile->brandVoices()->exists()) {
                $profile->brandVoices()->create(
                    self::clamp(Arr::only($voice, self::VOICE_FIELDS), self::VOICE_LIMITS)
                    + ['name' => 'Default', 'brand_id' => $profile->brand_id, 'active' => true]
                );
            }
        });
        $this->knowledge->readinessFor($profile);
    }

    /**
     * Each field with a limit cut to it by characters (never bytes: a byte cut
     * breaks UTF-8); a list or object where text belongs becomes null.
     *
     * @param array<string, mixed> $values
     * @param array<string, int> $limits
     * @return array<string, mixed>
     */
    public static function clamp(array $values, array $limits): array
    {
        foreach ($limits as $field => $limit) {
            if (!array_key_exists($field, $values) || $values[$field] === null) {
                continue;
            }
            $values[$field] = is_scalar($values[$field]) ? mb_substr((string) $values[$field], 0, $limit) : null;
        }

        return $values;
    }
}
