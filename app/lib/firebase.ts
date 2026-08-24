// lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB7SZEhnT49WLmAwkyelx4i4J_qxiJKHIM",
  authDomain: "northside-chickens.firebaseapp.com",
  projectId: "northside-chickens",
  storageBucket: "northside-chickens.firebasestorage.app",
  messagingSenderId: "522339181318",
  appId: "1:522339181318:web:b60ee1134380ee1f9bb487"
};


const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
