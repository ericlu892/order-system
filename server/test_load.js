console.log('BEFORE REQUIRE');
const s = require('./server_new.js');
console.log('AFTER REQUIRE', typeof s);
process.exit(0);
