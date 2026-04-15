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

  // 선수 관련
  getPlayers() {
    return this.get(this.KEYS.PLAYERS) || [];
  },

  savePlayers(players) {
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

  // localStorage → Firestore (JSON 문자열로 직렬화하여 저장)
  syncToFirestore(docName, data) {
    const user = fbAuth.currentUser;
    if (!user) return;
    fbDb.collection('users').doc(user.uid).collection('data').doc(docName)
      .set({ json: JSON.stringify(data || []) })
      .catch(err => console.error('Firestore sync error:', err));
  },

  // Firestore → localStorage (로그인 시 호출)
  async loadFromFirestore() {
    const user = fbAuth.currentUser;
    if (!user) return;
    try {
      const base = fbDb.collection('users').doc(user.uid).collection('data');
      const [pDoc, tDoc] = await Promise.all([
        base.doc('players').get(),
        base.doc('tournaments').get()
      ]);

      if (pDoc.exists) {
        const d = pDoc.data();
        const items = d.json ? JSON.parse(d.json) : (d.items || []);
        localStorage.setItem(this.KEYS.PLAYERS, JSON.stringify(items));
      } else {
        const local = this.getPlayers();
        if (local.length > 0) this.syncToFirestore('players', local);
      }

      if (tDoc.exists) {
        const d = tDoc.data();
        const items = d.json ? JSON.parse(d.json) : (d.items || []);
        localStorage.setItem(this.KEYS.TOURNAMENTS, JSON.stringify(items));
      } else {
        const local = this.getTournaments();
        if (local.length > 0) this.syncToFirestore('tournaments', local);
      }
    } catch (err) {
      console.error('Firestore load error:', err);
    }
  },

  // ─── 실시간 동기화 (onSnapshot) ───

  startRealtimeSync() {
    const user = fbAuth.currentUser;
    if (!user) return;
    const base = fbDb.collection('users').doc(user.uid).collection('data');

    // 선수 데이터 실시간 리스너
    this._unsubPlayers = base.doc('players').onSnapshot((doc) => {
      // 내가 쓴 변경이 서버 반영 전이면 무시 (localStorage에 이미 있음)
      if (doc.metadata.hasPendingWrites) return;
      if (!doc.exists) return;
      const d = doc.data();
      const items = d.json ? JSON.parse(d.json) : (d.items || []);
      const current = localStorage.getItem(this.KEYS.PLAYERS);
      const newJson = JSON.stringify(items);
      if (current !== newJson) {
        localStorage.setItem(this.KEYS.PLAYERS, newJson);
        console.log('실시간 동기화: 선수 데이터 업데이트');
        this._onRemoteChange();
      }
    }, (err) => {
      console.error('Players realtime sync error:', err);
    });

    // 대회 데이터 실시간 리스너
    this._unsubTournaments = base.doc('tournaments').onSnapshot((doc) => {
      if (doc.metadata.hasPendingWrites) return;
      if (!doc.exists) return;
      const d = doc.data();
      const items = d.json ? JSON.parse(d.json) : (d.items || []);
      const current = localStorage.getItem(this.KEYS.TOURNAMENTS);
      const newJson = JSON.stringify(items);
      if (current !== newJson) {
        localStorage.setItem(this.KEYS.TOURNAMENTS, newJson);
        console.log('실시간 동기화: 대회 데이터 업데이트');
        this._onRemoteChange();
      }
    }, (err) => {
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
