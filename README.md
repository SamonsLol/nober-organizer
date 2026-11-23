# Nober Organizer

**Organizador académico personal y de código abierto** para estudiantes de colegio: materias con horario,
tareas, calendario, calificaciones por períodos, temas, recursos y apuntes en [Obsidian](https://obsidian.md),
todo en un solo lugar. Interfaz en español (formato es-CO), modo oscuro y claro, y pensada también para móvil.

*Open-source personal school planner (courses, tasks, calendar, grades, notes in Obsidian). The UI is in Spanish;
contributions to translate it are welcome.*

![Inicio](docs/screenshots/inicio.png)

| Tareas (tablero) | Calendario (semana) |
| --- | --- |
| ![Tareas](docs/screenshots/tareas.png) | ![Calendario](docs/screenshots/calendario.png) |
| **Calificaciones** | **Materia** |
| ![Calificaciones](docs/screenshots/calificaciones.png) | ![Materia](docs/screenshots/materia.png) |

## Qué hace

- **Inicio**: lo más urgente, clases de hoy, tareas de la semana, entregas y evaluaciones próximas, promedio del
  período, temporizador de foco, metas y calendario del mes. Las cuentas nuevas tienen una guía de primeros pasos.
- **Materias**: color, portada, profesor, aula y **horario semanal** (el calendario genera las clases a partir de él).
  Cada materia tiene resumen, clases, temas (tablero por nivel de preparación), tareas, apuntes, recursos y notas.
- **Tareas**: lista, tablero (arrastrar y soltar) y por fecha; pasos, enlaces, etiquetas, prioridad y nota.
- **Calendario**: mes, semana y agenda con clases, entregas, exámenes, eventos y **festivos** (quitan las clases).
- **Proyectos**: proyectos personales o de trabajo (estado, fecha objetivo, progreso) con sus tareas y una carpeta de
  notas en Obsidian; las casillas `- [ ]` de esas notas (formato del complemento Tasks) se ven y se marcan desde la app.
  También «Otras actividades pendientes» para lo que no es de ninguna materia ni proyecto.
- **Calificaciones**: escala configurable (1.0–5.0 por defecto, aprueba con 3.0), períodos con peso, notas «sobre»
  otra escala (85/100 → 4,3), nota necesaria para aprobar y simulador.
- **Apuntes en Obsidian**: cada clase tiene su nota `.md` en tu bóveda (con plantilla y propiedades). Se lee y
  edita en un panel dentro de la app (fórmulas, tareas que se marcan con un clic, `[[enlaces]]`), y un clic la abre
  en la app de Obsidian. El contenido vive en tu bóveda; tu sincronización de Obsidian lo lleva a tus dispositivos.
- **Cuentas**: correo y contraseña (y Google, opcional) con [Better Auth](https://better-auth.com). Cada usuario ve
  solo lo suyo; el registro se puede cerrar después de crear tu cuenta.

## Instalar en tu servidor (Docker)

Requisitos: un servidor con Docker y Docker Compose, y un dominio con HTTPS (nginx, Caddy, Cloudflare…).

```bash
git clone https://github.com/SamonsLol/nober-organizer.git
cd nober-organizer
cp .env.production.example .env.production   # completar: contraseñas, dominio, Obsidian
docker compose --env-file .env.production up -d --build
curl -s http://127.0.0.1:3100/api/health     # {"ok":true,"db":true}
```

Luego publica `127.0.0.1:3100` con tu proxy (plantilla de nginx en [`deploy/nginx/nober.conf`](deploy/nginx/nober.conf)).
Guía completa —DNS, nginx, primer uso, actualizar y copias de seguridad— en [`deploy/README.md`](deploy/README.md).

### Obsidian

La app trabaja sobre una **copia de tu bóveda en el servidor** (una carpeta con `.obsidian/`) que se mantiene al día con
la sincronización que ya uses: [Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync) (con un Obsidian
siempre abierto en el servidor, p. ej. la imagen `linuxserver/obsidian`), Obsidian Sync con el cliente de escritorio,
Syncthing, git… La app solo lee y escribe archivos `.md`. Variables:

| Variable | Qué es |
| --- | --- |
| `OBSIDIAN_VAULT_DIR` | Ruta de la bóveda en el servidor (se monta en el contenedor; el uid 1000 debe poder escribir) |
| `OBSIDIAN_VAULT_NAME` | Nombre de la bóveda en Obsidian, para los enlaces `obsidian://` (por defecto, el de la carpeta) |
| `OBSIDIAN_NOTES_ROOT` | Carpeta de los apuntes: `<raíz>/<materia>/<fecha> <clase>.md` (por defecto `Apuntes`) |
| `OBSIDIAN_PROJECTS_ROOT` | Carpeta de los proyectos: `<raíz>/<proyecto>/` (por defecto `Proyectos`) |
| `OBSIDIAN_ALLOWED_EMAILS` | Cuentas que pueden usar la bóveda (vacío = todas las de la instancia) |
| `OBSIDIAN_WEB_URL` | Opcional: Obsidian en el navegador, para el botón «Abrir Obsidian» |

Sin bóveda, la app funciona igual pero sin crear ni abrir apuntes.

### IA (opcional)

Con `AI_API_KEY` aparecen **Resumir**, **Preguntas de repaso** y **Convertir en tareas** en el panel de cada apunte, y
**Plan de la semana** en Inicio, Tareas y ⌘K. Usa cualquier API compatible con OpenAI que admita respuestas con esquema
JSON; por defecto [Groq](https://console.groq.com) con `openai/gpt-oss-120b`, que tiene capa gratuita. La IA solo
propone: nada se escribe en tus notas ni se crean tareas sin confirmarlo. El contenido del apunte se envía al proveedor.

| Variable | Qué es |
| --- | --- |
| `AI_API_KEY` | Clave del proveedor (vacía = sin IA) |
| `AI_BASE_URL` | URL base compatible con OpenAI (por defecto `https://api.groq.com/openai/v1`) |
| `AI_MODEL` | Modelo (por defecto `openai/gpt-oss-120b`) |

## Desarrollo

Requisitos: Node 22 o superior y Docker (para PostgreSQL).

```bash
npm install
cp .env.example .env        # generar BETTER_AUTH_SECRET (el comando está en el archivo)
npm run db:up               # PostgreSQL 17 en localhost:5433
npm run db:migrate
npm run db:seed             # usuario demo@example.com / nober-demo-2026 con datos ficticios
npm run dev                 # http://localhost:3000
```

Sin `DATABASE_URL` la app arranca en **modo demostración** (datos ficticios en memoria, sin inicio de sesión):
útil para trabajar solo en la interfaz.

Otros comandos: `npm run lint` (TypeScript), `npm run build`, `npm run db:studio` (Prisma Studio).

### Stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS v4 · Prisma 7 + PostgreSQL ·
Better Auth · date-fns · lucide-react. Sin librería de componentes: el sistema de diseño es propio
(`src/app/globals.css` y `src/components/blocks`).

```
src/
  app/(app)/          pantallas (inicio, calendar, tasks, courses, notes, grades, resources, settings)
  app/api/            auth y health
  components/         vistas por pantalla, editores (diálogos) y bloques de diseño
  lib/actions/        Server Actions (validan con zod y filtran siempre por usuario)
  lib/data/           capa de datos: lee todo lo del usuario y deriva lo que pide cada pantalla
  lib/vault.ts        acceso a la bóveda de Obsidian (solo .md, nunca fuera de la bóveda)
prisma/               esquema, migraciones y seed
deploy/               plantilla de nginx y guía de despliegue
```

## Integraciones

- **Obsidian**: «Crear apunte» / «Preparar» crea la nota de la clase con una plantilla (propiedades `materia`,
  `fecha`, `tema`, etiquetas `clase` y la materia). Si la mueves o renombras en Obsidian, la app la vuelve a encontrar.
  Edición con autoguardado que nunca pisa un cambio hecho en Obsidian mientras tanto: pregunta cuál conservar.
- **Google Calendar**: un calendario propio con clases recurrentes (sin festivos), tareas, evaluaciones y eventos,
  sin duplicados. Permiso mínimo: solo calendarios creados por la app.
- **Archivos**: sube PDF, documentos, imágenes, audio o video a tareas y recursos (solo su dueño puede verlos).
- **PWA**: instálala en el celular desde el navegador («Agregar a la pantalla de inicio»).

Configuración en [`deploy/README.md`](deploy/README.md#integraciones-opcionales).

## Hoja de ruta

- Recordatorios (notificaciones push) de entregas y exámenes.
- Leer otros calendarios de Google en solo lectura.
- Exportar e importar datos.
- Traducción de la interfaz.

## Contribuir

¡Bienvenidas las contribuciones! Lee [`CONTRIBUTING.md`](CONTRIBUTING.md). Para errores de seguridad, no abras un
issue público: escribe a la persona que mantiene el proyecto.

## Licencia

[MIT](LICENSE). El diseño y el código son propios; la organización del contenido se inspira en plantillas
académicas de Notion, sin relación con sus autores.
