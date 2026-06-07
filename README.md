# SurfSD

SurfSD is a simple full-stack MVP for a San Diego surf community app. Surfers can browse a local spot map, create an account, and post current condition reports with a short description, wave height, optional rating, and optional image.

## Stack

- Native Node.js HTTP server
- Native Node.js SQLite database
- Server-rendered HTML templates
- Signed HTTP-only session cookies
- Leaflet map via CDN
- Node's built-in test runner

The current environment does not include `npm`, so this MVP avoids external packages. Passwords are salted and hashed with Node's built-in `crypto.scrypt`, a strong password hashing KDF. If package installation becomes available later, the auth helper can be swapped to bcrypt or argon2.

## Run

```bash
cp .env.example .env
node src/server.js
```

Then open `http://localhost:3000`.

## Test

```bash
node --test
```

## Main Pages

- `/map`: interactive San Diego surf spot map with placeholder stats.
- `/about`: overview of the SurfSD MVP.
- `/account`: signup, login, logout, and account view.
- `/spots/swamis`: example surf spot page.
- `/spots/:slug/reports/new`: protected create-report form.

## Data Models

- `users`: `id`, `name`, `email`, `passwordHash`, `createdAt`
- `surf_spots`: `id`, `name`, `slug`, `latitude`, `longitude`, `description`, `imageUrl`, `difficulty`, `createdAt`
- `reports`: `id`, `surfSpotId`, `userId`, `imageUrl`, `description`, `waveHeight`, `rating`, `createdAt`
