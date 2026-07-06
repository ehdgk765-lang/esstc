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
    if (typeof RolesConfig !== 'undefined' && !RolesConfig.isAdmin()) {
      console.warn('관리자만 멤버 목록을 수정할 수 있습니다.');
      return false;
    }
    var oldData = this.getPlayers();
    const result = this.set(this.KEYS.PLAYERS, players);
    this.syncToFirestore('players', players, this.KEYS.PLAYERS, oldData);
    return result;
  },

  // 멤버 삭제 - players에서 제거 + events 참석자/대기자에서 제거 (Transaction 기반)
  async deleteMember(memberName) {
    var self = this;
    var base = this._getBase();
    if (!base) {
      return this._deleteMemberLocal(memberName);
    }

    var playersRef = base.doc('players');
    var eventsRef = base.doc('events');

    try {
      var result = { players: null, events: null };
      await fbDb.runTransaction(function(transaction) {
        return Promise.all([
          transaction.get(playersRef),
          transaction.get(eventsRef)
        ]).then(function(docs) {
          var parse = function(doc) {
            if (!doc.exists) return [];
            var d = doc.data();
            return d.json ? JSON.parse(d.json) : (d.items || []);
          };
          var players = parse(docs[0]);
          var events = parse(docs[1]);

          // players에서 제거
          players = players.filter(function(p) { return p.name !== memberName; });

          // events 참석자/대기자에서 제거
          events.forEach(function(ev) {
            if (ev.participants) {
              var idx = ev.participants.indexOf(memberName);
              if (idx >= 0) ev.participants.splice(idx, 1);
            }
            if (ev.waitlist) {
              var wIdx = ev.waitlist.indexOf(memberName);
              if (wIdx >= 0) ev.waitlist.splice(wIdx, 1);
            }
          });

          transaction.set(playersRef, { json: JSON.stringify(players), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
          transaction.set(eventsRef, { json: JSON.stringify(events), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });

          result.players = players;
          result.events = events;
        });
      });

      if (result.players) localStorage.setItem(self.KEYS.PLAYERS, JSON.stringify(result.players));
      if (result.events) localStorage.setItem(self.KEYS.EVENTS, JSON.stringify(result.events));
      return true;
    } catch (err) {
      console.error('deleteMember transaction error:', err);
      if (typeof showToast === 'function') showToast('멤버 삭제에 실패했습니다. 다시 시도해주세요.', 'error');
      return this._deleteMemberLocal(memberName);
    }
  },

  _deleteMemberLocal(memberName) {
    var players = this.getPlayers().filter(function(p) { return p.name !== memberName; });
    this.set(this.KEYS.PLAYERS, players);
    this.syncToFirestore('players', players);
    var events = this.getEvents();
    var changed = false;
    events.forEach(function(ev) {
      if (ev.participants) {
        var idx = ev.participants.indexOf(memberName);
        if (idx >= 0) { ev.participants.splice(idx, 1); changed = true; }
      }
      if (ev.waitlist) {
        var wIdx = ev.waitlist.indexOf(memberName);
        if (wIdx >= 0) { ev.waitlist.splice(wIdx, 1); changed = true; }
      }
    });
    if (changed) {
      this.set(this.KEYS.EVENTS, events);
      this.syncToFirestore('events', events);
    }
    return true;
  },

  // 멤버 복수 삭제 (Transaction 기반)
  async deleteMembers(memberNames) {
    var self = this;
    var base = this._getBase();
    if (!base) {
      memberNames.forEach(function(name) { self._deleteMemberLocal(name); });
      return true;
    }

    var playersRef = base.doc('players');
    var eventsRef = base.doc('events');

    try {
      var result = { players: null, events: null };
      await fbDb.runTransaction(function(transaction) {
        return Promise.all([
          transaction.get(playersRef),
          transaction.get(eventsRef)
        ]).then(function(docs) {
          var parse = function(doc) {
            if (!doc.exists) return [];
            var d = doc.data();
            return d.json ? JSON.parse(d.json) : (d.items || []);
          };
          var players = parse(docs[0]);
          var events = parse(docs[1]);

          players = players.filter(function(p) { return memberNames.indexOf(p.name) < 0; });

          events.forEach(function(ev) {
            if (ev.participants) {
              ev.participants = ev.participants.filter(function(n) { return memberNames.indexOf(n) < 0; });
            }
            if (ev.waitlist) {
              ev.waitlist = ev.waitlist.filter(function(n) { return memberNames.indexOf(n) < 0; });
            }
          });

          transaction.set(playersRef, { json: JSON.stringify(players), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
          transaction.set(eventsRef, { json: JSON.stringify(events), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });

          result.players = players;
          result.events = events;
        });
      });

      if (result.players) localStorage.setItem(self.KEYS.PLAYERS, JSON.stringify(result.players));
      if (result.events) localStorage.setItem(self.KEYS.EVENTS, JSON.stringify(result.events));
      return true;
    } catch (err) {
      console.error('deleteMembers transaction error:', err);
      if (typeof showToast === 'function') showToast('멤버 삭제에 실패했습니다. 다시 시도해주세요.', 'error');
      memberNames.forEach(function(name) { self._deleteMemberLocal(name); });
      return true;
    }
  },

  // 팀 관련
  getTeams() {
    return this.get(this.KEYS.TEAMS) || [];
  },

  saveTeams(teams) {
    if (typeof RolesConfig !== 'undefined' && !RolesConfig.hasAdminAccess()) {
      console.warn('관리자 권한이 필요합니다.');
      return false;
    }
    var oldData = this.getTeams();
    const result = this.set(this.KEYS.TEAMS, teams);
    this.syncToFirestore('teams', teams, this.KEYS.TEAMS, oldData);
    return result;
  },

  // 대회 관련
  getTournaments() {
    return this.get(this.KEYS.TOURNAMENTS) || [];
  },

  saveTournaments(tournaments) {
    var oldData = this.getTournaments();
    const result = this.set(this.KEYS.TOURNAMENTS, tournaments);
    this.syncToFirestore('tournaments', tournaments, this.KEYS.TOURNAMENTS, oldData);
    return result;
  },

  getTournamentById(id) {
    const tournaments = this.getTournaments();
    return tournaments.find(t => t.id === id) || null;
  },

  async updateTournament(tournamentId, patchFn) {
    var self = this;
    var base = this._getBase();
    if (!base) return this._updateTournamentLocal(tournamentId, patchFn);

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
          var index = tournaments.findIndex(function(t) { return t.id === tournamentId; });
          if (index !== -1) {
            patchFn(tournaments[index]);
            transaction.set(docRef, { json: JSON.stringify(tournaments), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
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
      if (typeof showToast === 'function') showToast('대회 저장에 실패했습니다. 다시 시도해주세요.', 'error');
      return this._updateTournamentLocal(tournamentId, patchFn);
    }
  },

  _updateTournamentLocal(tournamentId, patchFn) {
    var tournaments = this.getTournaments();
    var index = tournaments.findIndex(function(t) { return t.id === tournamentId; });
    if (index !== -1) {
      patchFn(tournaments[index]);
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
    if (typeof RolesConfig !== 'undefined' && !RolesConfig.hasAdminAccess()) {
      console.warn('관리자 권한이 필요합니다.');
      return false;
    }
    var oldData = this.getEvents();
    var result = this.set(this.KEYS.EVENTS, events);
    this.syncToFirestore('events', events, this.KEYS.EVENTS, oldData);
    return result;
  },

  // 정규 일정 여부 판별
  isRegularEvent(ev) {
    return ev && ev.title && ev.title.indexOf('정규 일정') >= 0;
  },

  // 단일 이벤트 추가 (멤버도 호출 가능, 정규 일정 제외) - Firestore Transaction 기반
  async addEvent(newEvent) {
    var self = this;
    if (this.isRegularEvent(newEvent) && typeof RolesConfig !== 'undefined' && !RolesConfig.hasAdminAccess()) {
      console.warn('관리자 권한이 필요합니다.');
      return false;
    }
    var base = this._getBase();
    if (!base) return this._addEventLocal(newEvent);

    var docRef = base.doc('events');
    try {
      var finalEvents = null;
      await fbDb.runTransaction(function(transaction) {
        return transaction.get(docRef).then(function(doc) {
          var events = [];
          if (doc.exists) {
            var d = doc.data();
            events = d.json ? JSON.parse(d.json) : (d.items || []);
          }
          events.push(newEvent);
          events.sort(function(a, b) {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1;
            return (a.startTime || a.time || '').localeCompare(b.startTime || b.time || '');
          });
          transaction.set(docRef, { json: JSON.stringify(events), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
          finalEvents = events;
        });
      });
      if (finalEvents) {
        localStorage.setItem(self.KEYS.EVENTS, JSON.stringify(finalEvents));
      }
      return true;
    } catch (err) {
      console.error('addEvent transaction error:', err);
      if (typeof showToast === 'function') showToast('일정 추가에 실패했습니다. 다시 시도해주세요.', 'error');
      return this._addEventLocal(newEvent);
    }
  },

  _addEventLocal(newEvent) {
    var events = this.getEvents();
    events.push(newEvent);
    events.sort(function(a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.startTime || a.time || '').localeCompare(b.startTime || b.time || '');
    });
    this.set(this.KEYS.EVENTS, events);
    this.syncToFirestore('events', events);
    return true;
  },

  // 단일 이벤트 수정 (멤버도 호출 가능, 정규 일정 제외) - Firestore Transaction 기반
  async editEvent(eventId, updatedFields) {
    var self = this;
    var base = this._getBase();
    if (!base) return this._editEventLocal(eventId, updatedFields);

    var docRef = base.doc('events');
    try {
      var finalEvents = null;
      await fbDb.runTransaction(function(transaction) {
        return transaction.get(docRef).then(function(doc) {
          var events = [];
          if (doc.exists) {
            var d = doc.data();
            events = d.json ? JSON.parse(d.json) : (d.items || []);
          }
          for (var i = 0; i < events.length; i++) {
            if (events[i].id === eventId) {
              // 관리자 권한 없는 멤버 수정 제한: 정규 일정 불가 + 본인 등록 일정만 수정 가능
              if (typeof RolesConfig !== 'undefined' && !RolesConfig.hasAdminAccess()) {
                if (self.isRegularEvent(events[i])) return;
                var myName = typeof App !== 'undefined' ? App.getMemberName() : '';
                if (!events[i].createdBy || events[i].createdBy !== myName) return;
              }
              for (var key in updatedFields) {
                if (updatedFields.hasOwnProperty(key)) {
                  events[i][key] = updatedFields[key];
                }
              }
              // 구버전 time 필드 정리
              if (updatedFields.startTime !== undefined) delete events[i].time;
              break;
            }
          }
          events.sort(function(a, b) {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1;
            return (a.startTime || a.time || '').localeCompare(b.startTime || b.time || '');
          });
          transaction.set(docRef, { json: JSON.stringify(events), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
          finalEvents = events;
        });
      });
      if (finalEvents) {
        localStorage.setItem(self.KEYS.EVENTS, JSON.stringify(finalEvents));
      }
      return true;
    } catch (err) {
      console.error('editEvent transaction error:', err);
      if (typeof showToast === 'function') showToast('일정 수정에 실패했습니다. 다시 시도해주세요.', 'error');
      return this._editEventLocal(eventId, updatedFields);
    }
  },

  _editEventLocal(eventId, updatedFields) {
    var events = this.getEvents();
    for (var i = 0; i < events.length; i++) {
      if (events[i].id === eventId) {
        if (typeof RolesConfig !== 'undefined' && !RolesConfig.hasAdminAccess()) {
          if (this.isRegularEvent(events[i])) return false;
          var myName = typeof App !== 'undefined' ? App.getMemberName() : '';
          if (!events[i].createdBy || events[i].createdBy !== myName) return false;
        }
        for (var key in updatedFields) {
          if (updatedFields.hasOwnProperty(key)) {
            events[i][key] = updatedFields[key];
          }
        }
        // 구버전 time 필드 정리
        if (updatedFields.startTime !== undefined) delete events[i].time;
        break;
      }
    }
    events.sort(function(a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.startTime || a.time || '').localeCompare(b.startTime || b.time || '');
    });
    this.set(this.KEYS.EVENTS, events);
    this.syncToFirestore('events', events);
    return true;
  },

  // 단일 이벤트 삭제 (멤버도 호출 가능, 정규 일정 제외) - Firestore Transaction 기반
  async removeEvent(eventId) {
    var self = this;
    var base = this._getBase();
    if (!base) return this._removeEventLocal(eventId);

    var docRef = base.doc('events');
    try {
      var finalEvents = null;
      await fbDb.runTransaction(function(transaction) {
        return transaction.get(docRef).then(function(doc) {
          var events = [];
          if (doc.exists) {
            var d = doc.data();
            events = d.json ? JSON.parse(d.json) : (d.items || []);
          }
          // 관리자 권한 없는 멤버 삭제 제한: 정규 일정 불가 + 본인 등록 일정만 삭제 가능
          var target = events.find(function(e) { return e.id === eventId; });
          if (target && typeof RolesConfig !== 'undefined' && !RolesConfig.hasAdminAccess()) {
            if (self.isRegularEvent(target)) { finalEvents = events; return; }
            var myName = typeof App !== 'undefined' ? App.getMemberName() : '';
            if (!target.createdBy || target.createdBy !== myName) { finalEvents = events; return; }
          }
          events = events.filter(function(e) { return e.id !== eventId; });
          transaction.set(docRef, { json: JSON.stringify(events), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
          finalEvents = events;
        });
      });
      if (finalEvents) {
        localStorage.setItem(self.KEYS.EVENTS, JSON.stringify(finalEvents));
      }
      return true;
    } catch (err) {
      console.error('removeEvent transaction error:', err);
      if (typeof showToast === 'function') showToast('일정 삭제에 실패했습니다. 다시 시도해주세요.', 'error');
      return this._removeEventLocal(eventId);
    }
  },

  _removeEventLocal(eventId) {
    var events = this.getEvents();
    var target = events.find(function(e) { return e.id === eventId; });
    if (target && typeof RolesConfig !== 'undefined' && !RolesConfig.hasAdminAccess()) {
      if (this.isRegularEvent(target)) return false;
      var myName = typeof App !== 'undefined' ? App.getMemberName() : '';
      if (!target.createdBy || target.createdBy !== myName) return false;
    }
    events = events.filter(function(e) { return e.id !== eventId; });
    this.set(this.KEYS.EVENTS, events);
    this.syncToFirestore('events', events);
    return true;
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
            transaction.set(docRef, { json: JSON.stringify(events), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
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
      if (typeof showToast === 'function') showToast('참석 변경에 실패했습니다. 다시 시도해주세요.', 'error');
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
            transaction.set(docRef, { json: JSON.stringify(events), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
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
      if (typeof showToast === 'function') showToast('대기 변경에 실패했습니다. 다시 시도해주세요.', 'error');
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
    if (typeof RolesConfig !== 'undefined' && !RolesConfig.hasAdminAccess()) {
      console.warn('관리자 권한이 필요합니다.');
      return false;
    }
    var oldData = this.getCourts();
    var result = this.set(this.KEYS.COURTS, courts);
    this.syncToFirestore('courts', courts, this.KEYS.COURTS, oldData);
    return result;
  },

  // 코트 이름 변경 + 이벤트 제목 일괄 수정 (Firestore Transaction 기반)
  async renameCourtInEvents(oldName, newName) {
    var self = this;
    var base = this._getBase();
    if (!base) {
      // Firestore 미사용 시 로컬 처리
      return this._renameCourtInEventsLocal(oldName, newName);
    }

    var eventsDocRef = base.doc('events');
    try {
      var finalEvents = null;
      await fbDb.runTransaction(function(transaction) {
        return transaction.get(eventsDocRef).then(function(doc) {
          var events = [];
          if (doc.exists) {
            var d = doc.data();
            events = d.json ? JSON.parse(d.json) : (d.items || []);
          }
          var prefix = oldName + ' ';
          var changed = false;
          events.forEach(function(ev) {
            if (ev.title && ev.title.indexOf(prefix) === 0) {
              ev.title = newName + ev.title.substring(oldName.length);
              changed = true;
            }
          });
          if (changed) {
            transaction.set(eventsDocRef, { json: JSON.stringify(events), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
          }
          finalEvents = events;
        });
      });
      if (finalEvents) {
        localStorage.setItem(self.KEYS.EVENTS, JSON.stringify(finalEvents));
      }
      return true;
    } catch (err) {
      console.error('renameCourtInEvents transaction error:', err);
      if (typeof showToast === 'function') showToast('코트 이름 변경에 실패했습니다. 다시 시도해주세요.', 'error');
      return this._renameCourtInEventsLocal(oldName, newName);
    }
  },

  _renameCourtInEventsLocal(oldName, newName) {
    var events = this.getEvents();
    var prefix = oldName + ' ';
    var changed = false;
    events.forEach(function(ev) {
      if (ev.title && ev.title.indexOf(prefix) === 0) {
        ev.title = newName + ev.title.substring(oldName.length);
        changed = true;
      }
    });
    if (changed) {
      this.set(this.KEYS.EVENTS, events);
      this.syncToFirestore('events', events);
    }
    return true;
  },

  // 멤버 이름 변경 - 모든 데이터 일괄 수정 (Firestore Transaction 기반)
  // players, events, tournaments, teams 4개 문서를 원자적으로 수정
  async renameMember(oldName, newName) {
    var self = this;
    var base = this._getBase();
    if (!base) {
      return this._renameMemberLocal(oldName, newName);
    }

    var playersRef = base.doc('players');
    var eventsRef = base.doc('events');
    var tournamentsRef = base.doc('tournaments');
    var teamsRef = base.doc('teams');

    try {
      var result = { players: null, events: null, tournaments: null, teams: null };
      await fbDb.runTransaction(function(transaction) {
        return Promise.all([
          transaction.get(playersRef),
          transaction.get(eventsRef),
          transaction.get(tournamentsRef),
          transaction.get(teamsRef)
        ]).then(function(docs) {
          var parse = function(doc) {
            if (!doc.exists) return [];
            var d = doc.data();
            return d.json ? JSON.parse(d.json) : (d.items || []);
          };
          var players = parse(docs[0]);
          var events = parse(docs[1]);
          var tournaments = parse(docs[2]);
          var teams = parse(docs[3]);

          // 1) players: name 필드 변경
          players.forEach(function(p) {
            if (p.name === oldName) p.name = newName;
          });

          // 2) events: participants, waitlist 변경
          events.forEach(function(ev) {
            if (ev.participants) {
              for (var i = 0; i < ev.participants.length; i++) {
                if (ev.participants[i] === oldName) ev.participants[i] = newName;
              }
            }
            if (ev.waitlist) {
              for (var i = 0; i < ev.waitlist.length; i++) {
                if (ev.waitlist[i] === oldName) ev.waitlist[i] = newName;
              }
            }
          });

          // 3) tournaments: players 배열 + 모든 매치의 player1, player2, winner
          var replaceInField = function(val) {
            if (!val) return val;
            if (val === oldName) return newName;
            // 복식 형식: "이름1 / 이름2"
            var parts = val.split(' / ');
            var changed = false;
            for (var i = 0; i < parts.length; i++) {
              if (parts[i] === oldName) { parts[i] = newName; changed = true; }
            }
            return changed ? parts.join(' / ') : val;
          };
          tournaments.forEach(function(t) {
            // players 배열
            if (t.players) {
              for (var i = 0; i < t.players.length; i++) {
                t.players[i] = replaceInField(t.players[i]);
              }
            }
            // 토너먼트/리그 rounds
            if (t.rounds) {
              t.rounds.forEach(function(round) {
                var matches = Array.isArray(round) ? round : (round.matches || []);
                matches.forEach(function(m) {
                  if (m.player1) m.player1 = replaceInField(m.player1);
                  if (m.player2) m.player2 = replaceInField(m.player2);
                  if (m.winner) m.winner = replaceInField(m.winner);
                });
              });
            }
            // 스케줄 timeSlots
            if (t.timeSlots) {
              t.timeSlots.forEach(function(slot) {
                (slot.matches || []).forEach(function(m) {
                  if (m.player1) m.player1 = replaceInField(m.player1);
                  if (m.player2) m.player2 = replaceInField(m.player2);
                  if (m.winner) m.winner = replaceInField(m.winner);
                });
              });
            }
          });

          // 4) teams: members 배열
          teams.forEach(function(team) {
            if (team.members) {
              for (var i = 0; i < team.members.length; i++) {
                if (team.members[i] === oldName) team.members[i] = newName;
              }
            }
          });

          transaction.set(playersRef, { json: JSON.stringify(players), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
          transaction.set(eventsRef, { json: JSON.stringify(events), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
          transaction.set(tournamentsRef, { json: JSON.stringify(tournaments), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
          transaction.set(teamsRef, { json: JSON.stringify(teams), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });

          result.players = players;
          result.events = events;
          result.tournaments = tournaments;
          result.teams = teams;
        });
      });

      // 트랜잭션 성공 시 localStorage 갱신
      if (result.players) localStorage.setItem(self.KEYS.PLAYERS, JSON.stringify(result.players));
      if (result.events) localStorage.setItem(self.KEYS.EVENTS, JSON.stringify(result.events));
      if (result.tournaments) localStorage.setItem(self.KEYS.TOURNAMENTS, JSON.stringify(result.tournaments));
      if (result.teams) localStorage.setItem(self.KEYS.TEAMS, JSON.stringify(result.teams));

      return true;
    } catch (err) {
      console.error('renameMember transaction error:', err);
      if (typeof showToast === 'function') showToast('이름 변경에 실패했습니다. 다시 시도해주세요.', 'error');
      return this._renameMemberLocal(oldName, newName);
    }
  },

  _renameMemberLocal(oldName, newName) {
    var replaceInField = function(val) {
      if (!val) return val;
      if (val === oldName) return newName;
      var parts = val.split(' / ');
      var changed = false;
      for (var i = 0; i < parts.length; i++) {
        if (parts[i] === oldName) { parts[i] = newName; changed = true; }
      }
      return changed ? parts.join(' / ') : val;
    };

    // players
    var players = this.getPlayers();
    players.forEach(function(p) { if (p.name === oldName) p.name = newName; });
    this.set(this.KEYS.PLAYERS, players);
    this.syncToFirestore('players', players);

    // events
    var events = this.getEvents();
    events.forEach(function(ev) {
      if (ev.participants) {
        for (var i = 0; i < ev.participants.length; i++) {
          if (ev.participants[i] === oldName) ev.participants[i] = newName;
        }
      }
      if (ev.waitlist) {
        for (var i = 0; i < ev.waitlist.length; i++) {
          if (ev.waitlist[i] === oldName) ev.waitlist[i] = newName;
        }
      }
    });
    this.set(this.KEYS.EVENTS, events);
    this.syncToFirestore('events', events);

    // tournaments
    var tournaments = this.getTournaments();
    tournaments.forEach(function(t) {
      if (t.players) {
        for (var i = 0; i < t.players.length; i++) {
          t.players[i] = replaceInField(t.players[i]);
        }
      }
      if (t.rounds) {
        t.rounds.forEach(function(round) {
          var matches = Array.isArray(round) ? round : (round.matches || []);
          matches.forEach(function(m) {
            if (m.player1) m.player1 = replaceInField(m.player1);
            if (m.player2) m.player2 = replaceInField(m.player2);
            if (m.winner) m.winner = replaceInField(m.winner);
          });
        });
      }
      if (t.timeSlots) {
        t.timeSlots.forEach(function(slot) {
          (slot.matches || []).forEach(function(m) {
            if (m.player1) m.player1 = replaceInField(m.player1);
            if (m.player2) m.player2 = replaceInField(m.player2);
            if (m.winner) m.winner = replaceInField(m.winner);
          });
        });
      }
    });
    this.set(this.KEYS.TOURNAMENTS, tournaments);
    this.syncToFirestore('tournaments', tournaments);

    // teams
    var teams = this.getTeams();
    teams.forEach(function(team) {
      if (team.members) {
        for (var i = 0; i < team.members.length; i++) {
          if (team.members[i] === oldName) team.members[i] = newName;
        }
      }
    });
    this.set(this.KEYS.TEAMS, teams);
    this.syncToFirestore('teams', teams);

    return true;
  },

  // 유틸리티
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  },

  // 백업 복원 (Firestore batch write로 원자적 처리)
  async restoreBackup(data) {
    // localStorage에 먼저 반영
    if (data.players) this.set(this.KEYS.PLAYERS, data.players);
    if (data.tournaments) this.set(this.KEYS.TOURNAMENTS, data.tournaments);
    if (data.events) this.set(this.KEYS.EVENTS, data.events);
    if (data.teams) this.set(this.KEYS.TEAMS, data.teams);
    if (data.courts) this.set(this.KEYS.COURTS, data.courts);

    var base = this._getBase();
    if (!base) return;

    // 모든 문서에 쓰기 가드 설정
    var docs = ['players', 'tournaments', 'events', 'teams', 'courts'];
    var self = this;
    docs.forEach(function(d) { self._writeGuard[d] = true; });

    try {
      var batch = fbDb.batch();
      var ts = firebase.firestore.FieldValue.serverTimestamp();
      if (data.players) batch.set(base.doc('players'), { json: JSON.stringify(data.players), updatedAt: ts });
      if (data.tournaments) batch.set(base.doc('tournaments'), { json: JSON.stringify(data.tournaments), updatedAt: ts });
      if (data.events) batch.set(base.doc('events'), { json: JSON.stringify(data.events), updatedAt: ts });
      if (data.teams) batch.set(base.doc('teams'), { json: JSON.stringify(data.teams), updatedAt: ts });
      if (data.courts) batch.set(base.doc('courts'), { json: JSON.stringify(data.courts), updatedAt: ts });
      await batch.commit();
    } catch (err) {
      console.error('restoreBackup batch error:', err);
    } finally {
      setTimeout(function() {
        docs.forEach(function(d) { delete self._writeGuard[d]; });
      }, 1500);
    }
  },

  // ─── Firestore 동기화 ───

  _unsubPlayers: null,
  _unsubTournaments: null,
  _unsubEvents: null,
  _unsubCourts: null,
  _unsubTeams: null,
  _remoteChangeTimer: null,
  _writeGuard: {},  // 쓰기 중인 문서를 추적하여 onSnapshot 덮어쓰기 방지
  _isOnline: true,

  // 네트워크 상태 감지 및 배너 표시
  initNetworkStatus() {
    var self = this;
    var banner = document.getElementById('offline-banner');

    // 초기 상태 설정 (재로드 없이 배너만)
    self._isOnline = navigator.onLine;
    if (banner) {
      banner.classList.toggle('hidden', self._isOnline);
    }

    // 온라인 복귀 시에만 Firestore 재로드
    window.addEventListener('online', function() {
      self._isOnline = true;
      if (banner) banner.classList.add('hidden');
      if (fbAuth.currentUser) {
        self.loadFromFirestore().then(function() {
          self.stopRealtimeSync();
          self.startRealtimeSync();
          self._onRemoteChange();
        }).catch(function() {});
      }
    });

    window.addEventListener('offline', function() {
      self._isOnline = false;
      if (banner) banner.classList.remove('hidden');
    });
  },

  // Firestore 경로 분기: 클럽 사용자(admin/member) → 공유, 그 외 → per-user
  _getBase() {
    var user = fbAuth.currentUser;
    if (!user) return null;
    if (typeof RolesConfig !== 'undefined' && RolesConfig.isClubUser()) {
      return fbDb.collection('club').doc('shared').collection('data');
    }
    return fbDb.collection('users').doc(user.uid).collection('data');
  },

  // localStorage → Firestore (쓰기 가드 포함, 실패 시 롤백)
  syncToFirestore(docName, data, rollbackKey, rollbackData) {
    var self = this;
    var base = this._getBase();
    if (!base) return;
    // 오프라인 상태 체크
    if (!navigator.onLine) {
      if (typeof showToast === 'function') {
        showToast('오프라인 상태입니다. 연결 후 다시 시도해주세요.', 'warn');
      }
      // 오프라인이면 localStorage도 롤백
      if (rollbackKey && rollbackData !== undefined) {
        localStorage.setItem(rollbackKey, JSON.stringify(rollbackData));
        self._onRemoteChange();
      }
      return;
    }
    this._writeGuard[docName] = true;
    base.doc(docName)
      .set({ json: JSON.stringify(data || []), updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(function() {
        // 쓰기 완료 후 가드 해제 (onSnapshot이 안정화될 시간 확보)
        setTimeout(function() { delete self._writeGuard[docName]; }, 1000);
      })
      .catch(function(err) {
        delete self._writeGuard[docName];
        console.error('Firestore sync error:', err);
        // 롤백: localStorage를 이전 상태로 되돌림
        if (rollbackKey && rollbackData !== undefined) {
          localStorage.setItem(rollbackKey, JSON.stringify(rollbackData));
          self._onRemoteChange();
        }
        if (typeof showToast === 'function') {
          showToast('저장에 실패했습니다. 다시 시도해주세요.', 'error');
        }
      });
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
      var ts = firebase.firestore.FieldValue.serverTimestamp();
      await Promise.all([
        sharedBase.doc('players').set({ json: JSON.stringify(players), updatedAt: ts }),
        sharedBase.doc('tournaments').set({ json: JSON.stringify(tournaments), updatedAt: ts }),
        sharedBase.doc('events').set({ json: JSON.stringify(events), updatedAt: ts }),
        sharedBase.doc('courts').set({ json: JSON.stringify(courts), updatedAt: ts }),
        sharedBase.doc('teams').set({ json: JSON.stringify(teams), updatedAt: ts })
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
    // onSnapshot 핸들러 (쓰기 가드 적용)
    var makeListener = function(docName, storageKey) {
      return base.doc(docName).onSnapshot(function(doc) {
        if (doc.metadata.hasPendingWrites) return;
        if (self._writeGuard[docName]) return; // 로컬 쓰기 중이면 무시
        if (!doc.exists) return;
        var d = doc.data();
        var items = d.json ? JSON.parse(d.json) : (d.items || []);
        var current = localStorage.getItem(storageKey);
        var newJson = JSON.stringify(items);
        if (current !== newJson) {
          localStorage.setItem(storageKey, newJson);
          self._onRemoteChange();
        }
      }, function(err) {
        console.error(docName + ' realtime sync error:', err);
      });
    };

    this._unsubPlayers = makeListener('players', self.KEYS.PLAYERS);
    this._unsubTournaments = makeListener('tournaments', self.KEYS.TOURNAMENTS);
    this._unsubEvents = makeListener('events', self.KEYS.EVENTS);
    this._unsubCourts = makeListener('courts', self.KEYS.COURTS);
    this._unsubTeams = makeListener('teams', self.KEYS.TEAMS);
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
        // 원격 변경 시 권한 UI 갱신 (adminAccess 변경 반영)
        if (typeof App.applyRoleUI === 'function') App.applyRoleUI();
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
