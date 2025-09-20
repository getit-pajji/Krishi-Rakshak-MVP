const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Get the Gemini API Key securely from Firebase Environment Variables
const geminiAPIKey = functions.config().gemini.key;

// --- REUSABLE GEMINI API FUNCTION (MULTILINGUAL) ---
async function callGemini(prompt, language = 'English') {
    if (!geminiAPIKey) {
        console.error("Gemini API Key is missing!");
        return "Sorry, the AI service is not configured correctly.";
    }
    const fullPrompt = `${prompt}. Provide the response in simple, easy-to-understand ${language}.`;
    const geminiAPIUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${geminiAPIKey}`;
    try {
        const response = await fetch(geminiAPIUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] })
        });
        if (!response.ok) {
            return `Sorry, I could not get a response from the AI in ${language}.`;
        }
        const result = await response.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text || "No response text found.";
    } catch (error) {
        return "There was a problem contacting the AI service.";
    }
}

// --- API ENDPOINT FOR WEB APP'S AI FEATURES ---
app.post('/gemini', async (req, res) => {
    const { prompt, language } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    
    let result = await callGemini(prompt, language);
    result = result.replace(/[*#]/g, '');
    result = result.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/\* (.*?)(?:\n|$)/g, '<li class="ml-4 list-disc">$1</li>');
    result = result.replace(/\n/g, '<br>');
    res.json({ response: result });
});

// --- API ENDPOINTS FOR DATABASE INTERACTIONS ---
app.post('/saveScan', async (req, res) => {
    try {
        const { farmerId, scanData } = req.body;
        // In a real app, farmerId would come from an authenticated user
        const docRef = await db.collection('farmers').doc(farmerId).collection('scans').add(scanData);
        res.status(201).json({ id: docRef.id });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save scan report.' });
    }
});

app.get('/getFarms', async (req, res) => {
    try {
        // This is a simplified example; a real app would have more complex queries
        const snapshot = await db.collection('farmers').get();
        const farms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(farms);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch farm data.' });
    }
});

// Expose the Express app as a Cloud Function named "api"
exports.api = functions.https.onRequest(app);
