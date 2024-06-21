const express = require('express');
const app = express();
const PORT = 80;

const environment = process.env.ENVIRONMENT || 'blue'; // ENVIRONMENT変数で環境を判定

app.get('/', (req, res) => {
  // const color = environment === 'green' ? 'green' : 'blue';
  const color = 'green'
  res.send(`
    <html>
      <body style="background-color: ${color};">
        <h1>Hello World</h1>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
