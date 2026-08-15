import { getApp, getApps, initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB5ZtSMY78wPpLapxLV4hnacwn85AfS2GY",
  authDomain: "nananerospace.firebaseapp.com",
  projectId: "nananerospace",
  storageBucket: "nananerospace.firebasestorage.app",
  messagingSenderId: "391079027577",
  appId: "1:391079027577:web:82d88568840bf4426dc5a8",
  measurementId: "G-B377J520MG",
};

export const MANAGER_UID = "kyEi7WdhTdZ7HfpI9PxxxVLbqNR2";
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);

export async function initializeFirebaseAnalytics() {
  if (typeof window !== "undefined" && await isSupported()) getAnalytics(firebaseApp);
}
