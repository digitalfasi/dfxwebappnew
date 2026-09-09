# Test deployment (dfxtest.vercel.app)

The `web-testing` repo feeds the Vercel project `dfxtest`. This is the QA target
only — the production web app and its Render backend are deployed from the main
repos and are never touched from here.

## Wiring

| Piece | Value |
|---|---|
| Repo | `digitalfasi/web-testing` |
| Production branch | `main` |
| Vercel project | `dfxtest` |
| Backend | E2E node, `https://164-52-198-31.sslip.io/api/v1` |

Both build-time variables must exist on the Vercel project:

- `NEXT_PUBLIC_API_URL` — the E2E API base, including the `/api/v1` suffix.
  Without it the bundle falls back to `http://localhost:8000/api/v1`, which
  resolves to the visitor's own machine, so every request fails.
- `NEXT_PUBLIC_UAT_TENANT_ID` — gates the UAT-only test-customer delete button.

Both are `NEXT_PUBLIC_*`, so they are inlined when the bundle is built. Changing
either one requires a redeploy; reloading the page is not enough.

## Verifying that a deployment actually landed

The site is a single static page, so the app code sits in one hashed chunk. Build
locally, take the emitted name, and ask the live domain for it:

    npx next build
    ls .next/static/chunks/app/          # e.g. page-9dc5f89a3cffb62f.js
    curl -s -o /dev/null -w '%{http_code}\n' \
      https://dfxtest.vercel.app/_next/static/chunks/app/<that-name>

`200` means the running build contains the local code. `404` means the domain is
still serving an older build, whatever the dashboard says.

Do not use the page's `ETag` or `Age` as the signal. The HTML is CDN-cached for
about an hour, so a stale `ETag` proves nothing on its own and a client
`Cache-Control: no-cache` header does not bypass it.

## Functional check for the scheme carve-out

A scheme-covered slice carries no making charge, no wastage and no GST — the
scheme buys gold at pure gold value. On a 44 g 22K piece with 3% making and a
₹40,000 redemption the bill must show two blocks and total **₹7,33,205.80**.

A total of ₹7,39,761.80 with a single `Scheme Redemption` line subtracted at the
end is the pre-carve build: it levies making charge and GST on the covered grams
and then discounts the redemption, which is not the same rule.
