<?php

namespace OGame\Ogx3d\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use OGame\Ogx3d\Services\Ogx3dAssets;
use OGame\Ogx3d\Services\Ogx3dRegistry;
use OGame\Ogx3d\Services\Ogx3dVersions;
use Throwable;

/**
 * "Is it installed properly, and if not, what exactly is missing?"
 *
 * Every check prints the command that fixes it. The point is that nobody should have
 * to read this mod's source to find out why nothing happened - and that a bug report
 * can be one command's output instead of a conversation.
 */
class Ogx3dDoctorCommand extends Command
{
    protected $signature = 'ogx3d:doctor {--fix : Create anything missing that can safely be created}';

    protected $description = 'Check the OgameX 3D Mod installation and say what to do about it';

    private int $problems = 0;

    public function handle(Ogx3dVersions $versions, Ogx3dRegistry $registry, Ogx3dAssets $assets): int
    {
        $this->line('');
        $this->line('  OgameX 3D Mod - installation check');
        $this->line('  ----------------------------------');

        /* ---- the one line of installation ---- */
        $providers = base_path('bootstrap/providers.php');
        $registered = File::exists($providers)
            && str_contains((string) File::get($providers), 'Ogx3dServiceProvider');
        $this->check(
            'Service provider registered',
            $registered,
            'Add  OGame\\Ogx3d\\Ogx3dServiceProvider::class,  to bootstrap/providers.php'
                . ' (or run:  php ogx3d-install.php )'
        );

        /* ---- database ---- */
        $this->check(
            'Database tables present',
            $versions->ready(),
            'Run:  php artisan migrate'
        );

        /* ---- the registry ---- */
        $count = count($registry->all());
        $this->check(
            'Icon-selector registry loaded (' . $count . ' objects)',
            $count > 0,
            'Run:  php artisan ogx3d:scan --write'
        );

        /* ---- drop folders ---- */
        foreach ([
            'Model folder' => (string) config('ogx3d.model_dir'),
            'Icon folder' => (string) config('ogx3d.icon_dir'),
        ] as $label => $dir) {
            $abs = public_path($dir);
            $exists = File::isDirectory($abs);
            if (!$exists && $this->option('fix')) {
                try {
                    File::ensureDirectoryExists($abs);
                    $exists = true;
                } catch (Throwable) {
                    // Reported below as a problem.
                }
            }
            $this->check($label . ' (public/' . $dir . ')', $exists, 'Create it, or run:  php artisan ogx3d:doctor --fix');
        }

        /* ---- what is actually in them ---- */
        $models = $assets->availableModels();
        $icons = $assets->availableIcons();
        $this->line('  ·  ' . count($models) . ' model file(s), ' . count($icons) . ' icon file(s) found');

        /* ---- three.js ---- */
        $imports = $assets->threeImports();
        $local = str_starts_with((string) $imports['three'], (string) asset('ogx3d/vendor'));
        $this->line('  ·  three.js from ' . ($local ? 'your own copy in public/ogx3d/vendor/three' : 'the CDN (' . config('ogx3d.three_cdn') . ')'));

        /* ---- versions ---- */
        $all = $versions->all();
        $this->line('');
        $this->line('  Versions:');
        foreach ($all as $key => $label) {
            $marks = [];
            if ($key === $versions->serverDefault()) {
                $marks[] = 'LIVE';
            }
            if ($key === Ogx3dVersions::ORIGINAL) {
                $marks[] = 'original, never modified';
            }
            $this->line('  ·  ' . str_pad(strtoupper($key), 4) . ' ' . $label . ($marks ? '  [' . implode(', ', $marks) . ']' : ''));
        }
        if (count($all) === 1) {
            $this->line('  ·  No version created yet - open the admin bar, "3D Mod", press "+ New version".');
        }

        /* ---- config cache ---- */
        if (File::exists(base_path('bootstrap/cache/config.php'))) {
            $this->line('');
            $this->comment('  Note: the config cache is on. After changing config/ogx3d.php run  php artisan config:clear');
        }

        $this->line('');
        if ($this->problems === 0) {
            $this->info('  Everything checks out.');

            return self::SUCCESS;
        }

        $this->error('  ' . $this->problems . ' thing(s) need fixing - see above.');

        return self::FAILURE;
    }

    private function check(string $what, bool $ok, string $fix): void
    {
        if ($ok) {
            $this->line('  <fg=green>OK</>   ' . $what);

            return;
        }
        $this->problems++;
        $this->line('  <fg=red>MISS</> ' . $what);
        $this->line('       -> ' . $fix);
    }
}
