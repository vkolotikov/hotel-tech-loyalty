<?php

namespace App\Services\Loyalty\Cards;

use App\Models\LoyaltyCardBatch;
use App\Models\NfcCard;
use App\Services\QrCodeService;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use ZipArchive;

final class PhysicalCardQrArchive
{
    public function __construct(private readonly QrCodeService $qr)
    {
    }

    public function download(LoyaltyCardBatch $batch): BinaryFileResponse
    {
        $path = tempnam(sys_get_temp_dir(), 'loyalty-card-qr-');
        if ($path === false) {
            throw new \RuntimeException('Could not prepare the QR archive.');
        }

        $zip = new ZipArchive();
        $manifest = fopen('php://temp', 'w+b');
        try {
            if (!$manifest || $zip->open($path, ZipArchive::OVERWRITE) !== true) {
                throw new \RuntimeException('Could not open the QR archive.');
            }
            fputcsv($manifest, ['card_number', 'qr_payload', 'svg_file'], escape: '');
            foreach (NfcCard::query()->where('card_batch_id', $batch->id)->orderBy('id')->get() as $card) {
                $code = NfcCards::scanCode($card);
                $filename = $card->printed_number.'.svg';
                if (!$zip->addFromString($filename, $this->qr->cardQrSvg($code))) {
                    throw new \RuntimeException('Could not add a QR to the archive.');
                }
                fputcsv($manifest, [$card->printed_number, $code, $filename], escape: '');
            }
            rewind($manifest);
            if (!$zip->addFromString('cards.csv', (string) stream_get_contents($manifest)) || !$zip->close()) {
                throw new \RuntimeException('Could not finish the QR archive.');
            }

            return response()->download($path, "loyalty-cards-{$batch->id}.zip", ['Cache-Control' => 'private, no-store'])
                ->deleteFileAfterSend();
        } catch (\Throwable $error) {
            unset($zip);
            if (is_file($path)) {
                unlink($path);
            }

            throw $error;
        } finally {
            if (is_resource($manifest)) {
                fclose($manifest);
            }
        }
    }
}
