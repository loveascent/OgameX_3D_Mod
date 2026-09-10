<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The three tables the 3D Mod owns. Nothing else in the game is touched.
 *
 * WHY THREE AND NOT ONE
 * ---------------------
 * A "version" is a named, empty sheet of glass laid over the shipped game. V1 is the
 * game itself and deliberately has NO row anywhere - a version you cannot store an
 * override for is a version that cannot be broken by an override. Everything the admin
 * assigns belongs to exactly one version, which is why ogx3d_overrides is keyed by
 * (version_key, target) and not by target alone: two versions must be able to give the
 * same object two different looks without knowing about each other.
 */
return new class () extends Migration {
    public function up(): void
    {
        /**
         * The versions an admin has created. V1 is NOT in here: it is the shipped game,
         * and it exists whether or not this table does.
         */
        Schema::create('ogx3d_versions', function (Blueprint $table) {
            $table->id();
            // 'v2', 'v3', ... - what goes in the cookie and in every override row.
            $table->string('version_key', 16)->unique();
            // What the admin sees in the switcher. Free text.
            $table->string('label', 64);
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
        });

        /**
         * One row per thing an admin has reassigned, inside one version.
         *
         * `target` is either a GameObject class_name ("fighterLight", "metalMine") or
         * one of the fixed slot keys from config/ogx3d.php ("overview_planet"). Keying
         * on class_name rather than on the numeric object id is deliberate: class_name
         * is what the game's own stylesheets already use, so a row here joins straight
         * onto the selector registry without a lookup table.
         *
         * A target with no row keeps its original artwork. An empty table therefore
         * means "this version looks exactly like the shipped game", which is the
         * property that makes a fresh version safe to hand out.
         */
        Schema::create('ogx3d_overrides', function (Blueprint $table) {
            $table->id();
            $table->string('version_key', 16);
            $table->string('target', 64);
            // Replacement 2D image, relative to public/.
            $table->string('image_path')->nullable();
            // Replacement 3D model, relative to public/. Wins over the image when set:
            // a live model and a flat picture cannot occupy the same box.
            $table->string('model_path')->nullable();
            // Lighting preset key from config('ogx3d.presets').
            $table->string('model_preset', 32)->nullable();
            // 'hover' | 'spin' | 'still'
            $table->string('model_motion', 16)->nullable();
            $table->float('model_spin')->nullable();
            $table->float('model_zoom')->nullable();
            $table->timestamps();

            $table->unique(['version_key', 'target']);
            $table->index('version_key');
        });

        /**
         * Plain key/value. Currently one key ('active'), the server-wide version every
         * player sees. A table rather than a config file because an admin changing what
         * the server looks like should not need file access.
         */
        Schema::create('ogx3d_settings', function (Blueprint $table) {
            $table->string('key', 64)->primary();
            $table->string('value', 191);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ogx3d_settings');
        Schema::dropIfExists('ogx3d_overrides');
        Schema::dropIfExists('ogx3d_versions');
    }
};
