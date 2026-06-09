// schedule.js - 시간/코트 기반 대진표 생성 + 렌더링

const Schedule = {
  // 시간 슬롯 계산 (30분 단위)
  calculateTimeSlots(startTime, endTime) {
    const slots = [];
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let current = sh * 60 + sm;
    const end = eh * 60 + em;

    while (current + 30 <= end) {
      const h = Math.floor(current / 60);
      const m = current % 60;
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      current += 30;
    }
    return slots;
  },

  // 가용 멤버로 가능한 게임 타입 확인
  getPossibleTypes(availMales, availFemales, allowMixed, isSingles) {
    const types = [];
    if (isSingles) {
      if (availMales.length >= 2) types.push('MS');
      if (availFemales.length >= 2) types.push('WS');
      if (allowMixed && (availMales.length + availFemales.length) >= 2) types.push('FS');
    } else {
      if (availMales.length >= 2 && availFemales.length >= 2) types.push('XD');
      if (availMales.length >= 4) types.push('MD');
      if (availFemales.length >= 4) types.push('WD');
      if (allowMixed && (availMales.length + availFemales.length) >= 4) types.push('FD');
    }
    return types;
  },

  // 배열 셔플 (Fisher-Yates)
  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  // NTRP 맵 생성 (이름 → NTRP)
  buildNtrpMap() {
    const map = {};
    Storage.getPlayers().forEach(p => { map[p.name] = p.ntrp || 2.5; });
    return map;
  },

  // 팀 키 생성 (이름 정렬하여 고유 키)
  teamKey(a, b) {
    return [a, b].sort().join('|');
  },

  // usedTeams에 팀 등록
  recordTeam(usedTeams, t) {
    const key = this.teamKey(t[0], t[1]);
    usedTeams.set(key, (usedTeams.get(key) || 0) + 1);
  },

  // 4명을 NTRP 균형 + 중복 팀 최소화로 2팀 분배
  balancedPair(players, ntrpMap, usedTeams) {
    if (players.length !== 4) return [players.slice(0, 2), players.slice(2)];
    const [a, b, c, d] = players;
    const n = [ntrpMap[a] || 2.5, ntrpMap[b] || 2.5, ntrpMap[c] || 2.5, ntrpMap[d] || 2.5];

    const pairings = [
      { t1: [a, b], t2: [c, d], diff: Math.abs((n[0] + n[1]) - (n[2] + n[3])) },
      { t1: [a, c], t2: [b, d], diff: Math.abs((n[0] + n[2]) - (n[1] + n[3])) },
      { t1: [a, d], t2: [b, c], diff: Math.abs((n[0] + n[3]) - (n[1] + n[2])) },
    ];

    // 중복 팀 페널티 (중복 회피 우선, NTRP는 보조)
    pairings.forEach(p => {
      const dup1 = usedTeams.get(this.teamKey(p.t1[0], p.t1[1])) || 0;
      const dup2 = usedTeams.get(this.teamKey(p.t2[0], p.t2[1])) || 0;
      p.score = (dup1 + dup2) * 100 + p.diff;
    });

    pairings.sort((x, y) => x.score - y.score);
    const bestScore = pairings[0].score;
    const best = pairings.filter(p => p.score === bestScore);
    const chosen = best[Math.floor(Math.random() * best.length)];
    return [chosen.t1, chosen.t2];
  },

  // XD(혼합복식)용 NTRP 균형 + 중복 최소화 페어링
  balancedPairXD(males, females, ntrpMap, usedTeams) {
    const [m1, m2] = males;
    const [f1, f2] = females;
    const nm1 = ntrpMap[m1] || 2.5, nm2 = ntrpMap[m2] || 2.5;
    const nf1 = ntrpMap[f1] || 2.5, nf2 = ntrpMap[f2] || 2.5;

    const pairings = [
      { t1: [m1, f1], t2: [m2, f2], diff: Math.abs((nm1 + nf1) - (nm2 + nf2)) },
      { t1: [m1, f2], t2: [m2, f1], diff: Math.abs((nm1 + nf2) - (nm2 + nf1)) },
    ];

    pairings.forEach(p => {
      const dup1 = usedTeams.get(this.teamKey(p.t1[0], p.t1[1])) || 0;
      const dup2 = usedTeams.get(this.teamKey(p.t2[0], p.t2[1])) || 0;
      p.score = (dup1 + dup2) * 100 + p.diff;
    });

    pairings.sort((x, y) => x.score - y.score);
    const bestScore = pairings[0].score;
    const best = pairings.filter(p => p.score === bestScore);
    const chosen = best[Math.floor(Math.random() * best.length)];
    return [chosen.t1, chosen.t2];
  },

  // 게임 수 기준 정렬 (동점자는 셔플)
  sortByCountShuffled(players, gameCounts) {
    const shuffled = this.shuffle([...players]);
    shuffled.sort((a, b) => (gameCounts[a] || 0) - (gameCounts[b] || 0));
    return shuffled;
  },

  // N개 코트에 대한 모든 게임 타입 조합 생성
  generatePlans(numCourts, allowMixed, isSingles) {
    let types;
    if (isSingles) {
      types = allowMixed ? ['MS', 'WS', 'FS'] : ['MS', 'WS'];
    } else {
      types = allowMixed ? ['XD', 'MD', 'WD', 'FD'] : ['XD', 'MD', 'WD'];
    }
    if (numCourts === 0) return [[]];
    const result = [];
    const sub = this.generatePlans(numCourts - 1, allowMixed, isSingles);
    for (const t of types) {
      for (const s of sub) {
        result.push([t, ...s]);
      }
    }
    return result;
  },

  // 플랜이 멤버 수로 실행 가능한지 확인
  isPlanValid(plan, maleCount, femaleCount) {
    let needM = 0, needF = 0, needAny = 0;
    for (const type of plan) {
      const cfg = SCHEDULE_GAME_TYPES[type];
      needM += cfg.needM;
      needF += cfg.needF;
      if (cfg.needAny) needAny += cfg.needAny;
    }
    const remainM = maleCount - needM;
    const remainF = femaleCount - needF;
    return remainM >= 0 && remainF >= 0 && (remainM + remainF) >= needAny;
  },

  // 한 타임슬롯의 매치 생성 (플랜 기반)
  generateSlotMatches(males, females, courts, gameCounts, allowMixed, usedTeams, isSingles) {
    // 코트를 최대한 채우는 유효한 플랜 찾기
    let validPlans = [];
    for (let n = courts; n >= 1; n--) {
      const plans = this.generatePlans(n, allowMixed, isSingles);
      validPlans = plans.filter(p => this.isPlanValid(p, males.length, females.length));
      if (validPlans.length > 0) break;
    }

    if (validPlans.length === 0) return [];

    // 유효한 플랜 중 랜덤 선택
    const plan = validPlans[Math.floor(Math.random() * validPlans.length)];

    // NTRP 맵 + 가용 멤버 정렬: 경기 수 적은 순 (동점 셔플)
    const ntrpMap = this.buildNtrpMap();
    let availM = this.sortByCountShuffled(males, gameCounts);
    let availF = this.sortByCountShuffled(females, gameCounts);

    const matches = [];

    // 성별 지정 타입 먼저, 섞어(FD/FS)는 나중에 처리
    const orderedPlan = plan.map((gameType, idx) => ({ gameType, court: idx + 1 }));
    orderedPlan.sort((a, b) => ((a.gameType === 'FD' || a.gameType === 'FS') ? 1 : 0) - ((b.gameType === 'FD' || b.gameType === 'FS') ? 1 : 0));

    orderedPlan.forEach(({ gameType, court }) => {
      let team1, team2;
      let displayType = gameType;

      if (gameType === 'FS') {
        // 섞어단식: 성별 무관, 남은 전체 풀에서 2명 선택
        let allAvail = this.sortByCountShuffled([...availM, ...availF], gameCounts);
        const picked = allAvail.slice(0, 2);
        picked.forEach(p => {
          let idx = availM.indexOf(p);
          if (idx >= 0) { availM.splice(idx, 1); return; }
          idx = availF.indexOf(p);
          if (idx >= 0) availF.splice(idx, 1);
        });
        team1 = [picked[0]];
        team2 = [picked[1]];
        picked.forEach(p => gameCounts[p]++);

        const mCount = picked.filter(p => males.includes(p)).length;
        if (mCount === 2) displayType = 'MS';
        else if (mCount === 0) displayType = 'WS';
      } else if (gameType === 'MS') {
        const picked = availM.splice(0, 2);
        team1 = [picked[0]];
        team2 = [picked[1]];
        picked.forEach(p => gameCounts[p]++);
      } else if (gameType === 'WS') {
        const picked = availF.splice(0, 2);
        team1 = [picked[0]];
        team2 = [picked[1]];
        picked.forEach(p => gameCounts[p]++);
      } else if (gameType === 'FD') {
        // 섞어복식: 성별 무관, 남은 전체 풀에서 4명 선택
        let allAvail = this.sortByCountShuffled([...availM, ...availF], gameCounts);
        const picked = allAvail.slice(0, 4);
        picked.forEach(p => {
          let idx = availM.indexOf(p);
          if (idx >= 0) { availM.splice(idx, 1); return; }
          idx = availF.indexOf(p);
          if (idx >= 0) availF.splice(idx, 1);
        });
        [team1, team2] = this.balancedPair(picked, ntrpMap, usedTeams);
        picked.forEach(p => gameCounts[p]++);

        // 실제 성별 구성에 따라 표시 타입 결정
        const mCount = picked.filter(p => males.includes(p)).length;
        if (mCount === 4) displayType = 'MD';
        else if (mCount === 0) displayType = 'WD';
      } else if (gameType === 'XD') {
        const mPicked = availM.splice(0, 2);
        const fPicked = availF.splice(0, 2);
        [team1, team2] = this.balancedPairXD(mPicked, fPicked, ntrpMap, usedTeams);
        [...mPicked, ...fPicked].forEach(p => gameCounts[p]++);
      } else if (gameType === 'MD') {
        const picked = availM.splice(0, 4);
        [team1, team2] = this.balancedPair(picked, ntrpMap, usedTeams);
        picked.forEach(p => gameCounts[p]++);
      } else {
        const picked = availF.splice(0, 4);
        [team1, team2] = this.balancedPair(picked, ntrpMap, usedTeams);
        picked.forEach(p => gameCounts[p]++);
      }

      // 사용된 팀 기록 (복식만)
      if (team1.length >= 2) this.recordTeam(usedTeams, team1);
      if (team2.length >= 2) this.recordTeam(usedTeams, team2);

      matches.push({
        id: Storage.generateId(),
        court,
        gameType: displayType,
        gameTypeLabel: SCHEDULE_GAME_TYPES[displayType].label,
        player1: team1.join(' / '),
        player2: team2.join(' / '),
        scores: null,
        winner: null,
      });
    });

    return matches;
  },

  // 대진표 생성
  generate(males, females, courts, startTime, endTime, allowMixed, isSingles) {
    const slots = this.calculateTimeSlots(startTime, endTime);
    const gameCounts = {};
    [...males, ...females].forEach(p => { gameCounts[p] = 0; });
    const usedTeams = new Map(); // 팀키 → 횟수

    const timeSlots = slots.map(time => {
      const matches = this.generateSlotMatches(males, females, courts, gameCounts, allowMixed, usedTeams, isSingles);
      return { time, matches };
    });

    return timeSlots;
  },

  // 전체 매치 목록 추출
  getAllMatches(tournament) {
    const matches = [];
    for (const slot of tournament.timeSlots) {
      for (const m of slot.matches) {
        matches.push(m);
      }
    }
    return matches;
  },

  // 멤버별 통계 계산
  calcPlayerStats(tournament) {
    const stats = {};
    const ensure = (p) => { if (!stats[p]) stats[p] = { name: p, games: 0, wins: 0, losses: 0, draws: 0, matchPoints: 0, scorePoints: 0 }; };

    for (const slot of tournament.timeSlots) {
      for (const m of slot.matches) {
        const t1 = m.player1.split(' / ');
        const t2 = m.player2.split(' / ');
        [...t1, ...t2].forEach(p => {
          ensure(p);
          stats[p].games++;
        });
        if (m.winner === 'draw') {
          [...t1, ...t2].forEach(p => { if (stats[p]) stats[p].draws++; });
        } else if (m.winner) {
          const winners = m.winner.split(' / ');
          const losers = m.winner === m.player1 ? t2 : t1;
          winners.forEach(p => { if (stats[p]) stats[p].wins++; });
          losers.forEach(p => { if (stats[p]) stats[p].losses++; });
        }
        // 포인트: 각 세트 스코어 합산 (득점)
        if (m.scores && m.scores.length > 0) {
          let t1Pts = 0, t2Pts = 0;
          m.scores.forEach(([s1, s2]) => { t1Pts += s1; t2Pts += s2; });
          t1.forEach(p => { if (stats[p]) stats[p].scorePoints += t1Pts; });
          t2.forEach(p => { if (stats[p]) stats[p].scorePoints += t2Pts; });
        }
      }
    }

    // 승점 계산: 승=3, 무=1, 패=0
    Object.values(stats).forEach(s => {
      s.matchPoints = s.wins * 3 + s.draws * 1;
    });

    return Object.values(stats).sort((a, b) => b.matchPoints - a.matchPoints || b.scorePoints - a.scorePoints || b.wins - a.wins || b.games - a.games);
  },

  // 팀별 통계 계산
  calcTeamStats(tournament) {
    const teamMap = buildTeamMap();

    const stats = {};
    const ensureTeam = (name) => {
      if (!name) return;
      if (!stats[name]) stats[name] = { name, games: 0, wins: 0, losses: 0, draws: 0, matchPoints: 0, scorePoints: 0 };
    };

    for (const slot of tournament.timeSlots) {
      for (const m of slot.matches) {
        if (!m.player1 || !m.player2) continue;
        const t1Names = m.player1.split(' / ');
        const t2Names = m.player2.split(' / ');

        // 매치의 각 side에서 팀 결정 (첫 번째 매핑된 멤버 기준)
        const team1 = t1Names.map(n => teamMap[n]).find(Boolean) || null;
        const team2 = t2Names.map(n => teamMap[n]).find(Boolean) || null;

        if (team1) { ensureTeam(team1); stats[team1].games++; }
        if (team2) { ensureTeam(team2); stats[team2].games++; }

        if (m.winner === 'draw') {
          if (team1) stats[team1].draws++;
          if (team2) stats[team2].draws++;
        } else if (m.winner) {
          const winnerNames = m.winner.split(' / ');
          const winTeam = winnerNames.map(n => teamMap[n]).find(Boolean) || null;
          const loseTeam = winTeam === team1 ? team2 : team1;
          if (winTeam && stats[winTeam]) stats[winTeam].wins++;
          if (loseTeam && stats[loseTeam]) stats[loseTeam].losses++;
        }

        if (m.scores && m.scores.length > 0) {
          let t1Pts = 0, t2Pts = 0;
          m.scores.forEach(([s1, s2]) => { t1Pts += s1; t2Pts += s2; });
          if (team1 && stats[team1]) stats[team1].scorePoints += t1Pts;
          if (team2 && stats[team2]) stats[team2].scorePoints += t2Pts;
        }
      }
    }

    Object.values(stats).forEach(s => {
      s.matchPoints = s.wins * 3 + s.draws * 1;
    });

    return Object.values(stats).sort((a, b) => b.matchPoints - a.matchPoints || b.scorePoints - a.scorePoints || b.wins - a.wins || b.games - a.games);
  },

  // 대진표 렌더링
  render(container, tournament) {
    this._tournament = tournament;

    // 코트 수에 따라 메인 컨테이너 너비 확장
    const mainEl = document.getElementById('main-content');
    if (mainEl) {
      mainEl.classList.remove('max-w-5xl', 'max-w-6xl', 'max-w-7xl');
      if (tournament.courts >= 7) mainEl.classList.replace('max-w-4xl', 'max-w-7xl');
      else if (tournament.courts >= 5) mainEl.classList.replace('max-w-4xl', 'max-w-6xl');
    }
    const allMatches = this.getAllMatches(tournament);
    const totalMatches = allMatches.length;
    const completedMatches = allMatches.filter(m => m.winner || m.scores).length;
    const playerStats = this.calcPlayerStats(tournament);
    const isComplete = totalMatches > 0 && totalMatches === completedMatches;

    // 동적 인원 계산 (매치 데이터 기반)
    const allPlayersData = Storage.getPlayers();
    const uniqueNames = new Set();
    allMatches.forEach(m => {
      m.player1.split(' / ').forEach(n => uniqueNames.add(n));
      m.player2.split(' / ').forEach(n => uniqueNames.add(n));
    });
    let maleCount = 0, femaleCount = 0, unknownCount = 0;
    uniqueNames.forEach(name => {
      const pd = allPlayersData.find(p => p.name === name);
      if (pd?.gender === 'M') maleCount++;
      else if (pd?.gender === 'F') femaleCount++;
      else unknownCount++;
    });
    const playerInfo = unknownCount > 0
      ? `${uniqueNames.size}명 (남${maleCount} 여${femaleCount} 기타${unknownCount})`
      : `남${maleCount} 여${femaleCount}`;
    const maxCourts = Math.max(tournament.courts, ...tournament.timeSlots.map(s => s.matches.length));

    patchDOM(container, `
      <div>
        <div id="schedule-header" class="mb-4 pb-1">
          <div class="flex items-start justify-between gap-2">
            <h3 id="schedule-title" class="text-xl font-bold text-gray-800 cursor-pointer hover:text-green-700 transition flex-1 min-w-0" title="클릭하여 이름 수정">${Results.escapeHtml(tournament.name)} <svg class="w-3.5 h-3.5 inline-block text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></h3>
            <span class="text-sm font-medium whitespace-nowrap flex-shrink-0 ${isComplete ? 'text-green-700' : 'text-orange-600'}">
              ${completedMatches}/${totalMatches} 완료
            </span>
          </div>
          <p class="text-sm text-gray-500 mt-1">
            ${tournament.isCustom ? '' : `${tournament.startTime} ~ ${tournament.endTime} · `}코트 ${maxCourts}면 · ${playerInfo}
          </p>
          <div class="flex items-center gap-2 mt-3">
            <button id="pdf-download-btn" class="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition font-medium flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              PDF
            </button>
          </div>
        </div>

        ${isComplete && tournament.isTeamMode ? (() => {
          const teamStats = this.calcTeamStats(tournament);
          return teamStats.length > 0 ? `
            <div class="bg-gradient-to-r from-yellow-50 to-yellow-100 border border-yellow-200 rounded-2xl p-4 mb-6 text-center">
              <div class="text-yellow-600 text-sm font-medium mb-1">우승 팀</div>
              <div class="text-2xl font-bold text-yellow-800">${Results.escapeHtml(teamStats[0].name)}</div>
              <div class="text-sm text-yellow-700 mt-1">승점 ${teamStats[0].matchPoints} · 포인트 ${teamStats[0].scorePoints}</div>
            </div>` : '';
        })() : ''}

        <!-- 시간표 -->
        <div class="space-y-4 mb-6">
          ${tournament.isCustom ? this._renderCourtLayout(tournament) : (() => {
            const courtCount = tournament.courts;
            const gridCols = courtCount <= 1 ? 'grid-cols-1' : `grid-cols-2${courtCount > 2 ? ` sm:grid-cols-${courtCount}` : ''}`;
            return tournament.timeSlots.map((slot, si) => {
              const courtMap = {};
              for (let c = 1; c <= courtCount; c++) courtMap[c] = [];
              slot.matches.forEach((match, mi) => {
                const c = match.court || 1;
                if (c >= 1 && c <= courtCount) courtMap[c].push({ match, mi });
              });
              return `
              <div class="schedule-slot" data-slot="${si}">
                <div class="flex items-center gap-2 mb-2">
                  <span class="slot-drag-handle cursor-pointer text-gray-300 flex-shrink-0" data-slot-idx="${si}" style="display:none">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h10M7 16h10"/></svg>
                  </span>
                  <span class="text-sm font-bold text-gray-700 bg-gray-100 px-3 py-1 rounded-full">${slot.time}</span>
                  <div class="flex-1 border-t border-gray-200"></div>
                </div>
                <div class="grid gap-3 ${gridCols}">
                  ${Array.from({length: courtCount}, (_, ci) => {
                    const c = ci + 1;
                    const items = courtMap[c];
                    return `<div>
                      <div class="text-xs font-semibold text-gray-500 mb-1 pl-1">코트 ${c}</div>
                      ${items.length > 0
                        ? `<div class="space-y-2">
                            ${items.map(item => this.renderMatchCard(item.match, si, item.mi)).join('')}
                            <button type="button" class="slot-add-extra-btn w-full py-1.5 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-green-400 hover:text-green-700 hover:bg-green-50/50 transition flex items-center justify-center gap-1" data-slot-idx="${si}" data-court="${c}" style="display:none">
                              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                              코트${c}
                            </button>
                          </div>`
                        : `<button type="button" class="slot-add-match-btn w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-green-400 hover:text-green-700 hover:bg-green-50/50 transition flex items-center justify-center gap-1" data-slot-idx="${si}" data-court="${c}" style="display:none">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                            대진 추가
                          </button>`}
                    </div>`;
                  }).join('')}
                </div>
              </div>`;
            }).join('');
          })()}
        </div>

        ${tournament.isTeamMode ? (() => {
          const teamStats = this.calcTeamStats(tournament);
          const medalPos = ['0%', '50%', '100%'];
          return `
          <!-- 팀별 통계 -->
          <div id="stats-section" class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-green-50/30 border border-white/60 overflow-hidden mb-4">
            <div class="px-4 py-3 bg-gray-50/50 border-b border-gray-100">
              <span class="font-semibold text-gray-700 text-sm">팀별 통계</span>
            </div>
            <table class="w-full text-sm standings-table">
              <thead>
                <tr class="border-b border-gray-100 text-gray-500 text-xs">
                  <th class="text-left px-4 py-2">팀</th>
                  <th class="text-center px-2 py-2">경기</th>
                  <th class="text-center px-2 py-2">승</th>
                  <th class="text-center px-2 py-2">무</th>
                  <th class="text-center px-2 py-2">패</th>
                  <th class="text-center px-2 py-2">승점</th>
                  <th class="text-center px-2 py-2">포인트</th>
                </tr>
              </thead>
              <tbody>
                ${teamStats.map((s, idx) => {
                  const rank = teamStats.findIndex(p => p.matchPoints === s.matchPoints && p.scorePoints === s.scorePoints);
                  const medalHtml = isComplete && rank < 3 ? '<span style="display:inline-block;width:22px;height:26px;background:url(css/medal.png) no-repeat;background-size:300% auto;background-position:' + medalPos[rank] + ' center;vertical-align:middle;margin-right:2px;"></span>' : '';
                  return '<tr class="border-b border-gray-50 hover:bg-gray-50' + (isComplete && rank < 3 ? ' bg-gradient-to-r' + (rank === 0 ? ' from-yellow-50/60' : rank === 1 ? ' from-gray-50/60' : ' from-orange-50/60') + ' to-transparent' : '') + '">' +
                    '<td class="px-4 py-2 font-medium text-gray-800">' + medalHtml + Results.escapeHtml(s.name) + '</td>' +
                    '<td class="text-center px-2 py-2 text-gray-600">' + s.games + '</td>' +
                    '<td class="text-center px-2 py-2 text-green-700 font-medium">' + s.wins + '</td>' +
                    '<td class="text-center px-2 py-2 text-gray-500">' + s.draws + '</td>' +
                    '<td class="text-center px-2 py-2 text-red-500">' + s.losses + '</td>' +
                    '<td class="text-center px-2 py-2 text-orange-600 font-bold">' + s.matchPoints + '</td>' +
                    '<td class="text-center px-2 py-2 text-purple-600 font-medium">' + s.scorePoints + '</td>' +
                  '</tr>';
                }).join('')}
              </tbody>
            </table>
          </div>
          <!-- 멤버별 통계 -->
          <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-green-50/30 border border-white/60 overflow-hidden">
            <div class="px-4 py-3 bg-gray-50/50 border-b border-gray-100">
              <span class="font-semibold text-gray-700 text-sm">멤버별 통계</span>
            </div>
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
                ${(() => { const allPlayersData = Storage.getPlayers(); const medalPos = ['0%', '50%', '100%']; return playerStats.map((s) => {
                  const pd = allPlayersData.find(pl => pl.name === s.name);
                  const gender = pd?.gender;
                  const teamName = (() => { const teams = Storage.getTeams(); for (const t of teams) { if ((t.members || []).includes(s.name)) return t.name; } return ''; })();
                  const rank = playerStats.findIndex(p => p.matchPoints === s.matchPoints && p.scorePoints === s.scorePoints);
                  const medalHtml = isComplete && rank < 3 ? '<span style="display:inline-block;width:22px;height:26px;background:url(\'css/medal.png\') no-repeat;background-size:300% auto;background-position:' + medalPos[rank] + ' center;vertical-align:middle;margin-right:2px;"></span>' : '';
                  return '<tr class="border-b border-gray-50 hover:bg-gray-50' + (isComplete && rank < 3 ? ' bg-gradient-to-r' + (rank === 0 ? ' from-yellow-50/60' : rank === 1 ? ' from-gray-50/60' : ' from-orange-50/60') + ' to-transparent' : '') + '">' +
                    '<td class="px-4 py-2 font-medium text-gray-800">' + medalHtml + Results.escapeHtml(s.name) +
                      ' ' + genderBadge(gender) +
                      (teamName ? ' <span class="text-xs px-1 py-0.5 rounded font-medium bg-green-50 text-green-700 border border-green-200">' + Results.escapeHtml(teamName) + '</span>' : '') +
                    '</td>' +
                    '<td class="text-center px-2 py-2 text-gray-600">' + s.games + '</td>' +
                    '<td class="text-center px-2 py-2 text-green-700 font-medium">' + s.wins + '</td>' +
                    '<td class="text-center px-2 py-2 text-gray-500">' + s.draws + '</td>' +
                    '<td class="text-center px-2 py-2 text-red-500">' + s.losses + '</td>' +
                    '<td class="text-center px-2 py-2 text-orange-600 font-bold">' + s.matchPoints + '</td>' +
                    '<td class="text-center px-2 py-2 text-purple-600 font-medium">' + s.scorePoints + '</td>' +
                  '</tr>';
                }).join(''); })()}
              </tbody>
            </table>
          </div>`;
        })() : `
        <!-- 멤버별 통계 -->
        <div id="stats-section" class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-green-50/30 border border-white/60 overflow-hidden">
          <div class="px-4 py-3 bg-gray-50/50 border-b border-gray-100">
            <span class="font-semibold text-gray-700 text-sm">멤버별 통계</span>
          </div>
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
              ${(() => { const allPlayersData = Storage.getPlayers(); return playerStats.map((s, idx) => {
                const pd = allPlayersData.find(pl => pl.name === s.name);
                const gender = pd?.gender;
                const ntrp = pd?.ntrp || 2.5;
                const medalPos = ['0%', '50%', '100%'];
                const rank = playerStats.findIndex(p => p.matchPoints === s.matchPoints && p.scorePoints === s.scorePoints);
                const medalHtml = isComplete && rank < 3 ? '<span style="display:inline-block;width:22px;height:26px;background:url(\'css/medal.png\') no-repeat;background-size:300% auto;background-position:' + medalPos[rank] + ' center;vertical-align:middle;margin-right:2px;"></span>' : '';
                return '<tr class="border-b border-gray-50 hover:bg-gray-50' + (isComplete && rank < 3 ? ' bg-gradient-to-r' + (rank === 0 ? ' from-yellow-50/60' : rank === 1 ? ' from-gray-50/60' : ' from-orange-50/60') + ' to-transparent' : '') + '">' +
                  '<td class="px-4 py-2 font-medium text-gray-800">' +
                    medalHtml + Results.escapeHtml(s.name) +
                    ' ' + genderBadge(gender) +
                    (RolesConfig.isMember() ? '' : ' <span class="text-xs px-1 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">' + ntrp.toFixed(1) + '</span>') +
                  '</td>' +
                  '<td class="text-center px-2 py-2 text-gray-600">' + s.games + '</td>' +
                  '<td class="text-center px-2 py-2 text-green-700 font-medium">' + s.wins + '</td>' +
                  '<td class="text-center px-2 py-2 text-gray-500">' + s.draws + '</td>' +
                  '<td class="text-center px-2 py-2 text-red-500">' + s.losses + '</td>' +
                  '<td class="text-center px-2 py-2 text-orange-600 font-bold">' + s.matchPoints + '</td>' +
                  '<td class="text-center px-2 py-2 text-purple-600 font-medium">' + s.scorePoints + '</td>' +
                '</tr>';
              }).join(''); })()}
            </tbody>
          </table>
        </div>`}
      </div>`);

    // 게스트 모드: 수정 UI 숨기기 (스코어 입력만 허용)
    if (RolesConfig.isMember()) {
      container.querySelectorAll('#add-match-btn, .delete-match-btn, .court-add-match-btn, #pdf-download-btn').forEach(el => el.style.display = 'none');
      const titleEl = container.querySelector('#schedule-title');
      if (titleEl) titleEl.style.cursor = 'default';
    }

    // PDF 다운로드
    const pdfBtn = container.querySelector('#pdf-download-btn');
    if (pdfBtn) {
      pdfBtn.onclick = () => this.exportPDF(container, tournament);
    }

    if (!RolesConfig.isMember()) {
      // 슬롯별 대진 추가 버튼 - 빈 코트 자리 (시간/코트 모드)
      container.querySelectorAll('.slot-add-match-btn').forEach(btn => {
        btn.style.display = '';
        btn.onclick = () => {
          const slotIdx = parseInt(btn.dataset.slotIdx);
          const court = parseInt(btn.dataset.court);
          this.showAddMatchModal(container, tournament, court, slotIdx);
        };
      });

      // 슬롯별 하단 코트별 대진 추가 버튼 (시간/코트 모드) - 해당 코트에 대진이 있을 때만 표시
      container.querySelectorAll('.slot-add-extra-btn').forEach(btn => {
        const slotIdx = parseInt(btn.dataset.slotIdx);
        const court = parseInt(btn.dataset.court);
        const slotMatches = tournament.timeSlots[slotIdx]?.matches || [];
        const hasCourt = slotMatches.some(m => m.court === court);
        if (hasCourt) {
          btn.style.display = '';
        }
        btn.onclick = () => {
          this.showAddMatchModal(container, tournament, court, slotIdx);
        };
      });

      // 코트별 대진 추가 버튼 (커스텀 모드)
      container.querySelectorAll('.court-add-match-btn').forEach(btn => {
        btn.onclick = () => {
          const court = parseInt(btn.dataset.court);
          this.showAddMatchModal(container, tournament, court);
        };
      });

      // 대진표 이름 수정
      const titleEl = container.querySelector('#schedule-title');
      if (titleEl) {
        titleEl.onclick = async () => {
          const newName = prompt('대진표 이름을 입력하세요', tournament.name);
          if (newName !== null && newName.trim() !== '') {
            tournament.name = newName.trim();
            await Storage.updateTournament(tournament);
            this.render(container, tournament);
          }
        };
      }
    }

    // ─── 멤버 탭-교환 + 매치 카드 드래그 ───
    const cards = container.querySelectorAll('.schedule-match-card');
    let selectedPlayer = null;

    // 멤버 이름 탭 → 선택/교환 (관리자만)
    container.querySelectorAll('.swap-player').forEach(el => {
      if (RolesConfig.isMember()) { el.style.cursor = 'default'; return; }
      el.onclick = async (e) => {
        e.stopPropagation(); // 카드 클릭(스코어) 방지

        const data = {
          slotIdx: +el.dataset.slotIdx, matchIdx: +el.dataset.matchIdx,
          team: +el.dataset.team, pos: +el.dataset.pos, name: el.dataset.name
        };

        if (!selectedPlayer) {
          // 첫 번째 멤버 선택
          selectedPlayer = { el, ...data };
          el.classList.add('bg-green-200', 'ring-2', 'ring-green-700', 'rounded');
          // 교체 버튼 삽입 (카드 위 absolute)
          const card = el.closest('.schedule-match-card');
          if (card) {
            const replaceBtn = document.createElement('button');
            replaceBtn.className = 'replace-player-btn absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 text-xs bg-blue-500 text-white rounded-full hover:bg-blue-600 shadow-md transition z-10';
            replaceBtn.textContent = '교체';
            replaceBtn.onclick = (ev) => {
              ev.stopPropagation();
              this._showReplacePlayerPicker(container, tournament, selectedPlayer, () => {
                if (selectedPlayer) {
                  selectedPlayer.el.classList.remove('bg-green-200', 'ring-2', 'ring-green-700', 'rounded');
                }
                container.querySelectorAll('.replace-player-btn').forEach(b => b.remove());
                selectedPlayer = null;
              });
            };
            card.appendChild(replaceBtn);
          }
        } else if (selectedPlayer.slotIdx === data.slotIdx && selectedPlayer.matchIdx === data.matchIdx
          && selectedPlayer.team === data.team && selectedPlayer.pos === data.pos) {
          // 같은 멤버 재탭 → 선택 해제
          selectedPlayer.el.classList.remove('bg-green-200', 'ring-2', 'ring-green-700', 'rounded');
          container.querySelectorAll('.replace-player-btn').forEach(b => b.remove());
          selectedPlayer = null;
        } else {
          // 두 번째 멤버 탭 → 교환
          const src = selectedPlayer, tgt = data;
          const srcMatch = tournament.timeSlots[src.slotIdx].matches[src.matchIdx];
          const tgtMatch = tournament.timeSlots[tgt.slotIdx].matches[tgt.matchIdx];
          const srcKey = src.team === 1 ? 'player1' : 'player2';
          const tgtKey = tgt.team === 1 ? 'player1' : 'player2';
          const sameMatch = src.slotIdx === tgt.slotIdx && src.matchIdx === tgt.matchIdx;

          const clearSel = () => {
            selectedPlayer.el.classList.remove('bg-green-200', 'ring-2', 'ring-green-700', 'rounded');
            container.querySelectorAll('.replace-player-btn').forEach(b => b.remove());
            selectedPlayer = null;
          };

          if (sameMatch && srcKey === tgtKey) {
            // 같은 팀 내 순서 변경 - 중복 불가
            const team = srcMatch[srcKey].split(' / ');
            [team[src.pos], team[tgt.pos]] = [team[tgt.pos], team[src.pos]];
            srcMatch[srcKey] = team.join(' / ');
          } else if (sameMatch) {
            // 같은 매치, 다른 팀 간 교환
            const t1 = srcMatch[srcKey].split(' / ');
            const t2 = srcMatch[tgtKey].split(' / ');
            [t1[src.pos], t2[tgt.pos]] = [t2[tgt.pos], t1[src.pos]];
            const all = [...t1, ...t2];
            if (new Set(all).size !== all.length) {
              alert('같은 멤버가 동일 경기에 중복됩니다.');
              clearSel();
              return;
            }
            srcMatch[srcKey] = t1.join(' / ');
            srcMatch[tgtKey] = t2.join(' / ');
          } else {
            // 다른 매치 간 교환
            const srcTeam = srcMatch[srcKey].split(' / ');
            const tgtTeam = tgtMatch[tgtKey].split(' / ');
            [srcTeam[src.pos], tgtTeam[tgt.pos]] = [tgtTeam[tgt.pos], srcTeam[src.pos]];

            const srcOther = srcMatch[srcKey === 'player1' ? 'player2' : 'player1'].split(' / ');
            const tgtOther = tgtMatch[tgtKey === 'player1' ? 'player2' : 'player1'].split(' / ');

            if (new Set([...srcTeam, ...srcOther]).size !== srcTeam.length + srcOther.length
              || new Set([...tgtTeam, ...tgtOther]).size !== tgtTeam.length + tgtOther.length) {
              alert('같은 멤버가 동일 경기에 중복됩니다.');
              clearSel();
              return;
            }
            // 다른 시간대 간 교환: 이동 대상이 해당 시간대의 다른 매치에 이미 있는지 확인
            if (src.slotIdx !== tgt.slotIdx) {
              const getNamesInSlot = (si, excludeMatch) => {
                const names = new Set();
                (tournament.timeSlots[si]?.matches || []).forEach((m, mi) => {
                  if (mi === excludeMatch) return;
                  if (m.winner) return; // 완료된 매치의 멤버는 재배치 가능
                  m.player1.split(' / ').forEach(n => names.add(n));
                  m.player2.split(' / ').forEach(n => names.add(n));
                });
                return names;
              };
              const srcSlotOthers = getNamesInSlot(src.slotIdx, src.matchIdx);
              const tgtSlotOthers = getNamesInSlot(tgt.slotIdx, tgt.matchIdx);
              // swap 후: tgt.name → srcSlot, src.name → tgtSlot
              if (srcSlotOthers.has(tgt.name) || tgtSlotOthers.has(src.name)) {
                alert('같은 시간대에 동일 멤버가 중복됩니다.');
                clearSel();
                return;
              }
            }
            srcMatch[srcKey] = srcTeam.join(' / ');
            tgtMatch[tgtKey] = tgtTeam.join(' / ');
          }

          await Storage.updateTournament(tournament);
          this.render(container, tournament);
        }
      };
    });

    // 카드 빈 영역 클릭 → 스코어 입력 (멤버 선택 중이면 해제)
    const isMember = RolesConfig.isMember();
    cards.forEach(card => {
      card.onclick = () => {
        if (selectedPlayer) {
          selectedPlayer.el.classList.remove('bg-green-200', 'ring-2', 'ring-green-700', 'rounded');
          container.querySelectorAll('.replace-player-btn').forEach(b => b.remove());
          selectedPlayer = null;
          return;
        }
        const match = allMatches.find(m => m.id === card.dataset.matchId);
        if (!match) return;
        // 멤버는 본인 매치만 입력 가능
        if (isMember && !this._isMyMatch(match)) return;
        const matchId = match.id;
        const tournamentId = tournament.id;
        Results.showScoreModal(match, { setCount: 1, allowDraw: true, isTeamMode: tournament.isTeamMode, isCustom: tournament.isCustom }, async (result) => {
          // 최신 대회 데이터를 다시 읽어서 해당 매치만 패치 (동시 접속 데이터 유실 방지)
          const freshTournament = Storage.getTournamentById(tournamentId);
          if (!freshTournament) return;
          let freshMatch = null;
          for (const slot of freshTournament.timeSlots) {
            freshMatch = slot.matches.find(m => m.id === matchId);
            if (freshMatch) break;
          }
          if (!freshMatch) return;
          freshMatch.scores = result.scores;
          freshMatch.winner = result.winner;
          const allDone = this.getAllMatches(freshTournament).every(m => m.winner || m.winner === 'draw');
          if (allDone) {
            freshTournament.status = 'completed';
            freshTournament.completedAt = new Date().toISOString();
          }
          await Storage.updateTournament(freshTournament);
          this.render(container, freshTournament);
        });
      };
    });

    // 대진 삭제 (X 버튼, 관리자만)
    container.querySelectorAll('.delete-match-btn').forEach(btn => {
      if (RolesConfig.isMember()) return;
      btn.onclick = async (e) => {
        e.stopPropagation();
        const si = +btn.dataset.slotIdx;
        const mi = +btn.dataset.matchIdx;
        const match = tournament.timeSlots[si]?.matches[mi];
        if (!match) return;
        const label = `${match.player1} vs ${match.player2}`;
        if (!confirm(`이 대진을 삭제하시겠습니까?\n${label}`)) return;
        tournament.timeSlots[si].matches.splice(mi, 1);
        await Storage.updateTournament(tournament);
        this.render(container, tournament);
      };
    });

    // 경기 종류 변경 (뱃지 클릭)
    container.querySelectorAll('.change-gametype-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const match = allMatches.find(m => m.id === btn.dataset.matchId);
        if (!match) return;
        this.showChangeGameTypeModal(container, tournament, match);
      };
    });

    // ── 드래그 (관리자 전용) ──
    if (!RolesConfig.isMember()) {
    let _dragType = null; // 'card'

    // ── 매치 카드 교환 (데스크톱 DnD) ──
    cards.forEach(card => {
      card.ondragstart = (e) => {
        _dragType = 'card';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', `${card.dataset.slotIdx},${card.dataset.matchIdx}`);
        requestAnimationFrame(() => card.style.opacity = '0.4');
      };
      card.ondragend = () => { card.style.opacity = ''; _dragType = null; };
      card.ondragover = (e) => {
        if (_dragType !== 'card') return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.classList.add('ring-2', 'ring-green-700');
      };
      card.ondragleave = () => card.classList.remove('ring-2', 'ring-green-700');
      card.ondrop = async (e) => {
        e.preventDefault();
        card.classList.remove('ring-2', 'ring-green-700');
        if (_dragType !== 'card') return;
        const [si, mi] = e.dataTransfer.getData('text/plain').split(',').map(Number);
        const tSI = +card.dataset.slotIdx, tMI = +card.dataset.matchIdx;
        if (si === tSI && mi === tMI) return;
        const srcSlot = tournament.timeSlots[si], tgtSlot = tournament.timeSlots[tSI];

        // 다른 시간대 간 교환: 멤버 중복 검사
        if (si !== tSI) {
          const getNames = (m) => {
            const names = new Set();
            m.player1.split(' / ').forEach(n => names.add(n));
            m.player2.split(' / ').forEach(n => names.add(n));
            return names;
          };
          const getNamesInSlot = (slot, excludeIdx) => {
            const names = new Set();
            slot.matches.forEach((m, i) => {
              if (i === excludeIdx) return;
              if (m.winner) return; // 완료된 매치의 멤버는 재배치 가능
              m.player1.split(' / ').forEach(n => names.add(n));
              m.player2.split(' / ').forEach(n => names.add(n));
            });
            return names;
          };
          const srcMatchNames = getNames(srcSlot.matches[mi]);
          const tgtMatchNames = getNames(tgtSlot.matches[tMI]);
          const srcSlotOthers = getNamesInSlot(srcSlot, mi);
          const tgtSlotOthers = getNamesInSlot(tgtSlot, tMI);
          const dupInTgt = [...srcMatchNames].filter(n => tgtSlotOthers.has(n));
          const dupInSrc = [...tgtMatchNames].filter(n => srcSlotOthers.has(n));
          if (dupInTgt.length > 0 || dupInSrc.length > 0) {
            const dups = [...new Set([...dupInTgt, ...dupInSrc])];
            alert(`같은 시간대에 동일 멤버가 중복됩니다:\n${dups.join(', ')}`);
            return;
          }
        }

        const srcCourt = srcSlot.matches[mi].court;
        const tgtCourt = tgtSlot.matches[tMI].court;
        [srcSlot.matches[mi], tgtSlot.matches[tMI]] = [tgtSlot.matches[tMI], srcSlot.matches[mi]];
        srcSlot.matches[mi].court = srcCourt;
        tgtSlot.matches[tMI].court = tgtCourt;
        await Storage.updateTournament(tournament);
        this.render(container, tournament);
      };
    });

    // ── 시간대 통째로 교환 (데스크톱 DnD + 모바일 터치) ──
    const slotEls = container.querySelectorAll('.schedule-slot');
    const handles = container.querySelectorAll('.slot-drag-handle');

    // 시간대 교환 실행
    const swapSlots = async (srcIdx, tgtIdx) => {
      if (srcIdx === tgtIdx) return;
      const srcMatches = tournament.timeSlots[srcIdx].matches;
      const tgtMatches = tournament.timeSlots[tgtIdx].matches;
      tournament.timeSlots[srcIdx].matches = tgtMatches;
      tournament.timeSlots[tgtIdx].matches = srcMatches;
      await Storage.updateTournament(tournament);
      this.render(container, tournament);
    };

    handles.forEach(handle => {
      if (!RolesConfig.isMember()) handle.style.display = '';
    });

    // 모바일/데스크톱 공용: 시간대 핸들 탭으로 교환
    let _slotSelected = null; // 선택된 시간대 인덱스
    handles.forEach(handle => {
      handle.onclick = (e) => {
        e.stopPropagation();
        const idx = parseInt(handle.dataset.slotIdx);

        if (_slotSelected === null) {
          // 첫 번째 탭: 선택
          _slotSelected = idx;
          const srcSlotEl = handle.closest('.schedule-slot');
          srcSlotEl.classList.add('ring-2', 'ring-green-700', 'rounded-xl', 'bg-green-50');
          handle.querySelector('svg').classList.replace('text-gray-300', 'text-green-700');
          // 다른 시간대에 힌트
          slotEls.forEach(el => {
            if (parseInt(el.dataset.slot) !== idx) {
              el.querySelector('.slot-drag-handle svg')?.classList.add('text-green-400');
              el.classList.add('ring-1', 'ring-dashed', 'ring-green-300', 'rounded-xl');
            }
          });
        } else if (_slotSelected === idx) {
          // 같은 시간대 재탭: 선택 해제
          clearSlotSelection();
        } else {
          // 두 번째 탭: 교환 실행
          const srcIdx = _slotSelected;
          clearSlotSelection();
          swapSlots(srcIdx, idx);
        }
      };
    });

    const clearSlotSelection = () => {
      slotEls.forEach(el => {
        el.classList.remove('ring-2', 'ring-1', 'ring-green-700', 'ring-dashed', 'ring-green-300', 'rounded-xl', 'bg-green-50');
        const svg = el.querySelector('.slot-drag-handle svg');
        if (svg) { svg.classList.remove('text-green-700', 'text-green-400'); svg.classList.add('text-gray-300'); }
      });
      _slotSelected = null;
    };

    // 빈 영역 클릭 시 선택 해제
    container.addEventListener('click', (e) => {
      if (_slotSelected !== null && !e.target.closest('.slot-drag-handle')) {
        clearSlotSelection();
      }
    });
    } // end if (!RolesConfig.isMember()) - 드래그
  },

  // PDF 내보내기 (타임슬롯 단위 캡처, 페이지당 4개)
  async exportPDF(container, tournament) {
    const btn = container.querySelector('#pdf-download-btn');
    const origText = btn.innerHTML;
    btn.innerHTML = '생성 중...';
    btn.disabled = true;

    try {
      const { jsPDF } = window.jspdf;

      // ── 화면 그대로 캡처 방식 ──
      // 1) 숨길 UI 요소
      const hideSelector = '#pdf-download-btn, #add-match-btn, .schedule-match-card p, .delete-match-btn, .court-add-match-btn';
      const hideEls = container.querySelectorAll(hideSelector);
      hideEls.forEach(el => el.style.display = 'none');

      // 2) html2canvas 텍스트 클리핑 보정용 임시 스타일 주입
      const pdfFixStyle = document.createElement('style');
      pdfFixStyle.id = 'pdf-capture-fix';
      pdfFixStyle.textContent = `
        .schedule-match-card, .schedule-match-card * {
          overflow: visible !important;
          text-overflow: clip !important;
          white-space: normal !important;
          line-height: 1.6 !important;
        }
        .schedule-match-card .truncate {
          overflow: visible !important;
          text-overflow: clip !important;
        }
        .schedule-match-card .rounded-lg {
          overflow: visible !important;
          padding-top: 8px !important;
          padding-bottom: 8px !important;
        }
        .schedule-match-card span, .schedule-match-card div {
          padding-bottom: 1px !important;
        }
        [class*="backdrop-blur"] {
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }
        [class*="bg-white\\/"] {
          background: #fff !important;
        }
        .standings-table td, .standings-table th {
          line-height: 1.6 !important;
          padding-top: 6px !important;
          padding-bottom: 6px !important;
        }
        .schedule-slot span, .schedule-slot div {
          line-height: 1.6 !important;
        }
      `;
      document.head.appendChild(pdfFixStyle);

      // 3) 컨테이너를 고정 너비로 설정 (일관된 렌더링)
      const captureW = 800;
      const origWidth = container.style.width;
      const origMaxWidth = container.style.maxWidth;
      container.style.width = captureW + 'px';
      container.style.maxWidth = captureW + 'px';
      await new Promise(r => requestAnimationFrame(r));

      // 4) 화면 DOM 그대로 캡처
      const fullCanvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        scrollY: -window.scrollY,
        windowWidth: captureW,
      });

      // 5) 스타일 복원
      pdfFixStyle.remove();
      container.style.width = origWidth;
      container.style.maxWidth = origMaxWidth;
      hideEls.forEach(el => el.style.display = '');

      // 5) 캔버스를 A4 페이지에 맞춰 분할
      const pdf = new jsPDF('p', 'mm', 'a4');
      const margin = 8;
      const contentW = 210 - margin * 2;
      const pageContentH = 297 - margin * 2;

      const imgW = fullCanvas.width;
      const imgH = fullCanvas.height;
      const ratio = contentW / imgW;
      const totalH_mm = imgH * ratio;

      // 1페이지 높이에 해당하는 픽셀 수
      const pagePixelH = pageContentH / ratio;
      let srcY = 0;
      let pageNum = 0;

      while (srcY < imgH) {
        if (pageNum > 0) pdf.addPage();

        const sliceH = Math.min(pagePixelH, imgH - srcY);
        const sliceH_mm = sliceH * ratio;

        // 캔버스에서 해당 영역만 잘라내기
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = imgW;
        pageCanvas.height = sliceH;
        const ctx = pageCanvas.getContext('2d');
        ctx.drawImage(fullCanvas, 0, srcY, imgW, sliceH, 0, 0, imgW, sliceH);

        pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', margin, margin, contentW, sliceH_mm);

        srcY += pagePixelH;
        pageNum++;
      }

      pdf.save(`${tournament.name}.pdf`);
    } catch (e) {
      console.error('PDF 생성 오류:', e);
      alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      btn.innerHTML = origText;
      btn.disabled = false;
    }
  },

  // 멤버 이름을 개별 탭 가능한 span으로 렌더링
  renderSwapPlayer(name, slotIdx, matchIdx, team, pos) {
    const allPlayers = Storage.getPlayers();
    const pd = allPlayers.find(p => p.name === name);
    const isCustom = this._tournament?.isCustom;
    const ntrpHtml = RolesConfig.isMember() ? '' : `<span class="text-yellow-600 text-xs">${(pd?.ntrp || 2.5).toFixed(1)}</span>`;
    const genderHtml = pd ? genderBadge(pd.gender, 'text') : '';
    return `<span class="swap-player cursor-pointer hover:bg-yellow-100 rounded px-0.5 transition inline-flex items-center gap-0.5"
      data-slot-idx="${slotIdx}" data-match-idx="${matchIdx}" data-team="${team}" data-pos="${pos}"
      data-name="${Results.escapeHtml(name)}">${Results.escapeHtml(name)}${genderHtml}${ntrpHtml}</span>`;
  },

  // 커스텀 대진표: 코트별 세로 레이아웃
  _renderCourtLayout(tournament) {
    const allMatches = tournament.timeSlots[0]?.matches || [];
    const courtCount = tournament.courts;
    const courtMatches = {};
    for (let c = 1; c <= courtCount; c++) courtMatches[c] = [];
    allMatches.forEach((m, mi) => {
      const c = m.court || 1;
      if (!courtMatches[c]) courtMatches[c] = [];
      courtMatches[c].push({ match: m, mi });
    });

    const gridCols = courtCount <= 1 ? 'grid-cols-1' : `grid-cols-2${courtCount > 2 ? ` sm:grid-cols-${courtCount}` : ''}`;
    return `<div class="grid gap-3 ${gridCols}">
      ${Array.from({length: courtCount}, (_, i) => {
        const c = i + 1;
        const matches = courtMatches[c];
        return `<div>
          <div class="flex items-center gap-2 mb-2">
            <span class="text-sm font-bold text-gray-700 bg-gray-100 px-3 py-1 rounded-full">코트 ${c}</span>
            <div class="flex-1 border-t border-gray-200"></div>
          </div>
          <div class="space-y-2">
            ${matches.map(({ match, mi }) => this.renderMatchCard(match, 0, mi)).join('')}
            <button type="button" class="court-add-match-btn w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-green-400 hover:text-green-700 hover:bg-green-50/50 transition flex items-center justify-center gap-1" data-court="${c}">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              대진 추가
            </button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  },

  // 매치에 멤버 본인 이름이 포함되어 있는지 확인
  _isMyMatch(match) {
    const name = App.getMemberName();
    if (!name) return false;
    const check = (pStr) => pStr && pStr.split(' / ').includes(name);
    return check(match.player1) || check(match.player2);
  },

  // 매치 카드 HTML
  renderMatchCard(match, slotIdx, matchIdx) {
    const cfg = match.gameType ? SCHEDULE_GAME_TYPES[match.gameType] : null;
    const hasResult = !!match.winner || !!match.scores;
    const isDraw = match.winner === 'draw';
    const isMember = RolesConfig.isMember();
    const isMyMatch = this._isMyMatch(match);
    const t1Names = match.player1.split(' / ');
    const t2Names = match.player2.split(' / ');
    const isDoubles = t1Names.length > 1;
    const t1Html = isDoubles
      ? t1Names.map((n, p) => `<div class="text-center">${this.renderSwapPlayer(n, slotIdx, matchIdx, 1, p)}</div>`).join('')
      : this.renderSwapPlayer(t1Names[0], slotIdx, matchIdx, 1, 0);
    const t2Html = isDoubles
      ? t2Names.map((n, p) => `<div class="text-center">${this.renderSwapPlayer(n, slotIdx, matchIdx, 2, p)}</div>`).join('')
      : this.renderSwapPlayer(t2Names[0], slotIdx, matchIdx, 2, 0);

    // 팀전 모드: 팀 이름
    let t1TeamName = '', t2TeamName = '';
    if (this._tournament?.isTeamMode) {
      const _tm = buildTeamMap();
      const getTeam = (names) => {
        const tns = [...new Set(names.map(n => _tm[n]).filter(Boolean))];
        return tns.map(tn => Results.escapeHtml(tn)).join(' / ');
      };
      t1TeamName = getTeam(t1Names);
      t2TeamName = getTeam(t2Names);
    }
    const isWin1 = !isDraw && match.winner === match.player1;
    const isWin2 = !isDraw && match.winner === match.player2;

    const borderColor = isDraw ? 'border-yellow-200' : (hasResult ? 'border-green-200' : 'border-gray-200');
    const t1Bg = isDraw ? 'bg-yellow-50' : (isWin1 ? 'bg-green-50' : 'bg-gray-50');
    const t2Bg = isDraw ? 'bg-yellow-50' : (isWin2 ? 'bg-green-50' : 'bg-gray-50');
    const t1TextClass = isDraw ? 'text-yellow-700' : (isWin1 ? 'text-green-700' : 'text-gray-800');
    const t2TextClass = isDraw ? 'text-yellow-700' : (isWin2 ? 'text-green-700' : 'text-gray-800');
    const s1Class = isDraw ? 'text-yellow-600 bg-yellow-100' : (isWin1 ? 'text-green-700 bg-green-100' : 'text-gray-500 bg-gray-100');
    const s2Class = isDraw ? 'text-yellow-600 bg-yellow-100' : (isWin2 ? 'text-green-700 bg-green-100' : 'text-gray-500 bg-gray-100');

    const myMatchClass = isMember && isMyMatch ? 'my-match' : '';
    const myBorderColor = isMember && isMyMatch ? 'border-blue-400 ring-2 ring-blue-200' : borderColor;

    return `
      <div class="schedule-match-card ${myMatchClass} relative bg-white border ${myBorderColor} rounded-xl p-3 cursor-pointer hover:shadow-md transition"
           ${!RolesConfig.isMember() ? 'draggable="true"' : ''} data-match-id="${match.id}" data-slot-idx="${slotIdx}" data-match-idx="${matchIdx}" data-my-match="${isMember && isMyMatch}">
        <button type="button" class="delete-match-btn absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-400 hover:bg-red-50 hover:border-red-300 hover:text-red-500 shadow-sm transition z-10" data-slot-idx="${slotIdx}" data-match-idx="${matchIdx}">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
        ${cfg ? `<div class="flex items-center mb-2 pr-5">
          <span class="change-gametype-btn text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badgeClass} cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-green-400 transition" data-match-id="${match.id}">${cfg.label}</span>
        </div>` : ''}
        <div class="space-y-0.5">
          <div class="${t1Bg} rounded-lg px-2 ${t1TeamName ? 'pt-1.5 pb-2' : 'py-2'}">
            ${t1TeamName ? `<div class="text-center mb-1"><span class="inline-block text-[10px] leading-tight px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 font-medium">${t1TeamName}</span></div>` : ''}
            <div class="text-sm sm:text-xs font-medium ${t1TextClass} text-center">
              ${isWin1 ? '🏆 ' : ''}${isDraw ? '🤝 ' : ''}${t1Html}
            </div>
          </div>
          ${hasResult && match.scores
            ? `<div class="flex items-center justify-center gap-1.5 py-0.5">
                <span class="match-score text-sm font-bold ${s1Class} px-2 py-0.5 rounded-md min-w-[1.5rem] text-center">${match.scores[0][0]}</span>
                <span class="text-xs text-gray-400 font-medium">:</span>
                <span class="match-score text-sm font-bold ${s2Class} px-2 py-0.5 rounded-md min-w-[1.5rem] text-center">${match.scores[0][1]}</span>
              </div>`
            : `<div class="text-center text-xs text-gray-300 leading-tight">vs</div>`}
          <div class="${t2Bg} rounded-lg px-2 ${t2TeamName ? 'pt-1.5 pb-2' : 'py-2'}">
            ${t2TeamName ? `<div class="text-center mb-1"><span class="inline-block text-[10px] leading-tight px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 font-medium">${t2TeamName}</span></div>` : ''}
            <div class="text-sm sm:text-xs font-medium ${t2TextClass} text-center">
              ${isWin2 ? '🏆 ' : ''}${isDraw ? '🤝 ' : ''}${t2Html}
            </div>
          </div>
        </div>
      </div>`;
  },

  // 커스텀 대진 추가 모달
  showAddMatchModal(container, tournament, presetCourt, presetSlot) {
    const existing = document.querySelector('.add-match-modal');
    if (existing) existing.remove();

    const allPlayers = Storage.getPlayers().sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const _teamMap = tournament.isTeamMode ? buildTeamMap() : {};
    const isSingles = !!tournament.isSingles;
    const selected = { t1p1: null, t1p2: null, t2p1: null, t2p2: null };
    let selectedCourt = presetCourt || 1;
    let selectedSlot = (presetSlot != null) ? presetSlot : 0;
    let selectedGameType = isSingles ? 'MS' : 'XD';

    const modal = document.createElement('div');
    modal.className = 'add-match-modal fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';

    const renderModal = () => {
      const playerSlot = (key, label) => {
        const name = selected[key];
        const pd = name ? allPlayers.find(p => p.name === name) : null;
        const tn = name ? _teamMap[name] : null;
        if (name) {
          return `<div class="am-player-slot flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-xl cursor-pointer hover:bg-green-50 transition" data-key="${key}">
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-800 font-medium">${Results.escapeHtml(name)}</span>
              ${pd ? `${genderBadge(pd.gender)}
              ${RolesConfig.isMember() ? '' : `<span class="text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">${(pd.ntrp || 2.5).toFixed(1)}</span>`}` : ''}
              ${tn ? `<span class="text-xs px-1.5 py-0.5 rounded font-medium bg-green-50 text-green-700 border border-green-200">${Results.escapeHtml(tn)}</span>` : ''}
            </div>
            <button type="button" class="am-remove-player text-red-400 hover:text-red-600 text-xs" data-key="${key}">✕</button>
          </div>`;
        }
        return `<div class="am-player-slot flex items-center px-3 py-2.5 border border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-green-50 transition" data-key="${key}">
          <span class="text-sm text-gray-300 italic">${label}</span>
        </div>`;
      };

      return `
        <div class="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[85vh] overflow-y-auto">
          <div class="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden"></div>
          <h3 class="text-lg font-bold text-center mb-4">대진 추가</h3>
          <div class="space-y-4">
            ${tournament.isCustom ? '' : (presetSlot != null
              ? `<div class="flex items-center gap-2 text-sm text-gray-600">
                  <span class="font-medium bg-gray-100 px-3 py-1.5 rounded-lg">${tournament.timeSlots[selectedSlot].time}</span>
                  <span>·</span>
                  <span class="font-medium">코트 ${selectedCourt}번</span>
                  <input type="hidden" id="am-slot" value="${selectedSlot}">
                </div>`
              : `<div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-gray-600 mb-1">시간대</label>
                    <select id="am-slot" class="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-green-700">
                      ${tournament.timeSlots.map((s, i) =>
                        `<option value="${i}" ${i === selectedSlot ? 'selected' : ''}>${s.time}</option>`
                      ).join('')}
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-gray-600 mb-1">경기 종류</label>
                    <div class="flex gap-1.5 flex-wrap">
                      ${Object.entries(SCHEDULE_GAME_TYPES).filter(([, cfg]) => !!cfg.singles === isSingles).map(([key, cfg]) =>
                        `<label class="cursor-pointer">
                          <input type="radio" name="am-gametype" value="${key}" ${key === selectedGameType ? 'checked' : ''} class="sr-only peer">
                          <div class="px-2.5 py-1.5 rounded-lg text-xs font-medium border-2 border-gray-200 peer-checked:border-green-500 peer-checked:bg-green-50 transition">${cfg.icon} ${cfg.label}</div>
                        </label>`
                      ).join('')}
                    </div>
                  </div>
                </div>`)
            }

            ${presetCourt && (tournament.isCustom || presetSlot != null) ? '' : `<div>
              <label class="block text-xs font-semibold text-gray-600 mb-1">코트 번호</label>
              <div class="flex gap-2">
                ${Array.from({length: tournament.courts}, (_, i) => `
                  <label class="flex-1 cursor-pointer">
                    <input type="radio" name="am-court" value="${i + 1}" ${i + 1 === selectedCourt ? 'checked' : ''} class="sr-only peer">
                    <div class="border-2 border-gray-200 rounded-xl py-2 text-center peer-checked:border-green-500 peer-checked:bg-green-50 transition text-sm font-medium">${i + 1}번</div>
                  </label>
                `).join('')}
              </div>
            </div>`}

            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-2">${isSingles ? '선수 1' : '팀 1'}</label>
              <div class="space-y-2">
                ${playerSlot('t1p1', isSingles ? '선수 선택...' : '멤버 1 선택...')}
                ${isSingles ? '' : playerSlot('t1p2', '멤버 2 선택...')}
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-2">${isSingles ? '선수 2' : '팀 2'}</label>
              <div class="space-y-2">
                ${playerSlot('t2p1', isSingles ? '선수 선택...' : '멤버 1 선택...')}
                ${isSingles ? '' : playerSlot('t2p2', '멤버 2 선택...')}
              </div>
            </div>

            <div class="flex gap-3 pt-2">
              <button type="button" class="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition am-cancel">취소</button>
              <button type="button" class="flex-1 py-2.5 bg-green-700 text-white rounded-xl text-sm font-medium hover:bg-green-800 transition am-submit">추가</button>
            </div>
          </div>
        </div>`;
    };

    const refreshModal = () => {
      patchDOM(modal, renderModal());
      bindModalEvents();
    };

    const bindModalEvents = () => {
      modal.querySelector('.am-cancel').onclick = () => { modal.remove(); unlockScroll(); };

      // 코트/시간대/경기종류 선택 상태 추적
      modal.querySelectorAll('input[name="am-court"]').forEach(r => {
        r.onchange = () => { selectedCourt = parseInt(r.value); };
      });
      const slotEl = modal.querySelector('#am-slot');
      if (slotEl) slotEl.onchange = () => { selectedSlot = parseInt(slotEl.value); };
      modal.querySelectorAll('input[name="am-gametype"]').forEach(r => {
        r.onchange = () => { selectedGameType = r.value; };
      });

      modal.querySelector('.am-submit').onclick = async () => {
        const { t1p1, t1p2, t2p1, t2p2 } = selected;
        if (isSingles) {
          if (!t1p1 || !t2p1) {
            alert('모든 선수를 선택해주세요.');
            return;
          }
          if (t1p1 === t2p1) {
            alert('같은 선수를 선택할 수 없습니다.');
            return;
          }
        } else {
          if (!t1p1 || !t1p2 || !t2p1 || !t2p2) {
            alert('모든 멤버를 선택해주세요.');
            return;
          }
          const names = [t1p1, t1p2, t2p1, t2p2];
          if (new Set(names).size !== 4) {
            alert('중복된 멤버가 있습니다.');
            return;
          }
        }
        const slotIdx = tournament.isCustom ? 0 : parseInt(modal.querySelector('#am-slot').value);

        // 같은 시간대 멤버 중복 검사 (커스텀 대진표는 시간대 없으므로 제외, 완료된 매치 제외)
        if (!tournament.isCustom) {
          const newNames = isSingles ? [t1p1, t2p1] : [t1p1, t1p2, t2p1, t2p2];
          const slotExisting = new Set();
          (tournament.timeSlots[slotIdx]?.matches || []).forEach(m => {
            if (m.winner) return; // 완료된 매치의 멤버는 재배치 가능
            m.player1.split(' / ').forEach(n => slotExisting.add(n));
            m.player2.split(' / ').forEach(n => slotExisting.add(n));
          });
          const dupInSlot = newNames.filter(n => slotExisting.has(n));
          if (dupInSlot.length > 0) {
            alert(`같은 시간대에 이미 배치된 멤버가 있습니다:\n${dupInSlot.join(', ')}`);
            return;
          }
        }

        let gameType;
        if (presetSlot != null) {
          // 성별 기반 경기 종류 자동 감지
          const getGender = (name) => { const p = allPlayers.find(pl => pl.name === name); return p ? p.gender : null; };
          if (isSingles) {
            const g1 = getGender(t1p1), g2 = getGender(t2p1);
            if (g1 === 'M' && g2 === 'M') gameType = 'MS';
            else if (g1 === 'F' && g2 === 'F') gameType = 'WS';
            else gameType = 'FS';
          } else {
            const genders = [t1p1, t1p2, t2p1, t2p2].map(getGender);
            const allM = genders.every(g => g === 'M');
            const allF = genders.every(g => g === 'F');
            const mixedPairs = (genders[0] !== genders[1]) && (genders[2] !== genders[3])
              && genders.filter(g => g === 'M').length === 2 && genders.filter(g => g === 'F').length === 2;
            if (allM) gameType = 'MD';
            else if (allF) gameType = 'WD';
            else if (mixedPairs) gameType = 'XD';
            else gameType = 'FD';
          }
        } else {
          const gtEl = modal.querySelector('input[name="am-gametype"]:checked');
          gameType = tournament.isCustom ? null : (gtEl ? gtEl.value : null);
        }
        const courtEl = modal.querySelector('input[name="am-court"]:checked');
        const court = courtEl ? parseInt(courtEl.value) : selectedCourt;

        const newMatch = {
          id: Storage.generateId(),
          court,
          player1: isSingles ? t1p1 : `${t1p1} / ${t1p2}`,
          player2: isSingles ? t2p1 : `${t2p1} / ${t2p2}`,
          scores: null,
          winner: null,
        };
        if (gameType) newMatch.gameType = gameType;
        tournament.timeSlots[slotIdx].matches.push(newMatch);
        if (tournament.status === 'completed') {
          tournament.status = 'active';
          tournament.completedAt = null;
        }
        await Storage.updateTournament(tournament);
        modal.remove(); unlockScroll();
        this.render(container, tournament);
      };

      // Player slot click → open picker
      modal.querySelectorAll('.am-player-slot').forEach(slot => {
        slot.onclick = (e) => {
          if (e.target.closest('.am-remove-player')) return;
          // 같은 시간대 기존 멤버 수집 (비활성화용, 완료된 매치 제외)
          const curSlotIdx = presetSlot != null ? selectedSlot : parseInt(modal.querySelector('#am-slot')?.value || '0');
          const slotBusyNames = new Set();
          if (!tournament.isCustom) {
            (tournament.timeSlots[curSlotIdx]?.matches || []).forEach(m => {
              if (m.winner) return; // 완료된 매치의 멤버는 재배치 가능
              m.player1.split(' / ').forEach(n => slotBusyNames.add(n));
              m.player2.split(' / ').forEach(n => slotBusyNames.add(n));
            });
          }
          this._showPlayerPickerForSlot(modal, allPlayers, selected, slot.dataset.key, refreshModal, slotBusyNames);
        };
      });

      // Remove player
      modal.querySelectorAll('.am-remove-player').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          selected[btn.dataset.key] = null;
          refreshModal();
        };
      });
    };

    modal.innerHTML = renderModal();
    document.body.appendChild(modal);
    lockScroll();
    modal.addEventListener('click', (e) => { if (e.target === modal) { modal.remove(); unlockScroll(); } });
    bindModalEvents();
  },

  // 멤버 선택 피커 (대진 추가용)
  _showPlayerPickerForSlot(parentModal, allPlayers, selected, slotKey, onDone, slotBusyNames) {
    const existing = document.querySelector('.am-player-picker');
    if (existing) existing.remove();

    const usedNames = new Set(Object.values(selected).filter(Boolean));
    const busyNames = slotBusyNames || new Set();
    const _teamMap = this._tournament?.isTeamMode ? buildTeamMap() : {};

    // 팀 모드: 허용/제외 팀 결정
    let allowedTeam = null, excludedTeam = null;
    if (this._tournament?.isTeamMode) {
      const isTeam1Side = slotKey.startsWith('t1');
      const side1Team = _teamMap[selected.t1p1] || _teamMap[selected.t1p2] || null;
      const side2Team = _teamMap[selected.t2p1] || _teamMap[selected.t2p2] || null;
      if (isTeam1Side) {
        if (side1Team) allowedTeam = side1Team;
        else if (side2Team) excludedTeam = side2Team;
      } else {
        if (side2Team) allowedTeam = side2Team;
        else if (side1Team) excludedTeam = side1Team;
      }
    }
    const visiblePlayers = (allowedTeam || excludedTeam)
      ? allPlayers.filter(p => {
          const t = _teamMap[p.name];
          if (allowedTeam) return t === allowedTeam;
          if (excludedTeam) return t && t !== excludedTeam;
          return true;
        })
      : allPlayers;
    const pickerTitle = allowedTeam ? `멤버 선택 — ${Results.escapeHtml(allowedTeam)}` : '멤버 선택';

    const picker = document.createElement('div');
    picker.className = 'am-player-picker fixed inset-0 z-[60] flex items-center justify-center p-4';
    picker.style.backgroundColor = 'rgba(0,0,0,0.5)';
    picker.innerHTML = `
      <div class="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-sm w-full p-4 max-h-[70vh] flex flex-col">
        <div class="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden"></div>
        <h3 class="text-lg font-bold text-center mb-3">${pickerTitle}</h3>
        <div class="mb-3">
          <div class="flex gap-2">
            <input type="text" autocomplete="off" id="amp-search" placeholder="이름 검색 또는 직접 입력..."
              class="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-700 focus:border-green-700">
            <button type="button" id="amp-custom-add"
              class="px-4 py-2 bg-green-700 text-white rounded-xl text-sm font-medium hover:bg-green-800 transition whitespace-nowrap">추가</button>
          </div>
        </div>
        ${visiblePlayers.length > 0 ? `
          <div class="text-xs text-gray-400 mb-2">등록된 멤버</div>
          <div class="overflow-y-auto flex-1 divide-y divide-gray-50">
            ${visiblePlayers.map(p => {
              const isUsed = usedNames.has(p.name);
              const isBusy = !isUsed && busyNames.has(p.name);
              const isDisabled = isUsed || isBusy;
              const tn = _teamMap[p.name];
              return `
                <div class="amp-option flex items-center px-3 py-2.5 ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-green-50'} transition"
                  data-name="${Results.escapeHtml(p.name)}" data-used="${isDisabled}">
                  <span class="text-sm text-gray-800">${Results.escapeHtml(p.name)}</span>
                  <span class="ml-2">${genderBadge(p.gender)}</span>
                  ${RolesConfig.isMember() ? '' : `<span class="ml-1 text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">${(p.ntrp || 2.5).toFixed(1)}</span>`}
                  ${tn ? `<span class="ml-1 text-xs px-1.5 py-0.5 rounded font-medium bg-green-50 text-green-700 border border-green-200">${Results.escapeHtml(tn)}</span>` : ''}
                  ${isUsed ? '<span class="ml-auto text-xs text-gray-400">선택됨</span>' : ''}
                  ${isBusy ? '<span class="ml-auto text-xs text-gray-400">같은 시간대</span>' : ''}
                </div>`;
            }).join('')}
          </div>
        ` : '<p class="text-sm text-gray-400 text-center py-4">등록된 멤버가 없습니다.</p>'}
        <button type="button" class="mt-3 w-full py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition amp-cancel">취소</button>
      </div>`;

    document.body.appendChild(picker);
    lockScroll();
    const closePicker = () => { picker.remove(); unlockScroll(); };
    picker.addEventListener('click', (e) => { if (e.target === picker) closePicker(); });
    picker.querySelector('.amp-cancel').onclick = closePicker;

    const searchInput = picker.querySelector('#amp-search');
    searchInput.focus();

    searchInput.oninput = () => {
      const q = searchInput.value.trim();
      picker.querySelectorAll('.amp-option').forEach(opt => {
        opt.style.display = (!q || matchesKoreanSearch(opt.dataset.name, q)) ? '' : 'none';
      });
    };

    // Direct input
    const addCustom = () => {
      const val = searchInput.value.trim();
      if (!val) return;
      if (usedNames.has(val)) { alert('이미 선택된 멤버입니다.'); return; }
      if (busyNames.has(val)) { alert('같은 시간대에 이미 배치된 멤버입니다.'); return; }
      selected[slotKey] = val;
      closePicker();
      onDone();
    };
    picker.querySelector('#amp-custom-add').onclick = addCustom;
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addCustom(); }
    });

    // Select from list
    picker.querySelectorAll('.amp-option').forEach(opt => {
      opt.onclick = () => {
        if (opt.dataset.used === 'true') return;
        selected[slotKey] = opt.dataset.name;
        closePicker();
        onDone();
      };
    });
  },

  // 멤버 교체 피커 (매치 카드에서 이름 탭 → 교체 버튼)
  _showReplacePlayerPicker(container, tournament, playerInfo, onDone) {
    const existing = document.querySelector('.am-player-picker');
    if (existing) existing.remove();

    const allPlayers = Storage.getPlayers().sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const { slotIdx, matchIdx, team, pos, name: oldName } = playerInfo;
    const match = tournament.timeSlots[slotIdx]?.matches[matchIdx];
    if (!match) return;

    const playerKey = team === 1 ? 'player1' : 'player2';
    const otherKey = team === 1 ? 'player2' : 'player1';
    // 같은 시간대 전체 매치에서 사용 중인 멤버 수집 (본인 제외, 완료된 매치 제외)
    const slotBusyNames = new Set();
    (tournament.timeSlots[slotIdx]?.matches || []).forEach(m => {
      if (m.winner) return; // 완료된 매치의 멤버는 재배치 가능
      m.player1.split(' / ').forEach(n => slotBusyNames.add(n));
      m.player2.split(' / ').forEach(n => slotBusyNames.add(n));
    });
    slotBusyNames.delete(oldName);

    const _teamMap = tournament.isTeamMode ? buildTeamMap() : {};

    // 팀 모드: 같은 편 멤버의 팀으로 필터링
    const sideTeam = tournament.isTeamMode
      ? match[playerKey].split(' / ').map(n => _teamMap[n]).find(Boolean) || null
      : null;
    const visiblePlayers = sideTeam
      ? allPlayers.filter(p => _teamMap[p.name] === sideTeam)
      : allPlayers;
    const pickerTitle = sideTeam
      ? `멤버 교체 — ${Results.escapeHtml(oldName)} (${Results.escapeHtml(sideTeam)})`
      : `멤버 교체 — ${Results.escapeHtml(oldName)}`;

    const picker = document.createElement('div');
    picker.className = 'am-player-picker fixed inset-0 z-[60] flex items-center justify-center p-4';
    picker.style.backgroundColor = 'rgba(0,0,0,0.5)';
    picker.innerHTML = `
      <div class="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-sm w-full p-4 max-h-[70vh] flex flex-col">
        <div class="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden"></div>
        <h3 class="text-lg font-bold text-center mb-3">${pickerTitle}</h3>
        <div class="mb-3">
          <input type="text" autocomplete="off" id="amp-search" placeholder="이름 검색..."
            class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
        </div>
        ${visiblePlayers.length > 0 ? `
          <div class="text-xs text-gray-400 mb-2">등록된 멤버</div>
          <div class="overflow-y-auto flex-1 divide-y divide-gray-50">
            ${visiblePlayers.map(p => {
              const isDup = slotBusyNames.has(p.name);
              const isSelf = p.name === oldName;
              const tn = _teamMap[p.name];
              return `
                <div class="amp-option flex items-center px-3 py-2.5 ${isDup || isSelf ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-blue-50'} transition"
                  data-name="${Results.escapeHtml(p.name)}" data-disabled="${isDup || isSelf}">
                  <span class="text-sm text-gray-800">${Results.escapeHtml(p.name)}</span>
                  <span class="ml-2">${genderBadge(p.gender)}</span>
                  ${RolesConfig.isMember() ? '' : `<span class="ml-1 text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">${(p.ntrp || 2.5).toFixed(1)}</span>`}
                  ${tn ? `<span class="ml-1 text-xs px-1.5 py-0.5 rounded font-medium bg-green-50 text-green-700 border border-green-200">${Results.escapeHtml(tn)}</span>` : ''}
                  ${isSelf ? '<span class="ml-auto text-xs text-gray-400">현재</span>' : ''}
                  ${isDup ? '<span class="ml-auto text-xs text-gray-400">같은 시간대</span>' : ''}
                </div>`;
            }).join('')}
          </div>
        ` : '<p class="text-sm text-gray-400 text-center py-4">등록된 멤버가 없습니다.</p>'}
        <button type="button" class="mt-3 w-full py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition amp-cancel">취소</button>
      </div>`;

    document.body.appendChild(picker);
    lockScroll();
    const closePicker2 = () => { picker.remove(); unlockScroll(); };
    picker.addEventListener('click', (e) => { if (e.target === picker) { closePicker2(); onDone(); } });
    picker.querySelector('.amp-cancel').onclick = () => { closePicker2(); onDone(); };

    const searchInput = picker.querySelector('#amp-search');
    searchInput.focus();
    searchInput.oninput = () => {
      const q = searchInput.value.trim();
      picker.querySelectorAll('.amp-option').forEach(opt => {
        opt.style.display = (!q || matchesKoreanSearch(opt.dataset.name, q)) ? '' : 'none';
      });
    };

    picker.querySelectorAll('.amp-option').forEach(opt => {
      opt.onclick = async () => {
        if (opt.dataset.disabled === 'true') return;
        const newName = opt.dataset.name;
        const names = match[playerKey].split(' / ');
        names[pos] = newName;
        match[playerKey] = names.join(' / ');
        await Storage.updateTournament(tournament);
        closePicker2();
        onDone();
        this.render(container, tournament);
      };
    });
  },

  // 경기 종류 변경 모달
  showChangeGameTypeModal(container, tournament, match) {
    const existing = document.querySelector('.change-gametype-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'change-gametype-modal fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
    modal.innerHTML = `
      <div class="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-sm w-full p-5">
        <div class="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden"></div>
        <h3 class="text-lg font-bold text-center mb-4">경기 종류 변경</h3>
        <div class="grid grid-cols-2 gap-2 mb-4">
          ${Object.entries(SCHEDULE_GAME_TYPES).filter(([, cfg]) => !!cfg.singles === !!tournament.isSingles).map(([key, cfg]) =>
            `<button type="button" class="cgt-option px-3 py-3 rounded-xl text-sm font-medium border-2 transition
              ${match.gameType === key ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}"
              data-type="${key}">
              <span class="text-lg">${cfg.icon}</span>
              <span class="ml-1">${cfg.label}</span>
            </button>`
          ).join('')}
        </div>
        <button type="button" class="w-full py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition cgt-cancel">취소</button>
      </div>`;

    document.body.appendChild(modal);
    lockScroll();
    const closeGtModal = () => { modal.remove(); unlockScroll(); };
    modal.addEventListener('click', (e) => { if (e.target === modal) closeGtModal(); });
    modal.querySelector('.cgt-cancel').onclick = closeGtModal;

    modal.querySelectorAll('.cgt-option').forEach(btn => {
      btn.onclick = async () => {
        match.gameType = btn.dataset.type;
        await Storage.updateTournament(tournament);
        closeGtModal();
        this.render(container, tournament);
      };
    });
  },
};
