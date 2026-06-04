# Survivor Drive Web

**Survivor Drive Web** es un videojuego arcade de conduccion survival para navegador. El proyecto se plantea como un reboot desde cero: una carrera infinita postapocaliptica con vehiculos armados, recursos limitados, objetos 3D con funcion jugable clara y progresion entre runs.

La referencia de tono es algo tipo **The Last Driver**: avance automatico, camara arcade, esquivar amenazas, disparar, recoger recursos, morir, mejorar el coche y volver a intentarlo. La meta no es clonar ese juego, sino construir una version mas legible, mas coherente y mejor controlada.

## Vision

Un endless runner 3D de conduccion survival: **Mad Max arcade para navegador**.

El jugador conduce por una carretera infinita generada por tramos. El coche avanza siempre. La habilidad esta en leer la carretera, esquivar obstaculos, chocar lo minimo posible, recoger gasolina, municion y chatarra, disparar cuando conviene, reparar el vehiculo y mejorar entre runs.

Todo objeto 3D debe tener sentido. Si aparece en pantalla, debe afectar al juego: bloquear, amenazar, recompensar, proteger, romper, explotar, indicar ruta, crear riesgo o modificar una decision.

## Gameplay Principal

- Carrera infinita con avance automatico.
- Control lateral del vehiculo, salto y disparo.
- Esquivar obstaculos y elegir rutas seguras.
- Gestionar gasolina, vida, municion y reparaciones.
- Recoger chatarra para mejoras permanentes.
- Destruir amenazas con armas montadas en el coche.
- Sobrevivir cada vez mas distancia.
- Morir, mejorar el vehiculo y repetir.

## Recursos

| Recurso | Funcion |
| --- | --- |
| Gasolina | Mantiene viva la run. Si se agota, el coche se detiene y termina la partida. |
| Vida / blindaje | Absorbe choques, disparos y explosiones. |
| Municion | Permite limpiar zombies, raiders, barriles o bloqueos destructibles. |
| Chatarra | Moneda de mejora entre runs. |
| Repuestos | Reparacion parcial durante la carrera. |

## Amenazas y Objetos 3D

Los objetos deben ser reconocibles, fisicos y utiles para el gameplay:

- Coches abandonados: obstaculos duros, crean slalom.
- Barricadas: bloquean carriles, algunas son destructibles.
- Barriles explosivos: riesgo si se choca, oportunidad si se disparan.
- Minas: obligan a cambiar de trayectoria.
- Grietas y agujeros: requieren salto o desvio.
- Zombies/mutantes: se pueden atropellar o disparar.
- Raiders: vehiculos enemigos que presionan al jugador.
- Gasolineras destruidas: puntos de riesgo/recompensa.
- Puestos militares: zonas densas con torretas, minas y barricadas.
- Chatarra visible: pickups colocados para tentar rutas peligrosas.

## Inspiracion: The Last Driver

Segun resenas de la epoca, **The Last Driver** era un juego iOS de supervivencia arcade donde el coche avanzaba automaticamente y el jugador controlaba izquierda/derecha, salto y disparo. El objetivo era llegar lo mas lejos posible mientras se esquivaban coches, zombies, rocas y otros peligros, recogiendo recursos y monedas para mejorar el coche.

Elementos que queremos conservar:

- Runs cortas y repetibles.
- Avance automatico.
- Controles simples.
- Acciones claras: esquivar, saltar, disparar.
- Progresion por mejoras.
- Fantasia postapocaliptica directa.

Elementos que queremos evitar:

- Grind excesivo.
- Controles torpes.
- Objetos aleatorios sin coherencia.
- Demasiado ruido visual.
- Falta de identidad propia.

Referencias consultadas:

- [AppSpy - The Last Driver Review](https://www.appspy.com/the-last-driver/review/)
- [Capsule Computers - The Last Driver Review](https://www.capsulecomputers.com.au/2012/08/the-last-driver-review/)
- [AppAdvice - You're The Last Driver, How Will You Stay Alive?](https://appadvice.com/appnn/2012/08/quickadvice-thelastdriver)

## Documentacion

- [Diseno de juego](docs/GAME_DESIGN.md)
- [Especificacion tecnica](docs/TECH_SPEC.md)
- [Plan de MVP](docs/MVP_PLAN.md)
- [Direccion de objetos 3D](docs/OBJECTS_3D.md)

## Tecnologia Propuesta

La implementacion final se definira antes del wipe completo del codigo, pero la base recomendada es:

- **Vite** como entorno de desarrollo.
- **TypeScript** para hacer la logica mas mantenible.
- **Three.js** para render 3D.
- **Rapier** opcional para fisicas/colisiones si el prototipo lo necesita.
- **Web Audio API** para motor, disparos, impactos y ambiente.
- **localStorage** para progreso inicial.
- Tests para logica pura: recursos, damage model, generacion, mejoras y economia.

## Estado del Reboot

Este repositorio contiene codigo anterior que se considera descartable. La siguiente fase es definir bien el juego y la tecnologia, guardar esta documentacion como referencia, y despues limpiar la implementacion vieja para construir un MVP nuevo.

