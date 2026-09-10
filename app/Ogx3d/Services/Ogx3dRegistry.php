<?php

namespace OGame\Ogx3d\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use OGame\Services\ObjectService;
use Throwable;

/**
 * WHICH CSS SELECTORS PAINT WHICH GAME OBJECT.
 *
 * WHY THIS FILE HAS TO EXIST
 * --------------------------
 * Every icon in OGameX is a crop out of a sprite atlas: one css rule sets the
 * background-image for a whole family of icons, another sets the background-position
 * that picks one cell out of it. There is not one atlas but several, and the SAME ship
 * is painted out of several of them depending on the screen - the 200px shipyard
 * artwork, the 80px fleet row, the small techtree tile, the detail panel's header.
 *
 * That is why replacing a ship by editing an atlas by hand fixes the shipyard and
 * leaves the fleet screen, the scrap dealer and the tech tree showing the old picture:
 * those read a different sheet. Chasing it means N screens x M objects of pixel work,
 * and it rots the moment the game adds a screen.
 *
 * So instead: find every selector that paints each object, once, and write one
 * !important rule per selector. One uploaded image then repoints all of them at the
 * same moment. Swapping an icon becomes a wiring change instead of pixel work.
 *
 * THE REGISTRY IS DATA, NOT CODE
 * ------------------------------
 * config/ogx3d_registry.php ships pre-built for a stock OGameX. If you have changed
 * the game's own stylesheets, run
 *
 *     php artisan ogx3d:scan --write
 *
 * and it is rebuilt from whatever your css actually says. Nothing else has to change:
 * the rest of the mod only ever asks this class.
 */
class Ogx3dRegistry
{
    /**
     * Where the game's stylesheets live, relative to the project root. Scanned in this
     * order; the first existing one wins.
     *
     * @var array<int, string>
     */
    private const array CSS_ROOTS = [
        'resources/css/ingame',
        'public/css/ingame',
    ];

    /** Folders under those roots that must not be scanned. */
    private const array CSS_SKIP = ['deprecated'];

    /**
     * The handful of things that are painted like a game object but are not one, so
     * ObjectService knows nothing about them. Their selectors are matched by name
     * instead of by id.
     *
     * @var array<string, array{title: string, match: array<int, string>}>
     */
    private const array EXTRAS = [
        'resource_metal' => ['title' => 'Resource icon: metal', 'match' => ['metal']],
        'resource_crystal' => ['title' => 'Resource icon: crystal', 'match' => ['crystal']],
        'resource_deuterium' => ['title' => 'Resource icon: deuterium', 'match' => ['deuterium']],
        'resource_energy' => ['title' => 'Resource icon: energy', 'match' => ['energy']],
        'resource_darkmatter' => ['title' => 'Resource icon: dark matter', 'match' => ['darkmatter']],
    ];

    /** @var array<string, array<string, mixed>>|null */
    private array|null $cache = null;

    /**
     * class_name => ['id', 'title', 'type', 'selectors' => [...]]
     *
     * @return array<string, array<string, mixed>>
     */
    public function all(): array
    {
        if ($this->cache !== null) {
            return $this->cache;
        }

        /** @var array<string, array<string, mixed>> $registry */
        $registry = config('ogx3d_registry', []);

        /*
         * No registry file - somebody deleted it, or it was never generated. Scan now
         * rather than silently offering an admin screen with nothing on it: a mod that
         * still works after losing one of its own files beats one that goes quiet.
         *
         * Cached, because scanning means reading every stylesheet the game has and
         * doing that once per request would turn a missing file into a performance
         * problem instead of a self-repair. `php artisan cache:clear` re-runs it, and
         * `php artisan ogx3d:scan --write` makes the file exist again.
         */
        if ($registry === []) {
            try {
                $registry = Cache::remember('ogx3d.registry.scanned', 3600, fn (): array => $this->scan());
            } catch (Throwable) {
                $registry = [];
            }
        }

        return $this->cache = $registry;
    }

    public function has(string $className): bool
    {
        return array_key_exists($className, $this->all());
    }

    /**
     * @return array<string, mixed>|null
     */
    public function get(string $className): array|null
    {
        return $this->all()[$className] ?? null;
    }

    /**
     * Every selector for one object, with css comments stripped out.
     *
     * The scanner keeps whatever text sat in front of a selector so the source stays
     * traceable, and OGameX's own stylesheets put section headings there
     * ("/* ~~ MILITARY ~~ *&#47;"). A comment inside a selector list is legal css but
     * unreadable in a generated file, so it is removed here rather than in the data.
     *
     * @return array<int, string>
     */
    public function selectors(string $className): array
    {
        $entry = $this->get($className);
        if ($entry === null) {
            return [];
        }

        $out = [];
        /** @var array<int, array<string, mixed>> $selectors */
        $selectors = $entry['selectors'] ?? [];
        foreach ($selectors as $sel) {
            $text = trim(preg_replace('#/\*.*?\*/#s', ' ', (string) ($sel['selector'] ?? '')) ?? '');
            $text = trim(preg_replace('/\s+/', ' ', $text) ?? '');
            if ($text !== '') {
                $out[] = $text;
            }
        }

        return array_values(array_unique($out));
    }

    /**
     * The class list for a preview element: one of the object's own selectors, turned
     * back into the classes that produce it, so the admin screen can show the game's
     * OWN icon rather than a second copy of the artwork.
     *
     * Prefers the large bucket and falls back through the smaller ones. Pseudo-element
     * and id-anchored selectors are skipped: they cannot be reproduced by putting
     * classes on a bare <span>.
     */
    public function previewClasses(string $className): string|null
    {
        $entry = $this->get($className);
        if ($entry === null) {
            return null;
        }
        /** @var array<int, array<string, mixed>> $selectors */
        $selectors = $entry['selectors'] ?? [];

        foreach (['large', 'medium', 'small', 'other'] as $bucket) {
            foreach ($selectors as $sel) {
                if (($sel['bucket'] ?? null) !== $bucket) {
                    continue;
                }
                $selector = trim(preg_replace('#/\*.*?\*/#s', ' ', (string) ($sel['selector'] ?? '')) ?? '');
                if ($selector === '' || str_contains($selector, '::') || str_contains($selector, '#') || str_contains($selector, ' ')) {
                    continue;
                }
                $classes = array_values(array_filter(explode('.', $selector)));
                if ($classes !== []) {
                    return implode(' ', $classes);
                }
            }
        }

        return null;
    }

    /* =====================================================================
     * The scanner
     * ================================================================== */

    /**
     * Rebuild the registry by reading the game's own stylesheets.
     *
     * @return array<string, array<string, mixed>>
     */
    public function scan(): array
    {
        $rules = $this->cssRules();
        $registry = [];

        foreach ($this->gameObjects() as $className => $meta) {
            $needles = ['.' . $className];
            if ($meta['prefix'] !== '' && $meta['id'] > 0) {
                $needles[] = '.' . $meta['prefix'] . $meta['id'];
            }

            $selectors = $this->collect($rules, $needles);
            if ($selectors === []) {
                continue;
            }

            $registry[$className] = [
                'id' => $meta['id'],
                'title' => $meta['title'],
                'type' => $meta['type'],
                'selectors' => $selectors,
            ];
        }

        foreach (self::EXTRAS as $key => $extra) {
            $needles = array_map(static fn (string $m): string => '.' . $m, $extra['match']);
            // Extras are matched much more tightly than objects: "metal" is a common
            // word, and a loose match would repaint half the interface.
            $selectors = $this->collect($rules, $needles, '/(resourceIcon|\.resource\b|\.sprite\.resource)/');
            if ($selectors !== []) {
                $registry[$key] = [
                    'id' => 0,
                    'title' => $extra['title'],
                    'type' => 'UiAsset',
                    'selectors' => $selectors,
                ];
            }
        }

        return $registry;
    }

    /**
     * Matching selectors, each listed ONCE.
     *
     * The game ships the same rules in several stylesheets - 02base.css and the hashed
     * theme files carry near-identical copies, and the module files repeat them again.
     * Without this, one object collects the same six selectors four times over: a
     * registry four times the size that generates four times the css and says nothing
     * more. The first file a selector was seen in is kept, so the data stays traceable.
     *
     * @param array<int, array{selectors: array<int, string>, file: string}> $rules
     * @param array<int, string> $needles
     *
     * @return array<int, array{selector: string, bucket: string, file: string}>
     */
    private function collect(array $rules, array $needles, string|null $extraTest = null): array
    {
        $found = [];
        foreach ($rules as $rule) {
            foreach ($rule['selectors'] as $selector) {
                if (isset($found[$selector])) {
                    continue;
                }
                if (!$this->selectorMentions($selector, $needles)) {
                    continue;
                }
                if ($extraTest !== null && preg_match($extraTest, $selector) !== 1) {
                    continue;
                }
                $found[$selector] = [
                    'selector' => $selector,
                    'bucket' => $this->bucket($selector),
                    'file' => $rule['file'],
                ];
            }
        }

        return array_values($found);
    }

    /**
     * Every game object the running game knows about.
     *
     * @return array<string, array{id: int, title: string, type: string, prefix: string}>
     */
    private function gameObjects(): array
    {
        $out = [];
        foreach (ObjectService::getObjects() as $object) {
            // class_name is optional in OGameX (it defaults to an empty string, for
            // objects whose machine_name is already what the css uses). An empty key
            // would collect every selector in the game under one nameless entry, so
            // such an object simply has no icon this mod can swap.
            if ($object->class_name === '') {
                continue;
            }
            $type = class_basename($object);
            $out[$object->class_name] = [
                'id' => (int) $object->id,
                'title' => (string) $object->title,
                'type' => $type,
                'prefix' => match ($type) {
                    'BuildingObject', 'StationObject' => 'building',
                    'ResearchObject' => 'research',
                    'ShipObject' => 'ship',
                    'DefenseObject' => 'defense',
                    default => '',
                },
            ];
        }

        return $out;
    }

    /**
     * Every css rule that paints something, as {selectors, file}.
     *
     * Only rules that actually touch a background are kept. A rule that merely sets a
     * width or a z-index names the object too, and generating a background override
     * for it would repaint elements that were never showing the icon in the first
     * place.
     *
     * @return array<int, array{selectors: array<int, string>, file: string}>
     */
    private function cssRules(): array
    {
        $out = [];

        foreach (self::CSS_ROOTS as $root) {
            $dir = base_path($root);
            if (!File::isDirectory($dir)) {
                continue;
            }

            foreach (File::allFiles($dir) as $file) {
                if (strtolower($file->getExtension()) !== 'css') {
                    continue;
                }
                $relative = str_replace('\\', '/', $file->getRelativePathname());
                foreach (self::CSS_SKIP as $skip) {
                    if (str_starts_with($relative, $skip . '/')) {
                        continue 2;
                    }
                }

                // Comments out first: they can contain braces and commas, and a
                // brace-counting split trips over both.
                $css = preg_replace('#/\*.*?\*/#s', ' ', (string) File::get($file->getPathname())) ?? '';

                // Every "<selector list> { <declarations> }". At-rules keep their own
                // braces, so @media blocks contribute their inner rules and their own
                // header is discarded by the background test below.
                if (preg_match_all('/([^{}]+)\{([^{}]*)\}/', $css, $matches, PREG_SET_ORDER) === false) {
                    continue;
                }

                foreach ($matches as $match) {
                    if (!preg_match('/\bbackground(-image|-position|-position-x|-position-y|)\s*:/i', $match[2])) {
                        continue;
                    }
                    $selectors = [];
                    foreach (explode(',', $match[1]) as $selector) {
                        $selector = trim(preg_replace('/\s+/', ' ', $selector) ?? '');
                        if ($selector !== '' && !str_starts_with($selector, '@')) {
                            $selectors[] = $selector;
                        }
                    }
                    if ($selectors !== []) {
                        $out[] = ['selectors' => $selectors, 'file' => $relative];
                    }
                }
            }

            // The first root that exists is the game's stylesheet source. Scanning the
            // second one as well would list every selector twice.
            break;
        }

        return $out;
    }

    /**
     * Does this selector name one of these classes as a whole token?
     *
     * Whole token matters: ".ship20" is inside ".ship204", and ".metal" is inside
     * ".metalMine". Without the boundary test the Light Fighter would inherit the
     * Small Cargo's selectors and the metal icon would repaint the metal mine.
     *
     * @param array<int, string> $needles
     */
    private function selectorMentions(string $selector, array $needles): bool
    {
        foreach ($needles as $needle) {
            $pattern = '/' . preg_quote($needle, '/') . '(?![A-Za-z0-9_-])/';
            if (preg_match($pattern, $selector) === 1) {
                return true;
            }
        }

        return false;
    }

    /**
     * Rough size of the icon a selector paints. Only used to pick a preview.
     */
    private function bucket(string $selector): string
    {
        return match (true) {
            str_contains($selector, '.large') => 'large',
            str_contains($selector, '.medium') => 'medium',
            str_contains($selector, '.small') => 'small',
            default => 'other',
        };
    }

    /**
     * The registry as a php file, ready to be written to config/ogx3d_registry.php.
     *
     * @param array<string, array<string, mixed>> $registry
     */
    public function toPhpFile(array $registry): string
    {
        $export = var_export($registry, true);
        // var_export writes "array (" - readable enough, but the short syntax is what
        // the rest of the project uses and this file is meant to be openable.
        $export = preg_replace('/^array \(/', '[', $export) ?? $export;
        $export = preg_replace('/^\)$/m', ']', $export) ?? $export;
        $export = str_replace(['array (', "=> \n"], ['[', '=> '], $export);
        $export = preg_replace('/^(\s*)\),$/m', '$1],', $export) ?? $export;
        $export = preg_replace('/^(\s*)\)$/m', '$1]', $export) ?? $export;

        return <<<PHP
        <?php

        /**
         * GENERATED FILE - do not edit by hand.
         *
         * Rebuild with:  php artisan ogx3d:scan --write
         *
         * Every game object mapped to every css selector in the game's own stylesheets
         * that paints it. OgameX 3D Mod turns an uploaded image for an object into one
         * !important rule per selector listed here, which is why one upload updates the
         * shipyard, the fleet screens, the tech tree and the detail panel at once
         * instead of one screen per hand-patched atlas.
         *
         * See app/Ogx3d/Services/Ogx3dRegistry.php for the why.
         */

        return {$export};

        PHP;
    }
}
