export const storageKey = "survivor-drive-web-state";
export const schemaVersion = 1;
export const speedPips = 12;

export const contentManifest = {
  vehicles: {
    scout: { key: "vehicle.scout", source: "web-native" },
    hauler: { key: "vehicle.hauler", source: "web-native" },
    interceptor: { key: "vehicle.interceptor", source: "web-native" },
  },
  environment: {
    desert: { key: "environment.desert", source: "web-native" },
    city: { key: "environment.city", source: "web-native" },
  },
  pickups: {
    coin: { key: "pickup.coin", source: "da-reference" },
    jump: { key: "pickup.jump", source: "da-reference" },
    fire: { key: "pickup.fire", source: "da-reference" },
    ammo: { key: "pickup.ammo", source: "web-native" },
    fuel: { key: "pickup.fuel", source: "web-native" },
    repair: { key: "pickup.repair", source: "web-native" },
  },
  enemies: {
    raider: { key: "enemy.raider", source: "web-native" },
    tower: { key: "enemy.tower", source: "web-native" },
    barrier: { key: "enemy.barrier", source: "web-native" },
    wreck: { key: "enemy.wreck", source: "web-native" },
  },
  fx: {
    dust: { key: "fx.dust", source: "web-native" },
    shockwave: { key: "fx.shockwave", source: "web-native" },
    missileTrail: { key: "fx.missile-trail", source: "web-native" },
  },
  audio: {
    engine: { key: "audio.engine", source: "procedural" },
    skid: { key: "audio.skid", source: "procedural" },
    ui: { key: "audio.ui", source: "procedural" },
    climate: { key: "audio.climate", source: "planned" },
  },
  ui: {
    hud: { key: "ui.hud", source: "web-native" },
    options: { key: "ui.options", source: "da-reference" },
    equipment: { key: "ui.equipment", source: "da-reference" },
  },
};

export const equipmentCatalog = {
  chassis: [
    {
      id: "scout",
      name: "Scout",
      description: "Ligero, agil y con buena velocidad punta.",
      stats: { speed: 1.08, handling: 1.12, armor: 0.95, reserve: 0.92, efficiency: 1.05, ammoCap: 0.95 },
      color: "#d8b36b",
      role: "Sprint",
    },
    {
      id: "hauler",
      name: "Hauler",
      description: "Pesado, estable y con casco reforzado.",
      stats: { speed: 0.94, handling: 0.9, armor: 1.2, reserve: 1.2, efficiency: 0.94, ammoCap: 1.08 },
      color: "#7d8f99",
      role: "Tank",
    },
    {
      id: "interceptor",
      name: "Interceptor",
      description: "Intermedio, pensado para runs largas.",
      stats: { speed: 1.0, handling: 1.0, armor: 1.05, reserve: 1.06, efficiency: 1.08, ammoCap: 1.16 },
      color: "#a86143",
      role: "Long run",
    },
  ],
  tires: [
    {
      id: "grip",
      name: "Grip",
      description: "Mas control lateral sobre arena compacta.",
      stats: { handling: 1.15, jump: 1.0, traction: 1.08, efficiency: 1.02 },
    },
    {
      id: "offroad",
      name: "Off-road",
      description: "Amortigua mejor baches y aterrizajes.",
      stats: { handling: 0.96, jump: 1.12, traction: 1.02, reserve: 1.04 },
    },
    {
      id: "scrap",
      name: "Scrap",
      description: "Viejos, pero sorprendentemente rapidos.",
      stats: { handling: 0.92, jump: 0.94, traction: 1.12, efficiency: 0.94, ammoCap: 1.04 },
    },
  ],
  rig: [
    {
      id: "ram",
      name: "Ram",
      description: "Defensa frontal agresiva para romper obstaculos ligeros.",
      stats: { fireRadius: 1.15, armor: 1.05, ammoCap: 1.08 },
    },
    {
      id: "tank",
      name: "Tank",
      description: "Blindaje adicional y menos daño por impacto.",
      stats: { fireRadius: 0.95, armor: 1.18, reserve: 1.1 },
    },
    {
      id: "booster",
      name: "Booster",
      description: "Montaje ligero para ganar algo de aceleracion base.",
      stats: { speed: 1.08, armor: 0.92, efficiency: 1.12, ammoCap: 0.92 },
    },
  ],
};

export const biomeCatalog = {
  desert: {
    id: "desert",
    name: "Wasteland Highway",
    label: "Desert run",
    hint: "Empuja a fondo por el wasteland hasta que el asfalto se convierta en ciudad.",
    checkpointKm: 7.5,
    completionKm: null,
    color: "#ffb673",
  },
  city: {
    id: "city",
    name: "Ruined District",
    label: "City breach",
    hint: "Atraviesa el distrito y sal de la bolsa de fuego.",
    checkpointKm: 13,
    completionKm: null,
    color: "#9ad1ff",
  },
};

export const objectiveCatalog = {
  desert: {
    title: "Push through the wasteland",
    summary: "La ruta es continua: aguanta y abre camino hacia la ciudad.",
  },
  city: {
    title: "Endure the ruined district",
    summary: "La ruta urbana queda abierta: aguanta todo lo que puedas.",
  },
};

export const environmentProfiles = {
  clear: {
    id: "clear",
    label: "Clear",
    tint: "#54371b",
    fogBoost: 0,
    handling: 1,
    threatBoost: 0,
    fuelUse: 1,
  },
  dust: {
    id: "dust",
    label: "Dust Storm",
    tint: "#5c331b",
    fogBoost: 0.002,
    handling: 0.94,
    threatBoost: 14,
    fuelUse: 1.16,
  },
  ash: {
    id: "ash",
    label: "Ash Front",
    tint: "#3b2925",
    fogBoost: 0.0015,
    handling: 0.97,
    threatBoost: 8,
    fuelUse: 1.12,
  },
  smog: {
    id: "smog",
    label: "Smog Bank",
    tint: "#4a5159", // Mucho más claro que #262b30
    fogBoost: 0.0015, // Menos denso
    handling: 0.95,
    threatBoost: 12,
    fuelUse: 1.1,
  },
};

export const skyPalette = {
  desert: {
    bgNight: "#0f1a2b",
    bgDay: "#a66840",
    fogNight: "#161c2b",
    fogDay: "#c49a6c",
    ambientNight: "#6c88bf",
    ambientDay: "#c4a385",
    groundNight: "#1a1215",
    groundDay: "#361e12",
  },
  city: {
    bgNight: "#1a2636", // Más claro
    bgDay: "#7d7e8a",    // Más brillante
    fogNight: "#242d3b",
    fogDay: "#898e99",
    ambientNight: "#7a8eb2",
    ambientDay: "#b0b3ba",   // Más luz ambiente de día
    groundNight: "#25262e",
    groundDay: "#4a4b54",    // Suelo de ciudad menos oscuro
  },
};

export const pickupCatalog = {
  coin: {
    label: "Coins",
    amount: 1,
    color: "#ffd166",
  },
  jump: {
    label: "Jump charge",
    amount: 1,
    color: "#7af5b7",
  },
  fire: {
    label: "Fire charge",
    amount: 1,
    color: "#ff8b5e",
  },
  ammo: {
    label: "Ammo crate",
    amount: 3,
    color: "#6fd0ff",
  },
  repair: {
    label: "Repair kit",
    amount: 18,
    color: "#ff96b4",
  },
};

export const encounterConfig = {
  desert: {
    weightedPickups: ["coin", "coin", "jump", "fire", "ammo", "repair"],
    obstacleBias: { raider: 0.08, barrier: 0.3, tower: 0.2, wreck: 0.1, scrap: 0.22, mutant: 0.06, ramp: 0.04 },
  },
  city: {
    weightedPickups: ["coin", "ammo", "repair", "jump", "fire"],
    obstacleBias: { raider: 0.14, barrier: 0.22, tower: 0.22, wreck: 0.18, scrap: 0.1, mutant: 0.08, ramp: 0.06 },
  },
};
