# Nexus hosted deployment guide

This guide covers the full operator runbook for running Nexus as a shared hosted
web application on a Windows machine with Docker Desktop + WSL2.

## Prerequisites

- Windows 10/11 with Docker Desktop installed and WSL2 integration enabled.
- Git for Windows (to clone and pull the repo).
- Node.js 20+ and npm (to build the Nexus static bundle on the host or in CI).
- An Azure app registration for Entra SSO (see [Entra app registration](#entra-app-registration)).

## Directory layout

The worker persists corpus files and job artifacts to a bind-mounted host path.
The default is `C:\deepvault-nexus\data\runtime`.  Create it before first launch:

```powershell
mkdir C:\deepvault-nexus\data\runtime
```

## Initial setup

### 1. Clone the repository

```powershell
cd C:\deepvault-nexus
git clone <repo-url> .
```

### 2. Build the Nexus static bundle

```powershell
npm install
npm run build
```

This writes the static assets to `dist/`.  Caddy mounts this directory read-only
so you never need to rebuild the Caddy image after a frontend update.

### 3. Configure environment variables

```powershell
copy .env.example .env
notepad .env
```

Fill in at minimum:

| Variable | Required | Notes |
|---|---|---|
| `BISHOP_PROVIDER` | Yes | `openai`, `gemini`, or `anthropic` |
| `OPENAI_API_KEY` (or equivalent) | Yes | Key for the chosen provider |
| `ENTRA_TENANT_ID` | Yes (hosted) | Azure Directory ID |
| `ENTRA_CLIENT_ID` | Yes (hosted) | Azure Application ID |
| `WORKER_AUTH_ENABLED` | Yes | Set to `true` in production |
| `OPERATOR_ALLOWLIST` | Recommended | Entra object IDs of operators |
| `NEXUS_RUNTIME_PATH` | Optional | Default: `C:\deepvault-nexus\data\runtime` |

### 4. Start the stack

```powershell
docker compose up -d
```

Both containers start in the background.  Check status:

```powershell
docker compose ps
```

Verify the worker is healthy:

```powershell
curl http://localhost/api/health
```

Expected response: `{"status":"ok","version":"..."}`.

## Updating Nexus

### Update the static bundle only (frontend change)

```powershell
git pull
npm install
npm run build
# Caddy picks up the new files from the bind mount — no restart needed.
```

### Update the worker only (backend change)

```powershell
git pull
docker compose build worker
docker compose restart worker
```

Caddy keeps serving static files while the worker restarts.  The restart
typically takes 3–5 seconds.

### Update everything

```powershell
git pull
npm install
npm run build
docker compose build worker
docker compose up -d --no-deps --build worker
```

## Operator management

### Add an operator

1. Look up the user's Entra object ID in the Azure portal
   (Azure Active Directory → Users → select user → Object ID).
2. Add the UUID to `OPERATOR_ALLOWLIST` in `.env` (comma-separated).
3. Restart the worker to reload the allowlist:

```powershell
docker compose restart worker
```

### Revoke an operator

Remove the UUID from `OPERATOR_ALLOWLIST` in `.env`, then restart the worker.

## Health checks

```powershell
# Worker API health
curl http://localhost/api/health

# Container status
docker compose ps

# Worker logs (last 50 lines)
docker compose logs --tail=50 worker

# Access log (one JSON line per authenticated request)
type C:\deepvault-nexus\data\logs\access-<date>.jsonl
```

## Windows startup automation

To start Nexus automatically when the machine boots:

**Option A — Docker Desktop auto-start (simplest)**

Enable "Start Docker Desktop when you log in" in Docker Desktop settings, then
create a scheduled task to run `docker compose up -d` at login:

```powershell
$action = New-ScheduledTaskAction -Execute "docker" -Argument "compose up -d" -WorkingDirectory "C:\deepvault-nexus"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "Nexus hosted stack" -Action $action -Trigger $trigger -RunLevel Highest
```

**Option B — Windows service via NSSM**

Use [NSSM](https://nssm.cc/) to wrap `docker compose up` as a Windows service
that starts before any user logs in.

## Entra app registration

1. In the Azure portal, go to **Azure Active Directory → App registrations → New registration**.
2. Name: `Nexus` (or your preferred display name).
3. Supported account types: **Accounts in this organizational directory only**.
4. Redirect URI: `http://<your-nexus-hostname>/` (or `http://localhost/` for local testing).
5. After creation, note the **Application (client) ID** and **Directory (tenant) ID**.
6. Under **Expose an API**, set the Application ID URI to `api://<client-id>` and
   add a scope named `Nexus.Access` (admins and users can consent).
7. Under **API permissions**, add `api://<client-id>/Nexus.Access` as a delegated permission and grant admin consent.
8. Set `ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID` in `.env`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `curl http://localhost/api/health` returns 502 | Worker not yet healthy | Wait 15s and retry; check `docker compose logs worker` |
| Browser shows blank page | `dist/` is empty | Run `npm run build` |
| Browser login loop | `ENTRA_CLIENT_ID` mismatch or redirect URI not registered | Verify app registration redirect URIs |
| 403 on job-control endpoints | User not in `OPERATOR_ALLOWLIST` | Add their Entra object ID to `.env` and restart worker |
| Access log not written | `data/logs/` not writable | Verify the bind-mount host path exists and Docker Desktop has file system access |
