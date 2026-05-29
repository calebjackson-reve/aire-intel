# Meta (Facebook + Instagram) Credentials Setup

You need **5 credentials** to fully enable AIRE's Meta integration:

| Setting key | What it is |
|---|---|
| `META_APP_ID` | Your Meta App ID |
| `META_APP_SECRET` | Your Meta App Secret |
| `META_PAGE_ACCESS_TOKEN` | Long-lived token for your Facebook Page (this is the important one) |
| `META_PAGE_ID` | Your Facebook Page's numeric ID |
| `META_IG_BUSINESS_ID` | Your Instagram Business Account ID |

**Once you have all 5, paste them into AIRE Settings → Meta section → Save.** They go into the DB and every Meta-touching feature picks them up.

---

## Step 1 — Create a Meta App (one-time)

If you've never made a Meta dev app for your business:

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Click **My Apps** (top right) → **Create App**
3. Select **Business** as the use case → Next
4. App name: `Rêve Realtors AIRE` (or whatever) → contact email → Next
5. Skip "Add a Business Account" unless you want it linked

After creating, you're in the App Dashboard.

### Get App ID + App Secret

- **App ID**: Top of dashboard, big number (e.g. `1234567890123456`)
- **App Secret**: Settings → Basic → click **Show** next to App Secret → enter your FB password → copy

✓ You now have `META_APP_ID` and `META_APP_SECRET`.

---

## Step 2 — Add required products to the app

In the App Dashboard left sidebar:

1. Click **+ Add Product**
2. Add **Facebook Login for Business** → Set up
3. Add **Instagram** → Set up
4. Add **Marketing API** (optional, for Phase B Custom Audiences)

---

## Step 3 — Connect your Facebook Page + Instagram Business Account

You need a **Facebook Page** (not personal profile) connected to an **Instagram Business Account** (not personal IG).

If you don't have an IG Business Account yet:
1. Open Instagram app → your profile → Settings → Account
2. Switch to **Professional Account** → Business
3. Connect it to your Facebook Page when prompted

If your Page isn't linked to a Meta Business Suite:
1. [business.facebook.com](https://business.facebook.com) → Settings → Pages → Add → Add a Page you own
2. Same place, add your Instagram Business Account

---

## Step 4 — Get your Page Access Token (long-lived)

This is the credential AIRE uses for every Meta call. The default User Access Token expires in 60 days. We need a **System User token** which never expires.

### Method A — Easy (60-day token, must regenerate)

1. Go to [developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer)
2. Top right dropdown — select your app
3. Click **Generate Access Token** → log in → grant these permissions:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `pages_read_user_content`
   - `read_insights`
   - `instagram_basic`
   - `instagram_content_publish`
   - `instagram_manage_insights`
4. After granting, click **User Token** dropdown → select **Page Token** → choose your Page
5. Copy the token shown — this is `META_PAGE_ACCESS_TOKEN`

⚠️ This token expires in **60 days**. Set a calendar reminder, or use Method B.

### Method B — Permanent (System User token, never expires)

1. [business.facebook.com](https://business.facebook.com) → Settings (left sidebar) → Users → System Users
2. Click **Add** → name it `AIRE Server` → role **Admin** → Create
3. Click on the new System User → **Add Assets** → Apps → select your AIRE app → grant **Develop** + **Manage**
4. **Add Assets** again → Pages → select your Page → grant **Manage Page**, **Create Content**, **Moderate**, **Analyze**
5. **Add Assets** again → Instagram Accounts → grant Manage + Content + Analyze
6. Click **Generate New Token** on the System User profile
7. Select your app, then check all the permissions from Step 4 above
8. Generate → copy → this is your permanent `META_PAGE_ACCESS_TOKEN`

✓ Save it somewhere secure. It never expires.

---

## Step 5 — Find your Page ID

The easy way:

1. Open your Facebook Page
2. Click **About** (left sidebar on the Page)
3. Scroll to **Page transparency** → Page ID is listed

Or via Graph API Explorer (you already have it open from Step 4):
- Query `me/accounts` → response shows each Page you manage with its `id`

✓ `META_PAGE_ID` = that numeric ID

---

## Step 6 — Find your Instagram Business ID

Via Graph API Explorer:

1. Query: `{PAGE_ID}?fields=instagram_business_account`
2. Response: `{ "instagram_business_account": { "id": "17841400000000000" } }`
3. That id is your `META_IG_BUSINESS_ID`

✓ Done.

---

## Step 7 — Paste into AIRE Settings

1. Open AIRE → **Settings** → scroll to **Meta** section
2. Paste all 5 credentials
3. Click **Save Meta credentials**
4. Go to `/social` → page should show Facebook + Instagram as ✓ Connected
5. Click **+ Generate test post** to verify it works

---

## What unlocks once these are set

| Feature | Lights up |
|---|---|
| Publish posts to FB/IG from `/social` | Immediately |
| Pull post insights (reach, engagement, clicks) | Immediately after first post |
| Content Performance KPI tab on Dashboard | Once you have 5+ published posts |
| Tailoring Loop (Claude learns what works) | Once you have 10+ published posts |
| Aggregate audience demographics | Immediately |

---

## Common gotchas

- **"Token expired"** — Method A tokens expire in 60 days. Use Method B for permanent.
- **"Insufficient permissions"** — you forgot to grant a scope in Step 4. Regenerate the token with all 8 scopes checked.
- **"Page not found"** — the token isn't a Page token; it's still a User token. In Graph API Explorer, switch the dropdown to Page Token.
- **IG publish fails** — Instagram requires a publicly accessible HTTPS image URL. Local files don't work. Use Cloudinary, S3, or any public host.
- **Rate limit hit** — Meta caps you at 200 calls/hour. AIRE caches insights for 30 minutes to stay under.
- **App in Development Mode** — only your test users can use it. To go live for your team (Key, Jenna), submit for App Review with the permissions you need. Takes ~3-7 business days.

---

## What I (Claude) need from you to verify it's working

After you set credentials and save, run this in your terminal:

```bash
curl -s http://localhost:3000/api/social/insights | jq .
```

If it returns `{ "connected": true, ... }` instead of `{ "connected": false }`, we're live.
