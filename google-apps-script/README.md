# MeritOn Google Apps Script Mail Delivery & Recipient Directory

This directory contains the production Google Apps Script code that handles email delivery and recipient directory synchronization for MeritOn.

## Architecture

- **Backend (Render / Node.js)**: Authoritative source of business logic, OTP generation, validation, and content formatting.
- **Google Apps Script**: Delivery layer that receives authenticated requests via HTTPS POST, sends mail through `MailApp`, and maintains the verified recipient directory in `Sheet1`.
- **Google Sheets (`Sheet1`)**: Verified recipient directory with columns:
  `Email` | `Name` | `UnivId` | `Department` | `BatchYear` | `College`

---

## Deployment Steps

1. Open your Google Spreadsheet:
   [Spreadsheet Link](https://docs.google.com/spreadsheets/d/1Tqx8Tkct2RTuXIleYaNmeG1y_DvfQdShE6h278ZFRRo/edit?gid=0#gid=0)
   or open [Google Apps Script](https://script.google.com).
2. Go to **Extensions** → **Apps Script** (or open the existing project `AKfycbxve7y4bVlBg0wPblLzGn7ZxoBTcY-MB2zOZGg_5IQsqilnzZI5nqr8G9LRgVsJfskTEA`).
3. Replace the entire contents of `Code.gs` with the contents of `google-apps-script/Code.js`.
4. Configure **Script Properties**:
   - In the Apps Script left sidebar, click the **Gear icon (Project Settings)**.
   - Scroll down to **Script Properties** and click **Add script property**.
   - Add:
     - `MERITON_SECRET`: `<Choose a strong random secret string>`
     - `SPREADSHEET_ID`: `1Tqx8Tkct2RTuXIleYaNmeG1y_DvfQdShE6h278ZFRRo`
     - `SHEET_NAME`: `Sheet1`
   - Click **Save script properties**.
5. Deploy Web App:
   - Click **Deploy** → **New deployment** (or **Manage deployments** → **Edit** on existing deployment).
   - Select type: **Web app**.
   - **Description**: `MeritOn Mail Delivery Service`
   - **Execute as**: `Me (<your google account>)`
   - **Who has access**: `Anyone` *(Secured via HMAC-SHA256 signature / MERITON_SECRET)*
   - Click **Deploy**.
   - Authorize permissions when prompted by Google (Google Mail and Google Sheets access).
   - Copy the Web App URL (e.g. `https://script.google.com/macros/s/AKfycbxve7y4bVlBg0wPblLzGn7ZxoBTcY-MB2zOZGg_5IQsqilnzZI5nqr8G9LRgVsJfskTEA/exec`).
6. Set Environment Variables in MeritOn Backend (Render):
   - `GOOGLE_APPS_SCRIPT_URL`: `<Web App URL>`
   - `GOOGLE_APPS_SCRIPT_SECRET`: `<Same MERITON_SECRET value set in Script Properties>`
