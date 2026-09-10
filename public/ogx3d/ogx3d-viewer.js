/**
 * OgameX 3D Mod - the model viewer.
 *
 * A live, rotatable, zoomable .glb / .gltf view that sits inside a box the game
 * already draws. It knows nothing about OGameX: it is handed an element and a small
 * description, and it renders. Everything game-specific lives in ogx3d.js.
 *
 * This file is only fetched once a page actually has something to show, so a player
 * who never opens a build screen never downloads three.js.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* --------------------------------------------------------------------------
 * Decoders
 *
 * Almost every online "optimise my glb" tool emits Draco-compressed geometry, and a
 * fair number emit Meshopt or KTX2 textures. A viewer without the decoders loads those
 * files to a blank box and an error nobody can act on - which, for a mod whose whole
 * premise is "drop a glb in this folder", is the single most likely way for it to look
 * broken.
 *
 * They are attached lazily and each in its own try/catch: a decoder that cannot be
 * reached must cost an uncompressed model nothing.
 * ----------------------------------------------------------------------- */

const DECODER_BASE = 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/libs/';

let loaderPromise = null;

function sharedLoader(renderer) {
    if (loaderPromise) { return loaderPromise; }

    const loader = new GLTFLoader();

    loaderPromise = (async () => {
        try {
            const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
            const draco = new DRACOLoader();
            draco.setDecoderPath(DECODER_BASE + 'draco/');
            loader.setDRACOLoader(draco);
        } catch (e) {
            console.warn('[ogx3d] no Draco decoder - Draco-compressed models will not load', e);
        }
        try {
            const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
            loader.setMeshoptDecoder(MeshoptDecoder);
        } catch (e) {
            console.warn('[ogx3d] no Meshopt decoder', e);
        }
        try {
            const { KTX2Loader } = await import('three/addons/loaders/KTX2Loader.js');
            const ktx2 = new KTX2Loader();
            ktx2.setTranscoderPath(DECODER_BASE + 'basis/');
            ktx2.detectSupport(renderer);
            loader.setKTX2Loader(ktx2);
        } catch (e) {
            console.warn('[ogx3d] no KTX2 transcoder', e);
        }
        return loader;
    })();

    return loaderPromise;
}

/* --------------------------------------------------------------------------
 * Defaults
 * ----------------------------------------------------------------------- */

/**
 * The direction the camera looks from for an object that is replacing a flat icon.
 * Chosen so that a hull reads with roughly the same silhouette as the icon it stands
 * in for - three quarters on, slightly from above.
 */
const ICON_DIR = [0.492, 0.523, 0.696];

/** A flatter, wider angle, for the banner strips and for a sphere, which has no icon
 *  silhouette to match in the first place. */
const FREE_DIR = [0.75, 0.35, 0.56];

/** How far below the model the shadow-catching ground sits, as a share of its size.
 *  Not zero: flush against the hull the shadow lands underneath it and is invisible. */
const GROUND_GAP = 0.10;

/** Field of view, degrees. */
const FOV = 55;

const FALLBACK_PRESET = {
    sky: '#2a3644', haze: '#161e28',
    sun: { f: '#ffffff', i: 4.4, p: [4, 6, 7] },
    rim: { f: '#7fa8d8', i: 1.4, p: [-6, -2, -5] },
    amb: { top: '#8fabc8', bottom: '#222c38', i: 1.6 },
};

let maxAnisotropy = 1;

/* --------------------------------------------------------------------------
 * One viewer
 * ----------------------------------------------------------------------- */

/**
 * @param {HTMLElement} box    the element to render into, already sized by css
 * @param {object} spec        {model, preset, motion, spin, zoom, view, shadow}
 * @param {object} presets     the lighting presets, straight out of config/ogx3d.php
 * @param {function=} onFail   called with the error if the model cannot be shown, so
 *                             the caller can take its overlay back off the page
 * @returns {object} a handle with dispose()
 */
export function create(box, spec, presets, onFail) {
    const reportFail = (error) => {
        if (typeof onFail === 'function') { onFail(error); return; }
        // No handler given (older caller): fall back to writing the reason in the box.
        const note = document.createElement('div');
        note.style.cssText = 'color:#c66;font-size:11px;padding:8px;';
        note.textContent = '3D load error: ' + (error && error.message ? error.message : String(error));
        box.textContent = '';
        box.appendChild(note);
    };
    const light = presets[spec.preset] || presets.studio || FALLBACK_PRESET;
    const iconAngle = (spec.view || 'icon') !== 'free';
    const zoom = Number(spec.zoom) > 0 ? Number(spec.zoom) : 1;
    const motion = spec.motion || 'hover';
    // 1 is about one revolution in a quarter of an hour. Slow enough that it reads as
    // "alive" without being something you catch yourself watching.
    const spinRate = (Number(spec.spin) >= 0 ? Number(spec.spin) : 1) * 0.0007;
    const shadowOpacity = Number(spec.shadow) >= 0 ? Number(spec.shadow) : 0.36;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = shadowOpacity > 0;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    box.appendChild(renderer.domElement);

    maxAnisotropy = Math.max(maxAnisotropy, renderer.capabilities.getMaxAnisotropy());

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 10000);

    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.castShadow = shadowOpacity > 0;
    sun.shadow.mapSize.set(2048, 2048);
    const rim = new THREE.DirectionalLight(0x4080ff, 1);
    const ambient = new THREE.HemisphereLight(0x88aacc, 0x101820, 1);
    scene.add(sun, sun.target, rim, ambient);

    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(400, 400),
        new THREE.ShadowMaterial({ opacity: shadowOpacity })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.visible = shadowOpacity > 0;
    scene.add(ground);

    /*
     * Three nested groups, and each one earns its place:
     *
     *   root       fixed in world space
     *     pivot    carries all motion; sits on the model's own centre
     *       shift  cancels that centre, so the model keeps its own coordinates
     *         the loaded scene
     *
     * The motion could have been OrbitControls' autoRotate, which turns the CAMERA.
     * Everything then moves together on screen - hull, ground and cast shadow - so the
     * shadow appears to rotate with the ship, which is the one thing a shadow does not
     * do. Turning the MODEL leaves the sun and the ground where they are, and the
     * shadow reshapes itself as the hull comes round.
     *
     * The two inner groups exist because a model's geometry is generally not centred
     * on its own origin: rotating it directly swings it around like a hammer.
     */
    const root = new THREE.Group();
    const pivot = new THREE.Group();
    const shift = new THREE.Group();
    pivot.add(shift);
    root.add(pivot);
    scene.add(root);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6;
    controls.autoRotate = false;

    // Hold the drift still while somebody is dragging. Fighting the user's own
    // rotation is the fastest way to make a viewer feel broken.
    let held = false;
    const onDown = () => { held = true; };
    const onUp = () => { held = false; };
    renderer.domElement.addEventListener('pointerdown', onDown);
    // On window, because the pointer is usually released outside the little box - and
    // removed again in dispose(), or every closed panel leaves a listener holding on
    // to its whole scene.
    window.addEventListener('pointerup', onUp);

    let radius = 1;
    let restingHeight = 0;
    let disposed = false;
    let frame = 0;

    /* ----------------------------------------------------------------------
     * Light
     * ------------------------------------------------------------------- */

    /**
     * A 512x256 equirectangular canvas: a vertical gradient from the preset with the
     * sun painted into it as a bright spot.
     *
     * This is not decoration. Physically based materials are lit by what is around
     * them, and metal with nothing to reflect renders very nearly black - which is
     * what a model looks like when a viewer sets up three lights and no environment.
     */
    function buildEnvironment() {
        const c = document.createElement('canvas');
        c.width = 512;
        c.height = 256;
        const g = c.getContext('2d');
        const v = g.createLinearGradient(0, 0, 0, 256);
        v.addColorStop(0.00, light.amb.top);
        v.addColorStop(0.42, light.sky);
        v.addColorStop(0.55, light.haze);
        v.addColorStop(1.00, light.amb.bottom);
        g.fillStyle = v;
        g.fillRect(0, 0, 512, 256);

        const p = light.sun.p;
        const len = Math.hypot(p[0], p[1], p[2]) || 1;
        const u = (Math.atan2(p[0] / len, p[2] / len) / (2 * Math.PI) + 0.5) * 512;
        const w = (1 - (Math.asin(Math.max(-1, Math.min(1, p[1] / len))) / Math.PI + 0.5)) * 256;
        const r = g.createRadialGradient(u, w, 2, u, w, 120);
        r.addColorStop(0, light.sun.f);
        r.addColorStop(0.25, light.sun.f + '80');
        r.addColorStop(1, '#00000000');
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = r;
        g.fillRect(0, 0, 512, 256);
        g.globalCompositeOperation = 'source-over';
        return c;
    }

    function setLight() {
        const canvas = buildEnvironment();
        const tex = new THREE.CanvasTexture(canvas);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();
        scene.environment = pmrem.fromEquirectangular(tex).texture;
        pmrem.dispose();
        tex.dispose();

        sun.color.set(light.sun.f);
        sun.intensity = light.sun.i;
        rim.color.set(light.rim.f);
        rim.intensity = light.rim.i;
        ambient.color.set(light.amb.top);
        ambient.groundColor.set(light.amb.bottom);
        ambient.intensity = light.amb.i;
    }

    function placeLight() {
        const r = Math.max(radius, 0.5);
        sun.position.set(light.sun.p[0] * r, light.sun.p[1] * r, light.sun.p[2] * r);
        rim.position.set(light.rim.p[0] * r, light.rim.p[1] * r, light.rim.p[2] * r);

        // The shadow camera fitted tightly around the model. Left wide, a 2048 map
        // spends most of its pixels on empty space and the shadow turns to mush.
        const d = r * 1.7;
        const c = sun.shadow.camera;
        c.left = -d; c.right = d; c.top = d; c.bottom = -d;
        c.near = Math.max(r * 0.05, 0.01);
        c.far = r * 30;
        sun.shadow.bias = -0.0006 * Math.max(r / 3, 1);
        c.updateProjectionMatrix();
    }

    /* ----------------------------------------------------------------------
     * Framing
     * ------------------------------------------------------------------- */

    /**
     * Put the camera where the whole model is visible, at this box's aspect ratio.
     *
     * The obvious formula - half the longest edge, fitted over the vertical opening -
     * is right on a square and wrong everywhere else: on a 2.6:1 banner strip a long
     * ship gets squeezed lengthwise into the SHORT axis and ends up the size of a
     * postage stamp with empty space either side.
     *
     * So instead the eight corners of the bounding box are projected onto the camera's
     * own axes. That gives how far back it must be to fit vertically and how far to
     * fit horizontally; the larger wins, plus half the depth so the near edge does not
     * run into the lens. No measured per-model number, and right at any aspect ratio.
     */
    function fit() {
        const measured = new THREE.Box3();
        const pose = pivot.rotation.clone();
        pivot.rotation.set(0, 0, 0);
        pivot.position.y = restingHeight;
        pivot.updateMatrixWorld(true);
        if (root.children.length) { measured.expandByObject(root); }
        if (measured.isEmpty()) {
            measured.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
        }

        const centre = measured.getCenter(new THREE.Vector3());
        pivot.position.copy(centre);
        shift.position.copy(centre).multiplyScalar(-1);
        restingHeight = centre.y;
        pivot.rotation.copy(pose);
        pivot.updateMatrixWorld(true);

        const size = measured.getSize(new THREE.Vector3());
        radius = Math.max(size.x, size.y, size.z) / 2 || 1;

        const dir = new THREE.Vector3(...(iconAngle ? ICON_DIR : FREE_DIR)).normalize();
        const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
        const up = new THREE.Vector3().crossVectors(right, dir).normalize();

        let halfWide = 0, halfHigh = 0, halfDeep = 0;
        for (let i = 0; i < 8; i++) {
            const corner = new THREE.Vector3(
                (i & 1) ? measured.max.x : measured.min.x,
                (i & 2) ? measured.max.y : measured.min.y,
                (i & 4) ? measured.max.z : measured.min.z
            ).sub(centre);
            halfWide = Math.max(halfWide, Math.abs(corner.dot(right)));
            halfHigh = Math.max(halfHigh, Math.abs(corner.dot(up)));
            halfDeep = Math.max(halfDeep, Math.abs(corner.dot(dir)));
        }

        const tanHalf = Math.tan(camera.fov * Math.PI / 360);
        /*
         * ASK THE ELEMENT, NOT THE CAMERA.
         *
         * camera.aspect is a value that was set at some point; the element IS the size.
         * The first fit can run while the panel is still opening, with the camera's
         * aspect still on 1 and the box already 650 wide - and a model framed for a
         * square then stays framed for a square, because nothing calls fit() again.
         */
        const aspect = (box.clientWidth > 0 && box.clientHeight > 0)
            ? box.clientWidth / box.clientHeight
            : (camera.aspect || 1);

        // 1.03 is the margin that keeps the model off the edge of its frame - tight, so
        // it actually fills the window instead of floating in the middle of a lot of
        // empty space around it.
        const distance = (Math.max(halfHigh / tanHalf, halfWide / (tanHalf * aspect)) * 1.03 + halfDeep) * zoom;

        camera.position.copy(centre).addScaledVector(dir, distance);
        camera.near = Math.max(radius / 500, 0.005);
        camera.far = Math.max(radius * 400, 100);
        camera.updateProjectionMatrix();

        controls.target.copy(centre);
        /*
         * NEVER CLOSER THAN JUST OUTSIDE THE MODEL ITSELF.
         *
         * distance * 0.35 alone is wrong for anything long and thin - a destroyer, say,
         * seen mostly end-on. There halfDeep (close to the model's own half-length) can
         * be BIGGER than the frame-fitting term, so 0.35 of the total lets a zoom carry
         * the camera to well inside the ship's own bounding sphere. From in there you
         * are looking at the backs of faces the renderer culls away - the model reads
         * as "gone", not as "close". radius * 1.05 is a floor that keeps the camera
         * just outside the model at every zoom level, whatever its proportions.
         */
        controls.minDistance = Math.max(distance * 0.35, radius * 1.05);
        controls.maxDistance = distance * 2.5;
        controls.update();

        ground.position.y = measured.min.y - radius * GROUND_GAP;
        ground.scale.setScalar(Math.max(1, radius * 20 / 400));
        sun.target.position.copy(centre);
        sun.target.updateMatrixWorld();
        placeLight();
    }

    /* ----------------------------------------------------------------------
     * Size
     * ------------------------------------------------------------------- */

    let built = false;

    function resize() {
        const w = box.clientWidth, h = box.clientHeight;
        if (!w || !h) { return; }

        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        if (renderer.getPixelRatio() !== ratio) { renderer.setPixelRatio(ratio); }
        renderer.setSize(w, h, false);
        // setSize(..., false) only sets the drawing buffer. Without an explicit css
        // size the element is w*dpr wide and the browser scales it back down, which
        // is exactly the "3D looks soft while the text around it is sharp" symptom.
        renderer.domElement.style.width = w + 'px';
        renderer.domElement.style.height = h + 'px';

        const before = camera.aspect;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();

        // The framing depends on the aspect ratio, so a real change to it has to be
        // re-fitted. Only after the model is in, though: fit() runs off the model's
        // bounding box, and the observer fires before the load finishes.
        if (built && Math.abs(before - camera.aspect) > 0.01) { fit(); }
    }

    setLight();
    const observer = new ResizeObserver(resize);
    observer.observe(box);
    resize();

    /* ----------------------------------------------------------------------
     * Load
     * ------------------------------------------------------------------- */

    sharedLoader(renderer).then((loader) => {
        if (disposed) { return; }
        loader.load(spec.model, (gltf) => {
            if (disposed || !box.isConnected) { dispose(); return; }

            gltf.scene.traverse((o) => {
                if (!o.isMesh) { return; }
                o.castShadow = true;
                o.receiveShadow = true;
                const materials = Array.isArray(o.material) ? o.material : [o.material];
                for (const m of materials) {
                    if (!m) { continue; }
                    // These hulls are long and almost always seen at a grazing angle,
                    // which is the one case where the default filtering smears.
                    for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
                        if (m[key] && m[key].isTexture) { m[key].anisotropy = maxAnisotropy; }
                    }
                }
            });

            shift.add(gltf.scene);
            built = true;
            fit();

            let last = performance.now();
            (function loop(now) {
                if (disposed) { return; }
                if (!box.isConnected) { dispose(); return; }
                frame = requestAnimationFrame(loop);

                const t = (now || performance.now()) / 1000;
                const dt = Math.min(0.1, ((now || performance.now()) - last) / 1000);
                last = now || performance.now();

                if (!held && motion !== 'still') {
                    if (motion === 'spin') {
                        // Negative: a positive rotation about three's +Y turns the model
                        // anticlockwise seen from above, and clockwise is what reads as
                        // natural for something in orbit.
                        pivot.rotation.y -= spinRate * dt * 60;
                    } else {
                        // No full rotation at all - a vertical drift plus a little roll,
                        // pitch and yaw, all on different periods so they never line up
                        // into an obvious cycle. Amplitudes scale with the model, so a
                        // fighter does not wander as far as a capital ship.
                        const s = spinRate / 0.0007;
                        pivot.position.y = restingHeight + radius * 0.018 * Math.sin(t * 0.105 * s);
                        pivot.rotation.z = 0.020 * Math.sin(t * 0.071 * s);
                        pivot.rotation.x = 0.014 * Math.sin(t * 0.089 * s + 1.7);
                        pivot.rotation.y = 0.045 * Math.sin(t * 0.053 * s + 0.9);
                    }
                }

                controls.update();
                renderer.render(scene, camera);
            })(performance.now());
        }, undefined, (error) => {
            // Tear down here too: a failed load used to leave a live WebGL context
            // behind for a viewer that would never draw anything.
            dispose();
            reportFail(error);
        });
    }).catch((error) => {
        // sharedLoader() itself rejected - three.js addons unreachable, no WebGL2,
        // KTX2/Draco import blocked. Nothing was mounted; hand the failure back so the
        // caller removes its overlay rather than leaving a dead canvas host.
        dispose();
        reportFail(error);
    });

    /* ----------------------------------------------------------------------
     * Teardown
     *
     * renderer.dispose() frees three's own buffers but leaves the underlying WebGL
     * context alive. Browsers allow roughly sixteen of those per page, and the detail
     * panel creates a fresh viewer on every click - so without forceContextLoss() the
     * console fills with "Too many active WebGL contexts" after a dozen clicks and
     * viewers that were working go black.
     * ------------------------------------------------------------------- */

    function dispose() {
        if (disposed) { return; }
        disposed = true;
        cancelAnimationFrame(frame);
        observer.disconnect();
        controls.dispose();
        renderer.domElement.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        scene.traverse((o) => {
            if (!o.isMesh) { return; }
            if (o.geometry) { o.geometry.dispose(); }
            const materials = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of materials) {
                if (!m) { continue; }
                for (const value of Object.values(m)) {
                    if (value && value.isTexture) { value.dispose(); }
                }
                m.dispose();
            }
        });
        if (scene.environment) { scene.environment.dispose(); }
        renderer.forceContextLoss();
        renderer.dispose();
    }

    return { dispose, fit, resize, scene, camera, renderer };
}
