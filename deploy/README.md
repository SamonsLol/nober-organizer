# Despliegue con Docker

Esquema: **proxy con HTTPS** (nginx, Caddy, Cloudflare…) → **app** en Docker (`127.0.0.1:3100`) →
**PostgreSQL** en Docker. Opcional: una **bóveda de Obsidian** en el servidor para los apuntes.

En los ejemplos, la app vive en `organizador.midominio.com`.

## 1. DNS

Crea un registro **A** `organizador` → IP de tu servidor. Con Cloudflare, activa el proxy (nube naranja) y usa
SSL **Full** o **Full (strict)**.

## 2. Código y variables

```bash
git clone https://github.com/SamonsLol/nober-organizer.git ~/apps/nober
cd ~/apps/nober
cp .env.production.example .env.production
nano .env.production
```

Valores obligatorios:

```bash
openssl rand -base64 32 | tr -d '/+='   # → POSTGRES_PASSWORD
openssl rand -base64 32                 # → BETTER_AUTH_SECRET
```

- `BETTER_AUTH_URL`: la URL pública exacta, con `https://`.
- `TZ`: zona horaria del colegio (por defecto `America/Bogota`).
- `OBSIDIAN_VAULT_DIR` y compañía: tu bóveda de Obsidian (ver «Obsidian» más abajo).
- Si el puerto 3100 está ocupado (`ss -ltnp | grep 3100`), cambia `APP_PORT`.

## 3. Levantar

```bash
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps        # migrate: Exited (0) · app y db: healthy
curl -s http://127.0.0.1:3100/api/health            # {"ok":true,"db":true}
```

El servicio `migrate` aplica las migraciones pendientes en cada arranque y termina; la app solo arranca si salió
bien. Usa siempre `--env-file .env.production`: Compose toma de ahí la contraseña de la base de datos.

## 4. Proxy (nginx)

```bash
sudo cp deploy/nginx/nober.conf /etc/nginx/sites-available/nober
sudo nano /etc/nginx/sites-available/nober     # dominio, certificado y puerto
sudo ln -s /etc/nginx/sites-available/nober /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

- **Certificado**: con Cloudflare, un *Origin Certificate* (SSL/TLS → Origin Server) para `*.midominio.com`;
  sin Cloudflare, `sudo certbot --nginx -d organizador.midominio.com`.
- Con **Caddy** basta: `organizador.midominio.com { reverse_proxy 127.0.0.1:3100 }`.

## 5. Primer uso

1. Abre `https://organizador.midominio.com` → «Crear cuenta».
2. Cierra el registro: `AUTH_DISABLE_SIGNUP=true` en `.env.production` y
   `docker compose --env-file .env.production up -d` (no hace falta recompilar).
3. Si configuraste Obsidian, pon tu correo en `OBSIDIAN_ALLOWED_EMAILS`.

## Integraciones (opcionales)

### Obsidian: apuntes de clase

La app necesita la bóveda **en el mismo servidor**, al día con tus dispositivos. Lo más simple:

1. Sincroniza tu bóveda con [Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync) (CouchDB en Docker).
2. Deja un Obsidian abierto en el servidor con esa bóveda y LiveSync (p. ej. la imagen `lscr.io/linuxserver/obsidian`,
   con la bóveda en una carpeta del servidor). Él baja lo que escribes en el celular y sube lo que crea la app.
3. En `.env.production`: `OBSIDIAN_VAULT_DIR=/ruta/a/la/bóveda` (la carpeta que contiene `.obsidian/`),
   `OBSIDIAN_VAULT_NAME`, `OBSIDIAN_NOTES_ROOT` y `OBSIDIAN_ALLOWED_EMAILS=tu@correo`.
   El contenedor escribe como uid 1000: la carpeta debe ser de ese usuario (`chown -R 1000:1000`).
4. `docker compose --env-file .env.production up -d` (no hace falta recompilar).

Cuidado con complementos que mueven notas por etiqueta (p. ej. *Auto Note Mover*): las notas de clase llevan las
etiquetas `clase` y la de la materia; no les asignes una regla que las saque de su carpeta.

### Google Calendar (y entrar con Google)

1. En [Google Cloud Console](https://console.cloud.google.com/) crea un proyecto y activa **Google Calendar API**.
2. *APIs y servicios → Pantalla de consentimiento de OAuth*: tipo **Externo**, nombre de la app y tu correo.
   En *Permisos* añade `.../auth/calendar.app.created` (escribir solo en el calendario propio de la app) y
   `.../auth/calendar.readonly` (leer tus demás calendarios). **Publica la app** («En producción»): en modo *Prueba*
   Google invalida el permiso cada 7 días. Para uso personal no hace falta verificarla; al conectar, Google avisa que
   no está verificada → *Avanzado* → *Ir a …*.
3. *Credenciales → Crear credenciales → ID de cliente de OAuth*, tipo **Aplicación web**:
   - Orígenes autorizados: `https://organizador.midominio.com`
   - URI de redirección: `https://organizador.midominio.com/api/auth/callback/google`
4. Copia el ID y el secreto en `.env.production` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) y reinicia:
   `docker compose --env-file .env.production up -d`.

Con eso aparece «Continuar con Google» en el inicio de sesión (solo para cuentas existentes si el registro está cerrado)
y, en **Ajustes → Integraciones**, «Conectar Google Calendar». La app crea un calendario propio y le envía clases
(recurrentes, sin festivos), tareas pendientes, evaluaciones y eventos; y muestra en Calendario e Inicio los eventos de
los calendarios de Google que elijas (solo lectura, 30 días atrás a 4 meses adelante). Todo se actualiza al pulsar
«Sincronizar»/«Actualizar» y solo al abrir Inicio o Calendario (como mucho cada 15 min).

## Actualizar

```bash
cd ~/apps/nober
git pull
docker compose --env-file .env.production up -d --build
docker image prune -f
```

## Copias de seguridad

```bash
mkdir -p ~/backups
# Copia (prográmala con cron, p. ej. todos los días a las 3:00)
docker compose --env-file .env.production exec -T db \
  pg_dump -U nober -d nober --format=custom > ~/backups/nober-$(date +%F).dump

# Restaurar
docker compose --env-file .env.production exec -T db \
  pg_restore -U nober -d nober --clean --if-exists < ~/backups/nober-AAAA-MM-DD.dump
```

(Si cambiaste `POSTGRES_USER` o `POSTGRES_DB`, usa esos nombres.)

Los archivos subidos viven en el volumen `nober_uploads` (no en la base de datos). Cópialos también:

```bash
docker run --rm -v nober_uploads:/data -v ~/backups:/backup alpine \
  tar -czf /backup/nober-archivos-$(date +%F).tar.gz -C /data .
```


### Respaldo automático

`deploy/backup.sh` guarda la base (`pg_dump`) y los archivos subidos, comprimidos, en `~/backups/nober` y conserva los
últimos 14 de cada uno (`BACKUP_DIR`, `BACKUP_KEEP`). Para programarlo cada noche (hora del servidor):

```bash
crontab -e
30 3 * * * /ruta/a/nober/deploy/backup.sh >> ~/backups/nober/backup.log 2>&1
```

Restaurar la base (con la app detenida): `gunzip -c nober-db-….sql.gz | docker compose --env-file .env.production exec -T db psql -U <usuario> <base>`.

## Problemas comunes

- **502 Bad Gateway**: la app no está arriba → `docker compose --env-file .env.production logs app`.
- **«Invalid origin» al iniciar sesión**: `BETTER_AUTH_URL` no coincide con la URL del navegador.
- **Guardar falla (403)**: falta `proxy_set_header Host $host;` en el proxy.
- **«No hay bóveda de Obsidian configurada»**: falta `OBSIDIAN_VAULT_DIR` en `.env.production`.
- **Los apuntes no llegan al celular**: el Obsidian del servidor (el que tiene LiveSync) debe estar abierto.
- **`EACCES` al crear un apunte**: la bóveda no es del uid 1000 → `sudo chown -R 1000:1000 <bóveda>`.
- **`Falta POSTGRES_PASSWORD`**: olvidaste `--env-file .env.production`.
