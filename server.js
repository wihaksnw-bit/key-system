const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
    console.error("❌ ADMIN_TOKEN environment variable is missing.");
    process.exit(1);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve website from /public
app.use(express.static(path.join(__dirname, "public")));

// Temporary in-memory key storage
const keys = new Map();

/*
    Generates keys like:

    ECLIPSE-A1B2C3D4-E5F6A7B8-C9D0E1F2
*/
function generateKey() {
    const part = () =>
        crypto.randomBytes(4).toString("hex").toUpperCase();

    return `ECLIPSE-${part()}-${part()}-${part()}`;
}

/*
    Remove expired keys periodically
*/
function cleanupExpiredKeys() {
    const now = Date.now();

    for (const [key, data] of keys.entries()) {
        if (now >= data.expiresAt) {
            keys.delete(key);
        }
    }
}

setInterval(cleanupExpiredKeys, 60 * 60 * 1000);

/*
    ==========================================
    PUBLIC KEY GENERATION
    ==========================================
    
    POST /api/keys/public-generate

    Generates a 24-hour key.
*/
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

        return res.json({
            success: true,
            key,
            expiresAt: new Date(expiresAt).toISOString()
        });

    } catch (error) {
        console.error("Key generation error:", error);

        return res.status(500).json({
            success: false,
            error: "Failed to generate key"
        });
    }
});

/*
    ==========================================
    CLAIM / VALIDATE KEY
    ==========================================

    POST /api/keys/claim

    Body:
    {
        "key": "ECLIPSE-XXXX-XXXX-XXXX"
    }
*/
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

        // Check if already used
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

/*
    ==========================================
    CHECK KEY
    ==========================================

    GET /api/keys/check?key=ECLIPSE-XXXX-XXXX-XXXX
*/
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

/*
    ==========================================
    ADMIN KEY GENERATION
    ==========================================

    POST /api/keys/generate

    Header:
    x-admin-token: YOUR_ADMIN_TOKEN

    Body:
    {
        "hours": 24
    }
*/
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

/*
    ==========================================
    DELETE KEY
    ==========================================

    POST /api/keys/delete

    Header:
    x-admin-token: YOUR_ADMIN_TOKEN

    Body:
    {
        "key": "ECLIPSE-XXXX-XXXX-XXXX"
    }
*/
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

/*
    ==========================================
    HEALTH CHECK
    ==========================================
*/
app.get("/api/health", (req, res) => {
    return res.json({
        online: true,
        service: "Eclipse Hub Key System",
        uptime: process.uptime()
    });
});

/*
    ==========================================
    404 API HANDLER
    ==========================================
*/
app.use("/api", (req, res) => {
    return res.status(404).json({
        error: "API endpoint not found"
    });
});

/*
    ==========================================
    START SERVER
    ==========================================
*/
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Eclipse Hub Key System running on port ${PORT}`);
});
