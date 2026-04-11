const fs = require('fs');

const path = 'app.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

if (data.drivers && data.drivers[0]) {
  delete data.drivers[0].images;
}

fs.writeFileSync(path, JSON.stringify(data, null, 2));
