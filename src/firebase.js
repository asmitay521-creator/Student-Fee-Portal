// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBUJdzEPnPK6aLOKSF3WawG9HHOghA1kak",
  authDomain: "student-dashboard-e020f.firebaseapp.com",
  projectId: "student-dashboard-e020f",
  storageBucket: "student-dashboard-e020f.firebasestorage.app",
  messagingSenderId: "350933646479",
  appId: "1:350933646479:web:9dfc94aa0d754c10b7c4fa",
  measurementId: "G-7J2D5VD8K7"
};

// Initialize Firebase
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

let analytics = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}
export { analytics };
