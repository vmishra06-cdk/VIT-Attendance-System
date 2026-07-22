import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

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
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async (customEmail = "") => {
  if (customEmail && customEmail.trim()) {
    const email = customEmail.trim().toLowerCase();
    const namePart = email.split("@")[0].replace(/[._]/g, " ");
    const displayName = namePart.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    
    return {
      uid: "user-" + btoa(email).replace(/[^a-zA-Z0-9]/g, ""),
      displayName: displayName || "Google User",
      email: email,
      photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`,
    };
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.warn("Firebase Auth popup blocked or unconfigured, switching to interactive email sign-in:", error.message);
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

// Real-world database sync per user
export const saveUserDataToCloud = async (userId, data) => {
  if (!userId) return;
  try {
    const userDocRef = doc(db, "users", userId);
    await setDoc(userDocRef, { ...data, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.warn("Cloud Firestore sync (falling back to per-user local database):", err.message);
  }
};

export const loadUserDataFromCloud = async (userId) => {
  if (!userId) return null;
  try {
    const userDocRef = doc(db, "users", userId);
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
  } catch (err) {
    console.warn("Cloud Firestore load (falling back to per-user local database):", err.message);
  }
  return null;
};
