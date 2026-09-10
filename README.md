# OgameX 3D Mod

> **Unofficial fan add-on.** Not affiliated with [OGameX](https://github.com/lanedirt/OGameX)
> or GameForge GmbH. OGame names, artwork and concepts belong to GameForge.
> OGameX backend code belongs to its authors and is MIT-licensed; this repo
> does not include it. Non-commercial. You bring your own models and icons —
> only upload files you have the rights to.
>
> The author of this add-on claims no rights over OGameX, OGame, GameForge, or
> any of their code, assets or trademarks. This repository is only the add-on's
> own source (PHP, Blade, JavaScript, installer), released under the MIT licence.

**Status:** alpha. Developed against **OGameX 0.14.x**. Expect rough edges.

**Swap any icon in [OGameX](https://github.com/lanedirt/OGameX) for your own picture, or for a live 3D model — from inside the game, without touching a single line of the game's code.**

---

## The idea in one minute

OGameX looks the way it shipped, and changing that normally means editing sprite sheets
by hand. That does not work well, for a reason that only shows up after you try it: the
same ship is painted out of **several different sprite sheets** depending on which screen
you are on. Patch the one the shipyard uses and the fleet screen, the tech tree and the
battle report all still show the old artwork.

This mod does it the other way round. It knows every css selector in the game that paints
each object — 67 objects, 535 selectors — and when you assign a picture, it writes a rule
for **all of them at once**. One upload, and that ship has changed everywhere.

And because a flat picture is not the only thing you can put in a box: assign a `.glb`
instead and the game's artwork panel becomes a live 3D view you can drag to turn and
scroll to zoom.

### Versions, not settings

The mod never changes the game. It adds **versions**:

| | |
|---|---|
| **V1** | The original game. Untouched, and untouchable — the mod puts literally nothing into a V1 page. |
| **V2** | A blank sheet of glass over it. Identical to V1 until you assign something. |
| **V3, V4, …** | Press `+` for as many as you like. Each is independent; changing one cannot affect another. |

There are two different choices, on purpose:

| Who | What they choose |
|---|---|
| **Admin** | Creates versions (`+`), assigns pictures/models, can **Preview** a version only in their own browser, then **Make live** as the server default. |
| **Every logged-in player** | Gets a **V1 / V2 / V3…** switch next to their name in the top bar. That is a personal display preference (cookie). It does not change the server default and does not need admin rights. |

V1 stays the original game. A version you have not assigned anything to also looks like
the original game. Experimenting in V2 cannot break V1.

---

## Install

You need an OGameX installation and shell access to it. Two minutes.

**1. Get the files into your OGameX folder.**

```bash
git clone https://github.com/loveascent/OgameX_3D_Mod.git /tmp/ogx3d && cp -r /tmp/ogx3d/{app,config,database,public} /tmp/ogx3d/ogx3d-install.* /path/to/your/ogamex/
```

On Windows, or if you would rather not use git: download the ZIP from the green **Code**
button, open it, and drag the `app`, `config`, `database`, `public` folders and the
`ogx3d-install.*` files into your OGameX folder. Say yes to merging folders. Nothing is
overwritten — every file the mod brings is new.

**2. Run the installer, from your OGameX folder.**

```bash
php ogx3d-install.php && php artisan migrate && php artisan ogx3d:doctor
```

On Windows you can just double-click **`ogx3d-install.cmd`** instead. On Linux/macOS,
`bash ogx3d-install.sh`.

The installer adds exactly **one line** to `bootstrap/providers.php` (and keeps a backup).
That one line is the whole installation — see *Uninstalling* below.

**3. Open the game as an admin.** There is a new **3D Mod** entry in the admin bar.

---

## Using it

1. **Put your files in `public/Put_GLB_and_Icons_here/`.**
   `.glb` / `.gltf` go in `3D_GLB_Files_Here/`, pictures go in `Icons_Here/`.
   (If you cannot reach the server's filesystem, the admin screen has an upload box that
   puts them there for you.)

2. **Admin bar → 3D Mod → `+ New version`.** You get V2. It looks exactly like V1.

3. **Find the object you want** — there is a filter box — and pick your file from the
   drop-down. Press **Save**.

4. **Press `Preview`** on V2 to see it in your own browser. Everyone else still sees V1.

5. Happy with it? **Press `Make live`.** Now everyone sees it.

That is the loop. Nothing to restart, no cache to clear.

### What a picture changes, and what a model changes

- A **picture** replaces that object's icon *everywhere*: shipyard, defence, research,
  facilities, fleet screens, tech tree, build queue, battle report.
- A **model** turns the large artwork box in the detail panel into a live 3D view.
- You can set **both**. The model appears where there is room for it, the picture
  everywhere else — so a ship being built still shows your artwork in the queue.

### The interface slots

Three things are not game objects but can still hold a model:

- **Overview — planet** and **Overview — moon** (the wide strip at the top of the
  overview screen; the mod tells the two apart by itself)
- **The banner strips** on the shipyard, defence, research, facilities and resources pages

Banners keep their original panorama and fly your model in front of it, so the screen
still reads as the game. The overview body replaces its picture instead — a planet
standing in front of a photograph of a planet reads as a mistake. Both are switchable
in `config/ogx3d.php`.

---

## Troubleshooting

Run this first. It checks everything and tells you the command that fixes what is wrong:

```bash
php artisan ogx3d:doctor
```

**Uploading a file gives a blank "413 Request Entity Too Large" page.**
That page comes from your web server, not from this mod — a file was too big to even
reach Laravel. Two limits usually need raising for a `.glb` of a few MB:

- **nginx**: `client_max_body_size 100m;` inside the `server { }` (or `http { }`) block
  of your nginx config, then reload nginx.
- **Apache**: `LimitRequestBody 104857600` in your vhost or `.htaccess`.
- **PHP**: `upload_max_filesize` and `post_max_size` in `php.ini`, both at least as big
  as the file (`php -i | grep max` shows the current values).

The mod itself accepts up to 64 MB per model and 8 MB per picture — raise the limits
above to at least that if uploads keep failing.

**My model does not show up.**
Press <kbd>F12</kbd> in the browser and look at the *Console* tab — a model that fails to
load says exactly why there. The usual causes:

- `.gltf` files keep their textures in *separate files* next to them. Copy the whole
  folder into the drop folder, not just the `.gltf`. `.glb` has everything inside it and
  is the safer choice.
- Very large models. Keep it under about 20 MB — this is a browser.
- Draco, Meshopt and KTX2 compression are all handled, so those are not the problem.

**I changed a file in the drop folder and nothing happened.**
Your browser is holding the old one. The mod puts a version stamp on the url whenever the
file's timestamp changes, so a hard reload (<kbd>Ctrl</kbd>+<kbd>F5</kbd>) is enough.

**An icon changed on one screen but not another.**
That means the mod's selector list does not match your stylesheets — which happens if you
have edited the game's own css. Rebuild it:

```bash
php artisan ogx3d:scan --write
```

**Nothing at all happens, and there is no 3D Mod entry in the admin bar.**
The service provider is not registered. `php artisan ogx3d:doctor` will say so.

**If another mod already uses an import map.**
A page may contain only one `<script type="importmap">`, and the mod will not add a second
one — it would break the first. If you have another mod that ships one, add these two
entries to *its* map instead:

```json
{ "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/"
} }
```

The trailing slash on `three/addons/` is required.

---

## Notes for the curious

**No file of the game is modified.** Not one. The mod hangs itself into the page from a
response middleware and builds its 3D views from JavaScript, so it survives an OGameX
update with nothing to merge.

**three.js is not included.** It is loaded from a CDN by default. If your server has no
internet access, drop your own copy into `public/ogx3d/vendor/three/` and the mod picks
it up on its own — see the README in that folder. three.js belongs to its own authors and
is not redistributed here.

**V1 really is untouched.** Not "almost": under V1 the mod injects zero bytes into a
player's page. The single exception is one link in the admin bar, for admins only, because
otherwise there would be no way to reach the mod from a server that has never left V1.

**Where things live.**

```
app/Ogx3d/                       all the mod's php, one folder
config/ogx3d.php                 settings you may want to change
config/ogx3d_registry.php        generated: which selectors paint which object
database/migrations/             three tables, all prefixed ogx3d_
public/ogx3d/                    the mod's javascript and its uploads
public/Put_GLB_and_Icons_here/   yours
```

**Commands.**

```bash
php artisan ogx3d:doctor          # check the installation, and say how to fix it
php artisan ogx3d:doctor --fix    # ...and recreate any missing folders
php artisan ogx3d:scan            # show what the selector scan finds
php artisan ogx3d:scan --write    # rebuild config/ogx3d_registry.php
```

---

## Uninstalling

Remove the one line the installer added to `bootstrap/providers.php`:

```php
OGame\Ogx3d\Ogx3dServiceProvider::class,
```

The game is immediately back to exactly what it was. To remove it properly as well:

```bash
php artisan migrate:rollback --step=1     # BEFORE removing the line - drops the three ogx3d_ tables
```

then delete `app/Ogx3d/`, `config/ogx3d*.php`, `public/ogx3d/`,
`public/Put_GLB_and_Icons_here/`, the migration, and the `ogx3d-install.*` files.

---

## Licence

MIT. See [LICENSE](LICENSE).

This repository contains only this add-on (PHP, Blade, JS, installer).
It ships no OGameX source, no official OGame artwork, no 3D models and
no third-party libraries. three.js is loaded from a CDN at runtime
(or from a copy you place in `public/ogx3d/vendor/three/`) and remains
copyright its own authors.

OGameX: https://github.com/lanedirt/OGameX (MIT).
OGame: https://ogame.org — please support the original creators.

If you publish your own models with a server that uses this mod, state
*their* licence separately. This MIT licence does not grant rights to
anyone else's assets.
