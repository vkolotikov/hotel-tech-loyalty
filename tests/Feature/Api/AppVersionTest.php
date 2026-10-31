<?php

namespace Tests\Feature\Api;

use Tests\TestCase;

/**
 * The native apps' version answer (owner 2026-10-31): public, from config/apps.php, and never a lock-out by a typo.
 */
class AppVersionTest extends TestCase
{
    private function url(string $app): string
    {
        return rtrim((string) config('app.url'), '/') . "/api/v1/apps/{$app}/version";
    }

    public function test_the_staff_app_hears_its_versions_and_store_links_without_signing_in(): void
    {
        config(['apps.staff' => [
            'min_version'    => '1.2.0',
            'latest_version' => '1.4.1',
            'ios_url'        => 'https://apps.apple.com/app/id0000000000',
            'android_url'    => 'https://play.google.com/store/apps/details?id=uk.hexatech.loyalty.staff',
        ]]);

        $this->getJson($this->url('staff'))->assertOk()->assertExactJson([
            'app'            => 'staff',
            'min_version'    => '1.2.0',
            'latest_version' => '1.4.1',
            'update_url'     => [
                'ios'     => 'https://apps.apple.com/app/id0000000000',
                'android' => 'https://play.google.com/store/apps/details?id=uk.hexatech.loyalty.staff',
            ],
        ])->assertHeader('Cache-Control', 'max-age=300, public');
    }

    public function test_a_setting_that_is_not_a_version_never_locks_phones_out(): void
    {
        config(['apps.staff' => ['min_version' => '1.2', 'latest_version' => 'soon', 'ios_url' => 'http://insecure.example', 'android_url' => '']]);

        $this->getJson($this->url('staff'))->assertOk()
            ->assertJsonPath('min_version', '0.0.0')
            ->assertJsonPath('latest_version', '0.0.0')
            ->assertJsonPath('update_url', ['ios' => null, 'android' => null]);
    }

    public function test_the_latest_version_is_never_below_the_minimum(): void
    {
        config(['apps.staff' => ['min_version' => '2.0.0', 'latest_version' => '1.9.9']]);

        $this->getJson($this->url('staff'))->assertOk()->assertJsonPath('latest_version', '2.0.0');
    }

    public function test_the_members_app_starts_at_two_with_the_existing_listing(): void
    {
        $this->getJson($this->url('member'))->assertOk()
            ->assertJsonPath('min_version', '2.0.0')
            ->assertJsonPath('update_url.ios', 'https://apps.apple.com/app/id6765608479')
            ->assertJsonPath('update_url.android', 'https://play.google.com/store/apps/details?id=com.hotelloyalty.app');
    }

    public function test_an_unknown_app_is_not_found(): void
    {
        $this->getJson($this->url('kiosk'))->assertStatus(404)->assertJsonPath('error', 'not_found');
    }
}
