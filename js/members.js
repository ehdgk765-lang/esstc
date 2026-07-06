// members.js - 회원 관리 (정회원/게스트, 주1/주2, 조 편성, 회비 관리)
const Members = {
  _subTab: 'list', // 'list' | 'groups'
  _searchQuery: '',
  _filterType: 'all',    // 'all' | 'regular' | 'guest'
  _filterFreq: 'all',    // 'all' | '1_sat' | '1_sun' | '2'
  _expandedId: null,
  _duesYear: new Date().getFullYear(),
  _PAGE_SIZE: 10,
  _showCount: 10, // 현재 표시할 개수

  render(container) {
    var self = this;
    var html =
      '<div class="max-w-lg mx-auto">' +
        '<h2 class="text-2xl font-bold text-gray-800 mb-4">회원 관리</h2>' +
        // 서브탭
        '<div class="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">' +
          '<button id="members-tab-list" class="flex-1 py-2 text-sm font-semibold rounded-lg transition ' +
            (this._subTab === 'list' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700') + '">회원 목록</button>' +
          '<button id="members-tab-groups" class="flex-1 py-2 text-sm font-semibold rounded-lg transition ' +
            (this._subTab === 'groups' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700') + '">조별 보기</button>' +
        '</div>' +
        '<div id="members-content"></div>' +
      '</div>';

    patchDOM(container, html);

    // 서브탭 이벤트
    document.getElementById('members-tab-list').onclick = function() {
      self._subTab = 'list';
      self.render(container);
    };
    document.getElementById('members-tab-groups').onclick = function() {
      self._subTab = 'groups';
      self.render(container);
    };

    var contentEl = document.getElementById('members-content');
    if (this._subTab === 'list') {
      this.renderMemberList(contentEl);
    } else {
      this.renderGroupView(contentEl);
    }
  },

  // =============================================
  // 서브탭 1: 회원 목록
  // =============================================
  renderMemberList(container) {
    var self = this;
    var players = Storage.getPlayers();
    var groups = Storage.getGroups();
    players.sort(function(a, b) { return (a.name || '').localeCompare(b.name || '', 'ko'); });

    // 필터 적용
    var filtered = players.filter(function(p) {
      // 검색
      if (self._searchQuery) {
        if ((p.name || '').toLowerCase().indexOf(self._searchQuery.toLowerCase()) < 0) return false;
      }
      // 정회원/게스트
      if (self._filterType === 'regular' && p.memberType === 'guest') return false;
      if (self._filterType === 'guest' && p.memberType !== 'guest') return false;
      // 주1(토)/주1(일)/주2
      var freq = p.frequency || '1_sat';
      if (self._filterFreq === '1_sat' && freq !== '1_sat') return false;
      if (self._filterFreq === '1_sun' && freq !== '1_sun') return false;
      if (self._filterFreq === '2' && freq !== '2') return false;
      return true;
    });

    var now = new Date();
    var curMonthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

    var html =
      // 검색
      '<div class="mb-3">' +
        '<input type="text" autocomplete="off" id="members-search" class="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition" placeholder="이름 검색" value="' + this._escapeAttr(this._searchQuery) + '">' +
      '</div>' +
      // 필터
      '<div class="flex gap-2 mb-4 flex-wrap">' +
        '<div class="flex gap-1 bg-gray-100 rounded-lg p-0.5">' +
          this._filterBtn('type', 'all', '전체') +
          this._filterBtn('type', 'regular', '정회원') +
          this._filterBtn('type', 'guest', '게스트') +
        '</div>' +
        '<div class="flex gap-1 bg-gray-100 rounded-lg p-0.5">' +
          this._filterBtn('freq', 'all', '전체') +
          this._filterBtn('freq', '1_sat', '주1(토)') +
          this._filterBtn('freq', '1_sun', '주1(일)') +
          this._filterBtn('freq', '2', '주2회') +
        '</div>' +
      '</div>' +
      // 카운트
      '<div class="text-xs text-gray-500 mb-2 px-1">' +
        '총 ' + filtered.length + '명' +
        (self._searchQuery || self._filterType !== 'all' || self._filterFreq !== 'all'
          ? ' (전체 ' + players.length + '명)' : '') +
      '</div>';

    // 카드 리스트 (페이지네이션)
    var isSearchMode = !!(self._searchQuery || self._filterType !== 'all' || self._filterFreq !== 'all');
    var visible = isSearchMode ? filtered : filtered.slice(0, self._showCount);
    var remaining = isSearchMode ? 0 : filtered.length - visible.length;

    html +=
      '<div class="space-y-2" id="members-card-list">' +
        (filtered.length === 0
          ? '<p class="text-gray-400 text-center py-8">해당하는 회원이 없습니다.</p>'
          : visible.map(function(p) { return self._renderMemberCard(p, groups, curMonthKey); }).join('')) +
      '</div>';

    // 더보기 / 접기 버튼
    if (!isSearchMode && filtered.length > self._PAGE_SIZE) {
      html +=
        '<div class="mt-3">' +
          '<button id="members-show-toggle" class="w-full py-2.5 text-sm font-medium text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition flex items-center justify-center gap-1.5">' +
            (remaining > 0
              ? '<span>더보기</span><span class="text-xs text-gray-400">(' + remaining + '명 더)</span>' +
                '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>'
              : '<span>접기</span>' +
                '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="transform:rotate(180deg)"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>') +
          '</button>' +
        '</div>';
    }

    container.innerHTML = html;
    this._bindMemberListEvents(container);
  },

  _filterBtn(group, value, label) {
    var isActive = (group === 'type' && this._filterType === value) ||
                   (group === 'freq' && this._filterFreq === value);
    return '<button class="filter-btn px-2.5 py-1 text-xs font-medium rounded-md transition ' +
      (isActive ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700') +
      '" data-filter-group="' + group + '" data-filter-value="' + value + '">' + label + '</button>';
  },

  _renderMemberCard(player, groups, curMonthKey) {
    var isExpanded = this._expandedId === player.id;
    var memberType = player.memberType || 'regular';
    var frequency = player.frequency || '1_sat';
    var freqLabel = frequency === '2' ? '주2회' : frequency === '1_sun' ? '주1(일)' : '주1(토)';
    var playerGroups = (player.groups || []).map(function(gid) {
      return groups.find(function(g) { return g.id === gid; });
    }).filter(Boolean);
    var dues = player.dues || {};
    var curDues = dues[curMonthKey];
    var paidThisMonth = curDues && curDues.paid;

    var html =
      '<div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-blue-100/30 border border-white/60 overflow-hidden">' +
        // 카드 헤더 (클릭하면 확장)
        '<div class="member-card-header flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/50 transition" data-id="' + player.id + '">' +
          '<span class="text-gray-800 font-medium text-sm">' + this._escapeHtml(player.name) + '</span>' +
          // 뱃지들
          '<div class="flex items-center gap-1 flex-1 min-w-0 flex-wrap">' +
            '<span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium ' +
              (memberType === 'guest' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600') + '">' +
              (memberType === 'guest' ? '게스트' : '정회원') + '</span>' +
            '<span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-600">' + freqLabel + '</span>' +
            (playerGroups.length > 0
              ? playerGroups.map(function(g) {
                  return '<span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-100 text-purple-600">' +
                    Members._escapeHtml(g.name) + '</span>';
                }).join('')
              : '') +
          '</div>' +
          // 이번 달 회비
          '<span class="text-sm flex-shrink-0 ' +
            (paidThisMonth ? 'text-green-500' : 'text-gray-300') + '">' +
            (paidThisMonth ? '\u2713' : '\u2717') + '</span>' +
          // 확장 아이콘
          '<svg class="w-4 h-4 text-gray-400 flex-shrink-0 transition ' + (isExpanded ? 'rotate-180' : '') + '" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">' +
            '<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>' +
          '</svg>' +
        '</div>';

    // 확장 영역
    if (isExpanded) {
      html += this._renderExpandedEdit(player, groups);
    }

    html += '</div>';
    return html;
  },

  _renderExpandedEdit(player, groups) {
    var self = this;
    var memberType = player.memberType || 'regular';
    var frequency = player.frequency || '1_sat';
    var playerGroupIds = player.groups || [];
    var dues = player.dues || {};

    // 요일 라벨
    var dayLabels = { 0: '일', 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토' };

    var html =
      '<div class="border-t border-gray-100 px-4 py-3 space-y-4 bg-gray-50/30">' +
        // 정회원/게스트 토글
        '<div class="flex items-center justify-between">' +
          '<span class="text-xs font-medium text-gray-600">회원 유형</span>' +
          '<div class="flex gap-1 bg-gray-100 rounded-lg p-0.5">' +
            '<button class="member-type-btn px-3 py-1 text-xs font-medium rounded-md transition ' +
              (memberType === 'regular' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500') +
              '" data-id="' + player.id + '" data-value="regular">정회원</button>' +
            '<button class="member-type-btn px-3 py-1 text-xs font-medium rounded-md transition ' +
              (memberType === 'guest' ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-500') +
              '" data-id="' + player.id + '" data-value="guest">게스트</button>' +
          '</div>' +
        '</div>' +
        // 주1(토)/주1(일)/주2 토글
        '<div class="flex items-center justify-between">' +
          '<span class="text-xs font-medium text-gray-600">참여 횟수</span>' +
          '<div class="flex gap-1 bg-gray-100 rounded-lg p-0.5">' +
            '<button class="member-freq-btn px-3 py-1 text-xs font-medium rounded-md transition ' +
              (frequency === '1_sat' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500') +
              '" data-id="' + player.id + '" data-value="1_sat">주1(토)</button>' +
            '<button class="member-freq-btn px-3 py-1 text-xs font-medium rounded-md transition ' +
              (frequency === '1_sun' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500') +
              '" data-id="' + player.id + '" data-value="1_sun">주1(일)</button>' +
            '<button class="member-freq-btn px-3 py-1 text-xs font-medium rounded-md transition ' +
              (frequency === '2' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500') +
              '" data-id="' + player.id + '" data-value="2">주2회</button>' +
          '</div>' +
        '</div>' +
        // 소속 조 체크박스
        '<div>' +
          '<span class="text-xs font-medium text-gray-600 block mb-1.5">소속 조</span>' +
          (groups.length > 0
            ? '<div class="flex flex-wrap gap-2">' +
                groups.map(function(g) {
                  var checked = playerGroupIds.indexOf(g.id) >= 0;
                  var dayLabel = dayLabels[g.day] || '';
                  return '<label class="flex items-center gap-1.5 text-xs cursor-pointer">' +
                    '<input type="checkbox" class="member-group-cb w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" ' +
                      'data-player-id="' + player.id + '" data-group-id="' + g.id + '"' +
                      (checked ? ' checked' : '') + '>' +
                    '<span class="text-gray-700">' + self._escapeHtml(g.name) +
                      (dayLabel ? ' <span class="text-gray-400">(' + dayLabel + ')</span>' : '') +
                    '</span>' +
                  '</label>';
                }).join('') +
              '</div>'
            : '<p class="text-xs text-gray-400">등록된 조가 없습니다. 조별 보기에서 추가해주세요.</p>') +
        '</div>' +
        // 회비 관리
        '<div>' +
          '<div class="flex items-center justify-between mb-2">' +
            '<span class="text-xs font-medium text-gray-600">회비 납부</span>' +
            '<div class="flex items-center gap-1">' +
              '<button class="dues-year-prev text-gray-400 hover:text-gray-600 transition" data-id="' + player.id + '">' +
                '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>' +
              '</button>' +
              '<span class="text-xs font-semibold text-gray-700 w-12 text-center">' + this._duesYear + '년</span>' +
              '<button class="dues-year-next text-gray-400 hover:text-gray-600 transition" data-id="' + player.id + '">' +
                '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>' +
              '</button>' +
            '</div>' +
          '</div>' +
          // 12개월 격자
          '<div class="grid grid-cols-4 gap-1.5">' +
            this._renderDuesGrid(player, dues) +
          '</div>' +
        '</div>' +
      '</div>';
    return html;
  },

  _renderDuesGrid(player, dues) {
    var html = '';
    for (var m = 1; m <= 12; m++) {
      var key = this._duesYear + '-' + String(m).padStart(2, '0');
      var d = dues[key] || { paid: false, memo: '' };
      var paid = d.paid;
      html +=
        '<div class="dues-cell flex flex-col items-center gap-0.5 p-1.5 rounded-lg border cursor-pointer transition ' +
          (paid ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white hover:border-gray-300') +
          '" data-player-id="' + player.id + '" data-month="' + key + '">' +
          '<span class="text-[10px] font-semibold ' + (paid ? 'text-green-700' : 'text-gray-500') + '">' + m + '월</span>' +
          '<span class="text-sm ' + (paid ? 'text-green-500' : 'text-gray-300') + '">' + (paid ? '\u25cf' : '\u25cb') + '</span>' +
          (d.memo ? '<span class="text-[9px] text-gray-400 truncate w-full text-center" title="' + this._escapeAttr(d.memo) + '">' + this._escapeHtml(d.memo) + '</span>' : '') +
        '</div>';
    }
    return html;
  },

  _bindMemberListEvents(container) {
    var self = this;
    var mainContainer = container.closest('#main-content') || container;

    // 검색
    var searchInput = container.querySelector('#members-search');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        self._searchQuery = searchInput.value.trim();
        self.renderMemberList(container);
        // 검색 후 포커스 복원
        var newInput = container.querySelector('#members-search');
        if (newInput) {
          newInput.focus();
          newInput.setSelectionRange(newInput.value.length, newInput.value.length);
        }
      });
    }

    // 필터
    container.querySelectorAll('.filter-btn').forEach(function(btn) {
      btn.onclick = function() {
        var group = btn.dataset.filterGroup;
        var value = btn.dataset.filterValue;
        if (group === 'type') self._filterType = value;
        if (group === 'freq') self._filterFreq = value;
        self._showCount = self._PAGE_SIZE;
        self.renderMemberList(container);
      };
    });

    // 더보기/접기
    var toggleBtn = container.querySelector('#members-show-toggle');
    if (toggleBtn) {
      toggleBtn.onclick = function() {
        var players = Storage.getPlayers();
        // 현재 필터된 총 수 계산
        var total = players.length; // 필터 없을 때만 동작
        if (self._showCount >= total) {
          // 접기
          self._showCount = self._PAGE_SIZE;
          self.renderMemberList(container);
          var cardList = container.querySelector('#members-card-list');
          if (cardList) cardList.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          // 더보기: PAGE_SIZE만큼 추가
          self._showCount += self._PAGE_SIZE;
          self.renderMemberList(container);
        }
      };
    }

    // 카드 클릭 → 확장/축소
    container.querySelectorAll('.member-card-header').forEach(function(header) {
      header.onclick = function() {
        var id = header.dataset.id;
        var isExpanding = (self._expandedId !== id);
        self._expandedId = isExpanding ? id : null;
        self.renderMemberList(container);
        // 확장 시 해당 카드로 스크롤
        if (isExpanding) {
          setTimeout(function() {
            var card = container.querySelector('.member-card-header[data-id="' + id + '"]');
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 50);
        }
      };
    });

    // 회원 유형 토글
    container.querySelectorAll('.member-type-btn').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var players = Storage.getPlayers();
        var player = players.find(function(p) { return p.id === btn.dataset.id; });
        if (!player) return;
        player.memberType = btn.dataset.value;
        Storage.savePlayers(players);
        self.renderMemberList(container);
      };
    });

    // 주1(토)/주1(일)/주2 토글
    container.querySelectorAll('.member-freq-btn').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var players = Storage.getPlayers();
        var player = players.find(function(p) { return p.id === btn.dataset.id; });
        if (!player) return;
        player.frequency = btn.dataset.value;
        Storage.savePlayers(players);
        self.renderMemberList(container);
      };
    });

    // 소속 조 체크박스
    container.querySelectorAll('.member-group-cb').forEach(function(cb) {
      cb.onchange = function() {
        var players = Storage.getPlayers();
        var player = players.find(function(p) { return p.id === cb.dataset.playerId; });
        if (!player) return;
        if (!player.groups) player.groups = [];
        var gid = cb.dataset.groupId;
        if (cb.checked) {
          if (player.groups.indexOf(gid) < 0) player.groups.push(gid);
        } else {
          player.groups = player.groups.filter(function(id) { return id !== gid; });
        }
        Storage.savePlayers(players);
        self.renderMemberList(container);
      };
    });

    // 회비 연도 이동
    container.querySelectorAll('.dues-year-prev').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        self._duesYear--;
        self.renderMemberList(container);
      };
    });
    container.querySelectorAll('.dues-year-next').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        self._duesYear++;
        self.renderMemberList(container);
      };
    });

    // 회비 셀 클릭 → paid 토글 (길게 누르면 메모)
    container.querySelectorAll('.dues-cell').forEach(function(cell) {
      var pressTimer = null;
      var isLongPress = false;

      cell.addEventListener('mousedown', function(e) { startPress(e); });
      cell.addEventListener('touchstart', function(e) { startPress(e); }, { passive: true });
      cell.addEventListener('mouseup', function() { endPress(); });
      cell.addEventListener('touchend', function() { endPress(); });
      cell.addEventListener('mouseleave', function() { cancelPress(); });
      cell.addEventListener('touchcancel', function() { cancelPress(); });

      function startPress(e) {
        isLongPress = false;
        pressTimer = setTimeout(function() {
          isLongPress = true;
          // 길게 누르기 → 메모 입력
          self._showDuesMemoModal(cell.dataset.playerId, cell.dataset.month, container);
        }, 500);
      }

      function endPress() {
        clearTimeout(pressTimer);
        if (!isLongPress) {
          // 짧은 클릭 → paid 토글
          self._toggleDuesPaid(cell.dataset.playerId, cell.dataset.month, container);
        }
      }

      function cancelPress() {
        clearTimeout(pressTimer);
      }
    });
  },

  _toggleDuesPaid(playerId, monthKey, container) {
    var players = Storage.getPlayers();
    var player = players.find(function(p) { return p.id === playerId; });
    if (!player) return;
    if (!player.dues) player.dues = {};
    if (!player.dues[monthKey]) player.dues[monthKey] = { paid: false, memo: '' };
    player.dues[monthKey].paid = !player.dues[monthKey].paid;
    Storage.savePlayers(players);
    this.renderMemberList(container);
  },

  _showDuesMemoModal(playerId, monthKey, container) {
    var self = this;
    var players = Storage.getPlayers();
    var player = players.find(function(p) { return p.id === playerId; });
    if (!player) return;
    var dues = player.dues || {};
    var d = dues[monthKey] || { paid: false, memo: '' };

    // 월 라벨
    var parts = monthKey.split('-');
    var label = parts[0] + '년 ' + parseInt(parts[1]) + '월';

    var modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4';
    modal.innerHTML =
      '<div class="absolute inset-0 bg-black/50" id="dues-memo-backdrop"></div>' +
      '<div class="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">' +
        '<div class="w-10 h-1 bg-gray-300 rounded-full mx-auto sm:hidden"></div>' +
        '<h3 class="text-sm font-bold text-gray-800">' + self._escapeHtml(player.name) + ' - ' + label + ' 회비</h3>' +
        '<div class="flex items-center gap-3">' +
          '<span class="text-xs text-gray-600">납부 상태</span>' +
          '<button id="dues-modal-toggle" class="px-3 py-1 text-xs font-medium rounded-lg transition ' +
            (d.paid ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500') + '">' +
            (d.paid ? '\u25cf 납부' : '\u25cb 미납') + '</button>' +
        '</div>' +
        '<div>' +
          '<label class="text-xs text-gray-600 block mb-1">메모</label>' +
          '<input type="text" autocomplete="off" id="dues-memo-input" class="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition" placeholder="메모 입력 (선택)" value="' + self._escapeAttr(d.memo) + '" maxlength="50">' +
        '</div>' +
        '<div class="flex gap-2 pt-1">' +
          '<button id="dues-memo-cancel" class="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition">취소</button>' +
          '<button id="dues-memo-save" class="flex-1 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl text-sm font-medium hover:from-blue-600 hover:to-indigo-600 transition">저장</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    lockScroll();

    var isPaid = d.paid;
    var toggleBtn = modal.querySelector('#dues-modal-toggle');
    toggleBtn.onclick = function() {
      isPaid = !isPaid;
      toggleBtn.textContent = isPaid ? '\u25cf 납부' : '\u25cb 미납';
      toggleBtn.className = 'px-3 py-1 text-xs font-medium rounded-lg transition ' +
        (isPaid ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500');
    };

    modal.querySelector('#dues-memo-backdrop').onclick = closeModal;
    modal.querySelector('#dues-memo-cancel').onclick = closeModal;
    modal.querySelector('#dues-memo-save').onclick = function() {
      var memo = modal.querySelector('#dues-memo-input').value.trim();
      var players = Storage.getPlayers();
      var player = players.find(function(p) { return p.id === playerId; });
      if (player) {
        if (!player.dues) player.dues = {};
        player.dues[monthKey] = { paid: isPaid, memo: memo };
        Storage.savePlayers(players);
      }
      closeModal();
      self.renderMemberList(container);
    };

    var memoInput = modal.querySelector('#dues-memo-input');
    memoInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        modal.querySelector('#dues-memo-save').click();
      }
    });

    setTimeout(function() { memoInput.focus(); }, 100);

    function closeModal() {
      modal.remove();
      unlockScroll();
    }
  },

  // =============================================
  // 서브탭 2: 조별 보기
  // =============================================
  renderGroupView(container) {
    var self = this;
    var groups = Storage.getGroups();
    var players = Storage.getPlayers();

    // 기본 조가 없으면 자동 생성
    if (groups.length === 0) {
      groups = [
        { id: Storage.generateId(), name: '토요일 A조', day: 6 },
        { id: Storage.generateId(), name: '토요일 B조', day: 6 },
        { id: Storage.generateId(), name: '일요일 A조', day: 0 },
        { id: Storage.generateId(), name: '일요일 B조', day: 0 }
      ];
      Storage.saveGroups(groups);
    }

    var dayLabels = { 0: '일', 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토' };

    var html =
      // 조 추가
      '<div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-blue-100/30 border border-white/60 mb-4">' +
        '<div class="px-4 py-3">' +
          '<h3 class="font-semibold text-gray-700 text-sm mb-2">조 추가</h3>' +
          '<div class="flex items-center gap-2">' +
            '<input type="text" autocomplete="off" id="group-name-input" class="min-w-0 flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition" placeholder="조 이름" maxlength="20">' +
            '<select id="group-day-select" class="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:border-blue-500">' +
              '<option value="6">토요일</option>' +
              '<option value="0">일요일</option>' +
              '<option value="1">월요일</option>' +
              '<option value="2">화요일</option>' +
              '<option value="3">수요일</option>' +
              '<option value="4">목요일</option>' +
              '<option value="5">금요일</option>' +
            '</select>' +
            '<button id="add-group-btn" class="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl hover:from-blue-600 hover:to-indigo-600 active:scale-[0.98] transition-all font-medium whitespace-nowrap flex-shrink-0 shadow-sm shadow-blue-200/50">추가</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      // 조 카드 리스트
      '<div class="space-y-3" id="group-card-list">' +
        (groups.length === 0
          ? '<p class="text-gray-400 text-center py-8">등록된 조가 없습니다.</p>'
          : groups.map(function(g) {
              var membersInGroup = players.filter(function(p) {
                return (p.groups || []).indexOf(g.id) >= 0;
              }).sort(function(a, b) { return (a.name || '').localeCompare(b.name || '', 'ko'); });

              var availableMembers = players.filter(function(p) {
                return (p.groups || []).indexOf(g.id) < 0;
              }).sort(function(a, b) { return (a.name || '').localeCompare(b.name || '', 'ko'); });

              return '<div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-blue-100/30 border border-white/60 overflow-hidden">' +
                // 헤더
                '<div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">' +
                  '<div class="flex items-center gap-2 min-w-0">' +
                    '<span class="group-name-display text-sm font-semibold text-gray-800 cursor-pointer hover:text-blue-700 transition" data-group-id="' + g.id + '" title="클릭하여 이름 수정">' +
                      self._escapeHtml(g.name) + '</span>' +
                    '<input type="text" autocomplete="off" class="group-name-edit hidden px-2 py-1 border border-blue-500 rounded-lg text-sm font-medium text-gray-800 focus:ring-2 focus:ring-blue-700 focus:outline-none" data-group-id="' + g.id + '" value="' + self._escapeAttr(g.name) + '" maxlength="20" style="width:120px">' +
                    '<span class="text-xs text-gray-400">(' + (dayLabels[g.day] || '') + ')</span>' +
                    '<span class="text-xs text-blue-600 font-medium">' + membersInGroup.length + '명</span>' +
                  '</div>' +
                  '<button class="delete-group-btn text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg px-2.5 py-1 transition text-xs flex-shrink-0" data-group-id="' + g.id + '">삭제</button>' +
                '</div>' +
                // 소속 멤버
                '<div class="px-4 py-3">' +
                  (membersInGroup.length > 0
                    ? '<div class="flex flex-wrap gap-1.5 mb-3">' +
                        membersInGroup.map(function(p) {
                          var mt = p.memberType || 'regular';
                          return '<span class="group-member-chip inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ' +
                            (mt === 'guest' ? 'bg-orange-50 text-orange-700 border border-orange-200' : 'bg-blue-50 text-blue-700 border border-blue-200') + '">' +
                            self._escapeHtml(p.name) +
                            '<button class="remove-from-group text-current opacity-50 hover:opacity-100 transition ml-0.5" data-player-id="' + p.id + '" data-group-id="' + g.id + '">\u00d7</button>' +
                          '</span>';
                        }).join('') +
                      '</div>'
                    : '<p class="text-xs text-gray-400 mb-3">소속 멤버가 없습니다.</p>') +
                  // 멤버 추가 드롭다운
                  (availableMembers.length > 0
                    ? '<div class="flex items-center gap-2">' +
                        '<select class="add-member-to-group flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-blue-500" data-group-id="' + g.id + '">' +
                          '<option value="">멤버 추가...</option>' +
                          availableMembers.map(function(p) {
                            return '<option value="' + p.id + '">' + self._escapeHtml(p.name) + '</option>';
                          }).join('') +
                        '</select>' +
                        '<button class="confirm-add-member px-3 py-2 bg-blue-500 text-white rounded-xl text-xs font-medium hover:bg-blue-600 active:scale-[0.97] transition-all flex-shrink-0" data-group-id="' + g.id + '">추가</button>' +
                      '</div>'
                    : '<p class="text-[10px] text-gray-400">모든 멤버가 이 조에 소속되어 있습니다.</p>') +
                '</div>' +
              '</div>';
            }).join('')) +
      '</div>';

    container.innerHTML = html;
    this._bindGroupViewEvents(container);
  },

  _bindGroupViewEvents(container) {
    var self = this;

    // 조 추가
    var nameInput = container.querySelector('#group-name-input');
    var daySelect = container.querySelector('#group-day-select');
    var addBtn = container.querySelector('#add-group-btn');

    var addGroup = function() {
      var name = nameInput.value.trim();
      if (!name) return;
      var day = parseInt(daySelect.value);
      var groups = Storage.getGroups();
      if (groups.some(function(g) { return g.name === name; })) {
        alert('이미 등록된 조 이름입니다.');
        return;
      }
      groups.push({ id: Storage.generateId(), name: name, day: day });
      Storage.saveGroups(groups);
      self.renderGroupView(container);
    };

    if (addBtn) addBtn.onclick = addGroup;
    if (nameInput) {
      nameInput.onkeydown = function(e) {
        if (e.key === 'Enter') addGroup();
      };
    }

    // 조 이름 수정
    container.querySelectorAll('.group-name-display').forEach(function(span) {
      span.onclick = function() {
        var gid = span.dataset.groupId;
        var input = container.querySelector('.group-name-edit[data-group-id="' + gid + '"]');
        if (!input) return;
        span.classList.add('hidden');
        input.classList.remove('hidden');
        input.focus();
        input.select();
      };
    });

    container.querySelectorAll('.group-name-edit').forEach(function(input) {
      var commitRename = function() {
        var gid = input.dataset.groupId;
        var newName = input.value.trim();
        var span = container.querySelector('.group-name-display[data-group-id="' + gid + '"]');
        if (!newName) {
          input.classList.add('hidden');
          if (span) span.classList.remove('hidden');
          return;
        }
        var groups = Storage.getGroups();
        var group = groups.find(function(g) { return g.id === gid; });
        if (!group || group.name === newName) {
          input.classList.add('hidden');
          if (span) span.classList.remove('hidden');
          return;
        }
        if (groups.some(function(g) { return g.id !== gid && g.name === newName; })) {
          alert('이미 등록된 조 이름입니다.');
          input.value = group.name;
          input.classList.add('hidden');
          if (span) span.classList.remove('hidden');
          return;
        }
        group.name = newName;
        Storage.saveGroups(groups);
        self.renderGroupView(container);
      };
      input.onblur = commitRename;
      input.onkeydown = function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        } else if (e.key === 'Escape') {
          var gid = input.dataset.groupId;
          var groups = Storage.getGroups();
          var group = groups.find(function(g) { return g.id === gid; });
          if (group) input.value = group.name;
          input.blur();
        }
      };
    });

    // 조 삭제
    container.querySelectorAll('.delete-group-btn').forEach(function(btn) {
      btn.onclick = function() {
        if (!confirm('이 조를 삭제하시겠습니까?\n소속 멤버의 조 배정도 해제됩니다.')) return;
        var gid = btn.dataset.groupId;
        // 조 삭제
        var groups = Storage.getGroups().filter(function(g) { return g.id !== gid; });
        Storage.saveGroups(groups);
        // 플레이어에서 해당 조 제거
        var players = Storage.getPlayers();
        var changed = false;
        players.forEach(function(p) {
          if (p.groups && p.groups.indexOf(gid) >= 0) {
            p.groups = p.groups.filter(function(id) { return id !== gid; });
            changed = true;
          }
        });
        if (changed) Storage.savePlayers(players);
        self.renderGroupView(container);
      };
    });

    // 멤버 조에서 제거
    container.querySelectorAll('.remove-from-group').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var pid = btn.dataset.playerId;
        var gid = btn.dataset.groupId;
        var players = Storage.getPlayers();
        var player = players.find(function(p) { return p.id === pid; });
        if (player && player.groups) {
          player.groups = player.groups.filter(function(id) { return id !== gid; });
          Storage.savePlayers(players);
        }
        self.renderGroupView(container);
      };
    });

    // 멤버를 조에 추가
    container.querySelectorAll('.confirm-add-member').forEach(function(btn) {
      btn.onclick = function() {
        var gid = btn.dataset.groupId;
        var select = container.querySelector('.add-member-to-group[data-group-id="' + gid + '"]');
        if (!select || !select.value) return;
        var pid = select.value;
        var players = Storage.getPlayers();
        var player = players.find(function(p) { return p.id === pid; });
        if (player) {
          if (!player.groups) player.groups = [];
          if (player.groups.indexOf(gid) < 0) {
            player.groups.push(gid);
            Storage.savePlayers(players);
          }
        }
        self.renderGroupView(container);
      };
    });
  },

  // =============================================
  // 유틸리티
  // =============================================
  _escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  _escapeAttr(text) {
    return String(text || '').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
};
