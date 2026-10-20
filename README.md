# Grading PnL

Track every Pokémon card you've sent for grading: what you paid, what grading cost, and what it's worth now.
Pick a card from the type-ahead search and the server fills in its photo and current market price for
the grading company and grade you choose.

- Free accounts (email + password), each with its own private card list
- Premium accounts get the **Exit** column (sale price) and realized vs unrealized PnL
- Prices and photos come from PriceCharting

## Deploying on Vercel

1. Import this repo at https://vercel.com/new (defaults are fine).
2. In the project's **Storage** tab, add **Upstash for Redis** (free plan) and connect it to the project.
   This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
3. In **Settings → Environment Variables**, add `OWNER_EMAIL` with the email you'll sign up with.
   That account is premium automatically, and gets the cards in `data/seed-cards.json` the first time it signs up.
   Optionally add `PREMIUM_EMAILS` (comma-separated) to give other accounts premium.
4. Redeploy so the new variables take effect.

## Running locally

```
npm install
npm run dev
```

Without the Redis variables the site keeps data in memory, which resets on restart.
