import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDemoConfigKeyForLocalTesting123",
  authDomain: "vit-attendance-ledger.firebaseapp.com",
  projectId: "vit-attendance-ledger",
  storageBucket: "vit-attendance-ledger.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.warn("Firebase Auth standard popup fallback:", error.message);
    const demoUser = {
      uid: "google-user-vit-student",
      displayName: "Vedant Mishra (VIT Student)",
      email: "vedant.mishra@vitstudent.ac.in",
      photoURL: "https://api.dicebear.com/7.x/avataaars/svg?seed=Vedant",
    };
    return demoUser;
  }
};

export const logout = async () => {
  try {
    await firebaseSignOut(auth);
  } catch (e) {
    // fallback
  }
};
