const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
    console.error("Missing ADMIN_TOKEN environment variable.");
    process.exit(1);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/*
    ROOT ROUTE - This fixes your "Cannot GET /" error
*/
app.get("/", (req, res) => {
    res.json({
        message: "Eclipse Key System is running",
        version: "1.0.0",
        endpoints: {
            public: "/api/keys/public-generate (POST)",
            claim: "/api/keys/claim (POST)",
            check: "/api/keys/check (GET)",
            health: "/api/health (GET)",
            admin: "/api/keys/generate (POST - requires x-admin-token header)"
        }
    });
});

/*
    Demo storage.

    IMPORTANT:
    This is RAM storage.
    If the server restarts, the keys disappear.

    For a serious production system, replace this with
    PostgreSQL/Supabase/etc.
*/

const keys = new Map();

function generateKey() {
    const part = () =>
        crypto.randomBytes(4).toString("hex").toUpperCase();

    return `ECLIPSE-${part()}-${part()}-${part()}`;
}

/*
    PUBLIC KEY GENERATION

    Website calls this.

    24-hour keys.
*/
app.post("/api/keys/public-generate", (req, res) => {
    const key = generateKey();

    const duration = 24 * 60 * 60 * 1000;

    const record = {
        createdAt: Date.now(),
        expiresAt: Date.now() + duration,
        used: false
    };

    keys.set(key, record);

    res.json({
        success: true,
        key,
        expiresAt: new Date(record.expiresAt).toISOString()
    });
});

/*
    CLAIM / SUBMIT KEY

    Roblox calls this.
*/
app.post("/api/keys/claim", (req, res) => {
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

    if (Date.now() >= record.expiresAt) {
        keys.delete(key);

        return res.status(410).json({
            valid: false,
            error: "Key expired"
        });
    }

    if (record.used) {
        return res.status(409).json({
            valid: false,
            error: "Key already used"
        });
    }

    /*
        Mark it used.

        If you want keys to be reusable until expiration,
        remove this line.
    */
    record.used = true;

    return res.json({
        valid: true,
        message: "Key accepted"
    });
});

/*
    ADMIN: Generate custom-duration key

    Example:
    POST /api/keys/generate
    Header:
        x-admin-token: YOUR_TOKEN

    Body:
        { "hours": 72 }
*/
app.post("/api/keys/generate", (req, res) => {
    const token = req.headers["x-admin-token"];

    if (token !== ADMIN_TOKEN) {
        return res.status(401).json({
            error: "Unauthorized"
        });
    }

    const hours = Number(req.body?.hours || 24);

    if (!Number.isFinite(hours) || hours <= 0) {
        return res.status(400).json({
            error: "Invalid duration"
        });
    }

    const key = generateKey();

    const record = {
        createdAt: Date.now(),
        expiresAt: Date.now() + hours * 60 * 60 * 1000,
        used: false
    };

    keys.set(key, record);

    res.json({
        success: true,
        key,
        expiresAt: new Date(record.expiresAt).toISOString()
    });
});

/*
    Check key without consuming it.
*/
app.get("/api/keys/check", (req, res) => {
    const key = String(req.query.key || "")
        .trim()
        .toUpperCase();

    const record = keys.get(key);

    if (!record) {
        return res.json({
            valid: false
        });
    }

    if (Date.now() >= record.expiresAt) {
        keys.delete(key);

        return res.json({
            valid: false,
            error: "Key expired"
        });
    }

    res.json({
        valid: !record.used,
        used: record.used,
        expiresAt: new Date(record.expiresAt).toISOString()
    });
});

/*
    Health check.
*/
app.get("/api/health", (req, res) => {
    res.json({
        online: true
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Key server running on port ${PORT}`);
});
