<?php

namespace Tests\Unit\Content;

use PHPUnit\Framework\TestCase;

/** Owner ruling (Plan 4A-2): template hashtags are a json column, as spec §9.1 and the posts' hashtags. */
class TemplatesMigrationTest extends TestCase
{
    public function test_template_hashtags_are_a_json_column(): void
    {
        $migration = (string) file_get_contents(dirname(__DIR__, 3) . '/database/migrations/2026_10_16_100200_create_content_planner_templates_table.php');

        $this->assertStringContainsString("\$table->json('hashtags')->nullable();", $migration);
        $this->assertStringNotContainsString("\$table->text('hashtags')", $migration);
    }
}
