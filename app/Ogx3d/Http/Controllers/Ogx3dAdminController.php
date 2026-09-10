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

    /**
     * The switch every player has, not just admins: which graphics version THIS
     * browser sees. A plain GET link, the same shape as the language switcher sitting
     * right beside it (/lang/en) - a display preference needs no confirmation and no
     * CSRF token, only somewhere to click.
     *
     * Setting the server's default is a different, heavier action and stays behind
     * the admin screen; this one only ever touches the cookie in the browser that
     * followed the link.
     */
    public function choose(Request $request, string $version): RedirectResponse
    {
        $chosen = $this->versions->exists($version) ? $version : Ogx3dVersions::ORIGINAL;

        $back = (string) $request->query('back', '');
        // Only ever back to an address on this server - a posted url is caller
        // controlled, and "return to where I was" must not become "go anywhere".
        $redirect = ($back !== '' && str_starts_with($back, $request->getSchemeAndHttpHost() . '/'))
            ? redirect()->to($back)
            : redirect()->route('options.index');

        return $redirect->withCookie(new Cookie(
            name: (string) config('ogx3d.cookie', 'ogx3d_variant'),
            value: $chosen,
            expire: time() + 60 * 60 * 24 * 365,
            path: '/',
            secure: false,
            httpOnly: false,
            raw: true,
        ));
    }

    /* =====================================================================
     * Assignments
     * ================================================================== */

    public function assign(Request $request): RedirectResponse|\Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'version' => ['required', 'string', 'max:16'],
            'target' => ['required', 'string', 'max:64'],
            'image' => ['nullable', 'string', 'max:255'],
            'image_file' => ['nullable', 'file', 'mimes:png,jpg,jpeg,gif,webp', 'max:8192'],
            'model' => ['nullable', 'string', 'max:255'],
            'model_file' => ['nullable', 'file', 'mimes:glb,gltf', 'max:65536'],
            'preset' => ['nullable', 'string', 'max:32'],
            'motion' => ['nullable', 'string', 'in:hover,spin,still'],
            'spin' => ['nullable', 'numeric', 'min:0', 'max:20'],
            'zoom' => ['nullable', 'numeric', 'min:0.2', 'max:5'],
        ]);

        $version = $data['version'];
        $target = $data['target'];

        if ($version === Ogx3dVersions::ORIGINAL || !$this->versions->exists($version)) {
            return $this->respond($request, false, $version, 'V1 is the original game and cannot be changed. Create a version first.');
        }
        if (!$this->isKnownTarget($target)) {
            return $this->respond($request, false, $version, 'Unknown target: ' . $target);
        }

        $attributes = [];

        /*
         * A FILE PICKED HERE LANDS IN THE SAME SHARED DROP FOLDER AS A FILE DRAGGED IN
         * BY HAND, NOT IN A HIDDEN PER-VERSION FOLDER.
         *
         * That used to be different: picking a file right on an object's own card
         * quietly filed it away under public/ogx3d/uploads/<version>/, invisible to the
         * drop-down and to anyone looking in Put_GLB_and_Icons_here/ afterwards - one
         * file, two different homes depending on which button you happened to click to
         * add it. Now both paths call the same saveIntoDropFolder(), so "I picked a
         * file" always means "it is now in the folder, and in the list" - no exceptions
         * to remember.
         */
        if ($request->hasFile('image_file')) {
            $attributes['image_path'] = $this->saveIntoDropFolder(
                $request->file('image_file'),
                (string) config('ogx3d.icon_dir'),
                ['png', 'jpg', 'jpeg', 'gif', 'webp']
            );
        } elseif (($data['image'] ?? '') !== '') {
            if (!in_array($data['image'], $this->assets->availableIcons(), true)) {
                return $this->respond($request, false, $version, 'That icon is not in ' . config('ogx3d.icon_dir') . '.');
            }
            $attributes['image_path'] = $data['image'];
        } elseif ($request->boolean('clear_image')) {
            $attributes['image_path'] = null;
        }

        if ($request->hasFile('model_file')) {
            $attributes['model_path'] = $this->saveIntoDropFolder(
                $request->file('model_file'),
                (string) config('ogx3d.model_dir'),
                ['glb', 'gltf']
            );
        } elseif (($data['model'] ?? '') !== '') {
            if (!in_array($data['model'], $this->assets->availableModels(), true)) {
                return $this->respond($request, false, $version, 'That model is not in ' . config('ogx3d.model_dir') . '.');
            }
            $attributes['model_path'] = $data['model'];
        } elseif ($request->boolean('clear_model')) {
            $attributes['model_path'] = null;
        }

        if (($data['preset'] ?? '') !== '') {
            if (!array_key_exists($data['preset'], $this->presetChoices())) {
                return $this->respond($request, false, $version, 'Unknown lighting preset.');
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
            return $this->respond($request, false, $version, 'Nothing chosen - no picture, no model, no setting.');
        }

        Ogx3dOverride::updateOrCreate(
            ['version_key' => $version, 'target' => $target],
            $attributes
        );
        $this->assets->invalidate($version);

        $override = Ogx3dOverride::where('version_key', $version)->where('target', $target)->first();

        return $this->respond($request, true, $version, $target . ' updated in ' . strtoupper($version) . '.', [
            'target' => $target,
            'image' => $override?->image_path,
            'model' => $override?->model_path,
            'assigned' => $override !== null,
        ]);
    }

    public function reset(Request $request): RedirectResponse|\Illuminate\Http\JsonResponse
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

        return $this->respond($request, true, $data['version'], $data['target'] . ' is back to the original.', [
            'target' => $data['target'],
            'image' => null,
            'model' => null,
            'assigned' => false,
        ]);
    }

    /**
     * One card's Save used to be a form post that reloaded the WHOLE admin screen - a
     * scroll position, a filter typed into the box above, every other card's unsaved
     * choice, all thrown away to confirm ONE save. A screen with sixty-odd cards on it
     * made changing a handful of them a fight against the page resetting itself.
     *
     * ogx3d.js now submits each card's form through fetch() instead of a real
     * navigation, and asks for that here with the ajax-conventional header a plain
     * <form> post never sends. A browser with JavaScript off, or a request from
     * anywhere else, gets exactly the old behaviour: a full page reload back to this
     * version, with the message in the flash banner.
     */
    private function respond(Request $request, bool $ok, string $version, string $message, array $extra = []): RedirectResponse|\Illuminate\Http\JsonResponse
    {
        if ($request->ajax() || $request->wantsJson()) {
            return response()->json(['ok' => $ok, 'message' => $message] + $extra, $ok ? 200 : 422);
        }

        return $ok
            ? $this->back($version)->with('success', $message)
            : $this->back($version)->with('error', $message);
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

        try {
            $path = $this->saveIntoDropFolder(
                $file,
                (string) config($isModel ? 'ogx3d.model_dir' : 'ogx3d.icon_dir'),
                $isModel ? ['glb', 'gltf'] : ['png', 'jpg', 'jpeg', 'gif', 'webp']
            );
        } catch (\RuntimeException $e) {
            return $this->back($version)->with('error', $e->getMessage());
        }

        return $this->back($version)->with('success', basename($path) . ' added. It is now in the list below.');
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

    /**
     * The one place a file picked anywhere in this screen ends up: the shared drop
     * folder (public/Put_GLB_and_Icons_here/...), never a private per-version corner.
     *
     * Whatever picked it - the top "Add to folder" box, or the file picker sitting
     * right on one object's own card - lands here, under the SAME rules: a safe name
     * built from what the browser sent, collisions numbered rather than overwritten so
     * two different files with the same name both survive, and the extension checked
     * against an allow-list rather than trusted, because it ends up in a path on disk
     * and inside a generated css url('...').
     *
     * @param array<int, string> $allowedExtensions
     *
     * @throws \RuntimeException if the file's extension is not on the allow-list
     */
    private function saveIntoDropFolder(\Illuminate\Http\UploadedFile $file, string $configuredDir, array $allowedExtensions): string
    {
        $extension = strtolower((string) $file->getClientOriginalExtension());
        if (!in_array($extension, $allowedExtensions, true)) {
            throw new \RuntimeException('Only .' . implode(', .', $allowedExtensions) . ' is accepted here.');
        }

        $dir = public_path($configuredDir);
        File::ensureDirectoryExists($dir);

        // Keep only what can name a file, nothing that can name a directory - the
        // browser sends this name verbatim, so it is caller-controlled text, not fact.
        $stem = pathinfo((string) $file->getClientOriginalName(), PATHINFO_FILENAME);
        $stem = preg_replace('/[^A-Za-z0-9._ -]/', '_', $stem) ?? 'upload';
        $stem = trim(ltrim(str_replace('..', '_', $stem), '.'));
        if ($stem === '') {
            $stem = 'upload';
        }

        // Two different files sharing a name both keep their content: the second one
        // becomes "name (2).ext" rather than silently replacing the first admin's work.
        $name = $stem . '.' . $extension;
        $n = 2;
        while (is_file($dir . DIRECTORY_SEPARATOR . $name)) {
            $name = $stem . ' (' . $n . ').' . $extension;
            $n++;
        }

        $file->move($dir, $name);

        return $configuredDir . '/' . $name;
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
