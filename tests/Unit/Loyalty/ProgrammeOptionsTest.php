<?php

namespace Tests\Unit\Loyalty;

use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\LoyaltyPresetService;
use PHPUnit\Framework\TestCase;

/**
 * The options' description the workspace draws its cards from, and the presets' recommendations (release 7, spec
 * 2026-10-25 §1), checked by value.
 */
class ProgrammeOptionsTest extends TestCase
{
    public function test_every_option_but_the_wizards_stamp_is_on_exactly_one_card(): void
    {
        $onCards = [];
        foreach (ProgrammeOptions::ways() as $way) {
            foreach (array_filter([$way['switch'], $way['zero_off']]) as $key) {
                $onCards[] = $key;
            }
            foreach ($way['fields'] as $key) {
                $onCards[] = $key;
            }
        }
        // A zero-off way's number is its own switch: counted once.
        $onCards = array_values(array_unique($onCards));
        sort($onCards);

        $options = array_values(array_diff(array_keys(ProgrammeOptions::OPTIONS), ProgrammeOptions::WIZARD_ONLY));
        sort($options);
        $this->assertSame($options, $onCards);
        $this->assertSame($options, array_values(array_intersect($options, array_keys(ProgrammeOptions::fields()))));
    }

    public function test_a_card_has_a_switch_or_a_number_whose_zero_is_off_never_both(): void
    {
        foreach (ProgrammeOptions::ways() as $way) {
            $this->assertTrue(($way['switch'] === null) !== ($way['zero_off'] === null), $way['key']);
            if ($way['switch'] !== null) {
                $this->assertSame('bool', ProgrammeOptions::fields()[$way['switch']]['type'], $way['key']);
            }
            if ($way['zero_off'] !== null) {
                $this->assertSame('int', ProgrammeOptions::fields()[$way['zero_off']]['type'], $way['key']);
                $this->assertSame(0, ProgrammeOptions::fields()[$way['zero_off']]['min'], $way['key']);
            }
        }
    }

    public function test_the_fields_carry_the_servers_types_bounds_choices_and_dependencies(): void
    {
        $fields = ProgrammeOptions::fields();

        $this->assertSame(['type' => 'decimal', 'default' => 1.0, 'min' => 0.01, 'max' => 1000, 'choices' => null, 'when' => null], $fields['points_per_currency']);
        $this->assertSame(['points', 'reward'], $fields['stamp_reward_kind']['choices']);
        $this->assertSame(['field' => 'stamp_reward_kind', 'is' => 'points'], $fields['stamp_reward_points']['when']);
        $this->assertSame('reward', $fields['stamp_reward_id']['type']);
        $this->assertNull($fields['stamp_reward_id']['default']);
        $this->assertArrayNotHasKey('programme_setup_completed_at', $fields);
    }

    public function test_every_preset_recommends_a_value_for_every_way_within_its_bounds(): void
    {
        $fields = ProgrammeOptions::fields();
        $service = new LoyaltyPresetService();

        foreach (array_keys(LoyaltyPresetService::PRESETS) as $key) {
            $recommends = $service->recommendedOptions($key);
            // Every option but the full card's reward, which a preset cannot know before it is applied.
            $this->assertEqualsCanonicalizing(array_values(array_diff(array_keys($fields), ['stamp_reward_id'])), array_keys($recommends), $key);
            foreach ($recommends as $option => $value) {
                $field = $fields[$option];
                match ($field['type']) {
                    'bool'    => $this->assertIsBool($value, "{$key}.{$option}"),
                    'int'     => $this->assertIsInt($value, "{$key}.{$option}"),
                    'decimal' => $this->assertIsFloat($value, "{$key}.{$option}"),
                    'enum'    => $this->assertContains($value, $field['choices'], "{$key}.{$option}"),
                };
                if ($field['min'] !== null) {
                    $this->assertGreaterThanOrEqual($field['min'], $value, "{$key}.{$option}");
                    $this->assertLessThanOrEqual($field['max'], $value, "{$key}.{$option}");
                }
            }
        }
    }

    public function test_a_preset_carries_its_own_economics_and_its_way_of_rewarding_visits(): void
    {
        $service = new LoyaltyPresetService();

        $hotel = $service->recommendedOptions('hotel_classic');
        $this->assertSame(10.0, $hotel['points_per_currency']);
        $this->assertSame(500, $hotel['welcome_bonus_points']);
        $this->assertSame(1000, $hotel['referrer_bonus_points']);
        $this->assertFalse($hotel['stamps_enabled']);
        $this->assertFalse($hotel['cashback_enabled']);

        $clinic = $service->recommendedOptions('medical');
        $this->assertFalse($clinic['points_on_bookings']);

        $gym = $service->recommendedOptions('fitness');
        $this->assertTrue($gym['checkin_enabled']);
        $this->assertTrue($gym['stamps_enabled']);

        // An industry alias resolves as apply() resolves it.
        $this->assertSame($service->recommendedOptions('restaurant'), $service->recommendedOptions('hospitality'));
        $this->assertTrue($service->recommendedOptions('restaurant')['desk_earn_enabled']);

        $this->expectException(\InvalidArgumentException::class);
        $service->recommendedOptions('castle');
    }
}
