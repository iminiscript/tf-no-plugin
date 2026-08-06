# Postscript SMS — Merchant Handoff

## What Was Built

| File | Purpose |
|---|---|
| `snippets/postscript-popup-opener.liquid` | Defines the `window.openPostscriptPopup` global helper (idempotent — safe to render from multiple blocks on the same page) |
| `blocks/sms-signup.liquid` | Merchant-addable theme block: heading + CTA button that opens the configured Postscript popup |
| `blocks/sms-back-in-stock.liquid` | Merchant-addable theme block for the PDP: shows a notify-me container and fallback button when the selected variant is out of stock |
| `config/settings_schema.json` | New **Postscript SMS** section added under Theme Settings with a `Postscript Shop ID` field |

---

## Settings to Fill

### 1. Postscript Shop ID (Theme Settings → Postscript SMS)

Leave this **blank** if you are using the Postscript app embed (recommended).  
Fill it in **only** if the app embed is unavailable and you need the SDK loaded manually.

### 2. Desktop Popup ID & Mobile Popup ID (SMS Signup block settings)

After placing the SMS Signup block in the theme editor, open its settings panel and paste the popup IDs you copied from the Postscript dashboard:

- **Desktop popup ID** — the ID of the popup to open on desktop viewports
- **Mobile popup ID** — the ID of the popup to open on mobile viewports (falls back to the desktop ID if left blank)

---

## Merchant Steps

### Step 1 — Install the Postscript App
Install Postscript from the [Shopify App Store](https://apps.shopify.com/postscript-sms-marketing). Complete onboarding in the Postscript dashboard.

### Step 2 — Enable the Postscript App Embed (Recommended)

1. Go to **Online Store → Themes → Customize**
2. Click **App embeds** in the left sidebar
3. Toggle the **Postscript** embed ON and save

This is the preferred way to load the Postscript SDK. Skip to Step 3.

> **Alternative (if app embed is unavailable):** Go to **Online Store → Themes → Customize → Theme Settings → Postscript SMS** and paste your Postscript Shop ID. See the critical warning below before doing this.

### Step 3 — Create a Popup in the Postscript Dashboard

1. Log in to the [Postscript dashboard](https://app.postscript.io)
2. Navigate to **Popups** and create a new SMS signup popup
3. Configure the popup's messaging, timing, and compliance settings inside Postscript
4. Copy the popup's **ID** from the popup settings page

### Step 4 — Place the SMS Signup Block

1. Open **Online Store → Themes → Customize**
2. Navigate to any page/section where you want the signup prompt (e.g. footer, announcement bar, a product page section)
3. Click **Add block** and select **SMS Signup**
4. In the block settings panel, paste the popup ID(s) from Step 3 into **Desktop popup ID** and (optionally) **Mobile popup ID**
5. Adjust the heading and button label text as desired
6. Save the theme

### Step 5 — Place the SMS Back in Stock Block (PDP Only)

1. In the theme editor, navigate to a **Product** page
2. Find the **Product Information** section and click **Add block**
3. Select **SMS Back in Stock** and position it near the Buy Buttons block
4. Adjust heading and button label text as desired
5. Save the theme

---

## ⚠️ Critical Warning — Double SDK Initialization

**Do NOT enable the Postscript app embed AND fill the `Postscript Shop ID` theme setting at the same time.**

Doing so causes the Postscript SDK to initialize twice on every page load, resulting in:
- Duplicate popup triggers
- Double-fired analytics events
- Unpredictable SDK behavior

**Pick one method only:**
- ✅ App embed ON → leave `Postscript Shop ID` blank
- ✅ App embed OFF → fill `Postscript Shop ID`

---

## Singleton Limitation — SMS Back in Stock

The Postscript SDK uses `#ps__bis_target_container` as a **singleton** element ID. Only the first occurrence on the page will be populated by the SDK.

**Do not place more than one SMS Back in Stock block on the same page.** If you do, a console warning will appear in the browser DevTools and only the first block's container will be populated.

---

## QA Steps

| Check | Expected result |
|---|---|
| Click the SMS Signup CTA on a **desktop** viewport (≥768px) | Postscript popup opens using the Desktop popup ID |
| Click the SMS Signup CTA on a **mobile** viewport (<768px) | Postscript popup opens using the Mobile popup ID (or falls back to desktop ID if mobile is blank) |
| Visit a product page where the **selected variant is in stock** | SMS Back in Stock block is hidden |
| Visit a product page where the **selected variant is out of stock** | SMS Back in Stock block is visible; heading and fallback "Notify me via text" button appear |
| Select an **out-of-stock** variant after viewing an in-stock variant | SMS Back in Stock block becomes visible |
| Select an **in-stock** variant after viewing an out-of-stock variant | SMS Back in Stock block hides |
| View the page **before the Postscript SDK loads** | Fallback "Notify me via text" button is visible inside the BIS block; the buy area is never empty |
| Open browser DevTools → Console | No JS errors when clicking the signup button (even if SDK not yet loaded) |
