# Meta (Facebook / Instagram)

**Status:** Credentials Pending

**Purpose:** Publish posts from the AIRE `/social` composer directly to your Facebook Page and Instagram Business account via the Meta Graph API.

---

## Credentials needed

| Env var | What it is | Where to get it |
|---|---|---|
| `META_APP_ID` | Your Meta App ID | developers.facebook.com → your app → App ID |
| `META_APP_SECRET` | Your Meta App Secret | developers.facebook.com → your app → App Secret |
| `META_PAGE_ACCESS_TOKEN` | Long-lived Page Access Token | Meta Business Suite → Settings → Advanced → Page Access Tokens. Generate a long-lived token via Graph API Explorer. |
| `META_PAGE_ID` | Your Facebook Page numeric ID | Facebook Page → About → Page transparency → Page ID |
| `META_IG_BUSINESS_ID` | Your Instagram Business Account ID | Meta for Developers → Instagram → your IG account → Business Account ID |

**Storage:** DB via Settings page → `Setting` table. Config helper: `getMetaConfig()` in `src/lib/settings.ts`.

---

## API base URL

```
https://graph.facebook.com/v19.0
```

## Auth scheme

Page Access Token sent as `?access_token=<META_PAGE_ACCESS_TOKEN>` query param or `Authorization: Bearer` header. The Page Access Token is long-lived (never expires if generated correctly from a System User). Do not confuse with short-lived user tokens.

## Rate limits

- 200 calls per hour per access token (standard tier)
- Content publishing: 25 posts per 24 hours on Instagram
- Facebook Page posts: no hard per-day limit, but aggressive posting triggers spam detection

---

## Key endpoints used

| Method | Path | Purpose |
|---|---|---|
| POST | `/{page-id}/feed` | Publish to Facebook Page |
| POST | `/{ig-id}/media` | Create IG media container |
| POST | `/{ig-id}/media_publish` | Publish IG media container |
| GET | `/{page-id}?fields=name,fan_count` | Verify Page token |

AIRE route: `src/app/api/social/route.ts`

---

## Webhooks

Not currently wired. Meta can send webhooks on new comments/messages — future feature for notification center.

---

## Gotchas / quirks

- **Two-step Instagram publish:** You must first create a media container (`/media`), then publish it (`/media_publish`) in a second API call. A single POST is not enough.
- **Instagram requires a public image URL.** You cannot upload a file directly — the image must be hosted at a publicly accessible HTTPS URL. If generating images locally, they must be hosted (e.g. Vercel public URL, S3) before publishing.
- **Long-lived tokens:** Short-lived user tokens expire in 60 days. For production, generate a System User token in Meta Business Manager — it never expires.
- **Page token ≠ User token:** The Page Access Token is scoped to the Page, not your personal account. Always use the Page token for Page/IG actions.
- App must have `pages_manage_posts` and `instagram_content_publish` permissions approved in App Review for production use.

---

## Doc links

- [Meta Graph API — Pages](https://developers.facebook.com/docs/graph-api/reference/page/feed/)
- [Instagram Content Publishing API](https://developers.facebook.com/docs/instagram-api/guides/content-publishing)
- [Long-lived Page Access Tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived)

---

## Implementation notes

- Lib stub: `src/lib/meta.ts` (TODO — see file)
- API route: `src/app/api/social/route.ts`
- Config helper: `getMetaConfig()` in `src/lib/settings.ts`
- Settings UI: Settings page → Meta section

---

## Test command

```bash
# Verify the route loads (will return error if no credentials set)
curl -s http://localhost:3000/api/social | jq .
```
