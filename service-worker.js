// service-worker.js - PWA 오프라인 캐시 + 앱 쉘 관리
const CACHE_VERSION = '1.0.3';
const CACHE_NAME = 'etc-' + CACHE_VERSION;

// 앱 쉘: 로컬 파일만 프리캐시 (CDN은 런타임 캐시)
const APP_SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'css/android-chrome-192x192.png',
  'css/apple-touch-icon.png',
  'css/android-chrome-512x512.png',
  'css/medal.png',
  'css/tennis-smile-2.png',
  'js/utils.js',
  'js/firebase-config.js',
  'js/storage.js',
  'js/results.js',
  'js/players.js',
  'js/tournament.js',
  'js/league.js',
  'js/schedule.js',
  'js/custom-bracket.js',
  'js/calendar.js',
  'js/stats.js',
  'js/members.js',
  'js/roles-config.js',
  'js/app.js',
  'js/auth.js'
];

// Firebase API 도메인 (네트워크 전용, 캐시 안 함)
const NETWORK_ONLY_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'www.googleapis.com'
];

// Install: 앱 쉘 프리캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: 이전 버전 캐시 삭제
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('etc-') && k !== CACHE_NAME)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch 전략
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1) Firebase API → 네트워크 전용
  if (NETWORK_ONLY_HOSTS.some(h => url.hostname.includes(h))) {
    return; // 브라우저 기본 동작
  }

  // 2) HTML 네비게이션 → 네트워크 우선, 실패 시 캐시
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request) || caches.match('./'))
    );
    return;
  }

  // 3) 기타 리소스 (JS, CSS, 이미지, CDN) → 캐시 우선, 없으면 네트워크
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
