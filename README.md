# Survivor Drive Web

Reboot de **Survivor Drive** para navegador con **Vite + Three.js**.

Es un juego arcade web independiente: menú, equipamiento, opciones persistentes, HUD, conducción en wasteland, obstáculos, pickups, salto, habilidad de fuego, pausa y game over.

## Estado actual

La versión actual es un **vertical slice jugable**:

- Flujo completo de pantallas: menú, opciones, equipamiento, partida, pausa y game over
- Escena 3D en tiempo real con Three.js
- Coche configurable con diferencias básicas de estadísticas
- Carretera infinita, desierto y ruta urbana (bioma ciudad) con transición según progresión
- Obstáculos con mejor lectura visual
- Pickups de monedas, salto, fuego, munición, combustible y reparación
- Controles de teclado y botones en pantalla
- Opciones persistidas en `localStorage`
- Ciclo día-noche y clima dinámico configurable
- Supervivencia con combustible y munición
- Raiders con fuego entrante y presión creciente de amenaza
- Audio procedural básico

## Stack

- `Vite`
- `Three.js`
- JavaScript modular sencillo, sin framework UI

## Arranque

Instala dependencias:

```bash
npm install
```

Lanza el proyecto en desarrollo:

```bash
npm run dev
```

Abre la URL que imprima Vite en consola. Por defecto suele ser:

- **Desarrollo** (`npm run dev`): `http://127.0.0.1:5173/` (puerto 5173)
- **Preview del build** (`npm run preview`): `http://127.0.0.1:4173/` (puerto 4173)

Si el puerto está ocupado, Vite elige otro; confía en la línea `Local:` de la terminal.

## Importante

No abras [`index.html`](./index.html) directamente con `file://` para desarrollo.

Este proyecto usa Vite para servir módulos ES. Si abres el archivo raíz en local, puedes encontrarte una pantalla en blanco.

Si quieres abrir una versión compilada fuera del servidor de desarrollo:

```bash
npm run build
```

Y luego usa:

- [`dist/index.html`](./dist/index.html)

## Controles

- `A` / `D`: mover a izquierda y derecha
- `←` / `→`: mover a izquierda y derecha
- `Space`: usar salto si tienes cargas
- `F`: usar habilidad de fuego si tienes cargas
- `Esc`: pausar o reanudar

El pulso de fuego consume:

- `1` carga de fuego
- `2` de munición

También hay botones en pantalla para:

- `Jump`
- `Fire`
- `Pause`

## Scripts

- `npm run dev`: servidor de desarrollo (Vite, puerto por defecto 5173)
- `npm run build`: build de producción
- `npm run preview`: vista previa del `dist/` (Vite, puerto por defecto 4173)
- `npm run test`: pruebas con el runner de `node --test`

## Estructura

```text
SurvivorDriveWeb/
├── src/
│   ├── main.js           # entrada: Three.js, bucle, integración UI ↔ simulación
│   ├── style.css         # layout HUD/UI y estilos globales
│   └── game/
│       ├── assets.js     # carga y normalización de modelos runtime
│       ├── content.js    # catálogos, manifiestos de pickups, perfiles de entorno
│       ├── input.js      # teclado / toque y estado de entrada
│       ├── loop.js       # requestAnimationFrame, dt clamp y render
│       ├── persistence.js# SaveData, localStorage, desbloqueos
│       ├── routes.js     # rutas de pantalla y bioma
│       ├── runRuntime.js # runtime de run: spawns, eventos, cámara y colisiones
│       ├── simulation.js # estado de carrera, colisiones, encuentros
│       ├── ui.js         # montaje del DOM (menús, HUD, canvas)
│       ├── uiController.js# eventos DOM y sincronización UI ↔ juego
│       └── input.test.js # tests del módulo de entrada
├── index.html
├── public/models/        # modelos servidos por Vite
└── vite.config.js        # base `./` y chunk manual de three
```

## Arquitectura

- `src/main.js` conserva el bootstrap, estado global, UI, opciones e inyección de dependencias.
- `src/game/loop.js` contiene el bucle de render.
- `src/game/runRuntime.js` contiene spawns, chunks, eventos, cámara, colisiones y finalización de run.
- `src/game/simulation.js` contiene lógica serializable y testeable de la run.
- `src/game/ui.js` monta el DOM base; `src/game/uiController.js` conecta eventos y flujo.
- `src/game/assets.js` centraliza modelos, loaders y normalización de materiales.
- `src/game/content.js` mantiene datos de balance y catálogos.

## Limitaciones actuales

Todavía faltan, por ejemplo:

- IA o combate más profundo
- Terreno procedural más rico
- Física de coche más avanzada
- Modelos 3D finales y pipeline de assets
- Exploración abierta y capa narrativa real

## Siguientes pasos razonables

- Mejorar el feeling del coche y la cámara
- Añadir enemigos y patrones de tráfico
- Subir la calidad del entorno (props y pass final de assets)
- Seguir partiendo lógica pesada de `main.js` en módulos de juego
- Introducir assets 3D reales (GLB, pipeline)

## Autoría

Proyecto original: David Perez  
Reboot web actual: nueva implementación sobre la misma idea base.
