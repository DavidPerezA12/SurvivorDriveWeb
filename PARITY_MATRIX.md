# Parity Matrix: `da` -> web

## Scenes

| `da` scene | Web status | Notes |
|---|---|---|
| `1PanelInicial` | `implemented` | Menu rebuilt as DOM shell with route contracts and direct run entrypoints. |
| `2PanelOpciones` | `implemented` | Volume, quality, fullscreen and render scale persisted in `SaveData v1`. |
| `4Equipment` | `implemented` | Loadout screen with chassis, tires and rig plus aggregated stats and role hints. |
| `3Desierto` | `implemented` | Main run route in desert biome with survival loop, resources, hazards and progression. |
| `City` | `partial` | Urban biome added as second route/transition, but still uses procedural web-native props instead of final asset pass. |

## Scripts

| `da` script | Web status | Notes |
|---|---|---|
| `MovimientoCoche.cs` | `implemented` | Web arcade vehicle controller covers accelerate, brake, steer, jump, stability and recovery. |
| `PauseInGame.cs` | `implemented` | Formal pause route with freeze of run loop and resume/menu/restart actions. |
| `Calidad.cs` | `implemented` | Quality preset controls renderer pixel ratio and shadow budget. |
| `FullScreen.cs` | `implemented` | Fullscreen retained; resolution is mapped to `resolutionScale` for browser-safe control. |
| `VolumenOpciones.cs` | `implemented` | Procedural audio master gain persisted in save. |
| `Coins.cs` | `implemented` | Coin pickup handled by simulation contracts and HUD update. |
| `Jump.cs` | `implemented` | Jump charge pickup and consumption unified in run state. |
| `Fire.cs` | `implemented` | Fire charge pickup and ability consumption unified in run state. |
| `FollowPlayer(Funciona)).cs` | `implemented` | Camera follow is web-native and now tied to gameplay/cinematic route states. |
| `ControladorCoche(Funciona).cs` | `superseded` | Replaced by the more complete web controller path. |
| `VolcarCoche.cs` | `partial` | Recovery/stability is simulated, but explicit flip recovery animation is still lightweight. |

## Assets

| Domain | Web status | Notes |
|---|---|---|
| Vehicles | `partial` | Hero car remains procedural/web-native; no converted final GLB pass yet. |
| Desert environment | `partial` | Stronger procedural set dressing exists, but still not asset-final. |
| City environment | `partial` | Urban skyline/props exist as placeholder production scaffolding. |
| Pickups | `implemented` | Stable manifest keys added in `src/game/content.js`. |
| Audio | `partial` | Layered procedural motor/skid/UI exists; climate/music still pending. |

## README-only vision from `da`

| Feature | Web status | Notes |
|---|---|---|
| Deep vehicle customization | `partial` | Functional loadout exists; long-form progression/unlocks still shallow. |
| Tactical combat | `partial` | Raiders, projectiles and fire pulse exist; encounter depth still expandable. |
| Dynamic world | `implemented` | Day/night and weather active in both routes. |
| Exploration and narrative | `pending` | Not part of this implementation cut. |
