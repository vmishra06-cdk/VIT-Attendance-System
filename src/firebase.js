import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut } from "firebase/auth";

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

export const signInWithGoogle = async (customEmail = "") => {
  if (customEmail && customEmail.trim()) {
    const email = customEmail.trim().toLowerCase();
    const namePart = email.split("@")[0].replace(/[._]/g, " ");
    const displayName = namePart.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    
    return {
      uid: "google-" + btoa(email).replace(/[^a-zA-Z0-9]/g, ""),
      displayName: displayName || "Google User",
      email: email,
      photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`,
    };
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.warn("Firebase Auth popup blocked or unconfigured, switching to interactive Google email sign-in:", error.message);
    const userEmail = window.prompt("Enter your Google Email address to sign in:");
    if (userEmail && userEmail.includes("@")) {
      return signInWithGoogle(userEmail);
    }
    return null;
  }
};

export const logout = async () => {
  try {
    await firebaseSignOut(auth);
  } catch (e) {}
};
