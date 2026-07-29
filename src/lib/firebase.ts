import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyBUJdzEPnPK6aLOKSF3WawG9HHOghA1kak",
  authDomain: "student-dashboard-e020f.firebaseapp.com",
  projectId: "student-dashboard-e020f",
  storageBucket: "student-dashboard-e020f.firebasestorage.app",
  messagingSenderId: "350933646479",
  appId: "1:350933646479:web:9dfc94aa0d754c10b7c4fa",
  measurementId: "G-7J2D5VD8K7",
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

let analytics: Analytics | null = null;
if (typeof window !== "undefined") {
  isSupported().then((supported: boolean) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}
export { analytics };
