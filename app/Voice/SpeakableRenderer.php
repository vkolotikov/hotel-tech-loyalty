<?php

namespace App\Voice;

use Carbon\CarbonImmutable;
use NumberFormatter;

class SpeakableRenderer
{
    /** Any key containing one of these is contact data and never spoken. */
    private const CONTACT_NEEDLES = ['email', 'phone', 'mobile', 'passport'];

    private NumberFormatter $spellout;

    private NumberFormatter $ordinal;

    public function __construct(private string $locale = 'en')
    {
        $this->spellout = new NumberFormatter($this->locale, NumberFormatter::SPELLOUT);

        // "the fourth of September", not "the four of September".
        $this->ordinal = new NumberFormatter($this->locale, NumberFormatter::SPELLOUT);
        $this->ordinal->setTextAttribute(NumberFormatter::DEFAULT_RULESET, '%spellout-ordinal');
    }

    public function countPhrase(int $count, string $singular, string $plural): string
    {
        $word = $count === 0 ? 'no' : $this->spellout->format($count);

        return $word.' '.($count === 1 ? $singular : $plural);
    }

    public function personName(?string $fullName): string
    {
        $parts = preg_split('/\s+/u', trim((string) $fullName), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        if ($parts === []) {
            return 'an unnamed customer';
        }

        $first = array_shift($parts);
        if ($parts === []) {
            return $first;
        }

        return $first.' '.mb_strtoupper(mb_substr((string) end($parts), 0, 1)).'.';
    }

    public function redactContact(array $record): array
    {
        $clean = [];
        $hadContact = false;

        foreach ($record as $key => $value) {
            if (is_string($key) && $this->isContactKey($key)) {
                $hadContact = $hadContact || filled($value);

                continue;
            }
            $clean[$key] = is_array($value) ? $this->redactContact($value) : $value;
        }

        $clean['contact_on_file'] = $hadContact;

        return $clean;
    }

    public function dayPhrase(string $date, string $today): string
    {
        $day = CarbonImmutable::parse($date)->startOfDay();
        $reference = CarbonImmutable::parse($today)->startOfDay();

        return match ((int) $reference->diffInDays($day, false)) {
            0 => 'today',
            -1 => 'yesterday',
            1 => 'tomorrow',
            default => $day->format('l').' the '
                .$this->ordinal->format((int) $day->format('j')).' of '.$day->format('F'),
        };
    }

    private function isContactKey(string $key): bool
    {
        $lower = mb_strtolower($key);
        foreach (self::CONTACT_NEEDLES as $needle) {
            if (str_contains($lower, $needle)) {
                return true;
            }
        }

        return false;
    }
}
