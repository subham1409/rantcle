# Rantcle — PostgreSQL version

Firebase is completely removed. The browser talks to a small Express server (`server.js`), and only the server talks to PostgreSQL.

```
rantcle-pg/
├── server.js            API + serves the website
├── config.js            loads settings (Windows env vars or the private config file)
├── db.js                PostgreSQL connection pool
├── package.json
├── config/
│   ├── rantcle.config.example.json   placeholder template
│   └── rantcle.config.json           YOUR private settings (created by setup, never in Git)
├── scripts/setup.js     one-time setup wizard (npm run setup)
├── db/
│   ├── 00_create_database.sql   run 1st
│   ├── schema.sql               run 2nd
│   └── 01_app_user.sql          run 3rd (least-privilege DB user)
├── uploads/             vehicle photos are saved here
└── public/              your website (index/find/myvehicle/admin .html, css/, js/)
    └── js/api.js        NEW — replaces firebase.js
```

## Setup (step by step)

**1. Create the database (pgAdmin)**
Open pgAdmin → Servers → your server → Databases → right-click **postgres** → **Query Tool**. Paste `db/00_create_database.sql`, press **F5**.

**2. Create the tables**
Refresh Databases, right-click **rantcle** → **Query Tool**. Paste all of `db/schema.sql`, press **F5**. It is safe to run again.
Verify: expand rantcle → Schemas → public → Tables. You should see `owners`, `vehicles`, `bookings`.

**3. Create the app user**
Still in the rantcle Query Tool, open `db/01_app_user.sql`, change `CHANGE_ME_STRONG_PASSWORD`, run it.

**4. Install the backend packages** (needs Node.js 18+). In PowerShell:
```powershell
cd D:\rantcle
npm install
```

**5. Run the one-time setup**
```powershell
npm run setup
```
It asks for:
- the PostgreSQL host, port, database name, user and password (the app user from step 3),
- an admin username and password for `/admin.html` (typed hidden, entered twice).

It then writes `config/rantcle.config.json`. In that file:
- the admin password is stored **only as a bcrypt hash**,
- a random 96-character JWT secret is generated automatically and saved, so admin logins keep working after restarts,
- the file is private: it is in `.gitignore`, and on Windows setup restricts it to your user account.

Setup also tests the database connection and tells you if something is wrong.

**6. Start**
```powershell
npm start
```
Open http://localhost:3000 (site) and http://localhost:3000/admin.html (admin login). From now on you only need `npm start`; setup is not repeated.

### Later changes
- **Change a setting or the admin password:** run `npm run setup` again. Press Enter to keep any value shown in brackets (including the stored passwords). Your JWT secret is kept, so nobody gets logged out.
- **Log everyone out / rotate the secret:** `npm run setup -- --rotate-secret`, then restart the server.
- **Forgot the admin password:** run `npm run setup` and type a new one.

### Optional: Windows environment variables instead of the config file
Environment variables override the file, which is useful on a server. Names: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`, `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `JWT_SECRET` (32+ characters), `PORT`, `TRUST_PROXY`. Example for the current PowerShell window (use single quotes around the hash because it contains `$`):
```powershell
$env:ADMIN_USERNAME = 'admin'
$env:ADMIN_PASSWORD_HASH = '<bcrypt hash>'
$env:JWT_SECRET = '<long random string>'
npm start
```
To make them permanent, use `setx NAME "value"` (then open a new PowerShell window) or Windows Settings -> "Edit environment variables for your account".

### Troubleshooting
- **"Rantcle is not configured yet"**: run `npm run setup` (the message lists what is missing).
- **"password authentication failed"**: the database password in setup does not match the one in `db/01_app_user.sql`. Run `npm run setup` again.
- **Setup says the connection test FAILED**: check PostgreSQL is running and that you ran `schema.sql`; the settings are saved, so fix the problem and run `npm start`.

Note: the database password has to be stored readable (the app needs it to connect), unlike the admin password. Keep `config/rantcle.config.json` private and never share or commit it.

## What changed from the Firebase version

- `public/js/firebase.js` → `public/js/api.js` (same function names: `addVehicle`, `listenVehicles`, `addBooking`, …).
- Firebase `<script>` tags removed from every HTML page; stray `7` after the script tag in `index.html` removed.
- `seed.html` deleted (it only created demo data).
- Admin panel now needs a login. It refreshes every 10 s (REST has no live push). Customers' pages load once per visit.
- Booking price is calculated on the server from the vehicle's hourly price; the browser can no longer set it.
- A booked vehicle that is switched to "Not available" can no longer be booked.
- Photos are saved as files in `uploads/`, not as base64 inside the database.
- Deleting a vehicle keeps its bookings (the booking keeps the vehicle name).
- The public API never returns owner phone numbers or vehicle numbers; only the admin API does.

## API

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/vehicles` | public | list vehicles |
| POST | `/api/vehicles` | public | list a vehicle |
| POST | `/api/bookings` | public | create a booking |
| POST | `/api/admin/login` | — | get a token |
| GET | `/api/admin/vehicles`, `/api/admin/bookings` | admin | full lists |
| PATCH | `/api/admin/vehicles/:id` | admin | price / availability |
| DELETE | `/api/admin/vehicles/:id`, `/api/admin/bookings/:id` | admin | delete |
| PATCH | `/api/admin/bookings/:id/status` | admin | Pending / Accepted / Rejected / Completed |

All responses are `{ "ok": true, "data": ... }` or `{ "ok": false, "error": "message" }`.

```bash
curl -X POST http://localhost:3000/api/bookings -H "Content-Type: application/json" \
  -d '{"customerName":"Asha","phone":"9876543210","vehicleId":"1","pickup":"Satellite","duration":4}'
# {"ok":true,"data":{"id":"1","vehicleId":"1","vehicleName":"Classic 350",...,"duration":4,"totalAmount":240,"status":"Pending",...}}
```

## Testing checklist

1. `http://localhost:3000/api/health` returns `{"ok":true,"data":{"status":"up"}}`.
2. In pgAdmin, the three tables exist.
3. List a vehicle on **My Vehicle** → appears on Home and Find; right-click `vehicles` → View/Edit Data confirms the row.
4. Refresh the page and restart the server (`Ctrl+C`, `npm start`): the vehicle is still there.
5. Book it on **Find** → row in `bookings`, `total_amount` = hours × price.
6. Open `/admin.html`: wrong password is rejected; correct one shows data. Accept / Reject / Done / Delete a booking; edit price and availability; export CSV.
7. Invalid input: negative price, 3-digit phone, missing name → red error message.
8. Duplicate: list a second vehicle with the same vehicle number → "already listed".
9. Without logging in, `curl http://localhost:3000/api/admin/vehicles` returns 401.

## Deploying

Use any Node host (Render, Railway, a VPS). Set the environment variables listed above in the host's dashboard (the private config file is not part of the repo), set `TRUST_PROXY=1`, and use a hosted PostgreSQL (set `DB_SSL=true` or `DATABASE_URL`). Run `schema.sql` on the hosted DB. **Important:** `uploads/` must be on persistent storage (a Render/Railway disk or VPS folder); on hosts with a temporary filesystem, photos disappear on redeploy. Put HTTPS in front of the site (the hosts above do this for you). Don't expose pgAdmin or port 5432 publicly.

## Notes / limits

- The server holds one admin account (from the private config); there are no customer or owner logins, same as before. Anyone can list a vehicle, so consider reviewing new listings in the admin panel.
- Owner identity is the phone number; the first name used with a phone number is kept.
- If you see CSP errors in the browser console after adding new external scripts or images, adjust the `helmet` block in `server.js`.
