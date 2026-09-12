<?php

namespace App\Services;

use App\Models\ChatConversation;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

/** Consented, same-site observed touches. Never joins visitors by fingerprint or contact data. */
class WidgetAttribution
{
    public const CHANNELS = ['google', 'meta', 'chatgpt', 'organic', 'social', 'direct', 'referral', 'email', 'other', 'internal', 'unknown'];
    public const EVIDENCE = ['utm', 'google_click', 'referrer', 'handoff'];

    public static function capture(ChatConversation $conversation, Request $request): void
    {
        if (! $request->exists('analytics_consent')) return; // Old clients cannot erase an existing snapshot.
        if ($request->input('analytics_consent') !== true) {
            $conversation->marketing_attribution = null;
            return;
        }
        // Once linked, the recorded enquiry's journey is frozen. Later visits cannot claim its credit.
        if ($conversation->inquiry_id) return;
        $url = (string) $request->input('page_url', $request->input('url', ''));
        $site = self::site($url);
        if (! $site || ($conversation->entry_source_site && $conversation->entry_source_site !== $site)) return;
        $incoming = $request->input('attribution');
        if (! is_array($incoming) || ($incoming['version'] ?? null) !== 1 || ! is_array($incoming['touches'] ?? null)) return;
        $saved = $conversation->marketing_attribution;
        if (is_array($saved) && ($saved['site'] ?? null) !== $site) return;
        $touches = self::cleanTouches(array_merge($saved['touches'] ?? [], array_slice($incoming['touches'], 0, 12)));
        $truncated = ($saved['truncated'] ?? false) === true || ($incoming['truncated'] ?? false) === true || count($touches) > 12;
        if (count($touches) > 12) $touches = array_merge([$touches[0]], array_slice($touches, -11));
        $conversation->marketing_attribution = ['version' => 1, 'site' => $site, 'touches' => $touches, 'truncated' => $truncated];
    }

    public static function site(string $url): ?string
    {
        $host = preg_replace('/^www\./', '', strtolower(parse_url($url, PHP_URL_HOST) ?? ''));
        return BusinessOutcomeReport::HOSTS[$host] ?? null;
    }

    public static function cleanTouches(array $rows, ?string $before = null): array
    {
        $now = CarbonImmutable::now('UTC');
        $end = $before ? CarbonImmutable::parse($before, 'UTC') : $now->addMinutes(5);
        $touches = [];
        foreach ($rows as $row) {
            if (! is_array($row) || ! in_array($row['channel'] ?? null, self::CHANNELS, true)
                || ! in_array($row['evidence'] ?? null, self::EVIDENCE, true)
                || ! is_string($row['observed_at'] ?? null)
                || ! preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/', $row['observed_at'])) continue;
            try { $at = CarbonImmutable::parse($row['observed_at'], 'UTC'); } catch (\Throwable) { continue; }
            if ($at->gt($end) || (! $before && $at->lt($now->subDays(30)))) continue;
            $campaign = $row['campaign_id'] ?? null;
            if (! is_string($campaign) || ! preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/D', $campaign)) $campaign = null;
            $touch = ['channel' => $row['channel'], 'campaign_id' => $campaign,
                'observed_at' => $at->toIso8601String(), 'evidence' => $row['evidence']];
            $touches[json_encode($touch)] = $touch;
        }
        $touches = array_values($touches);
        usort($touches, fn ($a, $b) => strcmp($a['observed_at'], $b['observed_at']));
        return $touches;
    }

    public static function exported(mixed $raw, string $site, string $before): ?array
    {
        if (is_string($raw)) $raw = json_decode($raw, true);
        if (! is_array($raw) || ($raw['version'] ?? null) !== 1 || ($raw['site'] ?? null) !== $site) return null;
        $touches = self::cleanTouches(is_array($raw['touches'] ?? null) ? $raw['touches'] : [], $before);
        if (! $touches) return null;
        return ['version' => 1, 'touches' => $touches, 'truncated' => ($raw['truncated'] ?? false) === true];
    }
}
