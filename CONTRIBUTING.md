# Contribuir a Nober Organizer

Gracias por querer ayudar. Algunas pautas para que tu aporte entre rápido:

## Antes de empezar

- Para cambios grandes (una pantalla nueva, otra integración, cambios en el modelo de datos), abre primero un
  issue para conversarlo.
- La interfaz está en **español** (formato es-CO, 24 h, semana desde el lunes). Los nombres de rutas y del código
  van en inglés; los comentarios, en español.

## Entorno

Sigue la sección «Desarrollo» del [README](README.md). Antes de abrir un pull request:

```bash
npm run lint     # TypeScript sin errores
npm run build    # compila
```

y revisa tu cambio en el navegador en **modo oscuro, claro y móvil** (~390 px).

## Convenciones

- **Diseño**: usa los tokens de `src/app/globals.css` (nunca colores sueltos) y los bloques de
  `src/components/blocks` (`Section`, `ViewTabs`, `Tag`, `Dialog`, `EmptyHint`…). Un solo color de acento.
- **Datos**: toda escritura va en `src/lib/actions/<dominio>.ts` con `"use server"`, validada con zod, envuelta en
  `run()` y filtrada por `userId`. El cliente aplica el cambio al instante y lo revierte si la acción falla.
- **Esquema**: si cambias `prisma/schema.prisma`, crea la migración con `npm run db:migrate -- --name <nombre>` e
  inclúyela en el pull request.
- **AFFiNE**: no escribas URLs sueltas; usa `src/lib/affine.ts` y `<AffineLink>`.
- Commits pequeños y con mensaje claro.

## Reportar errores

Incluye qué esperabas, qué pasó, pasos para reproducirlo, navegador/dispositivo y, si aplica, la salida de
`docker compose --env-file .env.production logs app`.

## Licencia de los aportes

Al enviar un pull request aceptas que tu aporte se publique bajo la misma licencia del proyecto,
[GNU AGPLv3](LICENSE).
