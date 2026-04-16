// roles-config.js - 역할 설정 및 헬퍼
// 계정 종류: admin(관리자), member(멤버), other(그 외)
// - admin/member: 공유 데이터 (club/shared/) 사용, 상호작용
// - other: 독립 데이터 (users/{uid}/) 사용, 전체 기능
// - 역할 정보는 Firestore roles 컬렉션에서 관리 (소스코드에 이메일 미포함)
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
        // 역할 문서가 없으면 → roles 컬렉션 자체가 비어있는지 확인 (최초 설정)
        var snapshot = await fbDb.collection('roles').limit(1).get();
        if (snapshot.empty) {
          // 최초 로그인: 현재 사용자를 관리자로 자동 설정
          await fbDb.collection('roles').doc(email).set({ role: 'admin' });
          this._currentRole = 'admin';
        } else {
          this._currentRole = 'other';
        }
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

  // 관리자 또는 멤버 (공유 데이터 사용자)
  isClubUser() {
    return this.isAdmin() || this.isMember();
  },

  getVisibleTabs() {
    if (this.isMember()) {
      return ['calendar', 'active'];
    }
    // admin, other 모두 전체 탭
    return ['players', 'create', 'schedule', 'active'];
  },

  getDefaultTab() {
    return this.isMember() ? 'calendar' : 'players';
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
