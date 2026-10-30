<?php

namespace App\Services\Wallet;

use App\Models\{HotelSetting, LoyaltyMember, WalletConfig};
use App\Services\Loyalty\App\OwnMedia;
use Illuminate\Support\Facades\Storage;

/** Read only tenant-owned storage; never fetch an arbitrary logo URL from a pass request. */
final class Artwork
{
    public static function logoUrl(int $org): ?string
    {
        return HotelSetting::withoutGlobalScopes()->where('organization_id', $org)->where('key', 'company_logo')->value('value');
    }

    public function write(LoyaltyMember $member, WalletConfig $config, string $directory): void
    {
        if (!extension_loaded('gd')) throw new \RuntimeException('wallet_artwork_unavailable');
        $source = $this->logo((int) $member->organization_id);
        try {
            foreach (['icon.png' => [29, 29], 'icon@2x.png' => [58, 58], 'logo.png' => [160, 50], 'logo@2x.png' => [320, 100]] as $file => [$w, $h]) {
                $out = imagecreatetruecolor($w, $h);
                imagealphablending($out, false);
                imagesavealpha($out, true);
                imagefill($out, 0, 0, imagecolorallocatealpha($out, 0, 0, 0, 127));
                if ($source) {
                    $scale = min(($w - 4) / imagesx($source), ($h - 4) / imagesy($source));
                    $sw = max(1, (int) round(imagesx($source) * $scale));
                    $sh = max(1, (int) round(imagesy($source) * $scale));
                    imagecopyresampled($out, $source, (int) (($w - $sw) / 2), (int) (($h - $sh) / 2), 0, 0, $sw, $sh, imagesx($source), imagesy($source));
                } else {
                    // A visible, correctly sized monogram when no supported tenant logo has been uploaded.
                    preg_match_all('/\d+/', (string) $config->apple_pass_label_color, $rgb);
                    $c = array_slice(array_map('intval', $rgb[0]), 0, 3);
                    $letter = strtoupper(substr(preg_replace('/[^a-zA-Z0-9]/', '', $config->apple_organization_name ?: ($member->organization?->name ?: 'M')), 0, 1)) ?: 'M';
                    $glyph = imagecreatetruecolor(12, 18);
                    imagefill($glyph, 0, 0, imagecolorallocate($glyph, 0, 0, 0));
                    imagecolortransparent($glyph, imagecolorat($glyph, 0, 0));
                    imagestring($glyph, 5, 1, 1, $letter, imagecolorallocate($glyph, ... (count($c) === 3 ? $c : [201, 168, 76])));
                    $height = (int) ($h * .8); $width = (int) ($height * 2 / 3);
                    imagecopyresized($out, $glyph, (int) (($w - $width) / 2), (int) (($h - $height) / 2), 0, 0, $width, $height, 12, 18);
                    imagedestroy($glyph);
                }
                if (!imagepng($out, $directory.'/'.$file)) throw new \RuntimeException('wallet_artwork_write_failed');
                imagedestroy($out);
            }
        } finally {
            if ($source) imagedestroy($source);
        }
    }

    private function logo(int $org): \GdImage|false
    {
        $url = self::logoUrl($org);
        if (!OwnMedia::isOurs($url, $org, 'logos')) return false;
        $local = str_starts_with($url, '/storage/');
        $prefix = $local ? '/storage/' : rtrim((string) config('filesystems.disks.do.url'), '/').'/';
        $key = substr($url, strlen($prefix));
        if (preg_match('/[\\\\?#%\x00-\x1f]/', $key)) return false;
        try {
            $disk = Storage::disk($local ? 'public' : 'do');
            if (!$disk->exists($key) || $disk->size($key) > 4 * 1024 * 1024) return false;
            $bytes = $disk->get($key);
            $size = @getimagesizefromstring($bytes);
            if (!$size || $size[0] > 4096 || $size[1] > 4096) return false;
            return @imagecreatefromstring($bytes);
        } catch (\Throwable) {
            return false;
        }
    }
}
