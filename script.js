// -------------------------------------------------------------------------------------------------
// 1) Footer year
// -------------------------------------------------------------------------------------------------
(function setFooterYear() {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();

// -------------------------------------------------------------------------------------------------
// 2) Slides data: primary (GitHub raw) + fallback (Imgur)
//    Replace with your own actual image URLs.
// -------------------------------------------------------------------------------------------------
const SLIDES = [
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Bronze_Accord.png",
    fallback: "https://imgur.com/a/fTkq8Ak",
    caption: "Bronze Accord Symbol"
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Argentina.PNG",
    fallback: "https://imgur.com/1ZGJ3Jq",
    caption: "I am Virelia — Argentina"
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Japan.PNG",
    fallback: "https://imgur.com/KeTAkAY",
    caption: "I am Virelia — Japan"
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Kenya.PNG",
    fallback: "https://imgur.com/xNcOlHF",
    caption: "I am Virelia — Kenya"
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Morocco.PNG",
    fallback: "https://imgur.com/sk86m9Q",
    caption: "I am Virelia — Morocco"
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Norway.PNG",
    fallback: "https://imgur.com/YPx8fb1",
    caption: "I am Virelia — Norway"
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Qatar.PNG",
    fallback: "https://imgur.com/PHuZgBC",
    caption: "I am Virelia — Qatar"
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Rwanda.PNG",
    fallback: "https://imgur.com/gzIQDF2",
    caption: "I am Virelia — Rwanda"
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Singapore.PNG",
    fallback: "https://imgur.com/74BFelt",
    caption: "I am Virelia — Singapore"
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_South_Korea.PNG",
    fallback: "https://imgur.com/9loCFNr",
    caption: "I am Virelia — South Korea"
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Sweden.PNG",
    fallback: "https://imgur.com/GgAkxR0",
    caption: "I am Virelia — Sweden"
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_The_Netherlands.PNG",
    fallback: "https://imgur.com/1jjjq7I",
    caption: "I am Virelia — The Netherlands"
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_UAE.PNG",
    fallback: "https://imgur.com/Wyrh1ej",
    caption: "I am Virelia — UAE"
  }
];

// -------------------------------------------------------------------------------------------------
// 3) Helpers
// -------------------------------------------------------------------------------------------------
function loadImageWithFallback(imgEl, primaryUrl, fallbackUrl, captionForDebug) {
  imgEl.src = primaryUrl;

  imgEl.onerror = function onPrimaryError() {
    if (!fallbackUrl || imgEl.dataset.triedFallback === "1") return;
    console.warn(`Primary failed for: ${captionForDebug}. Switching to fallback.`);
    imgEl.dataset.triedFallback = "1";
    imgEl.src = fallbackUrl;
  };
}

/**
 * Center image with equal side letterboxing and no vertical overflow.
 * Works for both portrait and landscape assets.
 */
function centerImageInSlider(imgEl) {
  const figure = imgEl.closest('.slide');
  if (!figure) return;

  const container = figure.querySelector('.slide-viewport') || figure; // viewport if present
  const cW = container.clientWidth;
  const cH = container.clientHeight;
  if (!cW || !cH) return;

  const imgW = imgEl.naturalWidth;
  const imgH = imgEl.naturalHeight;
  if (!imgW || !imgH) return;

  const imgRatio = imgW / imgH;
  const boxRatio = cW / cH;

  // Reset any previous inline sizing
  imgEl.style.width = '';
  imgEl.style.height = '';
  imgEl.style.maxWidth = '100%';
  imgEl.style.maxHeight = '100%';
  imgEl.style.objectFit = 'contain';    // safety
  imgEl.style.objectPosition = 'center'; // ensure centered

  // If image is comparatively wider than the box, constrain by width;
  // if it’s taller (portrait vs box), constrain by height.
  if (imgRatio >= boxRatio) {
    // Wider relative to container → width fits, vertical centers
    imgEl.style.width = '100%';
    imgEl.style.height = 'auto';
  } else {
    // Taller relative to container → height fits, horizontal centers
    imgEl.style.width = 'auto';
    imgEl.style.height = '100%';
  }
}

// -------------------------------------------------------------------------------------------------
// 4) Slideshow logic
// -------------------------------------------------------------------------------------------------
const slidesContainer = document.getElementById('slides');
const dotsContainer   = document.getElementById('dots');

let currentIndex = 0;
let autoTimer = null;
const AUTO_MS = 5000;

function slideMarkup(s, i, isActive) {
  // Add a viewport wrapper so we have a stable box to measure
  return `
    <figure class="slide ${isActive ? 'active' : ''}">
      <div class="slide-viewport">
        <img class="slide-img" alt="${s.caption.replace(/"/g, '&quot;')}" data-i="${i}" />
      </div>
      <figcaption>${s.caption}</figcaption>
    </figure>
  `;
}

function renderSlides() {
  if (!slidesContainer || !dotsContainer) return;

  // Build slides
  slidesContainer.innerHTML = SLIDES
    .map((s, i) => slideMarkup(s, i, i === currentIndex))
    .join('');

  // Load each image with fallback + post-load centering
  const imgs = slidesContainer.querySelectorAll('.slide-img');
  imgs.forEach(img => {
    const i = Number(img.dataset.i);
    const slide = SLIDES[i];

    // When image (either primary or fallback) finishes loading, center it
    img.addEventListener('load', () => centerImageInSlider(img), { once: false });
    // Also re-center on window resize
    window.addEventListener('resize', () => centerImageInSlider(img));

    loadImageWithFallback(img, slide.primary, slide.fallback, slide.caption);
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

function next() {
  goTo(currentIndex + 1);
}

function prev() {
  goTo(currentIndex - 1);
}

function startAuto() {
  stopAuto();
  autoTimer = setInterval(next, AUTO_MS);
}

function stopAuto() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
}

// Initial render + auto-advance
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
    const i = Number(btn.dataset.i);
    stopAuto();
    goTo(i);
    startAuto();
  });
}

// Pause on hover over slideshow area
const slideshowShell = document.getElementById('slideshow');
if (slideshowShell) {
  slideshowShell.addEventListener('mouseenter', stopAuto);
  slideshowShell.addEventListener('mouseleave', startAuto);
}

// Pause when tab is hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopAuto();
  else startAuto();
});
