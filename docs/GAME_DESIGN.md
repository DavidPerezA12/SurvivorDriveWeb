# Diseno de Juego

## High Concept

**Survivor Drive Web** es una carrera infinita survival en 3D. El jugador conduce el ultimo vehiculo funcional por carreteras destruidas, recoge recursos, evita amenazas, dispara a enemigos y usa la chatarra obtenida para mejorar el coche entre intentos.

La experiencia debe sentirse inmediata: arrancar, conducir, sobrevivir, morir, mejorar y volver a salir.

## Pilares

1. **Carrera infinita legible**
   La carretera se genera continuamente por tramos. El jugador siempre entiende que viene delante y tiene tiempo justo para reaccionar.

2. **Objetos 3D con sentido**
   Cada obstaculo, pickup, enemigo o decorado importante debe tener una funcion jugable. No se llenara la escena con props que confundan la lectura.

3. **Survival arcade**
   No es simulador. El control debe ser rapido, satisfactorio y permisivo, pero los choques y malas decisiones deben tener coste.

4. **Recursos bajo presion**
   Gasolina, vida, municion y reparacion obligan a tomar decisiones. La ruta mas segura no siempre tiene los recursos que necesitas.

5. **Mejora entre runs**
   Cada partida debe dejar progreso: chatarra, desbloqueos, mejoras y conocimiento del mundo.

## Camara y Control

- Camara 3D fija detras y por encima del coche.
- El coche avanza automaticamente.
- El jugador controla:
  - Movimiento lateral.
  - Salto.
  - Disparo.
  - Uso de reparacion, si se decide incluir como accion manual.
- En desktop:
  - `A/D` o flechas para moverse.
  - `Space` para saltar.
  - `F` o click para disparar.
- En movil:
  - Zonas tactiles grandes para izquierda/derecha.
  - Botones tactiles para saltar y disparar.

## Loop de Run

1. El jugador elige coche/equipamiento.
2. Empieza la carrera.
3. La velocidad aumenta gradualmente.
4. Aparecen obstaculos, pickups y enemigos.
5. El jugador recoge gasolina, municion, chatarra y repuestos.
6. La run termina por destruccion, falta de gasolina o error critico.
7. Se muestran distancia, chatarra, bajas y recompensas.
8. El jugador mejora el coche.
9. Nueva run.

## Recursos

### Gasolina

La gasolina es el temporizador organico de la run. Baja con el tiempo y puede bajar mas al acelerar, recibir danos o atravesar terrenos dificiles.

### Vida / Blindaje

Representa la resistencia del coche. Los choques leves quitan poco; impactos frontales, minas y explosiones deben doler.

### Municion

Recurso tactico. No se debe disparar sin pensar. Sirve para abrir caminos, destruir amenazas o matar enemigos peligrosos.

### Chatarra

Moneda persistente. Se obtiene recogiendo piezas, destruyendo enemigos y alcanzando hitos de distancia.

### Repuestos

Pickups raros de reparacion parcial. Deben estar colocados en rutas con riesgo.

## Acciones Principales

### Esquivar

La accion mas importante. La carretera debe generar patrones de lectura: carriles bloqueados, huecos, curvas suaves, obstaculos encadenados.

### Chocar lo menos posible

No todos los choques terminan la run. El juego debe permitir golpes pequenos, pero castigar impactos repetidos.

### Recoger

Los pickups no deben estar puestos al azar. Deben tentar al jugador a asumir riesgo.

### Disparar

El disparo debe sentirse util, no decorativo. Debe poder:

- Destruir barriles.
- Eliminar enemigos.
- Romper barricadas ligeras.
- Activar explosiones en cadena.

### Reparar

La reparacion puede ser automatica al recoger repuestos o manual si queremos anadir decision. Para el MVP, mejor reparacion automatica.

### Mejorar

Las mejoras deben cambiar sensiblemente la forma de jugar.

## Mejoras

- Blindaje: mas vida y menor dano por choque.
- Neumaticos: mejor respuesta lateral.
- Motor: mayor velocidad maxima y recuperacion.
- Deposito: mas gasolina inicial.
- Arma: mas dano, cadencia o capacidad.
- Suspension: mas saltos, salto mas largo o menor dano al caer.
- Iman de chatarra: facilita recoger recursos cercanos.

## Zonas

Las zonas son cambios visuales y mecanicos. No deben ser solo fondos.

1. **Salida / Garaje**
   Tutorial rapido, pocos peligros, pickups basicos.

2. **Autopista rota**
   Coches abandonados, conos, barricadas simples, carriles claros.

3. **Pueblo fantasma**
   Calles mas estrechas, escombros, gasolineras, emboscadas.

4. **Desierto**
   Alta velocidad, tormentas, rocas, visibilidad variable.

5. **Zona militar**
   Minas, torretas, barricadas duras, vehiculos raider.

6. **Perimetro del refugio**
   Tramo intenso con mezcla de amenazas. En modo infinito, esta zona puede convertirse en dificultad maxima repetible.

## Enemigos

Para el MVP no hacen falta muchos enemigos. Mejor pocos, claros y bien hechos.

- Zombie caminante: amenaza blanda, puede ser atropellado.
- Zombie grande: ocupa mas espacio, quita mas vida.
- Raider ligero: coche enemigo que aparece por detras o laterales.
- Torreta: amenaza fija en laterales o checkpoints.

## Tono Visual

- Low-poly o estilizado, no realista.
- Carretera clara y contrastada.
- Siluetas reconocibles.
- Colores por zona, sin perder legibilidad.
- Efectos atmosfericos moderados.
- HUD limpio: distancia, gasolina, vida, municion, chatarra.

## Criterio de Calidad

Una buena run debe provocar frases como:

- "Puedo llegar un poco mas lejos."
- "Si hubiera guardado municion, pasaba esa barricada."
- "Ese pickup valia el riesgo."
- "Necesito mejorar neumaticos."

