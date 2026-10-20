<?php

namespace App\Services\Content;

use App\Models\ContentLink;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Clicks on tracked links (spec 2026-10-19 §5.4): one row per link, venue day and source (`direct` | `bio`), raised by
 * one in a single upsert. HEAD requests, robots and prefetches are not counted. Nothing about the visitor is stored: no
 * IP address, cookie, user agent or referrer. Counts are taps, not people.
 */
final class ContentLinkClicks
{
    /**
     * Link-preview robots by name, and anything that calls itself a robot (§5.4). Pinterest by its crawler only
     * (`Pinterestbot`, `Pinterest/0.x`): people tapping inside Pinterest's app carry `[Pinterest/iOS]` and are counted
     * (owner, 2026-10-20).
     */
    public const ROBOTS = '/facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|discordbot|pinterestbot|pinterest\/0\.|applebot|vkshare|mastodon\/|cardyb|iframely|embedly|bot|crawl|spider|preview|headless/i';
    /** The panel's bars: the last 14 venue days (§5.5). */
    public const DAYS = 14;

    public static function isRobot(?string $userAgent): bool
    {
        return preg_match(self::ROBOTS, (string) $userAgent) === 1;
    }

    /** Whether a request on a short link is a click: not a HEAD request, not a robot, not a prefetch (owner, 2026-10-20). */
    public static function counts(Request $request): bool
    {
        if ($request->isMethod('HEAD') || self::isRobot($request->userAgent())) {
            return false;
        }
        $purpose = strtolower(implode(' ', array_filter([
            $request->header('Sec-Purpose'), $request->header('Purpose'), $request->header('X-Purpose'), $request->header('X-Moz'),
        ])));

        return !str_contains($purpose, 'prefetch') && !str_contains($purpose, 'preview');
    }

    /** One more click on the link's venue day. A counting failure is logged and never stops the visitor. */
    public static function count(ContentLink $link, string $via): void
    {
        try {
            DB::table('content_link_clicks')->upsert(
                [['link_id' => $link->id, 'day' => VenueClock::today((int) $link->organization_id), 'via' => $via, 'clicks' => 1]],
                ['link_id', 'day', 'via'],
                // Qualified: PostgreSQL calls a bare `clicks` ambiguous inside ON CONFLICT … DO UPDATE.
                ['clicks' => DB::raw('content_link_clicks.clicks + 1')],
            );
        } catch (\Throwable $e) {
            // At error: production logs nothing below it, and a count that keeps failing must show (final review).
            Log::error('content link: a click was not counted', ['link' => $link->id, 'error' => $e->getMessage()]);
        }
    }

    /**
     * The panel's numbers (§5.5): every click, those from the bio page, and the last DAYS venue days, oldest first, a
     * day without clicks included.
     *
     * @return array{clicks: int, clicks_bio: int, days: list<array{day: string, clicks: int}>}
     */
    public static function summary(ContentLink $link): array
    {
        $rows = DB::table('content_link_clicks')->where('link_id', $link->id)->get(['day', 'via', 'clicks']);
        $byDay = [];
        foreach ($rows as $row) {
            $day = substr((string) $row->day, 0, 10);
            $byDay[$day] = ($byDay[$day] ?? 0) + (int) $row->clicks;
        }
        $today = CarbonImmutable::parse(VenueClock::today((int) $link->organization_id));
        $days = [];
        for ($back = self::DAYS - 1; $back >= 0; $back--) {
            $day = $today->subDays($back)->toDateString();
            $days[] = ['day' => $day, 'clicks' => $byDay[$day] ?? 0];
        }

        return [
            'clicks'     => (int) $rows->sum('clicks'),
            'clicks_bio' => (int) $rows->where('via', 'bio')->sum('clicks'),
            'days'       => $days,
        ];
    }

    /**
     * Each link's clicks from `$from` (a venue date) on, both sources: the bio editor's last 30 days (§6.4).
     *
     * @param list<int> $linkIds
     * @return array<int, int>
     */
    public static function since(array $linkIds, string $from): array
    {
        if ($linkIds === []) {
            return [];
        }

        return DB::table('content_link_clicks')->whereIn('link_id', $linkIds)->where('day', '>=', $from)
            ->groupBy('link_id')->selectRaw('link_id, sum(clicks) as total')->pluck('total', 'link_id')
            ->mapWithKeys(fn ($total, $id) => [(int) $id => (int) $total])->all();
    }
}
