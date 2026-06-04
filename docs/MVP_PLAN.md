# Plan de MVP

## Objetivo del MVP

Crear una version jugable pequena, estable y divertida de **Survivor Drive Web**. Debe demostrar el loop principal: conducir, esquivar, recoger, disparar, recibir dano, terminar la run y mejorar.

## No Objetivos

Para evitar volver a inflar el proyecto, el MVP no incluira:

- Seis zonas completas.
- Historia larga.
- IA compleja.
- Fisica avanzada.
- Multijugador.
- Inventario profundo.
- Modelos 3D finales.
- Sistema grande de eventos.
- Tienda compleja.

## Fase 1: Base Jugable

Entregable: una carretera infinita funcional.

- Coche visible y controlable.
- Camara fija arcade.
- Movimiento lateral.
- Avance automatico.
- Loop de juego estable.
- Reinicio de partida.
- Distancia recorrida.

Criterio de exito: conducir 60 segundos se siente estable y legible.

## Fase 2: Obstaculos y Pickups

Entregable: la carretera ya exige decisiones.

- Coches abandonados.
- Barricadas.
- Barriles explosivos.
- Gasolina.
- Municion.
- Chatarra.
- Repuestos.
- Colisiones simples.

Criterio de exito: el jugador entiende que debe esquivar unas cosas y recoger otras sin leer instrucciones.

## Fase 3: Recursos y Game Over

Entregable: la run tiene presion survival.

- Vida/blindaje.
- Gasolina que baja con el tiempo.
- Municion limitada.
- Dano por choque.
- Game over por vida o gasolina.
- Pantalla de resumen.

Criterio de exito: una mala ruta puede matar, una buena ruta alarga la run.

## Fase 4: Disparo

Entregable: disparar cambia la ruta.

- Arma montada frontal.
- Proyectiles.
- Barriles destructibles.
- Barricadas ligeras destructibles.
- Zombies o enemigos simples.
- Feedback visual/audio de impacto.

Criterio de exito: disparar tiene valor tactico y no se siente como adorno.

## Fase 5: Garaje y Mejoras

Entregable: morir no es el final.

- Chatarra persistente.
- Mejor distancia.
- Mejoras basicas:
  - Blindaje.
  - Deposito.
  - Neumaticos.
  - Arma.
- Pantalla de garaje.

Criterio de exito: despues de morir, el jugador tiene una razon clara para otra run.

## Fase 6: Primera Zona Pulida

Entregable: vertical slice presentable.

- Autopista rota como primera zona.
- Objetos 3D con silueta clara.
- Iluminacion y materiales coherentes.
- HUD limpio.
- Audio basico.
- Controles desktop y tactiles.
- Build estable.

Criterio de exito: se puede ensenar el juego sin explicar que es un prototipo roto.

## Orden de Implementacion Recomendado

1. Wipe controlado del codigo viejo.
2. Proyecto Vite + TypeScript + Three.js limpio.
3. Loop/camara/coche.
4. Road chunks.
5. Entidades y colisiones.
6. Recursos.
7. Disparo.
8. UI/HUD.
9. Guardado y garaje.
10. Pulido visual/audio.

## Primera Demo Objetivo

Duracion esperada de run: 2-4 minutos.

Contenido:

- Una zona.
- Cinco tipos de obstaculo.
- Cuatro pickups.
- Un arma.
- Tres mejoras.
- Game over.
- Reinicio.

