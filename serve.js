'use strict';
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'orbi-demo-deck-v2.html')));
app.get('/docs', (req, res) => res.sendFile(path.join(__dirname, 'docs', 'index.html')));

app.use(express.static(__dirname));

app.listen(PORT, () => console.log(`Orbi deck on port ${PORT}`));
