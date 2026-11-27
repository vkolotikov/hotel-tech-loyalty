<?php

namespace App\Services\Crm;

use App\Exceptions\AiHelperRefused;
use App\Models\Brand;
use App\Models\Inquiry;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Crypt;

final class EmailDraftRevision
{
    public static function rules(bool $queued): array
    {
        return [
            'focus' => 'required_with:revise|nullable|string|max:600',
            'revise' => 'sometimes|required|array:source_id,subject,body'.($queued ? ',revision' : ''),
            ...($queued ? ['revise.revision' => 'required_with:revise|integer|min:0'] : []),
            'revise.source_id' => 'required_with:revise|string|'.($queued ? 'uuid' : 'min:64|max:32768'),
            'revise.subject' => 'required_with:revise|string|max:240',
            'revise.body' => 'required_with:revise|string|max:10000',
        ];
    }

    /** Full-admin proposals are transient. Bind their edit handle to the current project and commercial terms. */
    public static function token(Inquiry $lead, Brand $brand, string $quoteStamp, array $guidance = []): string
    {
        $scope = hash_hmac('sha256', implode('|', ['proposal-edit-v1', $brand->organization_id, $brand->id,
            $lead->id, $lead->guest_id, $quoteStamp]), (string) config('app.key'));

        return $guidance ? Crypt::encryptString(json_encode([$scope, $guidance], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)) : $scope;
    }

    public static function guidance(string $handle, Inquiry $lead, Brand $brand, string $quoteStamp): array
    {
        $expected = self::token($lead, $brand, $quoteStamp);
        if (hash_equals($expected, $handle)) {
            return [];
        }
        try {
            $data = json_decode(Crypt::decryptString($handle), true);
        } catch (DecryptException) {
            self::changed();
        }
        if (! is_string($data[0] ?? null) || ! hash_equals($expected, $data[0]) || ! is_array($data[1] ?? null)) {
            self::changed();
        }

        return $data[1];
    }

    public static function changed(): never
    {
        throw new AiHelperRefused('strategy_changed', 'The draft or its commercial terms changed. Reload the latest version.', 409);
    }
}
