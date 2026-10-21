<?php

namespace App\Services\Loyalty\Push;

use App\Models\NotificationCampaign;
use App\Services\Loyalty\Campaigns\CampaignAudience;
use App\Services\NotificationService;
use Illuminate\Database\Eloquent\Builder;

/**
 * A push message from HexaTech Loyalty (spec 2026-10-22 release 3 §5): a notification_campaigns row with `source`
 * `loyalty`, a title, a body, one of the member's own opt-out categories and a segment (member_segments). The full
 * admin's push campaigns are rows of the same table without a source; the workspace neither lists nor touches them.
 *
 * Draft → sending (PushStart's one conditional update) → sent (the last chunk), or cancelled (Cancel while sending),
 * or failed (a chunk gave up after its tries). Only a draft is changed or deleted.
 */
final class PushMessage
{
    public const SOURCE = 'loyalty';

    public const STATUS_DRAFT = 'draft';
    public const STATUS_SENDING = 'sending';
    public const STATUS_SENT = 'sent';
    public const STATUS_CANCELLED = 'cancelled';
    public const STATUS_FAILED = 'failed';

    public const MAX_NAME = 120;
    /** The longest title the server keeps; phones show about the first TITLE_GUIDE characters in full. */
    public const MAX_TITLE = 100;
    public const TITLE_GUIDE = 40;
    /** The longest body the server keeps; a lock screen shows about the first BODY_GUIDE characters. */
    public const MAX_BODY = 500;
    public const BODY_GUIDE = 150;

    /** The most members one message is handed: the email campaigns' own cap. */
    public const LIMIT = CampaignAudience::LIMIT;

    /** A delivery row's outcomes (push_message_deliveries.status). */
    public const OUTCOMES = ['sent', 'failed', 'inbox_only', 'skipped', 'pending'];

    /** This organisation's push messages (the tenant scope applies), the full admin's campaigns left out. */
    public static function query(): Builder
    {
        return NotificationCampaign::query()->where('source', self::SOURCE);
    }

    /**
     * The editor's choices: the categories (the member's own opt-out switches, NotificationService::CATEGORIES) and
     * the limits. The workspace keeps no copy of either.
     *
     * @return array<string, mixed>
     */
    public static function options(): array
    {
        return [
            'categories'  => NotificationService::CATEGORIES,
            'max_name'    => self::MAX_NAME,
            'max_title'   => self::MAX_TITLE,
            'title_guide' => self::TITLE_GUIDE,
            'max_body'    => self::MAX_BODY,
            'body_guide'  => self::BODY_GUIDE,
            'limit'       => self::LIMIT,
        ];
    }

    /** Whether a category is one a message can be sent under. */
    public static function isCategory(mixed $category): bool
    {
        return is_string($category) && in_array($category, NotificationService::CATEGORIES, true);
    }

    /**
     * What a draft still lacks before it can be sent: a title, a body, a category. (A segment is the audience's own
     * check, `no_audience`, as for email.)
     *
     * @return list<string> `title`, `body`, `category`
     */
    public static function incomplete(NotificationCampaign $m): array
    {
        $missing = [];
        if (trim((string) $m->title) === '') {
            $missing[] = 'title';
        }
        if (trim((string) $m->body) === '') {
            $missing[] = 'body';
        }
        if (!self::isCategory($m->category)) {
            $missing[] = 'category';
        }

        return $missing;
    }

    /** The draft's revision as its page shows it and Send sends it back. */
    public static function revision(NotificationCampaign $m): string
    {
        return (string) $m->updated_at?->toIso8601String();
    }
}
