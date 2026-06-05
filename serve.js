'use strict';
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'orbi-demo-deck-v2.html')));

app.listen(PORT, () => console.log(`Orbi deck on port ${PORT}`));
