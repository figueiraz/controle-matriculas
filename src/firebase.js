import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAm47FIzpDDHjMwq3vTap5t6XVG7DVohZ0",
  authDomain: "painel-matriculas.firebaseapp.com",
  projectId: "painel-matriculas",
  storageBucket: "painel-matriculas.firebasestorage.app",
  messagingSenderId: "446711543129",
  appId: "1:446711543129:web:dce30cd81ed3ce9ea90848",
  measurementId: "G-XK22B2MZDZ"
};

import { getAuth } from "firebase/auth";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
