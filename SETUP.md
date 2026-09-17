# Anur Qoradalov — Academic Portal: Setup Guide

A Medium-style academic content portal for GitHub Pages. Five content types
(Solved Problems, Essays & Stories, Code & Animations, YouTube, PDF) live in a
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
| `stories`            | Essays & Stories       | `content`, `image`, `images` |
| `code_animations`   | Code & Animations     | `language`, `code_snippet`, `animation_url`, `github_url` |
| `youtube`            | YouTube                | `video_url`, `description` |
| `pdf`                 | *(shown in Home feed)* | `pdf_url`, `custom_thumbnail`, `course` |

`meta.avatarUrl` (top-level, not inside any array) holds the optional profile
picture shown in the sidebar and on the About page — set it from the "About
page profile picture" card in the admin panel's All Items view.

### Fields of Mathematics

`course` (on Solved Problems and PDFs) is labeled **"Field of Mathematics"**
in the admin panel. It's still free text, but the field offers suggestions
from a pre-defined list: Algebra, Complex Analysis, Geometry, Lebesgue
Integral & Measure, Mathematical Logic, Mathematical Statistics, Numerical
Analysis, ODE, PDE, Probability, Real Analysis, Topology.

Any item's `tags` array can also include the *slug* form of these fields
(`ode`, `pde`, `complex-analysis`, `lebesgue-integral-and-measure`, …). Tags
matching this list are automatically:

- displayed with proper Title Case / acronym capitalization everywhere
  (`ode` → **ODE**, `complex-analysis` → **Complex Analysis**), and
- surfaced as filter options in the sidebar's **Filters** panel for every
  section — including Code & Animations — so visitors can multi-select by
  field. Clicking an active filter again toggles it off; "All" clears the
  selection. The filter panel is collapsed by default; click **Filters** to
  open it.

Any other tag you type is still stored as-is and formatted with the same
Title Case fallback for display, but won't appear as a dedicated Field
filter unless it matches the predefined list above.

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

- **Solved Problem** — Field of Mathematics, a **Question** field and a
  **Solution** field (both with live LaTeX preview), rendered on the public
  site as question-first with a "Show Solution" toggle that expands an
  Overleaf-style paper panel.
- **Essay / Story** — free-form content with live preview (biographies,
  personal reflections, cross-disciplinary writing all fit here), an
  optional cover image URL, plus any number of **additional images**, each
  with its own placement: inline (centered), full-width divider, or
  wrapped left/right of the text.
- **Code & Animation** — pick a language (Manim / MATLAB / Python / C++),
  paste the code snippet, optionally link a video and/or GitHub repo. Add
  Field of Mathematics tags (e.g. `ode`, `numerical-analysis`) so the item
  is filterable by field alongside the language filter.
- **YouTube Video** — just the URL and a description; the thumbnail is
  generated automatically from the video ID.
- **PDF Document** — drag a file onto the drop zone (staged for upload) or
  paste an existing path, plus an optional thumbnail (upload an image or
  paste a URL) and a Field of Mathematics.

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

## 9. What's new in v3

- **Universal media galleries** — every content type (Solved Problems, Essays, Code & Animations, YouTube, PDF, Courses) now supports an optional "Additional media" gallery: drag-and-drop or pick image/video files directly in the admin editor (uploaded automatically on commit), or paste a URL as a fallback. Each item gets a Left / Center / Right / Full-width alignment and a size slider, plus an optional built-in cropper for uploaded images (drag a rectangle, Apply Crop).
- **Dynamic Fields of Mathematics** — managed from the new **Fields** tab in the admin sidebar instead of being hard-coded. Add, rename, or delete a field and it immediately syncs to the "Field of Mathematics" suggestions and the public Filters panel.
- **12-hour timestamps** — the Date field is now a date **and time** picker, and every displayed timestamp across the public site and admin panel renders as e.g. `Sep 14, 2026, 09:30 PM`.
- **Courses / Playlists** — a new content type for grouping lessons into a structured course. Each course has a title, description, optional cover thumbnail, and a Field of Mathematics; each lesson has an explicit numeric **Order** plus optional PDF notes, YouTube link, GitHub link, code snippet, and its own thumbnail — any left blank is simply omitted on the public page. Visitors browse courses from the new **Courses** sidebar section; opening one shows lessons in your chosen order.

All of the above stay backward compatible with existing `data.json` content — nothing from v2 needs to be re-entered.

## 10. What's new in v4

- **Draft / Published status** — every item now has a Published/Draft toggle in the editor. Drafts save and commit exactly like published items, but `app.js` filters them out before they reach the public feed, search, filters, or a direct course link — so a draft is never visible on the live site, even by URL.
- **Overleaf-style split-view editor** — Question, Solution, Essay Content, and Course Description now open as a left-pane editor / right-pane live preview, with a toolbar for Bold, Heading, inline (`$`) and block (`$$`) math, and image/video placement.
- **Inline media shortcode tokens** — place an image or video anywhere inside that text, not just in a separate gallery below it:
  - `![Alt text](url){align=L size=60 mode=wrap}`
  - `[media: url | align=R | size=50% | mode=break | kind=video | alt="Description"]`
  - `align`: `L`/`R` (wrap), `C` or `U` (centered), `D` (full-width) · `mode`: `wrap` floats text around it, `break` splits the paragraph above/below · `size`: a percentage width.
  - The toolbar's image/video buttons open a small popover to upload a file, paste a URL, or pick something already used elsewhere (the Media Library) — it inserts the token at your cursor automatically.
- **Media Library** — a global picker (accessible from the split-editor popover and from a new **Browse Library** button next to "Add by URL") that shows every image/video already used anywhere in `data.json`, so you can reuse an asset without re-uploading it.
- **WebP compression pipeline** — every image upload (Additional Media, the media-token popover, PDF thumbnails, course covers, avatar) is automatically re-encoded to WebP and capped at 1600px wide (800px for the avatar) before staging, to keep the repo and page weight down. SVGs are left untouched.
- **Rebuilt image cropper** — a fixed-aspect frame (Freeform / 1:1 / 16:9 / 4:3) with a zoom slider and click-drag panning; the frame is exactly what gets saved. It opens automatically right after a single-image upload in Additional Media ("Skip cropping" keeps the full image).
- **Search, filters, and bulk actions on the item list** — a search box plus Status/Type/Field filters, with checkboxes for bulk status changes or bulk delete. Selecting more than one Field filter on the **public site** now works as strict AND (an item must match every selected field, not just one).
- **Drag-and-drop lesson reordering** — the manual lesson "Order" number is gone; drag a lesson by its handle to reorder, and the order number is derived automatically from position.
- **Autosave** — the editor form is saved to your browser's local storage as you type. If you reopen the admin panel with unsaved work still sitting there, a banner offers to restore it (or discard it).
- **Smart fallback thumbnails** — lessons, PDFs, and videos with no cover image now get the same sleek gradient-and-icon placeholder instead of a blank space.
- **Visual polish** — a proper minimalist SVG chevron on every dropdown (replacing the browser's native arrow), an SVG download icon in place of the emoji, and consistent hover states across cards and list rows.

All of the above stay backward compatible with existing `data.json` content from v2/v3 — an item with no `status` field is treated as published, and content with no shortcode tokens in it renders exactly as before.

