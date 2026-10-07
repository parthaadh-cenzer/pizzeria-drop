# Runtime asset contract

The generated library has two characters, two environment shells, two static assemblies, six tile modules, a horizontal hammer, a world launcher pickup and a separate held launcher. Units are meters, +Y up, +Z character forward. `manifest.json` records exact sizes/counts; runtime GLSL and gameplay are supplied as source, not embedded in GLBs.

Both original mascots share 19 named joints and eight clips: idle, run, jump, fall, landing, recovery, hit, dance. Five skinned meshes preserve body/hair/upper/lower/shoes replacement slots and share a vertex-color material. Girl: 15,850 triangles / 958,304 bytes; boy: 14,698 / 913,952. Clone with SkeletonUtils.clone and use independent mixers. Six motions come from supplied FBXs, two are authored. Run weapon-rig IK after mixer evaluation. Chest WeaponSocket and launcher LeftGrip/RightGrip/Muzzle nodes must survive optimization.

Layout source is `runtime/layout.js`: three levels [19.4, 11.8, 4.2], tile side 2.25, pitch 2.35. Side 7/9/11 by population; Easy full, Medium two interior holes/floor, Hard six. Exported layouts/assemblies use 15-player Hard: 363 metadata cells, 345 present tiles, 15 spawn points. Runtime generates current selections and instances tiles by floor/variant. Do not use missing cells as active collision surfaces.

Load environment shells plus instanced props for play. Assemblies are static portable art views. City floor is near -34; Volcano's lava display is near -1.3. Simulation kill threshold is -0.5. Hammer motion rotates the named sweep horizontally around Y; base stays fixed. Pickup ownership, ammo, falling, tile timers and rocket impacts are owned by `src/gameplay.js`.

Source FBXs in Girl 1/Guy 1 are preserved and excluded from hosting output. Regenerate with `npm run assets`, then `npm test`. `prune({keepLeaves:true})` preserves functional empty markers. Tile crack planes reduce repeated geometry; environment geometry merges by material; runtime uses bounded VFX/car pools. No texture downloads, Draco requirement or networking adapter is introduced.

See root HANDOFF and BRAIN for current evidence, controls, limits, workflow provenance and continuation steps. Runtime and static export changes must be validated together.
