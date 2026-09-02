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
        // The second kit. It leads with the same three scene-setting plates
        // and adds one kit 01 has nowhere to put: `services`, the sticky
        // editorial photograph beside the numbered menu (R3, and the reason
        // that slot exists at all). It ships NO `booking` default, because
        // this author's closing panel is typographic — an ornamental numeral
        // and a heading — and defaulting a photograph into a band that draws
        // none would be a picture no tenant could ever see.
        'editorial_atelier' => [
            'hero' => [
                'file' => 'hero-elan.webp',
                'alt'  => 'Client with long, softly layered brunette hair in a salon',
            ],
            'services' => [
                'file' => 'service-precision-cut.webp',
                'alt'  => 'Stylist refining a precision bob at the mirror',
            ],
            'about' => [
                'file' => 'atelier-interior.webp',
                'alt'  => 'A studio interior with warm plaster walls, dark wood floors and individual styling stations',
            ],
            'team' => [
                'file' => 'team-collective.webp',
                'alt'  => 'Three stylists standing together in the studio',
            ],
            // The lookbook, in the author's own order: the portrait, the
            // precision cut, the tools, the room.
            'gallery_1.image_1' => [
                'file' => 'hero-elan.webp',
                'alt'  => 'Softly layered brunette style with a polished finish',
            ],
            'gallery_1.image_2' => [
                'file' => 'service-precision-cut.webp',
                'alt'  => 'Precision bob being detailed by a stylist',
            ],
            'gallery_1.image_3' => [
                'file' => 'atelier-tools.webp',
                'alt'  => 'Professional brushes, comb and scissors arranged in warm window light',
            ],
            'gallery_1.image_4' => [
                'file' => 'atelier-interior.webp',
                'alt'  => 'A row of individual styling stations in the studio',
            ],
        ],
        // The third kit. Three scene-setting plates and a three-tile mosaic;
        // NO `services` default, because that band's photograph is per-ROW
        // here (`Service.image`, read through PageContent::serviceImage())
        // rather than a page slot at all — R3's other half — and no
        // `booking` default, because this author's closing panel is a moss
        // card with no picture in it.
        'organic_wellness' => [
            'hero' => [
                'file' => 'hero-wellness.webp',
                'alt'  => 'A relaxed guest in a linen robe resting in a sunlit, natural-toned treatment studio',
            ],
            'about' => [
                'file' => 'studio-interior.webp',
                'alt'  => 'A calm treatment room with warm plaster arches, an olive tree and a prepared treatment bed',
            ],
            'team' => [
                'file' => 'team.webp',
                'alt'  => 'Three therapists standing together in the studio',
            ],
            // The mosaic, in the author's own order: the arch, the tall
            // organic crop, the detail.
            'gallery_1.image_1' => [
                'file' => 'studio-interior.webp',
                'alt'  => 'A sunlit treatment room framed by an organic arch',
            ],
            'gallery_1.image_2' => [
                'file' => 'botanical-ritual.webp',
                'alt'  => 'Fresh botanical clay in a ceramic bowl beside linen and rosemary',
            ],
            'gallery_1.image_3' => [
                'file' => 'hero-wellness.webp',
                'alt'  => 'A guest taking a quiet moment after treatment in warm morning light',
            ],
        ],
        // THE FIRST HOSPITALITY KIT. Two photographs, which is all this author
        // drew, and therefore all that is offered: his hero is a full-bleed
        // dining room and his story band is a plate of oysters.
        //
        // NO `team` ENTRY, because there is no team band on any hospitality
        // template — no partial ships for it. NO `services` and NO `booking`
        // either: his menu ledger is typographic and his closing panel is a
        // heading on an oxblood field, so a default in either would be a
        // picture no tenant could ever see.
        //
        // THE GALLERY GETS TWO TILES, not three. His own salon band draws no
        // photograph at all (see that partial's note), so there is no authored
        // order to follow, and a third default would be one of these two files
        // printed twice in one band — the exact duplication this class refuses
        // for a second gallery instance.
        'maison_vela' => [
            'hero' => [
                'file' => 'hero-brasserie.webp',
                'alt'  => 'An elegant dining room with deep red banquettes and warm brass lighting',
            ],
            'about' => [
                'file' => 'oysters.webp',
                'alt'  => 'Oysters over crushed ice beside a coupe of chilled sparkling wine',
            ],
            'gallery_1.image_1' => [
                'file' => 'hero-brasserie.webp',
                'alt'  => 'The main dining room laid for service',
            ],
            'gallery_1.image_2' => [
                'file' => 'oysters.webp',
                'alt'  => 'A shellfish plate dressed over ice',
            ],
        ],
        // THE SECOND HOSPITALITY KIT. Two photographs again, and the same three
        // absences for the same three reasons: no `team` (no hospitality
        // template draws one), no `services` (his menu cards are typographic)
        // and no `booking` (his closing panel is a pine card with no picture
        // in it).
        'luma_garden' => [
            'hero' => [
                'file' => 'hero-garden.webp',
                'alt'  => 'A garden terrace with limestone arches, olive trees and linen-laid tables',
            ],
            'about' => [
                'file' => 'langoustine.webp',
                'alt'  => 'Grilled langoustine plated with citrus and fennel',
            ],
            'gallery_1.image_1' => [
                'file' => 'hero-garden.webp',
                'alt'  => 'Tables set under the garden canopy',
            ],
            'gallery_1.image_2' => [
                'file' => 'langoustine.webp',
                'alt'  => 'A plate from the coastal menu',
            ],
        ],
        // THE THIRD HOSPITALITY KIT. Two photographs again, and the same three
        // absences for the same three reasons: no `team` (no hospitality
        // template draws one), no `services` (his ledger is typographic) and no
        // `booking` (his closing panel is an ember field with no picture in it).
        'ember_table' => [
            'hero' => [
                'file' => 'hero-dining.webp',
                'alt'  => 'A candlelit dining room and an open hearth before evening service',
            ],
            'about' => [
                'file' => 'seasonal-dish.webp',
                'alt'  => 'Seasonal roasted vegetables plated on handmade ceramic',
            ],
            'gallery_1.image_1' => [
                'file' => 'hero-dining.webp',
                'alt'  => 'The dining room in low evening light',
            ],
            'gallery_1.image_2' => [
                'file' => 'seasonal-dish.webp',
                'alt'  => 'A plate from the seasonal menu',
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
