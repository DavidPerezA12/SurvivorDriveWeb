# Especificacion Tecnica

## Objetivo

Construir una base tecnica limpia para un endless runner 3D de conduccion survival en navegador. La prioridad es que el MVP sea estable, legible y facil de ampliar, no recrear de golpe todos los sistemas del prototipo anterior.

## Stack Recomendado

- **Vite**: servidor de desarrollo y build.
- **TypeScript**: tipos para estado de juego, entidades, recursos y configuracion.
- **Three.js**: escena 3D, camara, luces, materiales y meshes.
- **Rapier** opcional: fisicas y colisiones si el control manual con AABB no es suficiente.
- **Web Audio API**: audio procedural y efectos.
- **localStorage**: guardado inicial de progreso.
- **Vitest** o `node --test`: tests de logica pura.

## Principio Tecnico

La logica del juego no debe depender directamente de Three.js. El render muestra el estado; no lo define.

Separacion deseada:

- Simulacion: datos, reglas, recursos, colisiones abstractas.
- Runtime: loop, input, spawn, actualizacion por frame.
- Render: Three.js, meshes, materiales, camara.
- UI: HUD, menus y pantallas.
- Persistencia: progreso, opciones y desbloqueos.

## Estructura Propuesta

```text
src/
├── main.ts
├── core/
│   ├── gameLoop.ts
│   ├── input.ts
│   ├── time.ts
│   └── random.ts
├── game/
│   ├── runState.ts
│   ├── resources.ts
│   ├── damage.ts
│   ├── upgrades.ts
│   ├── scoring.ts
│   └── progression.ts
├── world/
│   ├── road.ts
│   ├── chunks.ts
│   ├── zones.ts
│   ├── spawnRules.ts
│   └── objectCatalog.ts
├── entities/
│   ├── car.ts
│   ├── obstacle.ts
│   ├── pickup.ts
│   ├── projectile.ts
│   └── enemy.ts
├── render/
│   ├── scene.ts
│   ├── camera.ts
│   ├── materials.ts
│   ├── meshFactory.ts
│   └── effects.ts
├── ui/
│   ├── hud.ts
│   ├── screens.ts
│   └── touchControls.ts
├── audio/
│   ├── audioEngine.ts
│   └── sounds.ts
└── save/
    └── storage.ts
```

## Modelo de Run

La run debe poder representarse como datos serializables:

```ts
type RunState = {
  status: 'ready' | 'running' | 'paused' | 'ended';
  distanceM: number;
  speedMps: number;
  health: number;
  fuel: number;
  ammo: number;
  scrap: number;
  score: number;
  zoneId: string;
};
```

## Coordenadas

Recomendacion:

- `Z`: direccion de avance.
- `X`: lateral.
- `Y`: altura.
- El coche permanece cerca del origen.
- La carretera y objetos se mueven hacia el jugador, usando treadmill pattern.

Esto reduce problemas de precision y facilita una carrera infinita.

## Sistema de Carretera

La carretera se genera por chunks. Cada chunk define:

- Longitud.
- Ancho.
- Zona.
- Carriles o posiciones laterales utiles.
- Slots de obstaculos.
- Slots de pickups.
- Slots de enemigos/eventos.
- Props visuales no bloqueantes, si no comprometen legibilidad.

Los chunks deben tener reglas, no ser ruido aleatorio puro.

## Colisiones

Para el MVP:

- Usar colisiones simples con cajas/circulos en 2.5D.
- Cada entidad tiene `position`, `radius` o `bounds`.
- Three.js solo renderiza.

Rapier se evaluara si:

- El salto necesita fisica mas convincente.
- Los choques deben empujar objetos.
- Los enemigos requieren comportamiento fisico real.

## Render 3D

Prioridades:

- Meshes simples pero reconocibles.
- Materiales consistentes por zona.
- Buena silueta del coche.
- Objetos importantes con color/forma diferenciada.
- Nada de assets que parezcan placeholder si afectan al gameplay.

Para el primer MVP se pueden usar modelos generados con primitivas, siempre que tengan sentido visual: coche, barril, mina, barricada, bidon, caja de municion, chatarra.

## UI

HUD minimo:

- Distancia.
- Vida/blindaje.
- Gasolina.
- Municion.
- Chatarra recogida.
- Estado de arma o cooldown, si aplica.

Pantallas:

- Inicio.
- Pausa.
- Game over.
- Garaje/mejoras.

## Guardado

Guardar en `localStorage`:

- Chatarra total.
- Mejoras compradas.
- Mejor distancia.
- Opciones basicas.
- Vehiculos desbloqueados.

## Tests

Tests prioritarios:

- Consumo de gasolina.
- Calculo de dano.
- Recoleccion de pickups.
- Compra de mejoras.
- Seleccion de zona por distancia.
- Generacion de chunks valida.
- Fin de run por vida o gasolina.

## Criterio para el Wipe

Antes de borrar la implementacion anterior:

1. README y documentacion aprobados.
2. Stack decidido.
3. MVP definido.
4. Lista de sistemas descartados.
5. Rama o copia de seguridad creada, si se quiere conservar historial de trabajo.

