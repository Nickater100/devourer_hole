import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signInWithCredential, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, getDocs, query, orderBy, limit, serverTimestamp, setDoc, doc, getDoc, initializeFirestore, deleteDoc, onSnapshot, where, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
// Force HTTP long-polling instead of WebSockets — required for Capacitor WebView
const db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false
});
const provider = new GoogleAuthProvider();

// Check if returning from redirect login
getRedirectResult(auth).then((result) => {
    if (result) {
        console.log("Logged in successfully via redirect:", result.user.displayName);
    }
}).catch((error) => {
    console.error("Login redirect error:", error);
});

// Force GoogleAuth to initialize with explicit arguments rather than relying on native parser
if (window.GoogleAuthPlugin) {
    window.GoogleAuthPlugin.initialize({
      clientId: '857081135448-r4n44jakpp9lccn73527so10ai1oped1.apps.googleusercontent.com',
      scopes: ['profile', 'email'],
      grantOfflineAccess: true,
    });
}

// Expose these methods globally so game.js can call them.
window.FirebaseAPI = {
    loginWithGoogle: async () => {
        try {
            // Check if we have the native Capacitor Google Auth plugin attached
            if (window.GoogleAuthPlugin && window.CapacitorCore && window.CapacitorCore.isNativePlatform()) {
                console.log("Trying native Capacitor Google Login...");
                const googleUser = await window.GoogleAuthPlugin.signIn();
                console.log("Got idToken from Native:", googleUser.authentication.idToken);
                // Pass Native Token to Firebase Auth
                const credential = GoogleAuthProvider.credential(googleUser.authentication.idToken);
                await signInWithCredential(auth, credential);
            } else {
                console.log("Fallback to Web popup login...");
                await signInWithPopup(auth, provider);
            }
        } catch (error) {
            console.error("Login Error", error);
        }
    },
    logout: async () => {
        await signOut(auth);
    },
    deleteAccount: async (uid) => {
        try {
            console.log("Deleting user account data:", uid);
            const userRef = doc(db, 'leaderboard', uid);
            await deleteDoc(userRef);
            
            // Delete user auth entry (fallback to local signout if credentials are stale)
            const user = auth.currentUser;
            if (user && user.uid === uid) {
                try {
                    await user.delete();
                    console.log("Auth user deleted.");
                } catch (delErr) {
                    console.warn("Could not delete Auth user (may require recent login), signing out instead.", delErr);
                    await signOut(auth);
                }
            }
        } catch (error) {
            console.error("Error deleting account", error);
            throw error;
        }
    },
    saveScore: async (score) => {
        if (!auth.currentUser) return;
        try {
            console.log("Attempting to save high score: " + score);
            const userRef = doc(db, 'leaderboard', auth.currentUser.uid);
            
            // Double-check: only write if score is higher than current cloud score.
            // Race against a 10s timeout to avoid hangs.
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Save score timeout")), 10000)
            );
            
            let cloudHighScore = 0;
            try {
                const docSnap = await Promise.race([getDoc(userRef), timeout]);
                if (docSnap.exists()) {
                    cloudHighScore = docSnap.data().score || 0;
                }
            } catch (e) {
                console.warn("Could not fetch current cloud score, proceeding with caution.", e);
                // If it fails (offline), we trust the local check in game.js and try to write.
            }

            if (score > cloudHighScore) {
                await setDoc(userRef, {
                    username: auth.currentUser.displayName || "Anonymous",
                    photoURL: auth.currentUser.photoURL || "",
                    score: score,
                    timestamp: serverTimestamp()
                });
                console.log("New high score saved to Cloud! (" + score + " > " + cloudHighScore + ")");
            } else {
                console.log("Cloud score (" + cloudHighScore + ") is higher or equal to new score (" + score + "). No update needed.");
            }
        } catch (error) {
            console.error("Error saving score", error);
        }
    },
    getLeaderboard: async () => {
        try {
            console.log("Fetching leaderboard...");
            const q = query(collection(db, "leaderboard"), orderBy("score", "desc"), limit(50));
            // Race against a 10s timeout — Firestore can hang if connection not yet established
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Leaderboard fetch timeout")), 10000)
            );
            const querySnapshot = await Promise.race([getDocs(q), timeout]);
            const scores = [];
            querySnapshot.forEach((doc) => {
                scores.push(doc.data());
            });
            console.log("Leaderboard fetched: " + scores.length + " entries");
            return scores;
        } catch (error) {
            console.error("Error fetching leaderboard", error);
            return [];
        }
    },
    getUserScore: async (uid) => {
        try {
            const userRef = doc(db, 'leaderboard', uid);
            const docSnap = await getDoc(userRef);
            if (docSnap.exists()) {
                return docSnap.data().score || 0;
            }
            return 0;
        } catch (error) {
            console.error("Error fetching user score", error);
            return 0;
        }
    },
    onAuthChange: (callback) => {
        onAuthStateChanged(auth, callback);
    },
    // --- Versus Mode Methods ---
    findMatch: async () => {
        if (!auth.currentUser) return null;
        try {
            const matchesRef = collection(db, "matches");
            const q = query(matchesRef, where("status", "==", "waiting"), limit(1));
            const querySnapshot = await getDocs(q);
            
            const playerInfo = {
                uid: auth.currentUser.uid,
                displayName: auth.currentUser.displayName || "Anonymous",
                photoURL: auth.currentUser.photoURL || "",
                isAlive: true,
                score: 0
            };

            if (!querySnapshot.empty) {
                // Join existing match
                const matchDoc = querySnapshot.docs[0];
                if (matchDoc.data().player1.uid === auth.currentUser.uid) {
                    // It's the same player (re-joining/same session)
                    return { id: matchDoc.id, isPlayer1: true };
                }
                
                await updateDoc(doc(db, "matches", matchDoc.id), {
                    player2: playerInfo,
                    status: "playing",
                    startTime: serverTimestamp()
                });
                return { id: matchDoc.id, isPlayer1: false };
            } else {
                // Create new match
                const newMatch = await addDoc(matchesRef, {
                    player1: playerInfo,
                    player2: null,
                    status: "waiting",
                    createdAt: serverTimestamp()
                });
                return { id: newMatch.id, isPlayer1: true };
            }
        } catch (error) {
            console.error("Error finding match", error);
            return null;
        }
    },
    updateMatchStatus: async (matchId, isPlayer1, isAlive, score) => {
        try {
            const updateData = {};
            const playerField = isPlayer1 ? "player1" : "player2";
            updateData[`${playerField}.isAlive`] = isAlive;
            updateData[`${playerField}.score`] = score;
            
            await updateDoc(doc(db, "matches", matchId), updateData);
        } catch (error) {
            console.error("Error updating match status", error);
        }
    },
    listenToMatch: (matchId, callback) => {
        return onSnapshot(doc(db, "matches", matchId), (doc) => {
            if (doc.exists()) {
                callback(doc.data());
            }
        });
    },
    cancelMatch: async (matchId) => {
        try {
            await deleteDoc(doc(db, "matches", matchId));
        } catch (error) {
            console.error("Error cancelling match", error);
        }
    }
};
