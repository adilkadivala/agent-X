# x-agent gateway

Thin user-facing API: X OAuth, session, and connected accounts.
The dashboard proxies these routes so the browser stays on `localhost:3000`.

```bash
bun install
bun dev
```

Required in `.env`:

- `Consumer_Key` / `Secret_Key` (or `X_API_KEY` / `X_API_SECRET`)
- `X_OAUTH_CALLBACK_URL=http://localhost:3000/api/auth/x/callback`

In the X developer portal, add that exact callback URL under User authentication settings.

This project’s current X app is a **desktop** client (`oauth_callback` must be `oob`). In that case Connect X verifies the Access Token in `.env` and signs you in as that user (currently used for local development). Switch the app type to a web app if you want the X consent screen for other accounts.
