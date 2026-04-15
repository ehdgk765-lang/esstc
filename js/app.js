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

  init() {
    this.bindTabs();
    this.navigate('players');
  },

  bindTabs() {
    document.querySelectorAll('[data-tab]').forEach(tab => {
      tab.onclick = () => this.navigate(tab.dataset.tab);
    });
  },

  navigate(tabName, tournamentId) {
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
      case 'active':
        this.renderTournamentList(content, 'active', tournamentId);
        break;
      case 'history':
        this.renderTournamentList(content, 'completed');
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

    container.innerHTML = `
      <div class="max-w-lg mx-auto">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">대회 만들기</h2>
        <div class="flex gap-2 mb-6">
          <button data-subtab="auto"
            class="sub-tab flex-1 px-4 py-2 rounded-full text-sm font-semibold transition
              ${activeSubTab === 'auto' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
            자동 대회
          </button>
          <button data-subtab="custom-bracket"
            class="sub-tab flex-1 px-4 py-2 rounded-full text-sm font-semibold transition
              ${activeSubTab === 'custom-bracket' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
            커스텀 대회
          </button>
        </div>
        <div id="create-sub-content"></div>
      </div>`;

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
      container.innerHTML = `
        <div class="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-center">
          <p class="text-yellow-800 font-medium mb-2">선수를 2명 이상 등록해주세요.</p>
          <button onclick="App.navigate('players')" class="text-green-600 font-semibold hover:underline">선수 관리로 이동</button>
        </div>`;
      return;
    }

    container.innerHTML = `
      <form id="create-form" class="space-y-5">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">대회명</label>
          <input type="text" id="tournament-name" required maxlength="30"
            class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
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
          class="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 active:scale-[0.98] transition-all font-semibold text-lg shadow-md shadow-green-200/50">
          대회 생성
        </button>
      </form>`;

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
      section.innerHTML = `
        <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center text-sm">
          <p class="text-yellow-800">${config.label}에 참가 가능한 선수가 부족합니다. (현재 ${eligible.length}명, 최소 ${minPlayers}명 필요)</p>
        </div>`;
      return;
    }

    section.innerHTML = `
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-2">참가 선수 선택</label>
        <input type="text" id="player-search" placeholder="이름 검색..."
          class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm mb-2">
        <div class="flex justify-between items-center mb-2">
          <span id="selected-count" class="text-sm text-gray-500">0명 선택</span>
          <button type="button" id="select-all-btn" class="text-sm text-green-600 font-medium hover:underline">전체 선택</button>
        </div>
        <div id="player-checkbox-list" class="bg-white/80 backdrop-blur-sm border border-white/60 rounded-xl max-h-48 overflow-y-auto divide-y divide-gray-50">
          ${eligible.map(p => `
            <label class="player-item flex items-center px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition" data-name="${Results.escapeHtml(p.name.toLowerCase())}">
              <input type="checkbox" name="players" value="${Results.escapeHtml(p.name)}" class="player-checkbox w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500">
              <span class="ml-3 text-sm text-gray-800">${Results.escapeHtml(p.name)}</span>
              <span class="ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${p.gender === 'M' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}">${p.gender === 'M' ? '남' : '여'}</span>
              <span class="text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">${(p.ntrp || 2.5).toFixed(1)}</span>
            </label>
          `).join('')}
        </div>
      </div>`;

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
      section.innerHTML = `
        <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center text-sm">
          <p class="text-yellow-800">혼합복식: 남자 2명, 여자 2명 이상 필요합니다. (남 ${males.length}명, 여 ${females.length}명)</p>
        </div>`;
      return;
    }

    const renderList = (players, prefix, genderLabel, badgeClass) => `
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-2">
          ${genderLabel}자 선수 선택
          <span id="${prefix}-count" class="text-green-600 font-normal">(0명 선택)</span>
        </label>
        <input type="text" id="${prefix}-search" placeholder="이름 검색..."
          class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm mb-2">
        <div class="flex justify-between items-center mb-2">
          <span class="text-sm text-gray-500">${players.length}명 중 선택</span>
          <button type="button" id="${prefix}-all-btn" class="text-sm text-green-600 font-medium hover:underline">전체 선택</button>
        </div>
        <div class="bg-white/80 backdrop-blur-sm border border-white/60 rounded-xl max-h-40 overflow-y-auto divide-y divide-gray-50">
          ${players.map(p => `
            <label class="${prefix}-item player-item flex items-center px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition" data-name="${Results.escapeHtml(p.name.toLowerCase())}">
              <input type="checkbox" name="${prefix}" value="${Results.escapeHtml(p.name)}" class="${prefix}-cb w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500">
              <span class="ml-3 text-sm text-gray-800">${Results.escapeHtml(p.name)}</span>
              <span class="ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${badgeClass}">${genderLabel}</span>
              <span class="text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">${(p.ntrp || 2.5).toFixed(1)}</span>
            </label>
          `).join('')}
        </div>
      </div>`;

    section.innerHTML = `
      <div class="space-y-4">
        ${renderList(males, 'xd-male', '남', 'bg-blue-100 text-blue-700')}
        ${renderList(females, 'xd-female', '여', 'bg-pink-100 text-pink-700')}
        <p class="text-xs text-gray-400">남녀 같은 수를 선택하면 자동으로 팀이 구성됩니다.</p>
      </div>`;

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

    container.innerHTML = `
      <div class="max-w-lg mx-auto">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">대진표 만들기</h2>
        <div class="flex gap-2 mb-6">
          <button data-subtab="time-court"
            class="sub-tab flex-1 px-4 py-2 rounded-full text-sm font-semibold transition
              ${activeSubTab === 'time-court' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
            시간/코트 대진표
          </button>
          <button data-subtab="custom-schedule"
            class="sub-tab flex-1 px-4 py-2 rounded-full text-sm font-semibold transition
              ${activeSubTab === 'custom-schedule' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
            커스텀 대진표
          </button>
        </div>
        <div id="schedule-sub-content"></div>
      </div>`;

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
    container.innerHTML = `
      <p class="text-xs text-gray-400 mb-4">빈 대진표를 생성한 후, 직접 매치를 추가할 수 있습니다.</p>
      <form id="custom-schedule-form" class="space-y-5">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">대진표 이름</label>
          <input type="text" id="cs-name" maxlength="30"
            class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
            placeholder="미입력 시 날짜+시간으로 자동 생성">
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">시간 설정</label>
          <div class="flex items-center gap-2">
            <select id="cs-start" class="flex-1 px-3 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white">
              ${this.generateTimeOptions('08:00')}
            </select>
            <span class="text-gray-500 font-medium">~</span>
            <select id="cs-end" class="flex-1 px-3 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white">
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
          class="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 active:scale-[0.98] transition-all font-semibold text-lg shadow-md shadow-green-200/50">
          빈 대진표 생성
        </button>
      </form>`;

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
      container.innerHTML = `
        <div class="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-center">
          <p class="text-yellow-800 font-medium mb-2">복식 경기를 위해 최소 4명의 선수가 필요합니다.</p>
          <p class="text-yellow-700 text-sm mb-3">현재: 남 ${males.length}명, 여 ${females.length}명</p>
          <button onclick="App.navigate('players')" class="text-green-600 font-semibold hover:underline">선수 관리로 이동</button>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="flex items-center justify-end mb-4">
        <label class="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" id="allow-mixed" class="w-3.5 h-3.5 text-green-600 rounded border-gray-300 focus:ring-green-500">
          <span class="text-xs text-gray-500">섞어복식 허용</span>
        </label>
      </div>

      <form id="schedule-form" class="space-y-5">
        <!-- 대진표 이름 -->
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">대진표 이름</label>
          <input type="text" id="schedule-name" maxlength="30"
            class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
            placeholder="미입력 시 날짜+시간으로 자동 생성">
        </div>

        <!-- 시간 설정 -->
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">시간 설정</label>
          <div class="flex items-center gap-2">
            <select id="start-time" class="flex-1 px-3 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white">
              ${this.generateTimeOptions('08:00')}
            </select>
            <span class="text-gray-500 font-medium">~</span>
            <select id="end-time" class="flex-1 px-3 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white">
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

        <!-- 남자 선수 선택 -->
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">
            남자 선수 <span id="male-count" class="text-green-600 font-normal">(0/${males.length}명 선택)</span>
          </label>
          ${males.length === 0 ? '<p class="text-sm text-gray-400">등록된 남자 선수가 없습니다.</p>' : `
          <input type="text" id="sch-male-search" placeholder="이름 검색..."
            class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm mb-2">
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm text-gray-500">${males.length}명 중 선택</span>
            <button type="button" id="sch-male-all-btn" class="text-sm text-green-600 font-medium hover:underline">전체 선택</button>
          </div>
          <div class="bg-white/80 backdrop-blur-sm border border-white/60 rounded-xl max-h-40 overflow-y-auto divide-y divide-gray-50">
            ${males.map(p => `
              <label class="sch-male-item flex items-center px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition" data-name="${Results.escapeHtml(p.name.toLowerCase())}">
                <input type="checkbox" name="males" value="${Results.escapeHtml(p.name)}" class="male-cb w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500">
                <span class="ml-3 text-sm text-gray-800">${Results.escapeHtml(p.name)}</span>
                <span class="ml-2 text-xs px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700">남</span>
                <span class="text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">${(p.ntrp || 2.5).toFixed(1)}</span>
              </label>
            `).join('')}
          </div>`}
        </div>

        <!-- 여자 선수 선택 -->
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">
            여자 선수 <span id="female-count" class="text-green-600 font-normal">(0/${females.length}명 선택)</span>
          </label>
          ${females.length === 0 ? '<p class="text-sm text-gray-400">등록된 여자 선수가 없습니다.</p>' : `
          <input type="text" id="sch-female-search" placeholder="이름 검색..."
            class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm mb-2">
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm text-gray-500">${females.length}명 중 선택</span>
            <button type="button" id="sch-female-all-btn" class="text-sm text-green-600 font-medium hover:underline">전체 선택</button>
          </div>
          <div class="bg-white/80 backdrop-blur-sm border border-white/60 rounded-xl max-h-40 overflow-y-auto divide-y divide-gray-50">
            ${females.map(p => `
              <label class="sch-female-item flex items-center px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition" data-name="${Results.escapeHtml(p.name.toLowerCase())}">
                <input type="checkbox" name="females" value="${Results.escapeHtml(p.name)}" class="female-cb w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500">
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
          class="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 active:scale-[0.98] transition-all font-semibold text-lg shadow-md shadow-green-200/50">
          대진표 생성
        </button>
      </form>`;

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
        alert('최소 4명의 선수를 선택해주세요.');
        return;
      }

      const allowMixed = container.querySelector('#allow-mixed')?.checked || false;

      const possibleTypes = Schedule.getPossibleTypes(selectedMales, selectedFemales, allowMixed);
      if (possibleTypes.length === 0) {
        alert('선택한 선수 구성으로 복식 경기를 만들 수 없습니다.\n혼합복식: 남2+여2, 남자복식: 남4, 여자복식: 여4 이상 필요\n또는 섞어복식 허용을 체크해주세요.');
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
          <p><span class="font-medium">선수:</span> 남 ${maleCount}명, 여 ${femaleCount}명</p>
          <p><span class="font-medium">가능한 게임:</span> ${possibleTypes.join(', ')}</p>
        </div>`;
    } else {
      preview.classList.add('hidden');
    }
  },

  // ─── 목록 / 상세 ───

  renderTournamentList(container, statusFilter, openTournamentId) {
    const all = Storage.getTournaments();
    const tournaments = statusFilter === 'active'
      ? all.filter(t => t.status === 'active')
      : all.filter(t => t.status === 'completed');

    const isActive = statusFilter === 'active';

    if (openTournamentId) {
      const t = all.find(t => t.id === openTournamentId);
      if (t) {
        this.renderTournamentDetail(container, t);
        return;
      }
    }

    if (tournaments.length === 0) {
      container.innerHTML = `
        <div class="max-w-lg mx-auto text-center py-12">
          <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-green-50/30 border border-white/60 p-8">
            <div class="text-5xl mb-4">${isActive ? '🎾' : '📋'}</div>
            <h2 class="text-xl font-bold text-gray-800 mb-2">${isActive ? '진행 중인 대회가 없습니다' : '완료된 대회가 없습니다'}</h2>
            <p class="text-gray-500 mb-4">${isActive ? '새 대회를 만들어보세요!' : '대회를 완료하면 여기에 표시됩니다.'}</p>
          </div>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="max-w-lg mx-auto">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">${isActive ? '진행 중' : '결과'}</h2>
        <div class="space-y-3">
          ${tournaments.map(t => {
            const dateStr = new Date(t.createdAt).toLocaleDateString('ko-KR');

            if (t.format === 'schedule') {
              const allMatches = Schedule.getAllMatches(t);
              const completed = allMatches.filter(m => m.winner).length;
              return `
                <div class="tournament-card relative bg-white/80 backdrop-blur-sm border border-white/60 rounded-2xl p-4 cursor-pointer hover:shadow-lg hover:shadow-green-100/50 hover:border-green-200 transition-all shadow-sm shadow-green-50/30"
                     data-id="${t.id}">
                  <button type="button" class="delete-tournament-btn absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:bg-red-50 hover:text-red-500 transition" data-id="${t.id}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                  <div class="flex items-center justify-between mb-2 pr-6">
                    <h3 class="font-bold text-gray-800">${Results.escapeHtml(t.name)}</h3>
                    <span class="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-700">대진표</span>
                  </div>
                  <div class="flex items-center gap-4 text-sm text-gray-500">
                    <span>남${t.males.length} · 여${t.females.length}</span>
                    <span>${t.startTime}~${t.endTime}</span>
                    <span>${completed}/${allMatches.length}경기</span>
                  </div>
                </div>`;
            }

            const gameLabel = t.gameTypeLabel || (t.gameType ? GAME_TYPES[t.gameType]?.label : '');
            const isDoubles = t.gameType ? GAME_TYPES[t.gameType]?.doubles : false;
            const countLabel = isDoubles ? `${t.players.length}팀` : `${t.players.length}명`;
            return `
              <div class="tournament-card relative bg-white/80 backdrop-blur-sm border border-white/60 rounded-2xl p-4 cursor-pointer hover:shadow-lg hover:shadow-green-100/50 hover:border-green-200 transition-all shadow-sm shadow-green-50/30"
                   data-id="${t.id}">
                <button type="button" class="delete-tournament-btn absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:bg-red-50 hover:text-red-500 transition" data-id="${t.id}">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
                <div class="flex items-center justify-between mb-2 pr-6">
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
      </div>`;

    // 삭제 버튼
    container.querySelectorAll('.delete-tournament-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const name = Storage.getTournamentById(btn.dataset.id)?.name || '';
        if (!confirm(`"${name}" 대회를 삭제하시겠습니까?`)) return;
        Storage.deleteTournament(btn.dataset.id);
        this.renderTournamentList(container, statusFilter);
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

    const wrapper = document.createElement('div');
    wrapper.className = 'max-w-4xl mx-auto';

    const backBtn = document.createElement('button');
    backBtn.className = 'flex items-center gap-1 text-gray-500 hover:text-gray-800 mb-4 text-sm font-medium transition';
    backBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg> 목록으로`;
    backBtn.onclick = () => {
      this.currentTournamentId = null;
      this.navigate(tournament.status === 'completed' ? 'history' : 'active');
    };

    const detailContainer = document.createElement('div');

    wrapper.appendChild(backBtn);
    wrapper.appendChild(detailContainer);
    container.innerHTML = '';
    container.appendChild(wrapper);
    
    const viewContainer = document.createElement('div');
    detailContainer.appendChild(viewContainer);

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
