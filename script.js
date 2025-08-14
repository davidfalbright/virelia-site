// Year in footer
document.getElementById('year').textContent = new Date().getFullYear();

/**
 * SLIDES: Replace with your actual “I am Virelia” image URLs.
 * You can use Imgur direct links (e.g., https://i.imgur.com/xxxxx.jpg)
 * or GitHub raw links.
 */
const SLIDES = [
  { src: "https://i.imgur.com/w85XBJx.png", caption: "I am Virelia — Norway" },
  { src: "https://images.unsplash.com/photo-1520975922324-8b456906c813?q=80&w=1200&auto=format&fit=crop", caption: "I am Virelia — UAE" },
  { src: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1200&auto=format&fit=crop", caption: "I am Virelia — Germany" }
];

const slidesEl = document.getElementById('slides');
const dotsEl   = document.getElementById('dots');

let idx = 0;
let timer = null;

function renderSlides(){
  slidesEl.innerHTML = SLIDES.map((s,i)=>`
    <figure class="slide ${i===idx?'active':''}">
      <img src="${s.src}" alt="${s.caption}" />
      <figcaption>${s.caption}</figcaption>
    </figure>
  `).join('');

  dotsEl.innerHTML = SLIDES.map((_,i)=>`
    <button class="dot ${i===idx?'active':''}" aria-label="Go to slide ${i+1}" data-i="${i}"></button>
  `).join('');
}

function next(){ idx = (idx+1) % SLIDES.length; renderSlides(); }
function prev(){ idx = (idx-1+SLIDES.length) % SLIDES.length; renderSlides(); }

function startAuto(){ timer = setInterval(next, 5000); }
function stopAuto(){ clearInterval(timer); }

renderSlides();
startAuto();

// Controls
document.querySelector('.next').addEventListener('click', ()=>{ stopAuto(); next(); startAuto(); });
document.querySelector('.prev').addEventListener('click', ()=>{ stopAuto(); prev(); startAuto(); });
dotsEl.addEventListener('click', (e)=>{
  const b = e.target.closest('.dot');
  if(!b) return;
  stopAuto();
  idx = +b.dataset.i;
  renderSlides();
  startAuto();
});
