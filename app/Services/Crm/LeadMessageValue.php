<?php

namespace App\Services\Crm;

use App\Models\Guest;
use App\Models\Inquiry;
use App\Services\Integrations\CrmMail;
use Brick\Math\BigDecimal;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

final class LeadMessageValue
{
    /** Read only a verified thread head for a uniquely matched opportunity. */
    public static function capture(CrmMail $mail, Guest $guest, array $state): array
    {
        $threads = $state['threads'] ?? [];
        if (! $threads || ($state['identity'] ?? '') !== LeadCorrespondenceSync::emailIdentity($guest)) {
            return $state;
        }
        $leads = DB::table('inquiries')->where('organization_id', CrmMail::ORGANIZATION)
            ->where('brand_id', CrmMail::BRAND)->where('guest_id', $guest->id)
            ->whereNull('total_value')->whereNull('rate_offered')->where(fn ($q) => $q->whereNull('paid_amount')->orWhere('paid_amount', 0))
            ->get(['id', 'currency']);
        if ($leads->isEmpty()) {
            return $state;
        }
        $projects = LeadProjectSubjects::forGuests(CrmMail::ORGANIZATION, [$guest->id])[$guest->id] ?? [];
        foreach ($leads as $lead) {
            $subjects = array_map(fn ($s) => hash('sha256', (string) $s), array_keys($projects[$lead->id] ?? []));
            $matched = count($projects) === 1 ? $threads : array_filter($threads, fn ($t) => in_array($t['subject_key'], $subjects, true));
            if (count($matched) !== 1) {
                continue;
            }
            $thread = reset($matched);
            $id = $thread['message_id'] ?? '';
            if (! Str::isUuid($id) || ($state['value_checked'][$lead->id] ?? null) === $id) {
                continue;
            }
            try {
                $result = $mail->read($guest, ['action' => 'content', 'message_id' => $id], 5);
            } catch (HttpExceptionInterface) {
                continue;
            }
            if (! is_string($result['body'] ?? null)) {
                continue;
            }
            $body = AssistantEmailText::messages([['body' => $result['body'], 'sent_at' => $thread['at'], 'subject' => '', 'direction' => $thread['direction']]])[0]['body'];
            $value = self::total($body);
            if ($value !== null) {
                DB::table('inquiries')->where('id', $lead->id)->where('guest_id', $guest->id)->where('brand_id', CrmMail::BRAND)
                    ->where('organization_id', CrmMail::ORGANIZATION)->whereNull('total_value')->whereNull('rate_offered')
                    ->where('currency', $lead->currency)->where(fn ($q) => $q->whereNull('paid_amount')->orWhere('paid_amount', 0))
                    ->update($value + ['updated_at' => now()]);
            }
            $state['value_checked'][$lead->id] = $id;
        }

        return $state;
    }

    public static function fromLoggedEmail(Inquiry $lead, string $text): void
    {
        if ($lead->total_value !== null || $text === '') {
            return;
        }
        $message = AssistantEmailText::messages([['body' => $text, 'direction' => 'email', 'sent_at' => null, 'subject' => '']])[0];
        $value = self::total($message['body']);
        if ($value) {
            DB::table('inquiries')->where('organization_id', $lead->organization_id)->where('id', $lead->id)
                ->where('brand_id', $lead->brand_id)->where('guest_id', $lead->guest_id)->whereNull('total_value')
                ->whereNull('rate_offered')->where(fn ($q) => $q->whereNull('paid_amount')->orWhere('paid_amount', 0))
                ->update($value + ['updated_at' => now()]);
        }
    }

    /** Explicit whole-order totals only. Ambiguous separators, alternatives and ranges stay with staff. */
    public static function total(string $body): ?array
    {
        $body = str_replace(["\u{00a0}", "\u{202f}"], ' ', $body);
        $label = '(?:(?:order|quote|grand|project|agreed|budget|montant|prix|presupuesto|importe|preventivo)\h+total|total(?:\h+(?:price|amount|cost|budget|ttc|ht|commande|general|generalizado))?|gesamtbetrag|gesamtsumme|endpreis|totale)';
        if (preg_match_all('~^\h*'.$label.'\b~imu', $body) !== 1) {
            return null;
        }
        $code = '(?:'.implode('|', EmailPriceCheck::currencyCodes()).'|€|£)';
        $number = '(?:\d{1,3}(?:[ .,]\d{3})+|\d+)(?:[.,]\d{1,2})?';
        if (! preg_match('~^\h*'.$label.'\h*(?:[:=–-]|\bis\b|\best de\b)?\h*(?:(?<quantity>[1-9][0-9]{0,6})\h*[x×]\h*)?(?:(?<before>'.$code.')\h*(?<first>'.$number.')|(?<second>'.$number.')\h*(?<after>'.$code.'))\h*[.]?\h*$~imu', $body, $m)) {
            return null;
        }
        $currency = strtoupper($m['before'] ?: $m['after']);
        $number = str_replace(' ', '', $m['first'] !== '' ? $m['first'] : $m['second']);
        if (preg_match('/[.,]\d{3}$/D', $number) || preg_match('/([.,])\d{3}\1/', $number)) {
            return null;
        }
        $number = preg_replace('/[.,](?=\d{3}[.,])/', '', $number);
        $amount = BigDecimal::of(str_replace(',', '.', $number))->multipliedBy($m['quantity'] ?: 1);
        if ($amount->isLessThanOrEqualTo(0) || $amount->isGreaterThan('9999999999.99')) {
            return null;
        }

        return ['total_value' => (string) $amount, 'currency' => ['€' => 'EUR', '£' => 'GBP'][$currency] ?? $currency];
    }
}
