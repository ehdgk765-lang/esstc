// stats.js - 통계 모듈
const Stats = {
  _viewMode: 'monthly',    // 'monthly' | 'total' | 'team'
  _selectedMonth: null,
  _medalGenderFilter: 'all',         // 'all' | 'M' | 'F'
  _participationGenderFilter: 'all',
  _medalCollapsed: false,
  _participationCollapsed: false,

  render(container) {
    const tournaments = this._getCompletedScheduleTournaments();
    const groups = Storage.getGroups();

    if (tournaments.length === 0 && groups.length === 0) {
      patchDOM(container, `
        <div class="max-w-lg mx-auto text-center py-12">
          <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-blue-50/30 border border-white/60 p-8">
            <div class="text-5xl mb-4">📊</div>
            <h2 class="text-xl font-bold text-gray-800 mb-2">통계가 없습니다</h2>
            <p class="text-gray-500">완료된 대진표가 있으면 통계가 표시됩니다.</p>
          </div>
        </div>`);
      return;
    }

    // 현재 월 기본 선택
    if (!this._selectedMonth) {
      const now = new Date();
      this._selectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const { groups: monthGroups, sortedKeys } = this._groupByMonth(tournaments);

    patchDOM(container, `
      <div class="max-w-lg mx-auto">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">통계</h2>

        <div class="flex gap-2 mb-6">
          <button data-stats-mode="monthly"
            class="sub-tab flex-1 px-4 py-2 rounded-full text-sm font-semibold transition
            ${this._viewMode === 'monthly' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
            월별 통계
          </button>
          <button data-stats-mode="total"
            class="sub-tab flex-1 px-4 py-2 rounded-full text-sm font-semibold transition
            ${this._viewMode === 'total' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
            전체 통계
          </button>
          <button data-stats-mode="team"
            class="sub-tab flex-1 px-4 py-2 rounded-full text-sm font-semibold transition
            ${this._viewMode === 'team' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
            조별 통계
          </button>
        </div>

        <div id="stats-content"></div>
      </div>`);

    container.querySelectorAll('[data-stats-mode]').forEach(btn => {
      btn.onclick = () => {
        this._viewMode = btn.dataset.statsMode;
        this.render(container);
      };
    });

    const statsContent = container.querySelector('#stats-content');

    if (this._viewMode === 'monthly') {
      this._renderMonthlyView(statsContent, monthGroups, sortedKeys);
    } else if (this._viewMode === 'team') {
      this._renderTeamView(statsContent);
    } else {
      this._renderTotalView(statsContent, tournaments);
    }
  },

  _getCompletedScheduleTournaments() {
    return Storage.getTournaments().filter(t => t.format === 'schedule' && t.status === 'completed');
  },

  _groupByMonth(tournaments) {
    const getGameDate = (t) => t.gameDate || (t.createdAt ? t.createdAt.slice(0, 10) : '');
    const groups = {};
    tournaments.forEach(t => {
      const d = getGameDate(t);
      const key = d ? d.slice(0, 7) : 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    return { groups, sortedKeys };
  },

  _getMedalRanking(tournaments) {
    const medals = {};
    const ensure = (name) => {
      if (!medals[name]) medals[name] = { name, gold: 0, silver: 0, bronze: 0, total: 0 };
    };

    tournaments.forEach(t => {
      const playerStats = Schedule.calcPlayerStats(t);
      if (playerStats.length === 0) return;

      playerStats.forEach(s => {
        const rank = playerStats.findIndex(p =>
          p.scorePoints === s.scorePoints && p.matchPoints === s.matchPoints && p.games === s.games
        );
        if (rank === 0) {
          ensure(s.name); medals[s.name].gold++; medals[s.name].total++;
        } else if (rank === 1) {
          ensure(s.name); medals[s.name].silver++; medals[s.name].total++;
        } else if (rank === 2) {
          ensure(s.name); medals[s.name].bronze++; medals[s.name].total++;
        }
      });
    });

    const currentPlayers = new Set(Storage.getPlayers().map(p => p.name));
    return Object.values(medals).filter(m => currentPlayers.has(m.name)).sort((a, b) =>
      b.total - a.total || b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze
    );
  },

  _aggregateStats(tournaments) {
    const aggregate = {};
    const ensure = (name) => {
      if (!aggregate[name]) {
        aggregate[name] = { name, games: 0, wins: 0, losses: 0, draws: 0, matchPoints: 0, scorePoints: 0, tournamentCount: 0, md: 0, wd: 0, xd: 0, fd: 0, ms: 0, ws: 0 };
      }
    };

    tournaments.forEach(t => {
      const stats = Schedule.calcPlayerStats(t);
      const participated = new Set();
      stats.forEach(s => {
        ensure(s.name);
        aggregate[s.name].games += s.games;
        aggregate[s.name].wins += s.wins;
        aggregate[s.name].losses += s.losses;
        aggregate[s.name].draws += s.draws;
        aggregate[s.name].matchPoints += s.matchPoints;
        aggregate[s.name].scorePoints += s.scorePoints;
        aggregate[s.name].md += (s.md || 0);
        aggregate[s.name].wd += (s.wd || 0);
        aggregate[s.name].xd += (s.xd || 0);
        aggregate[s.name].fd += (s.fd || 0);
        aggregate[s.name].ms += (s.ms || 0);
        aggregate[s.name].ws += (s.ws || 0);
        participated.add(s.name);
      });
      participated.forEach(name => { aggregate[name].tournamentCount++; });
    });

    const currentPlayers = new Set(Storage.getPlayers().map(p => p.name));
    return Object.values(aggregate).filter(s => currentPlayers.has(s.name)).sort((a, b) =>
      b.scorePoints - a.scorePoints || b.matchPoints - a.matchPoints || a.games - b.games
    );
  },

  _formatMonthLabel(key) {
    if (!key || key === 'unknown') return '날짜 미지정';
    const [y, m] = key.split('-');
    return `${y}년 ${parseInt(m)}월`;
  },

  _renderMonthlyView(container, groups, sortedKeys) {
    if (sortedKeys.length === 0) {
      container.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">완료된 대진표가 없습니다.</p>';
      return;
    }
    // 선택된 월이 데이터에 없으면 가장 최신 월로
    if (!groups[this._selectedMonth]) {
      this._selectedMonth = sortedKeys[0];
    }

    const monthTournaments = groups[this._selectedMonth] || [];
    const medalData = this._getMedalRanking(monthTournaments);
    const participationData = this._aggregateStats(monthTournaments);

    container.innerHTML = `
      <div class="flex gap-2 mb-4 overflow-x-auto pb-2" style="-webkit-overflow-scrolling:touch">
        ${sortedKeys.map(key => `
          <button data-month="${key}"
            class="month-select-btn px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition
            ${key === this._selectedMonth
              ? 'bg-blue-100 text-blue-700 border border-blue-300'
              : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'}">
            ${this._formatMonthLabel(key)}
            <span class="text-xs opacity-60">(${groups[key].length})</span>
          </button>
        `).join('')}
      </div>
      <p class="text-sm text-gray-500 mb-4">${this._formatMonthLabel(this._selectedMonth)} - 완료 대진표 ${monthTournaments.length}개</p>
      <div id="stats-medal-section"></div>
      <div id="stats-participation-section"></div>
    `;

    container.querySelectorAll('.month-select-btn').forEach(btn => {
      btn.onclick = () => {
        this._selectedMonth = btn.dataset.month;
        this._renderMonthlyView(container, groups, sortedKeys);
      };
    });

    if (medalData.length > 0) {
      this._renderMedalTable(container.querySelector('#stats-medal-section'), medalData);
    }
    if (participationData.length > 0) {
      this._renderParticipationTable(container.querySelector('#stats-participation-section'), participationData);
    }
  },

  _renderTotalView(container, tournaments) {
    const medalData = this._getMedalRanking(tournaments);
    const participationData = this._aggregateStats(tournaments);

    container.innerHTML = `
      <p class="text-sm text-gray-500 mb-4">전체 완료 대진표 ${tournaments.length}개 종합</p>
      <div id="stats-medal-section"></div>
      <div id="stats-participation-section"></div>
    `;

    if (medalData.length > 0) {
      this._renderMedalTable(container.querySelector('#stats-medal-section'), medalData);
    }
    if (participationData.length > 0) {
      this._renderParticipationTable(container.querySelector('#stats-participation-section'), participationData);
    }
  },

  _renderMedalTable(container, medalData) {
    const allPlayersData = Storage.getPlayers();
    const filter = this._medalGenderFilter;
    const collapsed = this._medalCollapsed;

    const filteredData = filter === 'all'
      ? medalData
      : medalData.filter(m => {
          const pd = allPlayersData.find(p => p.name === m.name);
          return pd?.gender === filter;
        });

    const genderBtnCls = (g) => g === filter
      ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200';

    container.innerHTML = `
      <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-blue-50/30 border border-white/60 overflow-hidden mb-4">
        <div class="px-4 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between cursor-pointer stats-section-header">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-gray-700 text-sm">메달 순위</span>
            <div class="flex gap-1 stats-gender-btns" onclick="event.stopPropagation()">
              <button data-gender="all" class="stats-medal-gender px-2 py-0.5 rounded-full text-xs font-medium transition ${genderBtnCls('all')}">전체</button>
              <button data-gender="M" class="stats-medal-gender px-2 py-0.5 rounded-full text-xs font-medium transition ${genderBtnCls('M')}">남</button>
              <button data-gender="F" class="stats-medal-gender px-2 py-0.5 rounded-full text-xs font-medium transition ${genderBtnCls('F')}">여</button>
            </div>
          </div>
          <svg class="w-5 h-5 text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
        ${collapsed ? '' : `<table class="w-full text-sm standings-table">
          <thead>
            <tr class="border-b border-gray-100 text-gray-500 text-xs">
              <th class="text-center px-2 py-2 w-10">#</th>
              <th class="text-left px-3 py-2">멤버</th>
              <th class="text-center px-2 py-2">
                <span style="display:inline-block;width:18px;height:22px;background:url('css/medal.png') no-repeat;background-size:300% auto;background-position:0% center;vertical-align:middle;"></span>
              </th>
              <th class="text-center px-2 py-2">
                <span style="display:inline-block;width:18px;height:22px;background:url('css/medal.png') no-repeat;background-size:300% auto;background-position:50% center;vertical-align:middle;"></span>
              </th>
              <th class="text-center px-2 py-2">
                <span style="display:inline-block;width:18px;height:22px;background:url('css/medal.png') no-repeat;background-size:300% auto;background-position:100% center;vertical-align:middle;"></span>
              </th>
              <th class="text-center px-2 py-2">합계</th>
            </tr>
          </thead>
          <tbody>
            ${filteredData.length === 0
              ? '<tr><td colspan="6" class="text-center py-4 text-gray-400 text-sm">데이터가 없습니다</td></tr>'
              : filteredData.map((m, idx) => {
              const pd = allPlayersData.find(p => p.name === m.name);
              const gender = pd?.gender;
              const gb = genderBadge(gender);
              const isMe = RolesConfig.isMember() && App.getMemberName() && m.name === App.getMemberName();
              return `<tr class="border-b border-gray-50 hover:bg-gray-50 ${isMe ? 'bg-blue-50/60' : ''}">
                <td class="text-center px-2 py-2 text-gray-500 font-bold">${idx + 1}</td>
                <td class="px-3 py-2 font-medium ${isMe ? 'text-blue-700' : 'text-gray-800'}">${Results.escapeHtml(m.name)} ${gb}</td>
                <td class="text-center px-2 py-2 font-bold text-yellow-600">${m.gold || '-'}</td>
                <td class="text-center px-2 py-2 font-bold text-gray-500">${m.silver || '-'}</td>
                <td class="text-center px-2 py-2 font-bold text-orange-600">${m.bronze || '-'}</td>
                <td class="text-center px-2 py-2 font-bold text-blue-700">${m.total}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`}
      </div>`;

    // 성별 필터 이벤트
    container.querySelectorAll('.stats-medal-gender').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        this._medalGenderFilter = btn.dataset.gender;
        this._renderMedalTable(container, medalData);
      };
    });
    // 접기/펼치기 이벤트
    const header = container.querySelector('.stats-section-header');
    if (header) {
      header.onclick = (e) => {
        if (e.target.closest('.stats-gender-btns')) return;
        this._medalCollapsed = !this._medalCollapsed;
        this._renderMedalTable(container, medalData);
      };
    }
  },

  _renderTeamView(container) {
    const groups = Storage.getGroups();
    const tournaments = this._getCompletedScheduleTournaments();

    if (groups.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8">
          <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-blue-50/30 border border-white/60 p-8">
            <div class="text-4xl mb-3">👥</div>
            <p class="text-gray-500">등록된 조가 없습니다.</p>
            <p class="text-gray-400 text-sm mt-1">회원 관리에서 조를 추가하면 조별 통계가 표시됩니다.</p>
          </div>
        </div>`;
      return;
    }

    if (tournaments.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8">
          <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-blue-50/30 border border-white/60 p-8">
            <div class="text-4xl mb-3">📊</div>
            <p class="text-gray-500">완료된 대진표가 없습니다.</p>
          </div>
        </div>`;
      return;
    }

    // 조별 멤버 맵 구축
    const players = Storage.getPlayers();
    const groupMembers = {};
    groups.forEach(g => { groupMembers[g.id] = []; });
    players.forEach(p => {
      (p.groups || []).forEach(gid => {
        if (groupMembers[gid]) groupMembers[gid].push(p.name);
      });
    });

    // 요일별 토너먼트 분류 (조의 day와 대진표의 gameDate 요일 매칭)
    const tournamentsByDay = {};
    tournaments.forEach(t => {
      const dateStr = t.gameDate || (t.createdAt ? t.createdAt.slice(0, 10) : '');
      if (!dateStr) return;
      const day = new Date(dateStr + 'T00:00:00').getDay();
      if (!tournamentsByDay[day]) tournamentsByDay[day] = [];
      tournamentsByDay[day].push(t);
    });

    // 요일별 개인 집계
    const playerAggregateByDay = {};
    Object.entries(tournamentsByDay).forEach(([day, dayTournaments]) => {
      const agg = {};
      dayTournaments.forEach(t => {
        Schedule.calcPlayerStats(t).forEach(s => {
          if (!agg[s.name]) {
            agg[s.name] = { games: 0, wins: 0, losses: 0, draws: 0, matchPoints: 0, scorePoints: 0 };
          }
          agg[s.name].games += s.games;
          agg[s.name].wins += s.wins;
          agg[s.name].losses += s.losses;
          agg[s.name].draws += s.draws;
          agg[s.name].matchPoints += s.matchPoints;
          agg[s.name].scorePoints += s.scorePoints;
        });
      });
      playerAggregateByDay[day] = agg;
    });

    // 조별 집계 (조의 요일에 해당하는 대진표만 반영)
    const groupStats = groups.map(g => {
      const members = groupMembers[g.id] || [];
      const dayAgg = playerAggregateByDay[g.day] || {};
      const agg = { name: g.name, id: g.id, memberCount: members.length, games: 0, wins: 0, losses: 0, draws: 0, matchPoints: 0, scorePoints: 0 };
      members.forEach(name => {
        const ps = dayAgg[name];
        if (!ps) return;
        agg.games += ps.games;
        agg.wins += ps.wins;
        agg.losses += ps.losses;
        agg.draws += ps.draws;
        agg.matchPoints += ps.matchPoints;
        agg.scorePoints += ps.scorePoints;
      });
      return agg;
    }).sort((a, b) => b.scorePoints - a.scorePoints || b.matchPoints - a.matchPoints || a.games - b.games);

    container.innerHTML = `
      <p class="text-sm text-gray-500 mb-4">완료 대진표 ${tournaments.length}개 기준 · ${groups.length}개 조</p>
      <div id="stats-group-ranking"></div>
      <div id="stats-group-members"></div>
    `;

    // 조별 순위 테이블
    this._renderGroupRankingTable(container.querySelector('#stats-group-ranking'), groupStats);

    // 조별 멤버 성적
    this._renderGroupMemberDetails(container.querySelector('#stats-group-members'), groups, groupMembers, playerAggregateByDay);
  },

  _renderGroupRankingTable(container, groupStats) {
    container.innerHTML = `
      <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-blue-50/30 border border-white/60 overflow-hidden mb-4">
        <div class="px-4 py-3 bg-gray-50/50 border-b border-gray-100">
          <span class="font-semibold text-gray-700 text-sm">조별 순위</span>
        </div>
        <div class="overflow-x-auto">
        <table class="w-full text-sm standings-table">
          <thead>
            <tr class="border-b border-gray-100 text-gray-500 text-xs">
              <th class="text-center px-2 py-2 w-10">#</th>
              <th class="text-left px-3 py-2">조</th>
              <th class="text-center px-2 py-2">인원</th>
              <th class="text-center px-2 py-2">경기</th>
              <th class="text-center px-2 py-2">승</th>
              <th class="text-center px-2 py-2">무</th>
              <th class="text-center px-2 py-2">패</th>
              <th class="text-center px-2 py-2">승점</th>
              <th class="text-center px-2 py-2">포인트</th>
            </tr>
          </thead>
          <tbody>
            ${groupStats.map((g, idx) => `
              <tr class="border-b border-gray-50 hover:bg-gray-50">
                <td class="text-center px-2 py-2 text-gray-500 font-bold">${idx + 1}</td>
                <td class="px-3 py-2 font-medium text-gray-800">${Results.escapeHtml(g.name)}</td>
                <td class="text-center px-2 py-2 text-gray-600">${g.memberCount}</td>
                <td class="text-center px-2 py-2 text-gray-600">${g.games}</td>
                <td class="text-center px-2 py-2 text-blue-700 font-medium">${g.wins}</td>
                <td class="text-center px-2 py-2 text-gray-500">${g.draws}</td>
                <td class="text-center px-2 py-2 text-red-500">${g.losses}</td>
                <td class="text-center px-2 py-2 text-orange-600 font-bold">${g.matchPoints}</td>
                <td class="text-center px-2 py-2 text-purple-600 font-medium">${g.scorePoints}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        </div>
      </div>`;
  },

  _renderGroupMemberDetails(container, groups, groupMembers, playerAggregateByDay) {
    const allPlayersData = Storage.getPlayers();

    container.innerHTML = groups.map(g => {
      const dayAgg = playerAggregateByDay[g.day] || {};
      const members = (groupMembers[g.id] || [])
        .map(name => ({ name, ...(dayAgg[name] || { games: 0, wins: 0, losses: 0, draws: 0, matchPoints: 0, scorePoints: 0 }) }))
        .filter(m => m.games > 0)
        .sort((a, b) => b.scorePoints - a.scorePoints || b.matchPoints - a.matchPoints || a.games - b.games);

      if (members.length === 0) return '';

      return `
      <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-blue-50/30 border border-white/60 overflow-hidden mb-3">
        <div class="px-4 py-3 bg-gray-50/50 border-b border-gray-100">
          <span class="font-semibold text-gray-700 text-sm">${Results.escapeHtml(g.name)}</span>
          <span class="text-xs text-gray-400 ml-2">${members.length}명</span>
        </div>
        <div class="overflow-x-auto">
        <table class="w-full text-sm standings-table">
          <thead>
            <tr class="border-b border-gray-100 text-gray-500 text-xs">
              <th class="text-left px-4 py-2">멤버</th>
              <th class="text-center px-2 py-2">경기</th>
              <th class="text-center px-2 py-2">승</th>
              <th class="text-center px-2 py-2">무</th>
              <th class="text-center px-2 py-2">패</th>
              <th class="text-center px-2 py-2">승점</th>
              <th class="text-center px-2 py-2">포인트</th>
            </tr>
          </thead>
          <tbody>
            ${members.map(s => {
              const pd = allPlayersData.find(p => p.name === s.name);
              const gb = genderBadge(pd?.gender);
              const isMe = RolesConfig.isMember() && App.getMemberName() && s.name === App.getMemberName();
              return '<tr class="border-b border-gray-50 hover:bg-gray-50' + (isMe ? ' bg-blue-50/60' : '') + '">' +
                '<td class="px-4 py-2 font-medium text-gray-800 whitespace-nowrap">' + Results.escapeHtml(s.name) + ' ' + gb + '</td>' +
                '<td class="text-center px-2 py-2 text-gray-600">' + s.games + '</td>' +
                '<td class="text-center px-2 py-2 text-blue-700 font-medium">' + s.wins + '</td>' +
                '<td class="text-center px-2 py-2 text-gray-500">' + s.draws + '</td>' +
                '<td class="text-center px-2 py-2 text-red-500">' + s.losses + '</td>' +
                '<td class="text-center px-2 py-2 text-orange-600 font-bold">' + s.matchPoints + '</td>' +
                '<td class="text-center px-2 py-2 text-purple-600 font-medium">' + s.scorePoints + '</td>' +
              '</tr>';
            }).join('')}
          </tbody>
        </table>
        </div>
      </div>`;
    }).join('');
  },

  _renderParticipationTable(container, statsData) {
    const allPlayersData = Storage.getPlayers();
    const filter = this._participationGenderFilter;
    const collapsed = this._participationCollapsed;

    const filteredData = filter === 'all'
      ? statsData
      : statsData.filter(s => {
          const pd = allPlayersData.find(p => p.name === s.name);
          return pd?.gender === filter;
        });

    const genderBtnCls = (g) => g === filter
      ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200';

    container.innerHTML = `
      <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-blue-50/30 border border-white/60 overflow-hidden mb-4">
        <div class="px-4 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between cursor-pointer stats-section-header">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-gray-700 text-sm">개인 순위</span>
            <div class="flex gap-1 stats-gender-btns" onclick="event.stopPropagation()">
              <button data-gender="all" class="stats-part-gender px-2 py-0.5 rounded-full text-xs font-medium transition ${genderBtnCls('all')}">전체</button>
              <button data-gender="M" class="stats-part-gender px-2 py-0.5 rounded-full text-xs font-medium transition ${genderBtnCls('M')}">남</button>
              <button data-gender="F" class="stats-part-gender px-2 py-0.5 rounded-full text-xs font-medium transition ${genderBtnCls('F')}">여</button>
            </div>
          </div>
          <svg class="w-5 h-5 text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
        ${collapsed ? '' : `<div class="overflow-x-auto">
        <table class="w-full text-sm standings-table">
          <thead>
            <tr class="border-b border-gray-100 text-gray-500 text-xs">
              <th class="text-center px-2 py-2 w-10">#</th>
              <th class="text-left px-3 py-2">멤버</th>
              <th class="text-center px-2 py-2">경기</th>
              <th class="text-center px-2 py-2">승</th>
              <th class="text-center px-2 py-2">무</th>
              <th class="text-center px-2 py-2">패</th>
              <th class="text-center px-2 py-2">승점</th>
              <th class="text-center px-2 py-2">포인트</th>
            </tr>
          </thead>
          <tbody>
            ${filteredData.length === 0
              ? '<tr><td colspan="8" class="text-center py-4 text-gray-400 text-sm">데이터가 없습니다</td></tr>'
              : filteredData.map((s, idx) => {
              const pd = allPlayersData.find(p => p.name === s.name);
              const gender = pd?.gender;
              const gb = genderBadge(gender);
              const isMe = RolesConfig.isMember() && App.getMemberName() && s.name === App.getMemberName();
              return `<tr class="border-b border-gray-50 hover:bg-gray-50 ${isMe ? 'bg-blue-50/60' : ''}">
                <td class="text-center px-2 py-2 text-gray-500 font-bold">${idx + 1}</td>
                <td class="px-3 py-2 font-medium whitespace-nowrap ${isMe ? 'text-blue-700' : 'text-gray-800'}">${Results.escapeHtml(s.name)} ${gb}</td>
                <td class="text-center px-2 py-2 text-gray-600">${s.games}</td>
                <td class="text-center px-2 py-2 text-blue-700 font-medium">${s.wins}</td>
                <td class="text-center px-2 py-2 text-gray-500">${s.draws}</td>
                <td class="text-center px-2 py-2 text-red-500">${s.losses}</td>
                <td class="text-center px-2 py-2 text-orange-600 font-bold">${s.matchPoints}</td>
                <td class="text-center px-2 py-2 text-purple-600 font-medium">${s.scorePoints}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        </div>`}
      </div>`;

    // 성별 필터 이벤트
    container.querySelectorAll('.stats-part-gender').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        this._participationGenderFilter = btn.dataset.gender;
        this._renderParticipationTable(container, statsData);
      };
    });
    // 접기/펼치기 이벤트
    const header = container.querySelector('.stats-section-header');
    if (header) {
      header.onclick = (e) => {
        if (e.target.closest('.stats-gender-btns')) return;
        this._participationCollapsed = !this._participationCollapsed;
        this._renderParticipationTable(container, statsData);
      };
    }
  },
};
