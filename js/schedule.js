// schedule.js - 시간/코트 기반 대진표 생성 + 렌더링
const SCHEDULE_GAME_TYPES = {
  XD: { label: '혼합복식', icon: '👫', badgeClass: 'bg-purple-100 text-purple-700', needM: 2, needF: 2 },
  MD: { label: '남자복식', icon: '👬', badgeClass: 'bg-blue-100 text-blue-700', needM: 4, needF: 0 },
  WD: { label: '여자복식', icon: '👭', badgeClass: 'bg-pink-100 text-pink-700', needM: 0, needF: 4 },
  FD: { label: '섞어복식', icon: '🔀', badgeClass: 'bg-orange-100 text-orange-700', needM: 0, needF: 0, needAny: 4 },
};

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

  // 가용 선수로 가능한 게임 타입 확인
  getPossibleTypes(availMales, availFemales, allowMixed) {
    const types = [];
    if (availMales.length >= 2 && availFemales.length >= 2) types.push('XD');
    if (availMales.length >= 4) types.push('MD');
    if (availFemales.length >= 4) types.push('WD');
    if (allowMixed && (availMales.length + availFemales.length) >= 4) types.push('FD');
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
  generatePlans(numCourts, allowMixed) {
    const types = allowMixed ? ['XD', 'MD', 'WD', 'FD'] : ['XD', 'MD', 'WD'];
    if (numCourts === 0) return [[]];
    const result = [];
    const sub = this.generatePlans(numCourts - 1, allowMixed);
    for (const t of types) {
      for (const s of sub) {
        result.push([t, ...s]);
      }
    }
    return result;
  },

  // 플랜이 선수 수로 실행 가능한지 확인
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
  generateSlotMatches(males, females, courts, gameCounts, allowMixed, usedTeams) {
    // 코트를 최대한 채우는 유효한 플랜 찾기
    let validPlans = [];
    for (let n = courts; n >= 1; n--) {
      const plans = this.generatePlans(n, allowMixed);
      validPlans = plans.filter(p => this.isPlanValid(p, males.length, females.length));
      if (validPlans.length > 0) break;
    }

    if (validPlans.length === 0) return [];

    // 유효한 플랜 중 랜덤 선택
    const plan = validPlans[Math.floor(Math.random() * validPlans.length)];

    // NTRP 맵 + 가용 선수 정렬: 경기 수 적은 순 (동점 셔플)
    const ntrpMap = this.buildNtrpMap();
    let availM = this.sortByCountShuffled(males, gameCounts);
    let availF = this.sortByCountShuffled(females, gameCounts);

    const matches = [];

    // 성별 지정 타입(XD/MD/WD) 먼저, FD(섞어복식)는 나중에 처리
    const orderedPlan = plan.map((gameType, idx) => ({ gameType, court: idx + 1 }));
    orderedPlan.sort((a, b) => (a.gameType === 'FD' ? 1 : 0) - (b.gameType === 'FD' ? 1 : 0));

    orderedPlan.forEach(({ gameType, court }) => {
      let team1, team2;
      let displayType = gameType;

      if (gameType === 'FD') {
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

      // 사용된 팀 기록
      this.recordTeam(usedTeams, team1);
      this.recordTeam(usedTeams, team2);

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
  generate(males, females, courts, startTime, endTime, allowMixed) {
    const slots = this.calculateTimeSlots(startTime, endTime);
    const gameCounts = {};
    [...males, ...females].forEach(p => { gameCounts[p] = 0; });
    const usedTeams = new Map(); // 팀키 → 횟수

    const timeSlots = slots.map(time => {
      const matches = this.generateSlotMatches(males, females, courts, gameCounts, allowMixed, usedTeams);
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

  // 선수별 통계 계산
  calcPlayerStats(tournament) {
    const stats = {};
    const allPlayers = [...(tournament.males || []), ...(tournament.females || [])];
    allPlayers.forEach(p => { stats[p] = { name: p, games: 0, wins: 0, losses: 0, draws: 0, matchPoints: 0, scorePoints: 0 }; });

    for (const slot of tournament.timeSlots) {
      for (const m of slot.matches) {
        const t1 = m.player1.split(' / ');
        const t2 = m.player2.split(' / ');
        [...t1, ...t2].forEach(p => {
          if (!stats[p]) stats[p] = { name: p, games: 0, wins: 0, losses: 0, draws: 0, matchPoints: 0, scorePoints: 0 };
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

  // 대진표 렌더링
  render(container, tournament) {
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

    container.innerHTML = `
      <div>
        <div id="schedule-header" class="mb-4 pb-1">
          <div class="flex items-start justify-between gap-2">
            <h3 id="schedule-title" class="text-xl font-bold text-gray-800 cursor-pointer hover:text-green-700 transition flex-1 min-w-0" title="클릭하여 이름 수정">${Results.escapeHtml(tournament.name)} <svg class="w-3.5 h-3.5 inline-block text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></h3>
            <span class="text-sm font-medium whitespace-nowrap flex-shrink-0 ${isComplete ? 'text-green-600' : 'text-orange-600'}">
              ${completedMatches}/${totalMatches} 완료
            </span>
          </div>
          <p class="text-sm text-gray-500 mt-1">
            ${tournament.startTime} ~ ${tournament.endTime} · 코트 ${maxCourts}면 · ${playerInfo}
          </p>
          <div class="flex items-center gap-2 mt-3">
            <button id="add-match-btn" class="text-sm px-3 py-1.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 active:scale-[0.98] transition-all font-medium flex items-center gap-1 shadow-sm shadow-green-200/50">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              대진 추가
            </button>
            <button id="pdf-download-btn" class="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition font-medium flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              PDF
            </button>
          </div>
        </div>

        <!-- 시간표 -->
        <div class="space-y-4 mb-6">
          ${tournament.timeSlots.map((slot, si) => `
            <div class="schedule-slot" data-slot="${si}">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-sm font-bold text-gray-700 bg-gray-100 px-3 py-1 rounded-full">${slot.time}</span>
                <div class="flex-1 border-t border-gray-200"></div>
              </div>
              <div class="grid gap-2 schedule-grid" style="grid-template-columns: repeat(${tournament.courts}, 1fr)">
                ${slot.matches.length > 0
                  ? slot.matches.map((match, mi) => this.renderMatchCard(match, si, mi)).join('')
                  : `<div class="col-span-full text-center py-3 text-sm text-gray-300 italic border border-dashed border-gray-200 rounded-xl">대진 없음</div>`}
              </div>
            </div>
          `).join('')}
        </div>

        <!-- 선수별 통계 -->
        <div id="stats-section" class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-green-50/30 border border-white/60 overflow-hidden">
          <div class="px-4 py-3 bg-gray-50/50 border-b border-gray-100">
            <span class="font-semibold text-gray-700 text-sm">선수별 통계</span>
          </div>
          <table class="w-full text-sm standings-table">
            <thead>
              <tr class="border-b border-gray-100 text-gray-500 text-xs">
                <th class="text-left px-4 py-2">선수</th>
                <th class="text-center px-2 py-2">경기</th>
                <th class="text-center px-2 py-2">승</th>
                <th class="text-center px-2 py-2">무</th>
                <th class="text-center px-2 py-2">패</th>
                <th class="text-center px-2 py-2">승점</th>
                <th class="text-center px-2 py-2">포인트</th>
              </tr>
            </thead>
            <tbody>
              ${(() => { const allPlayersData = Storage.getPlayers(); return playerStats.map(s => {
                const pd = allPlayersData.find(pl => pl.name === s.name);
                const gender = pd?.gender;
                const ntrp = pd?.ntrp || 2.5;
                return `
                  <tr class="border-b border-gray-50 hover:bg-gray-50">
                    <td class="px-4 py-2 font-medium text-gray-800">
                      ${Results.escapeHtml(s.name)}
                      <span class="text-xs px-1 py-0.5 rounded font-medium ${gender === 'M' ? 'bg-blue-100 text-blue-700' : gender === 'F' ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-500'}">${gender === 'M' ? '남' : gender === 'F' ? '여' : '-'}</span>
                      <span class="text-xs px-1 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">${ntrp.toFixed(1)}</span>
                    </td>
                    <td class="text-center px-2 py-2 text-gray-600">${s.games}</td>
                    <td class="text-center px-2 py-2 text-green-600 font-medium">${s.wins}</td>
                    <td class="text-center px-2 py-2 text-gray-500">${s.draws}</td>
                    <td class="text-center px-2 py-2 text-red-500">${s.losses}</td>
                    <td class="text-center px-2 py-2 text-orange-600 font-bold">${s.matchPoints}</td>
                    <td class="text-center px-2 py-2 text-purple-600 font-medium">${s.scorePoints}</td>
                  </tr>`;
              }).join(''); })()}
            </tbody>
          </table>
        </div>
      </div>`;

    // PDF 다운로드
    const pdfBtn = container.querySelector('#pdf-download-btn');
    if (pdfBtn) {
      pdfBtn.onclick = () => this.exportPDF(container, tournament);
    }

    // 대진 추가
    const addMatchBtn = container.querySelector('#add-match-btn');
    if (addMatchBtn) {
      addMatchBtn.onclick = () => this.showAddMatchModal(container, tournament);
    }

    // 대진표 이름 수정
    const titleEl = container.querySelector('#schedule-title');
    if (titleEl) {
      titleEl.onclick = () => {
        const newName = prompt('대진표 이름을 입력하세요', tournament.name);
        if (newName !== null && newName.trim() !== '') {
          tournament.name = newName.trim();
          Storage.updateTournament(tournament);
          this.render(container, tournament);
        }
      };
    }

    // ─── 선수 탭-교환 + 매치 카드 드래그 ───
    const cards = container.querySelectorAll('.schedule-match-card');
    let selectedPlayer = null;

    // 선수 이름 탭 → 선택/교환
    container.querySelectorAll('.swap-player').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation(); // 카드 클릭(스코어) 방지

        const data = {
          slotIdx: +el.dataset.slotIdx, matchIdx: +el.dataset.matchIdx,
          team: +el.dataset.team, pos: +el.dataset.pos, name: el.dataset.name
        };

        if (!selectedPlayer) {
          // 첫 번째 선수 선택
          selectedPlayer = { el, ...data };
          el.classList.add('bg-green-200', 'ring-2', 'ring-green-500', 'rounded');
        } else if (selectedPlayer.slotIdx === data.slotIdx && selectedPlayer.matchIdx === data.matchIdx
          && selectedPlayer.team === data.team && selectedPlayer.pos === data.pos) {
          // 같은 선수 재탭 → 선택 해제
          selectedPlayer.el.classList.remove('bg-green-200', 'ring-2', 'ring-green-500', 'rounded');
          selectedPlayer = null;
        } else {
          // 두 번째 선수 탭 → 교환
          const src = selectedPlayer, tgt = data;
          const srcMatch = tournament.timeSlots[src.slotIdx].matches[src.matchIdx];
          const tgtMatch = tournament.timeSlots[tgt.slotIdx].matches[tgt.matchIdx];
          const srcKey = src.team === 1 ? 'player1' : 'player2';
          const tgtKey = tgt.team === 1 ? 'player1' : 'player2';
          const sameMatch = src.slotIdx === tgt.slotIdx && src.matchIdx === tgt.matchIdx;

          const clearSel = () => {
            selectedPlayer.el.classList.remove('bg-green-200', 'ring-2', 'ring-green-500', 'rounded');
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
              alert('같은 선수가 동일 경기에 중복됩니다.');
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
              alert('같은 선수가 동일 경기에 중복됩니다.');
              clearSel();
              return;
            }
            srcMatch[srcKey] = srcTeam.join(' / ');
            tgtMatch[tgtKey] = tgtTeam.join(' / ');
          }

          Storage.updateTournament(tournament);
          this.render(container, tournament);
        }
      });
    });

    // 카드 빈 영역 클릭 → 스코어 입력 (선수 선택 중이면 해제)
    cards.forEach(card => {
      card.addEventListener('click', () => {
        if (selectedPlayer) {
          selectedPlayer.el.classList.remove('bg-green-200', 'ring-2', 'ring-green-500', 'rounded');
          selectedPlayer = null;
          return;
        }
        const match = allMatches.find(m => m.id === card.dataset.matchId);
        if (!match) return;
        Results.showScoreModal(match, { setCount: 1, allowDraw: true }, (result) => {
          match.scores = result.scores;
          match.winner = result.winner;
          Storage.updateTournament(tournament);
          const allDone = this.getAllMatches(tournament).every(m => m.winner || m.winner === 'draw');
          if (allDone) {
            tournament.status = 'completed';
            tournament.completedAt = new Date().toISOString();
            Storage.updateTournament(tournament);
          }
          this.render(container, tournament);
        });
      });
    });

    // 대진 삭제 (X 버튼)
    container.querySelectorAll('.delete-match-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const si = +btn.dataset.slotIdx;
        const mi = +btn.dataset.matchIdx;
        const match = tournament.timeSlots[si]?.matches[mi];
        if (!match) return;
        const label = `${match.player1} vs ${match.player2}`;
        if (!confirm(`이 대진을 삭제하시겠습니까?\n${label}`)) return;
        tournament.timeSlots[si].matches.splice(mi, 1);
        tournament.timeSlots[si].matches.forEach((m, i) => m.court = i + 1);
        Storage.updateTournament(tournament);
        this.render(container, tournament);
      });
    });

    // 경기 종류 변경 (뱃지 클릭)
    container.querySelectorAll('.change-gametype-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const match = allMatches.find(m => m.id === btn.dataset.matchId);
        if (!match) return;
        this.showChangeGameTypeModal(container, tournament, match);
      });
    });

    // 데스크톱: HTML5 Drag and Drop (매치 카드 위치 교환)
    cards.forEach(card => {
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', `${card.dataset.slotIdx},${card.dataset.matchIdx}`);
        requestAnimationFrame(() => card.style.opacity = '0.4');
      });
      card.addEventListener('dragend', () => { card.style.opacity = ''; });
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.classList.add('ring-2', 'ring-green-500');
      });
      card.addEventListener('dragleave', () => card.classList.remove('ring-2', 'ring-green-500'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('ring-2', 'ring-green-500');
        const [si, mi] = e.dataTransfer.getData('text/plain').split(',').map(Number);
        const tSI = +card.dataset.slotIdx, tMI = +card.dataset.matchIdx;
        if (si === tSI && mi === tMI) return;
        const srcSlot = tournament.timeSlots[si], tgtSlot = tournament.timeSlots[tSI];
        [srcSlot.matches[mi], tgtSlot.matches[tMI]] = [tgtSlot.matches[tMI], srcSlot.matches[mi]];
        srcSlot.matches.forEach((m, i) => m.court = i + 1);
        if (si !== tSI) tgtSlot.matches.forEach((m, i) => m.court = i + 1);
        Storage.updateTournament(tournament);
        this.render(container, tournament);
      });
    });
  },

  // PDF 내보내기 (타임슬롯 단위 캡처, 페이지당 4개)
  async exportPDF(container, tournament) {
    const btn = container.querySelector('#pdf-download-btn');
    const origText = btn.innerHTML;
    btn.innerHTML = '생성 중...';
    btn.disabled = true;

    try {
      const { jsPDF } = window.jspdf;

      // PDF에서 숨길 요소 (기록 탭에서는 통계 포함)
      const hideSelector = tournament.status === 'completed'
        ? '#pdf-download-btn, #add-match-btn, .schedule-match-card p, .delete-match-btn'
        : '#pdf-download-btn, #add-match-btn, .schedule-match-card p, .delete-match-btn, #stats-section';
      const hideEls = container.querySelectorAll(hideSelector);
      hideEls.forEach(el => el.style.display = 'none');

      // ── html2canvas + table HTML: 레이아웃 정확, 비대칭 패딩으로 텍스트 위치 보정 ──
      const captureOpts = { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollY: -window.scrollY };
      const headerCaptureW = '700px';

      // 헤더 캡처 (화면 DOM)
      const headerEl = container.querySelector('#schedule-header');
      const origHeaderW = headerEl.style.width;
      headerEl.style.width = headerCaptureW;
      const headerCanvas = await html2canvas(headerEl, captureOpts);
      headerEl.style.width = origHeaderW;

      // PDF 전용 table HTML로 슬롯 캡처 (html2canvas flex 버그 우회)
      const pdfBox = document.createElement('div');
      pdfBox.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(pdfBox);

      const slotDivs = [];
      for (const slot of tournament.timeSlots) {
        const d = document.createElement('div');
        d.innerHTML = this._renderPdfSlot(slot);
        pdfBox.appendChild(d);
        slotDivs.push(d);
      }
      await new Promise(r => requestAnimationFrame(r));

      const slotCanvases = [];
      for (const d of slotDivs) {
        slotCanvases.push(await html2canvas(d, { ...captureOpts, scrollY: 0 }));
      }
      document.body.removeChild(pdfBox);

      // 통계 테이블 캡처 (기록 탭일 때만)
      let statsCanvas = null;
      const statsEl = container.querySelector('#stats-section');
      if (tournament.status === 'completed' && statsEl) {
        const origStatsW = statsEl.style.width;
        statsEl.style.width = headerCaptureW;
        statsCanvas = await html2canvas(statsEl, captureOpts);
        statsEl.style.width = origStatsW;
      }

      // 숨긴 요소 복원
      hideEls.forEach(el => el.style.display = '');

      // PDF 생성 (2열, 페이지에 들어가는 만큼 채움)
      const pdf = new jsPDF('p', 'mm', 'a4');
      const margin = 10;
      const colGap = 4;
      const rowGap = 4;
      const contentW = 210 - margin * 2;
      const colW = (contentW - colGap) / 2;
      const pageH = 297;

      // 슬롯 1개의 자연 높이 (모두 동일한 코트 수이므로 첫 번째로 계산)
      const slotRowH = slotCanvases.length > 0
        ? (slotCanvases[0].height * colW) / slotCanvases[0].width
        : 0;

      const headerH = (headerCanvas.height * contentW) / headerCanvas.width;
      let currentY = margin;
      let slotIdx = 0;
      let pageNum = 0;

      while (slotIdx < slotCanvases.length) {
        if (pageNum > 0) pdf.addPage();
        currentY = margin;

        // 첫 페이지에 헤더 삽입
        if (pageNum === 0) {
          pdf.addImage(headerCanvas.toDataURL('image/png'), 'PNG', margin, currentY, contentW, headerH);
          currentY += headerH + rowGap;
        }

        // 남은 공간에 행을 채울 수 있는 만큼 배치
        while (slotIdx < slotCanvases.length) {
          const remainH = pageH - margin - currentY;
          if (remainH < slotRowH * 0.9) break; // 다음 행이 들어갈 공간 부족

          // 2열 배치
          for (let col = 0; col < 2 && slotIdx < slotCanvases.length; col++) {
            const canvas = slotCanvases[slotIdx];
            const x = margin + col * (colW + colGap);
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, currentY, colW, slotRowH);
            slotIdx++;
          }

          currentY += slotRowH + rowGap;
        }

        pageNum++;
      }

      // 통계 테이블 추가 (기록 탭)
      if (statsCanvas) {
        const statsH = (statsCanvas.height * contentW) / statsCanvas.width;
        const remainH = pageH - margin - currentY;

        if (statsH > remainH) pdf.addPage();
        const statsY = statsH > remainH ? margin : currentY;
        pdf.addImage(statsCanvas.toDataURL('image/png'), 'PNG', margin, statsY, contentW, statsH);
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

  // 선수 이름을 개별 탭 가능한 span으로 렌더링
  renderSwapPlayer(name, slotIdx, matchIdx, team, pos) {
    const allPlayers = Storage.getPlayers();
    const pd = allPlayers.find(p => p.name === name);
    const ntrp = (pd?.ntrp || 2.5).toFixed(1);
    return `<span class="swap-player cursor-pointer hover:bg-yellow-100 rounded px-0.5 transition inline-flex items-center gap-0.5"
      data-slot-idx="${slotIdx}" data-match-idx="${matchIdx}" data-team="${team}" data-pos="${pos}"
      data-name="${Results.escapeHtml(name)}">${Results.escapeHtml(name)}<span class="text-yellow-600 text-xs">${ntrp}</span></span>`;
  },

  // 매치 카드 HTML
  renderMatchCard(match, slotIdx, matchIdx) {
    const cfg = SCHEDULE_GAME_TYPES[match.gameType];
    const hasResult = !!match.winner || !!match.scores;
    const isDraw = match.winner === 'draw';
    const t1Names = match.player1.split(' / ');
    const t2Names = match.player2.split(' / ');
    const t1Html = t1Names.map((n, p) => this.renderSwapPlayer(n, slotIdx, matchIdx, 1, p)).join(' <span class="text-gray-300">/</span> ');
    const t2Html = t2Names.map((n, p) => this.renderSwapPlayer(n, slotIdx, matchIdx, 2, p)).join(' <span class="text-gray-300">/</span> ');
    const isWin1 = !isDraw && match.winner === match.player1;
    const isWin2 = !isDraw && match.winner === match.player2;

    const borderColor = isDraw ? 'border-yellow-200' : (hasResult ? 'border-green-200' : 'border-gray-200');
    const t1Bg = isDraw ? 'bg-yellow-50' : (isWin1 ? 'bg-green-50' : 'bg-gray-50');
    const t2Bg = isDraw ? 'bg-yellow-50' : (isWin2 ? 'bg-green-50' : 'bg-gray-50');
    const t1TextClass = isDraw ? 'text-yellow-700' : (isWin1 ? 'text-green-700' : 'text-gray-800');
    const t2TextClass = isDraw ? 'text-yellow-700' : (isWin2 ? 'text-green-700' : 'text-gray-800');
    const s1Class = isDraw ? 'text-yellow-600' : (isWin1 ? 'text-green-600' : 'text-gray-500');
    const s2Class = isDraw ? 'text-yellow-600' : (isWin2 ? 'text-green-600' : 'text-gray-500');

    return `
      <div class="schedule-match-card relative bg-white border ${borderColor} rounded-xl p-3 cursor-pointer hover:shadow-md transition"
           draggable="true" data-match-id="${match.id}" data-slot-idx="${slotIdx}" data-match-idx="${matchIdx}">
        <button type="button" class="delete-match-btn absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-full text-gray-300 hover:bg-red-50 hover:text-red-500 transition" data-slot-idx="${slotIdx}" data-match-idx="${matchIdx}">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
        <div class="flex items-center justify-between mb-2 pr-5">
          <span class="change-gametype-btn text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badgeClass} cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-green-400 transition" data-match-id="${match.id}">${cfg.label}</span>
          <span class="text-xs text-gray-400">코트 ${match.court}</span>
        </div>
        <div class="space-y-0.5">
          <div class="flex items-center justify-between ${t1Bg} rounded-lg px-2 py-2.5">
            <span class="text-xs sm:text-sm font-medium ${t1TextClass} flex-1" style="min-width:0">
              ${isWin1 ? '🏆 ' : ''}${isDraw ? '🤝 ' : ''}${t1Html}
            </span>
            ${hasResult && match.scores ? `<span class="text-xs font-bold ${s1Class} ml-1 flex-shrink-0">${match.scores[0][0]}</span>` : ''}
          </div>
          <div class="text-center text-xs text-gray-300 leading-tight">vs</div>
          <div class="flex items-center justify-between ${t2Bg} rounded-lg px-2 py-2.5">
            <span class="text-xs sm:text-sm font-medium ${t2TextClass} flex-1" style="min-width:0">
              ${isWin2 ? '🏆 ' : ''}${isDraw ? '🤝 ' : ''}${t2Html}
            </span>
            ${hasResult && match.scores ? `<span class="text-xs font-bold ${s2Class} ml-1 flex-shrink-0">${match.scores[0][1]}</span>` : ''}
          </div>
        </div>
        ${!hasResult ? '<p class="text-xs text-gray-400 text-center mt-1.5">탭하여 스코어 입력</p>' : ''}
      </div>`;
  },

  // ── PDF 전용 table HTML (html2canvas flex 버그 우회) ──
  // 핵심: html2canvas는 텍스트를 셀 하단에 렌더링하므로, padding-top을 줄이고 padding-bottom을 늘려서 시각적 가운데로 보정

  _renderPdfSlot(slot) {
    const n = slot.matches.length;
    const cards = slot.matches.map(m =>
      `<td style="width:${Math.floor(100/n)}%;vertical-align:top;padding:0 3px;">${this._renderPdfCard(m)}</td>`
    ).join('');
    // ── [패딩 조정] 시간 뱃지 (20:00): padding: 상 좌우 하 좌우 ──
    const timePad = 'padding:0 12px 12px 12px';
    return `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;width:450px;">
        <div style="margin-bottom:8px;">
          <span style="display:inline-block;font-size:13px;font-weight:700;color:#374151;background:#f3f4f6;${timePad};border-radius:999px;line-height:1;">${slot.time}</span>
        </div>
        <table style="width:100%;border-collapse:separate;border-spacing:4px 0;"><tr>${cards}</tr></table>
      </div>`;
  },

  _renderPdfCard(match) {
    const cfg = SCHEDULE_GAME_TYPES[match.gameType];
    const hasScore = !!match.winner;
    const isWin1 = match.winner === match.player1;
    const isWin2 = match.winner === match.player2;
    const bMap = {
      XD:{bg:'#f3e8ff',c:'#7e22ce'}, MD:{bg:'#dbeafe',c:'#1d4ed8'},
      WD:{bg:'#fce7f3',c:'#be185d'}, FD:{bg:'#ffedd5',c:'#c2410c'},
    };
    const b = bMap[match.gameType] || {bg:'#f3f4f6',c:'#374151'};
    const border = hasScore ? '#bbf7d0' : '#e5e7eb';
    const allPlayers = Storage.getPlayers();

    // ── [패딩 조정] 선수이름 행: padding: 상 우 하 좌 ──
    const teamPad = 'padding:6px 8px 14px 8px';
    const scorePad = 'padding:6px 6px 14px 6px';
    // ── [패딩 조정] 게임타입 뱃지 (혼합복식): padding: 상 우 하 좌 ──
    const badgePad = 'padding:0 8px 8px 8px';
    // ── [패딩 조정] 코트번호 (코트 1): padding: 상 우 하 좌 ──
    const courtPad = 'padding:0 0 7px 0';

    const teamRow = (team, isWin, score) => {
      const bg = isWin ? '#f0fdf4' : '#f9fafb';
      const tc = isWin ? '#15803d' : '#1f2937';
      const sc = isWin ? '#16a34a' : '#6b7280';
      const names = team.split(' / ').map(name => {
        const p = allPlayers.find(x => x.name === name);
        const ntrp = (p?.ntrp || 2.5).toFixed(1);
        return `${Results.escapeHtml(name)}<span style="color:#ca8a04;font-size:10px;">${ntrp}</span>`;
      }).join(' <span style="color:#d1d5db;">/</span> ');
      return `<tr>
        <td style="background:${bg};border-radius:8px;${teamPad};font-size:12px;font-weight:500;color:${tc};line-height:1;">
          ${isWin ? '🏆 ' : ''}${names}
        </td>
        ${hasScore ? `<td style="background:${bg};${scorePad};text-align:right;font-size:12px;font-weight:700;color:${sc};white-space:nowrap;line-height:1;">${score}</td>` : ''}
      </tr>`;
    };

    return `
      <div style="border:1px solid ${border};border-radius:12px;padding:10px;background:#fff;margin-bottom:4px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
          <tr>
            <td style="line-height:1;"><span style="display:inline-block;font-size:11px;${badgePad};border-radius:999px;font-weight:500;background:${b.bg};color:${b.c};line-height:1;">${cfg.label}</span></td>
            <td style="text-align:right;font-size:11px;color:#9ca3af;line-height:1;${courtPad};">코트 ${match.court}</td>
          </tr>
        </table>
        <table style="width:100%;border-collapse:collapse;">
          ${teamRow(match.player1, isWin1, hasScore ? match.scores[0][0] : null)}
          <tr><td colspan="2" style="text-align:center;font-size:11px;color:#d1d5db;padding:2px 0;">vs</td></tr>
          ${teamRow(match.player2, isWin2, hasScore ? match.scores[0][1] : null)}
        </table>
      </div>`;
  },

  // 커스텀 대진 추가 모달
  showAddMatchModal(container, tournament) {
    const existing = document.querySelector('.add-match-modal');
    if (existing) existing.remove();

    const allPlayers = Storage.getPlayers();
    const selected = { t1p1: null, t1p2: null, t2p1: null, t2p2: null };

    const timeSlotOptions = tournament.timeSlots.map((s, i) =>
      `<option value="${i}">${s.time}</option>`
    ).join('');

    const modal = document.createElement('div');
    modal.className = 'add-match-modal fixed inset-0 z-50 flex items-end sm:items-center justify-center';
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';

    const renderModal = () => {
      const playerSlot = (key, label) => {
        const name = selected[key];
        const pd = name ? allPlayers.find(p => p.name === name) : null;
        if (name) {
          return `<div class="am-player-slot flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-xl cursor-pointer hover:bg-green-50 transition" data-key="${key}">
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-800 font-medium">${Results.escapeHtml(name)}</span>
              ${pd ? `<span class="text-xs px-1.5 py-0.5 rounded font-medium ${pd.gender === 'M' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}">${pd.gender === 'M' ? '남' : '여'}</span>
              <span class="text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">${(pd.ntrp || 2.5).toFixed(1)}</span>` : ''}
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
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-gray-600 mb-1">시간대</label>
                <select id="am-slot" class="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-green-500">
                  ${timeSlotOptions}
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-600 mb-1">경기 종류</label>
                <div class="flex gap-1.5 flex-wrap">
                  ${Object.entries(SCHEDULE_GAME_TYPES).map(([key, cfg]) =>
                    `<label class="cursor-pointer">
                      <input type="radio" name="am-gametype" value="${key}" ${key === 'XD' ? 'checked' : ''} class="sr-only peer">
                      <div class="px-2.5 py-1.5 rounded-lg text-xs font-medium border-2 border-gray-200 peer-checked:border-green-500 peer-checked:bg-green-50 transition">${cfg.icon} ${cfg.label}</div>
                    </label>`
                  ).join('')}
                </div>
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-1">코트 번호</label>
              <div class="flex gap-2">
                ${Array.from({length: tournament.courts}, (_, i) => `
                  <label class="flex-1 cursor-pointer">
                    <input type="radio" name="am-court" value="${i + 1}" ${i === 0 ? 'checked' : ''} class="sr-only peer">
                    <div class="border-2 border-gray-200 rounded-xl py-2 text-center peer-checked:border-green-500 peer-checked:bg-green-50 transition text-sm font-medium">${i + 1}번</div>
                  </label>
                `).join('')}
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-2">팀 1</label>
              <div class="space-y-2">
                ${playerSlot('t1p1', '선수 1 선택...')}
                ${playerSlot('t1p2', '선수 2 선택...')}
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-2">팀 2</label>
              <div class="space-y-2">
                ${playerSlot('t2p1', '선수 1 선택...')}
                ${playerSlot('t2p2', '선수 2 선택...')}
              </div>
            </div>

            <div class="flex gap-3 pt-2">
              <button type="button" class="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition am-cancel">취소</button>
              <button type="button" class="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition am-submit">추가</button>
            </div>
          </div>
        </div>`;
    };

    const refreshModal = () => {
      modal.innerHTML = renderModal();
      bindModalEvents();
    };

    const bindModalEvents = () => {
      modal.querySelector('.am-cancel').onclick = () => modal.remove();

      modal.querySelector('.am-submit').onclick = () => {
        const { t1p1, t1p2, t2p1, t2p2 } = selected;
        if (!t1p1 || !t1p2 || !t2p1 || !t2p2) {
          alert('모든 선수를 선택해주세요.');
          return;
        }
        const names = [t1p1, t1p2, t2p1, t2p2];
        if (new Set(names).size !== 4) {
          alert('중복된 선수가 있습니다.');
          return;
        }
        const slotIdx = parseInt(modal.querySelector('#am-slot').value);
        const gameType = modal.querySelector('input[name="am-gametype"]:checked').value;
        const court = parseInt(modal.querySelector('input[name="am-court"]:checked').value);

        tournament.timeSlots[slotIdx].matches.push({
          id: Storage.generateId(),
          court,
          gameType,
          player1: `${t1p1} / ${t1p2}`,
          player2: `${t2p1} / ${t2p2}`,
          scores: null,
          winner: null,
        });
        Storage.updateTournament(tournament);
        modal.remove();
        this.render(container, tournament);
      };

      // Player slot click → open picker
      modal.querySelectorAll('.am-player-slot').forEach(slot => {
        slot.onclick = (e) => {
          if (e.target.closest('.am-remove-player')) return;
          this._showPlayerPickerForSlot(modal, allPlayers, selected, slot.dataset.key, refreshModal);
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
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    bindModalEvents();
  },

  // 선수 선택 피커 (대진 추가용)
  _showPlayerPickerForSlot(parentModal, allPlayers, selected, slotKey, onDone) {
    const existing = document.querySelector('.am-player-picker');
    if (existing) existing.remove();

    const usedNames = new Set(Object.values(selected).filter(Boolean));

    const picker = document.createElement('div');
    picker.className = 'am-player-picker fixed inset-0 z-[60] flex items-end sm:items-center justify-center';
    picker.style.backgroundColor = 'rgba(0,0,0,0.5)';
    picker.innerHTML = `
      <div class="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-sm w-full p-4 max-h-[70vh] flex flex-col">
        <div class="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden"></div>
        <h3 class="text-lg font-bold text-center mb-3">선수 선택</h3>
        <div class="mb-3">
          <div class="flex gap-2">
            <input type="text" id="amp-search" placeholder="이름 검색 또는 직접 입력..."
              class="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500">
            <button type="button" id="amp-custom-add"
              class="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition whitespace-nowrap">추가</button>
          </div>
        </div>
        ${allPlayers.length > 0 ? `
          <div class="text-xs text-gray-400 mb-2">등록된 선수</div>
          <div class="overflow-y-auto flex-1 divide-y divide-gray-50">
            ${allPlayers.map(p => {
              const isUsed = usedNames.has(p.name);
              return `
                <div class="amp-option flex items-center px-3 py-2.5 ${isUsed ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-green-50'} transition"
                  data-name="${Results.escapeHtml(p.name)}" data-used="${isUsed}">
                  <span class="text-sm text-gray-800">${Results.escapeHtml(p.name)}</span>
                  <span class="ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${p.gender === 'M' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}">${p.gender === 'M' ? '남' : '여'}</span>
                  <span class="ml-1 text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">${(p.ntrp || 2.5).toFixed(1)}</span>
                  ${isUsed ? '<span class="ml-auto text-xs text-gray-400">선택됨</span>' : ''}
                </div>`;
            }).join('')}
          </div>
        ` : '<p class="text-sm text-gray-400 text-center py-4">등록된 선수가 없습니다.</p>'}
        <button type="button" class="mt-3 w-full py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition amp-cancel">취소</button>
      </div>`;

    document.body.appendChild(picker);
    picker.addEventListener('click', (e) => { if (e.target === picker) picker.remove(); });
    picker.querySelector('.amp-cancel').onclick = () => picker.remove();

    const searchInput = picker.querySelector('#amp-search');
    searchInput.focus();

    searchInput.oninput = () => {
      const q = searchInput.value.trim().toLowerCase();
      picker.querySelectorAll('.amp-option').forEach(opt => {
        opt.style.display = (!q || opt.dataset.name.toLowerCase().includes(q)) ? '' : 'none';
      });
    };

    // Direct input
    const addCustom = () => {
      const val = searchInput.value.trim();
      if (!val) return;
      if (usedNames.has(val)) { alert('이미 선택된 선수입니다.'); return; }
      selected[slotKey] = val;
      picker.remove();
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
        picker.remove();
        onDone();
      };
    });
  },

  // 경기 종류 변경 모달
  showChangeGameTypeModal(container, tournament, match) {
    const existing = document.querySelector('.change-gametype-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'change-gametype-modal fixed inset-0 z-50 flex items-end sm:items-center justify-center';
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
    modal.innerHTML = `
      <div class="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-sm w-full p-5">
        <div class="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden"></div>
        <h3 class="text-lg font-bold text-center mb-4">경기 종류 변경</h3>
        <div class="grid grid-cols-2 gap-2 mb-4">
          ${Object.entries(SCHEDULE_GAME_TYPES).map(([key, cfg]) =>
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
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector('.cgt-cancel').onclick = () => modal.remove();

    modal.querySelectorAll('.cgt-option').forEach(btn => {
      btn.onclick = () => {
        match.gameType = btn.dataset.type;
        Storage.updateTournament(tournament);
        modal.remove();
        this.render(container, tournament);
      };
    });
  },
};
