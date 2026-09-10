/**
 * OgameX 3D Mod - the browser side.
 *
 * WHAT THIS FILE IS FOR
 * ---------------------
 * Everything the mod does in the page happens here, so that NO template of the game
 * has to be edited. It reads one json blob that php put in the <head>, and from it:
 *
 *   1. puts a "3D Mod" entry in the admin bar (admins only - the bar only exists for
 *      them, so no permission check is needed or possible here),
 *   2. replaces the icons the game draws as real <img> tags,
 *   3. creates the live 3D viewers, in the detail panel and in the fixed slots.
 *
 * WHY IT LOADS three.js LAZILY
 * ----------------------------
 * three.js is about a megabyte. Fetching it on every page of a browser game because
 * ONE screen might show a model is the kind of cost that makes people uninstall a mod.
 * So this file is tiny and synchronous, and ogx3d-viewer.js - which is the part that
 * imports three - is only fetched once something on the page actually needs it.
 */

const MANIFEST = readJson('ogx3d-manifest', { version: 'v1', objects: {}, slots: {}, images: {}, presets: {} });
const LINKS = readJson('ogx3d-links', {});

/** Loaded on first use. See mountAll(). */
let viewerModule = null;
let viewerPromise = null;

function readJson(id, fallback) {
    const el = document.getElementById(id);
    if (!el) { return fallback; }
    try {
        const parsed = JSON.parse(el.textContent || '{}');
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (e) {
        console.warn('[ogx3d] could not read', id, e);
        return fallback;
    }
}

/* --------------------------------------------------------------------------
 * 1. The admin bar entry
 *
 * Added from here rather than by editing admin-menu.blade.php for two reasons: the
 * bar is only rendered for admins in the first place, so this cannot leak the link to
 * a player; and inheriting the bar's own styling by putting an <li> in its own <ul>
 * looks right without a single line of css.
 * ----------------------------------------------------------------------- */

function addAdminLink() {
    const list = document.querySelector('#adminbar #mmoContent ul');
    if (!list || list.querySelector('.ogx3d-adminlink') || !LINKS.admin) { return; }

    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'ogx3d-adminlink';
    a.href = LINKS.admin;
    a.textContent = '3D Mod';
    if (location.pathname.indexOf('/admin/ogx3d') === 0) { a.classList.add('active'); }
    li.appendChild(a);
    list.appendChild(li);
}

/* --------------------------------------------------------------------------
 * 2. The icons that are <img> tags
 *
 * The generated stylesheet reaches every icon painted as a css background, which is
 * most of them. The build queues and the battle report use real <img> tags instead,
 * and no stylesheet can reach those - which is why an object used to show its new
 * artwork in the shipyard and its old artwork while it was being built.
 *
 * php supplies an exact map (original path -> replacement url) built from the game's
 * own asset fields, so nothing here has to guess a filename.
 * ----------------------------------------------------------------------- */

const IMAGES = MANIFEST.images || {};
const HAS_IMAGES = Object.keys(IMAGES).length > 0;

function swapImage(img) {
    if (!HAS_IMAGES || img.dataset.ogx3dSwapped) { return; }
    const src = img.getAttribute('src') || '';
    if (!src) { return; }
    for (const original in IMAGES) {
        // endsWith, not equality: the game writes these with asset(), so the src may
        // carry a scheme, a host and a sub-directory in front of the path.
        if (src.endsWith('/' + original) || src === original || src.endsWith(original)) {
            img.dataset.ogx3dSwapped = '1';
            img.src = IMAGES[original];
            return;
        }
    }
}

function swapImagesIn(root) {
    if (!HAS_IMAGES) { return; }
    const scope = root && root.querySelectorAll ? root : document;
    if (scope.tagName === 'IMG') { swapImage(scope); return; }
    scope.querySelectorAll('img').forEach(swapImage);
}

/* --------------------------------------------------------------------------
 * 3. The 3D viewers
 * ----------------------------------------------------------------------- */

/**
 * Which object is the detail panel showing?
 *
 * Its artwork box carries the object's class_name among its classes
 * (`sprite sprite_large building fighterLight`), so the answer is simply: the first of
 * those classes the manifest knows about. No list of words to ignore is needed - the
 * manifest holds no "sprite" and no "building", and if somebody DID name an object
 * "building" then matching it would be right rather than wrong.
 *
 * The obvious-looking alternative - #technologydetails's data-technology-id - is a
 * hardcoded literal in the shipped template and reads the same for every object, so
 * anything trusting it renders one model for the whole game.
 */
function objectFromPanel(box) {
    for (const cls of box.classList) {
        if (MANIFEST.objects[cls]) { return cls; }
    }
    return null;
}

/**
 * Hang a viewer inside a host element.
 *
 * The mount is CLAIMED synchronously, before anything is awaited. The detail panel is
 * destroyed and rebuilt wholesale on every click, so the observer below can fire twice
 * for the same box while the viewer module is still being fetched - and two viewers in
 * one box means two WebGL contexts, of which a browser allows about sixteen per page
 * before it starts killing the older ones.
 */
function mount(host, spec) {
    if (!host || host.dataset.ogx3dClaimed) { return; }
    host.dataset.ogx3dClaimed = '1';

    // The host keeps its own artwork in the markup - the mod never deletes it - so it
    // is suppressed while the canvas is there. !important is required: the generated
    // stylesheet writes background-image with !important on these very selectors, and
    // a plain inline declaration loses to it.
    //
    // Unless the slot asked to keep it: a hangar panorama with a ship flying in front
    // of it still reads as the shipyard, where a transparent strip with a model
    // floating on the page background reads as something broken.
    if (!spec.keep_bg) {
        host.classList.add('ogx3d-live');
        host.style.setProperty('background-image', 'none', 'important');
    }

    const box = document.createElement('div');
    box.className = 'ogx3d-mount';
    host.appendChild(box);

    loadViewer().then((mod) => {
        if (!box.isConnected) { return; }
        try {
            mod.create(box, spec, MANIFEST.presets || {});
        } catch (e) {
            console.error('[ogx3d] viewer failed', e);
            fail(box, e);
        }
    }).catch((e) => {
        // The overwhelmingly likely cause is a missing import map: a page may carry
        // only ONE, so if another mod already put one there, ours was not added and
        // the bare "three" specifier cannot resolve. Saying so beats a bare
        // "Failed to resolve module specifier".
        if (!document.querySelector('script[type="importmap"]')) {
            console.error('[ogx3d] No <script type="importmap"> in this page, so three.js cannot be resolved. '
                + 'Another mod probably supplies its own import map; add three and three/addons/ to it. '
                + 'See README.md, "If another mod already uses an import map".', e);
        } else {
            console.error('[ogx3d] three.js could not be loaded', e);
        }
        fail(box, e);
    });
}

function fail(box, error) {
    // textContent, never innerHTML: the message comes out of a loader and may contain
    // anything at all, including a filename somebody chose.
    const note = document.createElement('div');
    note.style.cssText = 'color:#c66;font-size:11px;padding:8px;';
    note.textContent = '3D: ' + (error && error.message ? error.message : String(error));
    box.textContent = '';
    box.appendChild(note);
}

function loadViewer() {
    if (viewerModule) { return Promise.resolve(viewerModule); }
    if (!viewerPromise) {
        viewerPromise = import('./ogx3d-viewer.js').then((mod) => (viewerModule = mod));
    }
    return viewerPromise;
}

/**
 * Every place on the current page that should show a model.
 */
function mountAll() {
    // The detail panel. One box, whichever object happens to be open in it.
    document.querySelectorAll('#technologydetails > .sprite').forEach((box) => {
        if (box.dataset.ogx3dClaimed) { return; }
        const name = objectFromPanel(box);
        if (name) { mount(box, MANIFEST.objects[name]); }
    });

    // The fixed slots: the planet on the overview screen, the banner strips.
    for (const key in MANIFEST.slots) {
        const spec = MANIFEST.slots[key];
        if (!spec.find) { continue; }
        // A slot can be conditional on something else being on the page. That is how a
        // planet is told apart from a moon: the game paints both into the same #planet
        // element and only the small "switch to the other body" box beside it says
        // which one you are standing on.
        if (spec.unless && document.querySelector(spec.unless)) { continue; }
        if (spec.only_with && !document.querySelector(spec.only_with)) { continue; }
        document.querySelectorAll(spec.find).forEach((host) => mount(host, spec));
    }
}

/* --------------------------------------------------------------------------
 * Start, and keep going
 *
 * The theme replaces #technologydetails wholesale on every tile click
 * (element.replaceWith(...)), so there is no event to listen for and nothing survives
 * between clicks. One observer on <body> catches every such rebuild, every ajax-loaded
 * queue row, and the admin bar if it arrives late.
 * ----------------------------------------------------------------------- */

let scheduled = false;
function rescan(added) {
    if (added) { swapImagesIn(added); }
    if (scheduled) { return; }
    scheduled = true;
    /*
     * Coalesce: a single click can produce a dozen mutation records, and running the
     * whole scan for each of them is how a page starts to feel slow.
     *
     * setTimeout, NOT requestAnimationFrame. rAF does not fire while the tab is in the
     * background, and this is not drawing work - it is the bookkeeping that decides
     * whether there is anything to draw at all. Measured: with rAF, opening the
     * shipyard in a background tab and clicking through ships left the detail panel
     * with no viewer, and it stayed that way until some unrelated mutation happened to
     * arrive after the tab came forward.
     */
    setTimeout(() => {
        scheduled = false;
        addAdminLink();
        mountAll();
    }, 0);
}

function start() {
    addAdminLink();
    swapImagesIn(document);
    mountAll();

    new MutationObserver((records) => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeType === 1) { rescan(node); }
            }
        }
    }).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
    start();
}

// A small handle for looking at what the mod thinks it is doing, from the browser's
// own console. Read-only on purpose: this is for answering "did it see my file?",
// not an api.
window.Ogx3d = {
    manifest: MANIFEST,
    mounts: () => document.querySelectorAll('.ogx3d-mount').length,
    rescan: () => rescan(null),
};
