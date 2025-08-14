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
    // Example: GitHub raw URL (primary)
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Bronze_Accord.png",
    
    // Example: Imgur (fallback)
    //fallback: "https://i.imgur.com/w85XBJx.png",
    fallback: "https://imgur.com/a/fTkq8Ak",

    // Example: Image Caption
    caption: "Bronze Accord Symbol"
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Morocco.PNG",
    fallback: "https://imgur.com/sk86m9Q",
    caption: "I am Virelia — Morocco"
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
// 3) Helpers: load image with fallback
// -------------------------------------------------------------------------------------------------
function loadImageWithFallback(imgEl, primaryUrl, fallbackUrl, captionForDebug) {
  // Set primary first
  imgEl.src = primaryUrl;

  // If primary fails, try fallback
  imgEl.onerror = function onPrimaryError() {
    if (!fallbackUrl || imgEl.dataset.triedFallback === "1") {
      // No fallback or already tried fallback -> give up quietly
      return;
    }
    console.warn(`Primary failed for: ${captionForDebug}. Switching to fallback.`);
    imgEl.dataset.triedFallback = "1";
    imgEl.src = fallbackUrl;
  };
}

// -------------------------------------------------------------------------------------------------
// 4) Slideshow logic
//    - Renders slides + dots
//    - Next / Prev controls
//    - Auto-advance (5s) with restart on manual navigation
// -------------------------------------------------------------------------------------------------
const slidesContainer = document.getElementById('slides');
const dotsContainer   = document.getElementById('dots');

let currentIndex = 0;
let autoTimer = null;
const AUTO_MS = 5000;

function renderSlides() {
  if (!slidesContainer || !dotsContainer) return;

  // Build slides markup
  slidesContainer.innerHTML = SLIDES.map((s, i) => `
    <figure class="slide ${i === currentIndex ? 'active' : ''}">
      <img class="slide-img" alt="${s.caption.replace(/"/g, '&quot;')}" data-i="${i}" />
      <figcaption>${s.caption}</figcaption>
    </figure>
  `).join('');

  // Load each image with fallback behavior
  const imgs = slidesContainer.querySelectorAll('.slide-img');
  imgs.forEach(img => {
    const i = Number(img.dataset.i);
    const slide = SLIDES[i];
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

// Initial render + start auto-advance
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

// Optional: pause auto-play on hover over slideshow area
const slideshowShell = document.getElementById('slideshow');
if (slideshowShell) {
  slideshowShell.addEventListener('mouseenter', stopAuto);
  slideshowShell.addEventListener('mouseleave', startAuto);
}

// Optional: pause when tab is hidden to save resources
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopAuto();
  else startAuto();
});



