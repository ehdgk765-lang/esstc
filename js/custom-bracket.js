// custom-bracket.js - 커스텀 대진표 빌더
const CustomBracket = {
  _state: {
    bracketSize: 8,
    setCount: 1,
    isDoubles: false,
    isTeamMode: false,
    tournamentName: '',
    placements: {},   // singles: { slotIdx: "name" }, doubles: { slotIdx: "A / B" }
  },

  resetState() {
    this._state = {
      bracketSize: 8,
      setCount: 1,
      isDoubles: false,
      isTeamMode: false,
      tournamentName: '',
      gameDate: '',
      placements: {},
    };
  },

  renderBuilder(container) {
    const st = this._state;

    patchDOM(container, `
      <form id="custom-bracket-form" class="space-y-5">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">대회명</label>
          <input type="text" autocomplete="off" id="cb-name" required maxlength="30"
            class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
            placeholder="예: 2024년 봄 정기대회" value="${Results.escapeHtml(st.tournamentName)}">
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">대회 날짜</label>
          <input type="date" id="cb-date" value="${st.gameDate || new Date().toISOString().slice(0, 10)}"
            class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-700 focus:border-blue-700">
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="block text-sm font-semibold text-gray-700">경기 방식</label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" id="cb-team-mode" ${st.isTeamMode ? 'checked' : ''} class="w-3.5 h-3.5 text-blue-700 rounded border-gray-300 focus:ring-blue-700">
              <span class="text-xs text-gray-500">팀전</span>
            </label>
          </div>
          <div class="flex gap-3">
            ${[false, true].map(d => `
              <label class="flex-1 cursor-pointer">
                <input type="radio" name="cb-doubles" value="${d}" ${d === st.isDoubles ? 'checked' : ''} class="sr-only peer">
                <div class="border-2 border-gray-200 rounded-xl py-2.5 text-center peer-checked:border-blue-500 peer-checked:bg-blue-50 transition">
                  <span class="font-semibold text-gray-800">${d ? '복식' : '단식'}</span>
                  <div class="text-xs text-gray-500">${d ? '팀당 2명' : '팀당 1명'}</div>
                </div>
              </label>
            `).join('')}
          </div>
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">세트 수</label>
          <div class="flex gap-3">
            ${[1, 3, 5].map(n => `
              <label class="flex-1 cursor-pointer">
                <input type="radio" name="cb-setCount" value="${n}" ${n === st.setCount ? 'checked' : ''} class="sr-only peer">
                <div class="border-2 border-gray-200 rounded-xl py-2.5 text-center peer-checked:border-blue-500 peer-checked:bg-blue-50 transition">
                  <span class="font-semibold text-gray-800">${n}세트</span>
                  <div class="text-xs text-gray-500">${Math.ceil(n / 2)}세트 선승</div>
                </div>
              </label>
            `).join('')}
          </div>
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">대진표 크기</label>
          <div class="flex gap-2">
            ${[4, 8, 16, 32].map(n => `
              <label class="flex-1 cursor-pointer">
                <input type="radio" name="cb-size" value="${n}" ${n === st.bracketSize ? 'checked' : ''} class="sr-only peer">
                <div class="border-2 border-gray-200 rounded-xl py-2.5 text-center peer-checked:border-blue-500 peer-checked:bg-blue-50 transition">
                  <span class="font-semibold text-gray-800">${n}팀</span>
                </div>
              </label>
            `).join('')}
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="block text-sm font-semibold text-gray-700">대진표 배치</label>
            <span id="cb-placement-count" class="text-sm text-gray-500"></span>
          </div>
          <p class="text-xs text-gray-400 mb-3">빈 슬롯을 클릭하여 팀/멤버를 배치하세요. 빈 슬롯은 부전승(BYE) 처리됩니다.</p>
          <div id="cb-bracket-preview"></div>
        </div>

        <button type="submit"
          class="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl hover:from-blue-600 hover:to-indigo-600 active:scale-[0.98] transition-all font-semibold text-lg shadow-md shadow-blue-200/50">
          대회 생성
        </button>
      </form>`);

    // Bind 팀전 toggle
    const teamModeCb = container.querySelector('#cb-team-mode');
    if (teamModeCb) {
      teamModeCb.onchange = () => {
        this._state.isTeamMode = teamModeCb.checked;
        this.renderBracketPreview(container.querySelector('#cb-bracket-preview'));
      };
    }

    // Bind doubles toggle
    container.querySelectorAll('input[name="cb-doubles"]').forEach(r => {
      r.onchange = () => {
        this._state.isDoubles = r.value === 'true';
        this._state.placements = {};
        this.renderBracketPreview(container.querySelector('#cb-bracket-preview'));
        this._updatePlacementCount(container);
      };
    });

    // Bind bracket size change
    container.querySelectorAll('input[name="cb-size"]').forEach(r => {
      r.onchange = () => {
        this._state.bracketSize = parseInt(r.value);
        this._state.placements = {};
        this.renderBracketPreview(container.querySelector('#cb-bracket-preview'));
        this._updatePlacementCount(container);
      };
    });

    // Bind set count change
    container.querySelectorAll('input[name="cb-setCount"]').forEach(r => {
      r.onchange = () => { this._state.setCount = parseInt(r.value); };
    });

    // Initial render
    this.renderBracketPreview(container.querySelector('#cb-bracket-preview'));
    this._updatePlacementCount(container);

    // Form submit
    container.querySelector('#custom-bracket-form').onsubmit = (e) => {
      e.preventDefault();
      this._state.tournamentName = container.querySelector('#cb-name').value.trim();
      this._state.gameDate = container.querySelector('#cb-date').value || new Date().toISOString().slice(0, 10);
      this._state.setCount = parseInt(container.querySelector('input[name="cb-setCount"]:checked').value);

      const tournament = this.createTournament();
      if (!tournament) return;

      const tournaments = Storage.getTournaments();
      tournaments.push(tournament);
      Storage.saveTournaments(tournaments);
      App.navigate('active', tournament.id);
    };
  },

  _updatePlacementCount(container) {
    const el = container.querySelector('#cb-placement-count');
    if (!el) return;
    const placed = Object.keys(this._state.placements).length;
    const total = this._state.bracketSize;
    el.textContent = `${placed}/${total}팀 배치`;
  },

  renderBracketPreview(previewContainer) {
    const size = this._state.bracketSize;
    const totalRounds = Math.log2(size);
    const roundNames = Tournament.getRoundNames(totalRounds);
    const placements = this._state.placements;

    let html = `<div class="bracket-scroll-hint"><div class="bracket-container overflow-x-auto pb-4"><div class="bracket flex gap-0 min-w-max">`;

    // 1라운드: 클릭 가능한 슬롯
    html += `<div class="bracket-round flex flex-col" style="min-width: 200px;">
      <div class="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">${roundNames[0]}</div>
      <div class="flex flex-col justify-around flex-1 gap-2">`;

    for (let i = 0; i < size; i += 2) {
      const slot1 = placements[i];
      const slot2 = placements[i + 1];

      html += `
        <div class="bracket-match mx-2">
          <div class="match-card bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            ${this._renderSlot(i, slot1)}
            ${this._renderSlot(i + 1, slot2)}
          </div>
        </div>`;
    }
    html += `</div></div>`;

    // 이후 라운드: 비활성 "대기 중"
    for (let r = 1; r < totalRounds; r++) {
      html += `<div class="bracket-connector flex flex-col justify-around" style="width: 24px;"></div>`;
      const matchesInRound = size / Math.pow(2, r + 1);
      html += `<div class="bracket-round flex flex-col" style="min-width: 200px;">
        <div class="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">${roundNames[r]}</div>
        <div class="flex flex-col justify-around flex-1 gap-2">`;

      for (let m = 0; m < matchesInRound; m++) {
        html += `
          <div class="bracket-match mx-2">
            <div class="match-card bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm opacity-50">
              <div class="match-player flex items-center px-3 py-2 border-b border-gray-100 text-gray-300 italic">
                <span class="truncate text-sm">대기 중</span>
              </div>
              <div class="match-player flex items-center px-3 py-2 text-gray-300 italic">
                <span class="truncate text-sm">대기 중</span>
              </div>
            </div>
          </div>`;
      }
      html += `</div></div>`;
    }

    html += `</div></div></div>`;
    patchDOM(previewContainer, html);

    // Bind slot clicks
    previewContainer.querySelectorAll('.cb-slot').forEach(slot => {
      slot.onclick = (e) => {
        if (e.target.closest('.cb-remove')) return;
        const slotIdx = parseInt(slot.dataset.slot);
        this.showPlayerPicker(slotIdx, previewContainer);
      };
    });

    // Bind remove buttons
    previewContainer.querySelectorAll('.cb-remove').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const slotIdx = parseInt(btn.dataset.slot);
        delete this._state.placements[slotIdx];
        this.renderBracketPreview(previewContainer);
        this._updatePlacementCount(previewContainer.closest('form')?.parentElement || previewContainer.parentElement);
      };
    });

    // Scroll hint
    const scrollContainer = previewContainer.querySelector('.bracket-container');
    const scrollHint = previewContainer.querySelector('.bracket-scroll-hint');
    if (scrollContainer && scrollHint) {
      scrollContainer.onscroll = () => {
        const atEnd = scrollContainer.scrollLeft + scrollContainer.clientWidth >= scrollContainer.scrollWidth - 10;
        scrollHint.classList.toggle('scrolled-end', atEnd);
      };
      scrollContainer.onscroll();
    }
  },

  _renderSlot(index, playerName) {
    const isFirst = index % 2 === 0;
    const borderClass = isFirst ? 'border-b border-gray-100' : '';

    if (playerName) {
      let teamBadge = '';
      if (this._state.isTeamMode) {
        const _teamMap = buildTeamMap();
        const names = playerName.split(' / ');
        const tns = [...new Set(names.map(n => _teamMap[n]).filter(Boolean))];
        if (tns.length > 0) {
          teamBadge = tns.map(tn => `<span class="text-xs px-1 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap flex-shrink-0">${Results.escapeHtml(tn)}</span>`).join(' ');
        }
      }
      return `
        <div class="match-player flex items-center justify-between px-3 py-2 ${borderClass} cursor-pointer hover:bg-blue-50 transition cb-slot" data-slot="${index}">
          <div class="flex items-center gap-1 min-w-0">
            <span class="truncate text-sm text-gray-800 font-medium">${Results.escapeHtml(playerName)}</span>
            ${teamBadge}
          </div>
          <button type="button" class="ml-2 text-red-400 hover:text-red-600 text-xs cb-remove flex-shrink-0" data-slot="${index}">✕</button>
        </div>`;
    }
    return `
      <div class="match-player flex items-center px-3 py-2 ${borderClass} cursor-pointer hover:bg-blue-50 transition cb-slot" data-slot="${index}">
        <span class="truncate text-sm text-gray-300 italic">팀 선택...</span>
      </div>`;
  },

  getPlacedNames() {
    // 단식: 그대로 set, 복식: "A / B" 통째로 set
    return new Set(Object.values(this._state.placements));
  },

  showPlayerPicker(slotIndex, previewContainer) {
    if (this._state.isDoubles) {
      this._showDoublesPlayerPicker(slotIndex, previewContainer);
    } else {
      this._showSinglesPlayerPicker(slotIndex, previewContainer);
    }
  },

  _getPlacedPlayerNames() {
    // 복식 "A / B" 형태에서 개별 이름 추출
    const names = new Set();
    Object.values(this._state.placements).forEach(v => {
      v.split(' / ').forEach(n => names.add(n));
    });
    return names;
  },

  _commitPick(slotIndex, value, previewContainer) {
    this._state.placements[slotIndex] = value;
    const existing = document.querySelector('.cb-player-picker');
    if (existing) { if (existing._vpCleanup) existing._vpCleanup(); existing.remove(); unlockScroll(); }
    this.renderBracketPreview(previewContainer);
    this._updatePlacementCount(previewContainer.closest('form')?.parentElement || previewContainer.parentElement);
  },

  _showSinglesPlayerPicker(slotIndex, previewContainer) {
    const existing = document.querySelector('.cb-player-picker');
    if (existing) existing.remove();

    const allPlayers = Storage.getPlayers().sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const placedNames = this.getPlacedNames();
    const teamMap = buildTeamMap();

    const picker = document.createElement('div');
    picker.className = 'cb-player-picker fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4';
    picker.style.backgroundColor = 'rgba(0,0,0,0.5)';
    picker.innerHTML = `
      <div class="cb-inner bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-sm w-full p-4 flex flex-col overflow-y-auto">
        <div class="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden"></div>
        <h3 class="text-lg font-bold text-center mb-3">멤버 선택</h3>

        <div class="mb-3">
          <div class="flex gap-2">
            <input type="text" autocomplete="off" id="cb-custom-name" placeholder="직접 입력..."
              class="cb-picker-search flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-700 focus:border-blue-700">
            <button type="button" id="cb-custom-add"
              class="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition whitespace-nowrap">추가</button>
          </div>
        </div>

        ${allPlayers.length > 0 ? `
          <div class="text-xs text-gray-400 mb-2">등록된 멤버 목록</div>
          <div class="overflow-y-auto flex-1 divide-y divide-gray-50">
            ${allPlayers.map(p => {
              const isPlaced = placedNames.has(p.name);
              const tn = teamMap[p.name];
              return `
                <div class="cb-pick-option flex items-center px-3 py-2.5 ${isPlaced ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-blue-50'} transition"
                  data-name="${Results.escapeHtml(p.name)}" data-placed="${isPlaced}">
                  <span class="text-sm text-gray-800">${Results.escapeHtml(p.name)}</span>
                  <span class="ml-2">${genderBadge(p.gender)}</span>
                  <span class="ml-1 text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">${(p.ntrp || 2.5).toFixed(1)}</span>
                  ${tn ? `<span class="ml-1 text-xs px-1.5 py-0.5 rounded font-medium bg-blue-50 text-blue-700 border border-blue-200">${Results.escapeHtml(tn)}</span>` : ''}
                  ${isPlaced ? '<span class="ml-auto text-xs text-gray-400">배치됨</span>' : ''}
                </div>`;
            }).join('')}
          </div>
        ` : '<p class="text-sm text-gray-400 text-center py-4">등록된 멤버가 없습니다.</p>'}

        <button type="button" class="mt-3 w-full py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition cb-picker-cancel">취소</button>
      </div>`;

    document.body.appendChild(picker);
    lockScroll();

    // 모바일 키보드 대응
    const cbInner = picker.querySelector('.cb-inner');
    const adjustCbPicker = () => {
      if (window.visualViewport) {
        const vh = window.visualViewport.height;
        const offsetTop = window.visualViewport.offsetTop;
        picker.style.height = vh + 'px';
        picker.style.top = offsetTop + 'px';
        picker.style.bottom = 'auto';
        cbInner.style.maxHeight = (vh - 16) + 'px';
      }
    };
    if (window.visualViewport) {
      adjustCbPicker();
      window.visualViewport.addEventListener('resize', adjustCbPicker);
      window.visualViewport.addEventListener('scroll', adjustCbPicker);
    } else {
      cbInner.style.maxHeight = '70vh';
    }

    const closeCbPicker = () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', adjustCbPicker);
        window.visualViewport.removeEventListener('scroll', adjustCbPicker);
      }
      picker.remove(); unlockScroll();
    };
    picker._vpCleanup = () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', adjustCbPicker);
        window.visualViewport.removeEventListener('scroll', adjustCbPicker);
      }
    };
    picker.addEventListener('click', (e) => { if (e.target === picker) closeCbPicker(); });
    picker.querySelector('.cb-picker-cancel').onclick = () => closeCbPicker();

    const searchInput = picker.querySelector('#cb-custom-name');
    searchInput.focus();

    searchInput.oninput = () => {
      const q = searchInput.value.trim();
      picker.querySelectorAll('.cb-pick-option').forEach(opt => {
        opt.style.display = (!q || matchesKoreanSearch(opt.dataset.name, q)) ? '' : 'none';
      });
    };

    const addCustom = () => {
      const val = searchInput.value.trim();
      if (!val) { alert('멤버명을 입력해주세요.'); return; }
      if (placedNames.has(val)) { alert('이미 배치된 이름입니다.'); return; }
      this._commitPick(slotIndex, val, previewContainer);
    };
    picker.querySelector('#cb-custom-add').onclick = addCustom;
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } });

    picker.querySelectorAll('.cb-pick-option').forEach(opt => {
      opt.onclick = () => {
        if (opt.dataset.placed === 'true') return;
        this._commitPick(slotIndex, opt.dataset.name, previewContainer);
      };
    });
  },

  _showDoublesPlayerPicker(slotIndex, previewContainer) {
    const existing = document.querySelector('.cb-player-picker');
    if (existing) existing.remove();

    const allPlayers = Storage.getPlayers().sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const teamMap = buildTeamMap();
    const usedNames = this._getPlacedPlayerNames();
    // 기존 배치에서 현재 슬롯 멤버는 제외 (재선택 가능)
    const currentVal = this._state.placements[slotIndex];
    if (currentVal) {
      currentVal.split(' / ').forEach(n => usedNames.delete(n));
    }

    const picked = [null, null]; // 2명 선택

    const picker = document.createElement('div');
    picker.className = 'cb-player-picker fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4';
    picker.style.backgroundColor = 'rgba(0,0,0,0.5)';

    const renderPickerContent = () => {
      const pickedSet = new Set(picked.filter(Boolean));
      const allUsed = new Set([...usedNames, ...pickedSet]);

      return `
        <div class="cb-inner bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-sm w-full p-4 flex flex-col overflow-y-auto">
          <div class="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden"></div>
          <h3 class="text-lg font-bold text-center mb-3">복식 팀 구성</h3>

          <div class="grid grid-cols-2 gap-2 mb-3">
            ${picked.map((name, i) => {
              if (name) {
                const pd = allPlayers.find(p => p.name === name);
                return `<div class="cb-doubles-slot flex items-center justify-between px-3 py-2 border-2 border-blue-400 bg-blue-50 rounded-xl" data-idx="${i}">
                  <div class="flex items-center gap-1 min-w-0">
                    <span class="text-sm font-medium text-gray-800 truncate">${Results.escapeHtml(name)}</span>
                    ${pd ? `<span class="flex-shrink-0">${genderBadge(pd.gender)}</span>` : ''}
                  </div>
                  <button type="button" class="cb-doubles-remove ml-1 text-red-400 hover:text-red-600 text-xs flex-shrink-0" data-idx="${i}">✕</button>
                </div>`;
              }
              return `<div class="cb-doubles-slot px-3 py-2 border-2 border-dashed border-gray-300 rounded-xl text-center" data-idx="${i}">
                <span class="text-sm text-gray-300 italic">멤버 ${i + 1}</span>
              </div>`;
            }).join('')}
          </div>

          <div class="mb-3">
            <div class="flex gap-2">
              <input type="text" autocomplete="off" id="cb-doubles-search" placeholder="이름 검색 또는 직접 입력..."
                class="cb-picker-search flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-700 focus:border-blue-700">
              <button type="button" id="cb-doubles-custom-add"
                class="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition whitespace-nowrap">추가</button>
            </div>
          </div>

          ${allPlayers.length > 0 ? `
            <div class="text-xs text-gray-400 mb-2">등록된 멤버 목록</div>
            <div class="overflow-y-auto flex-1 divide-y divide-gray-50">
              ${allPlayers.map(p => {
                const isUsed = allUsed.has(p.name);
                const tn = teamMap[p.name];
                return `
                  <div class="cb-pick-option flex items-center px-3 py-2.5 ${isUsed ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-blue-50'} transition"
                    data-name="${Results.escapeHtml(p.name)}" data-used="${isUsed}">
                    <span class="text-sm text-gray-800">${Results.escapeHtml(p.name)}</span>
                    <span class="ml-2">${genderBadge(p.gender)}</span>
                    <span class="ml-1 text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">${(p.ntrp || 2.5).toFixed(1)}</span>
                    ${tn ? `<span class="ml-1 text-xs px-1.5 py-0.5 rounded font-medium bg-blue-50 text-blue-700 border border-blue-200">${Results.escapeHtml(tn)}</span>` : ''}
                    ${isUsed ? '<span class="ml-auto text-xs text-gray-400">선택됨</span>' : ''}
                  </div>`;
              }).join('')}
            </div>
          ` : '<p class="text-sm text-gray-400 text-center py-4">등록된 멤버가 없습니다.</p>'}

          <div class="flex gap-2 mt-3">
            <button type="button" class="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition cb-picker-cancel">취소</button>
            <button type="button" class="flex-1 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition cb-doubles-confirm ${picked[0] && picked[1] ? '' : 'opacity-50 cursor-not-allowed'}" ${picked[0] && picked[1] ? '' : 'disabled'}>확인</button>
          </div>
        </div>`;
    };

    const refreshPicker = () => {
      patchDOM(picker, renderPickerContent());
      bindPickerEvents();
    };

    const addName = (name) => {
      const emptyIdx = picked.indexOf(null);
      if (emptyIdx === -1) { alert('이미 2명이 선택되었습니다.'); return; }
      picked[emptyIdx] = name;
      refreshPicker();
    };

    const bindPickerEvents = () => {
      picker.querySelector('.cb-picker-cancel').onclick = () => { if (picker._vpCleanup) picker._vpCleanup(); picker.remove(); unlockScroll(); };

      const searchInput = picker.querySelector('#cb-doubles-search');
      if (searchInput) searchInput.focus();

      searchInput.oninput = () => {
        const q = searchInput.value.trim();
        picker.querySelectorAll('.cb-pick-option').forEach(opt => {
          opt.style.display = (!q || matchesKoreanSearch(opt.dataset.name, q)) ? '' : 'none';
        });
      };

      picker.querySelector('#cb-doubles-custom-add').onclick = () => {
        const val = searchInput.value.trim();
        if (!val) return;
        const allUsed = new Set([...usedNames, ...picked.filter(Boolean)]);
        if (allUsed.has(val)) { alert('이미 선택된 멤버입니다.'); return; }
        addName(val);
      };
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          picker.querySelector('#cb-doubles-custom-add').click();
        }
      });

      picker.querySelectorAll('.cb-pick-option').forEach(opt => {
        opt.onclick = () => {
          if (opt.dataset.used === 'true') return;
          addName(opt.dataset.name);
        };
      });

      picker.querySelectorAll('.cb-doubles-remove').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          picked[parseInt(btn.dataset.idx)] = null;
          refreshPicker();
        };
      });

      const confirmBtn = picker.querySelector('.cb-doubles-confirm');
      if (confirmBtn) {
        confirmBtn.onclick = () => {
          if (!picked[0] || !picked[1]) return;
          this._commitPick(slotIndex, `${picked[0]} / ${picked[1]}`, previewContainer);
        };
      }
    };

    picker.innerHTML = renderPickerContent();
    document.body.appendChild(picker);
    lockScroll();

    // 모바일 키보드 대응
    const adjustDbPicker = () => {
      if (window.visualViewport) {
        const vh = window.visualViewport.height;
        const offsetTop = window.visualViewport.offsetTop;
        picker.style.height = vh + 'px';
        picker.style.top = offsetTop + 'px';
        picker.style.bottom = 'auto';
        const cbInner2 = picker.querySelector('.cb-inner');
        if (cbInner2) cbInner2.style.maxHeight = (vh - 16) + 'px';
      }
    };
    if (window.visualViewport) {
      adjustDbPicker();
      window.visualViewport.addEventListener('resize', adjustDbPicker);
      window.visualViewport.addEventListener('scroll', adjustDbPicker);
    } else {
      const cbInner2 = picker.querySelector('.cb-inner');
      if (cbInner2) cbInner2.style.maxHeight = '70vh';
    }
    picker._vpCleanup = () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', adjustDbPicker);
        window.visualViewport.removeEventListener('scroll', adjustDbPicker);
      }
    };

    picker.addEventListener('click', (e) => {
      if (e.target === picker) { picker._vpCleanup(); picker.remove(); unlockScroll(); }
    });
    bindPickerEvents();
  },

  createTournament() {
    const { tournamentName: name, setCount, isDoubles, bracketSize: size, placements } = this._state;

    if (!name) { alert('대회명을 입력해주세요.'); return null; }

    const filledSlots = Object.keys(placements).length;
    if (filledSlots < 2) {
      alert('최소 2팀을 배치해주세요.');
      return null;
    }

    // Build ordered player array
    const orderedPlayers = [];
    for (let i = 0; i < size; i++) {
      orderedPlayers.push(placements[i] || null);
    }

    // Check duplicates
    const nonNull = orderedPlayers.filter(p => p !== null);
    if (isDoubles) {
      // 복식: 개별 멤버 이름 중복 체크
      const allNames = [];
      nonNull.forEach(t => t.split(' / ').forEach(n => allNames.push(n)));
      if (new Set(allNames).size !== allNames.length) {
        alert('중복 배치된 멤버가 있습니다.');
        return null;
      }
    } else {
      if (new Set(nonNull).size !== nonNull.length) {
        alert('중복 배치된 팀이 있습니다.');
        return null;
      }
    }

    const rounds = this.generateBracketFromPlacements(orderedPlayers);

    return {
      id: Storage.generateId(),
      name,
      format: 'tournament',
      setCount,
      isDoubles,
      gameDate: this._state.gameDate || new Date().toISOString().slice(0, 10),
      players: nonNull,
      status: 'active',
      createdAt: new Date().toISOString(),
      completedAt: null,
      rounds,
    };
  },

  generateBracketFromPlacements(orderedPlayers) {
    const size = orderedPlayers.length;
    const totalRounds = Math.log2(size);
    const rounds = [];

    // First round
    const firstRound = [];
    for (let i = 0; i < size; i += 2) {
      const match = {
        id: Storage.generateId(),
        player1: orderedPlayers[i],
        player2: orderedPlayers[i + 1],
        scores: null,
        winner: null,
        round: 0,
        matchIndex: i / 2,
      };
      if (!match.player1 && match.player2) {
        match.winner = match.player2;
        match.scores = [];
      } else if (match.player1 && !match.player2) {
        match.winner = match.player1;
        match.scores = [];
      } else if (!match.player1 && !match.player2) {
        match.scores = [];
      }
      firstRound.push(match);
    }
    rounds.push(firstRound);

    // Subsequent rounds
    for (let r = 1; r < totalRounds; r++) {
      const prevRound = rounds[r - 1];
      const currentRound = [];
      for (let i = 0; i < prevRound.length; i += 2) {
        currentRound.push({
          id: Storage.generateId(),
          player1: null,
          player2: null,
          scores: null,
          winner: null,
          round: r,
          matchIndex: i / 2,
        });
      }
      rounds.push(currentRound);
    }

    // Propagate BYEs
    Tournament.propagateByes(rounds);

    return rounds;
  },
};
