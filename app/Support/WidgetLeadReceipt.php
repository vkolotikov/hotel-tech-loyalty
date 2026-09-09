<?php

namespace App\Support;

final class WidgetLeadReceipt
{
    public static function forInquiry(?int $id): ?string
    {
        $key = config('app.key');
        if (!$id || !is_string($key) || $key === '') return null;
        return hash_hmac('sha256', 'widget-lead:'.$id, $key);
    }
}
