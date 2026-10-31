<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * The five tables spatie/laravel-permission used. The package was removed on 2026-10-31 (nothing in the app used
 * Spatie roles; the role system is staff.role), and its config/permission.php with it, so this migration no longer
 * reads that config: it writes out the names and columns the config held (no teams, default keys). The schema it
 * creates is unchanged. The tables stay (empty, unused) until a decision to drop them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('permissions', static function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('name', 125);
            $table->string('guard_name', 25);
            $table->timestamps();
            $table->unique(['name', 'guard_name']);
        });

        Schema::create('roles', static function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('name', 125);
            $table->string('guard_name', 25);
            $table->timestamps();
            $table->unique(['name', 'guard_name']);
        });

        Schema::create('model_has_permissions', static function (Blueprint $table) {
            $table->unsignedBigInteger('permission_id');
            $table->string('model_type', 100);
            $table->unsignedBigInteger('model_id');
            $table->index(['model_id', 'model_type'], 'model_has_permissions_model_id_model_type_index');
            $table->foreign('permission_id')->references('id')->on('permissions')->onDelete('cascade');
            $table->primary(['permission_id', 'model_id', 'model_type'], 'model_has_permissions_permission_model_type_primary');
        });

        Schema::create('model_has_roles', static function (Blueprint $table) {
            $table->unsignedBigInteger('role_id');
            $table->string('model_type', 100);
            $table->unsignedBigInteger('model_id');
            $table->index(['model_id', 'model_type'], 'model_has_roles_model_id_model_type_index');
            $table->foreign('role_id')->references('id')->on('roles')->onDelete('cascade');
            $table->primary(['role_id', 'model_id', 'model_type'], 'model_has_roles_role_model_type_primary');
        });

        Schema::create('role_has_permissions', static function (Blueprint $table) {
            $table->unsignedBigInteger('permission_id');
            $table->unsignedBigInteger('role_id');
            $table->foreign('permission_id')->references('id')->on('permissions')->onDelete('cascade');
            $table->foreign('role_id')->references('id')->on('roles')->onDelete('cascade');
            $table->primary(['permission_id', 'role_id'], 'role_has_permissions_permission_id_role_id_primary');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('role_has_permissions');
        Schema::dropIfExists('model_has_roles');
        Schema::dropIfExists('model_has_permissions');
        Schema::dropIfExists('roles');
        Schema::dropIfExists('permissions');
    }
};
