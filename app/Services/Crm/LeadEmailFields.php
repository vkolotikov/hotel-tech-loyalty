<?php

namespace App\Services\Crm;

use App\Models\CrmSetting;
use App\Models\CustomField;
use App\Models\Inquiry;
use App\Scopes\BrandScope;
use App\Scopes\TenantScope;
use Illuminate\Support\Facades\DB;

/** Import explicitly labelled customer requirements into an existing opportunity's empty, configured fields. */
final class LeadEmailFields
{
    private const LABELS = [
        'product' => ['product', 'produit', 'produkt', 'producto', 'продукт'],
        'quantity' => ['quantity', 'order quantity', 'qty', 'quantité', 'menge', 'cantidad', 'количество'],
        'deadline' => ['deadline', 'required by', 'date limite', 'liefertermin', 'fecha límite', 'срок'],
        'enquiry' => ['type of enquiry', 'enquiry type', 'inquiry type', 'type de demande', 'anfrageart', 'tipo de consulta', 'тип запроса'],
    ];

    public static function fill(Inquiry $lead, string $body): void
    {
        $values = [];
        preg_match_all('/^\h*([^:\r\n]{1,60}):\h*([^\r\n]{1,140})$/mu', $body, $matches, PREG_SET_ORDER);
        foreach ($matches as [, $label, $value]) {
            $label = mb_strtolower(trim($label));
            foreach (self::LABELS as $kind => $labels) {
                if (in_array($label, $labels, true)) {
                    $values[$kind][] = trim($value);
                }
            }
        }
        $values = array_map(fn ($items) => $items[0], array_filter($values, fn ($items) => count(array_unique($items)) === 1));
        if (! $values) {
            return;
        }
        DB::transaction(function () use ($lead, $values) {
            $row = Inquiry::withoutGlobalScopes([TenantScope::class, BrandScope::class])->where('organization_id', $lead->organization_id)
                ->where('brand_id', $lead->brand_id)->where('guest_id', $lead->guest_id)->lockForUpdate()->find($lead->id);
            if (! $row) {
                return;
            }
            $data = $row->custom_data ?? [];
            $fields = CustomField::withoutGlobalScope(TenantScope::class)->where('organization_id', $row->organization_id)->where('entity', 'inquiry')->where('is_active', true)->get();
            foreach ($fields as $field) {
                $kind = match ($field->key) {
                    'order_quantity', 'quantity' => 'quantity', 'project_deadline', 'deadline' => 'deadline',
                    'product', 'product_interest' => 'product',
                    default => array_find_key(self::LABELS, fn ($labels) => in_array(mb_strtolower(trim($field->label)), $labels, true)),
                };
                if (! isset($values[$kind]) || ! in_array($data[$field->key] ?? null, [null, '', []], true)) {
                    continue;
                }
                $value = $values[$kind];
                $typed = match (true) {
                    $kind === 'quantity' && $field->type === 'number' && preg_match('/^[1-9]\d{0,7}$/D', $value) === 1 => (int) $value,
                    $kind === 'deadline' && $field->type === 'date' && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $value, $date) === 1
                        && checkdate((int) $date[2], (int) $date[3], (int) $date[1]) => $value,
                    $kind === 'product' && in_array($field->type, ['text', 'textarea'], true) => $value,
                    $kind === 'product' && in_array($field->type, ['select', 'multiselect'], true) => self::option($value, $field),
                    default => null,
                };
                if ($typed !== null) {
                    $data[$field->key] = $typed;
                }
            }
            if ($data !== ($row->custom_data ?? [])) {
                $row->custom_data = $data;
            }
            if (blank($row->inquiry_type) && isset($values['enquiry']) && mb_strlen($values['enquiry']) <= 50) {
                $types = CrmSetting::withoutGlobalScope(TenantScope::class)->where('organization_id', $row->organization_id)->where('key', 'inquiry_types')->first()?->value;
                $type = is_array($types) && $types ? array_find($types, fn ($v) => is_string($v) && mb_strtolower($v) === mb_strtolower($values['enquiry'])) : $values['enquiry'];
                if ($type !== null) {
                    $row->inquiry_type = $type;
                }
            }
            if ($row->isDirty()) {
                $row->save();
            }
        });
    }

    private static function option(string $value, CustomField $field): string|array|null
    {
        $match = array_find($field->config['options'] ?? [], fn ($v) => is_string($v) && mb_strtolower($v) === mb_strtolower($value));

        return $match !== null && $field->type === 'multiselect' ? [$match] : $match;
    }
}
