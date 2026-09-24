<?php

namespace Tests\Feature\Member\Portal;

use Tests\Feature\Member\MemberEndpointTestCase;

class PublicJoinThemeTest extends MemberEndpointTestCase
{
    public function test_the_join_context_carries_the_venue_theme(): void
    {
        $org = $this->tenant('Numa Skin Lab');

        $json = $this->getJson('/api/v1/public/join/' . $org->fresh()->widget_token)
            ->assertOk()
            ->json();

        $this->assertTrue($json['accepting_joins']);
        $this->assertSame('Numa Skin Lab', $json['organization']['name']);
        $this->assertMatchesRegularExpression('/^#[0-9a-f]{6}$/', $json['theme']['accent']['hex']);
        $this->assertMatchesRegularExpression('/^#[0-9a-f]{6}$/', $json['theme']['accent']['dark_hex']);
        $this->assertContains($json['theme']['display_face'], ['playfair', 'cormorant', 'fraunces', 'newsreader', 'space', 'manrope']);
        $this->assertArrayHasKey('industry', $json['theme']);
    }
}
