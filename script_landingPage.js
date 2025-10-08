// -------------------------------------------------------------------------------------------------
// 1) Footer year
// -------------------------------------------------------------------------------------------------
(function setFooterYear() {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();

// -------------------------------------------------------------------------------------------------
// 2) Slides data: primary (GitHub raw) + fallback (Imgur)
// -------------------------------------------------------------------------------------------------
const SLIDES = [
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Bronze_Accord_White.png",
    fallback: "https://imgur.com/a/fTkq8Ak",
    caption: "Bronze Accord Symbol",
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_USA.PNG",
    fallback: "https://imgur.com/a/2KES0sA",
    caption: "I am Virelia — USA (AI generated image)",
  },
  {
    primary: "https://raw.githubusercontent.com/davidfalbright/virelia-site/main/images/Virelia_Argentina.PNG",
    fallback: "https://imgur.com/1ZGJ3Jq",
    caption: "I am Virelia — Argentina (AI generated image)",
  },
  // Add more slides here...
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

// -------------------------------------------------------------------------------------------------
// 5) Hide/show sections based on guest login status
// -------------------------------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  const sess = window.__SESSION__ || {};
  const role = sess.role || null;
  const isGuest = role === 'guest' || (!role && (sess.email === 'guest'));
  alert("isGuest value: " + isGuest);
  
  // Hide sections for guest users
  const verdictSection = document.getElementById('verdict');
  if (verdictSection) {
    if (isGuest) {
      verdictSection.style.display = 'none';
    } else {
      verdictSection.style.display = 'block';
    }
  }

  // Hide the Contact section for guests
  const navContact = document.getElementById('navContactLink') || document.querySelector('a[href="#contact"]');
  const footContact = document.getElementById('footContactLink');
  const contactSection = document.getElementById('contact');

  if (isGuest) {
    if (navContact) navContact.style.display = 'none';
    if (footContact) footContact.style.display = 'none';
    if (contactSection) contactSection.style.display = 'none';
  } else {
    if (navContact) navContact.style.display = 'inline';
    if (footContact) footContact.style.display = 'inline';
    if (contactSection) contactSection.style.display = 'block';
  }
});

