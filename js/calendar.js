// calendar.js - 월별 캘린더 + 일정 관리
const Calendar = {
  _currentMonth: null, // Date 객체 (해당 월 1일)
  _selectedDate: null, // 'YYYY-MM-DD'
  _container: null,

  // 색상 옵션
  COLORS: [
    { value: 'green', label: '초록', bg: 'bg-green-100', dot: 'bg-green-500', text: 'text-green-700' },
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
    var canEdit = !RolesConfig.isMember();

    var year = this._currentMonth.getFullYear();
    var month = this._currentMonth.getMonth();
    var monthLabel = year + '년 ' + (month + 1) + '월';

    // 캘린더 그리드 생성
    var calendarGrid = this._buildCalendarGrid(year, month, events);
    // 선택 날짜 일정 목록
    var dayEvents = this._getEventsForDate(events, this._selectedDate);
    var eventsList = this._buildEventsList(dayEvents, canEdit);

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
            (canEdit ? '<button id="cal-add-event" class="px-3 py-1.5 bg-green-700 text-white text-xs font-semibold rounded-lg hover:bg-green-800 transition">+ 일정 추가</button>' : '') +
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

  _buildEventsList(dayEvents, canEdit) {
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

      // 참석자 이름 목록
      var namesList = '';
      if (participants.length > 0) {
        namesList = '<div class="flex flex-wrap gap-1 mt-1.5">';
        for (var j = 0; j < participants.length; j++) {
          namesList += '<span class="inline-block text-xs px-1.5 py-0.5 rounded-md bg-white/60 text-gray-600">' + this._escapeHtml(participants[j]) + '</span>';
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
          attendBtn = '<button class="cal-attend-btn mt-2 w-full py-1.5 text-xs font-semibold rounded-lg bg-green-700 text-white hover:bg-green-800 transition" data-id="' + ev.id + '">참석</button>';
        } else {
          attendBtn = '<button class="cal-waitlist-btn mt-2 w-full py-1.5 text-xs font-semibold rounded-lg bg-yellow-500 text-white hover:bg-yellow-600 transition" data-id="' + ev.id + '">대기 신청</button>';
        }
      }

      html += '<div class="p-3 rounded-xl ' + color.bg + ' mb-2">' +
                '<div class="flex items-start gap-3">' +
                  '<div class="w-1 self-stretch rounded-full ' + color.dot + ' flex-shrink-0 mt-0.5"></div>' +
                  '<div class="flex-1 min-w-0">' +
                    '<div class="font-semibold text-sm ' + color.text + '">' + this._escapeHtml(ev.title) + '</div>' +
                    (this._formatTimeRange(ev) ? '<div class="text-xs text-gray-500 mt-0.5">' + this._formatTimeRange(ev) + '</div>' : '') +
                    (ev.description ? '<div class="text-xs text-gray-500 mt-1">' + this._escapeHtml(ev.description) + '</div>' : '') +
                    attendInfo +
                    namesList +
                    waitlistHtml +
                  '</div>' +
                  (canEdit ?
                    '<div class="flex gap-1 flex-shrink-0">' +
                      '<button class="cal-edit-btn w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/60 transition text-gray-400" data-id="' + ev.id + '" title="수정">' +
                        '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>' +
                      '</button>' +
                      '<button class="cal-delete-btn w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-100 transition text-gray-400 hover:text-red-500" data-id="' + ev.id + '" title="삭제">' +
                        '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>' +
                      '</button>' +
                    '</div>'
                  : '') +
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

    // 삭제 버튼
    container.querySelectorAll('.cal-delete-btn').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var id = this.dataset.id;
        if (confirm('이 일정을 삭제하시겠습니까?')) {
          var events = Storage.getEvents().filter(function(e) { return e.id !== id; });
          Storage.saveEvents(events);
          self.render(self._container);
        }
      };
    });

    // 참석 버튼
    container.querySelectorAll('.cal-attend-btn').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var id = this.dataset.id;
        var memberName = App.getMemberName();
        if (!memberName) return;
        var result = Storage.toggleAttendance(id, memberName);
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
      btn.onclick = function(e) {
        e.stopPropagation();
        var id = this.dataset.id;
        var memberName = App.getMemberName();
        if (!memberName) return;
        Storage.toggleWaitlist(id, memberName);
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
      colorOptions += '<label class="flex items-center gap-2 cursor-pointer">' +
        '<input type="radio" name="event-color" value="' + c.value + '" ' + checked + ' class="hidden peer">' +
        '<span class="w-6 h-6 rounded-full ' + c.dot + ' peer-checked:ring-2 peer-checked:ring-offset-2 peer-checked:ring-gray-400 transition"></span>' +
      '</label>';
    }

    // 모달 HTML
    var modal = document.createElement('div');
    modal.id = 'cal-modal';
    modal.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4';
    modal.innerHTML =
      '<div class="absolute inset-0 bg-black/40" id="cal-modal-overlay"></div>' +
      '<div class="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">' +
        '<h3 class="text-lg font-bold text-gray-800">' + (isEdit ? '일정 수정' : '일정 추가') + '</h3>' +
        // 제목
        '<div>' +
          '<label class="block text-sm font-medium text-gray-600 mb-1">제목</label>' +
          '<input type="text" id="event-title" class="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-700 transition" placeholder="일정 제목" value="' + this._escapeAttr(ev.title) + '">' +
        '</div>' +
        // 코트 선택
        (courts.length > 0 ?
        '<div>' +
          '<label class="block text-sm font-medium text-gray-600 mb-1">코트</label>' +
          '<select id="event-court-select" class="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-700 transition bg-white">' + courtOptions + '</select>' +
        '</div>' : '') +
        // 날짜
        '<div>' +
          '<label class="block text-sm font-medium text-gray-600 mb-1">날짜</label>' +
          '<input type="date" id="event-date" class="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-700 transition" value="' + ev.date + '">' +
        '</div>' +
        // 시간 범위
        '<div>' +
          '<label class="block text-sm font-medium text-gray-600 mb-1.5">시간 (선택)</label>' +
          '<div class="space-y-2">' +
            '<div class="flex items-center gap-1.5">' +
              '<span class="text-xs text-gray-400 w-7 flex-shrink-0">시작</span>' +
              '<select id="event-start-hour" class="px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-700 transition bg-white">' + startHOpts + '</select>' +
              '<span class="text-gray-300 text-sm">:</span>' +
              '<input type="number" id="event-start-min" class="w-14 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:border-green-700 transition" min="0" max="59" placeholder="00" value="' + (ev.startTime ? startM : '') + '">' +
              '<button type="button" class="min-quick-btn px-2.5 py-2 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-green-600 hover:bg-green-50 transition" data-target="event-start-min" data-val="00">:00</button>' +
              '<button type="button" class="min-quick-btn px-2.5 py-2 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-green-600 hover:bg-green-50 transition" data-target="event-start-min" data-val="30">:30</button>' +
            '</div>' +
            '<div class="flex items-center gap-1.5">' +
              '<span class="text-xs text-gray-400 w-7 flex-shrink-0">종료</span>' +
              '<select id="event-end-hour" class="px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-700 transition bg-white">' + endHOpts + '</select>' +
              '<span class="text-gray-300 text-sm">:</span>' +
              '<input type="number" id="event-end-min" class="w-14 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:border-green-700 transition" min="0" max="59" placeholder="00" value="' + (ev.endTime ? endM : '') + '">' +
              '<button type="button" class="min-quick-btn px-2.5 py-2 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-green-600 hover:bg-green-50 transition" data-target="event-end-min" data-val="00">:00</button>' +
              '<button type="button" class="min-quick-btn px-2.5 py-2 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-green-600 hover:bg-green-50 transition" data-target="event-end-min" data-val="30">:30</button>' +
            '</div>' +
          '</div>' +
          '<div class="flex flex-wrap gap-1.5 mt-2" id="time-presets">' +
            '<button type="button" class="time-preset-btn px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-green-600 hover:text-green-700 hover:bg-green-50 transition" data-start="06:00" data-end="08:00">06~08</button>' +
            '<button type="button" class="time-preset-btn px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-green-600 hover:text-green-700 hover:bg-green-50 transition" data-start="08:00" data-end="10:00">08~10</button>' +
            '<button type="button" class="time-preset-btn px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-green-600 hover:text-green-700 hover:bg-green-50 transition" data-start="10:00" data-end="12:00">10~12</button>' +
            '<button type="button" class="time-preset-btn px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-green-600 hover:text-green-700 hover:bg-green-50 transition" data-start="12:00" data-end="14:00">12~14</button>' +
            '<button type="button" class="time-preset-btn px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-green-600 hover:text-green-700 hover:bg-green-50 transition" data-start="14:00" data-end="16:00">14~16</button>' +
            '<button type="button" class="time-preset-btn px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-green-600 hover:text-green-700 hover:bg-green-50 transition" data-start="16:00" data-end="18:00">16~18</button>' +
            '<button type="button" class="time-preset-btn px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-green-600 hover:text-green-700 hover:bg-green-50 transition" data-start="18:00" data-end="20:00">18~20</button>' +
            '<button type="button" class="time-preset-btn px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-green-600 hover:text-green-700 hover:bg-green-50 transition" data-start="20:00" data-end="22:00">20~22</button>' +
          '</div>' +
        '</div>' +
        // 인원 제한
        '<div>' +
          '<label class="block text-sm font-medium text-gray-600 mb-1">참석 인원 제한 (0 = 무제한)</label>' +
          '<input type="number" id="event-max" class="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-700 transition" min="0" value="' + (ev.maxParticipants || 0) + '">' +
        '</div>' +
        // 메모
        '<div>' +
          '<label class="block text-sm font-medium text-gray-600 mb-1">메모 (선택)</label>' +
          '<textarea id="event-desc" class="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-700 transition resize-none" rows="2" placeholder="메모">' + this._escapeHtml(ev.description || '') + '</textarea>' +
        '</div>' +
        // 색상
        '<div>' +
          '<label class="block text-sm font-medium text-gray-600 mb-2">색상</label>' +
          '<div class="flex gap-3">' + colorOptions + '</div>' +
        '</div>' +
        // 버튼
        '<div class="flex gap-2 pt-2">' +
          '<button id="cal-modal-cancel" class="flex-1 px-4 py-2.5 bg-gray-100 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-200 transition">취소</button>' +
          '<button id="cal-modal-save" class="flex-1 px-4 py-2.5 bg-green-700 text-white text-sm font-semibold rounded-xl hover:bg-green-800 transition">' + (isEdit ? '수정' : '추가') + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);

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
    var activeMinCls = ['border-green-700', 'bg-green-50', 'text-green-700'];
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
          b.classList.remove('border-green-700', 'bg-green-50', 'text-green-700');
        });
        this.classList.add('border-green-700', 'bg-green-50', 'text-green-700');
        refreshMinBtns();
      });
    });

    // 기존 값 하이라이트
    refreshMinBtns();
    if (ev.startTime && ev.endTime) {
      modal.querySelectorAll('.time-preset-btn').forEach(function(btn) {
        if (btn.dataset.start === ev.startTime && btn.dataset.end === ev.endTime) {
          btn.classList.add('border-green-700', 'bg-green-50', 'text-green-700');
        }
      });
    }

    // 닫기
    function closeModal() {
      modal.remove();
    }

    document.getElementById('cal-modal-overlay').addEventListener('click', closeModal);
    document.getElementById('cal-modal-cancel').addEventListener('click', closeModal);

    // 저장
    document.getElementById('cal-modal-save').addEventListener('click', function() {
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

      var events = Storage.getEvents();

      if (isEdit) {
        // 수정
        for (var i = 0; i < events.length; i++) {
          if (events[i].id === existingEvent.id) {
            events[i].title = title;
            events[i].date = date;
            events[i].startTime = startTime;
            events[i].endTime = endTime;
            delete events[i].time;
            events[i].description = desc;
            events[i].color = color;
            events[i].maxParticipants = maxP;
            break;
          }
        }
      } else {
        // 추가
        events.push({
          id: Storage.generateId(),
          title: title,
          date: date,
          startTime: startTime,
          endTime: endTime,
          description: desc,
          color: color,
          maxParticipants: maxP,
          participants: [],
          waitlist: []
        });
      }

      // 날짜순 정렬
      events.sort(function(a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return (a.startTime || a.time || '').localeCompare(b.startTime || b.time || '');
      });

      Storage.saveEvents(events);
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

    function closeModal() { modal.remove(); }

    document.getElementById('cal-cancel-overlay').addEventListener('click', closeModal);
    document.getElementById('cal-cancel-no').addEventListener('click', closeModal);
    document.getElementById('cal-cancel-yes').addEventListener('click', function() {
      Storage.toggleAttendance(eventId, memberName);
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

  _escapeHtml(text) {
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text || '').replace(/[&<>"']/g, function(m) { return map[m]; });
  },

  _escapeAttr(text) {
    return String(text || '').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
};
