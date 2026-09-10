<?php

namespace OGame\Ogx3d\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\View\View;
use OGame\Http\Controllers\OGameController;
use OGame\Ogx3d\Models\Ogx3dOverride;
use OGame\Ogx3d\Services\Ogx3dAssets;
use OGame\Ogx3d\Services\Ogx3dRegistry;
use OGame\Ogx3d\Services\Ogx3dVersions;
use OGame\Services\ObjectService;
use Symfony\Component\HttpFoundation\Cookie;
use Throwable;

/**
 * The one screen an admin needs: pick a version, then give any object a different
 * picture or a 3D model.
 *
 * Everything on this screen edits ONE version at a time, named in the ?v= parameter.
 * V1 is offered as a target for nothing at all - it is the shipped game and the whole
 * point of it is that this screen cannot touch it.
 */
class Ogx3dAdminController extends OGameController
{
    public function __construct(
        private readonly Ogx3dVersions $versions,
        private readonly Ogx3dRegistry $registry,
        private readonly Ogx3dAssets $assets,
    ) {
    }

    public function index(Request $request): View
    {
        $editing = $this->editing($request);
        $overrides = $editing !== null ? $this->assets->overrides($editing) : [];

        /** @var array<string, array<string, mixed>> $slotConfig */
        $slotConfig = config('ogx3d.slots', []);

        $groups = [];
        foreach ($this->registry->all() as $className => $entry) {
            $override = $overrides[$className] ?? null;

            // The registry stores the title the game had when it was scanned. Ask the
            // running game instead, so a translated or renamed object reads correctly -
            // and fall back to the stored one for the few entries that are not game
            // objects (the resource icons), for which getObjectById() throws.
            $title = (string) ($entry['title'] ?? $className);
            try {
                $object = ObjectService::getObjectById((int) ($entry['id'] ?? 0));
                if ($object->title !== '') {
                    $title = $object->title;
                }
            } catch (Throwable) {
                // Not a game object - keep the registry's own title.
            }

            $groups[(string) ($entry['type'] ?? 'Other')][] = [
                'target' => $className,
                'title' => $title,
                'selector_count' => count($entry['selectors'] ?? []),
                // The card renders the game's OWN sprite element, so what you see is
                // whatever the game currently paints - original crop or override -
                // without this screen having to know which.
                'preview_classes' => $this->registry->previewClasses($className),
                'image' => $override?->image_path,
                'model' => $override?->model_path,
                'preset' => $override?->model_preset,
                'motion' => $override?->model_motion,
                'spin' => $override?->model_spin,
                'zoom' => $override?->model_zoom,
                'assigned' => $override !== null,
            ];
        }
        ksort($groups);

        $slots = [];
        foreach ($slotConfig as $key => $slot) {
            $override = $overrides[$key] ?? null;
            $slots[] = [
                'target' => $key,
                'title' => (string) ($slot['label'] ?? $key),
                'selector_count' => 0,
                'preview_classes' => null,
                'image' => $override?->image_path,
                'model' => $override?->model_path,
                'preset' => $override?->model_preset,
                'motion' => $override?->model_motion,
                'spin' => $override?->model_spin,
                'zoom' => $override?->model_zoom,
                'assigned' => $override !== null,
            ];
        }

        return view('ogx3d::admin')->with([
            'versions' => $this->versions->all(),
            'server_default' => $this->versions->serverDefault(),
            'looking_at' => $this->versions->active(),
            'editing' => $editing,
            'groups' => $groups,
            'slots' => $slots,
            'models' => $this->assets->availableModels(),
            'icons' => $this->assets->availableIcons(),
            'presets' => $this->presetChoices(),
            'model_dir' => (string) config('ogx3d.model_dir'),
            'icon_dir' => (string) config('ogx3d.icon_dir'),
            'ready' => $this->versions->ready(),
        ]);
    }

    /* =====================================================================
     * Versions
     * ================================================================== */

    public function versionAdd(Request $request): RedirectResponse
    {
        $label = trim((string) $request->input('label', ''));
        $version = $this->versions->createNext($label);

        return $this->back($version->version_key)
            ->with('success', strtoupper($version->version_key) . ' created. It is empty, so it looks exactly like V1 until you assign something.');
    }

    public function versionRename(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'version' => ['required', 'string', 'max:16'],
            'label' => ['required', 'string', 'max:64'],
        ]);

        return $this->versions->rename($data['version'], $data['label'])
            ? $this->back($data['version'])->with('success', 'Renamed.')
            : $this->back($data['version'])->with('error', 'That version cannot be renamed.');
    }

    public function versionDelete(Request $request): RedirectResponse
    {
        $data = $request->validate(['version' => ['required', 'string', 'max:16']]);

        // Named explicitly, and BEFORE the version goes: invalidate() with no argument
        // walks the list of versions that exist, and this one is about to stop being
        // one - its cached stylesheet would then sit in the cache forever, unread.
        $this->assets->invalidate($data['version']);

        if (!$this->versions->delete($data['version'])) {
            return $this->back()->with('error', 'That version cannot be deleted.');
        }

        // The uploads belonged to that version alone, so they go with it. Nothing else
        // can be pointing at them - the path carries the version name.
        try {
            File::deleteDirectory(public_path($this->assets->uploadDir($data['version'])));
        } catch (Throwable) {
            // Leaving orphaned files behind is untidy, not broken.
        }

        return $this->back()->with('success', strtoupper($data['version']) . ' deleted.');
    }

    public function versionCopy(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'from' => ['required', 'string', 'max:16'],
            'to' => ['required', 'string', 'max:16'],
        ]);

        $count = $this->versions->copyInto($data['from'], $data['to']);
        $this->assets->invalidate($data['to']);

        return $this->back($data['to'])->with(
            'success',
            $count > 0
                ? $count . ' assignment(s) copied from ' . strtoupper($data['from']) . '.'
                : 'Nothing to copy.'
        );
    }

    /**
     * Set the version the whole server sees.
     */
    public function versionActivate(Request $request): RedirectResponse
    {
        $data = $request->validate(['version' => ['required', 'string', 'max:16']]);
        if (!$this->versions->exists($data['version'])) {
            return $this->back()->with('error', 'Unknown version.');
        }
        $this->versions->setServerDefault($data['version']);

        return $this->back()
            ->with('success', 'Every player now sees ' . strtoupper($data['version']) . '.');
    }

    /**
     * Look at a version in THIS browser only, without changing what players see.
     */
    public function versionPreview(Request $request): RedirectResponse
    {
        $data = $request->validate(['version' => ['required', 'string', 'max:16']]);
        if (!$this->versions->exists($data['version'])) {
            return $this->back()->with('error', 'Unknown version.');
        }

        $target = (string) $request->input('back', '');
        // Only ever return to an address on this server. A posted url is caller
        // controlled, and "go back to where you were" must not become "go anywhere".
        $redirect = ($target !== '' && str_starts_with($target, $request->getSchemeAndHttpHost() . '/'))
            ? redirect()->to($target)
            : $this->back($data['version']);

        return $redirect
            ->withCookie(new Cookie(
                name: (string) config('ogx3d.cookie', 'ogx3d_variant'),
                value: $data['version'],
                expire: time() + 60 * 60 * 24 * 365,
                path: '/',
                secure: false,
                httpOnly: false,
                raw: true,
            ))
            ->with('success', 'This browser is now looking at ' . strtoupper($data['version']) . '. Other players are unaffected.');
    }

    /* =====================================================================
     * Assignments
     * ================================================================== */

    public function assign(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'version' => ['required', 'string', 'max:16'],
            'target' => ['required', 'string', 'max:64'],
            'image' => ['nullable', 'string', 'max:255'],
            'image_file' => ['nullable', 'image', 'max:8192'],
            'model' => ['nullable', 'string', 'max:255'],
            'preset' => ['nullable', 'string', 'max:32'],
            'motion' => ['nullable', 'string', 'in:hover,spin,still'],
            'spin' => ['nullable', 'numeric', 'min:0', 'max:20'],
            'zoom' => ['nullable', 'numeric', 'min:0.2', 'max:5'],
        ]);

        $version = $data['version'];
        $target = $data['target'];

        if ($version === Ogx3dVersions::ORIGINAL || !$this->versions->exists($version)) {
            return $this->back()->with('error', 'V1 is the original game and cannot be changed. Create a version first.');
        }
        if (!$this->isKnownTarget($target)) {
            return $this->back($version)->with('error', 'Unknown target: ' . $target);
        }

        $attributes = [];

        // An uploaded file wins over a pick from the drop folder: if someone filled in
        // both, the upload is the thing they did most recently and most deliberately.
        if ($request->hasFile('image_file')) {
            $file = $request->file('image_file');
            $dir = public_path($this->assets->uploadDir($version));
            File::ensureDirectoryExists($dir);
            // The extension comes out of the uploader's own filename, so it is
            // caller-controlled text, not a fact. It ends up in a path on disk AND
            // inside url('...') in the generated stylesheet, so anything not on this
            // list becomes .png rather than becoming a problem.
            $extension = strtolower((string) $file->getClientOriginalExtension());
            if (!in_array($extension, ['png', 'jpg', 'jpeg', 'gif', 'webp'], true)) {
                $extension = 'png';
            }
            // Named after the object, not after the upload: re-uploading then replaces
            // the previous file instead of leaving orphans, and the name stays
            // predictable for anyone looking in public/ by hand.
            $name = $target . '.' . $extension;
            // Any earlier upload for this object under a different extension would
            // otherwise stay on disk and be the file nothing points at any more.
            foreach (['png', 'jpg', 'jpeg', 'gif', 'webp'] as $old) {
                $stale = $dir . DIRECTORY_SEPARATOR . $target . '.' . $old;
                if ($old !== $extension && is_file($stale)) {
                    File::delete($stale);
                }
            }
            $file->move($dir, $name);
            $attributes['image_path'] = $this->assets->uploadDir($version) . '/' . $name;
        } elseif (($data['image'] ?? '') !== '') {
            if (!in_array($data['image'], $this->assets->availableIcons(), true)) {
                return $this->back($version)->with('error', 'That icon is not in ' . config('ogx3d.icon_dir') . '.');
            }
            $attributes['image_path'] = $data['image'];
        } elseif ($request->boolean('clear_image')) {
            $attributes['image_path'] = null;
        }

        if (($data['model'] ?? '') !== '') {
            if (!in_array($data['model'], $this->assets->availableModels(), true)) {
                return $this->back($version)->with('error', 'That model is not in ' . config('ogx3d.model_dir') . '.');
            }
            $attributes['model_path'] = $data['model'];
        } elseif ($request->boolean('clear_model')) {
            $attributes['model_path'] = null;
        }

        if (($data['preset'] ?? '') !== '') {
            if (!array_key_exists($data['preset'], $this->presetChoices())) {
                return $this->back($version)->with('error', 'Unknown lighting preset.');
            }
            $attributes['model_preset'] = $data['preset'];
        }
        if (($data['motion'] ?? '') !== '') {
            $attributes['model_motion'] = $data['motion'];
        }
        if (($data['spin'] ?? '') !== '') {
            $attributes['model_spin'] = (float) $data['spin'];
        }
        if (($data['zoom'] ?? '') !== '') {
            $attributes['model_zoom'] = (float) $data['zoom'];
        }

        if ($attributes === []) {
            return $this->back($version)->with('error', 'Nothing chosen - no picture, no model, no setting.');
        }

        Ogx3dOverride::updateOrCreate(
            ['version_key' => $version, 'target' => $target],
            $attributes
        );
        $this->assets->invalidate($version);

        return $this->back($version)->with('success', $target . ' updated in ' . strtoupper($version) . '.');
    }

    public function reset(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'version' => ['required', 'string', 'max:16'],
            'target' => ['required', 'string', 'max:64'],
        ]);

        // The uploaded file stays on disk on purpose: resetting is meant to be a cheap
        // "show me the original again", not a destructive delete of artwork somebody
        // may have spent an evening preparing.
        Ogx3dOverride::where('version_key', $data['version'])
            ->where('target', $data['target'])
            ->delete();
        $this->assets->invalidate($data['version']);

        return $this->back($data['version'])
            ->with('success', $data['target'] . ' is back to the original.');
    }

    /**
     * Put a file into one of the drop folders from the browser, for admins who cannot
     * reach the server's filesystem.
     */
    public function upload(Request $request): RedirectResponse
    {
        $version = (string) $request->input('version', '');
        $file = $request->file('file');

        if ($file === null || is_array($file)) {
            return $this->back($version)->with('error', 'No file received.');
        }

        $extension = strtolower((string) $file->getClientOriginalExtension());
        $isModel = in_array($extension, ['glb', 'gltf'], true);
        $isIcon = in_array($extension, ['png', 'jpg', 'jpeg', 'gif', 'webp'], true);

        if (!$isModel && !$isIcon) {
            return $this->back($version)->with('error', 'Only .glb, .gltf, .png, .jpg, .gif and .webp are accepted.');
        }
        if ($file->getSize() > 64 * 1024 * 1024) {
            return $this->back($version)->with('error', 'That file is larger than 64 MB.');
        }

        $dir = public_path((string) config($isModel ? 'ogx3d.model_dir' : 'ogx3d.icon_dir'));
        File::ensureDirectoryExists($dir);

        // The name is caller-controlled, so keep only the parts that can name a file
        // and nothing that can name a directory.
        $base = preg_replace('/[^A-Za-z0-9._-]/', '_', (string) $file->getClientOriginalName()) ?? 'upload';
        $base = ltrim(str_replace('..', '_', $base), '.');
        if ($base === '') {
            $base = 'upload.' . $extension;
        }

        $file->move($dir, $base);

        return $this->back($version)->with('success', $base . ' added. It is now in the list below.');
    }

    public function rebuild(Request $request): RedirectResponse
    {
        $this->assets->invalidate();

        return $this->back((string) $request->input('version', ''))
            ->with('success', 'Rebuilt.');
    }

    /* =====================================================================
     * Helpers
     * ================================================================== */

    /**
     * Which version is being edited. Never V1, and never a version that is gone.
     */
    private function editing(Request $request): string|null
    {
        $requested = (string) $request->query('v', '');
        if ($requested !== '' && $requested !== Ogx3dVersions::ORIGINAL && $this->versions->exists($requested)) {
            return $requested;
        }

        foreach (array_keys($this->versions->all()) as $key) {
            if ($key !== Ogx3dVersions::ORIGINAL) {
                return $key;
            }
        }

        return null;
    }

    private function isKnownTarget(string $target): bool
    {
        return $this->registry->has($target)
            || array_key_exists($target, (array) config('ogx3d.slots', []));
    }

    /**
     * @return array<string, string>
     */
    private function presetChoices(): array
    {
        /** @var array<string, array<string, mixed>> $presets */
        $presets = config('ogx3d.presets', []);
        $out = [];
        foreach ($presets as $key => $preset) {
            $out[$key] = (string) ($preset['label'] ?? $key);
        }

        return $out;
    }

    private function back(string $version = ''): RedirectResponse
    {
        return redirect()->route('ogx3d.admin.index', $version !== '' ? ['v' => $version] : []);
    }
}
