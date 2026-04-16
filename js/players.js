// players.js - 멤버 관리 CRUD + UI 렌더링
const NTRP_VALUES = [2.0, 2.5, 3.0, 3.5, 4.0];

const Players = {
  render(container) {
    const players = Storage.getPlayers();
    const males = players.filter(p => p.gender === 'M');
    const females = players.filter(p => p.gender === 'F');

    container.innerHTML = `
      <div class="max-w-lg mx-auto">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">멤버 관리</h2>

        <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-green-50/30 border border-white/60">
          <!-- 멤버 추가 입력 -->
          <div class="px-4 py-3 border-b border-gray-100">
            <div class="flex gap-2 overflow-hidden">
              <input type="text" id="player-name-input"
                class="min-w-0 flex-1 px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 text-base"
                placeholder="이름 입력 / 검색" maxlength="20" style="flex:1 1 0;min-width:0">
              <select id="player-gender-select"
                class="px-2 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm font-medium bg-white flex-shrink-0">
                <option value="M">남</option>
                <option value="F">여</option>
              </select>
              <select id="player-ntrp-select"
                class="px-1 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm font-medium bg-white flex-shrink-0">
                ${NTRP_VALUES.map(v => `<option value="${v}" ${v === 2.5 ? 'selected' : ''}>${v.toFixed(1)}</option>`).join('')}
              </select>
              <button id="add-player-btn"
                class="px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 active:scale-[0.98] transition-all font-medium whitespace-nowrap flex-shrink-0 shadow-sm shadow-green-200/50">
                추가
              </button>
            </div>
          </div>
          <!-- 엑셀 업로드 -->
          <div class="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
            <input type="file" id="excel-upload" accept=".xlsx,.xls,.csv" class="hidden">
            <button id="excel-upload-btn"
              class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-green-400 hover:text-green-600 hover:bg-green-50/50 transition cursor-pointer">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
              엑셀 파일 업로드 (이름, 성별, NTRP)
            </button>
          </div>
          <!-- 헤더 -->
          <div class="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <div class="flex items-center gap-2">
              ${players.length > 0 ? `
                <input type="checkbox" id="select-all-players" class="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500 cursor-pointer">
              ` : ''}
              <span class="font-semibold text-gray-700 text-sm">등록 멤버</span>
              <span id="selected-player-count" class="text-xs text-green-600 font-medium hidden"></span>
            </div>
            <div class="flex items-center gap-2">
              <button id="delete-selected-btn" class="hidden text-xs px-2.5 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 active:scale-95 transition-all font-medium">
                삭제
              </button>
              <span class="text-xs text-gray-500">남 ${males.length} · 여 ${females.length} · 총 ${players.length}명</span>
            </div>
          </div>
          <!-- 멤버 목록 -->
          <div id="player-list" class="divide-y divide-gray-50">
            ${players.length === 0
              ? '<p class="text-gray-400 text-center py-8">등록된 멤버가 없습니다.</p>'
              : players.map((p, i) => `
                <div class="player-item flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition${i >= 10 ? ' hidden' : ''}" data-name="${this.escapeAttr(p.name)}">
                  <div class="flex items-center gap-3 min-w-0">
                    <input type="checkbox" class="player-select-cb w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500 cursor-pointer flex-shrink-0" data-id="${p.id}">
                    <span class="w-7 h-7 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">${i + 1}</span>
                    <span class="text-gray-800 font-medium truncate">${this.escapeHtml(p.name)}</span>
                    <button class="gender-toggle-btn text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 cursor-pointer active:scale-95 transition ${p.gender === 'M' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}"
                      data-id="${p.id}">${p.gender === 'M' ? '남' : '여'}</button>
                    <button class="ntrp-toggle-btn text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 cursor-pointer active:scale-95 transition bg-yellow-100 text-yellow-700"
                      data-id="${p.id}">${(p.ntrp || 2.5).toFixed(1)}</button>
                  </div>
                  <button class="delete-player-btn text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg px-3 py-1 transition text-sm flex-shrink-0 ml-2"
                    data-id="${p.id}">삭제</button>
                </div>
              `).join('')}
          </div>
          ${players.length > 10 ? `
          <div class="px-4 py-3 border-t border-gray-100">
            <button id="show-more-players" class="w-full py-2.5 text-sm font-medium text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-xl transition flex items-center justify-center gap-1.5">
              <span>더보기</span>
              <span class="text-xs text-gray-400" id="show-more-count">(${players.length - 10}명 더)</span>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
            </button>
          </div>
          ` : ''}
        </div>
      </div>`;

    this.bindEvents(container);
  },

  bindEvents(container) {
    const input = container.querySelector('#player-name-input');
    const genderSelect = container.querySelector('#player-gender-select');
    const ntrpSelect = container.querySelector('#player-ntrp-select');
    const addBtn = container.querySelector('#add-player-btn');

    const addPlayer = () => {
      const name = input.value.trim();
      const gender = genderSelect.value;
      const ntrp = parseFloat(ntrpSelect.value);
      if (!name) return;

      const players = Storage.getPlayers();
      if (players.some(p => p.name === name)) {
        alert('이미 등록된 멤버입니다.');
        return;
      }

      players.push({ id: Storage.generateId(), name, gender, ntrp });
      Storage.savePlayers(players);
      this.render(container);
    };

    addBtn.onclick = addPlayer;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') addPlayer();
    };

    // 실시간 검색 필터
    const allItems = container.querySelectorAll('.player-item');
    const showMoreWrap = container.querySelector('#show-more-players')?.parentElement;
    const PAGE_SIZE = 10;

    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();

      if (!query) {
        // 검색어 없으면 원래 페이지네이션 복원
        allItems.forEach((el, i) => {
          el.classList.toggle('hidden', i >= PAGE_SIZE);
          el.classList.remove('search-hidden');
        });
        if (showMoreWrap) {
          const hiddenCount = container.querySelectorAll('.player-item.hidden').length;
          if (hiddenCount > 0) {
            showMoreWrap.style.display = '';
            const countEl = container.querySelector('#show-more-count');
            if (countEl) countEl.textContent = `(${hiddenCount}명 더)`;
          } else {
            showMoreWrap.style.display = 'none';
          }
        }
        updateSelectionUI();
        return;
      }

      // 검색 모드: 이름에 검색어 포함된 항목만 표시
      if (showMoreWrap) showMoreWrap.style.display = 'none';
      allItems.forEach(el => {
        const name = (el.dataset.name || '').toLowerCase();
        const match = name.includes(query);
        el.classList.toggle('hidden', !match);
        el.classList.toggle('search-hidden', !match);
      });
      updateSelectionUI();
    });

    container.querySelectorAll('.gender-toggle-btn').forEach(btn => {
      btn.onclick = () => {
        const players = Storage.getPlayers();
        const player = players.find(p => p.id === btn.dataset.id);
        if (!player) return;
        player.gender = player.gender === 'M' ? 'F' : 'M';
        Storage.savePlayers(players);
        this.render(container);
      };
    });

    container.querySelectorAll('.ntrp-toggle-btn').forEach(btn => {
      btn.onclick = () => {
        const players = Storage.getPlayers();
        const player = players.find(p => p.id === btn.dataset.id);
        if (!player) return;
        const current = player.ntrp || 2.5;
        const idx = NTRP_VALUES.indexOf(current);
        player.ntrp = NTRP_VALUES[(idx + 1) % NTRP_VALUES.length];
        Storage.savePlayers(players);
        this.render(container);
      };
    });

    container.querySelectorAll('.delete-player-btn').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        if (!confirm('멤버를 삭제하시겠습니까?')) return;
        const players = Storage.getPlayers().filter(p => p.id !== id);
        Storage.savePlayers(players);
        this.render(container);
      };
    });

    // 멤버 선택 체크박스
    const selectAllCb = container.querySelector('#select-all-players');
    const playerCbs = container.querySelectorAll('.player-select-cb');
    const deleteSelectedBtn = container.querySelector('#delete-selected-btn');
    const selectedCountEl = container.querySelector('#selected-player-count');

    const updateSelectionUI = () => {
      const checked = container.querySelectorAll('.player-select-cb:checked');
      const count = checked.length;
      const visibleCbs = Array.from(playerCbs).filter(cb => !cb.closest('.player-item.hidden'));
      const visibleChecked = visibleCbs.filter(cb => cb.checked).length;
      const visibleTotal = visibleCbs.length;

      if (count > 0) {
        deleteSelectedBtn.classList.remove('hidden');
        selectedCountEl.classList.remove('hidden');
        selectedCountEl.textContent = `${count}명 선택`;
      } else {
        deleteSelectedBtn.classList.add('hidden');
        selectedCountEl.classList.add('hidden');
      }

      if (selectAllCb) {
        selectAllCb.checked = visibleTotal > 0 && visibleChecked === visibleTotal;
        selectAllCb.indeterminate = visibleChecked > 0 && visibleChecked < visibleTotal;
      }
    };

    if (selectAllCb) {
      selectAllCb.onchange = () => {
        const isChecked = selectAllCb.checked;
        playerCbs.forEach(cb => {
          if (!cb.closest('.player-item.hidden')) cb.checked = isChecked;
        });
        updateSelectionUI();
      };
    }

    playerCbs.forEach(cb => { cb.onchange = updateSelectionUI; });

    if (deleteSelectedBtn) {
      deleteSelectedBtn.onclick = () => {
        const checkedIds = Array.from(container.querySelectorAll('.player-select-cb:checked')).map(cb => cb.dataset.id);
        if (checkedIds.length === 0) return;
        if (!confirm(`선택한 ${checkedIds.length}명의 멤버를 삭제하시겠습니까?`)) return;
        const players = Storage.getPlayers().filter(p => !checkedIds.includes(p.id));
        Storage.savePlayers(players);
        this.render(container);
      };
    }

    // 더보기/접기 버튼
    const showMoreBtn = container.querySelector('#show-more-players');
    if (showMoreBtn) {
      const btnLabel = showMoreBtn.querySelector('span:first-child');
      const btnCount = container.querySelector('#show-more-count');
      const btnIcon = showMoreBtn.querySelector('svg');
      let expanded = false;

      showMoreBtn.onclick = () => {
        if (!expanded) {
          // 더보기: 10개씩 펼치기
          const items = container.querySelectorAll('.player-item.hidden:not(.search-hidden)');
          const toShow = Array.from(items).slice(0, PAGE_SIZE);
          toShow.forEach(el => el.classList.remove('hidden'));

          const remaining = container.querySelectorAll('.player-item.hidden:not(.search-hidden)').length;
          if (remaining === 0) {
            // 모두 펼침 → 접기 모드로 전환
            expanded = true;
            btnLabel.textContent = '접기';
            btnCount.textContent = '';
            btnIcon.style.transform = 'rotate(180deg)';
          } else {
            btnCount.textContent = `(${remaining}명 더)`;
          }
        } else {
          // 접기: 10개만 남기고 숨기기
          const allItems = container.querySelectorAll('.player-item');
          allItems.forEach((el, i) => {
            if (i >= PAGE_SIZE) el.classList.add('hidden');
          });
          expanded = false;
          const remaining = container.querySelectorAll('.player-item.hidden:not(.search-hidden)').length;
          btnLabel.textContent = '더보기';
          btnCount.textContent = `(${remaining}명 더)`;
          btnIcon.style.transform = '';
          // 목록 상단으로 스크롤
          var listEl = container.querySelector('#player-list');
          if (listEl) listEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        updateSelectionUI();
      };
    }

    // 엑셀 업로드
    const excelBtn = container.querySelector('#excel-upload-btn');
    const excelInput = container.querySelector('#excel-upload');

    excelBtn.onclick = () => excelInput.click();
    excelInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      this.importExcel(file, container);
      excelInput.value = '';
    };

  },

  importExcel(file, container) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

        const players = Storage.getPlayers();
        const existingNames = new Set(players.map(p => p.name));
        let added = 0, skipped = 0, errors = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length < 2) continue;

          const name = String(row[0] || '').trim();
          if (!name) continue;

          // 헤더 행 건너뛰기
          if (name === '이름' || name === 'name') continue;

          const genderRaw = String(row[1] || '').trim();
          let gender;
          if (genderRaw === '남' || genderRaw === 'M' || genderRaw === 'm' || genderRaw === '남자') {
            gender = 'M';
          } else if (genderRaw === '여' || genderRaw === 'F' || genderRaw === 'f' || genderRaw === '여자') {
            gender = 'F';
          } else {
            errors.push(`${i + 1}행: "${name}" 성별 인식 불가 (${genderRaw})`);
            continue;
          }

          const ntrpRaw = parseFloat(row[2]);
          const ntrp = (!isNaN(ntrpRaw) && ntrpRaw >= 1.0 && ntrpRaw <= 7.0) ? ntrpRaw : 2.5;

          if (existingNames.has(name)) {
            skipped++;
            continue;
          }

          players.push({ id: Storage.generateId(), name, gender, ntrp });
          existingNames.add(name);
          added++;
        }

        Storage.savePlayers(players);

        let msg = `${added}명 추가 완료`;
        if (skipped > 0) msg += `, ${skipped}명 중복 건너뜀`;
        if (errors.length > 0) msg += `\n\n오류:\n${errors.slice(0, 5).join('\n')}`;
        alert(msg);

        this.render(container);
      } catch (err) {
        console.error('엑셀 파싱 오류:', err);
        alert('파일을 읽을 수 없습니다. 엑셀(.xlsx) 또는 CSV 파일인지 확인해주세요.');
      }
    };
    reader.readAsArrayBuffer(file);
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  escapeAttr(text) {
    return String(text || '').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  },
};
