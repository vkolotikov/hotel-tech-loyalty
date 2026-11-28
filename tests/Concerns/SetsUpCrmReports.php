<?php

namespace Tests\Concerns;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What HexaTech CRM's team activity and sales reports read, beside SetsUpCrmWorkspace's tables (round 5, 2026-11-12):
 * the timeline (`activities`), companies, lost reasons, the leads' report columns, and reservations with their
 * properties for a company's booking revenue. Production's columns and nullability; each guarded, so a database built
 * from the migrations (scripts/test-pg.sh) keeps its own.
 */
trait SetsUpCrmReports
{
    protected function setUpCrmReports(): void
    {
        foreach ([
            'corporate_account_id' => fn (Blueprint $t) => $t->unsignedBigInteger('corporate_account_id')->nullable(),
            'check_in'             => fn (Blueprint $t) => $t->date('check_in')->nullable(),
            'lost_reason_id'       => fn (Blueprint $t) => $t->unsignedBigInteger('lost_reason_id')->nullable(),
            'ai_win_probability'   => fn (Blueprint $t) => $t->integer('ai_win_probability')->nullable(),
        ] as $column => $add) {
            if (!Schema::hasColumn('inquiries', $column)) {
                Schema::table('inquiries', $add);
            }
        }
        if (!Schema::hasTable('activities')) {
            Schema::create('activities', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->unsignedBigInteger('inquiry_id')->nullable();
                $t->unsignedBigInteger('guest_id')->nullable();
                $t->unsignedBigInteger('corporate_account_id')->nullable();
                $t->string('type', 32);
                $t->string('direction', 16)->nullable();
                $t->string('subject', 200)->nullable();
                $t->text('body')->nullable();
                $t->integer('duration_minutes')->nullable();
                $t->text('metadata')->nullable();
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamp('occurred_at');
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('corporate_accounts')) {
            Schema::create('corporate_accounts', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->string('company_name', 200);
                $t->timestamps();
            });
        }
        foreach ([
            'industry'     => fn (Blueprint $t) => $t->string('industry', 100)->nullable(),
            'status'       => fn (Blueprint $t) => $t->string('status', 30)->default('Active'),
            'credit_limit' => fn (Blueprint $t) => $t->decimal('credit_limit', 12, 2)->nullable(),
            'contract_end' => fn (Blueprint $t) => $t->date('contract_end')->nullable(),
        ] as $column => $add) {
            if (!Schema::hasColumn('corporate_accounts', $column)) {
                Schema::table('corporate_accounts', $add);
            }
        }
        if (!Schema::hasTable('inquiry_lost_reasons')) {
            Schema::create('inquiry_lost_reasons', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('label', 80);
                $t->string('slug', 80);
                $t->integer('sort_order')->default(0);
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('properties')) {
            Schema::create('properties', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->string('name');
                $t->string('code')->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('reservations')) {
            Schema::create('reservations', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->unsignedBigInteger('guest_id');
                $t->unsignedBigInteger('inquiry_id')->nullable();
                $t->unsignedBigInteger('corporate_account_id')->nullable();
                $t->unsignedBigInteger('property_id');
                $t->date('check_in');
                $t->date('check_out');
                $t->decimal('total_amount', 12, 2)->nullable();
                $t->string('status', 30)->default('Confirmed');
                $t->timestamps();
            });
        }
    }

    /** A timeline line of this organisation. */
    protected function activity(array $attributes): int
    {
        return DB::table('activities')->insertGetId($attributes + [
            'organization_id' => $this->org->id,
            'type'            => 'note',
            'occurred_at'     => now(),
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
    }

    /** A company of this organisation. */
    protected function company(string $name): int
    {
        return DB::table('corporate_accounts')->insertGetId(['organization_id' => $this->org->id, 'company_name' => $name, 'created_at' => now(), 'updated_at' => now()]);
    }

    /** A confirmed reservation of a company, worth `$amount`. */
    protected function reservation(int $company, float $amount): int
    {
        $guest = DB::table('guests')->insertGetId(['organization_id' => $this->org->id, 'full_name' => 'Booker', 'email' => uniqid() . '@example.test', 'created_at' => now(), 'updated_at' => now()]);
        $property = DB::table('properties')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Main house', 'code' => 'MH' . random_int(100, 999), 'created_at' => now(), 'updated_at' => now()]);

        return DB::table('reservations')->insertGetId([
            'organization_id' => $this->org->id, 'brand_id' => $this->brandId, 'guest_id' => $guest, 'corporate_account_id' => $company,
            'property_id' => $property, 'check_in' => '2026-11-20', 'check_out' => '2026-11-22', 'total_amount' => $amount, 'status' => 'Confirmed',
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    /** Another organisation, made without leaving this one's request context. */
    protected function otherOrganisation(): \App\Models\Organization
    {
        $prior = app('current_organization_id');
        app()->forgetInstance('current_organization_id');
        $other = \App\Models\Organization::create(['name' => 'Elsewhere', 'slug' => 'else-' . uniqid('', true)]);
        app()->instance('current_organization_id', $prior);

        return $other;
    }
}
