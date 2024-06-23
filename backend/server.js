const express = require('express');
const cors = require('cors');
const app = express();
const port = 80;

app.use(cors());

app.get('/hello', (req, res) => {
  console.log("receive request")
  res.send('hello');
});

app.listen(port, () => {
  console.log(`Backend app listening at http://localhost:${port}`);
});