# Windows Docker startup fix

## Error this guide addresses

```text
open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified
```

This means the Docker command is installed, but Docker Desktop's Linux engine is not running yet.

## Fastest fix

1. Open **Docker Desktop** from the Windows Start menu.
2. Wait until Docker Desktop reports that the engine is running.
3. Double-click `start-local.cmd` again.

The updated launcher will now attempt to start Docker Desktop automatically and wait for its engine instead of displaying a raw PowerShell error.

## If Docker Desktop will not start

Open **PowerShell as Administrator** and run:

```powershell
wsl --update
wsl --shutdown
```

Then restart Docker Desktop.

In Docker Desktop:

1. Open **Settings > General**.
2. Enable **Use the WSL 2 based engine**.
3. Select **Apply & restart**.
4. Make sure Docker is using **Linux containers**.

Run this diagnostic from the project folder:

```text
doctor.cmd
```

## If WSL is not installed

Open PowerShell as Administrator:

```powershell
wsl --install
```

Restart Windows after installation, open Docker Desktop, and run `start-local.cmd` again.

## Verify manually

```powershell
docker desktop status
docker info
```

`docker info` must finish without a connection error before the application can start.
