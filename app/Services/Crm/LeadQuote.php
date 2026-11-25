<?php

namespace App\Services\Crm;

use Brick\Math\BigDecimal;
use Illuminate\Support\Arr;

/** A manager's snapshot of an authorised quote on this opportunity. All amounts use the quote's currency. */
final class LeadQuote
{
    public static function rules(): array
    {
        $amount = ['required_with:quote', 'regex:/^\d{1,10}(?:\.\d{1,4})?$/D'];

        return [
            'revision' => 'required|integer|min:0',
            'quote' => 'present|nullable|min:1|array:reference,scope,currency,quantity,unit_price,charges,tax_basis,valid_until',
            'quote.reference' => 'required_with:quote|string|max:100', 'quote.scope' => 'required_with:quote|string|max:600',
            'quote.currency' => ['required_with:quote', \Illuminate\Validation\Rule::in(EmailPriceCheck::currencyCodes())],
            'quote.quantity' => 'required_with:quote|integer|between:1,10000000', 'quote.unit_price' => $amount,
            'quote.charges' => ['nullable', 'regex:/^\d{1,10}(?:\.\d{1,4})?$/D'],
            'quote.tax_basis' => 'required_with:quote|in:included,excluded,unspecified',
            'quote.valid_until' => 'required_with:quote|date_format:Y-m-d',
        ];
    }

    public static function approved(array $quote, int $actor): array
    {
        $unit = BigDecimal::of((string) $quote['unit_price']);
        $charges = BigDecimal::of((string) ($quote['charges'] ?? '0'));
        $quantity = (int) $quote['quantity'];
        $subtotal = $unit->multipliedBy($quantity);

        return [...Arr::only($quote, ['reference', 'scope', 'currency', 'tax_basis', 'valid_until']),
            'quantity' => $quantity, 'unit_price' => (string) $unit, 'charges' => (string) $charges,
            'subtotal' => (string) $subtotal, 'total' => (string) $subtotal->plus($charges),
            'approved_by' => $actor, 'approved_at' => now()->toISOString()];
    }

    /** Insert approved amounts into the model's prose with their currency. Unknown markers require review. */
    public static function fillAmounts(string $text, ?array $quote, string $locale = ''): ?string
    {
        if (! str_contains($text, '{{quote.')) {
            return $text;
        }
        if (($quote['status'] ?? null) !== 'valid') {
            return null;
        }
        $tokens = [];
        foreach (['unit_price', 'subtotal', 'charges', 'total'] as $field) {
            $tokens['{{quote.'.$field.'}}'] = self::formatAmount($quote[$field], $quote['currency'], $locale);
        }
        $filled = strtr($text, $tokens);

        return str_contains($filled, '{{quote.') ? null : $filled;
    }

    private static function formatAmount(string $amount, string $currency, string $locale): string
    {
        $fallback = $currency.' '.$amount;
        if (! preg_match('/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/iD', $locale) || ! class_exists(\NumberFormatter::class)) {
            return $fallback;
        }
        $money = new \NumberFormatter($locale, \NumberFormatter::CURRENCY);
        $decimal = new \NumberFormatter($locale, \NumberFormatter::DECIMAL);
        // Format only an integer and a one-unit currency pattern through ICU. The approved fraction stays exact.
        $pattern = $money->formatCurrency(1, $currency);
        [$whole, $fraction] = array_pad(explode('.', $amount, 2), 2, '');
        $number = $decimal->format((int) $whole, \NumberFormatter::TYPE_INT64);
        if ($pattern === false || $number === false) {
            return $fallback;
        }
        if ($fraction !== '') {
            $number .= $decimal->getSymbol(\NumberFormatter::DECIMAL_SEPARATOR_SYMBOL).$fraction;
        }

        return preg_replace_callback('/\p{N}+(?:[.,\x{066b}]\p{N}+)*/u', fn () => $number, $pattern, 1) ?? $fallback;
    }

    public static function forDraft(?array $quote, string $today): ?array
    {
        if (! $quote) {
            return null;
        }
        $expired = $quote['valid_until'] < $today;
        $evidence = Arr::except($quote, ['approved_by', 'approved_at', 'contact_id']);
        if ($expired) {
            $evidence = Arr::except($evidence, ['unit_price', 'charges', 'subtotal', 'total']);
        }

        return ['status' => $expired ? 'expired' : 'valid', ...$evidence];
    }
}
