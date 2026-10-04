import { getApp, getApps, initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { createUserWithEmailAndPassword, deleteUser, getAuth, signOut, updateProfile } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { requestStaffAccount } from "./staff-account-api";

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

const staffCreatorAppName = "flore-staff-account-creator";

export async function createStaffAuthAccount(email: string, password: string, name: string, persist?: (uid: string) => Promise<void>) {
  const app = getApps().find((item) => item.name === staffCreatorAppName) ?? initializeApp(firebaseConfig, staffCreatorAppName);
  const auth = getAuth(app);
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    try {
      if (name) await updateProfile(credential.user, { displayName: name });
      if (persist) await persist(credential.user.uid);
    }
    catch (error) { await deleteUser(credential.user); throw error; }
    return credential.user.uid;
  } finally { await signOut(auth); }
}

export async function manageStaffAccount(body: Record<string, unknown>) {
  const current = firebaseAuth.currentUser;
  if (!current) throw new Error("Vui lòng đăng nhập trước.");
  return requestStaffAccount(body, await current.getIdToken());
}
