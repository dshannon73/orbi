"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sf_1 = require("../sf");
const router = (0, express_1.Router)();
// GET /meta/picklist/:object/:field — returns active picklist values for a field
router.get('/picklist/:object/:field', async (req, res) => {
    try {
        const conn = (0, sf_1.getConnection)();
        const desc = await conn.sobject(req.params.object).describe();
        const field = desc.fields.find((f) => f.name.toLowerCase() === req.params.field.toLowerCase());
        if (!field)
            return res.status(404).json({ error: 'Field not found' });
        const values = (field.picklistValues ?? [])
            .filter((v) => v.active)
            .map((v) => v.value);
        res.json({ values });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
