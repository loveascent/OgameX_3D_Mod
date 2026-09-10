<?php

namespace OGame\Ogx3d;

use Illuminate\Contracts\Http\Kernel;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use OGame\Ogx3d\Console\Ogx3dDoctorCommand;
use OGame\Ogx3d\Console\Ogx3dScanCommand;
use OGame\Ogx3d\Http\Controllers\Ogx3dAdminController;
use OGame\Ogx3d\Http\Controllers\Ogx3dAssetController;
use OGame\Ogx3d\Http\Middleware\Ogx3dInject;
use OGame\Ogx3d\Services\Ogx3dAssets;
use OGame\Ogx3d\Services\Ogx3dRegistry;
use OGame\Ogx3d\Services\Ogx3dVersions;
use Throwable;

/**
 * The one line the mod adds to the game.
 *
 * Registering this provider in bootstrap/providers.php is the ENTIRE installation on
 * the code side. Everything else - routes, migrations, views, the middleware that puts
 * the mod's assets into the page - is wired up from here, so removing that one line
 * removes the mod completely and leaves the game exactly as it was.
 */
class Ogx3dServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__ . '/../../config/ogx3d.php', 'ogx3d');

        // The selector registry is data, and lives in its own file because it is
        // generated. mergeConfigFrom would deep-merge it entry by entry; a plain set
        // is both faster and honest about it being a whole file or nothing.
        if (is_file($registry = base_path('config/ogx3d_registry.php'))) {
            $this->app['config']->set('ogx3d_registry', require $registry);
        }

        // One instance per request. All three cache their answers, and asking the
        // database which version is active once per page instead of once per lookup is
        // the difference between a mod you notice and one you do not.
        $this->app->singleton(Ogx3dVersions::class);
        $this->app->singleton(Ogx3dRegistry::class);
        $this->app->singleton(Ogx3dAssets::class);
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__ . '/../../database/migrations');
        $this->loadViewsFrom(__DIR__ . '/views', 'ogx3d');

        if ($this->app->runningInConsole()) {
            $this->commands([
                Ogx3dScanCommand::class,
                Ogx3dDoctorCommand::class,
            ]);
        }

        // Which version a browser is looking at is a display preference, not a secret.
        // Leaving it unencrypted keeps it readable in the browser's own dev tools,
        // which is the difference between "the switch does nothing" being a five-second
        // check and an afternoon.
        EncryptCookies::except([(string) config('ogx3d.cookie', 'ogx3d_variant')]);

        $this->registerMiddleware();
        $this->registerRoutes();
    }

    /**
     * Append the injector to the web group.
     *
     * Done here rather than in bootstrap/app.php so that the mod stays contained in
     * one line of installation. Appending (not prepending) puts it last, so it sees the
     * finished html of whatever the game rendered.
     */
    private function registerMiddleware(): void
    {
        try {
            $kernel = $this->app->make(Kernel::class);
            if (method_exists($kernel, 'appendMiddlewareToGroup')) {
                $kernel->appendMiddlewareToGroup('web', Ogx3dInject::class);
            }
        } catch (Throwable) {
            // No http kernel (a console command, a queue worker). Nothing to inject
            // into, and nothing to complain about.
        }
    }

    private function registerRoutes(): void
    {
        // The generated stylesheet. Deliberately a route and not a file on disk: it is
        // rebuilt from the database, and a file would need writing, cache-busting and
        // cleaning up after every save.
        //
        // THE VERSION IS IN THE PATH, NOT IN A COOKIE. Resolving it from the cookie
        // inside the handler would give every version the same url with different
        // bodies - and any shared cache, the browser's included, would then hand one
        // player V3's artwork while they are looking at V2. A url that names its
        // version is safe to cache hard, which is also why it can carry a long max-age.
        Route::get('/ogx3d/style-{version}.css', [Ogx3dAssetController::class, 'css'])
            ->where('version', '[a-z0-9]{1,16}')
            ->name('ogx3d.css');

        // The admin screen. Same guards the game's own admin pages use.
        Route::middleware(['web', 'auth', 'globalgame', 'locale', 'admin'])
            ->prefix('admin/ogx3d')
            ->name('ogx3d.admin.')
            ->group(function (): void {
                Route::get('/', [Ogx3dAdminController::class, 'index'])->name('index');

                Route::post('/version/add', [Ogx3dAdminController::class, 'versionAdd'])->name('version.add');
                Route::post('/version/rename', [Ogx3dAdminController::class, 'versionRename'])->name('version.rename');
                Route::post('/version/delete', [Ogx3dAdminController::class, 'versionDelete'])->name('version.delete');
                Route::post('/version/copy', [Ogx3dAdminController::class, 'versionCopy'])->name('version.copy');
                Route::post('/version/activate', [Ogx3dAdminController::class, 'versionActivate'])->name('version.activate');
                Route::post('/version/preview', [Ogx3dAdminController::class, 'versionPreview'])->name('version.preview');

                Route::post('/assign', [Ogx3dAdminController::class, 'assign'])->name('assign');
                Route::post('/reset', [Ogx3dAdminController::class, 'reset'])->name('reset');
                Route::post('/upload', [Ogx3dAdminController::class, 'upload'])->name('upload');
                Route::post('/rebuild', [Ogx3dAdminController::class, 'rebuild'])->name('rebuild');
            });
    }
}
