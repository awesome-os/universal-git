const ignore = require('ignore');

// Test 1: src/ pattern
const ign1 = ignore().add('*\n!src/');
console.log('Test 1 - Pattern: * and !src/');
console.log('  src/app.js ignored:', ign1.ignores('src/app.js'));
console.log('  src/app.js NOT ignored:', !ign1.ignores('src/app.js'));

// Test 2: src/** pattern
const ign2 = ignore().add('*\n!src/**');
console.log('\nTest 2 - Pattern: * and !src/**');
console.log('  src/app.js ignored:', ign2.ignores('src/app.js'));
console.log('  src/app.js NOT ignored:', !ign2.ignores('src/app.js'));

// Test 3: Just src/ (no exclusion)
const ign3 = ignore().add('src/');
console.log('\nTest 3 - Pattern: src/ (exclusion)');
console.log('  src/app.js ignored:', ign3.ignores('src/app.js'));

// Test 4: Just !src/ (inclusion, but ignore treats as exclusion)
const ign4 = ignore().add('!src/');
console.log('\nTest 4 - Pattern: !src/');
console.log('  src/app.js ignored:', ign4.ignores('src/app.js'));

