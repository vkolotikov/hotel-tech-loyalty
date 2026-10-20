<?php

namespace App\Services\Content\Web;

/**
 * robots.txt as the scan obeys it (spec 2026-10-20 §3.5): the group naming our robot, else `*`; `Allow`/`Disallow`
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
                } elseif ($name !== '' && str_contains($agent, $name)) {
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

    private static function matches(string $pattern, string $path): bool
    {
        $anchored = str_ends_with($pattern, '$');
        $core = $anchored ? substr($pattern, 0, -1) : $pattern;
        $regex = '#^' . implode('.*', array_map(fn (string $part) => preg_quote($part, '#'), explode('*', $core))) . ($anchored ? '$' : '') . '#';

        return preg_match($regex, $path) === 1;
    }
}
