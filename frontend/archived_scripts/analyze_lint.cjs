const fs = require('fs');
const results = JSON.parse(fs.readFileSync('lint_results_new.json', 'utf8'));

const errors = {};
results.forEach((file) => {
  file.messages.forEach((msg) => {
    const key = msg.ruleId || 'no-rule';
    errors[key] = (errors[key] || 0) + 1;
  });
});

console.log(JSON.stringify(errors, null, 2));
