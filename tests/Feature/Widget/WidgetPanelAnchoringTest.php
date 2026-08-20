<?php

namespace Tests\Feature\Widget;

use Tests\TestCase;

/**
 * The open chat panel must sit where the launcher was, not float above it.
 *
 * togglePanel() hides the launcher while the panel is open. The panel,
 * however, was placed with a hardcoded `bottom: 86px` — an offset sized for
 * a launcher that is 20px off the bottom, 56px tall, plus a 10px gap. Since
 * that launcher is display:none for the entire time the panel is visible,
 * the reserved 86px was always an empty strip of the customer's page, and
 * the panel read as detached, hovering well above the button the visitor
 * had just clicked.
 *
 * The invariant is simple and worth pinning: while the launcher is hidden,
 * the panel's resting offset must equal the launcher's own offset, so the
 * panel occupies the corner the button came from. These tests read the
 * shipped widget source, because that file is the artefact customers load.
 */
class WidgetPanelAnchoringTest extends TestCase
{
    private string $src;

    protected function setUp(): void
    {
        parent::setUp();
        $this->src = file_get_contents(public_path('widget/hotel-chat.js'));
    }

    public function test_the_launcher_is_hidden_while_the_panel_is_open(): void
    {
        // This is the premise every other test here rests on. If the widget
        // ever starts leaving the launcher visible, the reserved gap becomes
        // correct again and these expectations must be revisited rather than
        // silently inverted.
        $this->assertMatchesRegularExpression(
            '/launcher\.style\.display\s*=\s*\'none\'/',
            $this->src,
            'togglePanel no longer hides the launcher — panel anchoring assumptions need review.',
        );
    }

    public function test_the_panel_does_not_reserve_space_for_the_hidden_launcher(): void
    {
        $this->assertStringNotContainsString(
            "panel.style.bottom = '86px'",
            $this->src,
            'The panel is again hardcoded 86px off the bottom, reserving room for a launcher '
            . 'that is hidden the whole time the panel is open. It leaves an empty strip below '
            . 'the panel and makes the widget look detached from the button.',
        );
    }

    public function test_the_panel_offset_is_derived_from_the_launcher_position(): void
    {
        // Derived, not duplicated: a second literal would drift the moment the
        // launcher offset is ever tuned.
        $this->assertMatchesRegularExpression(
            '/panel\.style\.bottom\s*=\s*pos\.bottom/',
            $this->src,
            'The panel should take its bottom offset from getPosition(), the same source the '
            . 'launcher uses, so the two can never disagree.',
        );
    }

    public function test_the_mobile_popup_preset_is_anchored_to_the_mobile_launcher_offset(): void
    {
        // The popup preset is the one window style that still floats on
        // mobile, so it has the same defect and the same fix. The mobile
        // launcher sits at 16px.
        preg_match('/#htchat-launcher \{ bottom: (\d+)px !important; \}/', $this->src, $launcher);
        $this->assertNotEmpty($launcher, 'Expected the mobile launcher offset rule.');

        preg_match('/#htchat-panel\.htchat-popup \{[^}]*bottom: (\d+)px !important/', $this->src, $panel);
        $this->assertNotEmpty($panel, 'Expected the mobile popup panel rule.');

        $this->assertSame(
            $launcher[1],
            $panel[1],
            "The mobile popup panel rests {$panel[1]}px off the bottom while the launcher it "
            . "replaces sits at {$launcher[1]}px, leaving a visible empty gap beneath the panel.",
        );
    }

    public function test_the_panel_grows_out_of_the_corner_it_is_anchored_to(): void
    {
        // Scaling from the element's centre makes the panel appear to arrive
        // from nowhere. Anchoring transform-origin to the launcher's corner is
        // what makes the open read as "this came out of the button I clicked".
        $this->assertMatchesRegularExpression(
            '/transformOrigin/',
            $this->src,
            'The open animation has no anchored origin, so the panel scales from its own centre.',
        );
    }
}
