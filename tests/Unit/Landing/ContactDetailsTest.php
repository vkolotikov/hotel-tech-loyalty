<?php

namespace Tests\Unit\Landing;

use App\Landing\ContactDetails;
use App\Models\Property;
use PHPUnit\Framework\TestCase;

class ContactDetailsTest extends TestCase
{
    private function property(): Property
    {
        $p = new Property();
        $p->name = 'Maison Mimi';   $p->phone = '+371 111';
        $p->email = 'hi@mimi.lv';   $p->address = '1 Elm St';
        $p->city = 'Riga';          $p->country = 'LV';
        $p->currency = 'EUR';       $p->timezone = 'Europe/Riga';
        return $p;
    }

    public function test_an_override_wins_for_its_field_only(): void
    {
        $c = ContactDetails::resolve($this->property(), ['phone' => '+371 999']);

        $this->assertSame('+371 999', $c->phone);
        $this->assertSame('hi@mimi.lv', $c->email);     // untouched field: Property
        $this->assertSame('Riga', $c->city);            // pass-through field
    }

    public function test_a_blank_override_falls_back_rather_than_blanking_the_page(): void
    {
        $c = ContactDetails::resolve($this->property(), ['phone' => '   ', 'email' => '']);

        $this->assertSame('+371 111', $c->phone);
        $this->assertSame('hi@mimi.lv', $c->email);
    }

    public function test_overrides_work_with_no_property_at_all(): void
    {
        $c = ContactDetails::resolve(null, ['phone' => '+371 999']);

        $this->assertSame('+371 999', $c->phone);
        $this->assertNull($c->name);
        $this->assertNull($c->currency);
    }

    public function test_non_string_overrides_are_ignored_not_fatal(): void
    {
        $c = ContactDetails::resolve($this->property(), ['phone' => ['x'], 'email' => 7]);

        $this->assertSame('+371 111', $c->phone);
        $this->assertSame('hi@mimi.lv', $c->email);
    }
}
