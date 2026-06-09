// storage.js - localStorage CRUD + Firestore 동기화
const Storage = {
  KEYS: {
    PLAYERS: 'tennis_players',
    TOURNAMENTS: 'tennis_tournaments',
    TEAMS: 'tennis_teams',
    EVENTS: 'tennis_events',
    COURTS: 'tennis_courts',
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

  // 팀 관련
  getTeams() {
    return this.get(this.KEYS.TEAMS) || [];
  },

  saveTeams(teams) {
    if (typeof RolesConfig !== 'undefined' && RolesConfig.isMember()) {
      console.warn('멤버는 팀 목록을 수정할 수 없습니다.');
      return false;
    }
    const result = this.set(this.KEYS.TEAMS, teams);
    this.syncToFirestore('teams', teams);
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

  async updateTournament(updatedTournament) {
    var self = this;
    var base = this._getBase();
    if (!base) return this._updateTournamentLocal(updatedTournament);

    var docRef = base.doc('tournaments');
    try {
      var finalTournaments = null;
      await fbDb.runTransaction(function(transaction) {
        return transaction.get(docRef).then(function(doc) {
          var tournaments = [];
          if (doc.exists) {
            var d = doc.data();
            tournaments = d.json ? JSON.parse(d.json) : (d.items || []);
          }
          var index = tournaments.findIndex(function(t) { return t.id === updatedTournament.id; });
          if (index !== -1) {
            tournaments[index] = updatedTournament;
            transaction.set(docRef, { json: JSON.stringify(tournaments) });
            finalTournaments = tournaments;
          }
        });
      });
      if (finalTournaments) {
        localStorage.setItem(self.KEYS.TOURNAMENTS, JSON.stringify(finalTournaments));
      }
      return true;
    } catch (err) {
      console.error('updateTournament transaction error:', err);
      return this._updateTournamentLocal(updatedTournament);
    }
  },

  _updateTournamentLocal(updatedTournament) {
    var tournaments = this.getTournaments();
    var index = tournaments.findIndex(function(t) { return t.id === updatedTournament.id; });
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

  // 일정 관련
  getEvents() {
    return this.get(this.KEYS.EVENTS) || [];
  },

  saveEvents(events) {
    if (typeof RolesConfig !== 'undefined' && RolesConfig.isMember()) {
      console.warn('멤버는 일정을 수정할 수 없습니다.');
      return false;
    }
    var result = this.set(this.KEYS.EVENTS, events);
    this.syncToFirestore('events', events);
    return result;
  },

  // 멤버 참석/취소 (멤버도 호출 가능) - Firestore Transaction 기반
  async toggleAttendance(eventId, memberName) {
    var self = this;
    var base = this._getBase();
    if (!base) return this._applyToggleAttendance(this.getEvents(), eventId, memberName, true);

    var docRef = base.doc('events');
    try {
      var finalEvents = null;
      var result = await fbDb.runTransaction(function(transaction) {
        return transaction.get(docRef).then(function(doc) {
          var events = [];
          if (doc.exists) {
            var d = doc.data();
            events = d.json ? JSON.parse(d.json) : (d.items || []);
          }
          var toggleResult = self._applyToggleAttendance(events, eventId, memberName, false);
          if (toggleResult.changed) {
            transaction.set(docRef, { json: JSON.stringify(events) });
          }
          finalEvents = events;
          return toggleResult.result;
        });
      });
      if (finalEvents) {
        localStorage.setItem(self.KEYS.EVENTS, JSON.stringify(finalEvents));
      }
      return result;
    } catch (err) {
      console.error('toggleAttendance transaction error:', err);
      return this._applyToggleAttendance(this.getEvents(), eventId, memberName, true);
    }
  },

  // 참석 토글 핵심 로직 (events 배열을 직접 수정)
  _applyToggleAttendance(events, eventId, memberName, saveLocal) {
    for (var i = 0; i < events.length; i++) {
      if (events[i].id === eventId) {
        var ev = events[i];
        if (!ev.participants) ev.participants = [];
        if (!ev.waitlist) ev.waitlist = [];
        var idx = ev.participants.indexOf(memberName);
        if (idx >= 0) {
          ev.participants.splice(idx, 1);
          if (ev.waitlist.length > 0) {
            var promoted = ev.waitlist.shift();
            ev.participants.push(promoted);
          }
        } else {
          if (ev.maxParticipants > 0 && ev.participants.length >= ev.maxParticipants) {
            return { changed: false, result: 'full' };
          }
          var evStart = ev.startTime || ev.time || '';
          if (evStart) {
            for (var j = 0; j < events.length; j++) {
              if (events[j].id === eventId) continue;
              if (events[j].date !== ev.date) continue;
              var otherStart = events[j].startTime || events[j].time || '';
              if (otherStart === evStart) {
                var otherP = events[j].participants || [];
                if (otherP.indexOf(memberName) >= 0) {
                  return { changed: false, result: { conflict: true, title: events[j].title } };
                }
              }
            }
          }
          ev.participants.push(memberName);
          var wIdx = ev.waitlist.indexOf(memberName);
          if (wIdx >= 0) ev.waitlist.splice(wIdx, 1);
        }
        if (saveLocal) {
          this.set(this.KEYS.EVENTS, events);
          this.syncToFirestore('events', events);
        }
        return { changed: true, result: true };
      }
    }
    return { changed: false, result: false };
  },

  // 대기 신청/취소 (멤버도 호출 가능) - Firestore Transaction 기반
  async toggleWaitlist(eventId, memberName) {
    var self = this;
    var base = this._getBase();
    if (!base) return this._applyToggleWaitlist(this.getEvents(), eventId, memberName, true);

    var docRef = base.doc('events');
    try {
      var finalEvents = null;
      var result = await fbDb.runTransaction(function(transaction) {
        return transaction.get(docRef).then(function(doc) {
          var events = [];
          if (doc.exists) {
            var d = doc.data();
            events = d.json ? JSON.parse(d.json) : (d.items || []);
          }
          var toggleResult = self._applyToggleWaitlist(events, eventId, memberName, false);
          if (toggleResult.changed) {
            transaction.set(docRef, { json: JSON.stringify(events) });
          }
          finalEvents = events;
          return toggleResult.result;
        });
      });
      if (finalEvents) {
        localStorage.setItem(self.KEYS.EVENTS, JSON.stringify(finalEvents));
      }
      return result;
    } catch (err) {
      console.error('toggleWaitlist transaction error:', err);
      return this._applyToggleWaitlist(this.getEvents(), eventId, memberName, true);
    }
  },

  _applyToggleWaitlist(events, eventId, memberName, saveLocal) {
    for (var i = 0; i < events.length; i++) {
      if (events[i].id === eventId) {
        var ev = events[i];
        if (!ev.waitlist) ev.waitlist = [];
        var idx = ev.waitlist.indexOf(memberName);
        if (idx >= 0) {
          ev.waitlist.splice(idx, 1);
        } else {
          ev.waitlist.push(memberName);
        }
        if (saveLocal) {
          this.set(this.KEYS.EVENTS, events);
          this.syncToFirestore('events', events);
        }
        return { changed: true, result: true };
      }
    }
    return { changed: false, result: false };
  },

  // 코트 관련
  getCourts() {
    return this.get(this.KEYS.COURTS) || [];
  },

  saveCourts(courts) {
    if (typeof RolesConfig !== 'undefined' && !RolesConfig.isAdmin()) {
      console.warn('관리자만 코트를 수정할 수 있습니다.');
      return false;
    }
    var result = this.set(this.KEYS.COURTS, courts);
    this.syncToFirestore('courts', courts);
    return result;
  },

  // 유틸리티
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  },

  // ─── Firestore 동기화 ───

  _unsubPlayers: null,
  _unsubTournaments: null,
  _unsubEvents: null,
  _unsubCourts: null,
  _remoteChangeTimer: null,

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

    // 이전 세션 데이터 잔존 방지: Firestore 로드 전 localStorage 초기화
    localStorage.removeItem(this.KEYS.PLAYERS);
    localStorage.removeItem(this.KEYS.TOURNAMENTS);
    localStorage.removeItem(this.KEYS.TEAMS);
    localStorage.removeItem(this.KEYS.EVENTS);
    localStorage.removeItem(this.KEYS.COURTS);

    try {
      var results = await Promise.all([
        base.doc('players').get(),
        base.doc('tournaments').get(),
        base.doc('events').get(),
        base.doc('courts').get(),
        base.doc('teams').get()
      ]);
      var pDoc = results[0];
      var tDoc = results[1];
      var eDoc = results[2];
      var cDoc = results[3];
      var tmDoc = results[4];

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
        localStorage.setItem(this.KEYS.TEAMS, JSON.stringify([]));
        localStorage.setItem(this.KEYS.EVENTS, JSON.stringify([]));
        localStorage.setItem(this.KEYS.COURTS, JSON.stringify([]));
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

      if (eDoc.exists) {
        var de = eDoc.data();
        var eItems = de.json ? JSON.parse(de.json) : (de.items || []);
        localStorage.setItem(this.KEYS.EVENTS, JSON.stringify(eItems));
      } else if (!RolesConfig.isMember()) {
        var localE = this.getEvents();
        if (localE.length > 0) this.syncToFirestore('events', localE);
      }

      if (cDoc.exists) {
        var dc = cDoc.data();
        var cItems = dc.json ? JSON.parse(dc.json) : (dc.items || []);
        localStorage.setItem(this.KEYS.COURTS, JSON.stringify(cItems));
      } else if (RolesConfig.isAdmin()) {
        var localC = this.getCourts();
        if (localC.length > 0) this.syncToFirestore('courts', localC);
      }

      if (tmDoc.exists) {
        var dtm = tmDoc.data();
        var tmItems = dtm.json ? JSON.parse(dtm.json) : (dtm.items || []);
        localStorage.setItem(this.KEYS.TEAMS, JSON.stringify(tmItems));
      } else if (!RolesConfig.isMember()) {
        var localTm = this.getTeams();
        if (localTm.length > 0) this.syncToFirestore('teams', localTm);
      }
    } catch (err) {
      console.error('Firestore load error:', err);
    }
  },

  // 관리자 최초 로그인 시: 기존 per-user 데이터 → 공유 경로로 마이그레이션
  async _migrateToShared() {
    var user = fbAuth.currentUser;
    if (!user) return;
    // console.log('기존 데이터를 공유 경로로 마이그레이션 중...');
    try {
      var userBase = fbDb.collection('users').doc(user.uid).collection('data');
      var sharedBase = fbDb.collection('club').doc('shared').collection('data');
      var results = await Promise.all([
        userBase.doc('players').get(),
        userBase.doc('tournaments').get(),
        userBase.doc('events').get(),
        userBase.doc('courts').get(),
        userBase.doc('teams').get()
      ]);
      var pDoc = results[0];
      var tDoc = results[1];
      var eDoc = results[2];
      var cDoc = results[3];
      var tmDoc = results[4];

      var players = [];
      var tournaments = [];
      var events = [];
      var courts = [];
      var teams = [];

      if (pDoc.exists) {
        var d = pDoc.data();
        players = d.json ? JSON.parse(d.json) : (d.items || []);
      }
      if (tDoc.exists) {
        var dt = tDoc.data();
        tournaments = dt.json ? JSON.parse(dt.json) : (dt.items || []);
      }
      if (eDoc.exists) {
        var de = eDoc.data();
        events = de.json ? JSON.parse(de.json) : (de.items || []);
      }
      if (cDoc.exists) {
        var dc = cDoc.data();
        courts = dc.json ? JSON.parse(dc.json) : (dc.items || []);
      }
      if (tmDoc.exists) {
        var dtm = tmDoc.data();
        teams = dtm.json ? JSON.parse(dtm.json) : (dtm.items || []);
      }

      // 공유 경로에 저장
      await Promise.all([
        sharedBase.doc('players').set({ json: JSON.stringify(players) }),
        sharedBase.doc('tournaments').set({ json: JSON.stringify(tournaments) }),
        sharedBase.doc('events').set({ json: JSON.stringify(events) }),
        sharedBase.doc('courts').set({ json: JSON.stringify(courts) }),
        sharedBase.doc('teams').set({ json: JSON.stringify(teams) })
      ]);

      localStorage.setItem(this.KEYS.PLAYERS, JSON.stringify(players));
      localStorage.setItem(this.KEYS.TOURNAMENTS, JSON.stringify(tournaments));
      localStorage.setItem(this.KEYS.TEAMS, JSON.stringify(teams));
      localStorage.setItem(this.KEYS.EVENTS, JSON.stringify(events));
      localStorage.setItem(this.KEYS.COURTS, JSON.stringify(courts));
      // console.log('마이그레이션 완료');
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

    // 페이지 복귀 시 최신 데이터 동기화
    this._setupVisibilityListener();

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
        // console.log('실시간 동기화: 멤버 데이터 업데이트');
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
        // console.log('실시간 동기화: 대회 데이터 업데이트');
        self._onRemoteChange();
      }
    }, function(err) {
      console.error('Tournaments realtime sync error:', err);
    });

    // 일정 데이터 실시간 리스너
    this._unsubEvents = base.doc('events').onSnapshot(function(doc) {
      if (doc.metadata.hasPendingWrites) return;
      if (!doc.exists) return;
      var d = doc.data();
      var items = d.json ? JSON.parse(d.json) : (d.items || []);
      var current = localStorage.getItem(self.KEYS.EVENTS);
      var newJson = JSON.stringify(items);
      if (current !== newJson) {
        localStorage.setItem(self.KEYS.EVENTS, newJson);
        // console.log('실시간 동기화: 일정 데이터 업데이트');
        self._onRemoteChange();
      }
    }, function(err) {
      console.error('Events realtime sync error:', err);
    });

    // 코트 데이터 실시간 리스너
    this._unsubCourts = base.doc('courts').onSnapshot(function(doc) {
      if (doc.metadata.hasPendingWrites) return;
      if (!doc.exists) return;
      var d = doc.data();
      var items = d.json ? JSON.parse(d.json) : (d.items || []);
      var current = localStorage.getItem(self.KEYS.COURTS);
      var newJson = JSON.stringify(items);
      if (current !== newJson) {
        localStorage.setItem(self.KEYS.COURTS, newJson);
        self._onRemoteChange();
      }
    }, function(err) {
      console.error('Courts realtime sync error:', err);
    });

    // 팀 데이터 실시간 리스너
    this._unsubTeams = base.doc('teams').onSnapshot(function(doc) {
      if (doc.metadata.hasPendingWrites) return;
      if (!doc.exists) return;
      var d = doc.data();
      var items = d.json ? JSON.parse(d.json) : (d.items || []);
      var current = localStorage.getItem(self.KEYS.TEAMS);
      var newJson = JSON.stringify(items);
      if (current !== newJson) {
        localStorage.setItem(self.KEYS.TEAMS, newJson);
        self._onRemoteChange();
      }
    }, function(err) {
      console.error('Teams realtime sync error:', err);
    });
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
    if (this._unsubEvents) {
      this._unsubEvents();
      this._unsubEvents = null;
    }
    if (this._unsubCourts) {
      this._unsubCourts();
      this._unsubCourts = null;
    }
    if (this._unsubTeams) {
      this._unsubTeams();
      this._unsubTeams = null;
    }
    this._removeVisibilityListener();
  },

  // 페이지 복귀 시 Firestore에서 최신 데이터 재로드
  _visibilityHandler: null,

  _setupVisibilityListener() {
    var self = this;
    this._removeVisibilityListener();
    this._visibilityHandler = function() {
      if (document.visibilityState !== 'visible') return;
      if (!fbAuth.currentUser) return;
      // 백그라운드에서 복귀 시 Firestore → localStorage 재로드 + 실시간 리스너 재연결
      self.loadFromFirestore().then(function() {
        self.stopRealtimeSync();
        self.startRealtimeSync();
        self._onRemoteChange();
      }).catch(function(err) {
        console.error('Visibility reload error:', err);
      });
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
  },

  _removeVisibilityListener() {
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
  },

  // 원격 변경 시 UI 갱신 (debounce 300ms)
  _onRemoteChange() {
    var self = this;
    // debounce: 여러 snapshot이 연달아 오면 마지막 것만 처리
    if (this._remoteChangeTimer) clearTimeout(this._remoteChangeTimer);
    this._remoteChangeTimer = setTimeout(function() {
      self._remoteChangeTimer = null;
      if (typeof App !== 'undefined') {
        if (App._viewMode === 'calendar') {
          App.showCalendar();
        } else if (App._viewMode === 'settings') {
          App.showSettings();
        } else if (App.currentTab === 'active' && App.currentTournamentId) {
          // 대진표 상세보기 → 해당 대진표만 다시 렌더링
          var t = self.getTournamentById(App.currentTournamentId);
          if (t) {
            var content = document.getElementById('main-content');
            App.renderTournamentDetail(content, t);
          }
        } else if (App.currentTab) {
          App.navigate(App.currentTab);
        }
      }
    }, 300);
  },
};
