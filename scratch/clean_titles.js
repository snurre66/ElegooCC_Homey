const fs = require('fs');

const data = JSON.parse(fs.readFileSync('app.json', 'utf8'));

// Triggers with !{{}} in titleFormatted don't have args, just tokens.
// They shouldn't have titleFormatted.
data.flow.triggers.forEach(t => {
  if (t.titleFormatted) {
    const hasBadSyntax = Object.values(t.titleFormatted).some(str => str.includes('!{{'));
    if (hasBadSyntax) {
      console.log('Removing titleFormatted from trigger:', t.id);
      delete t.titleFormatted;
    }
  }
});

fs.writeFileSync('app.json', JSON.stringify(data, null, 2));
