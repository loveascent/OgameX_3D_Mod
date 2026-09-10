PUT YOUR OWN FILES IN HERE
==========================

3D_GLB_Files_Here/     ->  your 3D models.  .glb  or  .gltf
Icons_Here/            ->  your flat pictures.  .png  .jpg  .gif  .webp

That is the whole job. Drop a file in, then go into the game, open the admin bar,
click "3D Mod", and pick it from the drop-down next to the object you want to change.
No restart, no cache to clear - the list is read fresh every time you open the page.


WHAT GOES WHERE
---------------

A PICTURE replaces an object's icon everywhere at once: the shipyard, the fleet
screens, the tech tree, the build queue, the battle report. Square images look best;
anything from about 64x64 up will do.

A MODEL puts a live, rotatable 3D view in the big artwork box of the detail panel -
the square you see when you click a ship in the shipyard. You can drag it to turn it
and scroll to zoom.

You can set both on the same object. The model is shown where there is room for it,
the picture everywhere else.


IF A MODEL WILL NOT LOAD
------------------------

  *  .glb is the safe choice. A .gltf keeps its textures in separate files next to
     it - if you use one, copy its whole folder in here, not just the .gltf.
  *  Draco-compressed, Meshopt and KTX2 files are all handled.
  *  Keep it under about 20 MB. This is a browser, not a render farm.
  *  Press F12 in the browser and look at the Console tab - a failed model says
     exactly what went wrong there.


THIS FOLDER IS YOURS
--------------------

Nothing here is ever deleted or overwritten by the mod, and none of it is part of the
mod's own files. Updating the mod leaves everything in here exactly as it was.
