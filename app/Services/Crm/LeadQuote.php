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
    public static function fillAmounts(string $text, ?array $quote): ?string
    {
        if (! str_contains($text, '{{quote.')) {
            return $text;
        }
        if (($quote['status'] ?? null) !== 'valid') {
            return null;
        }
        $tokens = [];
        foreach (['unit_price', 'subtotal', 'charges', 'total'] as $field) {
            $tokens['{{quote.'.$field.'}}'] = $quote['currency'].' '.$quote[$field];
        }
        $filled = strtr($text, $tokens);

        return str_contains($filled, '{{quote.') ? null : $filled;
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
