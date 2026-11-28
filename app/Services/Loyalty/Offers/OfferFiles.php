<?php

namespace App\Services\Loyalty\Offers;

use App\Models\SpecialOffer;
use App\Models\SpecialOfferFile;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\HeaderUtils;

final class OfferFiles
{
    public static function file(SpecialOffer $offer, bool $content = false): ?SpecialOfferFile
    {
        if (!$offer->getAttribute('voucher_file_id')) return null;
        return SpecialOfferFile::query()->select($content ? ['*'] : ['id', 'organization_id', 'offer_id', 'name', 'mime', 'bytes', 'sha256'])
            ->where('organization_id', $offer->getAttribute('organization_id'))->where('offer_id', $offer->id)->find($offer->voucher_file_id);
    }

    public static function metadata(SpecialOffer $offer): ?array
    {
        $file = self::file($offer);
        return $file ? ['name' => $file->name, 'mime' => $file->mime, 'bytes' => (int) $file->bytes] : null;
    }

    public function put(SpecialOffer $offer, UploadedFile $upload): void
    {
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($upload->getPathname());
        if (!in_array($mime, ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], true) || $upload->getSize() > 5 * 1024 * 1024) {
            throw ValidationException::withMessages(['attachment' => 'Choose a PDF, JPEG, PNG or WebP up to 5 MB.']);
        }
        if ($mime !== 'application/pdf') {
            $size = @getimagesize($upload->getPathname());
            if (!$size || $size[0] > 10000 || $size[1] > 10000) throw ValidationException::withMessages(['attachment' => 'Choose a valid image up to 10000 pixels per side.']);
        }
        $name = mb_substr(preg_replace('/[\x00-\x1f\x7f\/\\\\]/u', '_', $upload->getClientOriginalName()) ?: 'voucher', 0, 180);
        $bytes = $upload->get();
        DB::transaction(function () use ($offer, $name, $mime, $bytes) {
            $locked = SpecialOffer::query()->whereKey($offer->id)->lockForUpdate()->firstOrFail();
            $file = SpecialOfferFile::updateOrCreate(['offer_id' => $offer->id], [
                'organization_id' => $offer->getAttribute('organization_id'), 'name' => $name, 'mime' => $mime,
                'bytes' => strlen($bytes), 'sha256' => hash('sha256', $bytes), 'content' => base64_encode($bytes),
            ]);
            $locked->forceFill(['voucher_file_id' => $file->id])->save();
        });
    }

    public function remove(SpecialOffer $offer): void
    {
        DB::transaction(function () use ($offer) {
            $locked = SpecialOffer::query()->whereKey($offer->id)->lockForUpdate()->firstOrFail();
            self::file($locked)?->delete();
            $locked->forceFill(['voucher_file_id' => null])->save();
        });
    }

    public static function download(SpecialOffer $offer): \Illuminate\Http\Response
    {
        $file = self::file($offer, true);
        abort_unless($file !== null, 404);
        return response(base64_decode($file->content, true), 200, [
            'Content-Type' => $file->mime, 'Content-Disposition' => HeaderUtils::makeDisposition('attachment', $file->name, 'voucher'),
            'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
