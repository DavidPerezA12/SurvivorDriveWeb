export const GameRoute = {
  MENU: "menu",
  EQUIPMENT: "equipment",
  OPTIONS: "options",
  RUN_DESERT: "run-desert",
  RUN_CITY: "run-city",
  PAUSE: "pause",
  GAMEOVER: "gameover",
};

const RUN_ROUTES = new Set([GameRoute.RUN_DESERT, GameRoute.RUN_CITY]);

export function isRunRoute(route) {
  return RUN_ROUTES.has(route);
}

export function biomeFromRoute(route) {
  return route === GameRoute.RUN_CITY ? "city" : "desert";
}

export function routeForBiome(biome) {
  return biome === "city" ? GameRoute.RUN_CITY : GameRoute.RUN_DESERT;
}

export function screenForRoute(route) {
  return isRunRoute(route) ? null : route;
}
