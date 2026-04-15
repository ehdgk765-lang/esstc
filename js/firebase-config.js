// firebase-config.js - Firebase 초기화
const firebaseConfig = {
  apiKey: "AIzaSyAddLnhSCdiUcyVqY8S0GHxrBqmBfp-CcY",
  authDomain: "happy-tennis-life.firebaseapp.com",
  projectId: "happy-tennis-life",
  storageBucket: "happy-tennis-life.firebasestorage.app",
  messagingSenderId: "914688098524",
  appId: "1:914688098524:web:2a25c832fe0ec196cf3419",
  measurementId: "G-BT1WSEC6Q0"
};

firebase.initializeApp(firebaseConfig);
const fbAuth = firebase.auth();
const fbDb = firebase.firestore();
