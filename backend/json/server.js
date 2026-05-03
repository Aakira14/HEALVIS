console.log('🚀 Starting HEALVIS server...');
require('dotenv').config();
console.log('✅ dotenv configured');
const express = require('express');
console.log('✅ express loaded');
const cors = require('cors');
console.log('✅ cors loaded');
let Groq;
try {
    console.log('ℹ️ Attempting to load Groq SDK...');
    Groq = require('groq-sdk');
    console.log('✅ Groq SDK loaded');
} catch (e) {
    console.warn('⚠️ Groq SDK not available or failed to load:', e && e.message ? e.message : e);
    Groq = null;
}
const crypto = require('crypto');
console.log('✅ crypto loaded');
const fs = require('fs');
console.log('✅ fs loaded');
const path = require('path');
console.log('✅ path loaded');
const multer = require('multer');
console.log('✅ multer loaded');

// Multer setup for multipart/form-data image uploads (5MB limit)
const upload = multer({
    limits: { fileSize: 5 * 1024 * 1024 }
});

const app = express();
const PORT = process.env.PORT || 3000;

// Encryption settings
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';

// Derive a fixed-length 32-byte key from the provided ENCRYPTION_KEY
const KEY_BUFFER = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();

// User data directory
const USER_DATA_DIR = path.join(__dirname, 'user_data');
if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

// Encryption functions
function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY_BUFFER, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY_BUFFER, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// User data functions
function getUserFilePath(userId) {
    const hashedUserId = crypto.createHash('sha256').update(userId).digest('hex');
    return path.join(USER_DATA_DIR, `${hashedUserId}.json`);
}

function saveUserData(userId, data) {
    const filePath = getUserFilePath(userId);
    const encryptedData = encrypt(JSON.stringify(data));
    fs.writeFileSync(filePath, encryptedData, 'utf8');
}

function getUserData(userId) {
    const filePath = getUserFilePath(userId);
    if (!fs.existsSync(filePath)) {
        return { chats: [], totalMessages: 0 };
    }
    const encryptedData = fs.readFileSync(filePath, 'utf8');
    const decryptedData = decrypt(encryptedData);
    return JSON.parse(decryptedData);
}

// Initialize Groq client (lazy/fail-safe)
let groq = null;
if (Groq) {
    try {
        groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    } catch (e) {
        console.warn('Failed to initialize Groq client:', e && e.message ? e.message : e);
        groq = null;
    }
} else {
    groq = null;
}

// Top-level error handlers to capture unexpected crashes
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
    try { fs.appendFileSync(path.join(__dirname, 'server-error.log'), `[uncaught] ${new Date().toISOString()} - ${err && err.stack ? err.stack : String(err)}\n`); } catch (e) {}
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
    try { fs.appendFileSync(path.join(__dirname, 'server-error.log'), `[unhandledRejection] ${new Date().toISOString()} - ${String(reason)}\n`); } catch (e) {}
});

// Middleware
app.use(cors({
    origin: '*',
    credentials: false
}));
// Increase JSON body size limit to accept images (data URLs) and large histories
app.use(express.json({ limit: '5mb' }));

// Simple request logger (writes compact entries to server-request.log)
app.use((req, res, next) => {
    try {
        const entry = {
            time: new Date().toISOString(),
            method: req.method,
            path: req.originalUrl,
            ip: req.ip,
            bodyPreview: (() => {
                try {
                    if (!req.body) return null;
                    const s = JSON.stringify(req.body);
                    return s.length > 1000 ? s.slice(0, 1000) + '...<truncated>' : s;
                } catch (e) { return '[unserializable body]'; }
            })()
        };
        fs.appendFileSync(path.join(__dirname, 'server-request.log'), JSON.stringify(entry) + '\n');
    } catch (e) {
        // ignore logging failures
    }
    next();
});

// Serve frontend static files if available (serve frontend/public on same host)
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend', 'public');
if (fs.existsSync(FRONTEND_DIR)) {
    app.use(express.static(FRONTEND_DIR));
    // Fallback to index.html for non-API routes (supports direct navigation)
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        res.sendFile(path.join(FRONTEND_DIR, 'index.html'), (err) => {
            if (err) next();
        });
    });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'HEALVIS API is running' });
});

// Hospital finder endpoint
app.post('/api/hospitals/nearby', async (req, res) => {
    try {
        const { latitude, longitude, radius = 30000 } = req.body; // Default radius set to 30000 meters (30km)
        
        if (!latitude || !longitude) {
            return res.status(400).json({ 
                error: 'Latitude and longitude are required' 
            });
        }
        
        // Using Overpass API (OpenStreetMap) to find hospitals
        const overpassEndpoints = [
            'https://overpass-api.de/api/interpreter',
            'https://lz4.overpass-api.de/api/interpreter'
        ];
        const query = `
            [out:json];
            (
                node["amenity"="hospital"](around:${radius},${latitude},${longitude});
                way["amenity"="hospital"](around:${radius},${latitude},${longitude});
                node["amenity"="clinic"](around:${radius},${latitude},${longitude});
                way["amenity"="clinic"](around:${radius},${latitude},${longitude});
            );
            out body;
            >;
            out skel qt;
        `;
        
        // Try Overpass endpoints with retries and fallback to sample data
        const data = await fetchOverpassWithRetry(overpassEndpoints, query).catch(async (err) => {
            console.error('Overpass fetch ultimately failed:', err?.message || err);
            // Load sample hospitals as graceful fallback
            const sample = await loadSampleHospitals();
            return { elements: sample.map((h, i) => ({ tags: { name: h.name, amenity: h.type, 'addr:street': h.address, phone: h.phone }, lat: h.lat, lon: h.lon })) };
        });
        
        // Format hospitals data and extract tags for specialty scoring
        const hospitals = data.elements
            .filter(el => el.tags && el.tags.name)
            .map(el => ({
                name: el.tags.name,
                type: el.tags.amenity,
                address: el.tags['addr:street'] || el.tags['addr:full'] || 'Address not available',
                phone: el.tags.phone || el.tags.telephone || 'N/A',
                lat: el.lat,
                lon: el.lon,
                tags: el.tags || {},
                distance: calculateDistance(latitude, longitude, el.lat, el.lon)
            }));

        // If caller provided a symptom string, score hospitals by specialty match
        const symptom = (req.body.symptom || '').toString().toLowerCase().trim();
        const symptomMap = {
            heart: ['cardio', 'heart', 'cardiology', 'cardiac'],
            chest: ['cardio', 'heart', 'cardiology', 'cardiac'],
            stroke: ['neuro', 'neurology', 'stroke'],
            brain: ['neuro', 'neurology', 'neurology'],
            head: ['neuro', 'neurology'],
            child: ['pedi', 'child', 'children', 'pediatric', 'paediatrics'],
            fever: ['infect', 'infectious', 'general', 'emergency'],
            bleeding: ['emergency', 'trauma'],
            trauma: ['trauma', 'emergency'],
            surgery: ['surg', 'surgery', 'surgeon'],
            pregnancy: ['maternity', 'obstet', 'gyn', 'obstetric', 'maternity'],
            pregnancy: ['maternity', 'obstet', 'gyn', 'obstetric', 'maternity']
        };

        function scoreHospital(hosp, symptomText) {
            if (!symptomText) return 0;
            // build searchable string from name and tags
            const hay = [hosp.name, JSON.stringify(hosp.tags)].join(' ').toLowerCase();
            let score = 0;
            // check symptom words directly
            Object.keys(symptomMap).forEach(key => {
                if (symptomText.includes(key)) {
                    symptomMap[key].forEach(k => {
                        if (hay.includes(k)) score += 2;
                    });
                }
            });
            // also match by presence of common specialty keywords
            const specialtyKeywords = ['cardio','heart','cardiology','neurology','pediatric','maternity','surgery','trauma','emergency'];
            specialtyKeywords.forEach(k => { if (hay.includes(k)) score += 1; });
            return score;
        }

        hospitals.forEach(h => { h.score = scoreHospital(h, symptom); });

        // Sort: prefer higher score, then closer distance
        hospitals.sort((a, b) => {
            if ((b.score || 0) - (a.score || 0) !== 0) return (b.score || 0) - (a.score || 0);
            return a.distance - b.distance;
        });

        // Limit results
        const topHospitals = hospitals.slice(0, 20);
        
        res.json({
            success: true,
            hospitals: topHospitals,
            count: topHospitals.length
        });
        
    } catch (error) {
        console.error('Hospital finder error:', error);
        res.status(500).json({ 
            error: 'Failed to find nearby hospitals',
            details: error.message 
        });
    }
});

// Calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return Math.round(R * c);
}

// Helper: fetch Overpass with retry and alternate endpoints
async function fetchOverpassWithRetry(endpoints, query, maxAttempts = 3) {
    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    let lastError = null;

    if (!endpoints || endpoints.length === 0) {
        endpoints = [
            'https://overpass-api.de/api/interpreter',
            'https://lz4.overpass-api.de/api/interpreter',
            'https://overpass.openstreetmap.fr/api/interpreter',
            'https://overpass.kumi.systems/api/interpreter'
        ];
    }

    const headers = {
        'Content-Type': 'text/plain',
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'HEALVIS/1.0 (+https://github.com/your-repo)'
    };

    for (const endpoint of endpoints) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const resp = await fetch(endpoint, {
                    method: 'POST',
                    body: query,
                    headers,
                });

                if (!resp.ok) {
                    const text = await resp.text().catch(() => '');
                    console.warn(`Overpass endpoint ${endpoint} returned ${resp.status} (attempt ${attempt}):`, text.substring(0, 500));
                    lastError = new Error(`Status ${resp.status}`);
                    await delay(500 * attempt);
                    continue;
                }

                const contentType = (resp.headers.get('content-type') || '').toLowerCase();
                if (!contentType.includes('application/json')) {
                    const text = await resp.text().catch(() => '');
                    console.warn(`Overpass endpoint ${endpoint} returned non-JSON (attempt ${attempt}):`, text.substring(0, 1000));
                    lastError = new Error('Non-JSON response');
                    await delay(500 * attempt);
                    continue;
                }

                const data = await resp.json();
                return data;
            } catch (err) {
                console.warn(`Overpass fetch error for ${endpoint} (attempt ${attempt}):`, err && err.message ? err.message : err);
                lastError = err;
                await delay(500 * attempt);
            }
        }
    }

    throw lastError || new Error('All Overpass endpoints failed');
}

// Load sample hospitals from file or return a small built-in fallback
async function loadSampleHospitals() {
    const samplePath = path.join(__dirname, 'sample_hospitals.json');
    if (fs.existsSync(samplePath)) {
        try {
            const txt = fs.readFileSync(samplePath, 'utf8');
            const parsed = JSON.parse(txt);
            return parsed.hospitals || parsed;
        } catch (e) {
            console.error('Failed to parse sample_hospitals.json:', e);
        }
    }

    // Built-in minimal fallback
    return [
        { name: 'Central General Hospital', type: 'hospital', address: 'Main St', phone: '+1-555-0100', lat: 0, lon: 0 },
        { name: 'Neighborhood Clinic', type: 'clinic', address: '1st Ave', phone: '+1-555-0101', lat: 0, lon: 0 },
        { name: '24/7 Urgent Care', type: 'clinic', address: '2nd Ave', phone: '+1-555-0102', lat: 0, lon: 0 }
    ];
}

// Endpoint to fetch sample hospitals directly
app.get('/api/hospitals/sample', async (req, res) => {
    try {
        const sample = await loadSampleHospitals();
        res.json({ success: true, hospitals: sample, count: sample.length, source: 'sample' });
    } catch (e) {
        console.error('Failed to load sample hospitals:', e);
        res.status(500).json({ success: false, error: 'Failed to load sample hospitals' });
    }
});
// DEBUG: Run an Overpass query from the server and return raw result (useful to diagnose connectivity)
app.get('/api/debug/overpass', async (req, res) => {
    try {
        const latitude = parseFloat(req.query.lat) || 18.5204;
        const longitude = parseFloat(req.query.lon) || 73.8567;
        const radius = parseInt(req.query.radius) || 30000;
        const query = `
            [out:json];
            (
                node["amenity"="hospital"](around:${radius},${latitude},${longitude});
                way["amenity"="hospital"](around:${radius},${latitude},${longitude});
                node["amenity"="clinic"](around:${radius},${latitude},${longitude});
                way["amenity"="clinic"](around:${radius},${latitude},${longitude});
            );
            out body;
            >;
            out skel qt;
        `;

        const endpoints = ['https://overpass-api.de/api/interpreter', 'https://lz4.overpass-api.de/api/interpreter'];
        try {
            const data = await fetchOverpassWithRetry(endpoints, query);
            res.json({ success: true, source: 'overpass', data });
        } catch (err) {
            console.error('Debug Overpass fetch failed:', err);
            res.status(502).json({ success: false, error: String(err) });
        }
    } catch (e) {
        console.error('Debug endpoint error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Get Wikipedia summary for a place name
async function fetchWikipediaSummary(name) {
    try {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&format=json&utf8=1&origin=*`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        const first = searchData?.query?.search?.[0];
        if (!first) return null;
        const title = first.title;
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        const summaryRes = await fetch(summaryUrl);
        const summaryData = await summaryRes.json();
        return summaryData;
    } catch (err) {
        console.error('Wikipedia fetch error:', err);
        return null;
    }
}

// Hospital info endpoint: returns Wikipedia summary and a Groq-powered explanation
app.post('/api/hospitals/info', async (req, res) => {
    try {
        const { name, lat, lon } = req.body;
        if (!name) return res.status(400).json({ error: 'Hospital name is required' });

        // Fetch Wikipedia summary
        const wiki = await fetchWikipediaSummary(name);

        // Build a prompt for Groq to explain the hospital details and what to expect
        const systemPrompt = {
            role: 'system',
            content: `You are an expert medical assistant. Provide a concise explanation about the following hospital: name, likely services it offers, when to visit, what to bring, and any useful tips for patients or visitors. Keep the answer friendly and actionable.`
        };

        const userPrompt = {
            role: 'user',
            content: `Hospital: ${name}${lat && lon ? ` (approx coords: ${lat}, ${lon})` : ''}${wiki && wiki.extract ? `\n\nWikipedia: ${wiki.extract}` : ''}`
        };

        let explanation = '';
        try {
            const completion = await groq.chat.completions.create({
                messages: [systemPrompt, userPrompt],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.7,
                max_tokens: 512,
                stream: false
            });
            explanation = completion.choices?.[0]?.message?.content || '';
        } catch (gErr) {
            console.error('Groq explanation error:', gErr);
            explanation = 'Explanation unavailable at the moment.';
        }

        res.json({
            success: true,
            name,
            wikipedia: wiki || null,
            explanation
        });
    } catch (error) {
        console.error('Hospital info error:', error);
        res.status(500).json({ error: 'Failed to fetch hospital info', details: error.message });
    }
});
// Chat endpoint
app.post('/api/chat', upload.single('image'), async (req, res) => {
    try {
        // support both JSON and multipart/form-data (with 'image' file)
        let { message } = req.body || {};
        let conversationHistory = req.body && req.body.conversationHistory ? req.body.conversationHistory : [];
        const userId = req.body && req.body.userId;
        const latitude = req.body && req.body.latitude;
        const longitude = req.body && req.body.longitude;

        // conversationHistory may be JSON-stringified when sent via FormData
        if (typeof conversationHistory === 'string') {
            try { conversationHistory = JSON.parse(conversationHistory); } catch (e) { conversationHistory = []; }
        }

        // If message is missing in body, set to empty string (validation below)
        message = message || '';

        // If an uploaded file exists, annotate the message (image analysis not implemented)
        if (req.file) {
            message = (message ? message + '\n' : '') + `[User uploaded image: ${req.file.originalname}]`;
        }

        if (!message) {
            return res.status(400).json({ 
                error: 'Message is required' 
            });
        }
        
        if (!userId) {
            return res.status(400).json({ 
                error: 'User ID is required' 
            });
        }
        
        // Build messages array for Groq
        const systemMessage = {
            role: "system",
            content: `You are HEALVIS — an elite, world-class AI health companion. Your personality is a perfect, warm blend of professional medical expertise and the friendly, organized, and approachable tone of a world-class assistant like ChatGPT. 😊🩺✨💖

    Tone & Style:
    - **Professional & Friendly:** Always be supportive and empathetic while providing accurate, evidence-based information. 😊🌟
    - **Highly Organized:** Structure every response with clear Markdown headers (###), bold text (**), and diverse lists (numbered 1., 2. or bulleted •). 🏗️📊
    - **Visual & Engaging:** Use a rich set of emojis to emphasize points and keep the user encouraged (🏥, 🥗, 🧘, 🛌, 🌡️, 🔬, 🧪, 🚑, 🚨).

    Response Structure (Strictly Mandatory):
    1. **Friendly Greeting:** A warm opening with several emojis to set a positive tone. 👋✨😊
    2. **### 🎯 Quick Summary:** A single, impactful sentence summarizing the core advice. 📍
    3. **### ✅ Actionable Steps:** A numbered list of practical, immediate steps the user can take. 👣
    4. **### 💡 Health & Wellness Insights:** Bullet points providing helpful context, dietary tips, or wellness facts. 🍎🥦
    5. **### ⚠️ Safety & Red Flags:** A clear list of symptoms that require urgent medical attention, marked with 🚨. 
    6. **### 🏥 Healthcare Guidance:** Remind the user to check the interactive map on their dashboard for nearest facilities and the DuckDuckGo search links I've provided. 📍🌐
    7. **Warm & Encouraging Sign-off.** 🌈✨

    Constraints:
    - If symptoms suggest an emergency, lead immediately with: "🚨 **EMERGENCY: PLEASE CALL EMERGENCY SERVICES (911/112) NOW!**" 🚨
    - Keep the output concise, high-quality, and visually distinct.
    - Always include this footer: "--- \n *📝 Note: I am an AI assistant, not a doctor. Please consult a healthcare professional for actual medical diagnosis.*"`
        };
        
        // If location was provided, inform the model (approx coords)
        if (latitude && longitude) {
            systemMessage.content += `\n\nUser Location (approx): ${latitude}, ${longitude}. Use this only to provide localized facility suggestions when relevant.`;
        }
        
        // Format conversation history
        const formattedHistory = conversationHistory.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text
        }));
        
        // Add current message
        const userMessage = {
            role: "user",
            content: message
        };
        
        // Create completion with Groq
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                systemMessage,
                ...formattedHistory,
                userMessage
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.8,
            max_tokens: 1024,
            top_p: 1,
            stream: false
        });
        
        const aiResponse = chatCompletion.choices[0]?.message?.content || "I apologize, but I'm having trouble processing your request right now. Please try again.";
        
        // Save user conversation to encrypted file
        try {
            const userData = getUserData(userId);
            const chatEntry = {
                timestamp: new Date().toISOString(),
                userMessage: message,
                aiResponse: aiResponse,
                model: "llama-3.3-70b-versatile"
            };
            
            if (!userData.chats) userData.chats = [];
            userData.chats.push(chatEntry);
            userData.totalMessages = (userData.totalMessages || 0) + 1;
            userData.lastActivity = new Date().toISOString();
            
            saveUserData(userId, userData);
        } catch (saveError) {
            console.error('Error saving user data:', saveError);
        }
        
        res.json({
            success: true,
            response: aiResponse,
            model: "llama-3.3-70b-versatile",
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Groq API Error:', error);
        
        // Handle specific error types
        if (error.status === 401) {
            return res.status(401).json({ 
                error: 'Invalid API key' 
            });
        }
        
        if (error.status === 429) {
            return res.status(429).json({ 
                error: 'Rate limit exceeded. Please try again later.' 
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to get AI response',
            details: error.message 
        });
    }
});

// Streaming chat endpoint (for real-time responses)
app.post('/api/chat/stream', async (req, res) => {
    try {
        const { message, conversationHistory = [] } = req.body;
        const { latitude, longitude } = req.body;
        
        if (!message) {
            return res.status(400).json({ 
                error: 'Message is required' 
            });
        }
        
        // Set headers for Server-Sent Events
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        // Build messages array
        const systemMessage = {
            role: "system",
            content: `You are HEALVIS — an elite, world-class AI health companion. Blend professional medical knowledge with an exceptionally friendly, organized, and encouraging tone. 😊🩺✨💖

    Follow this formatting strictly:
    - Use **### Headers** for sections.
    - Use **bolding** for important terms.
    - Use **Numbered Lists** (1. 2. 3.) for steps.
    - Use **Bullet Points** (•) for details.
    - Use frequent emojis to stay friendly and clear. 🌟📊

    Response Sections:
    1. Warm Greeting 👋✨😊
    2. ### 🎯 Quick Summary 📍
    3. ### ✅ Actionable Steps (Numbered) 👣
    4. ### 💡 Health & Wellness Insights (Bulleted) 🍎🥦
    5. ### ⚠️ Safety & Red Flags (Red flags with 🚨)
    6. ### 🏥 Healthcare Guidance (Interactive Map & Search Links) 📍🌐
    7. Encouraging Sign-off 🌈✨

    Emergency: Lead with "🚨 **EMERGENCY: CALL SERVICES IMMEDIATELY!**" if dangerous symptoms are present.`
        };
        
        if (latitude && longitude) {
            systemMessage.content += `\n\nUser Location (approx): ${latitude}, ${longitude}. Use location to provide nearby facility suggestions when appropriate.`;
        }
        
        const formattedHistory = conversationHistory.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text
        }));
        
        const userMessage = {
            role: "user",
            content: message
        };
        
        // Create streaming completion
        const stream = await groq.chat.completions.create({
            messages: [
                systemMessage,
                ...formattedHistory,
                userMessage
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.7,
            max_tokens: 1024,
            top_p: 1,
            stream: true
        });
        
        // Stream the response
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
        }
        
        res.write('data: [DONE]\n\n');
        res.end();
        
    } catch (error) {
        console.error('Streaming Error:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

// Get user chat history
app.get('/api/user/history/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        
        const userData = getUserData(userId);
        
        res.json({
            success: true,
            chats: userData.chats || [],
            totalMessages: userData.totalMessages || 0,
            lastActivity: userData.lastActivity || null
        });
    } catch (error) {
        console.error('Error fetching user history:', error);
        res.status(500).json({ 
            error: 'Failed to fetch user history',
            details: error.message 
        });
    }
});

// Delete user data
app.delete('/api/user/data/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        
        const filePath = getUserFilePath(userId);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        res.json({
            success: true,
            message: 'User data deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting user data:', error);
        res.status(500).json({ 
            error: 'Failed to delete user data',
            details: error.message 
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    try {
        console.error('Server Error:', err && err.stack ? err.stack : err);
        const details = {
            time: new Date().toISOString(),
            error: (err && err.stack) ? err.stack : String(err),
            method: req.method,
            path: req.originalUrl,
            ip: req.ip,
            bodyPreview: (() => {
                try {
                    if (!req.body) return null;
                    const s = JSON.stringify(req.body);
                    return s.length > 2000 ? s.slice(0, 2000) + '...<truncated>' : s;
                } catch (e) { return '[unserializable body]'; }
            })()
        };
        fs.appendFileSync(path.join(__dirname, 'server-error.log'), JSON.stringify(details) + '\n\n');
    } catch (e) {
        console.error('Failed to write error log:', e);
    }

    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? (err && err.message ? err.message : String(err)) : 'Something went wrong'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found' 
    });
});

app.listen(PORT, () => {
    console.log(`🚀 HEALVIS API server running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
    console.log(`💬 Chat endpoint: http://localhost:${PORT}/api/chat`);
    console.log(`🌊 Streaming endpoint: http://localhost:${PORT}/api/chat/stream`);
});