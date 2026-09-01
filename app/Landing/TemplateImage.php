<?php
namespace App\Landing;

/**
 * THE TEMPLATE'S OWN PHOTOGRAPHS — the default half of the default+override
 * image model (template fidelity Phase 4).
 *
 * The author's ruling, recorded and not re-litigated here: a kit's own
 * photographs ship as its template's defaults and stay until a tenant
 * replaces them. That turns every picture on the page into a slot with two
 * possible answers —
 *
 *     the tenant's upload, if they have made one; otherwise the design's
 *
 * — and it is what makes "Remove" mean RESTORE THE ORIGINAL rather than
 * "leave a hole". A tenant who picks Nocturne Ritual because of its
 * photography no longer gets a page with zero photographs, and a tenant who
 * replaces one and changes their mind gets the author's back.
 *
 * WHERE THE OVERRIDE LIVES DID NOT MOVE. `content.<key>.image_url` and
 * `content.<key>.image_N` are still the only leaves a photograph is stored
 * in, still written by exactly one writer (the image endpoints), and still
 * read through {@see PageContent::imageUrl()}'s three guards. This class is
 * consulted only when that read comes back empty, so nothing about the
 * single-writer rule, the slot allowlist or the hostile-value battery
 * changes: a stored leaf that fails a guard falls back to the design's
 * photograph exactly as an absent one does, which is a STRONGER outcome than
 * the empty band it used to fall back to.
 *
 * SLOTS ARE SPELLED THE WAY THE ENDPOINTS SPELL THEM — {@see
 * SectionType::imageKeys()}'s own grammar, `hero` or `gallery_1.image_3` —
 * so a default and the upload that replaces it name the same thing, and
 * TemplateImageTest can assert this map is a SUBSET of that allowlist rather
 * than a second list of what a picture is.
 *
 * ONLY `gallery_1`, deliberately. A second gallery band is the tenant's own
 * idea and the author drew one mosaic; defaulting `gallery_2` to the same
 * four photographs would publish the same pictures twice.
 *
 * `ruled_page` IS ABSENT AND MUST STAY ABSENT. It is a typographic design
 * that ships no photographs of its own, its empty states are drawn for the
 * absence of a picture, and its four byte goldens pin the markup of a page
 * with none. A template with no entry here resolves every slot to null,
 * which is exactly what every page rendered before this class existed did.
 */
final class TemplateImage
{
    /**
     * Where a template's own assets are deployed, relative to public/.
     *
     * One expression, because the render path, the editor payload and the
     * test that proves every file exists all have to agree — and because a
     * second template is then a row in {@see DEFAULTS} and nothing else.
     */
    private const ASSET_DIR = 'landing/%s/assets/%s';

    /**
     * THE AUTHORED MAP: template key → slot → [file, alt].
     *
     * `file` is the basename under public/landing/<template>/assets/, which
     * is the tree NocturneRitualRenderTest already pins byte-for-byte
     * against the kit's own `assets/` directory. Nothing here may name a
     * file that is not in it.
     *
     * `alt` IS A DESCRIPTION OF THE PHOTOGRAPH, NEVER A CLAIM ABOUT THE
     * BUSINESS, and that is a deliberate edit of the author's own strings
     * rather than a transcription of them. The kit writes "…at Nocturne
     * Bathhouse" and "Nocturne practitioners Amara, Mei and Clara" — its own
     * fictional business and its own fictional staff. Those are correct on
     * the author's demo page and would be a fabrication on a real salon's,
     * so each one is reduced to what is true of the picture wherever it
     * appears. Without any alt at all these photographs would ship with
     * `alt=""` on every page, which is an accessibility regression the
     * default model would otherwise have introduced by itself.
     *
     * THERE ARE NO DEFAULT CAPTIONS, for the reason the shipped partials
     * already give: a caption is visible copy in the business's own voice
     * ("Dry heat room", "Amber Hour" — a treatment on the kit's fictional
     * menu), and publishing one the tenant never approved is putting words
     * in their mouth on their own front door. The caption leaves added in
     * 4.3 are theirs to write; blank means no caption pill, exactly as
     * before.
     *
     * @var array<string, array<string, array{file: string, alt: string}>>
     */
    private const DEFAULTS = [
        'nocturne_ritual' => [
            'hero' => [
                'file' => 'hero-nocturne.webp',
                'alt'  => 'A warmly lit, charcoal-toned treatment room',
            ],
            'about' => [
                'file' => 'thermal-pool.webp',
                'alt'  => 'Dark stone steps descending into a softly lit thermal pool',
            ],
            'team' => [
                'file' => 'team-nocturne.webp',
                'alt'  => 'Three practitioners together in the treatment space',
            ],
            // R2: the author reuses the hero plate on the closing panel, so
            // that reuse is the DEFAULT rather than a hard-coded alias — a
            // tenant who wants a different closing photograph can now have
            // one, and one who does not gets the author's composition.
            'booking' => [
                'file' => 'hero-nocturne.webp',
                'alt'  => 'A softly illuminated treatment sanctuary',
            ],
            // The mosaic, in the author's own order: the wide tile, the tall
            // tile, then the two squares.
            'gallery_1.image_1' => [
                'file' => 'sauna-ritual.webp',
                'alt'  => 'Warm timber sauna with towels and soft architectural lighting',
            ],
            'gallery_1.image_2' => [
                'file' => 'ritual-detail.webp',
                'alt'  => 'Warm towels, a candle and polished treatment stones',
            ],
            'gallery_1.image_3' => [
                'file' => 'warm-compress.webp',
                'alt'  => "Warm linen placed around a guest's shoulders",
            ],
            'gallery_1.image_4' => [
                'file' => 'thermal-pool.webp',
                'alt'  => 'Light moving across thermal pool steps',
            ],
        ],
    ];

    /**
     * The design's photograph for one slot, as a root-relative-or-absolute
     * URL the page can put straight in a `src`, or null when the design
     * ships none.
     *
     * `asset()` rather than a spelled-out path: Laravel resolves it against
     * the CURRENT request root, so the landing host serves its own origin
     * and the admin SPA's onboarding response serves the admin's — both of
     * which serve the same public/ tree. That matters twice over: `img-src`
     * on the public page is `'self' data: https:`, and the editor has to be
     * able to show the tenant the picture it is offering to restore.
     */
    public static function url(?string $templateKey, string $slot): ?string
    {
        $row = self::row($templateKey, $slot);

        return $row === null ? null : asset(sprintf(self::ASSET_DIR, $templateKey, $row['file']));
    }

    /**
     * The design's own description of that photograph.
     *
     * Only ever correct while the DEFAULT is what is showing: once a tenant
     * has uploaded their own picture this describes a photograph that is no
     * longer on the page, so {@see PageContent::imageAlt()} — the only
     * caller — asks for it only when the default is the one being rendered.
     */
    public static function alt(?string $templateKey, string $slot): ?string
    {
        return self::row($templateKey, $slot)['alt'] ?? null;
    }

    /**
     * Every slot this template has a photograph for, slot => URL — the shape
     * the editor consumes.
     *
     * Served (see {@see \App\Services\Landing\LandingOnboardingService::templates()})
     * rather than mirrored, for the reason every other fact on that response
     * is: the editor has to know which of a row's photo controls is showing
     * the design's picture and which is showing the tenant's, and a copy of
     * this map in TypeScript would be a copy that can offer "Restore
     * original" for a slot with no original.
     *
     * @return array<string, string>
     */
    public static function map(?string $templateKey): array
    {
        $out = [];

        foreach (self::DEFAULTS[$templateKey] ?? [] as $slot => $row) {
            $out[$slot] = asset(sprintf(self::ASSET_DIR, $templateKey, $row['file']));
        }

        return $out;
    }

    /** @return array{file: string, alt: string}|null */
    private static function row(?string $templateKey, string $slot): ?array
    {
        // $templateKey is a plain varchar off the page row with no
        // constraint behind it, so it is used ONLY as an array key here and
        // in map() — never interpolated into a path unless a row for it was
        // actually found, which is what keeps a hand-edited `../../etc` out
        // of asset().
        return self::DEFAULTS[$templateKey][$slot] ?? null;
    }
}
