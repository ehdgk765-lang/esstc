// tournament.js - 싱글 엘리미네이션 토너먼트 로직 + UI
const Tournament = {
  // 대진표 생성
  generateBracket(playerNames) {
    const shuffled = [...playerNames].sort(() => Math.random() - 0.5);
    // 2의 거듭제곱으로 올림
    let size = 1;
    while (size < shuffled.length) size *= 2;

    // bye 채우기
    while (shuffled.length < size) {
      shuffled.push(null); // BYE
    }

    // 라운드 수
    const totalRounds = Math.log2(size);
    const rounds = [];

    // 1라운드 매치 생성
    const firstRound = [];
    for (let i = 0; i < size; i += 2) {
      const match = {
        id: Storage.generateId(),
        player1: shuffled[i],
        player2: shuffled[i + 1],
        scores: null,
        winner: null,
        round: 0,
        matchIndex: i / 2,
      };
      // BYE 처리: 상대가 없으면 자동 승리
      if (!match.player1 && match.player2) {
        match.winner = match.player2;
        match.scores = [];
      } else if (match.player1 && !match.player2) {
        match.winner = match.player1;
        match.scores = [];
      }
      firstRound.push(match);
    }
    rounds.push(firstRound);

    // 나머지 라운드 빈 매치 생성
    for (let r = 1; r < totalRounds; r++) {
      const prevRound = rounds[r - 1];
      const currentRound = [];
      for (let i = 0; i < prevRound.length; i += 2) {
        const match = {
          id: Storage.generateId(),
          player1: null,
          player2: null,
          scores: null,
          winner: null,
          round: r,
          matchIndex: i / 2,
        };
        currentRound.push(match);
      }
      rounds.push(currentRound);
    }

    // BYE 승자를 다음 라운드에 전파
    this.propagateByes(rounds);

    return rounds;
  },

  propagateByes(rounds) {
    for (let r = 0; r < rounds.length - 1; r++) {
      for (let m = 0; m < rounds[r].length; m++) {
        const match = rounds[r][m];
        if (match.winner) {
          const nextMatchIndex = Math.floor(m / 2);
          const nextMatch = rounds[r + 1][nextMatchIndex];
          if (m % 2 === 0) {
            nextMatch.player1 = match.winner;
          } else {
            nextMatch.player2 = match.winner;
          }
          // 다음 라운드도 BYE vs 실제 선수면 자동 승리
          if (nextMatch.player1 && nextMatch.player2) {
            // 둘 다 있으면 대기
          } else if (nextMatch.player1 && nextMatch.player2 === null && rounds[r].length > 1) {
            // 상대 매치도 확인
            const siblingIndex = m % 2 === 0 ? m + 1 : m - 1;
            if (siblingIndex < rounds[r].length && rounds[r][siblingIndex].winner) {
              // 둘 다 결정됨
            }
          }
        }
      }
    }
  },

  // 토너먼트 뷰 렌더링
  render(container, tournament) {
    const rounds = tournament.rounds;
    const totalRounds = rounds.length;
    const roundNames = this.getRoundNames(totalRounds);
    const isComplete = rounds[totalRounds - 1][0].winner !== null;

    let html = `
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-800">${Results.escapeHtml(tournament.name)}</h2>
          <span class="text-sm text-gray-500">${tournament.gameTypeLabel || ''} · 토너먼트 · ${tournament.players.length}${tournament.gameType && GAME_TYPES[tournament.gameType]?.doubles ? '팀' : '명'}</span>
        </div>
        ${isComplete ? `<span class="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-semibold">완료</span>` :
          `<span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">진행 중</span>`}
      </div>`;

    if (isComplete) {
      html += `
        <div class="bg-gradient-to-r from-yellow-50 to-yellow-100 border border-yellow-200 rounded-2xl p-4 mb-6 text-center">
          <div class="text-yellow-600 text-sm font-medium mb-1">우승</div>
          <div class="text-2xl font-bold text-yellow-800">${Results.escapeHtml(rounds[totalRounds - 1][0].winner)}</div>
        </div>`;
    }

    html += `<div class="bracket-scroll-hint"><div class="bracket-container overflow-x-auto pb-4"><div class="bracket flex gap-0 min-w-max">`;

    for (let r = 0; r < totalRounds; r++) {
      html += `
        <div class="bracket-round flex flex-col" style="min-width: 200px;">
          <div class="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">${roundNames[r]}</div>
          <div class="flex flex-col justify-around flex-1 gap-2">`;

      for (const match of rounds[r]) {
        const canEdit = match.player1 && match.player2 && !match.winner;
        const hasResult = match.winner !== null;
        const isBye = match.scores && match.scores.length === 0;

        html += `
          <div class="bracket-match mx-2 ${canEdit ? 'cursor-pointer hover:shadow-md active:scale-[0.98]' : ''} ${hasResult ? 'completed' : ''}"
               data-match-id="${match.id}" data-round="${r}">
            <div class="match-card bg-white border ${hasResult ? 'border-green-200' : 'border-gray-200'} rounded-xl overflow-hidden shadow-sm">
              <div class="match-player flex items-center justify-between px-3 py-2 ${match.winner === match.player1 && match.player1 ? 'bg-green-50 font-semibold text-green-800' : 'text-gray-700'} ${!match.player1 ? 'text-gray-300 italic' : ''} border-b border-gray-100">
                <span class="truncate text-sm">${match.player1 ? Results.escapeHtml(match.player1) : (isBye ? 'BYE' : '대기 중')}</span>
                ${match.scores && match.scores.length > 0 ? `<span class="text-xs text-gray-500 ml-2 whitespace-nowrap">${match.scores.map(s => s[0]).join(' ')}</span>` : ''}
              </div>
              <div class="match-player flex items-center justify-between px-3 py-2 ${match.winner === match.player2 && match.player2 ? 'bg-green-50 font-semibold text-green-800' : 'text-gray-700'} ${!match.player2 ? 'text-gray-300 italic' : ''}">
                <span class="truncate text-sm">${match.player2 ? Results.escapeHtml(match.player2) : (isBye ? 'BYE' : '대기 중')}</span>
                ${match.scores && match.scores.length > 0 ? `<span class="text-xs text-gray-500 ml-2 whitespace-nowrap">${match.scores.map(s => s[1]).join(' ')}</span>` : ''}
              </div>
            </div>
            ${canEdit ? '<div class="text-center mt-1"><span class="text-xs text-green-600 font-medium">클릭하여 결과 입력</span></div>' : ''}
          </div>`;
      }

      html += `</div></div>`;

      // 라운드 사이 연결선
      if (r < totalRounds - 1) {
        html += `<div class="bracket-connector flex flex-col justify-around" style="width: 24px;"></div>`;
      }
    }

    html += `</div></div></div>`;
    container.innerHTML = html;

    // 브래킷 스크롤 힌트: 끝까지 스크롤하면 그라데이션 숨김
    const scrollContainer = container.querySelector('.bracket-container');
    const scrollHint = container.querySelector('.bracket-scroll-hint');
    if (scrollContainer && scrollHint) {
      const checkScroll = () => {
        const atEnd = scrollContainer.scrollLeft + scrollContainer.clientWidth >= scrollContainer.scrollWidth - 10;
        scrollHint.classList.toggle('scrolled-end', atEnd);
      };
      scrollContainer.addEventListener('scroll', checkScroll, { passive: true });
      checkScroll();
    }

    // 클릭 이벤트 바인딩
    container.querySelectorAll('.bracket-match[data-match-id]').forEach(el => {
      el.onclick = () => {
        const matchId = el.dataset.matchId;
        const round = parseInt(el.dataset.round);
        const match = rounds[round].find(m => m.id === matchId);
        if (!match || !match.player1 || !match.player2 || match.winner) return;

        Results.showScoreModal(match, tournament, (result) => {
          match.scores = result.scores;
          match.winner = result.winner;

          // 다음 라운드에 승자 전파
          if (round < totalRounds - 1) {
            const nextMatchIndex = Math.floor(match.matchIndex / 2);
            const nextMatch = rounds[round + 1][nextMatchIndex];
            if (match.matchIndex % 2 === 0) {
              nextMatch.player1 = result.winner;
            } else {
              nextMatch.player2 = result.winner;
            }
          }

          // 대회 완료 체크
          if (rounds[totalRounds - 1][0].winner) {
            tournament.status = 'completed';
            tournament.completedAt = new Date().toISOString();
          }

          Storage.updateTournament(tournament);
          this.render(container, tournament);
        });
      };
    });
  },

  getRoundNames(totalRounds) {
    const names = [];
    for (let i = 0; i < totalRounds; i++) {
      const remaining = totalRounds - i;
      if (remaining === 1) names.push('결승');
      else if (remaining === 2) names.push('준결승');
      else if (remaining === 3) names.push('8강');
      else if (remaining === 4) names.push('16강');
      else names.push(`${Math.pow(2, remaining)}강`);
    }
    return names;
  },
};
