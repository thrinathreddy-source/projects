# Instagram Connection Setup

> **Important:** Instagram Basic Display API was **shut down September 4, 2024**.
> Nuro uses its official replacement: **Instagram Platform API with Instagram Login**.

---

## What you get
| Feature | Available |
|---|---|
| Your own posts in Scroll feed (AI-scored) | ✅ |
| Profile info | ✅ |
| Personal DMs | ❌ Requires Business account + Meta app review |
| Reading other people's posts | ❌ Requires app review |

---

## One-time setup (~10 minutes)

### Step 1 — Create a Meta Developer App

1. Go to [developers.facebook.com](https://developers.facebook.com) and sign in with your Facebook account.
2. Click **My Apps** (top right) → **Create App**.
3. On the "What do you want your app to do?" screen, scroll down and select **"Other"**, then click Next.
4. For app type, choose **Consumer**, click Next.
5. Give it a name (e.g. `Nuro Dev`) and click **Create App**.

> **Note:** The old "Add Product" sidebar button no longer exists in the 2024+ dashboard.
> Products are now added through **Use Cases** — see Step 2.

---

### Step 2 — Add Instagram to your app

1. In your app dashboard left sidebar, look for **"Add Use Cases"** or click the **"+"** icon next to "Products" (if visible), or go to **Dashboard → Use Cases**.
2. Find **Instagram** in the list — it may be listed as "Instagram Platform" or under social.
3. Click **Set Up** next to it.
4. You'll be prompted to choose permissions. Select:
   - `instagram_business_basic` (required — replaces old user_profile + user_media)
5. Click **Continue** / **Save**.

---

### Step 3 — Configure OAuth settings

1. In the left sidebar go to **Instagram** (now listed as a product) → **API Setup with Instagram Login**.
2. Scroll to **OAuth Redirect URIs** (or "Valid OAuth Redirect URIs").
3. Add: `http://localhost:3000/api/auth/instagram/callback`
4. Click **Save Changes**.

---

### Step 4 — Add yourself as a test user

Until your app passes Meta review, only users you explicitly add can connect.

1. Left sidebar → **App Roles** → **Roles**.
2. Click **Add People** → search your Instagram handle → Add as **Tester**.
3. On your Instagram account (mobile app or web):
   - Go to **Settings → Apps and Websites** (mobile) or **Settings → Security → Apps and Websites** (web)
   - Tap **Tester Invites**
   - Accept the invite from your Meta app.

---

### Step 5 — Get your credentials

1. Left sidebar → **App Settings → Basic**.
2. Copy:
   - **App ID** (shown at the top)
   - **App Secret** (click "Show" button)

---

### Step 6 — Add to .env.local

Open `.env.local` in the project root and fill in:

```
INSTAGRAM_APP_ID=your_app_id_here
INSTAGRAM_APP_SECRET=your_app_secret_here
INSTAGRAM_REDIRECT_URI=http://localhost:3000/api/auth/instagram/callback
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

Restart the dev server after saving.

---

### Step 7 — Connect in Nuro

1. Open the app at `http://localhost:3000`
2. Click **+ Connect** → **Instagram** → **Continue with Instagram**
3. You'll land on Instagram's official OAuth consent screen
4. Approve, and you'll be redirected back to Nuro automatically

Your posts will now appear in the **Scroll** feed, AI-scored with Nuro's CHS engine.

---

## Troubleshooting

| Error | Fix |
|---|---|
| `INSTAGRAM_APP_ID not configured` | Add credentials to `.env.local` and restart |
| `Invalid redirect_uri` | Make sure the URI in Meta dashboard exactly matches `.env.local` |
| `User not authorized` | You haven't accepted the Tester invite on Instagram |
| `Token expired` | Click Connect again — tokens last 60 days |
| `Permissions error` | Make sure `instagram_business_basic` scope is added in your app's Use Cases |

---

## Going to production (when you're ready to launch)

1. In App Dashboard → **App Review** → **Permissions and Features**
2. Request `instagram_business_basic` for production
3. Meta reviews in ~5–7 business days
4. Once approved, any Instagram user can connect — not just testers

---

## Token refresh (automated in production)

Tokens are valid 60 days. To refresh before expiry:

```
GET https://graph.instagram.com/refresh_access_token
  ?grant_type=ig_refresh_token
  &access_token={current_token}
```

Add this to a cron job (e.g. every 30 days) before launching publicly.
