# Anur Qoradalov — Academic Portal: Setup Guide

A Medium-style academic content portal for GitHub Pages. Five content types
(Solved Problems, Math Insights, Code & Animations, YouTube, PDF) live in a
single `data.json`, `index.html` + `app.js` render the public feed, and
`admin.html` + `admin.js` let you add/edit/delete everything visually and
commit straight to GitHub — no server, no build step.

## 1. File layout

```
/
├── data.json      ← content database (5 arrays: problems, stories, code_animations, youtube, pdf)
├── index.html     ← public feed (sidebar nav + filter pills + cards)
├── app.js         ← public rendering engine
├── admin.html     ← admin panel
├── admin.js       ← admin panel logic
├── styles.css     ← shared design system (Medium-style + Overleaf paper look)
└── assets/
    ├── pdf/       ← uploaded PDFs land here
    └── img/       ← optional cover images / custom thumbnails
```

Replace your existing files with these six and push.

## 2. Push to GitHub

```bash
git add data.json index.html app.js admin.html admin.js styles.css
git commit -m "Rebuild as Medium-style academic portal"
git push
```

Confirm `https://<you>.github.io/` and `https://<you>.github.io/data.json`
both load after Pages redeploys (usually within a minute or two).

## 3. The content model

Every item lives in one of five arrays in `data.json`:

| Array             | Sidebar section     | Key fields |
|--------------------|----------------------|------------|
| `problems`          | Solved Problems      | `question_latex`, `solution_latex`, `course` |
| `stories`            | Math Insights         | `content`, `image` |
| `code_animations`   | Code & Animations     | `language`, `code_snippet`, `animation_url`, `github_url` |
| `youtube`            | YouTube                | `video_url`, `description` |
| `pdf`                 | *(shown in Home feed)* | `pdf_url`, `custom_thumbnail`, `course` |

`question_latex`, `solution_latex`, and `content` all use the same simple
syntax — you never touch raw LaTeX rendering logic, just write:

- Plain text for prose (Azerbaijani, English, anything UTF-8).
- Inline math wrapped in `$...$`, block math in `$$...$$`.
- A blank line to start a new paragraph.
- A line starting with `### ` to make a section heading (used heavily in
  Overleaf-style solutions, e.g. `### 1. Tənliyin növü`).
- `**bold**` for emphasis.

This is all handled by the admin panel's live preview — you don't need to
memorize it, just watch the preview update as you type.

## 4. Create a GitHub Personal Access Token (PAT)

1. Go to **github.com → Settings → Developer settings → Personal access
   tokens → Fine-grained tokens → Generate new token**
   (or jump straight there: `https://github.com/settings/personal-access-tokens/new`).
2. **Token name**: e.g. `academic-portal-admin`.
3. **Expiration**: your choice — a dated expiry (30–90 days) is more
   cautious; "No expiration" is fine for a low-risk personal site as long as
   you revoke it if it's ever exposed.
4. **Repository access → Only select repositories** → pick your Pages repo only.
5. Click **+ Add permissions**, choose **Contents**, set it to **Read and write**.
6. **Generate token** and copy it immediately.

## 5. Connect the admin panel

1. Open `https://<you>.github.io/admin.html`.
2. **GitHub Settings** → paste the token, fill in owner, repo name, branch
   (`main`), `data.json` path, and PDF asset folder (`assets/pdf/`).
3. **Save & Test Connection** — a green "Connected to owner/repo" status
   confirms it works.

## 6. Add content

**Add New Item** → pick a **Content type**, and the form adapts:

- **Solved Problem** — course name, a **Question** field and a **Solution**
  field (both with live LaTeX preview), rendered on the public site as
  question-first with a "Show Solution" toggle that expands an Overleaf-style
  paper panel.
- **Math Insight (Story)** — free-form content with live preview, optional
  cover image URL.
- **Code & Animation** — pick a language (Manim / MATLAB / Python / C++),
  paste the code snippet, optionally link a video and/or GitHub repo.
- **YouTube Video** — just the URL and a description; the thumbnail is
  generated automatically from the video ID.
- **PDF Document** — drag a file onto the drop zone (staged for upload) or
  paste an existing path, plus an optional custom thumbnail and course name.

Every type also has **Date** and free-form **Tags**. **Save to List** stages
the change locally — nothing is written to GitHub yet.

## 7. Commit changes

Once something is staged, a bar appears at the bottom:

- **Commit to GitHub** — uploads any staged PDF first, then writes the full
  updated `data.json` in one commit.
- **Copy JSON** — copies the payload to your clipboard as an offline/manual
  fallback.

## 8. Everyday workflow

1. Open `admin.html`.
2. Add/edit/delete items across any of the five types.
3. **Commit to GitHub**.
4. Refresh the public site once Pages redeploys.

## Notes on security

- The token lives only in this browser's `localStorage`, sent only to
  `api.github.com`.
- It's fine-grained and scoped to Contents on one repo — a leaked token
  can't touch anything else in your account.
- Use **Clear Token** on shared computers, and revoke/regenerate if you ever
  suspect it's been exposed.
