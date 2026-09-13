# Digital Garden CMS — Setup Guide

A JSON-driven content system for a GitHub Pages site: `data.json` holds every
item, `index.html` + `app.js` render it publicly, and `admin.html` + `admin.js`
let you add, edit, and delete items through a visual panel that commits
straight to GitHub — no server, no build step.

## 1. File layout

Drop these six files into the root of your GitHub Pages repo (the same folder
as your existing `index.html`):

```
/
├── data.json      ← content database
├── index.html     ← public site
├── app.js         ← public rendering engine
├── admin.html     ← admin panel
├── admin.js       ← admin panel logic
├── styles.css     ← shared design system
└── assets/
    └── pdf/       ← uploaded PDFs land here
```

If you already have a hand-written `index.html`, back it up, then replace it
with the one here (or merge the hero/footer content into it — the structure
is intentionally close to what you had).

## 2. Push the files to GitHub

```bash
git add data.json index.html app.js admin.html admin.js styles.css
git commit -m "Switch to JSON-driven content system"
git push
```

GitHub Pages will redeploy automatically. Confirm `https://<you>.github.io/`
still loads and that `https://<you>.github.io/data.json` returns the JSON
file directly.

## 3. Create a GitHub Personal Access Token (PAT)

The admin panel needs a token with write access to **one repo only** —
use a fine-grained token, not a classic one with broad scope.

1. Go to **github.com → Settings → Developer settings → Personal access
   tokens → Fine-grained tokens → Generate new token**.
2. **Token name**: something recognizable, e.g. `digital-garden-admin`.
3. **Expiration**: pick a short window (30–90 days) and re-issue later —
   don't use "no expiration."
4. **Repository access**: choose **Only select repositories** and pick your
   Pages repo. Do not grant access to any other repository.
5. **Permissions → Repository permissions → Contents**: set to
   **Read and write**. Everything else can stay at **No access**.
6. Click **Generate token** and copy it immediately — GitHub only shows it
   once.

Keep this token private. Anyone with it can write files to that one
repository for as long as it's valid.

## 4. Connect the admin panel

1. Open `https://<you>.github.io/admin.html`.
2. Go to **GitHub Settings** in the sidebar and fill in:
   - **Personal Access Token** — paste the token from step 3.
   - **Repository owner** — your GitHub username or org, e.g. `goradalovanur-bit`.
   - **Repository name** — the Pages repo name, e.g. `goradalovanur-bit.github.io`.
   - **Branch** — usually `main`.
   - **Path to data.json** — `data.json` if it's at the repo root.
   - **PDF asset folder** — `assets/pdf/`.
3. Click **Save & Test Connection**. A green "Connected to owner/repo" status
   in the sidebar confirms the token works and has write access.

The token is stored only in this browser's `localStorage` — it is never sent
anywhere except `api.github.com`, and it is not included in the site's
public files.

## 5. Add, edit, and remove content

- **All Items** lists everything currently in `data.json`. Use the pencil
  icon to edit an entry or the trash icon to remove one.
- **Add New Item** opens the editor. Pick a **Content type** first —
  the form fields change to match:
  - **YouTube Video** — paste any watch/share/embed link.
  - **PDF Document** — drag a file onto the drop zone (staged for upload on
    commit) or type an existing path/URL if the file is already in the repo.
  - **LaTeX Formula** — type raw LaTeX; a live KaTeX preview renders below
    the field as you type.
  - **Custom Link** — a URL plus a button label.
- Every type also has optional **Source file URL / label** fields (useful
  for linking a `.tex` source or original dataset alongside the main item),
  a **Date**, and free-form **Tags** (press Enter or comma to add one).
- Click **Save to List** — this stages the change locally; nothing is
  written to GitHub yet.

## 6. Commit changes

Once you've staged at least one change, a bar appears at the bottom of the
screen:

- **Commit to GitHub** — uploads any staged PDF first, then writes the full
  updated `data.json` back to the repo in a single commit. GitHub Pages
  redeploys within a minute or two.
- **Copy JSON** — copies the full `data.json` payload to your clipboard as a
  fallback, useful if you're offline, don't want to store a token in this
  browser, or prefer to commit manually (paste it over the file's contents
  in GitHub's web editor, or save it locally and `git push`).

## 7. Everyday workflow

1. Open `admin.html`.
2. Add/edit/delete items.
3. Click **Commit to GitHub**.
4. Refresh the public site in a minute or two once Pages redeploys.

No local dev server, build step, or dependency install is required — every
file is static and can be edited and committed entirely from the browser.

## Notes on security

- Treat the PAT like a password. Clear it (**Clear Token** in Settings)
  on shared or public computers.
- Because the token is fine-grained and scoped to Contents on one repo,
  a leaked token can only modify files in that repository — it cannot
  access your account, other repos, or billing settings.
- Regenerate the token if you ever see unexpected commits, and rotate it
  periodically regardless.
