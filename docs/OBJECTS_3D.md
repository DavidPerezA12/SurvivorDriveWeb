# Direccion de Objetos 3D

## Regla Principal

Todo objeto 3D visible debe tener una lectura inmediata y una funcion jugable. Si un objeto no cambia ninguna decision del jugador, debe ser secundario, lateral o eliminarse.

## Categorias

## Obstaculos Duros

Bloquean el paso y danan el coche.

| Objeto | Funcion | Lectura visual |
| --- | --- | --- |
| Coche abandonado | Bloqueo de carril | Silueta grande, oxidada, horizontal |
| Barricada metalica | Bloqueo frontal | Aspas, pinchos o placas |
| Roca grande | Obstaculo pesado | Volumen irregular oscuro |
| Camion volcado | Bloqueo ancho | Masa larga, ocupa varios carriles |

## Obstaculos Blandos

Molestan o danan poco, pero encadenados son peligrosos.

| Objeto | Funcion | Lectura visual |
| --- | --- | --- |
| Conos rotos | Guia de ruta / peligro leve | Naranja apagado |
| Escombros | Dano bajo / ralentizacion | Fragmentos bajos |
| Caja rota | Obstaculo pequeno | Cubo astillado |

## Riesgos Especiales

Amenazas que exigen reaccion concreta.

| Objeto | Funcion | Respuesta esperada |
| --- | --- | --- |
| Mina | Explosion al pasar encima | Esquivar o disparar |
| Barril explosivo | Explosion por choque/disparo | Disparar a distancia |
| Grieta | Caida o dano fuerte | Saltar o cambiar de carril |
| Fuego | Dano sostenido | Evitar |

## Pickups

Los pickups deben verse distintos entre si incluso a velocidad alta.

| Pickup | Funcion | Forma recomendada |
| --- | --- | --- |
| Gasolina | Recupera fuel | Bidon rojo |
| Municion | Recupera balas | Caja verde/militar |
| Chatarra | Moneda | Piezas metalicas brillantes |
| Repuestos | Repara vida | Caja de herramientas |

## Enemigos

| Enemigo | Funcion | MVP |
| --- | --- | --- |
| Zombie | Amenaza blanda / puntos | Si |
| Zombie grande | Bloqueo vivo | Opcional |
| Raider ligero | Presion lateral/detras | Despues del MVP |
| Torreta | Zona de peligro fija | Despues del MVP |

## Props de Ambiente

Los props de ambiente deben vivir fuera del area de decision principal o comunicar contexto sin tapar amenazas.

Permitidos:

- Farolas caidas en laterales.
- Senales rotas.
- Vallas.
- Restos de edificios.
- Gasolineras al lateral.
- Torres militares.
- Humo lejano.

Evitar:

- Props en medio de la carretera que no colisionan.
- Objetos pequenos con silueta parecida a pickups.
- Demasiados colores compitiendo con recursos.
- Decoracion que tape el siguiente obstaculo.

## Colores Funcionales

- Rojo: gasolina, fuego, explosion, peligro inmediato.
- Verde militar: municion.
- Amarillo/naranja: advertencia, barriles, conos.
- Azul/cian: reparacion o energia, si se usa.
- Gris/negro: chatarra, coches quemados, metal.

## Escala y Silueta

Reglas:

- Los obstaculos que matan deben parecer mas peligrosos que los que solo molestan.
- Los pickups deben tener brillo o movimiento sutil.
- Los enemigos deben moverse o animarse para separarse de props.
- La carretera debe conservar contraste suficiente para leer carriles.

## Primer Set de Assets

Para el MVP basta con:

- Coche jugador.
- Coche abandonado.
- Barricada.
- Barril explosivo.
- Mina.
- Grieta/agujero.
- Bidon de gasolina.
- Caja de municion.
- Chatarra.
- Repuestos.
- Zombie simple.
- Segmentos de carretera.
- Props laterales: senal, farola, valla, restos.

