/* =========================================================
   K-BRIDGE — CONFIG
   Supabase를 연결하려면 아래 두 값을 채우세요.
   (Settings → API 에서 Project URL / anon public key 복사)
   값을 비워두면 자동으로 "로컬 데모 모드"로 동작합니다
   (사진/로그인 정보가 이 브라우저에만 저장됩니다).
========================================================= */
const SUPABASE_URL = "https://yapsgxyqpmppojqtjoeq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhcHNneHlxcG1wcG9qcXRqb2VxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNjYwOTgsImV4cCI6MjA5OTg0MjA5OH0.8O-D8Qmd4tqA__c72_y49FJXVpVzCZW_vnx373icb8Y";
const ADMIN_PASSWORD = "0000"; // 로컬 데모 모드에서만 사용되는 비밀번호
// Supabase가 연결된 경우, 관리자 로그인은 아래 이메일 계정으로 실제 인증됩니다.
// Supabase 대시보드 → Authentication → Users → Add user 에서 이 이메일로 계정을 만들고,
// 그 계정 비밀번호를 관리자 로그인 창에 입력하는 비밀번호로 사용하세요 (최소 6자 이상).
const ADMIN_EMAIL = "admin@kbridge.org";

let sb = null;
const DEMO_MODE = !SUPABASE_URL || !SUPABASE_ANON_KEY;
if (!DEMO_MODE) {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/* ---------------------------------------------------------
   DATA LAYER — works with Supabase if configured,
   otherwise falls back to localStorage so the site is fully
   functional out of the box.
   Supabase table expected: gallery_images (id, section, url, created_at)
   Supabase storage bucket expected: "gallery" (public)
--------------------------------------------------------- */
async function loadImages(section){
  if (!DEMO_MODE){
    try{
      const { data, error } = await sb.from('gallery_images').select('*').eq('section', section).order('created_at');
      if (error){
        console.error(`[K-BRIDGE] "${section}" 갤러리 불러오기 실패:`, error.message || error.details || error.hint || JSON.stringify(error));
        return [];
      }
      return (data || []).map(r => ({ id:r.id, url:r.url }));
    } catch(err){
      console.error(`[K-BRIDGE] "${section}" 갤러리 불러오기 중 예외 발생:`, err.message || err);
      return [];
    }
  }
  const store = JSON.parse(localStorage.getItem('kbridge_gallery') || '{}');
  return store[section] || [];
}

async function addImage(section, file){
  if (!DEMO_MODE){
    const path = `${section}/${Date.now()}_${file.name}`;
    const { error: upErr } = await sb.storage.from('gallery').upload(path, file);
    if (upErr){ throw new Error(upErr.message || '업로드 실패'); }
    const { data: pub } = sb.storage.from('gallery').getPublicUrl(path);
    const { error: dbErr } = await sb.from('gallery_images').insert({ section, url: pub.publicUrl });
    if (dbErr){ throw new Error(dbErr.message || '데이터베이스 저장 실패'); }
    return;
  }
  const dataUrl = await compressToDataURL(file);
  const store = JSON.parse(localStorage.getItem('kbridge_gallery') || '{}');
  if (!store[section]) store[section] = [];
  store[section].push({ id: 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2), url: dataUrl });
  localStorage.setItem('kbridge_gallery', JSON.stringify(store));
}

async function deleteImage(section, id){
  if (!DEMO_MODE){
    try{
      const { error } = await sb.from('gallery_images').delete().eq('id', id);
      if (error) console.error(`[K-BRIDGE] 사진 삭제 실패:`, error.message || error);
    } catch(err){
      console.error(`[K-BRIDGE] 사진 삭제 중 예외 발생:`, err.message || err);
    }
    return;
  }
  const store = JSON.parse(localStorage.getItem('kbridge_gallery') || '{}');
  store[section] = (store[section] || []).filter(img => img.id !== id);
  localStorage.setItem('kbridge_gallery', JSON.stringify(store));
}

function compressToDataURL(file, maxW=1000, quality=0.8){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function renderGallery(section, targetEl, adminMode=false){
  const images = await loadImages(section);
  targetEl.innerHTML = '';
  if (images.length === 0 && !adminMode){
    return; // stays empty/invisible on public page
  }
  if (images.length === 0 && adminMode){
    targetEl.innerHTML = `<div class="gallery-empty">${t('adminpanel.empty')}</div>`;
    return;
  }
  images.forEach(img => {
    const wrap = document.createElement('div');
    if (adminMode) wrap.className = 'gallery-admin-item';
    const el = document.createElement('img');
    el.src = img.url;
    wrap.appendChild(el);
    if (adminMode){
      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.onclick = async () => {
        await deleteImage(section, img.id);
        renderGallery(section, targetEl, true);
        renderAllPublicGalleries();
        if (section === 'hero') renderHeroCarousel();
      };
      wrap.appendChild(delBtn);
    }
    targetEl.appendChild(wrap);
  });
}

function renderAllPublicGalleries(){
  document.querySelectorAll('[data-gallery]').forEach(el => {
    renderGallery(el.dataset.gallery, el, false);
  });
}
renderAllPublicGalleries();

/* ---------------------------------------------------------
   HERO CAROUSEL — images come from the same admin-managed
   "hero" gallery (upload/delete already handled in the Admin
   Panel). Public visitors only ever see the slideshow.
--------------------------------------------------------- */
let heroSlideUrls = [];
let heroCurrentIndex = 0;
let heroAutoplayTimer = null;
const HERO_AUTOPLAY_MS = 5200;

async function renderHeroCarousel(){
  const carouselEl = document.getElementById('heroCarousel');
  if (!carouselEl) return; // this page has no hero carousel (not the homepage)
  heroSlideUrls = (await loadImages('hero')).map(img => img.url);
  const dotsEl = document.getElementById('heroDots');
  const prevBtn = document.getElementById('heroPrev');
  const nextBtn = document.getElementById('heroNext');
  carouselEl.innerHTML = '';
  dotsEl.innerHTML = '';

  if (heroSlideUrls.length === 0){
    prevBtn.style.display = 'none';
    nextBtn.style.display = 'none';
    if (heroAutoplayTimer) clearInterval(heroAutoplayTimer);
    return;
  }

  prevBtn.style.display = heroSlideUrls.length > 1 ? '' : 'none';
  nextBtn.style.display = heroSlideUrls.length > 1 ? '' : 'none';

  heroSlideUrls.forEach((url, i) => {
    const slide = document.createElement('div');
    slide.className = 'hero-slide' + (i === 0 ? ' active' : '');
    slide.style.backgroundImage = `url("${url}")`;
    carouselEl.appendChild(slide);

    const dot = document.createElement('button');
    dot.className = 'hero-dot' + (i === 0 ? ' active' : '');
    if (i === 0){
      const fill = document.createElement('span');
      fill.className = 'hero-dot-fill';
      dot.appendChild(fill);
    }
    dot.addEventListener('click', () => goToHeroSlide(i));
    dotsEl.appendChild(dot);
  });

  heroCurrentIndex = 0;
  restartHeroAutoplay();
}

function goToHeroSlide(index){
  if (heroSlideUrls.length === 0) return;
  heroCurrentIndex = (index + heroSlideUrls.length) % heroSlideUrls.length;
  document.querySelectorAll('.hero-slide').forEach((s, i) => s.classList.toggle('active', i === heroCurrentIndex));
  document.querySelectorAll('.hero-dot').forEach((d, i) => {
    d.classList.toggle('active', i === heroCurrentIndex);
    d.innerHTML = '';
    if (i === heroCurrentIndex){
      const fill = document.createElement('span');
      fill.className = 'hero-dot-fill';
      d.appendChild(fill);
    }
  });
  // replay the bottom-to-top text reveal each time the slide changes
  const textBlock = document.getElementById('heroTextBlock');
  if (textBlock){
    textBlock.style.animation = 'none';
    void textBlock.offsetWidth; // force reflow so the animation restarts
    textBlock.style.animation = '';
    textBlock.classList.remove('replay');
    void textBlock.offsetWidth;
    textBlock.classList.add('replay');
  }
  restartHeroAutoplay();
}
function nextHeroSlide(){ goToHeroSlide(heroCurrentIndex + 1); }
function prevHeroSlide(){ goToHeroSlide(heroCurrentIndex - 1); }
function restartHeroAutoplay(){
  if (heroAutoplayTimer) clearInterval(heroAutoplayTimer);
  if (heroSlideUrls.length > 1){
    heroAutoplayTimer = setInterval(nextHeroSlide, HERO_AUTOPLAY_MS);
  }
}
const heroNextBtnEl = document.getElementById('heroNext');
const heroPrevBtnEl = document.getElementById('heroPrev');
if (heroNextBtnEl) heroNextBtnEl.addEventListener('click', nextHeroSlide);
if (heroPrevBtnEl) heroPrevBtnEl.addEventListener('click', prevHeroSlide);
renderHeroCarousel();

/* ---------------------------------------------------------
   NAV DROPDOWNS
--------------------------------------------------------- */
document.querySelectorAll('.nav-item').forEach(item => {
  const btn = item.querySelector('button');
  btn.addEventListener('click', (e) => {
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
    const targetSel = btn.dataset.target;
    if (targetSel){
      item.classList.remove('open');
      if (targetSel.startsWith('#')){
        const targetEl = document.querySelector(targetSel);
        if (targetEl) targetEl.scrollIntoView({ behavior:'smooth' });
      } else {
        window.location.href = targetSel;
      }
    }
  });
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.nav-item')) document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('open'));
});
document.querySelectorAll('.dropdown a').forEach(a => {
  a.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('open'));
  });
});
document.querySelectorAll('[data-i18n="cta.donate"]').forEach(btn => {
  btn.addEventListener('click', () => { window.location.href = 'donate-regular.html'; });
});

/* ---------------------------------------------------------
   MODALS
--------------------------------------------------------- */
function openModal(id){ document.getElementById(id).classList.add('active'); }
function closeModal(id){ document.getElementById(id).classList.remove('active'); }
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
document.querySelectorAll('.modal-overlay').forEach(ov => ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('active'); }));
document.querySelectorAll('[data-switch]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.modal-overlay').forEach(o => o.classList.remove('active'));
  openModal(b.dataset.switch);
}));

document.getElementById('openLogin').addEventListener('click', () => openModal('loginModal'));
document.getElementById('openSignup').addEventListener('click', () => openModal('signupModal'));

/* ---------------------------------------------------------
   AUTH (Supabase if configured, else demo localStorage)
--------------------------------------------------------- */
document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const statusEl = document.getElementById('signupStatus');
  if (!email || !password){ statusEl.textContent = t('status.fillall'); statusEl.className='status-msg err'; return; }
  try{
    if (!DEMO_MODE){
      const { error } = await sb.auth.signUp({ email, password, options:{ data:{ name } } });
      if (error) throw error;
    } else {
      const users = JSON.parse(localStorage.getItem('kbridge_users') || '[]');
      if (users.find(u => u.email === email)) throw new Error(t('status.exists'));
      users.push({ name, email, password });
      localStorage.setItem('kbridge_users', JSON.stringify(users));
    }
    statusEl.textContent = t('status.signupok'); statusEl.className='status-msg ok';
    setTimeout(() => closeModal('signupModal'), 1200);
  } catch(err){
    statusEl.textContent = err.message || t('status.error'); statusEl.className='status-msg err';
  }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const statusEl = document.getElementById('loginStatus');
  if (!email || !password){ statusEl.textContent = t('status.fillall'); statusEl.className='status-msg err'; return; }
  try{
    if (!DEMO_MODE){
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(t('status.needsignup'));
    } else {
      const users = JSON.parse(localStorage.getItem('kbridge_users') || '[]');
      const account = users.find(u => u.email === email);
      if (!account) throw new Error(t('status.needsignup'));
      if (account.password !== password) throw new Error(t('status.wrongpw'));
    }
    statusEl.textContent = t('status.loginok'); statusEl.className='status-msg ok';
    setTimeout(() => closeModal('loginModal'), 1000);
  } catch(err){
    statusEl.textContent = err.message || t('status.error'); statusEl.className='status-msg err';
  }
});

/* password show/hide toggle */
document.querySelectorAll('.pw-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    if (input.type === 'password'){ input.type = 'text'; btn.textContent = '🙈'; }
    else { input.type = 'password'; btn.textContent = '👁'; }
  });
});

/* ---------------------------------------------------------
   LOGO -> HOME
--------------------------------------------------------- */
document.getElementById('logoHomeBtn').addEventListener('click', () => {
  const heroEl = document.getElementById('hero');
  if (heroEl){ heroEl.scrollIntoView({ behavior:'smooth' }); }
  else { window.location.href = 'index.html'; }
});

/* ---------------------------------------------------------
   DONATIONS DATA LAYER
   Supabase table expected: donations (id, donor_name, amount, note, created_at)
--------------------------------------------------------- */
async function loadDonations(){
  if (!DEMO_MODE){
    try{
      const { data, error } = await sb.from('donations').select('*').order('created_at', { ascending:false });
      if (error){ console.error('[K-BRIDGE] 후원 내역 불러오기 실패:', error.message || error); return []; }
      return data || [];
    } catch(err){
      console.error('[K-BRIDGE] 후원 내역 불러오기 중 예외:', err.message || err);
      return [];
    }
  }
  return JSON.parse(localStorage.getItem('kbridge_donations') || '[]').sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
}
async function addDonation({ name, amount, note }){
  if (!DEMO_MODE){
    const { error } = await sb.from('donations').insert({ donor_name: name || 'Anonymous', amount, note });
    if (error) throw new Error(error.message || '후원 내역 저장 실패');
    return;
  }
  const list = JSON.parse(localStorage.getItem('kbridge_donations') || '[]');
  list.push({ id:'local_' + Date.now(), donor_name:name || 'Anonymous', amount, note, created_at:new Date().toISOString() });
  localStorage.setItem('kbridge_donations', JSON.stringify(list));
}
async function deleteDonation(id){
  if (!DEMO_MODE){
    const { error } = await sb.from('donations').delete().eq('id', id);
    if (error) console.error('[K-BRIDGE] 후원 내역 삭제 실패:', error.message || error);
    return;
  }
  const list = JSON.parse(localStorage.getItem('kbridge_donations') || '[]').filter(d => d.id !== id);
  localStorage.setItem('kbridge_donations', JSON.stringify(list));
}
async function renderDonationsPublic(){
  const list = await loadDonations();
  const total = list.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const totalEl = document.getElementById('donationTotal');
  if (totalEl) totalEl.textContent = 'RM ' + total.toLocaleString();
  const listEl = document.getElementById('donationList');
  if (listEl){
    if (list.length === 0){
      listEl.innerHTML = `<div class="gallery-empty">${t('transparency.empty')}</div>`;
    } else {
      listEl.innerHTML = list.slice(0,6).map(d => `
        <div class="admin-donation-row">
          <span>${(d.donor_name || 'Anonymous')}${d.note ? ' · ' + d.note : ''}</span>
          <strong>RM ${Number(d.amount || 0).toLocaleString()}</strong>
        </div>`).join('');
    }
  }
}
async function renderDonationsAdmin(){
  const list = await loadDonations();
  const el = document.getElementById('adminDonationList');
  if (list.length === 0){
    el.innerHTML = `<div class="gallery-empty">${t('donationadmin.empty')}</div>`;
    return;
  }
  el.innerHTML = '';
  list.forEach(d => {
    const row = document.createElement('div');
    row.className = 'admin-donation-row';
    row.innerHTML = `<span>${(d.donor_name || 'Anonymous')} — RM ${Number(d.amount||0).toLocaleString()}<div class="meta">${d.note || ''}</div></span>`;
    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.onclick = async () => { await deleteDonation(d.id); renderDonationsAdmin(); renderDonationsPublic(); };
    row.appendChild(delBtn);
    el.appendChild(row);
  });
}
renderDonationsPublic();

document.getElementById('donationAddBtn').addEventListener('click', async () => {
  const name = document.getElementById('donationName').value.trim();
  const amount = parseFloat(document.getElementById('donationAmount').value);
  const note = document.getElementById('donationNote').value.trim();
  const statusEl = document.getElementById('donationAddStatus');
  if (!amount || amount <= 0){ statusEl.textContent = t('status.fillall'); statusEl.className='status-msg err'; return; }
  try{
    await addDonation({ name, amount, note });
    statusEl.textContent = t('status.uploadok'); statusEl.className='status-msg ok';
    document.getElementById('donationName').value = '';
    document.getElementById('donationAmount').value = '';
    document.getElementById('donationNote').value = '';
    renderDonationsAdmin();
    renderDonationsPublic();
  } catch(err){
    statusEl.textContent = err.message || t('status.error'); statusEl.className='status-msg err';
  }
});

/* ---------------------------------------------------------
   ADMIN
--------------------------------------------------------- */
let isAdmin = false;
document.getElementById('adminLink').addEventListener('click', (e) => {
  e.preventDefault();
  if (isAdmin) openAdminPanel(); else openModal('adminLoginModal');
});
// URL 뒤에 #admin 을 붙이면 (예: kbridge.netlify.app/#admin) 관리자 로그인 창이 자동으로 열립니다.
if (location.hash === '#admin' || location.search.includes('admin')){
  openModal('adminLoginModal');
}
document.getElementById('adminLoginSubmit').addEventListener('click', async () => {
  const pw = document.getElementById('adminPassword').value;
  const statusEl = document.getElementById('adminLoginStatus');
  try{
    if (!DEMO_MODE){
      const { error } = await sb.auth.signInWithPassword({ email: ADMIN_EMAIL, password: pw });
      if (error) throw new Error(t('status.wrongpw'));
    } else {
      if (pw !== ADMIN_PASSWORD) throw new Error(t('status.wrongpw'));
    }
    isAdmin = true;
    statusEl.textContent = ''; document.getElementById('adminPassword').value = '';
    closeModal('adminLoginModal');
    openAdminPanel();
  } catch(err){
    statusEl.textContent = err.message || t('status.wrongpw'); statusEl.className='status-msg err';
  }
});
function openAdminPanel(){
  openModal('adminPanelModal');
  const sel = document.getElementById('adminSectionSelect');
  renderGallery(sel.value, document.getElementById('adminGalleryPreview'), true);
  renderDonationsAdmin();
}
document.getElementById('adminSectionSelect').addEventListener('change', (e) => {
  renderGallery(e.target.value, document.getElementById('adminGalleryPreview'), true);
});
document.getElementById('adminUploadBtn').addEventListener('click', async () => {
  const files = document.getElementById('adminFileInput').files;
  const section = document.getElementById('adminSectionSelect').value;
  const statusEl = document.getElementById('adminUploadStatus');
  if (!files.length){ statusEl.textContent = t('status.choosefile'); statusEl.className='status-msg err'; return; }
  statusEl.textContent = t('status.uploading'); statusEl.className='status-msg';
  try{
    for (const file of files){ await addImage(section, file); }
    statusEl.textContent = t('status.uploadok'); statusEl.className='status-msg ok';
    document.getElementById('adminFileInput').value = '';
    renderGallery(section, document.getElementById('adminGalleryPreview'), true);
    renderAllPublicGalleries();
    if (section === 'hero') renderHeroCarousel();
  } catch(err){
    statusEl.textContent = err.message || t('status.error'); statusEl.className='status-msg err';
  }
});

/* admin panel tab switching */
const adminTabPhotosBtn = document.getElementById('adminTabPhotos');
const adminTabDonationsBtn = document.getElementById('adminTabDonations');
const adminPhotosPanelEl = document.getElementById('adminPhotosPanel');
const adminDonationsPanelEl = document.getElementById('adminDonationsPanel');
adminTabPhotosBtn.addEventListener('click', () => {
  adminTabPhotosBtn.classList.add('active'); adminTabDonationsBtn.classList.remove('active');
  adminPhotosPanelEl.style.display = ''; adminDonationsPanelEl.style.display = 'none';
});
adminTabDonationsBtn.addEventListener('click', () => {
  adminTabDonationsBtn.classList.add('active'); adminTabPhotosBtn.classList.remove('active');
  adminDonationsPanelEl.style.display = ''; adminPhotosPanelEl.style.display = 'none';
  renderDonationsAdmin();
});

/* ---------------------------------------------------------
   SEARCH — jumps to first matching section heading
--------------------------------------------------------- */
document.getElementById('searchInput').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim().toLowerCase();
  if (!q) return;
  const candidates = document.querySelectorAll('section.block h2, section.vision-band h2, section.closing h2, .problem-card h3, .feature-card h3, .step h3');
  for (const el of candidates){
    if (el.textContent.toLowerCase().includes(q)){
      closeSearchOverlay();
      el.closest('section').scrollIntoView({ behavior:'smooth' });
      el.style.color = 'var(--gold-deep)';
      setTimeout(() => el.style.color = '', 1500);
      return;
    }
  }
});

/* =========================================================
   I18N
========================================================= */
const I18N = {
  ko:{
    "nav.donate":"후원","donate.regular":"정기후원","donate.onetime":"일시후원","donate.goods":"물품후원","donate.major":"고액기부","donate.super":"초고액기부",
    "donate.eyebrow":"후원","donate.title":"후원하기","donate.sub":"여러분의 후원은 난민 한 사람의 자립으로 이어집니다.",
    "donate.regular.body":"매달 일정 금액을 후원하여 지속적인 지원을 만듭니다.","donate.onetime.body":"원하실 때 한 번, 부담 없이 참여하실 수 있습니다.","donate.goods.body":"생활필수품, 전자기기 등 필요한 물품을 직접 전달합니다.","donate.major.body":"지역 확장과 새로운 기능 개발에 큰 힘이 됩니다.","donate.super.body":"K-BRIDGE의 장기 파트너로서 함께해 주세요.",
    "campaign.eyebrow":"캠페인","campaign.title":"캠페인","campaign.body":"현재 준비 중인 캠페인이 곧 이곳에 공개됩니다. 새로운 소식을 기대해 주세요!","campaign.viewall":"캠페인",
    "news.eyebrow":"소식","news.title":"소식","news.notice.body":"K-BRIDGE의 새로운 소식과 공지사항을 전해드립니다.","news.report.body":"후원금이 어떻게 쓰였는지 정기적으로 보고합니다.","news.archive.body":"활동 보고서와 자료를 모아두는 공간입니다.",
    "nav.campaign":"캠페인","nav.news":"소식","news.notice":"공지/뉴스","news.report":"후원보고","news.archive":"자료실",
    "nav.about":"소개","about.org":"재단소개","about.transparency":"투명경영",
    "search.ph":"검색","auth.login":"로그인","auth.signup":"회원가입","cta.donate":"후원하기",
    "hero.tagline":"말레이시아 난민을 기회로 연결하다","hero.p1":"일자리","hero.p2":"주거","hero.p3":"마켓","hero.p4":"카풀","hero.p5":"커뮤니티","hero.learn":"더 알아보기",
    "problems.eyebrow":"현황","problems.title":"현황과 문제",
    "problems.c1.title":"취업 불가","problems.c1.body":"말레이시아 내 18만 명 이상의 난민은 법적으로 취업이 불가합니다. 최저임금 이하로 착취당하는 경우가 많습니다.",
    "problems.c2.title":"불안전한 주거","problems.c2.body":"검증되지 않은 집주인에게 과도한 임대료를 내고 있습니다. 법적 보호나 커뮤니티 지원이 없습니다.",
    "problems.c3.title":"언어 장벽","problems.c3.body":"난민 커뮤니티에서는 9개 언어가 사용됩니다. 중요한 정보가 모든 사람에게 전달되지 않습니다.",
    "problems.c4.title":"이동수단 부재","problems.c4.body":"안전하고 저렴한 이동수단이 없어 일자리, 병원, 커뮤니티 자원에 접근하기 어렵습니다.",
    "solution.eyebrow":"해결책","solution.title":"해결책: K-BRIDGE 앱","solution.sub":"하나의 앱. 모든 필요. 모든 언어.",
    "solution.f1":"일자리","solution.f2":"주거","solution.f3":"마켓","solution.f4":"카풀","solution.f5":"커뮤니티","solution.f6":"9개 언어",
    "how.eyebrow":"작동 방식","how.title":"K-BRIDGE 작동 방식",
    "how.s1.title":"다운로드 & 가입","how.s1.body":"신뢰할 수 있는 NGO 파트너에서 받은 초대 코드로 가입합니다.",
    "how.s2.title":"500 포인트 지급","how.s2.body":"신규 회원 모두에게 500 K-BRIDGE 포인트(약 RM 50)가 지급됩니다.",
    "how.s3.title":"필요한 것 검색","how.s3.body":"자신의 언어로 일자리, 주거, 마켓, 카풀을 찾습니다.",
    "how.s4.title":"직거래 & 연결","how.s4.body":"직접 만나서 포인트, Touch 'n Go, 또는 현금으로 거래합니다.",
    "points.eyebrow":"포인트 시스템","points.title":"K-BRIDGE 포인트 시스템",
    "points.h1":"⭐ 포인트 작동 방식","points.l1":"1 포인트 = RM 0.10","points.l2":"신규 회원: 무료 500 포인트 지급","points.l3":"Touch 'n Go로 충전 가능","points.l4":"GrabPay로 충전 가능","points.l5":"NGO 사무소에서 현금 충전","points.l6":"포인트로 카풀 및 물품 구매",
    "points.h2":"💳 은행 계좌 없이도 가능한 이유","points.r1":"난민은 법적으로 은행 계좌 개설이 어렵습니다","points.r2":"Touch 'n Go & GrabPay는 계좌 없이 사용 가능","points.r3":"파트너 NGO 사무소에서 현금 충전 가능","points.r4":"중간 거래자 없는 개인 간 직접 결제","points.r5":"앱 내 안전하고 투명한 거래 내역 제공",
    "points.security":"보안: 초대 코드 시스템 + 인증된 사용자 + 리뷰 평점 = 안전한 커뮤니티",
    "revenue.eyebrow":"지속가능성","revenue.title":"수익 및 지속가능성 모델",
    "revenue.c1.title":"📢 광고 수입","revenue.c1.body":"현지 기업이 난민 1만 명+에게 광고. 배너 광고 & 프리미엄 게시. 월 RM 200~500.",
    "revenue.c2.title":"🙏 후원 및 기부","revenue.c2.body":"개인 및 기업 후원자. RM 10 = 난민 가족에게 100 포인트 지원. PayPal / TnG / FPX 가능.",
    "revenue.c3.title":"🤝 NGO 파트너십","revenue.c3.body":"NGO가 수혜자를 위해 초대 코드 스폰서. UNHCR, 월드비전과 공동 브랜드 프로그램.",
    "revenue.c4.title":"💼 프리미엄 게시","revenue.c4.body":"고용주 및 집주인이 인증된 게시물 등록. 중소기업도 부담 없는 RM 50~200/건.",
    "vision.eyebrow":"👑 우리의 비전","vision.title":"비전: 난민 IT 팀","vision.sub":"난민은 수혜자가 아닌 — 우리 팀의 일원입니다.",
    "vision.c1.title":"앱 개발자","vision.c1.body":"난민에게 Flutter & 웹 개발을 교육하여 K-BRIDGE 앱을 직접 개발·유지합니다.",
    "vision.c2.title":"커뮤니티 매니저","vision.c2.body":"난민 리더가 자신의 커뮤니티를 관리하고 콘텐츠를 모더레이션하며 안전을 보장합니다.",
    "vision.c3.title":"번역가","vision.c3.body":"모국어 사용자가 앱의 9개 언어 전체에 걸쳐 정확한 번역을 담당합니다.",
    "vision.c4.title":"데이터 분석가","vision.c4.body":"사용 현황을 추적하고 필요를 파악하여 NGO 파트너의 사회적 영향 측정을 지원합니다.",
    "partner.eyebrow":"파트너십 제안","partner.title":"귀 기관과의 파트너십 제안",
    "partner.need":"저희가 필요로 하는 것","partner.n1":"수혜자에게 초대 코드 배포","partner.n2":"신뢰할 수 있는 고용주 및 집주인 검증","partner.n3":"커뮤니티 피드를 통한 안전 정보 공유","partner.n4":"난민과의 신뢰 구축을 위한 공동 브랜딩","partner.n5":"사무소에서 포인트 현금 충전 서비스 제공",
    "partner.gain":"귀 기관이 얻는 것","partner.g1":"지역 난민 필요에 대한 실시간 데이터","partner.g2":"지원물자 및 정보 배포를 위한 디지털 플랫폼","partner.g3":"후원자를 위한 월간 임팩트 보고서","partner.g4":"1만 명+ 사용자에게 공동 브랜드 노출","partner.g5":"난민이 직접 운영하는 기술 팀",
    "partner.strip":"파트너 기관: UNHCR Malaysia · World Vision · Pusat Kebajikan GoodHope",
    "roadmap.eyebrow":"런칭 계획","roadmap.title":"런칭 로드맵",
    "roadmap.p1":"1단계 · 1~2개월","roadmap.p1.title":"기반 구축","roadmap.p1.l1":"NGO 파트너십 협약 체결","roadmap.p1.l2":"초대 코드 배포","roadmap.p1.l3":"KL 지역 베타 사용자 50~100명","roadmap.p1.l4":"버마어 + 영어로 런칭",
    "roadmap.p2":"2단계 · 3~4개월","roadmap.p2.title":"성장","roadmap.p2.l1":"마켓 & 카풀 기능 오픈","roadmap.p2.l2":"결제 시스템 실제 운영","roadmap.p2.l3":"활성 사용자 500명+","roadmap.p2.l4":"난민 IT 팀 구성",
    "roadmap.p3":"3단계 · 5~6개월","roadmap.p3.title":"확장","roadmap.p3.l1":"사용자 1만 명+","roadmap.p3.l2":"광고 수입 시작","roadmap.p3.l3":"후원 캠페인 런칭","roadmap.p3.l4":"페낭 & 조호르바루 확장",
    "closing.title":"함께 만들어 갑시다","closing.sub1":"K-BRIDGE는 앱 그 이상입니다 — 하나의 운동입니다.","closing.sub2":"난민이 난민을 돕습니다. 기술이 인류를 섬깁니다. 믿음으로 세우고, 공동체로 지속합니다.",
    "closing.verse":"\"내가 나그네 되었을 때에 영접하였고\" — 마태복음 25:35",
    "footer.copy":"© 2024 K-BRIDGE. All rights reserved.","footer.admin":"관리자",
    "login.title":"로그인","login.sub":"K-BRIDGE 계정으로 로그인하세요.","login.submit":"로그인","login.noaccount":"계정이 없으신가요?",
    "signup.title":"회원가입","signup.sub":"K-BRIDGE와 함께해 주세요.","signup.submit":"가입하기","signup.hasaccount":"이미 계정이 있으신가요?",
    "field.email":"이메일 (아이디)","field.password":"비밀번호","field.name":"이름",
    "adminlogin.title":"관리자 로그인","adminlogin.sub":"관리자 비밀번호를 입력하세요.","adminlogin.submit":"접속",
    "adminpanel.title":"사진 관리","adminpanel.sub":"섹션을 선택하고 사진을 업로드 / 삭제하세요.","adminpanel.select":"섹션 선택","adminpanel.upload":"업로드","adminpanel.current":"현재 사진","adminpanel.empty":"등록된 사진이 없습니다.",
    "adminpanel.mainTitle":"관리자 패널","adminpanel.tabPhotos":"사진 관리","adminpanel.tabDonations":"후원 관리",
    "donationadmin.sub":"새 후원 내역을 등록하면 홈페이지 투명경영 섹션에 바로 반영됩니다.","donationadmin.name":"후원자 이름","donationadmin.amount":"금액 (RM)","donationadmin.note":"메모 (선택)","donationadmin.add":"후원 내역 추가","donationadmin.list":"등록된 후원 내역","donationadmin.empty":"등록된 후원 내역이 없습니다.",
    "transparency.empty":"아직 등록된 후원 내역이 없습니다.",
    "status.fillall":"모든 항목을 입력해 주세요.","status.exists":"이미 가입된 이메일입니다.","status.signupok":"가입이 완료되었습니다!","status.badlogin":"이메일 또는 비밀번호가 올바르지 않습니다.","status.needsignup":"가입되지 않은 계정입니다. 회원가입을 먼저 해주세요.","status.loginok":"로그인되었습니다!","status.error":"오류가 발생했습니다.","status.wrongpw":"비밀번호가 올바르지 않습니다.","status.choosefile":"파일을 선택해 주세요.","status.uploading":"업로드 중...","status.uploadok":"업로드 완료!"
  },
  en:{
    "nav.donate":"Donate","donate.regular":"Monthly Giving","donate.onetime":"One-time Gift","donate.goods":"In-kind Donation","donate.major":"Major Gift","donate.super":"Legacy Gift",
    "donate.eyebrow":"DONATE","donate.title":"Support Us","donate.sub":"Your donation helps one refugee become self-reliant.",
    "donate.regular.body":"Give a set amount every month to provide ongoing support.","donate.onetime.body":"Make a one-time gift whenever you're able.","donate.goods.body":"Donate essentials or electronics directly to those in need.","donate.major.body":"Major gifts power regional expansion and new features.","donate.super.body":"Become a long-term partner of K-BRIDGE.",
    "campaign.eyebrow":"CAMPAIGNS","campaign.title":"Campaigns","campaign.body":"New campaigns are in the works and will appear here soon. Stay tuned!","campaign.viewall":"Campaigns",
    "news.eyebrow":"NEWS","news.title":"News","news.notice.body":"The latest news and announcements from K-BRIDGE.","news.report.body":"Regular reports on how donations are being used.","news.archive.body":"A library of activity reports and resources.",
    "nav.campaign":"Campaigns","nav.news":"News","news.notice":"Notices/News","news.report":"Impact Reports","news.archive":"Resources",
    "nav.about":"About Us","about.org":"About Us","about.transparency":"Transparency",
    "search.ph":"Search","auth.login":"Log in","auth.signup":"Sign up","cta.donate":"Donate Now",
    "hero.tagline":"Connecting Malaysian refugees to opportunity","hero.p1":"Jobs","hero.p2":"Housing","hero.p3":"Marketplace","hero.p4":"Carpool","hero.p5":"Community","hero.learn":"Learn more",
    "problems.eyebrow":"CURRENT SITUATION","problems.title":"The Situation and the Problems",
    "problems.c1.title":"No Legal Employment","problems.c1.body":"Over 180,000 refugees in Malaysia cannot legally work, and are often exploited below minimum wage.",
    "problems.c2.title":"Unsafe Housing","problems.c2.body":"Refugees pay inflated rent to unverified landlords, with no legal protection or community support.",
    "problems.c3.title":"Language Barriers","problems.c3.body":"9 languages are spoken across the refugee community, and critical information doesn't reach everyone.",
    "problems.c4.title":"No Transportation","problems.c4.body":"Without safe, affordable transport, it's hard to reach jobs, clinics, and community resources.",
    "solution.eyebrow":"THE SOLUTION","solution.title":"The Solution: The K-BRIDGE App","solution.sub":"One app. Every need. Every language.",
    "solution.f1":"Jobs","solution.f2":"Housing","solution.f3":"Marketplace","solution.f4":"Carpool","solution.f5":"Community","solution.f6":"9 Languages",
    "how.eyebrow":"HOW IT WORKS","how.title":"How K-BRIDGE Works",
    "how.s1.title":"Download & Join","how.s1.body":"Sign up using an invite code from a trusted NGO partner.",
    "how.s2.title":"Get 500 Points","how.s2.body":"Every new member receives 500 K-BRIDGE points (about RM 50).",
    "how.s3.title":"Search What You Need","how.s3.body":"Find jobs, housing, marketplace listings, and carpools in your own language.",
    "how.s4.title":"Meet & Connect","how.s4.body":"Meet in person and pay with points, Touch 'n Go, or cash.",
    "points.eyebrow":"POINTS SYSTEM","points.title":"The K-BRIDGE Points System",
    "points.h1":"⭐ How Points Work","points.l1":"1 point = RM 0.10","points.l2":"New members receive 500 free points","points.l3":"Top up via Touch 'n Go","points.l4":"Top up via GrabPay","points.l5":"Cash top-up at NGO offices","points.l6":"Use points for carpools and goods",
    "points.h2":"💳 Why It Works Without a Bank Account","points.r1":"Refugees legally struggle to open bank accounts","points.r2":"Touch 'n Go & GrabPay work without one","points.r3":"Cash top-ups available at partner NGO offices","points.r4":"Direct peer-to-peer payment, no middlemen","points.r5":"Safe, transparent transaction history in-app",
    "points.security":"Security: invite codes + verified users + ratings = a safe community",
    "revenue.eyebrow":"SUSTAINABILITY","revenue.title":"Revenue and Sustainability Model",
    "revenue.c1.title":"📢 Advertising","revenue.c1.body":"Local businesses advertise to 10,000+ refugees. Banner ads & premium listings. RM 200–500/month.",
    "revenue.c2.title":"🙏 Donations","revenue.c2.body":"Individual and corporate donors. RM 10 = 100 points for a refugee family. PayPal / TnG / FPX supported.",
    "revenue.c3.title":"🤝 NGO Partnerships","revenue.c3.body":"NGOs sponsor invite codes for beneficiaries. Co-branded programs with UNHCR and World Vision.",
    "revenue.c4.title":"💼 Premium Listings","revenue.c4.body":"Employers and landlords post verified listings. Affordable for small businesses at RM 50–200 per listing.",
    "vision.eyebrow":"👑 OUR VISION","vision.title":"Vision: A Refugee-Led IT Team","vision.sub":"Refugees aren't beneficiaries — they're part of our team.",
    "vision.c1.title":"App Developers","vision.c1.body":"We train refugees in Flutter & web development to build and maintain the K-BRIDGE app themselves.",
    "vision.c2.title":"Community Managers","vision.c2.body":"Refugee leaders manage their own communities, moderate content, and ensure safety.",
    "vision.c3.title":"Translators","vision.c3.body":"Native speakers handle accurate translation across all 9 languages in the app.",
    "vision.c4.title":"Data Analysts","vision.c4.body":"They track usage and needs, supporting NGO partners' social impact measurement.",
    "partner.eyebrow":"PARTNERSHIP PROPOSAL","partner.title":"A Partnership Proposal for Your Organization",
    "partner.need":"What We Need","partner.n1":"Distribute invite codes to beneficiaries","partner.n2":"Verify trustworthy employers and landlords","partner.n3":"Share safety information via community feed","partner.n4":"Co-branding to build trust with refugees","partner.n5":"Cash top-up service for points at your office",
    "partner.gain":"What Your Organization Gains","partner.g1":"Real-time data on local refugee needs","partner.g2":"A digital platform for distributing aid and information","partner.g3":"Monthly impact reports for donors","partner.g4":"Co-branded exposure to 10,000+ users","partner.g5":"A refugee-run technology team",
    "partner.strip":"Partner organizations: UNHCR Malaysia · World Vision · Pusat Kebajikan GoodHope",
    "roadmap.eyebrow":"LAUNCH ROADMAP","roadmap.title":"Launch Roadmap",
    "roadmap.p1":"Phase 1 · Months 1–2","roadmap.p1.title":"Foundation","roadmap.p1.l1":"Sign NGO partnership agreements","roadmap.p1.l2":"Distribute invite codes","roadmap.p1.l3":"50–100 beta users in KL","roadmap.p1.l4":"Launch in Burmese + English",
    "roadmap.p2":"Phase 2 · Months 3–4","roadmap.p2.title":"Growth","roadmap.p2.l1":"Launch marketplace & carpool features","roadmap.p2.l2":"Live payment system","roadmap.p2.l3":"500+ active users","roadmap.p2.l4":"Build refugee IT team",
    "roadmap.p3":"Phase 3 · Months 5–6","roadmap.p3.title":"Expansion","roadmap.p3.l1":"10,000+ users","roadmap.p3.l2":"Advertising revenue begins","roadmap.p3.l3":"Launch donation campaign","roadmap.p3.l4":"Expand to Penang & Johor Bahru",
    "closing.title":"Let's Build This Together","closing.sub1":"K-BRIDGE is more than an app — it's a movement.","closing.sub2":"Refugees helping refugees. Technology serving humanity. Built on faith, sustained by community.",
    "closing.verse":"\"I was a stranger and you welcomed me\" — Matthew 25:35",
    "footer.copy":"© 2024 K-BRIDGE. All rights reserved.","footer.admin":"Admin",
    "login.title":"Log In","login.sub":"Log in to your K-BRIDGE account.","login.submit":"Log In","login.noaccount":"Don't have an account?",
    "signup.title":"Sign Up","signup.sub":"Join the K-BRIDGE community.","signup.submit":"Sign Up","signup.hasaccount":"Already have an account?",
    "field.email":"Email (ID)","field.password":"Password","field.name":"Name",
    "adminlogin.title":"Admin Login","adminlogin.sub":"Enter the admin password.","adminlogin.submit":"Enter",
    "adminpanel.title":"Photo Manager","adminpanel.sub":"Choose a section, then upload or delete photos.","adminpanel.select":"Select section","adminpanel.upload":"Upload","adminpanel.current":"Current photos","adminpanel.empty":"No photos yet.",
    "adminpanel.mainTitle":"Admin Panel","adminpanel.tabPhotos":"Photos","adminpanel.tabDonations":"Donations",
    "donationadmin.sub":"New entries appear on the Transparency section right away.","donationadmin.name":"Donor name","donationadmin.amount":"Amount (RM)","donationadmin.note":"Note (optional)","donationadmin.add":"Add donation","donationadmin.list":"Donation records","donationadmin.empty":"No donations recorded yet.",
    "transparency.empty":"No donations recorded yet.",
    "status.fillall":"Please fill in all fields.","status.exists":"This email is already registered.","status.signupok":"Sign-up complete!","status.badlogin":"Incorrect email or password.","status.needsignup":"No account found. Please sign up first.","status.loginok":"Logged in!","status.error":"Something went wrong.","status.wrongpw":"Incorrect password.","status.choosefile":"Please choose a file.","status.uploading":"Uploading...","status.uploadok":"Upload complete!"
  },
  zh:{
    "nav.donate":"捐款","donate.regular":"定期捐款","donate.onetime":"单次捐款","donate.goods":"物资捐赠","donate.major":"大额捐赠","donate.super":"特大额捐赠",
    "donate.eyebrow":"捐款","donate.title":"立即捐款","donate.sub":"您的捐款能帮助一位难民实现自立。",
    "donate.regular.body":"每月定期捐款，提供持续的支持。","donate.onetime.body":"随时进行一次性捐款，无负担参与。","donate.goods.body":"直接捐赠生活必需品或电子产品给有需要的人。","donate.major.body":"大额捐赠助力地区扩展与新功能开发。","donate.super.body":"成为K-BRIDGE的长期合作伙伴。",
    "campaign.eyebrow":"活动","campaign.title":"活动","campaign.body":"新的活动正在筹备中，即将在此发布，敬请期待！","campaign.viewall":"活动",
    "news.eyebrow":"消息","news.title":"消息","news.notice.body":"K-BRIDGE的最新消息与公告。","news.report.body":"定期报告捐款的使用情况。","news.archive.body":"存放活动报告与资料的空间。",
    "nav.campaign":"活动","nav.news":"消息","news.notice":"公告/新闻","news.report":"捐款报告","news.archive":"资料库",
    "nav.about":"关于我们","about.org":"机构介绍","about.transparency":"透明经营",
    "search.ph":"搜索","auth.login":"登录","auth.signup":"注册","cta.donate":"立即捐款",
    "hero.tagline":"连接马来西亚难民与机会","hero.p1":"就业","hero.p2":"住房","hero.p3":"市集","hero.p4":"拼车","hero.p5":"社区","hero.learn":"了解更多",
    "problems.eyebrow":"现状","problems.title":"现状与问题",
    "problems.c1.title":"无法合法就业","problems.c1.body":"马来西亚超过18万名难民无法合法就业，常被以低于最低工资的薪水剥削。",
    "problems.c2.title":"住房不安全","problems.c2.body":"难民向未经核实的房东支付过高租金，缺乏法律保护和社区支持。",
    "problems.c3.title":"语言障碍","problems.c3.body":"难民社区使用9种语言，重要信息无法传达给每一个人。",
    "problems.c4.title":"缺乏交通工具","problems.c4.body":"没有安全实惠的交通方式，难以前往工作地点、医院和社区资源。",
    "solution.eyebrow":"解决方案","solution.title":"解决方案：K-BRIDGE 应用","solution.sub":"一个应用。所有需求。所有语言。",
    "solution.f1":"就业","solution.f2":"住房","solution.f3":"市集","solution.f4":"拼车","solution.f5":"社区","solution.f6":"9种语言",
    "how.eyebrow":"运作方式","how.title":"K-BRIDGE 如何运作",
    "how.s1.title":"下载并加入","how.s1.body":"使用来自可信 NGO 合作伙伴的邀请码注册。",
    "how.s2.title":"获得500积分","how.s2.body":"所有新会员均可获得500 K-BRIDGE积分（约RM 50）。",
    "how.s3.title":"搜索所需服务","how.s3.body":"用自己的语言查找工作、住房、市集和拼车。",
    "how.s4.title":"直接见面并连接","how.s4.body":"当面见面，使用积分、Touch 'n Go 或现金交易。",
    "points.eyebrow":"积分系统","points.title":"K-BRIDGE 积分系统",
    "points.h1":"⭐ 积分运作方式","points.l1":"1积分 = RM 0.10","points.l2":"新会员：免费获得500积分","points.l3":"可通过 Touch 'n Go 充值","points.l4":"可通过 GrabPay 充值","points.l5":"可在 NGO 办公室现金充值","points.l6":"用积分购买拼车和商品",
    "points.h2":"💳 无需银行账户也能使用的原因","points.r1":"难民在法律上难以开设银行账户","points.r2":"Touch 'n Go 和 GrabPay 无需账户即可使用","points.r3":"可在合作 NGO 办公室现金充值","points.r4":"个人之间直接支付，无中间商","points.r5":"应用内提供安全透明的交易记录",
    "points.security":"安全保障：邀请码系统 + 认证用户 + 评价评分 = 安全的社区",
    "revenue.eyebrow":"可持续发展","revenue.title":"收入与可持续发展模式",
    "revenue.c1.title":"📢 广告收入","revenue.c1.body":"本地企业向1万+难民投放广告。横幅广告与置顶帖子。每月RM 200~500。",
    "revenue.c2.title":"🙏 捐款与赞助","revenue.c2.body":"个人及企业赞助者。RM 10 = 为难民家庭提供100积分。支持PayPal / TnG / FPX。",
    "revenue.c3.title":"🤝 NGO 合作伙伴关系","revenue.c3.body":"NGO为受益人赞助邀请码。与UNHCR、世界宣明会开展联合品牌项目。",
    "revenue.c4.title":"💼 置顶帖子","revenue.c4.body":"雇主及房东可发布认证帖子。中小企业也能负担的RM 50~200/条。",
    "vision.eyebrow":"👑 我们的愿景","vision.title":"愿景：难民 IT 团队","vision.sub":"难民不是受助者——而是我们团队的一员。",
    "vision.c1.title":"应用开发者","vision.c1.body":"培训难民学习 Flutter 与网页开发，让他们亲自开发和维护 K-BRIDGE 应用。",
    "vision.c2.title":"社区管理员","vision.c2.body":"难民领袖管理自己的社区，审核内容并保障安全。",
    "vision.c3.title":"翻译人员","vision.c3.body":"母语使用者负责应用9种语言的准确翻译。",
    "vision.c4.title":"数据分析员","vision.c4.body":"追踪使用情况并了解需求，支持NGO合作伙伴衡量社会影响力。",
    "partner.eyebrow":"合作提案","partner.title":"与贵机构的合作提案",
    "partner.need":"我们需要的支持","partner.n1":"向受益人分发邀请码","partner.n2":"核实可信的雇主和房东","partner.n3":"通过社区动态分享安全信息","partner.n4":"联合品牌以建立与难民的信任","partner.n5":"在办公室提供积分现金充值服务",
    "partner.gain":"贵机构将获得","partner.g1":"当地难民需求的实时数据","partner.g2":"用于分发援助与信息的数字平台","partner.g3":"面向捐赠者的月度影响力报告","partner.g4":"向1万+用户展示联合品牌","partner.g5":"一支由难民运营的技术团队",
    "partner.strip":"合作机构：UNHCR Malaysia · World Vision · Pusat Kebajikan GoodHope",
    "roadmap.eyebrow":"启动路线图","roadmap.title":"启动路线图",
    "roadmap.p1":"第一阶段 · 1~2个月","roadmap.p1.title":"打造基础","roadmap.p1.l1":"签署NGO合作协议","roadmap.p1.l2":"分发邀请码","roadmap.p1.l3":"吉隆坡地区50~100名测试用户","roadmap.p1.l4":"以缅甸语和英语上线",
    "roadmap.p2":"第二阶段 · 3~4个月","roadmap.p2.title":"成长","roadmap.p2.l1":"开放市集与拼车功能","roadmap.p2.l2":"支付系统正式运行","roadmap.p2.l3":"活跃用户500+","roadmap.p2.l4":"组建难民IT团队",
    "roadmap.p3":"第三阶段 · 5~6个月","roadmap.p3.title":"扩展","roadmap.p3.l1":"用户1万+","roadmap.p3.l2":"开始广告收入","roadmap.p3.l3":"启动捐款活动","roadmap.p3.l4":"扩展至槟城与新山",
    "closing.title":"让我们一起打造","closing.sub1":"K-BRIDGE不仅仅是一个应用——更是一场运动。","closing.sub2":"难民帮助难民。科技服务人类。以信念建立，以社区延续。",
    "closing.verse":"“我作客旅，你们留我住”——马太福音 25:35",
    "footer.copy":"© 2024 K-BRIDGE. 保留所有权利。","footer.admin":"管理员",
    "login.title":"登录","login.sub":"登录您的 K-BRIDGE 账户。","login.submit":"登录","login.noaccount":"还没有账户？",
    "signup.title":"注册","signup.sub":"加入 K-BRIDGE。","signup.submit":"注册","signup.hasaccount":"已经有账户？",
    "field.email":"邮箱（账号）","field.password":"密码","field.name":"姓名",
    "adminlogin.title":"管理员登录","adminlogin.sub":"请输入管理员密码。","adminlogin.submit":"进入",
    "adminpanel.title":"照片管理","adminpanel.sub":"选择版块后上传或删除照片。","adminpanel.select":"选择版块","adminpanel.upload":"上传","adminpanel.current":"当前照片","adminpanel.empty":"暂无照片。",
    "adminpanel.mainTitle":"管理员面板","adminpanel.tabPhotos":"照片管理","adminpanel.tabDonations":"捐款管理",
    "donationadmin.sub":"新增记录会立即显示在透明经营板块。","donationadmin.name":"捐款人姓名","donationadmin.amount":"金额 (RM)","donationadmin.note":"备注（可选）","donationadmin.add":"添加捐款记录","donationadmin.list":"捐款记录","donationadmin.empty":"暂无捐款记录。",
    "transparency.empty":"暂无捐款记录。",
    "status.fillall":"请填写所有字段。","status.exists":"该邮箱已注册。","status.signupok":"注册成功！","status.badlogin":"邮箱或密码不正确。","status.needsignup":"尚未注册该账号，请先注册。","status.loginok":"登录成功！","status.error":"发生错误。","status.wrongpw":"密码不正确。","status.choosefile":"请选择文件。","status.uploading":"上传中...","status.uploadok":"上传成功！"
  },
  ms:{
    "nav.donate":"Derma","donate.regular":"Derma Bulanan","donate.onetime":"Derma Sekali","donate.goods":"Derma Barangan","donate.major":"Derma Besar","donate.super":"Derma Warisan",
    "donate.eyebrow":"DERMA","donate.title":"Derma Sekarang","donate.sub":"Derma anda membantu seorang pelarian mencapai kehidupan berdikari.",
    "donate.regular.body":"Berikan jumlah tetap setiap bulan untuk sokongan berterusan.","donate.onetime.body":"Buat derma sekali sahaja apabila anda mampu.","donate.goods.body":"Derma barangan keperluan asas atau elektronik terus kepada mereka yang memerlukan.","donate.major.body":"Derma besar menyokong pengembangan wilayah dan ciri baharu.","donate.super.body":"Menjadi rakan kongsi jangka panjang K-BRIDGE.",
    "campaign.eyebrow":"KEMPEN","campaign.title":"Kempen","campaign.body":"Kempen baharu sedang disediakan dan akan dipaparkan di sini tidak lama lagi. Nantikan!","campaign.viewall":"Kempen",
    "news.eyebrow":"BERITA","news.title":"Berita","news.notice.body":"Berita dan pengumuman terkini daripada K-BRIDGE.","news.report.body":"Laporan berkala mengenai penggunaan derma.","news.archive.body":"Ruang simpanan laporan aktiviti dan sumber.",
    "nav.campaign":"Kempen","nav.news":"Berita","news.notice":"Notis/Berita","news.report":"Laporan Impak","news.archive":"Sumber",
    "nav.about":"Tentang Kami","about.org":"Profil Kami","about.transparency":"Ketelusan",
    "search.ph":"Cari","auth.login":"Log Masuk","auth.signup":"Daftar","cta.donate":"Derma Sekarang",
    "hero.tagline":"Menghubungkan pelarian di Malaysia dengan peluang","hero.p1":"Pekerjaan","hero.p2":"Perumahan","hero.p3":"Pasaran","hero.p4":"Tumpangan","hero.p5":"Komuniti","hero.learn":"Ketahui lebih lanjut",
    "problems.eyebrow":"KEADAAN SEMASA","problems.title":"Keadaan dan Masalah",
    "problems.c1.title":"Tidak Boleh Bekerja Secara Sah","problems.c1.body":"Lebih 180,000 pelarian di Malaysia tidak boleh bekerja secara sah dan sering dieksploitasi di bawah gaji minimum.",
    "problems.c2.title":"Perumahan Tidak Selamat","problems.c2.body":"Pelarian membayar sewa yang tinggi kepada tuan rumah yang tidak disahkan, tanpa perlindungan undang-undang atau sokongan komuniti.",
    "problems.c3.title":"Halangan Bahasa","problems.c3.body":"9 bahasa dituturkan dalam komuniti pelarian, dan maklumat penting tidak sampai kepada semua orang.",
    "problems.c4.title":"Tiada Pengangkutan","problems.c4.body":"Tanpa pengangkutan yang selamat dan murah, sukar untuk sampai ke tempat kerja, klinik, dan sumber komuniti.",
    "solution.eyebrow":"PENYELESAIAN","solution.title":"Penyelesaian: Aplikasi K-BRIDGE","solution.sub":"Satu aplikasi. Semua keperluan. Semua bahasa.",
    "solution.f1":"Pekerjaan","solution.f2":"Perumahan","solution.f3":"Pasaran","solution.f4":"Tumpangan","solution.f5":"Komuniti","solution.f6":"9 Bahasa",
    "how.eyebrow":"CARA IA BERFUNGSI","how.title":"Cara K-BRIDGE Berfungsi",
    "how.s1.title":"Muat Turun & Sertai","how.s1.body":"Daftar menggunakan kod jemputan daripada rakan kongsi NGO yang dipercayai.",
    "how.s2.title":"Terima 500 Mata","how.s2.body":"Setiap ahli baharu menerima 500 mata K-BRIDGE (kira-kira RM 50).",
    "how.s3.title":"Cari Apa Yang Diperlukan","how.s3.body":"Cari pekerjaan, perumahan, pasaran dan tumpangan dalam bahasa anda sendiri.",
    "how.s4.title":"Bertemu & Berhubung","how.s4.body":"Bertemu secara peribadi dan bayar dengan mata, Touch 'n Go, atau tunai.",
    "points.eyebrow":"SISTEM MATA","points.title":"Sistem Mata K-BRIDGE",
    "points.h1":"⭐ Cara Mata Berfungsi","points.l1":"1 mata = RM 0.10","points.l2":"Ahli baharu menerima 500 mata percuma","points.l3":"Tambah nilai melalui Touch 'n Go","points.l4":"Tambah nilai melalui GrabPay","points.l5":"Tambah nilai tunai di pejabat NGO","points.l6":"Guna mata untuk tumpangan dan barangan",
    "points.h2":"💳 Kenapa Ia Berfungsi Tanpa Akaun Bank","points.r1":"Pelarian sukar membuka akaun bank secara sah","points.r2":"Touch 'n Go & GrabPay boleh digunakan tanpa akaun","points.r3":"Tambah nilai tunai tersedia di pejabat rakan NGO","points.r4":"Pembayaran terus antara individu, tiada orang tengah","points.r5":"Sejarah transaksi selamat dan telus dalam aplikasi",
    "points.security":"Keselamatan: kod jemputan + pengguna disahkan + penilaian = komuniti yang selamat",
    "revenue.eyebrow":"KEMAMPANAN","revenue.title":"Model Pendapatan dan Kemampanan",
    "revenue.c1.title":"📢 Pendapatan Iklan","revenue.c1.body":"Perniagaan tempatan mengiklan kepada 10,000+ pelarian. Iklan sepanduk & siaran premium. RM 200–500/bulan.",
    "revenue.c2.title":"🙏 Derma dan Sumbangan","revenue.c2.body":"Penderma individu dan korporat. RM 10 = 100 mata untuk keluarga pelarian. PayPal / TnG / FPX disokong.",
    "revenue.c3.title":"🤝 Perkongsian NGO","revenue.c3.body":"NGO menaja kod jemputan untuk penerima. Program jenama bersama dengan UNHCR dan World Vision.",
    "revenue.c4.title":"💼 Siaran Premium","revenue.c4.body":"Majikan dan tuan rumah menyiarkan iklan disahkan. Mampu milik untuk PKS pada RM 50–200 setiap siaran.",
    "vision.eyebrow":"👑 VISI KAMI","vision.title":"Visi: Pasukan IT Pelarian","vision.sub":"Pelarian bukan penerima manfaat — mereka sebahagian daripada pasukan kami.",
    "vision.c1.title":"Pembangun Aplikasi","vision.c1.body":"Kami melatih pelarian dalam Flutter & pembangunan web untuk membina dan menyelenggara aplikasi K-BRIDGE sendiri.",
    "vision.c2.title":"Pengurus Komuniti","vision.c2.body":"Pemimpin pelarian menguruskan komuniti mereka sendiri, menyederhanakan kandungan, dan memastikan keselamatan.",
    "vision.c3.title":"Penterjemah","vision.c3.body":"Penutur asli mengendalikan terjemahan tepat merentasi semua 9 bahasa dalam aplikasi.",
    "vision.c4.title":"Penganalisis Data","vision.c4.body":"Mereka menjejaki penggunaan dan keperluan, menyokong pengukuran impak sosial rakan kongsi NGO.",
    "partner.eyebrow":"CADANGAN PERKONGSIAN","partner.title":"Cadangan Perkongsian untuk Organisasi Anda",
    "partner.need":"Apa Yang Kami Perlukan","partner.n1":"Mengedarkan kod jemputan kepada penerima manfaat","partner.n2":"Mengesahkan majikan dan tuan rumah yang dipercayai","partner.n3":"Berkongsi maklumat keselamatan melalui suapan komuniti","partner.n4":"Penjenamaan bersama untuk membina kepercayaan dengan pelarian","partner.n5":"Perkhidmatan tambah nilai tunai untuk mata di pejabat anda",
    "partner.gain":"Apa Yang Organisasi Anda Perolehi","partner.g1":"Data masa nyata mengenai keperluan pelarian tempatan","partner.g2":"Platform digital untuk mengedarkan bantuan dan maklumat","partner.g3":"Laporan impak bulanan untuk penderma","partner.g4":"Pendedahan jenama bersama kepada 10,000+ pengguna","partner.g5":"Pasukan teknologi yang dikendalikan oleh pelarian",
    "partner.strip":"Organisasi rakan kongsi: UNHCR Malaysia · World Vision · Pusat Kebajikan GoodHope",
    "roadmap.eyebrow":"PELAN PELANCARAN","roadmap.title":"Pelan Pelancaran",
    "roadmap.p1":"Fasa 1 · Bulan 1–2","roadmap.p1.title":"Asas","roadmap.p1.l1":"Menandatangani perjanjian perkongsian NGO","roadmap.p1.l2":"Mengedarkan kod jemputan","roadmap.p1.l3":"50–100 pengguna beta di KL","roadmap.p1.l4":"Lancar dalam Bahasa Myanmar + Inggeris",
    "roadmap.p2":"Fasa 2 · Bulan 3–4","roadmap.p2.title":"Pertumbuhan","roadmap.p2.l1":"Lancar ciri pasaran & tumpangan","roadmap.p2.l2":"Sistem pembayaran beroperasi penuh","roadmap.p2.l3":"500+ pengguna aktif","roadmap.p2.l4":"Membina pasukan IT pelarian",
    "roadmap.p3":"Fasa 3 · Bulan 5–6","roadmap.p3.title":"Pengembangan","roadmap.p3.l1":"10,000+ pengguna","roadmap.p3.l2":"Pendapatan iklan bermula","roadmap.p3.l3":"Lancar kempen derma","roadmap.p3.l4":"Kembang ke Penang & Johor Bahru",
    "closing.title":"Mari Kita Bina Bersama","closing.sub1":"K-BRIDGE lebih daripada sekadar aplikasi — ia adalah satu gerakan.","closing.sub2":"Pelarian membantu pelarian. Teknologi berkhidmat untuk kemanusiaan. Dibina atas iman, disokong oleh komuniti.",
    "closing.verse":"\"Aku ini orang asing, dan kamu menyambut Aku\" — Matius 25:35",
    "footer.copy":"© 2024 K-BRIDGE. Hak cipta terpelihara.","footer.admin":"Admin",
    "login.title":"Log Masuk","login.sub":"Log masuk ke akaun K-BRIDGE anda.","login.submit":"Log Masuk","login.noaccount":"Tiada akaun?",
    "signup.title":"Daftar","signup.sub":"Sertai komuniti K-BRIDGE.","signup.submit":"Daftar","signup.hasaccount":"Sudah ada akaun?",
    "field.email":"Emel (ID)","field.password":"Kata Laluan","field.name":"Nama",
    "adminlogin.title":"Log Masuk Admin","adminlogin.sub":"Masukkan kata laluan admin.","adminlogin.submit":"Masuk",
    "adminpanel.title":"Pengurus Foto","adminpanel.sub":"Pilih bahagian, kemudian muat naik atau padam foto.","adminpanel.select":"Pilih bahagian","adminpanel.upload":"Muat Naik","adminpanel.current":"Foto Semasa","adminpanel.empty":"Belum ada foto.",
    "adminpanel.mainTitle":"Panel Admin","adminpanel.tabPhotos":"Foto","adminpanel.tabDonations":"Derma",
    "donationadmin.sub":"Rekod baharu akan terus dipaparkan di bahagian Ketelusan.","donationadmin.name":"Nama penderma","donationadmin.amount":"Jumlah (RM)","donationadmin.note":"Nota (pilihan)","donationadmin.add":"Tambah rekod derma","donationadmin.list":"Rekod derma","donationadmin.empty":"Belum ada rekod derma.",
    "transparency.empty":"Belum ada rekod derma.",
    "status.fillall":"Sila isi semua ruangan.","status.exists":"Emel ini telah didaftarkan.","status.signupok":"Pendaftaran berjaya!","status.badlogin":"Emel atau kata laluan salah.","status.needsignup":"Akaun tidak dijumpai. Sila daftar dahulu.","status.loginok":"Berjaya log masuk!","status.error":"Ralat berlaku.","status.wrongpw":"Kata laluan salah.","status.choosefile":"Sila pilih fail.","status.uploading":"Memuat naik...","status.uploadok":"Muat naik berjaya!"
  }
};
let currentLang = 'ko';
function t(key){ return (I18N[currentLang] && I18N[currentLang][key]) || I18N.ko[key] || key; }
function applyLang(lang){
  currentLang = lang;
  document.documentElement.lang = lang;
  localStorage.setItem('kbridge_lang', lang);
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (I18N[lang] && I18N[lang][key] !== undefined) el.textContent = I18N[lang][key];
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.dataset.i18nPh;
    if (I18N[lang] && I18N[lang][key] !== undefined) el.placeholder = I18N[lang][key];
  });
}
document.getElementById('langSwitch').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-lang]');
  if (!btn) return;
  document.querySelectorAll('#langSwitch button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyLang(btn.dataset.lang);
});
// 다른 페이지로 이동해도 마지막에 선택한 언어가 그대로 유지되도록 복원
(function restoreSavedLanguage(){
  const savedLang = localStorage.getItem('kbridge_lang');
  if (savedLang && I18N[savedLang] && savedLang !== 'ko'){
    document.querySelectorAll('#langSwitch button').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === savedLang);
    });
    applyLang(savedLang);
  }
})();

/* search overlay */
const searchOverlayEl = document.getElementById('searchOverlay');
const searchToggleBtn = document.getElementById('searchToggle');
const searchInputEl = document.getElementById('searchInput');
const searchOverlayCloseBtn = document.getElementById('searchOverlayClose');
function openSearchOverlay(){
  searchOverlayEl.classList.add('active');
  document.body.classList.add('search-open');
  setTimeout(() => searchInputEl.focus(), 60);
}
function closeSearchOverlay(){
  searchOverlayEl.classList.remove('active');
  document.body.classList.remove('search-open');
}
searchToggleBtn.addEventListener('click', openSearchOverlay);
searchOverlayCloseBtn.addEventListener('click', closeSearchOverlay);
searchOverlayEl.addEventListener('click', (e) => { if (e.target === searchOverlayEl) closeSearchOverlay(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSearchOverlay(); });
