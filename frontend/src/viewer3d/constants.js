// Rocket League units (1 uu ~ 1 cm). RL axes: x = width, y = length, z = up.
export const ARENA = {
  halfWidth: 4096,
  halfLength: 5120,
  height: 2044,
  goalHalfWidth: 893,
  goalHeight: 642,
  goalDepth: 880,
  chamfer: 1152, // size of the diagonal corners
  cove: 260, // radius of the floor/wall and wall/ceiling curves
};

export const BALL_RADIUS = 91.25;
export const SUPERSONIC_SPEED = 2200;

// Standard soccar boost pads ([x, y]).
export const BIG_PADS = [
  [-3584, 0], [3584, 0],
  [-3072, 4096], [3072, 4096], [-3072, -4096], [3072, -4096],
];
export const SMALL_PADS = [
  [0, -4240], [-1792, -4184], [1792, -4184], [-940, -3308], [940, -3308], [0, -2816],
  [-3584, -2484], [3584, -2484], [-1788, -2300], [1788, -2300], [-2048, -1036], [0, -1024],
  [2048, -1036], [-1024, 0], [1024, 0], [-2048, 1036], [0, 1024], [2048, 1036],
  [-1788, 2300], [1788, 2300], [-3584, 2484], [3584, 2484], [0, 2816],
  [-940, 3308], [940, 3308], [-1792, 4184], [1792, 4184], [0, 4240],
];

export const TEAM_COLORS = {
  0: { main: 0x1557e0, light: 0x4d8dff, css: "#4d8dff" },
  1: { main: 0xff8a1f, light: 0xffb15c, css: "#ff8a1f" },
};

// Official hitbox presets: size [length, width, height] and offset of the hitbox centre from the car origin.
export const HITBOXES = {
  octane: { size: [118.01, 84.2, 36.16], offset: [13.88, 0, 20.75], front: 13, rear: 15 },
  dominus: { size: [127.93, 83.28, 31.3], offset: [9, 0, 15.75], front: 13, rear: 15 },
  plank: { size: [128.82, 84.67, 29.39], offset: [9.01, 0, 12.09], front: 12.5, rear: 14 },
  breakout: { size: [131.49, 80.52, 30.3], offset: [12.5, 0, 11.75], front: 13.5, rear: 15.5 },
  hybrid: { size: [127.02, 82.19, 34.16], offset: [13.88, 0, 20.75], front: 12.5, rear: 15 },
  merc: { size: [120.72, 76.81, 41.66], offset: [11.38, 0, 21.51], front: 13.5, rear: 16 },
};

// Approximate family of a car body, from its in-game name (unknown bodies fall back to the Octane hitbox).
const FAMILIES = [
  ["plank", ["batmobile", "mantis", "tumbler", "ice charger", "nemesis", "esper", "gizmo"]],
  ["breakout", ["breakout", "samurai", "centio", "animus", "vulcan"]],
  ["dominus", ["dominus", "masamune", "hotshot", "ripper", "twin mill", "scarab", "delorean", "proteus", "endo", "bone shaker"]],
  ["hybrid", ["venom", "x-devil", "jäger", "jager", "imperator", "aftershock", "werewolf", "twinzer", "tyranno"]],
  ["merc", ["merc", "marauder", "mudcat", "road hog", "armadillo", "grog", "triton"]],
];

export function hitboxFor(carName) {
  const name = (carName ?? "").toLowerCase();
  for (const [family, keywords] of FAMILIES) {
    if (keywords.some((k) => name.includes(k))) return { family, ...HITBOXES[family] };
  }
  return { family: "octane", ...HITBOXES.octane };
}
