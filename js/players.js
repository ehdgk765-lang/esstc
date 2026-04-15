// players.js - 선수 관리 CRUD + UI 렌더링
const NTRP_VALUES = [2.0, 2.5, 3.0, 3.5, 4.0];

const Players = {
  render(container) {
    const players = Storage.getPlayers();
    const males = players.filter(p => p.gender === 'M');
    const females = players.filter(p => p.gender === 'F');

    container.innerHTML = `
      <div class="max-w-lg mx-auto">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">선수 관리</h2>

        <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-green-50/30 border border-white/60">
          <!-- 선수 추가 입력 -->
          <div class="px-4 py-3 border-b border-gray-100">
            <div class="flex gap-2 overflow-hidden">
              <input type="text" id="player-name-input"
                class="min-w-0 flex-1 px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 text-base"
                placeholder="이름 입력" maxlength="20" style="flex:1 1 0;min-width:0">
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
              <span class="font-semibold text-gray-700 text-sm">등록 선수</span>
              <span id="selected-player-count" class="text-xs text-green-600 font-medium hidden"></span>
            </div>
            <div class="flex items-center gap-2">
              <button id="delete-selected-btn" class="hidden text-xs px-2.5 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 active:scale-95 transition-all font-medium">
                삭제
              </button>
              <span class="text-xs text-gray-500">남 ${males.length} · 여 ${females.length} · 총 ${players.length}명</span>
            </div>
          </div>
          <!-- 선수 목록 -->
          <div id="player-list" class="divide-y divide-gray-50">
            ${players.length === 0
              ? '<p class="text-gray-400 text-center py-8">등록된 선수가 없습니다.</p>'
              : players.map((p, i) => `
                <div class="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition">
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
        alert('이미 등록된 선수입니다.');
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
        if (!confirm('선수를 삭제하시겠습니까?')) return;
        const players = Storage.getPlayers().filter(p => p.id !== id);
        Storage.savePlayers(players);
        this.render(container);
      };
    });

    // 선수 선택 체크박스
    const selectAllCb = container.querySelector('#select-all-players');
    const playerCbs = container.querySelectorAll('.player-select-cb');
    const deleteSelectedBtn = container.querySelector('#delete-selected-btn');
    const selectedCountEl = container.querySelector('#selected-player-count');

    const updateSelectionUI = () => {
      const checked = container.querySelectorAll('.player-select-cb:checked');
      const count = checked.length;
      const total = playerCbs.length;

      if (count > 0) {
        deleteSelectedBtn.classList.remove('hidden');
        selectedCountEl.classList.remove('hidden');
        selectedCountEl.textContent = `${count}명 선택`;
      } else {
        deleteSelectedBtn.classList.add('hidden');
        selectedCountEl.classList.add('hidden');
      }

      if (selectAllCb) {
        selectAllCb.checked = total > 0 && count === total;
        selectAllCb.indeterminate = count > 0 && count < total;
      }
    };

    if (selectAllCb) {
      selectAllCb.onchange = () => {
        const isChecked = selectAllCb.checked;
        playerCbs.forEach(cb => { cb.checked = isChecked; });
        updateSelectionUI();
      };
    }

    playerCbs.forEach(cb => { cb.onchange = updateSelectionUI; });

    if (deleteSelectedBtn) {
      deleteSelectedBtn.onclick = () => {
        const checkedIds = Array.from(container.querySelectorAll('.player-select-cb:checked')).map(cb => cb.dataset.id);
        if (checkedIds.length === 0) return;
        if (!confirm(`선택한 ${checkedIds.length}명의 선수를 삭제하시겠습니까?`)) return;
        const players = Storage.getPlayers().filter(p => !checkedIds.includes(p.id));
        Storage.savePlayers(players);
        this.render(container);
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
};
