<?php

namespace App\Services\Loyalty\Campaigns;

/**
 * A campaign's body as HexaTech Loyalty writes it (spec 2026-10-21 release 2 §6): blocks in the format of the full
 * admin's EmailBlockBuilder (`frontend/src/components/EmailBlockBuilder.tsx`), so either side can open a draft the
 * other made, and the email rendered from them here, on the server. The client never sends HTML.
 *
 * The workspace writes four of the builder's six blocks — heading, text, button, divider — and the spacer, with the
 * builder's keys and defaults. `render()` mirrors the builder's `renderBlocksToHtml()` closely enough that the two
 * previews and the sent email look alike; every text goes through e() (the builder's own `esc()`), a line break
 * becomes `<br>`, a colour must be a hex colour (so a style attribute cannot be widened), and a link must be http,
 * https or mailto (anything else renders as `#`, and is refused when saved). A draft whose blocks are not all of this
 * subset (an image, or HTML written by hand in the full admin) is not edited or sent here (`editable()`).
 */
final class CampaignBody
{
    public const TYPES = ['heading', 'text', 'button', 'divider', 'spacer'];
    public const MAX_BLOCKS = 100;
    public const ALIGNS = ['left', 'center', 'right'];
    public const LEVELS = [1, 2, 3];
    /** The builder's text sizes. */
    public const FONT_SIZES = [12, 13, 14, 15, 16, 18];
    public const SPACER_MIN = 4;
    public const SPACER_MAX = 160;
    public const MAX_HEADING = 500;
    public const MAX_TEXT = 5000;
    public const MAX_LABEL = 200;
    public const MAX_URL = 2000;

    /** Each block's keys in the builder's order, with a new block's look as its `createBlock()` gives it. */
    private const SHAPES = [
        'heading' => ['text' => '', 'level' => 1, 'align' => 'left', 'color' => '#1a1a1a'],
        'text'    => ['text' => '', 'color' => '#555555', 'align' => 'left', 'fontSize' => 15],
        'button'  => ['text' => '', 'url' => '', 'bgColor' => '#c9a84c', 'textColor' => '#0e0e0e', 'align' => 'center'],
        'divider' => ['color' => '#e5e5e5'],
        'spacer'  => ['height' => 24],
    ];

    /** The keys that are a block's look (a missing one takes the default). */
    private const LOOK = ['level', 'align', 'color', 'fontSize', 'bgColor', 'textColor', 'height'];

    /**
     * The editor's choices, served so the workspace keeps no copy of a list this class checks: the block types, a new
     * block of each (the builder's defaults, empty texts), the alignments, heading levels, text sizes and limits.
     *
     * @return array<string, mixed>
     */
    public static function options(): array
    {
        return [
            'block_types' => self::TYPES,
            'new_blocks'  => self::SHAPES,
            'aligns'      => self::ALIGNS,
            'levels'      => self::LEVELS,
            'font_sizes'  => self::FONT_SIZES,
            'max_blocks'  => self::MAX_BLOCKS,
            'max_text'    => ['heading' => self::MAX_HEADING, 'text' => self::MAX_TEXT, 'button' => self::MAX_LABEL],
            'max_url'     => self::MAX_URL,
            'spacer'      => ['min' => self::SPACER_MIN, 'max' => self::SPACER_MAX],
            'max_name'    => 120,
            'max_subject' => 200,
        ];
    }

    /**
     * The blocks a request sent, read into the builder's shape (only its keys, a missing look key at the builder's
     * default), and the problems by field (`body_blocks.<i>.<key>`, Laravel's form). A text may be empty and a
     * button's link may be empty in a draft; Send refuses those (`missing()`).
     *
     * @return array{0: list<array<string, mixed>>, 1: array<string, string>}
     */
    public static function read(mixed $blocks): array
    {
        if (!is_array($blocks) || !array_is_list($blocks)) {
            return [[], ['body_blocks' => 'The body must be a list of blocks.']];
        }
        if (count($blocks) > self::MAX_BLOCKS) {
            return [[], ['body_blocks' => 'At most ' . self::MAX_BLOCKS . ' blocks.']];
        }
        $out = [];
        $problems = [];
        foreach ($blocks as $i => $block) {
            $at = "body_blocks.{$i}";
            if (!is_array($block) || !in_array($block['type'] ?? null, self::TYPES, true)) {
                $problems["{$at}.type"] = 'This kind of block is not written here.';
                continue;
            }
            $type = $block['type'];
            $id = $block['id'] ?? null;
            if (!is_string($id) || !preg_match('/^[A-Za-z0-9_-]{1,40}$/', $id)) {
                $problems["{$at}.id"] = 'A block needs its id.';
            }
            $b = ['id' => (string) $id, 'type' => $type] + self::SHAPES[$type];
            foreach (self::LOOK as $key) {
                if (array_key_exists($key, $b) && array_key_exists($key, $block)) {
                    $b[$key] = $block[$key];
                }
            }

            if (in_array($type, ['heading', 'text', 'button'], true)) {
                $text = $block['text'] ?? '';
                $max = ['heading' => self::MAX_HEADING, 'text' => self::MAX_TEXT, 'button' => self::MAX_LABEL][$type];
                if (!is_string($text) || mb_strlen($text) > $max) {
                    $problems["{$at}.text"] = "Up to {$max} characters.";
                }
                $b['text'] = is_string($text) ? $text : '';
            }
            if ($type === 'button') {
                $url = $block['url'] ?? '';
                // The builder's new button starts at a bare "https://": no link yet, which Send then asks for.
                $url = is_string($url) && preg_match('#^\s*https?://\s*$#i', $url) ? '' : $url;
                if (!is_string($url) || ($url !== '' && !self::link($url))) {
                    $problems["{$at}.url"] = 'A link starts with https://, http:// or mailto:.';
                }
                $b['url'] = is_string($url) ? trim($url) : '';
            }
            foreach (['color', 'bgColor', 'textColor'] as $key) {
                if (array_key_exists($key, $b) && !self::colour($b[$key])) {
                    $problems["{$at}.{$key}"] = 'A colour is written #rrggbb.';
                }
            }
            if (array_key_exists('align', $b) && !in_array($b['align'], self::ALIGNS, true)) {
                $problems["{$at}.align"] = 'Left, center or right.';
            }
            if ($type === 'heading' && !in_array($b['level'], self::LEVELS, true)) {
                $problems["{$at}.level"] = 'A heading is large, medium or small.';
            }
            if ($type === 'text' && !in_array($b['fontSize'], self::FONT_SIZES, true)) {
                $problems["{$at}.fontSize"] = 'One of the builder\'s sizes.';
            }
            if ($type === 'spacer' && (!is_int($b['height']) || $b['height'] < self::SPACER_MIN || $b['height'] > self::SPACER_MAX)) {
                $problems["{$at}.height"] = 'From ' . self::SPACER_MIN . ' to ' . self::SPACER_MAX . ' pixels.';
            }
            $out[] = $b;
        }

        return [$problems === [] ? $out : [], $problems];
    }

    /**
     * Whether the workspace may edit and send a draft with these stored blocks and this HTML: every block one of the
     * workspace's, as the workspace would write it. A draft without blocks counts only while it has no HTML either
     * (nothing to lose); HTML written by hand in the full admin, or an image block, stays the full admin's.
     */
    public static function editable(mixed $blocks, ?string $html): bool
    {
        if ($blocks === null || $blocks === []) {
            return trim((string) $html) === '';
        }
        [, $problems] = self::read($blocks);

        return $problems === [];
    }

    /** The email's HTML for the blocks (already read), as the builder renders them; empty for no blocks. */
    public static function render(array $blocks): string
    {
        if ($blocks === []) {
            return '';
        }
        $body = implode("\n", array_map(fn (array $b) => self::block($b), $blocks));

        return '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;color:#1a1a1a;">' . $body . '</div>';
    }

    /**
     * What a body still lacks before it may be sent: `body` when no heading, text or button says anything, and
     * `button` with the index of each button without a label or a link.
     *
     * @param list<array<string, mixed>> $blocks
     * @return array{body: bool, buttons: list<int>}
     */
    public static function missing(array $blocks): array
    {
        $said = false;
        $buttons = [];
        foreach ($blocks as $i => $b) {
            $text = trim((string) ($b['text'] ?? ''));
            if (in_array($b['type'] ?? null, ['heading', 'text', 'button'], true) && $text !== '') {
                $said = true;
            }
            if (($b['type'] ?? null) === 'button' && ($text === '' || !self::link((string) ($b['url'] ?? '')))) {
                $buttons[] = $i;
            }
        }

        return ['body' => !$said, 'buttons' => $buttons];
    }

    /** A link a member may be sent to: http or https with a host, or a mailto address. */
    public static function link(string $url): bool
    {
        $url = trim($url);
        if ($url === '' || mb_strlen($url) > self::MAX_URL || preg_match('/[\s"\'<>`]/', $url)) {
            return false;
        }
        if (preg_match('/^mailto:[^@\/?]+@[^@\/?]+\.[^@\/?]+(\?.*)?$/i', $url)) {
            return true;
        }
        if (!preg_match('#^https?://#i', $url) || filter_var($url, FILTER_VALIDATE_URL) === false) {
            return false;
        }

        return (string) parse_url($url, PHP_URL_HOST) !== '';
    }

    private static function colour(mixed $value): bool
    {
        return is_string($value) && preg_match('/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $value) === 1;
    }

    /** The builder's escape, then its line breaks. */
    private static function lines(string $text): string
    {
        return str_replace(["\r\n", "\n"], '<br>', e($text));
    }

    /** @param array<string, mixed> $b */
    private static function block(array $b): string
    {
        $align = in_array($b['align'] ?? null, self::ALIGNS, true) ? $b['align'] : 'left';
        $colour = fn (string $key, string $fallback) => self::colour($b[$key] ?? null) ? e($b[$key]) : $fallback;

        switch ($b['type']) {
            case 'heading':
                $level = in_array($b['level'] ?? null, self::LEVELS, true) ? $b['level'] : 1;
                $size = [1 => 32, 2 => 24, 3 => 18][$level];

                return "<h{$level} style=\"margin:24px 24px 12px;font-size:{$size}px;font-weight:bold;text-align:{$align};color:{$colour('color', '#1a1a1a')};line-height:1.25;\">"
                    . self::lines((string) ($b['text'] ?? '')) . "</h{$level}>";

            case 'text':
                $size = in_array($b['fontSize'] ?? null, self::FONT_SIZES, true) ? $b['fontSize'] : 15;

                return "<p style=\"margin:0 24px 16px;font-size:{$size}px;line-height:1.6;text-align:{$align};color:{$colour('color', '#555555')};\">"
                    . self::lines((string) ($b['text'] ?? '')) . '</p>';

            case 'button':
                $url = (string) ($b['url'] ?? '');
                $href = self::link($url) ? e(trim($url)) : '#';

                return "<div style=\"text-align:{$align};padding:8px 24px 16px;\"><a href=\"{$href}\" style=\"background:{$colour('bgColor', '#c9a84c')};color:{$colour('textColor', '#0e0e0e')};padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;font-size:14px;\">"
                    . self::lines((string) ($b['text'] ?? '')) . '</a></div>';

            case 'divider':
                return "<div style=\"padding:8px 24px;\"><hr style=\"border:none;border-top:1px solid {$colour('color', '#e5e5e5')};margin:0;\" /></div>";

            default:
                $h = max(self::SPACER_MIN, min(self::SPACER_MAX, (int) ($b['height'] ?? 24)));

                return "<div style=\"height:{$h}px;line-height:{$h}px;font-size:1px;\">&nbsp;</div>";
        }
    }
}
