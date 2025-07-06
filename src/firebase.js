// firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDKNy8hWMuJZPPdVO2o1Jlmz_FMg4Z7wIE",
  authDomain: "moneytracker-bc2a1.firebaseapp.com",
  projectId: "moneytracker-bc2a1",
  storageBucket: "moneytracker-bc2a1.appspot.com",
  messagingSenderId: "748578310449",
  appId: "1:748578310449:web:6f60250d03f032856c810",
  measurementId: "G-6HJWLTP7HZ"
};


const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
