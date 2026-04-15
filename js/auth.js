// auth.js - 로그인/회원가입 UI + Firebase Auth 관리
const Auth = {
  initialized: false,

  init() {
    fbAuth.onAuthStateChanged(async (user) => {
      const authEl = document.getElementById('auth-container');
      const appEl = document.getElementById('app-container');

      if (user) {
        // 다른 계정으로 전환된 경우 이전 데이터 정리
        const lastUid = localStorage.getItem('tennis_last_uid');
        if (lastUid && lastUid !== user.uid) {
          localStorage.removeItem(Storage.KEYS.PLAYERS);
          localStorage.removeItem(Storage.KEYS.TOURNAMENTS);
        }
        localStorage.setItem('tennis_last_uid', user.uid);

        // Firestore → localStorage 동기화 (실패해도 앱은 표시)
        try {
          await Storage.loadFromFirestore();
        } catch (e) {
          console.error('Firestore 로드 실패 (오프라인 모드):', e);
        }
        // 실시간 동기화 시작
        Storage.startRealtimeSync();

        authEl.style.display = 'none';
        appEl.style.display = '';
        if (!this.initialized) {
          App.init();
          this.initialized = true;
        } else {
          App.navigate(App.currentTab);
        }
      } else {
        // 실시간 동기화 중지
        Storage.stopRealtimeSync();
        // 로그인 페이지 표시 (localStorage는 건드리지 않음 - logout에서 정리)
        authEl.style.display = '';
        appEl.style.display = 'none';
        this.initialized = false;
        this.renderLogin();
      }
    });

  },

  renderLogin() {
    const container = document.getElementById('auth-container');
    container.innerHTML = `
      <!-- 테마 토글 -->
      <button id="auth-theme-toggle" class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-xl bg-white/30 backdrop-blur-sm border border-white/40 hover:bg-white/50 transition-all" title="테마 전환" aria-label="테마 전환">
        <svg class="auth-icon-sun w-5 h-5 text-gray-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
        </svg>
        <svg class="auth-icon-moon w-5 h-5 text-yellow-400" style="display:none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
        </svg>
      </button>

      <div class="w-full max-w-sm mx-auto px-6">
        <!-- 로고 영역 -->
        <div class="text-center mb-8">
          <div class="relative inline-block mb-4">
            <div class="auth-logo-bg w-28 h-28 rounded-3xl mx-auto" role="img" aria-label="Tennis"></div>
          </div>
          <h1 class="text-2xl font-extrabold bg-gradient-to-r from-green-600 to-emerald-500 bg-clip-text text-transparent">Happy Tennis Life</h1>
          <p class="text-sm text-gray-400 mt-1">테니스를 더 즐겁게</p>
        </div>

        <!-- 로그인 카드 -->
        <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl shadow-green-100/50 p-6 border border-white/60">
          <form id="auth-form" class="space-y-4">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">이메일</label>
              <input type="email" id="auth-email" required
                class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition"
                placeholder="email@example.com">
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">비밀번호</label>
              <input type="password" id="auth-password" required minlength="6"
                class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition"
                placeholder="6자 이상">
            </div>
            <div id="auth-confirm-wrap" style="display:none">
              <label class="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">비밀번호 확인</label>
              <input type="password" id="auth-password-confirm" minlength="6"
                class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition"
                placeholder="비밀번호를 다시 입력">
            </div>
            <p id="auth-error" class="text-sm text-red-500 hidden"></p>
            <button type="submit" id="auth-submit-btn"
              class="w-full py-3.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 active:scale-[0.98] transition-all font-bold text-lg shadow-md shadow-green-200">
              로그인
            </button>
          </form>
        </div>

        <p class="text-center text-sm text-gray-400 mt-5">
          <span id="auth-toggle-text">계정이 없으신가요?</span>
          <button type="button" id="auth-toggle-btn" class="text-green-600 font-bold hover:underline ml-1">회원가입</button>
        </p>
      </div>`;

    // 로그인 페이지 테마 토글
    const authThemeToggle = container.querySelector('#auth-theme-toggle');
    const authIconSun = container.querySelector('.auth-icon-sun');
    const authIconMoon = container.querySelector('.auth-icon-moon');

    const updateAuthThemeIcons = (isDark) => {
      authIconSun.style.display = isDark ? 'none' : 'block';
      authIconMoon.style.display = isDark ? 'block' : 'none';
    };
    updateAuthThemeIcons(document.documentElement.classList.contains('dark'));

    authThemeToggle.onclick = () => {
      // 기기 다크모드 시 라이트 전환 방지 (삼성 인터넷 어둡게 보기 배경색 통일)
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return;
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      updateAuthThemeIcons(isDark);
      // 앱 헤더 아이콘도 동기화
      const iconSun = document.getElementById('icon-sun');
      const iconMoon = document.getElementById('icon-moon');
      const metaColor = document.getElementById('meta-theme-color');
      if (iconSun) iconSun.style.display = isDark ? 'none' : 'block';
      if (iconMoon) iconMoon.style.display = isDark ? 'block' : 'none';
      if (metaColor) metaColor.content = isDark ? '#1e293b' : '#ffffff';
    };

    let isRegister = false;
    const form = container.querySelector('#auth-form');
    const confirmWrap = container.querySelector('#auth-confirm-wrap');
    const submitBtn = container.querySelector('#auth-submit-btn');
    const toggleText = container.querySelector('#auth-toggle-text');
    const toggleBtn = container.querySelector('#auth-toggle-btn');
    const errorEl = container.querySelector('#auth-error');

    toggleBtn.onclick = () => {
      isRegister = !isRegister;
      confirmWrap.style.display = isRegister ? '' : 'none';
      submitBtn.textContent = isRegister ? '회원가입' : '로그인';
      toggleText.textContent = isRegister ? '이미 계정이 있으신가요?' : '계정이 없으신가요?';
      toggleBtn.textContent = isRegister ? '로그인' : '회원가입';
      errorEl.classList.add('hidden');
    };

    form.onsubmit = async (e) => {
      e.preventDefault();
      const email = container.querySelector('#auth-email').value.trim();
      const password = container.querySelector('#auth-password').value;
      errorEl.classList.add('hidden');
      submitBtn.disabled = true;
      submitBtn.textContent = '처리 중...';

      try {
        if (isRegister) {
          const confirm = container.querySelector('#auth-password-confirm').value;
          if (password !== confirm) {
            throw { message: '비밀번호가 일치하지 않습니다.' };
          }
          await fbAuth.createUserWithEmailAndPassword(email, password);
        } else {
          await fbAuth.signInWithEmailAndPassword(email, password);
        }
      } catch (err) {
        errorEl.textContent = this.getErrorMessage(err);
        errorEl.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = isRegister ? '회원가입' : '로그인';
      }
    };
  },

  getErrorMessage(err) {
    const code = err.code || '';
    if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential')
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    if (code === 'auth/email-already-in-use') return '이미 사용 중인 이메일입니다.';
    if (code === 'auth/weak-password') return '비밀번호가 너무 짧습니다. (6자 이상)';
    if (code === 'auth/invalid-email') return '올바른 이메일 형식을 입력해주세요.';
    if (code === 'auth/too-many-requests') return '너무 많은 시도입니다. 잠시 후 다시 시도해주세요.';
    return err.message || '오류가 발생했습니다.';
  },

  logout() {
    if (confirm('로그아웃 하시겠습니까?')) {
      localStorage.removeItem(Storage.KEYS.PLAYERS);
      localStorage.removeItem(Storage.KEYS.TOURNAMENTS);
      localStorage.removeItem('tennis_last_uid');
      fbAuth.signOut();
    }
  }
};
