// results.js - 스코어 입력 UI + 승자 판정 로직
const Results = {
  // 스코어 입력 모달 표시
  showScoreModal(match, tournament, onSave) {
    const existing = document.getElementById('score-modal');
    if (existing) existing.remove();

    const setCount = tournament.setCount || 3;
    const setsToWin = Math.ceil(setCount / 2);
    const allowDraw = !!tournament.allowDraw;

    const modal = document.createElement('div');
    modal.id = 'score-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4';

    const player1Name = match.player1 || 'BYE';
    const player2Name = match.player2 || 'BYE';
    const t1Html = this.formatTeamHtml(player1Name);
    const t2Html = this.formatTeamHtml(player2Name);

    // 팀 이름 축약 (첫 번째 선수 성만 표시)
    const t1Short = player1Name.split(' / ')[0].slice(0, 3) + 'Team';
    const t2Short = player2Name.split(' / ')[0].slice(0, 3) + 'Team';

    let setsHTML = `
      <div class="flex items-center gap-2 justify-center mb-1">
        <span class="w-16"></span>
        <span class="w-14 text-center text-xs font-bold text-green-600">${this.escapeHtml(t1Short)}</span>
        <span class="w-3"></span>
        <span class="w-14 text-center text-xs font-bold text-blue-600">${this.escapeHtml(t2Short)}</span>
      </div>`;
    for (let i = 0; i < setCount; i++) {
      const s1 = match.scores ? (match.scores[i]?.[0] ?? '') : '';
      const s2 = match.scores ? (match.scores[i]?.[1] ?? '') : '';
      setsHTML += `
        <div class="flex items-center gap-2 justify-center">
          <span class="text-sm text-gray-500 w-16">세트 ${i + 1}</span>
          <input type="number" min="0" max="7" class="score-input w-14 h-10 text-center border-2 border-green-300 bg-green-50 rounded-lg text-lg font-bold text-green-700 focus:ring-2 focus:ring-green-500 focus:border-green-500"
            data-set="${i}" data-player="0" value="${s1}" placeholder="0">
          <span class="text-gray-400 font-bold">:</span>
          <input type="number" min="0" max="7" class="score-input w-14 h-10 text-center border-2 border-blue-300 bg-blue-50 rounded-lg text-lg font-bold text-blue-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            data-set="${i}" data-player="1" value="${s2}" placeholder="0">
        </div>`;
    }

    modal.innerHTML = `
      <div class="bg-white/95 backdrop-blur-md rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-green-100/30 max-w-sm w-full p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div class="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden"></div>
        <h3 class="text-lg font-bold text-center mb-4">스코어 입력</h3>
        <div class="space-y-1.5 mb-4">
          <div class="bg-green-50 rounded-xl px-3 py-2 text-center">
            <span class="font-semibold text-green-700 text-xs sm:text-sm">${t1Html}</span>
          </div>
          <div class="text-center text-xs text-gray-400 font-medium">vs</div>
          <div class="bg-blue-50 rounded-xl px-3 py-2 text-center">
            <span class="font-semibold text-blue-700 text-xs sm:text-sm">${t2Html}</span>
          </div>
        </div>
        <div class="space-y-3 mb-5">${setsHTML}</div>
        <div id="score-error" class="text-red-500 text-sm text-center mb-3 hidden"></div>
        <div class="flex gap-3">
          <button id="score-cancel" class="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 active:bg-gray-300 transition font-medium">취소</button>
          <button id="score-save" class="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 active:bg-green-800 transition font-medium">저장</button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    modal.querySelector('#score-cancel').onclick = () => modal.remove();
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    modal.querySelector('#score-save').onclick = () => {
      const scores = [];
      const inputs = modal.querySelectorAll('.score-input');

      for (let i = 0; i < setCount; i++) {
        const s1 = inputs[i * 2].value;
        const s2 = inputs[i * 2 + 1].value;
        if (s1 !== '' && s2 !== '') {
          scores.push([parseInt(s1), parseInt(s2)]);
        }
      }

      if (scores.length === 0) {
        const err = modal.querySelector('#score-error');
        err.textContent = '최소 1세트의 스코어를 입력해주세요.';
        err.classList.remove('hidden');
        return;
      }

      const result = this.determineWinner(scores, setsToWin, allowDraw);
      if (!result.valid) {
        const err = modal.querySelector('#score-error');
        err.textContent = result.error;
        err.classList.remove('hidden');
        return;
      }

      onSave({
        scores: scores,
        winner: result.winner === -1 ? 'draw' : (result.winner === 0 ? match.player1 : match.player2),
        winnerIndex: result.winner,
        setsWon: result.setsWon,
      });

      modal.remove();
    };

    // 첫 번째 입력에 포커스
    setTimeout(() => {
      const firstInput = modal.querySelector('.score-input');
      if (firstInput) firstInput.focus();
    }, 100);
  },

  // 승자 판정
  determineWinner(scores, setsToWin, allowDraw) {
    let p1Sets = 0;
    let p2Sets = 0;

    for (const [s1, s2] of scores) {
      if (s1 < 0 || s2 < 0) {
        return { valid: false, error: '스코어는 0 이상이어야 합니다.' };
      }
      if (s1 === s2) {
        if (!allowDraw) {
          return { valid: false, error: '같은 스코어는 입력할 수 없습니다.' };
        }
        // 무승부 세트 - 어느 쪽도 세트 승 안 줌
      } else if (s1 > s2) {
        p1Sets++;
      } else {
        p2Sets++;
      }
    }

    // 무승부 허용 모드: 동점이면 무승부
    if (allowDraw && p1Sets === p2Sets) {
      return { valid: true, winner: -1, setsWon: [p1Sets, p2Sets] };
    }

    if (p1Sets < setsToWin && p2Sets < setsToWin) {
      return { valid: false, error: `${setsToWin}세트 선승이 필요합니다. 세트를 더 입력해주세요.` };
    }

    return {
      valid: true,
      winner: p1Sets >= setsToWin ? 0 : 1,
      setsWon: [p1Sets, p2Sets],
    };
  },

  // 스코어 문자열로 포매팅
  formatScores(scores) {
    if (!scores || scores.length === 0) return '-';
    return scores.map(([s1, s2]) => `${s1}-${s2}`).join(', ');
  },

  // 팀 문자열("A / B")을 NTRP 포함 HTML로 변환
  formatTeamHtml(teamStr) {
    const allPlayers = Storage.getPlayers();
    const names = teamStr.split(' / ');
    return names.map(name => {
      const pd = allPlayers.find(p => p.name === name);
      const ntrp = (pd?.ntrp || 2.5).toFixed(1);
      return `${this.escapeHtml(name)}<span class="text-yellow-600 text-xs ml-0.5">${ntrp}</span>`;
    }).join(' <span class="text-gray-300 mx-0.5">/</span> ');
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
};
