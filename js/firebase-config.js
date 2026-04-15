// firebase-config.js - Firebase 초기화
const firebaseConfig = {
  apiKey: "AIzaSyCidOLd9fk5PCAMk9ou40JkkgimqynT8cY",
  authDomain: "esstc-ca95e.firebaseapp.com",
  projectId: "esstc-ca95e",
  storageBucket: "esstc-ca95e.firebasestorage.app",
  messagingSenderId: "243973826269",
  appId: "1:243973826269:web:e8a1e60bbcf3c024309d34",
  measurementId: "G-5YS4K4DV1F"
};

firebase.initializeApp(firebaseConfig);
const fbAuth = firebase.auth();
const fbDb = firebase.firestore();
