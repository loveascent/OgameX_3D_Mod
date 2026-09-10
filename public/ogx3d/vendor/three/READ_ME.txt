OPTIONAL: YOUR OWN COPY OF three.js
===================================

By default the mod loads three.js from a public CDN, so this folder stays empty and
there is nothing to do.

If your server has no internet access, or you would rather not depend on a CDN, put
three.js here instead. The mod checks for it on every page and uses it automatically -
there is no setting to change.

What to download (r160 or newer, from https://threejs.org / https://github.com/mrdoob/three.js):

    public/ogx3d/vendor/three/three.module.js
    public/ogx3d/vendor/three/examples/jsm/controls/OrbitControls.js
    public/ogx3d/vendor/three/examples/jsm/loaders/GLTFLoader.js

Keep the examples/jsm/... folder structure exactly as it is in the download - the
addon files import each other by that path.

Optional, only if your models use them:

    examples/jsm/loaders/DRACOLoader.js      + examples/jsm/libs/draco/
    examples/jsm/loaders/KTX2Loader.js       + examples/jsm/libs/basis/
    examples/jsm/libs/meshopt_decoder.module.js

three.js is published by its own authors under the MIT licence. It is NOT part of this
mod and is not distributed with it - which is why this folder ships empty.
