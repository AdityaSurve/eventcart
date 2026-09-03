# EventCart — Next Steps / Setup notes

**Done recently:** UI polish, product images, demo payments, Stripe (optional), WebSocket order updates, react-icons, mobile nav.

---

## Stripe test mode (optional free demo gateway)

Demo pay works with **no keys**. Stripe is optional for learning real Checkout.

1. Create a free account at [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register)
2. Ensure you are in **Test mode** (toggle in the Dashboard)
3. Open **Developers → API keys**
4. Copy the **Secret key** (`sk_test_...`)
5. Add to `server/.env` and repo-root `.env` (for Docker):

```env
STRIPE_SECRET_KEY=sk_test_xxxxxxxx
API_PUBLIC_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173
```

6. Restart the API / `docker compose up -d --build server`
7. On the cart page, **Pay with Stripe (test)** appears
8. Use a Stripe test card, e.g. `4242 4242 4242 4242`, any future expiry, any CVC

No real money is charged in test mode.

---

## Optional follow-ups

1. Stricter order status state machine
2. `docker-compose.dev.yml` — infra only while Nest/Vite run on the host
3. Stripe webhook endpoint for production-style confirmation (success URL is enough for local learning)
