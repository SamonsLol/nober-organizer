# Nober Organizer — contexto del proyecto

Proyecto de código abierto (licencia MIT): https://github.com/SamonsLol/nober-organizer (rama `main`).
Aplicación web personal de gestión académica (colegio, Colombia). El nombre vive en `src/lib/brand.ts`
(`APP_NAME`); claves de localStorage y eventos internos usan el prefijo `nober-` / `nober:`.
Lo específico de la instalación del mantenedor (dominios, servidor) está en `CLAUDE.local.md` (no se publica):
**nunca** poner dominios, IPs, IDs de espacios ni datos personales en archivos versionados.
Organización inspirada en plantillas académicas de Notion; estilo visual propio ("vidrio nocturno").
Implementación propia: no copiar código ni assets de terceros.

Idioma de la interfaz y de la conversación: **español**. Formato es-CO, 24 h, semana inicia el lunes.

## Cómo ejecutar

Requiere **Node ≥ 22** (Prisma 7 no instala en Node 20; la máquina tiene Node 24 LTS) y Docker Desktop.

```bash
npm install            # postinstall genera el cliente de Prisma en src/generated (ignorado por git)
cp .env.example .env   # DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL
npm run db:up          # PostgreSQL 17 en localhost:5433 (compose.dev.yaml, proyecto nober-dev)
npm run db:migrate     # aplica migraciones
npm run db:seed        # usuario de prueba demo@example.com / nober-demo-2026 con los datos ficticios
npm run dev            # http://localhost:3000
npm run build          # verificar antes de dar algo por terminado
npm run lint           # tsc --noEmit
```

Sin `DATABASE_URL` la app funciona como el prototipo (datos ficticios, sin inicio de sesión).
npm 11 bloquea scripts de instalación: los permitidos están en `allowScripts` de package.json
(`npm approve-scripts <pkg>` para añadir uno).

## Fases

1. ✅ Diseño y arquitectura (acordado).
2. ✅ Prototipo solo frontend con datos ficticios.
3. ✅ Backend: PostgreSQL + Prisma, autenticación (Better Auth), CRUD de materias, tareas, calendario, calificaciones, recursos.
4. 🔄 Integraciones ← **siguiente**: Google Calendar, AFFiNE, archivos, PWA, Docker, despliegue.

### Estado de la Fase 2
- Hecho: estructura base (sidebar flotante, ⌘K, tema oscuro/claro), **Inicio** completo,
  **Materias** (galería + horario semanal), **Detalle de materia** con 7 pestañas
  (`?tab=resumen|clases|temas|tareas|apuntes|recursos|notas`),
  **Tareas** (`/tasks?view=lista|tablero|fecha&task=<id>&course=<id>`): resumen, búsqueda, filtros
  (`FilterMenu`), tablero con arrastrar y soltar, side-peek (`TaskPeek`) con estado, pasos, archivos,
  enlaces y nota. Los cambios son locales (estado de React) hasta la Fase 3; la URL se sincroniza con
  `history.replaceState` para no volver a pedir la página.
  **Calendario** (`/calendar?view=mes|semana|agenda&d=yyyy-MM-dd`): todo se normaliza a `CalItem`
  (`lib/calendar.ts`, 6 tipos `CalKind`). Tarea con evaluación = "Entrega"; la evaluación ligada no se
  repite. Las clases se generan en el cliente con `expandClasses` para el rango visible (saltan festivos
  y días fuera de períodos) y enlazan al apunte de AFFiNE. El mes no pinta clases (sí la semana y el
  panel del día); en móvil el mes usa puntos. Exámenes y fechas importantes pendientes van en pastel.
  **Apuntes** (`/notes`): por fecha / por materia, próximas clases con «Preparar», recientes, y
  vista previa en iframe de AFFiNE (`DocPeek`) con caída a «Abrir en AFFiNE».
  **Calificaciones** (`/grades`): indicadores, tabla materia × período (+ año y nota necesaria),
  gráfico del período actual (una serie `chart-1`, línea de aprobación) y simulador con controles.
  **Recursos** (`/resources`): por materia / lista, filtros por materia, tipo y origen.
  **Ajustes** (`/settings`): perfil, períodos (validación de pesos = 100 %), escala, horario,
  integraciones (AFFiNE, Google Calendar) y tema.
- Pulido de móvil y modo claro hecho (revisadas todas las rutas a 390 px y 1440 px, oscuro y claro):
  Inicio en móvil reordena los bloques por prioridad (columnas con `max-lg:contents` + `max-lg:order-*`),
  calendario de Inicio compacto con puntos en móvil, tablas con columnas secundarias ocultas en móvil
  (`hidden sm:table-cell`, el dato pasa a la línea inferior), períodos de Ajustes en tarjetas.
  `PillScroller` (primitives) mantiene visible la píldora activa en filas desplazables.
- `ComingNext` ya no se usa en ninguna ruta.

### Estado de la Fase 3
- Hecho: PostgreSQL + Prisma 7 (`prisma/schema.prisma`, migración `init`, `prisma.config.ts`, adaptador `PrismaPg`).
  Todo modelo cuelga de `userId`. `lib/data/source.ts` (`loadUserDB`) lee todo lo del usuario y devuelve la
  misma forma que el mock (`MockDB`), así `lib/data/index.ts` y las pantallas no cambiaron; `db()` va en
  `cache()` de React (una carga por petición). Seed en `prisma/seed.ts` (idempotente, reusa `buildMock`).
  Better Auth (`lib/auth.ts`, `/api/auth/[...all]`, `lib/auth-client.ts`): correo + contraseña, Google si hay
  `GOOGLE_CLIENT_ID/SECRET`, registro cerrable con `AUTH_DISABLE_SIGNUP=true`. Usuario nuevo → ajustes y
  4 períodos por defecto (`lib/data/defaults.ts`). `/login` propia; `requireUserId()` (`lib/session.ts`)
  redirige a `/login` sin sesión. Cerrar sesión en Ajustes → Perfil.
- Tareas guardan de verdad (`lib/actions/tasks.ts`): crear (en línea en lista/tablero/por fecha, y ⌘K →
  `/tasks?new=1`), editar todo desde `TaskPeek` (título, emoji, materia, tipo, prioridad, entrega, etiquetas,
  descripción, nota con autoguardado), pasos y enlaces (añadir/marcar/quitar), eliminar con confirmación.
  También el check de «Tareas de la semana» en Inicio.
- Patrón de escritura (repetirlo en el resto):
  - Acción en `lib/actions/<dominio>.ts` con `"use server"`, envuelta en `run()` (`lib/actions/result.ts`) →
    devuelve `Result` (`{ok, data}` / `{ok:false, error}`), nunca lanza. Mensajes al usuario solo con `UserError`;
    zod en español (`z.config(z.locales.es())`). `requireUserId()` + filtro `userId` en cada consulta
    (`updateMany/deleteMany where {id, userId}`). Sin base de datos la acción no hace nada. `revalidatePath("/", "layout")`.
  - Cliente optimista: aplica el cambio, llama la acción y si `!ok` revierte y muestra `toast(error)`
    (`components/shell/toast.tsx`, montado en el layout). Crear no es optimista (espera el id real).
- Ajustes guardan de verdad (`lib/actions/settings.ts` → `saveSettings`, una transacción): perfil (nombre va a
  `User.name`), año, escala y períodos (añadir/quitar; quitar uno con evaluaciones se bloquea en cliente y
  servidor; «Repartir en partes iguales»). Validación de pesos = 100 %, escala y fechas sin cruces en ambos lados.
- Materias guardan de verdad (`lib/actions/courses.ts`): editor único en diálogo (`components/courses/course-editor.tsx`,
  `openCourseEditor()` / `<CourseEditorHost>` en el layout / `EditCourseButton`) con nombre, emoji, color, portada,
  profesor, aula, código, carpeta AFFiNE y horario semanal (lunes a viernes). El servidor rechaza bloques que se
  cruzan, también con otras materias. El slug se fija al crear (renombrar no cambia la URL). Eliminar muestra lo que
  se pierde (`courseUsage`); las tareas quedan como personales. Entradas: galería, «+» de la barra lateral, ⌘K, detalle.
  Campos vacíos (código, aula, profesor) no se pintan.
- Evaluaciones y notas guardan de verdad (`lib/actions/assessments.ts`): editor en diálogo
  (`components/grades/assessment-editor.tsx`, `openAssessmentEditor({assessment, courseId, periodId, usedWeight, focusScore})`,
  host en el layout con materias, períodos y escala). Pesos por materia+período ≤ 100 % (cliente avisa «Quedan X %»,
  servidor rechaza). Nota de 0 a «Sobre» (por defecto la máxima de la escala; p. ej. 85 sobre 100 → 4,3) con
  `scoreInScale()` en `lib/grades.ts`. `CourseGrade.secured` = aprobado aunque saque la mínima en lo pendiente.
  Pestaña Calificaciones de cada materia: `AssessmentTable` con pestañas por período, «Registrar» nota, aviso si los
  pesos no suman 100 %. Entradas: esa tabla, «Nueva evaluación» en /grades y ⌘K.
- Eventos del calendario guardan de verdad (`lib/actions/events.ts`): editor en diálogo
  (`components/calendar/event-editor.tsx`, `openEventEditor({event, date})`, host en el layout). Tipos: evento,
  fecha importante, prueba externa (EXAM) y festivo (HOLIDAY). Todo el día: `start` = medianoche local del primer
  día, `end` = la del último (incluido). `eventDays()` reparte un evento de varios días en cada día del calendario
  (`CalItem.event` lleva el original; clic = editar) y `holidayKeys()` quita las clases de cada día festivo.
  Entradas: «+ Evento» en el panel del día, clic en un evento, ⌘K.
- Temas, clases, recursos, metas y pensamientos guardan de verdad (`lib/actions/study.ts`). En la materia,
  `components/courses/course-study.tsx`: `TopicBoard` (arrastrar entre niveles, «Estudiado hoy»), `LectureGrid`
  (clase con fecha, tema y enlace al apunte de AFFiNE; sin enlace muestra «Enlazar apunte»), `CourseResources`.
  `ResourceEditor` (`components/resources/resource-editor.tsx`) adivina el tipo por el enlace y se usa también en
  /resources. Metas (Inicio) y Pensamientos: añadir, marcar, quitar (`RemoveButton`).
- Diálogos: usar `Dialog`, `DialogFooter`, `Field`, `TitleRow`, `inputCls` de `components/blocks/dialog.tsx`.
- `affineDocUrl` y `affineFolderUrl` son opcionales: nunca `!`; caer a `AFFINE_HOME`.
- `relativeAgo` dice «hace un momento» por debajo de un minuto (evita desajustes de hidratación).
  El `<script>` del tema en `<head>` debe seguir en línea (con `next/script beforeInteractive` se ejecuta tarde y parpadea).
- Cuentas nuevas: `GettingStarted` (`components/dashboard/getting-started.tsx`) con 5 pasos y su estado real
  (`DashboardData.setup`: perfil, materias, horario, evaluaciones, tareas). Sin materias ocupa el lugar de
  «Lo más urgente» y no se puede ocultar; después va arriba y se oculta con × (localStorage) o al completarse.
  Paneles vacíos usan `<EmptyHint action onAction|href>` (primitives) con una frase útil y su acción.
  `runCreateAction(id, push)` (command-menu) es la única forma de «crear» desde ⌘K y Acciones; clases y temas
  llevan a Materias con un aviso (se crean dentro de cada materia).
- Fase 3 completa.

### Estado de la Fase 4
- Despliegue listo (probado en local con Docker; falta ejecutarlo en el VPS): `Dockerfile` multi-etapa
  (`deps` → `builder` → `runner` con `output: "standalone"`, y `migrate` que corre `prisma migrate deploy`),
  `compose.yaml` de producción (proyecto `nober`: db + migrate + app en `127.0.0.1:${APP_PORT:-3100}`),
  `.env.production.example`, `deploy/nginx/nober.conf` y la guía `deploy/README.md`.
  Siempre `docker compose --env-file .env.production …` (las variables de compose salen de ahí).
  `/api/health` comprueba app + base de datos (lo usa el HEALTHCHECK de la imagen).
- Valores por defecto neutrales: AFFiNE cae a `https://app.affine.pro`, dominios de ejemplo `midominio.com`,
  proyecto de compose `nober`, plantilla `deploy/nginx/nober.conf`. `TZ` configurable (por defecto `America/Bogota`).
- `compose.dev.yaml` es solo la base de datos de desarrollo (`npm run db:up`); `compose.yaml` es producción.
- Pendiente: ejecutar el despliegue; AFFiNE por servidor (crear apunte de clase, recientes — en 0.27 por MCP);
  archivos de tareas y recursos; Google Calendar; PWA.

## Decisiones ya tomadas (no volver a preguntar)

- Stack: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4. Sin librería de UI externa.
  Iconos: lucide-react. Fechas: date-fns (locale `es`). Fuente: Poppins (@fontsource).
- Calendario propio (no FullCalendar) para controlar la estética.
- Backend futuro dentro de Next (Server Components + Server Actions), Prisma + PostgreSQL,
  Better Auth (correo + Google), trabajos en segundo plano con pg-boss.
- Despliegue: Docker Compose detrás de un proxy con HTTPS. AFFiNE autoalojado en el mismo dominio que la app
  (mismo sitio → las cookies de sesión de AFFiNE funcionan dentro del iframe).
- Código abierto MIT: README para la comunidad (con capturas en `docs/screenshots`), `CONTRIBUTING.md`, `LICENSE`.
- Escala de notas por defecto 1.0–5.0, aprueba con 3.0, 4 períodos de 25 %. Todo configurable (`GradingScale`).
- Tareas y "assignments" son un solo modelo `Task` con `type`; las notas viven en `Assessment`.
- UI en español; nombres de rutas en inglés.

## AFFiNE (apuntes)

- Se configura con `NEXT_PUBLIC_AFFINE_ORIGIN` (por defecto la nube `https://app.affine.pro`) y
  `NEXT_PUBLIC_AFFINE_WORKSPACE` (se fijan al compilar). Enlaces a documentos: `/workspace/{workspaceId}/{docId}`.
  Sin espacio configurado, los enlaces caen a la raíz del servidor. Probado con AFFiNE 0.27.
- Verificado: la respuesta **no** envía `X-Frame-Options` ni CSP → el iframe no está bloqueado por cabeceras.
  El riesgo real es la sesión (cookies de terceros) → por eso AFFiNE en el mismo sitio que la app.
- Tiene MCP nativo en `/api/workspaces/{id}/mcp` con token Bearer. AFFiNE 0.27+ quitó la API
  antigua de tokens personales por GraphQL → aislar la integración en un solo módulo.
- Estrategia: 1) enlaces profundos, 2) panel con iframe y caída a enlace, 3) sincronización por servidor
  (crear apunte de clase, listar recientes). El contenido nunca se copia a la app.
- **PRIORIDAD: AFFiNE embebido en toda la plataforma** (pasos 1 y 2 hechos). Reglas:
  - Constantes y detección en `lib/affine.ts` (`AFFINE_ORIGIN`, `AFFINE_HOST`, `AFFINE_BASE`, `AFFINE_HOME`,
    `isAffineUrl`). No escribir URLs ni dominios sueltos.
  - Si el dominio de AFFiNE cambia, los enlaces guardados (`Course.affineFolderUrl`, `Lecture.affineDocUrl`,
    `RecentDoc.url`) se reescriben con `replace()` en SQL.
  - Todo enlace a AFFiNE usa `<AffineLink>` (`components/affine/affine.tsx`): abre el panel global
    `AffinePanel` (montado en el layout; lateral / ancho / pantalla completa, preferencia en localStorage).
    Sigue siendo un `<a>` real: Ctrl/⌘ + clic o clic central → pestaña nueva. Nunca `target="_blank"` directo
    salvo el botón explícito «pestaña nueva».
  - Desde código cliente: `openAffine({ url, title, meta, emoji, color, size })`.
  - Para incrustar en una sección: `<AffineInline doc height>` (usa `AffineFrame`: carga, aviso a los 8 s,
    reintentar, abrir en pestaña). Lo usan el lector de `/notes` (≥1280 px) y la pestaña Apuntes de cada materia.
  - Verificado: el iframe carga AFFiNE real (pantalla de inicio de sesión sin sesión). En `localhost` las
    cookies de AFFiNE son de terceros; la sesión dentro del iframe solo está garantizada en producción
    con ambos en el mismo dominio.

## Google Calendar (Fase 4)

La app es la fuente de verdad. Envío a un calendario propio con el nombre de la app (eventos con id interno en
`extendedProperties` para no duplicar; clases como eventos recurrentes). Otros calendarios se leen en
solo lectura con `syncToken`. Bidireccional opcional después.

## Diseño (respetar)

- Estilo "vidrio nocturno": fondo casi negro con brillos suaves (lavanda, durazno, azul), paneles
  translúcidos muy redondeados (`.glass`, radio 24 px), tarjetas pastel con texto oscuro para lo
  importante (`.pastel-{color}` + `text-on-pastel`), botones y pestañas tipo píldora.
- Una sola clase de acento: lavanda (`bg-accent`). Píldora activa clara (`bg-pill-active`).
- Tokens en `src/app/globals.css` (modo oscuro por defecto y claro). Usar siempre los tokens, nunca colores sueltos.
- Colores de materia: gray, brown, orange, yellow, green, blue, purple, pink, red → `tag-*`, `dot-*`, `pastel-*`.
- Gráficos: series `chart-1` (lavanda), `chart-2` (durazno), `chart-3` (azul) — validadas para contraste y
  daltonismo sobre el fondo oscuro. Texto siempre en tokens de texto, no en el color de la serie.
- Evitar: estética corporativa, exceso de colores, gradientes decorativos, botones enormes, look "AI startup".
- Sección estándar: `<Section title action>` (panel de vidrio con título y acciones a la derecha).
- Pestañas de vista: `<ViewTabs>`; plazos relativos con `deadline()` + `toneClass`.
- Filtros: `<FilterMenu>` (píldora + menú con casillas). Etiquetas de tareas: `TASK_STATUS`, `TASK_TYPE`,
  `PRIORITY`, `RESOURCE_KIND` en `blocks/shared.tsx` (no redefinirlas en cada pantalla).

## Arquitectura del código

```
src/
  app/(app)/                rutas con sidebar
  components/blocks/
    primitives.tsx          "use client": Section, ViewTabs, Tag, NewButton, PillButton, GhostAdd…
    shared.tsx              SIN "use client": toneClass, gradeClass, KIND, Dots (usable en servidor)
  components/shell/         Sidebar, CommandMenu (⌘K), PageHeader, ComingNext, nav.ts
  components/dashboard/     widgets de Inicio
  components/courses/       ScheduleGrid, course-detail (pestañas)
  components/tasks/         tasks-view (lista/tablero/fecha + filtros), task-peek (panel lateral)
  components/calendar/      calendar-view (mes/semana/agenda + panel del día)
  components/notes|grades|resources|settings/  una vista cliente por pantalla
  components/shell/theme.ts useTheme/setTheme (tema sincronizado entre barra lateral y Ajustes)
  components/affine/        AffineLink, AffinePanel (global), AffineInline, AffineFrame, openAffine
  lib/affine.ts             integración AFFiNE aislada (URLs del servidor y del espacio)
  lib/calendar.ts           CalItem, buildItems (servidor), expandClasses (cliente)
  components/illustrations/ portadas SVG propias
  lib/data/index.ts         CAPA DE DATOS: deriva lo que pide cada pantalla a partir de db()
  lib/data/source.ts        loadUserDB: Prisma → misma forma que el mock
  lib/db/prisma.ts          cliente Prisma único (hasDatabase())
  lib/auth.ts, session.ts   Better Auth (servidor) y requireUserId()
  prisma/                   schema.prisma, migraciones, seed.ts
  lib/mock/seed.ts          datos ficticios generados en relación con "hoy"
  lib/grades.ts             promedios ponderados, nota necesaria para aprobar
  lib/dates.ts              fechas es-CO, semana académica, plazos relativos
  lib/types.ts              tipos de dominio (reflejan el modelo de datos de la Fase 1)
```

## Reglas técnicas aprendidas

- **No importar valores (objetos, funciones como `cn`) desde un módulo "use client" en un componente
  de servidor**: llegan como referencias de cliente y fallan. Poner lo compartido en `blocks/shared.tsx`
  o `lib/`, y en servidor usar `import cn from "clsx"`.
- Las páginas con datos usan `export const dynamic = "force-dynamic"` (el mock depende de la fecha).
- Columnas `@db.Date` (períodos) llegan como medianoche UTC: leerlas con `toISOString().slice(0, 10)`,
  nunca con `format()` local (en Colombia correría un día). El servidor debe correr con `TZ=America/Bogota`.
- Abrir la app desde otro host (IP de Radmin VPN, LAN) exige ponerlo en `TRUSTED_ORIGINS` del `.env`
  (con puerto): sin eso Better Auth responde `403 INVALID_ORIGIN` y Next en desarrollo no sirve el JS
  (`allowedDevOrigins`), así que el formulario se envía como HTML sin hidratar.
- `server-only` impide importar `lib/db/prisma.ts` fuera de Next: los scripts (seed) crean su propio cliente.
- Si es sábado o domingo, "esta semana" = la semana que empieza el lunes siguiente.
- `Task.steps` / `Task.files` son la fuente; `subtasks` y `attachments` son conteos derivados (el mock
  los calcula; en la Fase 3 los calculará la consulta).
- Capturas sin interfaz: Edge headless tiene un ancho mínimo (~500 px); para móvil, envolver la página en
  un iframe de 390 px. El tema claro se activa con `localStorage['nober-theme'] = 'light'`.
- Si `npm run build` falla con `EPERM` (rmdir/unlink en `.next`), es OneDrive: quitar solo lectura y borrar las
  salidas de compilación (`.next/server`, `.next/standalone`, `.next/static`), nunca `.next/dev` si corre `npm run dev`.
- Migraciones en sesiones no interactivas (`prisma migrate dev` se niega): generar el SQL con
  `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > prisma/migrations/<fecha>_<nombre>/migration.sql`
  (con la base de desarrollo al día) y aplicar con `npx prisma migrate deploy`.
- Antes de terminar: `npm run build` sin errores y revisar la pantalla en el navegador (oscuro, claro y móvil).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
