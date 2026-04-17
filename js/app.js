// app.js - 앱 초기화, 탭 전환, 대회/대진표 생성
const GAME_TYPES = {
  MS: { label: '남자단식', icon: '🏃‍♂️', gender: 'M', doubles: false },
  WS: { label: '여자단식', icon: '🏃‍♀️', gender: 'F', doubles: false },
  MD: { label: '남자복식', icon: '👬', gender: 'M', doubles: true },
  WD: { label: '여자복식', icon: '👭', gender: 'F', doubles: true },
  XD: { label: '혼합복식', icon: '👫', gender: 'mixed', doubles: true },
};

const App = {
  currentTab: 'players',
  currentTournamentId: null,
  _createSubTab: 'custom-bracket',
  _scheduleSubTab: 'custom-schedule',
  _viewMode: 'home', // 'home' | 'calendar' | 'settings'

  init() {
    // 재로그인 시 이전 화면 잔존 방지
    var content = document.getElementById('main-content');
    if (content) content.innerHTML = '';
    this.applyRoleUI();
    this.bindTabs();
    // 멤버: 이름 확인 필요
    if (RolesConfig.isMember() && !this.getMemberName()) {
      this.showMemberNameModal();
    } else {
      this.navigate(RolesConfig.getDefaultTab());
    }
  },

  // 멤버 이름 관련
  getMemberName() {
    return localStorage.getItem('tennis_member_name') || '';
  },

  setMemberName(name) {
    localStorage.setItem('tennis_member_name', name);
  },

  clearMemberName() {
    localStorage.removeItem('tennis_member_name');
  },

  showMemberNameModal() {
    var self = this;
    var players = Storage.getPlayers();
    var playerNames = players.map(function(p) { return p.name; });

    var modal = document.createElement('div');
    modal.id = 'member-name-modal';
    modal.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4';
    modal.innerHTML =
      '<div class="absolute inset-0 bg-black/50"></div>' +
      '<div class="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">' +
        '<button id="member-name-close" class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition" title="닫기">' +
          '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>' +
        '</button>' +
        '<h3 class="text-lg font-bold text-gray-800 text-center">이름 확인</h3>' +
        '<p class="text-sm text-gray-500 text-center">멤버 목록에 등록된 본인의 이름을 입력해주세요.</p>' +
        '<input type="text" id="member-name-input" class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-700 transition" placeholder="이름 입력">' +
        '<p id="member-name-error" class="text-sm text-red-500 hidden text-center"></p>' +
        '<button id="member-name-submit" class="w-full py-3 bg-gradient-to-r from-green-700 to-green-800 text-white rounded-xl hover:from-green-800 hover:to-green-900 font-semibold transition">확인</button>' +
      '</div>';

    document.body.appendChild(modal);

    setTimeout(function() {
      document.getElementById('member-name-input').focus();
    }, 100);

    function trySubmit() {
      var name = document.getElementById('member-name-input').value.trim();
      var errorEl = document.getElementById('member-name-error');

      if (!name) {
        errorEl.textContent = '이름을 입력해주세요.';
        errorEl.classList.remove('hidden');
        return;
      }

      var found = playerNames.find(function(n) { return n === name; });
      if (!found) {
        errorEl.textContent = '멤버 목록에 등록되지 않은 이름입니다.';
        errorEl.classList.remove('hidden');
        return;
      }

      self.setMemberName(found);
      self.applyRoleUI();
      modal.remove();
      self.navigate(RolesConfig.getDefaultTab());
    }

    document.getElementById('member-name-submit').addEventListener('click', trySubmit);
    document.getElementById('member-name-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        trySubmit();
      }
    });
    document.getElementById('member-name-close').addEventListener('click', function() {
      modal.remove();
      localStorage.removeItem(Storage.KEYS.PLAYERS);
      localStorage.removeItem(Storage.KEYS.TOURNAMENTS);
      localStorage.removeItem(Storage.KEYS.EVENTS);
      localStorage.removeItem(Storage.KEYS.COURTS);
      localStorage.removeItem('tennis_last_uid');
      localStorage.removeItem('tennis_member_name');
      fbAuth.signOut();
    });
  },

  applyRoleUI() {
    var visibleTabs = RolesConfig.getVisibleTabs();
    document.querySelectorAll('[data-tab]').forEach(function(tab) {
      tab.style.display = visibleTabs.includes(tab.dataset.tab) ? '' : 'none';
    });

    // 사이드 메뉴에 역할 뱃지 표시
    var menuHeader = document.querySelector('#left-menu h2');
    if (menuHeader) {
      var badge = document.getElementById('role-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.id = 'role-badge';
        menuHeader.appendChild(badge);
      }
      var roleLabel = RolesConfig.isAdmin() ? '관리자' : '';
      if (RolesConfig.isMember()) {
        var mName = this.getMemberName();
        roleLabel = mName ? mName + '님' : '멤버';
      }
      if (roleLabel) {
        badge.textContent = roleLabel;
        badge.style.display = '';
        badge.className = RolesConfig.isAdmin()
          ? 'text-xs font-normal ml-2 px-2 py-0.5 rounded-full bg-red-100 text-red-600'
          : 'text-xs font-normal ml-2 px-2 py-0.5 rounded-full bg-blue-100 text-blue-600';
      } else {
        badge.style.display = 'none';
      }
    }

    // 설정 메뉴: 관리자만 표시
    var settingsBtn = document.getElementById('menu-settings');
    if (settingsBtn) {
      settingsBtn.classList.toggle('hidden', !RolesConfig.isAdmin());
    }
  },

  bindTabs() {
    document.querySelectorAll('[data-tab]').forEach(tab => {
      tab.onclick = () => this.navigate(tab.dataset.tab);
    });
  },

  showHome() {
    this._viewMode = 'home';
    var tabNav = document.querySelector('header nav');
    if (tabNav) tabNav.style.display = '';
    this._updateMenuActive();
    this.navigate(this.currentTab || RolesConfig.getDefaultTab());
  },

  showCalendar() {
    this._viewMode = 'calendar';
    var tabNav = document.querySelector('header nav');
    if (tabNav) tabNav.style.display = 'none';
    // 탭 active 스타일 제거
    document.querySelectorAll('[data-tab]').forEach(function(tab) {
      tab.classList.remove('tab-active');
      tab.classList.add('text-gray-500');
    });
    this._updateMenuActive();
    var content = document.getElementById('main-content');
    Calendar.render(content);
  },

  showSettings() {
    this._viewMode = 'settings';
    var tabNav = document.querySelector('header nav');
    if (tabNav) tabNav.style.display = 'none';
    document.querySelectorAll('[data-tab]').forEach(function(tab) {
      tab.classList.remove('tab-active');
      tab.classList.add('text-gray-500');
    });
    this._updateMenuActive();
    var content = document.getElementById('main-content');
    this.renderSettings(content);
  },

  renderSettings(container) {
    var self = this;
    var courts = Storage.getCourts();

    // 월 옵션 생성 (현재 월 기준 앞뒤 포함)
    var now = new Date();
    var curYear = now.getFullYear();
    var curMonth = now.getMonth(); // 0-based
    var monthOptions = '';
    for (var mi = 0; mi < 12; mi++) {
      var selected = mi === curMonth ? ' selected' : '';
      monthOptions += '<option value="' + mi + '"' + selected + '>' + (mi + 1) + '월</option>';
    }

    patchDOM(container,
      '<div class="max-w-lg mx-auto">' +
        '<h2 class="text-2xl font-bold text-gray-800 mb-6">설정</h2>' +
        // 정규 운동 등록
        '<div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-green-100/30 border border-white/60 mb-4">' +
          '<div class="px-4 py-3">' +
            '<h3 class="font-semibold text-gray-700 text-sm mb-3">정규 운동 등록</h3>' +
            '<div class="flex items-center gap-2">' +
              '<select id="reg-year-select" class="px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-green-700 focus:border-green-700">' +
                '<option value="' + (curYear - 1) + '">' + (curYear - 1) + '년</option>' +
                '<option value="' + curYear + '" selected>' + curYear + '년</option>' +
                '<option value="' + (curYear + 1) + '">' + (curYear + 1) + '년</option>' +
              '</select>' +
              '<select id="reg-month-select" class="px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-green-700 focus:border-green-700">' +
                monthOptions +
              '</select>' +
              '<button id="reg-exercise-btn" class="flex-1 px-4 py-2.5 bg-gradient-to-r from-green-700 to-green-800 text-white rounded-xl hover:from-green-800 hover:to-green-900 active:scale-[0.98] transition-all font-medium whitespace-nowrap shadow-sm shadow-green-300/50">정규 운동 등록</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        // 정규 운동 확인
        '<div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-green-100/30 border border-white/60 mb-4">' +
          '<div class="px-4 py-3">' +
            '<h3 class="font-semibold text-gray-700 text-sm mb-3">정규 운동 확인</h3>' +
            '<div class="flex items-center gap-2 mb-2">' +
              '<select id="reg-check-year" class="px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-green-700 focus:border-green-700">' +
                '<option value="' + (curYear - 1) + '">' + (curYear - 1) + '년</option>' +
                '<option value="' + curYear + '" selected>' + curYear + '년</option>' +
                '<option value="' + (curYear + 1) + '">' + (curYear + 1) + '년</option>' +
              '</select>' +
              '<select id="reg-check-month" class="px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-green-700 focus:border-green-700">' +
                monthOptions +
              '</select>' +
              '<select id="reg-check-day" class="px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-green-700 focus:border-green-700"></select>' +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              '<select id="reg-check-court" class="px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-green-700 focus:border-green-700">' +
                '<option value="선정">선정</option>' +
                '<option value="장미">장미</option>' +
              '</select>' +
              '<select id="reg-check-time" class="px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-green-700 focus:border-green-700">' +
                '<option value="06~09">06~09</option>' +
                '<option value="09~12">09~12</option>' +
              '</select>' +
              '<button id="reg-check-btn" class="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 active:scale-[0.98] transition-all font-medium whitespace-nowrap shadow-sm shadow-blue-200/50">정규 운동 확인</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        // 코트 관리
        '<div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-green-100/30 border border-white/60">' +
          '<div class="px-4 py-3 border-b border-gray-100">' +
            '<h3 class="font-semibold text-gray-700 text-sm mb-2">코트 관리</h3>' +
            '<div class="flex gap-2">' +
              '<input type="text" id="court-name-input" class="min-w-0 flex-1 px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-700 focus:border-green-700 text-base" placeholder="코트 이름 입력" maxlength="30">' +
              '<button id="add-court-btn" class="px-4 py-2.5 bg-gradient-to-r from-green-700 to-green-800 text-white rounded-xl hover:from-green-800 hover:to-green-900 active:scale-[0.98] transition-all font-medium whitespace-nowrap flex-shrink-0 shadow-sm shadow-green-300/50">추가</button>' +
            '</div>' +
          '</div>' +
          '<div class="px-4 py-2 border-b border-gray-100 bg-gray-50/50">' +
            '<span class="text-xs text-gray-500">등록 코트 ' + courts.length + '면</span>' +
          '</div>' +
          '<div id="court-list" class="divide-y divide-gray-50">' +
            (courts.length === 0
              ? '<p class="text-gray-400 text-center py-8">등록된 코트가 없습니다.</p>'
              : courts.map(function(c, i) {
                  return '<div class="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition">' +
                    '<div class="flex items-center gap-3 min-w-0">' +
                      '<span class="w-7 h-7 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">' + (i + 1) + '</span>' +
                      '<span class="text-gray-800 font-medium truncate">' + self._escapeHtml(c.name) + '</span>' +
                    '</div>' +
                    '<button class="delete-court-btn text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg px-3 py-1 transition text-sm flex-shrink-0 ml-2" data-id="' + c.id + '">삭제</button>' +
                  '</div>';
                }).join('')) +
          '</div>' +
        '</div>' +
        // 역할 관리
        '<div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-green-100/30 border border-white/60 mt-4">' +
          '<div class="px-4 py-3 border-b border-gray-100">' +
            '<h3 class="font-semibold text-gray-700 text-sm mb-2">역할 관리</h3>' +
            '<div class="flex gap-2">' +
              '<input type="email" id="role-email-input" class="min-w-0 flex-1 px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-700 focus:border-green-700 text-base" placeholder="이메일 입력" maxlength="50">' +
              '<select id="role-type-select" class="px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-green-700 focus:border-green-700">' +
                '<option value="admin">관리자</option>' +
                '<option value="member">멤버</option>' +
              '</select>' +
              '<button id="add-role-btn" class="px-4 py-2.5 bg-gradient-to-r from-green-700 to-green-800 text-white rounded-xl hover:from-green-800 hover:to-green-900 active:scale-[0.98] transition-all font-medium whitespace-nowrap flex-shrink-0 shadow-sm shadow-green-300/50">추가</button>' +
            '</div>' +
          '</div>' +
          '<div id="role-list" class="divide-y divide-gray-50">' +
            '<p class="text-gray-400 text-center py-4 text-sm">불러오는 중...</p>' +
          '</div>' +
        '</div>' +
      '</div>');

    // 역할 목록 로드
    self._loadRoleList();

    // 역할 추가
    var roleEmailInput = document.getElementById('role-email-input');
    var roleTypeSelect = document.getElementById('role-type-select');
    var addRoleBtn = document.getElementById('add-role-btn');

    var addRole = async function() {
      var email = roleEmailInput.value.trim().toLowerCase();
      if (!email) return;
      var role = roleTypeSelect.value;
      addRoleBtn.disabled = true;
      addRoleBtn.textContent = '처리 중...';
      var ok = await RolesConfig.setRole(email, role);
      if (ok) {
        roleEmailInput.value = '';
        self._loadRoleList();
      } else {
        alert('역할 설정에 실패했습니다.');
      }
      addRoleBtn.disabled = false;
      addRoleBtn.textContent = '추가';
    };

    addRoleBtn.addEventListener('click', addRole);
    roleEmailInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') addRole();
    });

    // 코트 추가
    var courtInput = document.getElementById('court-name-input');
    var addCourtBtn = document.getElementById('add-court-btn');

    var addCourt = function() {
      var name = courtInput.value.trim();
      if (!name) return;
      var courts = Storage.getCourts();
      if (courts.some(function(c) { return c.name === name; })) {
        alert('이미 등록된 코트입니다.');
        return;
      }
      courts.push({ id: Storage.generateId(), name: name });
      Storage.saveCourts(courts);
      self.renderSettings(container);
    };

    addCourtBtn.addEventListener('click', addCourt);
    courtInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') addCourt();
    });

    // 코트 삭제
    container.querySelectorAll('.delete-court-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (!confirm('이 코트를 삭제하시겠습니까?')) return;
        var courts = Storage.getCourts().filter(function(c) { return c.id !== btn.dataset.id; });
        Storage.saveCourts(courts);
        self.renderSettings(container);
      });
    });

    // 정규 운동 등록 버튼
    var regBtn = document.getElementById('reg-exercise-btn');
    if (regBtn) {
      regBtn.addEventListener('click', function() {
        var year = parseInt(document.getElementById('reg-year-select').value);
        var month = parseInt(document.getElementById('reg-month-select').value);
        self.handleRegularExercise(container, year, month);
      });
    }

    // 정규 운동 확인 - 일(day) 옵션 동적 생성
    var regCheckYear = document.getElementById('reg-check-year');
    var regCheckMonth = document.getElementById('reg-check-month');
    var regCheckDay = document.getElementById('reg-check-day');
    var dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    function updateDayOptions() {
      var y = parseInt(regCheckYear.value);
      var m = parseInt(regCheckMonth.value);
      var days = new Date(y, m + 1, 0).getDate();
      var prevVal = regCheckDay.value;
      var todayDate = now.getDate();
      regCheckDay.innerHTML = '';

      // 1일이 일요일이면 단독 표시
      if (new Date(y, m, 1).getDay() === 0) {
        var opt = document.createElement('option');
        opt.value = 1;
        opt.textContent = '1일(일)';
        regCheckDay.appendChild(opt);
      }

      // 토요일 기준으로 토~일 쌍 생성
      for (var di = 1; di <= days; di++) {
        if (new Date(y, m, di).getDay() !== 6) continue;
        var opt = document.createElement('option');
        opt.value = di;
        if (di + 1 <= days) {
          opt.textContent = di + '일(토)~' + (di + 1) + '일(일)';
        } else {
          opt.textContent = di + '일(토)';
        }
        regCheckDay.appendChild(opt);
      }

      // 기본값: 이전 선택값 유지 또는 오늘 이후 가장 가까운 주말
      var options = regCheckDay.options;
      if (prevVal && regCheckDay.querySelector('option[value="' + prevVal + '"]')) {
        regCheckDay.value = prevVal;
      } else {
        var found = false;
        for (var oi = 0; oi < options.length; oi++) {
          if (parseInt(options[oi].value) >= todayDate) {
            regCheckDay.value = options[oi].value;
            found = true;
            break;
          }
        }
        if (!found && options.length > 0) {
          regCheckDay.selectedIndex = 0;
        }
      }
    }
    updateDayOptions();
    regCheckYear.addEventListener('change', updateDayOptions);
    regCheckMonth.addEventListener('change', updateDayOptions);

    // 정규 운동 확인 버튼
    var regCheckBtn = document.getElementById('reg-check-btn');
    if (regCheckBtn) {
      regCheckBtn.addEventListener('click', function() {
        var year = parseInt(regCheckYear.value);
        var month = parseInt(regCheckMonth.value);
        var day = parseInt(regCheckDay.value);
        var court = document.getElementById('reg-check-court').value;
        var time = document.getElementById('reg-check-time').value;
        self.handleRegularExerciseCheck(year, month, day, court, time);
      });
    }
  },

  handleRegularExercise(container, year, month) {
    // 선택한 년/월의 모든 토요일·일요일 구하기
    var weekendDates = [];
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    for (var d = 1; d <= daysInMonth; d++) {
      var dayOfWeek = new Date(year, month, d).getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) { // 일요일(0) 또는 토요일(6)
        var mm = String(month + 1).padStart(2, '0');
        var dd = String(d).padStart(2, '0');
        weekendDates.push(year + '-' + mm + '-' + dd);
      }
    }

    if (weekendDates.length === 0) {
      alert('해당 월에 주말이 없습니다.');
      return;
    }

    // 주말별 3개 일정 정의
    var templates = [
      { title: '장미 06~09 정규 운동', startTime: '06:00', endTime: '09:00', color: 'pink' },
      { title: '선정 06~09 정규 운동', startTime: '06:00', endTime: '09:00', color: 'blue' },
      { title: '선정 09~12 정규 운동', startTime: '09:00', endTime: '12:00', color: 'orange' },
    ];

    var events = Storage.getEvents();

    // 중복 체크: 같은 날짜 + 같은 제목이 이미 있으면 건너뜀
    var newCount = 0;
    for (var i = 0; i < weekendDates.length; i++) {
      var dateStr = weekendDates[i];
      for (var j = 0; j < templates.length; j++) {
        var tmpl = templates[j];
        var exists = events.some(function(e) {
          return e.date === dateStr && e.title === tmpl.title;
        });
        if (!exists) {
          events.push({
            id: Storage.generateId(),
            title: tmpl.title,
            date: dateStr,
            startTime: tmpl.startTime,
            endTime: tmpl.endTime,
            description: '',
            color: tmpl.color,
            maxParticipants: 0,
            participants: [],
            waitlist: []
          });
          newCount++;
        }
      }
    }

    if (newCount === 0) {
      alert((month + 1) + '월 주말 정규 운동이 이미 모두 등록되어 있습니다.');
      return;
    }

    // 날짜순 정렬
    events.sort(function(a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.startTime || a.time || '').localeCompare(b.startTime || b.time || '');
    });

    Storage.saveEvents(events);
    alert((month + 1) + '월 주말 정규 운동 ' + newCount + '건이 등록되었습니다.');
  },

  handleRegularExerciseCheck(year, month, day, court, time) {
    var selectedDate = new Date(year, month, day);
    var dow = selectedDate.getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    // 선택한 날의 토·일 쌍 구하기
    var satDay, sunDay;
    if (dow === 6) { satDay = day; sunDay = day + 1; }
    else { satDay = day - 1; sunDay = day; }

    var weekendDays = [];
    if (satDay >= 1 && satDay <= daysInMonth) weekendDays.push({ day: satDay, dow: 6 });
    if (sunDay >= 1 && sunDay <= daysInMonth) weekendDays.push({ day: sunDay, dow: 0 });

    // 이벤트 제목 매칭 키워드: "선정 06~09" or "장미 09~12" 등
    var titleKeyword = court + ' ' + time;
    var events = Storage.getEvents();
    var mm = String(month + 1).padStart(2, '0');

    var lines = [];
    lines.push('안녕하세요.');
    lines.push('금주 참석자 명단을 공지합니다. 변동사항이 있으시면 말씀해주시기 바랍니다.');
    lines.push('');

    for (var i = 0; i < weekendDays.length; i++) {
      var wd = weekendDays[i];
      var dd = String(wd.day).padStart(2, '0');
      var dateStr = year + '-' + mm + '-' + dd;

      var matchEvent = events.find(function(e) {
        return e.date === dateStr && e.title.indexOf(titleKeyword) >= 0;
      });

      var participants = matchEvent ? (matchEvent.participants || []) : [];
      lines.push('* ' + wd.day + '일(' + dayNames[wd.dow] + ') : ' + participants.length + '명');
      if (participants.length > 0) {
        for (var pi = 0; pi < participants.length; pi += 6) {
          lines.push(participants.slice(pi, pi + 6).join(', '));
        }
      }
      lines.push('');
    }

    var text = lines.join('\n').trim();

    navigator.clipboard.writeText(text).then(function() {
      alert('클립보드에 복사되었습니다.');
    }).catch(function() {
      // fallback
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('클립보드에 복사되었습니다.');
    });
  },

  _escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // 역할 목록 Firestore에서 로드하여 UI 갱신
  async _loadRoleList() {
    var self = this;
    var listEl = document.getElementById('role-list');
    if (!listEl) return;
    var roles = await RolesConfig.getRoles();
    var currentEmail = fbAuth.currentUser ? fbAuth.currentUser.email.toLowerCase() : '';
    var roleLabels = { admin: '관리자', member: '멤버' };
    if (roles.length === 0) {
      listEl.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">등록된 역할이 없습니다.</p>';
      return;
    }
    listEl.innerHTML = roles.map(function(r, i) {
      var isSelf = r.email === currentEmail;
      return '<div class="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition">' +
        '<div class="flex items-center gap-3 min-w-0">' +
          '<span class="w-7 h-7 ' + (r.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700') + ' rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">' + (roleLabels[r.role] || r.role).charAt(0) + '</span>' +
          '<div class="min-w-0">' +
            '<span class="text-gray-800 font-medium text-sm truncate block">' + self._escapeHtml(r.email) + '</span>' +
            '<span class="text-xs text-gray-400">' + (roleLabels[r.role] || r.role) + '</span>' +
          '</div>' +
        '</div>' +
        (isSelf ? '<span class="text-xs text-gray-400 flex-shrink-0 ml-2">나</span>' :
          '<button class="delete-role-btn text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg px-3 py-1 transition text-sm flex-shrink-0 ml-2" data-email="' + self._escapeHtml(r.email) + '">삭제</button>') +
      '</div>';
    }).join('');

    // 역할 삭제 이벤트
    listEl.querySelectorAll('.delete-role-btn').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var email = btn.dataset.email;
        if (!confirm(email + '의 역할을 삭제하시겠습니까?\n삭제 후 해당 계정은 "그 외" 사용자가 됩니다.')) return;
        btn.disabled = true;
        btn.textContent = '삭제 중...';
        var ok = await RolesConfig.removeRole(email);
        if (ok) {
          self._loadRoleList();
        } else {
          alert('역할 삭제에 실패했습니다.');
          btn.disabled = false;
          btn.textContent = '삭제';
        }
      });
    });
  },

  _updateMenuActive() {
    var homeBtn = document.getElementById('menu-home');
    var calBtn = document.getElementById('menu-calendar');
    var settingsBtn = document.getElementById('menu-settings');
    if (homeBtn) {
      if (this._viewMode === 'home') {
        homeBtn.classList.add('active');
      } else {
        homeBtn.classList.remove('active');
      }
    }
    if (calBtn) {
      if (this._viewMode === 'calendar') {
        calBtn.classList.add('active');
      } else {
        calBtn.classList.remove('active');
      }
    }
    if (settingsBtn) {
      if (this._viewMode === 'settings') {
        settingsBtn.classList.add('active');
      } else {
        settingsBtn.classList.remove('active');
      }
    }
  },

  navigate(tabName, tournamentId) {
    // 탭 전환 시 홈 모드로 전환 + 탭 네비 보이기
    this._viewMode = 'home';
    var tabNav = document.querySelector('header nav');
    if (tabNav) tabNav.style.display = '';
    this._updateMenuActive();

    // 멤버가 관리자 전용 탭 접근 시 기본 탭으로 리다이렉트
    var visibleTabs = RolesConfig.getVisibleTabs();
    if (!visibleTabs.includes(tabName)) {
      tabName = RolesConfig.getDefaultTab();
    }
    this.currentTab = tabName;

    document.querySelectorAll('[data-tab]').forEach(tab => {
      if (tab.dataset.tab === tabName) {
        tab.classList.add('tab-active');
        tab.classList.remove('text-gray-500');
      } else {
        tab.classList.remove('tab-active');
        tab.classList.add('text-gray-500');
      }
    });

    const content = document.getElementById('main-content');

    switch (tabName) {
      case 'players':
        Players.render(content);
        break;
      case 'create':
        this.renderCreateForm(content);
        break;
      case 'schedule':
        this.renderScheduleForm(content);
        break;
      case 'calendar':
        Calendar.render(content);
        break;
      case 'active':
        this.renderTournamentList(content, tournamentId);
        break;
    }
  },

  // ─── 대회 만들기 (토너먼트/리그) ───

  getEligiblePlayers(gameType) {
    const players = Storage.getPlayers();
    const config = GAME_TYPES[gameType];
    if (config.gender === 'mixed') return players;
    return players.filter(p => p.gender === config.gender);
  },

  renderCreateForm(container) {
    const activeSubTab = this._createSubTab || 'auto';

    patchDOM(container, `
      <div class="max-w-lg mx-auto">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">대회 만들기</h2>
        <div class="flex gap-2 mb-6">
          <button data-subtab="auto"
            class="sub-tab flex-1 px-4 py-2 rounded-full text-sm font-semibold transition
              ${activeSubTab === 'auto' ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
            자동 대회
          </button>
          <button data-subtab="custom-bracket"
            class="sub-tab flex-1 px-4 py-2 rounded-full text-sm font-semibold transition
              ${activeSubTab === 'custom-bracket' ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
            커스텀 대회
          </button>
        </div>
        <div id="create-sub-content"></div>
      </div>`);

    container.querySelectorAll('[data-subtab]').forEach(btn => {
      btn.onclick = () => {
        this._createSubTab = btn.dataset.subtab;
        this.renderCreateForm(container);
      };
    });

    const subContent = container.querySelector('#create-sub-content');
    if (activeSubTab === 'auto') {
      this._renderAutoCreateForm(subContent);
    } else {
      CustomBracket.renderBuilder(subContent);
    }
  },

  _renderAutoCreateForm(container) {
    const allPlayers = Storage.getPlayers();

    if (allPlayers.length < 2) {
      patchDOM(container, `
        <div class="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-center">
          <p class="text-yellow-800 font-medium mb-2">멤버를 2명 이상 등록해주세요.</p>
          <button onclick="App.navigate('players')" class="text-green-700 font-semibold hover:underline">멤버 관리로 이동</button>
        </div>`);
      return;
    }

    patchDOM(container, `
      <form id="create-form" class="space-y-5">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">대회명</label>
          <input type="text" id="tournament-name" required maxlength="30"
            class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-700 focus:border-green-700"
            placeholder="예: 2024년 봄 정기대회">
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">경기 종류</label>
          <div class="grid grid-cols-3 gap-2 sm:grid-cols-5">
            ${Object.entries(GAME_TYPES).map(([key, cfg], i) => `
              <label class="cursor-pointer">
                <input type="radio" name="gameType" value="${key}" ${key === 'XD' ? 'checked' : ''} class="sr-only peer">
                <div class="border-2 border-gray-200 rounded-xl py-2.5 px-1 text-center peer-checked:border-green-500 peer-checked:bg-green-50 transition">
                  <div class="text-lg">${cfg.icon}</div>
                  <div class="text-xs font-semibold text-gray-700 mt-0.5">${cfg.label}</div>
                </div>
              </label>
            `).join('')}
          </div>
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">대회 형식</label>
          <div class="grid grid-cols-2 gap-3">
            <label class="format-option relative cursor-pointer">
              <input type="radio" name="format" value="tournament" checked class="sr-only peer">
              <div class="border-2 border-gray-200 rounded-xl p-4 text-center peer-checked:border-green-500 peer-checked:bg-green-50 transition">
                <div class="text-2xl mb-1">🏆</div>
                <div class="font-semibold text-gray-800">토너먼트</div>
                <div class="text-xs text-gray-500 mt-1">싱글 엘리미네이션</div>
              </div>
            </label>
            <label class="format-option relative cursor-pointer">
              <input type="radio" name="format" value="league" class="sr-only peer">
              <div class="border-2 border-gray-200 rounded-xl p-4 text-center peer-checked:border-green-500 peer-checked:bg-green-50 transition">
                <div class="text-2xl mb-1">📊</div>
                <div class="font-semibold text-gray-800">리그</div>
                <div class="text-xs text-gray-500 mt-1">라운드 로빈</div>
              </div>
            </label>
          </div>
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">세트 수</label>
          <div class="flex gap-3">
            ${[1, 3, 5].map(n => `
              <label class="flex-1 cursor-pointer">
                <input type="radio" name="setCount" value="${n}" ${n === 3 ? 'checked' : ''} class="sr-only peer">
                <div class="border-2 border-gray-200 rounded-xl py-2.5 text-center peer-checked:border-green-500 peer-checked:bg-green-50 transition">
                  <span class="font-semibold text-gray-800">${n}세트</span>
                  <div class="text-xs text-gray-500">${Math.ceil(n / 2)}세트 선승</div>
                </div>
              </label>
            `).join('')}
          </div>
        </div>

        <div id="participants-section"></div>

        <button type="submit"
          class="w-full py-3 bg-gradient-to-r from-green-700 to-green-800 text-white rounded-xl hover:from-green-800 hover:to-green-900 active:scale-[0.98] transition-all font-semibold text-lg shadow-md shadow-green-300/50">
          대회 생성
        </button>
      </form>`);

    const gameTypeRadios = container.querySelectorAll('input[name="gameType"]');
    gameTypeRadios.forEach(r => {
      r.onchange = () => this.renderParticipantsSection(container);
    });

    this.renderParticipantsSection(container);

    container.querySelector('#create-form').onsubmit = (e) => {
      e.preventDefault();

      const name = container.querySelector('#tournament-name').value.trim();
      const gameType = container.querySelector('input[name="gameType"]:checked').value;
      const format = container.querySelector('input[name="format"]:checked').value;
      const setCount = parseInt(container.querySelector('input[name="setCount"]:checked').value);
      const config = GAME_TYPES[gameType];

      if (!name) { alert('대회명을 입력해주세요.'); return; }

      let participants;

      if (config.doubles) {
        participants = this.collectDoublesTeams(container, gameType);
        if (!participants) return;
      } else {
        const selected = Array.from(container.querySelectorAll('.player-checkbox:checked')).map(cb => cb.value);
        if (selected.length < 2) { alert('2명 이상 선택해주세요.'); return; }
        participants = selected;
      }

      const tournament = {
        id: Storage.generateId(),
        name,
        gameType,
        gameTypeLabel: config.label,
        format,
        setCount,
        players: participants,
        status: 'active',
        createdAt: new Date().toISOString(),
        completedAt: null,
        rounds: format === 'tournament'
          ? Tournament.generateBracket(participants)
          : League.generateSchedule(participants),
      };

      const tournaments = Storage.getTournaments();
      tournaments.push(tournament);
      Storage.saveTournaments(tournaments);

      this.navigate('active', tournament.id);
    };
  },

  renderParticipantsSection(container) {
    const section = container.querySelector('#participants-section');
    const gameType = container.querySelector('input[name="gameType"]:checked').value;

    if (gameType === 'XD') {
      this.renderMixedSection(section);
    } else {
      this.renderSinglesSection(section, gameType);
    }
  },

  renderSinglesSection(section, gameType) {
    const eligible = this.getEligiblePlayers(gameType);
    const config = GAME_TYPES[gameType];
    const minPlayers = config.doubles ? 4 : 2;

    if (eligible.length < minPlayers) {
      patchDOM(section, `
        <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center text-sm">
          <p class="text-yellow-800">${config.label}에 참가 가능한 멤버가 부족합니다. (현재 ${eligible.length}명, 최소 ${minPlayers}명 필요)</p>
        </div>`);
      return;
    }

    patchDOM(section, `
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-2">참가 멤버 선택</label>
        <input type="text" id="player-search" placeholder="이름 검색..."
          class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-700 focus:border-green-700 text-sm mb-2">
        <div class="flex justify-between items-center mb-2">
          <span id="selected-count" class="text-sm text-gray-500">0명 선택</span>
          <button type="button" id="select-all-btn" class="text-sm text-green-700 font-medium hover:underline">전체 선택</button>
        </div>
        <div id="player-checkbox-list" class="bg-white/80 backdrop-blur-sm border border-white/60 rounded-xl max-h-48 overflow-y-auto divide-y divide-gray-50">
          ${eligible.map(p => `
            <label class="player-item flex items-center px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition" data-name="${Results.escapeHtml(p.name.toLowerCase())}">
              <input type="checkbox" name="players" value="${Results.escapeHtml(p.name)}" class="player-checkbox w-4 h-4 text-green-700 rounded border-gray-300 focus:ring-green-700">
              <span class="ml-3 text-sm text-gray-800">${Results.escapeHtml(p.name)}</span>
              <span class="ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${p.gender === 'M' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}">${p.gender === 'M' ? '남' : '여'}</span>
              <span class="text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">${(p.ntrp || 2.5).toFixed(1)}</span>
            </label>
          `).join('')}
        </div>
      </div>`);

    const searchInput = section.querySelector('#player-search');
    const playerItems = section.querySelectorAll('.player-item');
    searchInput.oninput = () => {
      const query = searchInput.value.trim().toLowerCase();
      playerItems.forEach(item => {
        const name = item.dataset.name;
        item.style.display = (!query || name.includes(query)) ? '' : 'none';
      });
    };

    const selectAllBtn = section.querySelector('#select-all-btn');
    const countEl = section.querySelector('#selected-count');

    const updateCount = () => {
      const checked = section.querySelectorAll('.player-checkbox:checked').length;
      countEl.textContent = `${checked}명 선택`;
    };

    section.querySelectorAll('.player-checkbox').forEach(cb => { cb.onchange = updateCount; });

    let allSelected = false;
    selectAllBtn.onclick = () => {
      allSelected = !allSelected;
      section.querySelectorAll('.player-item').forEach(item => {
        if (item.style.display !== 'none') {
          item.querySelector('.player-checkbox').checked = allSelected;
        }
      });
      selectAllBtn.textContent = allSelected ? '선택 해제' : '전체 선택';
      updateCount();
    };
  },

  renderMixedSection(section) {
    const allPlayers = Storage.getPlayers();
    const males = allPlayers.filter(p => p.gender === 'M');
    const females = allPlayers.filter(p => p.gender === 'F');

    if (males.length < 2 || females.length < 2) {
      patchDOM(section, `
        <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center text-sm">
          <p class="text-yellow-800">혼합복식: 남자 2명, 여자 2명 이상 필요합니다. (남 ${males.length}명, 여 ${females.length}명)</p>
        </div>`);
      return;
    }

    const renderList = (players, prefix, genderLabel, badgeClass) => `
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-2">
          ${genderLabel}자 멤버 선택
          <span id="${prefix}-count" class="text-green-700 font-normal">(0명 선택)</span>
        </label>
        <input type="text" id="${prefix}-search" placeholder="이름 검색..."
          class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-700 focus:border-green-700 text-sm mb-2">
        <div class="flex justify-between items-center mb-2">
          <span class="text-sm text-gray-500">${players.length}명 중 선택</span>
          <button type="button" id="${prefix}-all-btn" class="text-sm text-green-700 font-medium hover:underline">전체 선택</button>
        </div>
        <div class="bg-white/80 backdrop-blur-sm border border-white/60 rounded-xl max-h-40 overflow-y-auto divide-y divide-gray-50">
          ${players.map(p => `
            <label class="${prefix}-item player-item flex items-center px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition" data-name="${Results.escapeHtml(p.name.toLowerCase())}">
              <input type="checkbox" name="${prefix}" value="${Results.escapeHtml(p.name)}" class="${prefix}-cb w-4 h-4 text-green-700 rounded border-gray-300 focus:ring-green-700">
              <span class="ml-3 text-sm text-gray-800">${Results.escapeHtml(p.name)}</span>
              <span class="ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${badgeClass}">${genderLabel}</span>
              <span class="text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">${(p.ntrp || 2.5).toFixed(1)}</span>
            </label>
          `).join('')}
        </div>
      </div>`;

    patchDOM(section, `
      <div class="space-y-4">
        ${renderList(males, 'xd-male', '남', 'bg-blue-100 text-blue-700')}
        ${renderList(females, 'xd-female', '여', 'bg-pink-100 text-pink-700')}
        <p class="text-xs text-gray-400">남녀 같은 수를 선택하면 자동으로 팀이 구성됩니다.</p>
      </div>`);

    const bindList = (prefix) => {
      const search = section.querySelector(`#${prefix}-search`);
      const items = section.querySelectorAll(`.${prefix}-item`);
      const countEl = section.querySelector(`#${prefix}-count`);
      const allBtn = section.querySelector(`#${prefix}-all-btn`);

      search.oninput = () => {
        const q = search.value.trim().toLowerCase();
        items.forEach(item => {
          item.style.display = (!q || item.dataset.name.includes(q)) ? '' : 'none';
        });
      };

      const updateCount = () => {
        const checked = section.querySelectorAll(`.${prefix}-cb:checked`).length;
        countEl.textContent = `(${checked}명 선택)`;
      };

      section.querySelectorAll(`.${prefix}-cb`).forEach(cb => { cb.onchange = updateCount; });

      let allSelected = false;
      allBtn.onclick = () => {
        allSelected = !allSelected;
        items.forEach(item => {
          if (item.style.display !== 'none') {
            item.querySelector(`.${prefix}-cb`).checked = allSelected;
          }
        });
        allBtn.textContent = allSelected ? '선택 해제' : '전체 선택';
        updateCount();
      };
    };

    bindList('xd-male');
    bindList('xd-female');
  },

  shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  collectDoublesTeams(container, gameType) {
    if (gameType === 'XD') {
      const males = Array.from(container.querySelectorAll('.xd-male-cb:checked')).map(cb => cb.value);
      const females = Array.from(container.querySelectorAll('.xd-female-cb:checked')).map(cb => cb.value);
      if (males.length < 2 || females.length < 2) {
        alert('혼합복식: 남자 2명, 여자 2명 이상 선택해주세요.');
        return null;
      }
      if (males.length !== females.length) {
        alert(`남녀 수가 같아야 합니다. (남 ${males.length}명, 여 ${females.length}명)`);
        return null;
      }
      const sm = this.shuffleArray(males);
      const sf = this.shuffleArray(females);
      return sm.map((m, i) => `${m} / ${sf[i]}`);
    } else {
      const selected = Array.from(container.querySelectorAll('.player-checkbox:checked')).map(cb => cb.value);
      if (selected.length < 4) {
        alert('복식: 최소 4명 이상 선택해주세요.');
        return null;
      }
      if (selected.length % 2 !== 0) {
        alert('복식: 짝수 인원을 선택해주세요.');
        return null;
      }
      const shuffled = this.shuffleArray(selected);
      const teams = [];
      for (let i = 0; i < shuffled.length; i += 2) {
        teams.push(`${shuffled[i]} / ${shuffled[i + 1]}`);
      }
      return teams;
    }
  },

  // ─── 대진표 만들기 (시간/코트 기반) ───

  generateTimeOptions(selectedValue) {
    const options = [];
    for (let h = 6; h <= 22; h++) {
      for (let m = 0; m < 60; m += 30) {
        if (h === 22 && m > 0) break;
        const val = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        options.push(`<option value="${val}" ${val === selectedValue ? 'selected' : ''}>${val}</option>`);
      }
    }
    return options.join('');
  },

  renderScheduleForm(container) {
    const activeSubTab = this._scheduleSubTab || 'time-court';

    patchDOM(container, `
      <div class="max-w-lg mx-auto">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">대진표 만들기</h2>
        <div class="flex gap-2 mb-6">
          <button data-subtab="time-court"
            class="sub-tab flex-1 px-4 py-2 rounded-full text-sm font-semibold transition
              ${activeSubTab === 'time-court' ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
            시간/코트 대진표
          </button>
          <button data-subtab="custom-schedule"
            class="sub-tab flex-1 px-4 py-2 rounded-full text-sm font-semibold transition
              ${activeSubTab === 'custom-schedule' ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
            커스텀 대진표
          </button>
        </div>
        <div id="schedule-sub-content"></div>
      </div>`);

    container.querySelectorAll('[data-subtab]').forEach(btn => {
      btn.onclick = () => {
        this._scheduleSubTab = btn.dataset.subtab;
        this.renderScheduleForm(container);
      };
    });

    const subContent = container.querySelector('#schedule-sub-content');
    if (activeSubTab === 'time-court') {
      this._renderTimeCourtForm(subContent);
    } else {
      this._renderCustomScheduleForm(subContent);
    }
  },

  _renderCustomScheduleForm(container) {
    patchDOM(container, `
      <p class="text-xs text-gray-400 mb-4">빈 대진표를 생성한 후, 직접 매치를 추가할 수 있습니다.</p>
      <form id="custom-schedule-form" class="space-y-5">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">대진표 이름</label>
          <input type="text" id="cs-name" maxlength="30"
            class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-700 focus:border-green-700"
            placeholder="미입력 시 날짜+시간으로 자동 생성">
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">시간 설정</label>
          <div class="flex items-center gap-2">
            <select id="cs-start" class="flex-1 px-3 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-700 focus:border-green-700 bg-white">
              ${this.generateTimeOptions('08:00')}
            </select>
            <span class="text-gray-500 font-medium">~</span>
            <select id="cs-end" class="flex-1 px-3 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-700 focus:border-green-700 bg-white">
              ${this.generateTimeOptions('10:00')}
            </select>
          </div>
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">코트 수</label>
          <div class="flex gap-2">
            ${[1, 2, 3, 4].map(n => `
              <label class="flex-1 cursor-pointer">
                <input type="radio" name="cs-courts" value="${n}" ${n === 2 ? 'checked' : ''} class="sr-only peer">
                <div class="border-2 border-gray-200 rounded-xl py-2.5 text-center peer-checked:border-green-500 peer-checked:bg-green-50 transition">
                  <span class="font-semibold text-gray-800">${n}면</span>
                </div>
              </label>
            `).join('')}
          </div>
        </div>

        <button type="submit"
          class="w-full py-3 bg-gradient-to-r from-green-700 to-green-800 text-white rounded-xl hover:from-green-800 hover:to-green-900 active:scale-[0.98] transition-all font-semibold text-lg shadow-md shadow-green-300/50">
          빈 대진표 생성
        </button>
      </form>`);

    container.querySelector('#custom-schedule-form').onsubmit = (e) => {
      e.preventDefault();

      const startTime = container.querySelector('#cs-start').value;
      const endTime = container.querySelector('#cs-end').value;
      const courts = parseInt(container.querySelector('input[name="cs-courts"]:checked').value);

      if (startTime >= endTime) {
        alert('종료 시간은 시작 시간보다 뒤여야 합니다.');
        return;
      }

      const slots = Schedule.calculateTimeSlots(startTime, endTime);
      if (slots.length === 0) {
        alert('시간이 부족합니다. 최소 30분 이상 설정해주세요.');
        return;
      }

      const timeSlots = slots.map(time => ({ time, matches: [] }));

      const today = new Date().toISOString().slice(0, 10);
      const customName = container.querySelector('#cs-name').value.trim();
      const tournament = {
        id: Storage.generateId(),
        name: customName || `${today} ${startTime} 대진표`,
        format: 'schedule',
        setCount: 1,
        courts,
        startTime,
        endTime,
        allowMixed: true,
        males: [],
        females: [],
        players: [],
        status: 'active',
        createdAt: new Date().toISOString(),
        completedAt: null,
        timeSlots,
      };

      const tournaments = Storage.getTournaments();
      tournaments.push(tournament);
      Storage.saveTournaments(tournaments);

      this.navigate('active', tournament.id);
    };
  },

  _renderTimeCourtForm(container) {
    const allPlayers = Storage.getPlayers();
    const males = allPlayers.filter(p => p.gender === 'M');
    const females = allPlayers.filter(p => p.gender === 'F');

    if (allPlayers.length < 4) {
      patchDOM(container, `
        <div class="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-center">
          <p class="text-yellow-800 font-medium mb-2">복식 경기를 위해 최소 4명의 멤버가 필요합니다.</p>
          <p class="text-yellow-700 text-sm mb-3">현재: 남 ${males.length}명, 여 ${females.length}명</p>
          <button onclick="App.navigate('players')" class="text-green-700 font-semibold hover:underline">멤버 관리로 이동</button>
        </div>`);
      return;
    }

    patchDOM(container, `
      <div class="flex items-center justify-end mb-4">
        <label class="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" id="allow-mixed" class="w-3.5 h-3.5 text-green-700 rounded border-gray-300 focus:ring-green-700">
          <span class="text-xs text-gray-500">섞어복식 허용</span>
        </label>
      </div>

      <form id="schedule-form" class="space-y-5">
        <!-- 대진표 이름 -->
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">대진표 이름</label>
          <input type="text" id="schedule-name" maxlength="30"
            class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-700 focus:border-green-700"
            placeholder="미입력 시 날짜+시간으로 자동 생성">
        </div>

        <!-- 시간 설정 -->
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">시간 설정</label>
          <div class="flex items-center gap-2">
            <select id="start-time" class="flex-1 px-3 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-700 focus:border-green-700 bg-white">
              ${this.generateTimeOptions('08:00')}
            </select>
            <span class="text-gray-500 font-medium">~</span>
            <select id="end-time" class="flex-1 px-3 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-700 focus:border-green-700 bg-white">
              ${this.generateTimeOptions('10:00')}
            </select>
          </div>
          <p id="time-info" class="text-xs text-gray-500 mt-1"></p>
        </div>

        <!-- 코트 수 -->
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">코트 수</label>
          <div class="flex gap-2">
            ${[1, 2, 3, 4].map(n => `
              <label class="flex-1 cursor-pointer">
                <input type="radio" name="courts" value="${n}" ${n === 2 ? 'checked' : ''} class="sr-only peer">
                <div class="border-2 border-gray-200 rounded-xl py-2.5 text-center peer-checked:border-green-500 peer-checked:bg-green-50 transition">
                  <span class="font-semibold text-gray-800">${n}면</span>
                </div>
              </label>
            `).join('')}
          </div>
        </div>

        <!-- 남자 멤버 선택 -->
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">
            남자 멤버 <span id="male-count" class="text-green-700 font-normal">(0/${males.length}명 선택)</span>
          </label>
          ${males.length === 0 ? '<p class="text-sm text-gray-400">등록된 남자 멤버가 없습니다.</p>' : `
          <input type="text" id="sch-male-search" placeholder="이름 검색..."
            class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-700 focus:border-green-700 text-sm mb-2">
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm text-gray-500">${males.length}명 중 선택</span>
            <button type="button" id="sch-male-all-btn" class="text-sm text-green-700 font-medium hover:underline">전체 선택</button>
          </div>
          <div class="bg-white/80 backdrop-blur-sm border border-white/60 rounded-xl max-h-40 overflow-y-auto divide-y divide-gray-50">
            ${males.map(p => `
              <label class="sch-male-item flex items-center px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition" data-name="${Results.escapeHtml(p.name.toLowerCase())}">
                <input type="checkbox" name="males" value="${Results.escapeHtml(p.name)}" class="male-cb w-4 h-4 text-green-700 rounded border-gray-300 focus:ring-green-700">
                <span class="ml-3 text-sm text-gray-800">${Results.escapeHtml(p.name)}</span>
                <span class="ml-2 text-xs px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700">남</span>
                <span class="text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">${(p.ntrp || 2.5).toFixed(1)}</span>
              </label>
            `).join('')}
          </div>`}
        </div>

        <!-- 여자 멤버 선택 -->
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">
            여자 멤버 <span id="female-count" class="text-green-700 font-normal">(0/${females.length}명 선택)</span>
          </label>
          ${females.length === 0 ? '<p class="text-sm text-gray-400">등록된 여자 멤버가 없습니다.</p>' : `
          <input type="text" id="sch-female-search" placeholder="이름 검색..."
            class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-700 focus:border-green-700 text-sm mb-2">
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm text-gray-500">${females.length}명 중 선택</span>
            <button type="button" id="sch-female-all-btn" class="text-sm text-green-700 font-medium hover:underline">전체 선택</button>
          </div>
          <div class="bg-white/80 backdrop-blur-sm border border-white/60 rounded-xl max-h-40 overflow-y-auto divide-y divide-gray-50">
            ${females.map(p => `
              <label class="sch-female-item flex items-center px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition" data-name="${Results.escapeHtml(p.name.toLowerCase())}">
                <input type="checkbox" name="females" value="${Results.escapeHtml(p.name)}" class="female-cb w-4 h-4 text-green-700 rounded border-gray-300 focus:ring-green-700">
                <span class="ml-3 text-sm text-gray-800">${Results.escapeHtml(p.name)}</span>
                <span class="ml-2 text-xs px-1.5 py-0.5 rounded font-medium bg-pink-100 text-pink-700">여</span>
                <span class="text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">${(p.ntrp || 2.5).toFixed(1)}</span>
              </label>
            `).join('')}
          </div>`}
        </div>

        <!-- 미리보기 정보 -->
        <div id="preview-info" class="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 hidden">
        </div>

        <button type="submit"
          class="w-full py-3 bg-gradient-to-r from-green-700 to-green-800 text-white rounded-xl hover:from-green-800 hover:to-green-900 active:scale-[0.98] transition-all font-semibold text-lg shadow-md shadow-green-300/50">
          대진표 생성
        </button>
      </form>`);

    const updateCounts = () => {
      const maleChecked = container.querySelectorAll('.male-cb:checked').length;
      const femaleChecked = container.querySelectorAll('.female-cb:checked').length;
      container.querySelector('#male-count').textContent = `(${maleChecked}/${males.length}명 선택)`;
      container.querySelector('#female-count').textContent = `(${femaleChecked}/${females.length}명 선택)`;
      this.updateSchedulePreview(container);
    };

    container.querySelectorAll('.male-cb, .female-cb').forEach(cb => {
      cb.onchange = updateCounts;
    });

    const bindScheduleList = (prefix, cbClass) => {
      const search = container.querySelector(`#sch-${prefix}-search`);
      const items = container.querySelectorAll(`.sch-${prefix}-item`);
      const allBtn = container.querySelector(`#sch-${prefix}-all-btn`);
      if (!search || !allBtn) return;

      search.oninput = () => {
        const q = search.value.trim().toLowerCase();
        items.forEach(item => {
          item.style.display = (!q || item.dataset.name.includes(q)) ? '' : 'none';
        });
      };

      let allSelected = false;
      allBtn.onclick = () => {
        allSelected = !allSelected;
        items.forEach(item => {
          if (item.style.display !== 'none') {
            item.querySelector(`.${cbClass}`).checked = allSelected;
          }
        });
        allBtn.textContent = allSelected ? '선택 해제' : '전체 선택';
        updateCounts();
      };
    };

    bindScheduleList('male', 'male-cb');
    bindScheduleList('female', 'female-cb');

    container.querySelector('#start-time').onchange = () => this.updateSchedulePreview(container);
    container.querySelector('#end-time').onchange = () => this.updateSchedulePreview(container);
    container.querySelectorAll('input[name="courts"]').forEach(r => {
      r.onchange = () => this.updateSchedulePreview(container);
    });

    this.updateSchedulePreview(container);

    const allowMixedCb = container.querySelector('#allow-mixed');
    if (allowMixedCb) {
      allowMixedCb.onchange = () => this.updateSchedulePreview(container);
    }

    container.querySelector('#schedule-form').onsubmit = (e) => {
      e.preventDefault();

      const startTime = container.querySelector('#start-time').value;
      const endTime = container.querySelector('#end-time').value;
      const courts = parseInt(container.querySelector('input[name="courts"]:checked').value);
      const selectedMales = Array.from(container.querySelectorAll('.male-cb:checked')).map(cb => cb.value);
      const selectedFemales = Array.from(container.querySelectorAll('.female-cb:checked')).map(cb => cb.value);

      if (startTime >= endTime) {
        alert('종료 시간은 시작 시간보다 뒤여야 합니다.');
        return;
      }

      const totalPlayers = selectedMales.length + selectedFemales.length;
      if (totalPlayers < 4) {
        alert('최소 4명의 멤버를 선택해주세요.');
        return;
      }

      const allowMixed = container.querySelector('#allow-mixed')?.checked || false;

      const possibleTypes = Schedule.getPossibleTypes(selectedMales, selectedFemales, allowMixed);
      if (possibleTypes.length === 0) {
        alert('선택한 멤버 구성으로 복식 경기를 만들 수 없습니다.\n혼합복식: 남2+여2, 남자복식: 남4, 여자복식: 여4 이상 필요\n또는 섞어복식 허용을 체크해주세요.');
        return;
      }

      const timeSlots = Schedule.generate(selectedMales, selectedFemales, courts, startTime, endTime, allowMixed);

      if (timeSlots.length === 0) {
        alert('시간이 부족합니다. 최소 30분 이상 설정해주세요.');
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const customName = container.querySelector('#schedule-name').value.trim();
      const tournament = {
        id: Storage.generateId(),
        name: customName || `${today} ${startTime} 대진표`,
        format: 'schedule',
        setCount: 1,
        courts,
        startTime,
        endTime,
        allowMixed,
        males: selectedMales,
        females: selectedFemales,
        players: [...selectedMales, ...selectedFemales],
        status: 'active',
        createdAt: new Date().toISOString(),
        completedAt: null,
        timeSlots,
      };

      const tournaments = Storage.getTournaments();
      tournaments.push(tournament);
      Storage.saveTournaments(tournaments);

      this.navigate('active', tournament.id);
    };
  },

  updateSchedulePreview(container) {
    const startTime = container.querySelector('#start-time').value;
    const endTime = container.querySelector('#end-time').value;
    const courts = parseInt(container.querySelector('input[name="courts"]:checked').value);
    const maleCount = container.querySelectorAll('.male-cb:checked').length;
    const femaleCount = container.querySelectorAll('.female-cb:checked').length;

    const preview = container.querySelector('#preview-info');
    const timeInfo = container.querySelector('#time-info');

    if (startTime >= endTime) {
      timeInfo.textContent = '종료 시간을 시작 시간 이후로 설정해주세요.';
      timeInfo.className = 'text-xs text-red-500 mt-1';
      preview.classList.add('hidden');
      return;
    }

    const slots = Schedule.calculateTimeSlots(startTime, endTime);
    const totalGamesMax = slots.length * courts;

    timeInfo.textContent = `${slots.length}개 타임 (30분 × ${slots.length})`;
    timeInfo.className = 'text-xs text-gray-500 mt-1';

    const allowMixed = container.querySelector('#allow-mixed')?.checked || false;
    const possibleTypes = [];
    if (maleCount >= 2 && femaleCount >= 2) possibleTypes.push('혼합복식');
    if (maleCount >= 4) possibleTypes.push('남자복식');
    if (femaleCount >= 4) possibleTypes.push('여자복식');
    if (allowMixed && (maleCount + femaleCount) >= 4) possibleTypes.push('섞어복식');

    if (maleCount + femaleCount >= 4 && possibleTypes.length > 0) {
      preview.classList.remove('hidden');
      preview.innerHTML = `
        <div class="space-y-1">
          <p><span class="font-medium">총 경기:</span> 최대 ${totalGamesMax}경기 (${slots.length}타임 × ${courts}코트)</p>
          <p><span class="font-medium">멤버:</span> 남 ${maleCount}명, 여 ${femaleCount}명</p>
          <p><span class="font-medium">가능한 게임:</span> ${possibleTypes.join(', ')}</p>
        </div>`;
    } else {
      preview.classList.add('hidden');
    }
  },

  // ─── 목록 / 상세 ───

  renderTournamentList(container, openTournamentId) {
    const tournaments = Storage.getTournaments();

    if (openTournamentId) {
      const t = tournaments.find(t => t.id === openTournamentId);
      if (t) {
        this.renderTournamentDetail(container, t);
        return;
      }
    }

    if (tournaments.length === 0) {
      patchDOM(container, `
        <div class="max-w-lg mx-auto text-center py-12">
          <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-green-100/30 border border-white/60 p-8">
            <h2 class="text-xl font-bold text-gray-800 mb-2">등록된 대진표가 없습니다</h2>
          </div>
        </div>`);
      return;
    }

    patchDOM(container, `
      <div class="max-w-lg mx-auto">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">대진표</h2>
        <div class="space-y-3">
          ${tournaments.map(t => {
            const dateStr = new Date(t.createdAt).toLocaleDateString('ko-KR');

            if (t.format === 'schedule') {
              const allMatches = Schedule.getAllMatches(t);
              const completed = allMatches.filter(m => m.winner).length;
              // males/females 배열이 비어있으면 매치 데이터에서 선수 추출
              let maleCount = t.males ? t.males.length : 0;
              let femaleCount = t.females ? t.females.length : 0;
              if (maleCount === 0 && femaleCount === 0) {
                const playerSet = new Set();
                allMatches.forEach(m => {
                  if (m.player1) m.player1.split(' / ').forEach(n => playerSet.add(n.trim()));
                  if (m.player2) m.player2.split(' / ').forEach(n => playerSet.add(n.trim()));
                });
                maleCount = playerSet.size;
              }
              const playerLabel = femaleCount > 0 ? `남${maleCount} · 여${femaleCount}` : `${maleCount}명`;
              return `
                <div class="tournament-card relative bg-white/80 backdrop-blur-sm border border-white/60 rounded-2xl p-4 cursor-pointer hover:shadow-lg hover:shadow-green-200/50 hover:border-green-200 transition-all shadow-sm shadow-green-100/30"
                     data-id="${t.id}">
                  ${!RolesConfig.isMember() ? `<button type="button" class="delete-tournament-btn absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:bg-red-50 hover:text-red-500 transition" data-id="${t.id}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>` : ''}
                  <div class="flex items-center justify-between mb-2 ${!RolesConfig.isMember() ? 'pr-6' : ''}">
                    <h3 class="font-bold text-gray-800">${Results.escapeHtml(t.name)}</h3>
                    <span class="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-700">대진표</span>
                  </div>
                  <div class="flex items-center gap-4 text-sm text-gray-500">
                    <span>${playerLabel}</span>
                    <span>${t.startTime}~${t.endTime}</span>
                    <span>${completed}/${allMatches.length}경기</span>
                  </div>
                </div>`;
            }

            const gameLabel = t.gameTypeLabel || (t.gameType ? GAME_TYPES[t.gameType]?.label : '');
            const isDoubles = t.gameType ? GAME_TYPES[t.gameType]?.doubles : false;
            const countLabel = isDoubles ? `${t.players.length}팀` : `${t.players.length}명`;
            return `
              <div class="tournament-card relative bg-white/80 backdrop-blur-sm border border-white/60 rounded-2xl p-4 cursor-pointer hover:shadow-lg hover:shadow-green-200/50 hover:border-green-200 transition-all shadow-sm shadow-green-100/30"
                   data-id="${t.id}">
                ${!RolesConfig.isMember() ? `<button type="button" class="delete-tournament-btn absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:bg-red-50 hover:text-red-500 transition" data-id="${t.id}">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>` : ''}
                <div class="flex items-center justify-between mb-2 ${!RolesConfig.isMember() ? 'pr-6' : ''}">
                  <h3 class="font-bold text-gray-800">${Results.escapeHtml(t.name)}</h3>
                  <div class="flex items-center gap-2">
                    ${gameLabel ? `<span class="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">${gameLabel}</span>` : ''}
                    <span class="text-xs px-2 py-1 rounded-full ${t.format === 'tournament' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">
                      ${t.format === 'tournament' ? '토너먼트' : '리그'}
                    </span>
                  </div>
                </div>
                <div class="flex items-center gap-4 text-sm text-gray-500">
                  <span>${countLabel}</span>
                  <span>${dateStr}</span>
                  ${t.status === 'completed' && t.format === 'tournament' ?
                    `<span class="text-yellow-600 font-medium">우승: ${Results.escapeHtml(t.rounds[t.rounds.length - 1][0].winner || '-')}</span>` : ''}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`);

    // 삭제 버튼
    container.querySelectorAll('.delete-tournament-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const name = Storage.getTournamentById(btn.dataset.id)?.name || '';
        if (!confirm(`"${name}" 대회를 삭제하시겠습니까?`)) return;
        Storage.deleteTournament(btn.dataset.id);
        this.renderTournamentList(container);
      };
    });

    // 카드 클릭 → 상세 보기
    container.querySelectorAll('.tournament-card').forEach(card => {
      card.onclick = (e) => {
        if (e.target.closest('.delete-tournament-btn')) return;
        const t = Storage.getTournamentById(card.dataset.id);
        if (t) this.renderTournamentDetail(container, t);
      };
    });
  },

  renderTournamentDetail(container, tournament) {
    this.currentTournamentId = tournament.id;

    patchDOM(container, `
      <div class="max-w-4xl mx-auto">
        <button id="detail-back-btn" class="flex items-center gap-1 text-gray-500 hover:text-gray-800 mb-4 text-sm font-medium transition">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg> 목록으로
        </button>
        <div id="tournament-detail-view"></div>
      </div>`);

    document.getElementById('detail-back-btn').onclick = () => {
      this.currentTournamentId = null;
      this.navigate('active');
    };

    const viewContainer = document.getElementById('tournament-detail-view');

    if (tournament.format === 'schedule') {
      Schedule.render(viewContainer, tournament);
    } else if (tournament.format === 'tournament') {
      Tournament.render(viewContainer, tournament);
    } else {
      League.render(viewContainer, tournament);
    }
  },
};

// App.init()은 Auth.init()에서 로그인 확인 후 호출됨
