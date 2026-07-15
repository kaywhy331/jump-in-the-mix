# Start Jump in the Mix locally

The easiest path uses Docker. You do **not** need to install Node.js, PostgreSQL, Prisma, or any external API keys.

## Before you start

1. Install **Docker Desktop**.
2. Open Docker Desktop and wait until it says the engine is running.
3. Extract this project folder to a normal local folder.

## Start the app

### Windows

Double-click:

```text
start-local.cmd
```

### macOS

Double-click:

```text
start-local.command
```

The first time, macOS may require **right-click → Open**. If macOS reports a permission problem, run this once in Terminal:

```bash
chmod +x start-local.command start-local.sh
```

### Linux

From the project folder:

```bash
./start-local.sh
```

## What happens automatically

The launcher will:

1. Check that Docker is installed and running.
2. Create a local `.env` file.
3. Generate secure local secrets.
4. Build the web app and background worker.
5. Create and seed PostgreSQL.
6. Wait for a real application/database health check.
7. Open the sign-in page in your browser.

The first run can take several minutes because Docker downloads the required images and packages. Later starts are much faster.

## Explore without setup

On the sign-in page, click **Open the guided demo**.

Fallback credentials:

```text
Email:    demo@jumpinthemix.local
Password: JumpInTheMix123!
```

The demo includes sample contacts, Important Dates, an active Mix, and generated Jumps. Changes remain only on your computer.

## Stop or reset

Windows:

```text
stop-local.cmd
reset-local.cmd
```

macOS (double-click):

```text
stop-local.command
reset-local.command
```

Linux terminal:

```bash
./stop-local.sh
./reset-local.sh
```

Stopping preserves local data. Resetting permanently removes the local database and restores the clean demo.

## Something did not start

Windows: double-click `doctor.cmd`.

macOS: double-click `doctor.command`.

Linux terminal:

```bash
./doctor.sh
```

The most common fix is to open Docker Desktop and wait for it to finish starting. If port 3000 is occupied, change `APP_PORT=3000` in `.env`, then start again.


## Windows Docker engine error

If Windows reports `dockerDesktopLinuxEngine` or `The system cannot find the file specified`, open [WINDOWS_DOCKER_FIX.md](WINDOWS_DOCKER_FIX.md).
