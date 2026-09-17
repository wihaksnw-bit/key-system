const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

// ==========================================
// CONFIG
// ==========================================

if (!ADMIN_TOKEN) {
    console.error("❌ ADMIN_TOKEN environment variable is missing.");
    process.exit(1);
}

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const publicPath = path.join(__dirname, "public");

// Serve files from /public
app.use(express.static(publicPath));

// ==========================================
// HOMEPAGE
// ==========================================

app.get("/", (req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
});

// ==========================================
// KEY STORAGE
// ==========================================

// Temporary storage.
// WARNING: Keys disappear when the server restarts.
const keys = new Map();

// ==========================================
// KEY GENERATOR
// ==========================================

function generateKey() {
    const part = () =>
        crypto.randomBytes(4).toString("hex").toUpperCase();

    return `ECLIPSE-${part()}-${part()}-${part()}`;
}

// ==========================================
// CLEAN EXPIRED KEYS
// ==========================================

function cleanupExpiredKeys() {
    const now = Date.now();

    for (const [key, data] of keys.entries()) {
        if (now >= data.expiresAt) {
            keys.delete(key);
        }
    }
}

// Clean expired keys every hour
setInterval(cleanupExpiredKeys, 60 * 60 * 1000);

// ==========================================
// PUBLIC KEY GENERATION
// ==========================================

app.post("/api/keys/public-generate", (req, res) => {
    try {
        const key = generateKey();

        const createdAt = Date.now();
        const expiresAt = createdAt + 24 * 60 * 60 * 1000;

        keys.set(key, {
            createdAt,
            expiresAt,
            used: false
        });

        res.json({
            success: true,
            key,
            expiresAt: new Date(expiresAt).toISOString()
        });

    } catch (error) {
        console.error("Public key generation error:", error);

        res.status(500).json({
            success: false,
            error: "Failed to generate key"
        });
    }
});

// ==========================================
// CLAIM / VALIDATE KEY
// ==========================================

app.post("/api/keys/claim", (req, res) => {
    try {
        const key = String(req.body?.key || "")
            .trim()
            .toUpperCase();

        if (!key) {
            return res.status(400).json({
                valid: false,
                error: "Missing key"
            });
        }

        const record = keys.get(key);

        if (!record) {
            return res.status(404).json({
                valid: false,
                error: "Invalid key"
            });
        }

        // Check expiration
        if (Date.now() >= record.expiresAt) {
            keys.delete(key);

            return res.status(410).json({
                valid: false,
                error: "Key expired"
            });
        }

        // Check whether key was already used
        if (record.used) {
            return res.status(409).json({
                valid: false,
                error: "Key already used"
            });
        }

        // Mark key as used
        record.used = true;

        return res.json({
            valid: true,
            success: true,
            message: "Key accepted",
            expiresAt: new Date(record.expiresAt).toISOString()
        });

    } catch (error) {
        console.error("Key validation error:", error);

        return res.status(500).json({
            valid: false,
            error: "Internal server error"
        });
    }
});

// ==========================================
// CHECK KEY
// ==========================================

app.get("/api/keys/check", (req, res) => {
    try {
        const key = String(req.query.key || "")
            .trim()
            .toUpperCase();

        if (!key) {
            return res.status(400).json({
                valid: false,
                error: "Missing key"
            });
        }

        const record = keys.get(key);

        if (!record) {
            return res.json({
                valid: false,
                error: "Invalid key"
            });
        }

        // Check expiration
        if (Date.now() >= record.expiresAt) {
            keys.delete(key);

            return res.json({
                valid: false,
                error: "Key expired"
            });
        }

        return res.json({
            valid: !record.used,
            used: record.used,
            expiresAt: new Date(record.expiresAt).toISOString()
        });

    } catch (error) {
        console.error("Key check error:", error);

        return res.status(500).json({
            valid: false,
            error: "Internal server error"
        });
    }
});

// ==========================================
// ADMIN GENERATE KEY
// ==========================================

app.post("/api/keys/generate", (req, res) => {
    try {
        const token = req.headers["x-admin-token"];

        if (!token || token !== ADMIN_TOKEN) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized"
            });
        }

        const hours = Number(req.body?.hours ?? 24);

        if (!Number.isFinite(hours) || hours <= 0) {
            return res.status(400).json({
                success: false,
                error: "Invalid duration"
            });
        }

        const key = generateKey();

        const createdAt = Date.now();
        const expiresAt =
            createdAt + hours * 60 * 60 * 1000;

        keys.set(key, {
            createdAt,
            expiresAt,
            used: false
        });

        return res.json({
            success: true,
            key,
            expiresAt: new Date(expiresAt).toISOString(),
            hours
        });

    } catch (error) {
        console.error("Admin key generation error:", error);

        return res.status(500).json({
            success: false,
            error: "Failed to generate key"
        });
    }
});

// ==========================================
// ADMIN DELETE KEY
// ==========================================

app.post("/api/keys/delete", (req, res) => {
    try {
        const token = req.headers["x-admin-token"];

        if (!token || token !== ADMIN_TOKEN) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized"
            });
        }

        const key = String(req.body?.key || "")
            .trim()
            .toUpperCase();

        if (!key) {
            return res.status(400).json({
                success: false,
                error: "Missing key"
            });
        }

        const existed = keys.delete(key);

        return res.json({
            success: existed,
            deleted: existed
        });

    } catch (error) {
        console.error("Delete key error:", error);

        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/api/health", (req, res) => {
    res.json({
        online: true,
        service: "Eclipse Hub Key System",
        uptime: process.uptime()
    });
});

// ==========================================
// UNKNOWN API ROUTES
// ==========================================

app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        error: "API endpoint not found"
    });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Eclipse Hub Key System running on port ${PORT}`);
    console.log(`🌐 Port: ${PORT}`);
});
