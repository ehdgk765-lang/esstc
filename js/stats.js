// stats.js - 통계 모듈
const Stats = {
  _viewMode: 'monthly',    // 'monthly' | 'total'
  _selectedMonth: null,

  render(container) {
    const tournaments = this._getCompletedScheduleTournaments();

    if (tournaments.length === 0) {
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

    const { groups, sortedKeys } = this._groupByMonth(tournaments);

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
      this._renderMonthlyView(statsContent, groups, sortedKeys);
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
          p.matchPoints === s.matchPoints && p.scorePoints === s.scorePoints
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
      b.games - a.games || b.wins - a.wins || b.matchPoints - a.matchPoints || b.scorePoints - a.scorePoints
    );
  },

  _formatMonthLabel(key) {
    if (key === 'unknown') return '날짜 미지정';
    const [y, m] = key.split('-');
    return `${y}년 ${parseInt(m)}월`;
  },

  _renderMonthlyView(container, groups, sortedKeys) {
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

    container.innerHTML = `
      <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-blue-50/30 border border-white/60 overflow-hidden mb-4">
        <div class="px-4 py-3 bg-gray-50/50 border-b border-gray-100">
          <span class="font-semibold text-gray-700 text-sm">메달 순위</span>
        </div>
        <table class="w-full text-sm standings-table">
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
            ${medalData.map((m, idx) => {
              const pd = allPlayersData.find(p => p.name === m.name);
              const gender = pd?.gender;
              const gb = genderBadge(gender);
              const isMe = RolesConfig.isMember() && App.getMemberName() && m.name === App.getMemberName();
              return `<tr class="border-b border-gray-50 hover:bg-gray-50 ${isMe ? 'bg-blue-50/60' : ''}">
                <td class="text-center px-2 py-2 text-gray-400 font-bold">${idx + 1}</td>
                <td class="px-3 py-2 font-medium ${isMe ? 'text-blue-700' : 'text-gray-800'}">${Results.escapeHtml(m.name)} ${gb}</td>
                <td class="text-center px-2 py-2 font-bold text-yellow-600">${m.gold || '-'}</td>
                <td class="text-center px-2 py-2 font-bold text-gray-400">${m.silver || '-'}</td>
                <td class="text-center px-2 py-2 font-bold text-orange-600">${m.bronze || '-'}</td>
                <td class="text-center px-2 py-2 font-bold text-blue-700">${m.total}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  },

  _renderParticipationTable(container, statsData) {
    const allPlayersData = Storage.getPlayers();

    container.innerHTML = `
      <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-blue-50/30 border border-white/60 overflow-hidden mb-4">
        <div class="px-4 py-3 bg-gray-50/50 border-b border-gray-100">
          <span class="font-semibold text-gray-700 text-sm">참여 순위</span>
        </div>
        <div class="overflow-x-auto">
        <table class="w-full text-sm standings-table">
          <thead>
            <tr class="border-b border-gray-100 text-gray-500 text-xs">
              <th class="text-center px-2 py-2 w-10">#</th>
              <th class="text-left px-3 py-2">멤버</th>
              <th class="text-center px-2 py-2">참여</th>
              <th class="text-center px-2 py-2">경기</th>
              <th class="text-center px-1 py-2">남복</th>
              <th class="text-center px-1 py-2">여복</th>
              <th class="text-center px-1 py-2">혼복</th>
              <th class="text-center px-1 py-2">잡복</th>
              <th class="text-center px-1 py-2">남단</th>
              <th class="text-center px-1 py-2">여단</th>
            </tr>
          </thead>
          <tbody>
            ${statsData.map((s, idx) => {
              const pd = allPlayersData.find(p => p.name === s.name);
              const gender = pd?.gender;
              const gb = genderBadge(gender);
              const isMe = RolesConfig.isMember() && App.getMemberName() && s.name === App.getMemberName();
              return `<tr class="border-b border-gray-50 hover:bg-gray-50 ${isMe ? 'bg-blue-50/60' : ''}">
                <td class="text-center px-2 py-2 text-gray-400 font-bold">${idx + 1}</td>
                <td class="px-3 py-2 font-medium whitespace-nowrap ${isMe ? 'text-blue-700' : 'text-gray-800'}">${Results.escapeHtml(s.name)} ${gb}</td>
                <td class="text-center px-2 py-2 text-gray-600">${s.tournamentCount}</td>
                <td class="text-center px-2 py-2 text-gray-600">${s.games}</td>
                <td class="text-center px-1 py-2 text-blue-600">${s.md || 0}</td>
                <td class="text-center px-1 py-2 text-pink-600">${s.wd || 0}</td>
                <td class="text-center px-1 py-2 text-purple-600">${s.xd || 0}</td>
                <td class="text-center px-1 py-2 text-orange-600">${s.fd || 0}</td>
                <td class="text-center px-1 py-2 text-blue-600">${s.ms || 0}</td>
                <td class="text-center px-1 py-2 text-pink-600">${s.ws || 0}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        </div>
      </div>`;
  },
};
