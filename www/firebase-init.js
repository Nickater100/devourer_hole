import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithRedirect, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, getDocs, query, orderBy, limit, serverTimestamp, setDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCUqx74Lgt2VZR30NBLERaoapsu7MFLf2g",
    authDomain: "under-hole.firebaseapp.com",
    projectId: "under-hole",
    storageBucket: "under-hole.firebasestorage.app",
    messagingSenderId: "857081135448",
    appId: "1:857081135448:web:ddd8eff9e772383b56a52d",
    measurementId: "G-BT30HT79SZ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Check if returning from redirect login
getRedirectResult(auth).then((result) => {
    if (result) {
        console.log("Logged in successfully:", result.user.displayName);
    }
}).catch((error) => {
    console.error("Login redirect error:", error);
});

// Expose these methods globally so game.js can call them.
window.FirebaseAPI = {
    loginWithGoogle: async () => {
        try {
            await signInWithRedirect(auth, provider);
        } catch (error) {
            console.error("Login Error", error);
        }
    },
    logout: async () => {
        await signOut(auth);
    },
    saveScore: async (score) => {
        if (!auth.currentUser) return;
        try {
            const userRef = doc(db, 'leaderboard', auth.currentUser.uid);
            
            // Validate if new score is higher than current saved score
            const docSnap = await getDoc(userRef);
            let currentHighScore = 0;
            if (docSnap.exists()) {
                currentHighScore = docSnap.data().score || 0;
            }

            if (score > currentHighScore) {
                await setDoc(userRef, {
                    username: auth.currentUser.displayName || "Anonymous",
                    photoURL: auth.currentUser.photoURL || "",
                    score: score,
                    timestamp: serverTimestamp()
                });
                console.log("New high score saved to Cloud!");
            }
        } catch (error) {
            console.error("Error saving score", error);
        }
    },
    getLeaderboard: async () => {
        try {
            const q = query(collection(db, "leaderboard"), orderBy("score", "desc"), limit(50));
            const querySnapshot = await getDocs(q);
            const scores = [];
            querySnapshot.forEach((doc) => {
                scores.push(doc.data());
            });
            return scores;
        } catch (error) {
            console.error("Error fetching leaderboard", error);
            return [];
        }
    },
    onAuthChange: (callback) => {
        onAuthStateChanged(auth, callback);
    }
};
