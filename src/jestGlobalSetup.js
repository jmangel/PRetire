// Run every test in a US time zone. Dates from <input type="date"> are parsed
// as UTC midnight, so code that reads them with local-time methods (like
// getFullYear) is off by a day west of UTC. In UTC those bugs are invisible,
// so pinning a zone west of UTC makes date tests catch them on any machine.
//
// This must run in Jest's global setup, before test workers start: setting
// process.env.TZ inside setupTests.ts doesn't change how dates are read.
module.exports = async () => {
  process.env.TZ = 'America/Los_Angeles';
};
