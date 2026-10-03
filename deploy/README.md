# Despliegue con Docker

Esquema: **proxy con HTTPS** (nginx, Caddy, Cloudflare…) → **app** en Docker (`127.0.0.1:3100`) →
**PostgreSQL** en Docker. Opcional: **AFFiNE** autoalojado en el mismo dominio para los apuntes.

En los ejemplos, la app vive en `organizador.midominio.com` y AFFiNE en `notas.midominio.com`.

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
- `NEXT_PUBLIC_AFFINE_ORIGIN` y `NEXT_PUBLIC_AFFINE_WORKSPACE`: tu AFFiNE y el ID del espacio
  (lo que va después de `/workspace/` en su URL).
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
3. Si usas AFFiNE propio, entra una vez en él desde el mismo navegador para que el panel embebido tenga sesión.

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

## Problemas comunes

- **502 Bad Gateway**: la app no está arriba → `docker compose --env-file .env.production logs app`.
- **«Invalid origin» al iniciar sesión**: `BETTER_AUTH_URL` no coincide con la URL del navegador.
- **Guardar falla (403)**: falta `proxy_set_header Host $host;` en el proxy.
- **El panel de AFFiNE pide iniciar sesión**: AFFiNE debe estar en el mismo dominio que la app y tener sesión
  abierta en ese navegador.
- **`Falta POSTGRES_PASSWORD`**: olvidaste `--env-file .env.production`.
