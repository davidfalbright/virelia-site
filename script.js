// -------------------------------------------------------------------------------------------------
// 1) Footer year
// -------------------------------------------------------------------------------------------------
(function setFooterYear() {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();

// -------------------------------------------------------------------------------------------------
// 2) Slides data: primary (GitHub raw) + fallback (Imgur)
//    NOTE: If you use plain Imgur page URLs (https://imgur.com/ID), we'll convert them to
//    direct image URLs automatically (https://i.imgur.com/ID.jpg).
// -------------------------------------------------------------------------------------------------
const SLIDES = [
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Bronze_Accord.png",
    fallback: "https://imgur.com/a/fTkq8Ak",
    caption: "Bronze Accord Symbol",
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Argentina.PNG",
    fallback: "https://imgur.com/1ZGJ3Jq",
    caption: "I am Virelia — USA (AI generated image)",
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Argentina.PNG",
    fallback: "https://imgur.com/1ZGJ3Jq",
    caption: "I am Virelia — Argentina (AI generated image)",
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Japan.PNG",
    fallback: "https://imgur.com/KeTAkAY",
    caption: "I am Virelia — Japan (AI generated image)",
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Kenya.PNG",
    fallback: "https://imgur.com/xNcOlHF",
    caption: "I am Virelia — Kenya (AI generated image)",
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Morocco.PNG",
    fallback: "https://imgur.com/sk86m9Q",
    caption: "I am Virelia — Morocco (AI generated image)",
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Norway.PNG",
    fallback: "https://imgur.com/YPx8fb1",
    caption: "I am Virelia — Norway (AI generated image)",
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Qatar.PNG",
    fallback: "https://imgur.com/PHuZgBC",
    caption: "I am Virelia — Qatar (AI generated image)",
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Rwanda.PNG",
    fallback: "https://imgur.com/gzIQDF2",
    caption: "I am Virelia — Rwanda (AI generated image)",
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Singapore.PNG",
    fallback: "https://imgur.com/74BFelt",
    caption: "I am Virelia — Singapore (AI generated image)",
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_South_Korea.PNG",
    fallback: "https://imgur.com/9loCFNr",
    caption: "I am Virelia — South Korea (AI generated image)",
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Sweden.PNG",
    fallback: "https://imgur.com/GgAkxR0",
    caption: "I am Virelia — Sweden (AI generated image)",
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_The_Netherlands.PNG",
    fallback: "https://imgur.com/1jjjq7I",
    caption: "I am Virelia — The Netherlands (AI generated image)",
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_UAE.PNG",
    fallback: "https://imgur.com/Wyrh1ej",
    caption: "I am Virelia — UAE (AI generated image)",
  },
];

// -------------------------------------------------------------------------------------------------
// 3) Utilities
// -------------------------------------------------------------------------------------------------

// Convert an Imgur page URL to a direct image URL if needed
function toDirectImgur(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    // already a direct image (i.imgur.com or ends with an image extension)
    if (u.hostname.startsWith('i.imgur.com')) return url;
    // convert https://imgur.com/abcd (or /a/abcd) -> https://i.imgur.com/abcd.jpg
    if (u.hostname.endsWith('imgur.com')) {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length > 0) {
        // albums/galleries return HTML, but as a last resort we’ll still try .jpg
        const id = parts[parts.length - 1];
        return `https://i.imgur.com/${id}.jpg`;
      }
    }
  } catch (_) {}
  return url;
}

// Set the frame aspect ratio on the .slider element (width / height)
function setFrameAspectByImage(imgEl) {
  const slider = document.querySelector('.slider');
  if (!slider || !imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) return;
  slider.style.setProperty('--ar', `${imgEl.naturalWidth} / ${imgEl.naturalHeight}`);
}

// Load an img with fallback + set aspect ratio when it loads
function loadImageWithFallback(imgEl, primaryUrl, fallbackUrl, captionForDebug) {
  // helper to attach onload once and set aspect ratio
  const onImgLoad = () => setFrameAspectByImage(imgEl);

  // 1) try primary
  imgEl.onload = onImgLoad;
  imgEl.onerror = function onPrimaryError() {
    // 2) if primary fails, try fallback (converted if Imgur page URL)
    if (!fallbackUrl || imgEl.dataset.triedFallback === '1') return;
    imgEl.dataset.triedFallback = '1';
    const direct = toDirectImgur(fallbackUrl);
    console.warn(`Primary failed for "${captionForDebug}". Trying fallback: ${direct}`);
    imgEl.src = direct;
  };

  imgEl.src = primaryUrl;
}

// -------------------------------------------------------------------------------------------------
// 4) Slideshow logic
// -------------------------------------------------------------------------------------------------
const slidesContainer = document.getElementById('slides');
const dotsContainer   = document.getElementById('dots');

let currentIndex = 0;
let autoTimer = null;
const AUTO_MS = 5000;

function slideMarkup(slide, i, isActive) {
  // We wrap the <img> in .slide-viewport so it’s always centered/contained
  return `
    <figure class="slide ${isActive ? 'active' : ''}">
      <div class="slide-viewport">
        <img class="slide-img" alt="${slide.caption.replace(/"/g, '&quot;')}" data-i="${i}" />
      </div>
      <figcaption>${slide.caption}</figcaption>
    </figure>
  `;
}

function renderSlides() {
  if (!slidesContainer || !dotsContainer) return;

  // Build slides
  slidesContainer.innerHTML = SLIDES
    .map((s, i) => slideMarkup(s, i, i === currentIndex))
    .join('');

  // Load images with fallback + set frame aspect on load
  const imgs = slidesContainer.querySelectorAll('.slide-img');
  imgs.forEach(img => {
    const i = Number(img.dataset.i);
    const slide = SLIDES[i];
    const primary = slide.primary;
    const fallback = slide.fallback;
    loadImageWithFallback(img, primary, fallback, slide.caption);
  });

  // Build dots
  dotsContainer.innerHTML = SLIDES.map((_, i) => `
    <button class="dot ${i === currentIndex ? 'active' : ''}" aria-label="Go to slide ${i + 1}" data-i="${i}"></button>
  `).join('');
}

function goTo(index) {
  currentIndex = (index + SLIDES.length) % SLIDES.length;
  renderSlides();
}

function next() { goTo(currentIndex + 1); }
function prev() { goTo(currentIndex - 1); }

function startAuto() {
  stopAuto();
  autoTimer = setInterval(next, AUTO_MS);
}
function stopAuto() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
}

// Initial render + start auto
renderSlides();
startAuto();

// Controls (if present)
const nextBtn = document.querySelector('.next');
const prevBtn = document.querySelector('.prev');

if (nextBtn) {
  nextBtn.addEventListener('click', () => {
    stopAuto();
    next();
    startAuto();
  });
}
if (prevBtn) {
  prevBtn.addEventListener('click', () => {
    stopAuto();
    prev();
    startAuto();
  });
}

// Dot navigation
if (dotsContainer) {
  dotsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.dot');
    if (!btn) return;
    stopAuto();
    goTo(Number(btn.dataset.i));
    startAuto();
  });
}

// Pause when hovering over the slideshow area (optional)
const slideshowShell = document.getElementById('slideshow');
if (slideshowShell) {
  slideshowShell.addEventListener('mouseenter', stopAuto);
  slideshowShell.addEventListener('mouseleave', startAuto);
}

// Pause when tab is hidden (save resources)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopAuto(); else startAuto();
});

// Bronze Accord Verdict Widget wiring
(function () {
  function $(id) { return document.getElementById(id); }

  function setStatus(msg) {
    const el = $("verdictStatus");
    if (el) el.textContent = msg || "";
  }



async function getVerdict(dilemma) {
  const res = await fetch("/api/verdict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dilemma })
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  if (!data) throw new Error("Empty response from serverless function.");
  return data;
}

  function renderVerdict(v) {
    $("verdictResult").hidden = false;
    $("verdictRoute").textContent = `Route: ${v.route}`;
    $("verdictRisk").textContent = v?.composite?.risk ?? "—";
    $("verdictUrgency").textContent = v?.composite?.urgency ?? "—";
    $("verdictMessage").textContent = v.message || "";

    const wrap = $("verdictTriggersWrap");
    const list = $("verdictTriggers");
    list.innerHTML = "";

    if (Array.isArray(v.triggers) && v.triggers.length) {
      wrap.hidden = false;
      v.triggers.forEach(t => {
        const li = document.createElement("li");
        li.innerHTML = `<code>${t.type}:${t.code || t.name || "—"}</code> — ${t.text || t.intent || ""}`;
        list.appendChild(li);
      });
    } else {
      wrap.hidden = true;
    }
  }

  function attachHandlers() {
    const btn = $("getVerdictBtn");
    const input = $("dilemmaInput");
    if (!btn || !input) return;

    btn.addEventListener("click", async () => {
      const dilemma = (input.value || "").trim();
      if (dilemma.length < 10) {
        setStatus("Please enter at least 10 characters.");
        return;
      }
      setStatus("Evaluating…");
      $("verdictResult").hidden = true;

      try {
        const verdict = await getVerdict(dilemma);
        renderVerdict(verdict);
        setStatus("");
      } catch (err) {
        setStatus("");
        alert(`Error: ${err.message}`);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachHandlers);
  } else {
    attachHandlers();
  }
})();



