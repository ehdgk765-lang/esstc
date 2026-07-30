// roles-config.js - 역할 설정 및 헬퍼
const RolesConfig = {
  _currentRole: null,

  // Firestore에서 역할 조회 (로그인 시 호출, 비동기)
  async initRole() {
    var user = fbAuth.currentUser;
    if (!user) {
      this._currentRole = null;
      return;
    }
    var email = user.email.toLowerCase();
    try {
      var doc = await fbDb.collection('roles').doc(email).get();
      if (doc.exists) {
        this._currentRole = doc.data().role || 'other';
      } else {
        this._currentRole = 'other';
      }
    } catch (e) {
      console.error('역할 조회 실패:', e);
      this._currentRole = 'other';
    }
  },

  isAdmin() {
    return this._currentRole === 'admin';
  },

  isMember() {
    return this._currentRole === 'member';
  },

  isOther() {
    return this._currentRole === 'other';
  },

  // 관리자 또는 관리자 권한을 부여받은 멤버 (멤버 이름 기반)
  hasAdminAccess() {
    if (this.isAdmin()) return true;
    if (!this.isMember()) return false;
    var memberName = typeof App !== 'undefined' ? App.getMemberName() : '';
    if (!memberName) return false;
    var players = typeof Storage !== 'undefined' ? Storage.getPlayers() : [];
    var player = players.find(function(p) { return p.name === memberName; });
    return !!(player && player.adminAccess);
  },

  // 관리자 또는 멤버 (공유 데이터 사용자)
  isClubUser() {
    return this.isAdmin() || this.isMember();
  },

  getVisibleTabs() {
    if (this.isMember()) {
      if (this.hasAdminAccess()) {
        // 권한 부여 멤버: 일정 보기 + 일정 관리 + 진행 중 + 통계
        return ['calendar', 'schedule', 'active', 'stats'];
      }
      return ['calendar', 'active'];
    }
    if (this.isAdmin()) {
      return ['players', 'create', 'schedule', 'active', 'stats'];
    }
    // other: 통계 제외
    return ['players', 'create', 'schedule', 'active'];
  },

  getDefaultTab() {
    if (this.isMember()) {
      return 'calendar';
    }
    return 'players';
  },

  // ─── 관리자용: 역할 관리 ───

  // 역할 목록 전체 조회
  async getRoles() {
    try {
      var snapshot = await fbDb.collection('roles').get();
      var roles = [];
      snapshot.forEach(function(doc) {
        roles.push({ email: doc.id, role: doc.data().role });
      });
      return roles;
    } catch (e) {
      console.error('역할 목록 조회 실패:', e);
      return [];
    }
  },

  // 역할 설정 (추가/수정)
  async setRole(email, role) {
    try {
      await fbDb.collection('roles').doc(email.toLowerCase()).set({ role: role });
      return true;
    } catch (e) {
      console.error('역할 설정 실패:', e);
      return false;
    }
  },

  // 역할 삭제
  async removeRole(email) {
    try {
      await fbDb.collection('roles').doc(email.toLowerCase()).delete();
      return true;
    } catch (e) {
      console.error('역할 삭제 실패:', e);
      return false;
    }
  }
};
