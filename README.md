# Tornike Zaridze — Portfolio

A premium dark portfolio for a Fullstack Developer based in Vienna. Built as a single-file React application delivered entirely via CDN — no build step, no bundler, instant load.

---

## ✨ Features

- **WebGL turbulent shader background** — animated noise field rendered on a full-screen canvas
- **MacBook scroll showcase** — 3D lid-opening animation driven by scroll progress, with images flying out from the screen to a grid layout
- **Liquid reveal hover effect** — SVG turbulence + radial mask creates an organic ink-spread reveal on the About photo
- **Floating testimonial cards** — parallax-positioned quote cards in the hero area
- **Smooth scroll navigation** — fixed floating pill nav with active smooth-scroll anchors
- **Inline SVG terminal logo** — animated `>_` blinking cursor logo, no image files
- **Fully responsive** — mobile hamburger menu, fluid type, stacked layouts on small screens

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | React 18 (CDN, no build) |
| JSX Compilation | Babel Standalone (in-browser) |
| Animations | Vanilla scroll listeners + CSS transitions |
| Shader Background | Custom WebGL fragment shader (GLSL) |
| SVG Effects | `feTurbulence` + `feDisplacementMap` filters |
| Fonts | Google Fonts — Playfair Display, Inter |
| Serving | Any static file server (Python, Nginx, Vercel, Netlify) |

---

## 🚀 Getting Started

No installation or build step required.

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/portfolio.git
cd portfolio

# Serve locally (Python 3)
python3 -m http.server 8080

# Then open in browser:
# http://localhost:8080
```

That's it. No `npm install`, no `node_modules`.

---

## 📁 Project Structure

```
portfolio/
├── index.html          # Entire application — React + JSX + styles inline
├── Tornike.PNG         # About section base portrait
├── baiker2.png         # Liquid reveal overlay image
├── 1.png – 4.png       # MacBook showcase project images
├── carbon.svg          # Code screenshot for MacBook screen
├── image.svg           # TZ monogram logo (reference, replaced by inline SVG)
└── *.py                # Utility image scripts (not part of the site)
```

---

## 🌐 Deployment

### Vercel (recommended)
1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New Project**
3. Import your GitHub repository
4. Framework preset: **Other** (plain static)
5. Build command: *(leave empty)*
6. Output directory: `.` (root)
7. Click **Deploy**

### Netlify
1. Go to [netlify.com](https://netlify.com) → **Add new site → Import from Git**
2. Select your repository
3. Build command: *(leave empty)*
4. Publish directory: `.`
5. Click **Deploy site**

### GitHub Pages
Enable GitHub Pages in your repo settings → Source: `main` branch → `/ (root)`.

---

## 👤 Author

**Tornike Zaridze**
- GitHub: [@YOUR_GITHUB](https://github.com/YOUR_GITHUB)
- LinkedIn: [linkedin.com/in/YOUR_LINKEDIN](https://linkedin.com/in/YOUR_LINKEDIN)

---

## 📄 License

MIT — see [LICENSE](LICENSE)
