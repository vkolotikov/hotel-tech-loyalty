<?php

namespace App\Services\Content\Web;

/**
 * robots.txt as the scan obeys it (spec 2026-10-20 §3.5): the group naming our robot (by its whole name), else `*`; `Allow`/`Disallow`
 * with `*` and `$`; the longest matching rule wins and an `Allow` wins a tie. `Sitemap:` lines are kept for discovery.
 */
final class RobotsRules
{
    /**
     * @param list<array{0: bool, 1: string}> $rules [allow, pattern]
     * @param list<string> $sitemaps
     */
    private function __construct(private readonly array $rules, public readonly array $sitemaps)
    {
    }

    public static function allowAll(): self
    {
        return new self([], []);
    }

    public static function parse(string $text, string $agent): self
    {
        $agent = strtolower($agent);
        $groups = [];
        $sitemaps = [];
        $lastWasAgent = false;
        foreach (preg_split('/\r\n|\r|\n/', $text) ?: [] as $line) {
            $line = trim((string) preg_replace('/#.*$/', '', $line));
            if ($line === '' || !str_contains($line, ':')) {
                continue;
            }
            [$key, $value] = array_map('trim', explode(':', $line, 2));
            $key = strtolower($key);
            if ($key === 'sitemap') {
                if ($value !== '') {
                    $sitemaps[] = $value;
                }
                continue;
            }
            if ($key === 'user-agent') {
                if (!$lastWasAgent) {
                    $groups[] = ['agents' => [], 'rules' => []];
                }
                $groups[count($groups) - 1]['agents'][] = strtolower($value);
                $lastWasAgent = true;
                continue;
            }
            $lastWasAgent = false;
            if (($key === 'allow' || $key === 'disallow') && $groups !== []) {
                $groups[count($groups) - 1]['rules'][] = [$key === 'allow', $value];
            }
        }
        $mine = [];
        $any = [];
        $named = false;
        foreach ($groups as $group) {
            foreach ($group['agents'] as $name) {
                if ($name === '*') {
                    array_push($any, ...$group['rules']);
                } elseif (self::token($name) === $agent) {
                    $named = true;
                    array_push($mine, ...$group['rules']);
                }
            }
        }

        return new self($named ? $mine : $any, $sitemaps);
    }

    public function allows(string $pathAndQuery): bool
    {
        $best = -1;
        $allowed = true;
        foreach ($this->rules as [$allow, $pattern]) {
            if ($pattern === '' || !self::matches($pattern, $pathAndQuery)) {
                continue;
            }
            $length = strlen($pattern);
            if ($length > $best || ($length === $best && $allow)) {
                $best = $length;
                $allowed = $allow;
            }
        }

        return $allowed;
    }

    /**
     * A group's name as the robot it names: "HexaTechContentBot/1.0" is ours, "bot" is not (RFC 9309 §2.2.1: the whole
     * product token, any case; final review, 6-1).
     */
    private static function token(string $name): string
    {
        return (string) preg_split('#[/\s]#', $name, 2)[0];
    }

    /**
     * `*` matches any run of characters and a final `$` the end, read left to right without the regex engine: a pattern
     * with many stars cannot run into its limits (final review, 6-1). The first part is a prefix; each middle part is
     * found at its earliest place after the one before (the earliest place never loses a match); the last part ends the
     * path when anchored, else is found anywhere after.
     */
    private static function matches(string $pattern, string $path): bool
    {
        $anchored = str_ends_with($pattern, '$');
        $parts = explode('*', $anchored ? substr($pattern, 0, -1) : $pattern);
        $last = count($parts) - 1;
        if (!str_starts_with($path, $parts[0])) {
            return false;
        }
        $at = strlen($parts[0]);
        if ($last === 0) {
            return !$anchored || $at === strlen($path);
        }
        for ($i = 1; $i < $last; $i++) {
            if ($parts[$i] === '') {
                continue;
            }
            $found = strpos($path, $parts[$i], $at);
            if ($found === false) {
                return false;
            }
            $at = $found + strlen($parts[$i]);
        }
        $tail = $parts[$last];
        if ($anchored) {
            return strlen($path) - strlen($tail) >= $at && str_ends_with($path, $tail);
        }

        return $tail === '' || strpos($path, $tail, $at) !== false;
    }
}
