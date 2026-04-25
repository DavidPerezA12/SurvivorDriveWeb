# Unity (`da/`) frente al web actual

## Qué es cada cosa

- **[da/README.md](da/README.md)**: proyecto **Unity** (*Survivor’s Drive*) con visión amplia: personalización profunda, mundo dinámico con clima y ciclo día/noche, combate táctico, supervivencia con combustible, munición y salud del vehículo.
- **Raíz del repo**: app **Vite + Three.js** con entrada [src/main.js](src/main.js), estilos [src/style.css](src/style.css) y módulos de juego en [src/game/](src/game/) (`ui`, `simulation`, `persistence`, `routes`, `content`, `input`). La escena y el bucle siguen concentrados en `main.js`; contratos y DOM viven sobre todo en `game/`.

## Qué es “más completo” depende del criterio

| Criterio | `da/` (Unity) | Web actual |
|----------|----------------|------------|
| **Alcance del diseño (README)** | Más ambicioso: mundo abierto, narrativa, sistemas de supervivencia avanzados. | Menor alcance declarado: carretera infinita, pickups, equipamiento, run arcade. |
| **Superficie del motor y assets** | Unity + escenas/paquetes de ejemplo y **scripts C#** propios (coche, menús, monedas, pausa, calidad, etc.). | **Entry JS** + módulos ES en `src/game/`; sin editor Unity ni pipeline de build de juego completo. |
| **Bucle jugable coherente en repo** | Hay muchas piezas; hace falta abrir Unity para comprobar hasta qué punto está integrado todo lo del README (combustible, clima, etc.). | **Muy cohesivo**: menú → equipamiento con stats → opciones con `localStorage` → run con obstáculos, raiders, salto, “fire”, combustible, munición, clima, ciclo día/noche, monedas, distancia y game over. |

## Conclusión

- Si “completo” significa **visión y ecosistema del juego original (motor 3D, assets, sistemas que pueden no verse en una sola lectura de código)**, **`da/` suele ser el proyecto más grande** en ese sentido.
- Si “completo” significa **un producto web jugable de punta a punta con flujo de pantallas, persistencia y loop cerrado en un árbol de código acotado**, **el web actual está muy completo para ese alcance** y ya cubre bastante mejor `combustible`, `munición`, `clima` y `ciclo día/noche`; lo que sigue faltando frente al Unity descrito es sobre todo `mundo abierto`, `narrativa`, `física avanzada` y un `pipeline` de assets finales. Detalle por escena/script: [PARITY_MATRIX.md](PARITY_MATRIX.md).
