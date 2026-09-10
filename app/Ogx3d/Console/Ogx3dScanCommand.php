<?php

namespace OGame\Ogx3d\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use OGame\Ogx3d\Services\Ogx3dRegistry;

/**
 * Rebuild the selector registry from the game's own stylesheets.
 *
 * The mod ships a registry built against a stock OGameX, so most people never need
 * this. It exists for the case that actually happens: somebody edits the game's css,
 * or adds an object, and then "the upload does nothing" for that one object. Running
 * this makes the mod fit whatever the game currently says, instead of whatever it said
 * when the mod was packaged.
 */
class Ogx3dScanCommand extends Command
{
    protected $signature = 'ogx3d:scan
                            {--write : Write the result to config/ogx3d_registry.php}';

    protected $description = 'Rebuild the 3D Mod icon-selector registry from the game stylesheets';

    public function handle(Ogx3dRegistry $registry): int
    {
        $this->info('Scanning the game stylesheets...');

        $found = $registry->scan();

        if ($found === []) {
            $this->error('Nothing found. Are resources/css/ingame/*.css present?');

            return self::FAILURE;
        }

        $selectors = 0;
        $byType = [];
        foreach ($found as $entry) {
            $selectors += count($entry['selectors'] ?? []);
            $type = (string) ($entry['type'] ?? 'Other');
            $byType[$type] = ($byType[$type] ?? 0) + 1;
        }

        $rows = [];
        foreach ($byType as $type => $count) {
            $rows[] = [$type, $count];
        }
        $this->table(['Type', 'Objects'], $rows);
        $this->info(count($found) . ' objects, ' . $selectors . ' selectors.');

        if (!$this->option('write')) {
            $this->line('');
            $this->comment('Nothing written. Run again with --write to save it.');

            return self::SUCCESS;
        }

        $path = base_path('config/ogx3d_registry.php');
        File::put($path, $registry->toPhpFile($found));
        $this->info('Written: ' . $path);

        // The generated file is read at boot, and a cached config keeps the old copy.
        if (File::exists(base_path('bootstrap/cache/config.php'))) {
            $this->comment('Config cache detected - run "php artisan config:clear" to pick this up.');
        }

        return self::SUCCESS;
    }
}
