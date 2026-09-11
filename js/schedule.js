// schedule.js - 시간/코트 기반 대진표 생성 + 렌더링

const Schedule = {
  // 시간 문자열에 분 더하기 헬퍼
  _addMinutes(timeStr, minutes) {
    const [h, m] = timeStr.split(':').map(Number);
    const total = h * 60 + m + minutes;
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  },

  // 시간 슬롯 계산 (warmupMinutes 후 gameMinutes 단위)
  calculateTimeSlots(startTime, endTime, warmupMinutes, gameMinutes) {
    warmupMinutes = warmupMinutes || 0;
    gameMinutes = gameMinutes || 30;
    const slots = [];
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let current = sh * 60 + sm + warmupMinutes;
    const end = eh * 60 + em;

    while (current + gameMinutes <= end) {
      const h = Math.floor(current / 60);
      const m = current % 60;
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      current += gameMinutes;
    }
    return slots;
  },

  // 가용 멤버로 가능한 게임 타입 확인
  getPossibleTypes(availMales, availFemales, allowMixed, isSingles, allowXD) {
    const types = [];
    if (isSingles) {
      if (availMales.length >= 2) types.push('MS');
      if (availFemales.length >= 2) types.push('WS');
      if (allowMixed && (availMales.length + availFemales.length) >= 2) types.push('FS');
    } else {
      if (allowXD && availMales.length >= 2 && availFemales.length >= 2) types.push('XD');
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
      { t1: [f1, m1], t2: [f2, m2], diff: Math.abs((nm1 + nf1) - (nm2 + nf2)) },
      { t1: [f2, m1], t2: [f1, m2], diff: Math.abs((nm1 + nf2) - (nm2 + nf1)) },
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
  generatePlans(numCourts, allowMixed, isSingles, allowXD) {
    let types;
    if (isSingles) {
      types = allowMixed ? ['MS', 'WS', 'FS'] : ['MS', 'WS'];
    } else {
      types = [];
      if (allowXD) types.push('XD');
      types.push('MD', 'WD');
      if (allowMixed) types.push('FD');
    }
    if (numCourts === 0) return [[]];
    const result = [];
    const sub = this.generatePlans(numCourts - 1, allowMixed, isSingles, allowXD);
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

  // 수동 모드: typeDistribution → 슬롯별 플랜 배분
  distributeTypesToSlots(typeDistribution, numSlots, courts, maleCount, femaleCount) {
    const types = Object.keys(typeDistribution).filter(t => typeDistribution[t] > 0);
    const remaining = {};
    types.forEach(t => { remaining[t] = typeDistribution[t]; });
    const slotPlans = Array.from({ length: numSlots }, () => []);

    const validPlansForSlot = (rem, size) => {
      const avail = types.filter(t => rem[t] > 0);
      if (size === 0 || avail.length === 0) return [[]];
      const results = [];
      const build = (combo, startIdx, used) => {
        if (combo.length === size) {
          if (this.isPlanValid(combo, maleCount, femaleCount)) results.push([...combo]);
          return;
        }
        for (let i = startIdx; i < avail.length; i++) {
          const t = avail[i];
          if ((used[t] || 0) < rem[t]) {
            combo.push(t);
            used[t] = (used[t] || 0) + 1;
            build(combo, i, used);
            combo.pop();
            used[t]--;
          }
        }
      };
      build([], 0, {});
      return results;
    };

    const solve = (slotIdx) => {
      const totalRem = types.reduce((s, t) => s + remaining[t], 0);
      if (totalRem === 0) return true;
      if (slotIdx >= numSlots) return false;
      const size = Math.min(courts, totalRem);
      const plans = validPlansForSlot(remaining, size);
      for (let i = plans.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [plans[i], plans[j]] = [plans[j], plans[i]];
      }
      for (const plan of plans) {
        plan.forEach(t => remaining[t]--);
        slotPlans[slotIdx] = plan;
        if (solve(slotIdx + 1)) return true;
        plan.forEach(t => remaining[t]++);
      }
      slotPlans[slotIdx] = [];
      return false;
    };

    if (!solve(0)) return null;
    for (let i = slotPlans.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slotPlans[i], slotPlans[j]] = [slotPlans[j], slotPlans[i]];
    }
    return slotPlans;
  },

  // 플랜별 게임 수 균형 점수 계산 → 가장 균형 잡힌 플랜 선택
  selectBestPlan(plans, males, females, gameCounts) {
    const allPlayers = [...males, ...females];
    const candidates = [];

    for (const plan of plans) {
      // 이 플랜이 필요로 하는 성별별 인원 계산
      let needM = 0, needF = 0, needAny = 0;
      for (const type of plan) {
        const cfg = SCHEDULE_GAME_TYPES[type];
        needM += cfg.needM;
        needF += cfg.needF;
        if (cfg.needAny) needAny += cfg.needAny;
      }

      // 시뮬레이션: 게임 수 적은 순으로 선택 (실제 로직과 동일)
      const sortedM = [...males].sort((a, b) => (gameCounts[a] || 0) - (gameCounts[b] || 0));
      const sortedF = [...females].sort((a, b) => (gameCounts[a] || 0) - (gameCounts[b] || 0));

      const pickedM = sortedM.slice(0, needM);
      const pickedF = sortedF.slice(0, needF);

      // needAny(섞어복식/단식)는 남은 풀에서 게임 수 적은 순으로
      const remainAll = [...sortedM.slice(needM), ...sortedF.slice(needF)]
        .sort((a, b) => (gameCounts[a] || 0) - (gameCounts[b] || 0));
      const pickedAny = remainAll.slice(0, needAny);

      // 이 플랜 실행 후 예상 게임 수 시뮬레이션
      const simCounts = {};
      allPlayers.forEach(p => { simCounts[p] = gameCounts[p] || 0; });
      [...pickedM, ...pickedF, ...pickedAny].forEach(p => { simCounts[p]++; });

      // 점수: max - min 차이 (낮을수록 균형적)
      const counts = allPlayers.map(p => simCounts[p]);
      const score = Math.max(...counts) - Math.min(...counts);

      candidates.push({ plan, score });
    }

    // 최저 점수(가장 균형적인) 플랜들 중 랜덤 선택
    candidates.sort((a, b) => a.score - b.score);
    const bestScore = candidates[0].score;
    const best = candidates.filter(c => c.score === bestScore);
    return best[Math.floor(Math.random() * best.length)].plan;
  },

  // 한 타임슬롯의 매치 생성 (플랜 기반)
  generateSlotMatches(males, females, courts, gameCounts, allowMixed, usedTeams, isSingles, allowXD, forcedPlan) {
    let plan;
    if (forcedPlan) {
      plan = forcedPlan;
    } else {
      // 코트를 최대한 채우는 유효한 플랜 찾기
      let validPlans = [];
      for (let n = courts; n >= 1; n--) {
        const plans = this.generatePlans(n, allowMixed, isSingles, allowXD);
        validPlans = plans.filter(p => this.isPlanValid(p, males.length, females.length));
        if (validPlans.length > 0) break;
      }

      if (validPlans.length === 0) return [];

      // 게임 수 균형을 고려하여 최적 플랜 선택
      plan = this.selectBestPlan(validPlans, males, females, gameCounts);
    }

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
        // 여자를 앞에 표시
        const femSort = (a, b) => (males.includes(a) ? 1 : 0) - (males.includes(b) ? 1 : 0);
        team1.sort(femSort);
        team2.sort(femSort);
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

  // 대진표 생성 (lateEntries: { playerName: "HH:MM" } | null, typeDistribution: { MD: 3, XD: 2 } | null)
  generate(males, females, courts, startTime, endTime, allowMixed, isSingles, allowXD, lateEntries, typeDistribution, warmupMinutes, gameMinutes) {
    const slots = this.calculateTimeSlots(startTime, endTime, warmupMinutes, gameMinutes);
    const gameCounts = {};
    [...males, ...females].forEach(p => { gameCounts[p] = 0; });
    const usedTeams = new Map(); // 팀키 → 횟수

    // 늦게 참여하는 멤버: 빠지는 슬롯 수만큼 음수로 초기화 → 이후 슬롯에서 우선 배정
    if (lateEntries) {
      for (const [player, lateTime] of Object.entries(lateEntries)) {
        const missedSlots = slots.filter(t => t < lateTime).length;
        if (missedSlots > 0 && gameCounts.hasOwnProperty(player)) {
          gameCounts[player] = -missedSlots;
        }
      }
    }

    // 수동 모드: 게임 종류 분배를 슬롯별 플랜으로 변환
    let slotPlans = null;
    if (typeDistribution) {
      slotPlans = this.distributeTypesToSlots(typeDistribution, slots.length, courts, males.length, females.length);
      if (slotPlans) {
        const planCounts = {};
        for (const sp of slotPlans) {
          for (const t of sp) planCounts[t] = (planCounts[t] || 0) + 1;
        }
        for (const [t, cnt] of Object.entries(typeDistribution)) {
          if ((planCounts[t] || 0) !== cnt) { slotPlans = null; break; }
        }
      }
      if (!slotPlans) {
        slotPlans = this.distributeTypesToSlots(typeDistribution, slots.length, courts, males.length, females.length);
      }
    }

    const timeSlots = slots.map((time, idx) => {
      let slotMales = males, slotFemales = females;
      if (lateEntries) {
        slotMales = males.filter(p => !lateEntries[p] || lateEntries[p] <= time);
        slotFemales = females.filter(p => !lateEntries[p] || lateEntries[p] <= time);
      }
      const forcedPlan = slotPlans ? slotPlans[idx] : null;
      const matches = this.generateSlotMatches(slotMales, slotFemales, courts, gameCounts, allowMixed, usedTeams, isSingles, allowXD, forcedPlan);
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
    const ensure = (p) => { if (!stats[p]) stats[p] = { name: p, games: 0, wins: 0, losses: 0, draws: 0, matchPoints: 0, scorePoints: 0, md: 0, wd: 0, xd: 0, fd: 0, ms: 0, ws: 0 }; };

    for (const slot of tournament.timeSlots) {
      for (const m of slot.matches) {
        if (!m.player1 || !m.player2) continue;
        const t1 = m.player1.split(' / ');
        const t2 = m.player2.split(' / ');
        [...t1, ...t2].forEach(p => {
          ensure(p);
          stats[p].games++;
          // 게임 종류별 카운트
          const gt = m.gameType;
          if (gt === 'MD') stats[p].md++;
          else if (gt === 'WD') stats[p].wd++;
          else if (gt === 'XD') stats[p].xd++;
          else if (gt === 'FD' || gt === 'FS') stats[p].fd++;
          else if (gt === 'MS') stats[p].ms++;
          else if (gt === 'WS') stats[p].ws++;
        });
        if (m.winner === 'draw') {
          [...t1, ...t2].forEach(p => { if (stats[p]) stats[p].draws++; });
        } else if (m.winner) {
          const winners = m.winner.split(' / ');
          const losers = m.winner === m.player1 ? t2 : t1;
          winners.forEach(p => { if (stats[p]) stats[p].wins++; });
          losers.forEach(p => { if (stats[p]) stats[p].losses++; });
        }
      }
    }

    // 승점 계산: 승=3, 무=1, 패=0  /  포인트 계산: 승=+1, 무=0, 패=-1
    Object.values(stats).forEach(s => {
      s.matchPoints = s.wins * 3 + s.draws * 1;
      s.scorePoints = s.wins - s.losses;
    });

    return Object.values(stats).sort((a, b) => b.scorePoints - a.scorePoints || b.matchPoints - a.matchPoints || a.games - b.games);
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

      }
    }

    Object.values(stats).forEach(s => {
      s.matchPoints = s.wins * 3 + s.draws * 1;
      s.scorePoints = s.wins - s.losses;
    });

    return Object.values(stats).sort((a, b) => b.scorePoints - a.scorePoints || b.matchPoints - a.matchPoints || a.games - b.games);
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
      if (m.player1) m.player1.split(' / ').forEach(n => uniqueNames.add(n));
      if (m.player2) m.player2.split(' / ').forEach(n => uniqueNames.add(n));
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
            <h3 id="schedule-title" class="text-xl font-bold text-gray-800 cursor-pointer hover:text-blue-700 transition flex-1 min-w-0" title="클릭하여 이름 수정">${Results.escapeHtml(tournament.name)} <svg class="w-3.5 h-3.5 inline-block text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></h3>
            <span class="text-sm font-medium whitespace-nowrap flex-shrink-0 ${isComplete ? 'text-blue-700' : 'text-orange-600'}">
              ${completedMatches}/${totalMatches} 완료
            </span>
          </div>
          <p class="text-sm text-gray-500 mt-1">
            ${tournament.isCustom ? '' : `${tournament.startTime} ~ ${tournament.endTime} · `}코트 ${maxCourts}면 · ${playerInfo}
          </p>
          <div class="flex items-center gap-2 mt-3">
            <button id="img-download-btn" class="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition font-medium flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              이미지 저장
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
            const _warmupMins = tournament.warmupMinutes || 0;
            const _gameMins = tournament.gameMinutes || 0;
            const warmupHtml = _warmupMins > 0 && tournament.startTime ? `
              <div class="flex items-center gap-2 mb-2">
                <span class="text-sm font-semibold text-orange-600 bg-orange-50 px-3 py-1.5 rounded-full">${tournament.startTime} ~ ${Schedule._addMinutes(tournament.startTime, _warmupMins)} 몸풀기</span>
                <div class="flex-1 border-t border-orange-200"></div>
              </div>` : '';
            return warmupHtml + tournament.timeSlots.map((slot, si) => {
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
                  <span class="text-sm font-bold text-gray-700 bg-gray-100 px-3 py-1 rounded-full">${_gameMins > 0 ? `${slot.time} ~ ${Schedule._addMinutes(slot.time, _gameMins)}` : slot.time}</span>
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
                            <button type="button" class="slot-add-extra-btn w-full py-1.5 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50/50 transition flex items-center justify-center gap-1" data-slot-idx="${si}" data-court="${c}" style="display:none">
                              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                              코트${c}
                            </button>
                          </div>`
                        : `<button type="button" class="slot-add-match-btn w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50/50 transition flex items-center justify-center gap-1" data-slot-idx="${si}" data-court="${c}" style="display:none">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                            대진 추가
                          </button>`}
                    </div>`;
                  }).join('')}
                </div>
                ${(() => {
                  const allPlayers = tournament.players || [];
                  if (allPlayers.length === 0) return '';
                  const busyNames = new Set();
                  slot.matches.forEach(m => {
                    if (m.player1) m.player1.split(' / ').forEach(n => busyNames.add(n));
                    if (m.player2) m.player2.split(' / ').forEach(n => busyNames.add(n));
                  });
                  const resting = allPlayers.filter(n => !busyNames.has(n));
                  if (resting.length === 0) return '';
                  return `<div class="resting-players mt-2 text-xs text-gray-400 flex items-center flex-wrap gap-1">
                    <span class="font-medium text-gray-500 flex-shrink-0">쉬는 멤버:</span>
                    ${resting.map(n => `<span class="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">${Results.escapeHtml(n)}</span>`).join('')}
                  </div>`;
                })()}
              </div>`;
            }).join('');
          })()}
        </div>

        ${!tournament.isCustom && (tournament.players || []).length > 0 ? (() => {
          const allPlayers = tournament.players;
          const slots = tournament.timeSlots || [];
          const slotTimes = slots.map(s => s.time);
          const savedLate = tournament.lateEntries || {};
          const slotBusyMap = slots.map(slot => {
            const busy = new Set();
            slot.matches.forEach(m => {
              if (m.player1) m.player1.split(' / ').forEach(n => busy.add(n));
              if (m.player2) m.player2.split(' / ').forEach(n => busy.add(n));
            });
            return busy;
          });
          const playerData = allPlayers.map(name => {
            const games = slotBusyMap.filter(busy => busy.has(name)).length;
            return { name, games };
          }).sort((a, b) => a.games - b.games || a.name.localeCompare(b.name, 'ko'));
          return `
          <div class="assignment-overview mb-4" style="display:none">
            <button type="button" class="assignment-toggle w-full flex items-center justify-between px-4 py-2.5 bg-white/80 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
              <span>배정 현황</span>
              <svg class="assignment-arrow w-4 h-4 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
            </button>
            <div class="assignment-body hidden mt-2 bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200">
              <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead>
                  <tr class="border-b border-gray-100 text-gray-400">
                    <th class="text-left px-3 py-2 sticky left-0 bg-white/90 z-10 font-medium">멤버</th>
                    <th class="text-center px-1 py-2 font-medium assign-start-col" style="display:none">시작</th>
                    ${slotTimes.map(t => `<th class="text-center px-1.5 py-2 font-medium whitespace-nowrap">${t}</th>`).join('')}
                    <th class="text-center px-2 py-2 font-medium">경기</th>
                  </tr>
                </thead>
                <tbody>
                  ${playerData.map(p => {
                    const curStart = savedLate[p.name] || slotTimes[0];
                    return `
                    <tr class="border-b border-gray-50 hover:bg-gray-50/50">
                      <td class="px-3 py-1.5 sticky left-0 bg-white/90 z-10 text-gray-700 font-medium whitespace-nowrap">${Results.escapeHtml(p.name)}</td>
                      <td class="text-center py-1 assign-start-col" style="display:none">
                        <select class="late-entry-select text-xs border border-gray-200 rounded px-1 py-0.5 bg-white" data-player="${Results.escapeHtml(p.name)}">
                          ${slotTimes.map(t => `<option value="${t}" ${t === curStart ? 'selected' : ''}>${t}</option>`).join('')}
                        </select>
                      </td>
                      ${slotBusyMap.map(busy => busy.has(p.name)
                        ? '<td class="text-center py-1.5"><span class="inline-block w-2 h-2 rounded-full bg-green-400"></span></td>'
                        : '<td class="text-center py-1.5 text-gray-300">-</td>'
                      ).join('')}
                      <td class="text-center py-1.5 font-bold ${p.games < playerData[playerData.length - 1].games ? 'text-orange-500' : 'text-gray-600'}">${p.games}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
              </div>
              <div class="assign-regen-wrap px-3 py-2 border-t border-gray-100 flex justify-end" style="display:none">
                <button type="button" class="assign-regen-btn px-4 py-1.5 text-xs font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition shadow-sm">대진표 재생성</button>
              </div>
            </div>
          </div>`;
        })() : ''}

        ${tournament.isTeamMode ? (() => {
          const teamStats = this.calcTeamStats(tournament);
          const medalPos = ['0%', '50%', '100%'];
          return `
          <!-- 팀별 통계 -->
          <div id="stats-section" class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-blue-50/30 border border-white/60 overflow-hidden mb-4">
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
                  const rank = teamStats.findIndex(p => p.scorePoints === s.scorePoints && p.matchPoints === s.matchPoints && p.games === s.games);
                  const medalHtml = isComplete && rank < 3 ? '<span style="display:inline-block;width:22px;height:26px;background:url(css/medal.png) no-repeat;background-size:300% auto;background-position:' + medalPos[rank] + ' center;vertical-align:middle;margin-right:2px;"></span>' : '';
                  return '<tr class="border-b border-gray-50 hover:bg-gray-50' + (isComplete && rank < 3 ? ' bg-gradient-to-r' + (rank === 0 ? ' from-yellow-50/60' : rank === 1 ? ' from-gray-50/60' : ' from-orange-50/60') + ' to-transparent' : '') + '">' +
                    '<td class="px-4 py-2 font-medium text-gray-800">' + medalHtml + Results.escapeHtml(s.name) + '</td>' +
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
          <!-- 멤버별 통계 -->
          <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-blue-50/30 border border-white/60 overflow-hidden">
            <div class="px-4 py-3 bg-gray-50/50 border-b border-gray-100">
              <span class="font-semibold text-gray-700 text-sm">멤버별 통계</span>
            </div>
            <div class="overflow-x-auto" style="max-height:400px;overflow-y:auto">
            <table class="w-full text-sm standings-table">
              <thead class="sticky top-0 bg-white z-10">
                <tr class="border-b border-gray-100 text-gray-500 text-xs">
                  <th class="text-left px-4 py-2">멤버</th>
                  <th class="text-center px-2 py-2">경기</th>
                  <th class="text-center px-1 py-2">남복</th>
                  <th class="text-center px-1 py-2">여복</th>
                  <th class="text-center px-1 py-2">혼복</th>
                  <th class="text-center px-1 py-2">잡복</th>
                  <th class="text-center px-1 py-2">남단</th>
                  <th class="text-center px-1 py-2">여단</th>
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
                  const teamName = buildTeamMap()[s.name] || '';
                  const rank = playerStats.findIndex(p => p.scorePoints === s.scorePoints && p.matchPoints === s.matchPoints && p.games === s.games);
                  const medalHtml = isComplete && rank < 3 ? '<span style="display:inline-block;width:22px;height:26px;background:url(\'css/medal.png\') no-repeat;background-size:300% auto;background-position:' + medalPos[rank] + ' center;vertical-align:middle;margin-right:2px;"></span>' : '';
                  return '<tr class="border-b border-gray-50 hover:bg-gray-50' + (isComplete && rank < 3 ? ' bg-gradient-to-r' + (rank === 0 ? ' from-yellow-50/60' : rank === 1 ? ' from-gray-50/60' : ' from-orange-50/60') + ' to-transparent' : '') + '">' +
                    '<td class="px-4 py-2 font-medium text-gray-800 whitespace-nowrap">' + medalHtml + Results.escapeHtml(s.name) +
                      ' ' + genderBadge(gender) +
                      (teamName ? ' <span class="text-xs px-1 py-0.5 rounded font-medium bg-blue-50 text-blue-700 border border-blue-200">' + Results.escapeHtml(teamName) + '</span>' : '') +
                    '</td>' +
                    '<td class="text-center px-2 py-2 text-gray-600">' + s.games + '</td>' +
                    '<td class="text-center px-1 py-2 text-blue-600">' + (s.md || 0) + '</td>' +
                    '<td class="text-center px-1 py-2 text-pink-600">' + (s.wd || 0) + '</td>' +
                    '<td class="text-center px-1 py-2 text-purple-600">' + (s.xd || 0) + '</td>' +
                    '<td class="text-center px-1 py-2 text-orange-600">' + (s.fd || 0) + '</td>' +
                    '<td class="text-center px-1 py-2 text-blue-600">' + (s.ms || 0) + '</td>' +
                    '<td class="text-center px-1 py-2 text-pink-600">' + (s.ws || 0) + '</td>' +
                    '<td class="text-center px-2 py-2 text-blue-700 font-medium">' + s.wins + '</td>' +
                    '<td class="text-center px-2 py-2 text-gray-500">' + s.draws + '</td>' +
                    '<td class="text-center px-2 py-2 text-red-500">' + s.losses + '</td>' +
                    '<td class="text-center px-2 py-2 text-orange-600 font-bold">' + s.matchPoints + '</td>' +
                    '<td class="text-center px-2 py-2 text-purple-600 font-medium">' + s.scorePoints + '</td>' +
                  '</tr>';
                }).join(''); })()}
              </tbody>
            </table>
            </div>
          </div>`;
        })() : `
        <!-- 멤버별 통계 -->
        <div id="stats-section" class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm shadow-blue-50/30 border border-white/60 overflow-hidden">
          <div class="px-4 py-3 bg-gray-50/50 border-b border-gray-100">
            <span class="font-semibold text-gray-700 text-sm">멤버별 통계</span>
          </div>
          <div class="overflow-x-auto" style="max-height:400px;overflow-y:auto">
          <table class="w-full text-sm standings-table">
            <thead class="sticky top-0 bg-white z-10">
              <tr class="border-b border-gray-100 text-gray-500 text-xs">
                <th class="text-left px-4 py-2">멤버</th>
                <th class="text-center px-2 py-2">경기</th>
                <th class="text-center px-1 py-2">남복</th>
                <th class="text-center px-1 py-2">여복</th>
                <th class="text-center px-1 py-2">혼복</th>
                <th class="text-center px-1 py-2">잡복</th>
                <th class="text-center px-1 py-2">남단</th>
                <th class="text-center px-1 py-2">여단</th>
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
                const rank = playerStats.findIndex(p => p.scorePoints === s.scorePoints && p.matchPoints === s.matchPoints && p.games === s.games);
                const medalHtml = isComplete && rank < 3 ? '<span style="display:inline-block;width:22px;height:26px;background:url(\'css/medal.png\') no-repeat;background-size:300% auto;background-position:' + medalPos[rank] + ' center;vertical-align:middle;margin-right:2px;"></span>' : '';
                return '<tr class="border-b border-gray-50 hover:bg-gray-50' + (isComplete && rank < 3 ? ' bg-gradient-to-r' + (rank === 0 ? ' from-yellow-50/60' : rank === 1 ? ' from-gray-50/60' : ' from-orange-50/60') + ' to-transparent' : '') + '">' +
                  '<td class="px-4 py-2 font-medium text-gray-800 whitespace-nowrap">' +
                    medalHtml + Results.escapeHtml(s.name) +
                    ' ' + genderBadge(gender) +
                    (!RolesConfig.hasAdminAccess() ? '' : ' <span class="text-xs px-1 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">' + ntrp.toFixed(1) + '</span>') +
                  '</td>' +
                  '<td class="text-center px-2 py-2 text-gray-600">' + s.games + '</td>' +
                  '<td class="text-center px-1 py-2 text-blue-600">' + (s.md || 0) + '</td>' +
                  '<td class="text-center px-1 py-2 text-pink-600">' + (s.wd || 0) + '</td>' +
                  '<td class="text-center px-1 py-2 text-purple-600">' + (s.xd || 0) + '</td>' +
                  '<td class="text-center px-1 py-2 text-orange-600">' + (s.fd || 0) + '</td>' +
                  '<td class="text-center px-1 py-2 text-blue-600">' + (s.ms || 0) + '</td>' +
                  '<td class="text-center px-1 py-2 text-pink-600">' + (s.ws || 0) + '</td>' +
                  '<td class="text-center px-2 py-2 text-blue-700 font-medium">' + s.wins + '</td>' +
                  '<td class="text-center px-2 py-2 text-gray-500">' + s.draws + '</td>' +
                  '<td class="text-center px-2 py-2 text-red-500">' + s.losses + '</td>' +
                  '<td class="text-center px-2 py-2 text-orange-600 font-bold">' + s.matchPoints + '</td>' +
                  '<td class="text-center px-2 py-2 text-purple-600 font-medium">' + s.scorePoints + '</td>' +
                '</tr>';
              }).join(''); })()}
            </tbody>
          </table>
          </div>
        </div>`}
      </div>`);

    // 관리자 권한 없는 멤버: 수정 UI 숨기기 (스코어 입력만 허용)
    if (!RolesConfig.hasAdminAccess()) {
      container.querySelectorAll('#add-match-btn, .delete-match-btn, .court-add-match-btn').forEach(el => el.style.display = 'none');
      const titleEl = container.querySelector('#schedule-title');
      if (titleEl) titleEl.style.cursor = 'default';
    }

    // 이미지 다운로드
    const imgBtn = container.querySelector('#img-download-btn');
    if (imgBtn) {
      imgBtn.onclick = () => this.exportImage(container, tournament);
    }

    if (RolesConfig.hasAdminAccess()) {
      // 배정 현황 오버뷰 표시 + 토글
      const overviewEl = container.querySelector('.assignment-overview');
      if (overviewEl) {
        overviewEl.style.display = '';
        overviewEl.querySelectorAll('.assign-start-col').forEach(el => el.style.display = '');
        const regenWrap = overviewEl.querySelector('.assign-regen-wrap');
        if (regenWrap) regenWrap.style.display = '';

        const toggleBtn = overviewEl.querySelector('.assignment-toggle');
        const body = overviewEl.querySelector('.assignment-body');
        const arrow = overviewEl.querySelector('.assignment-arrow');
        if (toggleBtn && body) {
          toggleBtn.onclick = () => {
            const isHidden = body.classList.contains('hidden');
            body.classList.toggle('hidden');
            if (arrow) arrow.style.transform = isHidden ? 'rotate(180deg)' : '';
          };
        }

        // 대진표 재생성 버튼
        const regenBtn = overviewEl.querySelector('.assign-regen-btn');
        if (regenBtn) {
          regenBtn.onclick = async () => {
            const hasScores = (tournament.timeSlots || []).some(slot =>
              slot.matches.some(m => m.scores || m.winner)
            );
            if (hasScores && !confirm('입력된 스코어가 초기화됩니다. 계속하시겠습니까?')) return;

            // lateEntries 수집
            const lateEntries = {};
            const firstTime = (tournament.timeSlots[0] || {}).time || tournament.startTime;
            overviewEl.querySelectorAll('.late-entry-select').forEach(sel => {
              const player = sel.dataset.player;
              const startTime = sel.value;
              if (startTime !== firstTime) {
                lateEntries[player] = startTime;
              }
            });

            // 대진표 재생성
            const newTimeSlots = Schedule.generate(
              tournament.males, tournament.females, tournament.courts,
              tournament.startTime, tournament.endTime,
              tournament.allowMixed, tournament.isSingles, tournament.allowXD || false,
              Object.keys(lateEntries).length > 0 ? lateEntries : null,
              tournament.typeDistribution || null,
              tournament.warmupMinutes || 10, tournament.gameMinutes || 25
            );

            const saveLate = lateEntries;
            await Storage.updateTournament(tournament.id, t => {
              t.timeSlots = newTimeSlots;
              t.lateEntries = saveLate;
              t.lastModified = Date.now();
            });
            this.render(container, Storage.getTournamentById(tournament.id) || tournament);
          };
        }
      }

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
            const trimmed = newName.trim();
            await Storage.updateTournament(tournament.id, t => { t.name = trimmed; });
            const fresh = Storage.getTournamentById(tournament.id) || tournament;
            this.render(container, fresh);
          }
        };
      }
    }

    // ─── 멤버 탭-교환 + 매치 카드 드래그 ───
    const cards = container.querySelectorAll('.schedule-match-card');
    let selectedPlayer = null;

    // 멤버 이름 탭 → 선택/교환 (관리자 권한만)
    container.querySelectorAll('.swap-player').forEach(el => {
      if (!RolesConfig.hasAdminAccess()) { el.style.cursor = 'default'; return; }
      el.onclick = async (e) => {
        e.stopPropagation(); // 카드 클릭(스코어) 방지

        const data = {
          slotIdx: +el.dataset.slotIdx, matchIdx: +el.dataset.matchIdx,
          team: +el.dataset.team, pos: +el.dataset.pos, name: el.dataset.name
        };

        if (!selectedPlayer) {
          // 첫 번째 멤버 선택
          selectedPlayer = { el, ...data };
          el.classList.add('bg-blue-200', 'ring-2', 'ring-blue-700', 'rounded');
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
                  selectedPlayer.el.classList.remove('bg-blue-200', 'ring-2', 'ring-blue-700', 'rounded');
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
          selectedPlayer.el.classList.remove('bg-blue-200', 'ring-2', 'ring-blue-700', 'rounded');
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
            selectedPlayer.el.classList.remove('bg-blue-200', 'ring-2', 'ring-blue-700', 'rounded');
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
            // 다른 시간대 간 교환: 이동 대상이 해당 시간대의 다른 매치에 이미 있는지 확인 (커스텀 대진표는 시간대 개념 없으므로 스킵)
            if (!tournament.isCustom && src.slotIdx !== tgt.slotIdx) {
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

          // 커스텀 대진표: 교환 후 gameType 자동 재감지
          if (tournament.isCustom) {
            const allP = Storage.getPlayers();
            const getG = (n) => { const p = allP.find(pl => pl.name === n); return p ? p.gender : null; };
            [srcMatch, tgtMatch].forEach(mm => {
              const p1s = mm.player1.split(' / '), p2s = mm.player2.split(' / ');
              if (p1s.length === 1 && p2s.length === 1) {
                const g1 = getG(p1s[0]), g2 = getG(p2s[0]);
                mm.gameType = (g1 === 'M' && g2 === 'M') ? 'MS' : (g1 === 'F' && g2 === 'F') ? 'WS' : 'FS';
              } else {
                const gs = [p1s[0], p1s[1], p2s[0], p2s[1]].map(getG);
                mm.gameType = gs.every(g => g === 'M') ? 'MD'
                  : gs.every(g => g === 'F') ? 'WD'
                  : ((gs[0] !== gs[1]) && (gs[2] !== gs[3]) && gs.filter(g => g === 'M').length === 2 && gs.filter(g => g === 'F').length === 2) ? 'XD' : 'FD';
              }
            });
          }
          const patchSrcId = srcMatch.id, patchTgtId = tgtMatch.id;
          const patchSrcP1 = srcMatch.player1, patchSrcP2 = srcMatch.player2;
          const patchTgtP1 = tgtMatch.player1, patchTgtP2 = tgtMatch.player2;
          const patchSrcGT = srcMatch.gameType, patchTgtGT = tgtMatch.gameType;
          await Storage.updateTournament(tournament.id, t => {
            for (const slot of t.timeSlots) {
              for (const m of slot.matches) {
                if (m.id === patchSrcId) { m.player1 = patchSrcP1; m.player2 = patchSrcP2; if (tournament.isCustom) m.gameType = patchSrcGT; }
                if (m.id === patchTgtId) { m.player1 = patchTgtP1; m.player2 = patchTgtP2; if (tournament.isCustom) m.gameType = patchTgtGT; }
              }
            }
          });
          this.render(container, Storage.getTournamentById(tournament.id) || tournament);
        }
      };
    });

    // 카드 빈 영역 클릭 → 스코어 입력 (멤버 선택 중이면 해제)
    const isMember = !RolesConfig.hasAdminAccess();
    cards.forEach(card => {
      card.onclick = () => {
        if (selectedPlayer) {
          selectedPlayer.el.classList.remove('bg-blue-200', 'ring-2', 'ring-blue-700', 'rounded');
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
          const scores = result.scores;
          const winner = result.winner;
          await Storage.updateTournament(tournamentId, t => {
            let targetMatch = null;
            for (const slot of t.timeSlots) {
              targetMatch = slot.matches.find(m => m.id === matchId);
              if (targetMatch) break;
            }
            if (!targetMatch) return;
            targetMatch.scores = scores;
            targetMatch.winner = winner;
            const allDone = Schedule.getAllMatches(t).every(m => m.winner || m.winner === 'draw');
            if (allDone) {
              t.status = 'completed';
              t.completedAt = new Date().toISOString();
            }
          });
          const freshTournament = Storage.getTournamentById(tournamentId);
          this.render(container, freshTournament || tournament);
        });
      };
    });

    // 대진 삭제 (X 버튼, 관리자 권한만)
    container.querySelectorAll('.delete-match-btn').forEach(btn => {
      if (!RolesConfig.hasAdminAccess()) return;
      btn.onclick = async (e) => {
        e.stopPropagation();
        const si = +btn.dataset.slotIdx;
        const mi = +btn.dataset.matchIdx;
        const match = tournament.timeSlots[si]?.matches[mi];
        if (!match) return;
        const label = `${match.player1} vs ${match.player2}`;
        if (!confirm(`이 대진을 삭제하시겠습니까?\n${label}`)) return;
        const delMatchId = match.id;
        await Storage.updateTournament(tournament.id, t => {
          for (const slot of t.timeSlots) {
            const idx = slot.matches.findIndex(m => m.id === delMatchId);
            if (idx !== -1) { slot.matches.splice(idx, 1); break; }
          }
        });
        this.render(container, Storage.getTournamentById(tournament.id) || tournament);
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

    // ── 드래그 (관리자 권한 전용) ──
    if (RolesConfig.hasAdminAccess()) {
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
        card.classList.add('ring-2', 'ring-blue-700');
      };
      card.ondragleave = () => card.classList.remove('ring-2', 'ring-blue-700');
      card.ondrop = async (e) => {
        e.preventDefault();
        card.classList.remove('ring-2', 'ring-blue-700');
        if (_dragType !== 'card') return;
        const [si, mi] = e.dataTransfer.getData('text/plain').split(',').map(Number);
        const tSI = +card.dataset.slotIdx, tMI = +card.dataset.matchIdx;
        if (si === tSI && mi === tMI) return;
        const srcSlot = tournament.timeSlots[si], tgtSlot = tournament.timeSlots[tSI];

        // 다른 시간대 간 교환: 멤버 중복 검사 (커스텀 대진표는 시간대 개념 없으므로 스킵)
        if (!tournament.isCustom && si !== tSI) {
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

        const srcMatchId = srcSlot.matches[mi].id;
        const tgtMatchId = tgtSlot.matches[tMI].id;
        const srcCourt = srcSlot.matches[mi].court;
        const tgtCourt = tgtSlot.matches[tMI].court;
        [srcSlot.matches[mi], tgtSlot.matches[tMI]] = [tgtSlot.matches[tMI], srcSlot.matches[mi]];
        srcSlot.matches[mi].court = srcCourt;
        tgtSlot.matches[tMI].court = tgtCourt;
        await Storage.updateTournament(tournament.id, t => {
          let sm = null, tm = null, smSlot = null, tmSlot = null;
          for (const slot of t.timeSlots) {
            for (const m of slot.matches) {
              if (m.id === srcMatchId) { sm = m; smSlot = slot; }
              if (m.id === tgtMatchId) { tm = m; tmSlot = slot; }
            }
          }
          if (sm && tm && smSlot && tmSlot) {
            const sIdx = smSlot.matches.indexOf(sm);
            const tIdx = tmSlot.matches.indexOf(tm);
            const sc = sm.court, tc = tm.court;
            [smSlot.matches[sIdx], tmSlot.matches[tIdx]] = [tmSlot.matches[tIdx], smSlot.matches[sIdx]];
            smSlot.matches[sIdx].court = sc;
            tmSlot.matches[tIdx].court = tc;
          }
        });
        this.render(container, Storage.getTournamentById(tournament.id) || tournament);
      };
    });

    // ── 시간대 통째로 교환 (데스크톱 DnD + 모바일 터치) ──
    const slotEls = container.querySelectorAll('.schedule-slot');
    const handles = container.querySelectorAll('.slot-drag-handle');

    // 시간대 교환 실행
    const swapSlots = async (srcIdx, tgtIdx) => {
      if (srcIdx === tgtIdx) return;
      await Storage.updateTournament(tournament.id, t => {
        const sm = t.timeSlots[srcIdx].matches;
        const tm = t.timeSlots[tgtIdx].matches;
        t.timeSlots[srcIdx].matches = tm;
        t.timeSlots[tgtIdx].matches = sm;
      });
      this.render(container, Storage.getTournamentById(tournament.id) || tournament);
    };

    handles.forEach(handle => {
      if (RolesConfig.hasAdminAccess()) handle.style.display = '';
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
          srcSlotEl.classList.add('ring-2', 'ring-blue-700', 'rounded-xl', 'bg-blue-50');
          handle.querySelector('svg').classList.replace('text-gray-300', 'text-blue-700');
          // 다른 시간대에 힌트
          slotEls.forEach(el => {
            if (parseInt(el.dataset.slot) !== idx) {
              el.querySelector('.slot-drag-handle svg')?.classList.add('text-blue-400');
              el.classList.add('ring-1', 'ring-dashed', 'ring-blue-300', 'rounded-xl');
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
        el.classList.remove('ring-2', 'ring-1', 'ring-blue-700', 'ring-dashed', 'ring-blue-300', 'rounded-xl', 'bg-blue-50');
        const svg = el.querySelector('.slot-drag-handle svg');
        if (svg) { svg.classList.remove('text-blue-700', 'text-blue-400'); svg.classList.add('text-gray-300'); }
      });
      _slotSelected = null;
    };

    // 빈 영역 클릭 시 선택 해제
    container.addEventListener('click', (e) => {
      if (_slotSelected !== null && !e.target.closest('.slot-drag-handle')) {
        clearSlotSelection();
      }
    });
    } // end if (RolesConfig.hasAdminAccess()) - 드래그
  },

  async exportImage(container, tournament) {
    const btn = container.querySelector('#img-download-btn');
    const origText = btn.innerHTML;
    btn.innerHTML = '생성 중...';
    btn.disabled = true;
    try {
      const canvas = this._drawBracketImage(tournament);
      // toBlob 방식: 대용량 이미지에서도 안정적 다운로드 (toDataURL 크기 제한 회피)
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `${tournament.name}.png`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      console.error('이미지 생성 오류:', e);
      alert('이미지 생성 중 오류가 발생했습니다.');
    } finally {
      btn.innerHTML = origText;
      btn.disabled = false;
    }
  },

  // 게임 타입별 라벨 + 뱃지 색상
  _typeColors: {
    XD: { label: '혼복', bg: '#ede9fe', text: '#6d28d9', border: '#c4b5fd' },
    MD: { label: '남복', bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' },
    WD: { label: '여복', bg: '#fce7f3', text: '#be185d', border: '#f9a8d4' },
    FD: { label: '섞어복', bg: '#fff7ed', text: '#c2410c', border: '#fdba74' },
    MS: { label: '남단', bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' },
    WS: { label: '여단', bg: '#fce7f3', text: '#be185d', border: '#f9a8d4' },
    FS: { label: '섞어단', bg: '#fff7ed', text: '#c2410c', border: '#fdba74' },
  },

  // Canvas 유틸: 둥근 사각형
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  // 대진표 이미지 Canvas 직접 그리기 (테이블 레이아웃)
  _drawBracketImage(tournament) {
    const FONT = '"Pretendard Variable", -apple-system, "Apple SD Gothic Neo", sans-serif';
    const DPR = 2;
    const W = 1080;
    const PAD = 30;
    const courtCount = tournament.courts || 1;
    const isCustom = !!tournament.isCustom;
    let slots = tournament.timeSlots || [];
    const gameMins = tournament.gameMinutes || 0;
    const warmupMins = tournament.warmupMinutes || 0;
    const isSingles = tournament.isSingles;
    let allPlayers = tournament.players || [];

    // ─ 커스텀 대진표: 매치에서 참가자·성별 추출 ─
    let malesArr = tournament.males || [];
    let femalesArr = tournament.females || [];
    if (isCustom && allPlayers.length === 0) {
      const nameSet = new Set();
      (tournament.timeSlots || []).forEach(s => s.matches.forEach(m => {
        if (m.player1) m.player1.split(' / ').forEach(n => nameSet.add(n));
        if (m.player2) m.player2.split(' / ').forEach(n => nameSet.add(n));
      }));
      allPlayers = [...nameSet];
      if (malesArr.length === 0 && femalesArr.length === 0) {
        const storedPlayers = Storage.getPlayers();
        const mList = [], fList = [];
        allPlayers.forEach(n => {
          const pd = storedPlayers.find(p => p.name === n);
          if (pd?.gender === 'F') fList.push(n);
          else mList.push(n);
        });
        malesArr = mList;
        femalesArr = fList;
      }
    }

    // ─ 성별 기반 색상 ─
    const maleSet = new Set(malesArr);
    const femaleSet = new Set(femalesArr);
    const isMale = (name) => maleSet.has(name);
    const isFemale = (name) => femaleSet.has(name);
    // 성별 색상: 남=파랑, 여=분홍
    const MALE_DOT = '#3b82f6';
    const FEMALE_DOT = '#ec4899';
    const MALE_BG = 'rgba(59,130,246,0.10)';
    const FEMALE_BG = 'rgba(236,72,153,0.10)';
    const pColor = (name) => isFemale(name) ? FEMALE_DOT : MALE_DOT;
    const pBg = (name) => isFemale(name) ? FEMALE_BG : MALE_BG;

    // ─ 팀전 모드: 팀 맵 ─
    const isTeamMode = !!tournament.isTeamMode;
    const _teamMap = isTeamMode ? buildTeamMap() : {};
    const getTeamName = (playerStr) => {
      if (!isTeamMode || !playerStr) return '';
      const names = playerStr.split(' / ');
      const teams = [...new Set(names.map(n => _teamMap[n]).filter(Boolean))];
      return teams.join(' / ');
    };

    // ─ 커스텀 대진표: 단일 슬롯 → 코트별 가상 행으로 변환 ─
    if (isCustom && slots.length === 1) {
      const allMatches = slots[0].matches || [];
      const perCourt = {};
      for (let c = 1; c <= courtCount; c++) perCourt[c] = [];
      allMatches.forEach(m => {
        const c = m.court || 1;
        if (perCourt[c]) perCourt[c].push(m);
      });
      const maxMatches = Math.max(0, ...Object.values(perCourt).map(a => a.length));
      const virtualSlots = [];
      for (let r = 0; r < maxMatches; r++) {
        const matches = [];
        for (let c = 1; c <= courtCount; c++) {
          if (perCourt[c][r]) matches.push(perCourt[c][r]);
        }
        virtualSlots.push({ time: `${r + 1}경기`, matches });
      }
      slots = virtualSlots;
    }

    // ─ 레이아웃 상수 ─
    const contentW = W - PAD * 2;
    const headerH = 120;
    const rosterColCount = 4;
    const rosterCellH = 34;
    // 팀전 모드: 팀별 그룹핑 데이터 미리 계산
    let teamGroups = null; // [{ name, members: [name,...] }, ...]
    if (isTeamMode) {
      const groupMap = {};
      allPlayers.forEach(n => {
        const tn = _teamMap[n] || '미배정';
        if (!groupMap[tn]) groupMap[tn] = [];
        groupMap[tn].push(n);
      });
      teamGroups = Object.entries(groupMap).map(([name, members]) => ({ name, members }));
    }
    // rosterH 계산: 팀전은 팀별 헤더(28px) + 멤버 행, 일반은 기존 방식
    let rosterH;
    if (isTeamMode && teamGroups) {
      let teamRosterH = 36; // 타이틀
      teamGroups.forEach(g => {
        teamRosterH += 28; // 팀 이름 헤더
        teamRosterH += Math.ceil(g.members.length / rosterColCount) * rosterCellH;
      });
      teamRosterH += 16; // 하단 패딩
      rosterH = allPlayers.length > 0 ? teamRosterH : 0;
    } else {
      const rosterRows = Math.ceil(allPlayers.length / rosterColCount);
      rosterH = rosterRows > 0 ? 36 + rosterRows * rosterCellH + 16 : 0;
    }
    const warmupH = (warmupMins > 0 && tournament.startTime) ? 44 : 0;
    const tblHeaderH = 40;
    const roundInfoW = 110;
    const rightInfoW = 100;
    const courtColW = Math.floor((contentW - roundInfoW - rightInfoW) / courtCount);
    // 매치 셀 높이 (가로 배치: 팀1 | VS | 팀2)
    const nameCellH = 28;
    const teamLabelH = isTeamMode ? 20 : 0;
    const scoreH = 20;
    const hasAnyScore = slots.some(s => s.matches.some(m => m.scores && m.scores.length > 0));
    const matchCellH = teamLabelH + nameCellH * 2 + (hasAnyScore ? scoreH : 0) + 16;

    // 쉬는 멤버 계산
    const restingPerSlot = slots.map(slot => {
      const busy = new Set();
      slot.matches.forEach(m => {
        if (m.player1) m.player1.split(' / ').forEach(n => busy.add(n));
        if (m.player2) m.player2.split(' / ').forEach(n => busy.add(n));
      });
      return allPlayers.filter(n => !busy.has(n));
    });

    // 행 높이: 매치 영역 vs 오른쪽 정보 영역 중 큰 쪽에 맞춤
    // 쉬는 멤버 표시는 최대 6명으로 제한 (이미지 크기 폭발 방지)
    const MAX_REST_DISPLAY = 6;
    const maxResting = isCustom ? 0 : Math.max(0, ...restingPerSlot.map(r => r.length));
    const displayResting = Math.min(maxResting, MAX_REST_DISPLAY);
    const restExtraH = maxResting > MAX_REST_DISPLAY ? 13 : 0; // "외 N명" 라벨
    const rightContentH = 10 + courtCount * 20 + (displayResting > 0 ? 14 + displayResting * 13 + restExtraH : 0);
    const rowH = Math.max(matchCellH, rightContentH) + 1;

    const totalTableH = tblHeaderH + slots.length * rowH;
    const footerH = 50;
    const H = PAD + headerH + 16 + rosterH + (warmupH > 0 ? warmupH + 10 : 0) + totalTableH + footerH + PAD;

    // ─ Canvas 생성 (브라우저 한계 초과 시 DPR 자동 조절) ─
    const MAX_CANVAS_PX = 16384;
    let dpr = DPR;
    if (H * dpr > MAX_CANVAS_PX || W * dpr > MAX_CANVAS_PX) {
      dpr = Math.max(1, Math.floor(MAX_CANVAS_PX / Math.max(H, W)));
    }
    const canvas = document.createElement('canvas');
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // ─ 배경 ─
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // ─ 헤더 (그라데이션) ─
    this._roundRect(ctx, PAD, PAD, contentW, headerH, 14);
    const headerGrad = ctx.createLinearGradient(PAD, PAD, PAD + contentW, PAD + headerH);
    headerGrad.addColorStop(0, '#1e40af');
    headerGrad.addColorStop(0.5, '#2563eb');
    headerGrad.addColorStop(1, '#3b82f6');
    ctx.fillStyle = headerGrad;
    ctx.fill();

    // 헤더 텍스트
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    ctx.font = `bold 14px ${FONT}`;
    ctx.fillStyle = '#93c5fdcb';
    ctx.fillText('TENNIS MATCH', PAD + 28, PAD + 30);

    ctx.font = `bold 28px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tournament.name || '테니스 대진표', PAD + 28, PAD + 62);

    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    const dateStr = tournament.gameDate || '';
    const timeStr = tournament.startTime && tournament.endTime ? `${tournament.startTime} ~ ${tournament.endTime}` : '';
    const metaStr = [dateStr, timeStr, `코트 ${courtCount}면`].filter(Boolean).join('  |  ');
    ctx.fillText(metaStr, PAD + 28, PAD + 94);

    let curY = PAD + headerH + 16;

    // ─ 참가자 명단 그리드 ─
    if (rosterH > 0) {
      this._roundRect(ctx, PAD, curY, contentW, rosterH, 10);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#dbeafe';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = `bold 13px ${FONT}`;
      ctx.fillStyle = '#2563eb';
      const mCount = allPlayers.filter(n => isMale(n)).length;
      const fCount = allPlayers.filter(n => isFemale(n)).length;
      const rosterTitle = `참가자 명단 (남 ${mCount} · 여 ${fCount}) — ${allPlayers.length}명`;
      ctx.fillText(rosterTitle, PAD + 16, curY + 20);

      const rosterStartY = curY + 36;
      const rosterCellW = Math.floor((contentW - 32) / rosterColCount);

      const _drawPlayerCell = (name, cx, cy) => {
        const color = pColor(name);
        ctx.beginPath();
        ctx.arc(cx + 10, cy + rosterCellH / 2, 6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `13px ${FONT}`;
        ctx.fillStyle = '#1f2937';
        ctx.fillText(name, cx + 22, cy + rosterCellH / 2);
      };

      if (isTeamMode && teamGroups) {
        // 팀별 그룹핑 표시
        let tY = rosterStartY;
        teamGroups.forEach(g => {
          // 팀 이름 헤더 (배경 바 + 라벨)
          this._roundRect(ctx, PAD + 12, tY + 2, contentW - 24, 22, 5);
          ctx.fillStyle = '#eff6ff';
          ctx.fill();
          ctx.strokeStyle = '#bfdbfe';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.font = `bold 12px ${FONT}`;
          ctx.fillStyle = '#1e40af';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const teamMCount = g.members.filter(n => isMale(n)).length;
          const teamFCount = g.members.filter(n => isFemale(n)).length;
          ctx.fillText(`${g.name}  (${g.members.length}명 · 남${teamMCount} 여${teamFCount})`, PAD + 20, tY + 13);
          tY += 28;
          // 멤버 (여자 먼저)
          const sorted = [...g.members].sort((a, b) => (isFemale(a) ? 0 : 1) - (isFemale(b) ? 0 : 1));
          sorted.forEach((name, i) => {
            const col = i % rosterColCount;
            const row = Math.floor(i / rosterColCount);
            _drawPlayerCell(name, PAD + 16 + col * rosterCellW, tY + row * rosterCellH);
          });
          tY += Math.ceil(sorted.length / rosterColCount) * rosterCellH;
        });
      } else {
        // 일반 모드: 여자 먼저, 남자 나중 정렬
        const sortedPlayers = [...allPlayers].sort((a, b) => {
          const aF = isFemale(a) ? 0 : 1;
          const bF = isFemale(b) ? 0 : 1;
          return aF - bF;
        });
        sortedPlayers.forEach((name, i) => {
          const col = i % rosterColCount;
          const row = Math.floor(i / rosterColCount);
          _drawPlayerCell(name, PAD + 16 + col * rosterCellW, rosterStartY + row * rosterCellH);
        });
      }

      curY += rosterH;
    }

    // ─ 몸풀기 배너 ─
    if (warmupH > 0) {
      const wBannerY = curY;
      // 시간 박스
      const timeBoxW = 120;
      this._roundRect(ctx, PAD, wBannerY, timeBoxW, warmupH, 8);
      ctx.fillStyle = '#2563eb';
      ctx.fill();
      const warmupEnd = this._addMinutes(tournament.startTime, warmupMins);
      ctx.font = `bold 14px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${tournament.startTime}`, PAD + timeBoxW / 2, wBannerY + 14);
      ctx.font = `11px ${FONT}`;
      ctx.fillText(`~ ${warmupEnd}`, PAD + timeBoxW / 2, wBannerY + 30);
      ctx.textAlign = 'left';

      // 내용 박스
      this._roundRect(ctx, PAD + timeBoxW, wBannerY, contentW - timeBoxW, warmupH, 8);
      ctx.fillStyle = '#dbeafe';
      ctx.fill();
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillStyle = '#2563eb';
      ctx.textBaseline = 'middle';
      ctx.fillText(`몸풀기 (${warmupMins}분)`, PAD + timeBoxW + 16, wBannerY + warmupH / 2);

      curY += warmupH + 10;
    }

    // ─ 테이블 시작 ─
    const tblX = PAD;
    const tblY = curY;
    const tblW = contentW;

    // 테이블 헤더 (상단 라운드)
    this._roundRect(ctx, tblX, tblY, tblW, tblHeaderH, 10);
    ctx.fillStyle = '#2563eb';
    ctx.fill();

    ctx.font = `bold 13px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isCustom ? '경기' : '라운드 / 시간', tblX + roundInfoW / 2, tblY + tblHeaderH / 2);

    // 코트 헤더
    for (let ci = 0; ci < courtCount; ci++) {
      const colX = tblX + roundInfoW + ci * courtColW;
      ctx.beginPath();
      ctx.moveTo(colX, tblY);
      ctx.lineTo(colX, tblY + tblHeaderH);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = `bold 13px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(`코트 ${ci + 1}`, colX + courtColW / 2, tblY + tblHeaderH / 2);
    }
    // 오른쪽 정보 열 헤더
    const rightColX = tblX + tblW - rightInfoW;
    ctx.beginPath();
    ctx.moveTo(rightColX, tblY);
    ctx.lineTo(rightColX, tblY + tblHeaderH);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('정보', rightColX + rightInfoW / 2, tblY + tblHeaderH / 2);
    ctx.textAlign = 'left';

    let rowY = tblY + tblHeaderH;

    // ─ 개별 이름 셀 그리기 헬퍼 ─
    const drawNameCell = (name, x, y, w, h) => {
      const color = pColor(name);
      // 성별 배경 (꽉 채움)
      this._roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 5);
      ctx.fillStyle = pBg(name);
      ctx.fill();
      ctx.strokeStyle = isFemale(name) ? 'rgba(236,72,153,0.25)' : 'rgba(59,130,246,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // 좌측 색상 dot
      ctx.beginPath();
      ctx.arc(x + 12, y + h / 2, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      // 이름 텍스트
      ctx.font = `bold 12px ${FONT}`;
      ctx.fillStyle = '#1f2937';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, x + 20, y + h / 2);
    };

    // ─ 라운드 행 그리기 ─
    slots.forEach((slot, si) => {
      const isEven = si % 2 === 0;

      // 행 배경
      ctx.fillStyle = isEven ? '#ffffff' : '#f8fafc';
      ctx.fillRect(tblX, rowY, tblW, rowH);

      // 행 하단 구분선
      ctx.beginPath();
      ctx.moveTo(tblX, rowY + rowH);
      ctx.lineTo(tblX + tblW, rowY + rowH);
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 좌측: 라운드 정보
      const roundLabelX = tblX;
      const roundLabelW = roundInfoW;

      // 라운드 번호
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillStyle = '#2563eb';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (isCustom) {
        // 커스텀: "1경기", "2경기" ...
        ctx.fillText(`${si + 1}경기`, roundLabelX + roundLabelW / 2, rowY + rowH / 2);
      } else {
        ctx.fillText(`${si + 1}R`, roundLabelX + roundLabelW / 2, rowY + rowH / 2 - 10);
        // 시간
        const timeLabel = gameMins > 0
          ? `${slot.time} ~ ${this._addMinutes(slot.time, gameMins)}`
          : slot.time;
        ctx.font = `11px ${FONT}`;
        ctx.fillStyle = '#6b7280';
        ctx.fillText(timeLabel, roundLabelX + roundLabelW / 2, rowY + rowH / 2 + 8);
      }
      ctx.textAlign = 'left';

      // 세로 구분선 (라운드 | 코트들)
      ctx.beginPath();
      ctx.moveTo(tblX + roundInfoW, rowY);
      ctx.lineTo(tblX + roundInfoW, rowY + rowH);
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 코트별 매치
      const courtMap = {};
      for (let c = 1; c <= courtCount; c++) courtMap[c] = [];
      slot.matches.forEach(m => {
        const c = m.court || 1;
        if (c >= 1 && c <= courtCount) courtMap[c].push(m);
      });

      for (let ci = 0; ci < courtCount; ci++) {
        const c = ci + 1;
        const colX = tblX + roundInfoW + ci * courtColW;

        // 코트간 세로 구분선
        if (ci > 0) {
          ctx.beginPath();
          ctx.moveTo(colX, rowY);
          ctx.lineTo(colX, rowY + rowH);
          ctx.strokeStyle = '#e5e7eb';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        const match = courtMap[c][0];
        if (!match) {
          ctx.font = `13px ${FONT}`;
          ctx.fillStyle = '#d1d5db';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('—', colX + courtColW / 2, rowY + rowH / 2);
          ctx.textAlign = 'left';
          continue;
        }

        // 가로 레이아웃: [팀1] VS [팀2]
        const cellPad = 6;
        const vsW = 30;
        const gapW = 3;
        const teamW = Math.floor((courtColW - cellPad * 2 - vsW - gapW * 2) / 2);
        const actualScoreH = (hasAnyScore && match.scores && match.scores.length > 0) ? scoreH : 0;
        const playersH = nameCellH * 2;
        const contentH = teamLabelH + playersH + actualScoreH;
        const cellY = rowY + Math.floor((rowH - contentH) / 2);

        const t1X = colX + cellPad;
        const vsX = t1X + teamW + gapW;
        const t2X = vsX + vsW + gapW;

        // 팀전 모드: 팀 이름 라벨
        if (isTeamMode) {
          const t1Team = getTeamName(match.player1);
          const t2Team = getTeamName(match.player2);
          ctx.font = `bold 11px ${FONT}`;
          ctx.textBaseline = 'middle';
          if (t1Team) {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#2563eb';
            ctx.fillText(t1Team, t1X + teamW / 2, cellY + teamLabelH / 2);
          }
          if (t2Team) {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#2563eb';
            ctx.fillText(t2Team, t2X + teamW / 2, cellY + teamLabelH / 2);
          }
          ctx.textAlign = 'left';
        }

        const nameStartY = cellY + teamLabelH;
        if (isSingles) {
          const singleY = nameStartY + nameCellH / 2;
          const p1 = match.player1 || '?';
          const p2 = match.player2 || '?';
          drawNameCell(p1, t1X, singleY, teamW, nameCellH);
          drawNameCell(p2, t2X, singleY, teamW, nameCellH);
        } else {
          const t1Names = (match.player1 || '?').split(' / ');
          drawNameCell(t1Names[0] || '?', t1X, nameStartY, teamW, nameCellH);
          drawNameCell(t1Names[1] || '?', t1X, nameStartY + nameCellH, teamW, nameCellH);
          const t2Names = (match.player2 || '?').split(' / ');
          drawNameCell(t2Names[0] || '?', t2X, nameStartY, teamW, nameCellH);
          drawNameCell(t2Names[1] || '?', t2X, nameStartY + nameCellH, teamW, nameCellH);
        }

        // VS 원형 뱃지 (중앙)
        const vsCenterX = vsX + vsW / 2;
        const vsCenterY = nameStartY + playersH / 2;
        ctx.beginPath();
        ctx.arc(vsCenterX, vsCenterY, 13, 0, Math.PI * 2);
        ctx.fillStyle = '#2563eb';
        ctx.fill();
        ctx.font = `bold 10px ${FONT}`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('VS', vsCenterX, vsCenterY);

        // 스코어 (팀 영역 아래)
        if (hasAnyScore && match.scores && match.scores.length > 0) {
          const scoreStr = match.scores.map(s => `${s[0]}:${s[1]}`).join('  ');
          const isWin1 = match.winner === 'team1';
          const isWin2 = match.winner === 'team2';
          const isDraw = match.winner === 'draw';
          ctx.font = `bold 11px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#b45309';
          const prefix = isDraw ? '무 ' : isWin1 ? '▲ ' : isWin2 ? '▼ ' : '';
          ctx.fillText(prefix + scoreStr, colX + courtColW / 2, nameStartY + playersH + scoreH / 2);
          ctx.textAlign = 'left';
        }
      }

      // ─ 오른쪽 정보 열: 게임 타입 + 쉬는 멤버 ─
      const riX = rightColX;
      ctx.beginPath();
      ctx.moveTo(riX, rowY);
      ctx.lineTo(riX, rowY + rowH);
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 1;
      ctx.stroke();

      let riY = rowY + 6;
      const tbW = rightInfoW - 16;
      for (let ci = 0; ci < courtCount; ci++) {
        const m = courtMap[ci + 1] && courtMap[ci + 1][0];
        if (!m) continue;
        const tc = this._typeColors[m.gameType] || { label: '?', bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
        const label = courtCount > 1 ? `C${ci + 1} ${tc.label}` : tc.label;
        this._roundRect(ctx, riX + 8, riY, tbW, 18, 4);
        ctx.fillStyle = tc.bg;
        ctx.fill();
        ctx.strokeStyle = tc.border;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = `bold 10px ${FONT}`;
        ctx.fillStyle = tc.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, riX + 8 + tbW / 2, riY + 9);
        riY += 20;
      }

      const resting = restingPerSlot[si];
      if (!isCustom && resting.length > 0) {
        riY += 2;
        ctx.font = `bold 9px ${FONT}`;
        ctx.fillStyle = '#92400e';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('쉬는 멤버', riX + 8, riY + 5);
        riY += 12;
        const showResting = resting.slice(0, MAX_REST_DISPLAY);
        showResting.forEach(name => {
          if (riY + 10 > rowY + rowH - 2) return;
          const color = pColor(name);
          ctx.beginPath();
          ctx.arc(riX + 13, riY + 5, 3, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.font = `10px ${FONT}`;
          ctx.fillStyle = '#4b5563';
          ctx.textAlign = 'left';
          ctx.fillText(name, riX + 20, riY + 5);
          riY += 13;
        });
        if (resting.length > MAX_REST_DISPLAY) {
          ctx.font = `bold 9px ${FONT}`;
          ctx.fillStyle = '#9ca3af';
          ctx.fillText(`외 ${resting.length - MAX_REST_DISPLAY}명`, riX + 10, riY + 5);
          riY += 13;
        }
      }
      ctx.textAlign = 'left';

      rowY += rowH;
    });

    // 테이블 외곽선 (라운드)
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    this._roundRect(ctx, tblX, tblY, tblW, rowY - tblY, 10);
    ctx.stroke();

    // ─ 푸터 ─
    const fY = rowY + 16;
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 게임 타입 분포 요약
    const dist = tournament.typeDistribution || {};
    const distParts = Object.entries(dist).filter(([,v]) => v > 0).map(([k,v]) => {
      const tc = this._typeColors[k] || { label: k };
      return `${tc.label} ${v}게임`;
    });
    if (distParts.length > 0) {
      ctx.fillText(distParts.join('  ·  '), W / 2, fY);
    }

    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = '#a3a3a3';
    ctx.fillText('HAPPY TENNIS', W / 2, fY + 20);
    ctx.textAlign = 'left';

    return canvas;
  },

  // 멤버 이름을 개별 탭 가능한 span으로 렌더링
  renderSwapPlayer(name, slotIdx, matchIdx, team, pos) {
    const allPlayers = Storage.getPlayers();
    const pd = allPlayers.find(p => p.name === name);
    const isCustom = this._tournament?.isCustom;
    const ntrpHtml = !RolesConfig.hasAdminAccess() ? '' : `<span class="text-yellow-600 text-xs">${(pd?.ntrp || 2.5).toFixed(1)}</span>`;
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
            <button type="button" class="court-add-match-btn w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50/50 transition flex items-center justify-center gap-1" data-court="${c}">
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

    const borderColor = isDraw ? 'border-yellow-200' : (hasResult ? 'border-blue-200' : 'border-gray-200');
    const t1Bg = isDraw ? 'bg-yellow-50' : (isWin1 ? 'bg-blue-50' : 'bg-gray-50');
    const t2Bg = isDraw ? 'bg-yellow-50' : (isWin2 ? 'bg-blue-50' : 'bg-gray-50');
    const t1TextClass = isDraw ? 'text-yellow-700' : (isWin1 ? 'text-blue-700' : 'text-gray-800');
    const t2TextClass = isDraw ? 'text-yellow-700' : (isWin2 ? 'text-blue-700' : 'text-gray-800');
    const s1Class = isDraw ? 'text-yellow-600 bg-yellow-100' : (isWin1 ? 'text-blue-700 bg-blue-100' : 'text-gray-500 bg-gray-100');
    const s2Class = isDraw ? 'text-yellow-600 bg-yellow-100' : (isWin2 ? 'text-blue-700 bg-blue-100' : 'text-gray-500 bg-gray-100');

    const myMatchClass = isMember && isMyMatch ? 'my-match' : '';
    const myBorderColor = isMember && isMyMatch ? 'border-blue-400 ring-2 ring-blue-200' : borderColor;

    return `
      <div class="schedule-match-card ${myMatchClass} relative bg-white border ${myBorderColor} rounded-xl p-3 cursor-pointer hover:shadow-md transition"
           ${RolesConfig.hasAdminAccess() ? 'draggable="true"' : ''} data-match-id="${match.id}" data-slot-idx="${slotIdx}" data-match-idx="${matchIdx}" data-my-match="${isMember && isMyMatch}">
        <button type="button" class="delete-match-btn absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-400 hover:bg-red-50 hover:border-red-300 hover:text-red-500 shadow-sm transition z-10" data-slot-idx="${slotIdx}" data-match-idx="${matchIdx}">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
        ${cfg ? `<div class="flex items-center mb-2 pr-5">
          <span class="change-gametype-btn text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badgeClass} cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-blue-400 transition" data-match-id="${match.id}">${cfg.label}</span>
        </div>` : ''}
        <div class="space-y-0.5">
          <div class="${t1Bg} rounded-lg px-2 ${t1TeamName ? 'pt-1.5 pb-2' : 'py-2'}">
            ${t1TeamName ? `<div class="text-center mb-1"><span class="inline-block text-[10px] leading-tight px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium">${t1TeamName}</span></div>` : ''}
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
            ${t2TeamName ? `<div class="text-center mb-1"><span class="inline-block text-[10px] leading-tight px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium">${t2TeamName}</span></div>` : ''}
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
    const _amGroups = Storage.getGroups();
    const isSingles = !!tournament.isSingles;
    const selected = { t1p1: null, t1p2: null, t2p1: null, t2p2: null };
    let selectedCourt = presetCourt || 1;
    let selectedSlot = (presetSlot != null) ? presetSlot : 0;
    let selectedGameType = isSingles ? 'MS' : 'XD';

    const modal = document.createElement('div');
    modal.className = 'add-match-modal fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4';
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';

    const renderModal = () => {
      const playerSlot = (key, label) => {
        const name = selected[key];
        const pd = name ? allPlayers.find(p => p.name === name) : null;
        const tn = name ? _teamMap[name] : null;
        if (name) {
          return `<div class="am-player-slot flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-xl cursor-pointer hover:bg-blue-50 transition" data-key="${key}">
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-800 font-medium">${Results.escapeHtml(name)}</span>
              ${pd ? `${genderBadge(pd.gender)}
              ${!RolesConfig.hasAdminAccess() ? '' : `<span class="text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">${(pd.ntrp || 2.5).toFixed(1)}</span>`}
              ${(pd.groups || []).map(gid => _amGroups.find(g => g.id === gid)).filter(Boolean).map(g => `<span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-100 text-purple-600">${Results.escapeHtml(g.name)}</span>`).join('')}` : ''}
              ${tn ? `<span class="text-xs px-1.5 py-0.5 rounded font-medium bg-blue-50 text-blue-700 border border-blue-200">${Results.escapeHtml(tn)}</span>` : ''}
            </div>
            <button type="button" class="am-remove-player text-red-400 hover:text-red-600 text-xs" data-key="${key}">✕</button>
          </div>`;
        }
        return `<div class="am-player-slot flex items-center px-3 py-2.5 border border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-blue-50 transition" data-key="${key}">
          <span class="text-sm text-gray-300 italic">${label}</span>
        </div>`;
      };

      return `
        <div class="am-modal-inner bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-md w-full p-5 overflow-y-auto">
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
                    <select id="am-slot" class="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-700">
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
                          <div class="px-2.5 py-1.5 rounded-lg text-xs font-medium border-2 border-gray-200 peer-checked:border-blue-500 peer-checked:bg-blue-50 transition">${cfg.icon} ${cfg.label}</div>
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
                    <div class="border-2 border-gray-200 rounded-xl py-2 text-center peer-checked:border-blue-500 peer-checked:bg-blue-50 transition text-sm font-medium">${i + 1}번</div>
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
              <button type="button" class="flex-1 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition am-submit">추가</button>
            </div>
          </div>
        </div>`;
    };

    const refreshModal = () => {
      patchDOM(modal, renderModal());
      bindModalEvents();
    };

    const bindModalEvents = () => {
      modal.querySelector('.am-cancel').onclick = () => { closeAddMatch(); };

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
        } else if (tournament.isCustom) {
          // 커스텀 대진표: 성별 기반 경기 종류 자동 감지
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
          gameType = gtEl ? gtEl.value : null;
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
        const addMatch = { ...newMatch };
        const addSlotIdx = slotIdx;
        await Storage.updateTournament(tournament.id, t => {
          t.timeSlots[addSlotIdx].matches.push(addMatch);
          if (t.status === 'completed') {
            t.status = 'active';
            t.completedAt = null;
          }
        });
        closeAddMatch();
        this.render(container, Storage.getTournamentById(tournament.id) || tournament);
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

    // 모바일 키보드 대응: visualViewport로 모달 높이 동적 조정
    const amInnerDiv = modal.querySelector('.am-modal-inner');
    const adjustForKeyboard = () => {
      if (window.visualViewport) {
        const vh = window.visualViewport.height;
        const offsetTop = window.visualViewport.offsetTop;
        modal.style.height = vh + 'px';
        modal.style.top = offsetTop + 'px';
        modal.style.bottom = 'auto';
        if (amInnerDiv) amInnerDiv.style.maxHeight = (vh - 16) + 'px';
      }
    };
    if (window.visualViewport) {
      adjustForKeyboard();
      window.visualViewport.addEventListener('resize', adjustForKeyboard);
      window.visualViewport.addEventListener('scroll', adjustForKeyboard);
    } else {
      if (amInnerDiv) amInnerDiv.style.maxHeight = '85vh';
    }
    const closeAddMatch = () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', adjustForKeyboard);
        window.visualViewport.removeEventListener('scroll', adjustForKeyboard);
      }
      modal.remove(); unlockScroll();
    };

    modal.addEventListener('click', (e) => { if (e.target === modal) closeAddMatch(); });
    bindModalEvents();
  },

  // 멤버 선택 피커 (대진 추가용)
  _showPlayerPickerForSlot(parentModal, allPlayers, selected, slotKey, onDone, slotBusyNames) {
    const existing = document.querySelector('.am-player-picker');
    if (existing) existing.remove();

    const usedNames = new Set(Object.values(selected).filter(Boolean));
    const busyNames = slotBusyNames || new Set();
    const _teamMap = this._tournament?.isTeamMode ? buildTeamMap() : {};
    const _pkGroups = Storage.getGroups();

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
    const isTeamMode = !!this._tournament?.isTeamMode;

    // 플레이어 옵션 렌더링 헬퍼
    const _renderOpt = (p) => {
      const isUsed = usedNames.has(p.name);
      const isBusy = !isUsed && busyNames.has(p.name);
      const isDisabled = isUsed || isBusy;
      const groupNames = (p.groups || []).map(gid => _pkGroups.find(g => g.id === gid)).filter(Boolean).map(g => g.name).join(' ');
      return `<div class="amp-option flex items-center px-3 py-2.5 ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-blue-50'} transition"
        data-name="${Results.escapeHtml(p.name)}" data-used="${isDisabled}" data-group="${Results.escapeHtml(groupNames)}">
        <span class="text-sm text-gray-800">${Results.escapeHtml(p.name)}</span>
        <span class="ml-2">${genderBadge(p.gender)}</span>
        ${!RolesConfig.hasAdminAccess() ? '' : `<span class="ml-1 text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">${(p.ntrp || 2.5).toFixed(1)}</span>`}
        ${(p.groups || []).map(gid => _pkGroups.find(g => g.id === gid)).filter(Boolean).map(g => `<span class="ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-100 text-purple-600">${Results.escapeHtml(g.name)}</span>`).join('')}
        ${isUsed ? '<span class="ml-auto text-xs text-gray-400">선택됨</span>' : ''}
        ${isBusy ? '<span class="ml-auto text-xs text-gray-400">같은 시간대</span>' : ''}
      </div>`;
    };

    // 팀 모드: 조별 그룹핑
    let playerListHtml;
    if (visiblePlayers.length === 0) {
      playerListHtml = '<p class="text-sm text-gray-400 text-center py-4">등록된 멤버가 없습니다.</p>';
    } else if (isTeamMode) {
      const teamPlayerMap = {};
      const noTeamPlayers = [];
      visiblePlayers.forEach(p => {
        const tn = _teamMap[p.name];
        if (tn) {
          if (!teamPlayerMap[tn]) teamPlayerMap[tn] = [];
          teamPlayerMap[tn].push(p);
        } else {
          noTeamPlayers.push(p);
        }
      });
      let html = '<div class="overflow-y-auto flex-1">';
      Object.keys(teamPlayerMap).sort((a, b) => a.localeCompare(b, 'ko')).forEach(tn => {
        html += `<div class="amp-team-group" data-team="${Results.escapeHtml(tn)}">`;
        html += `<div class="amp-group-header sticky top-0 px-3 py-1.5 bg-purple-50 text-purple-700 text-xs font-semibold border-b border-purple-100 z-10">${Results.escapeHtml(tn)} <span class="text-purple-400">(${teamPlayerMap[tn].length}명)</span></div>`;
        html += '<div class="divide-y divide-gray-50">';
        teamPlayerMap[tn].forEach(p => { html += _renderOpt(p); });
        html += '</div></div>';
      });
      if (noTeamPlayers.length > 0) {
        html += '<div class="amp-team-group" data-team="">';
        html += `<div class="amp-group-header sticky top-0 px-3 py-1.5 bg-gray-100 text-gray-500 text-xs font-semibold border-b border-gray-200 z-10">미배정 <span class="text-gray-400">(${noTeamPlayers.length}명)</span></div>`;
        html += '<div class="divide-y divide-gray-50">';
        noTeamPlayers.forEach(p => { html += _renderOpt(p); });
        html += '</div></div>';
      }
      html += '</div>';
      playerListHtml = html;
    } else {
      playerListHtml = `<div class="text-xs text-gray-400 mb-2">등록된 멤버</div>
        <div class="overflow-y-auto flex-1 divide-y divide-gray-50">
          ${visiblePlayers.map(p => _renderOpt(p)).join('')}
        </div>`;
    }

    const picker = document.createElement('div');
    picker.className = 'am-player-picker fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4';
    picker.style.backgroundColor = 'rgba(0,0,0,0.5)';
    picker.innerHTML = `
      <div class="amp-inner bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-sm w-full p-4 flex flex-col overflow-y-auto">
        <div class="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden"></div>
        <h3 class="text-lg font-bold text-center mb-3">${pickerTitle}</h3>
        <div class="mb-3">
          <div class="flex gap-2">
            <input type="text" autocomplete="off" id="amp-search" placeholder="이름 또는 조 검색..."
              class="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-700 focus:border-blue-700">
            <button type="button" id="amp-custom-add"
              class="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition whitespace-nowrap">추가</button>
          </div>
        </div>
        ${playerListHtml}
        <button type="button" class="mt-3 w-full py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition amp-cancel">취소</button>
      </div>`;

    document.body.appendChild(picker);
    lockScroll();

    // 모바일 키보드 대응
    const ampInner = picker.querySelector('.amp-inner');
    const adjustPicker = () => {
      if (window.visualViewport) {
        const vh = window.visualViewport.height;
        const offsetTop = window.visualViewport.offsetTop;
        picker.style.height = vh + 'px';
        picker.style.top = offsetTop + 'px';
        picker.style.bottom = 'auto';
        ampInner.style.maxHeight = (vh - 16) + 'px';
      }
    };
    if (window.visualViewport) {
      adjustPicker();
      window.visualViewport.addEventListener('resize', adjustPicker);
      window.visualViewport.addEventListener('scroll', adjustPicker);
    } else {
      ampInner.style.maxHeight = '70vh';
    }

    const closePicker = () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', adjustPicker);
        window.visualViewport.removeEventListener('scroll', adjustPicker);
      }
      picker.remove(); unlockScroll();
    };
    picker.addEventListener('click', (e) => { if (e.target === picker) closePicker(); });
    picker.querySelector('.amp-cancel').onclick = closePicker;

    const searchInput = picker.querySelector('#amp-search');
    searchInput.focus();

    searchInput.oninput = () => {
      const q = searchInput.value.trim();
      picker.querySelectorAll('.amp-option').forEach(opt => {
        const nameMatch = !q || matchesKoreanSearch(opt.dataset.name, q);
        const groupMatch = !q ? false : (opt.dataset.group && matchesKoreanSearch(opt.dataset.group, q));
        opt.style.display = (nameMatch || groupMatch) ? '' : 'none';
      });
      // 팀 모드: 빈 그룹 헤더 숨기기
      picker.querySelectorAll('.amp-team-group').forEach(grp => {
        const hasVisible = Array.from(grp.querySelectorAll('.amp-option')).some(o => o.style.display !== 'none');
        grp.style.display = hasVisible ? '' : 'none';
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
    const _swGroups = Storage.getGroups();
    const { slotIdx, matchIdx, team, pos, name: oldName } = playerInfo;
    const match = tournament.timeSlots[slotIdx]?.matches[matchIdx];
    if (!match) return;

    const playerKey = team === 1 ? 'player1' : 'player2';
    const otherKey = team === 1 ? 'player2' : 'player1';
    // 중복 멤버 수집 (본인 제외)
    const slotBusyNames = new Set();
    if (tournament.isCustom) {
      // 커스텀 대진표: 같은 경기 내 멤버만 중복 방지
      match[playerKey].split(' / ').forEach(n => slotBusyNames.add(n));
      match[otherKey].split(' / ').forEach(n => slotBusyNames.add(n));
      slotBusyNames.delete(oldName);
    } else {
      // 일반 대진표: 같은 시간대 전체 매치에서 사용 중인 멤버 수집 (완료된 매치 제외)
      (tournament.timeSlots[slotIdx]?.matches || []).forEach(m => {
        if (m.winner) return;
        m.player1.split(' / ').forEach(n => slotBusyNames.add(n));
        m.player2.split(' / ').forEach(n => slotBusyNames.add(n));
      });
      slotBusyNames.delete(oldName);
    }

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
    const isTeamMode2 = !!tournament.isTeamMode;

    // 플레이어 옵션 렌더링 헬퍼
    const _renderSwOpt = (p) => {
      const isDup = slotBusyNames.has(p.name);
      const isSelf = p.name === oldName;
      const groupNames = (p.groups || []).map(gid => _swGroups.find(g => g.id === gid)).filter(Boolean).map(g => g.name).join(' ');
      return `<div class="amp-option flex items-center px-3 py-2.5 ${isDup || isSelf ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-blue-50'} transition"
        data-name="${Results.escapeHtml(p.name)}" data-disabled="${isDup || isSelf}" data-group="${Results.escapeHtml(groupNames)}">
        <span class="text-sm text-gray-800">${Results.escapeHtml(p.name)}</span>
        <span class="ml-2">${genderBadge(p.gender)}</span>
        ${!RolesConfig.hasAdminAccess() ? '' : `<span class="ml-1 text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">${(p.ntrp || 2.5).toFixed(1)}</span>`}
        ${(p.groups || []).map(gid => _swGroups.find(g => g.id === gid)).filter(Boolean).map(g => `<span class="ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-100 text-purple-600">${Results.escapeHtml(g.name)}</span>`).join('')}
        ${isSelf ? '<span class="ml-auto text-xs text-gray-400">현재</span>' : ''}
        ${isDup ? `<span class="ml-auto text-xs text-gray-400">${tournament.isCustom ? '같은 경기' : '같은 시간대'}</span>` : ''}
      </div>`;
    };

    // 팀 모드: 조별 그룹핑
    let swPlayerListHtml;
    if (visiblePlayers.length === 0) {
      swPlayerListHtml = '<p class="text-sm text-gray-400 text-center py-4">등록된 멤버가 없습니다.</p>';
    } else if (isTeamMode2) {
      const teamPlayerMap2 = {};
      const noTeamPlayers2 = [];
      visiblePlayers.forEach(p => {
        const tn = _teamMap[p.name];
        if (tn) {
          if (!teamPlayerMap2[tn]) teamPlayerMap2[tn] = [];
          teamPlayerMap2[tn].push(p);
        } else {
          noTeamPlayers2.push(p);
        }
      });
      let html = '<div class="overflow-y-auto flex-1">';
      Object.keys(teamPlayerMap2).sort((a, b) => a.localeCompare(b, 'ko')).forEach(tn => {
        html += `<div class="amp-team-group" data-team="${Results.escapeHtml(tn)}">`;
        html += `<div class="amp-group-header sticky top-0 px-3 py-1.5 bg-purple-50 text-purple-700 text-xs font-semibold border-b border-purple-100 z-10">${Results.escapeHtml(tn)} <span class="text-purple-400">(${teamPlayerMap2[tn].length}명)</span></div>`;
        html += '<div class="divide-y divide-gray-50">';
        teamPlayerMap2[tn].forEach(p => { html += _renderSwOpt(p); });
        html += '</div></div>';
      });
      if (noTeamPlayers2.length > 0) {
        html += '<div class="amp-team-group" data-team="">';
        html += `<div class="amp-group-header sticky top-0 px-3 py-1.5 bg-gray-100 text-gray-500 text-xs font-semibold border-b border-gray-200 z-10">미배정 <span class="text-gray-400">(${noTeamPlayers2.length}명)</span></div>`;
        html += '<div class="divide-y divide-gray-50">';
        noTeamPlayers2.forEach(p => { html += _renderSwOpt(p); });
        html += '</div></div>';
      }
      html += '</div>';
      swPlayerListHtml = html;
    } else {
      swPlayerListHtml = `<div class="text-xs text-gray-400 mb-2">등록된 멤버</div>
        <div class="overflow-y-auto flex-1 divide-y divide-gray-50">
          ${visiblePlayers.map(p => _renderSwOpt(p)).join('')}
        </div>`;
    }

    const picker = document.createElement('div');
    picker.className = 'am-player-picker fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4';
    picker.style.backgroundColor = 'rgba(0,0,0,0.5)';
    picker.innerHTML = `
      <div class="amp-inner bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-sm w-full p-4 flex flex-col overflow-y-auto">
        <div class="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden"></div>
        <h3 class="text-lg font-bold text-center mb-3">${pickerTitle}</h3>
        <div class="mb-3">
          <input type="text" autocomplete="off" id="amp-search" placeholder="이름 또는 조 검색..."
            class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
        </div>
        ${swPlayerListHtml}
        <button type="button" class="mt-3 w-full py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition amp-cancel">취소</button>
      </div>`;

    document.body.appendChild(picker);
    lockScroll();

    // 모바일 키보드 대응
    const ampInner2 = picker.querySelector('.amp-inner');
    const adjustPicker2 = () => {
      if (window.visualViewport) {
        const vh = window.visualViewport.height;
        const offsetTop = window.visualViewport.offsetTop;
        picker.style.height = vh + 'px';
        picker.style.top = offsetTop + 'px';
        picker.style.bottom = 'auto';
        ampInner2.style.maxHeight = (vh - 16) + 'px';
      }
    };
    if (window.visualViewport) {
      adjustPicker2();
      window.visualViewport.addEventListener('resize', adjustPicker2);
      window.visualViewport.addEventListener('scroll', adjustPicker2);
    } else {
      ampInner2.style.maxHeight = '70vh';
    }

    const closePicker2 = () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', adjustPicker2);
        window.visualViewport.removeEventListener('scroll', adjustPicker2);
      }
      picker.remove(); unlockScroll();
    };
    picker.addEventListener('click', (e) => { if (e.target === picker) { closePicker2(); onDone(); } });
    picker.querySelector('.amp-cancel').onclick = () => { closePicker2(); onDone(); };

    const searchInput = picker.querySelector('#amp-search');
    searchInput.focus();
    searchInput.oninput = () => {
      const q = searchInput.value.trim();
      picker.querySelectorAll('.amp-option').forEach(opt => {
        const nameMatch = !q || matchesKoreanSearch(opt.dataset.name, q);
        const groupMatch = !q ? false : (opt.dataset.group && matchesKoreanSearch(opt.dataset.group, q));
        opt.style.display = (nameMatch || groupMatch) ? '' : 'none';
      });
      picker.querySelectorAll('.amp-team-group').forEach(grp => {
        const hasVisible = Array.from(grp.querySelectorAll('.amp-option')).some(o => o.style.display !== 'none');
        grp.style.display = hasVisible ? '' : 'none';
      });
    };

    picker.querySelectorAll('.amp-option').forEach(opt => {
      opt.onclick = async () => {
        if (opt.dataset.disabled === 'true') return;
        const newName = opt.dataset.name;
        const names = match[playerKey].split(' / ');
        names[pos] = newName;
        match[playerKey] = names.join(' / ');
        // 커스텀 대진표: 멤버 교체 시 gameType 자동 재감지
        let newGameType = match.gameType || null;
        if (tournament.isCustom) {
          const allPlayers2 = Storage.getPlayers();
          const getG = (n) => { const p = allPlayers2.find(pl => pl.name === n); return p ? p.gender : null; };
          const p1Parts = match.player1.split(' / ');
          const p2Parts = match.player2.split(' / ');
          if (p1Parts.length === 1 && p2Parts.length === 1) {
            const g1 = getG(p1Parts[0]), g2 = getG(p2Parts[0]);
            if (g1 === 'M' && g2 === 'M') newGameType = 'MS';
            else if (g1 === 'F' && g2 === 'F') newGameType = 'WS';
            else newGameType = 'FS';
          } else {
            const genders = [p1Parts[0], p1Parts[1], p2Parts[0], p2Parts[1]].map(getG);
            const aM = genders.every(g => g === 'M');
            const aF = genders.every(g => g === 'F');
            const mx = (genders[0] !== genders[1]) && (genders[2] !== genders[3])
              && genders.filter(g => g === 'M').length === 2 && genders.filter(g => g === 'F').length === 2;
            if (aM) newGameType = 'MD';
            else if (aF) newGameType = 'WD';
            else if (mx) newGameType = 'XD';
            else newGameType = 'FD';
          }
          match.gameType = newGameType;
        }
        const patchMatchId = match.id;
        const patchKey = playerKey;
        const patchValue = match[playerKey];
        const patchGameType = newGameType;
        await Storage.updateTournament(tournament.id, t => {
          for (const slot of t.timeSlots) {
            const m = slot.matches.find(x => x.id === patchMatchId);
            if (m) {
              m[patchKey] = patchValue;
              if (tournament.isCustom) m.gameType = patchGameType;
              break;
            }
          }
        });
        closePicker2();
        onDone();
        this.render(container, Storage.getTournamentById(tournament.id) || tournament);
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
              ${match.gameType === key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}"
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
        const newType = btn.dataset.type;
        const gtMatchId = match.id;
        await Storage.updateTournament(tournament.id, t => {
          for (const slot of t.timeSlots) {
            const m = slot.matches.find(x => x.id === gtMatchId);
            if (m) { m.gameType = newType; break; }
          }
        });
        closeGtModal();
        this.render(container, Storage.getTournamentById(tournament.id) || tournament);
      };
    });
  },
};
