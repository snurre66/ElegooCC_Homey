const fs = require('fs');
const path = require('path');

const appJsonPath = path.join(__dirname, '../app.json');
const appJsonRaw = fs.readFileSync(appJsonPath, 'utf8');
const appJson = JSON.parse(appJsonRaw);

const driver = appJson.drivers[0];
const flow = driver.flow;
delete driver.flow;

const deviceArg = {
  type: "device",
  name: "device",
  filter: "driver_id=elegoo_cc"
};

// Add device arg to all triggers, actions, and conditions
if (flow.triggers) {
  flow.triggers.forEach(card => {
    if (!card.args) card.args = [];
    card.args.unshift(deviceArg);
  });
}

if (flow.actions) {
  flow.actions.forEach(card => {
    if (!card.args) card.args = [];
    card.args.unshift(deviceArg);
  });
}

if (flow.conditions) {
  flow.conditions.forEach(card => {
    if (!card.args) card.args = [];
    card.args.unshift(deviceArg);
  });
}

appJson.flow = flow;

fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2));
console.log('Successfully restructured app.json');
