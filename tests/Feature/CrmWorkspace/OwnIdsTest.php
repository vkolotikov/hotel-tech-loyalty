<?php

namespace Tests\Feature\CrmWorkspace;

use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * Every id a staff request names must be this organisation's (2026-11-08): a bare `exists:<table>,id` accepts another
 * organisation's row, which the request then links or stores. The admin controllers validate ids with
 * `OwnRows::rule()` (the bound organisation's rows only); this test refuses a bare rule coming back and shows one
 * endpoint refusing another organisation's id.
 */
class OwnIdsTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
    }

    public function test_no_admin_controller_validates_an_id_with_a_bare_exists_rule(): void
    {
        $found = [];
        $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(app_path('Http')));
        foreach ($files as $file) {
            if ($file->getExtension() !== 'php') {
                continue;
            }
            foreach (file($file->getPathname()) as $n => $line) {
                // A rule, not a comment that names one.
                if (preg_match("/^\s*(\/\/|\*)/", $line)) {
                    continue;
                }
                if (preg_match("/['|]exists:[a-z_]+,id\b/", $line)) {
                    $found[] = str_replace(app_path() . '/', '', $file->getPathname()) . ':' . ($n + 1);
                }
            }
        }

        $this->assertSame([], $found, "Validate ids with OwnRows::rule('<table>') (this organisation's rows), not a bare exists:");
    }

    public function test_a_knowledge_answer_cannot_be_filed_in_another_organisations_category(): void
    {
        $other = Organization::create(['name' => 'Other Clinic', 'slug' => 'other-' . uniqid('', true), 'industry' => 'medical']);
        $theirs = DB::table('knowledge_categories')->insertGetId(['organization_id' => $other->id, 'name' => 'Theirs', 'created_at' => now(), 'updated_at' => now()]);
        $ours = DB::table('knowledge_categories')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Ours', 'created_at' => now(), 'updated_at' => now()]);
        $answer = ['question' => 'Do you open on Sundays?', 'answer' => 'Yes, from 10 to 16.'];

        $this->asManager()->postJson($this->adminApi('knowledge/items'), $answer + ['category_id' => $theirs])
            ->assertStatus(422)->assertJsonValidationErrors('category_id');
        $this->asManager()->postJson($this->adminApi('knowledge/items'), $answer + ['category_id' => $ours])
            ->assertSuccessful();
    }
}
