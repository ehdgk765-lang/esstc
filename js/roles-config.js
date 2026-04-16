// roles-config.js - 역할 설정 및 헬퍼
// 계정 종류: admin(관리자), member(멤버), other(그 외)
// - admin/member: 공유 데이터 (club/shared/) 사용, 상호작용
// - other: 독립 데이터 (users/{uid}/) 사용, 전체 기능
const RolesConfig = {
  // 관리자 이메일 (소문자로 비교)
  ADMIN_EMAILS: [
    'admin@esstc.com'
    // 필요 시 추가: 'another@admin.com'
  ],

  // 멤버 이메일 (소문자로 비교)
  MEMBER_EMAILS: [
    'member@esstc.com',
    // 'member2@example.com'
  ],

  _currentRole: null,

  getRole(email) {
    if (!email) return 'other';
    var lower = email.toLowerCase();
    if (this.ADMIN_EMAILS.includes(lower)) return 'admin';
    if (this.MEMBER_EMAILS.includes(lower)) return 'member';
    return 'other';
  },

  initRole() {
    var user = fbAuth.currentUser;
    this._currentRole = user ? this.getRole(user.email) : null;
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
  }
};
