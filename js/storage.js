// storage.js - localStorage CRUD + Firestore 동기화
const Storage = {
  KEYS: {
    PLAYERS: 'tennis_players',
    TOURNAMENTS: 'tennis_tournaments',
  },

  get(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Storage get error:', e);
      return null;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage set error:', e);
      return false;
    }
  },

  // 멤버 관련
  getPlayers() {
    return this.get(this.KEYS.PLAYERS) || [];
  },

  savePlayers(players) {
    if (typeof RolesConfig !== 'undefined' && RolesConfig.isMember()) {
      console.warn('멤버는 멤버 목록을 수정할 수 없습니다.');
      return false;
    }
    const result = this.set(this.KEYS.PLAYERS, players);
    this.syncToFirestore('players', players);
    return result;
  },

  // 대회 관련
  getTournaments() {
    return this.get(this.KEYS.TOURNAMENTS) || [];
  },

  saveTournaments(tournaments) {
    const result = this.set(this.KEYS.TOURNAMENTS, tournaments);
    this.syncToFirestore('tournaments', tournaments);
    return result;
  },

  getTournamentById(id) {
    const tournaments = this.getTournaments();
    return tournaments.find(t => t.id === id) || null;
  },

  updateTournament(updatedTournament) {
    const tournaments = this.getTournaments();
    const index = tournaments.findIndex(t => t.id === updatedTournament.id);
    if (index !== -1) {
      tournaments[index] = updatedTournament;
      this.saveTournaments(tournaments);
      return true;
    }
    return false;
  },

  deleteTournament(id) {
    const tournaments = this.getTournaments().filter(t => t.id !== id);
    this.saveTournaments(tournaments);
  },

  // 유틸리티
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  },

  // ─── Firestore 동기화 ───

  _unsubPlayers: null,
  _unsubTournaments: null,

  // Firestore 경로 분기: 클럽 사용자(admin/member) → 공유, 그 외 → per-user
  _getBase() {
    var user = fbAuth.currentUser;
    if (!user) return null;
    if (typeof RolesConfig !== 'undefined' && RolesConfig.isClubUser()) {
      return fbDb.collection('club').doc('shared').collection('data');
    }
    return fbDb.collection('users').doc(user.uid).collection('data');
  },

  // localStorage → Firestore
  syncToFirestore(docName, data) {
    var base = this._getBase();
    if (!base) return;
    base.doc(docName)
      .set({ json: JSON.stringify(data || []) })
      .catch(function(err) { console.error('Firestore sync error:', err); });
  },

  // Firestore → localStorage (로그인 시 호출)
  async loadFromFirestore() {
    var user = fbAuth.currentUser;
    if (!user) return;
    var base = this._getBase();
    if (!base) return;

    try {
      var results = await Promise.all([
        base.doc('players').get(),
        base.doc('tournaments').get()
      ]);
      var pDoc = results[0];
      var tDoc = results[1];

      if (pDoc.exists) {
        var d = pDoc.data();
        var items = d.json ? JSON.parse(d.json) : (d.items || []);
        localStorage.setItem(this.KEYS.PLAYERS, JSON.stringify(items));
      } else if (RolesConfig.isAdmin()) {
        // 관리자: 기존 per-user 데이터를 공유 경로로 마이그레이션
        await this._migrateToShared();
        return;
      } else if (RolesConfig.isMember()) {
        // 멤버: 공유 데이터가 아직 없으면 빈 상태
        localStorage.setItem(this.KEYS.PLAYERS, JSON.stringify([]));
        localStorage.setItem(this.KEYS.TOURNAMENTS, JSON.stringify([]));
        return;
      } else {
        // 그 외: per-user에 데이터 없으면 로컬 데이터를 업로드
        var local = this.getPlayers();
        if (local.length > 0) this.syncToFirestore('players', local);
      }

      if (tDoc.exists) {
        var dt = tDoc.data();
        var tItems = dt.json ? JSON.parse(dt.json) : (dt.items || []);
        localStorage.setItem(this.KEYS.TOURNAMENTS, JSON.stringify(tItems));
      } else if (!RolesConfig.isMember()) {
        var localT = this.getTournaments();
        if (localT.length > 0) this.syncToFirestore('tournaments', localT);
      }
    } catch (err) {
      console.error('Firestore load error:', err);
    }
  },

  // 관리자 최초 로그인 시: 기존 per-user 데이터 → 공유 경로로 마이그레이션
  async _migrateToShared() {
    var user = fbAuth.currentUser;
    if (!user) return;
    console.log('기존 데이터를 공유 경로로 마이그레이션 중...');
    try {
      var userBase = fbDb.collection('users').doc(user.uid).collection('data');
      var sharedBase = fbDb.collection('club').doc('shared').collection('data');
      var results = await Promise.all([
        userBase.doc('players').get(),
        userBase.doc('tournaments').get()
      ]);
      var pDoc = results[0];
      var tDoc = results[1];

      var players = [];
      var tournaments = [];

      if (pDoc.exists) {
        var d = pDoc.data();
        players = d.json ? JSON.parse(d.json) : (d.items || []);
      }
      if (tDoc.exists) {
        var dt = tDoc.data();
        tournaments = dt.json ? JSON.parse(dt.json) : (dt.items || []);
      }

      // 공유 경로에 저장
      await Promise.all([
        sharedBase.doc('players').set({ json: JSON.stringify(players) }),
        sharedBase.doc('tournaments').set({ json: JSON.stringify(tournaments) })
      ]);

      localStorage.setItem(this.KEYS.PLAYERS, JSON.stringify(players));
      localStorage.setItem(this.KEYS.TOURNAMENTS, JSON.stringify(tournaments));
      console.log('마이그레이션 완료');
    } catch (err) {
      console.error('마이그레이션 오류:', err);
    }
  },

  // ─── 실시간 동기화 (onSnapshot) ───

  startRealtimeSync() {
    var user = fbAuth.currentUser;
    if (!user) return;
    var base = this._getBase();
    if (!base) return;
    var self = this;

    // 데이터 실시간 리스너
    this._unsubPlayers = base.doc('players').onSnapshot(function(doc) {
      if (doc.metadata.hasPendingWrites) return;
      if (!doc.exists) return;
      var d = doc.data();
      var items = d.json ? JSON.parse(d.json) : (d.items || []);
      var current = localStorage.getItem(self.KEYS.PLAYERS);
      var newJson = JSON.stringify(items);
      if (current !== newJson) {
        localStorage.setItem(self.KEYS.PLAYERS, newJson);
        console.log('실시간 동기화: 멤버 데이터 업데이트');
        self._onRemoteChange();
      }
    }, function(err) {
      console.error('Players realtime sync error:', err);
    });

    // 대회 데이터 실시간 리스너 (공유 경로)
    this._unsubTournaments = base.doc('tournaments').onSnapshot(function(doc) {
      if (doc.metadata.hasPendingWrites) return;
      if (!doc.exists) return;
      var d = doc.data();
      var items = d.json ? JSON.parse(d.json) : (d.items || []);
      var current = localStorage.getItem(self.KEYS.TOURNAMENTS);
      var newJson = JSON.stringify(items);
      if (current !== newJson) {
        localStorage.setItem(self.KEYS.TOURNAMENTS, newJson);
        console.log('실시간 동기화: 대회 데이터 업데이트');
        self._onRemoteChange();
      }
    }, function(err) {
      console.error('Tournaments realtime sync error:', err);
    });

    console.log('실시간 동기화 시작');
  },

  stopRealtimeSync() {
    if (this._unsubPlayers) {
      this._unsubPlayers();
      this._unsubPlayers = null;
    }
    if (this._unsubTournaments) {
      this._unsubTournaments();
      this._unsubTournaments = null;
    }
    console.log('실시간 동기화 중지');
  },

  // 원격 변경 시 UI 갱신
  _onRemoteChange() {
    if (typeof App !== 'undefined' && App.currentTab) {
      App.navigate(App.currentTab);
    }
  },
};
