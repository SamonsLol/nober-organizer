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
4. ✅ Integraciones: Docker, PWA, archivos, Google Calendar, apuntes en Obsidian (antes AFFiNE). Desplegado en el VPS del mantenedor.

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
  y días fuera de períodos) y enlazan al apunte de Obsidian (`CalItem.note`). El mes no pinta clases (sí la semana y el
  panel del día); en móvil el mes usa puntos. Exámenes y fechas importantes pendientes van en pastel.
  **Apuntes** (`/notes`): por fecha / por materia, próximas clases con «Preparar», recientes, y
  lector del apunte (`NoteInline`) en la columna derecha (≥1280 px).
  **Calificaciones** (`/grades`): indicadores, tabla materia × período (+ año y nota necesaria),
  gráfico del período actual (una serie `chart-1`, línea de aprobación) y simulador con controles.
  **Recursos** (`/resources`): por materia / lista, filtros por materia, tipo y origen.
  **Ajustes** (`/settings`): perfil, períodos (validación de pesos = 100 %), escala, horario,
  integraciones (Obsidian, Google Calendar) y tema.
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
  profesor, aula, código, carpeta de apuntes en Obsidian y horario semanal (lunes a viernes). El servidor rechaza bloques que se
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
  (clase con fecha, tema y su apunte de Obsidian; sin él, «Crear apunte» o «Enlazar apunte»), `CourseResources`.
  `ResourceEditor` (`components/resources/resource-editor.tsx`) adivina el tipo por el enlace y se usa también en
  /resources. Metas (Inicio) y Pensamientos: añadir, marcar, quitar (`RemoveButton`).
- Diálogos: usar `Dialog`, `DialogFooter`, `Field`, `TitleRow`, `inputCls` de `components/blocks/dialog.tsx`.
- `Lecture.notePath` y `Course.notesFolder` son opcionales: nunca `!`. Carpeta efectiva: `courseFolder(course, root)`.
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
- Valores por defecto neutrales: apuntes en `Apuntes/` de la bóveda, dominios de ejemplo `midominio.com`,
  proyecto de compose `nober`, plantilla `deploy/nginx/nober.conf`. `TZ` configurable (por defecto `America/Bogota`).
- `compose.dev.yaml` es solo la base de datos de desarrollo (`npm run db:up`); `compose.yaml` es producción.
- PWA: `app/manifest.ts`, `public/sw.js` (cachea solo estáticos; páginas a la red con `/offline.html` de respaldo;
  solo se registra en producción), iconos en `public/icons`.
- Archivos: modelo `Upload` (contenido en disco en `UPLOAD_DIR/<userId>/<key>`, volumen `uploads` en Docker),
  `POST /api/files` (sesión, `MAX_UPLOAD_MB`, lista de tipos en `lib/storage.ts`; HTML/SVG rechazados),
  `GET /api/files/:id` solo para el dueño (nosniff + CSP sandbox). Borrar tarea/recurso/materia borra el disco;
  huérfanos se limpian a las 24 h. Cliente: `uploadFile()` (`lib/upload-client.ts`).
  Proyectos también tienen archivos (`ProjectFile`, sección «Archivos» en `/projects/[slug]`, `attachProjectFile` /
  `deleteProjectFile`; borrar el proyecto borra el disco).
- Apuntes en Obsidian (reemplazó a AFFiNE el 2026-11-23, migración `20261123200000_obsidian`): ver sección «Obsidian».
- Google Calendar: `lib/google-calendar.ts` (scope `calendar.app.created`, refresh propio del token desde la tabla
  `account`, eventos con `extendedProperties.private.nober` + `nober_hash`, clases como RRULE semanal con EXDATE de
  festivos). `GOOGLE_CALENDAR_API` y `GOOGLE_TOKEN_URL` solo existen para pruebas con simuladores.
  Auto-sincronización al abrir Inicio (cada 15 min como mucho). Vinculación con `authClient.linkSocial`.
- Google se probó de punta a punta con la imagen Docker de producción (simulador HTTP en memoria). Obsidian, con
  Playwright contra la imagen de producción, una base temporal y una copia de la bóveda (crear, editar, tareas,
  [[enlaces]], conflicto, móvil). Ojo: con el navegador en UTC salen errores de hidratación #418 (fechas); en
  `America/Bogota` no hay ninguno.
- Pendiente: nada de la Fase 4.

## Decisiones ya tomadas (no volver a preguntar)

- Stack: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4. Sin librería de UI externa.
  Iconos: lucide-react. Fechas: date-fns (locale `es`). Fuente: Poppins (@fontsource).
- Calendario propio (no FullCalendar) para controlar la estética.
- Backend futuro dentro de Next (Server Components + Server Actions), Prisma + PostgreSQL,
  Better Auth (correo + Google), trabajos en segundo plano con pg-boss.
- Despliegue: Docker Compose detrás de un proxy con HTTPS. Apuntes en una bóveda de Obsidian montada en el contenedor.
- Código abierto MIT: README para la comunidad (con capturas en `docs/screenshots`), `CONTRIBUTING.md`, `LICENSE`.
- Escala de notas por defecto 1.0–5.0, aprueba con 3.0, 4 períodos de 25 %. Todo configurable (`GradingScale`).
- Tareas y "assignments" son un solo modelo `Task` con `type`; las notas viven en `Assessment`.
- UI en español; nombres de rutas en inglés.

## Obsidian (apuntes)

- Reemplazó a AFFiNE (que no se podía editar bien embebido). Los apuntes son notas `.md` de una bóveda montada en el
  contenedor (`OBSIDIAN_VAULT_PATH`; en compose `OBSIDIAN_VAULT_DIR` → `/vault`). La app guarda solo la ruta relativa
  (`Lecture.notePath`). La sincronización con los dispositivos la hace Obsidian (en el VPS: LiveSync + un Obsidian
  web siempre abierto que escribe la bóveda en disco). Config en el servidor, no en el cliente: no hay `NEXT_PUBLIC_*`.
- Variables: `OBSIDIAN_VAULT_NAME` (URIs `obsidian://`), `OBSIDIAN_NOTES_ROOT` (carpeta raíz; por materia
  `<raíz>/<nombre>` salvo `Course.notesFolder`), `OBSIDIAN_ALLOWED_EMAILS` (la bóveda es de la instancia),
  `OBSIDIAN_WEB_URL` (botón «Abrir Obsidian»). `getVault()` (data) → `VaultProvider` en el layout → `useVault()`.
- `lib/vault.ts` es el ÚNICO que toca el disco: solo `.md`, sin `..` ni segmentos que empiecen por `.`, comprueba
  enlaces simbólicos (`realpath`). Escritura con `mtime` base: si cambió en disco devuelve `conflict` y no escribe.
- Plantilla de clase en `lib/actions/notes.ts`: propiedades `materia`, `fecha`, `tema`, `profesor`, `tags` (`clase` +
  materia) y `nober: <lectureId>`. Esa marca permite re-enlazar la nota si se movió (`findByLectureId`).
  NO usar la etiqueta `universidad`: el complemento Auto Note Mover del mantenedor mueve esas notas a la raíz.
- «Editados hace poco» = notas más recientes (mtime) en las carpetas de las materias (`recentNotes`); ya no hay tabla.
- UI: `<NoteLink path …>` abre el panel global (`NotePanel`); Ctrl/⌘ + clic → `obsidian://` (app). `openNote(doc)`
  desde cliente; `<NoteInline>` en /notes y la pestaña Apuntes; `<LectureLink>` = nota o, sin ella, a Clases.
  El editor (`NoteEditor`): Leer (Markdown con GFM, KaTeX, callouts, `[[enlaces]]` resueltos en el servidor, casillas
  que guardan) / Editar (textarea, autoguardado 0,9 s, Ctrl+S, recarga al volver a la pestaña si no hay cambios).
- Adjuntos en apuntes: botón «Adjuntar» del `NoteEditor`, pegar o arrastrar. `POST /api/vault/attachments` guarda el archivo
  en la carpeta de adjuntos de Obsidian (`attachmentFolderPath` de `.obsidian/app.json`, o `OBSIDIAN_ATTACHMENTS_FOLDER`),
  con nombre único en la bóveda, e inserta `![[nombre]]`. El lector muestra imágenes y enlaza PDF/otros con
  `GET /api/vault/file?target=&from=` (`findAttachment`, misma lista de tipos que `lib/storage.ts`, nunca .md/HTML/SVG).
- `Markdown` preprocesa línea a línea sin cambiar el número de líneas: las casillas usan la línea de origen
  (`node.position` + líneas de las propiedades) para `toggleTaskAt`. Si se cambia el preproceso, mantenerlo así.

## Proyectos (fuera de lo académico)

- Modelo `Project` (nombre, emoji, color, descripción, estado ACTIVE/PAUSED/DONE, `dueDate` a medianoche local,
  `notesFolder`). `Task.projectId` opcional: sin materia ni proyecto = actividad personal («Otras actividades»).
- Rutas: `/projects` (galería por estado + «Otras actividades pendientes» con `QuickTasks`) y `/projects/[slug]`
  (tareas, «Pendientes en Obsidian», notas de la carpeta). Editor en diálogo: `openProjectEditor()` /
  `<ProjectEditorHost>` en el layout; la carpeta se elige de las existentes de la bóveda (`vaultFolders`).
- Carpeta efectiva: `projectFolder(p, vault.projectsRoot)` (`OBSIDIAN_PROJECTS_ROOT`, en el VPS «🚀 Proyectos»).
  Puede ser una carpeta que ya existe (p. ej. «🖥️ Servidores»): sus notas y casillas aparecen en el proyecto.
- Casillas de Obsidian: `parseTasks` / `toggleTaskLine` (`lib/notes.ts`, formato del complemento Tasks: 📅 ⏳ ✅ y
  prioridades 🔺⏫🔼🔽⏬). `setVaultTask` (`lib/vault.ts`) solo cambia la línea si sigue igual (la busca si se movió)
  y añade/quita `✅ yyyy-MM-dd` como Tasks. Acceso a la bóveda: `vaultUser()` / `vaultAllowed()` en `lib/vault-access.ts`.
- Tareas: filtro «Proyecto» y `?project=<id>` en `/tasks`; campo Proyecto en `TaskPeek`; `AreaTag` muestra materia,
  si no proyecto, si no «Personal». Barra lateral: «Mis proyectos» (no terminados); ⌘K: «Nuevo proyecto» y proyectos.

## IA (capa gratuita por API)

- `lib/ai.ts`: `aiJson({name, schema, system, user})` contra cualquier API compatible con OpenAI (`/chat/completions`,
  `response_format: json_schema` estricto). Por defecto Groq + `openai/gpt-oss-120b` (gratis: ~1.000 solicitudes y
  200.000 tokens/día, 8.000 tokens/min) con `reasoning_effort: low`. Sin SDK. Variables `AI_API_KEY`, `AI_BASE_URL`,
  `AI_MODEL`, `AI_REASONING_EFFORT`. Errores 401/429/413 → mensajes en español (`AiError`).
- Acciones en `lib/actions/ai.ts`: `summarizeNote`, `reviewQuestions`, `suggestTasks` + `createSuggestedTasks`
  (materia/proyecto según la clase o la carpeta de la nota), `addSectionToNote` (llena «## Resumen en tres líneas» si
  está vacío; si no, agrega sección; con control de `mtime`), `planWeek` + `savePlanToVault`
  («<raíz>/Planes de estudio/Semana del …»). Apuntes de más de `AI_MAX_INPUT_CHARS` se rechazan con aviso (no se recortan).
- La IA solo propone; escribir o crear tareas siempre lo confirma la persona. Mismas cuentas que la bóveda
  (`vaultAllowed`). `getVault().ai` → botón «IA» en `NoteEditor` (`components/ai/note-ai.tsx`) y «Plan de la semana»
  (`components/ai/week-plan.tsx`, `openWeekPlan()`, host en el layout; `PageHeader extra=`).
- Gemini gratis (~20 solicitudes/día) y OpenRouter `:free` (50/día) se descartaron por sus límites (nov. 2026).

## Google Calendar: lectura

- Permiso `calendar.readonly` (además de `calendar.app.created`); `linkSocial` pide ambos. `lib/google-scope.ts`.
- `readGoogleCalendars()` (`lib/google-calendar.ts`): calendarios elegidos (`Settings.googleReadIds`), eventos con
  `singleEvents=true` de −30 a +120 días, se **reemplaza** la copia en `ExternalEvent`. Todo el día: fin exclusivo de
  Google → último día incluido. Color del calendario → color de la app más cercano (`nearestColor`).
- `maybeAutoSync()` (Inicio y Calendario) envía y lee si pasaron 15 min. Errores en `googleSyncError`/`googleReadError`.
- `CalKind` "GOOGLE" (`CalItem.color`, `href` externo a Google). `MockDB.externalEvents`; Inicio: `today.google` y
  `calendar.google`. Ajustes: dos bloques (enviar / ver aquí) en `google-connect.tsx`.
- Con `AUTH_DISABLE_SIGNUP=true`, Google tiene `disableSignUp` (no crea cuentas; vincular sí funciona).

## Recordatorios push

- Web Push con `web-push` (`lib/push.ts`, VAPID en `.env.production`). `PushSubscription` por dispositivo (se borra con
  404/410), `ReminderLog` con clave única `task|exam:<id>:<fecha ISO>:<opción>` (si cambia la fecha, se vuelve a avisar).
  Preferencias en `Settings.remindTasks` (DAY_BEFORE, SAME_DAY, TWO_HOURS), `remindExams` (THREE_DAYS, DAY_BEFORE,
  SAME_DAY), `remindEvening`/`remindMorning` (HH:mm, hora del servidor).
- Programador: `src/instrumentation.ts` (sin imports `server-only`) hace POST cada 5 min a `/api/reminders` con un token
  aleatorio del proceso en `globalThis`; la ruta corre `runReminders()` (`lib/reminders.ts`). Avisos con más de 90 min de
  retraso se descartan. La clave se reserva en `ReminderLog` antes de enviar (sin duplicados).
- Exámenes = `Assessment` sin nota y que no sea HOMEWORK/PROJECT (esas avisan como tarea) + eventos EXAM.
- `public/sw.js` (v2) maneja `push` y `notificationclick`. UI: Ajustes → Recordatorios (`push-settings.tsx`).

## Mantenimiento

- Respaldo diario: `deploy/backup.sh` (base + volumen uploads, gzip, 14 de cada uno en `~/backups/nober`), en el crontab
  del servidor a las 08:30 UTC (3:30 Bogotá). Probado restaurando en un Postgres temporal.
- Dependencias: `npm audit` limpio salvo KaTeX (baja, sin arreglo compatible). `overrides.effect` fuerza la versión
  corregida que usa el CLI de Prisma. Al subir Prisma, actualizar también `allowScripts` (versión exacta).

## Menús desplegables

- No usar `<select>` nativo (en oscuro salía blanco con letra gris): `Select` de `components/blocks/select.tsx`
  (portal con posición fija, teclado, opciones con emoji/color/hint; variantes `field`, `pill`, `bare`).

## Íconos (Lucide)

- Todo ícono de la interfaz es de Lucide. Catálogo en `components/blocks/icons.tsx` (sin "use client"): `ICONS`
  (clave kebab → componente, etiqueta y palabras en español para buscar), `AppIcon` (ícono suelto), `Ico` (en línea con
  texto; sin valor ni `fallback` no pinta nada) y `emojiFor()` (texto plano: notificaciones, Google Calendar).
- Los campos `emoji` de la base (materia, tarea, tema, clase, evento, proyecto) guardan la **clave** del ícono. Emojis
  antiguos se traducen al vuelo con el mapa `EMOJI` (o caen al `fallback`): no hace falta migrar datos.
- Elegir ícono: `IconPicker` (`components/blocks/icon-picker.tsx`), también dentro de `TitleRow` (`emojiPlaceholder` =
  clave de respaldo). No volver a poner emojis en la interfaz; para uno nuevo, agregarlo al catálogo.
- Excepciones a propósito: los símbolos del complemento Tasks en las notas (📅 ⏳ ✅ 🔺…), que son formato de Obsidian.
  En el lector, los avisos (callouts) se marcan `⟦clave⟧` al preprocesar y `strong`/`em` los pintan con `AppIcon`.

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
  components/projects/      ProjectsView, ProjectEditor (+Host), QuickTasks, VaultTaskList, ProjectNotes
  components/notes/         NotePanel (global), NoteLink, NoteInline, NoteEditor, Markdown, VaultProvider, OpenObsidian
  lib/vault.ts              disco de la bóveda (server-only); lib/notes.ts utilidades sin disco; lib/actions/notes.ts
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
