<?php

namespace OGame\Ogx3d\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use OGame\Ogx3d\Models\Ogx3dOverride;
use OGame\Ogx3d\Models\Ogx3dSetting;
use OGame\Ogx3d\Models\Ogx3dVersion;
use Throwable;

/**
 * Which graphics version is this request looking at, and which versions exist at all.
 *
 * WHY V1 IS NOT A ROW
 * -------------------
 * V1 is the game as shipped. It is not a version this mod created, it is what is left
 * when the mod does nothing - so it has no row, no overrides, and no code path that can
 * change it. Every other version is a named empty sheet of glass laid over it.
 *
 * WHY EVERYTHING IS READ IN ONE GO, AND CACHED
 * --------------------------------------------
 * This class is consulted from a middleware that runs on EVERY request. Asked naively,
 * that is three schema lookups plus two queries per page - on a server where most pages
 * are on V1 and the honest answer is "the mod has nothing to do here". So the three
 * facts it needs are read together, once, and kept in one cache entry that is dropped
 * whenever an admin changes something.
 *
 * WHY EVERY LOOKUP IS WRAPPED IN try/catch
 * ----------------------------------------
 * The middleware also runs BEFORE `php artisan migrate` has created these tables - and
 * during `php artisan migrate` itself. A missing table must therefore mean "the mod is
 * not set up yet, show the original game", not a 500 on every page. That is the whole
 * of the self-repair here: the mod's failure mode is being invisible.
 */
class Ogx3dVersions
{
    /** The version that is always there, and is never touched. */
    public const string ORIGINAL = 'v1';

    private const string CACHE_KEY = 'ogx3d.state';

    /** @var array{ready: bool, versions: array<string, string>, active: string}|null */
    private array|null $state = null;

    private string|null $activeCache = null;

    /**
     * Everything this class knows, read once.
     *
     * @return array{ready: bool, versions: array<string, string>, active: string}
     */
    private function state(): array
    {
        if ($this->state !== null) {
            return $this->state;
        }

        try {
            $cached = Cache::get(self::CACHE_KEY);
            if (is_array($cached) && isset($cached['ready'], $cached['versions'], $cached['active'])) {
                /** @var array{ready: bool, versions: array<string, string>, active: string} $cached */
                return $this->state = $cached;
            }
        } catch (Throwable) {
            // No cache available. Read from the database instead, every time.
        }

        $state = ['ready' => false, 'versions' => [], 'active' => self::ORIGINAL];

        try {
            $state['ready'] = Schema::hasTable('ogx3d_versions')
                && Schema::hasTable('ogx3d_overrides')
                && Schema::hasTable('ogx3d_settings');

            if ($state['ready']) {
                foreach (Ogx3dVersion::orderBy('sort')->orderBy('id')->get() as $row) {
                    $state['versions'][$row->version_key] = $row->label;
                }
                $active = (string) (Ogx3dSetting::query()->where('key', 'active')->value('value') ?? '');
                $state['active'] = $active !== '' ? $active : self::ORIGINAL;
            }
        } catch (Throwable) {
            // No database, or half a database. The defaults above already say "the mod
            // is not set up", which is the only safe answer.
            $state = ['ready' => false, 'versions' => [], 'active' => self::ORIGINAL];
        }

        // Only a set-up state is worth remembering. Caching "not migrated yet" would
        // mean a fresh install stays broken after `php artisan migrate` until somebody
        // is told to clear a cache they do not know exists.
        //
        // A SHORT TTL, not forever. Every method that changes a version calls forget(),
        // so in normal use this is always fresh - but a row changed from outside the
        // service (a tinker session, a second admin on another worker, a restored
        // backup) would otherwise leave a "forever" entry disagreeing with the database
        // until someone clears a cache they don't know exists. The symptom is a deleted
        // version that keeps coming back, or a "+ New version" that skips a number.
        // Sixty seconds bounds that while still sparing the per-request query under load.
        if ($state['ready']) {
            try {
                Cache::put(self::CACHE_KEY, $state, 60);
            } catch (Throwable) {
                // Working without a cache is slower, not wrong.
            }
        }

        return $this->state = $state;
    }

    /**
     * Are the mod's tables present?
     */
    public function ready(): bool
    {
        return $this->state()['ready'];
    }

    /**
     * Every version, in the order they should be offered. V1 always first.
     *
     * @return array<string, string> key => label
     */
    public function all(): array
    {
        return [self::ORIGINAL => 'V1 - Original (untouched)'] + $this->state()['versions'];
    }

    public function exists(string $key): bool
    {
        return array_key_exists($key, $this->all());
    }

    public function label(string $key): string
    {
        return $this->all()[$key] ?? strtoupper($key);
    }

    /**
     * The version every player sees unless their own browser says otherwise.
     */
    public function serverDefault(): string
    {
        $active = $this->state()['active'];

        return $this->exists($active) ? $active : self::ORIGINAL;
    }

    public function setServerDefault(string $key): void
    {
        if (!$this->exists($key)) {
            return;
        }
        Ogx3dSetting::updateOrCreate(['key' => 'active'], ['value' => $key]);
        $this->forget();
    }

    /**
     * The version for THIS request.
     *
     * A cookie wins over the server-wide setting, so an admin can look at V3 while
     * everybody else is still on V2. A cookie naming a version that has since been
     * deleted is not an error, it is just out of date - it falls back to the server's
     * choice rather than to a blank page.
     */
    public function active(): string
    {
        if ($this->activeCache !== null) {
            return $this->activeCache;
        }

        $chosen = null;
        try {
            $cookie = request()->cookie((string) config('ogx3d.cookie', 'ogx3d_variant'));
            // cookie() may hand back an array when a cookie appears twice. An array is
            // not a version; it is a broken cookie, and a broken cookie gets the
            // original rather than a guess.
            if (is_string($cookie) && $this->exists($cookie)) {
                $chosen = $cookie;
            }
        } catch (Throwable) {
            // No request object at all - a console command, a queue job.
            $chosen = null;
        }

        return $this->activeCache = $chosen ?? $this->serverDefault();
    }

    public function isOriginal(): bool
    {
        return $this->active() === self::ORIGINAL;
    }

    /**
     * Add the next version: V2, then V3, then V4 ... - the "+" button.
     *
     * The new version starts EMPTY. That is the point: it looks exactly like V1 until
     * somebody assigns something to it, so creating one cannot break what players are
     * currently looking at.
     */
    public function createNext(string $label = ''): Ogx3dVersion
    {
        $used = array_keys($this->all());
        $n = 2;
        while (in_array('v' . $n, $used, true)) {
            $n++;
        }
        $key = 'v' . $n;

        $version = Ogx3dVersion::create([
            'version_key' => $key,
            'label' => $label !== '' ? $label : strtoupper($key) . ' - new (empty, looks like V1)',
            'sort' => $n,
        ]);

        $this->forget();

        return $version;
    }

    /**
     * Remove a version and everything assigned to it. V1 cannot be removed - there is
     * nothing to remove, it is the game itself.
     */
    public function delete(string $key): bool
    {
        if ($key === self::ORIGINAL || !$this->exists($key)) {
            return false;
        }

        $wasLive = $this->serverDefault() === $key;

        Ogx3dOverride::where('version_key', $key)->delete();
        Ogx3dVersion::where('version_key', $key)->delete();
        $this->forget();

        // Asked BEFORE the row went, applied after: with the version gone, exists()
        // would refuse the comparison and the server would be left pointing at a
        // version that no longer exists.
        if ($wasLive) {
            $this->setServerDefault(self::ORIGINAL);
        }

        return true;
    }

    public function rename(string $key, string $label): bool
    {
        if ($key === self::ORIGINAL || !$this->exists($key) || $label === '') {
            return false;
        }
        Ogx3dVersion::where('version_key', $key)->update(['label' => $label]);
        $this->forget();

        return true;
    }

    /**
     * Copy every assignment from one version into another. "V3 should start out like
     * V2, then I will change three things" is otherwise an hour of re-uploading.
     */
    public function copyInto(string $from, string $to): int
    {
        if (!$this->exists($from) || !$this->exists($to) || $to === self::ORIGINAL || $from === $to) {
            return 0;
        }

        $count = 0;
        foreach (Ogx3dOverride::where('version_key', $from)->get() as $row) {
            $data = $row->only([
                'target', 'image_path', 'model_path', 'model_preset', 'model_motion', 'model_spin', 'model_zoom',
            ]);
            Ogx3dOverride::updateOrCreate(
                ['version_key' => $to, 'target' => $data['target']],
                $data
            );
            $count++;
        }

        return $count;
    }

    /**
     * Drop everything remembered about the versions. Called from every method that
     * changes them - one place to add to, rather than a cache key to forget at each
     * call site and then to forget about.
     */
    private function forget(): void
    {
        $this->state = null;
        $this->activeCache = null;
        try {
            Cache::forget(self::CACHE_KEY);
        } catch (Throwable) {
            // A cache that cannot be written to is not holding a stale copy either.
        }
    }
}
