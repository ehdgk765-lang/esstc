// utils.js - 공통 유틸리티

// ── 게임 타입 상수 ──
const GAME_TYPES = {
  MS: { label: '남자단식', icon: '🏃‍♂️', gender: 'M', doubles: false },
  WS: { label: '여자단식', icon: '🏃‍♀️', gender: 'F', doubles: false },
  MD: { label: '남자복식', icon: '👬', gender: 'M', doubles: true },
  WD: { label: '여자복식', icon: '👭', gender: 'F', doubles: true },
  XD: { label: '혼합복식', icon: '👫', gender: 'mixed', doubles: true },
};

const SCHEDULE_GAME_TYPES = {
  XD: { label: '혼합복식', icon: '👫', badgeClass: 'bg-purple-100 text-purple-700', needM: 2, needF: 2, singles: false },
  MD: { label: '남자복식', icon: '👬', badgeClass: 'bg-blue-100 text-blue-700', needM: 4, needF: 0, singles: false },
  WD: { label: '여자복식', icon: '👭', badgeClass: 'bg-pink-100 text-pink-700', needM: 0, needF: 4, singles: false },
  FD: { label: '섞어복식', icon: '🔀', badgeClass: 'bg-orange-100 text-orange-700', needM: 0, needF: 0, needAny: 4, singles: false },
  MS: { label: '남자단식', icon: '🏃‍♂️', badgeClass: 'bg-blue-100 text-blue-700', needM: 2, needF: 0, singles: true },
  WS: { label: '여자단식', icon: '🏃‍♀️', badgeClass: 'bg-pink-100 text-pink-700', needM: 0, needF: 2, singles: true },
  FS: { label: '섞어단식', icon: '🔀', badgeClass: 'bg-orange-100 text-orange-700', needM: 0, needF: 0, needAny: 2, singles: true },
};

// ── 한국어 초성 검색 ──
const _CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
function getChoseong(str) {
  return [...str].map(ch => {
    const c = ch.charCodeAt(0);
    return (c >= 0xAC00 && c <= 0xD7A3) ? _CHO[Math.floor((c - 0xAC00) / 588)] : ch;
  }).join('');
}
function matchesKoreanSearch(name, query) {
  if (!query) return true;
  if (name.toLowerCase().includes(query.toLowerCase())) return true;
  return getChoseong(name).includes(query);
}

// ── 팀 맵 빌더 ──
function buildTeamMap() {
  const map = {};
  Storage.getTeams().forEach(t => (t.members || []).forEach(n => { map[n] = t.name; }));
  return map;
}

// ── 모달 배경 스크롤 잠금 ──
let _scrollLockCount = 0;
let _savedScrollY = 0;

function lockScroll() {
  if (_scrollLockCount === 0) {
    _savedScrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${_savedScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
  }
  _scrollLockCount++;
}

function unlockScroll() {
  _scrollLockCount--;
  if (_scrollLockCount <= 0) {
    _scrollLockCount = 0;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.overflow = '';
    window.scrollTo(0, _savedScrollY);
  }
}

// ── 성별 뱃지 HTML ──
function genderBadge(gender, style) {
  if (style === 'text') {
    if (gender === 'M') return '<span class="text-xs text-blue-600">남</span>';
    if (gender === 'F') return '<span class="text-xs text-pink-600">여</span>';
    return '';
  }
  if (gender === 'M') return '<span class="text-xs px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700">남</span>';
  if (gender === 'F') return '<span class="text-xs px-1.5 py-0.5 rounded font-medium bg-pink-100 text-pink-700">여</span>';
  return '<span class="text-xs px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-500">-</span>';
}

// ── 토스트 알림 ──
var _toastTimer = null;
function showToast(message, type) {
  type = type || 'info';
  var container = document.getElementById('toast-container');
  if (!container) return;

  var toast = document.createElement('div');
  toast.className = 'toast-item toast-' + type;
  toast.textContent = message;
  container.appendChild(toast);

  // 슬라이드-업 애니메이션 트리거
  requestAnimationFrame(function() {
    toast.classList.add('toast-show');
  });

  // 3초 후 자동 제거
  setTimeout(function() {
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
    setTimeout(function() {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3000);
}
