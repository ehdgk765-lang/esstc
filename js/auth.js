// auth.js - 로그인/회원가입 UI + Firebase Auth 관리
const Auth = {
  initialized: false,

  init() {
    fbAuth.onAuthStateChanged(async (user) => {
      const authEl = document.getElementById('auth-container');
      const appEl = document.getElementById('app-container');

      if (user) {
        // 역할 초기화 (Firestore에서 비동기 조회)
        await RolesConfig.initRole();

        // 다른 계정으로 전환된 경우 이전 데이터 정리
        const lastUid = localStorage.getItem('tennis_last_uid');
        if (lastUid && lastUid !== user.uid) {
          localStorage.removeItem(Storage.KEYS.PLAYERS);
          localStorage.removeItem(Storage.KEYS.TOURNAMENTS);
          localStorage.removeItem(Storage.KEYS.EVENTS);
          localStorage.removeItem(Storage.KEYS.COURTS);
          localStorage.removeItem(Storage.KEYS.TEAMS);
          localStorage.removeItem('tennis_member_name');
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

        // 멤버: 이름 검증 (앱 전환 전)
        if (RolesConfig.isMember()) {
          const memberName = localStorage.getItem('tennis_member_name') || '';
          const players = Storage.getPlayers();
          if (!memberName) {
            this._showLoginError('이름을 입력해주세요.');
            return;
          }
          if (!players.some(p => p.name === memberName)) {
            localStorage.removeItem('tennis_member_name');
            this._showLoginError('멤버 목록에 등록되지 않은 이름입니다.');
            return;
          }
        }

        if (authEl._vpCleanup) authEl._vpCleanup();
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
        RolesConfig._currentRole = null;
        // 로그인 페이지 표시 (localStorage는 건드리지 않음 - logout에서 정리)
        authEl.style.display = '';
        appEl.style.display = 'none';
        this.initialized = false;
        this.renderLogin();
      }
    });

  },

  // 로그인 화면에 에러 메시지 표시 (로그아웃 없이)
  _showLoginError(msg) {
    const errorEl = document.querySelector('#auth-error');
    const submitBtn = document.querySelector('#auth-submit-btn');
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.classList.remove('hidden');
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '로그인';
    }
  },

  // 이미 로그인된 상태에서 이름만 변경 후 재시도
  async _retryMemberLogin() {
    const authEl = document.getElementById('auth-container');
    const appEl = document.getElementById('app-container');
    const memberName = localStorage.getItem('tennis_member_name') || '';
    const players = Storage.getPlayers();

    if (!memberName) {
      this._showLoginError('이름을 입력해주세요.');
      return;
    }
    if (!players.some(p => p.name === memberName)) {
      localStorage.removeItem('tennis_member_name');
      this._showLoginError('멤버 목록에 등록되지 않은 이름입니다.');
      return;
    }

    // 검증 통과 → 앱 전환
    if (authEl._vpCleanup) authEl._vpCleanup();
    authEl.style.display = 'none';
    appEl.style.display = '';
    if (!this.initialized) {
      App.init();
      this.initialized = true;
    } else {
      App.navigate(App.currentTab);
    }
  },

  renderLogin() {
    const container = document.getElementById('auth-container');
    container.innerHTML = `
      <div class="min-h-full flex items-center justify-center py-8 relative">
      <!-- 테마 토글 -->
      <button id="auth-theme-toggle" class="fixed top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-xl bg-white/30 backdrop-blur-sm border border-white/40 hover:bg-white/50 transition-all" title="테마 전환" aria-label="테마 전환">
        <svg class="auth-icon-sun w-5 h-5 text-gray-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
        </svg>
        <svg class="auth-icon-moon w-5 h-5 text-yellow-400" style="display:none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
        </svg>
      </button>

      <div class="w-full max-w-sm mx-auto px-6">
        <!-- 로고 영역 -->
        <div id="auth-logo-section" class="text-center mb-8 transition-all duration-200 overflow-hidden">
          <div class="relative inline-block mb-4">
            <div class="auth-logo-bg w-28 h-28 rounded-3xl mx-auto" role="img" aria-label="Tennis"></div>
          </div>
          <h1 class="text-2xl font-extrabold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Happy Tennis</h1>
          <p class="text-sm text-gray-400 mt-1">해태 클럽에 오신 것을 환영합니다!</p>
        </div>

        <!-- 로그인 카드 -->
        <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl shadow-blue-200/50 border border-white/60 overflow-hidden">
          <!-- 탭 -->
          <div class="flex border-b border-gray-200">
            <button type="button" id="auth-tab-admin" class="flex-1 py-3 text-sm font-bold text-blue-700 border-b-2 border-blue-700 transition">관리자</button>
            <button type="button" id="auth-tab-member" class="flex-1 py-3 text-sm font-bold text-gray-400 border-b-2 border-transparent hover:text-gray-600 transition">멤버</button>
          </div>
          <div class="p-6">
          <form id="auth-form" class="space-y-4">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">아이디</label>
              <input type="email" id="auth-email" required
                class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-700 focus:border-blue-700 focus:bg-white transition"
                placeholder="email@example.com">
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">비밀번호</label>
              <input type="password" id="auth-password" required minlength="6"
                class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-700 focus:border-blue-700 focus:bg-white transition"
                placeholder="6자 이상">
            </div>
            <div id="auth-member-name-wrap" style="display:none">
              <label class="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">이름</label>
              <input type="text" autocomplete="off" id="auth-member-name" maxlength="20"
                class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-700 focus:border-blue-700 focus:bg-white transition"
                placeholder="멤버 목록에 등록된 본인 이름">
            </div>
            <div id="auth-confirm-wrap" style="display:none">
              <label class="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">비밀번호 확인</label>
              <input type="password" id="auth-password-confirm" minlength="6"
                class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-700 focus:border-blue-700 focus:bg-white transition"
                placeholder="비밀번호를 다시 입력">
            </div>
            <label class="flex items-center justify-end gap-1.5 cursor-pointer select-none">
              <input type="checkbox" id="auth-remember" class="w-4 h-4 rounded border-gray-300 text-blue-700 focus:ring-blue-700 accent-blue-700">
              <span id="auth-remember-label" class="text-xs text-gray-400">아이디 기억하기</span>
            </label>
            <p id="auth-error" class="text-sm text-red-500 hidden"></p>
            <button type="submit" id="auth-submit-btn"
              class="w-full py-3.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl hover:from-blue-600 hover:to-indigo-600 active:scale-[0.98] transition-all font-bold text-lg shadow-md shadow-blue-200">
              로그인
            </button>
          </form>
          </div>
        </div>
      </div>
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
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      // color-scheme 메타 태그 업데이트 (크롬 강제 다크모드 방지)
      const csMeta = document.querySelector('meta[name="color-scheme"]');
      if (csMeta) csMeta.content = isDark ? 'only dark' : 'only light';
      updateAuthThemeIcons(isDark);
      // 앱 헤더 아이콘도 동기화
      const iconSun = document.getElementById('icon-sun');
      const iconMoon = document.getElementById('icon-moon');
      const metaColor = document.getElementById('meta-theme-color');
      if (iconSun) iconSun.style.display = isDark ? 'none' : 'block';
      if (iconMoon) iconMoon.style.display = isDark ? 'block' : 'none';
      if (metaColor) metaColor.content = isDark ? '#1e293b' : '#ffffff';
    };

    // 모바일 키보드 대응: 키보드가 올라오면 로고 축소 + 컨테이너 리사이즈 + 스크롤 가능
    if (window.visualViewport) {
      const logoSection = container.querySelector('#auth-logo-section');
      const authWrapper = container.querySelector('.min-h-full');
      const initialHeight = window.visualViewport.height;
      const handleAuthViewport = () => {
        const vh = window.visualViewport.height;
        const isKeyboard = vh < initialHeight * 0.75;
        container.style.height = vh + 'px';
        container.style.top = window.visualViewport.offsetTop + 'px';
        if (logoSection) {
          if (isKeyboard) {
            logoSection.style.maxHeight = '0';
            logoSection.style.marginBottom = '0';
            logoSection.style.opacity = '0';
          } else {
            logoSection.style.maxHeight = '';
            logoSection.style.marginBottom = '';
            logoSection.style.opacity = '';
          }
        }
        // 키보드가 올라오면 스크롤 가능하게 + 상단 정렬로 변경
        if (authWrapper) {
          if (isKeyboard) {
            authWrapper.style.alignItems = 'flex-start';
            authWrapper.style.overflowY = 'auto';
            authWrapper.style.minHeight = '0';
            authWrapper.style.height = '100%';
            authWrapper.style.paddingTop = '16px';
            authWrapper.style.paddingBottom = '16px';
            // 포커스된 입력 필드가 보이도록 스크롤
            setTimeout(function() {
              var focused = document.activeElement;
              if (focused && focused.tagName === 'INPUT') {
                focused.scrollIntoView({ block: 'center', behavior: 'smooth' });
              }
            }, 100);
          } else {
            authWrapper.style.alignItems = '';
            authWrapper.style.overflowY = '';
            authWrapper.style.minHeight = '';
            authWrapper.style.height = '';
            authWrapper.style.paddingTop = '';
            authWrapper.style.paddingBottom = '';
          }
        }
      };
      window.visualViewport.addEventListener('resize', handleAuthViewport);
      window.visualViewport.addEventListener('scroll', handleAuthViewport);
      // 로그아웃 시 정리를 위해 저장
      container._vpCleanup = () => {
        window.visualViewport.removeEventListener('resize', handleAuthViewport);
        window.visualViewport.removeEventListener('scroll', handleAuthViewport);
        container.style.height = '';
        container.style.top = '';
      };
    }

    // 이메일 기억하기: 저장된 이메일/이름 복원
    const emailInput = container.querySelector('#auth-email');
    const rememberCheck = container.querySelector('#auth-remember');
    const savedEmail = localStorage.getItem('tennis_remember_email');
    const savedRememberName = localStorage.getItem('tennis_remember_name');
    if (savedEmail) {
      emailInput.value = savedEmail;
      rememberCheck.checked = true;
    }

    let isMemberTab = false;
    const form = container.querySelector('#auth-form');
    const confirmWrap = container.querySelector('#auth-confirm-wrap');
    const memberNameWrap = container.querySelector('#auth-member-name-wrap');
    const memberNameInput = container.querySelector('#auth-member-name');
    const submitBtn = container.querySelector('#auth-submit-btn');
    const errorEl = container.querySelector('#auth-error');
    const tabAdmin = container.querySelector('#auth-tab-admin');
    const tabMember = container.querySelector('#auth-tab-member');

    // 저장된 멤버 이름 복원 (기억하기 > 기존 저장 순)
    if (savedRememberName) {
      memberNameInput.value = savedRememberName;
    } else {
      const savedMemberName = localStorage.getItem('tennis_member_name');
      if (savedMemberName) memberNameInput.value = savedMemberName;
    }

    // 저장된 탭 복원
    const savedTab = localStorage.getItem('tennis_login_tab');
    if (savedTab === 'member') {
      isMemberTab = true;
      tabAdmin.className = 'flex-1 py-3 text-sm font-bold text-gray-400 border-b-2 border-transparent hover:text-gray-600 transition';
      tabMember.className = 'flex-1 py-3 text-sm font-bold text-blue-700 border-b-2 border-blue-700 transition';
      memberNameWrap.style.display = '';
      container.querySelector('#auth-remember-label').textContent = '아이디/이름 기억하기';
    }

    const rememberLabel = container.querySelector('#auth-remember-label');
    const switchTab = (toMember) => {
      isMemberTab = toMember;
      errorEl.classList.add('hidden');
      localStorage.setItem('tennis_login_tab', toMember ? 'member' : 'admin');
      if (toMember) {
        tabAdmin.className = 'flex-1 py-3 text-sm font-bold text-gray-400 border-b-2 border-transparent hover:text-gray-600 transition';
        tabMember.className = 'flex-1 py-3 text-sm font-bold text-blue-700 border-b-2 border-blue-700 transition';
        memberNameWrap.style.display = '';
        rememberLabel.textContent = '아이디/이름 기억하기';
      } else {
        tabAdmin.className = 'flex-1 py-3 text-sm font-bold text-blue-700 border-b-2 border-blue-700 transition';
        tabMember.className = 'flex-1 py-3 text-sm font-bold text-gray-400 border-b-2 border-transparent hover:text-gray-600 transition';
        memberNameWrap.style.display = 'none';
        rememberLabel.textContent = '아이디 기억하기';
      }
    };
    tabAdmin.onclick = () => switchTab(false);
    tabMember.onclick = () => switchTab(true);

    form.onsubmit = async (e) => {
      e.preventDefault();
      const email = container.querySelector('#auth-email').value.trim();
      const password = container.querySelector('#auth-password').value;
      errorEl.classList.add('hidden');

      // 멤버 탭: 이름 빈값 체크
      if (isMemberTab) {
        const name = memberNameInput.value.trim();
        if (!name) {
          errorEl.textContent = '이름을 입력해주세요.';
          errorEl.classList.remove('hidden');
          return;
        }
        localStorage.setItem('tennis_member_name', name);
      }

      // 이미 로그인된 상태 (이름만 수정 후 재시도)
      if (fbAuth.currentUser && isMemberTab) {
        // 이메일/이름 기억하기 처리
        if (rememberCheck.checked) {
          localStorage.setItem('tennis_remember_name', memberNameInput.value.trim());
        }
        submitBtn.disabled = true;
        submitBtn.textContent = '처리 중...';
        await this._retryMemberLogin();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '처리 중...';

      try {
        // 이메일/이름 기억하기 처리
        if (rememberCheck.checked) {
          localStorage.setItem('tennis_remember_email', email);
          if (isMemberTab) {
            localStorage.setItem('tennis_remember_name', memberNameInput.value.trim());
          }
        } else {
          localStorage.removeItem('tennis_remember_email');
          localStorage.removeItem('tennis_remember_name');
        }

        await fbAuth.signInWithEmailAndPassword(email, password);
      } catch (err) {
        errorEl.textContent = this.getErrorMessage(err);
        errorEl.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = '로그인';
        if (isMemberTab) localStorage.removeItem('tennis_member_name');
      }
    };
  },

  getErrorMessage(err) {
    const code = err.code || '';
    if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential')
      return '아이디 또는 비밀번호가 올바르지 않습니다.';
    if (code === 'auth/email-already-in-use') return '이미 사용 중인 아이디입니다.';
    if (code === 'auth/weak-password') return '비밀번호가 너무 짧습니다. (6자 이상)';
    if (code === 'auth/invalid-email') return '올바른 아이디 형식을 입력해주세요.';
    if (code === 'auth/too-many-requests') return '너무 많은 시도입니다. 잠시 후 다시 시도해주세요.';
    return err.message || '오류가 발생했습니다.';
  },

  logout() {
    if (confirm('로그아웃 하시겠습니까?')) {
      localStorage.removeItem(Storage.KEYS.PLAYERS);
      localStorage.removeItem(Storage.KEYS.TOURNAMENTS);
      localStorage.removeItem(Storage.KEYS.EVENTS);
      localStorage.removeItem(Storage.KEYS.COURTS);
      localStorage.removeItem(Storage.KEYS.TEAMS);
      localStorage.removeItem('tennis_last_uid');
      localStorage.removeItem('tennis_member_name');
      fbAuth.signOut();
    }
  }
};
