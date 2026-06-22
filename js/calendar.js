// calendar.js - 월별 캘린더 + 일정 관리
const Calendar = {
  _currentMonth: null, // Date 객체 (해당 월 1일)
  _selectedDate: null, // 'YYYY-MM-DD'
  _container: null,

  // 색상 옵션
  COLORS: [
    { value: 'green', label: '초록', bg: 'bg-emerald-100', dot: 'bg-emerald-500', text: 'text-emerald-700' },
    { value: 'blue', label: '파랑', bg: 'bg-blue-100', dot: 'bg-blue-500', text: 'text-blue-700' },
    { value: 'red', label: '빨강', bg: 'bg-red-100', dot: 'bg-red-500', text: 'text-red-700' },
    { value: 'yellow', label: '노랑', bg: 'bg-yellow-100', dot: 'bg-yellow-500', text: 'text-yellow-700' },
    { value: 'purple', label: '보라', bg: 'bg-purple-100', dot: 'bg-purple-500', text: 'text-purple-700' },
    { value: 'pink', label: '분홍', bg: 'bg-pink-100', dot: 'bg-pink-400', text: 'text-pink-700' },
    { value: 'orange', label: '주황', bg: 'bg-orange-100', dot: 'bg-orange-400', text: 'text-orange-700' },
  ],

  _getColor(value) {
    return this.COLORS.find(function(c) { return c.value === value; }) || this.COLORS[0];
  },

  render(container) {
    this._container = container;
    if (!this._currentMonth) {
      var now = new Date();
      this._currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    if (!this._selectedDate) {
      this._selectedDate = this._formatDate(new Date());
    }

    var events = Storage.getEvents();
    var isAdmin = !RolesConfig.isMember();
    var isClubUser = RolesConfig.isClubUser();

    var year = this._currentMonth.getFullYear();
    var month = this._currentMonth.getMonth();
    var monthLabel = year + '년 ' + (month + 1) + '월';

    // 캘린더 그리드 생성
    var calendarGrid = this._buildCalendarGrid(year, month, events);
    // 선택 날짜 일정 목록
    var dayEvents = this._getEventsForDate(events, this._selectedDate);
    var eventsList = this._buildEventsList(dayEvents, isAdmin);

    patchDOM(container,
      '<div class="max-w-lg mx-auto">' +
        // 헤더
        '<div class="flex items-center justify-between mb-4">' +
          '<button id="cal-prev" class="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 transition text-gray-500">' +
            '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>' +
          '</button>' +
          '<h2 class="text-xl font-bold text-gray-800">' + monthLabel + '</h2>' +
          '<button id="cal-next" class="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 transition text-gray-500">' +
            '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>' +
          '</button>' +
        '</div>' +
        // 요일 헤더
        '<div class="calendar-grid mb-1">' +
          '<div class="calendar-weekday text-red-400">일</div>' +
          '<div class="calendar-weekday">월</div>' +
          '<div class="calendar-weekday">화</div>' +
          '<div class="calendar-weekday">수</div>' +
          '<div class="calendar-weekday">목</div>' +
          '<div class="calendar-weekday">금</div>' +
          '<div class="calendar-weekday text-blue-400">토</div>' +
        '</div>' +
        // 날짜 그리드
        '<div class="calendar-grid mb-6">' + calendarGrid + '</div>' +
        // 선택 날짜 일정
        '<div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">' +
          '<div class="flex items-center justify-between mb-3">' +
            '<h3 class="font-bold text-gray-800">' + this._formatDisplayDate(this._selectedDate) + '</h3>' +
            (isClubUser ? '<button id="cal-add-event" class="px-3 py-1.5 bg-blue-500 text-white text-xs font-semibold rounded-lg hover:bg-blue-600 transition">+ 일정 추가</button>' : '') +
          '</div>' +
          '<div id="cal-events-list">' + eventsList + '</div>' +
        '</div>' +
      '</div>');

    this._bindEvents(container);
  },

  _buildCalendarGrid(year, month, events) {
    var firstDay = new Date(year, month, 1).getDay(); // 0=일 ~ 6=토
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var today = this._formatDate(new Date());
    var html = '';

    // 빈 칸 (이전 월)
    for (var i = 0; i < firstDay; i++) {
      html += '<div class="calendar-day empty"></div>';
    }

    // 날짜
    for (var d = 1; d <= daysInMonth; d++) {
      var dateStr = this._formatDate(new Date(year, month, d));
      var dayOfWeek = new Date(year, month, d).getDay();
      var isToday = dateStr === today;
      var isSelected = dateStr === this._selectedDate;
      var dayEvents = this._getEventsForDate(events, dateStr);

      var classes = 'calendar-day';
      if (isToday) classes += ' today';
      if (isSelected) classes += ' selected';
      if (dayOfWeek === 0) classes += ' sunday';
      if (dayOfWeek === 6) classes += ' saturday';

      // 이벤트 도트
      var dots = '';
      if (dayEvents.length > 0) {
        dots = '<div class="calendar-dots">';
        var maxDots = Math.min(dayEvents.length, 3);
        for (var j = 0; j < maxDots; j++) {
          var color = this._getColor(dayEvents[j].color);
          dots += '<span class="calendar-dot ' + color.dot + '"></span>';
        }
        dots += '</div>';
      }

      html += '<div class="' + classes + '" data-date="' + dateStr + '">' +
                '<span class="day-number">' + d + '</span>' +
                dots +
              '</div>';
    }

    return html;
  },

  _buildEventsList(dayEvents, isAdmin) {
    if (dayEvents.length === 0) {
      return '<p class="text-sm text-gray-400 text-center py-4">등록된 일정이 없습니다.</p>';
    }

    var memberName = App.getMemberName();
    var isClub = RolesConfig.isClubUser();
    var html = '';

    for (var i = 0; i < dayEvents.length; i++) {
      var ev = dayEvents[i];
      var color = this._getColor(ev.color);
      var participants = ev.participants || [];
      var waitlist = ev.waitlist || [];
      var maxP = ev.maxParticipants || 0;
      var isAttending = memberName && participants.indexOf(memberName) >= 0;
      var isWaiting = memberName && waitlist.indexOf(memberName) >= 0;
      var isFull = maxP > 0 && participants.length >= maxP;

      // 참석 현황 텍스트
      var attendInfo = '';
      if (maxP > 0 || participants.length > 0) {
        attendInfo = '<div class="text-xs text-gray-500 mt-1.5 flex items-center gap-1">' +
          '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>' +
          '<span>' + participants.length + (maxP > 0 ? '/' + maxP : '') + '명 참석' +
          (waitlist.length > 0 ? ' · 대기 ' + waitlist.length + '명' : '') +
          '</span>' +
        '</div>';
      }

      // 참석자 이름 목록 (남녀 그룹핑)
      var namesList = '';
      if (participants.length > 0) {
        var _allPlayers = Storage.getPlayers();
        var _genderMap = {};
        for (var pi = 0; pi < _allPlayers.length; pi++) { _genderMap[_allPlayers[pi].name] = _allPlayers[pi].gender; }
        var maleNames = [], femaleNames = [];
        for (var j = 0; j < participants.length; j++) {
          if (_genderMap[participants[j]] === 'F') femaleNames.push(participants[j]);
          else maleNames.push(participants[j]);
        }
        namesList = '<div class="mt-1.5 space-y-1">';
        if (maleNames.length > 0) {
          namesList += '<div class="flex flex-wrap items-center gap-1">' +
            '<span class="text-xs font-medium text-blue-600">남' + maleNames.length + '</span>';
          for (var mi = 0; mi < maleNames.length; mi++) {
            namesList += '<span class="inline-block text-xs px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700">' + this._escapeHtml(maleNames[mi]) + '</span>';
          }
          namesList += '</div>';
        }
        if (femaleNames.length > 0) {
          namesList += '<div class="flex flex-wrap items-center gap-1">' +
            '<span class="text-xs font-medium text-pink-600">여' + femaleNames.length + '</span>';
          for (var fi = 0; fi < femaleNames.length; fi++) {
            namesList += '<span class="inline-block text-xs px-1.5 py-0.5 rounded-md bg-pink-50 text-pink-700">' + this._escapeHtml(femaleNames[fi]) + '</span>';
          }
          namesList += '</div>';
        }
        namesList += '</div>';
      }

      // 대기자 이름 목록
      var waitlistHtml = '';
      if (waitlist.length > 0) {
        waitlistHtml = '<div class="mt-1.5"><span class="text-xs text-gray-400">대기:</span> <span class="flex flex-wrap gap-1 mt-0.5 inline">';
        for (var w = 0; w < waitlist.length; w++) {
          waitlistHtml += '<span class="inline-block text-xs px-1.5 py-0.5 rounded-md bg-yellow-50 text-yellow-700 border border-yellow-200">' + (w + 1) + '. ' + this._escapeHtml(waitlist[w]) + '</span>';
        }
        waitlistHtml += '</span></div>';
      }

      // 참석/취소/대기 버튼 (클럽 사용자 + 이름 확인 완료)
      var attendBtn = '';
      if (isClub && memberName) {
        if (isAttending) {
          attendBtn = '<button class="cal-cancel-attend-btn mt-2 w-full py-1.5 text-xs font-semibold rounded-lg border border-gray-300 text-gray-500 hover:bg-red-50 hover:border-red-300 hover:text-red-500 transition" data-id="' + ev.id + '">참석 취소</button>';
        } else if (isWaiting) {
          attendBtn = '<button class="cal-waitlist-btn mt-2 w-full py-1.5 text-xs font-semibold rounded-lg border border-yellow-300 text-yellow-600 hover:bg-red-50 hover:border-red-300 hover:text-red-500 transition" data-id="' + ev.id + '">대기 취소</button>';
        } else if (!isFull) {
          attendBtn = '<button class="cal-attend-btn mt-2 w-full py-1.5 text-xs font-semibold rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition" data-id="' + ev.id + '">참석</button>';
        } else {
          attendBtn = '<button class="cal-waitlist-btn mt-2 w-full py-1.5 text-xs font-semibold rounded-lg bg-yellow-500 text-white hover:bg-yellow-600 transition" data-id="' + ev.id + '">대기 신청</button>';
        }
      }

      html += '<div class="p-3 rounded-xl ' + color.bg + ' mb-2">' +
                '<div class="flex items-start gap-3">' +
                  '<div class="w-1 self-stretch rounded-full ' + color.dot + ' flex-shrink-0 mt-0.5"></div>' +
                  '<div class="flex-1 min-w-0">' +
                    '<div class="font-semibold text-sm ' + color.text + '">' + this._escapeHtml(ev.title) + '</div>' +
                    (this._formatTimeRange(ev) ? '<div class="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" d="M12 6v6l4 2"/></svg><span>' + this._formatTimeRange(ev) + '</span></div>' : '') +
                    (ev.description ? '<div class="text-xs text-gray-400 mt-1 italic">' + this._escapeHtml(ev.description) + '</div>' : '') +
                    (ev.createdBy ? '<div class="text-xs text-gray-400 mt-1">' + this._escapeHtml(ev.createdBy) + '등록</div>' : '') +
                    attendInfo +
                    namesList +
                    waitlistHtml +
                  '</div>' +
                  (function() {
                    var isRegular = Storage.isRegularEvent(ev);
                    var isCreator = memberName && ev.createdBy === memberName;
                    var canEditThis = isAdmin || (isCreator && !isRegular);
                    var canDeleteThis = isAdmin || (isCreator && !isRegular);
                    var canBracket = (isAdmin || isCreator) && participants.length >= 2;
                    if (!canEditThis && !canDeleteThis && !canBracket) return '';
                    return '<div class="flex gap-1 flex-shrink-0">' +
                      (canBracket ?
                        '<button class="cal-bracket-btn w-7 h-7 flex items-center justify-center rounded-lg hover:bg-blue-100 transition text-gray-400 hover:text-blue-600" data-id="' + ev.id + '" title="대진표 생성">' +
                          '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/><path stroke-linecap="round" stroke-linejoin="round" d="M8 6v12M16 6v12"/></svg>' +
                        '</button>' : '') +
                      (canEditThis ?
                        '<button class="cal-edit-btn w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/60 transition text-gray-400" data-id="' + ev.id + '" title="수정">' +
                          '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>' +
                        '</button>' : '') +
                      (canDeleteThis ?
                        '<button class="cal-delete-btn w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-100 transition text-gray-400 hover:text-red-500" data-id="' + ev.id + '" title="삭제">' +
                          '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>' +
                        '</button>' : '') +
                    '</div>';
                  })() +
                '</div>' +
                attendBtn +
              '</div>';
    }
    return html;
  },

  _bindEvents(container) {
    var self = this;

    // 이전/다음 월
    document.getElementById('cal-prev').onclick = function() {
      self._currentMonth.setMonth(self._currentMonth.getMonth() - 1);
      self._selectedDate = null;
      self.render(self._container);
    };
    document.getElementById('cal-next').onclick = function() {
      self._currentMonth.setMonth(self._currentMonth.getMonth() + 1);
      self._selectedDate = null;
      self.render(self._container);
    };

    // 날짜 클릭
    container.querySelectorAll('.calendar-day:not(.empty)').forEach(function(dayEl) {
      dayEl.onclick = function() {
        self._selectedDate = this.dataset.date;
        self.render(self._container);
      };
    });

    // 일정 추가
    var addBtn = document.getElementById('cal-add-event');
    if (addBtn) {
      addBtn.onclick = function() {
        self._showEventModal(null);
      };
    }

    // 수정 버튼
    container.querySelectorAll('.cal-edit-btn').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var id = this.dataset.id;
        var events = Storage.getEvents();
        var ev = events.find(function(e) { return e.id === id; });
        if (ev) self._showEventModal(ev);
      };
    });

    // 대진표 생성 버튼
    container.querySelectorAll('.cal-bracket-btn').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var id = this.dataset.id;
        var events = Storage.getEvents();
        var ev = events.find(function(e) { return e.id === id; });
        if (ev) self._showBracketModal(ev);
      };
    });

    // 삭제 버튼 (Transaction 기반)
    container.querySelectorAll('.cal-delete-btn').forEach(function(btn) {
      btn.onclick = async function(e) {
        e.stopPropagation();
        var id = this.dataset.id;
        if (confirm('이 일정을 삭제하시겠습니까?')) {
          btn.disabled = true;
          await Storage.removeEvent(id);
          self.render(self._container);
        }
      };
    });

    // 참석 버튼
    container.querySelectorAll('.cal-attend-btn').forEach(function(btn) {
      btn.onclick = async function(e) {
        e.stopPropagation();
        var id = this.dataset.id;
        var memberName = App.getMemberName();
        if (!memberName) return;
        btn.disabled = true;
        var result = await Storage.toggleAttendance(id, memberName);
        btn.disabled = false;
        if (result === 'full') {
          alert('참석 인원이 마감되었습니다.');
          return;
        }
        if (result && result.conflict) {
          alert('같은 시간에 이미 참석 중인 일정이 있습니다.\n("' + result.title + '")');
          return;
        }
        self.render(self._container);
      };
    });

    // 참석 취소 버튼 (확인 모달)
    container.querySelectorAll('.cal-cancel-attend-btn').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var id = this.dataset.id;
        var memberName = App.getMemberName();
        if (!memberName) return;
        self._showCancelConfirmModal(id, memberName);
      };
    });

    // 대기 신청/취소 버튼
    container.querySelectorAll('.cal-waitlist-btn').forEach(function(btn) {
      btn.onclick = async function(e) {
        e.stopPropagation();
        var id = this.dataset.id;
        var memberName = App.getMemberName();
        if (!memberName) return;
        btn.disabled = true;
        await Storage.toggleWaitlist(id, memberName);
        btn.disabled = false;
        self.render(self._container);
      };
    });
  },

  _showEventModal(existingEvent) {
    var self = this;
    var isEdit = !!existingEvent;
    var ev = existingEvent || { title: '', date: this._selectedDate, startTime: '', endTime: '', description: '', color: 'green', maxParticipants: 0 };
    // 구버전 호환: time 필드만 있는 경우
    if (ev.time && !ev.startTime) { ev.startTime = ev.time; ev.endTime = ''; }

    // 시간 파싱
    var startH = '', startM = '00', endH = '', endM = '00';
    if (ev.startTime) { var sp = ev.startTime.split(':'); startH = sp[0] || ''; startM = sp[1] || '00'; }
    if (ev.endTime) { var ep = ev.endTime.split(':'); endH = ep[0] || ''; endM = ep[1] || '00'; }

    // 시 옵션 생성
    var startHOpts = '<option value="">시</option>';
    var endHOpts = '<option value="">시</option>';
    for (var h = 5; h <= 23; h++) {
      var hv = (h < 10 ? '0' : '') + h;
      startHOpts += '<option value="' + hv + '"' + (hv === startH ? ' selected' : '') + '>' + hv + '</option>';
      endHOpts += '<option value="' + hv + '"' + (hv === endH ? ' selected' : '') + '>' + hv + '</option>';
    }

    // 코트 옵션 생성
    var courts = Storage.getCourts();
    var courtOptions = '<option value="">선택</option>';
    for (var ci = 0; ci < courts.length; ci++) {
      var selected = ev.title === courts[ci].name ? ' selected' : '';
      courtOptions += '<option value="' + this._escapeAttr(courts[ci].name) + '"' + selected + '>' + this._escapeHtml(courts[ci].name) + '</option>';
    }

    // 색상 옵션 HTML
    var colorOptions = '';
    for (var i = 0; i < this.COLORS.length; i++) {
      var c = this.COLORS[i];
      var checked = c.value === ev.color ? 'checked' : '';
      colorOptions += '<label class="flex items-center cursor-pointer">' +
        '<input type="radio" name="event-color" value="' + c.value + '" ' + checked + ' class="hidden peer">' +
        '<span class="w-5 h-5 rounded-full ' + c.dot + ' peer-checked:ring-2 peer-checked:ring-offset-1 peer-checked:ring-gray-400 transition"></span>' +
      '</label>';
    }

    // 모달 HTML
    var modal = document.createElement('div');
    modal.id = 'cal-modal';
    modal.className = 'fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4';
    modal.innerHTML =
      '<div class="absolute inset-0 bg-black/40" id="cal-modal-overlay"></div>' +
      '<div class="cal-modal-inner relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-sm overflow-y-auto">' +
        '<div class="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 sm:hidden"></div>' +
        '<div class="p-4 space-y-2.5">' +
        '<h3 class="text-base font-bold text-gray-800">' + (isEdit ? '일정 수정' : '일정 추가') + '</h3>' +
        // 제목 + 코트 (한 줄로 합침)
        '<div class="flex gap-1.5">' +
          (courts.length > 0 ?
            '<select id="event-court-select" class="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-blue-700 transition bg-white flex-shrink-0">' + courtOptions + '</select>'
          : '') +
          '<input type="text" autocomplete="off" id="event-title" class="flex-1 min-w-0 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-blue-700 transition" placeholder="일정 제목" value="' + this._escapeAttr(ev.title) + '">' +
        '</div>' +
        // 날짜 + 인원 (한 줄)
        '<div class="flex gap-1.5 items-center">' +
          '<input type="date" id="event-date" class="flex-1 min-w-0 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-blue-700 transition" value="' + ev.date + '">' +
          '<span class="text-xs text-gray-400 flex-shrink-0">인원</span>' +
          '<input type="number" id="event-max" class="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-center focus:outline-none focus:border-blue-700 transition" min="0" value="' + (ev.maxParticipants || 0) + '">' +
        '</div>' +
        // 시간 범위
        '<div>' +
          '<div class="space-y-1.5">' +
            '<div class="flex items-center gap-1">' +
              '<span class="text-xs text-gray-400 w-6 flex-shrink-0">시작</span>' +
              '<select id="event-start-hour" class="px-1.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-blue-700 transition bg-white">' + startHOpts + '</select>' +
              '<span class="text-gray-300 text-xs">:</span>' +
              '<input type="number" id="event-start-min" class="w-12 px-1.5 py-1.5 border border-gray-200 rounded-lg text-xs text-center focus:outline-none focus:border-blue-700 transition" min="0" max="59" placeholder="00" value="' + (ev.startTime ? startM : '') + '">' +
              '<button type="button" class="min-quick-btn px-2 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-blue-600 hover:bg-blue-50 transition" data-target="event-start-min" data-val="00">:00</button>' +
              '<button type="button" class="min-quick-btn px-2 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-blue-600 hover:bg-blue-50 transition" data-target="event-start-min" data-val="30">:30</button>' +
            '</div>' +
            '<div class="flex items-center gap-1">' +
              '<span class="text-xs text-gray-400 w-6 flex-shrink-0">종료</span>' +
              '<select id="event-end-hour" class="px-1.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-blue-700 transition bg-white">' + endHOpts + '</select>' +
              '<span class="text-gray-300 text-xs">:</span>' +
              '<input type="number" id="event-end-min" class="w-12 px-1.5 py-1.5 border border-gray-200 rounded-lg text-xs text-center focus:outline-none focus:border-blue-700 transition" min="0" max="59" placeholder="00" value="' + (ev.endTime ? endM : '') + '">' +
              '<button type="button" class="min-quick-btn px-2 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-blue-600 hover:bg-blue-50 transition" data-target="event-end-min" data-val="00">:00</button>' +
              '<button type="button" class="min-quick-btn px-2 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-blue-600 hover:bg-blue-50 transition" data-target="event-end-min" data-val="30">:30</button>' +
            '</div>' +
          '</div>' +
          '<div class="flex flex-wrap gap-1 mt-1.5" id="time-presets">' +
            '<button type="button" class="time-preset-btn px-2 py-0.5 text-xs rounded border border-gray-200 text-gray-500 hover:border-blue-600 hover:text-blue-700 hover:bg-blue-50 transition" data-start="06:00" data-end="08:00">06~08</button>' +
            '<button type="button" class="time-preset-btn px-2 py-0.5 text-xs rounded border border-gray-200 text-gray-500 hover:border-blue-600 hover:text-blue-700 hover:bg-blue-50 transition" data-start="08:00" data-end="10:00">08~10</button>' +
            '<button type="button" class="time-preset-btn px-2 py-0.5 text-xs rounded border border-gray-200 text-gray-500 hover:border-blue-600 hover:text-blue-700 hover:bg-blue-50 transition" data-start="10:00" data-end="12:00">10~12</button>' +
            '<button type="button" class="time-preset-btn px-2 py-0.5 text-xs rounded border border-gray-200 text-gray-500 hover:border-blue-600 hover:text-blue-700 hover:bg-blue-50 transition" data-start="12:00" data-end="14:00">12~14</button>' +
            '<button type="button" class="time-preset-btn px-2 py-0.5 text-xs rounded border border-gray-200 text-gray-500 hover:border-blue-600 hover:text-blue-700 hover:bg-blue-50 transition" data-start="14:00" data-end="16:00">14~16</button>' +
            '<button type="button" class="time-preset-btn px-2 py-0.5 text-xs rounded border border-gray-200 text-gray-500 hover:border-blue-600 hover:text-blue-700 hover:bg-blue-50 transition" data-start="16:00" data-end="18:00">16~18</button>' +
            '<button type="button" class="time-preset-btn px-2 py-0.5 text-xs rounded border border-gray-200 text-gray-500 hover:border-blue-600 hover:text-blue-700 hover:bg-blue-50 transition" data-start="18:00" data-end="20:00">18~20</button>' +
            '<button type="button" class="time-preset-btn px-2 py-0.5 text-xs rounded border border-gray-200 text-gray-500 hover:border-blue-600 hover:text-blue-700 hover:bg-blue-50 transition" data-start="20:00" data-end="22:00">20~22</button>' +
          '</div>' +
        '</div>' +
        // 메모
        '<div>' +
          '<textarea id="event-desc" class="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-blue-700 transition resize-none" rows="1" placeholder="메모 (선택)">' + this._escapeHtml(ev.description || '') + '</textarea>' +
        '</div>' +
        // 색상
        '<div class="flex items-center gap-2">' +
          '<span class="text-xs text-gray-400 flex-shrink-0">색상</span>' +
          '<div class="flex gap-2">' + colorOptions + '</div>' +
        '</div>' +
        // 버튼
        '<div class="flex gap-2 pt-1">' +
          '<button id="cal-modal-cancel" class="flex-1 px-3 py-2 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 transition">취소</button>' +
          '<button id="cal-modal-save" class="flex-1 px-3 py-2 bg-blue-500 text-white text-xs font-semibold rounded-lg hover:bg-blue-600 transition">' + (isEdit ? '수정' : '추가') + '</button>' +
        '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    lockScroll();

    // 모바일 키보드 대응: visualViewport로 모달 높이 동적 조정
    var innerDiv = modal.querySelector('.cal-modal-inner');
    var adjustForKeyboard = function() {
      if (window.visualViewport) {
        var vh = window.visualViewport.height;
        var offsetTop = window.visualViewport.offsetTop;
        modal.style.height = vh + 'px';
        modal.style.top = offsetTop + 'px';
        modal.style.bottom = 'auto';
        innerDiv.style.maxHeight = (vh - 16) + 'px';
      }
    };
    if (window.visualViewport) {
      adjustForKeyboard();
      window.visualViewport.addEventListener('resize', adjustForKeyboard);
      window.visualViewport.addEventListener('scroll', adjustForKeyboard);
    } else {
      innerDiv.style.maxHeight = '85vh';
    }

    // 제목 입력에 포커스
    setTimeout(function() {
      document.getElementById('event-title').focus();
    }, 100);

    // 코트 선택 → 제목에 반영
    var courtSelect = document.getElementById('event-court-select');
    if (courtSelect) {
      courtSelect.addEventListener('change', function() {
        if (this.value) {
          document.getElementById('event-title').value = this.value;
        }
      });
    }

    // 분 하이라이트 갱신 헬퍼
    var activeMinCls = ['border-blue-700', 'bg-blue-50', 'text-blue-700'];
    function refreshMinBtns() {
      modal.querySelectorAll('.min-quick-btn').forEach(function(b) {
        var target = document.getElementById(b.dataset.target);
        var val = target ? target.value : '';
        if (val.length === 1) val = '0' + val;
        if (b.dataset.val === val) {
          b.classList.add.apply(b.classList, activeMinCls);
        } else {
          b.classList.remove.apply(b.classList, activeMinCls);
        }
      });
    }

    // 분 빠른 선택 버튼
    modal.querySelectorAll('.min-quick-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = document.getElementById(this.dataset.target);
        target.value = this.dataset.val;
        refreshMinBtns();
      });
    });

    // 분 직접 입력 시 버튼 하이라이트 갱신
    ['event-start-min', 'event-end-min'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', refreshMinBtns);
    });

    // 시간 프리셋 버튼
    modal.querySelectorAll('.time-preset-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var sp = this.dataset.start.split(':');
        var ep = this.dataset.end.split(':');
        document.getElementById('event-start-hour').value = sp[0];
        document.getElementById('event-start-min').value = sp[1];
        document.getElementById('event-end-hour').value = ep[0];
        document.getElementById('event-end-min').value = ep[1];
        // 선택된 프리셋 하이라이트
        modal.querySelectorAll('.time-preset-btn').forEach(function(b) {
          b.classList.remove('border-blue-700', 'bg-blue-50', 'text-blue-700');
        });
        this.classList.add('border-blue-700', 'bg-blue-50', 'text-blue-700');
        refreshMinBtns();
      });
    });

    // 기존 값 하이라이트
    refreshMinBtns();
    if (ev.startTime && ev.endTime) {
      modal.querySelectorAll('.time-preset-btn').forEach(function(btn) {
        if (btn.dataset.start === ev.startTime && btn.dataset.end === ev.endTime) {
          btn.classList.add('border-blue-700', 'bg-blue-50', 'text-blue-700');
        }
      });
    }

    // 닫기
    function closeModal() {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', adjustForKeyboard);
        window.visualViewport.removeEventListener('scroll', adjustForKeyboard);
      }
      modal.remove();
      unlockScroll();
    }

    document.getElementById('cal-modal-overlay').addEventListener('click', closeModal);
    document.getElementById('cal-modal-cancel').addEventListener('click', closeModal);

    // 저장 (Transaction 기반)
    document.getElementById('cal-modal-save').addEventListener('click', async function() {
      var title = document.getElementById('event-title').value.trim();
      var date = document.getElementById('event-date').value;
      var sh = document.getElementById('event-start-hour').value;
      var sm = document.getElementById('event-start-min').value || '00';
      var eh = document.getElementById('event-end-hour').value;
      var em = document.getElementById('event-end-min').value || '00';
      if (sm.length === 1) sm = '0' + sm;
      if (em.length === 1) em = '0' + em;
      var startTime = sh ? (sh + ':' + sm) : '';
      var endTime = eh ? (eh + ':' + em) : '';
      var desc = document.getElementById('event-desc').value.trim();
      var maxP = parseInt(document.getElementById('event-max').value) || 0;
      var colorRadio = document.querySelector('input[name="event-color"]:checked');
      var color = colorRadio ? colorRadio.value : 'green';

      if (!title) {
        alert('제목을 입력하세요.');
        return;
      }
      if (!date) {
        alert('날짜를 선택하세요.');
        return;
      }

      var saveBtn = document.getElementById('cal-modal-save');
      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중...';

      if (isEdit) {
        // 수정 (Transaction)
        var updatedFields = {
          title: title,
          date: date,
          startTime: startTime,
          endTime: endTime,
          description: desc,
          color: color,
          maxParticipants: maxP
        };
        await Storage.editEvent(existingEvent.id, updatedFields);
      } else {
        // 추가 (Transaction)
        var creatorName = App.getMemberName() || '관리자';
        var newEvent = {
          id: Storage.generateId(),
          title: title,
          date: date,
          startTime: startTime,
          endTime: endTime,
          description: desc,
          color: color,
          maxParticipants: maxP,
          participants: [],
          waitlist: [],
          createdBy: creatorName
        };
        await Storage.addEvent(newEvent);
      }

      self._selectedDate = date;
      closeModal();
      self.render(self._container);
    });
  },

  _showCancelConfirmModal(eventId, memberName) {
    var self = this;
    var modal = document.createElement('div');
    modal.id = 'cal-cancel-modal';
    modal.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4';
    modal.innerHTML =
      '<div class="absolute inset-0 bg-black/40" id="cal-cancel-overlay"></div>' +
      '<div class="relative bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 text-center">' +
        '<div class="w-12 h-12 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">' +
          '<svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' +
        '</div>' +
        '<h3 class="text-lg font-bold text-gray-800 mb-1">참석 취소</h3>' +
        '<p class="text-sm text-gray-500 mb-4">참석을 취소하시겠습니까?</p>' +
        '<div class="flex gap-2">' +
          '<button id="cal-cancel-no" class="flex-1 px-4 py-2.5 bg-gray-100 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-200 transition">아니요</button>' +
          '<button id="cal-cancel-yes" class="flex-1 px-4 py-2.5 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600 transition">취소하기</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    lockScroll();

    function closeModal() { modal.remove(); unlockScroll(); }

    document.getElementById('cal-cancel-overlay').addEventListener('click', closeModal);
    document.getElementById('cal-cancel-no').addEventListener('click', closeModal);
    document.getElementById('cal-cancel-yes').addEventListener('click', async function() {
      await Storage.toggleAttendance(eventId, memberName);
      closeModal();
      self.render(self._container);
    });
  },

  _formatTimeRange(ev) {
    var start = ev.startTime || ev.time || '';
    var end = ev.endTime || '';
    if (!start && !end) return '';
    if (start && end) return start + ' ~ ' + end;
    return start;
  },

  // 유틸리티
  _getEventsForDate(events, dateStr) {
    return events.filter(function(e) { return e.date === dateStr; });
  },

  _formatDate(d) {
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  },

  _formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    var parts = dateStr.split('-');
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    var dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    return parseInt(parts[1]) + '월 ' + parseInt(parts[2]) + '일 (' + dayNames[d.getDay()] + ')';
  },

  // 대진표 생성 설정 모달
  _showBracketModal(ev) {
    var self = this;
    var participants = ev.participants || [];
    var allPlayers = Storage.getPlayers();
    var genderMap = {};
    allPlayers.forEach(function(p) { genderMap[p.name] = p.gender; });

    var males = participants.filter(function(n) { return genderMap[n] === 'M'; });
    var females = participants.filter(function(n) { return genderMap[n] === 'F'; });

    // 시간 옵션 생성 (05:00 ~ 23:30, 30분 단위)
    var timeOptions = '';
    for (var h = 5; h < 24; h++) {
      for (var m = 0; m < 60; m += 30) {
        var val = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
        timeOptions += '<option value="' + val + '">' + val + '</option>';
      }
    }

    var defaultStart = ev.startTime || '06:00';
    var defaultEnd = ev.endTime || '09:00';

    var modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4';
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
    modal.innerHTML =
      '<div class="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4 overflow-y-auto" style="max-height:90vh">' +
        '<div class="w-10 h-1 bg-gray-300 rounded-full mx-auto sm:hidden"></div>' +
        '<h3 class="text-lg font-bold text-gray-800 text-center">대진표 생성</h3>' +
        '<input type="text" id="bm-name" class="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-center focus:outline-none focus:border-blue-500 transition" value="' + this._escapeAttr(ev.title + ' 대진표') + '">' +
        // 참석자 현황
        '<div class="flex justify-center gap-3">' +
          '<span class="text-sm font-medium text-blue-600">남 ' + males.length + '명</span>' +
          '<span class="text-sm font-medium text-pink-600">여 ' + females.length + '명</span>' +
          '<span class="text-sm text-gray-500">총 ' + participants.length + '명</span>' +
        '</div>' +
        // 복식/단식
        '<div>' +
          '<label class="block text-xs font-semibold text-gray-500 mb-1.5">경기 방식</label>' +
          '<div class="flex gap-2">' +
            '<label class="flex-1 cursor-pointer">' +
              '<input type="radio" name="bm-match-type" value="doubles" checked class="sr-only peer">' +
              '<div class="border-2 border-gray-200 rounded-xl py-2 text-center peer-checked:border-blue-500 peer-checked:bg-blue-50 transition text-sm font-medium">복식</div>' +
            '</label>' +
            '<label class="flex-1 cursor-pointer">' +
              '<input type="radio" name="bm-match-type" value="singles" class="sr-only peer">' +
              '<div class="border-2 border-gray-200 rounded-xl py-2 text-center peer-checked:border-blue-500 peer-checked:bg-blue-50 transition text-sm font-medium">단식</div>' +
            '</label>' +
          '</div>' +
        '</div>' +
        // 코트 수
        '<div>' +
          '<label class="block text-xs font-semibold text-gray-500 mb-1.5">코트 수</label>' +
          '<div class="flex flex-wrap gap-1.5">' +
            [1,2,3,4,5,6,7,8].map(function(n) {
              return '<label class="cursor-pointer">' +
                '<input type="radio" name="bm-courts" value="' + n + '"' + (n === 2 ? ' checked' : '') + ' class="sr-only peer">' +
                '<div class="w-9 h-9 flex items-center justify-center border-2 border-gray-200 rounded-lg peer-checked:border-blue-500 peer-checked:bg-blue-50 transition text-sm font-bold">' + n + '</div>' +
              '</label>';
            }).join('') +
          '</div>' +
        '</div>' +
        // 시간
        '<div class="flex gap-2">' +
          '<div class="flex-1">' +
            '<label class="block text-xs font-semibold text-gray-500 mb-1.5">시작</label>' +
            '<select id="bm-start" class="w-full px-2 py-2 border border-gray-300 rounded-xl text-sm">' + timeOptions + '</select>' +
          '</div>' +
          '<div class="flex-1">' +
            '<label class="block text-xs font-semibold text-gray-500 mb-1.5">종료</label>' +
            '<select id="bm-end" class="w-full px-2 py-2 border border-gray-300 rounded-xl text-sm">' + timeOptions + '</select>' +
          '</div>' +
        '</div>' +
        // 옵션
        '<div class="flex items-center justify-end gap-4">' +
          '<label class="flex items-center gap-1.5 cursor-pointer">' +
            '<input type="checkbox" id="bm-xd" class="w-3.5 h-3.5 text-blue-700 rounded border-gray-300">' +
            '<span id="bm-xd-label" class="text-xs text-gray-500">혼복</span>' +
          '</label>' +
          '<label class="flex items-center gap-1.5 cursor-pointer">' +
            '<input type="checkbox" id="bm-mixed" class="w-3.5 h-3.5 text-blue-700 rounded border-gray-300">' +
            '<span id="bm-mixed-label" class="text-xs text-gray-500">섞어복식 허용</span>' +
          '</label>' +
        '</div>' +
        // 버튼
        '<div class="flex gap-2">' +
          '<button type="button" class="bm-cancel flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">취소</button>' +
          '<button type="button" class="bm-submit flex-1 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl text-sm font-semibold hover:from-blue-600 hover:to-indigo-600 transition">생성</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    lockScroll();

    // 기본값 설정
    modal.querySelector('#bm-start').value = defaultStart;
    modal.querySelector('#bm-end').value = defaultEnd;

    // 단식/복식 전환 시 라벨 변경
    modal.querySelectorAll('input[name="bm-match-type"]').forEach(function(r) {
      r.onchange = function() {
        var s = r.value === 'singles';
        modal.querySelector('#bm-xd-label').textContent = s ? '혼단' : '혼복';
        modal.querySelector('#bm-mixed-label').textContent = s ? '섞어단식 허용' : '섞어복식 허용';
      };
    });

    // 닫기
    var closeModal = function() { modal.remove(); unlockScroll(); };
    modal.querySelector('.bm-cancel').onclick = closeModal;
    modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });

    // 생성
    modal.querySelector('.bm-submit').onclick = function() {
      var startTime = modal.querySelector('#bm-start').value;
      var endTime = modal.querySelector('#bm-end').value;
      var courts = parseInt(modal.querySelector('input[name="bm-courts"]:checked').value);
      var isSingles = modal.querySelector('input[name="bm-match-type"]:checked').value === 'singles';
      var allowXD = modal.querySelector('#bm-xd').checked;
      var allowMixed = modal.querySelector('#bm-mixed').checked;

      if (startTime >= endTime) {
        alert('종료 시간은 시작 시간보다 뒤여야 합니다.');
        return;
      }

      var minPlayers = isSingles ? 2 : 4;
      if (participants.length < minPlayers) {
        alert('최소 ' + minPlayers + '명의 참석자가 필요합니다.');
        return;
      }

      var possibleTypes = Schedule.getPossibleTypes(males, females, allowMixed, isSingles, allowXD);
      if (possibleTypes.length === 0) {
        if (isSingles) {
          alert('참석자 성별 구성으로 단식 경기를 만들 수 없습니다.\n남자단식: 남2명, 여자단식: 여2명 이상 필요\n또는 섞어단식 허용을 체크해주세요.');
        } else {
          alert('참석자 성별 구성으로 복식 경기를 만들 수 없습니다.\n혼합복식: 남2+여2, 남자복식: 남4, 여자복식: 여4 이상 필요\n또는 섞어복식 허용을 체크해주세요.');
        }
        return;
      }

      var timeSlots = Schedule.generate(males, females, courts, startTime, endTime, allowMixed, isSingles, allowXD);
      if (timeSlots.length === 0) {
        alert('시간이 부족합니다. 최소 30분 이상 설정해주세요.');
        return;
      }

      var bracketName = modal.querySelector('#bm-name').value.trim() || (ev.title + ' 대진표');
      var gameDate = ev.date || new Date().toISOString().slice(0, 10);
      var tournament = {
        id: Storage.generateId(),
        name: bracketName,
        format: 'schedule',
        isSingles: isSingles,
        isTeamMode: false,
        setCount: 1,
        courts: courts,
        startTime: startTime,
        endTime: endTime,
        allowMixed: allowMixed,
        gameDate: gameDate,
        males: males,
        females: females,
        players: participants.slice(),
        status: 'active',
        createdAt: new Date().toISOString(),
        completedAt: null,
        timeSlots: timeSlots,
      };

      var tournaments = Storage.getTournaments();
      tournaments.push(tournament);
      Storage.saveTournaments(tournaments);

      closeModal();
      App.navigate('active', tournament.id);
    };
  },

  _escapeHtml(text) {
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text || '').replace(/[&<>"']/g, function(m) { return map[m]; });
  },

  _escapeAttr(text) {
    return String(text || '').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
};
