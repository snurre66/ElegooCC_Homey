const fs = require('fs');

const path = 'app.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

if (data.drivers && data.drivers[0]) {
  data.drivers[0].images = {
    "large": "/drivers/elegoo_cc/assets/images/large.png",
    "small": "/drivers/elegoo_cc/assets/images/small.png"
  };
}

fs.writeFileSync(path, JSON.stringify(data, null, 2));
